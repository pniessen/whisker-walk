import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import fs from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';

stubCanvasDocument();

const { build } = await import('../src/world/greenhouse.js');
const P = await import('../src/world/greenhouseplan.js');
const R = await import('../src/world/greenhouserooms.js');
const B = await import('../src/world/greenhousebutterflies.js');
const L = await import('../src/world/greenhouselife.js');
const W = await import('./helpers/greenhousewalk.js');
const { createProgression } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { GREENHOUSE_HINTS } = await import('../src/greenhousepages.js');
const { withOffWords } = await import('./helpers/offwords.js');
const { mulberry32 } = await import('../src/rng.js');

// The Greenhouse, milestone G6: the Orchid Room, the Cactus House and the Butterfly Room.

const { area } = W;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

describe('each room is walkable to its back, through 3 m doors', () => {
  const backs = {
    orchid: [[-32, -8], [-31, -12.2], [-18, -12.2], [-25, -4.2], [-23, -9]],
    cactus: [[32, -9], [32, -4.2], [18, -4.4], [25, -8.5], [25, -10]],
    butterfly: [[0, -29.2], [-8.6, -22], [8.6, -22], [0, -26], [-8, -29]],
  };
  for (const r of R.ROOMS) {
    it(`${r.id}: every back spot is open ground reached on foot from the spawn`, () => {
      for (const [x, z] of backs[r.id]) {
        expect(W.walkable(x, z), `${x},${z}`).toBe(true);
        expect(W.reachable(x, z), `${x},${z}`).toBe(true);
      }
    });
    it(`${r.id}: every door is 3 m with its frame gap open, the wall solid either side`, () => {
      expect(r.house.doorW).toBe(3);
      expect(r.house.doorH).toBe(3);
      expect(r.doors.length).toBeGreaterThanOrEqual(1);
      for (const d of r.doors) {
        const along = d.side === 'south' || d.side === 'north' ? [1, 0] : [0, 1];
        const mid = d.side === 'south' || d.side === 'north' ? { x: d.x, z: d.z } : { x: d.x, z: (r.house.z0 + r.house.z1) / 2 };
        for (const k of [-1, 0, 1]) expect(W.walkable(mid.x + along[0] * k, mid.z + along[1] * k), `${d.side} ${k}`).toBe(true);
        for (const k of [-2.1, 2.1]) expect(W.walkable(mid.x + along[0] * k, mid.z + along[1] * k), `${d.side} wall ${k}`).toBe(false);
        // the colliders leave the whole 3 m open: none within the frame's half width
        for (const c of area.colliders) expect(Math.abs((c.x - mid.x) * along[0] + (c.z - mid.z) * along[1]) > 1.5 || Math.hypot(c.x - mid.x, c.z - mid.z) > c.r + 0.01 + 0, `${d.side}`).toBe(true);
      }
    });
  }
  it('the Palm House\'s west, east and north doors open on the rooms by a path, and the court reaches every room\'s door', () => {
    for (const [x, z] of [[-15.2, -9], [15.2, -9], [0, -19.2], [-25, -1.8], [25, -1.8], [0, -19.8]]) expect(W.reachable(x, z), `${x},${z}`).toBe(true);
  });
  it('2.2 m clear between the room\'s solid things (clusters, shrubs, benches, hibiscus; walls aside)', () => {
    const gap = (a, b) => near(a, b) - a.r - b.r;
    const clusters = R.CACTUS_CLUSTERS;
    for (const a of clusters) for (const b of clusters) if (a !== b) expect(gap(a, b), `cactus ${a.x},${a.z} / ${b.x},${b.z}`).toBeGreaterThanOrEqual(2.2);
    const shrubs = R.BUTTERFLY_SHRUBS.map((s) => ({ ...s, r: 0.6 }));
    for (const a of shrubs) for (const b of shrubs) if (a !== b) expect(gap(a, b)).toBeGreaterThanOrEqual(2.2);
    const hib = R.ORCHID_HIBISCUS.map((s) => ({ ...s, r: 0.5 }));
    for (const b of R.ORCHID_BENCHES2) for (const h of hib) expect(gap({ x: b.x, z: b.z, r: b.w / 2 }, h)).toBeGreaterThanOrEqual(0.5);
    // the middle of every room is open for 2.2 m round
    for (const [x, z] of [[-25, -9], [25, -8.5], [0, -26]]) for (const c of area.colliders) expect(near({ x, z }, c) - c.r, `${x},${z}`).toBeGreaterThan(1.1);
  });
});

describe('the cactus rings block and the cacti draw no spikes', () => {
  it('every cluster is a ring the cat cannot stand in, on or at its edge', () => {
    for (const k of R.CACTUS_CLUSTERS) {
      expect(W.walkable(k.x, k.z)).toBe(false);
      expect(W.walkable(k.x + k.r - 0.05, k.z)).toBe(false);
      const to = Math.sign(-9 - k.z); // toward the room's middle
      expect(W.walkable(k.x, k.z + to * (k.r + 0.1))).toBe(false); // the cat's own radius keeps her off the ring
      expect(W.walkable(k.x, k.z + to * (k.r + 1.0))).toBe(true);
    }
  });
  it('the cactus house\'s mesh has no cone: nothing sharper than a capsule, an octahedron tuft and a box', () => {
    const src = fs.readFileSync(new URL('../src/world/greenhouseroomparts.js', import.meta.url), 'utf8');
    const cactusPart = src.slice(src.indexOf('export function cactusHouseDecor'), src.indexOf('export function butterflyRoomDecor'));
    expect(cactusPart).not.toMatch(/ConeGeometry/);
  });
});

describe('the high shelf is one hop', () => {
  it('the orchid shelf is a perch at 1.4 m: one hop from the floor on the base budget, no skill', () => {
    const shelf = area.perches.find((p) => p.label === 'the orchid shelf');
    expect(shelf).toBeDefined();
    expect(shelf.y).toBe(1.4);
    expect(shelf.requires).toBeUndefined();
    expect(W.hopsTo(shelf)).toBe(1);
  });
  it('the Butterfly Room\'s bench is a perch within reach too', () => {
    const bench = area.perches.find((p) => p.x === R.BUTTERFLY_BENCH.x && p.z === R.BUTTERFLY_BENCH.z);
    expect(W.hopsTo(bench)).toBe(1);
  });
});

describe('the pollinators (beauty pass 2): three bees and three garden butterflies drifting between flowers', () => {
  const at = (b, i) => { const m = new THREE.Matrix4(); b.mesh.getMatrixAt(B.CHASERS + B.CLOUD + i, m); return new THREE.Vector3().setFromMatrixPosition(m); };
  it('move on the walk\'s clock, never leave the grounds, and are the same twice', () => {
    const run = () => { const b = B.createButterflies(); const out = []; for (let t = 0; t < 120; t += 0.5) { b.update(0.5, t, null); for (let i = 0; i < B.POLLINATORS; i++) { const v = at(b, i); out.push(v.x.toFixed(3), v.y.toFixed(3), v.z.toFixed(3)); expect(v.y).toBeGreaterThan(0.2); expect(v.y).toBeLessThan(3.2); expect(Math.abs(v.x)).toBeLessThan(40); } } return out.join(','); };
    expect(run()).toBe(run());
    const b = B.createButterflies(); b.update(0, 0, null); const p0 = at(b, 0).clone(); b.update(1, 30, null);
    expect(at(b, 0).distanceTo(p0)).toBeGreaterThan(0.2);
  });
  it('hold still under reduced motion', () => {
    const b = B.createButterflies({ reducedMotion: true }); b.update(0, 0, null); const p0 = at(b, 3).clone(); b.update(1, 40, null);
    expect(at(b, 3).distanceTo(p0)).toBe(0);
  });
});

describe('the butterflies flutter off and are never caught', () => {
  const rig = (o = {}) => { const b = B.createButterflies(o); b.update(0, 0, null); return b; };
  const catAt = (x, z, y = 0) => ({ x, y, z });
  it('four chasers and a cloud: ONE instanced mesh, none ever removed', () => {
    const b = rig();
    expect(b.mesh.isInstancedMesh).toBe(true);
    expect(b.mesh.count).toBe(B.CHASERS + B.CLOUD + B.POLLINATORS); // (beauty pass 2: six pollinators after the room's own; the low tier draws none)
    expect(rig({ lite: true }).mesh.count).toBe(B.CHASERS + B.CLOUD);
    expect(b.chasers).toHaveLength(4);
    expect(b.chasers.map((c) => c.mode)).toEqual(['rest', 'rest', 'rest', 'rest']);
  });
  it('a cat walking at a resting chaser sends it to another perch at least 3.5 m from her, flying at less than her walk', () => {
    const b = rig();
    const c0 = b.chasers[0];
    const cat = catAt(c0.x + 1, c0.z);
    b.update(1 / 30, 0.1, cat);
    expect(b.chasers[0].mode).toBe('flee');
    let last = { x: b.chasers[0].x, y: b.chasers[0].y, z: b.chasers[0].z };
    let t = 0.1;
    for (let i = 0; i < 400 && b.chasers[0].mode === 'flee'; i++) {
      t += 1 / 30;
      b.update(1 / 30, t, cat);
      const n = b.chasers[0];
      expect(Math.hypot(n.x - last.x, n.y - last.y, n.z - last.z)).toBeLessThanOrEqual(B.FLUTTER_SPEED / 30 + 1e-6);
      last = { x: n.x, y: n.y, z: n.z };
    }
    expect(b.chasers[0].mode).toBe('rest');
    const a = R.BUTTERFLY_ANCHORS[b.chasers[0].anchor];
    expect(Math.hypot(a[0] - cat.x, a[1] - cat.z)).toBeGreaterThanOrEqual(B.FLEE_FROM);
    expect(b.chasers[0].flutters).toBe(1);
  });
  it('a cat running at them all over a long walk never removes one, never leaves them off their perches or out of the room, and two runs match', () => {
    const run = () => {
      const b = rig();
      const rnd = mulberry32(7);
      let t = 0;
      let x = 0, z = -21;
      const log = [];
      for (let i = 0; i < 3000; i++) {
        t += 1 / 30;
        x = Math.max(-9, Math.min(9, x + (rnd() - 0.5) * 0.5));
        z = Math.max(-31, Math.min(-21, z + (rnd() - 0.5) * 0.5));
        b.update(1 / 30, t, catAt(x, z));
        for (const c of [...b.chasers, ...b.cloud]) {
          expect(Number.isFinite(c.x + c.y + c.z)).toBe(true);
          expect(c.x).toBeGreaterThan(R.BUTTERFLY_ROOM.x0 - 1);
          expect(c.x).toBeLessThan(R.BUTTERFLY_ROOM.x1 + 1);
          expect(c.z).toBeGreaterThan(R.BUTTERFLY_ROOM.z0 - 1);
          expect(c.z).toBeLessThan(R.BUTTERFLY_ROOM.z1 + 1);
          expect(c.y).toBeGreaterThan(0.5);
        }
        expect(b.chasers).toHaveLength(4);
        expect(b.mesh.count).toBe(14 + B.POLLINATORS);
        if (i % 300 === 0) log.push(b.chasers.map((c) => `${c.x.toFixed(3)},${c.z.toFixed(3)},${c.mode}`).join('|'));
      }
      return log;
    };
    expect(run()).toEqual(run());
  });
  it('one lands on her head when she sits still, stays while she does, flutters off when she moves', () => {
    const b = rig();
    const cat = catAt(0, -26);
    b.update(1 / 30, 1, cat);
    expect(b.land(cat)).toBe(true);
    expect(b.land(cat)).toBe(false); // one at a time
    b.update(1 / 30, 1.1, cat);
    const on = b.chasers.find((c) => c.landed);
    expect(on.y).toBeCloseTo(0.62, 2);
    expect(near(on, cat)).toBeLessThan(0.01);
    b.update(1 / 30, 2, cat);
    expect(b.chasers.find((c) => c.landed)).toBeDefined();
    b.update(1 / 30, 2.1, catAt(0.9, -26));
    expect(b.chasers.find((c) => c.landed)).toBeUndefined();
    expect(b.chasers.some((c) => c.mode === 'flee')).toBe(true);
  });
  it('reduced motion keeps them where they are (no orbit, no drift)', () => {
    const b = rig({ reducedMotion: true });
    const a = JSON.stringify([b.chasers, b.cloud]);
    for (let i = 0; i < 60; i++) b.update(1 / 30, i, null);
    expect(JSON.stringify([b.chasers, b.cloud])).toBe(a);
  });
  it('draws no random number and reads no clock; its salt is its own', () => {
    for (const f of ['greenhousebutterflies.js', 'greenhouserooms.js', 'greenhouseroomparts.js']) {
      const src = fs.readFileSync(new URL(`../src/world/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
    expect(new Set([B.GH_BUTTERFLY_SALT, L.GH_SEED_SALT, L.GH_WATER_SALT, L.GH_ROOM_SALT]).size).toBe(4);
  });
});

describe('the rooms in the built place', () => {
  const make = (quality) => {
    const scene = new THREE.Scene();
    const built = build(scene, { water: { quality } });
    return { scene, built };
  };
  it('the area record carries the rooms: scenics, perch, finds, pois, colliders; the stage-A ids and counts are untouched', () => {
    const { built } = make('high');
    expect(built.scenics.slice(0, 3).map((s) => s.id)).toEqual(['greenhouse-palms', 'greenhouse-pond', 'greenhouse-shed']);
    expect(built.scenics.slice(3).map((s) => s.id)).toEqual(['greenhouse-orchids', 'greenhouse-cactus', 'greenhouse-butterflies']);
    expect(built.perches.some((p) => p.label === 'the orchid shelf')).toBe(true);
    expect(P.GREENHOUSE_FIND_ZONES.orchid).toHaveLength(1);
    expect(P.GREENHOUSE_FIND_ZONES.cactus).toHaveLength(1);
    expect(P.GREENHOUSE_FIND_ZONES.butterfly).toHaveLength(1);
    expect(P.GREENHOUSE_GOLD).toHaveLength(3);
    expect(built.collectibles).toHaveLength(5);
  });
  it('four houses of glass (one pane each), the three rooms\' mist and shafts, the butterflies and the shy flowers', () => {
    const { scene } = make('high');
    let panes = 0;
    scene.traverse((o) => { if (o.isMesh && o.userData.glassHouse) panes++; });
    expect(panes).toBe(4);
    for (const n of ['roomMist', 'orchidShafts', 'cactusShafts', 'butterflyShafts', 'ghButterflies', 'ghShyOrchid', 'ghCactusFlower', 'ghRoomOrchids', 'ghCactusHouse', 'ghOrchidRoom', 'ghButterflyRoom']) expect(scene.getObjectByName(n), n).toBeTruthy();
    expect(scene.getObjectByName('ghShyOrchid').visible).toBe(false);
  });
  it('the low tier drops the rooms\' mist and shafts and keeps the frames, the glass and the dapple', () => {
    const { scene } = make('low');
    for (const n of ['roomMist', 'orchidShafts', 'cactusShafts', 'butterflyShafts', 'glassMist', 'sunShafts']) expect(scene.getObjectByName(n), n).toBeFalsy();
    for (const n of ['orchidHouse', 'cactusHouse', 'butterflyHouse', 'orchidDapple', 'butterflyFloor']) expect(scene.getObjectByName(n), n).toBeTruthy();
  });
  it('under any room\'s glass the rain stays out', () => {
    expect(P.underGlass(-25, 3, -9)).toBe(true);
    expect(P.underGlass(25, 3, -9)).toBe(true);
    expect(P.underGlass(0, 6, -26)).toBe(true);
    expect(P.underGlass(0, 6, -19.2)).toBe(false);
  });
  it('the three finds\' hints are in the table in both word sets', () => {
    for (const id of ['ghorchid', 'ghcactus', 'ghbutterfly']) {
      expect(GREENHOUSE_HINTS[id]).toMatch(/\S/);
      expect(withOffWords(() => GREENHOUSE_HINTS[id])).toBe(GREENHOUSE_HINTS[id]);
    }
  });
});

describe('the new seed and pot sets', () => {
  it('the stage-A sets are exactly what they were', () => {
    expect(P.SEED_SPOT_SETS).toHaveLength(3);
    expect(P.SEED_SPOT_SETS[0].map((s) => [s.x, s.z])).toEqual([[-21.5, 10.6], [-1.5, 24.5], [-10.4, -14.9], [7.6, -14.2], [26, 20]]);
    expect(P.WATER_POT_SPOTS).toHaveLength(8);
    expect(P.ALL_POT_SPOTS.slice(0, 8)).toEqual([...P.WATER_POT_SPOTS]);
    expect(P.ALL_POT_SPOTS).toHaveLength(14);
  });
  it('a room walk uses a room set for some seeds and a stage-A set for the rest, always five packets and four pots', () => {
    const seen = new Set();
    for (let s = 1; s < 300; s++) {
      const ri = L.roomSetIndex(s, 0);
      seen.add(ri);
      const scene = new THREE.Scene();
      if (s < 40) {
        const life = build(scene).life({ roomSeed: s, reducedMotion: false });
        expect(life.state.set).toHaveLength(5);
        expect(life.state.thirsty).toHaveLength(4);
        expect(new Set(life.state.thirsty).size).toBe(4);
        life.dispose();
      }
    }
    expect([...seen].sort()).toEqual([-1, 0, 1]);
    for (const set of P.ROOM_POT_SETS) expect(set.every((i) => Number.isInteger(i) && i >= 0 && i < 14)).toBe(true);
    // a bare life (no rooms flag) is the stage-A life, unchanged
    for (let s = 1; s < 60; s++) {
      const life = L.createGreenhouseLife({ scene: new THREE.Scene(), roomSeed: s });
      expect(life.state.thirsty).toEqual(L.thirstyPots(s, 0));
      life.dispose();
    }
  });
});

describe('the life: the rooms\' finds, the butterfly on her head, the opening flowers', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });
  const make = () => {
    const scene = new THREE.Scene();
    const placed = build(scene);
    const progression = createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const life = placed.life({ scene, log, progression, reducedMotion: false, visits: 0 });
    const at = { x: 0, y: 0, z: 30 };
    const camera = new THREE.PerspectiveCamera();
    let t = 0;
    const step = (seconds, cat) => { if (cat) Object.assign(at, cat); for (let i = 0; i < Math.round(seconds * 30); i++) { t += 1 / 30; life.update(1 / 30, t, at, camera, { cat: { rotation: { y: 0 } } }); } };
    return { life, progression, step, scene, off: () => life.dispose() };
  };
  it('still 2 s beside the shy orchid: it opens and pays once', () => {
    r = make();
    const z = P.GREENHOUSE_FIND_ZONES.orchid[0];
    const shy = r.scene.getObjectByName('ghShyOrchid');
    r.step(1.5, { x: z.x, y: 0, z: z.z + 1 });
    expect(shy.visible).toBe(false);
    r.step(1, null);
    expect(r.progression.state.journal.ghorchid).toBe(1);
    expect(shy.visible).toBe(true);
    r.step(2, null);
    expect(shy.scale.x).toBeCloseTo(1, 5);
    expect(r.progression.state.points).toBe(12);
  });
  it('sitting by the flowering cactus: the pink flower opens', () => {
    r = make();
    const z = P.GREENHOUSE_FIND_ZONES.cactus[0];
    const flower = r.scene.getObjectByName('ghCactusFlower');
    r.step(2.5, { x: z.x, y: 0, z: z.z + 1.2 });
    expect(r.progression.state.journal.ghcactus).toBe(1);
    expect(flower.visible).toBe(true);
    r.step(2, null);
    expect(flower.scale.x).toBeCloseTo(1, 5);
  });
  it('still 3 s in the Butterfly Room: the find pays and a butterfly lands on her head', () => {
    r = make();
    r.step(2.5, { x: 0, y: 0, z: -26 });
    expect(r.progression.state.journal.ghbutterfly ?? 0).toBe(0);
    r.step(1, null);
    expect(r.progression.state.journal.ghbutterfly).toBe(1);
    const mesh = r.scene.getObjectByName('ghButterflies');
    expect(mesh.count).toBe(14 + B.POLLINATORS);
    r.step(1, { x: 0, y: 0, z: -26 });
  });
});
