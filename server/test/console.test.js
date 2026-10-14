// Claude Console runner: argument building, stream-json parsing, and a full run
// against a fake `claude` executable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const Runner = createRequire(import.meta.url)(path.join(root, 'extension', 'js', 'claude-runner.js'));
const serverScript = path.join(root, 'server', 'src', 'index.js');

function fakeClaude(dir) {
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, `#!${process.execPath}
const fs = require('fs');
fs.writeFileSync(${JSON.stringify(path.join(dir, 'args.json'))}, JSON.stringify(process.argv.slice(2)));
const out = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
out({ type: 'system', subtype: 'init', session_id: 'sess-1', tools: ['mcp__after-effects__ae_add_layer'] });
out({ type: 'assistant', message: { content: [
  { type: 'text', text: '레이어를 추가할게요.' },
  { type: 'tool_use', id: 't1', name: 'mcp__after-effects__ae_add_layer', input: { type: 'solid', name: 'BG' } },
] } });
out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: '{}' }] }] } });
// Split a line across writes to exercise buffering.
const last = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: '완료', session_id: 'sess-1', duration_ms: 1200 });
process.stdout.write(last.slice(0, 20));
setTimeout(() => process.stdout.write(last.slice(20) + '\\n'), 30);
`);
  fs.chmodSync(bin, 0o755);
  return bin;
}

test('buildArgs loads only the after-effects server and resumes sessions', () => {
  const setup = { claude: '/x/claude', node: '/x/node', serverScript, model: null };
  const first = Runner.buildArgs(setup, 'hi', null);
  assert.equal(first[first.indexOf('-p') + 1], 'hi');
  assert.ok(first.includes('--strict-mcp-config'));
  assert.ok(first.includes('--verbose'));
  assert.equal(first[first.indexOf('--allowedTools') + 1], 'mcp__after-effects');
  const mcp = JSON.parse(first[first.indexOf('--mcp-config') + 1]);
  assert.deepEqual(mcp.mcpServers['after-effects'], { command: '/x/node', args: [serverScript] });
  assert.ok(!first.includes('--resume'));

  const next = Runner.buildArgs({ ...setup, model: 'sonnet' }, 'more', 'sess-1');
  assert.equal(next[next.indexOf('--resume') + 1], 'sess-1');
  assert.equal(next[next.indexOf('--model') + 1], 'sonnet');
});

test('toEvents maps stream-json messages', () => {
  assert.deepEqual(Runner.toEvents({ type: 'system', subtype: 'init', session_id: 's' }), [{ type: 'session', sessionId: 's' }]);
  const ev = Runner.toEvents({
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 't', is_error: true, content: 'Layer not found' }] },
  });
  assert.deepEqual(ev, [{ type: 'toolResult', id: 't', isError: true, text: 'Layer not found' }]);
  assert.deepEqual(Runner.toEvents({ type: 'stream_event' }), []);
});

test('resolveSetup checks the MCP server path', () => {
  assert.throws(() => Runner.resolveSetup({ serverScript: '/nope.js', settings: { claudePath: '/bin/sh', nodePath: '/bin/sh' } }), /MCP 서버/);
});

test('run streams events from claude and reports completion', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-console-'));
  try {
    const setup = { claude: fakeClaude(dir), node: process.execPath, serverScript, model: null };
    const events = [];
    await new Promise((resolve) => {
      Runner.run({
        setup, prompt: '배경 깔아줘', sessionId: 'prev', cwd: dir,
        onEvent: (e) => { events.push(e); if (e.type === 'done') resolve(); },
      });
    });
    assert.deepEqual(events.map((e) => e.type), ['session', 'text', 'tool', 'toolResult', 'done']);
    assert.equal(events[2].name, 'ae_add_layer');
    assert.equal(events[2].internal, false);
    assert.equal(events[4].isError, false);
    assert.equal(events[4].sessionId, 'sess-1');
    const args = JSON.parse(fs.readFileSync(path.join(dir, 'args.json'), 'utf8'));
    assert.equal(args[args.indexOf('--resume') + 1], 'prev');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('run reports a crash and can be stopped', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-console-'));
  try {
    const crash = path.join(dir, 'crash');
    fs.writeFileSync(crash, '#!/bin/sh\necho "Invalid API key · Please run /login" >&2\nexit 1\n', { mode: 0o755 });
    const done = await new Promise((resolve) => {
      Runner.run({ setup: { claude: crash, node: process.execPath, serverScript }, prompt: 'x', cwd: dir,
        onEvent: (e) => e.type === 'done' && resolve(e) });
    });
    assert.equal(done.isError, true);
    assert.match(done.text, /코드 1/);
    assert.match(done.text, /로그인/);

    const slow = path.join(dir, 'slow');
    fs.writeFileSync(slow, '#!/bin/sh\nsleep 30\n', { mode: 0o755 });
    const stopped = await new Promise((resolve) => {
      const r = Runner.run({ setup: { claude: slow, node: process.execPath, serverScript }, prompt: 'x', cwd: dir,
        onEvent: (e) => e.type === 'done' && resolve(e) });
      setTimeout(() => r.stop(), 100);
    });
    assert.equal(stopped.text, '중지했어요.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
