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

// The Moon is six downloads (src/world/moonstages.js): stage A (moon.js, the landing's own code, in AREA_ENTRY_MODULES), the only one the walk waits for; then
// four stage chunks (the Old Relay Station last) and the late arrivals' code, fetched in the background right after the landing is built. Each is held under MOON_STAGE_GZIP_CEILING_KB on its own files (what the
// others do not already bring); all together under MOON_TOTAL_GZIP_CEILING_KB.
export const MOON_STAGE_ENTRY_MODULES = Object.freeze({
  moonhill: Object.freeze(['src/world/moonstagehill.js']),
  moonlaunch: Object.freeze(['src/world/moonstagelaunch.js']),
  moonrover: Object.freeze(['src/world/moonstagerover.js']),
  moonstation: Object.freeze(['src/world/moonstagestation.js']), // the Old Relay Station (wing E): fetched last, in the background; the landing never waits for it
  moonlate: Object.freeze(['src/world/moonlate.js']), // the late arrivals' own code (draw, fade, wake): fetched with the walk's start, only while a stage is still on its way
});
export const MOON_STAGE_GZIP_CEILING_KB = 65;
export const MOON_TOTAL_GZIP_CEILING_KB = 150; // 135 until the Old Relay Station: its stage adds about 20 kB (121 kB now); stage A stays 65 and is the only download the landing waits for (Reef parity)

/** The staged-downloads helper: { [id], ...stage ids, total }: stage A (the place's own files), each stage's own files beyond stage A, and every file the place downloads. */
export function stagedDownloads(manifest, id, stageEntries) {
  const a = new Set(areaDownloads(manifest)[id]);
  const st = areaDownloads(manifest, stageEntries);
  const out = { [id]: [...a] };
  const all = new Set(a);
  for (const [sid, fs] of Object.entries(st)) { out[sid] = fs.filter((f) => !a.has(f)); for (const f of fs) all.add(f); }
  out.total = [...all];
  return out;
}
export const moonDownloads = (manifest) => stagedDownloads(manifest, 'moon', MOON_STAGE_ENTRY_MODULES);

// The Reef is the same shape (src/world/reefstages.js): stage A (reef.js) and three stage chunks, each under REEF_STAGE_GZIP_CEILING_KB, all four under the total.
export const REEF_STAGE_ENTRY_MODULES = Object.freeze({
  reeflab: Object.freeze(['src/world/reefstagelab.js']),
  reefwreck: Object.freeze(['src/world/reefstagewreck.js']),
  reefride: Object.freeze(['src/world/reefstageride.js']),
});
export const REEF_STAGE_GZIP_CEILING_KB = 65;
export const REEF_TOTAL_GZIP_CEILING_KB = 150;
export const reefDownloads = (manifest) => stagedDownloads(manifest, 'reef', REEF_STAGE_ENTRY_MODULES);

// The Crystal Cave is the same shape (src/world/crystalstages.js): stage A (crystal.js) and two stage chunks, each under CRYSTAL_STAGE_GZIP_CEILING_KB, all three under the total.
export const CRYSTAL_STAGE_ENTRY_MODULES = Object.freeze({
  crystalwingc: Object.freeze(['src/world/crystalstagewingc.js']),
  crystalplay: Object.freeze(['src/world/crystalstageplay.js']),
});
export const CRYSTAL_STAGE_GZIP_CEILING_KB = 65;
export const CRYSTAL_TOTAL_GZIP_CEILING_KB = 120;
export const crystalDownloads = (manifest) => stagedDownloads(manifest, 'crystal', CRYSTAL_STAGE_ENTRY_MODULES);

// The Treehouse village is the same shape (src/world/treehousestages.js): stage A (treehouse.js) and two stage chunks, each under TREEHOUSE_STAGE_GZIP_CEILING_KB, all three under the total.
export const TREEHOUSE_STAGE_ENTRY_MODULES = Object.freeze({
  treehousebranches: Object.freeze(['src/world/treehousestagebranches.js']),
  treehouselift: Object.freeze(['src/world/treehousestagelift.js']),
});
export const TREEHOUSE_STAGE_GZIP_CEILING_KB = 65;
export const TREEHOUSE_TOTAL_GZIP_CEILING_KB = 150;
export const treehouseDownloads = (manifest) => stagedDownloads(manifest, 'treehouse', TREEHOUSE_STAGE_ENTRY_MODULES);
// Snowville is the same shape (src/world/snowvillestages.js): stage A (snowville.js: the square and the spawn court) and two stage chunks (B: the pond, the hill and Lantern Night;
// C: the sled run, still empty), each under SNOWVILLE_STAGE_GZIP_CEILING_KB, all three under the total.
export const SNOWVILLE_STAGE_ENTRY_MODULES = Object.freeze({
  snowvilleb: Object.freeze(['src/world/snowvillestageb.js']),
  snowvillec: Object.freeze(['src/world/snowvillestagec.js']),
});
export const SNOWVILLE_STAGE_GZIP_CEILING_KB = 65;
export const SNOWVILLE_TOTAL_GZIP_CEILING_KB = 150;
export const snowvilleDownloads = (manifest) => stagedDownloads(manifest, 'snowville', SNOWVILLE_STAGE_ENTRY_MODULES);

// The Jungle lodge is the same shape (src/world/junglestages.js): stage A (jungle.js: the lodge, the ring, the river and the rain) and two stage chunks (B: the river's far bank, the
// canopy walk and the Rain Supper; C: the raft), each under JUNGLE_STAGE_GZIP_CEILING_KB, all three under the total.
export const JUNGLE_STAGE_ENTRY_MODULES = Object.freeze({
  jungleb: Object.freeze(['src/world/junglestageb.js']),
  junglec: Object.freeze(['src/world/junglestagec.js']),
});
export const JUNGLE_STAGE_GZIP_CEILING_KB = 65;
export const JUNGLE_TOTAL_GZIP_CEILING_KB = 150;
export const jungleDownloads = (manifest) => stagedDownloads(manifest, 'jungle', JUNGLE_STAGE_ENTRY_MODULES);

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
export const CAT_ENTRY_MODULES = { catsync: ['src/game/catsync.js'], savecode: ['src/savecode.js'], catcodes: ['src/catcodes.js'], catlogin: ['src/ui/catlogin.js'], hop: ['src/game/hop.js'] };
export const CAT_GZIP_CEILING_KB = 30;

// "Start a fresh cat" (src/ui/freshcat.js, with its words): one lazy chunk, fetched only by a tap on the Settings button.
// It must never fold into start-up, and has its own ceiling.
export const FRESH_ENTRY_MODULES = { fresh: ['src/ui/freshcat.js'] };
export const FRESH_GZIP_CEILING_KB = 30;

// Couch play (src/coop/, docs/superpowers/specs/2026-11-22-couch-coop-design.md)
// is one lazy chunk, loaded only by ?coop=1. It must never fold into start-up,
// and it has its own ceiling.
export const COOP_ENTRY_MODULES = { coop: ['src/coop/index.js'] };
export const COOP_GZIP_CEILING_KB = 25;

// The walk's extras (src/game/walkextras.js: weather, ghosts, the yard dog, the kitten, the race; walkscene.js:
// the scene's dressing; walklive.js: the live systems) are three lazy chunks fetched beside each place's own.
// None may fold into start-up, and each has its own ceiling.
export const WALK_ENTRY_MODULES = { walk: ['src/game/walkextras.js'], scene: ['src/game/walkscene.js'], live: ['src/game/walklive.js'] };
export const WALK_GZIP_CEILING_KB = 30;

// The teleport gates (src/teleport.js, with src/teleui.js and src/world/telegate.js in it) are one lazy chunk, fetched only
// behind ?gates=1 (src/telehook.js). It must never fold into start-up, and has its own ceiling (the plan: lazy chunks 30 kB).
// (milestone 2: the suit kit, src/cat/suitkit.js, is its own lazy chunk too, fetched with the place beyond a suit gate)
export const TELE_ENTRY_MODULES = { tele: ['src/teleport.js'], suit: ['src/cat/suitkit.js'] };
export const TELE_GZIP_CEILING_KB = 30;

const gzipOf = (dir, file) => gzipSync(readFileSync(join(dir, file))).length;

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const dir = process.argv[2] || 'dist';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'build.json'), JSON.stringify(buildInfo()) + '\n');
  console.log(`wrote ${dir}/build.json`);
  const manifest = JSON.parse(readFileSync(join(dir, '.vite', 'manifest.json'), 'utf8'));
  const problems = [...lazyProblems(manifest), ...lazyProblems(manifest, TV_ENTRY_MODULES), ...lazyProblems(manifest, CAT_ENTRY_MODULES), ...lazyProblems(manifest, FRESH_ENTRY_MODULES), ...lazyProblems(manifest, COOP_ENTRY_MODULES), ...lazyProblems(manifest, WALK_ENTRY_MODULES), ...lazyProblems(manifest, TELE_ENTRY_MODULES)];
  const start = startupFiles(manifest);
  const startBytes = start.reduce((n, f) => n + gzipOf(dir, f), 0);
  const startProblem = sizeProblem(startBytes);
  if (startProblem) problems.push(`${startProblem}\n  (${start.join(', ')})`);
  const kb = Object.fromEntries(Object.entries(areaDownloads(manifest))
    .map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  problems.push(...areaSizeProblems(kb));
  const moonDl = moonDownloads(manifest);
  const moonKb = Object.fromEntries(Object.entries(moonDl).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  const { total: moonTotal, ...moonParts } = moonKb;
  problems.push(...areaSizeProblems(moonParts, MOON_STAGE_GZIP_CEILING_KB), ...areaSizeProblems({ 'moon (all stages)': moonTotal }, MOON_TOTAL_GZIP_CEILING_KB));
  problems.push(...lazyProblems(manifest, MOON_STAGE_ENTRY_MODULES));
  const reefKb = Object.fromEntries(Object.entries(reefDownloads(manifest)).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  const { total: reefTotal, ...reefParts } = reefKb;
  problems.push(...areaSizeProblems(reefParts, REEF_STAGE_GZIP_CEILING_KB), ...areaSizeProblems({ 'reef (all stages)': reefTotal }, REEF_TOTAL_GZIP_CEILING_KB));
  problems.push(...lazyProblems(manifest, REEF_STAGE_ENTRY_MODULES));
  const crKb = Object.fromEntries(Object.entries(crystalDownloads(manifest)).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  const { total: crTotal, ...crParts } = crKb;
  problems.push(...areaSizeProblems(crParts, CRYSTAL_STAGE_GZIP_CEILING_KB), ...areaSizeProblems({ 'crystal (all stages)': crTotal }, CRYSTAL_TOTAL_GZIP_CEILING_KB));
  problems.push(...lazyProblems(manifest, CRYSTAL_STAGE_ENTRY_MODULES));
  const thKb = Object.fromEntries(Object.entries(treehouseDownloads(manifest)).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  const { total: thTotal, ...thParts } = thKb;
  problems.push(...areaSizeProblems(thParts, TREEHOUSE_STAGE_GZIP_CEILING_KB), ...areaSizeProblems({ 'treehouse (all stages)': thTotal }, TREEHOUSE_TOTAL_GZIP_CEILING_KB));
  problems.push(...lazyProblems(manifest, TREEHOUSE_STAGE_ENTRY_MODULES));
  const svKb = Object.fromEntries(Object.entries(snowvilleDownloads(manifest)).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  const { total: svTotal, ...svParts } = svKb;
  problems.push(...areaSizeProblems(svParts, SNOWVILLE_STAGE_GZIP_CEILING_KB), ...areaSizeProblems({ 'snowville (all stages)': svTotal }, SNOWVILLE_TOTAL_GZIP_CEILING_KB));
  problems.push(...lazyProblems(manifest, SNOWVILLE_STAGE_ENTRY_MODULES));
  const jlKb = Object.fromEntries(Object.entries(jungleDownloads(manifest)).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  const { total: jlTotal, ...jlParts } = jlKb;
  problems.push(...areaSizeProblems(jlParts, JUNGLE_STAGE_GZIP_CEILING_KB), ...areaSizeProblems({ 'jungle (all stages)': jlTotal }, JUNGLE_TOTAL_GZIP_CEILING_KB));
  problems.push(...lazyProblems(manifest, JUNGLE_STAGE_ENTRY_MODULES));
  const tvKb = tvDownloads(manifest).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000;
  problems.push(...areaSizeProblems({ tv: tvKb }, TV_GZIP_CEILING_KB));
  console.log(`start-up ${(startBytes / 1000).toFixed(1)} kB gzipped (ceiling ${MAIN_GZIP_CEILING_KB} kB), ${start.length} files`);
  for (const [id, v] of Object.entries(kb)) console.log(`  ${id.padEnd(13)} ${v.toFixed(1)} kB gzipped (ceiling ${AREA_GZIP_CEILING_KB} kB)`);
  console.log(`  reef stages   A ${reefKb.reef.toFixed(1)}, lab ${reefKb.reeflab.toFixed(1)}, wreck ${reefKb.reefwreck.toFixed(1)}, ride ${reefKb.reefride.toFixed(1)}, all ${reefTotal.toFixed(1)} kB gzipped (ceiling ${REEF_STAGE_GZIP_CEILING_KB} each, ${REEF_TOTAL_GZIP_CEILING_KB} all)`);
  console.log(`  crystal stages A ${crKb.crystal.toFixed(1)}, wingc ${crKb.crystalwingc.toFixed(1)}, play ${crKb.crystalplay.toFixed(1)}, all ${crTotal.toFixed(1)} kB gzipped (ceiling ${CRYSTAL_STAGE_GZIP_CEILING_KB} each, ${CRYSTAL_TOTAL_GZIP_CEILING_KB} all)`);
  console.log(`  treehouse     A ${thKb.treehouse.toFixed(1)}, branches ${thKb.treehousebranches.toFixed(1)}, lift ${thKb.treehouselift.toFixed(1)}, all ${thTotal.toFixed(1)} kB gzipped (ceiling ${TREEHOUSE_STAGE_GZIP_CEILING_KB} each, ${TREEHOUSE_TOTAL_GZIP_CEILING_KB} all)`);
  console.log(`  snowville stages A ${svKb.snowville.toFixed(1)}, b ${svKb.snowvilleb.toFixed(1)}, c ${svKb.snowvillec.toFixed(1)}, all ${svTotal.toFixed(1)} kB gzipped (ceiling ${SNOWVILLE_STAGE_GZIP_CEILING_KB} each, ${SNOWVILLE_TOTAL_GZIP_CEILING_KB} all)`);
  console.log(`  jungle stages A ${jlKb.jungle.toFixed(1)}, b ${jlKb.jungleb.toFixed(1)}, c ${jlKb.junglec.toFixed(1)}, all ${jlTotal.toFixed(1)} kB gzipped (ceiling ${JUNGLE_STAGE_GZIP_CEILING_KB} each, ${JUNGLE_TOTAL_GZIP_CEILING_KB} all)`);
  console.log(`  moon stages   A ${moonKb.moon.toFixed(1)}, hill ${moonKb.moonhill.toFixed(1)}, launch ${moonKb.moonlaunch.toFixed(1)}, rover ${moonKb.moonrover.toFixed(1)}, station ${moonKb.moonstation.toFixed(1)}, late ${moonKb.moonlate.toFixed(1)}, all ${moonTotal.toFixed(1)} kB gzipped (ceiling ${MOON_STAGE_GZIP_CEILING_KB} each, ${MOON_TOTAL_GZIP_CEILING_KB} all)`);
  console.log(`  tv chunk      ${tvKb.toFixed(1)} kB gzipped (ceiling ${TV_GZIP_CEILING_KB} kB)`);
  const coopKb = (areaDownloads(manifest, COOP_ENTRY_MODULES).coop ?? []).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000;
  problems.push(...areaSizeProblems({ coop: coopKb }, COOP_GZIP_CEILING_KB));
  console.log(`  coop chunk    ${coopKb.toFixed(1)} kB gzipped (ceiling ${COOP_GZIP_CEILING_KB} kB)`);
  const teleDl = areaDownloads(manifest, TELE_ENTRY_MODULES);
  const teleKbs = Object.fromEntries(Object.keys(TELE_ENTRY_MODULES).map((k) => [k, (teleDl[k] ?? []).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  problems.push(...areaSizeProblems(teleKbs, TELE_GZIP_CEILING_KB));
  console.log(`  tele chunk    ${teleKbs.tele.toFixed(1)} kB gzipped, suit kit ${teleKbs.suit.toFixed(1)} kB (ceiling ${TELE_GZIP_CEILING_KB} kB each)`);
  const walkDl = areaDownloads(manifest, WALK_ENTRY_MODULES);
  const walkAll = Object.fromEntries(Object.keys(WALK_ENTRY_MODULES).map((k) => [k, (walkDl[k] ?? []).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  problems.push(...areaSizeProblems(walkAll, WALK_GZIP_CEILING_KB));
  console.log(`  walk chunks   extras ${walkAll.walk.toFixed(1)} kB gzipped, scene ${walkAll.scene.toFixed(1)} kB, live ${walkAll.live.toFixed(1)} kB (ceiling ${WALK_GZIP_CEILING_KB} kB each)`);
  const catDownloads = areaDownloads(manifest, CAT_ENTRY_MODULES);
  const catAll = Object.fromEntries(Object.keys(CAT_ENTRY_MODULES).map((k) => [k, (catDownloads[k] ?? []).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
  problems.push(...areaSizeProblems(catAll, CAT_GZIP_CEILING_KB));
  const catKb = catAll.catsync;
  console.log(`  catch-up      ${catKb.toFixed(1)} kB gzipped (ceiling ${CAT_GZIP_CEILING_KB} kB)`);
  console.log(`  cat codes     ${catAll.catcodes.toFixed(1)} kB gzipped, My cat sheet ${catAll.catlogin.toFixed(1)} kB, old codes ${catAll.savecode.toFixed(1)} kB, hop codes ${catAll.hop.toFixed(1)} kB (ceiling ${CAT_GZIP_CEILING_KB} kB each)`);
  const freshKb = (areaDownloads(manifest, FRESH_ENTRY_MODULES).fresh ?? []).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000;
  problems.push(...areaSizeProblems({ fresh: freshKb }, FRESH_GZIP_CEILING_KB));
  console.log(`  fresh cat     ${freshKb.toFixed(1)} kB gzipped (ceiling ${FRESH_GZIP_CEILING_KB} kB)`);
  if (problems.length) {
    for (const p of problems) console.error(`\n✗ ${p}`);
    process.exit(1);
  }
}
