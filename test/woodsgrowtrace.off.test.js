import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { woodsTraceAsRecorded, recordedWoods } from './helpers/woodstrace.js';

// Bigger areas, step 3. test/helpers/woodstrace.js runs the shared driver
// (test/helpers/flattrace.js); this holds it to the frozen gameplay fixture
// with the switch off, so test/woodsgrowtrace.on.test.js compares like with
// like (within last-digit rounding, as that file does).
describe('the Woods\' recorded walk, switch off', () => {
  it('the shared driver gives the recorded Woods', () => {
    const pinned = recordedWoods();
    const trace = woodsTraceAsRecorded(false);
    expect(trace.length).toBe(pinned.length);
    expect(closeDiffs(trace, pinned)).toEqual([]);
  });
});
