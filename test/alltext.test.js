// One banned-word scan over EVERY string literal in src/**/*.js (engineering
// review 3, S1; 2026-11-27). test/allwords.test.js reads the exported tables of
// the *words.js files; this reads the SOURCE of every file, so text written
// straight into a journal page (*pages.js), the stray and clan name lists, the
// clan phrases or any screen is covered too, with no per-area test needed.
//
// The list is the owner's (test/helpers/offwords.js BANNED): the words the
// everyday set ('off') must never show. A literal that is not text a child can
// read is skipped: import paths, URLs, CSS class names and selectors, ids and
// keys (one token with no space, or lower-case-dash/underscore/dot tokens),
// regular-expression text, event names and file names. Everything else is read.
// The family's set ('on') is SUPPOSED to use the words, so a file the family's
// set owns (clanwords.js, the words tables) is not the point: the everyday set's
// side of those files is allwords.test.js and offwords.test.js. Here, a hit in a
// file that is NOT a word table is a line that never goes through a word table,
// so the everyday set would show it as written.
//
// Hits already known are listed in KNOWN_HITS (file :: word) with a reason.
// The test passes with them; it fails if one disappears or a new one appears.
// Game text is not edited by this test: the owner decides each hit.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { bannedIn } from './helpers/offwords.js';
import { literalsIn } from './helpers/serieswords.js';

const norm = (f) => f.split('\\').join('/');
const FILES = globSync('src/**/*.js').map(norm).sort();
// the family's own set and the table files: allwords.test.js and offwords.test.js read them in both sets
const SETS_THEMSELVES = new Set(['src/clanwords.js', 'src/offclanwords.js']);

const isReadable = (s) => {
  const t = s.trim();
  if (t.length < 3) return false;
  if (/^(\.{0,2}\/|https?:|data:|#|\.|@)/.test(t) && !/\s/.test(t)) return false; // paths, URLs, selectors
  if (/^[\w$.:/#@\[\]=*~>+,-]+$/.test(t) && !/^[A-Z][a-z]+$/.test(t) && !/[A-Z][a-z]/.test(t.slice(1))) return false; // one token: ids, keys, classes, events, files
  if (/^[\w.|:${}-]+$/.test(t.replace(/\$\{\}/g, 'X')) && !/\s/.test(t)) return false; // ids built from a template: "truce-${}", "a|intruder|b"
  if (/^\^|\$$|\\[dwsb]|\(\?:/.test(t)) return false; // regex text
  return true;
};

const scanFile = (file) => {
  const hits = [];
  let strings = 0;
  for (const raw of literalsIn(readFileSync(file, 'utf8'))) {
    if (!isReadable(raw)) continue;
    strings++;
    // markup: attributes (class, id, svg numbers) are not read text
    const text = raw.replace(/\$\{\}/g, ' ').replace(/\\?"[^"]*\\?"/g, (m) => (/\s/.test(m) ? m : ' ')).replace(/\b[\w-]+=\\?"[^"]*\\?"/g, ' ').replace(/<[^>]*>/g, ' ');
    const why = bannedIn(text);
    if (why) hits.push({ id: `${file} :: ${why.split('"')[1].toLowerCase()}`, text: raw.slice(0, 80) });
  }
  return { hits, strings };
};

// KNOWN_HITS: "file :: word" -> one-line reason. Filled in from the first run.
const KNOWN_HITS = new Map([
  ["src/clanphrases.js :: camp", "the family's line; the everyday set replaces it through phrase()/line() (offwords.test.js), only the raw default stays"],
  ["src/clanphrases.js :: patrol", "the family's line; the everyday set replaces it through phrase()/line() (offwords.test.js), only the raw default stays"],
  ["src/clanphrases.js :: intruders", "the family's line; the everyday set replaces it through phrase()/line() (offwords.test.js), only the raw default stays"],
  ["src/clanphrases.js :: gathering", "the family's line; the everyday set replaces it through phrase()/line() (offwords.test.js), only the raw default stays (the birthday line)"],
  ["src/game/session.js :: patrol", "a code comment inside a string (a doc line), never drawn"],
  ["src/game/session.js :: camp", "a code comment inside a string (a doc line), never drawn"],
  ["src/skills.js :: dusk", "OWNER DECIDES: 'Dusk' is the dusk-lighting skill, also the name word of DuskClan; shown in the everyday set as written"],
  ["src/tutorialwords.js :: camp", "the family's 'camp' line, the same one allwords.test.js lists (the everyday set overrides it through line())"],
  ["src/ui/homebase.js :: dusk", "OWNER DECIDES: the Day/Dusk switch label in Change place, shown in the everyday set as written"],
  ["src/world/crystalfindwords.js :: camp", "OWNER DECIDES: find line says 'the camp'; a *findwords.js table with no everyday version (allwords.test.js does not see it in its tables)"],
  ["src/world/junglecritterwords.js :: gathering", "OWNER DECIDES: 'a gathering call', ordinary English but on the banned list"],
  ["src/world/reeffindwords.js :: elders", "OWNER DECIDES: 'the elders under Silverpelt' (a Warriors star name), shown in the everyday set as written"],
  ["src/world/snowvillestrayswords.js :: patrol", "Clan-flavoured line of a pair (a stray cat, calm as a night patrol): the everyday line is plain"],
  ["src/world/snowvillecritterwords.js :: patrol", "OWNER DECIDES: 'a river patrol', ordinary English but on the banned list"],
  ["src/world/snowvillefindwords.js :: patrol", "OWNER DECIDES: 'quiet as a patrol', ordinary English but on the banned list"],
  ["src/world/treehousecritterwords.js :: patrol", "OWNER DECIDES: 'a dawn patrol call', ordinary English but on the banned list"],
  ["src/world/treehousefindwords.js :: gathering", "OWNER DECIDES: 'a signal for a gathering', ordinary English but on the banned list"],
]);

describe('every string literal in src/**/*.js, against the everyday set\'s banned words', () => {
  const found = new Map();
  let scanned = 0, strings = 0;
  for (const f of FILES) {
    if (SETS_THEMSELVES.has(f)) continue;
    const r = scanFile(f);
    scanned++;
    strings += r.strings;
    for (const h of r.hits) if (!found.has(h.id)) found.set(h.id, h.text);
  }

  it('reads the source files (and the ones the review named)', () => {
    expect(FILES.length).toBeGreaterThan(150);
    expect(strings).toBeGreaterThan(5000);
    for (const f of ['src/junglepages.js', 'src/treehousepages.js', 'src/snowvillepages.js', 'src/moonpages.js', 'src/marketpages.js', 'src/reefpages.js', 'src/crystalpages.js', 'src/greenhousepages.js', 'src/lighthousepages.js', 'src/roofspages.js', 'src/straynames.js', 'src/clannames.js', 'src/clanphrases.js']) {
      expect(FILES, f).toContain(f);
    }
    process.stdout.write(`alltext: ${scanned} files, ${strings} readable strings, ${found.size} hits\n`);
  });

  it('shows no banned word that is not a known hit', () => {
    expect([...found].filter(([id]) => !KNOWN_HITS.has(id)).map(([id, t]) => `${id}  <- ${JSON.stringify(t)}`)).toEqual([]);
  });

  it('every known hit still hits (an entry that no longer does should be removed)', () => {
    expect([...KNOWN_HITS.keys()].filter((k) => !found.has(k))).toEqual([]);
  });
});
