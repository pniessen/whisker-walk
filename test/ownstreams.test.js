import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { canvasStub } from './helpers/growriver.js';

// Review S2 (2026-11-19): the moving systems' bare Math.random() draws moved
// onto streams of their own, so THREE's uuid draws (four per object, geometry
// and material, all Math.random) can no longer shift where anything moves.
// test/flattrace.test.js proves it on every shipped map; these pin each
// system's seam, and that the walk never hands one of them walkRng.

vi.stubGlobal('document', canvasStub);
const { mulberry32 } = await import('../src/rng.js');
const { createCritters } = await import('../src/critters.js');
const { createGoldMice, GOLD_MICE } = await import('../src/goldmice.js');
const { createGhosts } = await import('../src/ghosts.js');
const { createToy } = await import('../src/toy.js');

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });
// Math.random, made to fail the test if anything but a THREE build draws it.
function forbidRandom() {
  Math.random = () => { throw new Error('Math.random drawn outside a build'); };
}

describe('the moving systems draw from their own streams', () => {
  it("critters: each spawn's idle phase is the next motionRng value, in spawn order", () => {
    const spawns = [{ type: 'bird', x: 1, z: 2 }, { type: 'squirrel', x: -3, z: 4 }, { type: 'mouse', x: 5, z: -6 }];
    const want = mulberry32(42);
    const critters = createCritters(new THREE.Scene(), spawns, { rng: mulberry32(1), motionRng: mulberry32(42) });
    expect(critters.list.map((c) => c.phase)).toEqual(spawns.map(() => want() * Math.PI * 2));
  });

  it('gold mice: each bob phase is the next rng value', () => {
    const want = mulberry32(9);
    const gm = createGoldMice(new THREE.Scene(), 'woods', new Set(), { rng: mulberry32(9) });
    expect(gm.list.map((m) => m.phase)).toEqual(GOLD_MICE.woods.map(() => want() * Math.PI * 2));
    gm.dispose();
  });

  it("ghosts: the wander FSM never draws Math.random once it has wanderRng", () => {
    const area = { bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 }, colliders: [] };
    const ghosts = createGhosts(new THREE.Scene(), area, [
      { playerId: 'g', petName: 'Pebble', breed: 'tabby', accessories: {}, greets: 2 },
    ], mulberry32(3), { wanderRng: mulberry32(17) });
    forbidRandom();
    let t = 0;
    for (let f = 0; f < 60 * 30; f++) ghosts.update(1 / 60, (t += 1 / 60)); // 30 s: idles, wanders, idles
    Math.random = realRandom;
    expect(ghosts.list[0].group.position.distanceTo(ghosts.list[0].home)).toBeGreaterThan(0);
  });

  it("the toy: a bat's push is 3 + 2 x the next rng value, never Math.random", () => {
    const scene = { add() {}, remove() {} };
    const want = mulberry32(5)();
    const toy = createToy(scene, { rng: mulberry32(5) });
    toy.throwFrom(new THREE.Vector3(0, 0.13, 0), new THREE.Vector3(1, 0, 0), 0);
    forbidRandom();
    toy.bat(new THREE.Vector3(-1, 0, 0)); // from the -x side: pushes +x
    Math.random = realRandom;
    toy.update(1e-6, { minX: -50, maxX: 50, minZ: -50, maxZ: 50 });
    expect(toy.mesh.position.x / 1e-6).toBeCloseTo(3 + 2 * want, 3);
  });

  it('the walk gives each one a salted stream of its own, never walkRng', () => {
    const walk = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(walk).toMatch(/motionRng: ownStream\(roomSeed \?\? soloSeed, CRITTER_MOTION_SALT\)/);
    expect(walk).toMatch(/createToy\(scene, \{ ground, rng: ownStream\(roomSeed \?\? soloSeed, TOY_BAT_SALT\) \}\)/);
    expect(walk).toMatch(/ground, rng: ownStream\(roomSeed \?\? soloSeed, GOLD_PHASE_SALT\)/);
    expect(walk).toMatch(/ownStream\(mySession\.soloSeed, GHOST_WANDER_SALT\)/);
    expect(walk).not.toMatch(/(motionRng|wanderRng): walkRng/);
  });
});
