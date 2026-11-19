import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { riverTraceAsRecorded, recordedRiver } from './helpers/rivertrace.js';

// Bigger areas, step 1. test/helpers/rivertrace.js runs the River alone on
// test/helpers/flattrace.js's driver; this holds it to the frozen gameplay
// fixture with the switch off, so test/growtrace.on.test.js compares like
// with like. (Within last-digit rounding, as test/flattrace.test.js does: the
// fixture is recorded on a Mac and checked on Linux too.)
describe('the River\'s recorded walk, switch off', () => {
  it('the copied driver gives the recorded River', () => {
    const pinned = recordedRiver();
    const trace = riverTraceAsRecorded(false);
    expect(trace.length).toBe(pinned.length);
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
