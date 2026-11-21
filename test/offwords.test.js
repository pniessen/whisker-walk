// The everyday word set ('off', src/offclanwords.js), series switch phase 2
// (2026-11-18): the same game in plain words, and the few things it does
// differently. The words are the older playtester's picks.
//
//   1. the set is whole, and no build holds it yet
//   2. nothing in it is a word of the family's set ("loner" excepted)
//   3. what it does differently, one test each
//   4. a save's colony title keeps its position across both sets
//   5. the family's game ('on') is untouched by any of it
//
// Whole screens under these words are recorded by the test/serieswords*.test.js
// files, in test/fixtures/series-words-off*.json.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as on from '../src/clanwords.js';
import * as off from '../src/offclanwords.js';
import {
  words, wordRule, rankShown, rankWord, seriesMode, seriesModes, setSeriesMode, addWordSet, removeWordSet,
  inEachWordSet, SERIES_ON, TABLES, RANK_KEYS,
} from '../src/wordset.js';
import { phrase, hasPhrase, PHRASE_IDS, LATER_PHRASE_IDS } from '../src/clanphrases.js';
import { WORDS as TUTORIAL, line as tutorialLine, hasLine } from '../src/tutorialwords.js';
import { CAT_NAMES, KIT_NAMES, LEGENDARY_NAMES, KITTYPET_NAMES, isKittypetName } from '../src/straynames.js';
import { clanNameOf, clanRankFor, colonyRankFor, clanTitleFor, candidateStarNames, prefixFor } from '../src/clannames.js';
import { clanName, ownClanTitle, clanTitleOfWord, clanWordOfTitle, patrolClanFor, TRUCE_AREAS, HOMES } from '../src/clanhomes.js';
import { clanCast, tagOptsFor, CAST_RANKS } from '../src/clancast.js';
import { rivalFor } from '../src/rivalclans.js';
import { roleFor } from '../src/clanroles.js';
import { outsideTag, emptyColony, TAME_FEEDS } from '../src/colony.js';
import { ISLAND, TERRITORIES } from '../src/territories.js';
import { ISLAND_SCENICS, ISLAND_COLLECTIBLES } from '../src/world/island.js';
import { CATALOG, createProgression, sanitizeClan, sanitizeClanRoles } from '../src/progression.js';
import { editionTitle, gameTitle, placeName, accessoryName } from '../src/edition.js';
import { FIGHT_MOVES } from '../src/fightmoves.js';
import { validPetName } from '../src/net.js';
import { renderColonyHtml } from '../src/ui/colonypanel.js';
import { renderStarNamePicker } from '../src/ui/hometabs.js';
import { clanPickerModel, renderClanPickerHtml, renderClanMomentHtml, clanLineHtml, emblemOf, PICK_ATTR } from '../src/ui/clanpicker.js';
import { EMBLEMS } from '../src/clanwords.js';
import { htmlText, readFixture, checkAgainstFixture, UPDATING_OFF } from './helpers/serieswords.js';
import { OFF, withOffWords, bannedIn, bannedLeaks, BANNED } from './helpers/offwords.js';
import { withStandInWords } from './helpers/standinwords.js';
import { memoryStorage } from './helpers/storage.js';

const read = (f) => readFileSync(f, 'utf8');
const FILES = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
const STORED = [...CAT_NAMES, ...KIT_NAMES, ...LEGENDARY_NAMES];
const CLANS = Object.keys(HOMES);
const ME = 'player-me-000001';
const KEY = 'whisker-walk-save';
const mem = (initial) => memoryStorage(initial, { expose: 'map' });
const flat = (v) => (typeof v === 'string' ? [v] : v instanceof Set ? [...v] : Object.values(v).flatMap(flat));

afterEach(() => {
  setSeriesMode(SERIES_ON);
  for (const id of seriesModes()) removeWordSet(id);
});

// ---- 1. the set ------------------------------------------------------------------

describe('the everyday set is whole, and is not in any build yet', () => {
  it('the door accepts it: every table, every key, the same number of title words', () => {
    expect(() => addWordSet(OFF, off)).not.toThrow();
    expect(seriesModes()).toEqual(['on', 'off']);
    for (const name of TABLES) expect(off[name], name).toBeDefined();
    expect(off.PREFIXES.length).toBe(on.PREFIXES.length);
    expect(Object.keys(off.CAT_PREFIXES).sort()).toEqual(Object.keys(on.CAT_PREFIXES).sort());
    for (const clan of CLANS) expect(off.CLAN_CAT_PREFIXES[clan].length).toBe(CAST_RANKS.length);
    for (const table of [off.PREFIXES, off.RANK_WORDS, off.RANK_AS, off.OUTSIDE_WORDS, off.PLACE_WORDS, off.RULES, off.PHRASES, off.LINES, off.BADGE_WORDS, off.HOME_LINES, off.HOMAGE_PREFIXES, off.RIVAL_PREFIXES, off.CAT_PREFIXES, off.CLAN_CAT_PREFIXES]) {
      expect(Object.isFrozen(table)).toBe(true);
    }
  });

  it('no build holds it: the game starts on the family\'s words and nothing in src/ imports this file', () => {
    expect(seriesMode()).toBe('on');
    expect(seriesModes()).toEqual(['on']);
    const importers = FILES.filter((f) => f !== 'src/offclanwords.js' && /offclanwords\.js/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
    expect(importers).toEqual([]);
  });

  it('every line of its own is for an id the game has, in the shape the game reads', () => {
    for (const id of Object.keys(off.PHRASES)) expect(hasPhrase(id), id).toBe(true);
    for (const [id, entry] of Object.entries(off.LINES)) {
      expect(hasLine(id), id).toBe(true);
      expect(Object.keys(entry).sort(), id).toEqual(['keys', 'touch']);
      // the same slots as the line it stands in for, so every caller still fills them
      const slots = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(slots(entry.touch), id).toEqual(slots(TUTORIAL[id].touch));
      expect(slots(entry.keys), id).toEqual(slots(TUTORIAL[id].keys));
    }
    expect(Object.keys(off.BADGE_WORDS).sort()).toEqual([...CLANS].sort());
    for (const rule of Object.keys(off.RULES)) expect(['storedNames', 'noStarNames', 'stoneSeat']).toContain(rule);
    for (const [from, to] of Object.entries(off.RANK_AS)) {
      expect(Object.values(RANK_KEYS)).toContain(from);
      expect(Object.values(RANK_KEYS)).toContain(to);
      expect(off.RANK_WORDS[from]).toBe(off.RANK_WORDS[to]);
    }
  });

  it('the words are the ones she picked', () => {
    withOffWords(() => {
      expect(CLANS.map(clanName).sort()).toEqual(['Forest Crew', 'Gorge Crew', 'Moor Crew', 'Pines Crew', 'River Crew']);
      expect(['neighborhood', 'park', 'seaside', 'docks'].map((id) => rivalFor(id).name)).toEqual(['Garden Crew', 'Park Crew', 'Beach Crew', 'Dock Crew']);
      expect(clanTitleFor(ME)).toMatch(/^[A-Z][a-z]+ Crew$/);
      const K = RANK_KEYS;
      expect([K.kit, K.apprentice, K.warrior, K.elder, K.leader, K.medicine].map(rankWord)).toEqual(['kitten', 'scout', 'ranger', 'wise cat', 'first cat', 'doc']);
      expect({ ...words().OUTSIDE_WORDS }).toEqual({ met: 'roamer', grudge: 'loner', player: '', house: 'house cat', people: 'townspeople' });
      expect(placeName('neighborhood', 'canon', CATALOG)).toBe('Peopleville');
      expect(TERRITORIES.find((t) => t.id === 'town').name).toBe('Peopleville');
      expect(words().PLACE_WORDS.seat).toBe('High Stone');
      expect(phrase('patrol.prompt', 'Conker')).toBe('E — walk the bounds with Conker');
      expect(phrase('patrol.endGood', 'Conker')).toContain('home base');
      expect(phrase('colony.allies')).toBe('allies');
      expect(phrase('journal.chasedOff')).toBe('Outsiders chased away');
      expect(FIGHT_MOVES.map((m) => `${m.name} / ${m.short}`)).toEqual(['Swat / Swat', 'Leap / Leap', 'Pin / Pin', 'Tumble / Tumble']);
      expect(accessoryName(CATALOG.accessories.warpaint, 'canon')).toBe('War Paint');
      expect(phrase('landmark.woods.oak')).toBe('the grandfather oak');
      expect(phrase('landmark.river.warmRocks')).toBe('heron rocks');
      expect(phrase('landmark.island.ring')).toBe('the stone ring under the old ash');
      expect(ISLAND.name).toBe('The Still Island');
      expect({ ...words().BADGE_WORDS }).toEqual({ woods: 'oak leaf', moor: 'heather sprig', river: 'reed', pines: 'pine cone', gorge: 'crag' });
      expect(gameTitle('canon')).toBe('Whisker Walk 2');
      expect(gameTitle('legacy')).toBe('Whisker Walk 2: Legacy Edition');
    });
  });

  it('a group title fits where a name travels, and no title word is taken already', () => {
    const taken = new Set([...on.PREFIXES, ...STORED, ...Object.values(off.HOMAGE_PREFIXES), ...Object.values(off.RIVAL_PREFIXES), ...Object.values(off.CLAN_CAT_PREFIXES).flat()]);
    expect(new Set(off.PREFIXES).size).toBe(off.PREFIXES.length);
    for (const p of off.PREFIXES) {
      expect(taken.has(p), p).toBe(false);
      expect(validPetName(`${p} ${off.CLAN_SUFFIX}`), p).toBe(true);
    }
    // a home-base cat's name is a whole name: usable, its own, and nobody else's
    const cast = Object.values(off.CLAN_CAT_PREFIXES).flat();
    expect(new Set(cast).size).toBe(cast.length);
    for (const n of cast) {
      expect(validPetName(n), n).toBe(true);
      expect(STORED.includes(n), n).toBe(false);
    }
  });
});

// ---- 2. no word of the family's set -------------------------------------------------

describe('nothing in the everyday set is a word of the family\'s set', () => {
  // ids, not words: the rank ids a rank is shown as
  const IDS = [/^RANK_AS\./, /^OFF_ID$/];

  it('the check knows the family\'s words, allows "loner", and passes ordinary ones', () => {
    for (const leak of ['StormClan', 'the kittypet', 'two kits', 'Mosskit', 'Wrenpaw', 'Sagestar', 'Badgerstar', 'Conkerfur', 'Twolegplace', 'a rogue now!', 'warrior of X',
      'apprentice', 'deputy', 'queen', 'medicine cat', 'leader of X', 'the elder', 'GaleClan land', 'Gale Crew', 'Storm', 'E — patrol with X', 'heads back to camp', 'Intruders chased off',
      'Or pick a star name', 'the great oak', 'sun-warmed rocks', 'the meeting ring', 'Clan Edition', 'clan']) {
      expect(bannedIn(leak), leak).not.toBeNull();
    }
    for (const fine of ['Pickles the loner', 'a loner now!', 'a kitten', 'paw prints', 'Tap the paw to jump up.', 'Your first trip! ⭐', 'Star Sunglasses', 'Forest Crew', 'first cat of Moor Crew',
      'rocks, cliff dens and tall pines', 'is leading the way', 'Badger', 'home base', 'storm clouds', 'at dusk', 'wise cat', 'Start the walk']) {
      expect(bannedIn(fine), fine).toBeNull();
    }
    expect(BANNED.length).toBeGreaterThan(5);
  });

  it('no table of the set holds one', () => {
    expect(bannedLeaks(off, [...IDS, /^PHRASES\./, /^PLACE_WORDS\.roofs$/])).toEqual([]);
    // and no word is shared with the family's rank, outside or place words, bar the one
    const theirs = new Set([...flat(on.RANK_WORDS), ...flat(on.OUTSIDE_WORDS), ...flat({ ...on.PLACE_WORDS, roofs: [] }), on.CLAN_SUFFIX].map((w) => w.toLowerCase()));
    const shared = [...flat(off.RANK_WORDS), ...flat(off.OUTSIDE_WORDS), ...flat({ ...off.PLACE_WORDS, roofs: [] }), off.CLAN_SUFFIX].filter((w) => theirs.has(w.toLowerCase()));
    expect(shared).toEqual(['loner']);
    expect(flat(off.RANK_WORDS)).not.toContain('elder');
    // no title word, group word or home-base name is a GROUP word of the family's set
    const theirGroups = new Set([...Object.values(on.HOMAGE_PREFIXES), ...Object.values(on.HOMAGE_CHOICES).flat(), ...Object.values(on.RIVAL_PREFIXES), ...on.PREFIXES]);
    for (const w of [...off.PREFIXES, ...Object.values(off.HOMAGE_PREFIXES), ...Object.values(off.RIVAL_PREFIXES)]) expect(theirGroups.has(w), w).toBe(false);
  });

  it('no phrase says one, whoever\'s names are put in it', () => {
    withOffWords(() => {
      const group = clanName('woods');
      const cat = clanCast('woods')[4].name;
      const said = Object.fromEntries([...PHRASE_IDS, ...LATER_PHRASE_IDS].map((id) => [id, phrase(id, cat, group, phrase('fight.homeAsk'))]));
      said['house.arrival'] = phrase('house.arrival', KITTYPET_NAMES[0], words().OUTSIDE_WORDS.house, words().PLACE_WORDS.town);
      said['tag.rankOfGroup'] = Object.values(RANK_KEYS).map((k) => phrase('tag.rankOfGroup', rankWord(k), group)).join(' | ');
      said['outside.the'] = ['met', 'grudge', 'house'].map((k) => phrase('outside.the', words().OUTSIDE_WORDS[k])).join(' | ');
      said['outside.crossNow'] = phrase('outside.crossNow', words().OUTSIDE_WORDS.grudge);
      said['edition.game'] = `${gameTitle('canon')} | ${gameTitle('legacy')}`;
      said['colony.rankAfterName'] = Object.values(RANK_KEYS).map((k) => phrase('colony.rankAfterName', rankWord(k))).join(' | ');
      said['pick.badge'] = Object.values(words().BADGE_WORDS).map((w) => phrase('pick.badge', w)).join(' | ');
      expect(bannedLeaks(said)).toEqual([]);
      for (const [id, text] of Object.entries(said)) {
        expect(typeof text, id).toBe('string');
        expect(text, id).not.toMatch(/undefined|null|NaN|\[object/);
        // only the lines never drawn in this set may be empty
        if (id !== 'star.pick' && id !== 'place.townNote') expect(text.length, id).toBeGreaterThan(0);
      }
    });
  });

  it('no line of the guided walk, the hints or the home line says one', () => {
    withOffWords(() => {
      const slots = { name: clanCast('woods')[4].name, place: placeName('neighborhood', 'canon', CATALOG), place2: placeName('park', 'canon', CATALOG), place3: placeName('seaside', 'canon', CATALOG), thing: accessoryName(CATALOG.accessories.warpaint, 'canon'), n: 3, rank: 'Yard Prowler' };
      const said = {};
      for (const id of Object.keys(TUTORIAL)) for (const touch of [true, false]) said[`${id}.${touch ? 'touch' : 'keys'}`] = tutorialLine(id, { ...slots, touch });
      expect(bannedLeaks(said)).toEqual([]);
      expect(Object.values(said).filter((t) => /home base/.test(t)).length).toBe(10);
      expect(tutorialLine('hint.stranger')).toMatch(/^An outsider has come onto your land/);
    });
  });

  it('no name it shows is one the family\'s set composes', () => {
    const theirs = new Set();
    const firsts = [...on.PREFIXES, ...Object.values(on.CAT_PREFIXES), ...Object.values(on.CLAN_CAT_PREFIXES).flat()];
    for (const p of firsts) for (const e of [...on.WARRIOR_SUFFIXES, ...Object.values(on.RANK_SUFFIX), on.CLAN_SUFFIX]) theirs.add(p + e);
    withOffWords(() => {
      const shown = [
        ...STORED.flatMap((n) => [0, 2, TAME_FEEDS].map((have) => clanNameOf(n, { have, tamed: have === TAME_FEEDS }))),
        ...CLANS.flatMap((c) => clanCast(c).map((m) => m.name)),
        ...CLANS.map(clanName), ...off.PREFIXES.map((_p, i) => clanTitleOfWord(i)),
      ];
      expect(shown.length).toBeGreaterThan(250);
      for (const name of shown) expect(theirs.has(name), name).toBe(false);
    });
  });
});

// ---- 3. what the set does differently ---------------------------------------------------

const cat = (name, extra = {}) => ({ name, finder: ME, area: 'neighborhood', x: 1, z: 2, wear: null, tamedBy: null, tamedWalk: null, ...extra });
const feeds = (name, n) => Array.from({ length: n }, (_, i) => ({ cat: name, by: ME, walk: `walk-${1000 + i}`, head: 0 }));
const panel = (colony, over = {}) => renderColonyHtml({ colony, me: ME, members: 1, now: 0, status: { mode: 'local' }, owned: [], catalog: CATALOG, edition: 'canon', ...over });
// "<name> <rank words>" for each card of the Colony tab, as a player reads it
const cards = (html) => html.split('class="card colony-card').slice(1).map((c) => htmlText(`<div class="card colony-card${c}`).slice(0, 2).join(' '));
const STRAYS = CAT_NAMES.filter((n) => !isKittypetName(n));

describe('1. cats keep their stored names; the rank is a title beside the name', () => {
  it('a stored cat is shown under its own name at every rank', () => {
    withOffWords(() => {
      for (const name of STORED) {
        for (const rank of Object.values(RANK_KEYS)) expect(clanNameOf(name, null, rank), `${name} ${rank}`).toBe(name);
        for (let have = 0; have <= TAME_FEEDS; have++) expect(clanNameOf(name, { have, tamed: false })).toBe(name);
        expect(prefixFor(name)).toBe(name);
      }
      expect(clanNameOf('Someone Typed', null)).toBe('Someone Typed');
      expect(clanNameOf('', null)).toBe('Cat');
    });
    // the family's game still composes them
    expect(clanNameOf(STORED[0], { have: 0, tamed: false })).toBe(on.CAT_PREFIXES[STORED[0]] + on.RANK_SUFFIX.kit);
  });

  it('the Colony card reads "Pickles the ranger": the kitten, the scout, the ranger along the bar', () => {
    const [a, b, c] = STRAYS;
    const colony = { ...emptyColony(), cats: [cat(a), cat(b), cat(c, { tamedBy: ME, tamedWalk: 'walk-2000' })], feedList: [], feeds: [...feeds(a, 1), ...feeds(b, 3), ...feeds(c, TAME_FEEDS)] };
    const said = withOffWords(() => cards(panel(colony)));
    expect(said).toContain(`${a} the kitten`);
    expect(said).toContain(`${b} the scout`);
    expect(said.find((t) => t.startsWith(`${c} `))).toMatch(new RegExp(`^${c} the (ranger|wise cat|doc)$`));
    // the family's card is the composed name and the bare rank word, as before
    const theirs = cards(panel(colony));
    expect(theirs).toContain(`${clanNameOf(a, { have: 1 }, colonyRankFor(a, { have: 1 }))} ${on.RANK_WORDS[clanRankFor({ have: 1 })]}`);
    for (const t of theirs) expect(t).not.toMatch(/ the /);
  });

  it('a cat of a home base has one name, and its tag says its rank and crew under it', () => {
    withOffWords(() => {
      for (const clan of CLANS) {
        const cast = clanCast(clan);
        expect(cast.map((m) => m.name)).toEqual([...off.CLAN_CAT_PREFIXES[clan]]);
        expect(tagOptsFor(cast[0])).toEqual({ sub: `first cat of ${clanName(clan)}`, top: true });
        expect(tagOptsFor(cast[4])).toEqual({ sub: `ranger of ${clanName(clan)}`, top: false });
      }
    });
    // the seats, ranks and coats are the family's: only the names differ
    const theirs = clanCast('woods');
    const hers = withOffWords(() => clanCast('woods'));
    expect(hers.map((m) => [m.id, m.slot, m.rank, m.style])).toEqual(theirs.map((m) => [m.id, m.slot, m.rank, m.style]));
  });
});

describe('2. six ranks: no second-in-command, no mother rank', () => {
  it('both are shown as an ordinary grown cat', () => {
    withOffWords(() => {
      expect(rankShown(RANK_KEYS.deputy)).toBe(RANK_KEYS.warrior);
      expect(rankShown(RANK_KEYS.queen)).toBe(RANK_KEYS.warrior);
      expect(rankWord(RANK_KEYS.deputy)).toBe('ranger');
      expect(rankWord(RANK_KEYS.queen)).toBe('ranger');
      for (const k of [RANK_KEYS.kit, RANK_KEYS.apprentice, RANK_KEYS.warrior, RANK_KEYS.elder, RANK_KEYS.medicine, RANK_KEYS.leader]) expect(rankShown(k)).toBe(k);
      expect(new Set(Object.values(RANK_KEYS).map(rankWord)).size).toBe(6);
      // the seat that is the second-in-command's in the family's game
      const second = clanCast('woods').find((m) => m.rank === RANK_KEYS.deputy);
      expect(tagOptsFor(second).sub).toBe('ranger of Forest Crew');
    });
  });

  it('a stored second-in-command is not read on the Colony tab, and is not removed from the save', () => {
    const [a, b, c] = STRAYS.filter((n) => roleFor(n) === RANK_KEYS.warrior);
    const queen = CAT_NAMES.find((n) => roleFor(n) === RANK_KEYS.queen);
    const names = [a, b, c, queen];
    const colony = { ...emptyColony(), cats: names.map((n, i) => cat(n, { tamedBy: ME, tamedWalk: `walk-${2000 + i}` })), feeds: names.flatMap((n) => feeds(n, TAME_FEEDS)) };
    const roles = { [RANK_KEYS.medicine]: a, [RANK_KEYS.deputy]: b };
    const both = { [RANK_KEYS.medicine]: c, [RANK_KEYS.deputy]: c };
    withOffWords(() => {
      expect(cards(panel(colony, { clanRoles: roles }))).toEqual([`${a} the doc`, `${b} the ranger`, `${c} the ranger`, `${queen} the ranger`].sort((x, y) => cards(panel(colony)).findIndex((t) => t.startsWith(x.split(' the ')[0])) - cards(panel(colony)).findIndex((t) => t.startsWith(y.split(' the ')[0]))));
      expect(cards(panel(colony, { clanRoles: both })).find((t) => t.startsWith(c))).toBe(`${c} the doc`);
      // the save keeps the field, read or not
      expect(sanitizeClanRoles(roles)).toEqual(roles);
      const st = mem({ [KEY]: JSON.stringify({ version: 4, clanRoles: roles }) });
      const p = createProgression(st);
      expect(p.state.clanRoles).toEqual(roles);
      p.setPetName('Biscuit'); // any save
      expect(JSON.parse(st.map.get(KEY)).clanRoles).toEqual(roles);
    });
    // the family's card still names both
    const theirs = cards(panel(colony, { clanRoles: roles }));
    expect(theirs.find((t) => t.endsWith(` ${on.RANK_WORDS.deputy}`))).toBeDefined();
    expect(cards(panel(colony, { clanRoles: both })).some((t) => t.endsWith(`${on.RANK_WORDS.medicine} · ${on.RANK_WORDS.deputy}`))).toBe(true);
    expect(cards(panel(colony)).some((t) => t.endsWith(` ${on.RANK_WORDS.queen}`))).toBe(true);
  });
});

describe('3. no star name is offered; one already chosen stays', () => {
  it('nothing is offered and the picker draws nothing', () => {
    expect(candidateStarNames(ME).length).toBe(3);
    withOffWords(() => {
      expect(wordRule('noStarNames')).toBe(true);
      expect(candidateStarNames(ME)).toEqual([]);
      expect(candidateStarNames(ME, 22)).toEqual([]);
      expect(renderStarNamePicker(candidateStarNames(ME), 'Mossstar')).toBe('');
    });
    // on the real Play together sheet (recorded by test/serieswords.home.test.js)
    const theirs = readFixture('series-words-on-home.json').clanEdition.beforeAPick.together;
    const hers = readFixture('series-words-off-home.json').clanEdition.beforeAPick.together;
    expect(theirs).toContain(phrase('star.pick'));
    expect(theirs.some((t) => t.endsWith(on.RANK_SUFFIX.leader))).toBe(true);
    expect(hers.length).toBeGreaterThan(5);
    expect(hers.some((t) => /star\b/i.test(t))).toBe(false);
  });

  it('a name already chosen is still the cat\'s name', () => {
    const chosen = candidateStarNames(ME)[0];
    const st = mem();
    createProgression(st).setPetName(chosen);
    withOffWords(() => {
      const p = createProgression(st);
      expect(p.state.petName).toBe(chosen);
      p.setEdition('canon');
      expect(JSON.parse(st.map.get(KEY)).petName).toBe(chosen);
    });
  });
});

describe('4. the player\'s cat has no label, and picking a group is choosing a home', () => {
  it('nothing is added to the player\'s name; a visitor from town is a house cat', () => {
    const stray = STRAYS[0];
    expect(outsideTag(null, stray, 'player')).toBe(` the ${on.OUTSIDE_WORDS.player}`);
    withOffWords(() => {
      expect(outsideTag(null, stray, 'player')).toBe('');
      expect(outsideTag(null, KITTYPET_NAMES[0], 'player')).toBe('');
      expect(outsideTag(null, stray, 'player', (w) => `[${w}]`)).toBe('');
      expect(outsideTag(null, stray, 'met')).toBe(' the roamer');
      expect(outsideTag(null, stray, 'grudge', (w) => phrase('outside.crossNow', w))).toBe(' a loner now!');
      expect(outsideTag(null, KITTYPET_NAMES[0], 'met')).toBe(' the house cat');
      expect(outsideTag(null, KITTYPET_NAMES[0], 'grudge')).toBe('');
      expect(outsideTag({ cats: [{ name: stray }] }, stray, 'met')).toBe('');
    });
  });

  it('the moment asks which crew will be her home, with no word of joining or of being noticed', () => {
    withOffWords(() => {
      const model = clanPickerModel({});
      const moment = htmlText(renderClanMomentHtml(model, 'Robin'));
      expect(moment.slice(1, 4)).toEqual(['Time to pick a home!', 'Which crew will be your home?', 'Pick your home crew']);
      const change = htmlText(renderClanMomentHtml(clanPickerModel({ clanPick: { mine: 'woods' } }), 'Robin'));
      expect(change.slice(1, 3)).toEqual(['Change your crew?', 'Click a crew to make it your home.']);
      const line = htmlText(clanLineHtml(model, 'Robin', { canChoose: true }));
      expect(line).toEqual(['Time to pick a home!', 'Choose your crew ›']);
      for (const t of [...moment, ...change, ...line]) expect(t).not.toMatch(/join|noticed|wild cats/i);
      expect(tutorialLine('home.pick')).toBe('It is time to pick your home!');
    });
  });

  it('a pick card shows its badge as a named picture, not a line of words; the family\'s cards are as they were', () => {
    const emblems = (html) => html.split('dr-home-emblem').length - 1;
    const theirs = renderClanPickerHtml(clanPickerModel({}), 'Robin');
    expect(emblems(theirs)).toBe(Object.keys(EMBLEMS).length);
    expect(theirs).not.toMatch(/dr-home-badge|role="img"|<title>/);
    withOffWords(() => {
      const html = renderClanPickerHtml(clanPickerModel({}), 'Robin');
      expect(html).toContain('<title>oak leaf</title>');
      expect(html).not.toMatch(/dr-home-badge/);
      expect(emblems(html)).toBe(CLANS.length);
      for (const id of CLANS) {
        const card = html.split('<button').find((b) => b.includes(`${PICK_ATTR}="${id}"`));
        const svg = card.slice(card.indexOf('<svg'), card.indexOf('</svg>') + 6);
        expect(svg, id).toMatch(/^<svg [^>]*role="img"[^>]*><title>/);
        expect(svg, id).toContain(`<title>${off.BADGE_WORDS[id]}</title>`);
        expect(svg, id).not.toContain('aria-hidden');
        expect(htmlText(card), id).not.toContain(`badge: ${off.BADGE_WORDS[id]}`);
      }
      // the Change-place line keeps the drawing as decoration: her group's name is said beside it
      const line = clanLineHtml(clanPickerModel({ clanPick: { mine: 'woods' } }), 'Robin');
      expect(line).toContain(off.EMBLEMS.woods);
      expect(line).not.toMatch(/role="img"|<title>/);
    });
  });
});

describe('the everyday badges (A2): five small drawings of their own', () => {
  const COLOUR = { woods: '#2f5a33', moor: '#5c3f68', river: '#24516b', pines: '#353d68', gorge: '#6b4128' };
  const CREAM = '#f1e0c2';
  const HEAD = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">';
  const ALLOWED = new Set(['path', 'circle', 'ellipse', 'g', 'rect', 'polygon']);

  it('each everyday badge is a small safe drawing of its own', () => {
    expect(Object.keys(off.EMBLEMS).sort()).toEqual([...CLANS].sort());
    expect(Object.isFrozen(off.EMBLEMS)).toBe(true);
    for (const id of CLANS) {
      const svg = off.EMBLEMS[id];
      expect(typeof svg, id).toBe('string');
      expect(svg.startsWith(HEAD), id).toBe(true);
      expect(svg.endsWith('</svg>'), id).toBe(true);
      expect(svg.length, id).toBeLessThanOrEqual(700);
      const inner = svg.slice(HEAD.length, -'</svg>'.length);
      const tags = [...inner.matchAll(/<\/?\s*([A-Za-z][\w:-]*)/g)].map((m) => m[1]);
      expect(tags.length, id).toBeGreaterThan(0);
      for (const t of tags) expect(ALLOWED.has(t), `${id}: <${t}>`).toBe(true);
      const paints = [...svg.matchAll(/\b(fill|stroke)\s*=\s*"([^"]*)"/g)].map((m) => m[2]);
      expect(paints.length, id).toBeGreaterThan(0);
      for (const v of paints) expect([COLOUR[id], CREAM, 'none'], `${id}: ${v}`).toContain(v);
      expect(svg, id).not.toMatch(/style\s*=|color\s*=|<(text|image|script)|\son\w+\s*=|url\(|href/i);
      expect(svg, id).toContain(COLOUR[id]);
      expect(svg, id).not.toBe(on.EMBLEMS[id]);
    }
    expect(new Set(Object.values(off.EMBLEMS)).size).toBe(CLANS.length);
  });

  it('the everyday set\'s badge is the one drawn wherever a badge is drawn', () => {
    withOffWords(() => {
      for (const id of CLANS) expect(emblemOf(id), id).toBe(off.EMBLEMS[id]);
    });
    for (const id of CLANS) expect(emblemOf(id), id).toBe(EMBLEMS[id]);
  });
});

// V1 (the owner, from the pictures): the oak leaf's cream midrib is a short
// curve inside the leaf, never a line through it, and the heather has three or
// four bigger bells, each a dot of its own at 22 px on a 1x screen. Read from
// the exported strings (numbers parsed out of the data, no source text).
describe('the everyday badges (V1): an oak midrib inside the leaf, heather bells apart', () => {
  // One badge unit is 22/24 px at 22 px on a 1x screen.
  const PX = 22 / 24;
  const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
  const tags = (svg, name) => [...svg.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
  // An absolute or relative M/L/H/V/C/Q/Z path, as points: each curve sampled.
  function pathPoints(d, steps = 40) {
    const toks = d.match(/[MLHVCQZmlhvcqz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g);
    const out = [];
    let i = 0; let cmd = ''; let x = 0; let y = 0; let sx = 0; let sy = 0;
    const num = () => Number(toks[i++]);
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0; const oy = rel ? y : 0;
      switch (cmd.toUpperCase()) {
        case 'M': x = ox + num(); y = oy + num(); sx = x; sy = y; out.push([x, y]); cmd = rel ? 'l' : 'L'; break;
        case 'L': x = ox + num(); y = oy + num(); out.push([x, y]); break;
        case 'H': x = (rel ? x : 0) + num(); out.push([x, y]); break;
        case 'V': y = (rel ? y : 0) + num(); out.push([x, y]); break;
        case 'Q': case 'C': {
          const n = cmd.toUpperCase() === 'Q' ? 2 : 3;
          const p = [[x, y]];
          for (let k = 0; k < n; k++) p.push([ox + num(), oy + num()]);
          for (let s = 1; s <= steps; s++) {
            const t = s / steps;
            let q = p.map((v) => [...v]);
            while (q.length > 1) q = q.slice(1).map((v, k) => [q[k][0] + (v[0] - q[k][0]) * t, q[k][1] + (v[1] - q[k][1]) * t]);
            out.push(q[0]);
          }
          [x, y] = p[n];
          break;
        }
        case 'Z': x = sx; y = sy; out.push([x, y]); break;
        default: throw new Error(`path command ${cmd}`);
      }
    }
    return out;
  }
  const inside = ([px, py], poly) => {
    let hit = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a]; const [xb, yb] = poly[b];
      if ((ya > py) !== (yb > py) && px < ((xb - xa) * (py - ya)) / (yb - ya) + xa) hit = !hit;
    }
    return hit;
  };
  const segDist = ([px, py], [xa, ya], [xb, yb]) => {
    const dx = xb - xa; const dy = yb - ya;
    const t = Math.max(0, Math.min(1, ((px - xa) * dx + (py - ya) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - (xa + t * dx), py - (ya + t * dy));
  };
  const edgeDist = (p, poly) => Math.min(...poly.map((v, k) => segDist(p, poly[k ? k - 1 : poly.length - 1], v)));

  it('the oak leaf\'s midrib is a short curve inside the leaf, clear of its edge and apart from the stem', () => {
    const svg = off.EMBLEMS.woods;
    const paths = tags(svg, 'path');
    const leaf = paths.find((t) => attr(t, 'fill') === '#2f5a33');
    const rib = paths.filter((t) => attr(t, 'stroke') === '#f1e0c2');
    const stem = paths.find((t) => attr(t, 'stroke') === '#2f5a33');
    expect(rib).toHaveLength(1);
    const outline = pathPoints(attr(leaf, 'd'));
    const ribPts = pathPoints(attr(rib[0], 'd'));
    const half = Number(attr(rib[0], 'stroke-width')) / 2;
    // Every point of the midrib's centre line is inside the leaf, and the
    // stroke's own edge stays at least 0.9 leaf units (about 0.9 px at 22 px:
    // the group's scale is 1.15, 1.15 x 22/24 = 1.05 px a unit) from the
    // leaf's edge, so a band of green shows all round the cream at 1x.
    const CLEAR = 0.9;
    for (const p of ribPts) {
      expect(inside(p, outline), `midrib point ${p} inside the leaf`).toBe(true);
      expect(edgeDist(p, outline) - half, `midrib point ${p} clear of the edge`).toBeGreaterThanOrEqual(CLEAR);
    }
    // a curve, not a ruler line: its middle bows at least 0.4 units off its chord
    const [a, b] = [ribPts[0], ribPts[ribPts.length - 1]];
    const bow = Math.max(...ribPts.map((p) => segDist(p, a, b)));
    expect(bow).toBeGreaterThanOrEqual(0.4);
    // short of the leaf: it runs at most 60% of the leaf's height
    const ys = outline.map((p) => p[1]);
    expect(Math.abs(b[1] - a[1])).toBeLessThanOrEqual(0.6 * (Math.max(...ys) - Math.min(...ys)));
    // apart from the stem: a green gap of at least 1.5 units from the midrib's
    // lower end to where the stem starts, so the two never read as one stroke
    const stemStart = pathPoints(attr(stem, 'd'))[0];
    const lower = a[1] > b[1] ? a : b;
    expect(Math.hypot(stemStart[0] - lower[0], stemStart[1] - lower[1])).toBeGreaterThanOrEqual(1.5);
  });

  it('the heather has three or four bigger bells, each a dot of its own at 22 px on a 1x screen', () => {
    const svg = off.EMBLEMS.moor;
    const bells = tags(svg, 'circle').map((t) => ['cx', 'cy', 'r'].map((k) => Number(attr(t, k))));
    expect(bells.length).toBeGreaterThanOrEqual(3);
    expect(bells.length).toBeLessThanOrEqual(4);
    // R_MIN 2: a bell is at least 4 units (3.7 px) across, a solid dot of
    // three or more whole pixels at 1x.
    const R_MIN = 2;
    // GAP_MIN 2.2: 2.2 x 22/24 = 2.02 px between two bells. A gap of 2 px holds
    // at least one pixel that no bell touches, wherever the bells fall on the
    // pixel grid; a 1 px gap can land as two half-grey pixels and close up.
    const GAP_MIN = 2.2;
    expect(GAP_MIN * PX).toBeGreaterThanOrEqual(2);
    for (const [cx, cy, r] of bells) {
      expect(r, `bell at ${cx},${cy}`).toBeGreaterThanOrEqual(R_MIN);
      // the whole bell is inside the 24-unit drawing
      expect(Math.min(cx - r, cy - r)).toBeGreaterThanOrEqual(0);
      expect(Math.max(cx + r, cy + r)).toBeLessThanOrEqual(24);
    }
    for (let k = 0; k < bells.length; k++) {
      for (let j = k + 1; j < bells.length; j++) {
        const [x1, y1, r1] = bells[k]; const [x2, y2, r2] = bells[j];
        expect(Math.hypot(x2 - x1, y2 - y1) - r1 - r2, `gap between bells ${k} and ${j}`).toBeGreaterThanOrEqual(GAP_MIN);
      }
    }
  });
});

describe('5. the island is a quiet place in words; its rule is the same', () => {
  it('no label on it says truce or meeting', () => {
    withOffWords(() => {
      const labels = [...ISLAND_SCENICS, ...ISLAND_COLLECTIBLES].map((x) => x.label).filter(Boolean);
      expect(labels.length).toBeGreaterThan(3);
      for (const l of [ISLAND.name, ...labels]) expect(l).not.toMatch(/truce|meeting|gather/i);
      expect(ISLAND.name).toMatch(/Still/);
      expect(labels).toContain('the stone ring under the old ash');
    });
    expect(ISLAND.name).toBe('The island');
    expect(Object.keys(ISLAND)).toEqual(['id', 'areaId', 'name', 'status', 'outline']);
    expect(JSON.parse(JSON.stringify(ISLAND)).name).toBe('The island');
  });

  it('nobody walks its bounds, in either set', () => {
    const rule = () => [TRUCE_AREAS.includes('island'), patrolClanFor('island', []), patrolClanFor('island', ['pines']), rivalFor('island', [])];
    const theirs = rule();
    expect(theirs).toEqual([true, null, null, null]);
    expect(withOffWords(rule)).toEqual(theirs);
  });
});

describe('6. the list of names to keep away from is not consulted', () => {
  it('the set has no such list, and a child may type any name the game accepts', () => {
    expect(on.DENIED_NAMES.size).toBeGreaterThan(100);
    // every use of the list in src/ reads the set in use, so an empty list IS "not consulted"
    for (const f of FILES) {
      if (f.endsWith('clanwords.js') || f === 'src/wordset.js') continue;
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of code.matchAll(/^.*\bDENIED_NAMES\b.*$/gm)) expect(m[0], f).toMatch(/words\(\)|DENIED_NAMES\.has\(/);
    }
    withOffWords(() => {
      expect(words().DENIED_NAMES.size).toBe(0);
      const st = mem();
      const p = createProgression(st);
      for (const typed of ['Firestar', 'Bluestar', 'Graystripe', 'Mosskit', 'Pickles']) {
        expect(validPetName(typed), typed).toBe(true);
        p.setPetName(typed);
        expect(JSON.parse(st.map.get(KEY)).petName).toBe(typed);
      }
      // and no name the game itself shows depends on it: the cast is made without it
      expect(clanCast('river').map((m) => m.name)).toEqual([...off.CLAN_CAT_PREFIXES.river]);
    });
  });
});

// ---- 4. a save's colony title across both sets -----------------------------------------

describe('a save keeps its colony title\'s position across both sets', () => {
  const titleOn = (i) => on.PREFIXES[i] + on.CLAN_SUFFIX;
  const titleOff = (i) => `${off.PREFIXES[i]} ${off.CLAN_SUFFIX}`;

  it('every position names one title in each set, and each title names its position', () => {
    addWordSet(OFF, off);
    on.PREFIXES.forEach((_p, i) => {
      expect(inEachWordSet(() => clanTitleOfWord(i))).toEqual([titleOn(i), titleOff(i)]);
      // either spelling is understood whichever set is in use
      for (const mode of ['on', 'off']) {
        setSeriesMode(mode);
        expect(clanWordOfTitle(titleOn(i))).toBe(i);
        expect(clanWordOfTitle(titleOff(i))).toBe(i);
      }
    });
  });

  it('an old save (the finished text only) shows the same position in everyday words', () => {
    const st = mem({ [KEY]: JSON.stringify({ version: 4, clan: { name: titleOn(5), adopted: true } }) });
    withOffWords(() => {
      const p = createProgression(st);
      expect(p.state.clan).toEqual({ name: titleOff(5), word: 5, adopted: true });
      expect(ownClanTitle(p.state)).toBe(titleOff(5));
      p.ensureClanName(ME); // a no-op: it must not rename or un-adopt
      expect(p.state.clan).toEqual({ name: titleOff(5), word: 5, adopted: true });
    });
    // untouched for the family's game
    expect(createProgression(st).state.clan).toEqual({ name: titleOn(5), word: 5, adopted: true });
  });

  it('a new save (position and text) shows the same position in both sets, whichever wrote it', () => {
    // written under the family's words
    const a = mem();
    const pa = createProgression(a);
    pa.ensureClanName(ME);
    const word = pa.state.clan.word;
    expect(JSON.parse(a.map.get(KEY)).clan).toEqual({ name: titleOn(word), word, adopted: false });
    withOffWords(() => {
      expect(ownClanTitle(pa.state)).toBe(titleOff(word)); // the running game, no reload
      expect(createProgression(a).state.clan).toEqual({ name: titleOff(word), word, adopted: false });
    });
    // written under the everyday words: the same player gets the same position
    const b = mem();
    const saved = withOffWords(() => {
      const pb = createProgression(b);
      pb.ensureClanName(ME);
      return JSON.parse(b.map.get(KEY)).clan;
    });
    expect(saved).toEqual({ name: titleOff(word), word, adopted: false });
    // read back by a build that holds only the family's set: the position is what counts
    expect(seriesModes()).toEqual(['on']);
    expect(sanitizeClan(saved)).toEqual({ name: titleOn(word), word, adopted: false });
    expect(createProgression(b).state.clan).toEqual({ name: titleOn(word), word, adopted: false });
  });

  it('a pair adopts the same position under either set', () => {
    const adopt = () => {
      const p = createProgression(mem());
      p.adoptClanName(clanTitleFor('player-aaa'));
      return p.state.clan.word;
    };
    const theirs = adopt();
    expect(Number.isInteger(theirs)).toBe(true);
    expect(withOffWords(adopt)).toBe(theirs);
  });

  it('once she has picked a home, the title is her crew\'s name', () => {
    const state = { edition: 'canon', clanPick: { mine: 'moor', partner: null, partnerId: null }, clan: { name: titleOn(3), word: 3, adopted: false } };
    expect(ownClanTitle(state)).toBe(on.HOMAGE_PREFIXES.moor + on.CLAN_SUFFIX);
    expect(withOffWords(() => ownClanTitle(state))).toBe('Moor Crew');
  });
});

// ---- 5. the family's game is untouched ---------------------------------------------------

describe('with the family\'s words in use, none of this is there', () => {
  it('the family\'s set carries no rule, no stand-in rank, no line and no badge word of its own', () => {
    for (const extra of ['RULES', 'RANK_AS', 'LINES', 'BADGE_WORDS', 'PHRASES']) expect(words()[extra], extra).toBeUndefined();
    expect(wordRule('storedNames')).toBe(false);
    expect(wordRule('noStarNames')).toBe(false);
    expect(wordRule('stoneSeat')).toBe(false);
    expect(wordRule('toString')).toBe(false);
    for (const k of Object.values(RANK_KEYS)) {
      expect(rankShown(k)).toBe(k);
      expect(rankWord(k)).toBe(on.RANK_WORDS[k]);
    }
    for (const id of Object.keys(TUTORIAL)) {
      expect(tutorialLine(id, { touch: true })).toBe(TUTORIAL[id].touch.replace(/\{\w+\}/g, ''));
      expect(tutorialLine(id)).toBe(TUTORIAL[id].keys.replace(/\{\w+\}/g, ''));
    }
    expect(editionTitle('canon')).toBe(`${on.CLAN_SUFFIX} Edition`);
  });

  it('a set without these tables behaves as the family\'s does (the stand-in has none)', () => {
    withStandInWords(() => {
      expect(wordRule('storedNames')).toBe(false);
      expect(rankShown(RANK_KEYS.deputy)).toBe(RANK_KEYS.deputy);
      expect(candidateStarNames(ME).length).toBe(3);
      expect(clanNameOf(STORED[0], null, RANK_KEYS.kit)).not.toBe(STORED[0]);
      expect(tutorialLine('camp.here')).toBe(TUTORIAL['camp.here'].keys);
      expect(ISLAND.name).toBe('The island');
    });
  });

  // The lines added to the phrase table on 2026-11-18, as the family's game
  // says them: recorded in a fixture of their own, since the first table's
  // fixture is not re-recorded.
  it('the lines added later say what the screen said before', () => {
    const said = Object.fromEntries(LATER_PHRASE_IDS.map((id) => [id, phrase(id, 'A')]));
    said['colony.rankAfterName for every rank word'] = Object.values(on.RANK_WORDS).map((w) => phrase('colony.rankAfterName', w));
    checkAgainstFixture('series-words-on-later.json', said, UPDATING_OFF);
    for (const w of [...Object.values(on.RANK_WORDS), 'a · b', '']) expect(phrase('colony.rankAfterName', w)).toBe(w);
    // nothing of the first table moved into the later one, or out of it
    expect(PHRASE_IDS.filter((id) => LATER_PHRASE_IDS.includes(id))).toEqual([]);
    expect(PHRASE_IDS.length).toBe(Object.keys(readFixture('series-words-on.json').phrases).length);
  });
});
