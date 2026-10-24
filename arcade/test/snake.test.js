// Run: node --test arcade/test
const test = require('node:test');
const assert = require('node:assert');
const Snake = require('../extension/js/snake.js');

test('moves one cell per step and ignores reversing', () => {
  const g = Snake.createGame();
  const [x, y] = g.head();
  assert.ok(!g.turn('left'));      // straight back into itself
  g._step();
  assert.deepStrictEqual(g.head(), [x + 1, y]);
  assert.strictEqual(g.snake.length, 3);
});

test('two quick turns both apply, in order', () => {
  const g = Snake.createGame();
  const [x, y] = g.head();
  assert.ok(g.turn('up'));
  assert.ok(g.turn('left'));
  g._step(); g._step();
  assert.deepStrictEqual(g.head(), [x - 1, y - 1]);
});

test('eating grows the snake, scores and speeds up', () => {
  const g = Snake.createGame();
  const [x, y] = g.head();
  g.food = y * g.size + x + 1;
  const speed = g.speed;
  g._step();
  assert.strictEqual(g.snake.length, 4);
  assert.strictEqual(g.score, 10);
  assert.ok(g.speed > speed);
  assert.notStrictEqual(g.food, y * g.size + x + 1);
});

test('hitting a wall ends the game, or wraps when walls are off', () => {
  const g = Snake.createGame();
  for (let i = 0; i < 20 && !g.over; i++) { g.food = 0; g._step(); }
  assert.ok(g.over);
  const w = Snake.createGame({ wrap: true });
  for (let i = 0; i < 20; i++) { w.food = 0; w._step(); }
  assert.ok(!w.over);
});

test('running into its own body ends the game', () => {
  const g = Snake.createGame();
  g.snake = [[5, 5], [6, 5], [7, 5], [8, 5], [8, 6], [7, 6]];   // head at (7,6) heading left
  g.dir = 'left';
  g.food = 0;
  g.turn('up');                                                // into (7,5)
  g._step();
  assert.ok(g.over);
});

test('following its own tail is allowed', () => {
  const g = Snake.createGame();
  g.snake = [[5, 5], [6, 5], [6, 6], [5, 6]];   // a tight square, head at (5,6)
  g.dir = 'left';
  g.food = 0;
  g.turn('up');                                 // into (5,5), which the tail leaves this step
  g._step();
  assert.ok(!g.over);
});

test('update steps at the current speed', () => {
  const g = Snake.createGame();
  g.food = 0;
  const x = g.head()[0];
  g.update(1);
  assert.strictEqual(g.head()[0], x + Math.floor(g.speed));
});

test('bonus fruit appears after five foods and expires', () => {
  const g = Snake.createGame({ wrap: true });
  for (let i = 0; i < 5; i++) { const [x, y] = g.head(); g.food = y * g.size + (x + 1) % g.size; g._step(); }
  assert.ok(g.bonus >= 0);
  g.food = 0;
  g.turn('down');
  g.update(7);
  assert.strictEqual(g.bonus, -1);
});
