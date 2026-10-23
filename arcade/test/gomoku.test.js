// Run: node --test arcade/test
const test = require('node:test');
const assert = require('node:assert');
const Gomoku = require('../extension/js/gomoku.js');

const N = Gomoku.SIZE, at = (r, c) => r * N + c;

function setup(blacks, whites, turn) {
  const g = Gomoku.createGame();
  blacks.forEach(([r, c]) => { g.board[at(r, c)] = 1; g.history.push(at(r, c)); });
  whites.forEach(([r, c]) => { g.board[at(r, c)] = 2; g.history.push(at(r, c)); });
  g.turn = turn;
  return g;
}

test('five in a row wins, diagonally too', () => {
  const g = Gomoku.createGame();
  for (let i = 0; i < 4; i++) { g.play(at(i, i)); g.play(at(i, 10)); }
  assert.strictEqual(g.winner, 0);
  g.play(at(4, 4));
  assert.strictEqual(g.winner, 1);
  assert.strictEqual(g.winLine.length, 5);
});

test('occupied cells are refused and undo works', () => {
  const g = Gomoku.createGame();
  assert.ok(g.play(at(7, 7)));
  assert.ok(!g.play(at(7, 7)));
  g.undo();
  assert.strictEqual(g.board[at(7, 7)], 0);
  assert.strictEqual(g.turn, 1);
});

test('AI takes its own win', () => {
  const g = setup([[0, 0], [0, 1], [14, 14]], [[7, 3], [7, 4], [7, 5], [7, 6]], 2);
  for (const lvl of ['easy', 'normal', 'hard']) {
    const m = g.think(lvl);
    assert.ok(m === at(7, 2) || m === at(7, 7), lvl);
  }
});

test('AI blocks a four', () => {
  const g = setup([[7, 3], [7, 4], [7, 5], [7, 6]], [[8, 3], [0, 0], [0, 14]], 2);
  for (const lvl of ['normal', 'hard']) {
    const m = g.think(lvl);
    assert.ok(m === at(7, 2) || m === at(7, 7), lvl);
  }
});

test('AI blocks an open three', () => {
  const g = setup([[7, 5], [7, 6], [7, 7]], [[8, 8], [9, 2]], 2);
  const m = g.think('hard');
  assert.ok([at(7, 4), at(7, 8), at(7, 3), at(7, 9)].includes(m), 'got ' + m);
});

test('first move goes to the centre', () => {
  assert.strictEqual(Gomoku.createGame().think('normal'), at(7, 7));
});

function match(blackLvl, whiteLvl, seed) {
  let s = seed;
  const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = Gomoku.createGame();
  g.play(at(7, 7));
  g.play(at(6 + (seed % 3), 6 + (Math.floor(seed / 3) % 3)));   // varied second move (centre repeats are refused)
  while (!g.winner) g.play(g.think(g.turn === 1 ? blackLvl : whiteLvl, rng));
  return g.winner;
}

test('hard beats easy most of the time', () => {
  let wins = 0;
  for (let i = 1; i <= 10; i++) {
    if (match('hard', 'easy', i * 7) === 1) wins++;
    if (match('easy', 'hard', i * 13) === 2) wins++;
  }
  assert.ok(wins >= 16, 'hard won ' + wins + '/20');
});

test('hard AI moves take well under a second through a whole game', () => {
  const g = Gomoku.createGame();
  let worst = 0;
  while (!g.winner) {
    const t = Date.now();
    g.play(g.think(g.turn === 1 ? 'hard' : 'normal'));
    worst = Math.max(worst, Date.now() - t);
  }
  assert.ok(worst < 1000, 'worst ' + worst + 'ms');
});
