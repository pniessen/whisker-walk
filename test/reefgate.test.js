import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
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
const { GOLD_MICE } = await import('../src/goldmice.js');
const { arrivalFor, GATE_REACH, GATE_PREFETCH_REACH } = await import('../src/gateways.js');
const { GATEWAYS } = await import('../src/worldmap.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { setGrow } = await import('../src/grow.js');
const { HINTS } = await import('../src/hints.js');
const { WORDS } = await import('../src/tutorialwords.js');
const { LOOK_BUDGET, buildTeleGate, addTeleGates, teleSolids } = await import('../src/world/telegate.js');
const { nextThing } = await import('../src/ui/nextthing.js');
const seaside = await import('../src/world/seaside.js');
const reef = await import('../src/world/reef.js');
const T = await teleKit();

// The Reef's way in (R6): a free place, after 2 Seaside walks, in both editions, reached only through the Seaside's rock cleft at the pier
// foot, and home again through the Reef's own return arch. Its catalog row is hidden while the teleport-gates switch (?gates=1) is off.

afterEach(() => setTele(null));
const SR = T.TELE_ENDS.seaside[0];
const RS = T.TELE_ENDS.reef[0];
const save = (o = {}) => {
  const p = createProgression(memStorage());
  p.setTutorialFirst('done');
  p.state.unlocked.areas.push('seaside');
  p.state.walks.seaside = 2;
  Object.assign(p.state, o);
  return p;
};

describe('the gate table', () => {
  it('is one pair: the Seaside cleft (suit dive, awake after 2 Seaside walks, both editions) and the Reef\'s own return arch', () => {
    expect(SR).toMatchObject({ id: 'seaside-reef', to: 'reef', twin: 'reef-seaside', look: 'hatch', suit: 'dive', placement: 'inside', edition: 'all', needWalks: 2, own: false, kind: 'tele' });
    expect(RS).toMatchObject({ id: 'reef-seaside', to: 'seaside', twin: 'seaside-reef', look: 'cleft', suit: null, edition: 'all', needWalks: 0, own: true, x: 0, z: 31, faces: 'north' });
    expect(T.REEF_NEED_WALKS).toBe(CATALOG.areas.reef.requires.walks);
    expect(SR.needWalks).toBe(CATALOG.areas.reef.requires.walks);
    expect(T.TELE_LOOK['seaside-reef']).toBe('hatch');
    // no map road joins them, and the map's gate list does not carry the pair
    expect(GATEWAYS.some((g) => [g.from, g.to].sort().join() === 'reef,seaside')).toBe(false);
    expect(GATEWAYS.some((g) => g.id === SR.gateway)).toBe(false);
  });
  it('she lands 3.6 m out from the twin, facing it, both ways (the round trip)', () => {
    const there = arrivalFor('seaside-reef', T.TELE_ENDS);
    const back = arrivalFor('reef-seaside', T.TELE_ENDS);
    expect(there.areaId).toBe('reef');
    expect(back.areaId).toBe('seaside');
    expect(Math.hypot(there.x - RS.x, there.z - RS.z)).toBeCloseTo(3.6, 9);
    expect(Math.hypot(back.x - SR.x, back.z - SR.z)).toBeCloseTo(3.6, 9);
    expect(there).toMatchObject({ x: 0, z: 34.6, yaw: 0 }); // south of the arch, facing -z, toward it
    expect(back.x).toBeLessThan(SR.x); // west of the cleft, facing east toward it
    expect(back.yaw).toBe(-Math.PI / 2);
    // the plan carries it through and the twin's twin is the start
    expect(T.planFor('seaside-reef')).toMatchObject({ from: 'seaside', to: 'reef', arrive: { x: 0, z: 34.6 } });
    expect(T.planFor('reef-seaside')).toMatchObject({ from: 'reef', to: 'seaside', arrive: { x: back.x, z: back.z } });
  });
  it('the Reef\'s arch is the own end (draws nothing here; its pillars are the reef\'s own colliders) and the cleft is drawn at the Seaside', () => {
    setTele(true);
    expect(T.liveTeleEnds('reef', CATALOG)).toEqual([RS]);
    expect(addTeleGates(new THREE.Scene(), T.liveTeleEnds('reef', CATALOG).filter((e) => !e.own)).colliders).toEqual([]);
    expect(T.liveTeleEnds('seaside', CATALOG)).toEqual([SR]);
    expect(T.liveTeleEnds('seaside', CATALOG, { clan: false })).toEqual([SR]); // both editions
    expect(addTeleGates(new THREE.Scene(), [SR]).colliders).toHaveLength(3);
    setTele(false);
    expect(T.liveTeleEnds('seaside', CATALOG)).toEqual([]);
  });
});

describe('where the cleft stands and what it costs', () => {
  setGrow(false);
  const area = seaside.build(new THREE.Scene(), {});
  const reefArea = reef.build(new THREE.Scene());
  it('it stands on open sand at the pier foot, clear of every collider, thing and golden mouse; her landing spot is open, reached on foot, and out of reach', () => {
    for (const c of area.colliders) expect(Math.hypot(c.x - SR.x, c.z - SR.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(2.2);
    const things = [...(area.pois ?? []), ...(area.collectibles ?? []), ...(area.scenics ?? []), ...(area.perches ?? []), ...(GOLD_MICE.seaside ?? [])];
    expect(things.length).toBeGreaterThan(3);
    for (const t of things) expect(Math.hypot(t.x - SR.x, t.z - SR.z), `thing at (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(4);
    const reachable = floodFrom(area, seaside.SPAWN, (x, z) => isWalkableAt(area, x, z));
    expect(Math.hypot(SR.x - 22, SR.z + 10)).toBeLessThan(8); // at the pier foot (the deck starts at x 22, z -10)
    expect(isWalkableAt(area, SR.arrive.x, SR.arrive.z)).toBe(true);
    expect(reachable.reaches(SR.arrive.x, SR.arrive.z)).toBe(true);
    expect(reachable.reaches(SR.x - 1.5, SR.z)).toBe(true);
    expect(Math.hypot(SR.arrive.x - SR.x, SR.arrive.z - SR.z)).toBeGreaterThan(GATE_REACH + 1);
    expect(GATE_PREFETCH_REACH).toBeGreaterThan(3.6);
    // the cleft's rocks are solid to her; the spot in front is not
    const solids = teleSolids(SR);
    expect(solids).toHaveLength(3);
  });
  it('the Reef side: her landing is open sand, reached from the spawn, and the arch\'s pillars are its own', () => {
    const reachable = floodFrom(reefArea, reef.REEF_SPAWN, (x, z) => isWalkableAt(reefArea, x, z));
    expect(isWalkableAt(reefArea, RS.arrive.x, RS.arrive.z)).toBe(true);
    expect(reachable.reaches(RS.arrive.x, RS.arrive.z)).toBe(true);
    expect(isWalkableAt(reefArea, RS.x, RS.z)).toBe(true);
    expect(isWalkableAt(reefArea, RS.x + 1.85, RS.z)).toBe(false);
  });
  it('the look fits the plan\'s gate allowance: 3 meshes, about 400 triangles, 1 transparent draw; the ladder and the ring buoy are in the body', () => {
    const g = buildTeleGate(SR, { calm: true });
    const meshes = [];
    g.traverse((o) => { if (o.isMesh) meshes.push(o); });
    expect(meshes).toHaveLength(3);
    const tris = meshes.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
    expect(tris).toBeLessThanOrEqual(LOOK_BUDGET.triangles);
    expect(tris).toBeLessThanOrEqual(450);
    expect(meshes.filter((m) => m.material.transparent)).toHaveLength(LOOK_BUDGET.transparent);
    expect(g.userData.look).toBe('hatch');
  });
});

describe('the catalog row', () => {
  it('free, after 2 Seaside walks, no edition key, marked as a gate-only place', () => {
    expect(CATALOG.areas.reef).toEqual({ name: 'The Reef', price: 0, requires: { area: 'seaside', walks: 2 }, gate: 'tele' });
    expect(createProgression(memStorage()).state.walks.reef).toBe(0);
  });
  it('with the gates switch off nothing shows it: not in either edition, not bought, not set, not her walk, not a hint', () => {
    setTele(false);
    for (const edition of ['canon', 'legacy']) {
      expect(areaShown(CATALOG.areas.reef, edition), edition).toBe(false);
      expect(areaInEdition(CATALOG.areas.reef, edition), edition).toBe(true);
      const p = save({ edition });
      expect(p.canBuy('areas', 'reef'), edition).toBe(false);
      expect(p.buy('areas', 'reef')).toBe(false);
      p.setArea('reef');
      expect(p.state.area).not.toBe('reef');
      expect(p.pickPlace('reef')).toBe(false);
      expect(goldForEdition(edition, CATALOG).size).toBe(edition === 'canon' ? 68 : 44);
    }
    expect(effectiveArea({ area: 'reef', edition: 'canon' }, CATALOG)).toBe('neighborhood');
    expect(JSON.stringify(nextThing(save().state, { catalog: CATALOG }) ?? null)).not.toMatch(/reef/i);
  });
  it('with the switch on it is a free place after 2 Seaside walks, both editions', () => {
    setTele(true);
    for (const edition of ['canon', 'legacy']) {
      expect(areaShown(CATALOG.areas.reef, edition)).toBe(true);
      const early = save({ edition });
      early.state.walks.seaside = 1;
      expect(early.canBuy('areas', 'reef'), `${edition} after 1 walk`).toBe(false);
      expect(save({ edition }).canBuy('areas', 'reef'), `${edition} after 2`).toBe(true);
      expect(placeState(save({ edition }).state, CATALOG, 'reef')).toMatchObject({ locked: false, price: 0, owned: false });
    }
    expect(placeName('reef', 'canon', CATALOG)).toBe('The Reef');
    expect(effectiveArea({ area: 'reef', edition: 'canon' }, CATALOG)).toBe('reef');
  });
});

describe('the price-0 walk-on: the "take" path', () => {
  it('a solo cat who has walked the Seaside twice takes the free Reef through the cleft, paying nothing, and the way home is a plain set', () => {
    setTele(true);
    const p = save({ points: 40 });
    expect(walkOnMove(p.state, CATALOG, 'reef')).toBe('take');
    expect(T.teleHandoff({ via: 'seaside-reef', state: p.state, catalog: CATALOG }).move).toBe('take');
    expect(T.teleHandoff({ via: 'seaside-reef', state: p.state, catalog: CATALOG }).suit).toBe('dive');
    expect(pickOnCrossing(p, CATALOG, 'reef')).toBe('take');
    expect(p.state.unlocked.areas).toContain('reef');
    expect(p.state.area).toBe('reef');
    expect(p.state.points).toBe(40);
    expect(walkOnMove(p.state, CATALOG, 'reef')).toBe('set');
    expect(T.teleHandoff({ via: 'reef-seaside', state: p.state, catalog: CATALOG })).toMatchObject({ to: 'seaside', suit: null, move: 'set' });
  });
  it('a guest never takes it, and a cat who has walked the Seaside once finds the cleft dormant', () => {
    setTele(true);
    const p = save();
    expect(walkOnMove(p.state, CATALOG, 'reef', { guest: true })).toBe('override');
    expect(pickOnCrossing(p, CATALOG, 'reef', { guest: true })).toBe(false);
    expect(p.state.unlocked.areas).not.toContain('reef');
    const young = save();
    young.state.walks.seaside = 1;
    expect(T.teleStatus(SR, young.state, CATALOG).kind).toBe('dormant');
    expect(T.teleStatus(SR, save().state, CATALOG).kind).toBe('go');
  });
});

describe('the hint and the words', () => {
  it('the Reef has a place hint, once, with a picture, and its words are the same in both sets', () => {
    const h = HINTS.find((x) => x.id === 'reef');
    expect(h.max).toBe(1);
    expect(h.when({ place: 'reef' })).toBe(true);
    expect(h.when({ place: 'seaside' })).toBe(false);
    expect(WORDS['hint.reef']).toBeTruthy();
  });
});
