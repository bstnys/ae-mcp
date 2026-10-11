#!/usr/bin/env node
// ae-mcp: MCP server exposing After Effects to Claude via the Claude Bridge panel.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Bridge } from './bridge.js';

const VERSION = '0.1.0';
const ALLOW_RUN_JSX = process.env.AE_MCP_ALLOW_RUN_JSX === '1';

const bridge = new Bridge();
const server = new McpServer({ name: 'after-effects', version: VERSION });

// ------------------------------------------------------------- schemas

const comp = {
  compId: z.number().int().optional().describe('Composition item id (from ae_get_project). Defaults to the active comp.'),
  compName: z.string().optional().describe('Composition name, used when compId is not given.'),
};

const layer = {
  ...comp,
  layerId: z.number().int().optional().describe('Stable layer id (preferred).'),
  layerIndex: z.number().int().optional().describe('1-based layer index.'),
  layerName: z.string().optional().describe('Layer name.'),
};

const propertyPath = z
  .union([z.string(), z.array(z.string())])
  .describe(
    'Property path as names or matchNames, e.g. ["ADBE Transform Group","ADBE Position"] or "Effects/Gaussian Blur/Blurriness". ' +
      'Shortcuts: "Position", "Scale", "Rotation", "Opacity", "Anchor Point", "Source Text".'
  );

const color = z
  .union([z.string(), z.array(z.number())])
  .describe('"#rrggbb" or [r, g, b] with 0..1 values.');

const textStyle = z
  .object({
    text: z.string().optional(),
    font: z.string().optional().describe('PostScript font name, e.g. "Helvetica-Bold".'),
    fontSize: z.number().optional(),
    fillColor: color.optional(),
    tracking: z.number().optional(),
    leading: z.number().optional(),
    justification: z.enum(['left', 'center', 'right']).optional(),
  })
  .describe('Text document fields to change.');

const anyValue = z
  .union([z.number(), z.string(), z.boolean(), z.array(z.number()), textStyle])
  .describe('Number, array (e.g. [x, y]), color, or for Source Text a string or text style object.');

// ------------------------------------------------------------- helpers

function json(result) {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

function tool(name, description, inputSchema, method, { readOnly = false } = {}) {
  server.registerTool(
    name,
    { description, inputSchema, annotations: { readOnlyHint: readOnly, destructiveHint: false } },
    async (args) => {
      try {
        return json(await bridge.call(method, args));
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }
  );
}

async function waitForFile(file, timeoutMs = 15000) {
  const start = Date.now();
  let lastSize = -1;
  while (Date.now() - start < timeoutMs) {
    try {
      const { size } = await fs.stat(file);
      if (size > 0 && size === lastSize) return;
      lastSize = size;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`After Effects did not write the frame to ${file}`);
}

// ------------------------------------------------------------- read tools

tool('ae_status', 'Check the connection to After Effects and return the app version, project file and active comp.', {}, 'ping', { readOnly: true });

tool('ae_get_project', 'List every project item (comps, footage, folders) with ids.', {}, 'getProject', { readOnly: true });

tool('ae_get_comp', 'Get a composition\'s settings and its layers (id, index, name, type, timing, parent).', comp, 'getComp', { readOnly: true });

tool(
  'ae_get_layer',
  'Get a layer\'s property tree with current values, keyframe counts and expressions. Use this to discover property names/matchNames before editing.',
  { ...layer, depth: z.number().int().min(1).max(6).optional().describe('Tree depth, default 3.') },
  'getLayer',
  { readOnly: true }
);

tool('ae_get_selection', 'Get the active comp and the layers/properties the user has selected in After Effects.', {}, 'getSelection', { readOnly: true });

server.registerTool(
  'ae_render_frame',
  {
    description: 'Render one frame of a composition to PNG and return it as an image, so you can check what the comp looks like.',
    inputSchema: { ...comp, time: z.number().optional().describe('Time in seconds. Defaults to the current time indicator.') },
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    try {
      const dir = path.join(os.tmpdir(), 'ae-mcp');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, `frame-${Date.now()}.png`);
      const result = await bridge.call('renderFrame', { ...args, path: file });
      await waitForFile(result.path);
      const data = await fs.readFile(result.path);
      await fs.rm(result.path, { force: true });
      return {
        content: [
          { type: 'image', data: data.toString('base64'), mimeType: 'image/png' },
          { type: 'text', text: JSON.stringify({ compId: result.compId, time: result.time }) },
        ],
      };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  }
);

// ------------------------------------------------------------- write tools
// Every write runs inside one AE undo group named "Claude: <method>".

tool(
  'ae_create_comp',
  'Create a composition and open it in the viewer.',
  {
    name: z.string(),
    width: z.number().int().optional().describe('Default 1920.'),
    height: z.number().int().optional().describe('Default 1080.'),
    pixelAspect: z.number().optional(),
    duration: z.number().optional().describe('Seconds, default 10.'),
    frameRate: z.number().optional().describe('Default 30.'),
    bgColor: color.optional(),
    open: z.boolean().optional().describe('Open in viewer, default true.'),
  },
  'createComp'
);

tool(
  'ae_add_layer',
  'Add a layer to a composition: solid, text, shape (rectangle/ellipse), null, camera, light, or footage from a project item.',
  {
    ...comp,
    type: z.enum(['solid', 'text', 'shape', 'null', 'camera', 'light', 'footage']),
    name: z.string().optional(),
    color: color.optional().describe('Solid color.'),
    width: z.number().optional().describe('Solid width, defaults to comp width.'),
    height: z.number().optional().describe('Solid height, defaults to comp height.'),
    text: z.string().optional().describe('Text layer content.'),
    textStyle: textStyle.optional(),
    shape: z
      .object({
        kind: z.enum(['rect', 'ellipse']),
        size: z.array(z.number()).length(2).optional(),
        roundness: z.number().optional(),
        fillColor: color.optional(),
        strokeColor: color.optional(),
        strokeWidth: z.number().optional(),
      })
      .optional(),
    itemId: z.number().int().optional().describe('Project item id for footage layers.'),
    position: z.array(z.number()).optional(),
  },
  'addLayer'
);

tool(
  'ae_set_layer',
  'Change layer attributes: name, enabled, 3D, timing, label, parent, stacking order.',
  {
    ...layer,
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    threeD: z.boolean().optional(),
    startTime: z.number().optional(),
    inPoint: z.number().optional(),
    outPoint: z.number().optional(),
    label: z.number().int().min(0).max(16).optional(),
    parentLayerId: z.number().int().optional().describe('Parent layer id, or 0 to unparent.'),
    moveToIndex: z.number().int().optional().describe('Move this layer above the layer at this index.'),
  },
  'setLayer'
);

tool('ae_delete_layer', 'Delete a layer.', layer, 'deleteLayer');

tool('ae_duplicate_layer', 'Duplicate a layer.', { ...layer, name: z.string().optional() }, 'duplicateLayer');

tool(
  'ae_set_property',
  'Set a property value. If the property already has keyframes, sets a keyframe at the current time instead.',
  { ...layer, path: propertyPath, value: anyValue },
  'setProperty'
);

tool(
  'ae_set_keyframes',
  'Add keyframes to a property, with optional interpolation and easy-ease influence (0-100).',
  {
    ...layer,
    path: propertyPath,
    clearExisting: z.boolean().optional(),
    keyframes: z
      .array(
        z.object({
          time: z.number().describe('Seconds.'),
          value: anyValue,
          interpolation: z.enum(['linear', 'bezier', 'hold']).optional(),
          easeIn: z.number().min(0.1).max(100).optional(),
          easeOut: z.number().min(0.1).max(100).optional(),
        })
      )
      .min(1),
  },
  'setKeyframes'
);

tool(
  'ae_set_expression',
  'Set (or clear with an empty string) an expression on a property. Returns any expression error.',
  { ...layer, path: propertyPath, expression: z.string(), enabled: z.boolean().optional() },
  'setExpression'
);

tool(
  'ae_apply_effect',
  'Apply an effect to a layer by matchName (e.g. "ADBE Gaussian Blur 2", "ADBE Fill", "ADBE Glo2") or display name, and optionally set its parameters.',
  {
    ...layer,
    effect: z.string(),
    name: z.string().optional(),
    properties: z.record(anyValue).optional().describe('Effect parameter name -> value, e.g. {"Blurriness": 20}.'),
  },
  'applyEffect'
);

tool(
  'ae_import_file',
  'Import a file from disk into the project, optionally adding it to a comp.',
  {
    path: z.string().describe('Absolute path on this Mac.'),
    sequence: z.boolean().optional().describe('Import as image sequence.'),
    addToActiveComp: z.boolean().optional(),
    ...comp,
  },
  'importFile'
);

tool(
  'ae_add_to_render_queue',
  'Add a comp to the render queue with an output path, optionally starting the render (blocks AE until done).',
  {
    ...comp,
    outputPath: z.string().optional(),
    outputModuleTemplate: z.string().optional().describe('e.g. "H.264 - Match Render Settings - 15 Mbps".'),
    render: z.boolean().optional(),
  },
  'addToRenderQueue'
);

if (ALLOW_RUN_JSX) {
  tool(
    'ae_run_jsx',
    'Run arbitrary ExtendScript in After Effects inside an undo group and return the result. Use only when no other tool fits.',
    { code: z.string().describe('ExtendScript (ES3). The value of the last expression is returned.') },
    'runJsx'
  );
}

await server.connect(new StdioServerTransport());
