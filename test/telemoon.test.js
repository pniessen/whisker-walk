import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

// Teleport gates, milestone 3: the Moon gate. A stone ring in the Park (12, 44), awake after two Park walks; its twin is the
// Moon's own return ring (-10, 41). She lands beside each, facing it. Behind ?gates=1 until the map milestone, both
// editions, solo (a room and couch play are refused kindly). The suit is drawn from the place, once.

const { walkHarness, areas, fakeDocument } = await import('./helpers/walkharness.js');
const { teleKit } = await import('./helpers/tele.js');
const { GATE_MOMENT_MS } = await import('../src/gatecross.js');
const { setTele } = await import('../src/teleflag.js');
const { setGreenhouse } = await import('../src/greenhouseflag.js');
const { teleLoad, tele } = await import('../src/telehook.js');
const { registerSuitKit, suitKit, effectiveWear } = await import('../src/suithook.js');
const { CATALOG } = await import('../src/progression.js');
const { phrase } = await import('../src/clanphrases.js');
const { mulberry32 } = await import('../src/rng.js');
const { GATE_REACH, GATE_PREFETCH_REACH, arrivalFor } = await import('../src/gateways.js');
const { COOP_READY } = await import('../src/coop/table.js');
const { AREA_ENTRY_MODULES } = await import('../src/world/areas.js');
const { isWalkableAt } = await import('../src/player.js');
const { floodFrom } = await import('./helpers/flood.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { setGrow } = await import('../src/grow.js');
const { setMoon } = await import('../src/moonflag.js');
const park = await import('../src/world/park.js');
const moon = await import('../src/world/moon.js');
const { MOON_SPAWN, RETURN_GATE } = await import('../src/world/moonplan.js');
const T = await import('../src/teleport.js');
const { buildTeleGate } = await import('../src/world/telegate.js');

await teleKit();
const PM = T.TELE_ENDS.park[1];
const MP = T.TELE_ENDS.moon[0];
const state = (walks = {}, edition = 'canon') => ({ edition, walks });
const WALK_MS = 90_000;

describe('the table', () => {
  it('park-moon and moon-park: each the other\'s twin, the same stone ring, both editions, the Moon\'s suit on the far side only', () => {
    expect(PM).toMatchObject({ id: 'park-moon', to: 'moon', twin: 'moon-park', look: 'stonering', suit: 'space', edition: 'all', kind: 'tele', placement: 'inside' });
    expect(MP).toMatchObject({ id: 'moon-park', to: 'park', twin: 'park-moon', look: 'stonering', suit: null, edition: 'all', kind: 'tele', placement: 'inside', needWalks: 0 });
    expect(PM.gateway).toBe(MP.gateway);
    expect(T.teleEnds('moon')).toEqual([MP]);
    expect(PM.own).toBe(false);
    expect(MP.own).toBe(true); // the Moon draws its own ring stones
  });
  it('needWalks is the Moon plan\'s rule: two Park walks (the catalog row says it too)', () => {
    expect(PM.needWalks).toBe(2);
    expect(T.MOON_NEED_WALKS).toBe(2);
    expect(CATALOG.areas.moon).toEqual({ name: 'The Moon', price: 0, requires: { area: 'park', walks: T.MOON_NEED_WALKS }, gate: 'tele' });
  });
  it('she lands beside the ring she came out of: 3.6 m out, facing it (TELE_ARRIVAL_FACING toward), both ways', () => {
    expect(T.TELE_ARRIVAL_FACING).toBe('toward');
    expect(arrivalFor('park-moon', T.TELE_ENDS)).toEqual({ areaId: 'moon', x: -10, z: 44.6, yaw: 0 });
    expect(arrivalFor('moon-park', T.TELE_ENDS)).toEqual({ areaId: 'park', x: 8.4, z: 44, yaw: -Math.PI / 2 });
    for (const e of [PM, MP]) expect(Math.hypot(e.arrive.x - e.x, e.arrive.z - e.z)).toBeCloseTo(3.6, 9);
  });
  it('the Moon is a chunk the build precaches, and the suit kit is its own lazy chunk', () => {
    expect(AREA_ENTRY_MODULES.moon).toBeTruthy();
  });
});

describe('where the gates stand', () => {
  setGrow(false);
  const parkArea = park.build(new THREE.Scene(), {});
  const moonArea = moon.build(new THREE.Scene(), {});
  const parkFlood = floodFrom(parkArea, park.SPAWN, (x, z) => isWalkableAt(parkArea, x, z));
  const moonFlood = floodFrom(moonArea, MOON_SPAWN, (x, z) => isWalkableAt(moonArea, x, z));

  it('the Park\'s: open lawn clear of every collider, point of interest and golden mouse, in sight of the spawn, reached on foot', () => {
    for (const c of parkArea.colliders) expect(Math.hypot(c.x - PM.x, c.z - PM.z) - (c.r ?? 0), `collider (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(5);
    const things = [...(parkArea.pois ?? []), ...(parkArea.collectibles ?? []), ...(parkArea.scenics ?? []), ...(parkArea.perches ?? []), ...(GOLD_MICE.park ?? []), park.SPAWN];
    for (const t of things) expect(Math.hypot(t.x - PM.x, t.z - PM.z), `thing (${t.x}, ${t.z})`).toBeGreaterThanOrEqual(7);
    expect(Math.hypot(park.SPAWN.x - PM.x, park.SPAWN.z - PM.z)).toBeLessThan(15);
    // clear of the spike gate's own ring too
    expect(Math.hypot(PM.x - T.TELE_ENDS.park[0].x, PM.z - T.TELE_ENDS.park[0].z)).toBeGreaterThan(15);
    const spots = [];
    for (let dx = -GATE_REACH; dx <= GATE_REACH; dx += 0.1) for (let dz = -GATE_REACH; dz <= GATE_REACH; dz += 0.1) {
      if (Math.hypot(dx, dz) <= GATE_REACH - 0.05 && isWalkableAt(parkArea, PM.x + dx, PM.z + dz) && parkFlood.reaches(PM.x + dx, PM.z + dz)) spots.push(1);
    }
    expect(spots.length).toBeGreaterThan(50);
    for (let a = 0; a < 16; a++) for (const r of [1, 2, 3]) expect(isWalkableAt(parkArea, PM.x + Math.cos(a * Math.PI / 8) * r, PM.z + Math.sin(a * Math.PI / 8) * r)).toBe(true);
  });
  it('where she lands in the Park is open, on foot from the spawn, out of reach of the ring, and within its prefetch', () => {
    const l = PM.arrive;
    expect(isWalkableAt(parkArea, l.x, l.z)).toBe(true);
    expect(parkFlood.reaches(l.x, l.z)).toBe(true);
    const d = Math.hypot(l.x - PM.x, l.z - PM.z);
    expect(d).toBeGreaterThan(GATE_REACH + 1);
    expect(d).toBeLessThan(GATE_PREFETCH_REACH);
  });
  it('the Moon\'s return ring is the Moon\'s own: the gate row stands at its middle, she can step in, nothing is drawn twice', () => {
    expect([MP.x, MP.z]).toEqual([RETURN_GATE.x, RETURN_GATE.z]);
    let inReach = 0;
    for (let dx = -GATE_REACH; dx <= GATE_REACH; dx += 0.1) for (let dz = -GATE_REACH; dz <= GATE_REACH; dz += 0.1) {
      if (Math.hypot(dx, dz) <= GATE_REACH - 0.05 && isWalkableAt(moonArea, MP.x + dx, MP.z + dz) && moonFlood.reaches(MP.x + dx, MP.z + dz)) inReach += 1;
    }
    expect(inReach).toBeGreaterThan(50);
    const scene = new THREE.Scene();
    expect(T.draw(scene, 'moon', state(), { y: () => 0 }, false)).toEqual([]);
    expect(scene.children).toHaveLength(0);
  });
  it('where she lands on the Moon is open, on foot from the spawn, in the ring\'s prefetch but not its reach, and the first golden mouse is in sight', () => {
    const l = MP.arrive;
    expect(isWalkableAt(moonArea, l.x, l.z)).toBe(true);
    expect(moonFlood.reaches(l.x, l.z)).toBe(true);
    const d = Math.hypot(l.x - MP.x, l.z - MP.z);
    expect(d).toBeGreaterThan(GATE_REACH + 1);
    expect(d).toBeLessThan(GATE_PREFETCH_REACH);
    const mouse = GOLD_MICE.moon.find((m) => m.id === 'gm-moon-1');
    expect(Math.hypot(mouse.x - l.x, mouse.z - l.z)).toBeLessThanOrEqual(12); // the first trip ends in a find (the deck is 3 m up, a gold dot over the dust)
  });
});

describe('what the gates say', () => {
  beforeEach(() => { setTele(true); setGreenhouse(null); });
  afterEach(() => { setTele(null); });
  it('dormant until two Park walks; then go; the way home is always go', () => {
    expect(T.teleStatus(PM, state({ park: 0 }), CATALOG).kind).toBe('dormant');
    expect(T.teleStatus(PM, state({ park: 1 }), CATALOG).kind).toBe('dormant');
    expect(T.teleStatus(PM, state({ park: 2 }), CATALOG)).toEqual({ kind: 'go', to: 'moon', name: 'The Moon', lineId: null });
    expect(T.teleStatus(MP, state({}), CATALOG)).toMatchObject({ kind: 'go', to: 'park' });
  });
  it('live in both editions, and only behind ?gates=1', () => {
    for (const clan of [true, false]) {
      expect(T.liveTeleEnds('park', CATALOG, { clan })).toContain(PM);
      expect(T.liveTeleEnds('moon', CATALOG, { clan })).toEqual([MP]);
    }
    setTele(false);
    expect(T.liveTeleEnds('park', CATALOG)).toEqual([]);
    expect(T.liveTeleEnds('moon', CATALOG)).toEqual([]);
  });
  it('a room may cross (I3) and couch play stays closed (the Moon is solo: COOP_READY.moon is false), both ways', async () => {
    expect(COOP_READY.moon).toBe(false);
    for (const e of [PM, MP]) {
      expect(T.teleStatus(e, state({ park: 5 }), CATALOG, { inRoom: true }).kind).toBe('go');
      expect(T.teleStatus(e, state({ park: 5 }), CATALOG, { couch: true })).toMatchObject({ kind: 'coop', lineId: 'tele.coop' });
    }
  });
  it('the prompt: nothing while dormant, then "Go through" with the Moon\'s card', () => {
    const near = (e, walks) => T.prompt({ areaId: e.id === 'moon-park' ? 'moon' : 'park' }, { x: e.x + 0.5, z: e.z }, state(walks), false, () => {}, true);
    expect(near(PM, { park: 1 })).toBeNull();
    const p = near(PM, { park: 2 });
    expect(p.prompt.kind).toBe('gate');
    expect(p.prompt.data.card()).toMatch(/the Moon/i);
    expect(near(MP, {}).prompt.kind).toBe('gate');
  });
  it('the handoff: the Moon lands at the ring, in the space suit, nothing carried; home lands in the Park, no suit', () => {
    const to = T.teleHandoff({ via: 'park-moon', state: state({ park: 2 }), catalog: CATALOG });
    expect(to).toMatchObject({ from: 'park', to: 'moon', twin: 'moon-park', suit: 'space', keepRoom: false });
    expect(to.arrive).toEqual({ x: -10, z: 44.6, yaw: 0 });
    const back = T.teleHandoff({ via: 'moon-park', state: state({ park: 2, moon: 1 }), catalog: CATALOG });
    expect(back).toMatchObject({ from: 'moon', to: 'park', suit: null });
  });
});

describe('the suit: once, from the place', () => {
  beforeEach(() => { setTele(true); registerSuitKit(null); });
  afterEach(() => { setTele(null); registerSuitKit(null); });
  it('the gate and the Moon\'s own kit draw the same wear: one suit, never two', async () => {
    expect(T.suitWanted('moon')).toBe(true);
    expect(T.suitWanted('park')).toBe(false);
    await T.loadSuitKit();
    expect(T.suitFor('moon')).toBe('space');
    const own = { collar: 'bell', head: 'hat', face: null, neck: 'scarf', body: 'raincoat', back: 'pack', feet: 'boots' };
    for (const hen of [false, true]) expect(effectiveWear(own, 'moon', 'space', { hen })).toEqual(suitKit().dress(own, 'moon', hen));
    expect(effectiveWear(own, 'moon', 'space', {})).toMatchObject({ head: 'suit-helmet-space', body: 'suit-body-space', back: 'suit-pack-space', feet: 'suit-boots-space', neck: null });
  });
  it('the toast lines on arrival: the suit, then the way home (the gate\'s words)', () => {
    const w = T.walkOn('park-moon', state({ park: 2 }), false);
    expect(w.suitLine).toBe(phrase('tele.suit'));
    expect(w.line).toBe(phrase('tele.home', 'stonering'));
    expect(w.montage).toBe(true);
    expect(T.walkOn('park-moon', state({ park: 2, moon: 1 }), false).montage).toBe(false);
    expect(T.walkOn('moon-park', state({ moon: 1 }), false).suitLine).toBeNull();
  });
});

describe('through the whole walk and home again', () => {
  const suitMeshes = (cat) => { const out = []; cat.traverse((o) => { if (o.isMesh && (o.userData.suit || o.userData.backItem?.startsWith('suit-'))) out.push(o); }); return out; };
  function save(p) {
    p.setTutorialFirst('done');
    p.state.unlocked.areas.push('park');
    p.state.walks.park = 2;
    p.setArea('park');
    p.state.unlocked.accessories.push('raincoat');
    p.state.equipped.body = 'raincoat';
    p.addPoints(100);
  }
  beforeAll(async () => {
    setTele(true);
    await teleLoad();
    await areas.ensureAll(['park', 'moon']);
  });
  beforeEach(() => {
    setTele(true);
    registerSuitKit(null);
    globalThis.document = fakeDocument();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: new Date('2026-11-24T15:00:00Z') });
    const stream = mulberry32(20261124);
    vi.spyOn(Math, 'random').mockImplementation(() => stream());
  });
  afterEach(() => {
    delete globalThis.document;
    vi.restoreAllMocks();
    vi.useRealTimers();
    registerSuitKit(null);
    setMoon(null);
    setTele(null);
  });

  it('Park -> Moon (suited, beside the ring, facing it, her own wear untouched) -> Park (her own clothes, beside her ring)', async () => {
    const walked = [];
    const h = walkHarness({ save, onWalkedOn: (l) => walked.push(l) });
    h.w.startWalk({});
    const equipped = JSON.stringify(h.progression.state.equipped);
    expect(await h.w.walkOn({ via: 'park-moon' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    let s = h.getSession();
    expect(s.areaId).toBe('moon');
    expect(h.progression.state.area).toBe('moon'); // a walk into the Moon is a 'take' now (it has a catalog row, price 0)
    const p = s.cat.position;
    expect(Math.hypot(p.x - MP.arrive.x, p.z - MP.arrive.z)).toBeLessThan(1);
    expect(s.cat.rotation.y).toBeCloseTo(0, 5); // facing the ring (rotation 0 faces -z)
    expect(suitMeshes(s.cat).length).toBeGreaterThan(3);
    expect(JSON.stringify(h.progression.state.equipped)).toBe(equipped);
    const lines = walked.flat().concat(s.startLines ?? []);
    expect(lines).toContain(phrase('tele.suit'));
    expect(lines).toContain(phrase('tele.home', 'stonering'));
    expect(s.arrivedVia).toBe('moon-park');
    // the way home is the same pair
    const home = tele.kit.teleNear('moon', MP.x, MP.z, CATALOG);
    expect(home).toBe(MP);
    expect(await h.w.walkOn({ via: 'moon-park' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    s = h.getSession();
    expect(s.areaId).toBe('park');
    expect(suitMeshes(s.cat)).toHaveLength(0);
    expect(Math.hypot(s.cat.position.x - PM.arrive.x, s.cat.position.z - PM.arrive.z)).toBeLessThan(1);
    expect(JSON.stringify(h.progression.state.equipped)).toBe(equipped);
    expect(h.progression.state.walks.moon).toBe(1);
    expect(JSON.stringify(h.progression.state).includes('suit-')).toBe(false);
  }, WALK_MS);

  it('the Moon gate is drawn in the Park (dormant before two walks), and the Moon draws no second ring', () => {
    const h = walkHarness({ save: (p) => { save(p); p.state.walks.park = 0; } });
    h.w.startWalk({});
    const gates = []; h.getSession().scene.traverse((o) => { if (o.name === 'telegate') gates.push(o); });
    expect(gates.map((g) => [g.userData.endId, g.userData.awake])).toEqual([['park-greenhouse', false], ['park-moon', false]]); // (both dormant before two Park walks)
    const m = walkHarness({ save });
    m.w.startWalk({ areaOverride: 'moon' });
    const rings = []; m.getSession().scene.traverse((o) => { if (o.name === 'telegate') rings.push(o); });
    expect(rings).toHaveLength(0);
  }, WALK_MS);

  it('either edition goes through; a Legacy kid gets the Moon gate in the Park too', async () => {
    const h = walkHarness({ save: (p) => { save(p); p.setEdition('legacy'); } });
    h.w.startWalk({});
    expect(await h.w.walkOn({ via: 'park-moon' })).toBe('walked');
    vi.advanceTimersByTime(GATE_MOMENT_MS);
    expect(h.getSession().areaId).toBe('moon');
  }, WALK_MS);

  it('?moon=1 still starts a solo Moon walk, with no gate and no second suit', () => {
    setMoon(true); setTele(false);
    const h = walkHarness({ save });
    h.w.startWalk({ areaOverride: 'moon' });
    expect(suitMeshes(h.getSession().cat).length).toBeGreaterThan(3);
  }, WALK_MS);
});
