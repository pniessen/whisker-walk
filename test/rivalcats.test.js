import { test, expect, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { rivalFor, patrolPath, isTrespassing, borderMarks } from '../src/rivalclans.js';
import {
  patrolAt, chaseOutcome, findLanding, createRivalPatrol, chaseAllowed,
  NOTICE_DIST, LANDING_OFFSET, PATROL_SPEED, SCAMPER_TIME, SCAMPER_TIME_REDUCED, CHASE_COOLDOWN,
} from '../src/rivalcats.js';

const AREAS = ['neighborhood', 'park', 'seaside', 'docks'];

test('the patrol is in the same place on both devices at the same time', () => {
  for (const a of AREAS) expect(patrolAt(a, 12.5)).toEqual(patrolAt(a, 12.5));
});

test('the patrol walks the border', () => {
  for (const a of AREAS) {
    const { cx, cz, r } = rivalFor(a);
    for (const t of [0, 3, 7.5, 60, 1.7e9 + 0.3]) {
      const p = patrolAt(a, t);
      expect(Math.abs(Math.hypot(p.x - cx, p.z - cz) - r)).toBeLessThan(1.0);
    }
  }
});

test('the patrol walks at a slow pace', () => {
  expect(PATROL_SPEED).toBeGreaterThanOrEqual(0.6);
  expect(PATROL_SPEED).toBeLessThanOrEqual(0.9);
  const a = patrolAt('park', 100);
  const b = patrolAt('park', 101);
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  expect(d).toBeGreaterThan(0.3);
  expect(d).toBeLessThanOrEqual(PATROL_SPEED + 1e-6);
});

test('an unknown area has no patrol, and a bad clock has none either', () => {
  expect(patrolAt('den', 0)).toBeNull();
  expect(patrolAt('__proto__', 0)).toBeNull();
  for (const t of [NaN, Infinity, -Infinity, undefined, null, '5', {}]) {
    expect(patrolAt('park', t)).toBeNull();
  }
  expect(patrolAt('park', -50)).not.toBeNull();
});

test('the distances are named, and ordered sensibly', () => {
  expect(NOTICE_DIST).toBeGreaterThanOrEqual(4);
  expect(NOTICE_DIST).toBeLessThanOrEqual(5);
  for (const a of AREAS) expect(NOTICE_DIST).toBeLessThan(rivalFor(a).r);
  expect(LANDING_OFFSET).toBeGreaterThanOrEqual(1.2);
  expect(LANDING_OFFSET).toBeLessThanOrEqual(1.8);
  expect(SCAMPER_TIME).toBeGreaterThanOrEqual(0.5);
  expect(SCAMPER_TIME).toBeLessThanOrEqual(0.8);
  expect(SCAMPER_TIME_REDUCED).toBeLessThanOrEqual(0.35);
  expect(CHASE_COOLDOWN).toBeGreaterThanOrEqual(6);
});

test('you are chased only when inside the border and the patrol is near', () => {
  const { cx, cz, r } = rivalFor('park');
  const inside = { x: cx, z: cz };
  expect(chaseOutcome('park', inside, inside).chased).toBe(true);
  expect(chaseOutcome('park', { x: cx + r * 3, z: cz }, inside).chased).toBe(false);
});

test('a cat inside can sneak past a patrol on the far side', () => {
  const { cx, cz, r } = rivalFor('park');
  const cat = { x: cx - r * 0.5, z: cz };
  const far = { x: cx + r, z: cz };
  expect(Math.hypot(cat.x - far.x, cat.z - far.z)).toBeGreaterThan(NOTICE_DIST);
  expect(chaseOutcome('park', cat, far)).toEqual({ chased: false, to: null });
  const near = { x: cx - r, z: cz };
  expect(chaseOutcome('park', cat, near).chased).toBe(true);
});

test('being chased puts you outside the border, and nothing else', () => {
  const { cx, cz, r } = rivalFor('park');
  const out = chaseOutcome('park', { x: cx, z: cz }, { x: cx, z: cz });
  expect(Math.hypot(out.to.x - cx, out.to.z - cz)).toBeGreaterThan(r);
  expect(Object.keys(out).sort()).toEqual(['chased', 'to']);
});

test('to sits LANDING_OFFSET beyond the border on the ray through the cat', () => {
  const { cx, cz, r } = rivalFor('docks');
  const cat = { x: cx + 2, z: cz + 1 };
  const out = chaseOutcome('docks', cat, { x: cx + 1, z: cz });
  expect(Math.hypot(out.to.x - cx, out.to.z - cz)).toBeCloseTo(r + LANDING_OFFSET, 6);
  const a1 = Math.atan2(cat.z - cz, cat.x - cx);
  const a2 = Math.atan2(out.to.z - cz, out.to.x - cx);
  expect(a2).toBeCloseTo(a1, 6);
});

test('a cat exactly at the centre goes away from the patrol', () => {
  const { cx, cz, r } = rivalFor('seaside');
  const patrol = { x: cx + NOTICE_DIST - 0.5, z: cz };
  const out = chaseOutcome('seaside', { x: cx, z: cz }, patrol);
  expect(out.chased).toBe(true);
  expect(out.to.x).toBeLessThan(cx);
  expect(Math.hypot(out.to.x - cx, out.to.z - cz)).toBeCloseTo(r + LANDING_OFFSET, 6);
});

test('every sampled inside point lands outside the disc', () => {
  for (const a of AREAS) {
    const { cx, cz, r } = rivalFor(a);
    for (let i = 0; i < 400; i++) {
      const ang = i * 2.399963;
      const rad = r * Math.sqrt((i + 0.5) / 400);
      const cat = { x: cx + Math.cos(ang) * rad, z: cz + Math.sin(ang) * rad };
      const out = chaseOutcome(a, cat, { x: cat.x + 1, z: cat.z });
      expect(out.chased).toBe(true);
      expect(isTrespassing(a, out.to.x, out.to.z)).toBe(false);
      expect(Math.hypot(out.to.x - cx, out.to.z - cz)).toBeGreaterThan(r);
    }
  }
});

test('hostile inputs never throw and never chase', () => {
  const none = { chased: false, to: null };
  const ok = { x: 0, z: 0 };
  const bads = [null, undefined, 5, 'x', {}, { x: NaN, z: 0 }, { x: 0, z: Infinity }, { x: '1', z: 2 }, []];
  for (const b of bads) {
    expect(chaseOutcome('park', b, ok)).toEqual(none);
    expect(chaseOutcome('park', ok, b)).toEqual(none);
  }
  expect(chaseOutcome('den', ok, ok)).toEqual(none);
  expect(chaseOutcome(undefined, ok, ok)).toEqual(none);
  expect(chaseOutcome('__proto__', ok, ok)).toEqual(none);
});

describe('findLanding', () => {
  const { cx, cz, r } = rivalFor('seaside');
  const start = { x: cx + r + LANDING_OFFSET, z: cz };
  test('returns the point itself when walkable', () => {
    expect(findLanding('seaside', start, () => true)).toEqual(start);
  });
  test('tries further along the ray, then rotates round', () => {
    // a band along the ray is blocked: it must still land outside the disc
    const p = findLanding('seaside', start, (x, z) => !(x > cx && Math.abs(z - cz) < 3 && x < cx + 40));
    expect(p).not.toBeNull();
    expect(isTrespassing('seaside', p.x, p.z)).toBe(false);
  });
  test('falls back to a walkable border mark, nudged outside', () => {
    const target = borderMarks('seaside')[3];
    const walk = (x, z) => Math.hypot(x - target.x, z - target.z) < 0.6;
    const p = findLanding('seaside', start, walk);
    expect(p).not.toBeNull();
    expect(isTrespassing('seaside', p.x, p.z)).toBe(false);
  });
  test('nothing walkable means no landing, never an inside one', () => {
    expect(findLanding('seaside', start, () => false)).toBeNull();
  });
  test('hostile input', () => {
    expect(findLanding('den', start, () => true)).toBeNull();
    expect(findLanding('seaside', null, () => true)).toBeNull();
    expect(findLanding('seaside', start, null)).toBeNull();
  });
});

describe('createRivalPatrol', () => {
  const { cx, cz, r } = rivalFor('park');
  const mk = (opts = {}) => {
    const scene = new THREE.Scene();
    const events = [];
    const api = createRivalPatrol(scene, 'park', {
      reducedMotion: false,
      now: () => 1000,
      isWalkable: () => true,
      onChase: (who) => events.push(['chase', who]),
      onSettled: () => events.push(['settled']),
      ...opts,
    });
    return { scene, api, events };
  };

  // a cat just inside the border, close to where the patrol is at clock time t
  const nearPatrol = (t) => {
    const p = patrolAt('park', t);
    return new THREE.Vector3(p.x + (cx - p.x) * 0.2, 0, p.z + (cz - p.z) * 0.2);
  };

  test('an unknown area is inert', () => {
    const scene = new THREE.Scene();
    const api = createRivalPatrol(scene, 'den');
    expect(scene.children).toHaveLength(0);
    expect(() => { api.update(0.016, new THREE.Vector3()); api.dispose(); api.dispose(); }).not.toThrow();
  });

  test('adds one mesh and dispose removes it', () => {
    const { scene, api } = mk();
    expect(scene.children).toHaveLength(1);
    api.dispose();
    expect(scene.children).toHaveLength(0);
  });

  test('a trespass fires exactly one chase and the cat ends outside', () => {
    let clock = 1000;
    const { api, events } = mk({ now: () => clock });
    const p = patrolAt('park', clock);
    const cat = new THREE.Vector3(p.x + (cx - p.x) * 0.2, 0, p.z + (cz - p.z) * 0.2);
    for (let i = 0; i < 120; i++) { clock += 1 / 60; api.update(1 / 60, cat); }
    expect(events.filter((e) => e[0] === 'chase')).toHaveLength(1);
    expect(events.filter((e) => e[0] === 'settled')).toHaveLength(1);
    expect(isTrespassing('park', cat.x, cat.z)).toBe(false);
    expect(Math.hypot(cat.x - cx, cat.z - cz)).toBeGreaterThan(r);
  });

  test('the cooldown is the real one: blocked until it ends, then chases again', () => {
    let clock = 1000;
    const { api, events } = mk({ now: () => clock });
    const cat = nearPatrol(clock);
    const step = () => { clock += 1 / 60; api.update(1 / 60, cat); };
    const chases = () => events.filter((e) => e[0] === 'chase').length;
    // first chase, run to the end of the scamper
    while (events.filter((e) => e[0] === 'settled').length === 0) step();
    expect(chases()).toBe(1);
    const settledAt = clock;
    // wander back in 0.5 s before the cooldown ends: no chase
    while (clock < settledAt + CHASE_COOLDOWN - 0.5) step();
    cat.copy(nearPatrol(clock));
    for (let i = 0; i < 20; i++) step(); // 0.33 s: still before the cooldown ends
    expect(chases()).toBe(1);
    // 0.1 s after the cooldown ends: chased again
    while (clock < settledAt + CHASE_COOLDOWN + 0.1) step();
    cat.copy(nearPatrol(clock));
    for (let i = 0; i < 3; i++) step();
    expect(chases()).toBe(2);
  });

  test('the scamper heads for the walkable landing, never the raw point', () => {
    let clock = 1000;
    const cat0 = nearPatrol(clock);
    const raw = chaseOutcome('park', cat0, patrolAt('park', clock)).to;
    const walkable = (x, z) => Math.hypot(x - raw.x, z - raw.z) > 2;
    const { api } = mk({ now: () => clock, isWalkable: walkable });
    const cat = cat0.clone();
    for (let i = 0; i < 60; i++) { clock += 1 / 60; api.update(1 / 60, cat); }
    expect(walkable(cat.x, cat.z)).toBe(true);
    expect(isTrespassing('park', cat.x, cat.z)).toBe(false);
    expect(cat.y).toBe(0);
  });

  test('the cat faces its travel while it runs, then the disc centre', () => {
    let clock = 1000;
    const { api, events } = mk({ now: () => clock });
    const cat = nearPatrol(clock);
    const start = { x: cat.x, z: cat.z };
    const avatar = { rotation: { y: 0 } };
    // player.update's convention: rotation.y = atan2(vx, vz) + PI, so the
    // facing direction is (-sin y, -cos y)
    const dir = () => ({ x: -Math.sin(avatar.rotation.y), z: -Math.cos(avatar.rotation.y) });
    clock += 1 / 60;
    api.update(1 / 60, cat, avatar); // starts the chase
    clock += 1 / 60;
    api.update(1 / 60, cat, avatar);
    const d = dir();
    const land = { x: 0, z: 0 };
    while (events.filter((e) => e[0] === 'settled').length === 0) {
      expect(Math.hypot(dir().x - d.x, dir().z - d.z)).toBeLessThan(1e-6); // steady along the run
      clock += 1 / 60;
      api.update(1 / 60, cat, avatar);
    }
    land.x = cat.x; land.z = cat.z;
    const run = { x: land.x - start.x, z: land.z - start.z };
    const rl = Math.hypot(run.x, run.z);
    expect(d.x * run.x / rl + d.z * run.z / rl).toBeGreaterThan(0.999);
    const toC = { x: cx - land.x, z: cz - land.z };
    const cl = Math.hypot(toC.x, toC.z);
    expect(dir().x).toBeCloseTo(toC.x / cl, 6);
    expect(dir().z).toBeCloseTo(toC.z / cl, 6);
  });

  test('a scamper starting mid-pounce ends on the ground, not at the lift', () => {
    let clock = 1000;
    const { api } = mk({ now: () => clock });
    const cat = nearPatrol(clock);
    cat.y = 0.9; // a Spring Paws pounce apex
    for (let i = 0; i < 60; i++) { clock += 1 / 60; api.update(1 / 60, cat); }
    expect(cat.y).toBe(0);
  });

  test('a cat outside is never touched', () => {
    const { api, events } = mk();
    const cat = new THREE.Vector3(cx + r * 3, 0, cz);
    api.update(0.016, cat);
    expect(events).toHaveLength(0);
    expect(cat.x).toBe(cx + r * 3);
  });

  test('reduced motion is a short move', () => {
    let clock = 1000;
    const { api, events } = mk({ reducedMotion: true, now: () => clock });
    const cat = nearPatrol(clock);
    for (let i = 0; i < 60; i++) { clock += 1 / 60; api.update(1 / 60, cat); }
    expect(events.filter((e) => e[0] === 'settled')).toHaveLength(1);
    expect(isTrespassing('park', cat.x, cat.z)).toBe(false);
  });

  test('canChase false (perched) means no chase', () => {
    const { api, events } = mk({ canChase: () => false });
    api.update(0.016, nearPatrol(1000));
    expect(events).toHaveLength(0);
  });

  // F12: a child framing a photo of the rival is never scampered out mid-shot.
  test('chaseAllowed: on the ground and not in photo mode only', () => {
    expect(chaseAllowed({ perchY: 0 }, { cameraMode: false })).toBe(true);
    expect(chaseAllowed({ perchY: 0 }, { cameraMode: true })).toBe(false);
    expect(chaseAllowed({ perchY: 1.2 }, { cameraMode: false })).toBe(false);
    expect(chaseAllowed({ perchY: 1.2 }, { cameraMode: true })).toBe(false);
  });

  test('photo mode open means no chase', () => {
    const session = { cameraMode: true };
    const { api, events } = mk({ canChase: () => chaseAllowed({ perchY: 0 }, session) });
    api.update(0.016, nearPatrol(1000));
    expect(events).toHaveLength(0);
  });

  test("walk.js gates the chase with chaseAllowed over the walk's own player and session", () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('canChase: () => chaseAllowed(player, session)');
  });

  test('an unwalkable landing everywhere means no chase and no toast', () => {
    const { api, events } = mk({ isWalkable: () => false });
    api.update(0.016, nearPatrol(1000));
    expect(events).toHaveLength(0);
  });
});

// The anti-goal, as a test: recoverable, funny, never retroactive.
test('a chase has no channel to progress at all', () => {
  // Structural, because this is an anti-goal rather than a behaviour: the
  // module cannot take anything away if it cannot reach anything that stores
  // progress. An exact allowlist of imports, as enemies.js does for its own.
  const src = readFileSync(new URL('../src/rivalcats.js', import.meta.url), 'utf8');
  const specs = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).sort();
  expect(specs).toEqual(['./cat/animator.js', './cat/model.js', './rivalclans.js', './straynames.js']);
});

test('the walk.js chase branch touches no progress, colony, log or points', () => {
  const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const a = src.indexOf("The rival's border and its patrol");
  const b = src.indexOf('session.rival = {');
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  const branch = src.slice(a, b);
  expect(branch).toContain('hud.toast');
  // strip comments: they say what the branch must not do
  const code = branch.replace(/\/\/.*$/gm, '');
  for (const bad of ['progression.', 'colony', 'recordGolden', 'log.', 'award', 'recordFeat', 'setPoints', 'discover']) {
    expect(code).not.toContain(bad);
  }
});

test('patrolPath is what the patrol follows', () => {
  expect(patrolPath('park').length).toBeGreaterThan(3);
});
