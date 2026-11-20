import { describe } from 'vitest';
import { DESCRIBE, coverSweep } from './helpers/backitems.js';

// catbackitems.test.js's cover sweep for the Hay-bale Backpack (a found pack), in its own file so the sweeps run in parallel.
describe(DESCRIBE, () => coverSweep('haybalepack'));
