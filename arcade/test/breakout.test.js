// Run: node --test arcade/test
const test = require('node:test');
const assert = require('node:assert');
const { createGame, LEVELS, WIDTH } = require('../extension/js/breakout.js');

const half = () => 0.5;

function run(g, seconds, input) {
  for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60, input);
}

test('ball waits on the paddle until launched', () => {
  const g = createGame({ random: half });
  run(g, 1, { right: true });
  assert.ok(g.waiting());
  assert.strictEqual(g.balls[0].x, g.paddle.x);
  g.launch();
  assert.ok(!g.waiting());
  assert.ok(g.balls[0].vy < 0);
});

test('paddle stays inside the field', () => {
  const g = createGame({ random: half });
  run(g, 3, { left: true });
  assert.strictEqual(g.paddle.x, g.paddle.w / 2);
  g.update(0.016, { pointerX: 9999 });
  assert.strictEqual(g.paddle.x, WIDTH - g.paddle.w / 2);
});

test('a launched ball breaks a brick and scores', () => {
  const g = createGame({ random: half });
  const before = g.bricks.length;
  g.launch();
  run(g, 2);
  assert.ok(g.bricks.length < before);
  assert.ok(g.score > 0);
});

test('a missed ball costs a life and re-serves', () => {
  const g = createGame({ random: half });
  g.launch();
  g.balls[0].vx = 0; g.balls[0].vy = 400; g.balls[0].y = 610;
  g.paddle.x = 40;
  run(g, 1, { pointerX: 40 });
  assert.strictEqual(g.lives, 2);
  assert.ok(g.waiting());
});

test('losing every life ends the game', () => {
  const g = createGame({ random: half });
  for (let i = 0; i < 3; i++) {
    g.launch();
    g.balls[0].x = 470; g.balls[0].vx = 0; g.balls[0].vy = 500; g.balls[0].y = 620;
    run(g, 0.5, { pointerX: 40 });
  }
  assert.ok(g.over);
});

test('clearing every brick moves to the next stage', () => {
  const g = createGame({ random: half });
  g.bricks = g.bricks.slice(0, 1);
  const br = g.bricks[0];
  br.hits = 1;
  g.launch();
  const b = g.balls[0];
  b.x = br.x + br.w / 2; b.y = br.y + br.h + 20; b.vx = 0; b.vy = -300;
  run(g, 0.5);
  assert.strictEqual(g.level, 1);
  assert.ok(g.bricks.length > 0);
});

test('every level row is 10 bricks wide', () => {
  LEVELS.forEach(l => l.forEach(r => assert.strictEqual(r.length, 10)));
});

test('ball never leaves the field sideways or through the top over a long rally', () => {
  const g = createGame({ random: Math.random });
  g.lives = 99;
  for (let i = 0; i < 60 * 120; i++) {
    if (g.waiting()) g.launch();
    const b = g.balls[0];
    g.update(1 / 60, { pointerX: b ? b.x : 240 });   // perfect player
    g.balls.forEach(b => assert.ok(b.x >= 0 && b.x <= WIDTH && b.y >= 0));
  }
  assert.ok(g.score > 0);
});

test('power-ups apply when caught', () => {
  const g = createGame({ random: half });
  g.launch();
  g.drops.push({ x: g.paddle.x, y: g.paddleY - 2, kind: 'wide' });
  g.drops.push({ x: g.paddle.x, y: g.paddleY - 2, kind: 'multi' });
  g.update(0.016, { pointerX: g.paddle.x });
  assert.ok(g.paddle.w > 84);
  assert.strictEqual(g.balls.length, 3);
});
