import { describe, it, expect, beforeAll } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import {
  traceAsRecorded, traceAll, writeFixture, recordedGameplay, recordedRender, UUID_SEED,
} from './helpers/flattrace.js';

// Gorge part 1, Task 1: today's world, pinned as a trace; split in two by
// review S2 (2026-11-19). The driver (the eight outdoor maps, the 600 scripted
// frames, what runs and in which order) is test/helpers/flattrace.js.
//
// GAMEPLAY (test/fixtures/flat-trace.gameplay.json) is FROZEN: where the cat,
// the camera, the strays, the critters, the clan cats, the intruder, the
// ghost, the co-walker, the toy, the knockables and the gold mice are, every
// 10th frame. Never re-record it to make this pass. A difference is a change
// to how the game plays; it is re-recorded only with the owner's yes and a
// field-by-field check, with UPDATE_TRACE=gameplay.
//
// RENDER (test/fixtures/flat-trace.render.json) MAY BE RE-RECORDED: the
// contact shadows' and paw prints' instance matrices and the knockables'
// shadow decals. A new cat outline, ear or tuft moves a shadow by a hair;
// re-record with UPDATE_TRACE=render once the gameplay test passes, and say
// so in the commit.
//
// Both are compared within last-digit rounding (helpers/closeto.js): the
// fixtures are recorded on a Mac and checked on GitHub's Linux runners too.
// Whole numbers (the instance-matrix hashes) must be equal.
//
// History. The one-file fixture (test/fixtures/flat-trace.json, until
// 2026-11-19) was re-recorded nine times after Task 1: once for Pines camp
// seats moved by the owner's decision (2026-11-04, -05), the other times for
// shadows only (the cat's body, outline, ears, face and fur, and the Twolegs'
// and plumed cats' shadow radii). Review S2 split it and re-recorded it ONCE,
// checked field by field against the old file: no value in either part moved.

describe('the flat trace', () => {
  let trace;
  // (every map traced: ~4 s alone, far more under a loaded full suite)
  beforeAll(() => {
    trace = traceAll();
    const update = process.env.UPDATE_TRACE;
    if (update === 'gameplay' || update === 'render') writeFixture(update, trace[update]);
  }, 90_000);

  it('gameplay: every moving thing on every shipped map is where it was (frozen)', () => {
    expect(closeDiffs(trace.gameplay, recordedGameplay())).toEqual([]);
  });

  it('render: shadows and paw prints as last recorded (re-record with UPDATE_TRACE=render)', () => {
    expect(closeDiffs(trace.render, recordedRender())).toEqual([]);
  });

  // The finding review S2 fixed: THREE takes four Math.random draws for every
  // object, geometry and material, so with the movers on Math.random one mesh
  // more anywhere moved every critter, ghost and gold mouse after it. Every
  // moving system now has a stream of its own; this proves no gameplay value
  // reads Math.random by tracing every map again with it seeded differently
  // (and, being the second trace in this process, with the shared parts
  // already built, so every build takes fewer uuid draws than the first).
  it('gameplay does not read Math.random (THREE uuid draws move nothing)', () => {
    const other = traceAll({ uuidSeed: (UUID_SEED ^ 0x5eed5) >>> 0, pinMoorDraws: false });
    expect(closeDiffs(other.gameplay, recordedGameplay())).toEqual([]);
  }, 90_000);

  // The people switch on (soft bumps in play): the villagers are the new
  // people and her walk is passed their bumps; the frozen fixture must hold.
  // The scripted cat comes no nearer than 13 m to any villager.
  it('gameplay with the people switch on is the same frozen fixture', () => {
    const want = recordedGameplay();
    const got = {};
    const exp = {};
    for (const areaId of ['neighborhood', 'park', 'docks', 'seaside']) {
      got[areaId] = traceAsRecorded(areaId, { people: true, pinMoorDraws: false }).gameplay;
      exp[areaId] = want[areaId];
    }
    expect(closeDiffs(got, exp)).toEqual([]);
  }, 90000);
});
