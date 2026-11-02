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
const { shallowExcess, rooftopSpots } = await import('../src/world/builder.js');
const { CLIFFTOP, STAND_ON, GORGE_CAVES, mapShapes } = await import('../src/world/gorgeshape.js');
const { cameraOffset } = await import('../src/catcam.js');
const { ZOOM_STEPS } = await import('../src/camzoom.js');
const { PITCH_MAX } = await import('../src/player.js');
const { GORGE_SPAWN, GORGE_BOUNDS } = await import('./helpers/gorgeflood.js');

const { build, SPAWN, GORGE_WATERS, GORGE_PATHS, GORGE_HORIZON } = gorge;

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
    const roofs = rooftopSpots(GORGE_HORIZON.rooftops, GORGE_HORIZON.inner, GORGE_HORIZON.outer, GORGE_HORIZON.salt);
    expect(roofs).toHaveLength(10);
    for (const r of roofs) expect(r.z, `rooftop at (${r.x}, ${r.z})`).toBeGreaterThan(50);
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

