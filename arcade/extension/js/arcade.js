/*
 * Shared bits for the AE Arcade pages: key registration with After Effects and
 * navigation back to the game picker.
 */
(function () {
'use strict';

// Mac virtual key codes and Windows VK codes for the keys the games use: arrows, Space, Return, Esc,
// Shifts, Backspace and the letters A C D M P R S W X Z plus 1-2.
var MAC = [123, 124, 125, 126, 49, 36, 53, 56, 60, 51, 0, 8, 2, 46, 35, 15, 1, 13, 7, 6, 18, 19];
var WIN = [37, 38, 39, 40, 32, 13, 27, 16, 8, 65, 67, 68, 77, 80, 82, 83, 87, 88, 90, 49, 50];

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
  }
};

Arcade.registerKeys();
window.Arcade = Arcade;
})();
