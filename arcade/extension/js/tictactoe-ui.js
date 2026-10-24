/*
 * Tic-tac-toe panel UI: board drawing, clicks and number keys, AI turns, undo and a running tally.
 */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
var wrap = $('wrap'), cv = $('board'), side = $('side');
var game, me = Arcade.loadText('aeTttMark', 'X'), level = Arcade.loadText('aeTttLevel', 'hard');
var thinking = false, hover = -1, size = 0, counted = false;
var tally = { me: Arcade.load('aeTttWins'), ai: Arcade.load('aeTttLosses'), draw: Arcade.load('aeTttDraws') };
// Number keys follow the numeric keypad layout: 7 8 9 on the top row.
var KEYPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

$('color').value = me;
$('level').value = level;

function newGame() {
  game = TicTacToe.createGame();
  thinking = false; counted = false;
  render();
  if (game.turn !== me) aiTurn();
}

function updateStatus() {
  var st = $('status');
  st.className = 'status';
  var r = game.result;
  if (r) {
    if (!counted) {
      counted = true;
      if (r.who === 'draw') { tally.draw++; Arcade.save('aeTttDraws', tally.draw); }
      else if (r.who === me) { tally.me++; Arcade.save('aeTttWins', tally.me); }
      else { tally.ai++; Arcade.save('aeTttLosses', tally.ai); }
    }
    if (r.who === 'draw') st.textContent = '무승부';
    else { st.textContent = r.who === me ? '이겼어요!' : '졌어요'; st.className = 'status ' + (r.who === me ? 'win' : 'lose'); }
  } else if (thinking) { st.textContent = 'AI 차례…'; st.className = 'status think'; }
  else st.textContent = '내 차례 (' + me + ')';
  $('tally').textContent = '나 ' + tally.me + ' · AI ' + tally.ai + ' · 무승부 ' + tally.draw;
  $('undoBtn').disabled = thinking || !!game.result || game.history.length < (me === 'X' ? 1 : 2);
}

function aiTurn() {
  thinking = true;
  updateStatus();
  var g = game;
  setTimeout(function () {
    if (g !== game) return;
    thinking = false;
    game.play(game.think(level));
    render();
  }, 350);
}

function playAt(i) {
  if (thinking || game.result || game.turn !== me || !game.play(i)) return;
  render();
  if (!game.result) aiTurn();
}

function cellAt(e) {
  var r = cv.getBoundingClientRect(), s = size / 3;
  var c = Math.floor((e.clientX - r.left) / s), row = Math.floor((e.clientY - r.top) / s);
  return c < 0 || c > 2 || row < 0 || row > 2 ? -1 : row * 3 + c;
}

cv.addEventListener('mousedown', function (e) { wrap.focus(); var i = cellAt(e); if (i >= 0) playAt(i); });
cv.addEventListener('mousemove', function (e) { var h = cellAt(e); if (h !== hover) { hover = h; draw(); } });
cv.addEventListener('mouseleave', function () { hover = -1; draw(); });

function undo() {
  if (thinking || game.result) return;
  game.undo();
  if (game.turn !== me) game.undo();
  render();
}

$('newBtn').addEventListener('click', newGame);
$('undoBtn').addEventListener('click', undo);
$('menuBtn').addEventListener('click', Arcade.menu);
$('color').addEventListener('change', function () { me = this.value; Arcade.save('aeTttMark', me); newGame(); });
$('level').addEventListener('change', function () { level = this.value; Arcade.save('aeTttLevel', level); });

document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'SELECT') return;
  var d = /^(Digit|Numpad)([1-9])$/.exec(e.code);
  if (d) playAt(KEYPAD[d[2]]);
  else if (e.code === 'KeyN' || (e.code === 'Enter' && game.result)) newGame();
  else if (e.code === 'KeyU') undo();
  else if (e.code === 'KeyM' || e.code === 'Backspace') Arcade.menu();
  else return;
  e.preventDefault();
});

window.addEventListener('resize', draw);

function render() { updateStatus(); draw(); }

function mark(c, who, cx, cy, r, alpha) {
  c.globalAlpha = alpha;
  c.lineCap = 'round';
  c.lineWidth = Math.max(4, r * 0.28);
  if (who === 'X') {
    c.strokeStyle = '#3fc6d9';
    c.beginPath(); c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r); c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r); c.stroke();
  } else {
    c.strokeStyle = '#e8933a';
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  }
  c.globalAlpha = 1;
}

function draw() {
  size = Arcade.fitSquare(wrap, cv, side);
  var dpr = window.devicePixelRatio || 1, s = size / 3;
  var px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#1b1b1b'; c.fillRect(0, 0, size, size);
  c.strokeStyle = '#444'; c.lineWidth = Math.max(2, size * 0.012); c.lineCap = 'round';
  for (var i = 1; i < 3; i++) {
    c.beginPath(); c.moveTo(i * s, s * 0.12); c.lineTo(i * s, size - s * 0.12); c.stroke();
    c.beginPath(); c.moveTo(s * 0.12, i * s); c.lineTo(size - s * 0.12, i * s); c.stroke();
  }
  game.board.forEach(function (v, idx) {
    if (v) mark(c, v, (idx % 3 + 0.5) * s, (Math.floor(idx / 3) + 0.5) * s, s * 0.28, 1);
  });
  if (hover >= 0 && !game.board[hover] && !game.result && !thinking && game.turn === me) {
    mark(c, me, (hover % 3 + 0.5) * s, (Math.floor(hover / 3) + 0.5) * s, s * 0.28, 0.25);
  }
  if (game.result && game.result.line) {
    var l = game.result.line, a = l[0], b = l[2];
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = Math.max(4, s * 0.07); c.lineCap = 'round';
    c.beginPath(); c.moveTo((a % 3 + 0.5) * s, (Math.floor(a / 3) + 0.5) * s); c.lineTo((b % 3 + 0.5) * s, (Math.floor(b / 3) + 0.5) * s); c.stroke();
  }
}

newGame();
wrap.focus();
})();
