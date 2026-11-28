// src/wordset.js: the one door to the word tables (series switch, phase 1).
//
//   1. Nothing in src/ but wordset.js imports the word file (clanwords.js).
//   2. The door itself: the mode, adding a set, refusing a half-written one.
//   3. Values that used to be fixed when the game started now follow the set
//      in use, even when it changes afterwards.
//   4. The colony's stored title: kept as a position, old saves still load.
//
// The stand-in set is test/helpers/standinwords.js: nonsense words made by
// counting. It is NOT the plain game's word set; the owner chooses that.
// The five test/serieswords*.test.js files use the same stand-in to check
// whole screens.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as on from '../src/clanwords.js';
import {
  words, seriesMode, seriesModes, setSeriesMode, addWordSet, removeWordSet, inEachWordSet,
  SERIES_ON, TABLES, RANK_KEYS, GROUP_KEY,
} from '../src/wordset.js';
import { phrase, PHRASE_IDS } from '../src/clanphrases.js';
import { TERRITORIES } from '../src/territories.js';
import { placeName } from '../src/edition.js';
import { clanName, ownClanTitle, clanTitleOfWord, clanWordOfTitle } from '../src/clanhomes.js';
import { clanCast, tagOptsFor } from '../src/clancast.js';
import { rivalFor } from '../src/rivalclans.js';
import { clanNameOf, clanTitleFor, candidateStarNames, prefixFor } from '../src/clannames.js';
import { outsideTag } from '../src/colony.js';
import { wanderArrivalLine } from '../src/housecats.js';
import { campSoonLine, clanPickerModel, PICK_ATTR, PICK_SELECT_ID, MOMENT_SEEN_KEY, MOMENT_ATTR } from '../src/ui/clanpicker.js';
import { FIGHT_MOVES } from '../src/fightmoves.js';
import { BORDER_ASK } from '../src/game/borderfight.js';
import { CATALOG, createProgression, sanitizeClan } from '../src/progression.js';
import { ISLAND_SCENICS } from '../src/world/island.js';
import { validPetName } from '../src/net.js';
import { CAT_NAMES, KITTYPET_NAMES, isKittypetName } from '../src/straynames.js';
import { STAND_IN, standInWords, withStandInWords, onWordIn } from './helpers/standinwords.js';

const FILES = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
const read = (f) => readFileSync(f, 'utf8');

afterEach(() => {
  // whatever a test did, the next one starts with the family's words
  setSeriesMode(SERIES_ON);
  for (const id of seriesModes()) if (id !== SERIES_ON && id !== 'off') removeWordSet(id);
});

// ---- 1. the door is the only way in -----------------------------------------

// Every module a source text imports, re-exports from, or loads with import().
const importsOf = (src) => [
  ...src.matchAll(/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gm),
  ...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
  ...src.matchAll(/\bimport\(\s*['"`]([^'"`]+)['"`]\s*\)/g),
].map((m) => m[1]);
const isWordFile = (spec) => /(^|\/)clanwords\.js$/.test(spec);

describe('the word file has one door', () => {
  it('no module in src/ imports clanwords.js', () => {
    const offenders = FILES.filter((f) => f !== 'src/clanwords.js')
      .filter((f) => importsOf(read(f)).some(isWordFile));
    expect(offenders, `these import the word file directly; ask src/wordset.js for words() instead:\n${offenders.join('\n')}\n`).toEqual([]);
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('wordset.js imports the everyday set and the ids, and the family file imports nothing', () => {
    expect(importsOf(read('src/wordset.js'))).toEqual(['./offclanwords.js', './wordids.js', './wordids.js']);
    expect(importsOf(read('src/clanwords.js'))).toEqual([]);
  });

  it('the check sees every way of importing (mutation check)', () => {
    for (const src of [
      "import { RANK_WORDS } from './clanwords.js';",
      "import {\n  RANK_WORDS,\n  PREFIXES,\n} from '../clanwords.js';",
      "import * as w from \"../../clanwords.js\";",
      "export { RANK_KEYS } from './clanwords.js';",
      "export * from './clanwords.js';",
      "import './clanwords.js';",
      "const w = await import('../clanwords.js');",
    ]) expect(importsOf(src).some(isWordFile), src).toBe(true);
    for (const src of [
      "// import { RANK_WORDS } from './clanwords.js';",
      "import { words } from './wordset.js';",
      "import { x } from './notclanwords.js';",
      "const s = 'see clanwords.js';",
    ]) expect(importsOf(src).some(isWordFile), src).toBe(false);
  });

  it('no module but the door and the phrase table reads a set\'s PHRASES, and none changes the mode', () => {
    for (const f of FILES) {
      if (f === 'src/wordset.js') continue;
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/\b(setSeriesMode|addWordSet|removeWordSet)\b/);
      if (f !== 'src/clanphrases.js') expect(code, f).not.toMatch(/\.PHRASES\b/);
    }
  });
});

// ---- 2. the door itself -------------------------------------------------------

describe('the mode and the sets', () => {
  it('starts on the family\'s words, and those are the word file\'s own tables', () => {
    expect(seriesMode()).toBe('on'); // the test setup installs it and puts it in use (test/setup/familywords.js)
    expect(seriesModes()).toEqual(['on', 'off']);
    for (const name of TABLES) expect(words()[name], name).toBe(on[name]);
    expect(Object.keys(words().PHRASES).length).toBe(11); // the lines only the family's game says (B2)
    // every table of the word file is on the list, bar the ids, the spares and the optional drawings
    expect([...TABLES, 'HOMAGE_CHOICES', 'EMBLEMS', 'PHRASES'].sort()).toEqual(Object.keys(on).sort());
  });

  it('the ids are not words: they are the same in every set', () => {
    expect(GROUP_KEY).toBe(on.CLAN_SUFFIX.toLowerCase());
    withStandInWords(() => {
      expect(GROUP_KEY).toBe(on.CLAN_SUFFIX.toLowerCase());
      expect([PICK_ATTR, PICK_SELECT_ID, MOMENT_ATTR, MOMENT_SEEN_KEY])
        .toEqual([`data-${GROUP_KEY}-pick`, `set-${GROUP_KEY}-pick`, `data-${GROUP_KEY}-moment-open`, `whisker-walk-${GROUP_KEY}-moment-seen`]);
    });
  });

  it('a set this build does not hold cannot be put in use', () => {
    expect(() => setSeriesMode('nothing')).toThrow(/no word set "nothing"/);
    expect(() => setSeriesMode(STAND_IN)).toThrow();
    expect(seriesMode()).toBe('on');
  });

  it('puts a whole set in use and takes it out again', () => {
    const set = standInWords();
    addWordSet(STAND_IN, set);
    expect(seriesModes()).toEqual(['on', 'off', STAND_IN]);
    expect(seriesMode()).toBe('on'); // adding is not using
    setSeriesMode(STAND_IN);
    expect(words()).toBe(set);
    removeWordSet(STAND_IN); // taking out the set in use goes back to the everyday words
    expect(seriesMode()).toBe('off');
    setSeriesMode('on');
    expect(seriesModes()).toEqual(['on', 'off']);
    removeWordSet('off'); // the everyday set cannot be taken out
    expect(seriesModes()).toEqual(['on', 'off']);
  });

  it('refuses a half-written set, so "undefined" can never reach a name tag', () => {
    const whole = standInWords();
    const without = (name) => { const s = { ...whole }; delete s[name]; return s; };
    for (const name of TABLES) expect(() => addWordSet('bad', without(name)), name).toThrow(new RegExp(`has no ${name}`));
    const { leader: _l, ...noLeader } = whole.RANK_WORDS;
    expect(() => addWordSet('bad', { ...whole, RANK_WORDS: noLeader })).toThrow(/has no RANK_WORDS.leader/);
    const { house: _h, ...noHouse } = whole.OUTSIDE_WORDS;
    expect(() => addWordSet('bad', { ...whole, OUTSIDE_WORDS: noHouse })).toThrow(/has no OUTSIDE_WORDS.house/);
    expect(() => addWordSet('bad', { ...whole, CLAN_CAT_PREFIXES: { ...whole.CLAN_CAT_PREFIXES, woods: whole.CLAN_CAT_PREFIXES.woods.slice(1) } })).toThrow(/wrong number of CLAN_CAT_PREFIXES.woods/);
    // a save keeps a position in PREFIXES: the list cannot be shorter or longer
    expect(() => addWordSet('bad', { ...whole, PREFIXES: whole.PREFIXES.slice(1) })).toThrow(/wrong number of PREFIXES/);
    expect(() => addWordSet('bad', { ...whole, CLAN_SUFFIX: 7 })).toThrow(/has no CLAN_SUFFIX/);
    expect(() => addWordSet('bad', null)).toThrow();
    expect(() => addWordSet('', whole)).toThrow();
    expect(() => addWordSet('on', whole)).toThrow(/taken/);
    expect(seriesModes()).toEqual(['on', 'off']);
  });

  it('inEachWordSet visits every set and always comes back', () => {
    addWordSet(STAND_IN, standInWords());
    expect(inEachWordSet((id) => `${id}:${seriesMode()}:${words().CLAN_SUFFIX}`)).toEqual([`on:on:${on.CLAN_SUFFIX}`, 'off:off:Crew', `${STAND_IN}:${STAND_IN}:Zzmob`]);
    expect(seriesMode()).toBe('on');
    expect(() => inEachWordSet(() => { throw new Error('boom'); })).toThrow('boom');
    expect(seriesMode()).toBe('on');
    setSeriesMode(STAND_IN);
    inEachWordSet(() => 0);
    expect(seriesMode()).toBe(STAND_IN);
  });

  it('withStandInWords leaves the family\'s words in use, even when the work throws', () => {
    expect(() => withStandInWords(() => { throw new Error('boom'); })).toThrow('boom');
    expect(seriesMode()).toBe('on');
    expect(seriesModes()).toEqual(['on', 'off']);
  });
});

describe('a fresh build (as the public has it)', () => {
  it('starts on the everyday words and holds no family set', async () => {
    vi.resetModules();
    const fresh = await vi.importActual('../src/wordset.js');
    expect(fresh.seriesMode()).toBe('off');
    expect(fresh.seriesAvailable()).toBe(false);
    expect(fresh.seriesModes()).toEqual(['off']);
    expect(fresh.words().CLAN_SUFFIX).toBe('Crew');
    expect(() => fresh.setSeriesMode('on')).toThrow(/no word set "on"/);
    fresh.removeWordSet('off');
    expect(fresh.seriesModes()).toEqual(['off']);
  });

  it('installs the family set once: the same object again is nothing, another throws', async () => {
    vi.resetModules();
    const fresh = await vi.importActual('../src/wordset.js');
    fresh.installSeriesSet(on);
    expect(fresh.seriesAvailable()).toBe(true);
    expect(fresh.seriesModes()).toEqual(['on', 'off']);
    expect(() => fresh.installSeriesSet(on)).not.toThrow();
    expect(() => fresh.installSeriesSet({ ...on })).toThrow(/already installed/);
    expect(fresh.seriesMode()).toBe('off'); // installing is not choosing
    expect(() => fresh.installSeriesSet({ ...on, PREFIXES: [] })).toThrow();
  });

  it('refuses an incomplete set, and removing the one in use falls back to everyday words', async () => {
    vi.resetModules();
    const fresh = await vi.importActual('../src/wordset.js');
    expect(() => fresh.installSeriesSet({ ...on, RANK_WORDS: {} })).toThrow(/RANK_WORDS/);
    expect(fresh.seriesAvailable()).toBe(false);
    fresh.installSeriesSet(on);
    fresh.setSeriesMode('on');
    fresh.removeWordSet('on');
    expect(fresh.seriesMode()).toBe('off');
  });
});

describe('the stand-in set is a fair one', () => {
  it('shares no word with the family\'s set, and is plainly nonsense', () => {
    const set = standInWords();
    const flat = (v) => (typeof v === 'string' ? [v] : v instanceof Set ? [...v] : Object.values(v).flatMap(flat));
    for (const name of TABLES.filter((t) => t !== 'DENIED_NAMES')) {
      const mine = flat(set[name]);
      const theirs = new Set(flat(on[name]));
      expect(mine.length, name).toBe(flat(on[name]).length);
      for (const w of mine) {
        expect(theirs.has(w), `${name}: ${w}`).toBe(false);
        expect(w, name).toMatch(/^(X[a-z]{4}|q[a-z]{4}|Zzmob|zzrank[a-z]{4}|zzout[a-z]{4}|Zzburg[a-z]{4}|zzline [a-z]{4} zzhere)$/);
      }
    }
    expect(Object.keys(set.PHRASES)).toEqual([...PHRASE_IDS]);
  });

  it('every name it can make is one the game accepts as a pet name', () => {
    const set = standInWords();
    const firsts = [...set.PREFIXES, ...Object.values(set.CAT_PREFIXES), ...Object.values(set.RIVAL_PREFIXES), ...Object.values(set.CLAN_CAT_PREFIXES).flat()];
    const endings = [...set.WARRIOR_SUFFIXES, ...Object.values(set.RANK_SUFFIX)];
    // as many different first halves as the family's set has (a stored cat may share one with the title list there too)
    const theirs = [...on.PREFIXES, ...Object.values(on.CAT_PREFIXES), ...Object.values(on.RIVAL_PREFIXES), ...Object.values(on.CLAN_CAT_PREFIXES).flat()];
    expect(new Set(firsts).size).toBe(new Set(theirs).size);
    for (const p of firsts) for (const e of endings) expect(validPetName(p + e), p + e).toBe(true);
  });

  it('the check for a left-over word knows the family\'s words and passes ordinary ones', () => {
    for (const leak of [on.PLACE_WORDS.town, `the ${on.OUTSIDE_WORDS.met}`, `two ${on.RANK_WORDS.kit}s`, clanName('woods'), clanCast('woods')[0].name,
      clanNameOf(CAT_NAMES[0], { have: 6, tamed: true }), on.HOME_LINES.moor, phrase('pick.heading'), phrase('patrol.endGood', 'X'), phrase('move.pin.name'), phrase('colony.allies')]) {
      expect(onWordIn(leak), leak).not.toBeNull();
    }
    for (const fine of ['Tap Start!', 'The Woods', 'Pickles', 'a kitten', 'Starting soon', 'Pinned up', 'Run into the ball 4 times.', 'Xbaba the zzoutbaba']) {
      expect(onWordIn(fine), fine).toBeNull();
    }
  });
});

// ---- 3. nothing is fixed at start-up any more ----------------------------------

describe('words follow the set in use, also when it changes after the game has loaded', () => {
  // read once with the family's words, as the running game would have
  const before = () => ({
    town: TERRITORIES.find((t) => t.id === 'town').name,
    street: placeName('neighborhood', 'canon', CATALOG),
    campSoon: campSoonLine(),
    cardLine: clanPickerModel({}).cards[0].line,
    group: clanName('woods'),
    rival: rivalFor('park').name,
    leader: clanCast('woods')[0].name,
    tag: tagOptsFor(clanCast('woods')[0]).sub,
    cat: clanNameOf(CAT_NAMES[0], { have: 6, tamed: true }),
    title: clanTitleFor('player-1'),
    star: candidateStarNames('player-1')[0],
    met: outsideTag(null, CAT_NAMES.find((n) => !isKittypetName(n)), 'met'),
    wanders: wanderArrivalLine(KITTYPET_NAMES[0]),
    prize: CATALOG.accessories.warpaint.name,
    move: FIGHT_MOVES[0].name,
    ask: BORDER_ASK.ask,
    ring: ISLAND_SCENICS.find((s) => s.id === 'meeting-ring').label,
    note: phrase('edition.note'),
  });

  it('every one of these changes with the set, and comes back with the family\'s', () => {
    const first = before();
    for (const [k, v] of Object.entries(first)) expect(typeof v === 'string' && v.length > 0, k).toBe(true);
    const during = withStandInWords(before);
    for (const k of Object.keys(first)) {
      expect(during[k], k).not.toBe(first[k]);
      expect(onWordIn(during[k]), `${k}: ${during[k]}`).toBeNull();
    }
    expect(during.town).toBe('Zzburgbaba');
    expect(during.group).toMatch(/^the X[a-z]{4} Zzmob$/);
    expect(during.leader).toMatch(/^X[a-z]{4}q[a-z]{4}$/);
    expect(before()).toEqual(first);
  });

  it('a camp\'s cast is made once per set: the family\'s cats are the same objects afterwards', () => {
    const cast = clanCast('woods');
    const other = withStandInWords(() => {
      const c = clanCast('woods');
      expect(clanCast('woods')).toBe(c);
      return c;
    });
    expect(other).not.toBe(cast);
    expect(other.map((m) => [m.id, m.slot, m.rank, m.style])).toEqual(cast.map((m) => [m.id, m.slot, m.rank, m.style]));
    expect(other.map((m) => m.name)).not.toEqual(cast.map((m) => m.name));
    expect(clanCast('woods')).toBe(cast);
  });

  it('the map\'s place list keeps its shape: frozen, the name still a plain readable field', () => {
    const town = TERRITORIES.find((t) => t.id === 'town');
    expect(Object.isFrozen(town)).toBe(true);
    expect(Object.keys(town)).toEqual(['id', 'areaId', 'name', 'x', 'y', 'r', 'status']);
    expect({ ...town }.name).toBe(on.PLACE_WORDS.town);
    expect(JSON.parse(JSON.stringify(town)).name).toBe(on.PLACE_WORDS.town);
  });

  it('a set\'s own PHRASES take the place of the table\'s lines; the rest stay', () => {
    const set = { ...standInWords(), PHRASES: { 'pick.campSoon': 'zz soon', 'patrol.start': (name) => `zz ${name} zz` } };
    addWordSet(STAND_IN, set);
    const table = phrase('journal.chasedOff');
    setSeriesMode(STAND_IN);
    expect(phrase('pick.campSoon')).toBe('zz soon');
    expect(campSoonLine()).toBe('zz soon');
    expect(phrase('patrol.start', 'Q')).toBe('zz Q zz');
    expect(phrase('journal.chasedOff')).toBe(table); // not in the set: the table's own
    expect(phrase('group.name', 'Q')).toBe('QZzmob'); // the table's line, the set's word
    expect(() => phrase('no.such.line')).toThrow();
    expect(() => phrase('constructor')).toThrow();
  });
});

// ---- 4. the colony's stored title ---------------------------------------------

describe('the colony\'s own title is stored as a position, and old saves still load', () => {
  const KEY = 'whisker-walk-save';
  const mem = (initial = {}) => {
    const map = new Map(Object.entries(initial));
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
  };
  const ME = 'aaaaaaaa-1111';
  const FIRST = on.PREFIXES[0] + on.CLAN_SUFFIX; // the title made from the first word
  const THIRD = on.PREFIXES[2] + on.CLAN_SUFFIX;
  const stateWith = (clan) => ({ edition: 'canon', clanPick: { mine: null, partner: null, partnerId: null }, clan });

  it('a position and a title name each other, for every word', () => {
    on.PREFIXES.forEach((p, i) => {
      expect(clanTitleOfWord(i)).toBe(p + on.CLAN_SUFFIX);
      expect(clanWordOfTitle(p + on.CLAN_SUFFIX)).toBe(i);
    });
    for (const bad of [-1, on.PREFIXES.length, 1.5, '0', null, undefined, NaN, {}]) expect(clanTitleOfWord(bad)).toBeNull();
    for (const bad of ['', 'Moss', 'MossBand', clanName('woods'), 7, null, undefined, {}]) expect(clanWordOfTitle(bad)).toBeNull();
  });

  it('a save from before 2026-11-17 (the finished text only) loads and shows what it showed', () => {
    const out = sanitizeClan({ name: THIRD, adopted: true });
    expect(out).toEqual({ name: THIRD, word: 2, adopted: true });
    expect(Object.keys(out)).toEqual(['name', 'adopted', 'word']);
    expect(ownClanTitle(stateWith(out))).toBe(THIRD);
    // a state that was never re-read still shows its text
    expect(ownClanTitle(stateWith({ name: THIRD, adopted: true }))).toBe(THIRD);
    const p = createProgression(mem({ [KEY]: JSON.stringify({ version: 4, clan: { name: THIRD, adopted: true } }) }));
    expect(p.state.clan).toEqual({ name: THIRD, word: 2, adopted: true });
    expect(ownClanTitle(p.state)).toBe(THIRD);
  });

  it('a new save writes the position AND the finished text, so an older build still reads it', () => {
    const st = mem();
    const p = createProgression(st);
    p.ensureClanName(ME);
    const saved = JSON.parse(st.map.get(KEY)).clan;
    const word = on.PREFIXES.indexOf(prefixFor(ME));
    expect(saved).toEqual({ name: clanTitleFor(ME), word, adopted: false });
    // what a build from before this change would keep of it (its whole rule)
    const olderBuildKeeps = on.PREFIXES.map((x) => x + on.CLAN_SUFFIX).includes(saved.name) ? saved.name : null;
    expect(olderBuildKeeps).toBe(clanTitleFor(ME));
    p.adoptClanName(FIRST);
    expect(JSON.parse(st.map.get(KEY)).clan).toEqual({ name: FIRST, word: 0, adopted: true });
  });

  it('the position wins over the text; a position that is not one falls back to the text', () => {
    expect(sanitizeClan({ name: THIRD, word: 0, adopted: false })).toEqual({ name: FIRST, word: 0, adopted: false });
    expect(sanitizeClan({ name: 'anything at all', word: 2 })).toEqual({ name: THIRD, word: 2, adopted: false });
    for (const bad of [-1, on.PREFIXES.length, 1.5, '2', null, true, [2], { valueOf: () => 2 }]) {
      expect(sanitizeClan({ name: THIRD, word: bad, adopted: true }), String(bad)).toEqual({ name: THIRD, word: 2, adopted: true });
      expect(sanitizeClan({ name: 'bogus', word: bad, adopted: true }), String(bad)).toEqual({ name: null, adopted: false });
    }
    // an inherited position is not the save's own
    expect(sanitizeClan(Object.create({ word: 2 }))).toEqual({ name: null, adopted: false });
    const inherited = Object.assign(Object.create({ word: 0 }), { name: THIRD });
    expect(sanitizeClan(inherited)).toEqual({ name: THIRD, word: 2, adopted: false });
  });

  it('a save with no title keeps exactly the shape it always had', () => {
    expect(sanitizeClan(undefined)).toEqual({ name: null, adopted: false });
    expect(Object.keys(sanitizeClan({ name: 'bogus', word: 99 }))).toEqual(['name', 'adopted']);
    expect(Object.keys(createProgression(mem()).state.clan)).toEqual(['name', 'adopted']);
  });

  it('with another set in use the same save shows the same title in that set\'s words, and nothing is lost', () => {
    const st = mem({ [KEY]: JSON.stringify({ version: 4, clan: { name: THIRD, adopted: true } }) });
    const p = createProgression(st); // loaded with the family's words
    const shown = withStandInWords(() => {
      // the running game: no reload, the title follows the set
      const live = ownClanTitle(p.state);
      // a fresh load under the other set: the old text is still understood
      const q = createProgression(st);
      expect(q.state.clan).toEqual({ name: live, word: 2, adopted: true });
      q.ensureClanName(ME); // a no-op, but it must not un-adopt or rename
      q.adoptClanName(clanTitleFor('someone-else'));
      expect(q.state.clan).toEqual({ name: live, word: 2, adopted: true });
      // a brand-new save made under the other set
      const fresh = mem();
      const r = createProgression(fresh);
      r.ensureClanName(ME);
      return { live, freshSaved: JSON.parse(fresh.map.get(KEY)).clan };
    });
    expect(shown.live).toBe(`the ${standInWords().PREFIXES[2]} Zzmob`);
    expect(onWordIn(shown.live)).toBeNull();
    expect(ownClanTitle(p.state)).toBe(THIRD);
    // the save made under the other set, read back with the family's words:
    // its text means nothing here, its position does
    expect(onWordIn(shown.freshSaved.name)).toBeNull();
    expect(sanitizeClan(shown.freshSaved)).toEqual({ name: clanTitleFor(ME), word: on.PREFIXES.indexOf(prefixFor(ME)), adopted: false });
    // and without its position (as an older build would hand it on) it is
    // simply not a title: the game makes the title again from the player's id
    expect(sanitizeClan({ name: shown.freshSaved.name, adopted: true })).toEqual({ name: null, adopted: false });
  });

  it('while a build holds both sets, a title in either spelling is understood', () => {
    addWordSet(STAND_IN, standInWords());
    const theirs = inEachWordSet(() => clanTitleOfWord(2));
    expect(theirs[0]).toBe(THIRD);
    expect(clanWordOfTitle(theirs[1])).toBe(2);
    expect(sanitizeClan({ name: theirs[1], adopted: true })).toEqual({ name: THIRD, word: 2, adopted: true });
  });
});
