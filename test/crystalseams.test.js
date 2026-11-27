// The Crystal Cave, milestone C0: the seams. The flag, the `crystal` save key (sanitised and merged), the reserved journal and award ids,
// the catalog row, the stub gold mice, the area pack behind ?crystal=1, the words. No movement row: the place uses the defaults.
import { describe, it, expect, afterEach } from 'vitest';
import { CLAN_TOTAL } from './helpers/goldtotals.js';
import { readFileSync, globSync } from 'node:fs';
import * as THREE from 'three';
import { crystalOn, setCrystal } from '../src/crystalflag.js';
import { createProgression, sanitizeSave, JOURNAL_TYPES, freshStateKeys, CATALOG, SAVE_KEY } from '../src/progression.js';
import { mergeSaves, MERGE_RULES, trimBase, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { AWARDS } from '../src/discoveries.js';
import { COOP_READY } from '../src/coop/table.js';
import { AREA_LOADERS, AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { GOLD_MICE, GOLD_TOTAL, KNOWN_GOLD } from '../src/goldmice.js';
import { CRYSTAL_NEED_WALKS } from '../src/teleport.js';
import { phrase, hasPhrase, PHRASE_IDS, LATER_PHRASE_IDS } from '../src/clanphrases.js';
import { CRYSTAL_PAGES, CRYSTAL_JOURNAL_TYPES, CRYSTAL_PAGE_WORDS, CRYSTAL_WING_PAGES, CRYSTAL_DEEP_PAGES } from '../src/crystalpages.js';
import { LINES, HINTS } from '../src/world/crystalwords.js';
import { createGoals } from '../src/goals.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const fresh = (over = {}) => sanitizeSave({ version: 4, ...over });
const read = (f) => readFileSync(f, 'utf8');

describe('the flag', () => {
  afterEach(() => setCrystal(null));
  it('is off with no address and follows a forced value; null goes back to the address bar', () => {
    expect(crystalOn()).toBe(false);
    setCrystal(true); expect(crystalOn()).toBe(true);
    setCrystal(false); expect(crystalOn()).toBe(false);
    setCrystal(null); expect(crystalOn()).toBe(false);
  });
  it('reads ?crystal=1 from the address at call time', () => {
    const was = globalThis.location;
    try {
      globalThis.location = { search: '?crystal=1' };
      expect(crystalOn()).toBe(true);
      globalThis.location = { search: '?crystal=0' };
      expect(crystalOn()).toBe(false);
    } finally {
      if (was === undefined) delete globalThis.location; else globalThis.location = was;
    }
  });
});

describe('the save key', () => {
  it('a fresh save has the default and the walk counter; the key is in the key list', () => {
    expect(fresh().crystal).toEqual({ step: 0, sparks: 0, album: 0, forge: 0, songs: 0, deep: 0, chimes: 0 });
    expect(fresh().walks.crystal).toBe(0);
    expect(freshStateKeys()).toContain('crystal');
    expect(fresh().version).toBe(4);
  });
  it('a good value round trips', () => {
    const crystal = { step: 7, sparks: 7, album: 2730, forge: 15, songs: 5, deep: 7, chimes: 1365 };
    expect(fresh({ crystal }).crystal).toEqual(crystal);
  });
  it('the sparks are derived from the step: a later step never has an earlier stone missing', () => {
    expect(fresh({ crystal: { step: 2, sparks: 0 } }).crystal.sparks).toBe(1);
    expect(fresh({ crystal: { step: 3, sparks: 0 } }).crystal.sparks).toBe(3);
    expect(fresh({ crystal: { step: 4, sparks: 0 } }).crystal.sparks).toBe(7);
    expect(fresh({ crystal: { step: 1, sparks: 4 } }).crystal.sparks).toBe(4);
  });
  it('a hostile value is cut back, never trusted', () => {
    expect(fresh({ crystal: { step: 99, sparks: 255, album: 99999 } }).crystal).toEqual({ step: 7, sparks: 7, album: 4095, forge: 0, songs: 0, deep: 0, chimes: 0 });
    for (const junk of [null, 5, 'crystal', [], [1, 2], { step: 'x', sparks: NaN, album: Infinity }, { step: -3, sparks: -1, album: -9 }]) {
      expect(fresh({ crystal: junk }).crystal, JSON.stringify(junk)).toEqual({ step: 0, sparks: 0, album: 0, forge: 0, songs: 0, deep: 0, chimes: 0 });
    }
  });
  it('goes through the real save and load, and a v3 payload gets the default', () => {
    const storage = memoryStorage();
    const p = createProgression(storage);
    p.replaceFromPayload({ version: 4, crystal: { step: 4, sparks: 3, album: 5 } });
    expect(p.state.crystal).toEqual({ step: 4, sparks: 7, album: 5, forge: 0, songs: 0, deep: 0, chimes: 0 });
    expect(JSON.parse(storage.getItem(SAVE_KEY)).crystal.step).toBe(4);
    expect(createProgression(storage).state.crystal).toEqual(p.state.crystal);
    p.replaceFromPayload({ version: 3 });
    expect(p.state.crystal).toEqual({ step: 0, sparks: 0, album: 0, forge: 0, songs: 0, deep: 0, chimes: 0 });
  });
});

describe('merging two devices', () => {
  const m = (crystal) => ({ crystal });
  const merge = (local, cloud) => mergeSaves({ local: fresh(local), cloud: fresh(cloud) }).save.crystal;
  it('has a rule, and the base keeps the key', () => {
    expect(Object.hasOwn(MERGE_RULES, 'crystal')).toBe(true);
    expect(trimBase(fresh({ crystal: { step: 3 } })).crystal.step).toBe(3);
  });
  it('the story only moves on: step is the larger, sparks and the album are unions of bits', () => {
    expect(merge(m({ step: 3, sparks: 1, album: 5 }), m({ step: 5, sparks: 2, album: 10 }))).toMatchObject({ step: 5, sparks: 7, album: 15 });
    expect(merge(m({ step: 5 }), m({ step: 3 }))).toMatchObject({ step: 5 });
    expect(merge(m({ step: 1, sparks: 4 }), m({ step: 1, sparks: 1 }))).toMatchObject({ step: 1, sparks: 5 });
  });
  it('a hostile cloud payload cannot lift the step past 7, the sparks past 3 bits or the album past 12', () => {
    for (const hostile of [{ version: 4, crystal: { step: 400, sparks: 1e9, album: -1 } }, { version: 4, crystal: { step: 'x', sparks: 255, album: 1e12 } }, { version: 4, crystal: [9, 9, 9] }]) {
      const r = mergeSaves({ local: fresh(m({ step: 2, album: 3 })), cloud: hostile }).save.crystal;
      expect(r.step).toBeLessThanOrEqual(7);
      expect(r.sparks).toBeLessThanOrEqual(7);
      expect(r.album).toBeLessThanOrEqual(4095);
      expect(Object.keys(r).sort()).toEqual(['album', 'chimes', 'deep', 'forge', 'songs', 'sparks', 'step']);
    }
  });
  it('merging a save with itself changes nothing and the merge is stable', () => {
    const a = fresh(m({ step: 6, sparks: 7, album: 99 }));
    const r = mergeSaves({ local: a, cloud: a });
    expect(r.save.crystal).toEqual(a.crystal);
    expect(r.changed).toEqual({ local: false, cloud: false });
    expect(mergeSaves({ local: r.save, cloud: a }).save.crystal).toEqual(r.save.crystal);
  });
});

describe('the reserved ids', () => {
  it('twelve journal ids, in the start-up whitelist, with a name each, none colliding with another place', () => {
    expect(CRYSTAL_JOURNAL_TYPES).toHaveLength(12);
    for (const id of CRYSTAL_JOURNAL_TYPES) { expect(id).toMatch(/^cc/); expect(JOURNAL_TYPES).toContain(id); expect(CRYSTAL_PAGE_WORDS[id].name()).toMatch(/\S/); }
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    const at = JOURNAL_TYPES.indexOf(CRYSTAL_JOURNAL_TYPES[0]); // by position of its first id, so later areas' pages (the Reef's sea life) do not move it
    expect(JOURNAL_TYPES.slice(at, at + CRYSTAL_JOURNAL_TYPES.length)).toEqual(CRYSTAL_JOURNAL_TYPES);
    expect(JOURNAL_TYPES.filter((t) => t.startsWith('cc'))).toEqual([...CRYSTAL_JOURNAL_TYPES, ...CRYSTAL_WING_PAGES.map((p) => p[0]), ...CRYSTAL_DEEP_PAGES.map((p) => p[0])]); // (wing C's six, then the second story's five, are appended at the end: crystalx0.test.js)
  });
  it('a journal page counts like any other (the sanitiser keeps it)', () => {
    expect(fresh({ journal: { ccshow: 2, ccnope: 4 } }).journal).toEqual({ ccshow: 2 });
  });
  it('the three awards have the plan\'s numbers', () => { expect([AWARDS.cavefind, AWARDS.crystalstory, AWARDS.cavejob]).toEqual([12, 40, 25]); });
  it('couch play is not ready in the cave', () => { expect(COOP_READY.crystal).toBe(false); });
  it('the catalog row is free and gate-only, after 2 Docks walks, and the teleport rule says the same', () => {
    expect(CATALOG.areas.crystal).toEqual({ name: 'The Crystal Cave', price: 0, requires: { area: 'docks', walks: 2 }, gate: 'tele' });
    expect(CRYSTAL_NEED_WALKS).toBe(CATALOG.areas.crystal.requires.walks);
  });
});

describe('the golden mice', () => {
  it('seven stub mice inside the bounds (4 and 5 are for wing C, 6 and 7 for the second story), and the totals are 71 and 47', async () => {
    const { CRYSTAL_BOUNDS } = await import('../src/world/crystal.js');
    expect(GOLD_MICE.crystal.map((x) => x.id)).toEqual(['gm-crystal-1', 'gm-crystal-2', 'gm-crystal-3', 'gm-crystal-4', 'gm-crystal-5', 'gm-crystal-6', 'gm-crystal-7']);
    expect(GOLD_TOTAL).toBe(CLAN_TOTAL);
    for (const mouse of GOLD_MICE.crystal) {
      expect(KNOWN_GOLD.has(mouse.id)).toBe(true);
      expect(mouse.x).toBeGreaterThan(CRYSTAL_BOUNDS.minX); expect(mouse.x).toBeLessThan(CRYSTAL_BOUNDS.maxX);
      expect(mouse.z).toBeGreaterThan(CRYSTAL_BOUNDS.minZ); expect(mouse.z).toBeLessThan(CRYSTAL_BOUNDS.maxZ);
    }
  });
});

describe('the pack', () => {
  it('is registered with a loader and an entry module', () => {
    expect(typeof AREA_LOADERS.crystal).toBe('function');
    expect(AREA_ENTRY_MODULES.crystal).toEqual(['src/world/crystal.js']);
  });
  it('builds the stub cave: 72 x 64, a spawn inside the bounds, no strays, no weather, no ceiling, only goals she can finish', async () => {
    const { build, CRYSTAL_BOUNDS, CRYSTAL_SPAWN } = await import('../src/world/crystal.js');
    const scene = new THREE.Scene();
    const area = build(scene);
    expect(area.bounds).toEqual(CRYSTAL_BOUNDS);
    expect(CRYSTAL_BOUNDS.maxX - CRYSTAL_BOUNDS.minX).toBe(72);
    expect(CRYSTAL_BOUNDS.maxZ - CRYSTAL_BOUNDS.minZ).toBe(64);
    expect(area.spawn).toEqual(CRYSTAL_SPAWN);
    expect(area.evening).toBe(true);
    expect(area.strays).toBe(false);
    expect(area.waters).toEqual([]);
    for (const c of area.colliders) expect(Math.hypot(c.x - CRYSTAL_SPAWN.x, c.z - CRYSTAL_SPAWN.z)).toBeGreaterThan(c.r + 1.5);
    let ceil = false; scene.traverse((o) => { if (o.userData?.ceil) ceil = true; });
    expect(ceil).toBe(false);
    const goals = createGoals(() => 0.5, area).goals;
    expect(goals).toHaveLength(3);
    for (const g of goals) expect(area.goalTypes).toContain(g.type);
  });
  it('is not an indoor area (a ceiling would trigger the den\'s cave view)', () => {
    expect(read('src/world/areas.js')).not.toMatch(/INDOOR_AREAS[^;]*crystal/s);
    expect(read('src/world/crystal.js').replace(/\/\/.*$/gm, '')).not.toMatch(/\bceil\b/);
  });
  it('the cave\'s files import no other place (the chunk stays small)', () => {
    for (const f of globSync('src/world/crystal*.js')) {
      for (const [, spec] of read(f).matchAll(/^import .*?from '(.+?)';/gm)) {
        if (spec === '../reefpages.js') continue; // the shared goal-wording helper `nowWords` lives in that START-UP file (already in the main chunk, so it adds nothing to the cave's)
        expect(spec, `${f} imports ${spec}`).not.toMatch(/(moon|greenhouse|seaside|park|docks|reef)/);
      }
    }
  });
});

describe('the words', () => {
  const IDS = Object.keys(LINES);
  it('every lazy line is in the table once the file is loaded, none is in the start-up tables, and none is empty', () => {
    expect(IDS.length).toBeGreaterThan(0);
    for (const id of IDS) {
      expect(hasPhrase(id), id).toBe(true);
      expect(PHRASE_IDS.includes(id) || LATER_PHRASE_IDS.includes(id), `${id} is in the start-up download`).toBe(false);
      expect(phrase(id), id).toMatch(/\S/);
    }
  });
  it('the twelve page names are start-up strings and the twelve hints are lazy lines', () => {
    expect(CRYSTAL_PAGES).toHaveLength(12);
    expect(Object.keys(HINTS)).toEqual(CRYSTAL_JOURNAL_TYPES);
    for (const id of CRYSTAL_JOURNAL_TYPES) expect(CRYSTAL_PAGE_WORDS[id].hint()).toBe(HINTS[id]);
  });
  it('the everyday set never shows a series word, and no line scolds or scares; every line is short', () => {
    withOffWords(() => {
      for (const id of IDS) expect(bannedIn(phrase(id)), id).toBeNull();
      for (const [, , k, name] of CRYSTAL_PAGES) expect(bannedIn(name), k).toBeNull();
      for (const h of Object.values(HINTS)) expect(bannedIn(h)).toBeNull();
    });
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|cave-in|scary|scared|afraid|danger\w*|hurt)\b/i;
    for (const id of IDS) { expect(phrase(id).length, id).toBeLessThanOrEqual(90); expect(phrase(id), id).not.toMatch(scary); }
    for (const h of Object.values(HINTS)) { expect(h.length).toBeLessThanOrEqual(90); expect(h).not.toMatch(scary); }
    for (const [, , , name] of CRYSTAL_PAGES) expect(name).not.toMatch(scary);
  });
});
