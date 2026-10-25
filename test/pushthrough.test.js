import { describe, test, expect, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

// v21 3b Task 14 — cat flaps in garden gates and gaps in hedges. A cat that
// pushes through swings the flap (or rustles the hedge) the way it went, and
// what it set swinging keeps a gentle sway until the walk ends. Real THREE
// groups, the real built areas and the real player, so the swing is measured
// off the meshes the walk draws and the crossing is walked, not assumed.

// createPlayer registers key / pointer-lock listeners on `document`, and the
// world builders ask it for a canvas (the same stub test/waterblock.test.js uses).
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
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { createPushThroughs } = await import('../src/pushthrough.js');
const { propsFor, frameColliders } = await import('../src/propsets.js');
const { isWalkableAt, createPlayer } = await import('../src/player.js');
const { build: buildNeigh } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSea } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');

const QUARTER = Math.PI / 2;
const FLAP = { id: 'park-flap-1', kind: 'flap', x: 0, z: 41, rotY: 0, width: 1.0 };
const GAP = { id: 'park-gap-1', kind: 'gap', x: 19, z: -30, rotY: QUARTER, width: 1.2 };
const FRAME = 1 / 60;

// The world axes of a flap's panel: `along` its frame, and its `normal`, the
// way a cat walks through it (local +z).
const along = (f) => ({ x: Math.cos(f.rotY), z: -Math.sin(f.rotY) });
const normal = (f) => ({ x: Math.sin(f.rotY), z: Math.cos(f.rotY) });
// A point `n` metres across the panel's line and `s` along it.
const at = (f, n, s = 0) => {
  const a = along(f);
  const k = normal(f);
  return new THREE.Vector3(f.x + k.x * n + a.x * s, 0, f.z + k.z * n + a.z * s);
};

// Walk `mover` from (n0, s) to (n1, s) at a cat's pace, updating every frame.
function walk(p, movers, mover, f, n0, n1, s = 0, speed = 3.5) {
  const steps = Math.ceil(Math.abs(n1 - n0) / (speed * FRAME));
  for (let i = 0; i <= steps; i++) {
    mover.copy(at(f, n0 + ((n1 - n0) * i) / steps, s));
    p.update(FRAME, movers);
  }
}
const run = (p, seconds, movers = []) => {
  for (let t = 0; t < seconds - 1e-9; t += FRAME) p.update(FRAME, movers);
};
const centreOf = (obj) => new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
// What a cat brushes as it goes through: the flap's leaf, or a gap's sprigs.
const swingers = (e) => {
  const out = [];
  e.group.traverse((o) => { if (o.name === 'leaf' || o.name === 'sprig') out.push(o); });
  return out;
};
// How far, along the way a cat walked, what it brushed has moved from rest.
function displacement(e, rest, dir) {
  e.group.updateMatrixWorld(true);
  return swingers(e).map((o, i) => {
    const c = centreOf(o);
    return (c.x - rest[i].x) * dir.x + (c.z - rest[i].z) * dir.z;
  });
}
const restOf = (e) => {
  e.group.updateMatrixWorld(true);
  return swingers(e).map(centreOf);
};

describe('createPushThroughs', () => {
  test('builds a gate with a leaf, and a hedge with sprigs in its gap, from the curated list', () => {
    const scene = new THREE.Scene();
    const p = createPushThroughs(scene, [FLAP, GAP]);
    expect(p.list.map((e) => [e.id, e.kind])).toEqual([['park-flap-1', 'flap'], ['park-gap-1', 'gap']]);
    for (const e of p.list) {
      expect(scene.children).toContain(e.group);
      expect(e.swing).toBe(0);
      expect(e.vel).toBe(0);
      expect(e.pushed).toBe(false);
      expect(e.group.position.x).toBe(e.id === FLAP.id ? FLAP.x : GAP.x);
      expect(e.group.rotation.y).toBe(e.id === FLAP.id ? FLAP.rotY : GAP.rotY);
    }
    expect(swingers(p.list[0]).map((o) => o.name)).toEqual(['leaf']);
    expect(swingers(p.list[1]).length).toBeGreaterThanOrEqual(3);
    expect(swingers(p.list[1]).every((o) => o.name === 'sprig')).toBe(true);
    // the colliders are exactly the curated frames
    expect(p.colliders).toEqual([...frameColliders(FLAP), ...frameColliders(GAP)]);
    p.dispose();
  });

  test('walking through the opening swings the flap the way you went', () => {
    for (const f of [FLAP, GAP, { ...FLAP, id: 'seaside-flap-1', rotY: QUARTER }, { ...GAP, id: 'docks-gap-1', rotY: Math.PI / 4 }]) {
      for (const way of [1, -1]) {
        const p = createPushThroughs(new THREE.Scene(), [f]);
        const [e] = p.list;
        const rest = restOf(e);
        const cat = new THREE.Vector3();
        const movers = [cat];
        // the last frame of the walk is the one that crosses into the far side
        walk(p, movers, cat, f, -way * 1.5, way * 0.05, 0.1);
        expect(e.pushed, `${f.id} ${way}`).toBe(true);
        walk(p, movers, cat, f, way * 0.05, way * 1.5, 0.1);
        const k = normal(f);
        const dir = { x: k.x * way, z: k.z * way };
        // every leaf / sprig has swung toward the side the cat went to
        for (const d of displacement(e, rest, dir)) expect(d, `${f.id} ${way}`).toBeGreaterThan(0.01);
        expect(Math.sign(e.swing), `${f.id} ${way}`).toBe(way);
        p.dispose();
      }
    }
  });

  test('a hedge sways with its sprigs when you push through a gap', () => {
    const p = createPushThroughs(new THREE.Scene(), [GAP]);
    const [e] = p.list;
    const hedges = e.group.children.filter((o) => o.name === 'hedge');
    expect(hedges).toHaveLength(2);
    const cat = new THREE.Vector3();
    walk(p, [cat], cat, GAP, -1.5, 1.5);
    for (const h of hedges) expect(Math.abs(h.rotation.x)).toBeGreaterThan(0);
    p.dispose();
  });

  test('passing beside the frame, outside the opening, does nothing', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP, GAP]);
    const cat = new THREE.Vector3();
    for (const f of [FLAP, GAP]) {
      const half = f.width / 2;
      // across the line just outside the opening, at the far end of the frame,
      // and well past it
      for (const s of [half + 0.05, -(half + 0.05), half + 1.4, half + 3, -(half + 3)]) {
        walk(p, [cat], cat, f, -1.5, 1.5, s);
        walk(p, [cat], cat, f, 1.5, -1.5, s);
      }
      // along the line, through the opening, never crossing it
      const a = along(f);
      for (let s = -3; s <= 3; s += 0.05) {
        cat.set(f.x + a.x * s, 0, f.z + a.z * s);
        p.update(FRAME, [cat]);
      }
    }
    // a teleport across the opening (a respawn, a chase setting the cat down)
    // is not a push — even one that lands inside the opening, within NEAR of
    // the line, so only the teleport guard (a > 1.5 m jump) refuses it
    cat.copy(at(FLAP, -1.2, 1.0));
    p.update(FRAME, [cat]);
    cat.copy(at(FLAP, 0.3));
    p.update(FRAME, [cat]);
    for (const e of p.list) {
      expect(e.pushed, e.id).toBe(false);
      expect(e.swing).toBe(0);
      expect(e.vel).toBe(0);
      for (const o of swingers(e)) expect(o.rotation.x).toBe(0);
    }
    p.dispose();
  });

  test('a pushed flap keeps a gentle sway for good', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP, GAP]);
    const cat = new THREE.Vector3();
    walk(p, [cat], cat, FLAP, -1.5, 1.5);
    walk(p, [cat], cat, GAP, -1.5, 1.5);
    cat.set(100, 0, 100); // and walks away
    run(p, 120, [cat]);
    for (const e of p.list) {
      let peak = 0;
      let moved = false;
      let last = e.swing;
      for (let t = 0; t < 3; t += FRAME) {
        p.update(FRAME, [cat]);
        peak = Math.max(peak, Math.abs(e.swing));
        if (e.swing !== last) moved = true;
        last = e.swing;
      }
      expect(peak, e.id).toBeGreaterThanOrEqual(0.05);
      expect(peak, `${e.id} stays gentle`).toBeLessThan(0.1);
      expect(moved, `${e.id} still swaying`).toBe(true);
    }
    p.dispose();
  });

  test('a fresh push swings it hard, then it settles back to the gentle sway', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP]);
    const [e] = p.list;
    const cat = new THREE.Vector3();
    walk(p, [cat], cat, FLAP, -1.5, 1.5);
    let peak = 0;
    for (let t = 0; t < 1; t += FRAME) {
      p.update(FRAME, [cat]);
      peak = Math.max(peak, Math.abs(e.swing));
    }
    expect(peak).toBeGreaterThan(0.3);
    // a flurry of pushes never flips it over its lintel
    for (let i = 0; i < 20; i++) {
      walk(p, [cat], cat, FLAP, -1.5, 1.5);
      walk(p, [cat], cat, FLAP, 1.5, -1.5);
      expect(Math.abs(e.swing)).toBeLessThanOrEqual(1.2);
    }
    run(p, 30, [cat]);
    peak = 0;
    for (let t = 0; t < 3; t += FRAME) {
      p.update(FRAME, [cat]);
      peak = Math.max(peak, Math.abs(e.swing));
    }
    expect(peak).toBeLessThan(0.1);
    p.dispose();
  });

  test('with reduced motion, a push still swings it but it comes to rest', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP], { reducedMotion: true });
    const [e] = p.list;
    const cat = new THREE.Vector3();
    walk(p, [cat], cat, FLAP, -1.5, 1.5);
    expect(e.pushed).toBe(true);
    run(p, 0.1, [cat]);
    expect(Math.abs(e.swing)).toBeGreaterThan(0.05);
    run(p, 60, [cat]);
    expect(Math.abs(e.swing)).toBeLessThan(1e-3);
    p.dispose();
  });

  test('a remote cat pushes it too', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP]);
    const [e] = p.list;
    const me = new THREE.Vector3(10, 0, 10); // standing well away
    const partner = new THREE.Vector3();
    const movers = [me, partner];
    let by = null;
    const steps = Math.ceil(3 / (3.5 * FRAME));
    for (let i = 0; i <= steps; i++) {
      partner.copy(at(FLAP, 1.5 - (3 * i) / steps));
      for (const push of p.update(FRAME, movers)) by = push;
    }
    expect(e.pushed).toBe(true);
    expect(e.swing).not.toBe(0);
    // ...and update says who pushed (so only my own push makes a sound)
    expect(by).toEqual({ id: FLAP.id, kind: 'flap', by: 1 });
    p.dispose();
  });

  test('rocking back and forth in the opening swings it every time but sounds once per 0.35 s', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP]);
    const [e] = p.list;
    const cat = at(FLAP, -0.2);
    let sounded = 0;
    let crossings = 0;
    let lastVel = e.vel;
    // across and back every 0.1 s, for 1 s
    for (let i = 0; i < 60; i++) {
      cat.copy(at(FLAP, Math.floor(i / 6) % 2 ? 0.2 : -0.2));
      sounded += p.update(FRAME, [cat]).length;
      if (i % 6 === 0 && i > 0) {
        crossings++;
        expect(e.vel, `crossing ${crossings} still kicks the leaf`).not.toBeCloseTo(lastVel, 3);
      }
      lastVel = e.vel;
    }
    expect(crossings).toBe(9);
    expect(sounded).toBe(1);
    // left alone past the cooldown, the next push sounds again
    run(p, 0.4, [cat]);
    cat.copy(at(FLAP, cat.z > FLAP.z ? -0.2 : 0.2));
    expect(p.update(FRAME, [cat])).toHaveLength(1);
    p.dispose();
  });

  test('the flap leaf is wood with a dark hinge bar, and the wings stand in planters as deep as the colliders', () => {
    const p = createPushThroughs(new THREE.Scene(), [{ ...FLAP, x: 0, z: 0 }]);
    const [e] = p.list;
    const leaf = e.group.getObjectByName('leaf');
    const parts = leaf.children.filter((o) => o.isMesh);
    expect(parts).toHaveLength(2);
    const [sheet, hinge] = parts;
    const lum = (m) => m.material.color.getHSL({}).l;
    // the palings are the gate's most common mesh outside the leaf
    const counts = new Map();
    e.group.traverse((o) => {
      if (o.isMesh && !leaf.getObjectById(o.id)) counts.set(o.material, (counts.get(o.material) ?? 0) + 1);
    });
    const boards = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    expect(sheet.material.color.getHSL({}).s).toBeGreaterThan(0.2); // a wood tone, not grey
    expect(lum(sheet)).toBeGreaterThan(boards.color.getHSL({}).l);
    expect(lum(sheet) - boards.color.getHSL({}).l).toBeLessThan(0.15); // a shade, not white
    expect(lum(hinge)).toBeLessThan(lum(sheet) - 0.2);
    // the hinge runs along the leaf's top edge
    e.group.updateMatrixWorld(true);
    const hb = new THREE.Box3().setFromObject(hinge);
    const sb = new THREE.Box3().setFromObject(sheet);
    expect(hb.max.y).toBeCloseTo(sb.max.y, 2);
    expect(hb.max.x - hb.min.x).toBeGreaterThanOrEqual(sb.max.x - sb.min.x);
    // along each wing, at a cat's paw height, something solid reaches out to
    // within 5 cm of the colliders' 0.3 m half-depth, on both faces
    const rc = new THREE.Raycaster();
    const solid = [];
    e.group.traverse((o) => { if (o.isMesh && !leaf.getObjectById(o.id)) solid.push(o); });
    const half = FLAP.width / 2;
    for (const side of [-1, 1]) {
      for (let s = half + 0.2; s <= half + 1.3; s += 0.1) {
        for (const face of [-1, 1]) {
          rc.set(new THREE.Vector3(side * s, 0.15, face * 1), new THREE.Vector3(0, 0, -face));
          rc.far = 1;
          const hit = rc.intersectObjects(solid, false)[0];
          expect(hit, `wing at ${side * s} face ${face}`).toBeDefined();
          expect(Math.abs(hit.point.z), `wing at ${side * s} face ${face}`).toBeGreaterThan(0.25);
          expect(Math.abs(hit.point.z)).toBeLessThanOrEqual(0.3 + 1e-6);
        }
      }
    }
    p.dispose();
  });

  test('a partner who drops out and comes back somewhere else is not a push', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP]);
    const me = new THREE.Vector3(10, 0, 10);
    const partner = at(FLAP, -0.3);
    p.update(FRAME, [me, partner]);
    p.update(FRAME, [me]); // gone for a frame
    partner.copy(at(FLAP, 0.3));
    expect(p.update(FRAME, [me, partner])).toEqual([]);
    expect(p.list[0].pushed).toBe(false);
    p.dispose();
  });

  test('garbage movers and garbage dt never throw or push', () => {
    const p = createPushThroughs(new THREE.Scene(), [FLAP]);
    expect(() => {
      p.update(FRAME, null);
      p.update(FRAME, [null, undefined, {}, new THREE.Vector3(NaN, 0, 0)]);
      p.update(NaN, [new THREE.Vector3()]);
      p.update(-1, [new THREE.Vector3()]);
      p.update(Infinity, [new THREE.Vector3()]);
    }).not.toThrow();
    expect(p.list[0].pushed).toBe(false);
    expect(Number.isFinite(p.list[0].swing)).toBe(true);
    const none = createPushThroughs(new THREE.Scene(), undefined);
    expect(none.list).toEqual([]);
    expect(none.colliders).toEqual([]);
    expect(none.update(FRAME, [new THREE.Vector3()])).toEqual([]);
    none.dispose();
    p.dispose();
  });

  // The visible frame (the gate's end posts, the hedge's ends) stops exactly
  // where frameColliders' end circles stop — width/2 + 1.2 + 0.3 — so the cat
  // is never held off by thin air past the end, and never walks into a panel
  // its colliders do not cover.
  test('the visible frame ends where its colliders end', () => {
    for (const base of [FLAP, GAP]) {
      for (const width of [1.0, 1.2]) {
        const f = { ...base, x: 0, z: 0, rotY: 0, width };
        const p = createPushThroughs(new THREE.Scene(), [f]);
        const box = new THREE.Box3().setFromObject(p.list[0].group);
        const reach = Math.max(...p.colliders.map((c) => Math.abs(c.x) + c.r));
        expect(reach).toBeCloseTo(width / 2 + 1.5, 9);
        expect(box.max.x, `${f.kind} ${width}`).toBeCloseTo(reach, 2);
        expect(box.min.x, `${f.kind} ${width}`).toBeCloseTo(-reach, 2);
        // never thicker than the colliders across the line
        expect(box.max.z).toBeLessThanOrEqual(0.3 + 1e-6);
        expect(box.min.z).toBeGreaterThanOrEqual(-0.3 - 1e-6);
        // the opening is open: nothing solid stands in it below a cat's height
        // (ears 0.83, raised tail 0.89) except what swings out of the way
        const rc = new THREE.Raycaster();
        const solid = [];
        p.list[0].group.traverse((o) => {
          if (o.isMesh && !swingers(p.list[0]).some((s) => s === o || s.getObjectById(o.id))) solid.push(o);
        });
        p.list[0].group.updateMatrixWorld(true);
        for (let s = -width / 2 + 0.05; s <= width / 2 - 0.05; s += 0.05) {
          for (const y of [0.1, 0.3, 0.5, 0.7, 0.9]) { // the cat stands up to 0.89
            rc.set(new THREE.Vector3(s, y, -1), new THREE.Vector3(0, 0, 1));
            rc.far = 2;
            expect(rc.intersectObjects(solid, false), `${f.kind} opening at ${s.toFixed(2)},${y}`).toEqual([]);
          }
        }
        p.dispose();
      }
    }
  });

  test('dispose is idempotent', () => {
    const scene = new THREE.Scene();
    const p = createPushThroughs(scene, [FLAP, GAP]);
    const counts = new Map();
    for (const e of p.list) {
      e.group.traverse((o) => {
        for (const r of [o.geometry, o.material].flat()) {
          if (!r || counts.has(r)) continue;
          counts.set(r, 0);
          const orig = r.dispose.bind(r);
          r.dispose = () => { counts.set(r, counts.get(r) + 1); orig(); };
        }
      });
    }
    expect(counts.size).toBeGreaterThan(0);
    p.dispose();
    p.dispose();
    for (const n of counts.values()) expect(n).toBe(1);
    expect(scene.children).toEqual([]);
    expect(p.list).toEqual([]);
    expect(() => p.update(FRAME, [new THREE.Vector3()])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The real areas: the frame blocks, the opening does not.
// ---------------------------------------------------------------------------

const BUILD = { neighborhood: buildNeigh, park: buildPark, seaside: buildSea, docks: buildDocks };
const AREAS = Object.keys(BUILD);
const built = Object.fromEntries(AREAS.map((a) => [a, BUILD[a](new THREE.Scene())]));
const withFrames = (a) => {
  const p = createPushThroughs(new THREE.Scene(), propsFor(a).flaps);
  const area = { ...built[a], colliders: [...built[a].colliders, ...p.colliders] };
  p.dispose();
  return area;
};

test.each(AREAS)('%s: the frame colliders leave the opening walkable', (a) => {
  const area = withFrames(a);
  for (const f of propsFor(a).flaps) {
    expect(isWalkableAt(area, f.x, f.z), `${f.id} opening`).toBe(true);
    for (const n of [-1, -0.5, 0.5, 1]) {
      const p = at(f, n);
      expect(isWalkableAt(area, p.x, p.z), `${f.id} at ${n} across`).toBe(true);
    }
    // ...and the frame does not: at no point along it can a cat stand on its line
    const half = f.width / 2;
    for (let s = half + 0.2; s <= half + 1.5; s += 0.1) {
      for (const side of [-1, 1]) {
        const p = at(f, 0, side * s);
        expect(isWalkableAt(area, p.x, p.z), `${f.id} frame at ${side * s}`).toBe(false);
      }
    }
  }
});

// The real player, walked at the opening from both sides — straight on from
// across the whole opening, and at an angle — must come out on the far side.
// The round frame circles funnel a cat that comes in off-centre; this pins
// that none of them is caught on a frame end, a pier edge or a bridge rail.
function harness() {
  const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
  const cat = new THREE.Object3D();
  player.setAvatar(cat, 3.5);
  player.enable();
  return { player, cat };
}

test.each(AREAS)('%s: a cat walks through every opening, from both sides, straight or at an angle', (a) => {
  const area = withFrames(a);
  for (const f of propsFor(a).flaps) {
    const k = normal(f);
    const ax = along(f);
    for (const side of [-1, 1]) {
      const tries = [
        // straight across, anywhere in the opening
        ...[-0.45, -0.25, 0, 0.25, 0.45].map((s) => ({ s, angle: 0 })),
        // aimed at the middle of the opening from off to one side
        ...[-45, -30, -15, 15, 30, 45].map((deg) => ({ s: 0, angle: (deg * Math.PI) / 180 })),
      ];
      for (const { s, angle } of tries) {
        // heading: across the line toward `side`, turned by `angle`
        const c = Math.cos(angle);
        const sn = Math.sin(angle);
        const dir = { x: (k.x * c + ax.x * sn) * side, z: (k.z * c + ax.z * sn) * side };
        // the farthest start (up to 2.5 m back along the heading) a cat can stand on
        let start = null;
        for (const d of [2.5, 2, 1.5, 1.2, 1]) {
          const p = { x: f.x + ax.x * s - dir.x * d, z: f.z + ax.z * s - dir.z * d };
          if (isWalkableAt(area, p.x, p.z)) { start = p; break; }
        }
        expect(start, `${f.id} side ${side} s ${s} angle ${angle.toFixed(2)}: no ground to start on`).not.toBeNull();
        // a fresh cat every time, standing still: nothing carried over from the last try
        const { player, cat } = harness();
        cat.position.set(start.x, 0, start.z);
        player.setTouchMove({ x: dir.x, z: dir.z, mag: 1 });
        for (let t = 0; t < 2.5; t += FRAME) player.update(FRAME, area.colliders, area.bounds, area.waters);
        const across = ((cat.position.x - f.x) * k.x + (cat.position.z - f.z) * k.z) * side;
        expect(across, `${f.id} side ${side} s ${s} angle ${angle.toFixed(2)} from ${start.x.toFixed(2)},${start.z.toFixed(2)}, stopped at ${cat.position.x.toFixed(2)},${cat.position.z.toFixed(2)}`).toBeGreaterThan(0.5);
        player.disable();
      }
    }
  }
});

// The walk builds them per walk from the curated set, makes their frames solid
// after clearSpot has moved the POIs and before the session (and so the first
// frame) exists, outside the rival slice, frees them before endWalk's scene
// traversal; the render loop hands them my cat and every remote one, and
// nothing about a push goes on the wire or pays.
test('the walk wires push-throughs in: solid frames, every cat a mover, no wire, no points', () => {
  const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = walk.replace(/\/\/.*$/gm, '');
  expect(code.match(/createPushThroughs\(scene, propsFor\(areaId\)\.flaps, \{ reducedMotion \}\)/g)).toHaveLength(1);
  const solid = code.indexOf('for (const c of pushThroughs.colliders) areaData.colliders.push(');
  expect(solid).toBeGreaterThan(code.indexOf('clearSpot(p, areaData.colliders'));
  expect(solid).toBeLessThan(code.indexOf('const session = {'));
  const rivalA = walk.indexOf("The rival's border and its patrol");
  const rivalB = walk.indexOf('session.rival = {', rivalA);
  expect(rivalA).toBeGreaterThan(0);
  expect(walk.slice(rivalA, rivalB)).not.toMatch(/pushThrough/i);
  const freed = code.indexOf('session.pushThroughs.dispose()');
  expect(freed).toBeGreaterThan(0);
  expect(freed).toBeLessThan(code.indexOf('session.scene.traverse('));
  expect(main).toMatch(/pushMovers\.push\(session\.cat\.position\)/);
  expect(main).toMatch(/for \(const r of session\.remotes\.list\) pushMovers\.push\(r\.group\.position\)/);
  expect(main).toMatch(/session\.pushThroughs\.update\(dt, pushMovers\)/);
  // the module itself never awards, records or sends anything
  const mod = readFileSync(new URL('../src/pushthrough.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  expect(mod).not.toMatch(/award|recordFeat|progression|netevents|send\(|Math\.random|walkRng/);
});
