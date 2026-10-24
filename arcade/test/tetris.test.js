// Run: node --test arcade/test
const test = require('node:test');
const assert = require('node:assert');
const { createGame, ROTATIONS, TYPES } = require('../extension/js/tetris.js');

test('7-bag deals every piece once per 7', () => {
  const g = createGame();
  const seen = [];
  for (let i = 0; i < 7; i++) { seen.push(g.piece.type); g.input('hard'); }
  assert.deepStrictEqual(seen.slice().sort(), TYPES.slice().sort());
});

test('every piece has 4 cells in each rotation', () => {
  TYPES.forEach(t => ROTATIONS[t].forEach(s => assert.strictEqual(s.length, 4)));
});

test('hard drop lands on the floor and scores 2 per row', () => {
  const g = createGame();
  g._spawn('O');
  g.score = 0;
  g.input('hard');
  assert.ok(g.board[21][4] && g.board[21][5] && g.board[20][4]);
  assert.strictEqual(g.score, 2 * 19);
});

test('tetris clears four rows and scores 800', () => {
  const g = createGame();
  g._setRows(Array(4).fill('IIIIIIIII.'));
  g._spawn('I');
  g.input('cw');                       // vertical I in column 5
  for (let i = 0; i < 5; i++) g.input('right');
  g.score = 0;
  const drop = g.ghostY() - g.piece.y;
  g.input('hard');
  assert.strictEqual(g.lines, 4);
  assert.ok(g.board.every(r => r.every(c => !c)));
  assert.strictEqual(g.score - 2 * drop, 800);
});

test('walls stop movement', () => {
  const g = createGame();
  g._spawn('T');
  for (let i = 0; i < 10; i++) g.input('left');
  assert.strictEqual(Math.min(...g.cells(g.piece).map(c => c[0])), 0);
});

test('rotation kicks off the wall', () => {
  const g = createGame();
  g._spawn('I');
  g.input('cw');
  for (let i = 0; i < 10; i++) g.input('right');
  assert.ok(g.input('cw'));            // would poke out without a kick
  assert.ok(g.cells(g.piece).every(c => c[0] >= 0 && c[0] < 10));
});

test('T-spin double is detected', () => {
  const g = createGame();
  // Classic TSD slot: T rotates (ccw from spawn kicks in) into the overhang at columns 3-5.
  g._setRows([
    'ZZZ.......',
    'ZZ...ZZZZZ',
    'ZZZ.ZZZZZZ'
  ]);
  g._spawn('T');
  g.piece.x = 2; g.piece.y = 18; g.piece.rot = 0;   // T resting above, centre at column 3
  while (g.input('down')) {}
  assert.ok(g.input('cw') && g.input('cw'));        // flips into the slot pointing down
  g.lastClear = null;
  g.input('hard');
  assert.strictEqual(g.lines, 2);
  assert.match(g.lastClear.text, /T-SPIN DOUBLE/);
});

test('gravity and lock delay lock a piece', () => {
  const g = createGame();
  const first = g.piece;
  for (let i = 0; i < 400; i++) g.update(0.05);
  assert.notStrictEqual(g.piece, first);
});

test('hold swaps once per piece', () => {
  const g = createGame();
  const a = g.piece.type;
  assert.ok(g.input('hold'));
  assert.strictEqual(g.hold, a);
  assert.strictEqual(g.input('hold'), false);
});

test('game over when stack reaches the top', () => {
  const g = createGame();
  for (let i = 0; i < 60 && !g.over; i++) g.input('hard');
  assert.ok(g.over);
});
