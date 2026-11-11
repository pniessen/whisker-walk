// Writes dist/build.json ({ commit, date }) after `vite build`, so the
// post-deploy smoke check can tell which commit is actually live. Runs as the
// npm `postbuild` hook, which fires for `npm run build` only: the iOS build
// (`build:ios`) is untouched. GITHUB_SHA wins in CI; otherwise git HEAD.
import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2] || 'dist';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'build.json'), JSON.stringify(buildInfo()) + '\n');
  console.log(`wrote ${dir}/build.json`);
}
