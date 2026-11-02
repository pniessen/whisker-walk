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
const {
  shallowExcess, rooftopSpots, ROOFTOP_SALT, inWater, waterGap, PINE_CONES, PINE_TRUNK, capTopFor,
} = await import('../src/world/builder.js');
const { surfaceProps } = await import('../src/render/materials.js');
const {
  CLIFFTOP, SHOULDER, WEST_TOP, STAND_ON, GORGE_CAVES, GORGE_DENS, WIDE_LEDGE_RECT, CAMP_DEN, CLAN_STAND_ON, mapShapes,
  CEILINGS, MASSES,
} = await import('../src/world/gorgeshape.js');
const { segDist } = await import('../src/segdist.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { propsFor } = await import('../src/propsets.js');
const { canReach } = await import('../src/climbing.js');
const { clearSpot } = await import('../src/world/spots.js');
const { mulberry32 } = await import('../src/rng.js');
const { OUTSIDE_WORDS, RANK_WORDS, PLACE_WORDS, CLAN_SUFFIX } = await import('../src/clanwords.js');
const { cameraOffset } = await import('../src/catcam.js');
const { ZOOM_STEPS, MIN_CAMERA_Y } = await import('../src/camzoom.js');
const { PITCH_MAX } = await import('../src/player.js');
const raceMod = await import('../src/race.js');
const { GORGE_SPAWN, GORGE_BOUNDS, FLOOD_STEP: GORGE_FLOOD_STEP, floodGorge } = await import('./helpers/gorgeflood.js');

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

// The scan in Global Constraints: a book place name, or a scanned word.
const BOOK = /gathering|four ?trees|moon|high ?stones|high ?rock|high ?ledge|mother ?mouth|sunning|snake ?rocks|tall ?pines|rock ?pile|sky ?oak|hollow|rushing water/i;
const SCANNED = /\b(kit|apprentice|warrior|elder|queen|medicine cat|deputy|leader|loner|rogue|kittypet|twolegplace|clan)\b/i;

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
    // the per-walk life (gorgelife.js), built on its own scene and lights
    expect(area.skyBirdY).toBe(34);
    const lifeScene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    const fill = new THREE.HemisphereLight(0xffffff, 0x5f5d52, 1);
    const life = area.life({ scene: lifeScene, sun, fill, ground: area.ground, reducedMotion: false });
    expect(typeof life.update).toBe('function');
    expect(typeof life.dispose).toBe('function');
    life.update(0.016, 0, new THREE.Vector3(SPAWN.x, 0, SPAWN.z));
    expect(sun.intensity).toBeCloseTo(3 * 0.6, 10); // shaded on the floor
    life.dispose();
    expect(sun.intensity).toBe(3);
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
    for (const l of labels) {
      expect(l).not.toMatch(BOOK);
      expect(l).not.toMatch(SCANNED);
    }
  });
});


// test/clanwords.test.js's borrowedIn (every borrowed word, matched as a
// whole word, case-blind). The scan's BOOK and SCANNED are at the top.
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

  it("the den's mouth and cap are drawn from the ground", () => {
    const objects = ['rockFaces', 'ledgeTops', 'lips'].map((n) => scene.getObjectByName(n));
    expect(objects.every(Boolean)).toBe(true);
    // in at the mouth from the ledge, to 0.5 m short of the back wall: nothing in the way
    const from = new THREE.Vector3(19.5, 8.15, 40);
    const ray = new THREE.Raycaster(from, new THREE.Vector3(1, 0, 0), 0, 6);
    expect(ray.intersectObjects(objects, false).map((h) => h.point.x)).toEqual([]);
    // and the back wall is drawn
    expect(new THREE.Raycaster(from, new THREE.Vector3(1, 0, 0), 0, 7).intersectObjects(objects, false).length).toBeGreaterThan(0);
    // the roof, straight up from the den's floor, at the ground's ceiling
    const up = new THREE.Raycaster(new THREE.Vector3(23, 8.05, 40), new THREE.Vector3(0, 1, 0));
    const hit = up.intersectObject(scene.getObjectByName('rockFaces'), false)[0];
    expect(hit).toBeTruthy();
    expect(Math.abs(hit.point.y - 10.6)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(hit.point.y - area.ground.ceil(23, 40))).toBeLessThanOrEqual(0.02);
  });

  it('carries the clan ground for the camp (CLAN_STAND_ON)', () => {
    expect(area.clanStandOn).toBe(CLAN_STAND_ON);
    expect(area.keepOut.onlyOn).toBe(STAND_ON);
    // and the rock is drawn with the camp den's floor among its walks
    expect(gorge.ROCK_WALKS).toContain(CAMP_DEN);
    expect(Object.isFrozen(gorge.ROCK_WALKS)).toBe(true);
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

  it('the camp ledge and den hold only the camp', () => {
    const points = [
      ...area.pois, ...area.collectibles, ...area.scenics, ...GOLD_MICE.gorge, ...area.raceCourse,
      ...props.rests, ...props.hides, ...area.perches, ...area.critterSpawns,
      ...area.critterSpawns.filter((c) => c.x2 !== undefined).map((c) => ({ x: c.x2, z: c.z2 })),
      ...area.moments, ...area.moments.map((m) => m.from),
    ];
    for (const r of [WIDE_LEDGE_RECT, CAMP_DEN]) {
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

  // (test/goalsarea.test.js draws the Gorge's goals over 400 seeds and finds
  // no tipping, box or head-scratch goal among them.)
  it('goals: the Gorge has nothing to tip, no box and no villager', () => {
    // nothing Twoleg-made to tip or sit in, and no villagers to scratch a head
    expect(area.tippables).toEqual([]);
    expect(area.boxes).toEqual([]);
    expect(area.critterSpawns.some((c) => c.type === 'villager')).toBe(false);
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
    const rects = [...GORGE_CAVES.flatMap((c) => c.rects), ...GORGE_DENS, WIDE_LEDGE_RECT, CAMP_DEN];
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
      // the default camera's reach and a metre (gorge.js's CAM_CLEAR) off
      // every mouth, scenic and nap, so the camera there is in no canopy
      const camClear = ZOOM_STEPS[1].dist + 1;
      for (const m of [...MOUTHS, ...area.scenics, ...propsFor('gorge').rests]) {
        expect(Math.hypot(t.x - m.x, t.z - m.z) - reach, `${at} by (${m.x}, ${m.z})`).toBeGreaterThanOrEqual(camClear);
      }
      for (const h of HOLES) expect(rectDist(h, t.x, t.z), `${at} over a cave or den`).toBeGreaterThan(reach);
    }
  });

  // Final review I3: at a cave or den mouth, or a scenic, the chase camera
  // swings out over open ground where no path is, and a near pine there
  // filled the frame (Echo Cave, the west den, the clifftop den). A kid
  // stands 1 m out from each, facing in, and the camera at zoom steps 0-2 is
  // put exactly where catcam.cameraOffset puts it: it is inside no pine (a
  // trunk, or a cone as wide as builder.js draws it at that height).
  //
  // Not asserted (a Gorge-only exception: the Pines' test leaves out step 3,
  // not this): step 2 with the view dragged right down to pitch -0.25. The
  // camera hangs 6.8 m back and low there, past the default camera's reach
  // plus a metre that gorge.js keeps (CAM_CLEAR), and can graze the bottom
  // cone of a pine 8 m off; keeping clear of that too would leave the floor
  // fewer than eight near pines.
  it('the chase camera at a cave or den mouth or a scenic is inside no pine', () => {
    const { near } = gorgeTrees();
    const solidR = (y) => {
      let r = y >= 0 && y <= PINE_TRUNK.h ? PINE_TRUNK.rBottom : 0;
      for (const [R, h, cy] of PINE_CONES) {
        const top = cy + h / 2;
        if (y >= cy - h / 2 && y <= top) r = Math.max(r, (R * (top - y)) / h);
      }
      return r;
    };
    const insidePine = (cx, cy, cz) => near.find((t) => {
      const r = solidR((cy - ground.y(t.x, t.z)) / t.scale) * t.scale;
      return r > 0 && Math.hypot(cx - t.x, cz - t.z) < r;
    });
    // each mouth's way out: the side of its cave's corridor or its den it is on
    const outOf = (r, m) => (m.x === r.minX ? [-1, 0] : m.x === r.maxX ? [1, 0] : m.z === r.minZ ? [0, -1] : [0, 1]);
    const stands = [
      ...GORGE_CAVES.map((c) => ({ what: c.name, m: c.mouth, out: [outOf(c.rects[0], c.mouth)] })),
      ...GORGE_DENS.map((d) => ({ what: d.id, m: d.mouth, out: [outOf(d, d.mouth)] })),
      // a scenic is looked at from any side
      ...area.scenics.map((sc) => ({
        what: sc.id, m: sc, out: Array.from({ length: 8 }, (_, k) => [Math.sin((k * Math.PI) / 4), Math.cos((k * Math.PI) / 4)]),
      })),
    ];
    const off = new THREE.Vector3();
    const hits = [];
    let looks = 0;
    for (const { what, m, out } of stands) {
      for (const [ox, oz] of out) {
        const catX = m.x + ox, catZ = m.z + oz;
        if (ground.ceil(catX, catZ) !== Infinity || !ground.sameLevel(catX, catZ, m.x + ox * 0.5, m.z + oz * 0.5)) continue;
        const y0 = Math.atan2(ox, oz); // facing in (-ox, -oz): the camera goes out behind her
        for (const yaw of [y0, y0 + 0.17, y0 - 0.17]) {
          for (const step of [0, 1, 2]) {
            for (const pitch of [-0.25, 0.18, 0.85]) {
              if (step === 2 && pitch === -0.25) continue;
              const { dist, height } = ZOOM_STEPS[step];
              cameraOffset(yaw, pitch, dist, height, off);
              const cx = catX + off.x, cz = catZ + off.z;
              const cy = Math.max(ground.y(catX, catZ) + off.y, ground.y(cx, cz) + MIN_CAMERA_Y);
              looks++;
              const t = insidePine(cx, cy, cz);
              if (t) hits.push(`${what}: cat (${catX.toFixed(1)}, ${catZ.toFixed(1)}) step ${step} pitch ${pitch} yaw ${yaw.toFixed(2)} in pine (${t.x}, ${t.z}) x${t.scale}`);
            }
          }
        }
      }
    }
    expect(looks).toBeGreaterThan(300);
    expect(hits.slice(0, 12)).toEqual([]);
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

describe('the Gorge: the climb race', () => {
  const sceneStub = () => ({ add() {}, remove() {} });
  const run = (course, pos) => {
    const race = raceMod.createRace(sceneStub(), course, SPAWN, { ground: area.ground, kind: 'climb' });
    race.begin();
    race.update(0.016, pos);
    return race;
  };

  it("the Gorge's course is fixed and climbs", () => {
    expect(built().area.raceCourse).toEqual(area.raceCourse);
    const flood = floodGorge();
    let last = -Infinity;
    for (const ring of area.raceCourse) {
      const y = area.ground.y(ring.x, ring.z);
      expect(y).toBeGreaterThanOrEqual(last);
      last = y;
      expect(flood.reached(ring.x, ring.z), `ring (${ring.x}, ${ring.z}) is reached`).toBe(true);
    }
    expect(last).toBe(CLIFFTOP);
  });

  it('a ring on one level is not crossed from another', () => {
    const course = [{ x: 5.0, z: 20 }, { x: 16, z: -24 }];
    expect(area.ground.sameLevel(6.0, 20, 5.0, 20)).toBe(false);
    expect(Math.hypot(1.0, 0)).toBeLessThan(1.2);
    expect(run(course, { x: 6.0, z: 20 }).currentRing).toBe(1);
    expect(run(course, { x: 5.0, z: 19.6 }).currentRing).toBe(2);
  });

  // Final review M4: the course and the pad pinned to the numbers table.
  it("the climb's five rings and its pad are the table's", () => {
    expect(area.raceCourse.map(({ x, z }) => [x, z])).toEqual([[-3, 6], [3.9, 28], [5.6, -5], [10.5, 33.5], [16, -24]]);
    const climb = raceMod.createRace(sceneStub(), area.raceCourse, area.spawn, { ground: area.ground, kind: 'climb' });
    expect(climb.pad).toEqual({ x: -42, z: -14 });
    expect(GORGE_KEEP_CLEAR).toContainEqual([-42, -14]);
  });

  it("the climb race's pad says race to the clifftop", () => {
    const climb = raceMod.createRace(sceneStub(), area.raceCourse, SPAWN, { ground: area.ground, kind: 'climb' });
    const daily = raceMod.createRace(sceneStub(), area.raceCourse, SPAWN, { ground: area.ground });
    expect(climb.promptAt(climb.pad)).toBe('E — race to the clifftop! 🏁');
    expect(daily.promptAt(daily.pad)).toBe('E — start today’s zoomies race! 🏁');
  });

  it('walk.js uses areaData.raceCourse when present, and the daily course otherwise', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/game/walk.js', import.meta.url)), 'utf8');
    expect(src).toMatch(/areaData\.raceCourse\s*\?\s*createRace\(scene, areaData\.raceCourse, areaData\.spawn, \{ ground, kind: 'climb' \}\)/);
    expect(src).toMatch(/raceCourse\(walkPois, seedFromCode\(today/);
  });
});

// Review Focus 1 (G7): every random spot a walk picks stands on ground the
// flood reaches, and none on the Wide Ledge kept for the camp.
const { createStrayCats, strayStream } = await import('../src/straycats.js');
const { createGhosts } = await import('../src/ghosts.js');
const { createScent } = await import('../src/scent.js');
const { createToy } = await import('../src/toy.js');
const { createCritters } = await import('../src/critters.js');
const { createSecrets } = await import('../src/secrets.js');
const { rainPuddleSpots } = await import('../src/weather.js');
describe('the Gorge: every random spot stands where a cat can walk', () => {
  const { reached, ground: floodGround } = floodGorge();
  // reached() snaps to the nearest 0.25 m cell, and a spot inside STAND_ON
  // can stand flush against a rock face (a cat sliding along a rim does), so
  // its nearest cell may be the rock's. A spot stands on reached ground when
  // one of the four cells around it is reached and on its own level (within
  // 0.15 m: a lip is 0.35 up, rock metres): rounding forgiven, rock, lips and
  // ledges never.
  const STEP = GORGE_FLOOD_STEP;
  const onReached = (x, z) => {
    const y = floodGround.y(x, z);
    const x0 = GORGE_BOUNDS.minX + Math.floor((x - GORGE_BOUNDS.minX) / STEP) * STEP;
    const z0 = GORGE_BOUNDS.minZ + Math.floor((z - GORGE_BOUNDS.minZ) / STEP) * STEP;
    for (const cx of [x0, x0 + STEP]) {
      for (const cz of [z0, z0 + STEP]) {
        if (reached(cx, cz) && Math.abs(floodGround.y(cx, cz) - y) <= 0.15) return true;
      }
    }
    return false;
  };
  const DT = 1 / 30;
  const SEEDS = 200;
  const STRAYS = 22;
  // Building 22 strays is most of this sweep's time (about 40 ms a seed), so
  // their walk is 150 frames of a coarse 0.1 s each: 15 s of wandering, a
  // few wander targets per cat, at a quarter of the cost of 600 fine frames.
  const STRAY_FRAMES = 150;
  const STRAY_DT = 0.1;
  const FAR_CAT = new THREE.Vector3(-44, 0, -11);
  const ghostProfile = (id) => ({ playerId: id, petName: id, breed: 'tabby', accessories: {}, greets: 2 });
  const onLedge = (x, z) => x >= WIDE_LEDGE_RECT.minX && x <= WIDE_LEDGE_RECT.maxX
    && z >= WIDE_LEDGE_RECT.minZ && z <= WIDE_LEDGE_RECT.maxZ;

  it('every random spot a walk picks stands on reached ground', () => {
    const bad = [];
    let targets = 0;
    const check = (what, x, z) => {
      if (!onReached(x, z) || onLedge(x, z)) bad.push(`${what} (${x.toFixed(2)}, ${z.toFixed(2)})`);
    };

    // The quest's POI picks, and the toy thrown from each POI eight ways and
    // left to settle (part 1's R12): neither draws, so once is every seed.
    const walkPois = area.pois.map((p) => clearSpot(p, area.colliders, area.bounds, area.waters));
    for (const p of walkPois) check('quest poi', p.x, p.z);
    for (const p of walkPois) {
      for (let k = 0; k < 8; k++) {
        const toy = createToy(new THREE.Scene(), { ground: area.ground });
        const a = (k / 8) * Math.PI * 2;
        toy.throwFrom(new THREE.Vector3(p.x, area.ground.y(p.x, p.z) + 1.1, p.z), new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
        for (let f = 0; f < 600 && toy.idleTime < 0.5; f++) toy.update(DT, area.bounds);
        check(`toy from (${p.x}, ${p.z}) toward ${k}`, toy.mesh.position.x, toy.mesh.position.z);
      }
    }

    for (let seed = 1; seed <= SEEDS; seed++) {
      const strays = createStrayCats(new THREE.Scene(), area, STRAYS, strayStream(seed), { roomSeed: seed });
      const seen = new Map();
      for (const s of strays.strays) check(`seed ${seed} stray spawn`, s.group.position.x, s.group.position.z);
      for (let f = 0; f < STRAY_FRAMES; f++) {
        strays.update(STRAY_DT, f * STRAY_DT, FAR_CAT, {});
        for (const s of strays.strays) {
          if (!s.target) continue;
          if (s.target !== seen.get(s)) { targets++; seen.set(s, s.target); }
          check(`seed ${seed} stray target`, s.target.x, s.target.z);
        }
      }

      const ghosts = createGhosts(new THREE.Scene(), area, [ghostProfile('g1'), ghostProfile('g2')], mulberry32(seed));
      for (const g of ghosts.list) check(`seed ${seed} ghost`, g.group.position.x, g.group.position.z);

      const scent = createScent(new THREE.Scene(), area, mulberry32(seed));
      for (const tr of scent.treats) check(`seed ${seed} treat`, tr.x, tr.z);

      for (const p of rainPuddleSpots(area, mulberry32(seed))) check(`seed ${seed} puddle`, p.x, p.z);

      const critters = createCritters(new THREE.Scene(), [], {
        rng: mulberry32(seed), spawnFireflies: true, ground: area.ground, area,
      });
      for (const c of critters.list) check(`seed ${seed} firefly`, c.def.x, c.def.z);

      // The gnome (a POI's spot, +/-1.5 m), and the unicorn: spooked from four
      // sides in turn, grazing in between.
      const secrets = createSecrets(new THREE.Scene(), area, { unicorn: true, ufo: false }, mulberry32(seed));
      const gnome = secrets.list.find((s) => s.key === 'gnome').group;
      check(`seed ${seed} gnome`, gnome.position.x, gnome.position.z);
      const u = secrets.list.find((s) => s.key === 'unicorn').group;
      for (let f = 0; f < 480; f++) {
        const a = Math.floor(f / 120) * (Math.PI / 2) + seed;
        const spook = f % 120 < 4;
        const cat = u.position.clone().add(new THREE.Vector3(Math.sin(a) * 2, 0, Math.cos(a) * 2));
        secrets.update(DT, f * DT, spook ? cat : FAR_CAT, spook ? 6 : 0);
        check(`seed ${seed} unicorn`, u.position.x, u.position.z);
      }
    }
    expect([...new Set(bad)].slice(0, 20)).toEqual([]);
    expect(targets).toBeGreaterThan(SEEDS * STRAYS); // the strays did wander
  });

  // Review fix F30: onlyOn's margin is for spots a walk CHOOSES. A cat's
  // position, clamped every frame, is held at the edge (margin 0); thrown
  // back 0.4 m it walked into the edge again and again, a sawtooth.
  it('a walking stray, ghost or fleeing unicorn never jumps at an edge', () => {
    const FPS_DT = 1 / 60;
    const FRAMES = 1800; // 30 s
    const EPS_STEP = 0.01;
    const STRAY_STEP = 1.4 * FPS_DT + EPS_STEP; // WANDER_SPEED; nothing scurries with the cat far away
    const GHOST_STEP = 1.1 * FPS_DT + EPS_STEP;
    const UNICORN_STEP = 3.5 * FPS_DT + EPS_STEP;
    const DECK = STREAM.decks[0];
    const jumps = [];
    const random = vi.spyOn(Math, 'random');
    try {
      for (let seed = 1; seed <= 6; seed++) {
        random.mockImplementation(mulberry32(1000 + seed)); // the ghosts' wander, seeded
        const strays = createStrayCats(new THREE.Scene(), area, STRAYS, strayStream(seed), { roomSeed: seed });
        const ghosts = createGhosts(new THREE.Scene(), area, [ghostProfile('g1'), ghostProfile('g2')], mulberry32(seed));
        const secrets = createSecrets(new THREE.Scene(), area, { unicorn: true, ufo: false }, mulberry32(seed));
        const u = secrets.list.find((s) => s.key === 'unicorn').group;
        const movers = [
          ...strays.strays.map((s, i) => ({ what: `stray ${i}`, g: s.group, max: STRAY_STEP })),
          ...ghosts.list.map((g, i) => ({ what: `ghost ${i}`, g: g.group, max: GHOST_STEP })),
        ];
        const was = new Map(movers.map((m) => [m, { x: m.g.position.x, z: m.g.position.z }]));
        for (let f = 0; f < FRAMES; f++) {
          const t = f * FPS_DT;
          strays.update(FPS_DT, t, FAR_CAT, {});
          ghosts.update(FPS_DT, t);
          // the unicorn is spooked toward a different side every 5 s
          const a = Math.floor(f / 300) * (Math.PI / 2) + seed;
          const spook = f % 300 < 2;
          const ux = u.position.x, uz = u.position.z;
          const cat = u.position.clone().add(new THREE.Vector3(Math.sin(a) * 2, 0, Math.cos(a) * 2));
          secrets.update(FPS_DT, t, spook ? cat : FAR_CAT, spook ? 6 : 0);
          const ud = Math.hypot(u.position.x - ux, u.position.z - uz);
          if (f % 300 > 2 && f % 300 < 180 && ud > UNICORN_STEP) {
            jumps.push(`seed ${seed} f${f} unicorn (${ux.toFixed(2)}, ${uz.toFixed(2)}) ${ud.toFixed(3)} m`);
          }
          for (const m of movers) {
            const p = m.g.position;
            const q = was.get(m);
            const d = Math.hypot(p.x - q.x, p.z - q.z);
            // (A stray stepping off the stepping stones' deck edge can hop
            // about 0.35 m: dryGroundPoint's deck-edge push, older than onlyOn
            // and the same without it. Not this test's edge.)
            if (d > m.max && rectDist(DECK, q.x, q.z) > 1) jumps.push(`seed ${seed} f${f} ${m.what} (${q.x.toFixed(2)}, ${q.z.toFixed(2)}) ${d.toFixed(3)} m`);
            q.x = p.x;
            q.z = p.z;
          }
        }
      }
    } finally {
      random.mockRestore();
    }
    expect(jumps.length, jumps.slice(0, 12).join('\n')).toBe(0);
  });

  it('the stray stream is not drawn any more than before', () => {
    for (const count of [0, 3, 22]) {
      const r = strayStream(7);
      let n = 0;
      const counting = () => { n++; return r(); };
      createStrayCats(new THREE.Scene(), area, count, counting, { roomSeed: 7 });
      expect(n).toBe(47 + 5 * count);
    }
  });

  it('walk.js takes its rain puddles from rainPuddleSpots and hands the critters the area', () => {
    const walkSrc = readFileSync(fileURLToPath(new URL('../src/game/walk.js', import.meta.url)), 'utf8');
    expect(walkSrc).toContain('const extra = rainPuddleSpots(areaData, walkRng);');
    expect(walkSrc).toMatch(/createCritters\(scene, areaData\.critterSpawns, \{[\s\S]*?area: areaData,\n    \}\);/);
  });
});

// Final review I1: the rain's extra puddles land on the clifftop and the
// ledges as well as the floor, so each is drawn on the ground under it, none
// is ever under a roof, and a puddle only chills the paws on its own level.
const { puddle: puddleMesh } = await import('../src/world/builder.js');
const { createAvatarUpdater } = await import('../src/game/avatar.js');
const { buildCat } = await import('../src/cat/model.js');
const { createProgression } = await import('../src/progression.js');
const { createWaterState } = await import('../src/waterstate.js');
const { surfaceAt } = await import('../src/render/pawprints.js');
describe('the Gorge: rain puddles sit on their own ground', () => {
  // A puddle on the clifftop just past its west lip, and a floor spot 0.7 m
  // west of it, under the cliff: inside the puddle on the map.
  const TOP_PUDDLE = Object.freeze({ x: 2.6, z: -30, r: 0.8 });
  const UNDER = { x: 1.9, z: -30 };

  it('every rain puddle is drawn on the ground under it, and none under a roof', () => {
    const bad = [];
    for (let seed = 1; seed <= 200; seed++) {
      for (const p of rainPuddleSpots(area, mulberry32(seed))) {
        const y = area.ground.y(p.x, p.z);
        const mesh = puddleMesh(p.x, p.z, p.r, p.y);
        if (Math.abs(mesh.position.y - y) > 0.05) bad.push(`seed ${seed} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) drawn at ${mesh.position.y.toFixed(2)} over ground ${y}`);
        if (area.ground.ceil(p.x, p.z) !== Infinity) bad.push(`seed ${seed} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) under a roof`);
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
  });

  it('walk.js draws each rain puddle at its spot\'s height', () => {
    const walkSrc = readFileSync(fileURLToPath(new URL('../src/game/walk.js', import.meta.url)), 'utf8');
    expect(walkSrc).toContain('scene.add(puddleProp(p.x, p.z, p.r, p.y))');
  });

  // updateAvatar driven for real with a stand-in session (the
  // test/avatarwater.test.js harness, on the Gorge's ground).
  function puddleHarness() {
    const cat = buildCat('tabby');
    const toasts = [];
    const player = {
      perchY: 0, hopY: 0, speed: 0, speedFactor: 1, inputActive: false, stalking: false,
      swimming: false, wading: false, inWater: false, shaking: false, waterState: createWaterState(),
      forward: () => new THREE.Vector3(0, 0, -1),
    };
    const { updateAvatar } = createAvatarUpdater({
      player, progression: createProgression({ getItem: () => null, setItem() {} }),
      settings: { get: () => false }, log: { awardOnce: () => 0, award: () => 0 },
      hud: { toast: (m) => toasts.push(m) },
      audio: { landThump() {}, bell() {}, fanfare() {}, purr() {}, step() {}, waterSplash() {} },
      petNameFor: () => 'x', completeTag() {}, noteBat() {},
    });
    const s = {
      cat, perched: null, net: null, chasing: null, rest: null, ground: area.ground,
      freezeTime: 0, pounceTime: 0, pounceCooldown: 0, landTime: 0, idleTime: 0,
      stepPhase: 0, stretchTime: 0, sniffTime: 0, boxTime: 0, pose: 'follow',
      balkedPuddles: new Set(), toy: { active: false }, toyGhost: { visible: false },
      groomTimers: new Map(), remotes: { list: [] }, fx: { burst() {} },
      areaData: { puddles: [TOP_PUDDLE], boxes: [] },
      critters: { setFleeModifier() {}, markStalked() {}, catchAt: () => null, pounceCatch: () => null },
    };
    const standAt = (x, z) => {
      cat.position.set(x, area.ground.y(x, z), z);
      updateAvatar(s, 1 / 60, 1);
    };
    return { s, toasts, standAt };
  }

  it('a cat on the floor under a clifftop puddle feels no cold paws', () => {
    expect(area.ground.y(TOP_PUDDLE.x, TOP_PUDDLE.z)).toBe(CLIFFTOP);
    expect(area.ground.y(UNDER.x, UNDER.z)).toBe(0);
    expect(Math.hypot(TOP_PUDDLE.x - UNDER.x, TOP_PUDDLE.z - UNDER.z)).toBeLessThan(TOP_PUDDLE.r);
    const under = puddleHarness();
    under.standAt(UNDER.x, UNDER.z);
    expect(under.toasts).toEqual([]);
    expect(under.s.freezeTime).toBe(0);
    // ...and one on the clifftop, in it, does
    const inIt = puddleHarness();
    inIt.standAt(TOP_PUDDLE.x + 0.3, TOP_PUDDLE.z);
    expect(inIt.toasts).toEqual(['Brrr — cold paws! 💦']);
    expect(inIt.s.freezeTime).toBeCloseTo(0.8, 6);
  });

  it('a print on the floor under a clifftop puddle is still pressed', () => {
    // a path strip over both spots, so a print there is 'sand' unless a puddle takes it
    const strip = { x: 2, z: -30, ux: 1, uz: 0, halfL: 3, halfW: 3, path: true };
    const areaData = { ground: area.ground, puddles: [TOP_PUDDLE] };
    expect(surfaceAt('gorge', areaData, [strip], UNDER.x, UNDER.z)).toBe('sand');
    expect(surfaceAt('gorge', areaData, [strip], TOP_PUDDLE.x + 0.3, TOP_PUDDLE.z)).toBeNull();
  });
});

// Final review I2 (ruling F35): the Snug Cave is out of STAND_ON, and part 3
// gives only its homed cave cat a rectangle of its own, so no other stray and
// no ghost spawns, wanders to or walks into a cave or den.
describe('the Gorge: no stray or ghost goes under a roof', () => {
  const ghostProfile = (id) => ({ playerId: id, petName: id, breed: 'tabby', accessories: {}, greets: 2 });
  const FAR_CAT = new THREE.Vector3(-44, 0, -11);
  const roofed = (x, z) => area.ground.ceil(x, z) !== Infinity;

  it('none is ever under a finite ceiling: spawns, targets and a short walk, over 200 seeds', () => {
    const bad = [];
    const check = (what, x, z) => { if (roofed(x, z)) bad.push(`${what} (${x.toFixed(2)}, ${z.toFixed(2)})`); };
    const random = vi.spyOn(Math, 'random');
    try {
      for (let seed = 1; seed <= 200; seed++) {
        random.mockImplementation(mulberry32(2000 + seed)); // the ghosts' wander, seeded
        // The Snug Cave's homed cat (part 3, C8) lives under its roof: every
        // other stray is checked.
        const strays = createStrayCats(new THREE.Scene(), area, 22, strayStream(seed), { roomSeed: seed, homes: area.strayHomes });
        const homed = strays.strays.filter((s) => s.roam !== null);
        if (homed.length !== 1) bad.push(`seed ${seed}: ${homed.length} homed cats`);
        const ghosts = createGhosts(new THREE.Scene(), area, [ghostProfile('g1'), ghostProfile('g2')], mulberry32(seed));
        for (const [i, s] of strays.strays.entries()) if (s.roam === null) check(`seed ${seed} stray ${i} spawn`, s.group.position.x, s.group.position.z);
        for (const [i, g] of ghosts.list.entries()) check(`seed ${seed} ghost ${i} spawn`, g.group.position.x, g.group.position.z);
        for (let f = 0; f < 100; f++) {
          strays.update(0.1, f * 0.1, FAR_CAT, {});
          ghosts.update(0.1, f * 0.1);
          for (const [i, s] of strays.strays.entries()) {
            if (s.roam !== null) continue;
            check(`seed ${seed} stray ${i}`, s.group.position.x, s.group.position.z);
            if (s.target) check(`seed ${seed} stray ${i} target`, s.target.x, s.target.z);
          }
          for (const [i, g] of ghosts.list.entries()) check(`seed ${seed} ghost ${i}`, g.group.position.x, g.group.position.z);
        }
      }
    } finally {
      random.mockRestore();
    }
    expect([...new Set(bad)].slice(0, 12)).toEqual([]);
  });

  it('STAND_ON holds no cave or den', () => {
    for (const r of STAND_ON) {
      for (const h of GORGE_KEEP_CLEAR_RECTS) {
        const overlap = Math.min(r.maxX, h.maxX) > Math.max(r.minX, h.minX) && Math.min(r.maxZ, h.maxZ) > Math.max(r.minZ, h.minZ);
        expect(overlap, `STAND_ON ${JSON.stringify(r)} over ${JSON.stringify(h)}`).toBe(false);
      }
    }
  });
});

// Part 3, Task 5 (C8, ruling C-F2): a cat lives in the Snug Cave.
describe('the Gorge: the Snug Cave\'s cat', () => {
  const snug = GORGE_CAVES.find((c) => c.id === 'snug');
  const rectOf = (tag) => snug.rects.find((r) => r.tag === tag);

  it('its home is the chamber, and only the bend and chamber are its to stand on', () => {
    expect(area.strayHomes).toHaveLength(1);
    const [home] = area.strayHomes;
    expect([home.x, home.z, home.roam]).toEqual([22.5, 9.5, 2]);
    expect(home.onlyOn).toEqual([rectOf('snug-bend'), rectOf('snug-chamber')]);
    expect(area.ground.y(home.x, home.z)).toBe(snug.y);
    expect(area.ground.ceil(home.x, home.z)).not.toBe(Infinity);
  });

  it('the Snug Cave always has a cat, and both co-walkers see the same one', () => {
    const at = (cats) => cats.strays.find((s) => s.group.position.x === 22.5 && s.group.position.z === 9.5);
    const names = new Set();
    for (const seed of [12345, 1, 2, 3, 99]) {
      const one = createStrayCats(new THREE.Scene(), area, 22, strayStream(seed), { roomSeed: seed, homes: area.strayHomes });
      const two = createStrayCats(new THREE.Scene(), area, 22, strayStream(seed), { roomSeed: seed, homes: area.strayHomes });
      // a co-walker on the low rung casts a prefix of the same list
      const low = createStrayCats(new THREE.Scene(), area, 14, strayStream(seed), { roomSeed: seed, homes: area.strayHomes });
      const [a, b, c] = [one, two, low].map(at);
      expect(a, `seed ${seed}`).toBeTruthy();
      expect([b.name, c.name]).toEqual([a.name, a.name]);
      expect(a.group.position.y).toBe(snug.y);
      names.add(a.name);
    }
    // the name changes walk to walk
    expect(names.size).toBeGreaterThan(1);
  });

  it('a fed cave cat keeps its cave, and the cave is not given to another', () => {
    // Ruling C-F10: she feeds the Snug Cave's cat, so it joins the colony,
    // saved where she fed it. Next walk it stands at home under the roof and
    // stays within its roam, and no ordinary stray is homed. The stream is
    // drawn exactly as before, and two co-walkers see the same cats.
    const [home] = area.strayHomes;
    const FAR_CAT = new THREE.Vector3(-44, 0, -11);
    const counted = (seed) => { const r = strayStream(seed); let n = 0; const f = () => { n++; return r(); }; f.count = () => n; return f; };
    for (const seed of [12345, 1, 2]) {
      for (const [fx, fz] of [[22.5, 9.5], [23.2, 10.4], [22.4, 13]]) { // fed in the chamber, and in the bend
        const first = createStrayCats(new THREE.Scene(), area, 22, strayStream(seed), { roomSeed: seed, homes: area.strayHomes });
        const caveCat = first.strays.find((c) => c.roam !== null);
        const colonyCats = [{ name: caveCat.name, x: fx, z: fz, wear: null }];
        const rngs = [counted(seed), counted(seed)];
        const [one, two] = rngs.map((rng) => createStrayCats(new THREE.Scene(), area, 22, rng, { roomSeed: seed, homes: area.strayHomes, colonyCats }));
        const where = `seed ${seed} fed at (${fx}, ${fz})`;
        for (const rng of rngs) expect(rng.count(), where).toBe(47 + 5 * 22);
        const s = one.strays.find((c) => c.name === caveCat.name);
        expect(s.colony, where).toBe(true);
        expect([s.group.position.x, s.group.position.z], where).toEqual([home.x, home.z]);
        expect(s.group.position.y, where).toBe(snug.y);
        expect(s.roam, where).toBe(home.roam);
        // no ordinary stray is homed: the cave is still its cat's
        expect(one.strays.filter((c) => c.roam !== null).map((c) => c.name), where).toEqual([caveCat.name]);
        const look = (c) => [c.name, c.group.position.x, c.group.position.z, c.roam];
        expect(two.strays.map(look), where).toEqual(one.strays.map(look));
        for (let f = 0; f < 3000; f++) {
          one.update(1 / 30, f / 30, FAR_CAT, {});
          const p = s.group.position;
          expect(Math.hypot(p.x - home.x, p.z - home.z), `${where} frame ${f}`).toBeLessThanOrEqual(home.roam + 1e-6);
          expect(area.ground.ceil(p.x, p.z), `${where} frame ${f}`).not.toBe(Infinity);
        }
      }
    }
  });

  it('walk.js gives the strays the area\'s homes', () => {
    const walkSrc = readFileSync(fileURLToPath(new URL('../src/game/walk.js', import.meta.url)), 'utf8');
    expect(walkSrc).toMatch(/createStrayCats\(scene, areaData, strayCount, strayStream\(roomSeed\), \{[\s\S]*?homes: areaData\.strayHomes \?\? \[\],[\s\S]*?\}\);/);
  });
});

// Final review M3: how high each cave's and den's roof is drawn (the cap from
// its ceiling up to the highest rock beside it): 9 m under the west wall, 20 m
// under the rims, 14 m under the shoulder.
describe('the Gorge: the roofs over the caves and dens', () => {
  it('each cap tops out at the rock it is cut into', () => {
    const want = (tag) => {
      if (tag.startsWith('echo-') || tag === 'denW1' || tag === 'denW2') return WEST_TOP;
      if (tag === 'denLookout') return SHOULDER;
      return 20; // the Snug and Glitter Caves, denE, denTop
    };
    expect(CEILINGS).toHaveLength(15); // the caves' nine, the five dens and the camp den
    for (const c of CEILINGS) expect(capTopFor(c, MASSES), c.tag).toBe(want(c.tag));
    expect([WEST_TOP, SHOULDER]).toEqual([9, 14]);
  });
});

// Part 3, Task 4 (C5): what each deep cave holds, inside its own rock.
const { scanFootprints } = await import('../src/render/contactshadows.js');
describe('the Gorge: inside the deep caves', () => {
  const interiors = scene.children.filter((o) => o.userData.caveId);
  const meshesOf = (g) => {
    const out = [];
    g.traverse((o) => { if (o.isMesh) out.push(o); });
    return out;
  };
  // Every vertex of a mesh, in world space.
  const vertsOf = (m) => {
    const p = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    const out = [];
    for (let i = 0; i < p.count; i++) out.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).clone());
    return out;
  };
  const pathDist = (cave, x, z) => Math.min(...cave.path.slice(1).map((q, i) => segDist(x, z, ...cave.path[i], ...q)));

  it('each deep cave has one interior group, inside its own rectangles, off the walking line', () => {
    expect(interiors.map((g) => g.name)).toEqual(GORGE_CAVES.map((c) => `caveInterior:${c.id}`));
    const COLORS = { echo: 0x9fc7d8, snug: 0xe8c890, glitter: 0xf2d27a };
    for (const cave of GORGE_CAVES) {
      const g = interiors.find((o) => o.userData.caveId === cave.id);
      // hidden until her cat is near (gorgelife.js shows it)
      expect(g.visible).toBe(false);
      const meshes = meshesOf(g);
      // at most two merged meshes, both out of the shadow pass; the Glitter
      // Cave's second is its gold flecks
      expect(meshes.map((m) => m.name)).toEqual(cave.id === 'glitter' ? ['caveCrystals', 'caveFlecks'] : ['caveCrystals']);
      for (const m of meshes) {
        expect(m.userData.noCast, m.name).toBe(true);
        expect(m.castShadow).toBe(false);
        expect(m.material.emissiveIntensity).toBe(0.6);
      }
      expect(meshes[0].material.emissive.getHex()).toBe(COLORS[cave.id]);
      // 10-16 crystal spots along the chamber's walls, each within 0.25 m of a wall
      const spots = gorge.caveCrystalSpots(cave);
      expect(spots.length, cave.id).toBeGreaterThanOrEqual(10);
      expect(spots.length, cave.id).toBeLessThanOrEqual(16);
      const chamber = cave.rects.find((r) => r.tag.endsWith('-chamber'));
      for (const s of spots) {
        const wall = Math.min(s.x - chamber.minX, chamber.maxX - s.x, s.z - chamber.minZ, chamber.maxZ - s.z);
        expect(wall, `${cave.id} (${s.x}, ${s.z})`).toBeLessThanOrEqual(0.25);
        expect(wall).toBeGreaterThan(0);
        expect(s.y).toBe(cave.y);
      }
      const finds = [...area.collectibles, ...GOLD_MICE.gorge].filter((f) => cave.rects.some((r) => rectDist(r, f.x, f.z) === 0));
      expect(finds.length, cave.id).toBeGreaterThanOrEqual(1);
      const crystal = meshes[0];
      for (const m of meshes) {
        for (const v of vertsOf(m)) {
          const where = `${cave.id} ${m.name} (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
          // inside a rectangle of its cave, so never in or through the rock
          expect(cave.rects.some((r) => v.x > r.minX && v.x < r.maxX && v.z > r.minZ && v.z < r.maxZ), where).toBe(true);
          // on its floor and under its roof
          expect(v.y, where).toBeGreaterThanOrEqual(cave.y - 1e-6);
          expect(v.y, where).toBeLessThan(cave.y + 2.6);
          // a crystal is never taller than 0.3 m
          if (m === crystal) expect(v.y - cave.y, where).toBeLessThanOrEqual(0.3);
          // off the walking line, and clear of the finds
          expect(pathDist(cave, v.x, v.z), where).toBeGreaterThanOrEqual(0.6);
          for (const f of finds) expect(Math.hypot(v.x - f.x, v.z - f.z), `${where} by ${f.id}`).toBeGreaterThanOrEqual(0.4);
        }
      }
    }
  });

  it('the interiors are seeded by name and the same every build', () => {
    const again = new THREE.Scene();
    build(again);
    for (const cave of GORGE_CAVES) {
      const a = meshesOf(interiors.find((o) => o.userData.caveId === cave.id));
      const b2 = meshesOf(again.getObjectByName(`caveInterior:${cave.id}`));
      expect(b2.map((m) => Array.from(m.geometry.attributes.position.array)))
        .toEqual(a.map((m) => Array.from(m.geometry.attributes.position.array)));
    }
  });

  it('no interior gets a contact shadow', () => {
    for (const g of interiors) {
      const only = new THREE.Scene();
      only.add(g.clone());
      expect(scanFootprints(only, area.ground), g.name).toEqual([]);
    }
  });

  it("gorge.js hands its interiors to the Gorge's life, which shows the near one", () => {
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    const fill = new THREE.HemisphereLight(0xffffff, 0x333333, 1);
    const life = area.life({ scene, sun, fill, ground: area.ground });
    const shown = () => interiors.filter((g) => g.visible).map((g) => g.userData.caveId);
    life.update(1 / 60, 0, new THREE.Vector3(-16, 0, 23.5));
    expect(shown()).toEqual(['echo']);
    life.update(1 / 60, 0, new THREE.Vector3(SPAWN.x, 0, SPAWN.z));
    expect(shown()).toEqual([]);
    life.dispose();
  });
});
