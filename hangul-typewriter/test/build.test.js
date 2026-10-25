// The shipped panel must be current with src/ and parse as ES3 (ExtendScript).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

test('HangulTypewriter.jsx is built from src and is ES3 + ASCII', () => {
  const before = readFileSync(here('../HangulTypewriter.jsx'), 'utf8');
  execFileSync(process.execPath, [here('../build.js')]);
  const after = readFileSync(here('../HangulTypewriter.jsx'), 'utf8');
  assert.equal(before, after, 'run `npm run build` and commit HangulTypewriter.jsx');
  assert.match(after, /^[\x00-\x7f]*$/);
  acorn.parse(after, { ecmaVersion: 3 });
});

test('expression parses as ES3 (legacy ExtendScript expression engine)', () => {
  acorn.parse(readFileSync(here('../src/expression.js'), 'utf8'), { ecmaVersion: 3, allowReturnOutsideFunction: true });
});
