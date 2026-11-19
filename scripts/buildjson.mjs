// Writes dist/build.json ({ commit, date }) after `vite build`, so the
// post-deploy smoke check can tell which commit is actually live, and fails
// the build if the main script has grown past its download ceiling. Runs as
// the npm `postbuild` hook, which fires for `npm run build` only: the iOS
// build (`build:ios`) is untouched. GITHUB_SHA wins in CI; otherwise git HEAD.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export function buildInfo(env = process.env, now = new Date()) {
  let commit = env.GITHUB_SHA || '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'dev';
    }
  }
  return { commit, date: now.toISOString() };
}

// The most the main script may weigh gzipped, in kB (1 kB = 1000 bytes, as
// Vite prints it; Node's gzip here comes out a few kB under Vite's figure).
// It is what a child's phone downloads before the game can start; it grew
// from 632 kB to 801 kB in nine days (Nov 2026) with nothing watching. Raise
// it on purpose, in the same change, when a new area lands, rather than to
// make a build pass.
export const MAIN_GZIP_CEILING_KB = 900;

/** The main script's path from the built index.html (its module entry). */
export function mainScript(html) {
  const tag = html.match(/<script\b[^>]*\btype="module"[^>]*>/)?.[0] ?? '';
  return tag.match(/\bsrc="([^"]+)"/)?.[1] ?? null;
}

/** Why the main script is too big, or null if it fits under the ceiling. */
export function sizeProblem(gzipBytes, ceilingKb = MAIN_GZIP_CEILING_KB) {
  const kb = gzipBytes / 1000;
  if (kb <= ceilingKb) return null;
  return `The main script is ${kb.toFixed(1)} kB gzipped, over its ceiling of ${ceilingKb} kB. ` +
    'Make it smaller, or raise MAIN_GZIP_CEILING_KB in scripts/buildjson.mjs on purpose (for example when a new area lands).';
}

// The main script's gzipped size in bytes, from the built `dir`.
function mainGzipBytes(dir) {
  const src = mainScript(readFileSync(join(dir, 'index.html'), 'utf8'));
  if (!src) throw new Error(`No module script found in ${dir}/index.html`);
  const file = join(dir, 'assets', src.split('/').pop());
  return { file, bytes: gzipSync(readFileSync(file)).length };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2] || 'dist';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'build.json'), JSON.stringify(buildInfo()) + '\n');
  console.log(`wrote ${dir}/build.json`);
  const { file, bytes } = mainGzipBytes(dir);
  const problem = sizeProblem(bytes);
  if (problem) {
    console.error(`\n✗ ${problem}\n  (${file})`);
    process.exit(1);
  }
  console.log(`main script ${(bytes / 1000).toFixed(1)} kB gzipped (ceiling ${MAIN_GZIP_CEILING_KB} kB)`);
}
