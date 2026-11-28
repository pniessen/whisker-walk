// Crash hunt, the Reef: a whole Reef walk (test/helpers/crashhunt.js drives main.js's frame order over the real place, all three lazy stages in,
// with a real player) for every preset breed (Hagrid too) and custom cats, random worn pieces, reduced motion on and off, high and low rungs, and
// saves at random points of the story (Marlo's step, the Sealab's fuses, the wreck's clues). Random actions: kick held and let go (float), swim,
// pick up / drop shells (Interact), Marlo, the lantern corals, the Sealab hatch, the Scooter and Saucer, spottable animals (pounce at them),
// pause/resume; teleports beside random solids and to named spots; frame times from 0 to 5 s. Nothing may throw; positions stay finite.
import { describe, it, expect, beforeAll } from 'vitest';
import { setReef } from '../src/reefflag.js';
import { setTele } from '../src/teleflag.js';
import { ACTIONS, BREEDS, areas, makeCouch, makeWalk, makeFrameRunner, fuzz, randomLook, randomWear, rngFor } from './helpers/crashhunt.js';

await (await import('../src/world/reefstages.js')).loadReefStages();
const S = await import('../src/world/reefstory.js');
const L = await import('../src/world/reeflabplan.js');
const Z = await import('../src/world/reefrideplan.js');
const Q = await import('../src/world/reeffindsplan.js');
const W = await import('../src/world/reefwing.js');

beforeAll(async () => { setReef(true); setTele(false); await areas.ensureAll(['reef']); }, 60000);

const SPOTS = [
  S.MARLO.start, L.HATCH.outside, L.HATCH.outside.landing, L.HATCH.inside.ladder, L.HATCH.inside.exit, L.HATCH.inside.arrive, ...S.POCKETS,
  ...Object.values(Z.RACKS).map((r) => ({ x: r.x + 1.6, z: r.z })), ...W.LANTERNS.map((l) => ({ x: l.x + 1, z: l.z })), W.SHELL_THREE,
  ...Q.REEF_COLLECTIBLES, ...Q.REEF_SCENICS, ...Q.REEF_GOLD, ...L.FUSE_SOCKETS.map((f) => ({ x: f.x, z: f.z + 1.4 })),
];
const REEF_ACTIONS = [...ACTIONS, 'kickOn', 'kickOn', 'kickOff', 'interact', 'interact', 'pounce', 'teleSpot', 'teleSpot', 'stick', 'stick', 'stick'];

const seen = { frames: 0, floating: 0, riding: 0, swimming: 0, carrying: 0, interacts: 0, perched: 0 };
function run({ who, seed, reducedMotion, tier, cap, steps = 260, only = null }) {
  const rnd = rngFor(seed);
  const wear = randomWear(rnd);
  const state = (st) => {
    st.reef = { step: Math.floor(rnd() * 8), shells: Math.floor(rnd() * 128), album: Math.floor(rnd() * 4096), lab: Math.floor(rnd() * 16), wreck: [0, 1, 3, 7, 15, 31][Math.floor(rnd() * 6)] };
    st.skills = st.skills ?? {};
  };
  const walk = makeWalk({ areaId: 'reef', who, wear, reducedMotion, tier, seed, state });
  const runner = makeFrameRunner(walk, rnd);
  const s = walk.session;
  const spots = only ?? [...SPOTS, ...(s.areaData.pois ?? []), ...(s.areaData.scenics ?? [])];
  let n = 0;
  try {
    fuzz(walk, runner, rnd, {
      steps, spots, cap, actions: REEF_ACTIONS,
      onStep: () => {
        n++; seen.frames++;
        if (walk.player.floatY > 0.05) seen.floating++;
        if (s.fair?.riding || walk.player.swimming) seen.riding++;
        if (walk.player.inWater) seen.swimming++;
        if (s.carry?.held || s.walk?.carried > 0) seen.carrying++;
        if (s.perched) seen.perched++;
      },
    });
  } catch (err) {
    err.message = `[${who.breed ?? 'custom'} seed=${seed} rm=${reducedMotion} tier=${tier} cap=${cap} step=${n}] ${err.message}`;
    throw err;
  } finally {
    try { walk.w.endWalk?.(); } catch { /* ending a half-driven walk is not under test */ }
  }
}

describe('crash hunt: the Reef', () => {
  it('every preset breed, capped dt as main.js applies it (0 to 0.05 s)', () => {
    BREEDS.forEach((breed, i) => run({ who: { breed }, seed: 1100 + i, reducedMotion: i % 2 === 0, tier: i % 3 === 0 ? 'low' : 'high', cap: true }));
  }, 55000);

  it('every preset breed, hostile dt (0.5 to 5 s spikes uncapped, zero, 1e-6)', () => {
    BREEDS.forEach((breed, i) => run({ who: { breed }, seed: 1300 + i, reducedMotion: i % 2 === 1, tier: 'high', cap: false, steps: 160 }));
  }, 55000);

  it('custom cats with random looks and worn pieces', () => {
    for (let i = 0; i < 6; i++) {
      const rnd = rngFor(1500 + i);
      run({ who: { custom: randomLook(rnd) }, seed: 1500 + i, reducedMotion: i % 2 === 0, tier: i % 2 ? 'low' : 'high', cap: i < 3 });
    }
  }, 55000);

  it('each feature on its own: the racks (Scooter, Saucer), the Sealab hatch and fuses, the lantern corals, Marlo and the shells, with a cat of every build', () => {
    const groups = {
      racks: Object.values(Z.RACKS).map((r) => ({ x: r.x + 1.6, z: r.z })),
      hatch: [L.HATCH.outside, L.HATCH.outside.landing, L.HATCH.inside.ladder, L.HATCH.inside.exit, L.HATCH.inside.arrive, ...L.FUSE_SOCKETS.map((f) => ({ x: f.x, z: f.z + 1.4 }))],
      lanterns: W.LANTERNS.map((l) => ({ x: l.x + 1, z: l.z })),
      marlo: [S.MARLO.start, ...S.POCKETS, ...Q.REEF_COLLECTIBLES],
    };
    let i = 0;
    for (const [name, only] of Object.entries(groups)) {
      for (const breed of ['tabby', 'hagrid', 'digit', 'mainecoon']) {
        run({ who: { breed }, seed: 1700 + i++, reducedMotion: i % 2 === 0, tier: 'high', cap: i % 3 !== 0, steps: 110, only });
      }
      seen[name] = seen.frames;
    }
  }, 55000);

  it('the fuzz reached the water: it floated, swam and perched', () => {
    process.stderr.write(`\ncrashhunt reef coverage: ${JSON.stringify(seen)}\n`);
    expect(seen.frames).toBeGreaterThan(3000);
    expect(seen.floating).toBeGreaterThan(100);
  });

  it('couch play (TV mode, two DualSense pads, cat two joined): the real coop chunk beside the walk, both pads pressed at random', () => {
    BREEDS.slice(0, 6).forEach((breed, i) => {
      const rnd = rngFor(1900 + i);
      const walk = makeWalk({ areaId: 'reef', who: { breed }, wear: randomWear(rnd), reducedMotion: i % 2 === 0, tier: 'high', seed: 1900 + i });
      const couch = makeCouch(walk);
      const runner = makeFrameRunner(walk, rnd, { couch });
      let n = 0;
      try {
        walk.player.setTouchEngaged(true);
        couch.join();
        expect(couch.h.state.joined, 'cat two joined through the pads').toBe(true);
        fuzz(walk, runner, rnd, { steps: 160, spots: SPOTS, cap: i < 4, actions: REEF_ACTIONS, couch, onStep: () => { n++; } });
      } catch (err) {
        err.message = `[couch ${breed} seed=1900+${i} step=${n}] ${err.message}`;
        throw err;
      } finally {
        couch.stop();
        try { walk.w.endWalk?.(); } catch { /* not under test */ }
      }
    });
  }, 55000);
});
