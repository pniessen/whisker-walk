import { describe, it, expect } from 'vitest';
import { closeDiffs } from './helpers/closeto.js';
import { traceAll, recordedGameplay } from './helpers/flattrace.js';
import { withOffWords } from './helpers/offwords.js';

// Series switch A3: the everyday words change no play. The flat trace's
// driver (test/helpers/flattrace.js), run with the everyday word set in use,
// holds every moving thing on every shipped map to the same FROZEN gameplay
// fixture as test/flattrace.test.js: the everyday camps' High Stone has the
// Highrock's footprint, collider, seats and Math.random draws.
describe('the flat trace in the everyday words', () => {
  it('gameplay: every moving thing on every shipped map is where it is in the family\'s words', () => {
    const trace = withOffWords(() => traceAll());
    expect(closeDiffs(trace.gameplay, recordedGameplay())).toEqual([]);
  });
});
