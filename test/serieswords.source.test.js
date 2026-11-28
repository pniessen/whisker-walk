// The series-words snapshot, part 5: two checks ON the snapshot.
//
// 1. COVERAGE. Every word in src/clanwords.js's shown tables is somewhere in
//    the recorded snapshots, so a table entry can never go unrecorded; and
//    every export of clanwords.js is on one of two lists here, so a new table
//    has to be looked at. The exports the snapshot never exercises are printed
//    (not failed).
//
// 2. LINES NOT REACHED. Some lines are written inside a closure (a fight's
//    end, the chase back over a border, a mark prompt) and cannot be called
//    from a test without changing src/. Each such template is pinned here as
//    SOURCE TEXT instead (`${}` for each inserted value), with the file it is
//    in, in test/fixtures/series-words-on-source.json. A pinned template must
//    still be written somewhere under src/ (any file: moving it is fine), or
//    have become reachable and recorded in one of the output snapshots.
//
//    This one fixture is a to-do list, not the game. When the word refactor
//    makes one of these lines reachable: record its OUTPUT in the fitting
//    serieswords test first, then re-record this fixture so the entry leaves
//    the list. Never re-record it to hide a line that changed.
//
//    A new line in src/ that matches the search and is not recorded anywhere
//    is printed, not failed (other work adds lines all the time).
//
// See test/serieswords.test.js for what the snapshot is for and for the
// re-record switch (UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords;
// run it twice when this fixture is being re-recorded, because this file reads
// the other five).
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as words from '../src/clanwords.js';
import { checkAgainstFixture, readFixture, stringsIn, literalsIn, sorted, uniq, UPDATING } from './helpers/serieswords.js';

const OUTPUT_FIXTURES = ['series-words-on.json', 'series-words-on-play.json', 'series-words-on-home.json', 'series-words-on-world.json', 'series-words-on-tutorial.json'];
const SOURCE_FIXTURE = 'series-words-on-source.json';

// Printed straight to the run's output: vitest keeps a passing test's console quiet.
const say = (text) => process.stdout.write(`${text}\n`);

const recorded = OUTPUT_FIXTURES.flatMap((f) => stringsIn(readFixture(f)));
const everything = recorded.join('\n');
const tokens = new Set(everything.split(/[^A-Za-z]+/).filter(Boolean));

// ---- 1. coverage ------------------------------------------------------------

// How each shown table's words must appear. 'whole': the word or line itself,
// inside some recorded string. 'first': as the first half of a recorded name
// (Moss in Mossstar, MossClan). 'last': as the ending of a recorded name.
const SHOWN = {
  PREFIXES: 'first',
  CAT_PREFIXES: 'first',
  RIVAL_PREFIXES: 'first',
  HOMAGE_PREFIXES: 'first',
  CLAN_CAT_PREFIXES: 'first',
  WARRIOR_SUFFIXES: 'last',
  RANK_SUFFIX: 'last',
  CLAN_SUFFIX: 'last',
  RANK_WORDS: 'whole',
  OUTSIDE_WORDS: 'whole',
  PLACE_WORDS: 'whole',
  HOME_LINES: 'whole',
};
// Exports that are not shown as they stand: a deny list, spare names, drawings.
const NOT_SHOWN = ['DENIED_NAMES', 'HOMAGE_CHOICES', 'EMBLEMS'];

const valuesOf = (v) => (typeof v === 'string' ? [v] : v instanceof Set ? [...v] : Array.isArray(v) ? v.flatMap(valuesOf) : v && typeof v === 'object' ? Object.values(v).flatMap(valuesOf) : []);
const appears = {
  whole: (w) => recorded.some((s) => s.includes(w)),
  first: (w) => [...tokens].some((t) => t.startsWith(w) && t.length > w.length),
  last: (w) => [...tokens].some((t) => t.endsWith(w) && t.length > w.length && /^[A-Z]/.test(t)),
};

describe('series words: nothing in the word tables goes unrecorded', () => {
  it('every export of clanwords.js is on the shown list or the not-shown list', () => {
    const known = [...Object.keys(SHOWN), ...NOT_SHOWN];
    const fresh = Object.keys(words).filter((k) => !known.includes(k));
    expect(fresh, `new export(s) of src/clanwords.js: ${fresh.join(', ')}. Add each to SHOWN (and record its words in a serieswords snapshot) or to NOT_SHOWN, in test/serieswords.source.test.js.`).toEqual([]);
    expect(known.filter((k) => !(k in words))).toEqual([]);
  });

  it('every word of every shown table is in the recorded snapshots', () => {
    const missing = [];
    for (const [name, how] of Object.entries(SHOWN)) {
      for (const w of valuesOf(words[name])) if (!appears[how](w)) missing.push(`${name}: ${w}`);
    }
    expect(missing, `table words no snapshot records:\n${missing.join('\n')}\n`).toEqual([]);
  });

  it('every rank, outside and place word is recorded inside a line, not only as a bare word', () => {
    const bare = [];
    for (const name of ['RANK_WORDS', 'OUTSIDE_WORDS', 'PLACE_WORDS']) {
      for (const [key, w] of Object.entries(words[name]).flatMap(([k, v]) => valuesOf(v).map((x) => [k, x]))) {
        if (name === 'PLACE_WORDS' && (key === 'roofs' || key === 'market')) continue; // plain words in both sets, shown as a bare name
        if (!recorded.some((s) => s.includes(w) && s !== w && /\s/.test(s.replace(w, '').trim()))) bare.push(`${name}: ${w}`);
      }
    }
    expect(bare).toEqual([]);
  });

  it('lists the exports the snapshot never exercises (never fails)', () => {
    const lines = [];
    for (const name of NOT_SHOWN) {
      const all = uniq(valuesOf(words[name]));
      const seen = all.filter((w) => appears.whole(w));
      lines.push(`${name}: ${seen.length} of ${all.length} values appear in a recorded string`);
    }
    say(`[series words] exports of clanwords.js the snapshot does not exercise:\n  ${lines.join('\n  ')}`);
    expect(lines.length).toBe(NOT_SHOWN.length);
  });
});

// ---- 2. lines not reached ---------------------------------------------------

// Files whose words are not part of the switch (the word tables themselves;
// the hints' and tips' rules, whose words are in tutorialwords.js; a list of
// field notes that are not shown to anyone). 2026-11-17: tutorialwords.js is
// no longer skipped: its lines are recorded in series-words-on-tutorial.json.
const SKIP_FILES = ['src/clanwords.js', 'src/hints.js', 'src/game/tips.js', 'src/game/session.js'];
// Words that sit beside the series vocabulary in a line.
const SEARCH = /patrol|\bborders?\b|intruder|trespass|\brivals?\b|\ball(y|ies)\b|\bcamp\b|territor|scent|\bmarks?\b|star name|truce|\bmeeting\b|great oak|sun-warmed|\bland\b|chased|\bfacing\b|faced down|shook it off|ran back|won this time|lets you pass|blocks your path|leading the way/i;
// Not shown to a player (console and thrown messages, shader code), or about
// the yard dog, which chases too.
const NOT_FOR_PLAYERS = /^Whisker Walk:|^border post \$\{\}|unknown style|\bvec[234]\b|\bdog\b/;

const textOf = (literal) => literal.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
// The fixed pieces of a template, between its inserted values.
const piecesOf = (text) => text.split('${}').map((p) => p.replace(/\\(['"`])/g, '$1').trim()).filter((p) => /[A-Za-z]{3}/.test(p));
const isRecorded = (text) => {
  const pieces = piecesOf(text);
  return pieces.length > 0 && pieces.every((p) => everything.includes(p));
};

function scan() {
  const out = [];
  for (const file of sorted(globSync('src/**/*.js').map((f) => f.split('\\').join('/')))) {
    if (SKIP_FILES.includes(file)) continue;
    for (const lit of literalsIn(readFileSync(file, 'utf8'))) {
      const text = textOf(lit);
      if (!/\s/.test(text) || !SEARCH.test(text) || NOT_FOR_PLAYERS.test(text)) continue;
      out.push({ file, text });
    }
  }
  return out;
}

describe('series words: lines the snapshot cannot reach are pinned as source text', () => {
  const found = scan();
  const notReached = uniq(found.filter((l) => !isRecorded(l.text)).map((l) => `${l.file} :: ${l.text}`));

  it('every pinned template is still written under src/, or is now recorded as output', () => {
    checkAgainstFixture(SOURCE_FIXTURE, UPDATING ? {
      about: 'Lines with series-adjacent words that are built inside a closure, pinned as source text. A to-do list for the word refactor; see test/serieswords.source.test.js.',
      notReached,
    } : readFixture(SOURCE_FIXTURE));
    const pinned = readFixture(SOURCE_FIXTURE).notReached;
    const written = new Set(found.map((l) => l.text));
    const gone = pinned.filter((entry) => {
      const text = entry.slice(entry.indexOf(' :: ') + 4);
      return !written.has(text) && !isRecorded(text);
    });
    expect(gone, `pinned line(s) no longer written anywhere under src/ and not recorded as output:\n${gone.join('\n')}\n`).toEqual([]);
  });

  it('lists new unrecorded lines (never fails)', () => {
    const pinned = new Set(readFixture(SOURCE_FIXTURE).notReached.map((e) => e.slice(e.indexOf(' :: ') + 4)));
    const fresh = notReached.filter((e) => !pinned.has(e.slice(e.indexOf(' :: ') + 4)));
    if (fresh.length) say(`[series words] lines in src/ that match the search and are recorded nowhere:\n  ${fresh.join('\n  ')}`);
    expect(Array.isArray(fresh)).toBe(true);
  });
});
