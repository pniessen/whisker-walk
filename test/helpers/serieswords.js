// Shared by the test/serieswords*.test.js files: the snapshot of every word
// today's game shows that comes from, or is built with, the series vocabulary
// (src/clanwords.js). See test/serieswords.test.js for what the snapshot is
// for and when it may be re-recorded.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { expect } from 'vitest';

// The one re-record switch. Set it ONLY when the owner or the older
// playtester has asked for a wording change in the "on" game:
//   UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords
export const UPDATING = process.env.UPDATE_SERIES_SNAPSHOT === '1';

// The re-record switch of the everyday ('off') set's fixtures, and of the
// fixture for the lines added after the first snapshot. Those words are the
// older playtester's picks: re-record when she or the owner changes one.
//   UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords
export const UPDATING_OFF = process.env.UPDATE_OFF_SNAPSHOT === '1';

// Code-unit order, the same on every machine (never localeCompare).
export const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const sorted = (list) => [...list].sort(byCode);
export const uniq = (list) => sorted(new Set(list));

// A plain object with its keys in code-unit order (arrays keep their order).
export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of sorted(Object.keys(v))) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|#x27);/g, (m) => ENTITIES[m]);
const READ_ATTRS = /\s(aria-label|title|alt|placeholder)="([^"]*)"/g;

// What a player can read in a piece of HTML, in document order: each run of
// text between tags, and each aria-label / title / alt / placeholder value
// (as "[aria-label] ..."). Markup, classes and ids are left out on purpose, so
// a restyle never moves the snapshot; a changed word always does. There is no
// jsdom in this project, and the game's own builders return plain strings.
export function htmlText(html) {
  const out = [];
  const push = (s) => {
    const t = decode(s).replace(/\s+/g, ' ').trim();
    if (t) out.push(t);
  };
  const src = String(html ?? '');
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { push(src.slice(i)); break; }
    push(src.slice(i, lt));
    const gt = src.indexOf('>', lt);
    if (gt < 0) break;
    const tag = src.slice(lt, gt + 1);
    for (const m of tag.matchAll(READ_ATTRS)) if (m[2].trim()) push(`[${m[1]}] ${m[2]}`);
    i = gt + 1;
  }
  return out;
}

// Every leaf of a snapshot as "path" -> value, for a readable diff.
function leaves(v, path, out) {
  if (Array.isArray(v)) {
    if (v.length === 0) out.set(path, '[]');
    v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  } else if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 0) out.set(path, '{}');
    for (const k of keys) leaves(v[k], path ? `${path}.${k}` : k, out);
  } else {
    out.set(path, v);
  }
  return out;
}

// "path: expected X, received Y" for every leaf that differs, in path order.
export function differences(expected, received) {
  const a = leaves(expected, '', new Map());
  const b = leaves(received, '', new Map());
  const show = (v) => (v === undefined ? '(nothing)' : JSON.stringify(v));
  const out = [];
  for (const k of uniq([...a.keys(), ...b.keys()])) {
    if (a.get(k) !== b.get(k) || a.has(k) !== b.has(k)) out.push(`${k}: expected ${show(a.get(k))}, received ${show(b.get(k))}`);
  }
  return out;
}

const fixtureUrl = (name) => new URL(`../fixtures/${name}`, import.meta.url);

export function readFixture(name) {
  return JSON.parse(readFileSync(fixtureUrl(name), 'utf8'));
}

// Compares `snapshot` with the committed fixture, or writes it when the
// re-record switch is set. A JSON round trip first, so what is compared is
// exactly what a fixture can hold.
//
// `updating` is the re-record switch for THIS fixture. It is the family's
// switch unless the caller names another: the everyday set's fixtures
// (series-words-off*.json) have their own, UPDATING_OFF, so recording one set
// never touches the other's files.
export function checkAgainstFixture(name, snapshot, updating = UPDATING) {
  const received = JSON.parse(JSON.stringify(snapshot));
  if (updating) {
    writeFileSync(fixtureUrl(name), `${JSON.stringify(received, null, 1)}\n`);
    return;
  }
  if (!existsSync(fixtureUrl(name))) {
    throw new Error(`test/fixtures/${name} is missing. It is recorded with UPDATE_SERIES_SNAPSHOT=1, and only when the owner or the older playtester has asked for a wording change in the "on" game.`);
  }
  const diffs = differences(readFixture(name), received);
  const head = `${diffs.length} series-word ${diffs.length === 1 ? 'string differs' : 'strings differ'} from test/fixtures/${name}:`;
  expect(diffs, `${head}\n${diffs.slice(0, 60).join('\n')}${diffs.length > 60 ? `\n… and ${diffs.length - 60} more` : ''}\n`).toEqual([]);
}

// Every string in a snapshot (values only, not keys).
export function stringsIn(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) stringsIn(x, out);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) stringsIn(v[k], out);
  return out;
}

// The text of every string and template literal in a source file, comments
// skipped, each `${...}` shown as ${} (the scanner test/clanwords.test.js uses,
// kept in step with it by hand; that one blanks the expression instead).
export function literalsIn(src) {
  const out = [];
  const code = (i, inExpr) => {
    let depth = 0;
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (c === '/' && n === '/') {
        while (i < src.length && src[i] !== '\n') i++;
      } else if (c === '/' && n === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? src.length : end + 2;
      } else if (c === '"' || c === "'") {
        let j = i + 1, buf = '';
        while (j < src.length && src[j] !== c && src[j] !== '\n') {
          if (src[j] === '\\') { buf += src.slice(j, j + 2); j += 2; } else buf += src[j++];
        }
        out.push(buf);
        i = j + 1;
      } else if (c === '`') {
        i = template(i + 1);
      } else if (c === '{') {
        depth++; i++;
      } else if (c === '}') {
        if (inExpr && depth === 0) return i + 1;
        depth--; i++;
      } else {
        i++;
      }
    }
    return i;
  };
  const template = (i) => {
    let buf = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { buf += src.slice(i, i + 2); i += 2; }
      else if (c === '`') { out.push(buf); return i + 1; }
      else if (c === '$' && src[i + 1] === '{') { buf += '${}'; i = code(i + 2, true); }
      else { buf += c; i++; }
    }
    out.push(buf);
    return i;
  };
  code(0, false);
  return out;
}

// A segment of a whole screen is kept in the snapshot when it carries a word
// from the tables (given by the caller, so this file imports nothing from
// src/) or one of the words the game writes beside them. The rest of a screen
// (its ordinary buttons, the guided walk's lines) is left out, so the snapshot
// moves only when one of these words does.
export const WORDS_BESIDE = ['patrol', 'border', 'intruder', 'territor', 'camp', 'scent', 'star name', 'allies', 'land', 'edition', 'war paint', 'fighting moves'];
export function seriesFilter(tableWords, names = []) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const whole = new RegExp(`\\b(${tableWords.map(esc).join('|')})s?\\b`, 'i');
  const beside = new RegExp(WORDS_BESIDE.map(esc).join('|'), 'i');
  return (text) => whole.test(text) || beside.test(text) || names.some((n) => text.includes(n));
}
