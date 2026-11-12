import { describe } from 'vitest';
import { DESCRIBE, coverSweep } from './helpers/backitems.js';

// catbackitems.test.js's cover sweep for the jetpack, in its own file so the
// sweeps run in parallel (see test/helpers/backitems.js).
describe(DESCRIBE, () => coverSweep('jetpack'));
