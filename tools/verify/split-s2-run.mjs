#!/usr/bin/env node
// Split screen S2 picture and timing driver (the real game, dev server, two stand-in pads).
// Usage: node tools/verify/split-s2-run.mjs --place neighborhood|reef --mode one|coop|split [--wire on|off]
//          [--size 1920x1080] [--png out.png] [--json out.json] [--port 5461] [--seconds 6]
// --wire on  (default) temporarily wires coop/splitsys.js into coop/splitview.js (the foreman's three-line change,
//            docs/split-screen-s2.md) and puts the file back afterwards; off measures S0's draw as merged.
// Starts its own vite server and Chrome, and stops both by pid when done. Nothing here touches the network
// beyond 127.0.0.1.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPort, connect, evaluate } from '../../scripts/record-page.mjs';
import { findChrome, chromeArgs, launchCommand } from '../../scripts/soak/chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const place = arg('place', 'neighborhood');
const mode = arg('mode', 'split');
const wire = arg('wire', 'on') === 'on';
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
const port = Number(arg('port', '5461'));
const seconds = Number(arg('seconds', '6'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEW = join(ROOT, 'src/coop/splitview.js');
const SOURCE = readFileSync(VIEW, 'utf8');
export function wired(src) {
  if (src.includes('splitsys')) return src;
  let s = src.replace("import { coop } from '../coopseam.js';", "import { coop } from '../coopseam.js';\nimport { createSplitSys, secondCatPos } from './splitsys.js';");
  s = s.replace("  let el = null;", "  const sys = createSplitSys({ renderer });\n  let el = null;");
  s = s.replace("    const cams = [camera, cam2];\n", "    const cams = [camera, cam2];\n    const cats = [session.cat.position, secondCatPos(session) ?? session.cat.position];\n    sys.beginFrame(session, cams, cats);\n");
  s = s.replace("        renderer.render(session.scene, cams[i]);\n", "        sys.beforeView(i, cams[i], cats[i], session);\n        renderer.render(session.scene, cams[i]);\n        sys.afterView();\n");
  return s;
}

const PAGE_INIT = `(() => {
  const pads = [];
  const mk = (index) => ({ id: 'Pad (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) });
  pads.push(mk(0)); pads.push(mk(1));
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => { for (const p of pads) p.timestamp = performance.now(); return pads.slice(); } });
  window.addEventListener('load', () => setTimeout(() => { for (const p of pads) { const ev = new Event('gamepadconnected'); ev.gamepad = p; window.dispatchEvent(ev); } }, 400));
  window.__pads = pads;
  window.__press = (i, b, ms = 250) => { pads[i].buttons[b].pressed = true; pads[i].buttons[b].value = 1; setTimeout(() => { pads[i].buttons[b].pressed = false; pads[i].buttons[b].value = 0; }, ms); };
  window.__stick = (i, x, y) => { pads[i].axes[0] = x; pads[i].axes[1] = y; };
  let frames = 0; const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { frames++; cb(t); });
  window.__frames = () => frames;
  window.__q = (s) => document.querySelector(s);
})();`;

const fetchOk = async (url) => { try { return (await fetch(url)).ok; } catch { return false; } };

async function main() {
  const src = wire ? wired(SOURCE) : SOURCE;
  if (src !== SOURCE) writeFileSync(VIEW, src);
  const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 's2-chrome-'));
  let chrome = null;
  try {
    for (let i = 0; i < 100 && !(await fetchOk(`http://127.0.0.1:${port}/`)); i++) await sleep(300);
    const args = chromeArgs({ profile, headed: false, w: W, h: H }).filter((a) => a !== 'about:blank');
    args.push('--disable-gpu-vsync', '--disable-frame-rate-limit', 'about:blank');
    const { cmd, args: cargs } = launchCommand(findChrome(), args);
    chrome = spawn(cmd, cargs, { stdio: 'ignore' });
    const cport = await readPort(profile);
    const target = await (await fetch(`http://127.0.0.1:${cport}/json/new?about:blank`, { method: 'PUT' })).json();
    const cdp = await connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_INIT });
    const q = [`rung=0`, `tv=1`];
    q.push(mode === 'one' ? 'coop=0' : 'coop=1');
    if (mode === 'split') q.push('split=1');
    if (place === 'reef') q.push('reef=1');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?${q.join('&')}` });
    const ev = (e) => evaluate(cdp, e);
    const until = async (expr, ms, what) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return; await sleep(300); } throw new Error(`timed out: ${what}`); };
    const vis = "(s) => { const el = document.querySelector(s); return !!el && !el.classList.contains('hidden') && !!(el.offsetWidth || el.offsetHeight); }";
    await sleep(2500);
    if (place === 'reef') {
      // ?reef=1 starts the walk itself
    } else {
      await until(`(${vis})('#btn-start')`, 60e3, 'home screen');
      await ev("document.querySelector('#btn-start').click()");
    }
    for (let i = 0; i < 120; i++) { // ready card: START on pad one
      const hud = await ev(`(${vis})('#hud')`);
      const overlay = await ev(`(${vis})('#overlay')`);
      if (hud && !overlay) break;
      if (overlay) { await ev("window.__press(0, 9)"); await ev("document.querySelector('#overlay .primary, #btn-resume')?.click()"); }
      else if (await ev(`(${vis})('#btn-start')`)) await ev("document.querySelector('#btn-start').click()");
      await sleep(700);
    }
    await sleep(3000);
    const okCard = "[...document.querySelectorAll('button')].filter((b) => /^OK$/.test(b.textContent.trim()) && b.offsetWidth).forEach((b) => b.click())";
    await ev(okCard); await sleep(800); await ev(okCard); await sleep(800);
    if (mode !== 'one') {
      await ev("window.__press(1, 0)"); // A on pad two joins
      await sleep(2500);
      await ev(arg('dir', 'fb') === 'lr' ? "window.__stick(1, 1, 0)" : "window.__stick(1, 0, 1)"); await ev(arg('dir', 'fb') === 'lr' ? "window.__stick(0, -1, 0)" : "window.__stick(0, 0, -1)"); await sleep(Number(arg('apart', '7')) * 1000); // cat one forward, cat two the other way
      await ev("window.__stick(1, 0, 0)"); await ev("window.__stick(0, 0, 0)");
    }
    await ev(okCard); await sleep(2500);
    const f0 = await ev('window.__frames()'); const t0 = Date.now();
    const readouts = [];
    while (Date.now() - t0 < seconds * 1000) { await sleep(700); readouts.push(await ev("[...document.querySelectorAll('div')].map((d) => d.textContent).find((t) => /^split ·/.test(t)) || ''")); }
    const f1 = await ev('window.__frames()'); const dt = (Date.now() - t0) / (f1 - f0);
    const png = arg('png', null);
    if (png) { const r = await cdp.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(png, Buffer.from(r.data, 'base64')); }
    const last = readouts.filter(Boolean).pop() ?? '';
    const m = /frame ([\d.]+) ms · cpu draw ([\d.]+) ms · (\d+) draws · ([\d,]+) tris/.exec(last);
    const out = { place, mode, wire, size: `${W}x${H}`, rafMs: Number(dt.toFixed(2)), readout: last, draws: m ? Number(m[3]) : null, tris: m ? Number(m[4].replace(/,/g, '')) : null, cpuDrawMs: m ? Number(m[2]) : null };
    if (arg('json', null)) writeFileSync(arg('json'), JSON.stringify(out, null, 1));
    console.log(JSON.stringify(out));
  } finally {
    try { chrome?.kill('SIGKILL'); } catch { /* gone */ }
    try { vite.kill('SIGTERM'); } catch { /* gone */ }
    await sleep(400);
    rmSync(profile, { recursive: true, force: true });
    if (readFileSync(VIEW, 'utf8') !== SOURCE) writeFileSync(VIEW, SOURCE);
  }
}
main().catch((e) => { console.error(e); try { writeFileSync(VIEW, SOURCE); } catch { /* */ } process.exit(1); });
