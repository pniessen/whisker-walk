import { rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { defineConfig } from 'vite';

// The iOS app (ios/) bundles its own copy of the game: `npm run build:ios`
// builds with this mode into ios/web, which the Xcode project copies into the
// app. It uses a relative base because the app serves the files from its own
// URL scheme, not from /whisker-walk/.
export const IOS_MODE = 'ios';
export const IOS_OUT_DIR = 'ios/web';

// The app needs neither the offline service worker (src/swpolicy.js never
// registers it in the app) nor the Clan Edition promo page, which only links
// back to the website.
const IOS_PRUNE = ['sw.js', 'clan-edition.html'];

function iosPrune() {
  return {
    name: 'ios-prune',
    closeBundle() {
      for (const file of IOS_PRUNE) rmSync(join(IOS_OUT_DIR, file), { force: true });
    },
  };
}

// Which build is a child on? Short commit sha (+ if the tree has uncommitted
// changes) and the UTC build date, shown in Game settings. Computed once at
// config time, so it is the same for `vite`, `vite build` and `--mode ios`; a
// shallow CI checkout still has HEAD. Without git (or outside a repo) the
// build must not fail, so it falls back to 'dev'.
export function buildStamp(now = new Date()) {
  let sha = 'dev';
  try {
    const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    sha = run('git rev-parse --short HEAD') || 'dev';
    if (sha !== 'dev' && run('git status --porcelain')) sha += '+';
  } catch {
    /* no git: keep whatever we have */
  }
  return `${sha} · ${now.toISOString().slice(0, 10)}`;
}

// GitHub Pages serves the app from /whisker-walk/, so production builds need
// that base path; dev stays at / so localhost play is unaffected.
export default defineConfig(({ command, mode }) => ({
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
  base: mode === IOS_MODE ? './' : command === 'build' ? '/whisker-walk/' : '/',
  ...(mode === IOS_MODE && {
    build: { outDir: IOS_OUT_DIR, emptyOutDir: true },
    plugins: [iosPrune()],
  }),
  test: {
    // Without this a bare `npm test` also collects the copies of tests inside
    // .worktrees/ and .claude/worktrees/.
    dir: 'test',
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
