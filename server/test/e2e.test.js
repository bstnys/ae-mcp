// End to end: MCP client -> ae-mcp server -> bridge panel (HTTP) -> host.jsx running on a mock AE DOM.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createAeContext, evalScriptIn } from './mock-ae.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const hostJsx = path.join(root, 'extension', 'jsx', 'host.jsx');
const { createBridge } = createRequire(import.meta.url)(path.join(root, 'extension', 'js', 'main.js'));

let ctx, bridge, client, tmp;

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(res.content[0].text);
  const text = res.content.find((c) => c.type === 'text');
  return text ? JSON.parse(text.text) : res;
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-mcp-test-'));
  ctx = createAeContext();
  ctx.$.evalFile(hostJsx);
  bridge = createBridge({
    evalScript: evalScriptIn(ctx),
    hostScriptPath: hostJsx,
    configPath: path.join(tmp, 'bridge.json'),
    port: 18642,
  });
  await bridge.start();
  client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(root, 'server', 'src', 'index.js')],
      env: { ...process.env, AE_MCP_CONFIG: path.join(tmp, 'bridge.json'), AE_MCP_ALLOW_RUN_JSX: '1' },
    })
  );
});

after(async () => {
  await client?.close();
  await bridge?.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('host.jsx is valid ES3 (ExtendScript)', () => {
  acorn.parse(fs.readFileSync(hostJsx, 'utf8'), { ecmaVersion: 3 });
});

test('host JSON round-trips tricky strings', () => {
  const { parse, stringify } = ctx.aeMcp._json;
  const v = { s: 'quote " back \\ nl \n tab \t 한글 \u2028', n: [-1.5e3, 0, 2], b: true, z: null, o: { e: [] } };
  assert.deepEqual(JSON.parse(stringify(parse(JSON.stringify(v)))), v);
});

test('lists the tools', async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  for (const n of ['ae_status', 'ae_get_project', 'ae_create_comp', 'ae_add_layer', 'ae_set_keyframes', 'ae_render_frame', 'ae_run_jsx']) {
    assert.ok(names.includes(n), n);
  }
});

test('builds a small animation', async () => {
  const status = await call('ae_status');
  assert.equal(status.appVersion, '26.0x00');

  const comp = await call('ae_create_comp', { name: 'Claude Test', width: 1280, height: 720, duration: 5, bgColor: '#101820' });
  assert.equal(comp.width, 1280);
  assert.equal((await call('ae_status')).activeCompId, comp.id, 'new comp is opened');

  const bg = await call('ae_add_layer', { compId: comp.id, type: 'solid', name: 'BG', color: '#ff8800' });
  assert.equal(bg.type, 'solid');

  const title = await call('ae_add_layer', {
    type: 'text', text: 'Hello', name: 'Title',
    textStyle: { fontSize: 96, fillColor: '#ffffff', justification: 'center' },
  });
  assert.equal(title.type, 'text');

  const shape = await call('ae_add_layer', {
    type: 'shape', name: 'Dot', shape: { kind: 'ellipse', size: [120, 120], fillColor: [0, 0.5, 1], strokeColor: '#000' },
  });
  assert.equal(shape.type, 'shape');

  const nul = await call('ae_add_layer', { type: 'null', name: 'Ctrl' });
  assert.equal(nul.type, 'null');

  const kf = await call('ae_set_keyframes', {
    layerId: title.id, path: 'Position',
    keyframes: [
      { time: 0, value: [640, 800], easeOut: 75 },
      { time: 1, value: [640, 360], easeIn: 75 },
    ],
  });
  assert.equal(kf.numKeys, 2);

  await call('ae_set_keyframes', {
    layerId: title.id, path: ['ADBE Transform Group', 'ADBE Scale'],
    keyframes: [{ time: 0, value: [80, 80, 100], easeOut: 50 }, { time: 1, value: [100, 100, 100], interpolation: 'linear' }],
  });

  const opacity = await call('ae_set_property', { layerName: 'BG', path: 'Opacity', value: 50 });
  assert.equal(opacity.value, 50);

  const text = await call('ae_set_property', { layerId: title.id, path: 'Source Text', value: { text: '안녕하세요', fontSize: 120 } });
  assert.equal(text.value.text, '안녕하세요');
  assert.equal(text.value.fontSize, 120);

  const expr = await call('ae_set_expression', { layerId: shape.id, path: 'Rotation', expression: 'time * 90' });
  assert.equal(expr.expressionError, null);

  const fx = await call('ae_apply_effect', { layerName: 'BG', effect: 'ADBE Gaussian Blur 2', properties: { Blurriness: 25, Nope: 1 } });
  assert.equal(fx.effect.children[0].value, 25);
  assert.deepEqual(fx.unknownProperties, ['Nope']);

  await call('ae_set_layer', { layerId: title.id, parentLayerId: nul.id, threeD: true });

  const detail = await call('ae_get_layer', { layerId: title.id });
  assert.equal(detail.parentId, nul.id);
  const transform = detail.properties.find((p) => p.matchName === 'ADBE Transform Group');
  assert.equal(transform.children.find((p) => p.name === 'Position').numKeys, 2);

  const compInfo = await call('ae_get_comp', { compId: comp.id });
  assert.deepEqual(compInfo.layers.map((l) => l.name), ['Ctrl', 'Dot', 'Title', 'BG']);

  const dup = await call('ae_duplicate_layer', { layerName: 'Dot', name: 'Dot 2' });
  await call('ae_delete_layer', { layerId: dup.id });
  assert.equal((await call('ae_get_comp')).numLayers, 4);

  // Every write was wrapped in a balanced undo group.
  assert.ok(ctx.app.undoLog.includes('Claude: setKeyframes'));
  assert.equal(ctx.app._undoDepth, 0);
});

test('renders a frame as an image', async () => {
  const res = await client.callTool({ name: 'ae_render_frame', arguments: { time: 0.5 } });
  assert.ok(!res.isError, res.content[0].text);
  assert.equal(res.content[0].type, 'image');
  assert.equal(res.content[0].mimeType, 'image/png');
});

test('imports a file and queues a render', async () => {
  const file = path.join(tmp, 'logo.png');
  fs.writeFileSync(file, 'x');
  const imp = await call('ae_import_file', { path: file, addToActiveComp: true });
  assert.equal(imp.layer.type, 'footage');
  const rq = await call('ae_add_to_render_queue', { outputPath: path.join(tmp, 'out.mov'), outputModuleTemplate: 'H.264' });
  assert.equal(rq.queueIndex, 1);
});

test('runs raw JSX', async () => {
  assert.deepEqual(await call('ae_run_jsx', { code: '[app.project.numItems > 0, 1 + 1]' }), [true, 2]);
});

test('reports AE errors as tool errors', async () => {
  const res = await client.callTool({ name: 'ae_get_layer', arguments: { layerId: 99999 } });
  assert.ok(res.isError);
  assert.match(res.content[0].text, /Layer not found/);

  const bad = await client.callTool({ name: 'ae_set_property', arguments: { layerName: 'BG', path: 'Opacity', value: [1, 2] } });
  assert.ok(bad.isError);
  assert.equal(ctx.app._undoDepth, 0, 'undo group closed after error');
});

test('reloads host.jsx if AE lost it', async () => {
  delete ctx.aeMcp;
  assert.equal((await call('ae_status')).appVersion, '26.0x00');
});

test('bridge rejects bad tokens and browser origins', async () => {
  const url = `http://127.0.0.1:${bridge.port}/rpc`;
  const body = JSON.stringify({ method: 'ping' });
  assert.equal((await fetch(url, { method: 'POST', body, headers: { Authorization: 'Bearer nope' } })).status, 401);
  const withOrigin = await fetch(url, {
    method: 'POST', body, headers: { Authorization: `Bearer ${bridge.token}`, Origin: 'https://evil.example' },
  });
  assert.equal(withOrigin.status, 403);
});

test('explains when After Effects is not running', async () => {
  await bridge.stop();
  const res = await client.callTool({ name: 'ae_status', arguments: {} });
  assert.ok(res.isError);
  assert.match(res.content[0].text, /Claude Bridge/);
  await bridge.start();
});
