import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { woodsTraceAsRecorded, recordedWoods } from './helpers/woodstrace.js';

// Bigger areas, step 3: the recorded walk with the switch ON.
//
// The same 600 scripted frames test/flattrace.test.js drives on the Woods
// (the player, the critters, the strays, the clan, an intruder, the toy, the
// golden mice, paw prints, a remote cat, a ghost, the contact shadows), on
// the Woods built WITH its south strip and its core tagged to stream, held to
// the same never-re-recorded fixture: with the strip there, nothing in the
// core moves, stands or is rolled differently.
describe('the Woods\' recorded walk, switch on', () => {
  it('is the recorded Woods, frame for frame', () => {
    const pinned = recordedWoods();
    const trace = woodsTraceAsRecorded(true);
    expect(trace.length).toBe(pinned.length);
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
