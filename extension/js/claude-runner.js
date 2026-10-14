/*
 * Runs Claude Code headlessly (`claude -p`) for the Claude Console window.
 *
 * Each prompt starts one `claude -p ... --output-format stream-json` process
 * with only the after-effects MCP server loaded and allowed, and resumes the
 * previous session so follow-up prompts keep the conversation. Claude Code
 * uses the user's own Claude login, so no API key is needed.
 */
(function () {
'use strict';

var cepNode = typeof window !== 'undefined' ? window.cep_node : undefined;
var nodeRequire = cepNode ? cepNode.require : require;
var nodeProcess = cepNode ? cepNode.process : process;

var childProcess = nodeRequire('child_process');
var fs = nodeRequire('fs');
var os = nodeRequire('os');
var path = nodeRequire('path');

var MCP_NAME = 'after-effects';
var TOOL_PREFIX = 'mcp__' + MCP_NAME + '__';

var SYSTEM_PROMPT = [
  'You are running inside Adobe After Effects through the Claude Console, a command box the user opened with a shortcut.',
  'Act directly in After Effects with the after-effects MCP tools; do not describe manual steps when a tool can do it.',
  'When the request depends on what the user is looking at, start with ae_get_selection or ae_get_comp.',
  'Use ae_render_frame to check visual results when it matters.',
  'Each tool call is its own undo step in After Effects.',
  'Keep replies short (one or two sentences) and in the language the user wrote in.'
].join(' ');

function appSupportDir() {
  return nodeProcess.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'ae-mcp')
    : path.join(os.homedir(), '.ae-mcp');
}

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(path.join(appSupportDir(), 'console.json'), 'utf8'));
  } catch (e) {
    return {};
  }
}

// Apps launched from the Dock don't get the shell PATH, so ask a login shell for it.
var cachedPath = null;
function loginPath() {
  if (cachedPath !== null) return cachedPath;
  var fallback = ['/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin'), '/usr/bin', '/bin'];
  var shell = nodeProcess.env.SHELL || '/bin/zsh';
  try {
    var out = childProcess.execFileSync(shell, ['-lc', 'printf "__AEMCP__%s" "$PATH"'], { encoding: 'utf8', timeout: 5000 });
    var m = /__AEMCP__(.*)$/.exec(out.trim());
    cachedPath = m ? m[1] : '';
  } catch (e) {
    cachedPath = '';
  }
  var parts = cachedPath.split(':').filter(Boolean);
  fallback.forEach(function (p) { if (parts.indexOf(p) < 0) parts.push(p); });
  cachedPath = parts.join(':');
  return cachedPath;
}

function findExecutable(name, extraCandidates) {
  var dirs = loginPath().split(':');
  var candidates = dirs.map(function (d) { return path.join(d, name); }).concat(extraCandidates || []);
  for (var i = 0; i < candidates.length; i++) {
    try {
      fs.accessSync(candidates[i], fs.constants.X_OK);
      if (fs.statSync(candidates[i]).isFile()) return candidates[i];
    } catch (e) {}
  }
  return null;
}

/**
 * Resolve everything needed to start Claude Code. Throws a user-facing error if
 * something is missing.
 * @param {object} o
 * @param {string} o.serverScript absolute path of server/src/index.js
 */
function resolveSetup(o) {
  var settings = Object.assign({}, readSettings(), o.settings || {});
  var claude = settings.claudePath || findExecutable('claude', [
    path.join(os.homedir(), '.claude', 'local', 'claude'),
    path.join(os.homedir(), '.local', 'bin', 'claude')
  ]);
  if (!claude) {
    throw new Error('Claude Code(claude)를 찾을 수 없어요. 터미널에서 설치한 뒤 로그인해 주세요: curl -fsSL https://claude.ai/install.sh | bash');
  }
  var node = settings.nodePath || findExecutable('node');
  if (!node) throw new Error('Node.js(node)를 찾을 수 없어요.');
  if (!fs.existsSync(o.serverScript)) throw new Error('MCP 서버 파일이 없어요: ' + o.serverScript);
  return { claude: claude, node: node, serverScript: o.serverScript, model: settings.model || null };
}

function buildArgs(setup, prompt, sessionId) {
  var mcpConfig = { mcpServers: {} };
  mcpConfig.mcpServers[MCP_NAME] = { command: setup.node, args: [setup.serverScript] };
  var args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--mcp-config', JSON.stringify(mcpConfig),
    '--strict-mcp-config',
    '--allowedTools', 'mcp__' + MCP_NAME,
    '--append-system-prompt', SYSTEM_PROMPT
  ];
  if (setup.model) args.push('--model', setup.model);
  if (sessionId) args.push('--resume', sessionId);
  return args;
}

function shortToolName(name) {
  return name.indexOf(TOOL_PREFIX) === 0 ? name.slice(TOOL_PREFIX.length) : name;
}

function toolResultText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(function (c) { return c.type === 'text' ? c.text : '[' + c.type + ']'; }).join('\n');
}

/**
 * Turn one stream-json message into zero or more UI events:
 *   {type:'session', sessionId}
 *   {type:'text', text}
 *   {type:'tool', id, name, input}
 *   {type:'toolResult', id, isError, text}
 *   {type:'done', sessionId, isError, text, costUsd, durationMs}
 */
function toEvents(msg) {
  var out = [];
  if (msg.type === 'system' && msg.subtype === 'init') {
    out.push({ type: 'session', sessionId: msg.session_id });
  } else if (msg.type === 'assistant' && msg.message && Array.isArray(msg.message.content)) {
    msg.message.content.forEach(function (b) {
      if (b.type === 'text' && b.text) out.push({ type: 'text', text: b.text });
      if (b.type === 'tool_use') {
        // internal: Claude Code's own helpers (e.g. ToolSearch), not After Effects actions.
        out.push({ type: 'tool', id: b.id, name: shortToolName(b.name), input: b.input, internal: b.name.indexOf(TOOL_PREFIX) !== 0 });
      }
    });
  } else if (msg.type === 'user' && msg.message && Array.isArray(msg.message.content)) {
    msg.message.content.forEach(function (b) {
      if (b.type === 'tool_result') {
        out.push({ type: 'toolResult', id: b.tool_use_id, isError: !!b.is_error, text: toolResultText(b.content) });
      }
    });
  } else if (msg.type === 'result') {
    out.push({
      type: 'done', sessionId: msg.session_id, isError: !!msg.is_error,
      text: msg.result || '', costUsd: msg.total_cost_usd, durationMs: msg.duration_ms
    });
  }
  return out;
}

/**
 * Start one Claude Code run.
 * @returns {{stop: function(): void}}
 */
function run(opts) {
  var onEvent = opts.onEvent;
  var setup = opts.setup;
  var env = Object.assign({}, nodeProcess.env, { PATH: opts.pathOverride || loginPath() });
  Object.keys(env).forEach(function (k) { if (k.indexOf('CLAUDE_CODE_') === 0 || k === 'CLAUDECODE') delete env[k]; });
  var cwd = opts.cwd || path.join(appSupportDir(), 'console');
  fs.mkdirSync(cwd, { recursive: true });

  var child = childProcess.spawn(setup.claude, buildArgs(setup, opts.prompt, opts.sessionId), {
    cwd: cwd, env: env, stdio: ['ignore', 'pipe', 'pipe']
  });

  var buf = '', stderr = '', finished = false, stopped = false;
  function finish(ev) {
    if (finished) return;
    finished = true;
    onEvent(ev);
  }

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', function (chunk) {
    buf += chunk;
    var lines = buf.split('\n');
    buf = lines.pop();
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var msg;
      try { msg = JSON.parse(line); } catch (e) { return; }
      toEvents(msg).forEach(function (ev) {
        if (ev.type === 'done') finish(ev); else onEvent(ev);
      });
    });
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', function (c) { stderr = (stderr + c).slice(-4000); });
  child.on('error', function (err) {
    finish({ type: 'done', isError: true, text: 'Claude Code를 실행하지 못했어요: ' + err.message });
  });
  child.on('close', function (code) {
    if (stopped) return finish({ type: 'done', isError: true, text: '중지했어요.' });
    var detail = stderr.trim().split('\n').slice(-3).join('\n');
    finish({
      type: 'done', isError: true,
      text: 'Claude Code가 종료됐어요 (코드 ' + code + ').' + (detail ? '\n' + detail : '') +
        (/log ?in|auth|credential/i.test(detail) ? '\n터미널에서 claude를 한 번 실행해 로그인해 주세요.' : '')
    });
  });

  return {
    stop: function () {
      stopped = true;
      try { child.kill('SIGTERM'); } catch (e) {}
    }
  };
}

var api = {
  resolveSetup: resolveSetup, buildArgs: buildArgs, toEvents: toEvents, run: run,
  SYSTEM_PROMPT: SYSTEM_PROMPT, MCP_NAME: MCP_NAME
};

if (typeof window !== 'undefined' && window.__adobe_cep__) window.ClaudeRunner = api;
else if (typeof module !== 'undefined') module.exports = api;
})();
