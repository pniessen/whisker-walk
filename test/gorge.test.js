import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The same headless canvas stub every world test uses (see test/park.test.js
// for why getImageData and the gradients need real answers).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const gorge = await import('../src/world/gorge.js');
const { build: buildPines } = await import('../src/world/pines.js');
const { shallowExcess, rooftopSpots, ROOFTOP_SALT, inWater, waterGap } = await import('../src/world/builder.js');
const { surfaceProps } = await import('../src/render/materials.js');
const {
  CLIFFTOP, SHOULDER, WEST_TOP, STAND_ON, GORGE_CAVES, GORGE_DENS, WIDE_LEDGE_RECT, CAMP_DEN_RESERVE, mapShapes,
} = await import('../src/world/gorgeshape.js');
const { segDist } = await import('../src/segdist.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { propsFor } = await import('../src/propsets.js');
const { canReach } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { createGoals, GOAL_POOL } = await import('../src/goals.js');
const { mulberry32 } = await import('../src/rng.js');
const { OUTSIDE_WORDS, RANK_WORDS, PLACE_WORDS, CLAN_SUFFIX } = await import('../src/clanwords.js');
const { cameraOffset } = await import('../src/catcam.js');
const { ZOOM_STEPS } = await import('../src/camzoom.js');
const { PITCH_MAX } = await import('../src/player.js');
const { GORGE_SPAWN, GORGE_BOUNDS, floodGorge } = await import('./helpers/gorgeflood.js');

const {
  build, SPAWN, GORGE_WATERS, GORGE_PATHS, GORGE_HORIZON, GORGE_KEEP_CLEAR, GORGE_KEEP_CLEAR_RECTS, GORGE_HIDES,
  gorgeTrees, gorgeTors, gorgeScree,
} = gorge;

const built = () => {
  const scene = new THREE.Scene();
  const area = build(scene);
  return { scene, area };
};
const { scene, area } = built();
scene.updateMatrixWorld(true);
const STREAM = GORGE_WATERS[0];

// Distance from (x, z) to an axis-aligned rectangle (0 inside it).
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));

// Points every `step` metres along a segment, both ends included.
function along([x1, z1, x2, z2], step) {
  const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / step));
  return Array.from({ length: n + 1 }, (_, k) => [x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]);
}

describe('the Gorge: the stream', () => {
  it('declares one wadeable stream with one dry crossing', () => {
    expect(area.waters).toBe(GORGE_WATERS);
    expect(GORGE_WATERS).toHaveLength(1);
    expect(STREAM).toMatchObject({ id: 'stream', kind: 'rect', minX: -9.5, maxX: -8, minZ: -62, maxZ: 62, shallow: 0.75 });
    expect(STREAM.decks).toHaveLength(1);
    // never deep: at 20 z values, every 0.1 m across the stream is in its band
    for (let k = 0; k < 20; k++) {
      const z = -47.5 + k * 5;
      for (let x = STREAM.minX; x <= STREAM.maxX + 1e-9; x += 0.1) {
        expect(shallowExcess(GORGE_WATERS, x, z), `(${x.toFixed(2)}, ${z})`).toBeLessThanOrEqual(0);
      }
    }
  });

  it('the stepping stones cover their whole deck, with no open water anywhere on it', () => {
    const deck = STREAM.decks[0];
    const stones = scene.getObjectByName('steppingStones');
    expect(stones).toBeTruthy();
    const waterY = scene.getObjectByName('water:stream').position.y;
    const ray = new THREE.Raycaster();
    // the stones run along x here: every 5 cm across the stream, and across
    // the deck's full width (z), edges included
    const wet = [];
    for (let x = STREAM.minX; x <= STREAM.maxX + 1e-9; x += 0.05) {
      for (let k = 0; k <= 8; k++) {
        const z = deck.minZ + (deck.maxZ - deck.minZ) * (k / 8);
        ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObject(stones, false)[0];
        if (!hit || hit.point.y <= waterY) wet.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    expect(wet.slice(0, 8)).toEqual([]);
    expect(deck.maxZ - deck.minZ).toBeGreaterThanOrEqual(1.5);
    expect(deck.minX).toBeLessThan(STREAM.minX);
    expect(deck.maxX).toBeGreaterThan(STREAM.maxX);
  });

  it('water lies only on base ground', () => {
    const { minX, maxX, minZ, maxZ } = area.bounds;
    const raised = [];
    for (let x = Math.max(STREAM.minX, minX); x <= Math.min(STREAM.maxX, maxX) + 1e-9; x += 0.25) {
      for (let z = Math.max(STREAM.minZ, minZ); z <= Math.min(STREAM.maxZ, maxZ) + 1e-9; z += 0.25) {
        if (area.ground.y(x, z) !== 0) raised.push(`(${x}, ${z})`);
      }
    }
    expect(raised.slice(0, 8)).toEqual([]);
  });
});

describe('the Gorge: the paths', () => {
  it('the floor paths are on the floor', () => {
    const off = [];
    const nearWater = [];
    for (const seg of GORGE_PATHS) {
      for (const [x, z] of along(seg, 0.02)) {
        if (area.ground.y(x, z) !== 0) off.push(`(${x.toFixed(2)}, ${z.toFixed(2)}) on ${seg}`);
        // 2 m of centreline from the stream everywhere; the two ends at the
        // stones are exactly 2 m off its banks
        if (rectDist(STREAM, x, z) < 2 - 1e-9) nearWater.push(`(${x.toFixed(2)}, ${z.toFixed(2)})`);
      }
    }
    expect(off.slice(0, 8)).toEqual([]);
    expect(nearWater.slice(0, 8)).toEqual([]);
    // the two ends at the stones face each other across the deck
    const deck = STREAM.decks[0];
    expect(GORGE_PATHS[0][2]).toBe(STREAM.minX - 2);
    expect(GORGE_PATHS[1][0]).toBe(STREAM.maxX + 2);
    for (const [x, z] of [[GORGE_PATHS[0][2], GORGE_PATHS[0][3]], [GORGE_PATHS[1][0], GORGE_PATHS[1][1]]]) {
      expect(z).toBeGreaterThanOrEqual(deck.minZ);
      expect(z).toBeLessThanOrEqual(deck.maxZ);
      expect(rectDist(deck, x, z)).toBeLessThanOrEqual(1);
    }
  });

  it('the Narrows path starts at the Moor border', () => {
    expect(GORGE_PATHS[0].slice(0, 2)).toEqual([-50, -11]);
    expect(GORGE_PATHS[0][0]).toBe(area.bounds.minX);
  });

  it('draws every path, in sand', () => {
    const paths = scene.children.filter((o) => o.name === 'path');
    expect(paths).toHaveLength(GORGE_PATHS.length);
    const sand = surfaceProps('sand');
    for (const p of paths) {
      expect(p.material.color.getHex()).toBe(0x8a7a64);
      expect(p.material.roughness).toBe(sand.roughness);
      expect(p.material.map).toBeTruthy();
    }
  });
});

describe('the Gorge: the rock and the view', () => {
  it('draws the rock from the ground record, named gorgeRock', () => {
    const rock = scene.getObjectByName('gorgeRock');
    expect(rock).toBeTruthy();
    expect(scene.children).toContain(rock);
    for (const n of ['rockFaces', 'ledgeTops', 'lips']) expect(rock.getObjectByName(n), n).toBeTruthy();
    expect(scene.getObjectByName('groundPlane')).toBeTruthy();
  });

  // Review Focus 3. The highest camera there is: on top of the Summit Rock
  // (the clifftop plus the pillar's 1.9 m), at zoom step 3, pitched as far up
  // as the player allows.
  const SUMMIT_ROCK_TOP = CLIFFTOP + 1.9;
  const top = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  const CAM_TOP = SUMMIT_ROCK_TOP + cameraOffset(0, PITCH_MAX, top.dist, top.height).y;

  it('every look down from the highest camera lands on something', () => {
    expect(ZOOM_STEPS).toHaveLength(4);
    expect(CAM_TOP).toBeGreaterThan(27.5);
    expect(CAM_TOP).toBeLessThan(28.5);
    const targets = [
      scene.getObjectByName('rockFaces'),
      scene.getObjectByName('ledgeTops'),
      scene.getObjectByName('groundPlane'),
      scene.getObjectByName('horizonBand'),
    ];
    expect(targets.every(Boolean)).toBe(true);
    const ray = new THREE.Raycaster();
    ray.far = 130;
    const missed = [];
    for (const [cx, cz] of [[4, -24], [25, -24], [30, -38]]) {
      const from = new THREE.Vector3(cx, CAM_TOP, cz);
      for (let a = 0; a < 32; a++) {
        const az = (a / 32) * Math.PI * 2;
        for (let e = 15; e <= 90; e += 5) {
          const el = (e * Math.PI) / 180;
          const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el));
          ray.set(from, dir);
          if (ray.intersectObjects(targets, false).length === 0) {
            missed.push(`from (${cx}, ${cz}) azimuth ${(a * 360) / 32}° down ${e}°`);
          }
        }
      }
    }
    expect(missed.slice(0, 16)).toEqual([]);
  });

  it("the horizon faces the Gorge's neighbours", () => {
    expect(scene.children.filter((o) => o.name === 'horizonBand')).toHaveLength(1);
    // more rock north and east, the town south, the Moor's heather west
    expect(GORGE_HORIZON.sideTints).toEqual({ north: 0x8a8478, east: 0x7d7a74, south: 0x9a7f6e, west: 0x9a8a9c });
    expect(GORGE_HORIZON.rooftops).toBeTruthy();
    // The blocks as drawn: horizonBand merges them after its ring, so every
    // vertex past the ring's is a rooftop's. The ring is horizonBand's
    // default 152 steps around by 13 rings out (outSegs 12), and none of its
    // vertices lie past the band's outer edge, so the split is checked too.
    const band = scene.getObjectByName('horizonBand');
    const pos = band.geometry.attributes.position;
    const RING = 152 * 13;
    expect(pos.count).toBeGreaterThan(RING);
    for (let v = 0; v < RING; v++) {
      expect(Math.max(Math.abs(pos.getX(v)), Math.abs(pos.getZ(v)))).toBeLessThanOrEqual(GORGE_HORIZON.outer + 1e-3);
    }
    const north = [];
    for (let v = RING; v < pos.count; v++) if (pos.getZ(v) <= 50) north.push(`(${pos.getX(v).toFixed(1)}, ${pos.getZ(v).toFixed(1)})`);
    expect(north.slice(0, 8), 'rooftop vertices north of z 50').toEqual([]);
    // and each block's centre, by builder's own rule for where it puts them:
    // up to ten, fewer only where a spot falls on the stream (none do here)
    const { inner, outer, salt } = GORGE_HORIZON;
    const drawn = rooftopSpots(GORGE_HORIZON.rooftops, inner, outer, salt + ROOFTOP_SALT)
      .filter((r) => !inWater(GORGE_HORIZON.avoid, r.x, r.z));
    expect(drawn.length).toBeGreaterThanOrEqual(1);
    expect(drawn.length).toBeLessThanOrEqual(10);
    for (const r of drawn) expect(r.z, `rooftop at (${r.x}, ${r.z})`).toBeGreaterThan(50);
    expect(GORGE_HORIZON.avoid).toContain(STREAM);
    expect(GORGE_HORIZON).toMatchObject({ kind: 'hills', inner: 56, outer: 116, height: 40, wavelength: 40, color: 0x8a8478, salt: 53 });
    expect(Object.isFrozen(GORGE_HORIZON)).toBe(true);
  });
});

describe('the Gorge: the area record', () => {
  it("returns every key pines.js returns, named 'The Gorge'", () => {
    const pines = buildPines(new THREE.Scene());
    expect(Object.keys(area)).toEqual(expect.arrayContaining(Object.keys(pines)));
    expect(area.name).toBe('The Gorge');
    expect(area.spawn).toEqual({ x: SPAWN.x, z: SPAWN.z });
    expect(SPAWN).toEqual({ x: -44, z: -11 });
    expect(area.bounds).toEqual({ minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
    // the shared flood starts where a walk does
    expect(GORGE_SPAWN).toEqual(SPAWN);
    expect(GORGE_BOUNDS).toEqual(area.bounds);
    // and the Gorge's own keys
    expect(area.ground.y(SPAWN.x, SPAWN.z)).toBe(0);
    expect(area.keepOut).toEqual({ rects: [], capsules: [], margin: 0.4, onlyOn: STAND_ON });
    expect(area.raceCourse).toEqual([
      { x: -3, z: 6 }, { x: 3.9, z: 28 }, { x: 5.6, z: -5 }, { x: 10.5, z: 33.5 }, { x: 16, z: -24 },
    ]);
    expect(area.mapShapes).toEqual(mapShapes());
    expect(area.caves).toBe(GORGE_CAVES);
    const life = area.life({});
    expect(typeof life.update).toBe('function');
    expect(typeof life.dispose).toBe('function');
    expect(() => { life.update(0.016); life.dispose(); }).not.toThrow();
  });

  it('is built the same every time', () => {
    const again = built().area;
    const plain = (a) => JSON.parse(JSON.stringify({ ...a, waterFx: undefined, ground: undefined, life: undefined }));
    expect(plain(again)).toEqual(plain(area));
    // the drawn rock too, vertex for vertex
    const scene2 = new THREE.Scene();
    build(scene2);
    for (const n of ['rockFaces', 'ledgeTops', 'lips']) {
      const a = scene.getObjectByName(n).geometry.attributes;
      const b2 = scene2.getObjectByName(n).geometry.attributes;
      expect(Array.from(b2.position.array), n).toEqual(Array.from(a.position.array));
    }
  });

  it('nothing in the Gorge reads the edition', () => {
    for (const f of ['../src/world/gorge.js', '../src/world/gorgeshape.js']) {
      const src = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
      expect(src, f).not.toMatch(/edition/i);
    }
  });

  // Our own words (Global Constraints): no label borrows a book place name or
  // a scanned word.
  it("the Gorge's labels are our own words", () => {
    const labels = [
      area.name,
      ...GORGE_CAVES.map((c) => c.name),
      ...[...area.pois, ...area.scenics, ...area.collectibles, ...area.moments, ...area.perches]
        .map((o) => o.label).filter(Boolean),
    ];
    const BOOK = /gathering|four ?trees|moon|high ?stones|high ?rock|high ?ledge|mother ?mouth|sunning|snake ?rocks|tall ?pines|rock ?pile|sky ?oak|hollow|rushing water/i;
    const SCANNED = /\b(kit|apprentice|warrior|elder|queen|medicine cat|deputy|leader|loner|rogue|kittypet|twolegplace|clan)\b/i;
    for (const l of labels) {
      expect(l).not.toMatch(BOOK);
      expect(l).not.toMatch(SCANNED);
    }
  });
});


// The scan in Global Constraints, and test/clanwords.test.js's borrowedIn
// (every borrowed word, matched as a whole word, case-blind).
const BOOK = /gathering|four ?trees|moon|high ?stones|high ?rock|high ?ledge|mother ?mouth|sunning|snake ?rocks|tall ?pines|rock ?pile|sky ?oak|hollow|rushing water/i;
const SCANNED = /\b(kit|apprentice|warrior|elder|queen|medicine cat|deputy|leader|loner|rogue|kittypet|twolegplace|clan)\b/i;
const BORROWED = [...Object.values(OUTSIDE_WORDS), ...Object.values(RANK_WORDS), ...Object.values(PLACE_WORDS), CLAN_SUFFIX];
const borrowedIn = (text) => BORROWED.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));

const inRect = (r, x, z) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

describe('the Gorge: things to find, climb and nap in', () => {
  const POIS = [[-34, -11], [-13, -30], [-3, -2], [-14, 14], [0, 24], [-13, 42], [-3, -44], [14, -30], [29, -30]];
  const perchAt = (x, z) => area.perches.find((p) => p.x === x && p.z === z && !p.requires);
  const collider = (x, z) => area.colliders.find((c) => c.x === x && c.z === z);
  const waterDist = (x, z) => Math.min(...GORGE_WATERS.map((w) => waterGap(w, x, z)));
  const { ground, reached } = floodGorge();
  const props = propsFor('gorge');
  const chamberOf = (id) => GORGE_CAVES.find((c) => c.id === id).rects.find((r) => r.tag.endsWith('-chamber'));
  const denOf = (id) => GORGE_DENS.find((d) => d.id === id);

  it('nine POIs, each 2 m or more from water, clear of colliders by 1.6, on reached ground', () => {
    expect(area.pois.map((p) => [p.x, p.z])).toEqual(POIS);
    for (const p of area.pois) {
      const at = `poi (${p.x}, ${p.z})`;
      expect(waterDist(p.x, p.z), at).toBeGreaterThanOrEqual(2);
      for (const c of area.colliders) {
        expect(Math.hypot(p.x - c.x, p.z - c.z) - c.r, `${at} by (${c.x}, ${c.z})`).toBeGreaterThanOrEqual(1.6);
      }
      expect(reached(p.x, p.z), at).toBe(true);
    }
    // so a ring drawn on a POI stands on it
    expect(area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters)).map((p) => [p.x, p.z])).toEqual(POIS);
  });

  it('every POI, find, scenic, golden mouse x/z, ring, rest and hide is reached from the spawn', () => {
    const list = [
      ...area.pois.map((p) => ({ what: `poi (${p.x}, ${p.z})`, ...p })),
      ...area.collectibles.map((p) => ({ what: p.id, ...p })),
      ...area.scenics.map((p) => ({ what: p.id, ...p })),
      ...GOLD_MICE.gorge.map((p) => ({ what: p.id, ...p })),
      ...area.raceCourse.map((p, i) => ({ what: `ring ${i}`, ...p })),
      ...props.rests.map((p) => ({ what: p.id, ...p })),
      ...props.hides.map((p, i) => ({ what: `hide ${i}`, ...p })),
    ];
    expect(list).toHaveLength(9 + 5 + 3 + 3 + 5 + 5 + 3);
    const goatHide = GORGE_HIDES[2];
    const missed = list.filter((t) => !(t.x === goatHide.x && t.z === goatHide.z) && !reached(t.x, t.z)).map((t) => t.what);
    expect(missed).toEqual([]);
    // the one exception: the goat's hide is on the shoulder, where no cat goes
    expect(ground.y(goatHide.x, goatHide.z)).toBe(SHOULDER);
    expect(reached(goatHide.x, goatHide.z)).toBe(false);
  });

  it('five finds, three scenics, the Summit Rock chain', () => {
    expect(area.collectibles).toEqual([
      { id: 'gorge-find-1', x: -27, z: 33, label: 'a smooth white pebble' },
      { id: 'gorge-find-2', x: 24.5, z: 8, label: 'a tuft of soft grey fur' },
      { id: 'gorge-find-3', x: 43, z: -40, label: 'a gold-flecked stone' },
      { id: 'gorge-find-4', x: -4, z: 18, label: 'a curly fern frond' },
      { id: 'gorge-find-5', x: 20, z: -34, label: 'a hawk feather' },
    ]);
    expect(area.scenics).toEqual([
      { id: 'gorge-view', x: 4, z: -24, label: 'the view down the gorge' },
      { id: 'lookout-ledge', x: 3.5, z: -5, label: 'the gorge from the Lookout Ledge' },
      { id: 'echo-mouth', x: -16.5, z: 23.5, label: 'the mouth of the Echo Cave' },
    ]);
    const low = perchAt(24, -23);
    const top = perchAt(25, -24);
    expect(low).toEqual({ x: 24, z: -23, y: 0.72, kind: 'stone' });
    expect(top).toEqual({ x: 25, z: -24, y: 1.9, kind: 'stone', label: 'summit rock', vantage: true });
    // the chain's two perches, then one on each tor
    expect(area.perches.slice(0, 2)).toEqual([low, top]);
    expect(area.perches).toHaveLength(2 + gorgeTors().length);
    expect(area.colliders.slice(0, 2)).toEqual([{ x: 24, z: -23, r: 0.7 }, { x: 25, z: -24, r: 0.9 }]);
    expect(collider(24, -23)?.r).toBe(0.7);
    expect(collider(25, -24)?.r).toBe(0.9);
    // heights are over the clifftop's ground: both hops, the boulder from
    // the ground and the top from the boulder
    expect(ground.y(low.x, low.z)).toBe(CLIFFTOP);
    expect(ground.y(top.x, top.z)).toBe(CLIFFTOP);
    expect(canReach(low, { x: low.x, z: low.z }, 0)).toBe(true);
    expect(canReach(top, { x: low.x, z: low.z }, low.y)).toBe(true);
    // the top is out of reach of the clifftop's ground: two hops
    expect(canReach(top, { x: top.x, z: top.z }, 0)).toBe(false);
    // the meshes, sat on the clifftop, the pillar as wide at its foot as its collider
    const pillar = scene.getObjectByName('summitRock');
    const boulder = scene.getObjectByName('summitRockBoulder');
    expect(pillar.geometry.parameters).toMatchObject({ radiusTop: 0.75, radiusBottom: 0.9, height: 1.9, radialSegments: 7 });
    expect(pillar.position).toMatchObject({ x: 25, y: CLIFFTOP + 0.95, z: -24 });
    expect(boulder.position).toMatchObject({ x: 24, y: CLIFFTOP + 0.3, z: -23 });
    expect(boulder.material).toBe(pillar.material);
  });

  it('the golden mice are where the table puts them', () => {
    expect(GOLD_MICE.gorge).toEqual([
      { id: 'gm-gorge-1', x: -29.5, z: 33.5, y: 0 },
      { id: 'gm-gorge-2', x: 25, z: -24, y: 1.9 },
      { id: 'gm-gorge-3', x: 4.6, z: -9.6, y: 0 },
    ]);
    const [echo, summit, lookout] = GOLD_MICE.gorge;
    expect(inRect(chamberOf('echo'), echo.x, echo.z)).toBe(true);
    expect(inRect(denOf('denLookout'), lookout.x, lookout.z)).toBe(true);
    expect(perchAt(summit.x, summit.z)?.y).toBe(summit.y);
  });

  // The chase camera at the default zoom step: a cat 3 m from the pillar, the
  // camera 4.5 m further out and 2.2 m over the clifftop. South of the rock
  // that would be inside the east wall (z > -18), so there, as in the game,
  // the camera is pulled forward out of the rock, to 0.3 m inside the
  // clifftop's edge.
  it("the Summit Rock's mouse is in sight from the chase camera", () => {
    const m = GOLD_MICE.gorge[1];
    const objects = ['summitRock', 'summitRockBoulder', 'rockFaces', 'ledgeTops', 'lips'].map((n) => scene.getObjectByName(n));
    for (const o of objects) expect(o).toBeTruthy();
    const target = new THREE.Vector3(m.x, CLIFFTOP + m.y + 0.12, m.z);
    for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const cx = Math.min(m.x + dx * 7.5, 34 - 0.3);
      const cz = Math.min(m.z + dz * 7.5, -18 - 0.3);
      expect(area.ground.y(cx, cz), `camera ${dx},${dz} over the clifftop`).toBe(CLIFFTOP);
      const cam = new THREE.Vector3(cx, CLIFFTOP + 2.2, cz);
      const dir = target.clone().sub(cam);
      const ray = new THREE.Raycaster(cam, dir.clone().normalize(), 0, dir.length());
      expect(ray.intersectObjects(objects, true).length, `camera ${dx},${dz}`).toBe(0);
    }
  });

  it("the caves' mice and finds are in sight from the cave mouth's bend", () => {
    const rock = scene.getObjectByName('rockFaces');
    const items = [...GOLD_MICE.gorge, ...area.collectibles];
    let seen = 0;
    for (const cave of GORGE_CAVES) {
      const chamber = chamberOf(cave.id);
      const [bx, bz] = cave.path[2];
      const from = new THREE.Vector3(bx, cave.y + 0.9, bz);
      for (const it of items.filter((i) => inRect(chamber, i.x, i.z))) {
        const to = new THREE.Vector3(it.x, cave.y + (it.y ?? 0) + 0.12, it.z);
        const dir = to.clone().sub(from);
        const ray = new THREE.Raycaster(from, dir.clone().normalize(), 0, dir.length());
        expect(ray.intersectObject(rock, false).length, `${cave.id}: ${it.id}`).toBe(0);
        seen++;
      }
    }
    // the Echo Cave's mouse and pebble, the Snug Cave's fur, the Glitter Cave's stone
    expect(seen).toBe(4);
    // and the walls do stop a look: through the Echo chamber's west wall
    const from = new THREE.Vector3(-27.5, 0.9, 30);
    const dir = new THREE.Vector3(-34, 0.9, 33).sub(from);
    const ray = new THREE.Raycaster(from, dir.clone().normalize(), 0, dir.length());
    expect(ray.intersectObject(rock, false).length).toBeGreaterThan(0);
  });

  it('every new label is our own words', () => {
    const texts = [
      ...area.pois.map((p) => p.label).filter(Boolean),
      ...area.scenics.map((s) => s.label),
      ...area.collectibles.map((c) => c.label),
      ...area.perches.map((p) => p.label).filter(Boolean),
      ...area.moments.map((m) => m.label),
      ...GORGE_CAVES.map((c) => c.name),
      ...props.rests.map((r) => r.id),
    ];
    expect(texts.length).toBeGreaterThanOrEqual(3 + 5 + 1 + 1 + 3 + 5);
    for (const t of texts) {
      expect(t, t).not.toMatch(BOOK);
      expect(t, t).not.toMatch(SCANNED);
      expect(borrowedIn(t), t).toEqual([]);
    }
  });

  it('the reserved wide ledge holds nothing', () => {
    const points = [
      ...area.pois, ...area.collectibles, ...area.scenics, ...GOLD_MICE.gorge, ...area.raceCourse,
      ...props.rests, ...props.hides, ...area.perches, ...area.critterSpawns,
      ...area.critterSpawns.filter((c) => c.x2 !== undefined).map((c) => ({ x: c.x2, z: c.z2 })),
      ...area.moments, ...area.moments.map((m) => m.from),
    ];
    for (const r of [WIDE_LEDGE_RECT, CAMP_DEN_RESERVE]) {
      expect(r.reserved).toBe('part 4');
      for (const p of points) expect(inRect(r, p.x, p.z), `(${p.x}, ${p.z}) in ${r.tag}`).toBe(false);
      for (const c of area.colliders) {
        const gap = Math.hypot(Math.max(r.minX - c.x, 0, c.x - r.maxX), Math.max(r.minZ - c.z, 0, c.z - r.maxZ));
        expect(gap, `collider (${c.x}, ${c.z})`).toBeGreaterThan(c.r);
      }
      // and no scenery item stands there (the merged rock, the ground, the
      // horizon, the stream and the paths are the map itself)
      for (const o of scene.children) {
        if (o.position.x === 0 && o.position.z === 0) continue;
        expect(inRect(r, o.position.x, o.position.z), `${o.name || o.type} at (${o.position.x}, ${o.position.z})`).toBe(false);
      }
    }
  });

  it("the top's things stand in the sun", () => {
    const summit = scene.getObjectByName('summitRock').position;
    const view = area.scenics.find((s) => s.id === 'gorge-view');
    const finish = area.raceCourse[area.raceCourse.length - 1];
    const glitter = GORGE_CAVES.find((c) => c.id === 'glitter').mouth;
    for (const [what, p] of [['summit rock', summit], ['view', view], ['finish', finish], ['glitter mouth', glitter]]) {
      expect(p.z, what).toBeGreaterThan(-27);
    }
  });

  it('goals: every goal drawn in the Gorge can be finished there', () => {
    // nothing Twoleg-made to tip or sit in, and no villagers to scratch a head
    expect(area.tippables).toEqual([]);
    expect(area.boxes).toEqual([]);
    expect(area.critterSpawns.some((c) => c.type === 'villager')).toBe(false);
  });

  it('the Gorge never offers tipping, a box or head scratches', () => {
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      for (const g of createGoals(mulberry32(1000 + i * 7919), area).goals) seen.add(g.id);
    }
    expect(seen.has('tip-things')).toBe(false);
    expect(seen.has('box-sit')).toBe(false);
    expect(seen.has('get-scratches')).toBe(false);
    expect(seen.size).toBe(GOAL_POOL.length - 3);
  });

  it('carries its mice, the goat, one moment, five naps and three hides', () => {
    expect(gorgeTrees().near.length).toBeGreaterThanOrEqual(4);
    expect(area.critterSpawns).toEqual([
      ...gorgeTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })),
      { type: 'mouse', x: -15, z: 36, x2: -12, z2: 40 },
      { type: 'mouse', x: -2, z: -36, x2: -4, z2: -40 },
      { type: 'goat', x: 3.5, z: -16, x2: 7.5, z2: -16 },
    ]);
    // the mice patrol the floor where a cat can reach them; the goat keeps
    // to the shoulder, where she can't
    for (const c of area.critterSpawns.filter((s) => s.type === 'mouse')) {
      for (const [x, z] of [[c.x, c.z], [c.x2, c.z2]]) {
        expect(reached(x, z), `mouse (${x}, ${z})`).toBe(true);
        expect(inWater(GORGE_WATERS, x, z), `mouse (${x}, ${z})`).toBe(false);
      }
    }
    const goat = area.critterSpawns.find((c) => c.type === 'goat');
    for (const [x, z] of [[goat.x, goat.z], [goat.x2, goat.z2]]) {
      expect(ground.y(x, z), `goat (${x}, ${z})`).toBe(SHOULDER);
      expect(reached(x, z), `goat (${x}, ${z})`).toBe(false);
    }
    expect(area.moments).toEqual([
      { id: 'goat-leap', type: 'goat', label: 'a goat leaping over the rocks', x: 8, z: -12.5, from: { x: 4, z: -16 } },
    ]);
    expect(ground.y(4, -16)).toBe(SHOULDER);
    // one nap at the back centre of each den, on the den's own floor
    expect(props.rests).toEqual([
      { id: 'gorge-nap-1', kind: 'nap', x: -20, z: 7.3, mesh: false },
      { id: 'gorge-nap-2', kind: 'nap', x: -20, z: -32.7, mesh: false },
      { id: 'gorge-nap-3', kind: 'nap', x: 4, z: -44.7, mesh: false },
      { id: 'gorge-nap-4', kind: 'nap', x: 6.0, z: -10.2, mesh: false },
      { id: 'gorge-nap-5', kind: 'nap', x: 11.3, z: -42, mesh: false },
    ]);
    GORGE_DENS.forEach((d, i) => {
      const nap = props.rests[i];
      expect(inRect(d, nap.x, nap.z), `${nap.id} in ${d.id}`).toBe(true);
      expect(ground.y(nap.x, nap.z), nap.id).toBe(d.y0);
    });
    expect(props.hides).toEqual([{ x: -17.4, z: 38 }, { x: 1.4, z: -38 }, { x: 8, z: -12.5 }]);
    expect(props.hides).toEqual(GORGE_HIDES);
    expect(area.puddles).toEqual([]);
  });

  it('keeps every find, perch, ring, nap, hide, the spawn, the posts and the pad in GORGE_KEEP_CLEAR', () => {
    const has = (x, z) => GORGE_KEEP_CLEAR.some(([px, pz]) => px === x && pz === z);
    const all = [
      // the Summit Rock's perches (a tor keeps its own clearance, scaled to it)
      ...area.pois, ...area.scenics, ...area.collectibles, ...GOLD_MICE.gorge, ...area.perches.slice(0, 2),
      ...area.raceCourse, ...props.rests, ...props.hides, SPAWN,
      { x: -47.5, z: -14 }, { x: -5, z: 47.5 }, { x: SPAWN.x + 2, z: SPAWN.z - 3 },
    ];
    for (const p of all) expect(has(p.x, p.z), `(${p.x}, ${p.z})`).toBe(true);
    expect(GORGE_KEEP_CLEAR).toHaveLength(all.length);
    expect(Object.isFrozen(GORGE_KEEP_CLEAR)).toBe(true);
    // and the rectangles: every cave and den, and the camp's ledge and den
    const rects = [...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, WIDE_LEDGE_RECT, CAMP_DEN_RESERVE];
    expect(GORGE_KEEP_CLEAR_RECTS).toEqual(rects.map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ })));
  });
});

describe('the Gorge: tall pines, boulders, scree and grass', () => {
  const { ground, grid } = floodGorge();
  const PINE_REACH = 1.3;
  const pathDist = (x, z) => Math.min(...GORGE_PATHS.map((s) => segDist(x, z, ...s)));
  const keepDist = (x, z) => Math.min(...GORGE_KEEP_CLEAR.map(([px, pz]) => Math.hypot(x - px, z - pz)));
  const CLIFF = { minX: 2.4, maxX: 34, minZ: -40, maxZ: -18 };
  const MOUTHS = [...GORGE_CAVES.map((c) => c.mouth), ...GORGE_DENS.map((d) => d.mouth)];
  const HOLES = GORGE_KEEP_CLEAR_RECTS;
  // Every grid cell (0.25 m) within `r` of (x, z): fn(cx, cz), stopping at
  // the first false.
  const everyCellWithin = (x, z, r, fn) => {
    const s = grid.step;
    for (let cx = Math.ceil((x - r) / s) * s; cx <= x + r; cx += s) {
      for (let cz = Math.ceil((z - r) / s) * s; cz <= z + r; cz += s) {
        if (Math.hypot(cx - x, cz - z) <= r && !fn(cx, cz)) return false;
      }
    }
    return true;
  };
  // Every spot within r stands at the same height as (x, z), under no roof.
  const allOneShape = (x, z, r) => {
    const y = ground.y(x, z);
    return everyCellWithin(x, z, r, (cx, cz) => ground.y(cx, cz) === y && ground.ceil(cx, cz) === Infinity);
  };

  it('gorgeTrees is deterministic and keeps its clearances', async () => {
    const { near, stand } = gorgeTrees();
    expect(near.length).toBeGreaterThanOrEqual(8);
    expect(near.length).toBeLessThanOrEqual(14);
    expect(stand.length).toBeGreaterThanOrEqual(30);
    expect(stand.length).toBeLessThanOrEqual(60);
    // a fresh load places the same trees
    vi.resetModules();
    const again = await import('../src/world/gorge.js');
    expect(again.gorgeTrees()).not.toBe(gorgeTrees());
    expect(again.gorgeTrees()).toEqual(gorgeTrees());
    for (const t of near) {
      const at = `near pine (${t.x}, ${t.z})`;
      const y = ground.y(t.x, t.z);
      const onFloor = y === 0 && t.x >= -17 && t.x <= 1;
      const onTop = y === CLIFFTOP && inRect(CLIFF, t.x, t.z);
      expect(onFloor || onTop, at).toBe(true);
      expect(t.y, at).toBeUndefined();
    }
    for (const t of stand) {
      const at = `stand pine (${t.x}, ${t.z})`;
      expect(t.y, at).toBe(WEST_TOP);
      expect(ground.y(t.x, t.z), at).toBe(WEST_TOP);
      expect(t.x, at).toBeLessThanOrEqual(-18);
    }
    const all = [...near, ...stand];
    for (const t of all) {
      const at = `pine (${t.x}, ${t.z})`;
      const reach = PINE_REACH * t.scale;
      // the canopy on one shape, and 2.5 m inside its rim (less one grid step)
      expect(allOneShape(t.x, t.z, reach + 2.5 - grid.step), at).toBe(true);
      expect(pathDist(t.x, t.z), at).toBeGreaterThanOrEqual(1.5 + reach + 0.5);
      expect(keepDist(t.x, t.z), at).toBeGreaterThanOrEqual(4);
      expect(t.x >= area.bounds.minX && t.x <= area.bounds.maxX && t.z >= area.bounds.minZ && t.z <= area.bounds.maxZ, at).toBe(true);
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z)).toBeGreaterThanOrEqual(3.2);
      }
    }
    // each one drawn: a swaying pine at the root, seated on its ground, and
    // the stand as one merged pair with every tree lifted onto the west top
    for (const t of near) {
      const pine = scene.children.find((o) => o.userData.mapCrown && o.position.x === t.x && o.position.z === t.z);
      expect(pine, `near pine (${t.x}, ${t.z})`).toBeTruthy();
      expect(pine.position.y).toBe(ground.y(t.x, t.z));
    }
    const standMesh = scene.getObjectByName('pineStand');
    expect(standMesh.userData.mapCrowns).toHaveLength(stand.length);
    const trunks = standMesh.getObjectByName('standTrunks').geometry;
    trunks.computeBoundingBox();
    expect(trunks.boundingBox.min.y).toBeCloseTo(WEST_TOP, 5);
    // and a collider on every trunk
    for (const t of all) {
      expect(area.colliders.some((c) => c.x === t.x && c.z === t.z && c.r === Math.round(40 * t.scale) / 100)).toBe(true);
    }
  });

  it('no pine stands over a path, a ledge below it or a cave mouth', () => {
    const { near, stand } = gorgeTrees();
    for (const t of [...near, ...stand]) {
      const at = `pine (${t.x}, ${t.z})`;
      const reach = PINE_REACH * t.scale;
      expect(pathDist(t.x, t.z) - reach, `${at} over a path`).toBeGreaterThanOrEqual(1.5);
      expect(allOneShape(t.x, t.z, reach), `${at} over a ledge below`).toBe(true);
      for (const m of MOUTHS) expect(Math.hypot(t.x - m.x, t.z - m.z) - reach, `${at} by (${m.x}, ${m.z})`).toBeGreaterThanOrEqual(2.5);
      for (const h of HOLES) expect(rectDist(h, t.x, t.z), `${at} over a cave or den`).toBeGreaterThan(reach);
    }
  });

  it('the forest leaves the floor walkable', () => {
    const blocked = (x, z) => area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
    const { reached: reachedPast } = floodGorge({ blocked });
    const props = propsFor('gorge');
    const goatHide = GORGE_HIDES[2];
    const targets = [
      ...area.pois, ...area.collectibles, ...area.scenics, ...GOLD_MICE.gorge, ...area.raceCourse,
      ...props.rests, ...props.hides.filter((h) => !(h.x === goatHide.x && h.z === goatHide.z)),
    ];
    // the summit mouse stands on the pillar's collider; its foot is the target
    const missed = targets.filter((t) => !blocked(t.x, t.z) && !reachedPast(t.x, t.z)).map((t) => `(${t.x}, ${t.z})`);
    expect(missed).toEqual([]);
    expect(targets.filter((t) => blocked(t.x, t.z)).map((t) => [t.x, t.z])).toEqual([[25, -24]]);
    // the pillar's foot is still in reach, on every side
    for (const [dx, dz] of [[1.25, 0], [-1.25, 0], [0, 1.25], [0, -1.25]]) expect(reachedPast(25 + dx, -24 + dz)).toBe(true);
  });

  it('tors and scree are clear of paths, dens, mouths and finds', () => {
    const tors = gorgeTors();
    const onFloor = tors.filter((t) => ground.y(t.x, t.z) === 0);
    const onTop = tors.filter((t) => ground.y(t.x, t.z) === CLIFFTOP);
    expect(onFloor.length).toBeGreaterThanOrEqual(6);
    expect(onFloor.length).toBeLessThanOrEqual(10);
    expect(onTop.length).toBeGreaterThanOrEqual(2);
    expect(onTop.length).toBeLessThanOrEqual(3);
    expect(onFloor.length + onTop.length).toBe(tors.length);
    for (const t of tors) {
      const at = `tor (${t.x}, ${t.z})`;
      expect(pathDist(t.x, t.z) - t.r, at).toBeGreaterThanOrEqual(1.5);
      expect(keepDist(t.x, t.z) - t.r, at).toBeGreaterThanOrEqual(3);
      for (const m of MOUTHS) expect(Math.hypot(t.x - m.x, t.z - m.z) - t.r, at).toBeGreaterThanOrEqual(3);
      for (const h of HOLES) expect(rectDist(h, t.x, t.z) - t.r, at).toBeGreaterThanOrEqual(2);
      expect(rectDist(STREAM, t.x, t.z) - t.r, at).toBeGreaterThanOrEqual(1.5);
      // one hop up from the ground beside it, and a perch on top
      expect(t.h).toBeLessThanOrEqual(1.5);
      const perch = area.perches.find((p) => p.x === t.x && p.z === t.z);
      expect(perch, at).toEqual({ x: t.x, z: t.z, y: t.h, kind: 'stone' });
      expect(canReach(perch, { x: t.x + t.r, z: t.z }, 0), at).toBe(true);
      expect(area.colliders).toContainEqual({ x: t.x, z: t.z, r: t.r });
      // drawn, and seated on its own ground
      const mesh = scene.getObjectByName('tors').children.find((o) => o.position.x === t.x && o.position.z === t.z);
      expect(mesh, at).toBeTruthy();
      expect(mesh.position.y).toBe(ground.y(t.x, t.z));
      mesh.geometry.computeBoundingBox();
      expect(mesh.geometry.boundingBox.min.y).toBeCloseTo(0, 5);
    }
    expect(scene.getObjectByName('tors').children).toHaveLength(tors.length);
    for (let i = 0; i < tors.length; i++) {
      for (let j = i + 1; j < tors.length; j++) {
        const [a, b2] = [tors[i], tors[j]];
        expect(Math.hypot(a.x - b2.x, a.z - b2.z) - a.r - b2.r).toBeGreaterThanOrEqual(3);
      }
    }
    const scree = gorgeScree();
    expect(scree.length).toBeGreaterThan(60);
    for (const s of scree) {
      const at = `scree (${s.x}, ${s.z})`;
      expect(ground.y(s.x, s.z), at).toBe(0);
      expect(pathDist(s.x, s.z), at).toBeGreaterThanOrEqual(1.5 + 0.5);
      expect(keepDist(s.x, s.z), at).toBeGreaterThanOrEqual(2);
      for (const m of MOUTHS) expect(Math.hypot(s.x - m.x, s.z - m.z), at).toBeGreaterThanOrEqual(2);
      for (const h of HOLES) expect(rectDist(h, s.x, s.z), at).toBeGreaterThanOrEqual(1.5);
      // at a wall's foot: raised ground 0.6 m away
      const raised = [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]].some(([dx, dz]) => ground.y(s.x + dx, s.z + dz) >= 0.3);
      expect(raised, at).toBe(true);
    }
    // drawn as one merged bed
    const bed = scene.getObjectByName('scree');
    expect(bed).toBeTruthy();
    expect(bed.isMesh).toBe(true);
  });

  // G13: a cat can always pass a collider, and never stops dead against one
  // on an edge.
  it('no collider stands by a rim', () => {
    const { minX, minZ, step, nx, nz } = grid;
    const at = (i, j) => ground.y(minX + i * step, minZ + j * step);
    const rim = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const y = at(i, j);
        if ((i + 1 < nx && Math.abs(at(i + 1, j) - y) >= 0.3) || (j + 1 < nz && Math.abs(at(i, j + 1) - y) >= 0.3)) {
          rim[i * nz + j] = 1;
          if (i + 1 < nx && Math.abs(at(i + 1, j) - y) >= 0.3) rim[(i + 1) * nz + j] = 1;
          if (j + 1 < nz && Math.abs(at(i, j + 1) - y) >= 0.3) rim[i * nz + j + 1] = 1;
        }
      }
    }
    const close = [];
    for (const c of area.colliders) {
      const reach = c.r + 1.5;
      const i0 = Math.max(0, Math.floor((c.x - reach - minX) / step));
      const i1 = Math.min(nx - 1, Math.ceil((c.x + reach - minX) / step));
      const j0 = Math.max(0, Math.floor((c.z - reach - minZ) / step));
      const j1 = Math.min(nz - 1, Math.ceil((c.z + reach - minZ) / step));
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          if (rim[i * nz + j] && Math.hypot(minX + i * step - c.x, minZ + j * step - c.z) - c.r < 1.5) {
            close.push(`(${c.x}, ${c.z}) r ${c.r} by (${minX + i * step}, ${minZ + j * step})`);
          }
        }
      }
    }
    expect(close.slice(0, 8)).toEqual([]);
  });

  it('the birds sit in the first four near pines', () => {
    const birds = area.critterSpawns.filter((c) => c.type === 'bird');
    expect(birds).toHaveLength(4);
    expect(birds).toEqual(gorgeTrees().near.slice(0, 4).map(({ x, z }) => ({ type: 'bird', x, z })));
  });
});
