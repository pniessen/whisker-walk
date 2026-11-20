#!/usr/bin/env node
// Headless pictures and films of a picture page (verify-traversal.html).
// Usage:
//   node scripts/record-page.mjs --url <url> --out <dir> (--shots a,b | --tour <name>)
//     [--size 960x540] [--fps 30] [--max-frames 2700] [--chrome <path>]
//
// It starts Chrome headless with its own throwaway profile, opens the page
// over the DevTools protocol (the global WebSocket; no packages) and waits for
// window.__ready. Then:
//   --shots a,b   for each name, window.__shot(name), then a PNG of the view
//                 to <out>/<name>.png;
//   --tour name   window.__tour(name), then window.__frame() (one fixed step
//                 and a render) and a JPEG (q 85) of the view to
//                 <out>/<name>-frames/f00001.jpg, ... until it says done (or
//                 --max-frames), then ffmpeg (ffmpegArgs below) makes
//                 <out>/<name>.mp4 at --fps.
// Chrome is muted and always killed at the end. Nothing here touches the
// network beyond the page's own URL and Chrome's local DevTools port.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const FFMPEG = '/opt/homebrew/bin/ffmpeg';
const USAGE = 'usage: record-page.mjs --url <url> --out <dir> (--shots a,b | --tour <name>) [--size 960x540] [--fps 30] [--max-frames 2700] [--chrome <path>]';
const READY_TIMEOUT = 60e3; // ms
const PORT_TIMEOUT = 20e3; // ms

export function parseArgs(argv) {
  const opts = { url: null, out: null, shots: [], tour: null, size: { w: 960, h: 540 }, fps: 30, maxFrames: 2700, chrome: DEFAULT_CHROME };
  const value = (i, name) => {
    const v = argv[i];
    if (v === undefined) throw new Error(`${name} needs a value\n${USAGE}`);
    return v;
  };
  const count = (v, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number above 0, not "${v}"`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') opts.url = value(++i, a);
    else if (a === '--out') opts.out = value(++i, a);
    else if (a === '--shots') opts.shots = value(++i, a).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--tour') opts.tour = value(++i, a);
    else if (a === '--size') {
      const m = /^(\d+)x(\d+)$/.exec(value(++i, a));
      if (!m) throw new Error(`--size is WxH, such as 960x540, not "${argv[i]}"`);
      opts.size = { w: count(m[1], a), h: count(m[2], a) };
    } else if (a === '--fps') opts.fps = count(value(++i, a), a);
    else if (a === '--max-frames') opts.maxFrames = count(value(++i, a), a);
    else if (a === '--chrome') opts.chrome = value(++i, a);
    else throw new Error(`unexpected argument: ${a}\n${USAGE}`);
  }
  if (!opts.url || !opts.out) throw new Error(`--url and --out are both needed\n${USAGE}`);
  if (!opts.shots.length && !opts.tour) throw new Error(`give --shots or --tour\n${USAGE}`);
  if (opts.shots.length && opts.tour) throw new Error(`give --shots or --tour, not both\n${USAGE}`);
  return opts;
}

export function ffmpegArgs(framesDir, fps, outFile) {
  return ['-y', '-framerate', String(fps), '-i', join(framesDir, 'f%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', outFile];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome writes its DevTools port as the first line of this file once it is listening.
async function readPort(profile) {
  const file = join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + PORT_TIMEOUT;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const port = Number(readFileSync(file, 'utf8').split('\n')[0]);
      if (port > 0) return port;
    }
    await sleep(100);
  }
  throw new Error('Chrome did not open its DevTools port');
}

// One DevTools session over a WebSocket: send(method, params) → result.
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let nextId = 1;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.method === 'Runtime.exceptionThrown') console.error('page error:', msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
        console.error(`page ${msg.params.type}:`, msg.params.args.map((x) => x.value ?? x.description).join(' '));
      }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    });
    ws.addEventListener('error', () => reject(new Error(`could not reach ${wsUrl}`)));
    ws.addEventListener('close', () => {
      for (const p of pending.values()) p.reject(new Error('DevTools connection closed'));
      pending.clear();
    });
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej, method }));
      },
      close() { ws.close(); },
    }));
  });
}

// Evaluates `expression` in the page (awaiting a promise) and returns its value.
async function evaluate(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

async function capture(cdp, { w, h }, format, quality) {
  const params = { format, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } };
  if (format === 'jpeg') params.quality = quality;
  const r = await cdp.send('Page.captureScreenshot', params);
  return Buffer.from(r.data, 'base64');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { w, h } = opts.size;
  mkdirSync(opts.out, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'record-page-'));
  const chrome = spawn(opts.chrome, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    '--ignore-gpu-blocklist', '--mute-audio', '--no-first-run', '--no-default-browser-check', 'about:blank',
  ], { stdio: 'ignore' });
  let cdp = null;
  try {
    const port = await readPort(profile);
    const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(opts.url)}`, { method: 'PUT' });
    if (!res.ok) throw new Error(`could not open the page: HTTP ${res.status}`);
    const target = await res.json();
    cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const deadline = Date.now() + READY_TIMEOUT;
    while (!(await evaluate(cdp, 'window.__ready === true'))) {
      if (Date.now() > deadline) throw new Error('the page never set window.__ready');
      await sleep(200);
    }
    // The URL goes to /json/new escaped: unescaped, its own '&' parameters
    // would be read as /json/new's and the page would open without them.
    const href = await evaluate(cdp, 'location.href');
    if (href !== new URL(opts.url).href) throw new Error(`the page opened at ${href}, not ${opts.url}`);

    for (const name of opts.shots) {
      const got = await evaluate(cdp, `window.__shot(${JSON.stringify(name)})`);
      if (got !== name) throw new Error(`__shot(${name}) answered ${JSON.stringify(got)}`);
      const file = join(opts.out, `${name}.png`);
      writeFileSync(file, await capture(cdp, opts.size, 'png'));
      console.log(`shot ${file}`);
    }

    if (opts.tour) {
      const framesDir = join(opts.out, `${opts.tour}-frames`);
      rmSync(framesDir, { recursive: true, force: true });
      mkdirSync(framesDir, { recursive: true });
      await evaluate(cdp, `window.__tour(${JSON.stringify(opts.tour)})`);
      let n = 0;
      let caption = null;
      for (;;) {
        const r = await evaluate(cdp, 'window.__frame()');
        n++;
        writeFileSync(join(framesDir, `f${String(n).padStart(5, '0')}.jpg`), await capture(cdp, opts.size, 'jpeg', 85));
        if (r.caption !== caption) {
          caption = r.caption;
          console.log(`frame ${n} (${(n / opts.fps).toFixed(1)} s): ${caption ?? ''}`);
        }
        if (r.done) break;
        if (n >= opts.maxFrames) {
          console.error(`stopped at --max-frames ${opts.maxFrames} before the tour was done`);
          break;
        }
      }
      const outFile = join(opts.out, `${opts.tour}.mp4`);
      const ff = spawnSync(FFMPEG, ffmpegArgs(framesDir, opts.fps, outFile), { stdio: ['ignore', 'ignore', 'pipe'] });
      if (ff.status !== 0) throw new Error(`ffmpeg failed: ${ff.stderr?.toString().slice(-800)}`);
      console.log(`film ${outFile}: ${readdirSync(framesDir).length} frames, ${(n / opts.fps).toFixed(1)} s`);
    }
  } finally {
    cdp?.close();
    chrome.kill('SIGKILL');
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
