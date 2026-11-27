import { describe, it, expect, afterEach } from 'vitest';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { CATALOG, createProgression } = await import('../src/progression.js');
const { setTele } = await import('../src/teleflag.js');
const { areaInEdition, areaShown, effectiveArea, placeName } = await import('../src/edition.js');
const { walkOnMove, pickOnCrossing } = await import('../src/gatecross.js');
const { placeState } = await import('../src/territories.js');
const { memStorage } = await import('./helpers/walkharness.js');
const { teleKit } = await import('./helpers/tele.js');
const { goldForEdition } = await import('../src/goldmice.js');
const T = await teleKit();
const { nextThing } = await import('../src/ui/nextthing.js');

// The Greenhouse's way in (G4): a free place, after 2 Park walks, in both editions, reached only through the Park's archway. Its catalog row
// is hidden from every card, map circle, purchase and total while the teleport-gates switch (?gates=1) is off.

afterEach(() => setTele(null));
const save = (o = {}) => {
  const p = createProgression(memStorage());
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('park');
  p.state.walks.park = 2;
  Object.assign(p.state, o);
  return p;
};

describe('the catalog row', () => {
  it('free, after 2 Park walks, no edition key, marked as a gate-only place; the gate rule is the same number', () => {
    expect(CATALOG.areas.greenhouse).toEqual({ name: 'The Greenhouse', price: 0, requires: { area: 'park', walks: 2 }, gate: 'tele' });
    expect(T.GREENHOUSE_NEED_WALKS).toBe(CATALOG.areas.greenhouse.requires.walks);
    expect(T.TELE_ENDS.park.find((e) => e.to === 'greenhouse').needWalks).toBe(CATALOG.areas.greenhouse.requires.walks);
    expect(CATALOG.areas.greenhouse.requires.area).toBe('park');
    expect(createProgression(memStorage()).state.walks.greenhouse).toBe(0); // an old save loads with walks.greenhouse 0 (the key was reserved in G2)
  });
  it('with the gates switch off nothing shows it: not in either edition, not bought, not set, not her walk', () => {
    setTele(false);
    for (const edition of ['canon', 'legacy']) {
      expect(areaShown(CATALOG.areas.greenhouse, edition), edition).toBe(false);
      expect(areaInEdition(CATALOG.areas.greenhouse, edition), edition).toBe(true); // (it is in both editions: the gold total counts it)
      const p = save({ edition });
      expect(p.canBuy('areas', 'greenhouse'), edition).toBe(false);
      expect(p.buy('areas', 'greenhouse')).toBe(false);
      p.setArea('greenhouse');
      expect(p.state.area).not.toBe('greenhouse');
      expect(p.pickPlace('greenhouse')).toBe(false);
      expect(goldForEdition(edition, CATALOG).size).toBe(edition === 'canon' ? 65 : 41); // (the total counts by edition, as it counts the Moon)
    }
    expect(effectiveArea({ area: 'greenhouse', edition: 'canon' }, CATALOG)).toBe('neighborhood'); // a save that somehow stands there walks the town
    expect(JSON.stringify(nextThing(save().state, { catalog: CATALOG }) ?? null)).not.toMatch(/greenhouse/i);
  });
  it('with the switch on it is a free place after 2 Park walks, both editions', () => {
    setTele(true);
    for (const edition of ['canon', 'legacy']) {
      expect(areaShown(CATALOG.areas.greenhouse, edition)).toBe(true);
      const early = save({ edition });
      early.state.walks.park = 1;
      expect(early.canBuy('areas', 'greenhouse'), `${edition} after 1 walk`).toBe(false);
      expect(save({ edition }).canBuy('areas', 'greenhouse'), `${edition} after 2`).toBe(true);
      expect(placeState(save({ edition }).state, CATALOG, 'greenhouse')).toMatchObject({ locked: false, price: 0, owned: false });
    }
    expect(placeName('greenhouse', 'canon', CATALOG)).toBe('The Greenhouse');
    expect(effectiveArea({ area: 'greenhouse', edition: 'canon' }, CATALOG)).toBe('greenhouse');
  });
});

describe('the price-0 walk-on: the "take" path', () => {
  it('a solo cat who has walked the Park twice takes the free Greenhouse through the archway, paying nothing', () => {
    setTele(true);
    const p = save({ points: 40 });
    expect(walkOnMove(p.state, CATALOG, 'greenhouse')).toBe('take');
    expect(T.teleHandoff({ via: 'park-greenhouse', state: p.state, catalog: CATALOG }).move).toBe('take');
    expect(pickOnCrossing(p, CATALOG, 'greenhouse')).toBe('take');
    expect(p.state.unlocked.areas).toContain('greenhouse');
    expect(p.state.area).toBe('greenhouse');
    expect(p.state.points).toBe(40);
    // owned now: the way back and any later walk-on 'set' it
    expect(walkOnMove(p.state, CATALOG, 'greenhouse')).toBe('set');
  });
  it('a guest never takes it (override), and a cat that has walked the Park once cannot buy it (the gate itself is dormant)', () => {
    setTele(true);
    const p = save();
    expect(walkOnMove(p.state, CATALOG, 'greenhouse', { guest: true })).toBe('override');
    expect(pickOnCrossing(p, CATALOG, 'greenhouse', { guest: true })).toBe(false);
    expect(p.state.unlocked.areas).not.toContain('greenhouse');
    const young = save();
    young.state.walks.park = 1;
    const status = T.teleStatus(T.TELE_ENDS.park.find((e) => e.to === 'greenhouse'), young.state, CATALOG);
    expect(status.kind).toBe('dormant');
  });
});
