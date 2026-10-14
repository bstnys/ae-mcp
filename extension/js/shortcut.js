/*
 * Keyboard shortcut for the Claude Console window.
 *
 * The shortcut is a macOS App Shortcut (NSUserKeyEquivalents) on After Effects'
 * "Claude Console" menu item, so it works anywhere in AE. It is written with
 * `defaults write` and takes effect the next time AE starts.
 */
(function () {
'use strict';

var cepNode = typeof window !== 'undefined' ? window.cep_node : undefined;
var nodeRequire = cepNode ? cepNode.require : require;
var nodeProcess = cepNode ? cepNode.process : process;
var childProcess = nodeRequire('child_process');
var fs = nodeRequire('fs');
var path = nodeRequire('path');

var MENU_TITLE = 'Claude Console';
var DEFAULT_BUNDLE_ID = 'com.adobe.AfterEffects.application';

// macOS key-equivalent modifier symbols, in the order macOS displays them.
var MODS = [
  { prop: 'ctrlKey', ns: '^', glyph: '⌃' },
  { prop: 'altKey', ns: '~', glyph: '⌥' },
  { prop: 'shiftKey', ns: '$', glyph: '⇧' },
  { prop: 'metaKey', ns: '@', glyph: '⌘' }
];

// Characters a key equivalent can use directly (letters, digits, punctuation).
var KEY_RE = /^[a-z0-9`\-=\[\]\\;',.\/]$/;

/**
 * Convert a keydown event into a shortcut, or explain why it can't be one.
 * @returns {{ns: string, display: string} | {error: string} | null} null while only modifiers are held
 */
function fromKeyEvent(e) {
  var code = e.code || '';
  var key;
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3).toLowerCase();
  else if (/^Digit[0-9]$/.test(code)) key = code.slice(5);
  else if (e.key && e.key.length === 1) key = e.key.toLowerCase();
  if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) >= 0) return null;
  if (!key || !KEY_RE.test(key)) return { error: '문자, 숫자, 기호 키만 쓸 수 있어요.' };
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return { error: '⌘, ⌃, ⌥ 중 하나 이상과 함께 눌러 주세요.' };
  var ns = '', display = '';
  MODS.forEach(function (m) {
    if (e[m.prop]) { ns += m.ns; display += m.glyph; }
  });
  return { ns: ns + key, display: display + key.toUpperCase() };
}

function toDisplay(ns) {
  if (!ns) return '';
  var display = '', i = 0;
  for (; i < ns.length - 1; i++) {
    var m = MODS.filter(function (x) { return x.ns === ns.charAt(i); })[0];
    if (!m) break;
    display += m.glyph;
  }
  return display + ns.slice(i).toUpperCase();
}

function defaults(args) {
  return childProcess.execFileSync('/usr/bin/defaults', args, { encoding: 'utf8', timeout: 5000 });
}

/** Bundle id of the running After Effects, found from this process's path inside the .app. */
function bundleId(execPath) {
  var p = execPath || nodeProcess.execPath || '';
  var m = /^(.*?\/Adobe After Effects[^/]*\.app)\//.exec(p);
  var apps = m ? [m[1]] : [];
  if (!apps.length) {
    try {
      fs.readdirSync('/Applications').forEach(function (d) {
        if (d.indexOf('Adobe After Effects') !== 0) return;
        var app = path.join('/Applications', d, d + '.app');
        if (fs.existsSync(app)) apps.push(app);
      });
    } catch (e) {}
  }
  for (var i = 0; i < apps.length; i++) {
    try { return defaults(['read', path.join(apps[i], 'Contents', 'Info'), 'CFBundleIdentifier']).trim(); } catch (e) {}
  }
  return DEFAULT_BUNDLE_ID;
}

/** The saved shortcut for the console, as NSUserKeyEquivalents text (e.g. "^~c"), or null. */
function read(bid) {
  var out;
  try { out = defaults(['read', bid || bundleId(), 'NSUserKeyEquivalents']); } catch (e) { return null; }
  var re = new RegExp('"?' + MENU_TITLE + '"?\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"');
  var m = re.exec(out);
  return m ? m[1].replace(/\\\\/g, '\\') : null;
}

function write(ns, bid) {
  defaults(['write', bid || bundleId(), 'NSUserKeyEquivalents', '-dict-add', MENU_TITLE, ns]);
}

function remove(bid) {
  var id = bid || bundleId();
  var out;
  try { out = defaults(['read', id, 'NSUserKeyEquivalents']); } catch (e) { return; }
  // Rewrite the dictionary without our entry so other app shortcuts survive.
  var entries = [], re = /"?([^"=\n]+?)"?\s*=\s*"((?:[^"\\]|\\.)*)";/g, m;
  while ((m = re.exec(out))) if (m[1].trim() !== MENU_TITLE) entries.push(m[1].trim(), m[2]);
  defaults(['delete', id, 'NSUserKeyEquivalents']);
  if (entries.length) defaults(['write', id, 'NSUserKeyEquivalents', '-dict'].concat(entries));
}

var api = {
  MENU_TITLE: MENU_TITLE, fromKeyEvent: fromKeyEvent, toDisplay: toDisplay,
  bundleId: bundleId, read: read, write: write, remove: remove
};

if (typeof window !== 'undefined' && window.__adobe_cep__) window.ConsoleShortcut = api;
else if (typeof module !== 'undefined') module.exports = api;
})();
