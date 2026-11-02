import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  FLAT_GROUND, createGround, groundOf, seatOnGround, groundTilt, validateGround,
  TILT_MAX, MAX_PATH_GRADE, STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL,
} from '../src/ground.js';
import { HEIGHT_FIXTURE, buildHeightFixture } from './fixtures/heightfield.js';
import { GORGE_GROUND_SPEC } from '../src/world/gorgeshape.js';

const g = createGround(HEIGHT_FIXTURE);
// player.js: avatar.rotation.y = atan2(vx, vz) + PI
const yawFor = (vx, vz) => Math.atan2(vx, vz) + Math.PI;

describe('ground model', () => {
  it('constants', () => {
    expect([STEP_MAX, MAX_GRADE, SUBSTEP, LEVEL_TOL, TILT_MAX]).toEqual([0.12, 0.5, 0.25, 0.5, 0.35]);
    expect(MAX_PATH_GRADE).toBeCloseTo(1 / 3, 12);
  });

  it('FLAT_GROUND is zero, open and frozen', () => {
    const v = { x: 1, z: 2 };
    expect(FLAT_GROUND.flat).toBe(true);
    expect(FLAT_GROUND.y(5, -3)).toBe(0);
    expect(FLAT_GROUND.ceil(5, -3)).toBe(Infinity);
    expect(FLAT_GROUND.canStep(0, 0, 9, 9)).toBe(true);
    expect(FLAT_GROUND.slide(0, 0, v)).toBe(false);
    expect(v).toEqual({ x: 1, z: 2 });
    expect(FLAT_GROUND.sameLevel(0, 0, 5, 5)).toBe(true);
    const out = { x: 9, z: 9 };
    expect(FLAT_GROUND.gradient(1, 1, out)).toBe(out);
    expect(out).toEqual({ x: 0, z: 0 });
    expect(Object.isFrozen(FLAT_GROUND)).toBe(true);
  });

  it('groundOf falls back to flat', () => {
    expect(groundOf({})).toBe(FLAT_GROUND);
    expect(groundOf(null)).toBe(FLAT_GROUND);
    expect(groundOf(buildHeightFixture(new THREE.Scene())).flat).toBe(false);
  });

  it('the ramp rises 1 in 3 and meets the plateau with no seam', () => {
    expect(g.y(-6, 0)).toBe(0);
    expect(g.y(-1.5, 0)).toBeCloseTo(1.5, 9);
    expect(g.y(3, 0)).toBe(3);
    expect(g.y(8, 0)).toBe(3);
    expect(Math.abs(g.y(2.99, 0) - g.y(3.01, 0))).toBeLessThan(0.01);
  });

  it('off every shape the ground is the base', () => {
    expect(g.y(-15, 15)).toBe(0);
  });

  it('a rim is a wall both ways, a ramp is not', () => {
    expect(g.canStep(8, 4.9, 8, 5.1)).toBe(false);
    expect(g.canStep(8, 5.1, 8, 4.9)).toBe(false);
    expect(g.canStep(-6, 0, 3, 0)).toBe(true);
    expect(g.canStep(3, 0, -6, 0)).toBe(true);
    expect(g.canStep(-1, 0.9, -1, 1.2)).toBe(false);
  });

  it('a long step cannot tunnel over a rim', () => {
    expect(g.canStep(12.4, 5, 13.6, 5)).toBe(true);
    expect(g.canStep(12.4, 5, 14.4, 5)).toBe(false);
    expect(g.canStep(11.9, 5, 14.1, 5)).toBe(false);
  });

  it('slide keeps the legal half', () => {
    const pos = { x: 8.3, z: 5.2 };
    expect(g.canStep(8, 4.8, 8.3, 5.2)).toBe(false);
    expect(g.slide(8, 4.8, pos)).toBe(true);
    expect(g.y(pos.x, pos.z)).toBe(3);
    expect(g.canStep(8, 4.8, pos.x, pos.z)).toBe(true);
    expect(pos).toEqual({ x: 8.3, z: 4.8 });
    const free = { x: 7, z: 1 };
    expect(g.slide(6, 1, free)).toBe(false);
    expect(free).toEqual({ x: 7, z: 1 });
    const corner = { x: 8, z: 5.2 };
    expect(g.slide(8, 4.8, corner)).toBe(true);
    expect(corner).toEqual({ x: 8, z: 4.8 });
  });

  it('slide keeps the z half when only that is legal, and neither when neither is', () => {
    const zHalf = { x: 12.7, z: -2 };
    expect(g.canStep(11.9, -2.5, 12.7, -2)).toBe(false);
    expect(g.canStep(11.9, -2.5, 12.7, -2.5)).toBe(false);
    expect(g.slide(11.9, -2.5, zHalf)).toBe(true);
    expect(zHalf).toEqual({ x: 11.9, z: -2 });
    expect(g.y(zHalf.x, zHalf.z)).toBe(3);
    const neither = { x: 11.8, z: -3.8 };
    expect(g.slide(11.4, -3.4, neither)).toBe(true);
    expect(neither).toEqual({ x: 11.4, z: -3.4 });
  });

  it('the tunnel has a ceiling and nothing else does', () => {
    expect(g.ceil(-10, -11)).toBe(1.6);
    expect(g.ceil(0, 0)).toBe(Infinity);
  });

  it('gradient follows the highest shape', () => {
    const out = { x: 5, z: 5 };
    expect(g.gradient(0, 0, out)).toBe(out);
    expect(out.x).toBeCloseTo(1 / 3, 9);
    expect(out.z).toBeCloseTo(0, 9);
    g.gradient(8, 0, out);
    expect(out).toEqual({ x: 0, z: 0 });
    g.gradient(-15, 15, out);
    expect(out).toEqual({ x: 0, z: 0 });
  });

  it('tilt follows the ramp, and raises the nose uphill', () => {
    const out = { pitch: 9, roll: 9 };
    // facing +x (uphill): pitch only
    const yawX = yawFor(1, 0);
    expect(groundTilt(g, 0, 0, yawX, out)).toBe(out);
    expect(Math.abs(out.pitch)).toBeCloseTo(Math.atan(1 / 3), 9);
    expect(out.roll).toBeCloseTo(0, 9);
    // the convention, checked against three.js: written to rotation.x with
    // order 'YXZ', the nose (local -z) rises when facing uphill and falls when facing downhill
    for (const [vx, expectSign] of [[1, 1], [-1, -1]]) {
      const yaw = yawFor(vx, 0);
      groundTilt(g, 0, 0, yaw, out);
      const cat = new THREE.Group();
      cat.rotation.order = 'YXZ';
      cat.rotation.set(out.pitch, yaw, out.roll);
      cat.updateMatrixWorld(true);
      const nose = cat.localToWorld(new THREE.Vector3(0, 0, -1));
      expect(Math.sign(nose.y)).toBe(expectSign);
      expect(Math.abs(nose.y)).toBeCloseTo(Math.sin(Math.atan(1 / 3)), 9);
    }
    // facing +z (across): roll only; the uphill (+x) flank rises
    const yawZ = yawFor(0, 1);
    groundTilt(g, 0, 0, yawZ, out);
    expect(Math.abs(out.roll)).toBeCloseTo(Math.atan(1 / 3), 9);
    expect(out.pitch).toBeCloseTo(0, 9);
    const cat = new THREE.Group();
    cat.rotation.order = 'YXZ';
    cat.rotation.set(out.pitch, yawZ, out.roll);
    cat.updateMatrixWorld(true);
    // the flank that points uphill in the world (+x) rises; here that is local -x
    const upFlank = cat.localToWorld(new THREE.Vector3(-1, 0, 0));
    expect(upFlank.x).toBeCloseTo(Math.cos(Math.atan(1 / 3)), 9);
    expect(upFlank.y).toBeCloseTo(Math.sin(Math.atan(1 / 3)), 9);
    // diagonal, uncapped: the body's up equals the ground normal exactly
    const tilted = createGround({ strips: [{ x0: 0, z0: 0, x1: 6, z1: 0, width: 4, y0: 0, y1: 1.2 }] });
    for (const yawD of [yawFor(1, 1), yawFor(1, -0.4), yawFor(-1, 2), 0.7]) {
      groundTilt(tilted, 3, 0, yawD, out);
      expect(Math.abs(out.pitch)).toBeLessThan(TILT_MAX);
      expect(Math.abs(out.roll)).toBeLessThan(TILT_MAX);
      const dcat = new THREE.Group();
      dcat.rotation.order = 'YXZ';
      dcat.rotation.set(out.pitch, yawD, out.roll);
      dcat.updateMatrixWorld(true);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(dcat.matrixWorld);
      const gd = tilted.gradient(3, 0, { x: 0, z: 0 });
      const n = new THREE.Vector3(-gd.x, 1, -gd.z).normalize();
      expect(up.distanceTo(n)).toBeLessThan(1e-9);
    }
    // on a disc and the base both are 0
    groundTilt(g, 8, 0, yawX, out);
    expect(out).toEqual({ pitch: 0, roll: 0 });
    groundTilt(g, -15, 15, yawX, out);
    expect(out).toEqual({ pitch: 0, roll: 0 });
    // default out allocates
    expect(groundTilt(FLAT_GROUND, 0, 0, 0)).toEqual({ pitch: 0, roll: 0 });
  });

  it('tilt is capped at TILT_MAX on a 1-in-1 strip', () => {
    const steep = createGround({ strips: [{ x0: 0, z0: 0, x1: 4, z1: 0, width: 2, y0: 0, y1: 4 }] });
    const out = groundTilt(steep, 2, 0, yawFor(1, 0));
    expect(Math.abs(out.pitch)).toBe(TILT_MAX);
    const across = groundTilt(steep, 2, 0, yawFor(0, 1));
    expect(Math.abs(across.roll)).toBe(TILT_MAX);
  });

  it('validateGround flags a shape with a missing field', () => {
    const noWidth = { ...HEIGHT_FIXTURE, strips: [{ x0: 0, z0: 0, x1: 3, z1: 0, y0: 0 }] };
    expect(validateGround(noWidth)).toHaveLength(1);
    const noY = { ...HEIGHT_FIXTURE, discs: [{ x: 0, z: 0, r: 1 }] };
    expect(validateGround(noY)).toHaveLength(1);
    const noCeilY = { ...HEIGHT_FIXTURE, ceilings: [{ x0: 0, z0: 15, x1: 0, z1: 18, width: 2 }] };
    expect(validateGround(noCeilY)).toHaveLength(1);
  });

  it('validateGround flags a steep strip and a low ceiling', () => {
    expect(validateGround(HEIGHT_FIXTURE)).toEqual([]);
    const steep = { ...HEIGHT_FIXTURE, strips: [{ x0: 0, z0: 0, x1: 3, z1: 0, width: 2, y0: 0, y1: 2 }] };
    expect(validateGround(steep)).toHaveLength(1);
    const low = { ...HEIGHT_FIXTURE, ceilings: [{ x0: 0, z0: 15, x1: 0, z1: 18, width: 2, y: 0.6 }] };
    expect(validateGround(low)).toHaveLength(1);
    const nan = { ...HEIGHT_FIXTURE, discs: [{ x: NaN, z: 0, r: 1, y: 0 }] };
    expect(validateGround(nan).length).toBeGreaterThanOrEqual(1);
  });

  it('sameLevel is the level gate', () => {
    expect(g.sameLevel(8, 4, 8, 6)).toBe(false);
    expect(g.sameLevel(-1, 0, -0.5, 0)).toBe(true);
    expect(FLAT_GROUND.sameLevel(0, 0, 100, 100)).toBe(true);
  });

  it('seatOnGround lifts a prop, or each child of a group', () => {
    const m = new THREE.Object3D();
    m.position.set(8, 0.2, 0);
    expect(seatOnGround(m, g)).toBe(m);
    expect(m.position.y).toBeCloseTo(3.2, 12);
    const grp = new THREE.Group();
    const a = new THREE.Object3D(); a.position.set(8, 0, 0);
    const b = new THREE.Object3D(); b.position.set(-15, 0.5, 15);
    grp.add(a, b);
    seatOnGround(grp, g, { children: true });
    expect(grp.position.y).toBe(0);
    expect(a.position.y).toBe(3);
    expect(b.position.y).toBe(0.5);
    const f = new THREE.Object3D(); f.position.set(8, 1, 0);
    seatOnGround(f, FLAT_GROUND);
    expect(f.position.y).toBe(1);
  });

  it('two builds agree', () => {
    const a = createGround(HEIGHT_FIXTURE);
    const b = createGround(HEIGHT_FIXTURE);
    for (let x = -20; x <= 20; x += 0.5) {
      for (let z = -20; z <= 20; z += 0.5) {
        expect(Object.is(a.y(x, z), b.y(x, z))).toBe(true);
        expect(Object.is(a.ceil(x, z), b.ceil(x, z))).toBe(true);
      }
    }
  });
});

describe('the bucket grid', () => {
  it('the bucket grid changes no answer', () => {
    const spec = GORGE_GROUND_SPEC;
    expect(spec.strips.length + spec.discs.length).toBeGreaterThan(16); // so the grid is in use
    const fast = createGround(spec);
    const slow = createGround(spec, { index: false });
    const ga = { x: 0, z: 0 };
    const gb = { x: 0, z: 0 };
    const S = 0.25;
    const bad = [];
    // a little past the masses' outer edges (+-62), so the grid's own edges are crossed
    for (let x = -64; x <= 64; x += S) {
      for (let z = -64; z <= 64; z += S) {
        if (!Object.is(fast.y(x, z), slow.y(x, z))) bad.push(['y', x, z]);
        if (!Object.is(fast.ceil(x, z), slow.ceil(x, z))) bad.push(['ceil', x, z]);
        fast.gradient(x, z, ga);
        slow.gradient(x, z, gb);
        if (!Object.is(ga.x, gb.x) || !Object.is(ga.z, gb.z)) bad.push(['gradient', x, z]);
        if (fast.canStep(x, z, x + S, z) !== slow.canStep(x, z, x + S, z)) bad.push(['canStep x', x, z]);
        if (fast.canStep(x, z, x, z + S) !== slow.canStep(x, z, x, z + S)) bad.push(['canStep z', x, z]);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

describe('height fixture', () => {
  it('the two perches sit within low reach but on different levels', () => {
    const f = buildHeightFixture(new THREE.Scene());
    const [rim, floor] = f.perches;
    expect(Math.hypot(rim.x - floor.x, rim.z - floor.z)).toBeCloseTo(1, 12);
    expect(f.ground.y(rim.x, rim.z)).toBe(3);
    expect(f.ground.y(floor.x, floor.z)).toBe(0);
  });
});
