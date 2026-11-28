// Headless frame-stat reading of the built game at forced rungs: node tools/verify/rung-bottom-pics/measure.mjs <worktree> <place> 5,7 <shot dir>
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const ROOT = process.argv[2];
const { findChrome, launchChrome, openTab, evalIn } = await import(`${ROOT}/scripts/soak/chrome.mjs`);
const { startServer } = await import(`${ROOT}/scripts/soak/server.mjs`);
const { injectedSource } = await import(`${ROOT}/scripts/soak.mjs`);
const { parseSoakArgs } = await import(`${ROOT}/scripts/soak/args.mjs`);
const [place, rungs, shotDir] = [process.argv[3], process.argv[4].split(','), process.argv[5]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startServer(resolve(ROOT, 'dist'));
const out = {};
for (const rung of rungs) {
  const chrome = await launchChrome({ chrome: findChrome(null), headed: false });
  try {
    const tab = await openTab(chrome.port, 'about:blank');
    await tab.send('Runtime.enable'); await tab.send('Page.enable');
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 2, mobile: false });
    const opts = parseSoakArgs(['--place', place, '--cat', 'tabby', '--seed', '3']);
    await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: injectedSource(opts) });
    await tab.send('Page.navigate', { url: `${srv.url}?perf=1&tv=0&coop=0&rung=${rung}` });
    let phase = '';
    for (let i = 0; i < 90; i++) { await sleep(1000); try { phase = JSON.parse(await evalIn(tab, 'JSON.stringify(window.__soak?.phase)')); } catch {} if (phase === 'walk') break; }
    const samples = [];
    await sleep(8000);
    for (let i = 0; i < 6; i++) { await sleep(2500); try { samples.push(await evalIn(tab, "document.getElementById('perf-readout')?.textContent ?? ''")); } catch (e) { samples.push('ERR ' + e.message); } }
    if (shotDir) { const r = await tab.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shotDir}/${place}-rung${rung}.png`, Buffer.from(r.data, 'base64')); }
    out[rung] = { phase, last: samples[samples.length - 1], all: samples };
    tab.close();
  } finally { await chrome.stop(); }
}
await srv.close();
console.log(JSON.stringify(out, null, 1));
