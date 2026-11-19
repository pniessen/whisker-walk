import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { moorTraceAsRecorded, recordedMoor } from './helpers/moortrace.js';

// Bigger areas, step 3. test/helpers/moortrace.js runs the shared driver
// (test/helpers/flattrace.js); this holds it to the frozen gameplay fixture
// with the switch off, so test/growtrace.moor.on.test.js compares like with
// like. (Within last-digit rounding, as that file does.)
describe('the Moor\'s recorded walk, switch off', () => {
  it('the shared driver gives the recorded Moor', () => {
    const pinned = recordedMoor();
    const trace = moorTraceAsRecorded(false);
    expect(trace.length).toBe(pinned.length);
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
