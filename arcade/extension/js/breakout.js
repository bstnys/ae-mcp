/*
 * Breakout game rules: paddle, balls, bricks, power-ups, lives and levels on a
 * fixed 480 x 640 field. No DOM here, so it also runs under Node for tests.
 */
(function (root) {
'use strict';

var W = 480, H = 640;
var COLS = 10, BRICK_GAP = 4, SIDE = 16, TOP = 72, BRICK_H = 18;
var BRICK_W = (W - 2 * SIDE - (COLS - 1) * BRICK_GAP) / COLS;
var PADDLE_Y = 596, PADDLE_H = 12, PADDLE_W = 84, WIDE_W = 128, PADDLE_SPEED = 620;
var BALL_R = 6, BASE_SPEED = 330, MAX_SPEED = 620;
var START_LIVES = 3, POWER_CHANCE = 0.12, POWER_TIME = 12, POWER_FALL = 150;
var POWERS = ['wide', 'multi', 'slow', 'life'];

// '.' empty, 1-3 hits to break, '#' takes 3 hits and is worth more. Levels past the list repeat
// them with one extra hit on every brick.
var LEVELS = [
  ['1111111111', '1111111111', '1111111111', '1111111111', '1111111111'],
  ['2222222222', '1111111111', '1.1.1.1.1.', '.1.1.1.1.1', '1111111111', '2222222222'],
  ['....22....', '...2112...', '..211112..', '.21111112.', '2111111112', '.21111112.', '..211112..', '...2112...'],
  ['3333333333', '1........1', '1.222222.1', '1.2....2.1', '1.2.##.2.1', '1.2....2.1', '1.222222.1', '1........1'],
  ['#1#1#1#1#1', '1212121212', '2121212121', '1212121212', '3333333333', '1111111111']
];

function createGame(opts) {
  opts = opts || {};
  var rand = opts.random || Math.random;

  var g = {
    width: W, height: H, brickW: BRICK_W, brickH: BRICK_H, ballR: BALL_R, paddleY: PADDLE_Y, paddleH: PADDLE_H,
    score: 0, lives: START_LIVES, level: 0, over: false,
    paddle: { x: W / 2, w: PADDLE_W },
    balls: [], bricks: [], drops: [],
    timers: { wide: 0, slow: 0 },
    events: []      // { type: 'brick'|'paddle'|'wall'|'lost'|'level'|'power'|'over', x, y, color } for effects
  };

  function speedFor() {
    var s = Math.min(MAX_SPEED, BASE_SPEED * (1 + 0.08 * g.level));
    return g.timers.slow > 0 ? s * 0.7 : s;
  }

  function buildLevel(n) {
    var rows = LEVELS[n % LEVELS.length], extra = Math.floor(n / LEVELS.length);
    g.bricks = [];
    rows.forEach(function (row, r) {
      row.split('').forEach(function (ch, c) {
        if (ch === '.') return;
        var hits = (ch === '#' ? 3 : +ch) + extra;
        g.bricks.push({
          x: SIDE + c * (BRICK_W + BRICK_GAP), y: TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W, h: BRICK_H, hits: hits, maxHits: hits, row: r, armored: ch === '#'
        });
      });
    });
  }

  function serve() {
    g.balls = [{ x: g.paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true }];
    g.drops = [];
    g.timers.wide = 0; g.timers.slow = 0;
    g.paddle.w = PADDLE_W;
  }

  function startLevel(n) {
    g.level = n;
    buildLevel(n);
    serve();
  }

  g.launch = function () {
    var s = speedFor();
    g.balls.forEach(function (b) {
      if (!b.stuck) return;
      var a = (rand() * 0.6 - 0.3);       // up to ~17 degrees off vertical
      b.vx = s * Math.sin(a); b.vy = -s * Math.cos(a); b.stuck = false;
    });
  };

  function setSpeed(b, s) {
    var cur = Math.hypot(b.vx, b.vy) || 1;
    b.vx *= s / cur; b.vy *= s / cur;
    // Keep the ball from going nearly horizontal, which would take forever to come back.
    var minVy = s * 0.28;
    if (Math.abs(b.vy) < minVy) {
      b.vy = (b.vy < 0 ? -1 : 1) * minVy;
      b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(s * s - minVy * minVy);
    }
  }

  function hitBrick(br, b) {
    br.hits--;
    var cx = br.x + br.w / 2, cy = br.y + br.h / 2;
    if (br.hits > 0) { g.score += 2; g.events.push({ type: 'hit', x: cx, y: cy, row: br.row }); return; }
    g.bricks.splice(g.bricks.indexOf(br), 1);
    g.score += (br.armored ? 50 : 10 * br.maxHits) + 5 * g.level;
    g.events.push({ type: 'brick', x: cx, y: cy, row: br.row });
    if (rand() < POWER_CHANCE) g.drops.push({ x: cx, y: cy, kind: POWERS[Math.floor(rand() * POWERS.length)] });
  }

  function applyPower(kind) {
    g.events.push({ type: 'power', kind: kind, x: g.paddle.x, y: PADDLE_Y });
    if (kind === 'wide') { g.timers.wide = POWER_TIME; g.paddle.w = WIDE_W; }
    else if (kind === 'slow') { g.timers.slow = POWER_TIME; g.balls.forEach(function (b) { if (!b.stuck) setSpeed(b, speedFor()); }); }
    else if (kind === 'life') g.lives = Math.min(g.lives + 1, 9);
    else if (kind === 'multi') {
      var live = g.balls.filter(function (b) { return !b.stuck; });
      var src = live[0] || g.balls[0];
      if (!src) return;
      var s = speedFor();
      [-0.5, 0.5].forEach(function (a) {
        if (g.balls.length >= 12) return;
        g.balls.push({ x: src.x, y: src.y, vx: s * Math.sin(a), vy: -s * Math.cos(a), stuck: false });
      });
    }
  }

  // Moves one ball by dt, bouncing off walls, the paddle and at most one brick.
  function stepBall(b, dt) {
    b.x += b.vx * dt; b.y += b.vy * dt;

    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); g.events.push({ type: 'wall' }); }
    if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); g.events.push({ type: 'wall' }); }
    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); g.events.push({ type: 'wall' }); }

    var p = g.paddle;
    if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
        b.x >= p.x - p.w / 2 - BALL_R && b.x <= p.x + p.w / 2 + BALL_R) {
      // Where it lands on the paddle decides the angle: centre goes straight up, edges up to 60 degrees.
      var off = Math.max(-1, Math.min(1, (b.x - p.x) / (p.w / 2)));
      var s = speedFor(), a = off * Math.PI / 3;
      b.vx = s * Math.sin(a); b.vy = -s * Math.cos(a);
      b.y = PADDLE_Y - BALL_R;
      g.events.push({ type: 'paddle', x: b.x, y: PADDLE_Y });
    }

    for (var i = 0; i < g.bricks.length; i++) {
      var br = g.bricks[i];
      var nx = Math.max(br.x, Math.min(b.x, br.x + br.w)), ny = Math.max(br.y, Math.min(b.y, br.y + br.h));
      var dx = b.x - nx, dy = b.y - ny;
      if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
      // Bounce off the side the ball went in the least.
      var penX = Math.min(b.x + BALL_R - br.x, br.x + br.w - (b.x - BALL_R));
      var penY = Math.min(b.y + BALL_R - br.y, br.y + br.h - (b.y - BALL_R));
      if (penX < penY) { b.vx = b.x < br.x + br.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); }
      else { b.vy = b.y < br.y + br.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); }
      hitBrick(br, b);
      break;
    }
  }

  /**
   * Advance time by dt seconds.
   * @param input {left, right, pointerX} pointerX (field units) wins over the keys when set.
   */
  g.update = function (dt, input) {
    if (g.over) return;
    input = input || {};
    var p = g.paddle;

    ['wide', 'slow'].forEach(function (k) {
      if (g.timers[k] > 0) {
        g.timers[k] -= dt;
        if (g.timers[k] <= 0) {
          g.timers[k] = 0;
          if (k === 'wide') p.w = PADDLE_W;
          else g.balls.forEach(function (b) { if (!b.stuck) setSpeed(b, speedFor()); });
        }
      }
    });

    if (typeof input.pointerX === 'number') p.x = input.pointerX;
    else p.x += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * PADDLE_SPEED * dt;
    p.x = Math.max(p.w / 2, Math.min(W - p.w / 2, p.x));

    // Small steps so a fast ball can't pass through a brick or the paddle.
    var steps = Math.max(1, Math.ceil(speedFor() * dt / (BALL_R * 0.8)));
    var h = dt / steps;
    for (var s = 0; s < steps; s++) {
      g.balls.forEach(function (b) {
        if (b.stuck) { b.x = p.x; b.y = PADDLE_Y - BALL_R - 1; return; }
        stepBall(b, h);
      });
    }

    g.balls = g.balls.filter(function (b) { return b.y - BALL_R <= H; });

    g.drops = g.drops.filter(function (d) {
      d.y += POWER_FALL * dt;
      if (d.y + 8 >= PADDLE_Y && d.y - 8 <= PADDLE_Y + PADDLE_H && Math.abs(d.x - p.x) <= p.w / 2 + 14) {
        applyPower(d.kind);
        return false;
      }
      return d.y - 8 <= H;
    });

    if (!g.balls.length) {
      g.lives--;
      g.events.push({ type: 'lost' });
      if (g.lives <= 0) { g.over = true; g.events.push({ type: 'over' }); return; }
      serve();
      return;
    }

    if (!g.bricks.length) {
      g.score += 100 * (g.level + 1);
      g.events.push({ type: 'level' });
      startLevel(g.level + 1);
    }
  };

  g.waiting = function () { return g.balls.some(function (b) { return b.stuck; }); };
  g._startLevel = startLevel;

  startLevel(opts.level || 0);
  return g;
}

var api = { createGame: createGame, LEVELS: LEVELS, WIDTH: W, HEIGHT: H };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Breakout = api;
})(this);
