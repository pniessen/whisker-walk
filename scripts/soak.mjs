#!/usr/bin/env node
// Overnight soak: plays the BUILT game (dist/) in Chrome with a seeded bot to find crashes.
// See docs/soak.md. One run = one Chrome, one place, one cat, for --minutes.
//   node scripts/soak.mjs --seed 7 --place reef --cat tabby --tv 0 --throttle 1 --minutes 5 --couch 0
// On a crash it writes soak-out/<run>/crash.json and a screenshot and exits 3.
// Exit codes: 0 clean, 3 crash found, 1 the soak itself failed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSoakArgs, replayCommand, runName } from './soak/args.mjs';
import { findChrome, launchChrome, openTab, evalIn } from './soak/chrome.mjs';
import { startServer } from './soak/server.mjs';
import { buildSeedSave, seedSettings, SAVE_KEY, SETTINGS_KEY } from './soak/save.mjs';
import { BOOT_EVAL_TIMEOUT_MS, consoleLine, createRing, evalTimeoutFor, formatMetrics, isSoftwareGl, logLine, parseSize } from './soak/diagnose.mjs';
import { mergeEntries } from './soak/groups.mjs';
import { writeSummary } from './soak/summary.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const POLL_MS = 1000;
const LOAD_TIMEOUT = 180e3;  // the game never reached a walk (slow throttled runs get this long)
const CRASH_KINDS = new Set(['error', 'rejection', 'walk-ended']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);

export function injectedSource(opts) {
  const cfg = { seed: opts.seed, place: opts.place, couch: !!opts.couch, hiddenTab: !!opts.hiddenTab, touch: !!opts.touch, travel: true };
  const save = JSON.stringify(buildSeedSave({ place: opts.place, cat: opts.cat }));
  const settings = JSON.stringify(seedSettings({ tv: opts.tv, couch: opts.couch, quality: opts.quality }));
  const seed = `try { if (!localStorage.getItem('__soak_seeded')) { localStorage.setItem(${JSON.stringify(SAVE_KEY)}, ${JSON.stringify(save)}); localStorage.setItem(${JSON.stringify(SETTINGS_KEY)}, ${JSON.stringify(settings)}); localStorage.setItem('__soak_seeded', '1'); } } catch (e) {}`;
  return `${seed}\nwindow.__SOAK_CFG = ${JSON.stringify(cfg)};\n${readFileSync(join(HERE, 'soak', 'pagebot.js'), 'utf8')}`;
}

export function pageUrl(base, opts) {
  return `${base}?perf=1&tv=${opts.tv}&coop=${opts.couch}`;
}

async function shot(tab, file) {
  try {
    const r = await withTimeout(tab.send('Page.captureScreenshot', { format: 'png' }), 10e3, 'screenshot');
    writeFileSync(file, Buffer.from(r.data, 'base64'));
    return true;
  } catch { return false; }
}

export async function runSoak(opts, log = console.log) {
  const root = resolve(opts.out);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = runName(opts, stamp);
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const dist = resolve(opts.dist);
  if (!existsSync(join(dist, 'index.html'))) throw new Error(`no build in ${dist}; run npm run build first`);

  const srv = await startServer(dist);
  const chrome = await launchChrome({ chrome: findChrome(opts.chrome), headed: opts.headed });
  const started = Date.now();
  let tab = null;
  let crash = null;
  let last = { step: 0, phase: 'boot' };
  const pageErrors = [];
  let renderer = null;
  const consoleRing = createRing(30);
  const timings = { runStart: 0 }; // ms since the run began, as Node saw them
  const since = () => Date.now() - started;
  const { w, h } = opts.tv && opts.size === '1280x720' ? { w: 1920, h: 1080 } : parseSize(opts.size);
  try {
    tab = await openTab(chrome.port, 'about:blank');
    await tab.send('Runtime.enable');
    await tab.send('Page.enable');
    await tab.send('Log.enable').catch(() => {});
    await tab.send('Performance.enable').catch(() => {});
    tab.on('Runtime.consoleAPICalled', (p) => consoleRing.push(consoleLine(p)));
    tab.on('Log.entryAdded', (p) => consoleRing.push(logLine(p.entry)));
    tab.on('Page.loadEventFired', () => { timings.pageLoadedMs ??= since(); });
    tab.on('Runtime.exceptionThrown', (p) => pageErrors.push({ kind: 'error', message: (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').split('\n')[0].slice(0, 300), source: (p.exceptionDetails?.url ?? '').split('/').pop(), line: p.exceptionDetails?.lineNumber ?? 0 }));
    tab.on('Inspector.targetCrashed', () => { renderer = 'the page process crashed'; });
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    if (opts.throttle > 1) await tab.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: injectedSource(opts) });
    await tab.send('Page.navigate', { url: pageUrl(srv.url, opts) });
    log(`soak ${name}: ${opts.minutes} min, seed ${opts.seed}`);

    let cursor = 0;
    const deadline = started + opts.minutes * 60e3;
    let walkSeen = false;
    let selfTestDone = false;
    while (Date.now() < deadline && !crash) {
      await sleep(POLL_MS);
      let r;
      try {
        const limit = evalTimeoutFor(last.phase === 'boot' && !last.step ? undefined : last.phase, opts.evalTimeout * 1000);
        const text = await withTimeout(evalIn(tab, 'window.__soak ? JSON.stringify({ step: __soak.step, phase: __soak.phase, events: __soak.events, diag: __soak.diag || null, hops: __soak.hops, places: __soak.places, hides: __soak.hides, frames: __soak.frames, marks: __soak.marks, gl: __soak.gl, pauses: __soak.pauses, prompt: __soak.lastPrompt, phases: __soak.phaseCounts }) : null'), limit, 'page answer');
        r = text ? JSON.parse(text) : null;
      } catch (e) {
        crash = { kind: renderer ? 'renderer-crashed' : tab.closed ? 'chrome-died' : 'hang', message: renderer ?? e.message, entries: [{ kind: 'hang', message: renderer ?? e.message, source: '', line: 0 }] };
        break;
      }
      if (!r) { if (Date.now() - started > LOAD_TIMEOUT) crash = { kind: 'never-started', message: 'the bot never came up', entries: [] }; continue; }
      last = r;
      timings.botAnswersMs ??= since();
      if (r.phase === 'walk') { walkSeen = true; timings.walkMs ??= since(); }
      // --self-test: once a walk has run for a few seconds, throw a real error in the page, to prove the net catches it
      if (opts.selfTest && walkSeen && !selfTestDone && r.step > 120) { selfTestDone = true; await evalIn(tab, "setTimeout(() => { throw new Error('soak self-test: deliberate error'); }, 10)"); }
      if (!walkSeen && Date.now() - started > LOAD_TIMEOUT) { crash = { kind: 'never-started', message: `no walk after ${LOAD_TIMEOUT / 1000} s (phase ${r.phase})`, entries: [] }; break; }
      const fresh = r.events.slice(cursor);
      cursor = r.events.length;
      const bad = fresh.filter((e) => CRASH_KINDS.has(e.kind));
      const diagBad = r.diag?.total > 0 ? r.diag.lines : [];
      if (bad.length || diagBad.length || pageErrors.length) {
        crash = {
          kind: bad[0]?.kind ?? (diagBad.length ? 'diagnostics' : 'error'),
          message: (bad[0] ?? diagBad[0] ?? pageErrors[0])?.message ?? '',
          entries: mergeEntries([...bad, ...diagBad, ...pageErrors].map((e) => ({ kind: e.kind, message: e.message, source: e.source ?? '', line: e.line ?? 0, count: e.count ?? 1 }))),
        };
      }
    }
    const minutes = Math.round((Date.now() - started) / 600) / 100;
    // What the machine was doing: timings (page marks are ms since page start), the GL renderer,
    // Performance.getMetrics and the last console lines.
    let metrics = null;
    if (crash) { try { metrics = formatMetrics((await withTimeout(tab.send('Performance.getMetrics'), 8e3, 'metrics')).metrics); } catch (e) { metrics = { error: e.message }; } }
    const where = { gl: last.gl ?? null, softwareGl: last.gl ? isSoftwareGl(last.gl) : null, size: `${w}x${h}`, quality: opts.quality, evalTimeoutS: opts.evalTimeout, bootEvalTimeoutS: BOOT_EVAL_TIMEOUT_MS / 1000, frames: last.frames ?? 0, pageMarksMs: last.marks ?? {}, nodeTimingsMs: timings };
    const run = { name, status: crash ? 'crash' : 'ok', minutes, steps: last.step, hops: last.hops, hides: last.hides, phases: last.phases, ...where, places: last.places, pauses: last.pauses, args: opts, replay: replayCommand(opts) };
    if (crash) {
      const screenshot = (await shot(tab, join(dir, 'crash.png'))) ? 'crash.png' : null;
      // the diagnostics record as the page shows it, once more, for the file
      let diag = null;
      try { diag = await withTimeout(evalIn(tab, 'JSON.stringify(window.__soak && window.__soak.diag)'), 5e3, 'diag read'); } catch { /* the page is gone */ }
      writeFileSync(join(dir, 'crash.json'), `${JSON.stringify({
        kind: crash.kind, message: crash.message, entries: crash.entries, seed: opts.seed, step: last.step, phase: last.phase, lastPrompt: last.prompt,
        place: opts.place, cat: opts.cat, args: opts, elapsedMin: minutes, screenshot, diagnostics: diag ? JSON.parse(diag) : null,
        replay: replayCommand(opts), ...where, metrics, console: consoleRing.list(),
      }, null, 2)}\n`);
      log(`CRASH ${crash.kind}: ${crash.message}`);
    }
    if (!crash) await shot(tab, join(dir, 'end.png'));
    writeFileSync(join(dir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
    log(`soak ${name}: ${run.status}, ${minutes} min, ${last.step} steps, ${last.hops ?? 0} hops, ${last.hides ?? 0} hidden-tab returns`);
    return run;
  } finally {
    try { tab?.close(); } catch { /* gone */ }
    await chrome.stop();
    await srv.close();
    writeSummary(root);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let opts;
  try { opts = parseSoakArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
  runSoak(opts).then((run) => process.exit(run.status === 'ok' ? 0 : 3)).catch((e) => { console.error(e.message); process.exit(1); });
}
