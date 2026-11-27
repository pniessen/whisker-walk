// Crystal Cave wing C, milestone X0 (the seams): the two new save keys (forge, songs), the six reserved journal ids, the two wing C gold stubs that the scatters must
// not see, the circlet prize, the prompt arbiter and the partner-event routing, the clears hook and the two empty lazy stages (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md).
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

const { sanitizeSave, JOURNAL_TYPES, CATALOG, reefLab } = await import('../src/progression.js');
const { mergeSaves, useSaveTools } = await import('../src/catmerge.js');
const { mergeColony } = await import('../src/colony.js');
const { mergeUsage } = await import('../src/usage.js');
const { sanitizeMarks, MARK_AREAS } = await import('../src/marks.js');
const { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } = await import('../src/customcats.js');
const { OUTFIT_IDS, sameWear } = await import('../src/outfits.js');
useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const { phrase } = await import('../src/clanphrases.js');
const { CRYSTAL_WING_PAGES, CRYSTAL_PAGE_WORDS, WING_LIVE, wingPageShown, CRYSTAL_HINTS } = await import('../src/crystalpages.js');
const { GOLD_MICE, KNOWN_GOLD } = await import('../src/goldmice.js');
const { createPromptArbiter } = await import('../src/world/promptarbiter.js');

const fresh = (o = {}) => sanitizeSave({ version: 4, ...o });
// (numbers are rounded to 5 places before hashing: the Linux CI's Math.sin/cos differ from a Mac's in the last bits)
const sha = (v) => createHash('sha256').update(JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 1e5) / 1e5 : x))).digest('hex');

describe('the save keys', () => {
  it('forge and songs are in the default and round trip', () => {
    expect(fresh().crystal).toEqual({ step: 0, sparks: 0, album: 0, forge: 0, songs: 0, deep: 0, chimes: 0 });
    expect(fresh({ crystal: { step: 7, sparks: 7, album: 1, forge: 5, songs: 6 } }).crystal).toMatchObject({ forge: 5, songs: 6 });
  });
  it('the circlet bit implies all three ingredients; bits are cut to 4 and 3', () => {
    expect(fresh({ crystal: { forge: 8 } }).crystal.forge).toBe(15);
    expect(fresh({ crystal: { forge: 2 } }).crystal.forge).toBe(2);
    expect(reefLab(8)).toBe(15);
    for (const junk of [1e12, -5, NaN, 'x', null, Infinity, [9], {}]) {
      const c = fresh({ crystal: { forge: junk, songs: junk } }).crystal;
      expect(c.forge, String(junk)).toBeLessThanOrEqual(15);
      expect(c.songs, String(junk)).toBeLessThanOrEqual(7);
      expect(Number.isInteger(c.forge) && Number.isInteger(c.songs)).toBe(true);
      if (c.forge & 8) expect(c.forge).toBe(15);
    }
  });
  it('a hostile merge keeps the keys in range, ORs the bits, and fills what the circlet implies', () => {
    const a = fresh({ crystal: { step: 2, forge: 1, songs: 1 } });
    const ok = mergeSaves({ local: a, cloud: { version: 4, crystal: { forge: 8, songs: 6 } } }).save.crystal;
    expect(ok.forge).toBe(15);
    expect(ok.songs).toBe(7);
    for (const hostile of [{ version: 4, crystal: { forge: 1e9, songs: 1e9 } }, { version: 4, crystal: { forge: -1, songs: 'x' } }, { version: 4, crystal: [9, 9] }, { version: 4, crystal: { forge: Infinity, songs: NaN } }]) {
      const r = mergeSaves({ local: a, cloud: hostile }).save.crystal;
      expect(r.forge).toBeLessThanOrEqual(15);
      expect(r.songs).toBeLessThanOrEqual(7);
      expect(r.forge & 1).toBe(1); // the local bit is never lost
      expect(Object.keys(r).sort()).toEqual(['album', 'chimes', 'deep', 'forge', 'songs', 'sparks', 'step']);
    }
  });
});

describe('the journal ids', () => {
  const IDS = ['ccboat', 'ccgrotto', 'ccfalls', 'ccforge', 'cccart', 'ccsong'];
  it('six ids at the very end of JOURNAL_TYPES, with names and hints, hidden until their wing is live', () => {
    expect(CRYSTAL_WING_PAGES.map((p) => p[0])).toEqual(IDS);
    expect(JOURNAL_TYPES.slice(JOURNAL_TYPES.indexOf('ccboat'), JOURNAL_TYPES.indexOf('ccboat') + 6)).toEqual(IDS); // (the Moon's five follow)
    expect(new Set(JOURNAL_TYPES).size).toBe(JOURNAL_TYPES.length);
    for (const id of IDS) { expect(CRYSTAL_PAGE_WORDS[id].name()).toMatch(/\S/); expect(wingPageShown(id), id).toBe(!!WING_LIVE[{ ccboat: 'boat', ccgrotto: 'grotto', ccfalls: 'falls', ccforge: 'forge', cccart: 'cart', ccsong: 'song' }[id]]); }
    expect(wingPageShown('ccrose')).toBe(true);
  });
  it('the lazy words fill the hints in both word sets with no banned or series word', async () => {
    const { HINTS } = await import('../src/world/crystalwingcwords.js');
    const { CRYSTAL_WING_C_LINES } = await import('../src/world/crystalwingcwords.js');
    for (const id of IDS) { expect(CRYSTAL_HINTS[id]).toBe(HINTS[id]); expect(HINTS[id]).toMatch(/\S/); expect(bannedIn(HINTS[id]), id).toBeNull(); }
    for (const [id, line] of Object.entries(CRYSTAL_WING_C_LINES)) {
      expect(phrase(id)).toBe(line);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(line); });
    }
    for (const w of ['collapse', 'trapped', 'stuck', 'dark']) for (const id of IDS) expect(HINTS[id].toLowerCase()).not.toContain(w);
  });
});

describe('the gold stubs and the scatters', () => {
  it('gm-crystal-4 and 5 are in the mice lists, in the plan list, and not in KEEP_OUT', async () => {
    const { CRYSTAL_GOLD } = await import('../src/world/crystalfindsplan.js');
    const P = await import('../src/world/crystalplan.js');
    expect(GOLD_MICE.crystal.map((m) => m.id)).toEqual(['gm-crystal-1', 'gm-crystal-2', 'gm-crystal-3', 'gm-crystal-4', 'gm-crystal-5', 'gm-crystal-6', 'gm-crystal-7']);
    expect(CRYSTAL_GOLD.map((m) => ({ ...m }))).toEqual(GOLD_MICE.crystal);
    expect(KNOWN_GOLD.has('gm-crystal-4') && KNOWN_GOLD.has('gm-crystal-5')).toBe(true);
    for (const m of GOLD_MICE.crystal.slice(3)) expect(P.KEEP_OUT.some((k) => k[0] === m.x && k[1] === m.z), m.id).toBe(false);
  });
  it('the decor, clusters, rim, pebbles and glints are byte-identical to main (recorded hashes)', async () => {
    const D = await import('../src/world/crystaldecor.js');
    const P = await import('../src/world/crystalplan.js');
    const out = { avoid: D.decorAvoid(), high: D.planDecor('high'), low: D.planDecor('low'), clusters: P.scatterClusters(), rim: P.scatterRim(), pebbles: P.scatterPebbles(), glints: P.scatterGlints() };
    expect(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, sha(v)]))).toEqual(EXPECTED_HASHES);
  });
});

describe('the circlet prize', () => {
  it('is a free head prize owned exactly when forge bit 3 is set, never in the shop', () => {
    expect(CATALOG.accessories.crystalcirclet).toEqual({ name: 'Crystal Circlet', slot: 'head', price: 0, prize: true, crystal: 'forge' });
    expect(fresh().unlocked.accessories).not.toContain('crystalcirclet');
    expect(fresh({ crystal: { forge: 7 } }).unlocked.accessories).not.toContain('crystalcirclet');
    expect(fresh({ crystal: { forge: 8 } }).unlocked.accessories).toContain('crystalcirclet');
  });
});

describe('the prompt arbiter and the stages', () => {
  it('asks in order, the first line wins and hears the press; null slots are skipped', () => {
    const log = [];
    const src = (name, line) => ({ promptAt: () => line, interact: () => { log.push(name); return name; } });
    const a = createPromptArbiter([src('lumi', null), null, { }, src('errand', 'Hand in'), src('boat', 'Hop in')]);
    expect(a.promptAt({})).toBe('Hand in');
    expect(a.interact()).toBe('errand');
    expect(a.interact()).toBeNull();
    expect(createPromptArbiter([src('x', null)]).promptAt({})).toBeNull();
  });
  it('crystal.js routes the source order and the wc- events; empty stages change nothing', () => {
    const code = readFileSync(new URL('../src/world/crystal.js', import.meta.url), 'utf8');
    expect(code).toContain("createPromptArbiter([riding, lumi, errand, wingLife, slot(() => river), slot(() => cart), slot(() => forgeJob), slot(() => ST.play?.pads), slot(() => ST.deep)])");
    expect(code).toContain("startsWith('wd-')");
    expect(code).toContain("startsWith('wc-')");
  });
  it('the clears hook starts empty and takes rim rocks and pebbles away after the scatter', async () => {
    const P = await import('../src/world/crystalplan.js');
    expect(P.CRYSTAL_CLEARS).toEqual([]);
    const rim = P.scatterRim(); const peb = P.scatterPebbles();
    P.CRYSTAL_CLEARS.push({ minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 });
    try { expect(P.scatterRim()).toEqual([]); expect(P.scatterPebbles()).toEqual([]); } finally { P.CRYSTAL_CLEARS.length = 0; }
    expect(P.scatterRim()).toEqual(rim); expect(P.scatterPebbles()).toEqual(peb);
  });
  it('the stages are reserved, empty but valid, and load together once', async () => {
    const S = await import('../src/world/crystalstages.js');
    const a = S.loadCrystalStages();
    expect(S.loadCrystalStages()).toBe(a);
    await a;
    expect(Object.keys(S.ST).sort()).toEqual(['deep', 'grotto', 'play', 'wingc']); // (grotto: the C2 grotto and forge shell, filled by crystalgrottostage.js)
    expect(S.CRYSTAL_STAGE_MODULES).toHaveLength(3); // (the third, crystaldeep, is the second story's empty slot)
  });
});

// sha256 of JSON.stringify of each, taken on main before X0 (the wing C stubs must not move one byte)
const EXPECTED_HASHES = {
  "avoid": "a9c7568dc0630792fc0bffcab059b94b799199ae3daca810d94cb31adb5f83d2",
  "high": "644d258e28874896b401172c0ed6137f430d92858c3d9f663bf7ed2bf2784a94",
  "low": "05f2928f899f8ccaa56e42923c8af3b36620e6758166924c2d97250838e1f301",
  "clusters": "9faa6b178d369a2be0b410faac4dc3d0e4f582eadf12c8c97a7cca34335e8137",
  "rim": "f85043e2285d9cebac07d51e313abdf9c14251bddb055af812945c3e175431cc",
  "pebbles": "78bbb2ca1d00e4cf5058698b5b0b379e1eacc6430b08c36aab46c1c7cfdd2a2e",
  "glints": "1f3a1381921a82b7d02d226f8c4b49e4a866d3e21e974c936e259cd97e9a2b2a"
};
