// A STAND-IN word set, for tests only, and the check that goes with it.
//
// The game reads its series words through one door (src/wordset.js). To prove
// that everything on screen follows the set in use, the tests put this
// stand-in set in use and look for any word of the family's set ("on") that
// is still shown: such a word was read once at start-up, or was not read
// through the door at all.
//
// THESE ARE NOT THE WORDS OF THE PLAIN GAME. The owner and his daughter will
// choose those. Every word here is nonsense on purpose (Xbaba, qbabe, Zzmob),
// made by counting, so nobody can mistake it for a proposal and none can
// equal a real word. The set lives under test/ and is never part of a build.
import * as on from '../../src/clanwords.js';
import { addWordSet, removeWordSet, setSeriesMode, seriesMode, SERIES_ON } from '../../src/wordset.js';
import { PHRASE_IDS, phrase } from '../../src/clanphrases.js';

export const STAND_IN = 'stand-in';

// Counting in made-up syllables: baba, babe, babi ... Letters only, because a
// name built from these must pass the game's own pet-name check.
const CONS = 'bdjlmrvz';
const VOWELS = 'aeiou';
const syllable = (n) => CONS[Math.floor(n / VOWELS.length) % CONS.length] + VOWELS[n % VOWELS.length];
const SYLLABLES = CONS.length * VOWELS.length;
const code = (n) => syllable(Math.floor(n / SYLLABLES)) + syllable(n % SYLLABLES);

const mapValues = (o, fn) => Object.fromEntries(Object.keys(o).map((k, i) => [k, fn(o[k], k, i)]));

// Every first half the 'on' set has, in every pool.
const onPrefixWords = () => [...new Set([
  ...on.PREFIXES, ...Object.values(on.CAT_PREFIXES), ...Object.values(on.RIVAL_PREFIXES),
  ...Object.values(on.HOMAGE_PREFIXES), ...Object.values(on.HOMAGE_CHOICES).flat(),
  ...Object.values(on.CLAN_CAT_PREFIXES).flat(),
])];
// Every ending a name can have in the 'on' set.
const onEndings = () => [...new Set([...on.WARRIOR_SUFFIXES, ...Object.values(on.RANK_SUFFIX)])];

function build() {
  const firsts = new Map(onPrefixWords().map((w, i) => [w, `X${code(i)}`]));
  const endings = new Map(onEndings().map((w, i) => [w, `q${code(i)}`]));
  const first = (w) => firsts.get(w);
  const PHRASES = Object.fromEntries(PHRASE_IDS.map((id) => [id, (...args) => `[${id}${args.map((a) => ` ${a}`).join('')}]`]));
  // A group's name in a different PATTERN from prefix + suffix, as the plain
  // game's will be: three words, the name word in the middle.
  PHRASES['group.name'] = (prefix) => `the ${prefix} Zzmob`;
  return {
    ...on,
    PREFIXES: Object.freeze(on.PREFIXES.map(first)),
    CAT_PREFIXES: Object.freeze(mapValues(on.CAT_PREFIXES, first)),
    RIVAL_PREFIXES: Object.freeze(mapValues(on.RIVAL_PREFIXES, first)),
    HOMAGE_PREFIXES: Object.freeze(mapValues(on.HOMAGE_PREFIXES, first)),
    CLAN_CAT_PREFIXES: Object.freeze(mapValues(on.CLAN_CAT_PREFIXES, (list) => Object.freeze(list.map(first)))),
    WARRIOR_SUFFIXES: Object.freeze(on.WARRIOR_SUFFIXES.map((w) => endings.get(w))),
    RANK_SUFFIX: Object.freeze(mapValues(on.RANK_SUFFIX, (w) => endings.get(w))),
    CLAN_SUFFIX: 'Zzmob',
    RANK_WORDS: Object.freeze(mapValues(on.RANK_WORDS, (_w, _k, i) => `zzrank${code(i)}`)),
    // 'player' and 'house' are one word in the 'on' set and two here: a set may
    // word them differently.
    OUTSIDE_WORDS: Object.freeze(mapValues(on.OUTSIDE_WORDS, (_w, _k, i) => `zzout${code(i)}`)),
    PLACE_WORDS: Object.freeze(mapValues(on.PLACE_WORDS, (_w, _k, i) => `Zzburg${code(i)}`)),
    HOME_LINES: Object.freeze(mapValues(on.HOME_LINES, (_w, _k, i) => `zzline ${code(i)} zzhere`)),
    DENIED_NAMES: new Set(),
    PHRASES: Object.freeze(PHRASES),
  };
}

export const standInWords = build;

// fn() with the stand-in set in use; the 'on' set is back afterwards, and the
// stand-in is taken out again, whatever fn does.
export function withStandInWords(fn) {
  if (seriesMode() !== SERIES_ON) throw new Error('withStandInWords: already inside another word set');
  addWordSet(STAND_IN, build());
  try {
    setSeriesMode(STAND_IN);
    return fn();
  } finally {
    setSeriesMode(SERIES_ON);
    removeWordSet(STAND_IN);
  }
}

// ---- what counts as a word of the 'on' set ------------------------------------

const MARK = '\u0001';
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Worked out once, with the 'on' set in use.
function onMarkers() {
  if (seriesMode() !== SERIES_ON) throw new Error('onMarkers: read these with the "on" set in use');
  const wordList = [...Object.values(on.RANK_WORDS), ...Object.values(on.OUTSIDE_WORDS), ...Object.values(on.PLACE_WORDS), on.CLAN_SUFFIX];
  const names = new Set();
  for (const p of onPrefixWords()) for (const e of [...onEndings(), on.CLAN_SUFFIX]) names.add(p + e);
  // The fixed pieces of every line in the phrase table, between the values a
  // caller hands in. A long piece is looked for inside a string; a short one
  // (Pin, Run, allies) only as a whole string, since it can be part of
  // ordinary words.
  const long = new Set();
  const short = new Set();
  for (const id of PHRASE_IDS) {
    for (const piece of phrase(id, MARK, MARK, MARK, MARK, MARK, MARK).split(MARK).map((s) => s.trim())) {
      if (piece.length >= 12) long.add(piece);
      else if (/[A-Za-z]{3}/.test(piece)) short.add(piece);
    }
  }
  return {
    whole: new RegExp(`\\b(${wordList.map(esc).join('|')})s?\\b`, 'i'),
    names,
    groupEnding: new RegExp(`[A-Za-z]${esc(on.CLAN_SUFFIX)}\\b`),
    lines: Object.values(on.HOME_LINES),
    long: [...long],
    short,
  };
}
let markers = null;

function leaves(v, path, out) {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) leaves(v[k], path ? `${path}.${k}` : k, out);
  else if (typeof v === 'string') out.push([path, v]);
  return out;
}

// Why a string still shows a word of the 'on' set, or null.
export function onWordIn(text) {
  markers ??= onMarkers();
  const m = markers;
  const whole = text.match(m.whole);
  if (whole) return `the word "${whole[0]}"`;
  for (const token of text.split(/[^A-Za-z]+/)) {
    if (m.names.has(token)) return `the name "${token}"`;
  }
  if (m.groupEnding.test(text)) return `a group name ending in ${on.CLAN_SUFFIX}`;
  for (const line of m.lines) if (text.includes(line)) return `the home line "${line}"`;
  for (const piece of m.long) if (text.includes(piece)) return `the phrase "${piece}"`;
  if (m.short.has(text.trim())) return `the phrase "${text.trim()}"`;
  return null;
}

// Every string in `value` (a snapshot built with the stand-in set in use) that
// still shows a word of the 'on' set, as "path: text  <- why". `ignore` lists
// paths (regular expressions) whose strings the TEST wrote itself, such as a
// rank id used as a label.
export function leaksIn(value, ignore = []) {
  markers ??= onMarkers();
  const out = [];
  for (const [path, text] of leaves(value, '', [])) {
    if (ignore.some((re) => re.test(path))) continue;
    const why = onWordIn(text);
    if (why) out.push(`${path}: ${JSON.stringify(text)}  <- ${why}`);
  }
  return out;
}

// How many strings of `value` carry a stand-in word: a run that found no leak
// must also have shown plenty of these, or it proved nothing.
export function standInCount(value) {
  return leaves(value, '', []).filter(([, text]) => /Zzmob|zzrank|zzout|Zzburg|zzline|\bX[a-z]{4}|\[[a-z]+\.[A-Za-z.]+/.test(text)).length;
}
