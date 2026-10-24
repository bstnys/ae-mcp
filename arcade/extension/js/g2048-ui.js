/*
 * 2048 panel UI: board scaled to the panel, slide/merge/spawn animation, keys and mouse swipes,
 * one-step undo and best score.
 */
(function () {
'use strict';

var TILE = {
  2: ['#eee4da', '#3c3a32'], 4: ['#ede0c8', '#3c3a32'], 8: ['#f2b179', '#fff'], 16: ['#f59563', '#fff'],
  32: ['#f67c5f', '#fff'], 64: ['#f65e3b', '#fff'], 128: ['#edcf72', '#fff'], 256: ['#edcc61', '#fff'],
  512: ['#edc850', '#fff'], 1024: ['#edc53f', '#fff'], 2048: ['#edc22e', '#fff']
};
var SLIDE = 0.11, POP = 0.14;   // seconds

var $ = function (id) { return document.getElementById(id); };
var wrap = $('wrap'), cv = $('board'), overlay = $('overlay');
var game, best = Arcade.load('ae2048Best'), anim = null, size = 0, drag = null;

function newGame() {
  game = Game2048.createGame();
  anim = { t: 0, moved: [], merged: [], spawned: game.cells.map(function (v, i) { return v ? i : -1; }).filter(function (i) { return i >= 0; }) };
  overlay.className = 'hidden';
  update();
}

function move(dir) {
  if (game.over || !overlay.classList.contains('hidden')) return;
  if (!game.move(dir)) return;
  anim = { t: 0, moved: game.moved, merged: game.merged, spawned: game.spawned >= 0 ? [game.spawned] : [] };
  if (game.score > best) { best = game.score; Arcade.save('ae2048Best', best); }
  update();
  if (game.won && !game.keepPlaying) {
    game.keepPlaying = true;
    show('2048!', '해냈어요. 더 큰 숫자에 도전해 보세요.', '계속하기');
  } else if (game.over) {
    show('GAME OVER', '점수 ' + game.score.toLocaleString() + (game.score >= best ? ' · 🏆 최고 기록!' : ''), '다시 시작');
  }
}

function show(title, text, btn) {
  $('ovTitle').textContent = title; $('ovText').textContent = text; $('ovBtn').textContent = btn;
  setTimeout(function () { overlay.className = ''; }, 250);
}

function update() {
  $('score').textContent = game.score.toLocaleString();
  $('best').textContent = Math.max(best, game.score).toLocaleString();
  $('undoBtn').disabled = !game.prev;
}

var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
document.addEventListener('keydown', function (e) {
  if (KEYS[e.code]) move(KEYS[e.code]);
  else if (e.code === 'KeyN') newGame();
  else if (e.code === 'KeyU') undo();
  else if (e.code === 'KeyM' || e.code === 'Backspace') Arcade.menu();
  else if (e.code === 'Enter' && !overlay.classList.contains('hidden')) $('ovBtn').click();
  else return;
  e.preventDefault();
});

// Drag on the board to swipe.
cv.addEventListener('mousedown', function (e) { wrap.focus(); drag = [e.clientX, e.clientY]; });
window.addEventListener('mouseup', function (e) {
  if (!drag) return;
  var dx = e.clientX - drag[0], dy = e.clientY - drag[1];
  drag = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});

function undo() {
  if (game.undo()) { anim = null; overlay.className = 'hidden'; update(); }
}

$('newBtn').addEventListener('click', newGame);
$('undoBtn').addEventListener('click', undo);
$('menuBtn').addEventListener('click', Arcade.menu);
$('ovBtn').addEventListener('click', function () { overlay.className = 'hidden'; if (game.over) newGame(); wrap.focus(); });

function layout() {
  var W = wrap.clientWidth - 20, H = wrap.clientHeight - 20;
  var extra = $('top').offsetHeight + $('bar').offsetHeight + $('keys').offsetHeight + 3 * 8;
  size = Math.max(140, Math.floor(Math.min(W, H - extra)));
  cv.style.width = cv.style.height = size + 'px';
  $('top').style.width = size + 'px';
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function tile(c, v, x, y, w, scale) {
  var col = TILE[v] || ['#3c3a32', '#fff'];
  var s = w * scale, ox = x + (w - s) / 2, oy = y + (w - s) / 2;
  c.fillStyle = col[0];
  roundRect(c, ox, oy, s, s, s * 0.08); c.fill();
  var digits = String(v).length;
  c.fillStyle = col[1];
  c.font = '700 ' + Math.round(s * (digits < 3 ? 0.45 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24)) + 'px -apple-system, "Segoe UI", sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(v, x + w / 2, y + w / 2 + s * 0.02);
}

function draw(dt) {
  layout();
  var dpr = window.devicePixelRatio || 1, px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  var gap = size * 0.03, w = (size - gap * 5) / 4;
  function pos(i) { return [gap + (i % 4) * (w + gap), gap + Math.floor(i / 4) * (w + gap)]; }

  c.fillStyle = '#3a342e'; roundRect(c, 0, 0, size, size, 6); c.fill();
  c.fillStyle = 'rgba(238,228,218,.12)';
  for (var i = 0; i < 16; i++) { var p = pos(i); roundRect(c, p[0], p[1], w, w, w * 0.08); c.fill(); }

  if (anim) anim.t += dt;
  var sliding = anim && anim.t < SLIDE;
  if (sliding) {
    // Draw each moving tile between where it was and where it ends up, with its old value.
    var k = anim.t / SLIDE, e = 1 - Math.pow(1 - k, 3);
    var prev = game.prev ? game.prev.cells : game.cells;
    anim.moved.forEach(function (m) {
      var a = pos(m.from), b = pos(m.to);
      tile(c, prev[m.from], a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, w, 1);
    });
    return;
  }
  game.cells.forEach(function (v, i) {
    if (!v) return;
    var p = pos(i), sc = 1;
    if (anim) {
      var t2 = anim.t - SLIDE;
      if (anim.spawned.indexOf(i) >= 0) sc = Math.min(1, Math.max(0, t2 / POP));
      else if (anim.merged.indexOf(i) >= 0 && t2 < POP) sc = 1 + 0.12 * Math.sin(Math.PI * t2 / POP);
    }
    if (sc > 0) tile(c, v, p[0], p[1], w, sc);
  });
}

var last = 0;
function tick(now) {
  var dt = Math.min((now - (last || now)) / 1000, 0.05);
  last = now;
  draw(dt);
  requestAnimationFrame(tick);
}

newGame();
requestAnimationFrame(tick);
wrap.focus();
})();
