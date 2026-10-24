/*
 * Chess panel UI: board drawing, click-to-move with legal-move hints, promotion picker,
 * AI turns, undo and move list.
 */
(function () {
'use strict';

var GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
var LEVELS = {
  easy: { depth: 1, timeMs: 400, random: 0.9 },
  normal: { depth: 3, timeMs: 1000, random: 0.08 },
  hard: { depth: 5, timeMs: 2000, random: 0 }
};
var REASON = { checkmate: '체크메이트', stalemate: '스테일메이트', material: '기물 부족', fifty: '50수 규칙', repetition: '3회 반복' };

var $ = function (id) { return document.getElementById(id); };
var wrap = $('wrap'), cv = $('board'), side = $('side'), promo = $('promo');
var game, me = Arcade.loadText('aeChessColor', 'w'), level = Arcade.loadText('aeChessLevel', 'normal');
var selected = -1, targets = [], thinking = false, size = 0, pendingPromo = null;

$('color').value = me;
$('level').value = level;

function newGame() {
  pending = null;
  game = Chess.createGame();
  selected = -1; targets = []; thinking = false; pendingPromo = null;
  promo.className = 'hidden';
  render();
  if (game.pos.turn !== me) aiTurn();
}

function sideName(c) { return c === 'w' ? '백' : '흑'; }

function updateStatus() {
  var st = $('status');
  st.className = 'status';
  if (game.result) {
    if (game.result === 'draw') st.textContent = '무승부 · ' + REASON[game.reason];
    else {
      var won = game.result === me;
      st.textContent = (won ? '이겼어요! ' : '졌어요 · ') + REASON[game.reason];
      st.className = 'status ' + (won ? 'win' : 'lose');
    }
  } else if (thinking) {
    st.textContent = 'AI가 생각 중…'; st.className = 'status think';
  } else {
    st.textContent = (game.pos.turn === me ? '내 차례' : 'AI 차례') + ' (' + sideName(game.pos.turn) + ')' + (game.inCheck() ? ' · 체크!' : '');
  }
  $('undoBtn').disabled = thinking || game.history.length < (me === 'w' ? 1 : 2);
}

function renderMoves() {
  var html = '';
  for (var i = 0; i < game.history.length; i += 2) {
    html += '<div><span class="n">' + (i / 2 + 1) + '.</span><span class="m">' + game.history[i].san + '</span>' +
      (game.history[i + 1] ? '<span class="m">' + game.history[i + 1].san + '</span>' : '') + '</div>';
  }
  var box = $('moves');
  box.innerHTML = html;
  box.scrollTop = box.scrollHeight;
}

// The AI thinks in a worker so the panel keeps responding. If workers aren't available
// (some CEP setups refuse them for local files) it falls back to thinking on the page.
var worker = null, jobId = 0, pending = null;
try {
  worker = new Worker('js/chess-worker.js');
  worker.onmessage = function (e) { if (pending && e.data.id === pending.id) finishAi(pending.game, e.data.move); };
  worker.onerror = function (e) {
    e.preventDefault();
    worker = null;
    if (pending) { var p = pending; pending = null; thinkHere(p.game); }
  };
} catch (e) { worker = null; }

function finishAi(g, m) {
  pending = null;
  if (g !== game) return;   // a new game started meanwhile
  thinking = false;
  if (m) game.play(game.moves(m.from).filter(function (x) { return x.to === m.to && x.promo === m.promo; })[0] || m);
  render();
}

function thinkHere(g) {
  // Let the panel paint "thinking" before the search blocks the page.
  setTimeout(function () { if (g === game) finishAi(g, game.think(LEVELS[level])); }, 60);
}

function aiTurn() {
  thinking = true;
  updateStatus();
  if (worker) {
    pending = { id: ++jobId, game: game };
    worker.postMessage({ id: jobId, pos: game.pos, opts: LEVELS[level] });
  } else {
    thinkHere(game);
  }
}

function playMove(m) {
  game.play(m);
  selected = -1; targets = [];
  render();
  if (!game.result) aiTurn();
}

function squareAt(e) {
  var r = cv.getBoundingClientRect(), cell = size / 8;
  var col = Math.floor((e.clientX - r.left) / cell), row = Math.floor((e.clientY - r.top) / cell);
  if (col < 0 || col > 7 || row < 0 || row > 7) return -1;
  return me === 'w' ? row * 8 + col : (7 - row) * 8 + (7 - col);
}

cv.addEventListener('mousedown', function (e) {
  wrap.focus();
  if (thinking || game.result || game.pos.turn !== me || pendingPromo) return;
  var sq = squareAt(e);
  if (sq < 0) return;
  var hit = targets.filter(function (m) { return m.to === sq; });
  if (hit.length) {
    if (hit.length > 1) { askPromotion(hit); return; }
    playMove(hit[0]);
    return;
  }
  var p = game.pos.board[sq];
  if (p && (Chess.isWhite(p) ? 'w' : 'b') === me && sq !== selected) {
    selected = sq; targets = game.moves(sq);
  } else {
    selected = -1; targets = [];
  }
  draw();
});

function askPromotion(moves) {
  pendingPromo = moves;
  promo.innerHTML = '';
  ['q', 'r', 'b', 'n'].forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = GLYPH[t];
    b.addEventListener('click', function () {
      promo.className = 'hidden';
      pendingPromo = null;
      playMove(moves.filter(function (m) { return m.promo === t; })[0]);
    });
    promo.appendChild(b);
  });
  promo.className = '';
}

function undo() {
  if (thinking) return;
  // Take back the AI's reply and my move, so it is my turn again.
  game.undo();
  if (game.pos.turn !== me) game.undo();
  selected = -1; targets = [];
  render();
  if (game.pos.turn !== me) aiTurn();
}

$('newBtn').addEventListener('click', newGame);
$('undoBtn').addEventListener('click', undo);
$('menuBtn').addEventListener('click', Arcade.menu);
$('color').addEventListener('change', function () { me = this.value; Arcade.save('aeChessColor', me); newGame(); });
$('level').addEventListener('change', function () { level = this.value; Arcade.save('aeChessLevel', level); });

document.addEventListener('keydown', function (e) {
  if (e.target.tagName === 'SELECT') return;
  if (e.code === 'KeyN') newGame();
  else if (e.code === 'KeyU') undo();
  else if (e.code === 'KeyM' || e.code === 'Backspace') Arcade.menu();
  else if (e.code === 'Escape') { selected = -1; targets = []; draw(); }
  else return;
  e.preventDefault();
});

window.addEventListener('resize', draw);

function render() { updateStatus(); renderMoves(); draw(); }

function draw() {
  size = Arcade.fitSquare(wrap, cv, side);
  var dpr = window.devicePixelRatio || 1, cell = size / 8;
  var px = Math.round(size * dpr);
  if (cv.width !== px || cv.height !== px) { cv.width = cv.height = px; }
  var c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  var last = game.history.length ? game.history[game.history.length - 1].move : null;
  var checkSq = game.inCheck() ? game.pos.board.indexOf(game.pos.turn === 'w' ? 'K' : 'k') : -1;

  for (var sq = 0; sq < 64; sq++) {
    var r = sq >> 3, f = sq & 7;
    var x = (me === 'w' ? f : 7 - f) * cell, y = (me === 'w' ? r : 7 - r) * cell;
    c.fillStyle = (r + f) % 2 ? '#7a8c9e' : '#d6dde4';
    c.fillRect(x, y, cell, cell);
    if (last && (sq === last.from || sq === last.to)) { c.fillStyle = 'rgba(232,200,74,.45)'; c.fillRect(x, y, cell, cell); }
    if (sq === selected) { c.fillStyle = 'rgba(45,140,235,.5)'; c.fillRect(x, y, cell, cell); }
    if (sq === checkSq) {
      var g = c.createRadialGradient(x + cell / 2, y + cell / 2, cell * 0.1, x + cell / 2, y + cell / 2, cell * 0.7);
      g.addColorStop(0, 'rgba(224,60,60,.95)'); g.addColorStop(1, 'rgba(224,60,60,0)');
      c.fillStyle = g; c.fillRect(x, y, cell, cell);
    }
    // File and rank labels on the edge squares.
    c.fillStyle = (r + f) % 2 ? '#d6dde4' : '#7a8c9e';
    c.font = '600 ' + Math.max(8, Math.round(cell * 0.16)) + 'px -apple-system, "Segoe UI", sans-serif';
    if ((me === 'w' ? r === 7 : r === 0)) { c.textAlign = 'right'; c.textBaseline = 'bottom'; c.fillText('abcdefgh'[f], x + cell - 3, y + cell - 2); }
    if ((me === 'w' ? f === 0 : f === 7)) { c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(8 - r, x + 3, y + 2); }

    var p = game.pos.board[sq];
    if (p) {
      var white = Chess.isWhite(p);
      c.font = Math.round(cell * 0.82) + 'px "Apple Symbols", "Segoe UI Symbol", "DejaVu Sans", serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = Math.max(1, cell * 0.04);
      c.strokeStyle = white ? '#222' : '#000';
      c.fillStyle = white ? '#fafafa' : '#1d1d1d';
      c.strokeText(GLYPH[p.toLowerCase()], x + cell / 2, y + cell * 0.54);
      c.fillText(GLYPH[p.toLowerCase()], x + cell / 2, y + cell * 0.54);
    }
  }

  targets.forEach(function (m) {
    var r = m.to >> 3, f = m.to & 7;
    var x = (me === 'w' ? f : 7 - f) * cell + cell / 2, y = (me === 'w' ? r : 7 - r) * cell + cell / 2;
    c.beginPath();
    if (m.captured) { c.lineWidth = cell * 0.08; c.strokeStyle = 'rgba(20,20,20,.45)'; c.arc(x, y, cell * 0.44, 0, Math.PI * 2); c.stroke(); }
    else { c.fillStyle = 'rgba(20,20,20,.3)'; c.arc(x, y, cell * 0.14, 0, Math.PI * 2); c.fill(); }
  });
}

newGame();
wrap.focus();
})();
