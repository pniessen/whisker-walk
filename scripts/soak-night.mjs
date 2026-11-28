#!/usr/bin/env node
// The overnight driver: loops the matrix (reef and moon first, then every place; every preset cat
// and a custom one; tv 0/1; throttle 1/4/6; couch 0/1) for --hours H, ONE soak run (one Chrome) at a
// time, at low priority. The queue lives in <out>/queue.json: stop it (Ctrl-C) and start it again
// and it carries on after the last finished job.
//   node scripts/soak-night.mjs --hours 8 [--minutes-per-run 4] [--out soak-out] [--places reef,moon]
//                               [--fresh] [--chrome path]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildMatrix, markDone, newQueue, nextJob, reuseQueue, runMinutes } from './soak/queue.mjs';
import { writeSummary } from './soak/summary.mjs';
import { isKnownPlace } from './soak/save.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const USAGE = 'usage: soak-night.mjs --hours H [--minutes-per-run 4] [--out soak-out] [--places reef,moon] [--fresh] [--chrome path] [--size WxH] [--quality low|auto] [--eval-timeout S]';

export function parseNightArgs(argv) {
  const o = { hours: 8, perRun: 4, out: 'soak-out', places: null, fresh: false, chrome: null, size: null, quality: null, evalTimeout: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => { if (argv[i + 1] === undefined) throw new Error(`${a} needs a value\n${USAGE}`); return argv[++i]; };
    if (a === '--hours') { o.hours = Number(v()); if (!(o.hours > 0 && o.hours <= 72)) throw new Error('--hours must be above 0 and at most 72'); }
    else if (a === '--minutes-per-run') { o.perRun = Number(v()); if (!(o.perRun > 0 && o.perRun <= 60)) throw new Error('--minutes-per-run must be above 0 and at most 60'); }
    else if (a === '--out') o.out = v();
    else if (a === '--places') { o.places = v().split(',').filter(Boolean); for (const p of o.places) if (!isKnownPlace(p)) throw new Error(`unknown place "${p}"`); }
    else if (a === '--fresh') o.fresh = true;
    else if (a === '--chrome') o.chrome = v();
    else if (a === '--size') o.size = v();
    else if (a === '--quality') o.quality = v();
    else if (a === '--eval-timeout') o.evalTimeout = v();
    else throw new Error(`unexpected argument: ${a}\n${USAGE}`);
  }
  return o;
}

export function jobArgs(job, o, minutes) {
  const a = ['--seed', job.seed, '--place', job.place, '--cat', job.cat, '--tv', job.tv, '--throttle', job.throttle, '--couch', job.couch,
    '--hidden-tab', job.hiddenTab, '--minutes', minutes.toFixed(2), '--out', o.out];
  if (o.chrome) a.push('--chrome', o.chrome);
  if (o.size) a.push('--size', o.size);
  if (o.quality) a.push('--quality', o.quality);
  if (o.evalTimeout) a.push('--eval-timeout', o.evalTimeout);
  return a;
}

// Runs one soak.mjs as a child (low priority where nice exists) and waits for it. Only this PID is ever killed.
function runChild(args, onChild) {
  return new Promise((resolveRun) => {
    const script = join(HERE, 'soak.mjs');
    const useNice = process.platform !== 'win32';
    const child = useNice ? spawn('nice', ['-n', '15', process.execPath, script, ...args], { stdio: 'inherit' }) : spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
    onChild(child);
    child.on('exit', (code) => resolveRun(code ?? 1));
    child.on('error', () => resolveRun(1));
  });
}

async function main() {
  const o = parseNightArgs(process.argv.slice(2));
  const out = resolve(o.out);
  o.out = out;
  mkdirSync(out, { recursive: true });
  const qfile = join(out, 'queue.json');
  const jobs = buildMatrix({ places: o.places });
  let queue = o.fresh || !existsSync(qfile) ? newQueue(jobs) : reuseQueue(JSON.parse(readFileSync(qfile, 'utf8')), jobs);
  const save = () => writeFileSync(qfile, `${JSON.stringify(queue)}\n`);
  save();
  const endAt = Date.now() + o.hours * 3600e3;
  let child = null;
  let stopping = false;
  const stop = () => { stopping = true; if (child) try { child.kill('SIGTERM'); } catch { /* gone */ } };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`soak-night: ${queue.done.length}/${queue.jobs.length} done, running until ${new Date(endAt).toLocaleTimeString()}`);
  let crashes = 0;
  while (!stopping) {
    const job = nextJob(queue);
    const minutes = runMinutes({ perRun: o.perRun, msLeft: endAt - Date.now() });
    if (!job || minutes < 0.5) break;
    console.log(`soak-night: [${queue.done.length + 1}/${queue.jobs.length}] ${job.id}`);
    const code = await runChild(jobArgs(job, o, minutes), (c) => { child = c; });
    child = null;
    if (stopping) { console.log('soak-night: stopped; the run in progress is not marked done'); break; }
    if (code === 3) crashes += 1;
    queue = markDone(queue, job.id); // a failed soak (code 1) is skipped too, so one bad combination cannot wedge the night
    save();
    writeSummary(out);
  }
  const s = writeSummary(out);
  console.log(`soak-night: finished. ${s.runs} runs, ${s.crashedRuns} with crashes, ${s.groups.length} distinct. See ${join(out, 'summary.json')}`);
  void crashes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
