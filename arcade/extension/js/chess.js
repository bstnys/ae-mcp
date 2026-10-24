/*
 * Chess rules and a small alpha-beta AI. Board is 64 squares, a8 = 0 ... h1 = 63;
 * white pieces are 'PNBRQK', black 'pnbrqk', empty null. No DOM, so it runs under Node for tests.
 */
(function (root) {
'use strict';

var VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Piece-square tables from white's point of view, a8 first (simplified evaluation function).
var PST = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  kEnd: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50]
};

var KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
var KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function isWhite(p) { return p !== null && p === p.toUpperCase(); }
function colorOf(p) { return p === null ? null : (isWhite(p) ? 'w' : 'b'); }
function rc(sq) { return [sq >> 3, sq & 7]; }
function sqName(sq) { return 'abcdefgh'[sq & 7] + (8 - (sq >> 3)); }
function parseSq(s) { return (8 - +s[1]) * 8 + 'abcdefgh'.indexOf(s[0]); }

function createPosition(fen) {
  fen = fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  var parts = fen.split(' '), board = [];
  parts[0].split('/').forEach(function (row) {
    row.split('').forEach(function (ch) {
      if (/\d/.test(ch)) for (var i = 0; i < +ch; i++) board.push(null);
      else board.push(ch);
    });
  });
  return {
    board: board, turn: parts[1] || 'w', castle: parts[2] === '-' ? '' : (parts[2] || ''),
    ep: parts[3] && parts[3] !== '-' ? parseSq(parts[3]) : -1,
    half: +(parts[4] || 0), full: +(parts[5] || 1)
  };
}

function attacked(pos, sq, by) {
  var b = pos.board, r = sq >> 3, c = sq & 7, i, nr, nc, p;
  var pawnDir = by === 'w' ? 1 : -1;   // a white pawn attacks from the row below (higher index)
  for (i = -1; i <= 1; i += 2) {
    nr = r + pawnDir; nc = c + i;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { p = b[nr * 8 + nc]; if (p === (by === 'w' ? 'P' : 'p')) return true; }
  }
  for (i = 0; i < 8; i++) {
    nr = r + KNIGHT[i][0]; nc = c + KNIGHT[i][1];
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { p = b[nr * 8 + nc]; if (p === (by === 'w' ? 'N' : 'n')) return true; }
    nr = r + KING[i][0]; nc = c + KING[i][1];
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) { p = b[nr * 8 + nc]; if (p === (by === 'w' ? 'K' : 'k')) return true; }
  }
  function ray(dirs, a, q) {
    for (var d = 0; d < 4; d++) {
      var rr = r + dirs[d][0], cc = c + dirs[d][1];
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        var x = b[rr * 8 + cc];
        if (x !== null) { if (x === a || x === q) return true; break; }
        rr += dirs[d][0]; cc += dirs[d][1];
      }
    }
    return false;
  }
  return by === 'w' ? (ray(DIAG, 'B', 'Q') || ray(ORTHO, 'R', 'Q')) : (ray(DIAG, 'b', 'q') || ray(ORTHO, 'r', 'q'));
}

function kingSq(pos, color) { return pos.board.indexOf(color === 'w' ? 'K' : 'k'); }
function inCheck(pos, color) { return attacked(pos, kingSq(pos, color), color === 'w' ? 'b' : 'w'); }

function pseudoMoves(pos, capturesOnly) {
  var moves = [], b = pos.board, me = pos.turn, them = me === 'w' ? 'b' : 'w';
  function add(from, to, extra) {
    var m = { from: from, to: to, piece: b[from], captured: b[to] };
    if (extra) for (var k in extra) m[k] = extra[k];
    if (!capturesOnly || m.captured || m.ep || m.promo) moves.push(m);
  }
  for (var sq = 0; sq < 64; sq++) {
    var p = b[sq];
    if (p === null || colorOf(p) !== me) continue;
    var t = p.toLowerCase(), r = sq >> 3, c = sq & 7, i, nr, nc, to;
    if (t === 'p') {
      var dir = me === 'w' ? -1 : 1, start = me === 'w' ? 6 : 1, last = me === 'w' ? 0 : 7;
      nr = r + dir;
      if (nr >= 0 && nr < 8) {
        to = nr * 8 + c;
        if (b[to] === null) {
          if (nr === last) ['q', 'r', 'b', 'n'].forEach(function (pr) { add(sq, to, { promo: pr }); });
          else {
            add(sq, to);
            var to2 = (r + 2 * dir) * 8 + c;
            if (r === start && b[to2] === null) add(sq, to2, { double: true });
          }
        }
        for (i = -1; i <= 1; i += 2) {
          nc = c + i;
          if (nc < 0 || nc > 7) continue;
          to = nr * 8 + nc;
          if (b[to] !== null && colorOf(b[to]) === them) {
            if (nr === last) ['q', 'r', 'b', 'n'].forEach(function (pr) { add(sq, to, { promo: pr }); });
            else add(sq, to);
          } else if (to === pos.ep) {
            add(sq, to, { ep: true, captured: me === 'w' ? 'p' : 'P' });
          }
        }
      }
    } else if (t === 'n' || t === 'k') {
      var steps = t === 'n' ? KNIGHT : KING;
      for (i = 0; i < 8; i++) {
        nr = r + steps[i][0]; nc = c + steps[i][1];
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        to = nr * 8 + nc;
        if (b[to] === null || colorOf(b[to]) === them) add(sq, to);
      }
      if (t === 'k' && !capturesOnly) {
        var home = me === 'w' ? 60 : 4, K = me === 'w' ? 'K' : 'k', Q = me === 'w' ? 'Q' : 'q';
        if (sq === home && !attacked(pos, home, them)) {
          if (pos.castle.indexOf(K) >= 0 && b[home + 1] === null && b[home + 2] === null &&
              !attacked(pos, home + 1, them) && !attacked(pos, home + 2, them)) add(sq, home + 2, { castle: 'k' });
          if (pos.castle.indexOf(Q) >= 0 && b[home - 1] === null && b[home - 2] === null && b[home - 3] === null &&
              !attacked(pos, home - 1, them) && !attacked(pos, home - 2, them)) add(sq, home - 2, { castle: 'q' });
        }
      }
    } else {
      var dirs = t === 'b' ? DIAG : t === 'r' ? ORTHO : DIAG.concat(ORTHO);
      for (i = 0; i < dirs.length; i++) {
        nr = r + dirs[i][0]; nc = c + dirs[i][1];
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          to = nr * 8 + nc;
          if (b[to] === null) add(sq, to);
          else { if (colorOf(b[to]) === them) add(sq, to); break; }
          nr += dirs[i][0]; nc += dirs[i][1];
        }
      }
    }
  }
  return moves;
}

/** Plays a move in place and returns what's needed to take it back. */
function makeMove(pos, m) {
  var b = pos.board, undo = { castle: pos.castle, ep: pos.ep, half: pos.half, full: pos.full };
  b[m.to] = m.promo ? (pos.turn === 'w' ? m.promo.toUpperCase() : m.promo) : m.piece;
  b[m.from] = null;
  if (m.ep) b[m.to + (pos.turn === 'w' ? 8 : -8)] = null;
  if (m.castle) {
    var rFrom = m.castle === 'k' ? m.to + 1 : m.to - 2, rTo = m.castle === 'k' ? m.to - 1 : m.to + 1;
    b[rTo] = b[rFrom]; b[rFrom] = null;
  }
  // Castling rights go when a king or rook moves or a rook is captured on its home square.
  var lose = { 60: 'KQ', 4: 'kq', 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };
  [m.from, m.to].forEach(function (s) {
    if (lose[s]) lose[s].split('').forEach(function (ch) { pos.castle = pos.castle.replace(ch, ''); });
  });
  pos.ep = m.double ? (m.from + m.to) / 2 : -1;
  pos.half = (m.piece.toLowerCase() === 'p' || m.captured) ? 0 : pos.half + 1;
  if (pos.turn === 'b') pos.full++;
  pos.turn = pos.turn === 'w' ? 'b' : 'w';
  return undo;
}

function unmakeMove(pos, m, undo) {
  var b = pos.board;
  pos.turn = pos.turn === 'w' ? 'b' : 'w';
  b[m.from] = m.piece;
  b[m.to] = m.ep ? null : (m.captured || null);
  if (m.ep) b[m.to + (pos.turn === 'w' ? 8 : -8)] = m.captured;
  if (m.castle) {
    var rFrom = m.castle === 'k' ? m.to + 1 : m.to - 2, rTo = m.castle === 'k' ? m.to - 1 : m.to + 1;
    b[rFrom] = b[rTo]; b[rTo] = null;
  }
  pos.castle = undo.castle; pos.ep = undo.ep; pos.half = undo.half; pos.full = undo.full;
}

function legalMoves(pos, capturesOnly) {
  var me = pos.turn;
  return pseudoMoves(pos, capturesOnly).filter(function (m) {
    var u = makeMove(pos, m), ok = !inCheck(pos, me);
    unmakeMove(pos, m, u);
    return ok;
  });
}

function insufficient(pos) {
  var minors = 0, other = false;
  pos.board.forEach(function (p) {
    if (p === null) return;
    var t = p.toLowerCase();
    if (t === 'n' || t === 'b') minors++;
    else if (t !== 'k') other = true;
  });
  return !other && minors <= 1;
}

function evaluate(pos) {
  var score = 0, material = 0, b = pos.board;
  for (var i = 0; i < 64; i++) if (b[i] && b[i].toLowerCase() !== 'k' && b[i].toLowerCase() !== 'p') material += VALUE[b[i].toLowerCase()];
  var endgame = material <= 2600;
  for (var sq = 0; sq < 64; sq++) {
    var p = b[sq];
    if (p === null) continue;
    var t = p.toLowerCase(), w = isWhite(p);
    var idx = w ? sq : (7 - (sq >> 3)) * 8 + (sq & 7);
    var table = t === 'k' && endgame ? PST.kEnd : PST[t];
    var v = VALUE[t] + table[idx];
    score += w ? v : -v;
  }
  return pos.turn === 'w' ? score : -score;
}

var MATE = 100000;

/**
 * Finds a move for the side to play.
 * @param opts {depth, timeMs, random} depth is the most plies searched; random (0-1) adds noise for easy levels.
 */
function search(pos, opts) {
  opts = opts || {};
  var maxDepth = opts.depth || 3, deadline = Date.now() + (opts.timeMs || 1500), noise = opts.random || 0;
  var rand = opts.rng || Math.random, nodes = 0, stopped = false;

  function order(moves) {
    return moves.sort(function (a, b2) {
      var sa = (a.captured ? 10 * VALUE[a.captured.toLowerCase()] - VALUE[a.piece.toLowerCase()] : 0) + (a.promo ? 800 : 0);
      var sb = (b2.captured ? 10 * VALUE[b2.captured.toLowerCase()] - VALUE[b2.piece.toLowerCase()] : 0) + (b2.promo ? 800 : 0);
      return sb - sa;
    });
  }

  function quiesce(alpha, beta, qd) {
    var stand = evaluate(pos);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (qd > 6) return alpha;
    var moves = order(legalMoves(pos, true));
    for (var i = 0; i < moves.length; i++) {
      var u = makeMove(pos, moves[i]);
      var s = -quiesce(-beta, -alpha, qd + 1);
      unmakeMove(pos, moves[i], u);
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) stopped = true;
    if (stopped) return 0;
    if (pos.half >= 100 || insufficient(pos)) return 0;
    var moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos, pos.turn) ? -MATE + ply : 0;
    if (depth === 0) return quiesce(alpha, beta, 0);
    order(moves);
    for (var i = 0; i < moves.length; i++) {
      var u = makeMove(pos, moves[i]);
      var s = -negamax(depth - 1, -beta, -alpha, ply + 1);
      unmakeMove(pos, moves[i], u);
      if (stopped) return 0;
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  var root = order(legalMoves(pos));
  if (!root.length) return null;
  var best = root[0];
  // Iterative deepening: each finished depth's best move goes first in the next one.
  for (var d = 1; d <= maxDepth; d++) {
    var alpha = -Infinity, cand = null;
    for (var i = 0; i < root.length; i++) {
      var u = makeMove(pos, root[i]);
      // With noise every root move needs an exact score, so it gets the full window.
      var s = -negamax(d - 1, -Infinity, noise ? Infinity : -alpha, 1);
      unmakeMove(pos, root[i], u);
      if (stopped) break;
      s += noise ? (rand() - 0.5) * noise * 400 : 0;
      if (s > alpha) { alpha = s; cand = root[i]; }
    }
    if (stopped && !cand) break;
    if (cand) {
      best = cand;
      root.splice(root.indexOf(cand), 1);
      root.unshift(cand);
    }
    if (stopped || alpha > MATE - 1000) break;
  }
  return best;
}

/** Standard algebraic notation for a legal move, computed before it is played. */
function san(pos, m) {
  var t = m.piece.toLowerCase(), s;
  if (m.castle) s = m.castle === 'k' ? 'O-O' : 'O-O-O';
  else {
    s = t === 'p' ? '' : t.toUpperCase();
    if (t !== 'p') {
      var others = legalMoves(pos).filter(function (o) { return o.piece === m.piece && o.to === m.to && o.from !== m.from; });
      if (others.length) {
        var sameFile = others.some(function (o) { return (o.from & 7) === (m.from & 7); });
        var sameRank = others.some(function (o) { return (o.from >> 3) === (m.from >> 3); });
        s += !sameFile ? sqName(m.from)[0] : !sameRank ? sqName(m.from)[1] : sqName(m.from);
      }
    }
    if (m.captured) s += (t === 'p' ? sqName(m.from)[0] : '') + 'x';
    s += sqName(m.to);
    if (m.promo) s += '=' + m.promo.toUpperCase();
  }
  var u = makeMove(pos, m);
  if (inCheck(pos, pos.turn)) s += legalMoves(pos).length ? '+' : '#';
  unmakeMove(pos, m, u);
  return s;
}

function key(pos) { return pos.board.map(function (p) { return p || '.'; }).join('') + pos.turn + pos.castle + pos.ep; }

/** Game wrapper with history, undo and result detection. */
function createGame(fen) {
  var g = { pos: createPosition(fen), history: [], result: null, reason: null };
  var seen = {};
  function remember() { var k = key(g.pos); seen[k] = (seen[k] || 0) + 1; return seen[k]; }
  remember();

  g.moves = function (from) {
    if (g.result) return [];
    var all = legalMoves(g.pos);
    return from === undefined ? all : all.filter(function (m) { return m.from === from; });
  };

  g.play = function (m) {
    var notation = san(g.pos, m);
    var u = makeMove(g.pos, m);
    var reps = remember();
    g.history.push({ move: m, undo: u, san: notation });
    var replies = legalMoves(g.pos);
    if (!replies.length) {
      if (inCheck(g.pos, g.pos.turn)) { g.result = g.pos.turn === 'w' ? 'b' : 'w'; g.reason = 'checkmate'; }
      else { g.result = 'draw'; g.reason = 'stalemate'; }
    } else if (insufficient(g.pos)) { g.result = 'draw'; g.reason = 'material'; }
    else if (g.pos.half >= 100) { g.result = 'draw'; g.reason = 'fifty'; }
    else if (reps >= 3) { g.result = 'draw'; g.reason = 'repetition'; }
    return notation;
  };

  g.undo = function () {
    var h = g.history.pop();
    if (!h) return false;
    seen[key(g.pos)]--;
    unmakeMove(g.pos, h.move, h.undo);
    g.result = null; g.reason = null;
    return true;
  };

  g.inCheck = function () { return inCheck(g.pos, g.pos.turn); };
  g.think = function (opts) { return search(g.pos, opts); };
  return g;
}

var api = {
  createGame: createGame, createPosition: createPosition, legalMoves: legalMoves, makeMove: makeMove,
  unmakeMove: unmakeMove, search: search, san: san, sqName: sqName, parseSq: parseSq, isWhite: isWhite
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Chess = api;
})(this);
