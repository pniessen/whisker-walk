// The everyday word set ('off', src/offclanwords.js) for tests, and the list
// of words it must never show.
//
// No build holds the 'off' set yet (the switch is a later phase), so a test
// that wants it puts it in use here and takes it out again afterwards.
import * as off from '../../src/offclanwords.js';
import * as on from '../../src/clanwords.js';
import { addWordSet, removeWordSet, setSeriesMode, seriesMode, SERIES_ON } from '../../src/wordset.js';

export const OFF = off.OFF_ID;
export const offWords = off;

// fn() with the everyday words in use; the family's words are back afterwards
// and the set is taken out again, whatever fn does.
export function withOffWords(fn) {
  if (seriesMode() !== SERIES_ON) throw new Error('withOffWords: already inside another word set');
  addWordSet(OFF, off);
  try {
    setSeriesMode(OFF);
    return fn();
  } finally {
    setSeriesMode(SERIES_ON);
    removeWordSet(OFF);
  }
}

// ---- the words the everyday game never shows ----------------------------------
//
// Each entry: [what it is, a pattern]. Read from the family's tables where a
// table holds the word, so a word added there is banned here the same day.
// ONE word of the family's set is allowed on purpose: "loner" (the owner's
// decision, 2026-11-18). "elder" is banned like the rest. One place name is
// the same in both sets on purpose, the Rooftops' (plain words, Rooftops step
// 2), so it is no leak; any other place word both sets share still is.
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALLOWED = new Set(['loner']);
const SAME_IN_BOTH = new Set([on.PLACE_WORDS.roofs].filter((w) => w && w === off.PLACE_WORDS.roofs));
const tableWords = [...new Set([
  ...Object.values(on.RANK_WORDS), ...Object.values(on.OUTSIDE_WORDS), ...Object.values(on.PLACE_WORDS),
])].filter((w) => !ALLOWED.has(w) && !SAME_IN_BOTH.has(w));
const onFirstHalves = [...new Set([
  ...on.PREFIXES, ...Object.values(on.CAT_PREFIXES), ...Object.values(on.RIVAL_PREFIXES),
  ...Object.values(on.HOMAGE_PREFIXES), ...Object.values(on.HOMAGE_CHOICES).flat(), ...Object.values(on.CLAN_CAT_PREFIXES).flat(),
])];
const onEndings = [...new Set([...on.WARRIOR_SUFFIXES, ...Object.values(on.RANK_SUFFIX)])];
// every name the family's set can compose, and every group name it can make
const onNames = new Set();
for (const p of onFirstHalves) for (const e of [...onEndings, on.CLAN_SUFFIX]) onNames.add(p + e);

export const BANNED = Object.freeze([
  // the family's rank, outside-cat and place words (kit, apprentice, warrior, elder, queen, medicine cat, deputy, leader, rogue, kittypet, Twolegplace)
  ['a rank, outside-cat or place word of the family\'s set', new RegExp(`\\b(${tableWords.map(esc).join('|')})s?\\b`, 'i')],
  ['the group word', new RegExp(esc(on.CLAN_SUFFIX), 'i')],
  ['Twoleg', /twoleg/i],
  // a capitalised word ending in a rank ending: Mosskit, Mosspaw, Mossstar
  ['a name that ends in a rank ending', new RegExp(`\\b[A-Z][a-z]+(${Object.values(on.RANK_SUFFIX).map(esc).join('|')})\\b`)],
  ['a star name', /\bstar names?\b/i],
  // the five group names of the family's set, as a name word of their own (the
  // capital matters: "cliff dens" and "dusk" are ordinary words)
  ['a group name word of the family\'s set', new RegExp(`\\b(${Object.values(on.HOMAGE_PREFIXES).map(esc).join('|')})\\b`)],
  // the doing and place words she replaced
  ['a word she replaced (patrol, camp, intruder, truce, meeting, great oak, sun-warmed)', /\b(patrol\w*|camps?|intruders?|truce|meeting|great oak|sun-warmed)\b/i],
  ['a title of the books\' world', /\b(warriors?|medicine|healer|highrock|gathering)\b/i],
]);

// Why a string shows a banned word, or null.
export function bannedIn(text) {
  for (const [what, re] of BANNED) {
    const m = text.match(re);
    if (m) return `${what}: "${m[0]}"`;
  }
  for (const token of text.split(/[^A-Za-z]+/)) if (onNames.has(token)) return `a composed name of the family's set: "${token}"`;
  return null;
}

function leaves(v, path, out) {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (v instanceof Set) [...v].forEach((x, i) => leaves(x, `${path}{${i}}`, out));
  else if (typeof v === 'function') out.push([`${path}()`, String(v('A', 'B', 'C', 'D'))]);
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) leaves(v[k], path ? `${path}.${k}` : k, out);
  else if (typeof v === 'string') out.push([path, v]);
  return out;
}

// Every string in `value` that shows a banned word, as "path: text  <- why".
// `ignore` lists paths (regular expressions) whose strings the TEST wrote
// itself or that are never drawn, and whole strings (given as strings) where
// a banned word is an ordinary word of the sentence.
export function bannedLeaks(value, ignore = []) {
  const out = [];
  for (const [path, text] of leaves(value, '', [])) {
    if (ignore.some((x) => (typeof x === 'string' ? x === text : x.test(path)))) continue;
    const why = bannedIn(text);
    if (why) out.push(`${path}: ${JSON.stringify(text)}  <- ${why}`);
  }
  return out;
}

// How many strings of `value` carry a word only the everyday set has: a run
// that found nothing banned must also have shown plenty of these.
export function offWordCount(value) {
  const re = new RegExp(`\\b(${[off.CLAN_SUFFIX, ...Object.values(off.RANK_WORDS), off.OUTSIDE_WORDS.met, off.OUTSIDE_WORDS.house, off.PLACE_WORDS.town, 'home base', 'the bounds'].map(esc).join('|')})\\b`);
  return leaves(value, '', []).filter(([, text]) => re.test(text)).length;
}
