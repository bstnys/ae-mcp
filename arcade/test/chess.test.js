// Run: node --test arcade/test
const test = require('node:test');
const assert = require('node:assert');
const Chess = require('../extension/js/chess.js');

function perft(pos, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of Chess.legalMoves(pos)) {
    const u = Chess.makeMove(pos, m);
    n += perft(pos, d - 1);
    Chess.unmakeMove(pos, m, u);
  }
  return n;
}

test('perft from the start position', () => {
  const pos = Chess.createPosition();
  assert.deepStrictEqual([1, 2, 3].map(d => perft(pos, d)), [20, 400, 8902]);
});

test('perft on Kiwipete (castling, en passant, promotions, pins)', () => {
  const pos = Chess.createPosition('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.deepStrictEqual([1, 2, 3].map(d => perft(pos, d)), [48, 2039, 97862]);
});

test('perft on an en passant / promotion position', () => {
  const pos = Chess.createPosition('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.deepStrictEqual([1, 2, 3, 4].map(d => perft(pos, d)), [14, 191, 2812, 43238]);
});

test("fool's mate is checkmate", () => {
  const g = Chess.createGame();
  for (const [f, t] of [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4'], ['d8', 'h4']]) {
    const m = g.moves(Chess.parseSq(f)).find(x => x.to === Chess.parseSq(t));
    g.play(m);
  }
  assert.strictEqual(g.result, 'b');
  assert.strictEqual(g.reason, 'checkmate');
  assert.strictEqual(g.history[3].san, 'Qh4#');
});

test('AI finds mate in one', () => {
  const pos = Chess.createPosition('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const m = Chess.search(pos, { depth: 2, timeMs: 2000 });
  assert.strictEqual(Chess.sqName(m.to), 'a8');
});

test('AI takes a hanging queen', () => {
  const pos = Chess.createPosition('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  const m = Chess.search(pos, { depth: 3, timeMs: 2000 });
  assert.strictEqual(Chess.sqName(m.to), 'd5');
});

test('undo restores the position', () => {
  const g = Chess.createGame();
  const before = JSON.stringify(g.pos);
  g.play(g.moves()[0]);
  g.undo();
  assert.strictEqual(JSON.stringify(g.pos), before);
});

test('stalemate is a draw', () => {
  const g = Chess.createGame('k7/2K5/8/8/8/8/8/1Q6 w - - 0 1');
  g.play(g.moves().find(x => x.piece === 'Q' && Chess.sqName(x.to) === 'b6'));
  assert.strictEqual(g.result, 'draw');
  assert.strictEqual(g.reason, 'stalemate');
});

test('hard search finishes within its time budget', () => {
  const pos = Chess.createPosition('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const t = Date.now();
  const m = Chess.search(pos, { depth: 5, timeMs: 1500 });
  assert.ok(m);
  assert.ok(Date.now() - t < 2500);
});
