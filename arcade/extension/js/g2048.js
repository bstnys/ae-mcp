/*
 * 2048 rules on a 4 x 4 grid. Cells hold 0 or a power of two. No DOM, so it runs under Node for tests.
 */
(function (root) {
'use strict';

var N = 4;

function createGame(opts) {
  opts = opts || {};
  var rand = opts.random || Math.random;
  var g = { size: N, cells: [], score: 0, won: false, over: false, keepPlaying: false, moved: [], merged: [], spawned: -1, prev: null };
  for (var i = 0; i < N * N; i++) g.cells.push(0);

  function spawn() {
    var free = [];
    g.cells.forEach(function (v, i) { if (!v) free.push(i); });
    if (!free.length) return -1;
    var i = free[Math.floor(rand() * free.length)];
    g.cells[i] = rand() < 0.9 ? 2 : 4;
    return i;
  }

  function canMove() {
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var v = g.cells[r * N + c];
      if (!v) return true;
      if (c + 1 < N && g.cells[r * N + c + 1] === v) return true;
      if (r + 1 < N && g.cells[(r + 1) * N + c] === v) return true;
    }
    return false;
  }

  /**
   * Slides every tile toward dir ('left' | 'right' | 'up' | 'down'). Returns false if nothing moved.
   * After a move, g.moved lists {from, to} for animation and g.merged the cells that merged.
   */
  g.move = function (dir) {
    if (g.over) return false;
    var before = g.cells.slice(), beforeScore = g.score;
    var moved = [], merged = [];
    for (var line = 0; line < N; line++) {
      // Cell indexes along this line, starting from the side tiles slide toward.
      var idx = [];
      for (var k = 0; k < N; k++) {
        if (dir === 'left') idx.push(line * N + k);
        else if (dir === 'right') idx.push(line * N + (N - 1 - k));
        else if (dir === 'up') idx.push(k * N + line);
        else idx.push((N - 1 - k) * N + line);
      }
      var tiles = idx.filter(function (i) { return g.cells[i]; }).map(function (i) { return { v: g.cells[i], from: i }; });
      var out = [], t = 0;
      while (t < tiles.length) {
        if (t + 1 < tiles.length && tiles[t].v === tiles[t + 1].v) {
          var v = tiles[t].v * 2;
          out.push({ v: v, froms: [tiles[t].from, tiles[t + 1].from], merged: true });
          g.score += v;
          t += 2;
        } else {
          out.push({ v: tiles[t].v, froms: [tiles[t].from] });
          t++;
        }
      }
      idx.forEach(function (i, k) {
        var o = out[k];
        g.cells[i] = o ? o.v : 0;
        if (!o) return;
        o.froms.forEach(function (f) { moved.push({ from: f, to: i }); });
        if (o.merged) merged.push(i);
      });
    }
    var changed = g.cells.some(function (v, i) { return v !== before[i]; });
    if (!changed) return false;
    g.prev = { cells: before, score: beforeScore };
    g.moved = moved; g.merged = merged;
    if (!g.won && g.cells.indexOf(2048) >= 0) g.won = true;
    g.spawned = spawn();
    g.over = !canMove();
    return true;
  };

  /** Takes back the last move (one step only). */
  g.undo = function () {
    if (!g.prev) return false;
    g.cells = g.prev.cells; g.score = g.prev.score;
    g.prev = null; g.over = false; g.moved = []; g.merged = []; g.spawned = -1;
    return true;
  };

  g._set = function (cells) { g.cells = cells.slice(); g.over = !canMove(); };

  spawn(); g.spawned = spawn();
  return g;
}

var api = { createGame: createGame };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Game2048 = api;
})(this);
