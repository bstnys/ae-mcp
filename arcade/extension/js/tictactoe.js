/*
 * Tic-tac-toe rules and a minimax AI. Cells hold '', 'X' (moves first) or 'O'.
 * No DOM, so it runs under Node for tests.
 */
(function (root) {
'use strict';

var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function winnerOf(b) {
  for (var i = 0; i < LINES.length; i++) {
    var l = LINES[i];
    if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { who: b[l[0]], line: l };
  }
  return b.indexOf('') < 0 ? { who: 'draw', line: null } : null;
}

// Score from `me`'s point of view; quicker wins and slower losses score better.
function minimax(b, turn, me, depth) {
  var w = winnerOf(b);
  if (w) return w.who === 'draw' ? 0 : (w.who === me ? 10 - depth : depth - 10);
  var best = turn === me ? -Infinity : Infinity;
  for (var i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    var s = minimax(b, turn === 'X' ? 'O' : 'X', me, depth + 1);
    b[i] = '';
    best = turn === me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

function createGame() {
  var g = { board: ['', '', '', '', '', '', '', '', ''], turn: 'X', result: null, history: [] };

  g.play = function (i) {
    if (g.result || g.board[i]) return false;
    g.board[i] = g.turn;
    g.history.push(i);
    g.result = winnerOf(g.board);
    g.turn = g.turn === 'X' ? 'O' : 'X';
    return true;
  };

  g.undo = function () {
    var i = g.history.pop();
    if (i === undefined) return false;
    g.board[i] = '';
    g.turn = g.turn === 'X' ? 'O' : 'X';
    g.result = null;
    return true;
  };

  /** level: 'easy' (mostly random), 'normal' (best move 75% of the time), 'hard' (never loses). */
  g.think = function (level, rng) {
    rng = rng || Math.random;
    var me = g.turn, free = [];
    g.board.forEach(function (v, i) { if (!v) free.push(i); });
    if (!free.length) return -1;
    var chance = level === 'easy' ? 0.25 : level === 'normal' ? 0.75 : 1;
    if (rng() >= chance) return free[Math.floor(rng() * free.length)];
    var bestScore = -Infinity, best = [];
    free.forEach(function (i) {
      g.board[i] = me;
      var s = minimax(g.board, me === 'X' ? 'O' : 'X', me, 1);
      g.board[i] = '';
      if (s > bestScore) { bestScore = s; best = [i]; } else if (s === bestScore) best.push(i);
    });
    return best[Math.floor(rng() * best.length)];
  };

  return g;
}

var api = { createGame: createGame, winnerOf: winnerOf };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.TicTacToe = api;
})(this);
