// Builds HangulTypewriter.jsx from src/panel.jsx with src/expression.js inlined.
// The output is pure ASCII (\uXXXX escapes) so ExtendScript reads it the same with or without a BOM.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const expr = readFileSync(here('src/expression.js'), 'utf8');
const panel = readFileSync(here('src/panel.jsx'), 'utf8');
const ascii = (s) => s.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const out = ascii(panel.replace('__EXPRESSION__', () => JSON.stringify(expr)));
writeFileSync(here('HangulTypewriter.jsx'), out);
console.log('wrote HangulTypewriter.jsx', out.length, 'bytes');
