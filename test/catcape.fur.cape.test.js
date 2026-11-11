import { describe } from 'vitest';
import { DESCRIBE, furSweep } from './helpers/cape.js';

// One of catcape.test.js's pose sweeps for one cape, in its own file so the
// sweeps run in parallel (see test/helpers/cape.js).
describe(DESCRIBE, () => furSweep('cape'));
