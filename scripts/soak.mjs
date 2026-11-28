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
import { mergeEntries } from './soak/groups.mjs';
import { writeSummary } from './soak/summary.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const POLL_MS = 1000;
const EVAL_TIMEOUT = 20e3;   // a page that does not answer for this long has hung
const LOAD_TIMEOUT = 180e3;  // the game never reached a walk (slow throttled runs get this long)
const CRASH_KINDS = new Set(['error', 'rejection', 'walk-ended']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms} ms`)), ms))]);

export function injectedSource(opts) {
  const cfg = { seed: opts.seed, place: opts.place, couch: !!opts.couch, hiddenTab: !!opts.hiddenTab, touch: !!opts.touch, travel: true };
  const save = JSON.stringify(buildSeedSave({ place: opts.place, cat: opts.cat }));
  const settings = JSON.stringify(seedSettings({ tv: opts.tv, couch: opts.couch }));
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
  try {
    tab = await openTab(chrome.port, 'about:blank');
    await tab.send('Runtime.enable');
    await tab.send('Page.enable');
    tab.on('Runtime.exceptionThrown', (p) => pageErrors.push({ kind: 'error', message: (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').split('\n')[0].slice(0, 300), source: (p.exceptionDetails?.url ?? '').split('/').pop(), line: p.exceptionDetails?.lineNumber ?? 0 }));
    tab.on('Inspector.targetCrashed', () => { renderer = 'the page process crashed'; });
    await tab.send('Emulation.setDeviceMetricsOverride', { width: opts.tv ? 1920 : 1280, height: opts.tv ? 1080 : 720, deviceScaleFactor: 1, mobile: false });
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
        const text = await withTimeout(evalIn(tab, 'window.__soak ? JSON.stringify({ step: __soak.step, phase: __soak.phase, events: __soak.events, diag: __soak.diag || null, hops: __soak.hops, places: __soak.places, hides: __soak.hides, pauses: __soak.pauses, prompt: __soak.lastPrompt, phases: __soak.phaseCounts }) : null'), EVAL_TIMEOUT, 'page answer');
        r = text ? JSON.parse(text) : null;
      } catch (e) {
        crash = { kind: renderer ? 'renderer-crashed' : tab.closed ? 'chrome-died' : 'hang', message: renderer ?? e.message, entries: [{ kind: 'hang', message: renderer ?? e.message, source: '', line: 0 }] };
        break;
      }
      if (!r) { if (Date.now() - started > LOAD_TIMEOUT) crash = { kind: 'never-started', message: 'the bot never came up', entries: [] }; continue; }
      last = r;
      if (r.phase === 'walk') walkSeen = true;
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
    const run = { name, status: crash ? 'crash' : 'ok', minutes, steps: last.step, hops: last.hops, hides: last.hides, phases: last.phases, places: last.places, pauses: last.pauses, args: opts, replay: replayCommand(opts) };
    if (crash) {
      const screenshot = (await shot(tab, join(dir, 'crash.png'))) ? 'crash.png' : null;
      // the diagnostics record as the page shows it, once more, for the file
      let diag = null;
      try { diag = await withTimeout(evalIn(tab, 'JSON.stringify(window.__soak && window.__soak.diag)'), 5e3, 'diag read'); } catch { /* the page is gone */ }
      writeFileSync(join(dir, 'crash.json'), `${JSON.stringify({
        kind: crash.kind, message: crash.message, entries: crash.entries, seed: opts.seed, step: last.step, phase: last.phase, lastPrompt: last.prompt,
        place: opts.place, cat: opts.cat, args: opts, elapsedMin: minutes, screenshot, diagnostics: diag ? JSON.parse(diag) : null,
        replay: replayCommand(opts),
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
