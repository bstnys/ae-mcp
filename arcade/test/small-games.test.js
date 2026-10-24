// Run: node --test arcade/test
const test = require('node:test');
const assert = require('node:assert');
const TicTacToe = require('../extension/js/tictactoe.js');
const Game2048 = require('../extension/js/g2048.js');
const Minesweeper = require('../extension/js/minesweeper.js');

test('tic-tac-toe: three in a row wins and full board draws', () => {
  const g = TicTacToe.createGame();
  [0, 3, 1, 4, 2].forEach(i => g.play(i));
  assert.strictEqual(g.result.who, 'X');
  assert.deepStrictEqual(g.result.line, [0, 1, 2]);
  const d = TicTacToe.createGame();
  [0, 1, 2, 4, 3, 5, 7, 6, 8].forEach(i => d.play(i));
  assert.strictEqual(d.result.who, 'draw');
});

test('tic-tac-toe: hard AI takes a win and blocks a loss', () => {
  const g = TicTacToe.createGame();
  [0, 3, 1, 4].forEach(i => g.play(i));   // X to move, can win at 2
  assert.strictEqual(g.think('hard'), 2);
  const h = TicTacToe.createGame();
  [0, 4, 1].forEach(i => h.play(i));      // O must block at 2
  assert.strictEqual(h.think('hard'), 2);
});

test('tic-tac-toe: hard AI never loses to random play', () => {
  for (let n = 0; n < 200; n++) {
    const g = TicTacToe.createGame();
    const ai = n % 2 ? 'X' : 'O';
    while (!g.result) {
      if (g.turn === ai) g.play(g.think('hard'));
      else { const free = g.board.map((v, i) => v ? -1 : i).filter(i => i >= 0); g.play(free[Math.floor(Math.random() * free.length)]); }
    }
    assert.notStrictEqual(g.result.who, ai === 'X' ? 'O' : 'X');
  }
});

test('2048: tiles slide and merge once per move', () => {
  const g = Game2048.createGame({ random: () => 0 });
  g._set([2, 2, 2, 2, 4, 0, 4, 8, 0, 0, 0, 0, 2, 0, 0, 2]);
  g.score = 0;
  assert.ok(g.move('left'));
  assert.strictEqual(g.spawned, 2);                   // random 0 spawns a 2 in the first free cell
  assert.deepStrictEqual(g.cells.slice(0, 4), [4, 4, 2, 0]);
  assert.deepStrictEqual(g.cells.slice(4, 8), [8, 8, 0, 0]);
  assert.strictEqual(g.cells[12], 4);
  assert.strictEqual(g.score, 4 + 4 + 8 + 4);
});

test('2048: a move that changes nothing is refused and spawns nothing', () => {
  const g = Game2048.createGame();
  g._set([2, 4, 2, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.strictEqual(g.move('up'), false);
  assert.strictEqual(g.cells.filter(Boolean).length, 4);
});

test('2048: game over when no moves remain, undo brings it back', () => {
  const g = Game2048.createGame({ random: () => 0 });
  g._set([2, 4, 2, 4, 4, 2, 4, 2, 8, 4, 16, 4, 32, 64, 32, 0]);
  assert.ok(!g.over);
  assert.ok(g.move('right'));          // fills the last gap with a 2 and locks the board
  assert.ok(g.over);
  assert.ok(g.undo());
  assert.ok(!g.over);
});

test('2048: reaching 2048 sets won', () => {
  const g = Game2048.createGame({ random: () => 0.5 });
  g._set([1024, 1024, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  g.move('left');
  assert.ok(g.won);
});

test('minesweeper: first click is always an opening and mine count is right', () => {
  for (let n = 0; n < 50; n++) {
    const g = Minesweeper.createGame('hard');
    const first = Math.floor(Math.random() * g.cells.length);
    g.reveal(first);
    assert.strictEqual(g.cells.filter(c => c.mine).length, 99);
    assert.ok(!g.cells[first].mine);
    assert.strictEqual(g.cells[first].n, 0);
    assert.strictEqual(g.state, 'playing');
  }
});

test('minesweeper: revealing every safe cell wins, hitting a mine loses', () => {
  const g = Minesweeper.createGame('easy');
  g.reveal(40);
  g.cells.forEach((c, i) => { if (!c.mine && !c.open) g.reveal(i); });
  assert.strictEqual(g.state, 'won');
  assert.strictEqual(g.flags, 10);
  const h = Minesweeper.createGame('easy');
  h.reveal(0);
  h.reveal(h.cells.findIndex(c => c.mine));
  assert.strictEqual(h.state, 'lost');
});

test('minesweeper: flags block reveals and chording opens the neighbours', () => {
  const g = Minesweeper.createGame('normal');
  g.reveal(0);
  const num = g.cells.findIndex((c, i) => c.open && c.n > 0 && g.neighbours(i).some(n => !g.cells[n].open && !g.cells[n].mine));
  const around = g.neighbours(num);
  around.filter(n => g.cells[n].mine).forEach(n => g.toggleFlag(n));
  const mine = around.find(n => g.cells[n].mine);
  g.reveal(mine);
  assert.ok(!g.cells[mine].open);
  g.reveal(num);
  assert.ok(around.every(n => g.cells[n].mine ? g.cells[n].flag : g.cells[n].open));
});
