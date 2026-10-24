/*
 * Minesweeper panel UI: board scaled to the panel, clicks, flags (right-click, Option+click or
 * flag mode), timer and best time per level.
 */
(function () {
'use strict';

var NUM = ['', '#4a8fe0', '#4caf50', '#e05252', '#7a5ad6', '#c0392b', '#2fb3b3', '#ddd', '#999'];

var $ = function (id) { return document.getElementById(id); };
var wrap = $('wrap'), cv = $('board');
var level = Arcade.loadText('aeMinesLevel', 'easy'), game, flagMode = false, cell = 20, pressed = -1;
$('level').value = level;

function bestKey() { return 'aeMinesBest_' + level; }

function newGame() {
  game = Minesweeper.createGame(level);
  pressed = -1;
  update();
}

function update() {
  dirty = true;
  $('left').textContent = game.mines - game.flags;
  $('time').textContent = game.elapsed();
  var b = Arcade.load(bestKey());
  $('best').textContent = b ? b + '초' : '-';
  $('face').textContent = game.state === 'won' ? '😎' : game.state === 'lost' ? '😵' : pressed >= 0 ? '😮' : '🙂';
  $('flagBtn').className = flagMode ? 'on' : '';
}

function finishCheck() {
  if (game.state === 'won') {
    var t = game.elapsed(), b = Arcade.load(bestKey());
    if (!b || t < b) Arcade.save(bestKey(), Math.max(1, t));
  }
}

function cellAt(e) {
  var r = cv.getBoundingClientRect();
  var c = Math.floor((e.clientX - r.left) / cell), row = Math.floor((e.clientY - r.top) / cell);
  return c < 0 || c >= game.cols || row < 0 || row >= game.rows ? -1 : row * game.cols + c;
}

cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
cv.addEventListener('mousedown', function (e) {
  wrap.focus();
  var i = cellAt(e);
  if (i < 0) return;
  if (e.button === 2 || e.altKey || e.ctrlKey || flagMode) { game.toggleFlag(i); update(); return; }
  pressed = i; update();
});
window.addEventListener('mouseup', function (e) {
  if (pressed < 0) return;
  var i = cellAt(e), p = pressed;
  pressed = -1;
  if (i === p) { game.reveal(i); finishCheck(); }
  update();
});

$('face').addEventListener('click', newGame);
$('menuBtn').addEventListener('click', Arcade.menu);
$('flagBtn').addEventListener('click', function () { flagMode = !flagMode; update(); });
$('level').addEventListener('change', function () { level = this.value; Arcade.save('aeMinesLevel', level); newGame(); wrap.focus(); });

document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyN' || e.code === 'Enter') newGame();
  else if (e.code === 'KeyF') { flagMode = !flagMode; update(); }
  else if (e.code === 'KeyM' || e.code === 'Backspace') Arcade.menu();
  else return;
  e.preventDefault();
});

function layout() {
  var W = wrap.clientWidth - 20, H = wrap.clientHeight - 20;
  var extra = $('top').offsetHeight + $('bar').offsetHeight + $('keys').offsetHeight + 3 * 8;
  cell = Math.max(10, Math.floor(Math.min(W / game.cols, (H - extra) / game.rows)));
  cv.style.width = cell * game.cols + 'px';
  cv.style.height = cell * game.rows + 'px';
}

function draw() {
  layout();
  var dpr = window.devicePixelRatio || 1, w = cell * game.cols, h = cell * game.rows;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  var over = game.state === 'lost';
  game.cells.forEach(function (m, i) {
    var x = (i % game.cols) * cell, y = Math.floor(i / game.cols) * cell;
    if (m.open || (over && m.mine)) {
      c.fillStyle = i === game.boom ? '#b33a3a' : '#1b1b1b';
      c.fillRect(x, y, cell, cell);
      c.strokeStyle = '#2a2a2a'; c.lineWidth = 1; c.strokeRect(x + .5, y + .5, cell - 1, cell - 1);
      if (m.mine) {
        c.fillStyle = '#eee';
        c.beginPath(); c.arc(x + cell / 2, y + cell / 2, cell * 0.22, 0, Math.PI * 2); c.fill();
      } else if (m.n) {
        c.fillStyle = NUM[m.n];
        c.font = '700 ' + Math.round(cell * 0.6) + 'px Menlo, Consolas, monospace';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(m.n, x + cell / 2, y + cell / 2 + 1);
      }
    } else {
      c.fillStyle = i === pressed && !m.flag ? '#333' : '#4a4a4a';
      c.fillRect(x, y, cell, cell);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x, y, cell, 2); c.fillRect(x, y, 2, cell);
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x, y + cell - 2, cell, 2); c.fillRect(x + cell - 2, y, 2, cell);
    }
    if (m.flag) {
      var wrong = over && !m.mine;
      c.fillStyle = '#ddd'; c.fillRect(x + cell * 0.36, y + cell * 0.22, Math.max(1, cell * 0.07), cell * 0.56);
      c.fillStyle = wrong ? '#888' : '#e05252';
      c.beginPath(); c.moveTo(x + cell * 0.42, y + cell * 0.22); c.lineTo(x + cell * 0.75, y + cell * 0.36); c.lineTo(x + cell * 0.42, y + cell * 0.5); c.fill();
      if (wrong) { c.strokeStyle = '#e05252'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + cell - 4, y + cell - 4); c.stroke(); }
    }
  });
}

var drawnKey = '', dirty = true;
function tick() {
  if (game.state === 'playing') $('time').textContent = game.elapsed();
  // Redraw only after a click or a resize.
  var key = Arcade.sizeKey(wrap);
  if (dirty || key !== drawnKey) { draw(); drawnKey = key; dirty = false; }
  requestAnimationFrame(tick);
}

newGame();
requestAnimationFrame(tick);
wrap.focus();
})();
