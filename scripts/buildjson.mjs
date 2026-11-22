// Writes dist/build.json ({ commit, date }) after `vite build`, so the
// post-deploy smoke check can tell which commit is actually live, and fails
// the build if start-up (the entry plus its static imports) or any place's
// own download has grown past its ceiling. Runs as
// the npm `postbuild` hook, which fires for `npm run build` only: the iOS
// build (`build:ios`) is untouched. GITHUB_SHA wins in CI; otherwise git HEAD.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { AREA_ENTRY_MODULES } from '../src/world/areas.js';

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

// The most the start-up scripts may weigh gzipped, in kB (1 kB = 1000 bytes,
// as Vite prints it; Node's gzip here comes out a few kB under Vite's
// figure). Start-up is the entry plus every chunk it imports statically: what
// a child's phone downloads before the game can start. It grew from 632 kB to
// 801 kB in nine days (Nov 2026) with nothing watching. Owner's choice
// 2026-11-20: lowered from 900 to 700 once lazy loading landed, with each
// place its own download under AREA_GZIP_CEILING_KB (100). Owner's choice
// 2026-11-21: raised to 720 for Market Square and the Old House (start-up
// reached 697 with the Market). Raise either on purpose, in the same change,
// rather than to make a build pass.
export const MAIN_GZIP_CEILING_KB = 720;

/** The main script's path from the built index.html (its module entry). */
export function mainScript(html) {
  const tag = html.match(/<script\b[^>]*\btype="module"[^>]*>/)?.[0] ?? '';
  return tag.match(/\bsrc="([^"]+)"/)?.[1] ?? null;
}

/** Why the main script is too big, or null if it fits under the ceiling. */
export function sizeProblem(gzipBytes, ceilingKb = MAIN_GZIP_CEILING_KB) {
  const kb = gzipBytes / 1000;
  if (kb <= ceilingKb) return null;
  return `The start-up scripts are ${kb.toFixed(1)} kB gzipped, over its ceiling of ${ceilingKb} kB. ` +
    'Make it smaller, or raise MAIN_GZIP_CEILING_KB in scripts/buildjson.mjs on purpose (for example when a new area lands).';
}

export const AREA_GZIP_CEILING_KB = 100;

/** The entry file plus every file reached through static `imports`, each once. */
export function startupFiles(manifest) {
  const seen = new Set();
  const files = [];
  const walk = (key) => {
    if (seen.has(key) || !manifest[key]) return;
    seen.add(key);
    files.push(manifest[key].file);
    for (const k of manifest[key].imports ?? []) walk(k);
  };
  for (const [key, c] of Object.entries(manifest)) if (c.isEntry) walk(key);
  return [...new Set(files)];
}

/** { areaId: files } a place downloads on top of start-up (its modules' chunks and what they import). */
export function areaDownloads(manifest, entryModules = AREA_ENTRY_MODULES) {
  const start = new Set(startupFiles(manifest));
  const out = {};
  for (const [id, mods] of Object.entries(entryModules)) {
    const seen = new Set();
    const files = new Set();
    const walk = (key) => {
      if (seen.has(key) || !manifest[key]) return;
      seen.add(key);
      if (!start.has(manifest[key].file)) files.add(manifest[key].file);
      for (const k of manifest[key].imports ?? []) walk(k);
    };
    for (const m of mods) walk(m);
    out[id] = [...files];
  }
  return out;
}

/** One line per place over its ceiling; kbById is gzipped kB per place. */
export function areaSizeProblems(kbById, ceilingKb = AREA_GZIP_CEILING_KB) {
  return Object.entries(kbById)
    .filter(([, kb]) => kb > ceilingKb)
    .map(([id, kb]) => `The ${id} place is ${kb.toFixed(1)} kB gzipped, over its ceiling of ${ceilingKb} kB. ` +
      'Make it smaller, or raise AREA_GZIP_CEILING_KB in scripts/buildjson.mjs on purpose.');
}

/** One line per listed module that is missing, not a dynamic entry, or loaded by start-up. */
export function lazyProblems(manifest, entryModules = AREA_ENTRY_MODULES) {
  const start = new Set(startupFiles(manifest));
  const out = [];
  for (const mods of Object.values(entryModules)) {
    for (const m of mods) {
      const c = manifest[m];
      if (!c) out.push(`${m} is missing from the build manifest, so it is not its own chunk.`);
      else if (!c.isDynamicEntry) out.push(`${m} is not a lazy chunk: an area is being imported from start-up code.`);
      else if (start.has(c.file)) out.push(`${m} is in the start-up download: an area is being imported from start-up code.`);
    }
  }
  return out;
}

// TV mode (src/tv/) is one lazy chunk, loaded only when the TV switch is on.
// It must never fold into start-up, and has its own ceiling.
export const TV_ENTRY_MODULES = { tv: ['src/tv/index.js'] };
export const TV_GZIP_CEILING_KB = 30;

/** Files the TV chunk downloads on top of start-up: its scripts and its stylesheet. */
export function tvDownloads(manifest) {
  const files = new Set(areaDownloads(manifest, TV_ENTRY_MODULES).tv ?? []);
  for (const m of TV_ENTRY_MODULES.tv) for (const c of manifest[m]?.css ?? []) files.add(c);
  return [...files];
}

// The cat login's catch-up (src/game/catsync.js and the merge it loads) is one
// lazy chunk, fetched only by a device that has a cloud link. It must never
// fold into start-up.
export const CAT_ENTRY_MODULES = { catsync: ['src/game/catsync.js'], savecode: ['src/savecode.js'] };
export const CAT_GZIP_CEILING_KB = 30;

const gzipOf = (dir, file) => gzipSync(readFileSync(join(dir, file))).length;

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2] || 'dist';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'build.json'), JSON.stringify(buildInfo()) + '\n');
  console.log(`wrote ${dir}/build.json`);
  const manifest = JSON.parse(readFileSync(join(dir, '.vite', 'manifest.json'), 'utf8'));
  const problems = [...lazyProblems(manifest), ...lazyProblems(manifest, TV_ENTRY_MODULES), ...lazyProblems(manifest, CAT_ENTRY_MODULES)];
  const start = startupFiles(manifest);
  const startBytes = start.reduce((n, f) => n + gzipOf(dir, f), 0);
  const startProblem = sizeProblem(startBytes);
  if (startProblem) problems.push(`${startProblem}\n  (${start.join(', ')})`);
  const kb = Object.fromEntries(Object.entries(areaDownloads(manifest))
    .map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  problems.push(...areaSizeProblems(kb));
  const tvKb = tvDownloads(manifest).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000;
  problems.push(...areaSizeProblems({ tv: tvKb }, TV_GZIP_CEILING_KB));
  console.log(`start-up ${(startBytes / 1000).toFixed(1)} kB gzipped (ceiling ${MAIN_GZIP_CEILING_KB} kB), ${start.length} files`);
  for (const [id, v] of Object.entries(kb)) console.log(`  ${id.padEnd(13)} ${v.toFixed(1)} kB gzipped (ceiling ${AREA_GZIP_CEILING_KB} kB)`);
  console.log(`  tv chunk      ${tvKb.toFixed(1)} kB gzipped (ceiling ${TV_GZIP_CEILING_KB} kB)`);
  const catKb = (areaDownloads(manifest, CAT_ENTRY_MODULES).catsync ?? []).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000;
  problems.push(...areaSizeProblems({ catsync: catKb }, CAT_GZIP_CEILING_KB));
  console.log(`  catch-up      ${catKb.toFixed(1)} kB gzipped (ceiling ${CAT_GZIP_CEILING_KB} kB)`);
  if (problems.length) {
    for (const p of problems) console.error(`\n✗ ${p}`);
    process.exit(1);
  }
}
