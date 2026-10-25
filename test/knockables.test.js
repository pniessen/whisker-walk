import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createKnockables } from '../src/knockables.js';
import { propsFor, KNOCK_KINDS } from '../src/propsets.js';

// v21 3b Task 10 — knock it off the ledge, and it stays down. Real THREE
// groups in a real scene, so the fall is measured off the meshes the walk
// draws.

const CUP = { id: 'neighborhood-cup-1', kind: 'cup', x: -3.42, z: 20, y: 1.35, fallTo: { x: -1.84, z: 20.2 } };
const POT = { id: 'neighborhood-flowerpot-1', kind: 'flowerpot', x: -8.6, z: 17.7, y: 1.3, fallTo: { x: -7.4, z: 18.3 } };
const BOOK = { id: 'neighborhood-book-1', kind: 'book', x: 32, z: 24, y: 0.58, fallTo: { x: 32.8, z: 25 } };

const run = (k, seconds, step = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9; t += step) k.update(step);
};
const lowestY = (obj) => new THREE.Box3().setFromObject(obj).min.y;

describe('createKnockables', () => {
  test('every kind stands on its ledge: its bottom at the perch height, not floating or sunk', () => {
    const scene = new THREE.Scene();
    const list = KNOCK_KINDS.map((kind, i) => ({ ...CUP, id: `docks-${kind}-${i}`, kind, x: i * 3 }));
    const k = createKnockables(scene, list);
    expect(k.list.map((e) => e.kind)).toEqual([...KNOCK_KINDS]);
    for (const e of k.list) {
      expect(e.down).toBe(false);
      expect(scene.children).toContain(e.group);
      expect(lowestY(e.group)).toBeCloseTo(CUP.y, 5);
    }
    k.dispose();
  });

  test('a knocked cup falls to its fallTo and stays down', () => {
    const scene = new THREE.Scene();
    const k = createKnockables(scene, [CUP, POT]);
    const cup = k.list[0];
    expect(k.knock(cup)).toBe(true);
    expect(cup.down).toBe(true);
    // mid-fall it is on its way, between the ledge and the ground
    run(k, 0.25);
    expect(cup.group.position.x).toBeGreaterThan(CUP.x);
    expect(cup.group.position.x).toBeLessThan(CUP.fallTo.x);
    // after the fall and the settle: at fallTo, on its side, resting on the ground
    run(k, 1);
    expect(cup.group.position.x).toBeCloseTo(CUP.fallTo.x, 6);
    expect(cup.group.position.z).toBeCloseTo(CUP.fallTo.z, 6);
    expect(lowestY(cup.group)).toBeCloseTo(0, 5);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cup.group.quaternion);
    expect(Math.abs(up.y)).toBeLessThan(0.05); // lying on its side
    expect(cup.anim).toBe(0);
    // ...and stays there: many more frames move nothing
    const at = cup.group.position.clone();
    const q = cup.group.quaternion.clone();
    run(k, 30, 0.1);
    expect(cup.group.position.equals(at)).toBe(true);
    expect(cup.group.quaternion.equals(q)).toBe(true);
    expect(cup.down).toBe(true);
    // the flowerpot beside it never moved
    expect(k.list[1].down).toBe(false);
    expect(lowestY(k.list[1].group)).toBeCloseTo(POT.y, 5);
    k.dispose();
  });

  // Ruling R20: nothing this small casts a real shadow (walk.js's castShadow
  // pass skips it), so a landed thing gets a small, fixed, flat contact decal
  // under it, and nothing while it stands or falls.
  test('a landed thing gets a small flat contact decal under it; none while it stands or falls', () => {
    const scene = new THREE.Scene();
    const DECK = { ...POT, fallTo: { ...POT.fallTo, y: 0.03 } };
    const k = createKnockables(scene, [CUP, DECK]);
    const [cup, pot] = k.list;
    for (const e of k.list) {
      expect(e.decal.isMesh).toBe(true);
      expect(scene.children).toContain(e.decal);
      expect(e.decal.visible).toBe(false);
      expect(e.decal.geometry.type).toBe('CircleGeometry');
      expect(e.decal.material.type).toBe('MeshBasicMaterial');
      expect(e.decal.material.transparent).toBe(true);
      expect(e.decal.material.depthWrite).toBe(false);
      // walk.js's shadow pass leaves a decal alone
      expect(e.decal.userData.contactDecal).toBe(true);
      expect(e.decal.castShadow).toBe(false);
    }
    k.knock(cup);
    run(k, 0.25);
    expect(cup.decal.visible).toBe(false); // mid-fall: no shadow chasing it along
    run(k, 1);
    expect(cup.decal.visible).toBe(true);
    // flat on the ground, just above it, under the landed cup
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(cup.decal.quaternion);
    expect(normal.y).toBeCloseTo(1, 6);
    expect(cup.decal.position.y).toBeGreaterThan(0);
    expect(cup.decal.position.y).toBeLessThan(0.01);
    const landed = new THREE.Box3().setFromObject(cup.group);
    const centre = landed.getCenter(new THREE.Vector3());
    expect(Math.hypot(cup.decal.position.x - centre.x, cup.decal.position.z - centre.z)).toBeLessThan(0.02);
    const r = cup.decal.geometry.parameters.radius;
    expect(r).toBeGreaterThan(0.05);
    expect(r).toBeLessThan(0.25);
    // and it stays put
    const at = cup.decal.position.clone();
    run(k, 10, 0.1);
    expect(cup.decal.position.equals(at)).toBe(true);
    expect(cup.decal.visible).toBe(true);
    // a co-walker's knock lands it the same way, on a deck 3 cm up
    expect(pot.decal.visible).toBe(false);
    k.knockById(DECK.id);
    run(k, 2);
    expect(pot.decal.visible).toBe(true);
    expect(pot.decal.position.y).toBeGreaterThan(0.03);
    expect(pot.decal.position.y).toBeLessThan(0.04);
    expect(lowestY(pot.group)).toBeCloseTo(0.03, 5);
    k.dispose();
  });

  test('a book lands flat, face down, on the ground', () => {
    const k = createKnockables(new THREE.Scene(), [BOOK]);
    k.knock(k.list[0]);
    run(k, 2);
    expect(lowestY(k.list[0].group)).toBeCloseTo(0, 5);
    expect(k.list[0].group.position.x).toBeCloseTo(BOOK.fallTo.x, 6);
    k.dispose();
  });

  test('both devices land it at the same spot and pose, whatever their frame rates', () => {
    const a = createKnockables(new THREE.Scene(), [CUP]);
    const b = createKnockables(new THREE.Scene(), [CUP]);
    a.knock(a.list[0]);
    b.knockById(CUP.id);
    run(a, 1.5, 1 / 60);
    run(b, 1.5, 1 / 13);
    const [ga, gb] = [a.list[0].group, b.list[0].group];
    expect(ga.position.toArray()).toEqual(gb.position.toArray());
    expect(ga.quaternion.toArray()).toEqual(gb.quaternion.toArray());
    a.dispose();
    b.dispose();
  });

  test('knocking twice is refused, and knockById on a down item is false', () => {
    const k = createKnockables(new THREE.Scene(), [CUP, POT]);
    const [cup, pot] = k.list;
    expect(k.knock(cup)).toBe(true);
    expect(k.knock(cup)).toBe(false);
    expect(k.knockById(CUP.id)).toBe(false);
    expect(k.knockById(POT.id)).toBe(true);
    expect(pot.down).toBe(true);
    expect(k.knockById(POT.id)).toBe(false);
    expect(k.knock(pot)).toBe(false);
    // unknown, non-string and prototype ids, and a stranger entry, are all refused
    for (const bad of ['docks-cup-9', 3, null, undefined, '__proto__', 'constructor', {}]) {
      expect(k.knockById(bad)).toBe(false);
    }
    expect(k.knock({ id: 'neighborhood-book-1', down: false })).toBe(false);
    expect(k.knock(null)).toBe(false);
    k.dispose();
  });

  test('nearest only offers standing items at the cat\'s perch height', () => {
    const k = createKnockables(new THREE.Scene(), [CUP, BOOK]);
    const [cup] = k.list;
    const beside = new THREE.Vector3(CUP.x + 0.6, CUP.y, CUP.z + 0.3);
    expect(k.nearest(beside, CUP.y, 1.0)).toBe(cup);
    // the same spot from the ground, or from a perch a little too high or low
    expect(k.nearest(beside, 0, 1.0)).toBe(null);
    expect(k.nearest(beside, CUP.y + 0.35, 1.0)).toBe(null);
    expect(k.nearest(beside, CUP.y - 0.35, 1.0)).toBe(null);
    expect(k.nearest(beside, CUP.y + 0.25, 1.0)).toBe(cup);
    // out of reach
    expect(k.nearest(new THREE.Vector3(CUP.x + 1.2, CUP.y, CUP.z), CUP.y, 1.0)).toBe(null);
    // the bench book at its own height
    expect(k.nearest(new THREE.Vector3(BOOK.x, BOOK.y, BOOK.z + 0.5), BOOK.y, 1.0)).toBe(k.list[1]);
    // a knocked one is never offered again, even mid-fall right beside you
    k.knock(cup);
    expect(k.nearest(beside, CUP.y, 1.0)).toBe(null);
    run(k, 2);
    expect(k.nearest(new THREE.Vector3(CUP.fallTo.x, 0, CUP.fallTo.z), 0, 1.0)).toBe(null);
    // garbage perch heights find nothing and never throw
    expect(k.nearest(beside, NaN, 1.0)).toBe(null);
    expect(k.nearest(beside, undefined, 1.0)).toBe(null);
    k.dispose();
  });

  test('dispose is idempotent and frees every geometry and material', () => {
    const scene = new THREE.Scene();
    const list = KNOCK_KINDS.map((kind, i) => ({ ...CUP, id: `docks-${kind}-${i}`, kind, x: i * 3 }));
    const k = createKnockables(scene, list);
    const geos = new Map();
    const mats = new Map();
    for (const e of k.list) {
      for (const root of [e.group, e.decal]) root.traverse((o) => {
        if (o.geometry) geos.set(o.geometry, 0);
        if (o.material) mats.set(o.material, 0);
      });
    }
    expect(geos.size).toBeGreaterThan(0);
    for (const g of geos.keys()) g.addEventListener('dispose', () => geos.set(g, geos.get(g) + 1));
    for (const m of mats.keys()) m.addEventListener('dispose', () => mats.set(m, mats.get(m) + 1));
    k.knock(k.list[0]);
    k.dispose();
    k.dispose();
    expect([...geos.values()].every((n) => n === 1)).toBe(true);
    expect([...mats.values()].every((n) => n === 1)).toBe(true);
    expect(scene.children).toHaveLength(0);
    // after dispose nothing is offered, knocked or animated, and nothing throws
    expect(k.list).toHaveLength(0);
    expect(k.nearest(new THREE.Vector3(), CUP.y, 99)).toBe(null);
    expect(k.knockById(list[1].id)).toBe(false);
    expect(() => k.update(0.1)).not.toThrow();
  });

  test('an empty or missing list builds nothing (the den)', () => {
    const scene = new THREE.Scene();
    for (const l of [[], undefined, null, propsFor('den').knockables]) {
      const k = createKnockables(scene, l);
      expect(k.list).toEqual([]);
      expect(k.nearest(new THREE.Vector3(), 0, 9)).toBe(null);
      k.update(0.1);
      k.dispose();
    }
    expect(scene.children).toHaveLength(0);
  });

  test('every shipped knockable builds, with its curated id', () => {
    for (const area of ['neighborhood', 'park', 'seaside', 'docks']) {
      const spots = propsFor(area).knockables;
      const k = createKnockables(new THREE.Scene(), spots);
      expect(k.list.map((e) => e.id)).toEqual(spots.map((s) => s.id));
      k.dispose();
    }
  });
});

// The walk builds them per walk from the curated set, outside the rival
// slice, with no contact decal, frees them before endWalk's scene traversal,
// and the render loop plays the fall.
test('the walk wires knockables in, outside the rival slice, with no decal', () => {
  const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const code = walk.replace(/\/\/.*$/gm, '');
  expect(code.match(/createKnockables\(scene, propsFor\(areaId\)\.knockables\)/g)).toHaveLength(1);
  expect(code).not.toMatch(/decals\.follow\([^)]*knock/);
  const rivalA = walk.indexOf("The rival's border and its patrol");
  const rivalB = walk.indexOf('session.rival = {', rivalA);
  expect(rivalA).toBeGreaterThan(0);
  expect(walk.slice(rivalA, rivalB)).not.toMatch(/knock/i);
  const freed = code.indexOf('session.knockables.dispose()');
  expect(freed).toBeGreaterThan(0);
  expect(freed).toBeLessThan(code.indexOf('session.scene.traverse('));
  expect(main).toMatch(/session\.knockables\.update\(dt\)/);
});
