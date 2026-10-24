/*
 * Gomoku (free-style: five or more in a row wins) on a 15 x 15 board, with a
 * pattern-scoring AI. Cells hold 0 (empty), 1 (black, moves first) or 2 (white).
 * No DOM, so it runs under Node for tests.
 */
(function (root) {
'use strict';

var N = 15;
var DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

// Patterns seen along one line through a candidate cell, with the candidate's stone in place.
// X = own stone, . = empty. The first pattern that matches over the candidate counts.
var PATTERNS = [
  ['XXXXX', 10000000],
  ['.XXXX.', 1000000],
  ['XXXX.', 100000], ['.XXXX', 100000], ['XXX.X', 100000], ['X.XXX', 100000], ['XX.XX', 100000],
  ['.XXX..', 12000], ['..XXX.', 12000], ['.XX.X.', 10000], ['.X.XX.', 10000],
  ['XXX..', 1200], ['..XXX', 1200], ['.XXX.', 1500], ['XX.X.', 1000], ['.X.XX', 1000], ['X.XX.', 1000], ['.XX.X', 1000],
  ['XX..X', 800], ['X..XX', 800], ['X.X.X', 800],
  ['..XX..', 600], ['.X.X..', 400], ['..X.X.', 400], ['.XX..', 250], ['..XX.', 250], ['.X..X.', 200],
  ['XX...', 60], ['...XX', 60], ['.XX.', 80], ['X.X..', 40], ['..X.X', 40]
];

function createGame() {
  var g = { size: N, board: [], turn: 1, winner: 0, winLine: null, history: [] };
  for (var i = 0; i < N * N; i++) g.board.push(0);

  function at(r, c) { return r < 0 || r >= N || c < 0 || c >= N ? -1 : g.board[r * N + c]; }

  function lineThrough(r, c, d, who) {
    var s = '';
    for (var k = -5; k <= 5; k++) {
      var v = k === 0 ? who : at(r + d[0] * k, c + d[1] * k);
      s += v === who ? 'X' : v === 0 ? '.' : 'O';
    }
    return s;   // centre is index 5
  }

  function lineScore(s) {
    for (var p = 0; p < PATTERNS.length; p++) {
      var pat = PATTERNS[p][0];
      for (var off = Math.max(0, 5 - pat.length + 1); off <= 5 && off + pat.length <= s.length; off++) {
        if (s.substr(off, pat.length) === pat && pat[5 - off] === 'X') return PATTERNS[p][1];
      }
    }
    return 0;
  }

  /** How good it is for `who` to have a stone on (r, c), summed over the four lines. */
  function cellScore(r, c, who) {
    var total = 0, strong = 0;
    for (var d = 0; d < 4; d++) {
      var v = lineScore(lineThrough(r, c, DIRS[d], who));
      total += v;
      if (v >= 10000) strong++;
    }
    // Two threats at once (double three, four-three) can't both be blocked.
    if (strong >= 2) total += 200000;
    return total;
  }

  function fiveFrom(idx) {
    var who = g.board[idx], r = Math.floor(idx / N), c = idx % N;
    for (var d = 0; d < 4; d++) {
      var cells = [idx];
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        for (var k = 1; k < N; k++) {
          var rr = r + DIRS[d][0] * k * sgn, cc = c + DIRS[d][1] * k * sgn;
          if (at(rr, cc) !== who) break;
          cells.push(rr * N + cc);
        }
      }
      if (cells.length >= 5) return cells;
    }
    return null;
  }

  g.play = function (idx) {
    if (g.winner || g.board[idx] !== 0) return false;
    g.board[idx] = g.turn;
    g.history.push(idx);
    var line = fiveFrom(idx);
    if (line) { g.winner = g.turn; g.winLine = line; }
    else if (g.history.length === N * N) g.winner = 3;   // board full: draw
    g.turn = 3 - g.turn;
    return true;
  };

  g.undo = function () {
    var idx = g.history.pop();
    if (idx === undefined) return false;
    g.board[idx] = 0;
    g.turn = 3 - g.turn;
    g.winner = 0; g.winLine = null;
    return true;
  };

  function candidates() {
    var out = [];
    if (!g.history.length) return [Math.floor(N / 2) * N + Math.floor(N / 2)];
    for (var i = 0; i < N * N; i++) {
      if (g.board[i]) continue;
      var r = Math.floor(i / N), c = i % N, near = false;
      for (var dr = -2; dr <= 2 && !near; dr++)
        for (var dc = -2; dc <= 2 && !near; dc++) if (at(r + dr, c + dc) > 0) near = true;
      if (near) out.push(i);
    }
    return out;
  }

  function ranked(me) {
    var opp = 3 - me;
    return candidates().map(function (i) {
      var r = Math.floor(i / N), c = i % N;
      var atk = cellScore(r, c, me), def = cellScore(r, c, opp);
      // Prefer the centre slightly so early moves don't drift to the edge.
      var centre = 14 - Math.abs(r - 7) - Math.abs(c - 7);
      return { idx: i, atk: atk, def: def, score: atk * 1.1 + def + centre };
    }).sort(function (a, b) { return b.score - a.score; });
  }

  /**
   * Picks a move for the side to play.
   * @param level 'easy' | 'normal' | 'hard'
   */
  g.think = function (level, rng) {
    rng = rng || Math.random;
    var me = g.turn, list = ranked(me);
    if (!list.length) return -1;
    // Always take a win; always stop the opponent's five.
    if (list[0].atk >= 10000000) return list[0].idx;
    var block = list.filter(function (m) { return m.def >= 10000000; });
    if (block.length && level !== 'easy') return block[0].idx;

    if (level === 'easy') {
      // Plays sensible-looking moves but misses threats now and then.
      var pool = list.slice(0, 6), weights = pool.map(function (m, i) { return Math.pow(0.55, i); });
      var sum = weights.reduce(function (a, b) { return a + b; }, 0), x = rng() * sum;
      for (var i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i].idx; }
      return pool[0].idx;
    }
    if (level === 'normal') return list[0].idx;

    // Hard: also reads forcing sequences of fours (VCF), for itself and against the opponent.
    var line = vcf(me, 10);
    if (line >= 0) return line;
    if (vcf(3 - me, 10) >= 0) {
      // The opponent has a forced win: take the best-scored move that breaks it.
      for (var k = 0; k < Math.min(12, list.length); k++) {
        g.board[list[k].idx] = me;
        var stillWins = vcf(3 - me, 10) >= 0;
        g.board[list[k].idx] = 0;
        if (!stillWins) return list[k].idx;
      }
    }
    return list[0].idx;
  };

  function fivesFor(who) {
    var out = [];
    candidates().forEach(function (i) {
      if (lineMax(Math.floor(i / N), i % N, who) >= 10000000) out.push(i);
    });
    return out;
  }

  function lineMax(r, c, who) {
    var best = 0;
    for (var d = 0; d < 4; d++) best = Math.max(best, lineScore(lineThrough(r, c, DIRS[d], who)));
    return best;
  }

  /**
   * Victory by continuous fours: `who` keeps making fours, each forcing a single block, until a five
   * or a double four. Returns the first move of such a sequence, or -1.
   */
  function vcf(who, depth) {
    if (depth <= 0) return -1;
    var opp = 3 - who;
    if (fivesFor(opp).length) return -1;   // the opponent would just win instead of blocking
    var fours = candidates().filter(function (i) { return lineMax(Math.floor(i / N), i % N, who) >= 100000; });
    for (var k = 0; k < fours.length; k++) {
      var i = fours[k];
      g.board[i] = who;
      var threats = fivesFor(who), ok = false;
      if (lineMax(Math.floor(i / N), i % N, who) >= 10000000 || threats.length >= 2) ok = true;
      else if (threats.length === 1) {
        g.board[threats[0]] = opp;
        ok = vcf(who, depth - 1) >= 0;
        g.board[threats[0]] = 0;
      }
      g.board[i] = 0;
      if (ok) return i;
    }
    return -1;
  }

  return g;
}

var api = { createGame: createGame, SIZE: N };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Gomoku = api;
})(this);
