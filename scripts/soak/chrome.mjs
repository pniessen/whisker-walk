// Chrome for the soak: where it lives, how it is started (low priority, one at a
// time, a throwaway profile) and one DevTools session with events.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPort } from '../record-page.mjs';

export const CHROME_PATHS = Object.freeze({
  darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  linux: '/usr/bin/google-chrome',
});

export function findChrome(override, platform = process.platform, exists = existsSync) {
  if (override) return override;
  const p = CHROME_PATHS[platform];
  if (p && exists(p)) return p;
  if (platform === 'linux') for (const alt of ['/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) if (exists(alt)) return alt;
  throw new Error(`no Chrome found for ${platform}; pass --chrome <path>`);
}

// Chrome flags. Headless by default; --headed shows a window. A software GL
// path keeps a machine with no GPU (the spare Ubuntu box) able to draw.
export function chromeArgs({ profile, headed, platform = process.platform, w = 1280, h = 720 }) {
  const a = ['--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${w},${h}`, '--ignore-gpu-blocklist', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'];
  if (!headed) a.push('--headless=new');
  if (platform === 'linux') a.push('--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  a.push('about:blank');
  return a;
}

// nice(1) where there is one, so a soak never fights the person using the machine.
export function launchCommand(chrome, args, platform = process.platform) {
  if (platform === 'win32') return { cmd: chrome, args };
  return { cmd: 'nice', args: ['-n', '15', chrome, ...args] };
}

export async function launchChrome({ chrome, headed }) {
  const profile = mkdtempSync(join(tmpdir(), 'soak-chrome-'));
  const { cmd, args } = launchCommand(chrome, chromeArgs({ profile, headed }));
  const child = spawn(cmd, args, { stdio: 'ignore' });
  let port;
  try {
    port = await readPort(profile);
  } catch (e) {
    try { child.kill('SIGKILL'); } catch { /* gone */ }
    rmSync(profile, { recursive: true, force: true });
    throw e;
  }
  return {
    port,
    pid: child.pid,
    async stop() {
      try { child.kill('SIGKILL'); } catch { /* gone */ }
      await new Promise((r) => setTimeout(r, 300));
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

// One tab: { send, on(method, fn), close }.
export async function openTab(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  if (!res.ok) throw new Error(`could not open the page: HTTP ${res.status}`);
  const target = await res.json();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    const handlers = new Map();
    let nextId = 1;
    let closed = false;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.method) { for (const fn of handlers.get(msg.method) ?? []) try { fn(msg.params); } catch { /* a handler must not kill the session */ } return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result);
    });
    ws.addEventListener('error', () => reject(new Error('could not reach the tab')));
    ws.addEventListener('close', () => {
      closed = true;
      for (const p of pending.values()) p.reject(new Error('DevTools connection closed'));
      pending.clear();
    });
    ws.addEventListener('open', () => resolve({
      get closed() { return closed; },
      send(method, params = {}) {
        if (closed) return Promise.reject(new Error('DevTools connection closed'));
        const id = nextId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej, method }));
      },
      on(method, fn) { handlers.set(method, [...(handlers.get(method) ?? []), fn]); },
      close() { ws.close(); },
    }));
  });
}

export async function evalIn(tab, expression) {
  const r = await tab.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}
