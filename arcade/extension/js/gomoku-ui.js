/*
 * Gomoku panel UI: wooden board, stone placement with a hover preview, AI turns,
 * undo and the winning line.
 */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
var wrap = $('wrap'), cv = $('board'), side = $('side');
var N = Gomoku.SIZE;
var game, me = +Arcade.loadText('aeGomokuColor', '1'), level = Arcade.loadText('aeGomokuLevel', 'normal');
var thinking = false, hover = -1, size = 0;

$('color').value = String(me);
$('level').value = level;

function newGame() {
  game = Gomoku.createGame();
  thinking = false; hover = -1;
  render();
  if (game.turn !== me) aiTurn();
}

function name(who) { return who === 1 ? '흑' : '백'; }

function updateStatus() {
  var st = $('status');
  st.className = 'status';
  if (game.winner === 3) st.textContent = '무승부 · 판이 가득 찼어요';
  else if (game.winner) {
    var won = game.winner === me;
    st.textContent = won ? '이겼어요! 다섯 개 완성' : '졌어요 · AI가 다섯 개 완성';
    st.className = 'status ' + (won ? 'win' : 'lose');
  } else if (thinking) { st.textContent = 'AI가 생각 중…'; st.className = 'status think'; }
  else st.textContent = (game.turn === me ? '내 차례' : 'AI 차례') + ' (' + name(game.turn) + ') · ' + game.history.length + '수';
  $('undoBtn').disabled = thinking || game.history.length < (me === 1 ? 1 : 2);
}

function aiTurn() {
  thinking = true;
  updateStatus();
  var g = game;
  setTimeout(function () {
    if (g !== game) return;   // a new game started meanwhile
    var idx = game.think(level);
    thinking = false;
    if (idx >= 0) game.play(idx);
    render();
  }, 120);
}

function cellAt(e) {
  var r = cv.getBoundingClientRect(), step = size / N;
  var col = Math.floor((e.clientX - r.left) / step), row = Math.floor((e.clientY - r.top) / step);
  return col < 0 || col >= N || row < 0 || row >= N ? -1 : row * N + col;
}

cv.addEventListener('mousemove', function (e) {
  var h = cellAt(e);
  if (h !== hover) { hover = h; draw(); }
});
cv.addEventListener('mouseleave', function () { hover = -1; draw(); });
cv.addEventListener('mousedown', function (e) {
  wrap.focus();
  if (thinking || game.winner || game.turn !== me) return;
  var idx = cellAt(e);
  if (idx < 0 || !game.play(idx)) return;
  render();
  if (!game.winner) aiTurn();
});

function undo() {
  if (thinking) return;
  game.undo();
  if (game.turn !== me) game.undo();
  render();
  if (game.turn !== me) aiTurn();
}

$('newBtn').addEventListener('click', newGame);
$('undoBtn').addEventListener('click', undo);
$('menuBtn').addEventListener('click', Arcade.menu);
$('color').addEventListener('change', function () { me = +this.value; Arcade.save('aeGomokuColor', me); newGame(); });
$('level').addEventListener('change', function () { level = this.value; Arcade.save('aeGomokuLevel', level); });

document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyN') newGame();
  else if (e.code === 'KeyU') undo();
  else if (e.code === 'KeyM' || e.code === 'Backspace') Arcade.menu();
  else return;
  e.preventDefault();
});

window.addEventListener('resize', draw);

function render() { updateStatus(); draw(); }

function stone(c, x, y, rad, who, alpha) {
  c.globalAlpha = alpha;
  var g = c.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
  if (who === 1) { g.addColorStop(0, '#666'); g.addColorStop(1, '#0b0b0b'); }
  else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#c9c9c9'); }
  c.fillStyle = g;
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = rad * 0.3; c.shadowOffsetY = rad * 0.12;
  c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0; c.shadowOffsetY = 0; c.globalAlpha = 1;
}

function draw() {
  size = Arcade.fitSquare(wrap, cv, side);
  var dpr = window.devicePixelRatio || 1, step = size / N, half = step / 2;
  var px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  var wood = c.createLinearGradient(0, 0, size, size);
  wood.addColorStop(0, '#dcb36c'); wood.addColorStop(1, '#c89a52');
  c.fillStyle = wood; c.fillRect(0, 0, size, size);

  c.strokeStyle = 'rgba(60,40,15,.75)'; c.lineWidth = 1;
  for (var i = 0; i < N; i++) {
    var p = Math.round(half + i * step) + 0.5;
    c.beginPath(); c.moveTo(half, p); c.lineTo(size - half, p); c.stroke();
    c.beginPath(); c.moveTo(p, half); c.lineTo(p, size - half); c.stroke();
  }
  c.fillStyle = 'rgba(60,40,15,.9)';
  [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(function (s) {
    c.beginPath(); c.arc(half + s[1] * step, half + s[0] * step, Math.max(2, step * 0.09), 0, Math.PI * 2); c.fill();
  });

  var rad = step * 0.45;
  game.board.forEach(function (v, idx) {
    if (v) stone(c, half + (idx % N) * step, half + Math.floor(idx / N) * step, rad, v, 1);
  });

  if (hover >= 0 && !game.board[hover] && !game.winner && !thinking && game.turn === me) {
    stone(c, half + (hover % N) * step, half + Math.floor(hover / N) * step, rad, me, 0.45);
  }

  var last = game.history[game.history.length - 1];
  if (last !== undefined) {
    c.fillStyle = game.board[last] === 1 ? '#ff6b6b' : '#e03c3c';
    c.beginPath(); c.arc(half + (last % N) * step, half + Math.floor(last / N) * step, rad * 0.25, 0, Math.PI * 2); c.fill();
  }

  if (game.winLine) {
    var pts = game.winLine.map(function (idx) { return [half + (idx % N) * step, half + Math.floor(idx / N) * step]; });
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    c.strokeStyle = 'rgba(232,60,60,.85)'; c.lineWidth = Math.max(3, step * 0.14); c.lineCap = 'round';
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); c.stroke();
  }
}

newGame();
wrap.focus();
})();
