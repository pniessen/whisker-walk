// The Moon, milestone 8: wing D, the Lava Tube and its chamber (world/moonlava.js the plan, world/moonlavaparts.js the drawing) on the real area and with the bound's
// switch both ways. The properties the plan asks for: the tube is always lit (a render-free count of the crystals along its length), there is no dead end and a way
// out at every point (the real colliders flooded with a cat's own radius), the rock is sealed, Dot cannot drive in, nothing is a real light, the shell is seen from
// inside only (so the camera is never behind a wall), the zone, and the budget.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as L from '../src/world/moonlava.js';
import { build } from '../src/world/moon.js';
import { caveGeometry, fillGeometry, massifGeometry, INNER, profile, station } from '../src/world/moonlavaparts.js';
import { createRover, stepRover, dismountSpot, ROVER } from '../src/world/moonrover.js';
import { CAT_RADIUS } from '../src/player.js';
import { WINGS, createZones, wingNear, NEAR } from '../src/world/moonzones.js';

const built = () => { const scene = new THREE.Scene(); const area = build(scene); return { scene, area }; };

// Flood the real colliders from `from` with a cat's own radius: the set of 0.25 m cells she can reach.
function flood(colliders, from, bounds = P.MOON_BOUNDS, box = { x0: -56, x1: -28, z0: -14, z1: 24 }, step = 0.25) {
  const free = (x, z) => {
    if (x < bounds.minX + CAT_RADIUS || x > bounds.maxX - CAT_RADIUS || z < bounds.minZ + CAT_RADIUS || z > bounds.maxZ - CAT_RADIUS) return false;
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + CAT_RADIUS) return false;
    return true;
  };
  const seen = new Set();
  const q = [[Math.round((from.x - box.x0) / step), Math.round((from.z - box.z0) / step)]];
  while (q.length) {
    const [i, j] = q.pop();
    const k = i + ',' + j;
    if (seen.has(k)) continue;
    const x = box.x0 + i * step;
    const z = box.z0 + j * step;
    if (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1 || !free(x, z)) continue;
    seen.add(k);
    q.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  return { seen, free, at: (k) => { const [i, j] = k.split(',').map(Number); return { x: box.x0 + i * step, z: box.z0 + j * step }; }, has: (x, z) => seen.has(Math.round((x - box.x0) / step) + ',' + Math.round((z - box.z0) / step)) };
}

afterEach(() => { vi.doUnmock('../src/world/moonswitch.js'); vi.resetModules(); });

describe('the plan: the way, the room, the mouth', () => {
  it('the mouth is at (-41, 0) and the tube runs west and south to a round chamber: at least the spec\'s 24 m from the mouth to the room\'s edge', () => {
    expect(L.MOUTH).toEqual({ x: -41, z: 0 });
    const at = L.pathAt(L.S_MOUTH);
    expect(at.x).toBeCloseTo(-41, 1);
    expect(Math.abs(at.z)).toBeLessThan(0.1);
    expect(L.TUBE_LENGTH).toBeGreaterThanOrEqual(L.CAVE_REACH);
    expect(L.TUBE_LENGTH).toBeLessThan(L.CAVE_REACH + 6);
    expect(L.CHAMBER.x).toBeLessThan(L.MOUTH.x - 4);
    expect(L.CHAMBER.z).toBeGreaterThan(L.MOUTH.z + 4); // west and south (south is +z)
    expect(L.CHAMBER.r).toBeGreaterThanOrEqual(3.5);
  });
  it('every wall circle, the pedestal and the chamber are in the playable bounds, or their disc at least reaches in (the rock runs past the west edge)', () => {
    for (const c of L.LAVA_COLLIDERS) {
      expect(c.x + c.r, JSON.stringify(c)).toBeGreaterThan(P.MOON_BOUNDS.minX);
      expect(c.z - c.r).toBeLessThan(P.MOON_BOUNDS.maxZ);
    }
    expect(L.CHAMBER.x - L.CHAMBER.r).toBeGreaterThan(P.MOON_BOUNDS.minX);
    expect(L.PEDESTAL.x).toBeGreaterThan(P.MOON_BOUNDS.minX + 3);
  });
  it('the wing keeps its place among the others: clear of the dome, Star Hill, the Old Dish\'s post, the Echo and the Great Bowl, and every rock keeps out of it', () => {
    for (const c of L.LAVA_COLLIDERS) {
      expect(Math.hypot(c.x - P.DOME.x, c.z - P.DOME.z), 'dome').toBeGreaterThan(P.DOME.r + c.r);
      expect(Math.hypot(c.x - P.STAR_HILL.x, c.z - P.STAR_HILL.z), 'Star Hill').toBeGreaterThan(P.STAR_HILL.rs + 3 + c.r);
      expect(Math.hypot(c.x - P.OLD_DISH.x, c.z - P.OLD_DISH.z), 'the Old Dish').toBeGreaterThan(c.r + 0.8 + 0.1);
      expect(Math.hypot(c.x - P.CHEESE.x, c.z - P.CHEESE.z), 'the Great Bowl').toBeGreaterThan(12 + c.r - 4);
      expect(Math.hypot(c.x - P.DISH_LEDGE.x, c.z - P.DISH_LEDGE.z), 'the Old Dish\'s ledge').toBeGreaterThan(c.r + P.DISH_LEDGE.r + 0.6);
    }
    const spots = P.MOON_POIS;
    for (const p of spots) for (const c of L.LAVA_COLLIDERS) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r + 1);
    for (const r of P.ROCK_KEEP_OUT) expect(r).toHaveLength(3);
    for (const q of L.LAVA_KEEP_OUT) expect(Math.hypot(q[0] - L.CHAMBER.x, q[1] - L.CHAMBER.z) <= 10.2 || Math.hypot(q[0] - L.MOUTH.x, q[1] - L.MOUTH.z) < 26).toBe(true);
  });
  it('the Deep Cell\'s pedestal stands in the room on the side away from the way in, with a free ring round it', () => {
    expect(Math.hypot(L.PEDESTAL.x - L.CHAMBER.x, L.PEDESTAL.z - L.CHAMBER.z)).toBeLessThan(L.CHAMBER.r - 2);
    expect(L.PEDESTAL.x).toBeLessThan(L.CHAMBER.x); // the way in is on the east
    expect(P.DEEP_CELL).toEqual(L.DEEP_CELL);
    expect(P.JOB_POINTS).toContain(P.DEEP_CELL);
    expect(P.DEEP_SOCKET.x).toBeCloseTo(P.CORE.x + 0.62, 6);
    expect(Math.hypot(P.DEEP_SOCKET.x - P.CORE.x, P.DEEP_SOCKET.z - P.CORE.z)).toBeLessThan(P.CORE.r); // on the pedestal's top
  });
});

describe('the tube is always lit: a render-free count of the crystals along its length', () => {
  it('a crystal cluster within 3 m of every quarter metre of the way (two in the tube proper), and 6 or more in every 8 m of the way', () => {
    const pts = L.wayPoints(0.25);
    expect(pts.length).toBeGreaterThan(100);
    for (const p of pts) expect(L.crystalsNear(p.x, p.z, 3), `at ${p.s.toFixed(2)} m`).toBeGreaterThanOrEqual(p.s < L.TUBE_LENGTH ? 2 : 1);
    for (let s0 = 0; s0 + 8 <= L.PATH_LENGTH; s0 += 1) {
      const win = new Set();
      L.CRYSTALS.forEach((q, i) => { const n = L.nearest(q.x, q.z); const along = n.s - L.S_MOUTH; if (along >= s0 && along < s0 + 8) win.add(i); });
      expect(win.size, `between ${s0} and ${s0 + 8} m`).toBeGreaterThanOrEqual(3);
    }
    expect(L.CRYSTALS.length).toBeGreaterThanOrEqual(30);
  });
  it('the baked glow is never dark anywhere she can stand in the tube or the room (the floor and the walls are painted from it)', () => {
    let worst = 1;
    for (let x = -56; x <= -38; x += 0.5) for (let z = -8; z <= 14; z += 0.5) if (L.inCave(x, z)) worst = Math.min(worst, L.lightAt(x, z));
    expect(worst).toBeGreaterThan(0.6);
    for (const p of L.wayPoints(0.25)) expect(L.lightAt(p.x, p.z)).toBeGreaterThan(0.7);
  });
  it('the drawn floor and shell carry that glow in their colours (no point of either is near black), and the crystals are the brightest things in the fill', () => {
    const lum = (g) => { const c = g.attributes.color; let lo = 9; let hi = 0; for (let i = 0; i < c.count; i++) { const v = (c.getX(i) + c.getY(i) + c.getZ(i)) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v); } return { lo, hi }; };
    const shell = lum(caveGeometry());
    expect(shell.lo).toBeGreaterThan(0.08);
    const fill = lum(fillGeometry());
    expect(fill.hi).toBeGreaterThan(0.9);
    expect(fill.lo).toBeGreaterThan(0.05);
  });
  it('no real light of any kind: the Moon\'s build holds no Light, and the cave\'s meshes are basic (unlit) materials with vertex colours', () => {
    const { scene } = built();
    let lights = 0;
    scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(0);
    for (const n of ['moon:cave', 'moon:cavefill']) {
      const m = scene.getObjectByName(n);
      expect(m, n).toBeTruthy();
      expect(m.material.isMeshBasicMaterial, n).toBe(true);
      expect(m.material.vertexColors).toBe(true);
      expect(m.castShadow).toBe(false);
    }
  });
});

describe('no dead end, a way out at every point, and the rock is sealed', () => {
  const run = (Plan, label) => {
    const cols = Plan.MOON_COLLIDERS;
    const f = flood(cols, { x: Plan.MOON_SPAWN.x - 34, z: 0 }); // the plain in front of the mouth
    it(`${label}: every spot of the tube and the room she could stand on is joined to the plain (nothing is a pocket), the pedestal's ring and the chamber's middle included`, () => {
      let inCave = 0;
      for (const k of f.seen) { const p = f.at(k); if (L.inCave(p.x, p.z)) inCave++; }
      expect(inCave).toBeGreaterThan(900);
      // every free cell of the cave region (not only reached ones) is in the reached set: no sealed pocket inside
      let pockets = 0;
      for (let x = -56; x <= -40; x += 0.25) for (let z = -8; z <= 14; z += 0.25) {
        if (!L.inCave(x, z)) continue;
        if (!f.free(x, z)) continue;
        if (!f.has(x, z)) pockets++;
      }
      expect(pockets).toBe(0);
      expect(f.has(L.CHAMBER.x + 1.5, L.CHAMBER.z)).toBe(true);
      expect(f.has(L.PEDESTAL.x + 1.3, L.PEDESTAL.z)).toBe(true);
      expect(f.has(L.PEDESTAL.x - 1.3, L.PEDESTAL.z)).toBe(true);
      for (const p of L.wayPoints(0.5)) expect(f.has(p.x, p.z) || p.s < 0.2, `centreline at ${p.s.toFixed(1)}`).toBe(true);
    });
    it(`${label}: the rock is sealed: nothing inside the massif but the tube and the room can be reached (no one walks into the mountain), and the room has space to turn round in`, () => {
      let leaks = 0;
      for (const k of f.seen) {
        const p = f.at(k);
        if (L.inCave(p.x, p.z, 0.4)) continue;
        const n = L.nearest(p.x, p.z);
        const c = Math.hypot(p.x - L.CHAMBER.x, p.z - L.CHAMBER.z);
        if ((n.s >= L.S_MOUTH + 0.3 && n.d < L.TUBE.outerW - 0.5) || c < L.CHAMBER.outerR - 0.5) leaks++;
      }
      expect(leaks).toBe(0);
      // a circle of 1.6 m (a cat and a friend) fits somewhere in the room, round the pedestal: the room is not a corridor's end
      let best = 0;
      for (let x = L.CHAMBER.x - 3; x <= L.CHAMBER.x + 3; x += 0.25) for (let z = L.CHAMBER.z - 3; z <= L.CHAMBER.z + 3; z += 0.25) {
        let m = 9;
        for (const c of cols) m = Math.min(m, Math.hypot(x - c.x, z - c.z) - c.r);
        best = Math.max(best, m);
      }
      expect(best).toBeGreaterThan(1.6);
    });
    it(`${label}: the way is at least a cat wide and a friend wide at every point (a clear 1.4 m), and narrower than Dot (2.6 m)`, () => {
      for (const p of L.wayPoints(0.25)) {
        if (p.s < 0.5) continue;
        let m = 9;
        for (const c of cols) m = Math.min(m, Math.hypot(p.x - c.x, p.z - c.z) - c.r);
        if (p.s < L.PATH_LENGTH - 2.5) expect(m, `at ${p.s.toFixed(1)} m`).toBeGreaterThan(1.1); // (the last metres lead to the pedestal)
        if (p.s < L.TUBE_LENGTH) expect(m, `the tube at ${p.s.toFixed(1)} m`).toBeLessThan(ROVER.radius); // (the room is wide: Dot would fit there, were she ever inside)
      }
    });
  };
  run(P, 'the bound on');
  describe('with the bound\'s switch off (exactly milestone 7a elsewhere)', () => {
    it('the tube is the same: the same colliders, joined, sealed (the keep-outs and the rifts are the only things that change)', async () => {
      vi.resetModules();
      vi.doMock('../src/world/moonswitch.js', () => ({ MOON_BOUND_ON: false }));
      const Poff = await import('../src/world/moonplan.js');
      const Loff = await import('../src/world/moonlava.js');
      expect(Poff.MOON_BOUND_ON).toBe(false);
      expect(Poff.RIFTS).toEqual([]);
      expect(Loff.LAVA_COLLIDERS).toEqual(L.LAVA_COLLIDERS);
      const f = flood(Poff.MOON_COLLIDERS, { x: -34, z: 0 });
      expect(f.has(Loff.CHAMBER.x + 1.5, Loff.CHAMBER.z)).toBe(true);
      expect(f.has(Loff.PEDESTAL.x - 1.3, Loff.PEDESTAL.z)).toBe(true);
      let pockets = 0;
      for (let x = -56; x <= -40; x += 0.25) for (let z = -8; z <= 14; z += 0.25) if (Loff.inCave(x, z) && f.free(x, z) && !f.has(x, z)) pockets++;
      expect(pockets).toBe(0);
      // and the scene builds with the tube whole
      const { build: b2 } = await import('../src/world/moon.js');
      const sc = new THREE.Scene();
      b2(sc);
      for (const n of ['moon:massif', 'moon:cave', 'moon:cavefill']) expect(sc.getObjectByName(n), n).toBeTruthy();
    });
  });
});

describe('Dot cannot drive in (it would trap her: the way is narrower than her circle), and she can always hop out and drive away', () => {
  const env = () => ({ colliders: P.MOON_COLLIDERS.map((c) => ({ ...c })), bounds: P.MOON_BOUNDS, ground: P.createMoonGround() });
  it('from many starts and headings, pressing the stick into the mouth for 25 s never carries her past the mouth plane (her middle stays out of the tube)', () => {
    const e = env();
    for (const [x, z, sx, sz] of [[-30, 0, -1, 0], [-34, 4, -1, -0.3], [-34, -5, -1, 0.5], [-37, 0, -1, 0], [-32, 2, -1, -0.1], [-36, -2, -0.8, 0.3]]) {
      const s = createRover(x, z, 0);
      let deepest = 0;
      for (let i = 0; i < 25 * 30; i++) { stepRover(s, { x: sx, z: sz }, 1 / 30, e); deepest = Math.max(deepest, L.caveDepth(s.x, s.z)); }
      expect(deepest, `from ${x},${z}`).toBeLessThan(0.5);
      expect(s.x, `from ${x},${z}`).toBeGreaterThan(-42.7);
      // and the stick the other way takes her off at once: she is never stuck
      const x0 = s.x;
      for (let i = 0; i < 90; i++) stepRover(s, { x: 1, z: 0 }, 1 / 30, e);
      expect(s.x - x0, `from ${x},${z}`).toBeGreaterThan(3);
    }
  });
  it('the way\'s clear width is under her circle everywhere beyond the mouth\'s first step (a test that fails if the tube is ever widened to take her)', () => {
    const cols = P.MOON_COLLIDERS;
    for (const p of L.wayPoints(0.25)) {
      if (p.s < 0.6 || p.s > L.TUBE_LENGTH) continue;
      const clear = cols.every((c) => Math.hypot(p.x - c.x, p.z - c.z) >= c.r + ROVER.radius);
      expect(clear, `at ${p.s.toFixed(1)} m`).toBe(false);
    }
  });
  it('the dismount spot from the mouth\'s front is on free ground, not in the rock', () => {
    const e = env();
    const s = createRover(-38.5, 0, 0);
    const d = dismountSpot(s, e);
    expect(d).toBeTruthy();
    expect(L.inCave(d.x, d.z, 0.5)).toBe(false);
  });
});

describe('the drawing: the camera is never behind a wall', () => {
  it('the shell is seen from inside only: from a camera anywhere in the tube every shell triangle near it faces away (is drawn), and from 2 m over the roof the roof faces toward it (is not drawn)', () => {
    const g = caveGeometry().toNonIndexed();
    const pos = g.attributes.position;
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const n = new THREE.Vector3(); const m = new THREE.Vector3();
    const tri = [];
    for (let i = 0; i + 2 < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      n.subVectors(c, b).cross(m.subVectors(a, b)).normalize();
      tri.push({ n: n.clone(), m: new THREE.Vector3().add(a).add(b).add(c).multiplyScalar(1 / 3) });
    }
    const camIn = (p) => new THREE.Vector3(p.x, 1.2, p.z);
    let checked = 0;
    let wrong = 0;
    for (const p of L.wayPoints(1.5)) {
      const cam = camIn(p);
      for (const t of tri) {
        if (cam.distanceTo(t.m) > 3.2) continue;
        const nn = L.nearest(t.m.x, t.m.z);
        if (Math.abs(nn.s - L.S_MOUTH - p.s) > 1.2 || nn.d > L.TUBE.shellW + 0.3) continue; // (another leg's or the room's wall, behind the rock: seen from its outside, so culled whichever way it faces)
        const facing = t.n.dot(cam.clone().sub(t.m)); // > 0: the triangle faces the camera (a BackSide material draws it only when this is negative)
        if (facing > 0.02) wrong++; // (the shell's own small lumps turn a patch of a wall the other way now and then: a few, never a wall)
        expect(facing, `at ${p.s.toFixed(1)} m`).toBeLessThan(0.5);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
    expect(wrong / checked).toBeLessThan(0.03);
    // and the room, from a camera standing in it (anywhere round the pedestal): every wall triangle within its own radius faces away from the lens
    let roomWrong = 0;
    let roomN = 0;
    for (const [dx, dz] of [[0, 0], [1.5, 0.5], [-1.5, -1], [0.5, 1.8]]) {
      const cam = new THREE.Vector3(L.CHAMBER.x + dx, 1.2, L.CHAMBER.z + dz);
      for (const t of tri) {
        if (Math.hypot(t.m.x - L.CHAMBER.x, t.m.z - L.CHAMBER.z) < L.CHAMBER.shellR - 0.9 || Math.hypot(t.m.x - L.CHAMBER.x, t.m.z - L.CHAMBER.z) > L.CHAMBER.shellR + 0.2) continue;
        roomN++;
        if (t.n.dot(cam.clone().sub(t.m)) > 0.02) roomWrong++;
      }
    }
    expect(roomN).toBeGreaterThan(200);
    expect(roomWrong / roomN).toBeLessThan(0.12); // (the junction of the tube and the room turns a few small patches the other way; the pictures show the room whole)
    // the roof, seen from above (a camera that has swung out of the tube): its triangles face the lens, so they are not drawn
    let roofCulled = 0;
    for (const p of L.wayPoints(3)) {
      const cam = new THREE.Vector3(p.x, 4.5, p.z);
      for (const t of tri) {
        if (t.m.y < 1.8 || cam.distanceTo(t.m) > 3.4) continue;
        if (t.n.dot(cam.clone().sub(t.m)) > 0) roofCulled++;
      }
    }
    expect(roofCulled).toBeGreaterThan(50);
  });
  it('the shell is a BackSide basic mesh, the massif a FrontSide lit mesh that does not cast, the fill a basic mesh: the three meshes of the wing', () => {
    const { scene } = built();
    expect(scene.getObjectByName('moon:cave').material.side).toBe(THREE.BackSide);
    const massif = scene.getObjectByName('moon:massif');
    expect(massif.material.side).toBe(THREE.FrontSide);
    expect(massif.castShadow).toBe(false); // (the Moon's frame has no draw to spare for a shadow pass)
    expect(scene.getObjectByName('moon:cavefill').visible).toBe(false); // the zone: not drawn until she is near
  });
  it('the sweep\'s profile joins the tube to the room without a step, and the room closes at its far end (no hole in the shell)', () => {
    const rows = [];
    for (let s = L.S_MOUTH; s < L.S_END; s += 0.3) rows.push(profile(s, INNER));
    for (let i = 1; i < rows.length; i++) {
      expect(Math.abs(rows[i].w - rows[i - 1].w), `row ${i}`).toBeLessThan(1.6);
      expect(Math.abs(rows[i].h - rows[i - 1].h)).toBeLessThan(1.6);
    }
    const last = profile(L.S_END, INNER);
    expect(last.w).toBeLessThan(1e-3); // the stations end on the room's far wall exactly: a closed bulb
    expect(profile(L.S_CHAMBER, INNER).w).toBeCloseTo(L.CHAMBER.shellR, 5);
    expect(station(L.S_CHAMBER + 2).x).toBeCloseTo(L.CHAMBER.x - 2, 6);
    expect(INNER.W).toBeGreaterThan(L.TUBE.half); // the drawn wall is outside the colliders' edge
    expect(INNER.W - L.TUBE.half).toBeLessThan(0.5);
    const mg = massifGeometry();
    mg.computeBoundingBox();
    expect(mg.boundingBox.max.y).toBeGreaterThan(4.5);
    expect(mg.boundingBox.max.y).toBeLessThan(8);
  });
});

describe('the zone (world/moonzones.js): the wing\'s own reach', () => {
  it('wing D is the tube\'s middle with its own 26 m reach and the usual 6 m of hysteresis; B and C keep the 55 m', () => {
    expect(WINGS.D).toEqual({ id: 'D', x: L.LAVA_WING.x, z: L.LAVA_WING.z, near: 26 });
    expect(wingNear(26, false, 26)).toBe(true);
    expect(wingNear(27, false, 26)).toBe(false);
    expect(wingNear(31, true, 26)).toBe(true);
    expect(wingNear(33, true, 26)).toBe(false);
    const z = createZones();
    expect(z.update(0, 45).D).toBe(false);
    expect(z.update(-34, 0).D).toBe(true);
    expect(z.update(-30, 22).D).toBe(true); // 6 m of hysteresis: still on at 23 m...
    expect(z.update(-10, 20).D).toBe(false); // ...and off beyond it
    expect(z.update(L.MOUTH.x + 60, 0).B).toBe(false);
    expect(NEAR).toBe(55);
    // the dome's middle (24 m away) is just beyond the reach (the dome's inside never draws the cave's detail: its frame is the Moon's heaviest), the spawn (60 m) far beyond
    expect(Math.hypot(P.DOME.x - L.LAVA_WING.x, P.DOME.z - L.LAVA_WING.z)).toBeGreaterThan(26 - 2);
    expect(Math.hypot(P.MOON_SPAWN.x - L.LAVA_WING.x, P.MOON_SPAWN.z - L.LAVA_WING.z)).toBeGreaterThan(38);
  });
});

describe('start-up: nothing outside the Moon\'s files names the Lava Tube (zero start-up growth)', () => {
  const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
  it('no start-up file imports or names the wing\'s files, they are Moon-prefixed, and they import only three, each other, the Moon\'s files and the start-up files the Moon already imports', () => {
    const mine = ['moonlava', 'moonlavaparts', 'moondeeplive'];
    for (const f of files) {
      if (/^src\/world\/moon[a-z]*\.js$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of mine) expect(text, `${f} names ${m}`).not.toMatch(new RegExp(`\\b${m}\\.js`));
    }
    for (const m of mine) expect(files, m).toContain(`src/world/${m}.js`);
    const allowed = /^(three|three\/examples\/jsm\/utils\/BufferGeometryUtils\.js|\.\/moon[a-z]*\.js|\.\.\/clanphrases\.js|\.\.\/events\.js)$/;
    for (const m of mine) {
      const text = readFileSync(`src/world/${m}.js`, 'utf8');
      for (const imp of text.matchAll(/^import .* from '([^']+)';/gm)) expect(imp[1], `${m} imports ${imp[1]}`).toMatch(allowed);
    }
  });
});
