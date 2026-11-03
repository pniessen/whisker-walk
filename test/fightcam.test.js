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
  findOccluders, segmentBlocked, firstBlocker, chooseFightView, createFightCam, subjectPoints, framePoints, CAT_BODY,
  projectPoint, FIGHT_FRAME, CAT_HEIGHTS, OCCLUDER_PAD, maxLean, blendClear, RINGS, liftedPoints,
  ourCatHidden, intruderHidden, itNearer, sheetTopFrom, frameBottomFor, frameClutter, SIDE_COST, CLUTTER_COST, CLUTTER_HIDE,
} = await import('../src/fightcam.js');
const { fightReach, FIGHT_GAP } = await import('../src/game/clanfight.js');
const { SIDE_AMPLITUDE_FRACTION } = await import('../src/render/wind.js');

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
    if (firstBlocker(view.pos, p, occluders)) return false;
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

describe('the pads cover the wind', () => {
  // Each tree leaned as far as the wind code can lean it (both axes at their
  // peak at once, under the strongest intensity), scanned upright: every
  // leaned vertex must still sit inside its upright shape grown by the shape's
  // sway pad alone (its OCCLUDER_PAD margin not counted).
  const insidePadded = (shapes, v) => shapes.some((sh) => {
    const g = sh.p - OCCLUDER_PAD + 1e-3;
    if (sh.t === 'cyl') return Math.hypot(v.x - sh.x, v.z - sh.z) <= sh.r + g && v.y >= sh.y0 - g && v.y <= sh.y1 + g;
    const k = (sh.r + g) / (sh.ry + g);
    return Math.hypot(v.x - sh.x, (v.y - sh.y) * k, v.z - sh.z) <= sh.r + g;
  });
  for (const [kind, scale] of [['tree', 1.6], ['tree', 1], ['willow', 1.5], ['pine', 1.9], ['pine', 1.2]]) {
    test(`${kind} at scale ${scale}, leaned every way`, () => {
      const scene = sceneOf([{ kind, x: 3, z: -2, scale }]);
      const [occ] = findOccluders(scene);
      const g = scene.children[0];
      const main = maxLean(scale) / Math.hypot(1, SIDE_AMPLITUDE_FRACTION);
      const v = new THREE.Vector3();
      for (const [sz, sx] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        g.rotation.set(sx * main * SIDE_AMPLITUDE_FRACTION, 0, sz * main);
        scene.updateMatrixWorld(true);
        g.traverse((m) => {
          if (!m.isMesh) return;
          const pos = m.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
            if (!insidePadded(occ.shapes, v)) throw new Error(`${kind} ${scale}: ${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)} outside`);
          }
        });
      }
    });
  }

  test('the Great Oak in rain gets well over the old flat 0.15 m on its canopy', () => {
    const [occ] = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 0, scale: 1.6 }]));
    const canopy = occ.shapes.find((sh) => sh.t === 'ell');
    expect(canopy.p).toBeGreaterThan(OCCLUDER_PAD + 0.4);
  });

  // The Gorge's west-top stand grows 9 m up (builder.pineStand's `y`): its
  // occluder stands there too, scaled with the stand like x and z; a tree
  // with no y is where it always was.
  test('a lifted stand pine is an occluder at its lifted height', () => {
    const scene = new THREE.Scene();
    const g = b.pineStand([{ x: 2, z: -3, scale: 1.4, y: 9 }, { x: -5, z: 4, scale: 1.4 }], 3);
    g.position.set(1, 0.5, 2);
    g.scale.setScalar(2);
    scene.add(g);
    const [lifted, flat] = findOccluders(scene);
    expect([lifted.x, lifted.z, flat.x, flat.z]).toEqual([1 + 2 * 2, 2 - 3 * 2, 1 - 5 * 2, 2 + 4 * 2]);
    const lows = (o) => o.shapes.map((sh) => (sh.t === 'cyl' ? sh.y0 : sh.y));
    const [lo, fo] = [lows(lifted), lows(flat)];
    for (let i = 0; i < lo.length; i++) expect(lo[i] - fo[i]).toBeCloseTo(9 * 2, 9);
    expect(lifted.top - flat.top).toBeCloseTo(9 * 2, 9);
  });

  test('a stand pine never sways, so it keeps the bare margin', () => {
    const scene = new THREE.Scene();
    scene.add(b.pineStand([{ x: 0, z: 0, scale: 1.5 }], 3));
    const [occ] = findOccluders(scene);
    for (const sh of occ.shapes) expect(sh.p).toBe(OCCLUDER_PAD);
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

  test('with no trees it takes the nearer side-on angle', () => {
    const subj = subject(me, it);
    // (the pair lies along x, so side-on is yaw 0 or pi; none of these looks
    // from the intruder's side, where our cat would be the farther, which
    // turns the camera: see 'our cat stays in view' below. Polish fightcam2:
    // side-on beats keeping the current angle, SIDE_COST.)
    for (const yaw0 of [0, 1, 0.6, 2.6, Math.PI]) {
      const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...PORTRAIT });
      expect(v.clear).toBe(true);
      const yaw = Math.atan2(v.pos.x - subj.mid.x, v.pos.z - subj.mid.z);
      // within 15 degrees of perpendicular to the cats' line (along x)...
      expect(Math.abs(Math.cos(yaw - Math.PI / 2)), `yaw0 ${yaw0}`).toBeLessThan(0.27);
      // ...on the side nearer yaw0
      expect(Math.cos(yaw - yaw0), `yaw0 ${yaw0}`).toBeGreaterThan(0);
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
      for (const p of framePoints(subj)) {
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

  test('boxed in by stand pines (none can be hidden): the spot with the fewest blockers, not an unchecked one', () => {
    const subj = subject(me, it);
    const stand = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      stand.push({ x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2, scale: 1.3 });
    }
    // and a thicket on the side the camera looks from now (yaw 0 is +z)
    for (const [x, z] of [[-1.5, 5.5], [0, 5.2], [1.5, 5.5], [-0.8, 7], [0.8, 7], [0, 8.5]]) stand.push({ x, z, scale: 1.3 });
    const scene = new THREE.Scene();
    scene.add(b.pineStand(stand, 5));
    const occ = findOccluders(scene);
    const count = (pos) => occ.filter((o) => subjectPoints(subj, true).some((p) => segmentBlocked(pos, p, o))).length;
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(v.clear).toBe(false);
    expect(v.unhidden).toBeGreaterThan(0);
    expect(v.blockers).toEqual([]); // nothing it could hide
    // the old last resort: the first ring straight back
    const back = { x: subj.mid.x, y: 2.2, z: subj.mid.z + 5.5 };
    expect(count(v.pos)).toBe(v.unhidden);
    expect(count(v.pos)).toBeLessThan(count(back));
    for (const p of subjectPoints(subj, false)) {
      const q = projectPoint(v, p, PORTRAIT.aspect, PORTRAIT.fovY);
      expect(q.y).toBeGreaterThanOrEqual(FIGHT_FRAME.bottom);
      expect(Math.abs(q.x)).toBeLessThanOrEqual(FIGHT_FRAME.x);
    }
  });
});

// Polish (camps) Task 5: the survey's fight shots had the camera behind the
// intruder, so it hid my cat. The ranking now prefers views where our cat is
// seen past the intruder, and our cat is the nearer one; and it frames
// tighter and lower.
describe('our cat stays in view, tight and low', () => {
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };
  const subj = subject(me, it);
  const behindIt = { x: -0.8 - 3.4, y: 1.5, z: 0 };  // on the line through both cats, past the intruder
  const behindMe = { x: 0.8 + 3.4, y: 1.5, z: 0 };
  const side = { x: 0, y: 1.5, z: 4.2 };

  test('ourCatHidden: 1 straight behind the intruder, 0 behind our cat and side-on', () => {
    expect(ourCatHidden(behindIt, subj)).toBe(1);
    expect(ourCatHidden(behindMe, subj)).toBe(0);
    expect(ourCatHidden(side, subj)).toBe(0);
    // riding the ground: the same, lifted with the pair
    expect(ourCatHidden({ ...behindIt, y: behindIt.y + 3 }, subj, 3)).toBe(1);
  });

  test('ourCatHidden: a subject whose anchors sit on the middle keeps every spot', () => {
    // both anchors on the middle (q 0): our cat's spot on the intruder's side
    // still counts, so the side view is half hidden, not wholly
    const onMid = { mid: { x: 0, z: 0 }, axis: { x: 1, z: 0 }, me: [{ x: 0, z: 0 }, { x: -2, z: 0 }], it: [{ x: 0, z: 0 }], path: [] };
    expect(ourCatHidden(side, onMid)).toBe(0.5);
  });

  test('itNearer: true behind the intruder, false behind our cat and side-on', () => {
    expect(itNearer(behindIt, subj)).toBe(true);
    expect(itNearer(behindMe, subj)).toBe(false);
    expect(itNearer(side, subj)).toBe(false);
  });

  test('a real fight subject (spots that run to the other cat): side-on hides nothing, end-on past the intruder hides it all', () => {
    for (const actions of [false, true]) {
      const f = fightReach({ x: FIGHT_GAP / 2, z: 0 }, { x: -FIGHT_GAP / 2, z: 0 }, () => true, { actions });
      expect(ourCatHidden(side, f), `actions ${actions}`).toBe(0);
      expect(ourCatHidden(behindMe, f), `actions ${actions}`).toBe(0);
      expect(ourCatHidden(behindIt, f), `actions ${actions}`).toBeGreaterThan(0.5);
      expect(itNearer(behindIt, f)).toBe(true);
      expect(itNearer(behindMe, f)).toBe(false);
    }
  });

  test('looking from behind the intruder, it turns so the intruder hides nothing and our cat is the nearer', () => {
    for (const frame of [PORTRAIT, LAND, DESK]) {
      for (const yaw0 of [-Math.PI / 2, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6]) {
        const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...frame });
        expect(v.clear).toBe(true);
        expect(ourCatHidden(v.pos, subj)).toBe(0);
        expect(itNearer(v.pos, subj)).toBe(false);
      }
    }
  });

  test('on open ground at desktop it takes a tight ring, with the pair low in the open part of the screen', () => {
    for (const yaw0 of [0, 1, Math.PI, -2.5]) {
      const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...DESK });
      expect(v.ring).toBeLessThanOrEqual(4);
      expect(RINGS[v.ring].d).toBeLessThan(5);
      const m = projectPoint(v, { x: subj.mid.x, y: 0.3, z: subj.mid.z }, DESK.aspect, DESK.fovY);
      expect(m.y).toBeLessThan(0.2);
      expect(m.y).toBeGreaterThan(FIGHT_FRAME.bottom);
    }
  });
});

// Polish fightcam2, Task 1: the survey's Woods fights sat small, 3/4 from
// behind, with an oak trunk beside the camera filling a third of the screen.
describe('framing: tight, side-on, no trunk wall', () => {
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };
  const subj = subject(me, it);
  const yawOf = (v, s) => Math.atan2(v.pos.x - s.mid.x, v.pos.z - s.mid.z);
  const sideOn = (v, s) => Math.abs(Math.cos(yawOf(v, s) - Math.atan2(s.axis.x, s.axis.z)));
  // the nearest a tree may stand and still count as in front of the pair
  const nearDepthOf = (v, s, frame) => Math.min(...[s.me[0], s.it[0]].map((p) => projectPoint(v, { x: p.x, y: 0.3, z: p.z }, frame.aspect, frame.fovY).z)) - CAT_BODY;

  test('on open ground, landscape and desktop take a ring of d <= 3.4', () => {
    for (const frame of [LAND, DESK]) {
      for (const yaw0 of [0, 1, Math.PI, -2.5]) {
        const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...frame });
        expect(RINGS[v.ring].d, `aspect ${frame.aspect} yaw0 ${yaw0}`).toBeLessThanOrEqual(3.4);
        expect(v.clear).toBe(true);
      }
    }
  });

  test('on open ground every frame turns side-on', () => {
    for (const frame of [PORTRAIT, LAND, DESK]) {
      for (const yaw0 of [0, 0.6, 1, 2.6, Math.PI, Math.PI / 2 + 0.6]) {
        const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...frame });
        expect(sideOn(v, subj), `aspect ${frame.aspect} yaw0 ${yaw0}`).toBeLessThan(0.27);
      }
    }
  });

  test('portrait keeps a side-on view', () => {
    const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(RINGS[v.ring].d).toBeGreaterThanOrEqual(4.2);
    expect(sideOn(v, subj)).toBeLessThan(0.27);
    expect(ourCatHidden(v.pos, subj)).toBe(0);
  });

  // At fovY 70 a cat's 0.77 m (paws 0.08 to head 0.85) fills a quarter of
  // the frame height only from about 2.2 m. The 2.5 m ring (a controller
  // ruling, fix round 1) gives 0.224, measured; the 3.0 m ring gave 0.18, and
  // before this task landscape took the 4.2 m ring: 0.125. The game always
  // measures the sheet in a fight (main.js sheetTop), so the frame bottom is
  // passed; with none, today's aim frames the real subject's paws too low for
  // the tight rings.
  test('landscape cats fill more of the frame height: the 2.5 m ring, over a fifth of it', () => {
    const f = fightReach({ x: FIGHT_GAP / 2, z: 0 }, { x: -FIGHT_GAP / 2, z: 0 }, () => true, { actions: true });
    const v = chooseFightView({ subject: f, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, frameBottom: FIGHT_FRAME.bottom, ...LAND });
    expect(RINGS[v.ring].d).toBeLessThanOrEqual(2.5);
    const a = f.me[0];
    const bottom = projectPoint(v, { x: a.x, y: 0.08, z: a.z }, LAND.aspect, LAND.fovY);
    const top = projectPoint(v, { x: a.x, y: 0.85, z: a.z }, LAND.aspect, LAND.fovY);
    expect((top.y - bottom.y) / 2).toBeGreaterThanOrEqual(0.22);
  });

  // The oak in front on the intruder's side (x < 0): one yaw step toward our
  // cat's side clears it, and our cat stays the nearer.
  test('a big oak beside the line is avoided', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: -1.6, z: 2.2, scale: 1.4 }]));
    const oak = occ[0];
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0, ...DESK });
    const share = frameClutter(v.pos, v, oak, DESK.aspect, DESK.fovY, FIGHT_FRAME.bottom, nearDepthOf(v, subj, DESK));
    expect(share < CLUTTER_HIDE || v.clutter.includes(oak), `share ${share}`).toBe(true);
    // the cost steers: without the oak the camera would stand elsewhere, where
    // the oak would cover more of the frame
    const v0 = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, ...DESK });
    expect(Math.hypot(v.pos.x - v0.pos.x, v.pos.y - v0.pos.y, v.pos.z - v0.pos.z)).toBeGreaterThan(0.1);
    const share0 = frameClutter(v0.pos, v0, oak, DESK.aspect, DESK.fovY, FIGHT_FRAME.bottom, nearDepthOf(v0, subj, DESK));
    expect(share, `with the oak ${share}, without ${share0}`).toBeLessThan(share0);
    expect(itNearer(v.pos, subj)).toBe(false);
    expect(ourCatHidden(v.pos, subj)).toBe(0);
  });

  // Final review: on our cat's side (x > 0) the step round it (yaw -15) puts
  // the intruder 0.4 m nearer the camera. Our cat in front outranks the
  // clutter: the camera keeps the side-on spot and hides the oak instead.
  test('dodging an oak never puts the intruder in front: the oak is hidden instead', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 1.6, z: 2.2, scale: 1.4 }]));
    const oak = occ[0];
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0, ...DESK });
    expect(itNearer(v.pos, subj)).toBe(false);
    expect(ourCatHidden(v.pos, subj)).toBe(0);
    expect(sideOn(v, subj)).toBeLessThan(0.27);
    expect(RINGS[v.ring].d).toBeLessThanOrEqual(3.0);
    expect(v.clutter).toContain(oak);
  });

  test('frameClutter: a trunk right beside the camera covers much of the frame; one behind the pair none', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 1.6, z: 2.2, scale: 1.4 }, { kind: 'tree', x: 1, z: -4, scale: 1.4 }]));
    const v = { pos: { x: 0, y: 1.15, z: 3.0 }, look: { x: 0, y: 0.3, z: 0 } };
    const nd = nearDepthOf(v, subj, DESK);
    expect(frameClutter(v.pos, v, occ[0], DESK.aspect, DESK.fovY, FIGHT_FRAME.bottom, nd)).toBeGreaterThan(CLUTTER_HIDE);
    expect(frameClutter(v.pos, v, occ[1], DESK.aspect, DESK.fovY, FIGHT_FRAME.bottom, nd)).toBe(0);
    expect(SIDE_COST).toBe(8);
    expect(CLUTTER_COST).toBe(20);
    expect(CLUTTER_HIDE).toBe(0.12);
  });

  function ringed() {
    const scene = new THREE.Scene();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.2;
      const r = 2.6 + (k % 4) * 0.2;
      scene.add(b.tree(Math.cos(a) * r, Math.sin(a) * r, 1.1 + (k % 3) * 0.15));
    }
    scene.add(b.pineStand([{ x: 0.3, z: -3.0, scale: 1.3 }], 5));
    return findOccluders(scene);
  }

  test('clutter lists only hideable trees in front of the pair', () => {
    const occ = ringed();
    let seen = 0;
    for (const frame of [PORTRAIT, LAND, DESK]) {
      for (const yaw0 of [0, 0.7, 2, -1.3, Math.PI]) {
        const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0, ...frame });
        expect(Array.isArray(v.clutter)).toBe(true);
        const midDepth = projectPoint(v, { x: subj.mid.x, y: 0.3, z: subj.mid.z }, frame.aspect, frame.fovY).z;
        for (const o of v.clutter) {
          expect(o.obj).toBeTruthy();
          expect(projectPoint(v, { x: o.x, y: 0.3, z: o.z }, frame.aspect, frame.fovY).z).toBeLessThan(midDepth);
          expect(v.blockers.includes(o)).toBe(false);
        }
        seen += v.clutter.length;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  test('createFightCam hides clutter and shows it again', () => {
    const occ = ringed();
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: Math.atan2(0, 4.5), aspect: PORTRAIT.aspect, fovY: 70 });
    expect(v.clutter.length).toBeGreaterThan(0);
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS, reducedMotion: true });
    const cam = fakeCamera();
    const step = (s) => { cam.position.set(0, 2.2, 4.5); fc.update(1 / 60, { camera: cam, cat: me, subject: s, cameraMode: false }); };
    step(subj);
    expect(fc.view.clutter.length).toBeGreaterThan(0);
    for (const o of fc.view.clutter) expect(o.obj.visible).toBe(false);
    const held = fc.view.clutter;
    step(null);
    expect(fc.weight).toBe(0);
    for (const o of held) expect(o.obj.visible).toBe(true);
    step(subj);
    for (const o of held) expect(o.obj.visible).toBe(false);
    fc.dispose();
    for (const o of occ) if (o.obj) expect(o.obj.visible).toBe(true);
  });

  // Final review: the camera eases out over about half a second, still by the
  // fight view; a clutter trunk beside the lens must not pop back meanwhile.
  test('the hidden trees stay hidden while the camera eases out, and come back once it is home', () => {
    const occ = ringed();
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS });
    const cam = fakeCamera();
    const step = (s) => { cam.position.set(0, 2.2, 4.5); fc.update(1 / 60, { camera: cam, cat: me, subject: s, cameraMode: false }); };
    for (let i = 0; i < 60; i++) step(subj);
    expect(fc.weight).toBe(1);
    const held = [...fc.view.clutter, ...fc.view.blockers];
    expect(fc.view.clutter.length).toBeGreaterThan(0);
    for (const o of held) expect(o.obj.visible).toBe(false);
    let easing = 0;
    for (let i = 0; i < 120 && fc.weight > 0; i++) {
      step(null);
      if (fc.weight > 0) {
        easing++;
        for (const o of held) expect(o.obj.visible, `weight ${fc.weight}`).toBe(false);
      }
    }
    expect(easing).toBeGreaterThan(10);
    expect(fc.weight).toBe(0);
    for (const o of held) expect(o.obj.visible).toBe(true);
    // a fight that ends mid-ease and the walk ending still bring every tree back
    for (let i = 0; i < 60; i++) step(subj);
    for (let i = 0; i < 5; i++) step(null);
    expect(fc.weight).toBeGreaterThan(0);
    fc.dispose();
    for (const o of occ) if (o.obj) expect(o.obj.visible).toBe(true);
  });
});

// Controller ruling on Task 5: a lifted top (CAT_HEIGHTS[2] + y) must stay in
// frame, but its line of sight only ranks views. Every point that exists today
// stays hard, exactly as before.
describe('lifted tops are soft in the view choice', () => {
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };
  const lifted = () => subject({ ...me, y: 0.75 }, it); // its top at (0.8, 1.6, 0)
  const TOP = { x: 0.8, y: CAT_HEIGHTS[2] + 0.75, z: 0 };
  // one bare ball (no pad) of radius r at (x, y, z)
  const ball = (obj, x, y, z, r) => ({ obj, x, z, R: r, top: y + r, shapes: [{ t: 'ell', x, y, z, r, ry: r, p: 0 }] });
  const hardClear = (v, subj, occ) => subjectPoints(subj, true, false).every((p) => !firstBlocker(v.pos, p, occ));

  test('subjectPoints(…, false) leaves the lifted tops out', () => {
    const subj = lifted();
    expect(subjectPoints(subj, true, false)).toEqual(subjectPoints(subject(me, it), true));
    expect(subjectPoints(subj, true).length).toBe(subjectPoints(subj, true, false).length + 1);
  });

  test('a stand pine round a lifted top never disqualifies a view', () => {
    const subj = lifted();
    const occ = [ball(null, TOP.x, TOP.y, TOP.z, 0.3)]; // no camera can see that top
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0.4, ...PORTRAIT });
    expect(hardClear(v, subj, occ)).toBe(true);
    expect(v.unhidden ?? 0).toBe(0);
    expect(v.blockers).toEqual([]);
    expect(v.brushed).toBe(1);
    expect(v.clear).toBe(false);
    // the same view as with no tree at all: nothing could do better
    const free = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0.4, ...PORTRAIT });
    expect(v.pos).toEqual(free.pos);
    expect(free.brushed).toBe(0);
    expect(free.clear).toBe(true);
  });

  test('a hideable tree round a lifted top is hidden; a hard point still rules', () => {
    const subj = lifted();
    const tree = ball({ name: 'oak' }, TOP.x, TOP.y, TOP.z, 0.3);
    const v = chooseFightView({ subject: subj, occluders: [tree], colliders: [], bounds: BOUNDS, yaw0: 0.4, ...PORTRAIT });
    expect(v.blockers).toEqual([tree]);
    expect(v.brushed).toBe(0);
    expect(v.clear).toBe(false);
  });

  test('among views that clear every hard point, one that also sees the lifted top wins', () => {
    const subj = lifted();
    // from yaw 0 (camera at +z) a stand pine's ball sits on the line to the top only
    const straight = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(straight.pos.x).toBeCloseTo(0, 9);
    const cam = straight.pos;
    const mid = { x: (cam.x + TOP.x) / 2, y: (cam.y + TOP.y) / 2, z: (cam.z + TOP.z) / 2 };
    const occ = [ball(null, mid.x, mid.y, mid.z, 0.2)];
    expect(firstBlocker(straight.pos, TOP, occ)).not.toBe(null); // the old view really loses the top
    expect(hardClear(straight, subj, occ)).toBe(true);           // ...and only the top
    const v = chooseFightView({ subject: subj, occluders: occ, colliders: [], bounds: BOUNDS, yaw0: 0, ...PORTRAIT });
    expect(v.clear).toBe(true);
    expect(v.brushed).toBe(0);
    expect(firstBlocker(v.pos, TOP, occ)).toBe(null);
  });

  test('the lifted top must still be in frame', () => {
    const subj = subject({ ...me, y: 0.75 }, it);
    for (const frame of [PORTRAIT, LAND, DESK]) {
      const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 1, ...frame });
      const q = projectPoint(v, TOP, frame.aspect, frame.fovY);
      expect(q.y).toBeLessThanOrEqual(FIGHT_FRAME.top);
      expect(q.y).toBeGreaterThanOrEqual(FIGHT_FRAME.bottom);
      expect(Math.abs(q.x)).toBeLessThanOrEqual(FIGHT_FRAME.x);
    }
  });

  test('blendClear: a lifted top behind a tree does not stop an ease; a hard point does', () => {
    const subj = lifted();
    const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0.4, ...PORTRAIT });
    expect(blendClear(v, v, subj, [ball(null, TOP.x, TOP.y, TOP.z, 0.3)], PORTRAIT.aspect, PORTRAIT.fovY)).toBe(true);
    expect(blendClear(v, v, subj, [ball(null, 0.8, 0.4, 0, 0.3)], PORTRAIT.aspect, PORTRAIT.fovY)).toBe(false);
  });
});

// A fake camera: what the follow camera wrote this frame, and where we point it.
function fakeCamera(aspect = PORTRAIT.aspect) {
  const cam = { aspect, fov: 70, position: { x: 0, y: 2.2, z: 4.5, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, looked: null };
  cam.lookAt = (x, y, z) => { cam.looked = { x, y, z }; };
  return cam;
}

// Task 5 (fight moves and scars): a spot may carry `y`, how far the cat's top
// rises above its standing top there; the camera then also keeps that top.
describe('subjectPoints keeps a lifted cat\'s top', () => {
  test('adds exactly one point per lifted spot, CAT_HEIGHTS[2] + y up; spots without y are unchanged', () => {
    const plain = { me: [{ x: 1, z: 2 }], it: [{ x: -1, z: 0 }], path: [{ x: 4, z: 4 }] };
    const lifted = {
      me: [{ x: 1, z: 2 }, { x: 1.2, z: 2, y: 0.3 }, { x: 1.4, z: 2, y: 0 }],
      it: [{ x: -1, z: 0, y: 0.75 }],
      path: [{ x: 4, z: 4 }],
    };
    expect(subjectPoints(plain, false)).toEqual(CAT_HEIGHTS.flatMap((y) => [{ x: 1, y, z: 2 }]).concat(CAT_HEIGHTS.map((y) => ({ x: -1, y, z: 0 }))));
    const pts = subjectPoints(lifted, false);
    expect(pts.length).toBe(4 * CAT_HEIGHTS.length + 2);
    expect(pts).toContainEqual({ x: 1.2, y: CAT_HEIGHTS[2] + 0.3, z: 2 });
    expect(pts).toContainEqual({ x: -1, y: CAT_HEIGHTS[2] + 0.75, z: 0 });
    expect(pts.filter((p) => p.x === 1.4)).toEqual(CAT_HEIGHTS.map((y) => ({ x: 1.4, y, z: 2 })));
    expect(subjectPoints(lifted, true).length).toBe(5 * CAT_HEIGHTS.length + 2);
    // framePoints frames the lifted top too
    expect(framePoints(lifted)).toContainEqual({ x: 1.2, y: CAT_HEIGHTS[2] + 0.3, z: 2 });
  });
});

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

test('the frame holds each cat\'s whole body (nose to tail), not just its middle', () => {
  const pts = framePoints({ me: [{ x: 0, z: 0 }], it: [], path: [] });
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    expect(pts.some((p) => Math.abs(p.x - dx * CAT_BODY) < 1e-9 && Math.abs(p.z - dz * CAT_BODY) < 1e-9)).toBe(true);
  }
  expect(CAT_BODY).toBeGreaterThanOrEqual(0.55);
});

test('the cat heights cover paws to a pouncing head', () => {
  expect(Math.min(...CAT_HEIGHTS)).toBeLessThanOrEqual(0.1);
  expect(Math.max(...CAT_HEIGHTS)).toBeGreaterThanOrEqual(0.8);
});

describe('camera moves are checked: ease only when every step of it is clear', () => {
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };
  const subj = subject(me, it);

  test('blendClear: a clear straight move passes, one through a canopy or out of frame fails', () => {
    // two views 1.1 rad apart, both on our cat's side and off the line between
    // the cats: the chosen side-on view, and the same view turned 1.1 rad
    // about the pair's middle (the origin; polish fightcam2: chooseFightView
    // now turns every view side-on, so it no longer hands back yaw 1.1), on
    // the 4.2 m ring this test was written for (ring0 holds it: from the
    // 3.0 m ring the straight move's middle comes in close enough to cut a
    // cat off the frame, which blendClear rightly fails)
    const a = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, ring0: 3, ...DESK });
    expect(RINGS[a.ring].d).toBe(4.2);
    const turn = (p, t) => ({ x: p.x * Math.cos(t) + p.z * Math.sin(t), y: p.y, z: -p.x * Math.sin(t) + p.z * Math.cos(t) });
    const c = { pos: turn(a.pos, 1.1), look: turn(a.look, 1.1) };
    expect(a.yaw).toBe(0);
    expect(Math.atan2(c.pos.x, c.pos.z)).toBeCloseTo(1.1, 9);
    expect(blendClear(a, c, subj, [], DESK.aspect, DESK.fovY)).toBe(true);
    // an oak whose canopy sits on the move's middle, clear of both ends' lines
    const midPos = { x: (a.pos.x + c.pos.x) / 2, z: (a.pos.z + c.pos.z) / 2 };
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: midPos.x * 1.25, z: midPos.z * 1.25, scale: 0.8 }]));
    expect(viewIsClear(a, subj, occ)).toBe(true);
    expect(viewIsClear(c, subj, occ)).toBe(true);
    expect(blendClear(a, c, subj, occ, DESK.aspect, DESK.fovY)).toBe(false);
    // from a view that does not frame the pair (looking away)
    const away = { pos: a.pos, look: { x: a.pos.x * 2, y: a.pos.y, z: a.pos.z * 2 } };
    expect(blendClear(away, c, subj, [], DESK.aspect, DESK.fovY)).toBe(false);
  });

  // Drives a fight with the follow camera parked at `follow`, then the rounds'
  // subject, and checks EVERY frame shows both cats in the frame above the
  // sheet with every line to them clear of the (unhidden) trees.
  function everyFrame(follow, occ, frame = PORTRAIT) {
    const fc = createFightCam({ occluders: occ, colliders: [], bounds: BOUNDS });
    const cam = fakeCamera(frame.aspect);
    const rounds = subject({ x: 0.9, z: 0.3 }, it);
    let frames = 0;
    for (const [sj, n] of [[subj, 60], [rounds, 60]]) {
      for (let i = 0; i < n; i++) {
        cam.position.set(follow.x, follow.y, follow.z);
        fc.update(1 / 60, { subject: sj, camera: cam, cat: me });
        const shown = { pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, look: cam.looked };
        const left = occ.filter((o) => !o.obj || o.obj.visible !== false);
        for (const p of framePoints(sj)) {
          const q = projectPoint(shown, p, frame.aspect, frame.fovY);
          expect(Math.abs(q.x) <= FIGHT_FRAME.x && q.y >= FIGHT_FRAME.bottom && q.y <= FIGHT_FRAME.top, `frame ${frames} out of frame`).toBe(true);
          expect(firstBlocker(shown.pos, p, left), `frame ${frames} a tree in the way`).toBe(null);
        }
        frames++;
      }
    }
    return fc;
  }

  test('a far follow view that already frames the pair eases in, and every frame of it is good', () => {
    const fc = everyFrame({ x: 6, y: 6.5, z: 11 }, []);
    expect(fc.cuts).toBe(0);
  });

  test('the default follow view does not frame the pair above the sheet: a cut, and every frame is good', () => {
    const fc = everyFrame({ x: 0.8, y: 2.2, z: 4.5 }, []);
    expect(fc.cuts).toBeGreaterThan(0);
  });

  test('a tree on the way in: a cut, and every frame is good', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 4.3, z: 7.9, scale: 1.4 }]));
    const fc = everyFrame({ x: 6, y: 6.5, z: 11 }, occ);
    expect(fc.cuts).toBeGreaterThan(0);
  });

  test('ringed by trees, portrait, landscape and desktop: every frame is good', () => {
    const trees = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      trees.push({ kind: k % 2 ? 'pine' : 'tree', x: Math.cos(a) * 4.6, z: Math.sin(a) * 4.6, scale: 1.2 });
    }
    const occ = findOccluders(sceneOf(trees));
    for (const frame of [PORTRAIT, LAND, DESK]) {
      for (const follow of [{ x: 0.8, y: 2.2, z: 4.5 }, { x: 6, y: 6.5, z: 11 }, { x: -5, y: 3.8, z: -5 }]) everyFrame(follow, occ, frame);
    }
  });
});

// Gorge part 1, Task 8 (R11): the fight camera rides the ground under the
// pair's middle and keeps out of rock and under ceilings (R8's test). The
// fixture's plateau is a disc at (8, 0), r 5, 3 m up; its tunnel's ceiling
// is 1.6 m over x -11.5..-8.5, z -14..-8.
const { buildHeightFixture } = await import('./fixtures/heightfield.js');
const { FLAT_GROUND } = await import('../src/ground.js');
const { CAM_ROCK_CLEAR, CAM_CEIL_CLEAR } = await import('../src/camzoom.js');
describe('the fight camera rides the ground and stays out of rock', () => {
  const G = buildHeightFixture(null).ground;
  const LOOK = 0.3;
  // every point on the camera-to-look segment is above the ground and under the ceiling
  const segmentClear = (pos, mid, g0) => {
    for (let i = 0; i <= 400; i++) {
      const t = i / 400;
      const x = pos.x + (mid.x - pos.x) * t, y = pos.y + (g0 + LOOK - pos.y) * t, z = pos.z + (mid.z - pos.z) * t;
      if (y < G.y(x, z) || y > G.ceil(x, z)) return false;
    }
    return true;
  };
  const camOk = (pos) => pos.y >= G.y(pos.x, pos.z) + CAM_ROCK_CLEAR && pos.y <= G.ceil(pos.x, pos.z) - CAM_CEIL_CLEAR;

  test('on the plateau: the flat view lifted 3 m, every height riding the ground', () => {
    const subj = subject({ x: 8.8, z: 0 }, { x: 7.2, z: 0 });
    for (const yaw0 of [0, 1, -0.6, 2.6, Math.PI]) {
      for (const view of [PORTRAIT, LAND]) {
        const flat = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ...view });
        const v = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ground: G, ...view });
        expect(v.pos.x).toBe(flat.pos.x);
        expect(v.pos.z).toBe(flat.pos.z);
        expect(v.pos.y).toBeCloseTo(flat.pos.y + 3, 12);
        expect(v.pos.y).toBeGreaterThanOrEqual(3 + 0.8);
        expect(v.look.y).toBeCloseTo(flat.look.y + 3, 9);
        expect(camOk(v.pos)).toBe(true);
      }
    }
    // the points it keeps in view stand on the plateau too
    expect(subjectPoints(subj, false, true, 3).map((p) => p.y)).toEqual(subjectPoints(subj).map((p) => p.y + 3));
    expect(framePoints(subj, 3).map((p) => p.y)).toEqual(framePoints(subj).map((p) => p.y + 3));
  });

  test('at the cliff foot: no camera inside the plateau, and the line to the pair clears the rock', () => {
    // the pair on the floor 1.8 m out from the plateau's rim, the current view
    // looking from the plateau's side, which puts the first spot inside rock
    const subj = subject({ x: 8.8, z: 6.8 }, { x: 7.2, z: 6.8 });
    for (const view of [PORTRAIT, LAND, DESK]) {
      for (const yaw0 of [Math.PI, Math.PI - 0.5, Math.PI + 0.5]) {
        const flat = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ...view });
        expect(camOk(flat.pos)).toBe(false); // the test bites: today's pick is in the rock
        const v = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ground: G, ...view });
        expect(camOk(v.pos)).toBe(true);
        expect(segmentClear(v.pos, subj.mid, 0)).toBe(true);
      }
    }
  });

  test('in the tunnel: never above its ceiling', () => {
    const subj = subject({ x: -9.2, z: -11 }, { x: -10.8, z: -11 });
    for (const yaw0 of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const v = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ground: G, ...LAND });
      expect(camOk(v.pos)).toBe(true);
      expect(segmentClear(v.pos, subj.mid, 0)).toBe(true);
    }
  });

  test('the fight\'s reach points (lifted tops included) ride the ground; the plateau view is the flat one + 3 m', () => {
    // a subject as clanfight hands it over with actions: spots carrying reachY lifts
    const subj = subject({ x: 8.8, z: 0 }, { x: 7.2, z: 0 }, {
      me: [{ x: 8.8, z: 0, y: 0 }, { x: 8.5, z: 0, y: 0.4 }, { x: 8.8, z: 0.3, y: 0.1 }],
      it: [{ x: 7.2, z: 0, y: 0 }, { x: 7.6, z: 0, y: 0.6 }],
    });
    const lifts = liftedPoints(subj);
    expect(lifts.length).toBe(3);
    expect(liftedPoints(subj, 3)).toEqual(lifts.map((p) => ({ ...p, y: p.y + 3 })));
    expect(subjectPoints(subj, true, true, 3)).toEqual(subjectPoints(subj, true).map((p) => ({ ...p, y: p.y + 3 })));
    expect(framePoints(subj, 3)).toEqual(framePoints(subj).map((p) => ({ ...p, y: p.y + 3 })));
    for (const yaw0 of [0, 1, -0.6, Math.PI]) {
      for (const view of [PORTRAIT, LAND]) {
        const flat = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ...view });
        const v = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ground: G, ...view });
        expect([v.pos.x, v.pos.z, v.ring, v.brushed]).toEqual([flat.pos.x, flat.pos.z, flat.ring, flat.brushed]);
        expect(v.pos.y).toBeCloseTo(flat.pos.y + 3, 12);
        expect(camOk(v.pos)).toBe(true);
      }
    }
  });

  test('the last resort (no spot frames the pair) keeps out of rock too; flat it is today\'s', () => {
    // a sliver of a screen nothing fits in, at the cliff foot, looking from the plateau's side
    const SLIVER = { aspect: 0.02, fovY: 10 };
    const subj = subject({ x: 8.8, z: 6.8 }, { x: 7.2, z: 6.8 });
    for (const yaw0 of [Math.PI, Math.PI - 0.5, Math.PI + 0.5]) {
      const flat = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ...SLIVER });
      // the first wide ring (d 5.5, h 2.2), not the tight close-up one
      expect(RINGS[flat.ring]).toMatchObject({ d: 5.5, h: 2.2 });
      expect(Math.hypot(flat.pos.x - subj.mid.x, flat.pos.z - subj.mid.z)).toBeCloseTo(5.5, 9);
      expect(flat.pos.y).toBeCloseTo(2.2, 9);
      expect(flat.yaw).toBe(yaw0); // the straight-back fallback...
      expect(camOk(flat.pos)).toBe(false); // ...which is in the rock here
      expect(chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ground: FLAT_GROUND, ...SLIVER })).toEqual(flat);
      const v = chooseFightView({ subject: subj, bounds: BOUNDS, yaw0, ground: G, ...SLIVER });
      expect(camOk(v.pos)).toBe(true);
      expect(segmentClear(v.pos, subj.mid, 0)).toBe(true);
    }
  });

  test('createFightCam takes the ground and holds the grounded view', () => {
    const subj = subject({ x: 8.8, z: 0 }, { x: 7.2, z: 0 });
    const fc = createFightCam({ bounds: BOUNDS, ground: G });
    const cam = fakeCamera();
    for (let i = 0; i < 120; i++) {
      cam.position.set(8, 5.2, 4.5);
      fc.update(1 / 60, { camera: cam, cat: { x: 8.8, y: 3, z: 0 }, subject: subj });
    }
    expect(fc.weight).toBe(1);
    expect(fc.view.pos.y).toBeGreaterThanOrEqual(3.8);
    expect(cam.position.y).toBeCloseTo(fc.view.pos.y, 6);
    expect(camOk(cam.position)).toBe(true);
  });

  test('with FLAT_GROUND every view, point and blend is exactly today\'s', () => {
    const occ = findOccluders(sceneOf([{ kind: 'tree', x: 0, z: 3.2, scale: 1.4 }, { kind: 'pine', x: 3, z: -2 }]));
    const subj = subject({ x: 0.8, z: 0 }, { x: -0.8, z: 0 });
    for (const yaw0 of [0, 1, Math.PI]) {
      const a = chooseFightView({ subject: subj, occluders: occ, bounds: BOUNDS, yaw0, ...PORTRAIT });
      expect(chooseFightView({ subject: subj, occluders: occ, bounds: BOUNDS, yaw0, ground: FLAT_GROUND, ...PORTRAIT })).toEqual(a);
    }
    expect(subjectPoints(subj, true, true, 0)).toEqual(subjectPoints(subj, true));
    const run = (opts) => {
      const fc = createFightCam({ occluders: occ, bounds: BOUNDS, ...opts });
      const cam = fakeCamera();
      const out = [];
      for (let i = 0; i < 60; i++) {
        cam.position.set(0, 2.2, 4.5);
        fc.update(1 / 60, { camera: cam, cat: { x: 0.8, z: 0 }, subject: i < 40 ? subj : null });
        out.push({ x: cam.position.x, y: cam.position.y, z: cam.position.z, looked: cam.looked });
      }
      return out;
    };
    expect(run({ ground: FLAT_GROUND })).toEqual(run({}));
  });
});

// Polish, camps Task 5b: the frame's bottom is the real sheet's top, not the
// worst-case sheet, and the cats sit just above it.
describe('the frame fits the real sheet', () => {
  const PHONE = { aspect: 390 / 844, fovY: 70 };
  const me = { x: 0.8, z: 0 }, it = { x: -0.8, z: 0 };
  const lowest = (v, subj, frame) => Math.min(...framePoints(subj).map((p) => projectPoint(v, p, frame.aspect, frame.fovY).y));
  const highest = (v, subj, frame) => Math.max(...framePoints(subj).map((p) => projectPoint(v, p, frame.aspect, frame.fovY).y));

  test('sheetTopFrom: the sheet\'s top edge in NDC; null with no sheet', () => {
    expect(sheetTopFrom(262, 844)).toBeCloseTo(-1 + 2 * 262 / 844, 9);
    expect(sheetTopFrom(422, 844)).toBeCloseTo(0, 9);
    expect(sheetTopFrom(0, 844)).toBe(null);
    expect(sheetTopFrom(NaN, 844)).toBe(null);
    expect(sheetTopFrom(200, 0)).toBe(null);
  });

  test('frameBottomFor: a margin over the sheet, never under -0.6, never over today\'s bottom; null is today\'s', () => {
    expect(frameBottomFor(null)).toBe(null);
    expect(frameBottomFor(-0.38)).toBeCloseTo(-0.32, 9);
    expect(frameBottomFor(-0.9)).toBe(-0.6);
    expect(frameBottomFor(0.2)).toBe(FIGHT_FRAME.bottom);
  });

  test('a phone held upright with frameBottom -0.4: the lowest frame point sits just over it, open ground', () => {
    const reach = fightReach({ x: FIGHT_GAP / 2, z: 0 }, { x: -FIGHT_GAP / 2, z: 0 }, () => true, { actions: true });
    for (const subj of [subject(me, it), reach]) {
      for (const yaw0 of [0, 1, Math.PI, -2.5, Math.PI / 2]) {
        const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, frameBottom: -0.4, ...PHONE });
        expect(v.clear).toBe(true);
        const lo = lowest(v, subj, PHONE);
        expect(lo).toBeGreaterThanOrEqual(-0.4);
        // A real fight's reach, seen at a slant, is wide: pitching up to put
        // its paws that low brings them nearer, past the side edge, so it
        // sits as low as the sides allow (fitLow). Every other case: on it.
        if (subj !== reach || yaw0 === 0 || yaw0 === Math.PI || yaw0 === Math.PI / 2) expect(lo).toBeLessThanOrEqual(-0.3);
        expect(highest(v, subj, PHONE)).toBeLessThanOrEqual(FIGHT_FRAME.top);
        // lower on screen than today's frame (the empty grass gap closes)
        const old = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, ...PHONE });
        expect(lo).toBeLessThan(lowest(old, subj, PHONE));
      }
    }
  });

  test('desktop with a ~36% sheet: lowest point just over it', () => {
    const subj = subject(me, it);
    const fb = frameBottomFor(sheetTopFrom(290, 800));
    for (const yaw0 of [0, 1, Math.PI, -2.5]) {
      const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0, frameBottom: fb, ...DESK });
      const lo = lowest(v, subj, DESK);
      expect(lo).toBeGreaterThanOrEqual(fb);
      expect(lo).toBeLessThanOrEqual(fb + 0.1);
    }
  });

  test('blendClear takes the frame bottom: a view low over a short sheet is not out of frame', () => {
    const subj = subject(me, it);
    const v = chooseFightView({ subject: subj, occluders: [], colliders: [], bounds: BOUNDS, yaw0: 0, frameBottom: -0.4, ...PHONE });
    expect(blendClear(v, v, subj, [], PHONE.aspect, PHONE.fovY, undefined, -0.4)).toBe(true);
    expect(blendClear(v, v, subj, [], PHONE.aspect, PHONE.fovY)).toBe(false);
  });

  test('createFightCam: sheetTop frames the pair over the sheet, and a new sheet height re-chooses', () => {
    const subj = subject(me, it);
    const fc = createFightCam({ occluders: [], colliders: [], bounds: BOUNDS, reducedMotion: true });
    const cam = fakeCamera(PHONE.aspect);
    const step = (sheetTop) => { cam.position.set(0, 2.2, 4.5); fc.update(1 / 60, { subject: subj, camera: cam, cat: me, sheetTop }); };
    step(null);
    const today = fc.view;
    expect(lowest(today, subj, PHONE)).toBeGreaterThanOrEqual(FIGHT_FRAME.bottom);
    step(-0.46);
    const fitted = fc.view;
    expect(fitted).not.toBe(today);
    const lo = lowest(fitted, subj, PHONE);
    expect(lo).toBeGreaterThanOrEqual(-0.4);
    expect(lo).toBeLessThanOrEqual(-0.3);
    // the camera itself holds that view
    expect(cam.position).toMatchObject(fitted.pos);
    // a jitter under 0.02 keeps the view; a real change re-chooses
    step(-0.45);
    expect(fc.view).toBe(fitted);
    step(-0.3);
    expect(fc.view).not.toBe(fitted);
    // the sheet going mid-fight keeps the view (the tallest sheet's frame)
    const tall = fc.view;
    step(null);
    expect(fc.view).toBe(tall);
  });

  test('createFightCam: the sheet changing height between beats ratchets to the tallest, not a re-choose every beat', () => {
    const subj = subject(me, it);
    for (const reducedMotion of [true, false]) {
      const fc = createFightCam({ occluders: [], colliders: [], bounds: BOUNDS, reducedMotion });
      const cam = fakeCamera(PHONE.aspect);
      const views = new Set();
      const step = (sheetTop) => {
        cam.position.set(0, 2.2, 4.5);
        fc.update(1 / 60, { subject: subj, camera: cam, cat: me, sheetTop });
        views.add(fc.view);
      };
      step(-0.38); // the sheet first shows: a choice
      const first = fc.view;
      const cuts0 = fc.cuts;
      // clue, line, clue, line... (a line sheet with specials is ~0.08 taller)
      for (let beat = 0; beat < 12; beat++) for (let f = 0; f < 10; f++) step(beat % 2 ? -0.38 : -0.30);
      // one re-choose, on the first rise; none after
      expect(views.size).toBeLessThanOrEqual(2);
      expect(fc.cuts - cuts0).toBeLessThanOrEqual(1);
      const tall = fc.view;
      expect(tall).not.toBe(first);
      expect(lowest(tall, subj, PHONE)).toBeGreaterThanOrEqual(-0.30 + 0.06 - 1e-9);
      // a rise under SHEET_STEP over the tallest keeps it; a real one re-chooses
      step(-0.29);
      expect(fc.view).toBe(tall);
      step(-0.2);
      expect(fc.view).not.toBe(tall);
      // the fight ends: the ratchet resets, so the next fight's short sheet frames low again
      fc.update(1 / 60, { subject: null, camera: cam, cat: me });
      const subj2 = subject(me, it);
      cam.position.set(0, 2.2, 4.5);
      fc.update(1 / 60, { subject: subj2, camera: cam, cat: me, sheetTop: -0.38 });
      expect(lowest(fc.view, subj2, PHONE)).toBeCloseTo(lowest(first, subj, PHONE), 9);
    }
  });
});

// Final review, a live regression: a Woods fight against BrookClan on the
// River route (src/intruders.js INTRUDER_ROUTES.woods.river), my cat come
// over from 27.1 m along it, the intruder held at (-20.6, 10.2), the real
// built map and the actions subject (as test/fightcamworld.test.js builds
// them). A big oak at (-23.4, 9.9) stands 2 m from my cat: its leaves cross
// some line to a cat from every spot, so it is hidden in every view.
describe('the Woods spot from the live check', async () => {
  const THREE_ = THREE;
  const { INTRUDER_ROUTES, routePoint } = await import('../src/intruders.js');
  const { clanWalkableFor } = await import('../src/world/clanground.js');
  const { mergeStaticProps } = await import('../src/render/mergeprops.js');
  const { reachYFor } = await import('../src/game/clanfight.js');
  const { buildCat, catDims } = await import('../src/cat/model.js');
  const { clanCast } = await import('../src/clancast.js');
  const { build } = await import('../src/world/woods.js');
  const scene = new THREE_.Scene();
  const area = build(scene, {});
  mergeStaticProps(scene);
  const occ = findOccluders(scene);
  const ok = clanWalkableFor(area, 'woods');
  const foe = buildCat('tabby', undefined, { simple: true, style: clanCast('woods')[3].style });
  foe.scale.multiplyScalar(0.85);
  const dims = [catDims(buildCat('mainecoon')), catDims(foe)];
  const foeAt = { x: -20.6, z: 10.2 };
  const from = routePoint(INTRUDER_ROUTES.woods.river, 27.1);
  const fightAt = (spot) => ({ ...fightReach(spot, foeAt, ok, { actions: true, reachY: reachYFor(...dims, Math.hypot(spot.x - foeAt.x, spot.z - foeAt.z)) }), path: [] });
  const d = Math.hypot(from.x - foeAt.x, from.z - foeAt.z);
  const to = { x: foeAt.x + ((from.x - foeAt.x) / d) * FIGHT_GAP, z: foeAt.z + ((from.z - foeAt.z) / d) * FIGHT_GAP };
  const walk = fightAt(to);
  walk.path = [];
  for (let j = 0, n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.3); j <= n; j++) {
    walk.path.push({ x: from.x + ((to.x - from.x) * j) / n, z: from.z + ((to.z - from.z) * j) / n });
  }
  // the rounds as the phone read them (my cat at (-21.4, 9.4)), and at the gap
  const subjects = { walkOver: walk, rounds: fightAt({ x: -21.4, z: 9.4 }), roundsAtGap: fightAt(to) };
  const oak = occ.find((o) => Math.hypot(o.x + 23.4, o.z - 9.9) < 0.1);
  const sideOnCos = (v, s) => Math.abs(Math.cos(Math.atan2(v.pos.x - s.mid.x, v.pos.z - s.mid.z) - Math.atan2(s.axis.x, s.axis.z)));
  const choose = (s, frame, sheetTop, yaw0) => chooseFightView({
    subject: s, occluders: occ, colliders: area.colliders, bounds: area.bounds, yaw0, ...frame,
    frameBottom: frameBottomFor(sheetTopFrom(sheetTop * frame.px, frame.px)),
  });
  // the follow camera behind my cat looking at the intruder, then every 15 degrees round
  const yaws = [Math.atan2(from.x - foeAt.x, from.z - foeAt.z), ...Array.from({ length: 24 }, (_, k) => (k * Math.PI) / 12 - Math.PI)];

  test('portrait: our cat in front, side-on, wherever the camera stood', () => {
    expect(oak?.obj).toBeTruthy();
    const PHONE = { aspect: 390 / 844, fovY: 70, px: 844 };
    for (const [name, s] of Object.entries(subjects)) {
      for (const yaw0 of yaws) {
        const v = choose(s, PHONE, 0.31, yaw0);
        const at = `${name} yaw0 ${(yaw0 * 180 / Math.PI).toFixed(0)}: camera ${v.pos.x.toFixed(1)},${v.pos.z.toFixed(1)}`;
        expect(itNearer(v.pos, s), at).toBe(false);
        expect(ourCatHidden(v.pos, s), at).toBe(0);
        expect(sideOnCos(v, s), at).toBeLessThan(Math.sin((20 * Math.PI) / 180));
      }
    }
  });

  // Re-review of the final fix: the walk-over (no spot clear: the oak is
  // hidden for every view) and the rounds that follow it (yaw0 the walk-over
  // view's, ring0 its ring) must stay on one side of the pair. Pricing the
  // oak's clutter at nothing on the walk-over (a rule since removed) sent it
  // to the oak's side, and the rounds, clear only on the far side, swung
  // round ~180 degrees: 35 of these 72 with the rounds at the phone's anchors.
  const frames3 = { PHONE: { aspect: 390 / 844, fovY: 70, px: 844, sheet: 0.31 }, DESK: { aspect: 16 / 9, fovY: 70, px: 720, sheet: 0.336 }, LAND: { aspect: 844 / 390, fovY: 70, px: 390, sheet: 0.4 } };
  function turns(rounds) {
    const out = [];
    for (const [name, f] of Object.entries(frames3)) {
      for (let k = 0; k < 24; k++) {
        const yaw0 = (k * Math.PI) / 12 - Math.PI;
        const w = choose(walk, f, f.sheet, yaw0);
        const r = chooseFightView({
          subject: rounds, occluders: occ, colliders: area.colliders, bounds: area.bounds, ...f,
          yaw0: Math.atan2(w.pos.x - rounds.mid.x, w.pos.z - rounds.mid.z), ring0: w.ring,
          frameBottom: frameBottomFor(sheetTopFrom(f.sheet * f.px, f.px)),
        });
        const a = Math.atan2(w.pos.x - walk.mid.x, w.pos.z - walk.mid.z), b2 = Math.atan2(r.pos.x - rounds.mid.x, r.pos.z - rounds.mid.z);
        const turn = Math.abs(Math.atan2(Math.sin(b2 - a), Math.cos(b2 - a))) * 180 / Math.PI;
        if (turn >= 90) out.push(`${name} yaw0 ${(yaw0 * 180 / Math.PI).toFixed(0)}: ${turn.toFixed(0)} deg`);
      }
    }
    return out;
  }
  test('the walk-over and the rounds stay on one side of the pair', () => {
    // the rounds where the walk-over arrives (the gap spot): never a swing
    expect(turns(subjects.roundsAtGap)).toEqual([]);
    // the rounds at the phone's reading, 0.47 m short of the gap: on a
    // phone held upright never; on a wide screen, with the camera on the
    // oak's side (yaw0 -60..-30), the walk-over hides the oak on that side
    // and the rounds, clear only on the far side, still turn round (a hard-
    // clear view outranks one that hides a tree; 2 of each before this
    // branch, 3 now). Measured, pinned.
    const far = turns(subjects.rounds);
    process.stderr.write(`\nwoods spot walk-over -> rounds swings (phone's anchors): ${far.length} of 72: ${far.join('; ')}\n`);
    expect(far.filter((t) => t.startsWith('PHONE'))).toEqual([]);
    expect(far.length).toBeLessThanOrEqual(6);
  });

  // Second re-review, live at d623948 (phone held upright): the intruder
  // held at (-21.442, 9.38), my cat over from (-23.13, 7.777) to the gap
  // spot (-22.602, 8.278). The rounds view stood right behind our cat looking
  // down the line, (-25.69, 2.2, 4.73), and our cat hid the intruder whole.
  test('the live spot: neither cat hides the other, side-on, on a phone held upright', () => {
    const PHONE = { aspect: 390 / 844, fovY: 70, px: 844 };
    const foe2 = { x: -21.442, z: 9.38 }, from2 = { x: -23.13, z: 7.777 };
    const g = Math.hypot(from2.x - foe2.x, from2.z - foe2.z);
    const spot2 = { x: foe2.x + ((from2.x - foe2.x) / g) * FIGHT_GAP, z: foe2.z + ((from2.z - foe2.z) / g) * FIGHT_GAP };
    const at2 = (spot) => ({ ...fightReach(spot, foe2, ok, { actions: true, reachY: reachYFor(...dims, FIGHT_GAP) }), path: [] });
    const walk2 = at2(spot2);
    walk2.path = [];
    for (let j = 0, n = Math.ceil(Math.hypot(spot2.x - from2.x, spot2.z - from2.z) / 0.3); j <= n; j++) {
      walk2.path.push({ x: from2.x + ((spot2.x - from2.x) * j) / n, z: from2.z + ((spot2.z - from2.z) * j) / n });
    }
    const rounds2 = at2(spot2);
    expect(Math.hypot(rounds2.me[0].x + 22.602, rounds2.me[0].z - 8.278)).toBeLessThan(0.01);
    const yaws2 = [Math.atan2(from2.x - foe2.x, from2.z - foe2.z), ...Array.from({ length: 24 }, (_, k) => (k * Math.PI) / 12 - Math.PI)];
    const look = (v, s, at) => {
      expect(ourCatHidden(v.pos, s), `${at}: our cat hidden`).toBeLessThan(0.25);
      expect(intruderHidden(v.pos, s), `${at}: the intruder hidden`).toBeLessThan(0.25);
      expect(sideOnCos(v, s), at).toBeLessThan(Math.sin((25 * Math.PI) / 180));
    };
    for (const yaw0 of yaws2) {
      const deg = (yaw0 * 180 / Math.PI).toFixed(0);
      const w = choose(walk2, PHONE, 0.31, yaw0);
      look(w, walk2, `walk-over yaw0 ${deg}: camera ${w.pos.x.toFixed(1)},${w.pos.z.toFixed(1)}`);
      const r = chooseFightView({
        subject: rounds2, occluders: occ, colliders: area.colliders, bounds: area.bounds, ...PHONE,
        yaw0: Math.atan2(w.pos.x - rounds2.mid.x, w.pos.z - rounds2.mid.z), ring0: w.ring,
        frameBottom: frameBottomFor(sheetTopFrom(0.31 * PHONE.px, PHONE.px)),
      });
      look(r, rounds2, `rounds after yaw0 ${deg}: camera ${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)}`);
      const r0 = choose(rounds2, PHONE, 0.31, yaw0);
      look(r0, rounds2, `rounds alone yaw0 ${deg}: camera ${r0.pos.x.toFixed(1)},${r0.pos.z.toFixed(1)}`);
      if (yaw0 === yaws2[0]) process.stderr.write(`\nlive spot, portrait, follow yaw0: walk-over ${JSON.stringify(w.pos)} d ${RINGS[w.ring].d}; rounds ${JSON.stringify(r.pos)} d ${RINGS[r.ring].d}\n`);
    }
  });

  // Re-review (b): in the fallback tier (no spot clear) a spot with the
  // intruder in front never replaces one with our cat in front, even with
  // fewer trees to hide.
  test('the fallback keeps our cat in front over fewer hidden trees', () => {
    const subj2 = subject({ x: 0.8, z: 0 }, { x: -0.8, z: 0 });
    const ball = (x, y, z, r, ry = r) => ({ obj: { visible: true }, x, z, R: r, top: y + ry, shapes: [{ t: 'ell', x, y, z, r, ry, p: 0 }] });
    // one round our cat's paws: every spot is blocked, none is clear
    const occ2 = [ball(0.8, 0.08, 0, 0.04)];
    // small upright eggs round our cat's body, every 15 degrees but on the
    // intruder's side (west, where the intruder is nearer the camera): a
    // spot with our cat in front hides at least one more tree
    for (let deg = -180; deg < 180; deg += 15) {
      if (Math.abs(deg + 90) <= 40) continue;
      const a = (deg * Math.PI) / 180;
      occ2.push(ball(0.8 + Math.sin(a) * 0.3, 0.4, Math.cos(a) * 0.3, 0.12, 0.5));
    }
    const v = chooseFightView({ subject: subj2, occluders: occ2, colliders: [], bounds: BOUNDS, yaw0: 0.3, ...DESK });
    expect(v.clear).toBe(false);
    expect(v.blockers.length).toBeGreaterThan(1);
    expect(itNearer(v.pos, subj2)).toBe(false);
    expect(ourCatHidden(v.pos, subj2)).toBe(0);
  });
});
