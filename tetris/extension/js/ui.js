/*
 * Panel UI: canvas rendering, keyboard input with DAS/ARR, pause on focus loss,
 * and best score in localStorage.
 */
(function () {
'use strict';

var COLORS = {
  I: '#3fc6d9', J: '#4a6fe0', L: '#e8933a', O: '#e6c84a',
  S: '#5cc469', T: '#a35ad6', Z: '#e05252'
};
var DAS = 0.16, ARR = 0.04;   // seconds

var $ = function (id) { return document.getElementById(id); };
var boardCv = $('board'), holdCv = $('hold'), nextCv = $('next');
var wrap = $('wrap'), overlay = $('overlay');
var ctx = boardCv.getContext('2d');

var game = null, state = 'idle';   // idle | playing | paused | over
var held = {}, das = { dir: 0, t: 0, charged: false };
var flash = null, popup = null, last = 0;
var best = 0;
try { best = parseInt(localStorage.getItem('aeTetrisBest'), 10) || 0; } catch (e) { /* storage unavailable */ }

// Ask After Effects to send these keys to the panel instead of handling them itself
// (otherwise Space would start a RAM preview and arrows would nudge layers).
(function registerKeys() {
  var cep = window.__adobe_cep__;
  if (!cep || !cep.registerKeyEventsInterest) return;
  var mac = [123, 124, 125, 126, 49, 6, 7, 8, 35, 15, 53, 36, 56, 60, 0, 2, 13, 1];   // arrows, space, Z X C P R, esc, return, shifts, A D W S
  var win = [37, 38, 39, 40, 32, 90, 88, 67, 80, 82, 27, 13, 16, 65, 68, 87, 83];
  var keys = (navigator.platform.indexOf('Mac') === 0 ? mac : win).map(function (k) { return { keyCode: k }; });
  keys = keys.concat(keys.map(function (k) { return { keyCode: k.keyCode, shiftKey: true }; }));
  cep.registerKeyEventsInterest(JSON.stringify(keys));
})();

function keyAction(e) {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowUp': case 'KeyX': case 'KeyW': return 'cw';
    case 'KeyZ': return 'ccw';
    case 'Space': return 'hard';
    case 'KeyC': case 'ShiftLeft': case 'ShiftRight': return 'hold';
    case 'KeyP': case 'Escape': return 'pause';
    case 'KeyR': return 'restart';
    case 'Enter': case 'NumpadEnter': return 'start';
  }
  return null;
}

document.addEventListener('keydown', function (e) {
  var a = keyAction(e);
  if (!a) return;
  e.preventDefault();
  if (a === 'start') { if (state !== 'playing') state === 'paused' ? resume() : start(); return; }
  if (a === 'restart') { start(); return; }
  if (a === 'pause') { state === 'playing' ? pause() : state === 'paused' && resume(); return; }
  if (state !== 'playing' || e.repeat) return;
  held[a] = true;
  if (a === 'left' || a === 'right') {
    game.input(a);
    das = { dir: a === 'left' ? -1 : 1, t: 0, charged: false };
  } else if (a === 'down') {
    game.softDrop = true;
  } else {
    game.input(a);
  }
});

document.addEventListener('keyup', function (e) {
  var a = keyAction(e);
  if (!a) return;
  held[a] = false;
  if (a === 'down' && game) game.softDrop = false;
  if ((a === 'left' && das.dir === -1) || (a === 'right' && das.dir === 1)) {
    // Fall back to the other direction if it is still held.
    das = held.left ? { dir: -1, t: 0, charged: false } : held.right ? { dir: 1, t: 0, charged: false } : { dir: 0 };
  }
});

window.addEventListener('blur', function () {
  held = {}; das = { dir: 0 };
  if (game) game.softDrop = false;
  if (state === 'playing') pause('패널 밖을 클릭해서 일시정지됐어요');
});
wrap.addEventListener('mousedown', function () { wrap.focus(); });
$('startBtn').addEventListener('click', function () { wrap.focus(); state === 'paused' ? resume() : start(); });

function start() {
  game = Tetris.createGame();
  state = 'playing';
  held = {}; das = { dir: 0 }; flash = null; popup = null;
  overlay.className = 'hidden';
  wrap.focus();
}

function pause(why) {
  state = 'paused';
  showOverlay('일시정지', (why ? why + '<br>' : '') + 'Enter 또는 P로 계속', '계속');
}

function resume() {
  state = 'playing';
  overlay.className = 'hidden';
  wrap.focus();
}

function showOverlay(title, text, btn) {
  $('ovTitle').textContent = title;
  $('ovText').innerHTML = text;
  $('startBtn').textContent = btn;
  overlay.className = '';
}

function endGame() {
  state = 'over';
  var isBest = game.score > best;
  if (isBest) {
    best = game.score;
    try { localStorage.setItem('aeTetrisBest', String(best)); } catch (e) { /* storage unavailable */ }
  }
  showOverlay('GAME OVER', '점수 ' + game.score.toLocaleString() + (isBest ? '  🏆 최고 기록!' : '') +
    '<br>Enter 또는 R로 다시 시작', '다시 시작');
}

function tick(now) {
  var dt = Math.min((now - (last || now)) / 1000, 0.1);
  last = now;
  if (state === 'playing') {
    if (das.dir) {
      das.t += dt;
      if (!das.charged && das.t >= DAS) { das.charged = true; das.t = ARR; }
      while (das.charged && das.t >= ARR) { das.t -= ARR; if (!game.input(das.dir < 0 ? 'left' : 'right')) break; }
    }
    game.update(dt);
    if (game.lastClear) {
      if (game.lastClear.rows.length) flash = { rows: game.lastClear.rows, t: 0 };
      if (game.lastClear.text) popup = { text: game.lastClear.text, t: 0 };
      game.lastClear = null;
    }
    game.events.length = 0;
    if (game.over) endGame();
  }
  if (flash) { flash.t += dt; if (flash.t > 0.25) flash = null; }
  if (popup) { popup.t += dt; if (popup.t > 1.2) popup = null; }
  draw();
  requestAnimationFrame(tick);
}

// --- drawing ---------------------------------------------------------------

function fitCanvas(cv, w, h) {
  var dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  return c;
}

function drawCell(c, x, y, s, color, alpha) {
  c.globalAlpha = alpha === undefined ? 1 : alpha;
  c.fillStyle = color;
  c.fillRect(x + 1, y + 1, s - 2, s - 2);
  c.fillStyle = 'rgba(255,255,255,.18)';
  c.fillRect(x + 1, y + 1, s - 2, Math.max(2, s * 0.14));
  c.fillStyle = 'rgba(0,0,0,.22)';
  c.fillRect(x + 1, y + s - 1 - Math.max(2, s * 0.12), s - 2, Math.max(2, s * 0.12));
  c.globalAlpha = 1;
}

function layout() {
  // Board keeps a 1:2 ratio inside whatever space the panel gives it.
  var side = $('side').offsetWidth + 10;
  var availH = wrap.clientHeight - 20, availW = wrap.clientWidth - 20 - side;
  var s = Math.max(8, Math.floor(Math.min(availH / 20, availW / 10)));
  boardCv.style.height = (s * 20 + 2) + 'px';
  boardCv.style.width = (s * 10 + 2) + 'px';
  $('boardBox').style.height = (s * 20 + 2) + 'px';
  return s;
}

function draw() {
  var s = layout();
  var W = s * 10, H = s * 20;
  var c = fitCanvas(boardCv, W, H);
  c.clearRect(0, 0, W, H);

  c.strokeStyle = 'rgba(255,255,255,.04)';
  c.lineWidth = 1;
  for (var gx = 1; gx < 10; gx++) { c.beginPath(); c.moveTo(gx * s + .5, 0); c.lineTo(gx * s + .5, H); c.stroke(); }
  for (var gy = 1; gy < 20; gy++) { c.beginPath(); c.moveTo(0, gy * s + .5); c.lineTo(W, gy * s + .5); c.stroke(); }

  if (game) {
    var hid = game.hidden;
    for (var r = hid; r < game.rows; r++)
      for (var col = 0; col < game.cols; col++)
        if (game.board[r][col]) drawCell(c, col * s, (r - hid) * s, s, COLORS[game.board[r][col]], state === 'over' ? 0.45 : 1);

    if (game.piece && state !== 'over') {
      var p = game.piece, color = COLORS[p.type];
      game.cells(p, game.ghostY()).forEach(function (cell) {
        if (cell[1] < hid) return;
        c.strokeStyle = color; c.globalAlpha = 0.5; c.lineWidth = 1.5;
        c.strokeRect(cell[0] * s + 2, (cell[1] - hid) * s + 2, s - 4, s - 4);
        c.globalAlpha = 1;
      });
      game.cells(p).forEach(function (cell) {
        if (cell[1] >= hid) drawCell(c, cell[0] * s, (cell[1] - hid) * s, s, color);
      });
    }

    if (flash) {
      c.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - flash.t / 0.25)) + ')';
      flash.rows.forEach(function (row) { if (row >= hid) c.fillRect(0, (row - hid) * s, W, s); });
    }
    if (popup) {
      var a = popup.t < 0.9 ? 1 : 1 - (popup.t - 0.9) / 0.3;
      c.globalAlpha = Math.max(0, a);
      c.font = '700 ' + Math.max(12, Math.round(s * 0.7)) + 'px -apple-system, "Segoe UI", sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 6;
      c.fillText(popup.text, W / 2, H * 0.38 - popup.t * s);
      c.shadowBlur = 0; c.globalAlpha = 1;
    }
  }

  drawMini(holdCv, game && game.hold ? [game.hold] : [], game && game.holdUsed);
  drawMini(nextCv, game ? game.queue : []);

  $('score').textContent = game ? game.score.toLocaleString() : 0;
  $('lines').textContent = game ? game.lines : 0;
  $('level').textContent = game ? game.level : 1;
  $('best').textContent = Math.max(best, game ? game.score : 0).toLocaleString();
}

function drawMini(cv, types, dim) {
  var w = 72, slot = 34, h = Math.max(1, types.length) * slot;
  cv.style.height = h + 'px';
  var c = fitCanvas(cv, w, h);
  c.clearRect(0, 0, w, h);
  types.forEach(function (t, i) {
    var cells = Tetris.ROTATIONS[t][0], s = i === 0 ? 14 : 11;
    var xs = cells.map(function (q) { return q[0]; }), ys = cells.map(function (q) { return q[1]; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var ox = (w - (maxX - minX + 1) * s) / 2, oy = i * slot + (slot - (maxY - minY + 1) * s) / 2;
    cells.forEach(function (q) {
      drawCell(c, ox + (q[0] - minX) * s, oy + (q[1] - minY) * s, s, COLORS[t], dim ? 0.35 : 1);
    });
  });
}

requestAnimationFrame(tick);
wrap.focus();
})();
