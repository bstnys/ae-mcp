/*
 * Tetris game rules: board, pieces, SRS rotation, 7-bag, hold, scoring, gravity
 * and lock delay. No DOM here, so it also runs under Node for tests.
 */
(function (root) {
'use strict';

var COLS = 10;
var ROWS = 22;          // 20 visible rows plus 2 hidden spawn rows on top
var HIDDEN = 2;
var LOCK_DELAY = 0.5;   // seconds
var MAX_LOCK_RESETS = 15;
var SOFT_DROP_FACTOR = 20;
var NEXT_COUNT = 5;

var SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
};
var TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

// SRS wall kicks as [dx, dy] with y pointing up, keyed by "from>to".
var KICKS_JLSTZ = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
var KICKS_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};

var LINE_SCORES = [0, 100, 300, 500, 800];
var TSPIN_SCORES = [400, 800, 1200, 1600];

function rotateCW(m) {
  var n = m.length, out = [];
  for (var r = 0; r < n; r++) {
    out.push([]);
    for (var c = 0; c < n; c++) out[r].push(m[n - 1 - c][r]);
  }
  return out;
}

// ROTATIONS[type][state] = list of [x, y] cell offsets.
var ROTATIONS = {};
TYPES.forEach(function (t) {
  var m = SHAPES[t], states = [];
  for (var s = 0; s < 4; s++) {
    var cells = [];
    for (var r = 0; r < m.length; r++)
      for (var c = 0; c < m.length; c++) if (m[r][c]) cells.push([c, r]);
    states.push(cells);
    m = rotateCW(m);
  }
  ROTATIONS[t] = states;
});

/** Seconds per row at a level (Tetris guideline curve). */
function gravityFor(level) {
  return Math.pow(0.8 - (level - 1) * 0.007, level - 1);
}

function createGame(opts) {
  opts = opts || {};
  var rand = opts.random || Math.random;
  var startLevel = opts.level || 1;

  var g = {
    cols: COLS, rows: ROWS, hidden: HIDDEN,
    board: [], piece: null, hold: null, holdUsed: false, queue: [],
    score: 0, lines: 0, level: startLevel, combo: -1, backToBack: false,
    over: false, softDrop: false,
    lastClear: null,      // { rows: [...], count, tspin, text } for the UI to flash
    events: []            // 'lock' | 'clear' | 'hold' | 'over' for sounds/effects
  };
  var bag = [];
  var fallTimer = 0, lockTimer = 0, lockResets = 0, lastWasRotate = false, lastKick = 0;

  for (var r = 0; r < ROWS; r++) g.board.push(emptyRow());

  function emptyRow() { var row = []; for (var c = 0; c < COLS; c++) row.push(null); return row; }

  function nextFromBag() {
    if (!bag.length) {
      bag = TYPES.slice();
      for (var i = bag.length - 1; i > 0; i--) {
        var j = Math.floor(rand() * (i + 1)), tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
      }
    }
    return bag.pop();
  }

  function fillQueue() { while (g.queue.length < NEXT_COUNT) g.queue.push(nextFromBag()); }

  function cellsOf(p, x, y, rot) {
    return ROTATIONS[p.type][rot].map(function (c) { return [c[0] + x, c[1] + y]; });
  }

  function fits(p, x, y, rot) {
    var cells = cellsOf(p, x, y, rot);
    for (var i = 0; i < cells.length; i++) {
      var cx = cells[i][0], cy = cells[i][1];
      if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
      if (cy >= 0 && g.board[cy][cx]) return false;
    }
    return true;
  }

  function spawn(type) {
    var p = { type: type, rot: 0, x: type === 'O' ? 4 : 3, y: 1 };
    if (!fits(p, p.x, p.y, 0)) { p.y = 0; }
    g.piece = p;
    fallTimer = 0; lockTimer = 0; lockResets = 0; lastWasRotate = false;
    if (!fits(p, p.x, p.y, 0)) gameOver();
  }

  function spawnNext() {
    fillQueue();
    spawn(g.queue.shift());
    fillQueue();
  }

  function gameOver() {
    g.over = true;
    g.events.push('over');
  }

  function onGround() { return !fits(g.piece, g.piece.x, g.piece.y + 1, g.piece.rot); }

  function resetLockIfGrounded() {
    if (onGround() && lockResets < MAX_LOCK_RESETS) { lockTimer = 0; lockResets++; }
  }

  function tryMove(dx, dy) {
    var p = g.piece;
    if (!p || g.over) return false;
    if (!fits(p, p.x + dx, p.y + dy, p.rot)) return false;
    p.x += dx; p.y += dy;
    lastWasRotate = false;
    if (dx) resetLockIfGrounded();
    return true;
  }

  function tryRotate(dir) {
    var p = g.piece;
    if (!p || g.over || p.type === 'O') return false;
    var to = (p.rot + dir + 4) % 4;
    var kicks = (p.type === 'I' ? KICKS_I : KICKS_JLSTZ)[p.rot + '>' + to];
    for (var i = 0; i < kicks.length; i++) {
      var nx = p.x + kicks[i][0], ny = p.y - kicks[i][1];
      if (fits(p, nx, ny, to)) {
        p.x = nx; p.y = ny; p.rot = to;
        lastWasRotate = true; lastKick = i;
        resetLockIfGrounded();
        return true;
      }
    }
    return false;
  }

  // 3-corner T-spin check; 'mini' when only one front corner is filled and no big kick was used.
  function tSpinKind() {
    var p = g.piece;
    if (p.type !== 'T' || !lastWasRotate) return null;
    var cx = p.x + 1, cy = p.y + 1;
    function filled(x, y) { return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && !!g.board[y][x]); }
    var corners = [filled(cx - 1, cy - 1), filled(cx + 1, cy - 1), filled(cx + 1, cy + 1), filled(cx - 1, cy + 1)];
    var count = corners.filter(Boolean).length;
    if (count < 3) return null;
    var front = [[0, 1], [1, 2], [2, 3], [3, 0]][p.rot];
    if (corners[front[0]] && corners[front[1]]) return 'full';
    return lastKick === 4 ? 'full' : 'mini';
  }

  function lock() {
    var p = g.piece, tspin = tSpinKind();
    var cells = cellsOf(p, p.x, p.y, p.rot), aboveOnly = true;
    cells.forEach(function (c) {
      if (c[1] >= 0) g.board[c[1]][c[0]] = p.type;
      if (c[1] >= HIDDEN) aboveOnly = false;
    });
    g.events.push('lock');

    var cleared = [];
    for (var r = 0; r < ROWS; r++) {
      if (g.board[r].every(Boolean)) cleared.push(r);
    }
    cleared.forEach(function (r) { g.board.splice(r, 1); g.board.unshift(emptyRow()); });
    scoreClear(cleared, tspin);

    g.piece = null;
    g.holdUsed = false;
    if (aboveOnly) { gameOver(); return; }
    spawnNext();
  }

  function scoreClear(cleared, tspin) {
    var n = cleared.length, pts = 0, text = '';
    var difficult = n === 4 || (tspin && n > 0);
    if (tspin === 'full') { pts = TSPIN_SCORES[n]; text = 'T-SPIN' + (n ? ' ' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n] : ''); }
    else if (tspin === 'mini') { pts = n ? 200 * n : 100; text = 'T-SPIN MINI'; }
    else { pts = LINE_SCORES[n]; text = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][n]; }

    if (n > 0) {
      if (difficult && g.backToBack) { pts = Math.floor(pts * 1.5); text = 'B2B ' + text; }
      g.backToBack = difficult;
      g.combo++;
      if (g.combo > 0) { pts += 50 * g.combo; text += '  ' + g.combo + ' COMBO'; }
    } else {
      g.combo = -1;
    }
    g.score += pts * g.level;

    if (n > 0) {
      g.lines += n;
      var lvl = startLevel + Math.floor(g.lines / 10);
      if (lvl > g.level) g.level = lvl;
      g.events.push('clear');
    }
    if (n > 0 || tspin) g.lastClear = { rows: cleared, count: n, tspin: tspin, text: text };
  }

  g.ghostY = function () {
    var p = g.piece, y = p.y;
    while (fits(p, p.x, y + 1, p.rot)) y++;
    return y;
  };

  g.cells = function (p, y) { return cellsOf(p, p.x, y === undefined ? p.y : y, p.rot); };

  g.input = function (action) {
    if (g.over || !g.piece) return false;
    switch (action) {
      case 'left': return tryMove(-1, 0);
      case 'right': return tryMove(1, 0);
      case 'down':
        if (tryMove(0, 1)) { g.score += 1; fallTimer = 0; return true; }
        return false;
      case 'cw': return tryRotate(1);
      case 'ccw': return tryRotate(-1);
      case 'hard':
        var d = 0;
        while (fits(g.piece, g.piece.x, g.piece.y + 1, g.piece.rot)) { g.piece.y++; d++; }
        if (d) lastWasRotate = false;
        g.score += 2 * d;
        lock();
        return true;
      case 'hold':
        if (g.holdUsed) return false;
        var cur = g.piece.type;
        if (g.hold) spawn(g.hold); else spawnNext();
        g.hold = cur; g.holdUsed = true;
        g.events.push('hold');
        return true;
    }
    return false;
  };

  /** Advance time by dt seconds. */
  g.update = function (dt) {
    if (g.over || !g.piece) return;
    var interval = gravityFor(g.level);
    if (g.softDrop) interval = Math.min(interval, interval / SOFT_DROP_FACTOR);
    fallTimer += dt;
    while (fallTimer >= interval && !onGround()) {
      fallTimer -= interval;
      g.piece.y++;
      lastWasRotate = false;
      if (g.softDrop) g.score += 1;
    }
    if (onGround()) {
      fallTimer = 0;
      lockTimer += dt;
      if (lockTimer >= LOCK_DELAY || lockResets >= MAX_LOCK_RESETS) lock();
    } else {
      lockTimer = 0;
    }
  };

  /** Test hook: set board rows from strings ('.' empty, any letter filled), bottom-aligned. */
  g._setRows = function (rows) {
    var start = ROWS - rows.length;
    rows.forEach(function (s, i) {
      g.board[start + i] = s.split('').map(function (ch) { return ch === '.' ? null : ch; });
    });
  };
  g._spawn = spawn;

  spawnNext();
  return g;
}

var api = { createGame: createGame, gravityFor: gravityFor, ROTATIONS: ROTATIONS, TYPES: TYPES };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Tetris = api;
})(this);
