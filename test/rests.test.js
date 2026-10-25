import { test, expect, vi } from 'vitest';
import * as THREE from 'three';

// createPlayer registers key / pointer-lock listeners on `document`, and the
// world builders ask it for a canvas (test/pushthrough.test.js's stub).
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

const { createRests, startRest, tickRest, REST_SIP, NAP_PURR_EVERY, REST_LOOKS } = await import('../src/rests.js');
const { propsFor, REST_KINDS } = await import('../src/propsets.js');
const { isWalkableAt, createPlayer, CAT_RADIUS } = await import('../src/player.js');
const { build: buildNeigh } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');

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

// Every look is named for a real rest of its own kind, and every rest that is
// built has one: a renamed id must not silently lose its look (a birdbath
// turning into a bowl) or its floor (the seaside crate sinking into the pier).
test('every REST_LOOKS key is a real built rest of the right kind, and every built rest has a look', () => {
  const LOOK_KIND = { bowl: 'drink', birdbath: 'drink', dish: 'eat', crate: 'eat', cushion: 'nap', doormat: 'nap' };
  const all = [...AREAS, 'den'].flatMap((a) => propsFor(a).rests);
  const byId = new Map(all.map((r) => [r.id, r]));
  for (const [id, { look }] of Object.entries(REST_LOOKS)) {
    expect(byId.has(id), `${id} is not a rest in propsets.js`).toBe(true);
    expect(byId.get(id).mesh, id).toBe(true);
    expect(LOOK_KIND[look], `${id} wears a ${look}`).toBe(byId.get(id).kind);
  }
  for (const r of all.filter((x) => x.mesh)) expect(Object.hasOwn(REST_LOOKS, r.id), `${r.id} has no look`).toBe(true);
  // The crate on the pier stands on the deck seaside.js draws at y 0.25.
  expect(REST_LOOKS['seaside-eat-1']).toEqual({ look: 'crate', floor: 0.25 });
  expect(propsFor('seaside').rests.find((r) => r.id === 'seaside-eat-1')).toMatchObject({ x: 29, z: -10 });
});

test('only the birdbaths are solid: one collider each, none on the pier crate or anywhere in the den', () => {
  const solid = (a) => createRests(new THREE.Scene(), propsFor(a).rests).colliders;
  expect(solid('neighborhood')).toEqual([{ x: -18.5, z: -26, r: 0.3 }]);
  expect(solid('park')).toEqual([{ x: 21, z: 14, r: 0.3 }]);
  for (const a of ['seaside', 'docks', 'den']) expect(solid(a), a).toEqual([]);
  const rests = createRests(new THREE.Scene(), propsFor('park').rests);
  rests.dispose();
  expect(rests.colliders).toEqual([]);
});

// The real player, walked straight at each birdbath from eight sides, stops at
// the basin and never inside it — and stops inside the 1.2 m drink reach, on
// ground it can stand on, so the drink prompt is always there.
test.each([['neighborhood', buildNeigh], ['park', buildPark]])('%s: the cat walks up to the birdbath, not through it, and can still drink', (a, build) => {
  const area = build(new THREE.Scene());
  const rests = createRests(new THREE.Scene(), propsFor(a).rests);
  const bath = rests.list.find((r) => r.kind === 'drink');
  const [solid] = rests.colliders;
  const colliders = [...area.colliders, ...rests.colliders];
  const withBath = { ...area, colliders };
  let approaches = 0;
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    const dir = { x: -Math.cos(t), z: -Math.sin(t) }; // toward the basin
    const start = { x: bath.x - dir.x * 2.5, z: bath.z - dir.z * 2.5 };
    if (!isWalkableAt(withBath, start.x, start.z)) continue;
    approaches += 1;
    const player = createPlayer(new THREE.PerspectiveCamera(), { addEventListener() {} });
    const cat = new THREE.Object3D();
    player.setAvatar(cat, 3.5);
    player.enable();
    cat.position.set(start.x, 0, start.z);
    player.setTouchMove({ x: dir.x, z: dir.z, mag: 1 });
    for (let k = 0; k < 150; k++) player.update(1 / 60, colliders, area.bounds, area.waters);
    player.disable();
    const d = Math.hypot(cat.position.x - bath.x, cat.position.z - bath.z);
    expect(d, `from side ${i}`).toBeGreaterThanOrEqual(solid.r + CAT_RADIUS - 0.02);
    expect(d, `from side ${i}`).toBeLessThan(1.2);
    expect(rests.nearest(cat.position, 1.2)?.id, `from side ${i}`).toBe(bath.id);
  }
  expect(approaches).toBeGreaterThanOrEqual(6);
  rests.dispose();
});

// The walk makes the birdbaths solid the way it makes the flap frames solid:
// after clearSpot has moved the POIs, before the session (and its first frame).
test('the walk adds the birdbath colliders to the walk\'s collider list before the first frame', async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  expect(code.match(/createRests\(scene, propsFor\(areaId\)\.rests\)/g)).toHaveLength(1);
  const solid = code.indexOf('for (const c of rests.colliders) areaData.colliders.push(');
  expect(solid).toBeGreaterThan(code.indexOf('clearSpot(p, areaData.colliders'));
  expect(solid).toBeLessThan(code.indexOf('const session = {'));
});
