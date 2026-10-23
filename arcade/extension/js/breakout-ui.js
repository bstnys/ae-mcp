/*
 * Breakout panel UI: canvas rendering scaled to the panel, mouse and keyboard
 * paddle control, particles, pause on focus loss and best score.
 */
(function () {
'use strict';

var ROW_COLORS = ['#e05252', '#e8933a', '#e6c84a', '#5cc469', '#3fc6d9', '#4a6fe0', '#a35ad6', '#d65aa3'];
var POWER_STYLE = {
  wide: { color: '#3fc6d9', label: 'W' },
  multi: { color: '#a35ad6', label: 'M' },
  slow: { color: '#5cc469', label: 'S' },
  life: { color: '#e05252', label: '♥' }
};
var POWER_NAMES = { wide: '넓은 패들', multi: '멀티 볼', slow: '슬로우', life: '목숨 +1' };

var $ = function (id) { return document.getElementById(id); };
var cv = $('field'), wrap = $('wrap'), overlay = $('overlay');
var game = null, state = 'idle';   // idle | playing | paused | over
var keys = { left: false, right: false }, pointerX = null;
var particles = [], popup = null, shake = 0, last = 0;
var best = Arcade.load('aeBreakoutBest');
var scale = 1;

function keyAction(e) {
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Space': case 'ArrowUp': case 'KeyW': return 'launch';
    case 'KeyP': case 'Escape': return 'pause';
    case 'KeyR': return 'restart';
    case 'KeyM': case 'Backspace': return 'menu';
    case 'Enter': case 'NumpadEnter': return 'start';
  }
  return null;
}

document.addEventListener('keydown', function (e) {
  var a = keyAction(e);
  if (!a) return;
  e.preventDefault();
  if (a === 'start') { if (state !== 'playing') state === 'paused' ? resume() : start(); else game.launch(); return; }
  if (a === 'restart') { start(); return; }
  if (a === 'menu') { if (state !== 'playing') Arcade.menu(); return; }
  if (a === 'pause') { state === 'playing' ? pause() : state === 'paused' && resume(); return; }
  if (state !== 'playing') { if (a === 'launch' && !e.repeat) state === 'paused' ? resume() : start(); return; }
  if (a === 'left' || a === 'right') { keys[a] = true; pointerX = null; }
  else if (a === 'launch') game.launch();
});

document.addEventListener('keyup', function (e) {
  var a = keyAction(e);
  if (a === 'left' || a === 'right') keys[a] = false;
});

cv.addEventListener('mousemove', function (e) {
  var r = cv.getBoundingClientRect();
  pointerX = (e.clientX - r.left) / scale;
});
cv.addEventListener('mousedown', function () { wrap.focus(); if (state === 'playing') game.launch(); });
wrap.addEventListener('mousedown', function () { wrap.focus(); });

window.addEventListener('blur', function () {
  keys = { left: false, right: false };
  if (state === 'playing') pause('패널 밖을 클릭해서 일시정지됐어요');
});
$('menuBtn').addEventListener('click', Arcade.menu);
$('startBtn').addEventListener('click', function () { wrap.focus(); state === 'paused' ? resume() : start(); });

function start() {
  game = Breakout.createGame();
  state = 'playing';
  particles = []; popup = { text: 'STAGE 1', t: 0 };
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
  if (isBest) { best = game.score; Arcade.save('aeBreakoutBest', best); }
  showOverlay('GAME OVER', '점수 ' + game.score.toLocaleString() + (isBest ? '  🏆 최고 기록!' : '') +
    '<br>Enter 또는 R로 다시 시작', '다시 시작');
}

function burst(x, y, color, n) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
    particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.35 + Math.random() * 0.3, color: color });
  }
}

function handleEvents() {
  game.events.forEach(function (ev) {
    if (ev.type === 'brick') burst(ev.x, ev.y, ROW_COLORS[ev.row % ROW_COLORS.length], 14);
    else if (ev.type === 'hit') burst(ev.x, ev.y, '#ddd', 5);
    else if (ev.type === 'lost') { shake = 0.25; if (!game.over) popup = { text: '목숨 -1', t: 0 }; }
    else if (ev.type === 'level') popup = { text: 'STAGE ' + (game.level + 1), t: 0 };
    else if (ev.type === 'power') popup = { text: POWER_NAMES[ev.kind], t: 0 };
  });
  game.events.length = 0;
}

function tick(now) {
  var dt = Math.min((now - (last || now)) / 1000, 0.05);
  last = now;
  if (state === 'playing') {
    game.update(dt, { left: keys.left, right: keys.right, pointerX: pointerX === null ? undefined : pointerX });
    handleEvents();
    if (game.over) endGame();
  }
  particles = particles.filter(function (p) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt;
    return p.t < p.life;
  });
  if (popup) { popup.t += dt; if (popup.t > 1.3) popup = null; }
  if (shake > 0) shake = Math.max(0, shake - dt);
  draw();
  requestAnimationFrame(tick);
}

// --- drawing ---------------------------------------------------------------

var laidOut = { w: 0, h: 0 };

function layout() {
  // The field keeps its 3:4 shape; the HUD and key help scale with it and leave the field the rest.
  var W = wrap.clientWidth - 20, H = wrap.clientHeight - 20;
  if (W === laidOut.w && H === laidOut.h) return;
  var fw = Breakout.WIDTH, fh = Breakout.HEIGHT;
  var s = Math.min(W / fw, H / fh);
  for (var i = 0; i < 12; i++) {
    var u = Math.min(2, Math.max(0.6, s * fw / 400));
    document.documentElement.style.setProperty('--u', u.toFixed(3));
    $('hud').style.width = Math.floor(fw * s) + 'px';
    var extra = $('hud').offsetHeight + $('keys').offsetHeight + 2 * 8 * u + 2;
    var s2 = Math.min(W / fw, (H - extra) / fh);
    if (Math.abs(s2 - s) < 0.002) { s = s2; break; }
    s = s2;
  }
  scale = Math.max(0.2, s);
  cv.style.width = Math.floor(fw * scale) + 2 + 'px';
  cv.style.height = Math.floor(fh * scale) + 2 + 'px';
  $('hud').style.width = Math.floor(fw * scale) + 2 + 'px';
  laidOut = { w: W, h: H };
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function draw() {
  layout();
  var dpr = window.devicePixelRatio || 1;
  var fw = Breakout.WIDTH, fh = Breakout.HEIGHT;
  var pw = Math.round(fw * scale * dpr), ph = Math.round(fh * scale * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  var c = cv.getContext('2d');
  c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  c.clearRect(0, 0, fw, fh);
  if (shake > 0) c.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);

  var g = game || Breakout.createGame({ random: function () { return 0.5; } });
  var dim = state === 'over' ? 0.45 : 1;

  g.bricks.forEach(function (b) {
    var color = ROW_COLORS[b.row % ROW_COLORS.length];
    c.globalAlpha = dim * (b.armored ? 1 : 0.45 + 0.55 * b.hits / b.maxHits);
    c.fillStyle = b.armored ? '#8a8f99' : color;
    roundRect(c, b.x, b.y, b.w, b.h, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,.2)';
    c.fillRect(b.x + 2, b.y + 2, b.w - 4, 3);
    if (b.hits > 1) {
      c.fillStyle = 'rgba(0,0,0,.45)';
      c.font = '700 11px Menlo, Consolas, monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(b.hits, b.x + b.w / 2, b.y + b.h / 2 + 1);
    }
  });
  c.globalAlpha = 1;

  g.drops.forEach(function (d) {
    var st = POWER_STYLE[d.kind];
    c.fillStyle = st.color;
    roundRect(c, d.x - 14, d.y - 8, 28, 16, 8); c.fill();
    c.fillStyle = '#111'; c.font = '700 11px -apple-system, "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(st.label, d.x, d.y + 1);
  });

  var p = g.paddle;
  c.globalAlpha = dim;
  var grad = c.createLinearGradient(0, g.paddleY, 0, g.paddleY + g.paddleH);
  grad.addColorStop(0, g.timers.wide > 0 ? '#7fe3f0' : '#e6e6e6');
  grad.addColorStop(1, g.timers.wide > 0 ? '#2a9fb0' : '#9a9a9a');
  c.fillStyle = grad;
  roundRect(c, p.x - p.w / 2, g.paddleY, p.w, g.paddleH, 6); c.fill();

  g.balls.forEach(function (b) {
    c.fillStyle = g.timers.slow > 0 ? '#9ff0a8' : '#fff';
    c.shadowColor = 'rgba(255,255,255,.6)'; c.shadowBlur = 8;
    c.beginPath(); c.arc(b.x, b.y, g.ballR, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0;
  });
  c.globalAlpha = 1;

  particles.forEach(function (q) {
    c.globalAlpha = 1 - q.t / q.life;
    c.fillStyle = q.color;
    c.fillRect(q.x - 2, q.y - 2, 4, 4);
  });
  c.globalAlpha = 1;

  if (game && state === 'playing' && game.waiting()) {
    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '500 14px -apple-system, "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Space 또는 클릭으로 발사', fw / 2, fh * 0.72);
  }
  if (popup) {
    var a = popup.t < 1 ? 1 : 1 - (popup.t - 1) / 0.3;
    c.globalAlpha = Math.max(0, a);
    c.font = '700 26px -apple-system, "Segoe UI", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#fff'; c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 6;
    c.fillText(popup.text, fw / 2, fh * 0.6 - popup.t * 14);
    c.shadowBlur = 0; c.globalAlpha = 1;
  }

  $('score').textContent = game ? game.score.toLocaleString() : 0;
  $('stage').textContent = game ? game.level + 1 : 1;
  $('lives').textContent = game ? (game.lives > 5 ? '♥×' + game.lives : new Array(game.lives + 1).join('♥')) : '♥♥♥';
  $('best').textContent = Math.max(best, game ? game.score : 0).toLocaleString();
}

requestAnimationFrame(tick);
wrap.focus();
})();
