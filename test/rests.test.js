import { test, expect } from 'vitest';
import * as THREE from 'three';
import { createRests, startRest, tickRest, REST_SIP, NAP_PURR_EVERY } from '../src/rests.js';
import { propsFor, REST_KINDS } from '../src/propsets.js';

const AREAS = ['neighborhood', 'park', 'seaside', 'docks'];

// A scene that counts what goes in and out.
function countingScene() {
  const scene = new THREE.Scene();
  let added = 0;
  const add = scene.add.bind(scene);
  scene.add = (...objs) => { added += objs.length; return add(...objs); };
  return { scene, added: () => added };
}

test('the den rests use the bowls already there and add no mesh', () => {
  const { scene, added } = countingScene();
  const rests = createRests(scene, propsFor('den').rests);
  expect(added()).toBe(0);
  expect(scene.children).toHaveLength(0);
  expect(rests.list.map((r) => r.kind).sort()).toEqual([...REST_KINDS].sort());
  for (const r of rests.list) expect(r.group).toBeNull();
  // ...and they still answer nearest(): at the water bowl, the water bowl.
  const drink = propsFor('den').rests.find((r) => r.kind === 'drink');
  expect(rests.nearest({ x: drink.x, z: drink.z + 0.3 }, 1.2)).toMatchObject({ id: 'den-drink-1', kind: 'drink', x: drink.x, z: drink.z });
  rests.dispose();
});

test.each(AREAS)('%s: one mesh per rest, standing on the ground (or the deck) at its spot', (a) => {
  const { scene } = countingScene();
  const curated = propsFor(a).rests;
  const rests = createRests(scene, curated);
  expect(rests.list.map((r) => r.id)).toEqual(curated.map((r) => r.id));
  for (const r of rests.list) {
    expect(r.group).toBeInstanceOf(THREE.Group);
    expect(scene.children).toContain(r.group);
    const box = new THREE.Box3().setFromObject(r.group);
    // Lifted by -box.min.y: its lowest point is on the floor it stands on,
    // never under it and never floating.
    const floor = r.id === 'seaside-eat-1' ? 0.25 : 0; // the pier deck
    expect(box.min.y).toBeCloseTo(floor, 6);
    // Small and low: a bowl, a birdbath, a dish, a crate, a cushion, a mat.
    expect(box.max.y - box.min.y).toBeLessThan(0.45);
    const size = box.getSize(new THREE.Vector3());
    expect(Math.max(size.x, size.z)).toBeLessThan(1.0);
    expect(r.group.position.x).toBeCloseTo(r.x, 6);
    expect(r.group.position.z).toBeCloseTo(r.z, 6);
  }
  rests.dispose();
});

test('dispose frees each geometry and material once, empties the scene, and is idempotent', () => {
  const { scene } = countingScene();
  const rests = createRests(scene, propsFor('park').rests);
  const geos = new Set();
  const mats = new Set();
  scene.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) mats.add(o.material);
  });
  expect(geos.size).toBeGreaterThan(0);
  const freed = new Map();
  for (const x of [...geos, ...mats]) {
    freed.set(x, 0);
    x.addEventListener('dispose', () => freed.set(x, freed.get(x) + 1));
  }
  rests.dispose();
  rests.dispose();
  expect([...freed.values()].every((n) => n === 1)).toBe(true);
  expect(scene.children).toHaveLength(0);
  expect(rests.list).toEqual([]);
  expect(rests.nearest({ x: 0, z: 0 }, 100)).toBeNull();
});

test('createRests never throws on an empty or unknown list', () => {
  const scene = new THREE.Scene();
  for (const bad of [undefined, null, [], 'drink', 42, {}, [null], [42], [{}],
    [{ id: 'x-drink-1', kind: 'bath', x: 0, z: 0, mesh: true }],
    [{ id: 'x-drink-1', kind: 'drink', x: NaN, z: 0, mesh: true }],
    [{ id: 'x-drink-1', kind: '__proto__', x: 0, z: 0, mesh: true }],
  ]) {
    let rests;
    expect(() => { rests = createRests(scene, bad); }).not.toThrow();
    expect(rests.list).toEqual([]);
    expect(rests.nearest({ x: 0, z: 0 }, 5)).toBeNull();
    expect(() => rests.dispose()).not.toThrow();
  }
  expect(scene.children).toHaveLength(0);
  // A good entry beside a bad one still gets built.
  const rests = createRests(scene, [null, { id: 'x-nap-1', kind: 'nap', x: 1, z: 2, mesh: true }]);
  expect(rests.list.map((r) => r.id)).toEqual(['x-nap-1']);
  expect(rests.nearest(null, 5)).toBeNull();
  expect(rests.nearest({ x: 1, z: 2 }, NaN)).toBeNull();
  rests.dispose();
});

test('nearest: the closest rest strictly inside maxDist', () => {
  const rests = createRests(new THREE.Scene(), [
    { id: 'x-drink-1', kind: 'drink', x: 0, z: 0, mesh: false },
    { id: 'x-eat-1', kind: 'eat', x: 2, z: 0, mesh: false },
  ]);
  expect(rests.nearest({ x: 0.5, z: 0 }, 1.2).id).toBe('x-drink-1');
  expect(rests.nearest({ x: 1.6, z: 0 }, 1.2).id).toBe('x-eat-1');
  expect(rests.nearest({ x: 0, z: 1.2 }, 1.2)).toBeNull();
});

test('startRest: drink and eat last REST_SIP seconds, a nap until you move; anything else is no rest', () => {
  expect(REST_SIP).toBe(3);
  expect(startRest('drink')).toEqual({ kind: 'drink', t: 0 });
  expect(startRest('eat')).toEqual({ kind: 'eat', t: 0 });
  expect(startRest('nap')).toEqual({ kind: 'nap', t: 0 });
  for (const bad of ['bath', '__proto__', null, 3, undefined]) expect(startRest(bad)).toBeNull();
});

test('tickRest: a sip ends after 3 s, or the moment the cat stirs', () => {
  let r = startRest('drink');
  let out;
  for (let i = 0; i < 29; i++) {
    out = tickRest(r, 0.1, { stirred: false });
    r = out.rest;
  }
  expect(r).not.toBeNull();
  expect(out.purr).toBe(false);
  out = tickRest(r, 0.15, { stirred: false });
  expect(out.rest).toBeNull();
  expect(tickRest(startRest('eat'), 0.01, { stirred: true }).rest).toBeNull();
});

test('tickRest: a nap never ends on its own, purrs every NAP_PURR_EVERY s, and ends when the cat stirs', () => {
  let r = startRest('nap');
  let purrs = 0;
  const frames = Math.round(600 / (1 / 60)); // ten minutes asleep
  for (let i = 0; i < frames; i++) {
    const out = tickRest(r, 1 / 60, { stirred: false });
    r = out.rest;
    if (out.purr) purrs += 1;
  }
  expect(r?.kind).toBe('nap');
  expect(Math.abs(purrs - 600 / NAP_PURR_EVERY)).toBeLessThanOrEqual(1); // float drift over 36 000 frames
  const woke = tickRest(r, 1 / 60, { stirred: true });
  expect(woke).toEqual({ rest: null, purr: false });
  // garbage in: no rest, no purr, no throw
  for (const bad of [null, undefined, {}, { kind: 'bath', t: 0 }]) {
    expect(tickRest(bad, 0.1, { stirred: false })).toEqual({ rest: null, purr: false });
  }
  // a NaN or negative dt does not wind the clock
  expect(tickRest({ kind: 'drink', t: 1 }, NaN, {}).rest).toEqual({ kind: 'drink', t: 1 });
  expect(tickRest({ kind: 'drink', t: 1 }, -5, {}).rest).toEqual({ kind: 'drink', t: 1 });
});
