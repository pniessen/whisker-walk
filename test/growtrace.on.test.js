import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { riverTraceAsRecorded, recordedRiver } from './helpers/rivertrace.js';

// Bigger areas, step 1: the recorded walk with the switch ON.
//
// The same 600 scripted frames test/flattrace.test.js drives on the River
// (the player, the critters, the strays, the clan, an intruder, the toy, the
// golden mice, paw prints, a remote cat, a ghost, the contact shadows), on
// the River built WITH its west strip, held to the same never-re-recorded
// fixture: with the strip there, nothing in the core moves, stands or is
// rolled differently. (The strip's own tiles are not in the script: the cat
// stays by the spawn, 90 m from them.)
describe('the River\'s recorded walk, switch on', () => {
  it('is the recorded River, frame for frame', () => {
    const pinned = recordedRiver();
    const trace = riverTraceAsRecorded(true);
    expect(trace.length).toBe(pinned.length);
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
