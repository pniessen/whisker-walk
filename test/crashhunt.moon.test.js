// Crash hunt, the Moon: a whole Moon walk (test/helpers/crashhunt.js drives main.js's frame order over the real place with a real player), for every
// preset breed (Hagrid too) and for custom cats, with random worn pieces, reduced motion on and off, high and low rungs. Random pad/keyboard actions
// (board Dot, drive with a random stick, hop out, pounce, climb, pause/resume, camera, meow), teleports beside random solids and to Dot, frame
// times from 0 to 5 s. Asserts: nothing throws, every position stays finite. Deterministic seeds.
import { describe, it, expect, beforeAll } from 'vitest';
import { setMoon } from '../src/moonflag.js';
import { setTele } from '../src/teleflag.js';
import { ACTIONS, BREEDS, areas, makeCouch, makeWalk, makeFrameRunner, fuzz, randomLook, randomWear, rngFor } from './helpers/crashhunt.js';
import * as P from '../src/world/moonplan.js';

beforeAll(async () => { setMoon(true); setTele(false); await areas.ensureAll(['moon']); }, 60000);

// what the fuzz actually reached, so a rig that never boards cannot pass quietly
const seen = { frames: 0, riding: 0, boardings: 0, maxSpeed: 0, perched: 0, seatSwitch: 0 };
const SPOTS = [P.DOT_PARK, { x: P.DOT_PARK.x - 1.9, z: P.DOT_PARK.z + 0.4 }, { x: P.DOT_PARK.x + 1.6, z: P.DOT_PARK.z }, { x: P.DOT_PARK.x, z: P.DOT_PARK.z + 2 }];

// Dot-heavy: most presses are Interact (board / hop out) and sticks, with teleports to Dot's door
const DOT_ACTIONS = [...ACTIONS, 'interact', 'interact', 'stick', 'stick', 'teleSpot', 'teleSpot', 'teleSpot', 'pounce'];
function run({ who, seed, reducedMotion, tier, cap, steps = 300, actions = DOT_ACTIONS }) {
  const rnd = rngFor(seed);
  const wear = randomWear(rnd);
  const walk = makeWalk({ areaId: 'moon', who, wear, reducedMotion, tier, seed });
  const runner = makeFrameRunner(walk, rnd);
  const spots = [...SPOTS, ...(walk.session.areaData.pois ?? []), ...(walk.session.areaData.scenics ?? [])];
  const hist = [];
  let was = false;
  try {
    fuzz(walk, runner, rnd, { steps, spots, cap, actions, onStep: (i) => {
      hist.push(i);
      const st = walk.session.areaLife.rover?.state;
      seen.frames++;
      if (st?.riding) { seen.riding++; seen.maxSpeed = Math.max(seen.maxSpeed, Math.abs(st.speed)); }
      if (st?.riding && !was) seen.boardings++;
      was = !!st?.riding;
      if (walk.session.perched) seen.perched++;
    } });
  } catch (err) {
    err.message = `[${who.breed ?? 'custom'} seed=${seed} rm=${reducedMotion} tier=${tier} cap=${cap} step=${hist.length}] ${err.message}`;
    throw err;
  } finally {
    try { walk.w.endWalk?.(); } catch { /* ending a half-driven walk is not under test here */ }
  }
  return walk;
}

describe('crash hunt: the Moon', () => {
  it('Dot is on this walk, and boarding works from beside her (the rig drives the real thing)', () => {
    const walk = makeWalk({ areaId: 'moon', who: { breed: 'tabby' }, seed: 1 });
    const runner = makeFrameRunner(walk, rngFor(1));
    walk.player.setTouchEngaged(true);
    walk.session.cat.position.set(P.DOT_PARK.x - 1.9, P.moonY(P.DOT_PARK.x - 1.9, P.DOT_PARK.z + 0.4), P.DOT_PARK.z + 0.4);
    for (let i = 0; i < 4; i++) runner.frame(1 / 30);
    runner.inter.handleTouchAction('interact');
    for (let i = 0; i < 20; i++) runner.frame(1 / 30);
    expect(walk.session.areaLife.rover.state.riding, 'riding Dot').toBe(true);
  }, 30000);

  it('every preset breed, capped dt as main.js applies it (0 to 0.05 s)', () => {
    BREEDS.forEach((breed, i) => run({ who: { breed }, seed: 100 + i, reducedMotion: i % 2 === 0, tier: i % 3 === 0 ? 'low' : 'high', cap: true }));
  }, 55000);

  it('every preset breed, hostile dt (0.5 to 5 s spikes uncapped, zero, 1e-6)', () => {
    BREEDS.forEach((breed, i) => run({ who: { breed }, seed: 300 + i, reducedMotion: i % 2 === 1, tier: 'high', cap: false, steps: 200 }));
  }, 55000);

  it('custom cats with random looks, scars and worn pieces', () => {
    for (let i = 0; i < 6; i++) {
      const rnd = rngFor(500 + i);
      run({ who: { custom: randomLook(rnd) }, seed: 500 + i, reducedMotion: i % 2 === 0, tier: i % 2 ? 'low' : 'high', cap: i < 3 });
    }
  }, 55000);

  it('the fuzz reached the thing under test: it boarded Dot, drove her, and perched', () => {
    expect(seen.frames).toBeGreaterThan(2000);
    expect(seen.boardings).toBeGreaterThan(10);
    expect(seen.riding).toBeGreaterThan(200);
    expect(seen.maxSpeed).toBeGreaterThan(1);
    process.stderr.write(`\ncrashhunt moon coverage: ${JSON.stringify(seen)}\n`);
  });

  it('couch play (TV mode, two DualSense pads, cat two joined): the real coop chunk beside the walk, both pads pressed at random', () => {
    BREEDS.slice(0, 6).forEach((breed, i) => {
      const rnd = rngFor(700 + i);
      const walk = makeWalk({ areaId: 'moon', who: { breed }, wear: randomWear(rnd), reducedMotion: i % 2 === 0, tier: 'high', seed: 700 + i });
      const couch = makeCouch(walk);
      const runner = makeFrameRunner(walk, rnd, { couch });
      let n = 0;
      try {
        walk.player.setTouchEngaged(true);
        couch.join();
        expect(couch.h.state.joined, 'cat two joined through the pads').toBe(true);
        fuzz(walk, runner, rnd, { steps: 160, spots: SPOTS, cap: i < 4, actions: DOT_ACTIONS, couch, onStep: () => { n++; } });
      } catch (err) {
        err.message = `[couch ${breed} seed=700+${i} step=${n}] ${err.message}`;
        throw err;
      } finally {
        couch.stop();
        try { walk.w.endWalk?.(); } catch { /* not under test */ }
      }
    });
  }, 55000);
});
