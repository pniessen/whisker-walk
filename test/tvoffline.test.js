import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { realBuild } from './helpers/realbuild.js';
import { startupFiles, TV_ENTRY_MODULES } from '../scripts/buildjson.mjs';

// Offline-first: a child can switch TV mode on with no network, so every file
// the TV chunk needs is in the service worker's precache list, and nothing in
// src/tv/ asks the network for anything.
describe('the TV chunk works offline', () => {
  it('its script, its shared chunks and its stylesheet are all in precache.json', async () => {
    const b = await realBuild('production');
    const entry = b.manifest[TV_ENTRY_MODULES.tv[0]];
    expect(entry, 'the tv chunk is in the manifest').toBeTruthy();
    const list = new Set(JSON.parse(String(b.files.get('precache.json').source)).files);
    const start = new Set(startupFiles(b.manifest));
    const needed = new Set([entry.file, ...(entry.css ?? [])]);
    const walk = (key, seen = new Set()) => {
      if (seen.has(key) || !b.manifest[key]) return;
      seen.add(key);
      const c = b.manifest[key];
      if (!start.has(c.file)) needed.add(c.file);
      for (const css of c.css ?? []) needed.add(css);
      for (const k of c.imports ?? []) walk(k, seen);
    };
    walk(TV_ENTRY_MODULES.tv[0]);
    expect(needed.size).toBeGreaterThanOrEqual(2); // at least the script and the stylesheet
    for (const f of needed) expect(list.has(f), `${f} is in precache.json`).toBe(true);
    // and the stylesheet really is the chunk's own, not joined to the main one
    expect((entry.css ?? []).length).toBeGreaterThan(0);
    const main = Object.values(b.manifest).find((c) => c.isEntry);
    for (const css of entry.css) expect(main.css ?? []).not.toContain(css);
  }, 300_000);

  it('src/tv/ never asks the network for anything', () => {
    const dir = new URL('../src/tv/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\bimport\s*\(|EventSource/);
      expect(src, f).not.toMatch(/https?:\/\//);
    }
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      expect(readFileSync(new URL(f, dir), 'utf8'), f).not.toMatch(/url\(\s*['"]?https?:|@import/);
    }
  });
});
