/*
 * Snake rules on a square grid: queued turns, growing on food, speed-up, a timed bonus
 * fruit and optional wrap-around walls. No DOM, so it runs under Node for tests.
 */
(function (root) {
'use strict';

var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
var START_SPEED = 7, MAX_SPEED = 18, SPEED_STEP = 0.35;   // cells per second
var BONUS_EVERY = 5, BONUS_TIME = 6;                     // a bonus appears every 5 foods, for 6 seconds

function createGame(opts) {
  opts = opts || {};
  var rand = opts.random || Math.random;
  var n = opts.size || 20;
  var g = {
    size: n, wrap: !!opts.wrap,
    snake: [], dir: 'right', queue: [],
    food: -1, bonus: -1, bonusLeft: 0,
    score: 0, eaten: 0, speed: START_SPEED, over: false,
    events: []       // 'eat' | 'bonus' | 'over'
  };
  var acc = 0;

  var mid = Math.floor(n / 2);
  for (var i = 0; i < 3; i++) g.snake.push([mid - 2 + i, mid]);   // tail first, head last

  function key(p) { return p[1] * n + p[0]; }

  function freeCell() {
    var used = {};
    g.snake.forEach(function (p) { used[key(p)] = true; });
    if (g.food >= 0) used[g.food] = true;
    if (g.bonus >= 0) used[g.bonus] = true;
    var free = [];
    for (var k = 0; k < n * n; k++) if (!used[k]) free.push(k);
    return free.length ? free[Math.floor(rand() * free.length)] : -1;
  }

  g.head = function () { return g.snake[g.snake.length - 1]; };

  /** Queues a turn; at most two are kept so quick double-taps (e.g. up then left) both count. */
  g.turn = function (d) {
    var last = g.queue.length ? g.queue[g.queue.length - 1] : g.dir;
    if (d === last || d === OPPOSITE[last] || g.queue.length >= 2) return false;
    g.queue.push(d);
    return true;
  };

  function step() {
    if (g.queue.length) g.dir = g.queue.shift();
    var h = g.head(), d = DIRS[g.dir];
    var nx = h[0] + d[0], ny = h[1] + d[1];
    if (g.wrap) { nx = (nx + n) % n; ny = (ny + n) % n; }
    else if (nx < 0 || ny < 0 || nx >= n || ny >= n) { die(); return; }
    var nk = ny * n + nx;
    var grows = nk === g.food || nk === g.bonus;
    // Moving into the cell the tail is leaving is fine unless the snake is growing this step.
    var body = grows ? g.snake : g.snake.slice(1);
    for (var i = 0; i < body.length; i++) if (body[i][0] === nx && body[i][1] === ny) { die(); return; }
    g.snake.push([nx, ny]);
    if (nk === g.food) {
      g.eaten++;
      g.score += 10 + Math.floor(g.speed - START_SPEED) * 2;
      g.speed = Math.min(MAX_SPEED, g.speed + SPEED_STEP);
      g.food = freeCell();
      if (g.eaten % BONUS_EVERY === 0 && g.bonus < 0) { g.bonus = freeCell(); g.bonusLeft = BONUS_TIME; }
      g.events.push('eat');
    } else if (nk === g.bonus) {
      g.score += 30 + Math.ceil(g.bonusLeft) * 10;
      g.bonus = -1; g.bonusLeft = 0;
      g.events.push('bonus');
    } else {
      g.snake.shift();
    }
    if (g.food < 0 && g.bonus < 0) die();   // board full
  }

  function die() { g.over = true; g.events.push('over'); }

  /** Advance time by dt seconds. Returns the fraction (0-1) of the way to the next step, for smooth drawing. */
  g.update = function (dt) {
    if (g.over) return 0;
    if (g.bonus >= 0) { g.bonusLeft -= dt; if (g.bonusLeft <= 0) { g.bonus = -1; g.bonusLeft = 0; } }
    acc += dt;
    var interval = 1 / g.speed;
    while (acc >= interval && !g.over) { acc -= interval; step(); }
    return Math.min(1, acc / interval);
  };

  g._step = step;
  g.food = freeCell();
  return g;
}

var api = { createGame: createGame };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Snake = api;
})(this);
