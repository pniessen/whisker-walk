// Every test file starts as the family's game: the family's set installed and in use.
//
// The public build holds only the everyday words (src/wordset.js), so the 'on'
// tests, which pin the family's game byte for byte, install the set here. The
// mock reaches modules loaded after vi.resetModules() too: the factory runs
// again for each fresh copy of wordset.js. A test that wants a build as the
// public gets it (test/wordset.test.js) reads the real module with
// vi.importActual.
import { vi } from 'vitest';

vi.mock('../../src/wordset.js', async (importOriginal) => {
  const real = await importOriginal();
  real.installSeriesSet(await import('../../src/clanwords.js'));
  real.setSeriesMode(real.SERIES_ON);
  return real;
});
