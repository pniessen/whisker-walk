// The series-words snapshot, part 6 (added 2026-11-17): the GUIDED FIRST WALK's
// words, the hints, the goals' "how" lines and the home screen's "next thing"
// line (src/tutorialwords.js, src/ui/nextthing.js).
//
// These lines are written in neutral words: none names a group, a rank or an
// outsider. They are recorded all the same, for two reasons. The family's
// game must keep every one of them; and several carry a slot that the game
// fills from the series tables (a place, a cat's name, a thing to wear), so
// the finished sentence does show a series word ("The way to your home starts
// in Twolegplace.").
//
//   table       every line as it is written, both forms, slots unfilled
//   filled      every line with each slot filled from the game's own tables
//   nextThing   the home line the game really picks, for a set of saves, in
//               Clan Edition and in Legacy Edition
//
// See test/serieswords.test.js for what the snapshot is for. Re-record ONLY
// when the owner or the older playtester has asked for a wording change in
// the "on" game:  UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords
import { describe, it, expect } from 'vitest';
import { WORDS, SLOTS, bothForms } from '../src/tutorialwords.js';
import { nextThing } from '../src/ui/nextthing.js';
import { createProgression, CATALOG, rankFor } from '../src/progression.js';
import { placeName, accessoryName } from '../src/edition.js';
import { HOMES } from '../src/clanhomes.js';
import { clanCast } from '../src/clancast.js';
import { CAT_NAMES, isKittypetName } from '../src/straynames.js';
import { checkAgainstFixture } from './helpers/serieswords.js';
import { withStandInWords, leaksIn, standInCount } from './helpers/standinwords.js';

const FIXTURE = 'series-words-on-tutorial.json';
const CLANS = Object.keys(HOMES);
const KEY = 'whisker-walk-save';
const ME = '11111111-1111-4111-8111-111111111111';
const STRAY = CAT_NAMES.find((n) => !isKittypetName(n));

function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
// A cleaned save with these fields over a new one (as test/nextthing.test.js builds them).
const save = (fields = {}) => createProgression(memStorage({ [KEY]: JSON.stringify({ version: 4, ...fields }) })).state;
const allWear = Object.keys(CATALOG.accessories);
const cat = (name, area = 'neighborhood', tamed = false) => ({ name, finder: ME, area, x: 1, z: 1, wear: null, tamedBy: tamed ? ME : null, tamedWalk: tamed ? 'walk-900' : null });
const feeds = (name, n) => Array.from({ length: n }, (_, i) => ({ cat: name, by: ME, walk: `walk-${name.length}${i}`, head: 0 }));

// What each slot is filled with: the game's own names, read when the snapshot
// is built, so they follow the word set in use.
function slotValues() {
  return {
    name: clanCast(CLANS[0])[4].name,                           // a cat of the camp, by its shown name
    place: placeName('neighborhood', 'canon', CATALOG),         // the street, under its Clan Edition name
    place2: placeName('park', 'canon', CATALOG),                // a second place, for the line that names two
    thing: accessoryName(CATALOG.accessories.warpaint, 'canon'), // the prize whose name carries the group word
    n: 3,
    rank: rankFor(0).next.title,                                // the player's points ladder (not a group rank)
  };
}

// The home line for a save, as "rule N: text".
const said = (fields, ctx) => {
  const t = nextThing(save(fields), ctx);
  return `rule ${t.rule}: ${t.text}`;
};

function homeLines(edition) {
  const e = { edition };
  const settled = { clanPick: { mine: CLANS[0] }, walks: { neighborhood: 3, [CLANS[0]]: 1, park: 5 }, unlocked: { accessories: allWear, areas: ['neighborhood', CLANS[0]] }, lifetimePoints: 100 };
  return {
    presentWaiting: said(e, { present: true }),
    noWalkYet: said(e),
    firstWalkHalfDone: said({ ...e, walks: { neighborhood: 1 }, tutorial: { first: 'part' } }, { guideName: STRAY }),
    firstWalkHalfDoneNoName: said({ ...e, walks: { neighborhood: 1 }, tutorial: { first: 'part' } }),
    pickIsReady: said({ ...e, walks: { neighborhood: 2 } }),
    // her land is open and not walked yet, for each home
    newHome: Object.fromEntries(CLANS.map((id) => [id, said({ ...e, walks: { neighborhood: 2 }, clanPick: { mine: id }, unlocked: { areas: ['neighborhood', id] }, area: id })])),
    // her land is still locked (an older build's pick): the way there, for each home
    wayHome: Object.fromEntries(CLANS.map((id) => [id, said({ ...e, walks: { neighborhood: 2 }, clanPick: { mine: id } })])),
    // one more walk opens the next place, from each place she may be walking
    opensNext: Object.fromEntries(Object.keys(CATALOG.areas).filter((id) => CATALOG.areas[id].requires).map((id) => {
      const req = CATALOG.areas[id].requires;
      return [id, said({ ...e, clanPick: { mine: CLANS[0] }, walks: { neighborhood: 3, [CLANS[0]]: 1, [req.area]: req.walks - 1 }, area: req.area, unlocked: { accessories: allWear, areas: ['neighborhood', CLANS[0], req.area] } })];
    })),
    canBuy: said({ ...e, clanPick: { mine: CLANS[0] }, walks: { neighborhood: 3, [CLANS[0]]: 1 }, points: 55 }),
    feedAgain: said({ ...e, ...settled, colony: { cats: [cat(STRAY)], feeds: feeds(STRAY, 3) } }),
    nearlyEnough: said({ ...e, clanPick: { mine: CLANS[0] }, walks: { neighborhood: 3, [CLANS[0]]: 1, park: 5 }, points: 8, lifetimePoints: 100 }),
    waitingInTheDen: said({ ...e, ...settled, colony: { cats: [cat(STRAY, 'neighborhood', true)], feeds: feeds(STRAY, 6) } }),
    nextRank: said({ ...e, ...settled }),
    lastRank: said({ ...e, ...settled, lifetimePoints: 99999 }),
  };
}

function snapshot() {
  const slots = slotValues();
  return {
    about: 'The guided first walk, the hints, the goals\' how lines and the home line. Recorded by test/serieswords.tutorial.test.js; see test/serieswords.test.js before re-recording.',
    table: Object.fromEntries(Object.keys(WORDS).map((id) => [id, { touch: WORDS[id].touch, keys: WORDS[id].keys }])),
    slotsFilledWith: slots,
    filled: Object.fromEntries(Object.keys(WORDS).map((id) => [id, bothForms(id, slots)])),
    nextThing: { clanEdition: homeLines('canon'), legacyEdition: homeLines('legacy') },
  };
}

describe('series words in the guided walk, the hints and the home line, pinned', () => {
  it('every line, and the home line for each kind of save, is exactly the recorded one', () => {
    checkAgainstFixture(FIXTURE, snapshot());
  });

  it('builds the same snapshot twice in a row', () => {
    expect(JSON.stringify(snapshot())).toBe(JSON.stringify(snapshot()));
  });

  it('covers every line of the table and fills every slot', () => {
    const snap = snapshot();
    expect(Object.keys(snap.filled)).toEqual(Object.keys(WORDS));
    expect(Object.keys(snap.slotsFilledWith).sort()).toEqual([...SLOTS].sort());
    for (const [id, forms] of Object.entries(snap.filled)) {
      for (const text of Object.values(forms)) expect(text, id).not.toMatch(/\{\w+\}|undefined|null|NaN/);
    }
    // the home line reaches every rule but the present's own stand-ins
    const rules = new Set(Object.values(snap.nextThing.clanEdition).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))).map((t) => Number(t.match(/^rule (\d+)/)[1])));
    expect([...rules].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  // The table itself is the same in every word set (its words are neutral);
  // what follows the set is whatever the slots are filled with. Built with a
  // stand-in set in use (test/helpers/standinwords.js: nonsense words, NOT
  // the plain game's), no word of the family's set may be left.
  it('with a stand-in word set in use, no word of the "on" set is left in a filled line', () => {
    const snap = withStandInWords(() => snapshot());
    expect(leaksIn(snap)).toEqual([]);
    expect(standInCount(snap)).toBeGreaterThan(20);
    expect(snap.table).toEqual(snapshot().table);
    checkAgainstFixture(FIXTURE, snapshot());
  });
});

// ---- the everyday words ('off'), added 2026-11-18 ------------------------------
// The same snapshot, built by the same code, with the everyday word set in
// use (src/offclanwords.js), recorded in its own fixture. Those words are the
// older playtester's picks; re-record with
//   UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords
// when she or the owner changes one, and read the diff line by line.
import { withOffWords, bannedLeaks, offWordCount } from './helpers/offwords.js';
import { UPDATING_OFF } from './helpers/serieswords.js';

const OFF_FIXTURE = 'series-words-off-tutorial.json';
// `table` is the table as it is WRITTEN (the family's lines, never drawn as
// they stand); `filled` is what is said, through line().
const OFF_IGNORE = [/^table\./];
describe('everyday words: the guided walk, the hints and the home line', () => {
  it('shows exactly the recorded everyday words', () => {
    checkAgainstFixture(OFF_FIXTURE, withOffWords(() => snapshot()), UPDATING_OFF);
  });

  it('shows no word of the family\'s set, and plenty of the everyday ones', () => {
    const snap = withOffWords(() => snapshot());
    expect(bannedLeaks(snap, OFF_IGNORE)).toEqual([]);
    expect(offWordCount(snap)).toBeGreaterThan(20);
  });

  it('and the family\'s words are back afterwards', () => {
    withOffWords(() => snapshot());
    checkAgainstFixture(FIXTURE, snapshot());
  });
});
