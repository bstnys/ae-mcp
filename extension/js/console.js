/*
 * Claude Console window: a floating, FX Console-style command box inside
 * After Effects. Enter sends, Shift+Enter adds a line, Esc stops a running
 * request or closes the window, ↑/↓ recalls earlier prompts, ⌘N starts a new
 * conversation. The footer button records the shortcut that opens it.
 */
(function () {
'use strict';

var cep = window.__adobe_cep__;
var nodeRequire = window.cep_node.require;
var fs = nodeRequire('fs');
var path = nodeRequire('path');
var Runner = window.ClaudeRunner;

var STORE_KEY = 'aeMcpConsole.v1';
var MAX_ENTRIES = 200;
var MAX_HISTORY = 50;

var $ = function (id) { return document.getElementById(id); };
var logEl = $('log'), input = $('input'), statusEl = $('status');
var Shortcut = window.ConsoleShortcut;

var state = load();
var current = null;          // running Claude process
var toolEls = {};            // tool_use id -> element
var historyPos = -1;

function load() {
  try {
    var s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.entries)) return s;
  } catch (e) {}
  return { sessionId: null, entries: [], history: [] };
}

function save() {
  state.entries = state.entries.slice(-MAX_ENTRIES);
  state.history = state.history.slice(-MAX_HISTORY);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

function extensionDir() {
  var p = decodeURI(cep.getSystemPath('extension')).replace(/^file:\/\//, '');
  try { return fs.realpathSync(p); } catch (e) { return p; }
}

function summarize(input) {
  if (!input) return '';
  var keys = ['type', 'name', 'layerName', 'path', 'effect', 'text', 'expression'];
  var parts = [];
  keys.forEach(function (k) {
    if (input[k] === undefined) return;
    var v = Array.isArray(input[k]) ? input[k].join('/') : String(input[k]);
    parts.push(v.length > 40 ? v.slice(0, 40) + '…' : v);
  });
  if (input.keyframes) parts.push(input.keyframes.length + ' keys');
  return parts.join(' · ');
}

// ---------------------------------------------------------------- rendering

function render(entry) {
  var el = document.createElement('div');
  el.className = 'msg ' + entry.kind;
  if (entry.kind === 'tool') {
    var st = document.createElement('span');
    st.className = 'st';
    st.textContent = entry.status === 'ok' ? '✓' : entry.status === 'err' ? '✗' : '▸';
    el.appendChild(st);
    el.appendChild(document.createTextNode(entry.name + (entry.summary ? '  ' + entry.summary : '')));
    if (entry.status) el.classList.add(entry.status);
    if (entry.detail) el.title = entry.detail;
  } else {
    el.textContent = entry.text;
  }
  var empty = logEl.querySelector('.empty');
  if (empty) empty.remove();
  logEl.appendChild(el);
  logEl.scrollTop = logEl.scrollHeight;
  return el;
}

function add(entry) {
  state.entries.push(entry);
  save();
  return render(entry);
}

function renderAll() {
  logEl.innerHTML = '';
  if (!state.entries.length) {
    logEl.innerHTML = '<div class="empty">예: “선택한 레이어에 0.5초 페이드 인 넣어줘”<br>“1920×1080 10초 컴포 만들고 제목 텍스트 가운데에”</div>';
  }
  state.entries.forEach(render);
  statusEl.textContent = state.sessionId ? '대화 이어가는 중' : '';
}

function setBusy(busy) {
  document.body.classList.toggle('busy', busy);
  input.placeholder = busy ? '작업 중… (Esc로 중지)' : 'After Effects에서 할 일을 입력하세요';
}

// ---------------------------------------------------------------- running

function send(prompt) {
  var setup;
  try {
    setup = Runner.resolveSetup({ serverScript: path.join(extensionDir(), '..', 'server', 'src', 'index.js') });
  } catch (e) {
    add({ kind: 'error', text: e.message });
    return;
  }
  add({ kind: 'user', text: prompt });
  state.history.push(prompt);
  historyPos = -1;
  save();
  setBusy(true);
  statusEl.textContent = '작업 중…';

  var run = Runner.run({
    setup: setup,
    prompt: prompt,
    sessionId: state.sessionId,
    onEvent: function (ev) {
      if (current !== run) return; // a newer conversation replaced this run
      if (ev.type === 'session') {
        state.sessionId = ev.sessionId;
        save();
      } else if (ev.type === 'text') {
        add({ kind: 'assistant', text: ev.text.trim() });
      } else if (ev.type === 'tool') {
        if (ev.internal) return;
        var entry = { kind: 'tool', id: ev.id, name: ev.name, summary: summarize(ev.input) };
        toolEls[ev.id] = { el: add(entry), entry: entry };
        statusEl.textContent = ev.name + ' 실행 중…';
      } else if (ev.type === 'toolResult') {
        var t = toolEls[ev.id];
        if (!t) return;
        t.entry.status = ev.isError ? 'err' : 'ok';
        if (ev.isError) t.entry.detail = ev.text;
        t.el.classList.add(t.entry.status);
        t.el.querySelector('.st').textContent = ev.isError ? '✗' : '✓';
        if (ev.isError) t.el.title = ev.text;
        save();
      } else if (ev.type === 'done') {
        current = null;
        setBusy(false);
        if (ev.sessionId) state.sessionId = ev.sessionId;
        if (ev.isError) add({ kind: 'error', text: ev.text });
        statusEl.textContent = state.sessionId ? '대화 이어가는 중' : '';
        if (!ev.isError && ev.durationMs) {
          statusEl.textContent += ' · ' + (ev.durationMs / 1000).toFixed(1) + '초';
        }
        save();
        input.focus();
      }
    }
  });
  current = run;
}

function reset() {
  if (current) { var r = current; current = null; r.stop(); setBusy(false); }
  state.sessionId = null;
  state.entries = [];
  save();
  renderAll();
  input.focus();
}

// ---------------------------------------------------------------- input

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

$('form').addEventListener('submit', function (e) {
  e.preventDefault();
  if (current) { current.stop(); return; }
  var prompt = input.value.trim();
  if (!prompt) return;
  input.value = '';
  autosize();
  send(prompt);
});

$('reset').addEventListener('click', reset);

input.addEventListener('input', autosize);
input.addEventListener('keydown', function (e) {
  if (e.isComposing || e.keyCode === 229) return; // Korean IME composition
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!current) $('form').requestSubmit();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (current) current.stop(); else cep.closeExtension();
  } else if (e.key === 'n' && e.metaKey) {
    e.preventDefault();
    reset();
  } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !input.value.includes('\n')) {
    var h = state.history;
    if (!h.length) return;
    e.preventDefault();
    if (e.key === 'ArrowUp') historyPos = historyPos < 0 ? h.length - 1 : Math.max(0, historyPos - 1);
    else historyPos = historyPos < 0 ? -1 : historyPos + 1;
    if (historyPos >= h.length) historyPos = -1;
    input.value = historyPos < 0 ? '' : h[historyPos];
    autosize();
  }
});

// ---------------------------------------------------------------- shortcut

var bid = null, pending = null;

function showShortcut() {
  var ns = null;
  try { bid = bid || Shortcut.bundleId(); ns = Shortcut.read(bid); } catch (e) {}
  $('keysLabel').textContent = ns ? Shortcut.toDisplay(ns) : '없음';
}

function openRecorder() {
  pending = null;
  $('recorder').textContent = '…';
  $('recorderNote').textContent = '';
  $('save').disabled = true;
  $('shortcut').classList.add('open');
  $('recorder').focus();
}

function closeRecorder() {
  $('shortcut').classList.remove('open');
  input.focus();
}

function applied(msg) {
  closeRecorder();
  showShortcut();
  add({ kind: 'assistant', text: msg });
}

$('keys').addEventListener('click', openRecorder);
$('cancel').addEventListener('click', closeRecorder);
$('recorder').addEventListener('keydown', function (e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape' && !e.metaKey && !e.ctrlKey && !e.altKey) { closeRecorder(); return; }
  var r = Shortcut.fromKeyEvent(e);
  if (!r) return;
  if (r.error) { $('recorderNote').textContent = r.error; return; }
  pending = r;
  $('recorder').textContent = r.display;
  $('recorderNote').textContent = '';
  $('save').disabled = false;
});
$('save').addEventListener('click', function () {
  if (!pending) return;
  try {
    Shortcut.write(pending.ns, bid || Shortcut.bundleId());
    applied('콘솔 단축키를 ' + pending.display + '로 저장했어요. After Effects를 다시 시작하면 적용돼요.');
  } catch (e) {
    $('recorderNote').textContent = '저장하지 못했어요: ' + e.message;
  }
});
$('clear').addEventListener('click', function () {
  try {
    Shortcut.remove(bid || Shortcut.bundleId());
    applied('콘솔 단축키를 지웠어요. After Effects를 다시 시작하면 적용돼요.');
  } catch (e) {
    $('recorderNote').textContent = '지우지 못했어요: ' + e.message;
  }
});

window.addEventListener('focus', function () { if (!$('shortcut').classList.contains('open')) input.focus(); });
window.addEventListener('unload', function () { if (current) current.stop(); });

renderAll();
showShortcut();
input.focus();
})();
