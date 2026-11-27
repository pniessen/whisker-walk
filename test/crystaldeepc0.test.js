// Milestone C0 of the Crystal Cave second story: the shared seams only (save keys, merge, prize, pages, gold stubs, the empty third stage, wd- routing, names).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { CRYSTAL_DEEP_PAGES, WING_LIVE, wingPageShown, CRYSTAL_PAGE_WORDS } from '../src/crystalpages.js';
import { crystalDeepOn, setCrystalDeep } from '../src/crystalflag.js';
import { AWARDS } from '../src/discoveries.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
const fresh = (o = {}) => sanitizeSave({ version: 4, ...o });

describe('crystal deep: the save keys', () => {
  it('default to 0 and round trip', () => {
    expect(fresh().crystal).toMatchObject({ deep: 0, chimes: 0 });
    expect(fresh({ crystal: { step: 7, deep: 15, chimes: 4095 } }).crystal).toMatchObject({ deep: 15, chimes: 4095 });
  });
  it('bits imply the ones before', () => {
    const d = (deep) => fresh({ crystal: { deep } }).crystal.deep;
    expect([d(8), d(4), d(2), d(1), d(0)]).toEqual([15, 7, 3, 1, 0]);
  });
  it('hostile payloads are cut back', () => {
    for (const junk of [-5, 1.5, 2.7, 1e12, 'x', null, NaN, Infinity, [], {}]) {
      const c = fresh({ crystal: { deep: junk, chimes: junk } }).crystal;
      expect(c.deep, String(junk)).toBeLessThanOrEqual(15); expect(c.deep).toBeGreaterThanOrEqual(0); expect(Number.isInteger(c.deep)).toBe(true);
      expect(c.chimes).toBeLessThanOrEqual(4095); expect(c.chimes).toBeGreaterThanOrEqual(0); expect(Number.isInteger(c.chimes)).toBe(true);
    }
    expect(fresh({ crystal: { deep: 1e12, chimes: 1e12 } }).crystal).toMatchObject({ deep: 15, chimes: 4095 });
  });
  it('a merge ORs both keys and keeps them in range', () => {
    const a = fresh({ crystal: { step: 7, deep: 3, chimes: 5 } });
    expect(mergeSaves({ local: a, cloud: { version: 4, crystal: { step: 7, deep: 4, chimes: 2 } } }).save.crystal).toMatchObject({ deep: 7, chimes: 7 });
    for (const junk of [-5, 1.5, 1e12, 'x', NaN, Infinity]) {
      const c = mergeSaves({ local: a, cloud: { version: 4, crystal: { deep: junk, chimes: junk } } }).save.crystal;
      expect(c.deep).toBeLessThanOrEqual(15); expect(c.chimes).toBeLessThanOrEqual(4095);
      expect(c.deep & 3).toBe(3); expect(c.chimes & 5).toBe(5); // the local bits are never lost
    }
  });
});

describe('crystal deep: the prize and the awards', () => {
  it('prismcharm is a neck prize owned only when deep bit 3 is set', () => {
    expect(CATALOG.accessories.prismcharm).toEqual({ name: 'Prism Charm', slot: 'neck', price: 0, prize: true, crystal: 'deep' });
    expect(fresh({ crystal: { deep: 7 } }).unlocked.accessories).not.toContain('prismcharm');
    expect(fresh({ crystal: { deep: 8 } }).unlocked.accessories).toContain('prismcharm');
  });
  it('the awards exist', () => { expect([AWARDS.crystaldeep, AWARDS.deepjob]).toEqual([40, 25]); });
});

describe('crystal deep: pages, flag and the empty stage', () => {
  it('five reserved pages, hidden until their switch is on', () => {
    expect(CRYSTAL_DEEP_PAGES.map((p) => p[0])).toEqual(['ccwall', 'ccdeep', 'ccprism', 'cctink', 'ccchimes']);
    for (const [id, , , name] of CRYSTAL_DEEP_PAGES) { expect(wingPageShown(id)).toBe(false); expect(CRYSTAL_PAGE_WORDS[id].name()).toBe(name); }
    for (const k of ['wall', 'deep', 'prism', 'tink', 'chimes']) expect(WING_LIVE[k]).toBeFalsy();
  });
  it('the flag is off by default and can be forced', () => {
    expect(crystalDeepOn()).toBe(false);
    setCrystalDeep(true); expect(crystalDeepOn()).toBe(true); setCrystalDeep(null); expect(crystalDeepOn()).toBe(false);
  });
  it('the third stage is valid and loads with the others (C2 filled the hall shell; no prompt or credit yet, so the arbiter still gets null)', async () => {
    const S = await import('../src/world/crystalstages.js');
    await S.loadCrystalStages();
    expect(Object.isFrozen(S.ST.deep)).toBe(true); expect(S.ST.deep.promptAt).toBeUndefined(); expect(S.ST.deep.credit).toBeUndefined();
    expect(S.CRYSTAL_STAGE_MODULES).toContain('src/world/crystalstagedeep.js');
    const code = readFileSync(new URL('../src/world/crystalstagedeep.js', import.meta.url), 'utf8');
    expect(code).toMatch(/crystalDeepOn/); // behind the flag
  });
  it('an empty slot answers null to the arbiter shape', () => {
    const slot = (get) => ({ promptAt: (p) => get()?.promptAt?.(p) ?? null, interact: () => get()?.interact?.() ?? null });
    const s = slot(() => Object.freeze({}));
    expect([s.promptAt({}), s.interact()]).toEqual([null, null]);
  });
  it('crystal.js routes wd- events to the slot before Lumi', () => {
    const code = readFileSync(new URL('../src/world/crystal.js', import.meta.url), 'utf8');
    expect(code.indexOf("startsWith('wd-')")).toBeGreaterThan(code.indexOf("startsWith('wc-')"));
    expect(code.indexOf("startsWith('wd-')")).toBeLessThan(code.indexOf('return lumi.credit(ev)'));
  });
  it('NAMES is one frozen table; other files hold no literal copy of its names', async () => {
    const { NAMES } = await import('../src/world/crystaldeepnames.js');
    expect(Object.isFrozen(NAMES)).toBe(true);
    expect(NAMES.creature).toBe('Tink');
    for (const f of ['src/world/crystalstagedeep.js', 'src/crystalpages.js', 'src/world/crystal.js']) {
      const c = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
      expect(/Tink|Echo Deep|Prism Charm/.test(c.replace(/\/\/.*$/gm, '')), f).toBe(false);
    }
  });
});
