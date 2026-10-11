/*
 * Claude Bridge panel (CEP, Node enabled, mixed context).
 *
 * Runs a small HTTP server on 127.0.0.1 that the ae-mcp MCP server talks to.
 * Each POST /rpc {method, params} is forwarded to host.jsx via evalScript and
 * the JSON result is returned. The port and a per-launch token are written to
 * a config file the MCP server reads, so nothing needs to be configured by hand.
 */
(function () {
'use strict';

// CEP exposes Node through window.cep_node (separate-context mode); plain Node
// (tests) has the usual globals.
var cepNode = typeof window !== 'undefined' ? window.cep_node : undefined;
var nodeRequire = cepNode ? cepNode.require : require;
var nodeProcess = cepNode ? cepNode.process : process;
var NodeBuffer = cepNode ? cepNode.Buffer : Buffer;

var http = nodeRequire('http');
var fs = nodeRequire('fs');
var os = nodeRequire('os');
var path = nodeRequire('path');
var crypto = nodeRequire('crypto');

var DEFAULT_PORT = 8642;
var PORT_ATTEMPTS = 20;
var EVAL_TIMEOUT_MS = 120000;
var MAX_BODY = 20 * 1024 * 1024;

function defaultConfigPath() {
  var base = nodeProcess.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'ae-mcp')
    : path.join(os.homedir(), '.ae-mcp');
  return path.join(base, 'bridge.json');
}

// Turn a JSON string into an ExtendScript string literal.
function jsxString(s) {
  return JSON.stringify(s).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * @param {object} opts
 * @param {(script: string, cb: (result: string) => void) => void} opts.evalScript
 * @param {string} [opts.hostScriptPath] path of host.jsx, reloaded if the host engine lost it
 * @param {string} [opts.configPath]
 * @param {number} [opts.port]
 * @param {(entry: {level: string, msg: string}) => void} [opts.log]
 * @param {(state: object) => void} [opts.onState]
 */
function createBridge(opts) {
  var log = opts.log || function () {};
  var onState = opts.onState || function () {};
  var configPath = opts.configPath || defaultConfigPath();
  var token = crypto.randomBytes(24).toString('hex');
  var queue = Promise.resolve();
  var server = null;
  var port = null;

  function evalRaw(script) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        reject(new Error('After Effects did not respond in time (is a modal dialog open?)'));
      }, EVAL_TIMEOUT_MS);
      opts.evalScript(script, function (result) {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  function dispatchOnce(payload) {
    var script = '(typeof aeMcp === "undefined") ? "__AE_MCP_NO_HOST__" : aeMcp.dispatch(' + jsxString(payload) + ')';
    return evalRaw(script);
  }

  // AE runs scripts one at a time; serialize calls so responses never interleave.
  function call(method, params) {
    var payload = JSON.stringify({ method: method, params: params || {} });
    var run = function () {
      return dispatchOnce(payload).then(function (raw) {
        if (raw === '__AE_MCP_NO_HOST__' && opts.hostScriptPath) {
          log({ level: 'info', msg: 'Reloading host.jsx' });
          return evalRaw('$.evalFile(' + jsxString(opts.hostScriptPath) + ')').then(function () {
            return dispatchOnce(payload);
          });
        }
        return raw;
      }).then(function (raw) {
        if (raw === '__AE_MCP_NO_HOST__') throw new Error('host.jsx is not loaded in After Effects');
        if (raw === 'EvalScript error.') throw new Error('ExtendScript evaluation failed');
        try {
          return JSON.parse(raw);
        } catch (e) {
          throw new Error('Unexpected reply from After Effects: ' + String(raw).slice(0, 200));
        }
      });
    };
    var p = queue.then(run, run);
    queue = p.catch(function () {});
    return p;
  }

  function send(res, status, body) {
    var data = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': NodeBuffer.byteLength(data) });
    res.end(data);
  }

  function authorized(req) {
    var h = req.headers.authorization || '';
    var given = NodeBuffer.from(h.replace(/^Bearer /, ''));
    var want = NodeBuffer.from(token);
    return given.length === want.length && crypto.timingSafeEqual(given, want);
  }

  function handle(req, res) {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, name: 'ae-mcp-bridge' });
    if (req.method !== 'POST' || req.url !== '/rpc') return send(res, 404, { ok: false, error: 'Not found' });
    // Browsers send Origin on cross-site requests; the MCP server never does.
    if (req.headers.origin) return send(res, 403, { ok: false, error: 'Forbidden' });
    if (!authorized(req)) return send(res, 401, { ok: false, error: 'Bad token' });

    var chunks = [], size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      var body;
      try { body = JSON.parse(NodeBuffer.concat(chunks).toString('utf8')); } catch (e) {
        return send(res, 400, { ok: false, error: 'Invalid JSON' });
      }
      var started = Date.now();
      call(body.method, body.params).then(function (reply) {
        log({ level: reply.ok ? 'info' : 'error', msg: body.method + ' ' + (Date.now() - started) + 'ms' + (reply.ok ? '' : ' ' + reply.error) });
        send(res, 200, reply);
      }, function (err) {
        log({ level: 'error', msg: body.method + ' ' + err.message });
        send(res, 200, { ok: false, error: err.message });
      });
    });
  }

  function writeConfig() {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    var data = JSON.stringify({ port: port, token: token, pid: nodeProcess.pid, startedAt: new Date().toISOString() }, null, 2);
    fs.writeFileSync(configPath, data, { mode: 384 }); // 0600
  }

  function listen(p, attemptsLeft) {
    return new Promise(function (resolve, reject) {
      var s = http.createServer(handle);
      s.once('error', function (err) {
        if (err.code === 'EADDRINUSE' && attemptsLeft > 1) resolve(listen(p + 1, attemptsLeft - 1));
        else reject(err);
      });
      s.listen(p, '127.0.0.1', function () { server = s; port = p; resolve(p); });
    });
  }

  function start() {
    return listen(opts.port || DEFAULT_PORT, PORT_ATTEMPTS).then(function () {
      writeConfig();
      onState({ status: 'listening', port: port, configPath: configPath });
      log({ level: 'info', msg: 'Listening on 127.0.0.1:' + port });
      return port;
    }, function (err) {
      onState({ status: 'error', error: err.message });
      throw err;
    });
  }

  function stop() {
    return new Promise(function (resolve) {
      if (!server) return resolve();
      server.close(function () { resolve(); });
    });
  }

  return { start: start, stop: stop, call: call, get port() { return port; }, get token() { return token; } };
}

// ------------------------------------------------------------- panel UI

function cepExtensionPath(cep) {
  var p = decodeURI(cep.getSystemPath('extension'));
  return p.replace(/^file:\/\/\/?/, nodeProcess.platform === 'win32' ? '' : '/');
}

function startPanel() {
  var cep = window.__adobe_cep__;
  var $ = function (id) { return document.getElementById(id); };
  var logEl = $('log');

  function log(entry) {
    var line = document.createElement('div');
    if (entry.level === 'error') line.className = 'err';
    line.textContent = new Date().toLocaleTimeString() + '  ' + entry.msg;
    logEl.insertBefore(line, logEl.firstChild);
    while (logEl.childNodes.length > 200) logEl.removeChild(logEl.lastChild);
  }

  var bridge = createBridge({
    evalScript: function (script, cb) { cep.evalScript(script, cb); },
    hostScriptPath: path.join(cepExtensionPath(cep), 'jsx', 'host.jsx'),
    log: log,
    onState: function (s) {
      if (s.status === 'listening') {
        $('dot').className = 'dot on';
        $('status').textContent = 'Claude 연결 대기 중 (port ' + s.port + ')';
        $('detail').textContent = s.configPath;
      } else {
        $('dot').className = 'dot err';
        $('status').textContent = '시작 실패';
        $('detail').textContent = s.error;
      }
    }
  });
  bridge.start().catch(function (e) { log({ level: 'error', msg: e.message }); });
  window.addEventListener('unload', function () { bridge.stop(); });
}

if (typeof window !== 'undefined' && window.__adobe_cep__) {
  try {
    startPanel();
  } catch (e) {
    document.getElementById('dot').className = 'dot err';
    document.getElementById('status').textContent = '시작 실패';
    document.getElementById('detail').textContent = String(e && e.stack || e);
  }
} else if (typeof module !== 'undefined') {
  module.exports = { createBridge: createBridge, defaultConfigPath: defaultConfigPath };
}
})();
