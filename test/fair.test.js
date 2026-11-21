import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { climbBudget, canReach, SURE_CLAWS_ID } from '../src/climbing.js';
import { JOURNAL_TYPES, CATALOG, createProgression } from '../src/progression.js';
import { areaInEdition } from '../src/edition.js';

// The Fairground: the place (docs/superpowers/specs/2026-11-18-fairground-design.md).
// Step 1 built it as files only; step 2 copied FAIR_REGISTRATION's rows into
// the shared per-area tables. Its rows are checked against the built area
// below, and (last describe) against the tables they were copied into.

// Same headless stub every world test uses: the only DOM the builders touch
// is document.createElement('canvas') (the gate's sign, the surface tiles).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const fair = await import('../src/world/fair.js');
const { duskLook } = await import('../src/render/dusk.js');
const {
  build, SPAWN, FAIR_BOUNDS, FAIR_REGISTRATION: REG, DUCK_POOL, COASTER_TRACK, COASTER_STATION_S, HELTER_SLIDE, HELTER_STAIRS, HELTER_TOP,
  STATION_DECK, TRACK_X, STALLS, FIELD, FAIR_HIDES, SIGN_POSTS, setFairGlow, fairBare, fairGroundTint,
} = fair;
const { MGR, FERRIS, TEACUPS, HELTER, COASTER, STATION, trackPose, coasterTrackPoints } = await import('../src/world/fairrides.js');
const { TINS, BELL, FORTUNE, STALL, PICNIC, BANDSTAND, STALL_SIGN, SIGN_POST } = await import('../src/world/fairparts.js');
const { GLOW_MAX, GLOW_LOOK } = await import('../src/world/fairkit.js');
const { build: buildPark } = await import('../src/world/park.js');
const { isWalkableAt, isWadeableAt, CAT_RADIUS } = await import('../src/player.js');
const { inWater, waterClearance, shallowExcess } = await import('../src/world/builder.js');
const { frameColliders, allPropIds, isPropId, CARRY_KINDS, KNOCK_KINDS, REST_KINDS } = await import('../src/propsets.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { createKnockables } = await import('../src/knockables.js');
const { REST_LOOKS } = await import('../src/rests.js');
const { AREA_RULES } = await import('../src/render/pawprints.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { findFadeOccluders } = await import('../src/treefade.js');
const { findPath } = await import('../src/pathfind.js');
const { clearSpot } = await import('../src/world/spots.js');
const { createScent } = await import('../src/scent.js');
const { mulberry32 } = await import('../src/rng.js');

const scene = new THREE.Scene();
const area = build(scene);
scene.updateMatrixWorld(true);
const set = REG.propSet;

const dist = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
// Can a grounded cat stand at (x, z)? Bounds, colliders and dry ground: the
// test the running game applies.
const standable = (x, z) => isWalkableAt(area, x, z);
function standableWithin(x, z, range) {
  for (let r = 0; r <= range; r += 0.05) {
    for (let t = 0; t < 64; t++) {
      const th = (t / 64) * Math.PI * 2;
      if (standable(x + Math.cos(th) * r, z + Math.sin(th) * r)) return true;
    }
  }
  return false;
}
const inBounds = (p) => p.x >= area.bounds.minX && p.x <= area.bounds.maxX && p.z >= area.bounds.minZ && p.z <= area.bounds.maxZ;

// Everything the cat can walk to on dry ground from the gate, on a 0.5 m grid.
const CELL = 0.5;
const reached = (() => {
  const key = (i, j) => i * 10000 + j;
  const at = (i, j) => ({ x: area.bounds.minX + i * CELL, z: area.bounds.minZ + j * CELL });
  const start = [Math.round((SPAWN.x - area.bounds.minX) / CELL), Math.round((SPAWN.z - area.bounds.minZ) / CELL)];
  const seen = new Set([key(...start)]);
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      const p = at(ni, nj);
      if (seen.has(key(ni, nj)) || !standable(p.x, p.z)) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  return (x, z, range = 1) => {
    const ci = Math.round((x - area.bounds.minX) / CELL);
    const cj = Math.round((z - area.bounds.minZ) / CELL);
    const n = Math.ceil(range / CELL);
    for (let i = ci - n; i <= ci + n; i++) {
      for (let j = cj - n; j <= cj + n; j++) {
        const p = at(i, j);
        if (seen.has(key(i, j)) && Math.hypot(p.x - x, p.z - z) <= range) return true;
      }
    }
    return false;
  };
})();

const allMeshes = [];
scene.traverse((o) => { if (o.isMesh) allMeshes.push(o); });
const rc = new THREE.Raycaster();
// The first thing under (x, fromY, z), looking straight down at most `far`.
function topAt(x, z, fromY, far = fromY + 1, meshes = allMeshes) {
  rc.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  rc.far = far;
  return rc.intersectObjects(meshes, false)[0]?.point.y ?? null;
}
const worldOf = (obj, local = { x: 0, y: 0, z: 0 }) => obj.localToWorld(new THREE.Vector3(local.x, local.y, local.z));

// test/budget.test.js's counting, copied (it is not exported there).
function budgetStats(s) {
  let meshes = 0;
  let casters = 0;
  let triangles = 0;
  const box = new THREE.Box3();
  for (const child of s.children) {
    box.setFromObject(child);
    const eligible = castsFromBox(box);
    child.traverse((obj) => {
      if (!obj.isMesh) return;
      meshes++;
      const geo = obj.geometry;
      triangles += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      if (eligible && !isTransparentMat(obj.material) && !obj.userData.noCast) casters++;
    });
  }
  return { meshes, casters, triangles: Math.round(triangles) };
}

describe('The Fairground: the area record', () => {
  it('returns every field the Park returns, with the same types', () => {
    const park = buildPark(new THREE.Scene());
    for (const key of Object.keys(park)) {
      expect(area, `missing field ${key}`).toHaveProperty(key);
      expect(typeof area[key], `${key} type`).toBe(typeof park[key]);
      if (Array.isArray(park[key])) expect(Array.isArray(area[key]), `${key} is an array`).toBe(true);
    }
  });

  it('is named as its catalog row will be', () => {
    expect(area.name).toBe('The Fairground');
    expect(REG.catalog.name).toBe(area.name);
    expect(REG.id).toBe('fair');
  });

  it('has bounds the size of the Farm’s, and well-formed colliders inside them', () => {
    expect(area.bounds).toEqual({ ...FAIR_BOUNDS });
    expect(area.bounds.maxX - area.bounds.minX).toBe(88);
    expect(area.bounds.maxZ - area.bounds.minZ).toBe(94);
    expect(area.colliders.length).toBeGreaterThan(0);
    for (const c of area.colliders) {
      expect(Number.isFinite(c.x) && Number.isFinite(c.z) && c.r > 0).toBe(true);
      expect(inBounds(c), `collider at ${c.x},${c.z}`).toBe(true);
    }
  });

  it('spawns the cat just outside the gate, on dry ground clear of every collider', () => {
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(standable(area.spawn.x, area.spawn.z)).toBe(true);
    for (const c of area.colliders) expect(dist(area.spawn, c)).toBeGreaterThan(c.r + CAT_RADIUS + 1);
    // south of the gate, so the chase camera (behind her, further south) does not start inside the arch
    expect(area.spawn.z - area.anchors.gate.z).toBeGreaterThanOrEqual(2.5);
    expect(dist(area.spawn, area.anchors.gate)).toBeLessThan(6);
    // the merry-go-round is straight ahead up the midway, with nothing solid on the line
    for (let z = area.spawn.z; z > area.anchors.merryGoRound.z + area.anchors.merryGoRound.r + 0.5; z -= 0.25) {
      expect(standable(0, z), `the midway at z ${z}`).toBe(true);
    }
  });

  it('has thirteen POIs for the race and the quests (the Farm has ten), each walked to from the gate', () => {
    expect(area.pois.length).toBeGreaterThanOrEqual(10);
    expect(area.pois).toHaveLength(13);
    for (const p of area.pois) {
      expect(standable(p.x, p.z), `poi ${p.x},${p.z}`).toBe(true);
      expect(reached(p.x, p.z), `poi ${p.x},${p.z} from the gate`).toBe(true);
      expect(inWater(area.waters, p.x, p.z)).toBe(false);
    }
    const xs = area.pois.map((p) => p.x);
    const zs = area.pois.map((p) => p.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(45);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(45);
  });

  it('leaves every POI where it is: each already stands clear enough for a race ring', () => {
    for (const p of area.pois) {
      const c = clearSpot(p, area.colliders, area.bounds, area.waters);
      expect({ x: c.x, z: c.z }, `poi ${p.x},${p.z}`).toEqual({ x: p.x, z: p.z });
    }
  });

  it('buries every scent treat on ground the cat can stand on', () => {
    const none = { add() {}, remove() {} };
    for (let seed = 0; seed < 300; seed++) {
      for (const tr of createScent(none, area, mulberry32(seed)).treats) {
        expect(standable(tr.x, tr.z), `seed ${seed}: treat at ${tr.x.toFixed(2)},${tr.z.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('ships five collectibles with unique ids, each reachable', () => {
    expect(area.collectibles).toHaveLength(5);
    expect(new Set(area.collectibles.map((c) => c.id))).toEqual(new Set(['fair-1', 'fair-2', 'fair-3', 'fair-4', 'fair-5']));
    for (const c of area.collectibles) {
      expect(typeof c.label).toBe('string');
      if (c.y) {
        const stand = area.perches.find((p) => !p.requires && dist(p, c) < 1.6 && Math.abs(p.y - c.y) < 0.9);
        expect(stand, `${c.id} has no perch to be picked up from`).toBeTruthy();
      } else {
        expect(reached(c.x, c.z, 1.5), c.id).toBe(true);
      }
    }
  });

  it('ships three scenics the cat can stand at', () => {
    expect(area.scenics).toHaveLength(3);
    for (const s of area.scenics) {
      expect(typeof s.label).toBe('string');
      expect(reached(s.x, s.z, 2.9), s.id).toBe(true);
    }
  });

  it('has tippables, boxes and puddles on ground the cat can get to', () => {
    expect(area.tippables.length).toBeGreaterThanOrEqual(4);
    for (const t of area.tippables) {
      expect(['pot', 'can', 'bin']).toContain(t.kind);
      expect(reached(t.x, t.z), `tippable ${t.x},${t.z}`).toBe(true);
    }
    expect(area.tippables.filter((t) => t.kind === 'bin').length).toBeGreaterThanOrEqual(3);
    for (const bx of area.boxes) expect(standable(bx.x, bx.z), `box ${bx.x},${bx.z}`).toBe(true);
    for (const p of area.puddles) expect(standable(p.x, p.z), `puddle ${p.x},${p.z}`).toBe(true);
  });

  it('spawns only small creatures the journal knows: no dog, and no visitors until step 3', () => {
    const types = new Set(area.critterSpawns.map((c) => c.type));
    for (const t of types) expect(JOURNAL_TYPES).toContain(t);
    for (const t of ['bird', 'butterfly', 'squirrel']) expect(types.has(t), t).toBe(true);
    expect(types.has('dog')).toBe(false);
    expect(types.has('villager')).toBe(false);
    expect(types.has('duck')).toBe(false); // the pool's ducks are rubber
    for (const c of area.critterSpawns) {
      expect(standable(c.x, c.z), `${c.type} at ${c.x},${c.z}`).toBe(true);
      if (c.x2 !== undefined) expect(standable(c.x2, c.z2), `${c.type} run end`).toBe(true);
    }
  });

  it('gives both moments a runner that lives at the fair', () => {
    expect(area.moments).toHaveLength(2);
    const types = new Set(area.critterSpawns.map((c) => c.type));
    for (const m of area.moments) {
      expect(m.from).toBeTruthy();
      expect(types.has(m.type), m.id).toBe(true);
      expect(standable(m.x, m.z) && standable(m.from.x, m.from.z), m.id).toBe(true);
    }
  });

  it('says nothing a nine-year-old could not read, and no series word', () => {
    const words = [area.name, ...area.collectibles.map((c) => c.label), ...area.scenics.map((s) => s.label),
      ...area.moments.map((m) => m.label), ...area.perches.filter((p) => p.label).map((p) => p.label)].join(' ').toLowerCase();
    for (const w of ['clan', 'warrior', 'twoleg', 'kittypet', 'territory', 'starclan', 'apprentice', 'thunderpath', 'prey', 'rogue']) {
      expect(words.includes(w), w).toBe(false);
    }
    const src = ['fair.js', 'fairparts.js', 'fairrides.js', 'fairkit.js']
      .map((f) => readFileSync(new URL('../src/world/' + f, import.meta.url), 'utf8')).join('\n').toLowerCase();
    for (const w of ['warrior', 'twoleg', 'kittypet', 'starclan', 'thunderpath', 'clan']) expect(src.includes(w), w).toBe(false);
  });
});

describe('The Fairground: the layout the owner approved', () => {
  const a = area.anchors;
  const centre = (r) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

  it('puts the gate south, the midway north from it, and the merry-go-round on a round plaza at its end', () => {
    expect(a.gate.z).toBeGreaterThan(40);
    expect(a.midway.maxZ).toBeLessThanOrEqual(a.gate.z);
    expect(a.midway.minZ).toBeGreaterThan(a.plaza.z);
    expect(dist(a.merryGoRound, a.plaza)).toBe(0);
    expect(a.plaza.r - a.merryGoRound.r).toBeGreaterThan(5); // room to walk all the way round
    expect(Math.abs(a.gate.x - a.merryGoRound.x)).toBe(0);   // seen straight up the midway from the gate
  });

  it('lines the midway with stalls on both sides', () => {
    const west = STALLS.filter((s) => s.x < 0);
    const east = STALLS.filter((s) => s.x > 0);
    expect(west).toHaveLength(4);
    expect(east).toHaveLength(4);
    for (const s of STALLS) {
      expect(s.z).toBeGreaterThan(a.midway.minZ);
      expect(s.z).toBeLessThan(a.midway.maxZ);
      expect(Math.abs(s.x) - STALL.d / 2).toBeGreaterThan(a.midway.maxX + 1.5); // the midway stays 5 m clear
    }
    // no two stalls or tents overlap
    const sorted = (side) => side.map((s) => s.z).sort((p, q) => p - q);
    for (const zs of [sorted(west), sorted(east)]) for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeGreaterThan(STALL.w + 1);
  });

  it('puts the big wheel north, the coaster down the east side, the teacups west and the helter-skelter north-west', () => {
    expect(a.wheel.z).toBeLessThan(a.plaza.z - 20);
    expect(Math.abs(a.wheel.x)).toBeLessThan(2); // behind the merry-go-round, seen from the gate
    const xs = COASTER_TRACK.points.map((p) => p.x);
    const zs = COASTER_TRACK.points.map((p) => p.z);
    expect(Math.min(...xs)).toBeGreaterThan(20);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(55); // along the whole east edge
    expect(centre(a.coasterStation).x).toBeGreaterThan(a.plaza.x + a.plaza.r + 5);
    expect(Math.abs(centre(a.coasterStation).z - a.plaza.z)).toBeLessThan(1); // its platform faces the plaza
    expect(a.teacups.x).toBeLessThan(-20);
    expect(Math.abs(a.teacups.z)).toBeLessThan(6);
    expect(a.helterSkelter.x).toBeLessThan(-28);
    expect(a.helterSkelter.z).toBeLessThan(-28);
  });

  it('puts the games on the midway, the fortune teller south-east, the bandstand south-west and the open field north-west', () => {
    expect(Math.abs(a.tinCanPlay.x)).toBeLessThan(5);
    expect(Math.abs(a.bellPad.x)).toBeLessThan(5.5);
    expect(a.duckPool.x).toBeLessThan(-8);   // just off to the west
    expect(a.duckPool.x).toBeGreaterThan(-16);
    expect(a.fortuneDoor.x).toBeGreaterThan(8);
    expect(a.fortuneDoor.z).toBeGreaterThan(25);
    expect(a.juggler.x).toBeGreaterThan(STALLS.find((s) => s.x > 0).x + 5); // behind the stalls
    expect(a.bandstand.x).toBeLessThan(-18);
    expect(a.bandstand.z).toBeGreaterThan(28);
    expect(centre(a.picnicLawn).x).toBeLessThan(-15);
    expect(centre(a.balloonField).x).toBeLessThan(-8);
    expect(centre(a.balloonField).z).toBeLessThan(-12);
  });

  it('keeps the rides apart from each other and from the stalls', () => {
    const discs = [a.merryGoRound, a.teacups, { ...a.wheel, r: 5 }, { ...a.helterSkelter, r: 3.6 }, { ...a.bandstand }, { ...a.duckPool }, { ...a.fortuneDoor, r: 0 }];
    for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
      expect(dist(discs[i], discs[j]) - discs[i].r - discs[j].r, `${i}/${j}`).toBeGreaterThan(2);
    }
    // the coaster's track goes round, not over, everything else that is built
    for (const p of COASTER_TRACK.points) {
      for (const d of discs) expect(dist(p, d) - d.r, `track at ${p.x},${p.z}`).toBeGreaterThan(3);
      for (const s of STALLS) expect(dist(p, s)).toBeGreaterThan(8);
    }
  });

  it('builds each thing the design lists, by name', () => {
    for (const name of ['fairGate', 'fairGateSign', 'merryGoRound', 'musicBox', 'ferrisWheel', 'teacups', 'helterSkelter', 'helterRoof',
      'helterStairs', 'helterSlide', 'coasterRails', 'coasterSupports', 'coasterStation', 'coasterStationRoof', 'coasterTrain', 'tinCans',
      'rubberDucks', 'ringTheBell', 'fortuneTent', 'fortuneTable', 'crystalBall', 'bandstandRoof', 'fairProps', 'fairCanvas', 'fairBunting',
      'fairBulbs', 'fairBalloons', 'fairFence']) {
      expect(scene.getObjectByName(name), name).toBeTruthy();
    }
  });

  it('draws nothing that is not a finite number', () => {
    for (const o of allMeshes) {
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 7) {
        expect(Number.isFinite(p.getX(i)) && Number.isFinite(p.getY(i)) && Number.isFinite(p.getZ(i)), o.name).toBe(true);
      }
    }
  });

  it('stands every model on the ground, not in the air and not sunk', () => {
    for (const name of ['fairGate', 'merryGoRound', 'musicBox', 'ferrisWheel', 'teacups', 'helterSkelter', 'helterStairs', 'coasterSupports',
      'coasterStation', 'ringTheBell', 'fortuneTent', 'fortuneTable', 'fairProps', 'fairCanvas', 'fairFence']) {
      const box = new THREE.Box3().setFromObject(scene.getObjectByName(name));
      expect(box.min.y, name).toBeGreaterThan(-0.08); // (the big wheel's slanted legs dip a hand's width into their feet)
      expect(box.min.y, name).toBeLessThan(0.06);
    }
    // nothing at the fair is under the ground, and nothing is taller than the big wheel's lookout flag
    for (const o of allMeshes.filter((m) => m.name.startsWith('fair') || m.parent?.name)) {
      const box = new THREE.Box3().setFromObject(o);
      expect(box.max.y, o.name).toBeLessThan(FERRIS.topY + 2.5);
    }
  });

  it('is gentle: the wheel is the landmark, the coaster’s hill is under seven metres', () => {
    expect(FERRIS.hubY + FERRIS.R).toBeLessThan(15);
    expect(FERRIS.hubY + FERRIS.R).toBeGreaterThan(MGR.apexY + 6); // tall behind the merry-go-round
    expect(Math.max(...COASTER_TRACK.points.map((p) => p.y))).toBeLessThan(7);
    expect(HELTER.apexY).toBeLessThan(11);
  });

  it('lets the camera see through whatever can hide the cat, each fade shape where its model is', () => {
    const occ = findFadeOccluders(scene);
    const want = {
      fairGate: a.gate, fortuneTent: { x: fair.FORTUNE_AT.x, z: fair.FORTUNE_AT.z }, bandstandRoof: a.bandstand,
      coasterStationRoof: { x: (STATION_DECK.minX + TRACK_X + 1.35) / 2, z: 0 }, helterSkelter: a.helterSkelter, helterRoof: a.helterSkelter,
    };
    for (const [name, at] of Object.entries(want)) {
      const o = occ.find((e) => e.obj.name === name);
      expect(o, name).toBeTruthy();
      expect(Math.hypot(o.x - at.x, o.z - at.z), `${name} fade shape`).toBeLessThan(0.6);
      // and the model really is under that shape
      const box = new THREE.Box3().setFromObject(o.obj);
      expect(box.min.x).toBeLessThan(o.x);
      expect(box.max.x).toBeGreaterThan(o.x);
      expect(box.min.z).toBeLessThan(o.z);
      expect(box.max.z).toBeGreaterThan(o.z);
    }
    // the helter-skelter's stairs are outside the tower's Group: they stay solid when it fades
    expect(scene.getObjectByName('helterStairs').parent).toBe(scene);
    // Step 3's fix: the slide winds round the tower just where the follow
    // camera sits for a cat on the stairs, so it (and its brackets) fade too:
    // a shape as wide as the slide's lowest coil, from above a cat's head on
    // the grass to the gallery
    for (const name of ['helterSlide', 'helterBrackets']) {
      const o = occ.find((e) => e.obj.name === name);
      expect(o, name).toBeTruthy();
      expect(Math.hypot(o.x - a.helterSkelter.x, o.z - a.helterSkelter.z)).toBeLessThan(0.01);
      const reach = Math.max(...HELTER_SLIDE.map((p) => Math.hypot(p.x - a.helterSkelter.x, p.z - a.helterSkelter.z) * (p.y > 0.9 ? 1 : 0)));
      expect(o.R).toBeGreaterThan(reach + HELTER.slide.half);
      expect(o.R).toBeLessThan(reach + HELTER.slide.half + 0.6);
      expect(o.shapes[0].y0).toBeGreaterThan(0.6);
      expect(o.shapes[0].y1).toBeCloseTo(HELTER.towerH, 5);
    }
    // and so do the fortune teller's table and crystal ball
    expect(scene.getObjectByName('fortuneTable').parent).toBe(scene);
  });
});

describe('The Fairground: words on the stalls’ boards', () => {
  const signs = scene.getObjectByName('fairSigns');
  const WORDS = {
    candyfloss: 'Candyfloss', tinCans: 'Tin Can Alley', prizes: 'Prizes', toffeeApples: 'Toffee Apples',
    popcorn: 'Popcorn', hoopla: 'Hoopla', lemonade: 'Lemonade', teddies: 'Teddy Bears',
    hookADuck: 'Hook a Duck', ringTheBell: 'Ring the Bell', fortunes: 'Fortunes',
  };

  it('names every stall and each of the three games and tents without a booth, in plain words', () => {
    const named = Object.fromEntries([...STALLS, ...SIGN_POSTS].map((s) => [s.id, s.sign]));
    expect(named).toEqual(WORDS);
    for (const text of Object.values(WORDS)) {
      expect(text).toMatch(/^[A-Z][A-Za-z ]{3,13}$/);
      expect(/clan|warrior|twoleg|kittypet|prey|starclan/i.test(text)).toBe(false);
    }
  });

  it('draws them all as one mesh on one texture, a row a sign, casting nothing', () => {
    expect(signs.isMesh).toBe(true);
    expect(signs.parent).toBe(scene);
    expect(signs.userData.noCast).toBe(true);
    expect(signs.material.map).toBeTruthy();
    // 8 stalls, and both faces of 3 posts: two triangles each
    const panels = STALLS.length + 2 * SIGN_POSTS.length;
    expect(signs.geometry.attributes.position.count).toBe(panels * 6);
    // every panel reads from one whole row of the texture, left to right, the right way up
    const uv = signs.geometry.attributes.uv;
    const rows = Object.keys(WORDS).length;
    const used = new Set();
    for (let i = 0; i < panels; i++) {
      const us = [];
      const vs = [];
      for (let k = 0; k < 6; k++) { us.push(uv.getX(i * 6 + k)); vs.push(uv.getY(i * 6 + k)); }
      expect(Math.min(...us)).toBe(0);
      expect(Math.max(...us)).toBe(1);
      const row = Math.round((1 - Math.max(...vs)) * rows);
      expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(1 / rows, 6);
      expect(1 - Math.max(...vs)).toBeCloseTo(row / rows, 6);
      used.add(row);
      // BL, BR, TR: u rises along the panel's own right, v rises upwards
      expect(uv.getX(i * 6 + 1)).toBeGreaterThan(uv.getX(i * 6));
      expect(uv.getY(i * 6 + 2)).toBeGreaterThan(uv.getY(i * 6 + 1));
      expect(signs.geometry.attributes.position.getY(i * 6 + 2)).toBeGreaterThan(signs.geometry.attributes.position.getY(i * 6 + 1));
    }
    expect(used.size).toBe(rows);
  });

  it('hangs each panel on a board, facing the way its stall faces, where a walker on the midway reads it', () => {
    const pos = signs.geometry.attributes.position;
    const nrm = signs.geometry.attributes.normal;
    const centre = (i) => {
      const c = new THREE.Vector3();
      for (const k of [0, 1, 2, 5]) c.add(new THREE.Vector3().fromBufferAttribute(pos, i * 6 + k));
      return c.multiplyScalar(0.25);
    };
    STALLS.forEach((s, i) => {
      const c = centre(i);
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i * 6);
      // it faces the midway (x = 0), and is on the stall's midway side
      expect(Math.sign(n.x)).toBe(-Math.sign(s.x));
      expect(Math.abs(n.x)).toBeGreaterThan(0.99);
      expect(Math.abs(c.x)).toBeLessThan(Math.abs(s.x));
      expect(c.z).toBeCloseTo(s.z, 1);
      expect(c.y).toBeCloseTo(STALL_SIGN[s.top === 'flat' ? 'flat' : 'tent'].y, 5);
      // there is a board right behind it: a ray back along its normal meets one within 5 cm
      rc.set(c.clone().addScaledVector(n, 0.001), n.clone().negate());
      rc.far = 0.05;
      const hit = rc.intersectObjects(allMeshes.filter((m) => m !== signs), false)[0];
      expect(hit, `${s.id}: no board behind its words`).toBeTruthy();
    });
    SIGN_POSTS.forEach((p, k) => {
      for (const j of [0, 1]) {
        const c = centre(STALLS.length + k * 2 + j);
        expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeLessThan(0.06);
        expect(c.y).toBeCloseTo(SIGN_POST.y, 5);
      }
      // the post is thin and has no collider: it is on ground a cat can stand on, clear of every anchor she is sent to
      expect(standable(p.x, p.z)).toBe(true);
      expect(waterClearance(area.waters, p.x, p.z)).toBeGreaterThan(0.5);
    });
    // the posts stand by what they name
    const post = (id) => SIGN_POSTS.find((p) => p.id === id);
    expect(dist(post('hookADuck'), area.anchors.duckPool)).toBeLessThan(3.5);
    expect(dist(post('ringTheBell'), area.anchors.bellPole)).toBeLessThan(1.5);
    expect(dist(post('fortunes'), area.anchors.fortuneDoor)).toBeLessThan(2);
  });
});

describe('The Fairground: anchors for the rides, the games and the things to discover', () => {
  const a = area.anchors;
  const NAMES = ['gate', 'midway', 'plaza', 'merryGoRound', 'merryGoRoundBoard', 'musicBox', 'musicBoxDrum', 'wheel', 'wheelBoard', 'wheelStep',
    'wheelHub', 'wheelTopPlatform', 'teacups', 'teacupsBoard', 'helterSkelter', 'helterDoor', 'helterStairs', 'helterTop', 'helterSlideEnd',
    'helterSlideOff', 'coasterStation', 'coasterBoard', 'coasterPlatform', 'tinCanPlay', 'tinCanCounter', 'tinCans', 'duckPool',
    'duckPoolSide', 'bellPad', 'bellPole', 'bellTop', 'fortuneDoor', 'fortuneSeat', 'fortuneBall', 'candyfloss', 'candyflossPan', 'juggler',
    'jugglerWatch', 'tentsBack', 'balloonField', 'balloonCart', 'bandstand', 'bandstandSteps', 'picnicLawn', 'visitorLoop', 'visitorWatch'];
  const isRect = (v) => Number.isFinite(v?.minX);
  const pointsOf = (v) => (Array.isArray(v) ? v : isRect(v)
    ? [{ x: v.minX, z: v.minZ }, { x: v.maxX, z: v.maxZ }, { x: (v.minX + v.maxX) / 2, z: (v.minZ + v.maxZ) / 2 }] : [v]);
  // the spots the cat stands AT
  const AT = ['gate', 'merryGoRoundBoard', 'musicBox', 'wheelBoard', 'teacupsBoard', 'helterDoor', 'helterSlideOff', 'coasterBoard', 'tinCanPlay',
    'duckPoolSide', 'bellPad', 'fortuneDoor', 'fortuneSeat', 'candyfloss', 'juggler', 'jugglerWatch', 'balloonCart', 'bandstandSteps'];

  it('names every spot steps 2 and 3 need', () => {
    expect(Object.keys(a).sort()).toEqual([...NAMES].sort());
  });

  it('keeps every anchor inside the bounds', () => {
    for (const name of NAMES) {
      for (const p of pointsOf(a[name])) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.z), name).toBe(true);
        expect(inBounds(p), `${name} at ${p.x},${p.z}`).toBe(true);
      }
    }
  });

  it('lets the cat walk from the gate to every anchor that is on the ground', () => {
    for (const name of AT) {
      expect(standable(a[name].x, a[name].z), `${name} is not standable`).toBe(true);
      expect(reached(a[name].x, a[name].z, 0.6), `${name} from the gate`).toBe(true);
    }
    // things that are solid are walked up beside
    const BESIDE = { merryGoRound: MGR.baseR + 0.9, teacups: TEACUPS.baseR + 0.9, wheel: 2.6, helterSkelter: HELTER.baseR + 1, bellPole: 1.2,
      bandstand: 3.9, helterSlideEnd: 1.4 };
    for (const [name, reach] of Object.entries(BESIDE)) expect(reached(a[name].x, a[name].z, reach), `${name} from the gate`).toBe(true);
    for (const p of [...a.visitorLoop, ...a.visitorWatch]) expect(reached(p.x, p.z, 0.6), `visitor spot ${p.x},${p.z}`).toBe(true);
  });

  it('finds a path from the gate to each of them with the game’s own path finder', () => {
    const memo = new Map();
    for (const name of AT) {
      const way = findPath((x, z) => standable(x, z), area.bounds, area.spawn, a[name], { memo });
      expect(way, `gate to ${name}`).toBeTruthy();
    }
  });

  it('keeps the open places open: the midway, the plaza’s ring, the field, the lawn, the tents’ backs', () => {
    const openShare = (r) => {
      let open = 0;
      let all = 0;
      for (let x = r.minX + 0.5; x < r.maxX; x += 1) {
        for (let z = r.minZ + 0.5; z < r.maxZ; z += 1) {
          all++;
          if (reached(x, z, 0.4)) open++;
        }
      }
      return open / all;
    };
    expect(openShare(a.midway)).toBe(1);
    expect(openShare(a.balloonField)).toBe(1);
    expect(openShare(a.picnicLawn)).toBeGreaterThan(0.9); // one tree
    expect(openShare(a.tentsBack)).toBeGreaterThan(0.95);
    for (let t = 0; t < 72; t++) {
      const th = (t / 72) * Math.PI * 2;
      for (const r of [7.9, 9, 10.5]) expect(standable(Math.cos(th) * r, Math.sin(th) * r), `plaza ring r ${r} at ${t * 5} degrees`).toBe(true);
    }
    expect(a.balloonField).toEqual(FIELD);
  });

  it('puts the raised anchors where the models are', () => {
    // the big wheel's boarding deck, and the lookout behind the wheel
    expect(topAt(a.wheelStep.x, a.wheelStep.z, a.wheelStep.y + 0.3, 0.6)).toBeCloseTo(a.wheelStep.y, 1);
    expect(topAt(a.wheelTopPlatform.x, a.wheelTopPlatform.z, a.wheelTopPlatform.y + 0.5, 1)).toBeCloseTo(a.wheelTopPlatform.y, 1);
    expect(a.wheelTopPlatform.y).toBe(FERRIS.topY);
    // the coaster's deck, the tin-can alley's counter, the top of the helter-skelter and every landing inside it
    expect(topAt(a.coasterPlatform.x, a.coasterPlatform.z, a.coasterPlatform.y + 0.4, 0.8)).toBeCloseTo(a.coasterPlatform.y, 1);
    expect(topAt(a.tinCanCounter.x, a.tinCanCounter.z, a.tinCanCounter.y + 0.3, 0.6)).toBeCloseTo(a.tinCanCounter.y, 1);
    expect(topAt(a.helterTop.x, a.helterTop.z, a.helterTop.y + 0.5, 1)).toBeCloseTo(a.helterTop.y, 1);
    for (const p of a.helterStairs) expect(topAt(p.x, p.z, p.y + 0.4, 0.8), `landing y ${p.y}`).toBeCloseTo(p.y, 1);
    // the crystal ball's top, the music box's drum, the candyfloss pan's cloud, the bell
    expect(topAt(a.fortuneBall.x, a.fortuneBall.z, a.fortuneBall.y + 0.6, 1.2)).toBeCloseTo(a.fortuneBall.y + FORTUNE.ballR, 1);
    const drum = worldOf(area.rides.merryGoRound.musicBoxDrum);
    expect(Math.hypot(drum.x - a.musicBoxDrum.x, drum.z - a.musicBoxDrum.z)).toBeLessThan(0.05);
    expect(drum.y).toBeCloseTo(a.musicBoxDrum.y, 2);
    const cloud = topAt(a.candyflossPan.x, a.candyflossPan.z, 2.0, 2.0);
    expect(cloud).toBeGreaterThan(STALL.counterY + 0.3);
    expect(cloud).toBeLessThan(STALL.counterY + 0.9);
    expect(topAt(a.bellTop.x, a.bellTop.z, 6, 6)).toBeGreaterThan(BELL.bellY);
    // the fortune teller's seat is on the rug, under the tent's roof
    expect(topAt(a.fortuneSeat.x, a.fortuneSeat.z, 1.2, 1.3)).toBeLessThan(0.25);
    expect(topAt(a.fortuneSeat.x, a.fortuneSeat.z, 1.2, 1.3)).toBeGreaterThan(0.1);
    expect(topAt(a.fortuneSeat.x, a.fortuneSeat.z, 8, 8)).toBeGreaterThan(FORTUNE.wallH);
  });

  it('strolls the visitors round a closed loop that is clear of everything solid', () => {
    const loop = a.visitorLoop;
    expect(loop.length).toBeGreaterThanOrEqual(12);
    let length = 0;
    for (let i = 0; i < loop.length; i++) {
      const p = loop[i];
      const q = loop[(i + 1) % loop.length];
      const d = dist(p, q);
      length += d;
      expect(d, `leg ${i}`).toBeGreaterThan(1);
      expect(d, `leg ${i}`).toBeLessThan(12);
      for (let t = 0; t <= 1; t += 0.25 / d) {
        const x = p.x + (q.x - p.x) * t;
        const z = p.z + (q.z - p.z) * t;
        expect(standable(x, z), `leg ${i} at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
        // a visitor is wider than a cat: half a metre more room from every collider, and off the water
        for (const c of area.colliders) expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThan(c.r + CAT_RADIUS + 0.5);
        expect(waterClearance(area.waters, x, z)).toBeGreaterThan(1);
      }
    }
    expect(length).toBeGreaterThan(100);
    // up the midway, round the merry-go-round, and back: it goes all the way round the plaza
    const angles = new Set(loop.filter((p) => dist(p, a.plaza) < a.plaza.r).map((p) => Math.round(Math.atan2(p.x, p.z) / (Math.PI / 2))));
    expect(angles.size).toBeGreaterThanOrEqual(4);
    for (const p of a.visitorWatch) {
      expect(standable(p.x, p.z), `watching spot ${p.x},${p.z}`).toBe(true);
      for (const c of area.colliders) expect(dist(p, c)).toBeGreaterThan(c.r + CAT_RADIUS + 0.5);
    }
  });
});

describe('The Fairground: perches', () => {
  const base = climbBudget({});
  const spring = climbBudget({ skills: ['spring-paws'] });
  const free = area.perches.filter((p) => !p.requires);
  const gated = area.perches.filter((p) => p.requires);

  // BFS over the real perch array with the game's own rule (canReach), from
  // the ground: hop counts by perch.
  function hops(budget, perches) {
    const out = new Map();
    let frontier = [];
    for (const p of perches) {
      if (canReach(p, { x: p.x, z: p.z }, 0, budget)) { out.set(p, 1); frontier.push(p); }
    }
    while (frontier.length) {
      const next = [];
      for (const from of frontier) {
        for (const p of perches) {
          if (out.has(p) || !canReach(p, from, from.y, budget)) continue;
          out.set(p, out.get(from) + 1);
          next.push(p);
        }
      }
      frontier = next;
    }
    return out;
  }
  const at = (q) => free.find((p) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.z - q.z) < 0.01 && Math.abs(p.y - q.y) < 0.01);

  it('gives every perch a kind the climbing rules know, inside the bounds and out of the pool', () => {
    for (const p of area.perches) {
      expect(['tree', 'fence', 'roof', 'crate', 'car', 'stone', 'furniture']).toContain(p.kind);
      expect(inBounds(p)).toBe(true);
      expect(waterClearance(area.waters, p.x, p.z)).toBeGreaterThan(0.5);
      expect(p.y).toBeGreaterThan(0);
    }
  });

  it('can start every chain from a spot the cat can stand on', () => {
    for (const p of free.filter((q) => q.y <= base.climb)) {
      const reach = p.y > 1 ? base.reachHigh : base.reachLow;
      expect(standableWithin(p.x, p.z, reach - 0.05), `perch y${p.y} at ${p.x},${p.z}`).toBe(true);
    }
  });

  it('climbs the helter-skelter by the stairs inside: five landings and the gallery, six hops, and no other way up', () => {
    const route = [...HELTER_STAIRS, HELTER_TOP].map(at);
    expect(route.every(Boolean)).toBe(true);
    expect(route).toHaveLength(6);
    const h = hops(base, free);
    expect(route.map((p) => h.get(p))).toEqual([1, 2, 3, 4, 5, 6]);
    // the first landing is hopped onto from the doorway
    const door = area.anchors.helterDoor;
    expect(standable(door.x, door.z)).toBe(true);
    expect(canReach(route[0], door, 0, base)).toBe(true);
    // each step is inside one hop's climb and reach, going up and coming down
    for (let i = 1; i < route.length; i++) {
      expect(route[i].y - route[i - 1].y).toBeLessThanOrEqual(base.climb);
      expect(dist(route[i], route[i - 1])).toBeLessThan(base.reachHigh);
      expect(canReach(route[i - 1], route[i], route[i].y, base)).toBe(true);
    }
    // Spring Paws skips the last landing, never the stairs
    expect(hops(spring, free).get(route[5])).toBe(5);
    expect(route[5].y).toBeGreaterThan(spring.climb * 3);
    // without the stairs there is no way up at all
    const noStairs = free.filter((p) => !route.slice(0, 5).includes(p));
    expect(hops(spring, noStairs).has(route[5])).toBe(false);
    expect(route[5].label).toBe('the top of the helter-skelter');
    expect(route[5].vantage).toBe(true);
    // the landings are inside the tower's wall, the gallery is on top of it
    for (const p of route.slice(0, 5)) expect(dist(p, area.anchors.helterSkelter)).toBeLessThan(HELTER.topR - 0.4);
    expect(route[5].y).toBe(HELTER.towerH);
  });

  it('climbs three stall roofs over their counters, and hops onto the bandstand from its steps', () => {
    const h = hops(base, free);
    const roofs = free.filter((p) => p.y === STALL.roofY);
    expect(roofs).toHaveLength(3);
    for (const r of roofs) {
      expect(h.get(r)).toBe(2);
      expect(STALLS.some((s) => s.top === 'flat' && s.x === r.x && s.z === r.z)).toBe(true);
    }
    expect(free.filter((p) => p.y === STALL.counterY && p.kind === 'crate')).toHaveLength(3);
    const deck = free.find((p) => p.label === 'the bandstand');
    expect(h.get(deck)).toBe(1);
    expect(dist(deck, area.anchors.bandstandSteps)).toBeLessThan(2);
  });

  it('reaches every ungated perch on the baseline budget', () => {
    const h = hops(base, free);
    for (const p of free) expect(h.has(p), `perch y${p.y} at ${p.x},${p.z}`).toBe(true);
    expect(free).toHaveLength(24); // 21, and a perch on the steps of each of the three decks
  });

  // Step 3's fix. A first jump at the coaster's steps from a metre and a half
  // out was a pounce at nothing: the platform's perch is in the middle of a
  // solid deck, which leaves a ring of ground a hand wide to jump from. Every
  // perch a cat can reach from the ground must have room to be jumped at: a
  // square metre of ground in reach, half a metre deep; or be the next hop
  // from a lower perch that has.
  it('gives every first hop room to be made from: a square metre of ground in reach, half a metre deep', () => {
    const room = (p) => {
      const reach = p.y > 1 ? base.reachHigh : base.reachLow;
      const S = 0.05;
      let cells = 0;
      for (let x = p.x - reach; x <= p.x + reach; x += S) {
        for (let z = p.z - reach; z <= p.z + reach; z += S) if (Math.hypot(x - p.x, z - p.z) < reach && standable(x, z)) cells++;
      }
      let deep = 0;
      for (let t = 0; t < 72; t++) {
        const th = (t / 72) * Math.PI * 2;
        let run = 0;
        for (let r = 0; r < reach; r += 0.02) if (standable(p.x + Math.cos(th) * r, p.z + Math.sin(th) * r)) run += 0.02;
        deep = Math.max(deep, run);
      }
      return { area: cells * S * S, deep };
    };
    const low = free.filter((p) => p.y <= base.climb && standableWithin(p.x, p.z, (p.y > 1 ? base.reachHigh : base.reachLow) - 0.05));
    const roomy = low.filter((p) => { const r = room(p); return r.area >= 1 && r.deep >= 0.5; });
    const cramped = low.filter((p) => !roomy.includes(p));
    // the three decks are the cramped ones, and each has its top step below it, one hop away
    expect(cramped.map((p) => p.y).sort()).toEqual([FERRIS.deckY, BANDSTAND.deckY, STATION.deckY]);
    for (const p of cramped) {
      const step = roomy.find((q) => q.y < p.y && canReach(p, q, q.y, base));
      expect(step, `no step below the perch y${p.y} at ${p.x},${p.z}`).toBeTruthy();
      expect(dist(step, p)).toBeLessThan(1.0);
    }
    // the report's own jump: from the foot of the coaster's steps the first hop is onto the steps
    const from = { x: 20.3, z: 0 };
    expect(standable(from.x, from.z)).toBe(true);
    const got = free.filter((p) => canReach(p, from, 0, base));
    expect(got).toHaveLength(1);
    expect(got[0].y).toBeCloseTo(STATION.deckY * 0.66, 2);
    expect(canReach(free.find((p) => p.label === 'the coaster platform'), got[0], got[0].y, base)).toBe(true);
    // and from a metre and a half out, where the report's jump was a pounce
    expect(free.some((p) => canReach(p, { x: 19.7, z: 0 }, 0, base))).toBe(true);
    // the counters are jumped at from the midway: their perch is at the counter's front edge
    for (const p of free.filter((q) => q.kind === 'crate')) expect(room(p).area).toBeGreaterThan(1.2);
  });

  it('has four vantage perches, each with a name', () => {
    const v = area.perches.filter((p) => p.vantage);
    expect(v.map((p) => p.label).sort()).toEqual(['the bandstand', 'the coaster platform', 'the toffee apple stall’s roof', 'the top of the helter-skelter']);
  });

  it('opens the fourteen trees to Sure Claws', () => {
    expect(gated).toHaveLength(14);
    expect(gated.every((p) => p.requires === SURE_CLAWS_ID && p.kind === 'tree')).toBe(true);
    const claws = climbBudget({ skills: [SURE_CLAWS_ID] });
    for (const p of gated) {
      const reach = p.y > 1 ? claws.reachHigh : claws.reachLow;
      expect(standableWithin(p.x, p.z, reach - 0.05), `gated perch at ${p.x},${p.z}`).toBe(true);
      expect(p.y).toBeLessThanOrEqual(2.0);
    }
  });

  it('keeps the rides’ seats and the wheel’s lookout out of the static perches (step 2 adds them, moving)', () => {
    const t = area.anchors.wheelTopPlatform;
    expect(area.perches.some((p) => dist(p, t) < 1 && p.y > 5)).toBe(false);
    expect(area.perches.some((p) => dist(p, area.anchors.merryGoRound) < MGR.baseR)).toBe(false);
    expect(area.perches.some((p) => dist(p, area.anchors.teacups) < TEACUPS.baseR)).toBe(false);
  });

  it('stands every perch on something: the models’ real tops', () => {
    for (const p of free) {
      rc.set(new THREE.Vector3(p.x, p.y + 0.4, p.z), new THREE.Vector3(0, -1, 0));
      rc.far = 0.9;
      const hit = rc.intersectObjects(allMeshes, false)[0];
      expect(hit, `nothing under the perch y${p.y} at ${p.x},${p.z}`).toBeTruthy();
      expect(Math.abs(hit.point.y - p.y), `perch y${p.y} at ${p.x},${p.z} top ${hit.point.y}`).toBeLessThan(0.12);
    }
  });
});

describe('The Fairground: the duck pool', () => {
  it('declares one small pool and draws it from that record', () => {
    expect(area.waters).toEqual([DUCK_POOL]);
    expect(DUCK_POOL.kind).toBe('circle');
    expect(DUCK_POOL.r).toBeLessThanOrEqual(2);
    expect(area.waterFx).toHaveLength(1);
    expect(scene.children).toContain(area.waterFx[0].mesh);
    expect(area.waterFx[0].mesh.position.x).toBeCloseTo(DUCK_POOL.x, 6);
    expect(area.waterFx[0].mesh.position.z).toBeCloseTo(DUCK_POOL.z, 6);
  });

  it('lets every cat wade anywhere in it, and is nowhere deep enough to swim', () => {
    expect(DUCK_POOL.shallow).toBeGreaterThanOrEqual(DUCK_POOL.r);
    expect(DUCK_POOL.shallow).toBeLessThanOrEqual(1.6); // the game's widest wading band
    let wet = 0;
    for (let x = DUCK_POOL.x - 2; x <= DUCK_POOL.x + 2; x += 0.1) {
      for (let z = DUCK_POOL.z - 2; z <= DUCK_POOL.z + 2; z += 0.1) {
        if (!inWater(area.waters, x, z)) continue;
        wet++;
        expect(isWadeableAt(area, x, z), `wading at ${x.toFixed(1)},${z.toFixed(1)}`).toBe(true);
        expect(shallowExcess(area.waters, x, z)).toBeLessThanOrEqual(1e-9);
      }
    }
    expect(wet).toBeGreaterThan(500);
    // the middle too
    expect(isWadeableAt(area, DUCK_POOL.x, DUCK_POOL.z)).toBe(true);
    // and the cat can walk right up to its edge from the midway
    expect(reached(area.anchors.duckPoolSide.x, area.anchors.duckPoolSide.z, 0.5)).toBe(true);
    expect(waterClearance(area.waters, area.anchors.duckPoolSide.x, area.anchors.duckPoolSide.z)).toBeLessThan(1.2);
  });

  it('floats seven rubber ducks in it, each a mesh of its own, some with a star underneath', () => {
    const ducks = area.rides.ducks;
    expect(ducks).toHaveLength(7);
    expect(new Set(ducks.map((d) => d.name)).size).toBe(7);
    for (const d of ducks) {
      expect(d.isMesh).toBe(true);
      expect(Math.hypot(d.position.x - DUCK_POOL.x, d.position.z - DUCK_POOL.z)).toBeLessThan(DUCK_POOL.r - 0.3);
      expect(d.position.y).toBeGreaterThan(0);
      expect(d.position.y).toBeLessThan(0.3);
    }
    for (let i = 0; i < ducks.length; i++) for (let j = i + 1; j < ducks.length; j++) expect(ducks[i].position.distanceTo(ducks[j].position)).toBeGreaterThan(0.3);
    const stars = ducks.filter((d) => d.userData.star).length;
    expect(stars).toBeGreaterThanOrEqual(2);
    expect(stars).toBeLessThan(ducks.length);
  });

  it('puts nothing the player has to reach in the water', () => {
    const lists = {
      collectibles: area.collectibles, 'golden mice': REG.goldMice, scenics: area.scenics, pois: area.pois,
      tippables: area.tippables, perches: area.perches, boxes: area.boxes, puddles: area.puddles,
      carryables: set.carryables, rests: set.rests, markables: set.markables, hides: set.hides,
    };
    for (const [name, list] of Object.entries(lists)) {
      for (const p of list) expect(waterClearance(area.waters, p.x, p.z), `${name} at ${p.x},${p.z}`).toBeGreaterThan(0.5);
    }
    expect(inWater(area.waters, area.spawn.x, area.spawn.z)).toBe(false);
  });

  it('keeps every trail out of the water', () => {
    const v = new THREE.Vector3();
    for (const m of scene.children.filter((c) => c.name === 'path')) {
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        expect(inWater(area.waters, v.x, v.z), `a path corner at ${v.x.toFixed(1)},${v.z.toFixed(1)}`).toBe(false);
      }
    }
  });
});

describe('The Fairground: rides built to move', () => {
  const r = area.rides;
  const a = area.anchors;

  it('keeps every ride’s parts apart when the renderer merges the rest', () => {
    const s = new THREE.Scene();
    build(s);
    mergeStaticProps(s);
    for (const name of ['mgrTurn', 'mgrHorse0', 'mgrHorse11', 'musicBoxDrum', 'ferrisTurn', 'gondola0', 'gondola7', 'teacupsTurn', 'teacup0', 'teacup5',
      'coasterCar0', 'coasterCar3', 'tin0', 'tin5', 'rubberDuck0', 'rubberDuck6', 'bellMarker', 'crystalBall']) {
      const o = s.getObjectByName(name);
      expect(o, name).toBeTruthy();
      let meshes = 0;
      o.traverse((m) => { if (m.isMesh) meshes++; });
      expect(meshes, name).toBeGreaterThan(0);
    }
    for (const name of ['merryGoRound', 'musicBox', 'ferrisWheel', 'teacups', 'coasterTrain', 'tinCans', 'rubberDucks', 'ringTheBell', 'fortuneTable']) {
      expect(scene.getObjectByName(name).userData.noMerge, name).toBe(true);
      expect(scene.getObjectByName(name).parent).toBe(scene);
    }
  });

  it('builds the merry-go-round as a platform that turns about its middle, with twelve horses on poles', () => {
    const m = r.merryGoRound;
    expect(m.turn.name).toBe('mgrTurn');
    expect(m.turn.parent).toBe(m.group);
    expect(m.axis).toBe('y');
    const pivot = worldOf(m.turn);
    expect(pivot.x).toBeCloseTo(a.merryGoRound.x, 6);
    expect(pivot.z).toBeCloseTo(a.merryGoRound.z, 6);
    expect(pivot.y).toBeCloseTo(0, 6);
    expect(m.horses).toHaveLength(12);
    expect(m.horses.filter((h) => Math.abs(h.userData.place.radius - MGR.outerR) < 1e-9)).toHaveLength(8);
    expect(m.horses.filter((h) => Math.abs(h.userData.place.radius - MGR.innerR) < 1e-9)).toHaveLength(4);
    m.horses.forEach((h, i) => {
      expect(h.name).toBe('mgrHorse' + i);
      expect(h.parent).toBe(m.turn);
      expect(h.children).toHaveLength(1);
      expect(h.children[0].isMesh).toBe(true);
      // it stands on the deck at its place, and its seat is a metre above the deck
      expect(Math.hypot(h.position.x, h.position.z)).toBeCloseTo(h.userData.place.radius, 6);
      expect(h.position.y).toBe(MGR.deckY);
      const seat = worldOf(h, h.userData.seat);
      expect(seat.y).toBeCloseTo(MGR.deckY + MGR.seatY, 6);
      expect(Math.hypot(seat.x - pivot.x, seat.z - pivot.z)).toBeLessThan(MGR.r - 0.5);
      // the saddle is under the seat point
      expect(topAt(seat.x, seat.z, seat.y + 0.3, 0.6, [h.children[0]])).toBeCloseTo(seat.y, 1);
      // its pole runs from inside the deck's sleeve up to just under the canvas, with room to rise and fall
      const box = new THREE.Box3().setFromObject(h);
      const canvasY = MGR.canopyY + (MGR.apexY - MGR.canopyY) * (1 - h.userData.place.radius / MGR.canopyR);
      expect(box.min.y).toBeLessThan(MGR.deckY - MGR.bob);
      expect(box.max.y).toBeGreaterThan(MGR.canopyY - 0.5);
      expect(box.max.y + MGR.bob).toBeLessThan(canvasY);
      expect(Number.isFinite(h.userData.place.phase)).toBe(true);
    });
    // the horses are spread round, none on top of another, one hop apart (the cat hops from horse to horse)
    for (let i = 0; i < 12; i++) {
      let nearest = Infinity;
      for (let j = 0; j < 12; j++) if (i !== j) nearest = Math.min(nearest, m.horses[i].position.distanceTo(m.horses[j].position));
      expect(nearest).toBeGreaterThan(1.2);
      expect(nearest).toBeLessThan(2.6);
    }
    // turning the platform carries a horse round the middle at its radius
    const before = worldOf(m.horses[0], m.horses[0].userData.seat);
    m.turn.rotation.y = 1;
    m.group.updateMatrixWorld(true);
    const after = worldOf(m.horses[0], m.horses[0].userData.seat);
    expect(Math.hypot(after.x - pivot.x, after.z - pivot.z)).toBeCloseTo(Math.hypot(before.x - pivot.x, before.z - pivot.z), 6);
    expect(after.distanceTo(before)).toBeGreaterThan(2);
    m.turn.rotation.y = 0;
    m.group.updateMatrixWorld(true);
    // the music box is at the back, on the far side from the gate, with a drum that turns
    expect(a.musicBox.z).toBeLessThan(a.merryGoRound.z - a.merryGoRound.r);
    expect(m.musicBoxDrum.name).toBe('musicBoxDrum');
    expect(m.musicBoxDrum.isMesh).toBe(true);
  });

  it('builds the big wheel as a wheel that turns about its hub, with eight gondolas that can stay upright', () => {
    const w = r.wheel;
    expect(w.turn.name).toBe('ferrisTurn');
    expect(w.axis).toBe('z');
    const hub = worldOf(w.turn);
    expect(hub.x).toBeCloseTo(a.wheelHub.x, 6);
    expect(hub.y).toBeCloseTo(a.wheelHub.y, 6);
    expect(hub.z).toBeCloseTo(a.wheelHub.z, 6);
    expect(w.gondolas).toHaveLength(8);
    w.gondolas.forEach((g, i) => {
      expect(g.name).toBe('gondola' + i);
      expect(g.parent).toBe(w.turn);
      expect(g.children).toHaveLength(1);
      expect(Math.hypot(g.position.x, g.position.y)).toBeCloseTo(FERRIS.R, 6);
      expect(g.position.z).toBe(0);
      expect(g.userData.place.angle).toBeCloseTo(-Math.PI / 2 + (i * Math.PI) / 4, 9);
      const seat = worldOf(g, g.userData.seat);
      const bar = worldOf(g);
      expect(bar.y - seat.y).toBeCloseTo(FERRIS.seatDrop, 6);
      // a floor under the seat
      expect(topAt(seat.x, seat.z, seat.y + 0.3, 0.6, [g.children[0]])).toBeCloseTo(seat.y, 1);
    });
    // gondola 0 is at the bottom, level with the boarding deck and one hop from it
    const low = worldOf(w.gondolas[0], w.gondolas[0].userData.seat);
    expect(low.x).toBeCloseTo(a.wheel.x, 6);
    expect(Math.abs(low.y - a.wheelStep.y)).toBeLessThan(0.1);
    expect(Math.hypot(low.x - a.wheelStep.x, low.z - a.wheelStep.z)).toBeLessThan(1.9);
    // gondola 4 is at the top, level with the lookout and one hop from it
    const high = worldOf(w.gondolas[4], w.gondolas[4].userData.seat);
    expect(Math.abs(high.y - a.wheelTopPlatform.y)).toBeLessThan(0.1);
    expect(Math.hypot(high.x - a.wheelTopPlatform.x, high.z - a.wheelTopPlatform.z)).toBeLessThan(2.6);
    expect(Math.hypot(high.x - a.wheelTopPlatform.x, high.z - a.wheelTopPlatform.z)).toBeGreaterThan(1.2); // the platform is clear of the wheel
    // the lowest any gondola hangs is above the grass
    expect(new THREE.Box3().setFromObject(w.gondolas[0]).min.y).toBeGreaterThan(0.1);
    // turn the wheel a quarter and turn each gondola back by as much: gondola 0 is now at the side, still hanging straight down
    w.turn.rotation.z = Math.PI / 2;
    for (const g of w.gondolas) g.rotation.z = -Math.PI / 2;
    w.group.updateMatrixWorld(true);
    const bar = worldOf(w.gondolas[0]);
    const seat = worldOf(w.gondolas[0], w.gondolas[0].userData.seat);
    expect(bar.y).toBeCloseTo(FERRIS.hubY, 6);
    expect(Math.abs(bar.x - hub.x)).toBeCloseTo(FERRIS.R, 6);
    expect(seat.x).toBeCloseTo(bar.x, 6);
    expect(bar.y - seat.y).toBeCloseTo(FERRIS.seatDrop, 6);
    w.turn.rotation.z = 0;
    for (const g of w.gondolas) g.rotation.z = 0;
    w.group.updateMatrixWorld(true);
  });

  it('builds the teacups as a floor that turns, with six cups that each spin about their own middle', () => {
    const t = r.teacups;
    expect(t.turn.name).toBe('teacupsTurn');
    expect(t.axis).toBe('y');
    const pivot = worldOf(t.turn);
    expect(pivot.x).toBeCloseTo(a.teacups.x, 6);
    expect(pivot.z).toBeCloseTo(a.teacups.z, 6);
    expect(t.cups).toHaveLength(6);
    t.cups.forEach((c, i) => {
      expect(c.name).toBe('teacup' + i);
      expect(c.parent).toBe(t.turn);
      expect(Math.hypot(c.position.x, c.position.z)).toBeCloseTo(TEACUPS.cupR, 6);
      const seat = worldOf(c, c.userData.seat);
      const mid = worldOf(c);
      expect(Math.hypot(seat.x - mid.x, seat.z - mid.z)).toBeLessThan(1e-6); // the seat is on the cup's own axis
      expect(seat.y).toBeCloseTo(TEACUPS.deckY + TEACUPS.seatY, 6);
      expect(topAt(seat.x, seat.z, seat.y + 0.3, 0.6, [c.children[0]])).toBeCloseTo(seat.y, 1);
      // she sits IN the cup: its rim is above the seat, and lower than a sitting cat's ears
      const rim = new THREE.Box3().setFromObject(c).max.y;
      expect(rim - seat.y).toBeGreaterThan(0.3);
      expect(rim - seat.y).toBeLessThan(0.65);
    });
    for (let i = 0; i < 6; i++) expect(t.cups[i].position.distanceTo(t.cups[(i + 1) % 6].position)).toBeGreaterThan(2.3); // cups do not touch
  });

  it('builds the coaster’s track as a closed, smooth, gentle curve inside the fair', () => {
    const { points, length, step, closed } = COASTER_TRACK;
    expect(closed).toBe(true);
    expect(points.length).toBeGreaterThan(150);
    expect(length).toBeGreaterThan(120);
    expect(length).toBeLessThan(170);
    expect(step).toBeCloseTo(COASTER.step, 1);
    const n = points.length;
    let maxTurn = 0;
    let maxSlope = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const q = points[(i + 1) % n];
      const s = points[(i + 2) % n];
      // evenly spaced all the way round, the last point joining the first
      const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
      expect(d, `spacing at ${i}`).toBeGreaterThan(step * 0.97);
      expect(d, `spacing at ${i}`).toBeLessThan(step * 1.01);
      const u = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z).normalize();
      const v = new THREE.Vector3(s.x - q.x, s.y - q.y, s.z - q.z).normalize();
      maxTurn = Math.max(maxTurn, u.angleTo(v) / d);
      maxSlope = Math.max(maxSlope, Math.abs(q.y - p.y) / Math.hypot(q.x - p.x, q.z - p.z));
      // inside the fair, with room for the supports' feet; above the ground; under seven metres
      expect(p.x).toBeGreaterThan(area.bounds.minX + 2);
      expect(p.x).toBeLessThan(area.bounds.maxX - 2);
      expect(p.z).toBeGreaterThan(area.bounds.minZ + 2);
      expect(p.z).toBeLessThan(area.bounds.maxZ - 2);
      expect(p.y).toBeGreaterThanOrEqual(0.95); // level in the station at 1.0; the curve dips a finger's width as it leaves
      expect(p.y).toBeLessThan(7);
    }
    // no kink and no tight corner: under 0.3 radians of turn per metre (a 3.3 m radius at the tightest)
    expect(maxTurn).toBeLessThan(0.3);
    // gentle: never steeper than about one in three
    expect(maxSlope).toBeLessThan(0.36);
    // one hill, climbed on the way out of the station: the top is in the north
    const top = points.reduce((m, p) => (p.y > m.y ? p : m));
    expect(top.z).toBeLessThan(-25);
    // the rails drawn are that curve
    const rails = scene.getObjectByName('coasterRails');
    const box = new THREE.Box3().setFromObject(rails);
    expect(box.max.y).toBeCloseTo(top.y, 1);
    expect(box.min.x).toBeCloseTo(Math.min(...points.map((p) => p.x)) - COASTER.gauge - 0.05, 0);
  });

  it('gives a pose anywhere along the track, wrapping at the end', () => {
    const { length } = COASTER_TRACK;
    for (const s of [0, 1.234, length / 3, length - 0.01, length + 5, -3]) {
      const p = trackPose(COASTER_TRACK, s);
      expect(Math.hypot(p.tx, p.ty, p.tz)).toBeCloseTo(1, 6);
      const q = trackPose(COASTER_TRACK, s + length);
      expect(q.x).toBeCloseTo(p.x, 6);
      expect(q.y).toBeCloseTo(p.y, 6);
      expect(q.z).toBeCloseTo(p.z, 6);
    }
    // the curve is a pure function of its control points
    expect(coasterTrackPoints([[0, 1, 0], [10, 1, 0], [10, 1, 10], [0, 1, 10]])).toEqual(coasterTrackPoints([[0, 1, 0], [10, 1, 0], [10, 1, 10], [0, 1, 10]]));
  });

  it('runs the track level and straight through the station, beside a platform the cat can reach', () => {
    const inStation = COASTER_TRACK.points.filter((p) => p.x < TRACK_X + 0.5 && p.z >= STATION_DECK.minZ && p.z <= STATION_DECK.maxZ);
    expect(inStation.length).toBeGreaterThan(10);
    for (const p of inStation) {
      expect(p.x).toBeCloseTo(TRACK_X, 2);
      expect(p.y).toBeCloseTo(1.0, 2);
    }
    // the deck is a step lower than the cars' seats, and right beside the rails
    expect(a.coasterPlatform.y).toBeLessThan(1.0 + COASTER.seatY);
    expect(TRACK_X - COASTER.gauge - STATION_DECK.maxX).toBeLessThan(0.5);
    expect(TRACK_X - COASTER.gauge - STATION_DECK.maxX).toBeGreaterThan(0);
    // the cat walks to the steps, and hops up onto the platform from there
    expect(reached(a.coasterBoard.x, a.coasterBoard.z, 0.5)).toBe(true);
    const platform = area.perches.find((p) => p.label === 'the coaster platform');
    expect(standableWithin(platform.x, platform.z, climbBudget({}).reachLow - 0.05)).toBe(true);
    expect(findPath((x, z) => standable(x, z), area.bounds, area.spawn, a.coasterBoard)).toBeTruthy();
  });

  it('stands a caterpillar train of four cars on the rails in the station', () => {
    const c = r.coaster;
    expect(c.track).toBe(COASTER_TRACK);
    expect(c.stationS).toBe(COASTER_STATION_S);
    expect(c.cars).toHaveLength(4);
    c.cars.forEach((car, i) => {
      expect(car.name).toBe('coasterCar' + i);
      expect(car.parent).toBe(c.train);
      expect(car.children).toHaveLength(1);
      const pose = trackPose(COASTER_TRACK, c.stationS - i * c.carGap);
      expect(car.position.x).toBeCloseTo(pose.x, 6);
      expect(car.position.y).toBeCloseTo(pose.y, 6);
      expect(car.position.z).toBeCloseTo(pose.z, 6);
      expect(car.userData.behind).toBeCloseTo(i * c.carGap, 9);
      // in the station, beside the deck, facing north (the way the track leaves)
      expect(car.position.z).toBeGreaterThan(STATION_DECK.minZ + 0.5);
      expect(car.position.z).toBeLessThan(STATION_DECK.maxZ - 0.5);
      const nose = worldOf(car, { x: 0, y: 0, z: 1 });
      expect(nose.z).toBeLessThan(car.position.z - 0.9);
      const seat = worldOf(car, car.userData.seat);
      expect(seat.y).toBeCloseTo(1.0 + COASTER.seatY, 2);
      expect(topAt(seat.x, seat.z, seat.y + 0.3, 0.6, [car.children[0]])).toBeCloseTo(seat.y, 1);
      // one hop from the platform
      expect(Math.hypot(seat.x - a.coasterPlatform.x, seat.z - a.coasterPlatform.z)).toBeLessThan(2.6 + 2.5);
      expect(seat.x - STATION_DECK.maxX).toBeLessThan(1.2);
    });
    // the cars follow one another nose to tail without overlapping
    for (let i = 1; i < 4; i++) expect(c.cars[i].position.distanceTo(c.cars[i - 1].position)).toBeCloseTo(c.carGap, 2);
    // the head car has a face: it is the biggest mesh
    const tris = c.cars.map((car) => car.children[0].geometry.attributes.position.count);
    expect(tris[0]).toBeGreaterThan(tris[1]);
  });

  it('winds the helter-skelter’s slide from the gallery down round the tower to the grass', () => {
    const top = a.helterTop;
    const s = HELTER_SLIDE;
    expect(s.length).toBeGreaterThan(100);
    expect(r.helterSkelter.slide).toBe(s);
    // it starts at the gallery, a step from where the stairs come out
    expect(Math.abs(s[0].y - top.y)).toBeLessThan(0.4);
    expect(Math.hypot(s[0].x - top.x, s[0].z - top.z)).toBeLessThan(2.2);
    // it only ever goes down, never steeply, in small even steps
    let turned = 0;
    for (let i = 1; i < s.length; i++) {
      const d = Math.hypot(s[i].x - s[i - 1].x, s[i].z - s[i - 1].z);
      expect(s[i].y).toBeLessThanOrEqual(s[i - 1].y + 1e-9);
      expect(d).toBeGreaterThan(0.05);
      expect(d).toBeLessThan(0.4);
      expect((s[i - 1].y - s[i].y) / d).toBeLessThan(0.45);
      expect(inBounds(s[i])).toBe(true);
      const a0 = Math.atan2(s[i - 1].z - a.helterSkelter.z, s[i - 1].x - a.helterSkelter.x);
      const a1 = Math.atan2(s[i].z - a.helterSkelter.z, s[i].x - a.helterSkelter.x);
      let da = a1 - a0;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      turned += da;
      // outside the tower's wall all the way down
      expect(dist(s[i], a.helterSkelter)).toBeGreaterThan(HELTER.topR + 0.4);
    }
    expect(Math.abs(turned)).toBeGreaterThan(Math.PI * 4); // more than twice round
    // it ends on the grass, on the mat, and the cat can walk away from there
    const end = s[s.length - 1];
    expect(end.y).toBeLessThan(0.2);
    expect(a.helterSlideEnd).toEqual({ x: end.x, z: end.z });
    expect(standable(a.helterSlideOff.x, a.helterSlideOff.z)).toBe(true);
    expect(dist(a.helterSlideOff, end)).toBeLessThan(3);
    // the chute drawn is that path: there is slide under its centre line, top, middle and bottom
    const chute = [scene.getObjectByName('helterSlide')];
    for (const i of [2, Math.floor(s.length / 2), s.length - 3]) {
      expect(topAt(s[i].x, s[i].z, s[i].y + 0.25, 0.5, chute), `slide point ${i}`).toBeCloseTo(s[i].y, 1);
    }
    // and the doorway is not under the low end of the slide
    const door = a.helterDoor;
    for (const p of s.filter((q) => q.y < 2.2)) expect(dist(p, door)).toBeGreaterThan(1.2);
  });
});

describe('The Fairground: the games’ pieces', () => {
  const a = area.anchors;

  it('stacks six separate tins in a pyramid on the tin-can alley’s shelf', () => {
    const tins = area.rides.tinCans;
    expect(tins).toHaveLength(6);
    expect(a.tinCans).toHaveLength(6);
    tins.forEach((t, i) => {
      expect(t.isMesh).toBe(true);
      expect(t.name).toBe('tin' + i);
      expect(t.position.x).toBeCloseTo(a.tinCans[i].x, 6);
      expect(t.position.y).toBeCloseTo(a.tinCans[i].y, 6);
      expect(t.position.z).toBeCloseTo(a.tinCans[i].z, 6);
      expect(t.userData.home).toEqual({ x: t.position.x, y: t.position.y, z: t.position.z });
    });
    const rows = [0, 1, 2].map((k) => a.tinCans.filter((t) => Math.abs(t.y - (TINS.shelfY + k * TINS.h)) < 1e-6).length);
    expect(rows).toEqual([3, 2, 1]);
    // the bottom row stands on the shelf
    const others = allMeshes.filter((m) => !tins.includes(m));
    for (const t of a.tinCans.slice(0, 3)) expect(topAt(t.x, t.z, t.y + 0.05, 0.3, others)).toBeCloseTo(TINS.shelfY, 2);
    // the cat jumps up on the counter in front of them, a paw's reach away
    for (const t of a.tinCans) {
      expect(dist(t, a.tinCanCounter)).toBeGreaterThan(1.0);
      expect(dist(t, a.tinCanCounter)).toBeLessThan(1.7);
    }
    expect(area.perches.some((p) => p.x === a.tinCanCounter.x && p.z === a.tinCanCounter.z && p.y === a.tinCanCounter.y)).toBe(true);
  });

  it('stands a bell pole by the midway with a pad to pounce on and a marker that can slide to the bell', () => {
    const bell = area.rides.bell;
    expect(bell.marker.name).toBe('bellMarker');
    expect(bell.marker.isMesh).toBe(true);
    expect(bell.marker.position.y).toBe(BELL.markerFrom);
    expect(bell.marker.userData.travel).toEqual({ from: bell.from, to: bell.to });
    expect(bell.to - bell.from).toBeGreaterThan(3);
    expect(bell.to).toBeLessThan(BELL.bellY - 0.3); // it stops under the bell
    // the marker is in front of the board all the way up, on the side the pad is
    const board = [scene.getObjectByName('bellBoard')];
    const m = worldOf(bell.marker);
    const toPad = { x: Math.sign(a.bellPad.x - a.bellPole.x), z: 0 };
    expect(Math.sign(m.x - a.bellPole.x)).toBe(toPad.x);
    // the pad is on open ground between the pole and the midway
    expect(standable(a.bellPad.x, a.bellPad.z)).toBe(true);
    expect(dist(a.bellPad, a.bellPole)).toBeCloseTo(BELL.padZ, 2);
    expect(Math.abs(a.bellPad.x)).toBeLessThan(Math.abs(a.bellPole.x));
    expect(topAt(a.bellPad.x, a.bellPad.z, 1, 1.1, board)).toBeCloseTo(BELL.padY, 1);
  });
});

describe('The Fairground: bulbs ready for dusk', () => {
  const glowing = allMeshes.filter((m) => m.userData.fairGlow);

  it('draws every bulb with one material', () => {
    expect(glowing.length).toBeGreaterThanOrEqual(9);
    for (const m of glowing) expect(m.material, m.name).toBe(area.glow.material);
    // on the rides, the gate, the stalls and the strings
    for (const name of ['fairBulbs', 'fairGateBulbs', 'mgrBulbs', 'ferrisBulbs', 'teacupsBulbs', 'helterBulbs', 'coasterBulbs', 'bandstandBulbs', 'fortuneBulbs']) {
      expect(glowing.some((m) => m.name === name), name).toBe(true);
    }
    // the wheel's and the merry-go-round's bulbs turn with them
    expect(scene.getObjectByName('ferrisBulbs').parent).toBe(area.rides.wheel.turn);
    expect(scene.getObjectByName('mgrBulbs').parent).toBe(area.rides.merryGoRound.turn);
    // nothing else uses that material
    expect(allMeshes.filter((m) => m.material === area.glow.material)).toHaveLength(glowing.length);
  });

  it('lights them all with one number, and is dark by day', () => {
    expect(area.glow.material.emissiveIntensity).toBe(0);
    expect(area.glow.level).toBe(0);
    expect(setFairGlow(area, 0.5)).toBe(0.5);
    expect(area.glow.material.emissiveIntensity).toBeCloseTo(GLOW_MAX / 2, 9);
    expect(setFairGlow(area, 7)).toBe(1);
    expect(area.glow.material.emissiveIntensity).toBe(GLOW_MAX);
    expect(setFairGlow(area, NaN)).toBe(0);
    expect(setFairGlow(area, -1)).toBe(0);
    expect(area.glow.material.emissiveIntensity).toBe(0);
    expect(() => setFairGlow(null, 1)).not.toThrow();
  });

  it('uses no real lights, and no bulb, flag or picket casts a shadow', () => {
    scene.traverse((o) => expect(o.isLight, o.name).not.toBe(true));
    for (const m of glowing) expect(m.userData.noCast, m.name).toBe(true);
    for (const name of ['fairBunting', 'fairFence', 'fairBalloons']) {
      expect(scene.getObjectByName(name).userData.noCast, name).toBe(true);
      expect(scene.getObjectByName(name).isMesh).toBe(true); // one mesh each for the whole fair
    }
    // the merge leaves the glow meshes alone, so the one material still drives them
    const s = new THREE.Scene();
    const b2 = build(s);
    mergeStaticProps(s);
    let n = 0;
    s.traverse((o) => { if (o.isMesh && o.material === b2.glow.material) n++; });
    expect(n).toBe(glowing.length);
  });
});

describe('The Fairground: what the shared tables will need (FAIR_REGISTRATION)', () => {
  const MARGIN = 0.3;
  const clearOf = (p, extra = MARGIN) => area.colliders.every((c) => dist(p, c) >= c.r + CAT_RADIUS + extra);
  const ok = (p) => standable(p.x, p.z) && clearOf(p);
  const LISTS = ['carryables', 'knockables', 'markables', 'flaps', 'rests'];
  const anchors = [area.spawn, ...REG.goldMice, ...area.collectibles, ...area.scenics, ...area.pois];
  function approachOf(m) {
    const holding = area.colliders.filter((c) => dist(m, c) < c.r + CAT_RADIUS + MARGIN);
    if (holding.length === 0) return { x: m.x, z: m.z };
    if (holding.length > 1) return null;
    const [c] = holding;
    const d = dist(m, c);
    const out = c.r + CAT_RADIUS + MARGIN + 0.01;
    return { x: c.x + ((m.x - c.x) / d) * out, z: c.z + ((m.z - c.z) / d) * out };
  }
  const points = [...set.carryables, ...set.knockables, ...set.markables, ...set.rests, ...set.hides,
    ...set.flaps, ...set.flaps.flatMap((f) => frameColliders(f))];

  it('costs 75 coins after two Park walks, as the Farm does', () => {
    expect(REG.catalog).toEqual({ name: 'The Fairground', price: 75, requires: { area: 'park', walks: 2 } });
  });

  it('has three golden mice: two on perches every cat can climb to, one hidden on the ground', () => {
    expect(REG.goldMice.map((m) => m.id)).toEqual(['gm-fair-1', 'gm-fair-2', 'gm-fair-3']);
    for (const m of REG.goldMice) expect(m.id).toMatch(/^gm-[a-z]+-\d+$/);
    // no id already taken
    const taken = new Set(Object.entries(GOLD_MICE).filter(([k]) => k !== 'fair').flatMap(([, v]) => v.map((m) => m.id)));
    for (const m of REG.goldMice) expect(taken.has(m.id)).toBe(false);
    const up = REG.goldMice.filter((m) => m.y > 0);
    const ground = REG.goldMice.filter((m) => m.y === 0);
    expect(up).toHaveLength(2);
    expect(ground).toHaveLength(1);
    for (const m of up) {
      const perch = area.perches.find((p) => !p.requires && p.x === m.x && p.z === m.z && p.y === m.y);
      expect(perch, `${m.id} is not on a perch`).toBeTruthy();
    }
    expect(up[0].y).toBe(HELTER.towerH);
    expect(up[1].y).toBe(STALL.roofY);
    // findable by walking: checkFind's window is 1.0 across
    expect(reached(ground[0].x, ground[0].z, 0.95), ground[0].id).toBe(true);
    expect(standable(ground[0].x, ground[0].z)).toBe(true);
  });

  it('has the street areas’ prop counts', () => {
    expect(Object.keys(set).sort()).toEqual(['carryables', 'dogYard', 'flaps', 'hides', 'keepSlots', 'knockables', 'markables', 'rests']);
    expect(set.carryables).toHaveLength(4);
    expect(set.knockables).toHaveLength(3);
    expect(set.markables).toHaveLength(3);
    expect(set.flaps.map((f) => f.kind).sort()).toEqual(['flap', 'gap']);
    expect(set.rests.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
    expect(set.rests.every((r) => r.mesh === true)).toBe(true);
    expect(set.hides).toEqual(FAIR_HIDES.map((h) => ({ x: h.x, z: h.z })));
    expect(set.hides).toHaveLength(3);
    expect(set.keepSlots).toEqual([]);
    for (const c of set.carryables) expect(CARRY_KINDS).toContain(c.kind);
    for (const k of set.knockables) expect(KNOCK_KINDS).toContain(k.kind);
    for (const m of set.markables) expect(['post', 'tree', 'bollard']).toContain(m.kind);
    // each rest names a look rests.js already draws
    const looks = new Set(Object.values(REST_LOOKS).map((v) => v.look));
    expect(Object.keys(REG.restLooks).sort()).toEqual(set.rests.map((r) => r.id).sort());
    for (const v of Object.values(REG.restLooks)) expect(looks.has(v.look), v.look).toBe(true);
  });

  it('has no dog yard and no rival border: nothing at the Fairground chases the cat', () => {
    expect(set.dogYard).toBeNull();
    expect(set.markables.every((m) => m.nearBorder === false)).toBe(true);
    expect(area.critterSpawns.some((c) => c.type === 'dog')).toBe(false);
    expect(REG.colony).toBe(false);
    expect(REG.legendary).toBe(false);
  });

  it('gives every prop a well-formed id of its own, none already in use', () => {
    const taken = allPropIds();
    const mine = new Set();
    for (const list of LISTS) {
      const byKind = {};
      for (const p of set[list]) {
        expect(isPropId(p.id), p.id).toBe(true);
        expect(p.id.startsWith('fair-'), p.id).toBe(true);
        const [, kind, n] = p.id.split('-');
        expect(kind, p.id).toBe(p.kind);
        (byKind[kind] ??= []).push(Number(n));
        expect(mine.has(p.id), p.id).toBe(false);
        mine.add(p.id);
      }
      for (const ns of Object.values(byKind)) expect([...ns].sort((x, y) => x - y)).toEqual(ns.map((_, i) => i + 1));
    }
    // (once the rows are copied into propsets.js these are the same ids; until then none may clash)
    const fairTaken = [...taken].filter((id) => id.startsWith('fair-'));
    if (fairTaken.length) expect(new Set(fairTaken)).toEqual(mine);
    expect(mine.size).toBe(15);
  });

  it('stands every walk-up prop on open ground, apart from the others', () => {
    const walkUps = [
      ...set.carryables.map((p) => ({ what: p.id, p })),
      ...set.rests.map((p) => ({ what: p.id, p })),
      ...set.hides.map((p, i) => ({ what: `hide ${i}`, p })),
      ...set.markables.map((m) => ({ what: m.id, p: approachOf(m), m })),
    ];
    for (const { what, p, m } of walkUps) {
      expect(p, `${what} has no side to stand on`).not.toBeNull();
      expect(ok(p), `${what} at ${p.x},${p.z}`).toBe(true);
      expect(reached(p.x, p.z, 0.6), `${what} from the gate`).toBe(true);
      if (m) expect(dist(p, m), `${what} approach`).toBeLessThanOrEqual(1.2);
    }
    const prompts = walkUps.filter((w) => !w.what.startsWith('hide'));
    for (let i = 0; i < prompts.length; i++) {
      for (let j = i + 1; j < prompts.length; j++) {
        expect(dist(prompts[i].p, prompts[j].p), `${prompts[i].what} vs ${prompts[j].what}`).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it('crowds no spawn, golden mouse, collectible, scenic or POI', () => {
    for (const p of points) {
      for (const q of anchors) {
        expect(dist(p, q), `${p.id ?? 'prop'} at ${p.x},${p.z} vs ${q.id ?? 'anchor'} at ${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('has something real to scratch at every markable', () => {
    const solid = allMeshes.filter((o) => o.geometry?.type !== 'PlaneGeometry');
    for (const m of set.markables) {
      expect(m.mesh).toBe(false);
      let found = false;
      for (const [dx, dz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) {
        rc.set(new THREE.Vector3(m.x + dx, 6, m.z + dz), new THREE.Vector3(0, -1, 0));
        rc.far = 5.6;
        if (rc.intersectObjects(solid, false).length) found = true;
      }
      expect(found, m.id).toBe(true);
    }
  });

  it('puts each knockable on a picnic table and lands it on the grass', () => {
    for (const k of set.knockables) {
      const perch = area.perches.find((p) => !p.requires && dist(p, k) >= 0.35 && dist(p, k) <= 0.6 && Math.abs(p.y - k.y) < 0.1);
      expect(perch, `${k.id} has no perch under it`).toBeDefined();
      expect(perch.y).toBe(PICNIC.topY);
      expect(isWalkableAt(area, k.fallTo.x, k.fallTo.z), k.id).toBe(true);
      const drop = dist(k, k.fallTo);
      expect(drop).toBeGreaterThanOrEqual(0.6);
      expect(drop).toBeLessThanOrEqual(1.6);
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(dist(set.knockables[i].fallTo, set.knockables[j].fallTo)).toBeGreaterThanOrEqual(0.5);
    // the real meshes, raycast like test/propsets.test.js does
    const footprint = (group) => {
      group.updateMatrixWorld(true);
      const toLocal = group.matrixWorld.clone().invert();
      const bb = new THREE.Box3();
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        bb.union(o.geometry.boundingBox.clone().applyMatrix4(toLocal.clone().multiply(o.matrixWorld)));
      });
      const pts = [];
      for (const fx of [0.1, 0.5, 0.9]) for (const fz of [0.1, 0.5, 0.9]) {
        const p = new THREE.Vector3(bb.min.x + (bb.max.x - bb.min.x) * fx, (bb.min.y + bb.max.y) / 2, bb.min.z + (bb.max.z - bb.min.z) * fz)
          .applyMatrix4(group.matrixWorld);
        pts.push([p.x, p.z]);
      }
      return pts;
    };
    const ks = createKnockables(new THREE.Scene(), set.knockables);
    for (const e of ks.list) {
      const k = set.knockables.find((s) => s.id === e.id);
      for (const [x, z] of footprint(e.group)) expect(topAt(x, z, k.y + 0.5), `${k.id} standing`).toBeCloseTo(k.y, 2);
      ks.knock(e);
      ks.update(5);
      for (const [x, z] of footprint(e.group)) expect(topAt(x, z, 3), `${k.id} landed`).toBeCloseTo(k.fallTo.y ?? 0, 2);
    }
    ks.dispose();
  });

  it('leaves each flap’s opening clear and its frame clear of everything built', () => {
    const others = [...set.carryables, ...set.rests, ...set.markables, ...set.knockables.map((k) => k.fallTo), ...set.hides];
    for (const f of set.flaps) {
      const frame = frameColliders(f);
      expect(frame.length).toBeGreaterThan(0);
      const withFrame = { ...area, colliders: [...area.colliders, ...frame] };
      const nx = Math.sin(f.rotY);
      const nz = Math.cos(f.rotY);
      for (const side of [-1, 0, 1]) expect(isWalkableAt(withFrame, f.x + nx * side, f.z + nz * side), `${f.id} side ${side}`).toBe(true);
      for (const c of frame) {
        for (const o of area.colliders) expect(dist(c, o), `${f.id} frame at ${o.x},${o.z}`).toBeGreaterThanOrEqual(c.r + o.r);
        expect(waterClearance(area.waters, c.x, c.z)).toBeGreaterThan(0.5);
      }
      const ax = Math.cos(f.rotY);
      const az = -Math.sin(f.rotY);
      const reach = f.width / 2 + 1.5;
      for (const p of others) {
        const dx = p.x - f.x;
        const dz = p.z - f.z;
        const along = Math.max(-reach, Math.min(reach, dx * ax + dz * az));
        expect(Math.hypot(dx - along * ax, dz - along * az) - 0.3, `${f.id}`).toBeGreaterThanOrEqual(1);
      }
      // each stands across one of the fair's side paths, and the place stays reachable round it
      const trail = fair.FAIR_TRAILS.flatMap((g) => g.segs).some(([x1, z1, x2, z2]) => {
        const t = Math.max(0, Math.min(1, ((f.x - x1) * (x2 - x1) + (f.z - z1) * (z2 - z1)) / ((x2 - x1) ** 2 + (z2 - z1) ** 2)));
        return Math.hypot(f.x - x1 - (x2 - x1) * t, f.z - z1 - (z2 - z1) * t) < 0.5;
      });
      expect(trail, `${f.id} is on a path`).toBe(true);
    }
  });

  it('names sky, paw prints, grass and budget rows the renderer’s tables can take', () => {
    expect(REG.sky).toEqual({ clouds: 10, banks: 4 });
    expect(REG.ambient).toBe('fluff');
    expect(Object.keys(REG.pawprints).sort()).toEqual(['ground', 'path', 'strip']);
    expect(Object.values(AREA_RULES).some((r) => r.path === REG.pawprints.path)).toBe(true);
    expect(typeof fair[REG.grass.bare]).toBe('function');
    expect(typeof fair[REG.grass.groundTint]).toBe('function');
    expect(REG.marks).toBe(true);
    expect(REG.view.split(',').map(Number).every(Number.isFinite)).toBe(true);
  });

  it('grows no grass under the rides, in the booths or in the pool, and plenty everywhere else', () => {
    expect(fairBare(0, 2)).toBe(true);                         // under the merry-go-round
    expect(fairBare(DUCK_POOL.x, DUCK_POOL.z)).toBe(true);
    expect(fairBare(STALLS[0].x, STALLS[0].z)).toBe(true);
    expect(fairBare(STATION_DECK.minX + 1, 0)).toBe(true);
    expect(fairBare(-15, -22)).toBe(false);                    // the open field
    expect(fairBare(-25, 18)).toBe(false);                     // the picnic lawn
    let bare = 0;
    let all = 0;
    for (let x = -43; x <= 43; x += 1) for (let z = -43; z <= 49; z += 1) { all++; if (fairBare(x, z)) bare++; }
    expect(bare / all).toBeLessThan(0.05);
    const t = fairGroundTint(3, 4);
    expect(t).toHaveLength(3);
    for (const v of t) { expect(v).toBeGreaterThan(0.8); expect(v).toBeLessThan(1.2); }
  });
});

// The beauty pass (2026-11-20): what a child sees from the ground.
describe('The Fairground: the beauty pass', () => {
  const v = new THREE.Vector3();
  // the distinct colours of a mesh's vertices that pass `keep` (world positions)
  const coloursWhere = (mesh, keep) => {
    mesh.updateWorldMatrix(true, false);
    const pos = mesh.geometry.getAttribute('position');
    const col = mesh.geometry.getAttribute('color');
    const out = new Set();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (!keep(v)) continue;
      // the hue, not the shade: stripes() lights each panel a little differently
      const top = Math.max(col.getX(i), col.getY(i), col.getZ(i), 1e-6);
      out.add([col.getX(i), col.getY(i), col.getZ(i)].map((c) => (c / top).toFixed(2)).join());
    }
    return out;
  };

  it('the midway and the plaza are sawdust, not a plain trail', () => {
    const trail = scene.children.find((o) => o.name === 'pathTrail');
    expect(trail.userData.trailLook).toBe('sawdust');
  });

  it('the teacups stand on a painted skirt, not a plain white drum', () => {
    const deck = scene.getObjectByName('teacupsDeck');
    const at = scene.getObjectByName('teacups').position;
    // the skirt's lower corners (the deck's top starts at deckY, the kerb is wider)
    const skirt = coloursWhere(deck, (p) => Math.abs(Math.hypot(p.x - at.x, p.z - at.z) - TEACUPS.r) < 0.02
      && Math.abs(p.y - 0.12) < 0.005);
    expect(skirt.size).toBe(2); // pink and cream
  });

  it('the coaster platform’s skirt is panelled in two colours', () => {
    const station = scene.getObjectByName('coasterStation');
    // the skirt's west face, along its foot, away from the steps up to it
    const cz = (STATION_DECK.minZ + STATION_DECK.maxZ) / 2;
    const west = coloursWhere(station, (p) => Math.abs(p.x - STATION_DECK.minX) < 0.01 && Math.abs(p.y) < 0.005
      && p.z > STATION_DECK.minZ + 0.01 && p.z < STATION_DECK.maxZ - 0.01 && Math.abs(p.z - cz) > STATION.stepW / 2 + 0.05);
    expect(west.size).toBe(2); // blue and cream
  });

  it('the carousel’s mirrors and painted ovals are on the bulbs’ material, as steady panes', () => {
    const bulbs = scene.getObjectByName('mgrBulbs');
    expect(bulbs.material).toBe(area.glow.material);
    const r = bulbs.geometry.getAttribute('fairBulbR');
    let panes = 0;
    for (let i = 0; i < r.count; i++) if (r.getX(i) === 0) panes++;
    // 12 mirrors on the drum and 16 ovals on the rounding board, octagons of 6 triangles
    expect(panes).toBe((12 + 16) * 6 * 3);
  });

  it('the far hills differ by side: more yellow to the east than behind the big wheel', () => {
    const band = scene.children.find((o) => o.name === 'horizonBand');
    const mean = (keep) => {
      const pos = band.geometry.getAttribute('position');
      const col = band.geometry.getAttribute('color');
      let n = 0, rg = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        if (keep(x, z) && pos.getY(i) > 2) { n++; rg += col.getX(i) / Math.max(1e-6, col.getZ(i)); }
      }
      return rg / n;
    };
    const east = mean((x, z) => x > 70 && Math.abs(z) < 30);
    const north = mean((x, z) => z < -70 && Math.abs(x) < 30);
    expect(east).toBeGreaterThan(north * 1.3);
  });
});

// Beauty round two (2026-11-20): bolder, and mostly for dusk.
describe('The Fairground: the beauty pass, round two', () => {
  const paneVerts = (mesh) => {
    const r = mesh.geometry.getAttribute('fairBulbR');
    const pos = mesh.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    mesh.updateWorldMatrix(true, false);
    const out = [];
    for (let i = 0; i < r.count; i++) if (r.getX(i) === 0) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
    return out;
  };

  it('the coaster’s whole run is outlined in bulbs that chase round it, on the shared glow, casting nothing', () => {
    const lights = scene.getObjectByName('coasterLights');
    expect(lights.material).toBe(area.glow.material);
    expect(lights.castShadow).toBe(false);
    const chase = lights.geometry.getAttribute('fairChase');
    // every one a chasing bulb (eight triangles each), none a steady pane
    const pos0 = lights.geometry.getAttribute('position');
    expect(pos0.count % 24).toBe(0);
    // each beside the track, at a sleeper's end (gauge + 0.16 out), below the rail top
    const pts = COASTER_TRACK.points;
    for (let b = 0; b < pos0.count / 24; b++) {
      let x = 0, y = 0, z = 0;
      for (let k = 0; k < 24; k++) { x += pos0.getX(b * 24 + k) / 24; y += pos0.getY(b * 24 + k) / 24; z += pos0.getZ(b * 24 + k) / 24; }
      const near = pts.reduce((m, p) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(m.x - x, m.z - z) ? p : m), pts[0]);
      expect(Math.hypot(near.x - x, near.z - z)).toBeCloseTo(COASTER.gauge + 0.16, 1);
      expect(y).toBeLessThan(near.y);
    }
    for (let i = 0; i < chase.count; i++) expect(chase.getX(i)).toBeGreaterThanOrEqual(0);
    // spread along the whole track, both sides
    const pos = lights.geometry.getAttribute('position');
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) { minZ = Math.min(minZ, pos.getZ(i)); maxZ = Math.max(maxZ, pos.getZ(i)); }
    expect(minZ).toBeLessThan(-35);
    expect(maxZ).toBeGreaterThan(25);
  });

  it('every stall’s inside back is on the glow (lit at dusk), and the stalls’ glow takes the sun’s shadow by day', () => {
    const bulbs = scene.getObjectByName('fairBulbs');
    expect(bulbs.receiveShadow).toBe(true);
    const panes = paneVerts(bulbs);
    for (const s of STALLS) {
      const inside = panes.filter((p) => {
        const dx = p.x - s.x, dz = p.z - s.z;
        const lz = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
        const lx = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
        return Math.abs(lz - (-STALL.d / 2 + 0.1)) < 0.03 && Math.abs(lx) < STALL.w / 2 && p.y > 0.05 && p.y < 2.0;
      });
      // the dado and the board over it
      expect(inside.some((p) => p.y < 1.0), s.id).toBe(true);
      expect(inside.some((p) => p.y > 1.5), s.id).toBe(true);
    }
  });

  it('every stall’s inside is a shaded version of its own paint, never pale: warm at dusk, never white', () => {
    const bulbs = scene.getObjectByName('fairBulbs');
    const r = bulbs.geometry.getAttribute('fairBulbR');
    const pos = bulbs.geometry.getAttribute('position');
    const col = bulbs.geometry.getAttribute('color');
    const v = new THREE.Vector3();
    bulbs.updateWorldMatrix(true, false);
    const unit = (c) => { const n = Math.hypot(c[0], c[1], c[2]) || 1; return c.map((x) => x / n); };
    for (const s of STALLS) {
      const own = new THREE.Color(s.colors[0]);
      const ownU = unit([own.r, own.g, own.b]);
      const inside = [];
      for (let i = 0; i < r.count; i++) {
        if (r.getX(i) !== 0) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(bulbs.matrixWorld);
        const dx = v.x - s.x, dz = v.z - s.z;
        const lz = dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw);
        const lx = dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw);
        if (Math.abs(lz - (-STALL.d / 2 + 0.1)) < 0.03 && Math.abs(lx) < STALL.w / 2 && v.y > 0.05 && v.y < 2.0) {
          inside.push([col.getX(i), col.getY(i), col.getZ(i)]);
        }
      }
      expect(inside.length, s.id).toBeGreaterThan(0);
      for (const c of inside) {
        const top = Math.max(...c);
        // the stall's own hue (not cream, not grey)
        const u = unit(c);
        expect(u[0] * ownU[0] + u[1] * ownU[1] + u[2] * ownU[2], s.id).toBeGreaterThan(0.95);
        // coloured, not pale: a pale board has its channels close together
        expect((top - Math.min(...c)) / top, s.id).toBeGreaterThan(0.45);
        // shaded, and dim enough that its dusk glow (paint x pane x GLOW_MAX)
        // stays under the bloom's threshold (1.1): warm, never a white box
        expect(top * GLOW_LOOK.pane * GLOW_MAX, s.id).toBeLessThan(0.9);
      }
    }
  });

  it('the field is deeper at dusk than a street’s lawn, and the sawdust keeps a street’s warm dusk', () => {
    expect(duskLook(area).lawnTint.dark).toBeLessThan(duskLook({}).lawnTint.dark);
    const trail = scene.children.find((o) => o.name === 'pathTrail');
    expect({ ...duskLook(area).lawnTint, ...trail.userData.duskLawnTint }).toEqual(duskLook({}).lawnTint);
  });

  it('the ground round the rides is worn well out from them', () => {
    // 3 m out (the old rings ended at 2.8 m)
    expect(fair.fairWear(fair.TEACUPS_AT.x + TEACUPS.baseR + 3, fair.TEACUPS_AT.z)).toBeGreaterThan(0.05);
    expect(fair.fairWear(fair.HELTER_AT.x + HELTER.baseR + 3, fair.HELTER_AT.z)).toBeGreaterThan(0.05);
  });

  it('the empty corners have bales put by, solid to the cat', () => {
    for (const [x, z] of [[38.6, 38.4], [-40.4, 27.5], [25.2, -42.2]]) {
      expect(area.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < 1.2), `${x},${z}`).toBe(true);
    }
  });
});

describe('The Fairground: the drawing budget', () => {
  const built = budgetStats(scene);
  const mergedScene = new THREE.Scene();
  build(mergedScene);
  mergeStaticProps(mergedScene);
  const merged = budgetStats(mergedScene);

  it('pins what the fair is made of: MEASURED_BUILT / MEASURED_MERGED', () => {
    // Measured 2026-11-18. The rides are the densest things in the game, and
    // their moving parts cannot be merged: 12 horses, 8 gondolas, 6 cups and
    // 4 coaster cars are a mesh each, as are the 6 tins and 7 ducks.
    // Step 3: the stalls' words are one more mesh (28 triangles), their boards
    // and the three sign posts 312 more triangles in the props' mesh.
    // Polish pass (2026-11-19): carved horses, stall trims, glow and a cull of
    // the faces lying on the ground; the four builder flower patches (48
    // meshes, 48 casters) became flower tubs in the props' mesh.
    // Beauty pass (2026-11-20): the teacups' painted skirt, gold edge and
    // finer kerb stripes and its top, the coaster platform’s panelled skirt: +312.
    // Round two: the coaster's lights (one mesh, no shadow), the big wheel's
    // sunbursts, red post caps, the stalls' lit insides, three bale stacks: +1,728.
    // Gateways placement round (2026-11-21): the front fence is cut where the
    // gate back to the Park is set into it, two more striped end posts: +24;
    // and the hedge runs on where its field gate stood (the hedge's pieces
    // there cost less than the gate did): -160.
    expect(built).toEqual({ meshes: 175, casters: 109, triangles: 68596 });
    expect({ meshes: merged.meshes, casters: merged.casters }).toEqual({ meshes: 160, casters: 104 });
  });

  it('is inside the territories’ budget built, and inside their merged budget', () => {
    expect(built.meshes).toBeLessThanOrEqual(450);
    expect(built.casters).toBeLessThanOrEqual(380);
    expect(built.triangles).toBeLessThanOrEqual(70000);
    expect(merged.meshes).toBeLessThanOrEqual(260);
    expect(merged.casters).toBeLessThanOrEqual(205);
    // and the ceilings proposed for test/budget.test.js hold, with the usual headroom
    const [m, c, t] = REG.budget.built;
    const [mm, mc] = REG.budget.merged;
    expect(built.meshes).toBeLessThanOrEqual(m);
    expect(built.casters).toBeLessThanOrEqual(c);
    expect(built.triangles).toBeLessThanOrEqual(t);
    expect(merged.meshes).toBeLessThanOrEqual(mm);
    expect(merged.casters).toBeLessThanOrEqual(mc);
    expect(m).toBeLessThanOrEqual(450);
    expect(c).toBeLessThanOrEqual(380);
    expect(t).toBeLessThanOrEqual(70000);
  });

  it('builds the same fair every time, drawing on Math.random only as the shared builders do', () => {
    const real = Math.random;
    let draws = 0;
    Math.random = () => { draws++; return real(); };
    let again;
    let b2;
    let first;
    try {
      again = new THREE.Scene();
      b2 = build(again);
      first = draws;
      draws = 0;
      build(new THREE.Scene());
    } finally {
      Math.random = real;
    }
    expect(draws).toBe(first); // the same number of draws each build
    expect(budgetStats(again)).toEqual(built);
    expect(b2.colliders).toEqual(area.colliders);
    expect(b2.perches).toEqual(area.perches);
    expect(b2.anchors).toEqual(area.anchors);
    // the fair's own models are named from a local stream: the same uuids and the same vertices
    for (const name of ['fairProps', 'fairBulbs', 'fairBunting', 'coasterRails', 'mgrDeck', 'ferrisRim']) {
      const p = scene.getObjectByName(name);
      const q = again.getObjectByName(name);
      expect(q.uuid, name).toBe(p.uuid);
      expect(q.geometry.attributes.position.count).toBe(p.geometry.attributes.position.count);
      expect(Array.from(q.geometry.attributes.position.array.slice(0, 300))).toEqual(Array.from(p.geometry.attributes.position.array.slice(0, 300)));
    }
    // and none of the fair's own files calls Math.random at all
    for (const f of ['fair.js', 'fairparts.js', 'fairrides.js', 'fairkit.js']) {
      const src = readFileSync(new URL('../src/world/' + f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src.includes('Math.random'), f).toBe(false);
    }
  });

  it('merges cleanly for the renderer, and keeps what must fade or move', () => {
    expect(merged.meshes).toBeLessThan(built.meshes);
    expect(merged.triangles).toBe(built.triangles);
    for (const name of ['fairGate', 'fortuneTent', 'bandstandRoof', 'helterSkelter', 'merryGoRound', 'ferrisWheel', 'teacups', 'coasterTrain']) {
      expect(mergedScene.getObjectByName(name), name).toBeTruthy();
    }
  });

  it('draws the small things all over the fair as a handful of meshes', () => {
    for (const name of ['fairProps', 'fairCanvas', 'fairBunting', 'fairBulbs', 'fairBalloons', 'fairFence', 'coasterRails', 'coasterSupports']) {
      const o = scene.getObjectByName(name);
      expect(o.isMesh, name).toBe(true);
      expect(o.parent).toBe(scene);
    }
    // the rides' moving parts are one mesh each
    const meshesIn = (o) => { let n = 0; o.traverse((m) => { if (m.isMesh) n++; }); return n; };
    expect(meshesIn(scene.getObjectByName('merryGoRound'))).toBe(1 + 3 + 12); // plinth; deck, canopy, bulbs; horses
    expect(meshesIn(scene.getObjectByName('ferrisWheel'))).toBe(1 + 2 + 8);   // frame; rim, bulbs; gondolas
    expect(meshesIn(scene.getObjectByName('teacups'))).toBe(1 + 2 + 6);       // kerb; floor, bulbs; cups
    expect(meshesIn(scene.getObjectByName('coasterTrain'))).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Step 2, Part A: the Fairground is in every table a street area is in, and
// each table holds exactly FAIR_REGISTRATION's row.
// ---------------------------------------------------------------------------
describe('The Fairground: registered everywhere a street area is', async () => {
  const { GOLD_TOTAL, goldForEdition } = await import('../src/goldmice.js');
  const { propsFor } = await import('../src/propsets.js');
  const { MARK_AREAS, emptyMarks } = await import('../src/marks.js');
  const { CLOUD_AREAS, AREA_SKY } = await import('../src/render/clouds.js');
  const { ambientKind } = await import('../src/render/ambient.js');
  const { GRASS_STYLES, grassStyle, tuftAt } = await import('../src/render/grass.js');
  const { COLONY_AREAS, feedsHere } = await import('../src/colony.js');
  const { LEGENDARY_BY_AREA } = await import('../src/legendary.js');
  const { DRESSED_AREAS } = await import('../src/render/waterdress.js');
  const { nextThing } = await import('../src/ui/nextthing.js');
  const plain = (v) => JSON.parse(JSON.stringify(v));
  function fakeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
  }

  it('is in the catalog as its row says: 75 coins after two Park walks, in both editions', () => {
    expect(CATALOG.areas.fair).toEqual(plain(REG.catalog));
    expect(Object.hasOwn(CATALOG.areas.fair, 'edition')).toBe(false);
    expect(areaInEdition(CATALOG.areas.fair, 'canon')).toBe(true);
    expect(areaInEdition(CATALOG.areas.fair, 'legacy')).toBe(true);
    expect(area.name).toBe(CATALOG.areas.fair.name);
  });

  it('is the fourth place, after the Farm and before the Seaside', () => {
    const ids = Object.keys(CATALOG.areas);
    expect(ids.slice(0, 5)).toEqual(['neighborhood', 'park', 'farm', 'fair', 'seaside']);
    // and nothing else about the others moved
    expect(CATALOG.areas.farm).toEqual({ name: 'Appletree Farm', price: 75, requires: { area: 'park', walks: 2 } });
    expect(CATALOG.areas.seaside).toEqual({ name: 'Seaside', price: 200, requires: { area: 'docks', walks: 2 } });
    expect(CATALOG.areas.docks.requires).toEqual({ area: 'park', walks: 2 });
  });

  it('cannot be bought on coins alone, or on walks alone', () => {
    const p = createProgression(fakeStorage());
    p.addPoints(9999);
    expect(p.canBuy('areas', 'fair')).toBe(false);
    p.completeWalk('park');
    expect(p.canBuy('areas', 'fair')).toBe(false);
    p.completeWalk('park');
    expect(p.canBuy('areas', 'fair')).toBe(true);
    const q = createProgression(fakeStorage());
    q.completeWalk('park');
    q.completeWalk('park');
    q.addPoints(74 - q.state.points);
    expect(q.canBuy('areas', 'fair')).toBe(false);
    q.addPoints(1);
    expect(q.buy('areas', 'fair')).toBe(true);
    expect(q.isUnlocked('areas', 'fair')).toBe(true);
  });

  it('can be chosen as the place to walk, in both editions, and that is saved', () => {
    for (const edition of ['canon', 'legacy']) {
      const storage = fakeStorage();
      const p = createProgression(storage);
      p.setEdition(edition);
      p.addPoints(500);
      p.completeWalk('park');
      p.completeWalk('park');
      expect(p.buy('areas', 'fair'), edition).toBe(true);
      p.setArea('fair');
      expect(p.state.area).toBe('fair');
      expect(createProgression(storage).state.area).toBe('fair');
    }
  });

  it('loads a save from before the Fairground with fair: 0, nothing lost and no gate closed', () => {
    const storage = fakeStorage({
      'whisker-walk-save': JSON.stringify({
        version: 4, points: 120,
        walks: { neighborhood: 5, park: 3, seaside: 2, den: 1, docks: 1, farm: 2 },
        unlocked: { cats: ['tabby'], accessories: ['bell'], areas: ['neighborhood', 'park', 'farm', 'seaside', 'docks'] },
        area: 'farm',
        marks: { park: [] },
      }),
    });
    const p = createProgression(storage);
    expect(p.state.walks.fair).toBe(0);
    expect(p.state.walks).toMatchObject({ neighborhood: 5, park: 3, seaside: 2, den: 1, docks: 1, farm: 2 });
    for (const id of ['neighborhood', 'park', 'farm', 'seaside', 'docks']) expect(p.isUnlocked('areas', id), id).toBe(true);
    expect(p.state.area).toBe('farm');
    expect(p.isUnlocked('areas', 'fair')).toBe(false);
    expect(p.canBuy('areas', 'fair')).toBe(true); // already past the Park: ready to buy
    p.completeWalk('fair');
    expect(p.state.walks.fair).toBe(1);
    expect(MARK_AREAS).toContain('fair');
    expect(emptyMarks().fair).toEqual([]);
    expect(p.state.marks.fair).toEqual([]);
  });

  it('holds the golden mice, the prop set and the rest looks exactly as its rows say', () => {
    expect(GOLD_MICE.fair).toEqual(plain(REG.goldMice));
    expect(GOLD_TOTAL).toBe(36);
    expect(goldForEdition('canon', CATALOG).size).toBe(36);
    expect(goldForEdition('legacy', CATALOG).size).toBe(18);
    const live = propsFor('fair');
    for (const k of ['carryables', 'knockables', 'markables', 'flaps', 'rests', 'hides', 'keepSlots']) expect(plain(live[k]), k).toEqual(plain(set[k]));
    expect(live.dogYard).toBeNull();
    for (const [id, look] of Object.entries(REG.restLooks)) expect(REST_LOOKS[id], id).toEqual(plain(look));
  });

  it('has the Park’s sky, drifting seed down, paw prints on its trodden paths and the Park’s lawn', () => {
    expect(CLOUD_AREAS).toContain('fair');
    expect(AREA_SKY.fair).toEqual(plain(REG.sky));
    expect(ambientKind('fair')).toBe(REG.ambient);
    expect(ambientKind('fair', { dusk: true })).toBe(REG.ambient);
    expect(AREA_RULES.fair).toEqual(plain(REG.pawprints));
    expect(fair.GRASS_HOOKS.tint).toBe(fair[REG.grass.groundTint]);
    expect(fair.GRASS_HOOKS.bare).toBe(fair[REG.grass.bare]);
    expect(GRASS_STYLES.fair.bare).toBeNull();
    // the Park's lawn in every other number
    const { bare, ...rest } = grassStyle('fair', fair.GRASS_HOOKS);
    expect(rest).toEqual({ ...GRASS_STYLES.park });
  });

  it('grows the Park’s lawn tuft for tuft, and none where the fair is bare', () => {
    let grown = 0;
    let onBare = 0;
    const s = 0.3;
    for (let i = -150; i < 150; i++) {
      for (let j = -150; j < 150; j++) {
        const t = tuftAt(i, j, s, grassStyle('fair', fair.GRASS_HOOKS));
        const lawn = tuftAt(i, j, s, GRASS_STYLES.park);
        if (!t) { if (lawn) expect(fairBare(lawn.x, lawn.z)).toBe(true); continue; }
        expect(t).toEqual(lawn);
        grown++;
        if (fairBare(t.x, t.z)) onBare++;
      }
    }
    expect(onBare).toBe(0);
    expect(grown).toBeGreaterThan(3000);
  });

  it('has no colony feeding, no legendary cat, no dog and no dressed bank round its tub of a pool', () => {
    expect(COLONY_AREAS).not.toContain('fair');
    expect(feedsHere('fair')).toBe(false);
    expect(Object.hasOwn(LEGENDARY_BY_AREA, 'fair')).toBe(false);
    expect(propsFor('fair').dogYard).toBeNull();
    expect(DRESSED_AREAS).not.toContain('fair');
  });

  it('is named with the Farm and the Docks on the Park’s home line, in words a nine-year-old can read', () => {
    const state = createProgression(fakeStorage()).state;
    const s = { ...state, walks: { ...state.walks, neighborhood: 3, park: 1 }, unlocked: { ...state.unlocked, areas: ['neighborhood', 'park'] }, area: 'park', edition: 'legacy' };
    const line = nextThing(s);
    expect(line).toMatchObject({ rule: 7, id: 'home.opens-three' });
    expect(line.text).toBe('Explore here again to open Appletree Farm, the Fairground and the Old Docks!');
  });

  it('has a card picture for the home screen', () => {
    const jpg = readFileSync(new URL('../public/places/fair.jpg', import.meta.url));
    expect(jpg[0]).toBe(0xff);
    expect(jpg[1]).toBe(0xd8);
    expect(jpg.length).toBeGreaterThan(5000);
  });
});
