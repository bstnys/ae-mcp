// Console shortcut: turning key presses into macOS key equivalents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const Shortcut = createRequire(import.meta.url)(path.join(root, 'extension', 'js', 'shortcut.js'));

const key = (code, mods = {}, k = '') => ({ code, key: k, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

test('records modifier + key combinations', () => {
  assert.deepEqual(Shortcut.fromKeyEvent(key('KeyC', { ctrlKey: true, altKey: true }, 'ç')), { ns: '^~c', display: '⌃⌥C' });
  assert.deepEqual(Shortcut.fromKeyEvent(key('KeyK', { metaKey: true, shiftKey: true }, 'K')), { ns: '$@k', display: '⇧⌘K' });
  assert.deepEqual(Shortcut.fromKeyEvent(key('Digit1', { metaKey: true, altKey: true }, '¡')), { ns: '~@1', display: '⌥⌘1' });
  // Korean layout: e.code still names the physical key.
  assert.deepEqual(Shortcut.fromKeyEvent(key('KeyA', { ctrlKey: true }, 'ㅁ')), { ns: '^a', display: '⌃A' });
});

test('rejects shortcuts that would break typing', () => {
  assert.equal(Shortcut.fromKeyEvent(key('ShiftLeft', { shiftKey: true }, 'Shift')), null);
  assert.match(Shortcut.fromKeyEvent(key('KeyA', { shiftKey: true }, 'A')).error, /⌘/);
  assert.match(Shortcut.fromKeyEvent(key('Space', { metaKey: true }, ' ')).error, /문자/);
});

test('shows saved shortcuts with mac symbols', () => {
  assert.equal(Shortcut.toDisplay('^~c'), '⌃⌥C');
  assert.equal(Shortcut.toDisplay('$@k'), '⇧⌘K');
  assert.equal(Shortcut.toDisplay(''), '');
});

test('falls back to the standard AE bundle id', () => {
  assert.equal(Shortcut.bundleId('/nowhere/node'), 'com.adobe.AfterEffects.application');
});
