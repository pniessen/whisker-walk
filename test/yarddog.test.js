import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createYardDog, NO_DOG } from '../src/yarddog.js';
import { inYard, DOG_COOLDOWN } from '../src/dogs.js';
import { chaseAllowed } from '../src/rivalcats.js';
import { propsFor } from '../src/propsets.js';

const YARD = { x: 10, z: -5, r: 4, kennel: { x: 8, z: -7 } };
const DT = 1 / 60;

function mk(opts = {}, yard = YARD) {
  const scene = new THREE.Scene();
  const events = [];
  const api = createYardDog(scene, yard, {
    onBark: () => events.push('bark'),
    onChase: () => events.push('chase'),
    onSettled: () => events.push('settled'),
    ...opts,
  });
  const run = (cat, seconds, extra = {}, avatar) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) api.update(DT, cat, avatar, extra);
  };
  return { scene, api, events, run };
}

const count = (events, e) => events.filter((x) => x === e).length;

describe('createYardDog', () => {
  test('an unknown yard is an inert dog', () => {
    for (const y of [null, undefined, propsFor('den').dogYard, {}, { x: 0, z: 0, r: 4 }, { x: NaN, z: 0, r: 4, kennel: { x: 0, z: 0 } }, 'yard']) {
      const scene = new THREE.Scene();
      const d = createYardDog(scene, y);
      expect(d).toBe(NO_DOG);
      expect(scene.children).toHaveLength(0);
      expect(d.spotPos).toBeNull();
      const cat = new THREE.Vector3(0, 0, 0);
      expect(() => d.update(DT, cat, null, {})).not.toThrow();
      expect(() => d.dispose()).not.toThrow();
    }
  });

  test('it lies by its kennel on its lawn, and the kennel is solid', () => {
    const { api } = mk();
    const p = api.spotPos;
    expect(inYard(YARD, p.x, p.z)).toBe(true);
    expect(Math.hypot(p.x - YARD.kennel.x, p.z - YARD.kennel.z)).toBeCloseTo(1, 6);
    // nearer the middle than the kennel is
    expect(Math.hypot(p.x - YARD.x, p.z - YARD.z)).toBeLessThan(Math.hypot(YARD.kennel.x - YARD.x, YARD.kennel.z - YARD.z));
    expect(api.colliders).toEqual([{ x: 8, z: -7, r: expect.any(Number) }]);
    expect(api.state).toBe('lie');
  });

  test('dispose takes everything out and frees each geometry and material once, and is idempotent', () => {
    const { scene, api } = mk();
    expect(scene.children.length).toBe(3); // kennel, lawn patch, dog
    const geos = new Map();
    const mats = new Map();
    scene.traverse((o) => {
      if (o.geometry) { geos.set(o.geometry, 0); o.geometry.addEventListener('dispose', () => geos.set(o.geometry, geos.get(o.geometry) + 1)); }
      for (const m of [].concat(o.material ?? [])) {
        if (!mats.has(m)) { mats.set(m, 0); m.addEventListener('dispose', () => mats.set(m, mats.get(m) + 1)); }
      }
    });
    api.dispose();
    api.dispose();
    expect(scene.children).toHaveLength(0);
    for (const n of geos.values()) expect(n).toBe(1);
    for (const n of mats.values()) expect(n).toBe(1);
    expect(api.spotPos).toBeNull();
    const cat = new THREE.Vector3(11, 0, -5);
    api.update(DT, cat, null, {});
    expect(cat.x).toBe(11);
  });

  test('a trotting cat in the yard is chased out once, then the dog cools down', () => {
    const { api, events, run } = mk();
    const cat = new THREE.Vector3(12.5, 0, -5);
    const avatar = new THREE.Group();
    api.update(DT, cat, avatar, {});
    expect(events).toEqual(['bark', 'chase']);
    expect(api.state).toBe('chase');
    // The scamper: the cat runs, with a hop, then lands on the ground off the lawn.
    let maxY = 0;
    for (let i = 0; i < 60 && !events.includes('settled'); i++) { api.update(DT, cat, avatar, {}); maxY = Math.max(maxY, cat.y); }
    expect(maxY).toBeGreaterThan(0.1);
    expect(events).toEqual(['bark', 'chase', 'settled']);
    expect(inYard(YARD, cat.x, cat.z)).toBe(false);
    expect(cat.x).toBeCloseTo(10 + 4 + 1.5, 6);
    expect(cat.z).toBeCloseTo(-5, 6);
    expect(cat.y).toBe(0);
    // The cat looks back at the dog (rotation.y + PI faces the dog).
    const dp = api.spotPos;
    const want = Math.atan2(dp.x - cat.x, dp.z - cat.z) + Math.PI;
    expect(Math.cos(avatar.rotation.y - want)).toBeCloseTo(1, 6);
    // The dog bounds after it to the edge of its lawn, and no further.
    expect(inYard(YARD, dp.x, dp.z)).toBe(true);
    let far = 0;
    for (let i = 0; i < 60; i++) {
      api.update(DT, cat, avatar, {});
      const p = api.spotPos;
      expect(inYard(YARD, p.x, p.z)).toBe(true);
      far = Math.max(far, Math.hypot(p.x - 10, p.z + 5));
    }
    expect(far).toBeGreaterThan(3.5);
    expect(count(events, 'settled')).toBe(1);

    // Straight back in: nothing until the cooldown (from the landing, a
    // second ago) is over.
    cat.set(12.5, 0, -5);
    run(cat, DOG_COOLDOWN - 1.5);
    expect(count(events, 'chase')).toBe(1);
    expect(cat.x).toBe(12.5);
    // The dog went home and lay down meanwhile.
    expect(api.state).toBe('lie');
    // Then it chases again.
    run(cat, 1);
    expect(count(events, 'chase')).toBe(2);
    expect(count(events, 'bark')).toBe(2);
  });

  test('a stalking cat gets halfway to the middle before it notices', () => {
    const { events, run } = mk();
    const cat = new THREE.Vector3(10 + 4 * 0.7, 0, -5);
    run(cat, 1, { stalking: true });
    expect(events).toEqual([]);
    cat.x = 10 + 4 * 0.45;
    run(cat, 0.1, { stalking: true });
    expect(events.slice(0, 2)).toEqual(['bark', 'chase']);
  });

  test('a cat outside the yard is never touched', () => {
    const { events, run } = mk();
    const cat = new THREE.Vector3(14.2, 0, -5);
    run(cat, 3);
    expect(events).toEqual([]);
    expect(cat.x).toBe(14.2);
  });

  test('a fearless cat is barked at and not moved', () => {
    const { api, events, run } = mk({ fearless: true });
    const cat = new THREE.Vector3(11, 0, -5);
    const avatar = new THREE.Group();
    avatar.rotation.y = 0.3;
    run(cat, 2, {}, avatar);
    expect(events).toEqual(['bark']);
    expect(api.state).toBe('lie');
    expect([cat.x, cat.y, cat.z]).toEqual([11, 0, -5]);
    expect(avatar.rotation.y).toBe(0.3);
    // and again only after the cooldown
    run(cat, DOG_COOLDOWN);
    expect(events).toEqual(['bark', 'bark']);
    expect(cat.x).toBe(11);
  });

  test('a perched cat or photo mode is never chased', () => {
    const session = { cameraMode: false, chasing: false };
    const player = { perchY: 0.85 };
    const { events, run } = mk({ canChase: () => chaseAllowed(player, session) });
    const cat = new THREE.Vector3(11, 0.85, -5);
    run(cat, 1);
    expect(events).toEqual([]);
    player.perchY = 0;
    session.cameraMode = true;
    cat.y = 0;
    run(cat, 1);
    expect(events).toEqual([]);
    expect(cat.x).toBe(11);
  });

  test('while a rival is chasing the cat the dog waits, and the rival waits for the dog', () => {
    const session = { cameraMode: false, chasing: true };
    const player = { perchY: 0 };
    expect(chaseAllowed(player, session)).toBe(false);
    const { events, run } = mk({ canChase: () => chaseAllowed(player, session) });
    const cat = new THREE.Vector3(11, 0, -5);
    run(cat, 1);
    expect(events).toEqual([]);
    session.chasing = false;
    run(cat, DT);
    expect(events).toEqual(['bark', 'chase']);
  });

  test('reduced motion is a short move with no hop', () => {
    const { api, events } = mk({ reducedMotion: true });
    const cat = new THREE.Vector3(11, 0, -5);
    const dogAt = api.spotPos;
    let maxY = 0;
    for (let i = 0; i < 20; i++) { api.update(DT, cat, null, {}); maxY = Math.max(maxY, cat.y); }
    expect(events).toEqual(['bark', 'chase', 'settled']);
    expect(maxY).toBe(0);
    expect(inYard(YARD, cat.x, cat.z)).toBe(false);
    // no bound either
    expect(api.spotPos).toEqual(dogAt);
  });

  test('a landing nowhere walkable means no bark, no chase and no move', () => {
    const { events, run } = mk({ isWalkable: () => false });
    const cat = new THREE.Vector3(11, 0, -5);
    run(cat, 1);
    expect(events).toEqual([]);
    expect(cat.x).toBe(11);
  });

  test('the scamper heads for the walkable landing, never the raw point', () => {
    const walk = (x) => x > 16; // the r + 1.5 point at x 15.5 is not walkable
    const { events, run } = mk({ isWalkable: (x) => walk(x) });
    const cat = new THREE.Vector3(11, 0, -5);
    run(cat, 1);
    expect(count(events, 'settled')).toBe(1);
    expect(cat.x).toBeGreaterThan(16);
    expect(cat.z).toBeCloseTo(-5, 6);
  });

  test('bad dt or no cat does nothing', () => {
    const { events, api } = mk();
    const cat = new THREE.Vector3(11, 0, -5);
    for (const dt of [NaN, -1, undefined, 'x']) api.update(dt, cat, null, {});
    api.update(DT, null, null, {});
    expect(events).toEqual([]);
  });
});

// The anti-goal, as a test: the dog takes nothing. Structural, because a
// module cannot take anything away if it cannot reach anything that stores it
// (test/rivalcats.test.js's idiom, an exact allowlist of imports).
test('the dog takes nothing: its modules import nothing that stores progress', () => {
  const importsOf = (f) => {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    return [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).sort();
  };
  expect(importsOf('dogs.js')).toEqual([]);
  expect(importsOf('yarddog.js')).toEqual(['./dogs.js', './render/materials.js', 'three']);
  for (const f of ['dogs.js', 'yarddog.js']) {
    const code = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    for (const bad of ['progression', 'colony', 'discoveries', 'enemies', 'marks', 'import(', 'require(']) {
      expect(code, `${f}: ${bad}`).not.toContain(bad);
    }
    // no randomness of any kind: never walkRng, never Math.random
    expect(code).not.toMatch(/Math\.random|walkRng|\brng\b/);
  }
});

test('the walk.js dog block pays and takes nothing, and leaves the carried item alone', () => {
  const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const a = src.indexOf('The dog in its yard');
  const b = src.indexOf('session.dog = dog;');
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  const code = src.slice(a, b).replace(/\/\/.*$/gm, '');
  expect(code).toContain('hud.toast');
  expect(code).toContain('canChase: () => chaseAllowed(player, session)');
  for (const bad of ['progression.', 'colony', 'recordGolden', 'log.', 'award', 'recordFeat', 'setPoints', 'discover',
    'freezeTime', 'carry', 'mouth', 'mark', 'walkRng', 'Math.random']) {
    expect(code, bad).not.toContain(bad);
  }
  // the toasts, verbatim
  expect(code).toContain('Woof! The dog chased you off its lawn! 🐕');
  expect(code).toContain("The dog barks. You don't even flinch. 😼");
  // the fearless line is said once a walk (the bark itself repeats)
  expect(code).toMatch(/let shrugged = false;[\s\S]*onBark: \(\) => \{\s*audio\.bark\(\);\s*if \(fearlessCat && !shrugged\) \{\s*shrugged = true;\s*hud\.toast\("The dog barks/);
  expect(code.match(/hud\.toast\("The dog barks/g)).toHaveLength(1);
  // and nothing of the dog went into the rival's slice
  const r0 = src.indexOf("The rival's border and its patrol");
  const r1 = src.indexOf('session.rival = {');
  expect(src.slice(r0, r1)).not.toMatch(/dog/i);
});

test('endWalk frees the dog once, before the scene traversal; the render loop drives it after the rival', () => {
  const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const end = walk.indexOf('function endWalk');
  const at = walk.indexOf('session.dog.dispose()', end);
  expect(at).toBeGreaterThan(end);
  expect(at).toBeLessThan(walk.indexOf('session.scene.traverse(', end));
  expect(walk.indexOf('session.dog.dispose()', at + 1)).toBe(-1);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const rival = main.indexOf('session.rival.update(dt, t, session.cat.position, session.cat);');
  const dog = main.indexOf('session.dog.update(dt, session.cat.position, session.cat, { stalking: player.stalking });');
  expect(rival).toBeGreaterThan(0);
  expect(dog).toBeGreaterThan(rival);
});

test('the journal says how to meet this dog: from outside its lawn', () => {
  const src = readFileSync(new URL('../src/journal.js', import.meta.url), 'utf8');
  expect(src).not.toContain('Walk up calmly');
  expect(src).toContain("{ id: 'dog', emoji: '🐕', name: 'Friendly Dog', hint: 'Spot it from outside its lawn — it chases cats off the grass!' }");
});

test('photo mode can still frame the dog: the yard dog is the critter-dog subject', () => {
  const src = readFileSync(new URL('../src/game/photo.js', import.meta.url), 'utf8');
  expect(src).toContain('const dogAt = s.dog?.spotPos;');
  expect(src).toContain("if (dogAt) candidates.push({ key: 'critter-dog', label: labelFor('dog'), pos: new THREE.Vector3(dogAt.x, 0, dogAt.z) });");
});
