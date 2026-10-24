/*
 * Shared bits for the AE Arcade pages: key registration with After Effects and
 * navigation back to the game picker.
 */
(function () {
'use strict';

// Mac virtual key codes and Windows VK codes for the keys the games use: arrows, Space, Return, Esc,
// Shifts, Backspace, the letters A C D F M N P R S U W X Z, and 1-9 on the main row and the keypad.
var MAC = [123, 124, 125, 126, 49, 36, 53, 56, 60, 51, 0, 8, 2, 3, 46, 45, 35, 15, 1, 32, 13, 7, 6,
  18, 19, 20, 21, 23, 22, 26, 28, 25, 83, 84, 85, 86, 87, 88, 89, 91, 92, 76];
var WIN = [37, 38, 39, 40, 32, 13, 27, 16, 8, 65, 67, 68, 70, 77, 78, 80, 82, 83, 85, 87, 88, 90,
  49, 50, 51, 52, 53, 54, 55, 56, 57, 97, 98, 99, 100, 101, 102, 103, 104, 105];

var Arcade = {
  // Ask After Effects to send these keys to the panel instead of handling them itself
  // (otherwise Space would start a RAM preview and arrows would nudge layers).
  registerKeys: function () {
    var cep = window.__adobe_cep__;
    if (!cep || !cep.registerKeyEventsInterest) return;
    var keys = (navigator.platform.indexOf('Mac') === 0 ? MAC : WIN).map(function (k) { return { keyCode: k }; });
    keys = keys.concat(keys.map(function (k) { return { keyCode: k.keyCode, shiftKey: true }; }));
    cep.registerKeyEventsInterest(JSON.stringify(keys));
  },

  menu: function () { window.location.href = 'index.html'; },

  open: function (game) {
    try { localStorage.setItem('aeArcadeLast', game); } catch (e) { /* storage unavailable */ }
    window.location.href = game + '.html';
  },

  load: function (key) {
    try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; }
  },

  save: function (key, value) {
    try { localStorage.setItem(key, String(value)); } catch (e) { /* storage unavailable */ }
  },

  /** Changes whenever the panel is resized, so idle pages know when they must redraw. */
  sizeKey: function (el) { return el.clientWidth + 'x' + el.clientHeight + 'x' + (window.devicePixelRatio || 1); },

  loadText: function (key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  },

  /**
   * Lays out a square board and its side panel for the board games: the panel goes to the right
   * when the panel is wide and under the board when it is tall, whichever leaves the bigger board.
   * Returns the board's size in CSS pixels.
   */
  fitSquare: function (wrap, board, side) {
    var W = wrap.clientWidth - 20, H = wrap.clientHeight - 20, gap = 10;
    var sideW = 190, sideH = Math.min(side.scrollHeight, 220);
    var beside = Math.min(H, W - sideW - gap), below = Math.min(W, H - sideH - gap);
    var mode = beside >= below ? 'beside' : 'below';
    var size = Math.max(160, Math.floor(mode === 'beside' ? beside : below));
    wrap.className = mode;
    board.style.width = board.style.height = size + 'px';
    side.style.width = mode === 'beside' ? sideW + 'px' : size + 'px';
    side.style.height = mode === 'beside' ? size + 'px' : Math.max(80, H - size - gap) + 'px';
    return size;
  }
};

Arcade.registerKeys();
window.Arcade = Arcade;
})();
