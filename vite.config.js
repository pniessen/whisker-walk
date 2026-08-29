import { defineConfig } from 'vite';

// GitHub Pages serves the app from /whisker-walk/, so production builds need
// that base path; dev stays at / so localhost play is unaffected.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/whisker-walk/' : '/',
  test: {
    // Vitest's default is 5000ms per test, and the visual pass outgrew it.
    // Two files now do real work rather than arithmetic:
    //
    //   textures.test.js  (~24s) derives normal maps by Sobel over eight
    //                     256x256 tiles and checks the seam wrap by
    //                     translation equivariance, which re-derives a tile
    //                     per shift;
    //   mergeprops.test.js (~21s) builds whole areas and merges them, several
    //                     times over, because the properties worth pinning
    //                     (decal counts, caster homogeneity, triangle
    //                     identity) only exist on a fully built world.
    //
    // Individually most cases still finish well inside 5s, but vitest runs
    // files in parallel, so under load the heavy ones would intermittently
    // trip the limit — the failure reads "Test timed out in 5000ms" on a test
    // that passes fine alone. That is a false negative, and a suite that fails
    // at random is one people stop believing.
    //
    // 30s is chosen to be far above the slowest real case (~24s for the whole
    // textures FILE, so a wide margin per TEST) while still being short enough
    // that a genuine hang — an await that never settles, an infinite loop —
    // fails the run rather than hanging CI indefinitely. It is a guard against
    // hangs, not a budget for slow tests.
    testTimeout: 30000,
  },
}));
