// The holiday outfits (src/foundwear/holidaywear.js): the same gate the found and gift outfits pass (test/giftwearfit.test.js), over
// HOLIDAY_WEAR, so a new record joins every check here; then the catalog rules (earned pieces are prizes, shop pieces are in season only).
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildCat } from '../src/cat/model.js';
import { animateCat } from '../src/cat/animator.js';
import { redressCat } from '../src/cat/redress.js';
import { bodyKind, isPack } from '../src/cat/wearkind.js';
import { HOLIDAY_WEAR, HOLIDAY_CATALOG, holidayPrizeIds, holidayPiecesOwned } from '../src/foundwear/holidaywear.js';
import { HEN_SLOTS } from '../src/foundwear/rules.js';
import { isPieceOf } from '../src/foundwear/display.js';
import { CATALOG, sanitizeSave, createProgression, isPrizeAccessory, isTradeableAccessory } from '../src/progression.js';
import { thumbnailIds, missingFoundThumbs } from '../src/thumbnails.js';
import { DEFAULT_LOOK } from '../src/customcats.js';
import { setHolidayOverride } from '../src/holidays.js';
import { PRESETS, meshCount, triangles, fingerprintCat } from './helpers/catfingerprint.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';
import { phrase } from '../src/clanphrases.js';
import { renderSlotPickerHtml, buildDressingModel } from '../src/ui/dressingroom.js';
import { holidayPrizeLine } from '../src/foundwear/holidaywear.js';

const BARE = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
const SHAPES = [...PRESETS.map((b) => [b, {}]),
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'short', size: 1 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'fluffy', size: 1.15 } }],
  ['tabby', { look: { ...DEFAULT_LOOK, fur: 'long', size: 0.85 } }]];
const IDS = HOLIDAY_WEAR.map((r) => [r.id, r.slot]);
const pieces = (cat, id) => { const out = []; cat.traverse((o) => { if (isPieceOf(o, id)) out.push(o); }); return out; };
const cap = (id, slot, simple) => (slot === 'back' && isPack(id) ? (simple ? 600 : 1200)
  : slot === 'body' && bodyKind(id) === 'shell' ? triangles(buildCat('tabby', { ...BARE, body: 'sweater' }, { simple })) - triangles(buildCat('tabby', BARE, { simple })) // a coat: no more than the Striped Sweater
    : simple ? 450 : 900);
const NIGHT = new Date(2026, 6, 4, 12);

describe('holiday outfits: the records', () => {
  it('ids are unique and 3 to 16 lowercase letters; every one is in the catalog; bits are unique per holiday', () => {
    expect(new Set(IDS.map(([id]) => id)).size).toBe(IDS.length);
    const seen = new Set();
    for (const r of HOLIDAY_WEAR) {
      expect(r.id).toMatch(/^[a-z]{3,16}$/);
      expect(Object.isFrozen(r)).toBe(true);
      expect(CATALOG.accessories[r.id]).toBe(HOLIDAY_CATALOG[r.id]);
      if (r.holiday) { const k = `${r.holiday}${r.bit}`; expect(seen.has(k)).toBe(false); seen.add(k); expect(r.bit).toBeGreaterThanOrEqual(0); expect(r.bit).toBeLessThan(8); }
      else { expect(['christmas', 'hanukkah']).toContain(r.season); expect(r.price).toBeGreaterThanOrEqual(20); expect(r.price).toBeLessThanOrEqual(35); }
    }
  });
  it('Winter Lights has its four earned pieces on bits 0 to 3', () => {
    expect(holidayPrizeIds('winter')).toEqual(['lanterncharm', 'snowcap', 'lightscarf', 'startopper']);
  });
  it('earned pieces are prizes: never sold, never traded, drawn when owned; shop pieces are neither prizes nor drawn before their season', () => {
    for (const r of HOLIDAY_WEAR) {
      const a = CATALOG.accessories[r.id];
      if (r.holiday) {
        expect(a.prize).toBe(true); expect(a.price).toBe(0); expect(isPrizeAccessory(r.id)).toBe(true); expect(isTradeableAccessory(r.id)).toBe(false);
        expect(thumbnailIds(CATALOG, NIGHT)).not.toContain(r.id);
        expect(missingFoundThumbs({ accessories: {} }, [r.id], CATALOG)).toContain(r.id);
      } else {
        expect(a.prize).toBeUndefined(); expect(a.season).toBe(r.season);
        expect(thumbnailIds(CATALOG, NIGHT)).not.toContain(r.id);
        expect(thumbnailIds(CATALOG, new Date(2026, 11, 5, 12))).toContain(r.id);
      }
    }
  });
});

describe('holiday outfits: names', () => {
  it.each(IDS)('%s (%s): a name clean in both word sets, the same in both', (id) => {
    const r = HOLIDAY_WEAR.find((x) => x.id === id);
    expect(r.name().length).toBeGreaterThan(0);
    expect(bannedIn(r.name())).toBe(null);
    expect(withOffWords(() => r.name())).toBe(r.name());
    expect(CATALOG.accessories[id].name).toBe(r.name());
    expect(r.name()).not.toMatch(/star of david|cross/i);
  });
  it('the three earned-piece lines are clean and the same in both sets', () => {
    for (const h of ['winter', 'christmas', 'hanukkah']) {
      const line = holidayPrizeLine(h);
      expect(line.length).toBeGreaterThan(0);
      expect(bannedIn(line)).toBe(null);
      expect(withOffWords(() => holidayPrizeLine(h))).toBe(line);
    }
  });
});

describe('holiday outfits: the gate every outfit passes', () => {
  it.each(IDS)('%s (%s): on every shape it builds, shows, and costs at most 4 meshes and its triangles', (id, slot) => {
    for (const [breed, opts] of SHAPES) for (const simple of [false, true]) {
      const bare = buildCat(breed, BARE, { ...opts, simple }), worn = buildCat(breed, { ...BARE, [slot]: id }, { ...opts, simple });
      expect(pieces(worn, id).length, `${breed} ${simple}`).toBeGreaterThan(0);
      expect(meshCount(worn) - meshCount(bare), `${breed} ${simple}`).toBeLessThanOrEqual(4);
      expect(triangles(worn) - triangles(bare), `${breed} ${simple}`).toBeLessThanOrEqual(cap(id, slot, simple));
    }
  });
  it.each(IDS)('%s (%s): standing, sitting and napping, nothing of it goes into the ground', (id, slot) => {
    for (const breed of PRESETS) for (const st of ['follow', 'perch', 'requestPet', 'nap']) {
      const cat = buildCat(breed, { ...BARE, [slot]: id }); animateCat(cat, st, 1.3, 0, false); cat.updateMatrixWorld(true);
      for (const m of pieces(cat, id)) expect(new THREE.Box3().setFromObject(m, true).min.y, `${breed} ${st}`).toBeGreaterThanOrEqual(-0.01);
    }
  });
  it.each(IDS)('%s (%s): Hagrid wears it only in his four slots, at most 4 meshes', (id, slot) => {
    const n = meshCount(buildCat('hagrid', BARE)), d = meshCount(buildCat('hagrid', { ...BARE, [slot]: id })) - n;
    if (HEN_SLOTS.includes(slot)) { expect(d).toBeGreaterThan(0); expect(d).toBeLessThanOrEqual(4); } else expect(d).toBe(0);
  });
  it.each(IDS)('%s (%s): no glow, never the yarn ball\'s blue or a treasure\'s pink', (id, slot) => {
    const cat = buildCat('tabby', { ...BARE, [slot]: id });
    for (const m of pieces(cat, id)) {
      expect(m.material.emissive?.getHex() ?? 0).toBe(0);
      expect([0x5b7fc7, 0xf25c8a]).not.toContain(m.material.color?.getHex());
      const c = m.geometry.attributes.color;
      if (c) for (let i = 0; i < c.count; i++) expect([0x5b7fc7, 0xf25c8a]).not.toContain(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
    }
  });
  it.each(IDS)('%s (%s): redressCat gives the fresh build', (id, slot) => {
    for (const breed of ['tabby', 'digit', 'hagrid']) {
      const acc = { ...BARE, [slot]: id };
      expect(fingerprintCat(redressCat(buildCat(breed, BARE), breed, acc))).toEqual(fingerprintCat(buildCat(breed, acc)));
    }
  });
  it('none is a pack; only a sweater is a coat', () => {
    for (const [id, slot] of IDS) { expect(isPack(id)).toBe(false); expect(bodyKind(id)).toBe(slot === 'body' ? 'shell' : null); }
  });
});

describe('holiday outfits: earned and kept', () => {
  const win = new Date(2026, 11, 5, 12);
  it('an earned bit owns its piece, survives a reload, and a closed window earns nothing', () => {
    const storage = memoryStorage();
    const p = createProgression(storage);
    expect(p.earnHolidayPiece('winter', 1, new Date(2026, 6, 4))).toBe(false);
    expect(p.state.unlocked.accessories).not.toContain('snowcap');
    expect(p.earnHolidayPiece('winter', 1, win)).toBe(true);
    expect(p.earnHolidayPiece('winter', 1, win)).toBe(false);
    expect(p.earnHolidayPiece('winter', 9, win)).toBe(false);
    expect(p.earnHolidayPiece('easter', 0, win)).toBe(false);
    expect(p.state.holidays).toEqual({ winter2026: 2 });
    expect(createProgression(storage).state.unlocked.accessories).toContain('snowcap');
  });
  it('the bits alone are enough: a save with a lost accessory list still owns the piece, and wears it', () => {
    const out = sanitizeSave({ version: 4, holidays: { winter2027: 9 }, equipped: { collar: 'lanterncharm', back: 'startopper' } });
    expect(out.unlocked.accessories).toEqual(expect.arrayContaining(['lanterncharm', 'startopper']));
    expect(out.unlocked.accessories).not.toContain('snowcap');
    expect(out.equipped.collar).toBe('lanterncharm');
    expect(holidayPiecesOwned({ winter2027: 9 }).sort()).toEqual(['lanterncharm', 'startopper']);
  });
  it('a pinned ?holiday= override lets the errand run out of season', () => {
    setHolidayOverride({ holiday: 'winter' });
    try { expect(createProgression(memoryStorage()).earnHolidayPiece('winter', 0, new Date(2026, 6, 4))).toBe(true); } finally { setHolidayOverride(null); }
  });
  it('a prize cannot be bought at any price', () => {
    const p = createProgression(memoryStorage());
    p.state.points = 999;
    for (const r of HOLIDAY_WEAR) if (r.holiday) expect(p.canBuy('accessories', r.id)).toBe(false);
  });
});

describe('the Christmas shelf (H3)', () => {
  const SHOP = { redcozyhat: 30, reindeerantlers: 35, jinglecollar: 25, candyscarf: 30, evergreensweater: 35 };
  afterEach(() => { vi.useRealTimers(); });
  const at = (y, m, d) => { vi.useFakeTimers(); vi.setSystemTime(new Date(y, m - 1, d, 12)); };
  it('five shop pieces at the spec\'s prices and one earned star on the Christmas bit', () => {
    for (const [id, price] of Object.entries(SHOP)) expect(CATALOG.accessories[id]).toMatchObject({ price, season: 'christmas' });
    expect(holidayPrizeIds('christmas')).toEqual(['littlegoldstar']);
    expect(CATALOG.accessories.littlegoldstar).toMatchObject({ prize: true, holiday: 'christmas', price: 0, slot: 'back' });
  });
  it('no piece costs over 35 and the shelf has one piece for head, collar, neck and body', () => {
    const slots = new Set(Object.keys(SHOP).map((id) => CATALOG.accessories[id].slot));
    expect([...slots].sort()).toEqual(['body', 'collar', 'head', 'neck']);
    for (const id of Object.keys(SHOP)) expect(CATALOG.accessories[id].price).toBeLessThanOrEqual(35);
  });
  it('can be bought in season and the week before, not in July, and never twice', () => {
    for (const [d, ok] of [[[2026, 7, 4], false], [[2026, 11, 23], false], [[2026, 11, 24], true], [[2026, 12, 25], true], [[2026, 12, 26], true], [[2026, 12, 27], false], [[2027, 11, 24], true]]) {
      at(...d);
      const p = createProgression(memoryStorage());
      p.state.points = 100;
      expect(p.canBuy('accessories', 'redcozyhat'), d.join('-')).toBe(ok);
    }
  });
  it('buying takes the paws, owns it for good, and it stays wearable after the shelf closes', () => {
    at(2026, 12, 10);
    const storage = memoryStorage();
    const p = createProgression(storage);
    p.state.points = 60;
    expect(p.buy('accessories', 'jinglecollar')).toBe(true);
    expect(p.state.points).toBe(35);
    expect(p.buy('accessories', 'jinglecollar')).toBe(false);
    at(2027, 3, 1);
    const q = createProgression(storage);
    expect(q.state.unlocked.accessories).toContain('jinglecollar');
    q.state.equipped.collar = 'jinglecollar';
    expect(sanitizeSave(JSON.parse(JSON.stringify(q.state))).equipped.collar).toBe('jinglecollar');
    expect(q.canBuy('accessories', 'candyscarf')).toBe(false); // the shelf is closed
  });
  it('the Little Gold Star is earned, never sold, and its bit lives in the Christmas record', () => {
    at(2026, 12, 10);
    const p = createProgression(memoryStorage());
    p.state.points = 500;
    expect(p.canBuy('accessories', 'littlegoldstar')).toBe(false);
    expect(p.earnHolidayPiece('christmas', 0)).toBe(true);
    expect(p.state.holidays).toEqual({ christmas2026: 1 });
    expect(p.state.unlocked.accessories).toContain('littlegoldstar');
  });
  it('the dressing room shows a seasonal piece only in season, or once owned', () => {
    const state = (owned) => ({ points: 100, unlocked: { cats: ['tabby'], accessories: owned, areas: ['neighborhood'] }, equipped: {}, walks: {} });
    at(2026, 12, 10);
    expect(renderSlotPickerHtml(state([]), CATALOG, 'head', null, null)).toContain('Red Cozy Hat');
    at(2027, 3, 1);
    expect(renderSlotPickerHtml(state([]), CATALOG, 'head', null, null)).not.toContain('Red Cozy Hat');
    expect(renderSlotPickerHtml(state(['redcozyhat']), CATALOG, 'head', null, null)).toContain('Red Cozy Hat');
    // an earned piece not yet earned says how, in plain words; the star shows only its line
    const html = renderSlotPickerHtml(state([]), CATALOG, 'back', null, null);
    expect(html).toContain('Earned at Christmas');
    expect(html).toContain('Earned in Winter Lights');
    expect(buildDressingModel(state([]), CATALOG, {}).accessoryTotal).toBeGreaterThan(0);
  });
});
