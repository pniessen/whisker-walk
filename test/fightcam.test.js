import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';

// The builders touch document.createElement('canvas') for their textures.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_t, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const b = await import('../src/world/builder.js');
const {
  findOccluders, segmentBlocked, firstBlocker, chooseFightView, createFightCam, subjectPoints,
  projectPoint, FIGHT_FRAME, CAT_HEIGHTS, OCCLUDER_PAD,
} = await import('../src/fightcam.js');

const BOUNDS = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
const PORTRAIT = { aspect: 375 / 812, fovY: 70 };
const LAND = { aspect: 812 / 375, fovY: 70 };
const DESK = { aspect: 1280 / 720, fovY: 70 };

// A fight subject the way clanfight hands it over: where each cat can be.
function subject(me, it, extra = {}) {
  const dx = me.x - it.x, dz = me.z - it.z, d = Math.hypot(dx, dz);
  return { mid: { x: (me.x + it.x) / 2, z: (me.z + it.z) / 2 }, axis: { x: dx / d, z: dz / d }, me: [me], it: [it], path: [], ...extra };
}

// Trees as they stand in a real scene: built, placed, scanned.
function sceneOf(trees) {
  const scene = new THREE.Scene();
  for (const t of trees) {
    const g = t.kind === 'pine' ? b.pine(t.x, t.z, t.scale ?? 1) : t.kind === 'willow' ? b.willow(t.x, t.z, t.scale ?? 1) : b.tree(t.x, t.z, t.scale ?? 1);
    scene.add(g);
  }
  return scene;
}

function viewIsClear(view, subj, occluders) {
  for (const p of subjectPoints(subj, true)) {
    if (firstBlocker(view.pos, p, occluders, OCCLUDER_PAD)) return false;
  }
  return true;
}

describe('occluder shapes hold the real trees', () => {
  // Every vertex of every tree mesh, in world space, must sit inside one of
  // that tree's shapes: the shapes are what the camera keeps its lines clear of.
  const inside = (shapes, v) => shapes.some((s) => {
    if (s.t === 'cyl') return Math.hypot(v.x - s.x, v.z - s.z) <= s.r + 1e-3 && v.y >= s.y0 - 1e-3 && v.y <= s.y1 + 1e-3;
    const dy = (v.y - s.y) * (s.r / s.ry);
    return Math.hypot(v.x - s.x, dy, v.z - s.z) <= s.r + 1e-3;
  });
  function everyVertexInside(scene) {
    const occ = findOccluders(scene);
    const shapes = occ.flatMap((o) => o.shapes);
    let n = 0;
    scene.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    scene.traverse((m) => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(m.matrixWorld);
        n++;
        if (!inside(shapes, v)) throw new Error(`${m.name || m.parent?.name || 'mesh'} vertex ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} outside`);
      }
    });
    return { n, occ };
  }

  test('oaks (builder.tree), at many spots and scales', () => {
    const trees = [];
    for (let i = 0; i < 60; i++) trees.push({ kind: 'tree', x: ((i * 7.3) % 90) - 45, z: ((i * 13.1) % 90) - 45, scale: 1 + (i % 7) * 0.1 });
    const { n, occ } = everyVertexInside(sceneOf(trees));
    expect(occ).toHaveLength(60);
    expect(n).toBeGreaterThan(1000);
  });

  test('willows, the default curtain and a high one', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 30; i++) scene.add(b.willow(((i * 5.7) % 80) - 40, ((i * 11.3) % 80) - 40, 1 + (i % 5) * 0.12));
    scene.add(b.willow(3, 4, 1.4, { curtainFloor: 2.1 }));
    const { occ } = everyVertexInside(scene);
    expect(occ).toHaveLength(31);
  });

  test('pines, alone and in a merged stand', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 20; i++) scene.add(b.pine(((i * 6.1) % 80) - 40, ((i * 9.7) % 80) - 40, 1.2 + (i % 8) * 0.09));
    const stand = [];
    for (let i = 0; i < 40; i++) stand.push({ x: ((i * 4.3) % 90) - 45, z: ((i * 8.9) % 90) - 45, scale: 1.2 + (i % 8) * 0.09 });
    scene.add(b.pineStand(stand, 7));
    const { occ } = everyVertexInside(scene);
    expect(occ).toHaveLength(60);
    expect(occ.filter((o) => o.obj === null)).toHaveLength(40); // stand trees cannot be hidden one by one
  });
});

describe('segment tests', () => {
  const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 0, scale: 1 }]));
  test('a line through the canopy is blocked; one under it is not', () => {
    expect(segmentBlocked({ x: -6, y: 2.8, z: 0 }, { x: 6, y: 2.8, z: 0 }, occ[0], 0)).toBe(true);
    expect(segmentBlocked({ x: -6, y: 0.3, z: 3 }, { x: 6, y: 0.3, z: 3 }, occ[0], 0)).toBe(false);
  });
  test('a line through the trunk is blocked', () => {
    expect(segmentBlocked({ x: -6, y: 0.4, z: 0 }, { x: 6, y: 0.4, z: 0 }, occ[0], 0)).toBe(true);
  });
  test('a line passing beside the tree is clear', () => {
    expect(firstBlocker({ x: -6, y: 2, z: 4 }, { x: 6, y: 0.3, z: 4 }, occ, 0)).toBe(null);
  });
  test('a camera inside a canopy is blocked', () => {
    expect(segmentBlocked({ x: 0.5, y: 3, z: 0 }, { x: 0.6, y: 3, z: 0.1 }, occ[0], 0)).toBe(true);
  });
});

describe('chooseFightView', () => {
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };

  test('with no trees it keeps the current angle', () => {
    const subj = subject(me, it);
    // (the pair lies along x, so none of these looks down the line between them)
    for (const yaw0 of [0, 1, -0.6, 2.6, Math.PI]) {
      const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...PORTRAIT });
      expect(v.clear).toBe(true);
      const yaw = Math.atan2(v.pos.x - subj.mid.x, v.pos.z - subj.mid.z);
      expect(Math.abs(Math.atan2(Math.sin(yaw - yaw0), Math.cos(yaw - yaw0)))).toBeLessThan(1e-9);
    }
  });

  test('looking straight down the line between the cats, it turns aside so one does not hide the other', () => {
    const subj = subject(me, it);
    const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: Math.PI / 2, ...DESK });
    const yaw = Math.atan2(v.pos.x - subj.mid.x, v.pos.z - subj.mid.z);
    expect(Math.abs(Math.cos(yaw))).toBeGreaterThan(Math.sin((25 * Math.PI) / 180) - 1e-9);
  });

  test('a tree between the camera and the pair: it turns to a clear angle, near the old one', () => {
    const subj = subject(me, it);
    // the current view looks from +z; an oak stands 3 m that way
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 3.2, scale: 1.4 }]));
    const straight = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(viewIsClear(straight, subj, occ)).toBe(false); // the old view really is blocked
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(v.clear).toBe(true);
    expect(viewIsClear(v, subj, occ)).toBe(true);
  });

  test('ringed by trees, every line from the chosen camera to both cats (paws, body, head) is clear', () => {
    const subj = subject(me, it);
    const trees = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      trees.push({ kind: k % 2 ? 'pine' : 'tree', x: Math.cos(a) * 4.2, z: Math.sin(a) * 4.2, scale: 1.3 });
    }
    const occ = findOccluders(sceneOf(trees));
    for (const frame of [PORTRAIT, LAND, DESK]) {
      for (const yaw0 of [0, 0.7, 2, -1.3]) {
        const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0, ...frame });
        expect(v.clear).toBe(true);
        expect(viewIsClear(v, subj, occ)).toBe(true);
      }
    }
  });

  test('both cats project inside the frame above the sheet', () => {
    const subj = subject(me, it);
    for (const frame of [PORTRAIT, LAND, DESK]) {
      const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 1, ...frame });
      for (const p of subjectPoints(subj, false)) {
        const q = projectPoint(v, p, frame.aspect, frame.fovY);
        expect(q.x).toBeGreaterThanOrEqual(-FIGHT_FRAME.x);
        expect(q.x).toBeLessThanOrEqual(FIGHT_FRAME.x);
        expect(q.y).toBeGreaterThanOrEqual(FIGHT_FRAME.bottom);
        expect(q.y).toBeLessThanOrEqual(FIGHT_FRAME.top);
      }
      // the pair's middle sits in the upper part of the screen
      const m = projectPoint(v, { x: subj.mid.x, y: 0.3, z: subj.mid.z }, frame.aspect, frame.fovY);
      expect(m.y).toBeGreaterThan(0.1);
    }
  });

  test('it never puts the camera inside a collider or outside the map', () => {
    const subj = subject({ x: 47.6, z: 0 }, { x: 46, z: 0 });
    const colliders = [{ x: 47, z: 5, r: 1.5 }];
    const v = chooseFightView({ subject: subj, occluders: [], colliders, bounds: BOUNDS, yaw0: Math.PI / 2, ...LAND });
    expect(v.pos.x).toBeLessThanOrEqual(BOUNDS.maxX);
    for (const c of colliders) expect(Math.hypot(v.pos.x - c.x, v.pos.z - c.z)).toBeGreaterThan(c.r);
  });

  test('is deterministic: same inputs, same view', () => {
    const subj = subject(me, it);
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 3.2 }, { kind: 'pine', x: 3, z: 1, scale: 1.5 }]));
    const a = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0.2, ...PORTRAIT });
    const c = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0.2, ...PORTRAIT });
    expect(c).toEqual(a);
  });

  test('boxed in with no clear angle: it names hideable blockers, and hiding them clears the view', () => {
    const subj = subject(me, it);
    const trees = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      trees.push({ kind: 'tree', x: Math.cos(a) * 3.0, z: Math.sin(a) * 3.0, scale: 1 });
    }
    const occ = findOccluders(sceneOf(trees));
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(v.clear).toBe(false);
    expect(v.blockers.length).toBeGreaterThan(0);
    const left = occ.filter((o) => !v.blockers.includes(o));
    expect(viewIsClear(v, subj, left)).toBe(true);
  });
});

// A fake camera: what the follow camera wrote this frame, and where we point it.
function fakeCamera(aspect = PORTRAIT.aspect) {
  const cam = { aspect, fov: 70, position: { x: 0, y: 2.2, z: 4.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, looked: null };
  cam.lookAt = (x, y, z) => { cam.looked = { x, y, z }; };
  return cam;
}

describe('createFightCam (the blend)', () => {
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };
  const subj = subject(me, it);
  const follow = (cam) => cam.position.set(0, 2.2, 4.5);
  const run = (fc, cam, frames, opts) => {
    let r;
    for (let i = 0; i < frames; i++) { follow(cam); cam.looked = null; r = fc.update(1 / 60, { camera: cam, cat: me, ...opts }); }
    return r;
  };

  test('does nothing at all with no fight', () => {
    const fc = createFightCam({ occluders: [], colliders: [], bounds: BOUNDS });
    const cam = fakeCamera();
    expect(run(fc, cam, 10, { subject: null, cameraMode: false })).toBe(false);
    expect(cam.looked).toBe(null);
    expect(cam.position).toMatchObject({ x: 0, y: 2.2, z: 4.5 });
  });

  test('eases in, holds the chosen view, and eases back to the follow camera', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 3.2, scale: 1.4 }]));
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS });
    const cam = fakeCamera();
    run(fc, cam, 120, { subject: subj, cameraMode: false });
    expect(fc.weight).toBe(1);
    const held = { ...cam.position };
    expect(viewIsClear({ pos: held }, subj, occ)).toBe(true);
    // released: some frames in it is between, then home
    run(fc, cam, 10, { subject: null, cameraMode: false });
    expect(fc.weight).toBeGreaterThan(0);
    expect(fc.weight).toBeLessThan(1);
    expect(run(fc, cam, 120, { subject: null, cameraMode: false })).toBe(false);
    expect(fc.weight).toBe(0);
    expect(cam.position).toMatchObject({ x: 0, y: 2.2, z: 4.5 });
  });

  test('reduced motion: a cut in and a cut out, no swoop', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 3.2, scale: 1.4 }]));
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS, reducedMotion: true });
    const cam = fakeCamera();
    run(fc, cam, 1, { subject: subj, cameraMode: false });
    expect(fc.weight).toBe(1);
    expect(viewIsClear({ pos: { ...cam.position } }, subj, occ)).toBe(true);
    expect(run(fc, cam, 1, { subject: null, cameraMode: false })).toBe(false);
    expect(fc.weight).toBe(0);
  });

  test('a blocked follow view is cut away from on the first frame', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 3.2, scale: 1.4 }]));
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS });
    const cam = fakeCamera();
    run(fc, cam, 1, { subject: subj, cameraMode: false });
    expect(fc.weight).toBe(1);
    expect(viewIsClear({ pos: { ...cam.position } }, subj, occ)).toBe(true);
  });

  test('never in photo mode', () => {
    const fc = createFightCam({ occluders: [], colliders: [], bounds: BOUNDS });
    const cam = fakeCamera();
    expect(run(fc, cam, 30, { subject: subj, cameraMode: true })).toBe(false);
    expect(cam.looked).toBe(null);
    run(fc, cam, 60, { subject: subj, cameraMode: false });
    expect(fc.weight).toBe(1);
    expect(run(fc, cam, 1, { subject: subj, cameraMode: true })).toBe(false);
    expect(fc.weight).toBe(0);
  });

  test('hides the blockers only while it needs to, and shows them again', () => {
    const trees = [];
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      trees.push({ kind: 'tree', x: Math.cos(a) * 3.0, z: Math.sin(a) * 3.0, scale: 1 });
    }
    const occ = findOccluders(sceneOf(trees));
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS, reducedMotion: true });
    const cam = fakeCamera();
    run(fc, cam, 1, { subject: subj, cameraMode: false });
    const hidden = occ.filter((o) => o.obj.visible === false);
    expect(hidden.length).toBeGreaterThan(0);
    run(fc, cam, 1, { subject: null, cameraMode: false });
    expect(occ.every((o) => o.obj.visible === true)).toBe(true);
  });

  test('a new subject the old view still suits keeps the view', () => {
    const fc = createFightCam({ occluders: [], colliders: [], bounds: BOUNDS, reducedMotion: true });
    const cam = fakeCamera();
    run(fc, cam, 1, { subject: subj, cameraMode: false });
    const a = { ...cam.position };
    run(fc, cam, 1, { subject: subject({ x: 0.85, z: 0 }, it), cameraMode: false });
    expect(Math.hypot(cam.position.x - a.x, cam.position.z - a.z)).toBeLessThan(0.2);
  });
});

test('the cat heights cover paws to a pouncing head', () => {
  expect(Math.min(...CAT_HEIGHTS)).toBeLessThanOrEqual(0.1);
  expect(Math.max(...CAT_HEIGHTS)).toBeGreaterThanOrEqual(0.8);
});
