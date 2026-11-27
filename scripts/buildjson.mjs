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

// The staged places (one row each, in the order the build log prints them): stage A is the place's own entry in AREA_ENTRY_MODULES (the only download the walk waits for); `stages` are the
// later chunks, each [entry name, log label, source files], fetched in the background right after the landing is built. Each stage is held under `stageCeiling` kB gzipped on its own files (what the
// others do not already bring); all of the place's downloads together under `totalCeiling`. `label` is the build log's line prefix.
//   Moon (src/world/moonstages.js): four stage chunks (the Old Relay Station last) and the late arrivals' code. The total was 135 until the Old Relay Station: its stage adds about 20 kB.
//   Reef (reefstages.js), Crystal Cave (crystalstages.js), Treehouse (treehousestages.js), Snowville (snowvillestages.js: B the pond, the hill and Lantern Night; C the sled run, still empty),
//   Jungle lodge (junglestages.js: B the river's far bank, the canopy walk and the Rain Supper; C the raft): the same shape.
//   Old House (housestages.js): one stage, the east wing and the wonder room; the landing stays under 55 kB.
export const STAGED_AREAS = Object.freeze([
  { id: 'house', label: 'house stages  ', stageCeiling: 65, totalCeiling: 150, stages: [
    ['housewing', 'wing', ['src/world/housestagewing.js']], // the east wing's drawing, far look and discoveries (housestages.js); there is no stage c
  ] },
  { id: 'reef', label: 'reef stages   ', stageCeiling: 65, totalCeiling: 150, stages: [
    ['reeflab', 'lab', ['src/world/reefstagelab.js']],
    ['reefwreck', 'wreck', ['src/world/reefstagewreck.js']],
    ['reefride', 'ride', ['src/world/reefstageride.js']],
  ] },
  { id: 'crystal', label: 'crystal stages ', stageCeiling: 65, totalCeiling: 120, stages: [
    ['crystalwingc', 'wingc', ['src/world/crystalstagewingc.js']],
    ['crystalplay', 'play', ['src/world/crystalstageplay.js']],
    ['crystaldeep', 'deep', ['src/world/crystalstagedeep.js']], // the second story (the Echo Deep): empty until C1 to C7
  ] },
  { id: 'treehouse', label: 'treehouse     ', stageCeiling: 65, totalCeiling: 150, stages: [
    ['treehousebranches', 'branches', ['src/world/treehousestagebranches.js']],
    ['treehouselift', 'lift', ['src/world/treehousestagelift.js']],
  ] },
  { id: 'snowville', label: 'snowville stages ', stageCeiling: 65, totalCeiling: 150, stages: [
    ['snowvilleb', 'b', ['src/world/snowvillestageb.js']],
    ['snowvillec', 'c', ['src/world/snowvillestagec.js']],
  ] },
  { id: 'jungle', label: 'jungle stages ', stageCeiling: 65, totalCeiling: 150, stages: [
    ['jungleb', 'b', ['src/world/junglestageb.js']],
    ['junglec', 'c', ['src/world/junglestagec.js']],
  ] },
  { id: 'moon', label: 'moon stages   ', stageCeiling: 65, totalCeiling: 150, stages: [
    ['moonhill', 'hill', ['src/world/moonstagehill.js']],
    ['moonlaunch', 'launch', ['src/world/moonstagelaunch.js']],
    ['moonrover', 'rover', ['src/world/moonstagerover.js']],
    ['moonstation', 'station', ['src/world/moonstagestation.js']], // the Old Relay Station (wing E): fetched last, in the background; the landing never waits for it
    ['moonlate', 'late', ['src/world/moonlate.js']], // the late arrivals' own code (draw, fade, wake): fetched with the walk's start, only while a stage is still on its way
  ] },
]);
/** A staged place's stage entry modules, { [stage name]: [files] }, in the shape areaDownloads and lazyProblems take. */
export const stageEntryModules = (area) => Object.fromEntries(area.stages.map(([name, , files]) => [name, Object.freeze([...files])]));

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
/** The staged-downloads helper for one STAGED_AREAS row. */
export const stagedAreaDownloads = (manifest, area) => stagedDownloads(manifest, area.id, stageEntryModules(area));

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
  const stagedKb = {};
  for (const area of STAGED_AREAS) {
    const kbs = Object.fromEntries(Object.entries(stagedAreaDownloads(manifest, area)).map(([id, fs]) => [id, fs.reduce((n, f) => n + gzipOf(dir, f), 0) / 1000]));
    const { total, ...parts } = kbs;
    stagedKb[area.id] = { kbs, total };
    problems.push(...areaSizeProblems(parts, area.stageCeiling), ...areaSizeProblems({ [`${area.id} (all stages)`]: total }, area.totalCeiling));
    problems.push(...lazyProblems(manifest, stageEntryModules(area)));
  }
  const tvKb = tvDownloads(manifest).reduce((n, f) => n + gzipOf(dir, f), 0) / 1000;
  problems.push(...areaSizeProblems({ tv: tvKb }, TV_GZIP_CEILING_KB));
  console.log(`start-up ${(startBytes / 1000).toFixed(1)} kB gzipped (ceiling ${MAIN_GZIP_CEILING_KB} kB), ${start.length} files`);
  for (const [id, v] of Object.entries(kb)) console.log(`  ${id.padEnd(13)} ${v.toFixed(1)} kB gzipped (ceiling ${AREA_GZIP_CEILING_KB} kB)`);
  for (const area of STAGED_AREAS) {
    const { kbs, total } = stagedKb[area.id];
    const parts = [`A ${kbs[area.id].toFixed(1)}`, ...area.stages.map(([name, short]) => `${short} ${kbs[name].toFixed(1)}`), `all ${total.toFixed(1)}`];
    console.log(`  ${area.label}${parts.join(', ')} kB gzipped (ceiling ${area.stageCeiling} each, ${area.totalCeiling} all)`);
  }
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
