// Runs src/expression.js the way AE would, against a fake layer, and checks the typed frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('../src/expression.js', import.meta.url)), 'utf8');
const P = '한글 타자 · ';

function run(text, { time = 0, controls = {}, progressAt } = {}) {
  const ctl = { '커서 표시': 0, '리듬 흔들림 (%)': 0, '문장부호 뒤 쉼 (초)': 0, ...controls };
  const effect = (name) => {
    const key = name.slice(P.length);
    if (key === '진행 (%)') {
      return () => ({ value: progressAt(time), valueAtTime: progressAt });
    }
    if (!(key in ctl)) throw new Error('no effect ' + name);
    return () => ({ value: ctl[key] });
  };
  let seed = 0;
  const seedRandom = (s) => { seed = s; };
  const random = () => ((seed * 9301 + 49297) % 233280) / 233280;
  const fn = new Function('value', 'effect', 'time', 'inPoint', 'thisComp', 'seedRandom', 'random',
    'return eval(' + JSON.stringify(SRC) + ')');
  return fn(text, effect, time, 0, { frameDuration: 1 / 30 }, seedRandom, random);
}

// 1타/초로 각 타수의 화면을 모은다
function frames(text, controls = {}) {
  const out = [];
  for (let s = 0; s < 40; s++) {
    const f = run(text, { time: s, controls: { '속도 (타/초)': 1, ...controls } });
    if (out[out.length - 1] !== f) out.push(f);
    if (f === text) break;
  }
  return out;
}

test('builds syllables jamo by jamo', () => {
  assert.deepEqual(frames('각'), ['ㄱ', '가', '각']);
  assert.deepEqual(frames('과'), ['ㄱ', '고', '과']);
  assert.deepEqual(frames('닭'), ['ㄷ', '다', '달', '닭']);
  assert.deepEqual(frames('뷁'), ['ㅂ', '부', '붸', '뷀', '뷁']);
});

test('dokkaebibul: next initial consonant shows as a final first', () => {
  assert.deepEqual(frames('가나'), ['ㄱ', '가', '간', '가나']);
  assert.deepEqual(frames('각시'), ['ㄱ', '가', '각', '갃', '각시']);
  assert.deepEqual(frames('안녕'), ['ㅇ', '아', '안', '안ㄴ', '안녀', '안녕']);
  assert.deepEqual(frames('아빠'), ['ㅇ', '아', '아ㅃ', '아빠']);
  assert.deepEqual(frames('가나', { '도깨비불': 0 }), ['ㄱ', '가', '가ㄴ', '가나']);
});

test('mixed text, spaces and emoji count as one stroke each', () => {
  assert.deepEqual(frames('A 나😀'), ['A', 'A ', 'A ㄴ', 'A 나', 'A 나😀']);
});

test('jamo off types whole syllables', () => {
  assert.deepEqual(frames('한글', { '자모 조합': 0 }), ['한', '한글']);
});

test('nothing before start, everything after', () => {
  assert.equal(run('한글', { time: 0.5, controls: { '시작 시간 (초)': 1 } }), '');
  assert.equal(run('한글', { time: 100 }), '한글');
});

test('punctuation pause delays the next stroke', () => {
  const c = { '속도 (타/초)': 1, '문장부호 뒤 쉼 (초)': 2 };
  assert.equal(run('a.b', { time: 2.5, controls: c }), 'a.');
  assert.equal(run('a.b', { time: 4, controls: c }), 'a.b');
});

test('jitter keeps strokes in order and still finishes', () => {
  const c = { '속도 (타/초)': 10, '리듬 흔들림 (%)': 100 };
  let prev = '';
  for (let t = 0; t < 5; t += 1 / 30) {
    const f = run('안녕하세요', { time: t, controls: c });
    assert.ok(f.length >= prev.length - 1);
    prev = f;
  }
  assert.equal(prev, '안녕하세요');
});

test('manual progress maps percent to strokes', () => {
  const c = { '수동 진행': 1 };
  assert.equal(run('각', { controls: c, progressAt: () => 0 }), '');
  assert.equal(run('각', { controls: c, progressAt: () => 50 }), '가'); // 1.5 → 2타
  assert.equal(run('각', { controls: c, progressAt: () => 100 }), '각');
});

test('cursor: solid while typing, blinks after, hides when asked', () => {
  const c = { '속도 (타/초)': 1, '커서 표시': 1, '커서 모양': 1, '커서 깜빡임 (회/초)': 1 };
  assert.equal(run('가나', { time: 1.6, controls: c }), '가|');
  assert.equal(run('가나', { time: 10.2, controls: c }), '가나|');
  assert.equal(run('가나', { time: 10.7, controls: c }), '가나');
  assert.equal(run('가나', { time: 10.2, controls: { ...c, '커서 모양': 3 } }), '가나▌');
  assert.equal(run('가나', { time: 10.2, controls: { ...c, '완료 후 커서 숨김 (초, 0=계속)': 2 } }), '가나');
});

test('missing controls fall back to defaults', () => {
  const f = new Function('value', 'effect', 'time', 'inPoint', 'thisComp', 'seedRandom', 'random',
    'return eval(' + JSON.stringify(SRC) + ')');
  const out = f('가', () => { throw new Error('none'); }, 100, 0, { frameDuration: 1 / 30 }, () => {}, () => 0.5);
  assert.ok(out === '가|' || out === '가');
});
