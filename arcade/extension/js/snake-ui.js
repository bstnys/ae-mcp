/*
 * Snake panel UI: square field scaled to the panel, smooth movement between steps,
 * pause on focus loss, wrap-around option and best score.
 */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
var wrap = $('wrap'), cv = $('field'), overlay = $('overlay');
var game = null, state = 'idle', best = Arcade.load('aeSnakeBest'), frac = 0, flash = 0, last = 0, size = 0;
var wrapWalls = Arcade.loadText('aeSnakeWrap', '0') === '1';
$('wrapOpt').checked = wrapWalls;

var KEYS = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

document.addEventListener('keydown', function (e) {
  if (KEYS[e.code]) {
    e.preventDefault();
    if (state === 'playing') game.turn(KEYS[e.code]);
    else if (state === 'idle' || state === 'over') { start(); game.turn(KEYS[e.code]); }
    return;
  }
  if (e.code === 'Enter' || e.code === 'Space') { state === 'paused' ? resume() : state !== 'playing' && start(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') { state === 'playing' ? pause() : state === 'paused' && resume(); }
  else if (e.code === 'KeyR') start();
  else if (e.code === 'KeyM' || e.code === 'Backspace') { if (state !== 'playing') Arcade.menu(); }
  else return;
  e.preventDefault();
});

window.addEventListener('blur', function () { if (state === 'playing') pause('패널 밖을 클릭해서 일시정지됐어요'); });
wrap.addEventListener('mousedown', function (e) { if (e.target.tagName !== 'INPUT') wrap.focus(); });
$('startBtn').addEventListener('click', function () { state === 'paused' ? resume() : start(); });
$('menuBtn').addEventListener('click', Arcade.menu);
$('wrapOpt').addEventListener('change', function () { wrapWalls = this.checked; Arcade.save('aeSnakeWrap', wrapWalls ? '1' : '0'); });

function start() {
  game = Snake.createGame({ wrap: wrapWalls });
  state = 'playing'; frac = 0; flash = 0;
  overlay.className = 'hidden';
  wrap.focus();
}

function pause(why) {
  state = 'paused';
  show('일시정지', (why ? why + '<br>' : '') + 'Enter 또는 P로 계속', '계속');
}

function resume() { state = 'playing'; overlay.className = 'hidden'; wrap.focus(); }

function show(title, text, btn) {
  $('ovTitle').textContent = title; $('ovText').innerHTML = text; $('startBtn').textContent = btn;
  overlay.className = '';
}

function endGame() {
  state = 'over';
  var isBest = game.score > best;
  if (isBest) { best = game.score; Arcade.save('aeSnakeBest', best); }
  show('GAME OVER', '점수 ' + game.score.toLocaleString() + ' · 길이 ' + game.snake.length + (isBest ? '  🏆 최고 기록!' : '') +
    '<br>방향키나 Enter로 다시 시작', '다시 시작');
}

var drawnKey = '';
function tick(now) {
  var dt = Math.min((now - (last || now)) / 1000, 0.05);
  last = now;
  // Redraw only while playing, while a flash fades, or after a resize.
  var busy = state === 'playing' || flash > 0;
  if (state === 'playing') {
    frac = game.update(dt);
    game.events.forEach(function (ev) { if (ev === 'eat' || ev === 'bonus') flash = ev === 'bonus' ? 0.5 : 0.2; });
    game.events.length = 0;
    if (game.over) endGame();
  }
  if (flash > 0) flash = Math.max(0, flash - dt);
  var key = Arcade.sizeKey(wrap);
  if (busy || key !== drawnKey) { draw(); drawnKey = key; }
  requestAnimationFrame(tick);
}

function layout() {
  var W = wrap.clientWidth - 20, H = wrap.clientHeight - 20;
  var extra = $('hud').offsetHeight + $('keys').offsetHeight + 2 * 8;
  size = Math.max(140, Math.floor(Math.min(W, H - extra)));
  cv.style.width = cv.style.height = size + 'px';
  $('hud').style.width = size + 'px';
}

function draw() {
  layout();
  var g = game || Snake.createGame({ random: function () { return 0.71; } });
  var n = g.size, s = size / n, dpr = window.devicePixelRatio || 1, px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
    c.fillStyle = (x + y) % 2 ? '#191919' : '#1d1d1d';
    c.fillRect(x * s, y * s, s, s);
  }
  if (!g.wrap) { c.strokeStyle = '#3a3a3a'; c.lineWidth = 2; c.strokeRect(1, 1, size - 2, size - 2); }

  function fruit(k, color, r) {
    var fx = (k % n + 0.5) * s, fy = (Math.floor(k / n) + 0.5) * s;
    c.fillStyle = color; c.shadowColor = color; c.shadowBlur = s * 0.6;
    c.beginPath(); c.arc(fx, fy, s * r, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#5cc469'; c.fillRect(fx - s * 0.04, fy - s * r - s * 0.16, s * 0.08, s * 0.16);
  }
  if (g.food >= 0) fruit(g.food, '#e05252', 0.32);
  if (g.bonus >= 0 && (g.bonusLeft > 1.5 || Math.floor(g.bonusLeft * 6) % 2 === 0)) fruit(g.bonus, '#e6c84a', 0.38);

  // The head slides toward its next cell between steps; the rest of the body stays on the grid.
  var len = g.snake.length, head = g.snake[len - 1], d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[g.dir];
  var t = state === 'playing' ? frac : 0;
  for (var i = 0; i < len; i++) {
    var p = g.snake[i], k = i / Math.max(1, len - 1);
    var px2 = p[0], py2 = p[1];
    if (i === len - 1 && !g.over) { px2 += d[0] * t * 0.35; py2 += d[1] * t * 0.35; }
    var light = Math.round(55 + 25 * k);
    c.fillStyle = g.over ? '#666' : 'hsl(' + (130 - 20 * k) + ',55%,' + light / 1.6 + '%)';
    var inset = i === len - 1 ? s * 0.03 : s * 0.07;
    c.beginPath();
    var rx = px2 * s + inset, ry = py2 * s + inset, rw = s - inset * 2, rr = s * 0.28;
    c.moveTo(rx + rr, ry); c.arcTo(rx + rw, ry, rx + rw, ry + rw, rr); c.arcTo(rx + rw, ry + rw, rx, ry + rw, rr);
    c.arcTo(rx, ry + rw, rx, ry, rr); c.arcTo(rx, ry, rx + rw, ry, rr); c.closePath(); c.fill();
  }
  // Eyes look the way the snake is heading.
  var hx = (head[0] + 0.5 + d[0] * t * 0.35) * s, hy = (head[1] + 0.5 + d[1] * t * 0.35) * s;
  c.fillStyle = '#fff';
  [-1, 1].forEach(function (side) {
    var ex = hx + d[0] * s * 0.18 + d[1] * side * s * 0.2, ey = hy + d[1] * s * 0.18 - d[0] * side * s * 0.2;
    c.beginPath(); c.arc(ex, ey, s * 0.11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(ex + d[0] * s * 0.04, ey + d[1] * s * 0.04, s * 0.05, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
  });

  if (flash > 0) { c.fillStyle = 'rgba(255,255,255,' + flash * 0.25 + ')'; c.fillRect(0, 0, size, size); }

  $('score').textContent = game ? game.score.toLocaleString() : 0;
  $('length').textContent = game ? game.snake.length : 3;
  $('best').textContent = Math.max(best, game ? game.score : 0).toLocaleString();
}

requestAnimationFrame(tick);
wrap.focus();
})();
