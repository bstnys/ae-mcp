/*
 * Minesweeper rules. Mines are placed on the first reveal so the first click is always an
 * opening. No DOM, so it runs under Node for tests.
 */
(function (root) {
'use strict';

var LEVELS = {
  easy: { cols: 9, rows: 9, mines: 10 },
  normal: { cols: 16, rows: 16, mines: 40 },
  hard: { cols: 30, rows: 16, mines: 99 }
};

function createGame(level, opts) {
  opts = opts || {};
  var rand = opts.random || Math.random;
  var L = typeof level === 'object' ? level : LEVELS[level || 'easy'];
  var g = {
    cols: L.cols, rows: L.rows, mines: L.mines,
    cells: [],          // { mine, n, open, flag }
    state: 'ready',     // ready | playing | won | lost
    flags: 0, opened: 0, boom: -1, startedAt: 0, endedAt: 0
  };
  for (var i = 0; i < g.cols * g.rows; i++) g.cells.push({ mine: false, n: 0, open: false, flag: false });

  function neighbours(i) {
    var r = Math.floor(i / g.cols), c = i % g.cols, out = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      var rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < g.rows && cc >= 0 && cc < g.cols) out.push(rr * g.cols + cc);
    }
    return out;
  }
  g.neighbours = neighbours;

  function placeMines(safe) {
    var banned = {}; banned[safe] = true;
    neighbours(safe).forEach(function (n) { banned[n] = true; });
    var spots = [];
    for (var i = 0; i < g.cells.length; i++) if (!banned[i]) spots.push(i);
    // Very small boards may not have room to keep the whole neighbourhood clear.
    if (spots.length < g.mines) { spots = []; for (var j = 0; j < g.cells.length; j++) if (j !== safe) spots.push(j); }
    for (var k = 0; k < g.mines; k++) {
      var pick = k + Math.floor(rand() * (spots.length - k)), tmp = spots[k];
      spots[k] = spots[pick]; spots[pick] = tmp;
      g.cells[spots[k]].mine = true;
    }
    g.cells.forEach(function (cell, idx) {
      cell.n = neighbours(idx).filter(function (n) { return g.cells[n].mine; }).length;
    });
  }

  function flood(start) {
    var stack = [start];
    while (stack.length) {
      var i = stack.pop(), cell = g.cells[i];
      if (cell.open || cell.flag) continue;
      cell.open = true; g.opened++;
      if (cell.n === 0 && !cell.mine) neighbours(i).forEach(function (n) { if (!g.cells[n].open) stack.push(n); });
    }
  }

  function finish(state) {
    g.state = state; g.endedAt = Date.now();
    if (state === 'won') g.cells.forEach(function (c) { if (c.mine && !c.flag) { c.flag = true; g.flags++; } });
  }

  /** Opens a cell; opening an already open number with enough flags around it opens the rest (chord). */
  g.reveal = function (i) {
    if (g.state === 'won' || g.state === 'lost') return;
    var cell = g.cells[i];
    if (cell.flag) return;
    if (g.state === 'ready') { placeMines(i); g.state = 'playing'; g.startedAt = Date.now(); }
    if (cell.open) {
      var around = neighbours(i);
      var flagged = around.filter(function (n) { return g.cells[n].flag; }).length;
      if (cell.n && flagged === cell.n) around.forEach(function (n) { if (!g.cells[n].open && !g.cells[n].flag) open(n); });
    } else open(i);
    if (g.state === 'playing' && g.opened === g.cells.length - g.mines) finish('won');
  };

  function open(i) {
    if (g.state !== 'playing') return;
    if (g.cells[i].mine) { g.cells[i].open = true; g.boom = i; finish('lost'); return; }
    flood(i);
  }

  g.toggleFlag = function (i) {
    if (g.state === 'won' || g.state === 'lost' || g.cells[i].open) return;
    g.cells[i].flag = !g.cells[i].flag;
    g.flags += g.cells[i].flag ? 1 : -1;
  };

  g.elapsed = function () {
    if (!g.startedAt) return 0;
    return Math.floor(((g.endedAt || Date.now()) - g.startedAt) / 1000);
  };

  return g;
}

var api = { createGame: createGame, LEVELS: LEVELS };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Minesweeper = api;
})(this);
