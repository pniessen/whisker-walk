import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { moorTraceAsRecorded, recordedMoor } from './helpers/moortrace.js';

// Bigger areas, step 3: the recorded walk with the switch ON.
//
// The same 600 scripted frames test/flattrace.test.js drives on the Moor
// (the player, the critters, the strays, the clan, an intruder, the toy, the
// golden mice, paw prints, a remote cat, a ghost, the contact shadows), on
// the Moor built WITH its north strip, held to the same frozen gameplay
// fixture: with the strip there, nothing in the core moves, stands or is
// rolled differently, and the build takes the same Math.random draws. (The
// strip's own tiles are not in the script: the cat stays by the spawn, 95 m
// from them.)
describe('the Moor\'s recorded walk, switch on', () => {
  it('is the recorded Moor, frame for frame', () => {
    const pinned = recordedMoor();
    const trace = moorTraceAsRecorded(true);
    expect(trace.length).toBe(pinned.length);
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
