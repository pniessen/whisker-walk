import { describe, it, expect } from 'vitest';
import { realBuild } from './helpers/realbuild.js';
import { AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { lazyProblems } from '../scripts/buildjson.mjs';
import { IOS_MODE } from '../vite.config.js';

// Builds the real bundles in memory (write: false) and reads what ships.
// The iOS app serves the game from its own bundle through a custom URL
// scheme, where a service worker can only fail and the game is offline
// already, so the app build must not register sw.js; the website build must
// keep doing so. The check is written inline in src/main.js rather than in a
// helper so the website bundle stays byte-for-byte what it was.
async function shippedCode(mode) {
  const b = await realBuild(mode);
  return b.chunks.map((o) => o.code).join('\n');
}

describe('service worker in the shipped bundles', () => {
  it('the website build registers sw.js', async () => {
    expect(await shippedCode('production')).toMatch(/serviceWorker\.register/);
  }, 300_000);

  it('the app build never registers a service worker', async () => {
    expect(await shippedCode(IOS_MODE)).not.toMatch(/serviceWorker\.register/);
  }, 300_000);
});

describe('places in the app bundle', () => {
  it('ships a dynamic chunk for every place, and no precache list', async () => {
    const b = await realBuild(IOS_MODE);
    expect(lazyProblems(b.manifest)).toEqual([]);
    for (const [id, mods] of Object.entries(AREA_ENTRY_MODULES)) {
      for (const m of mods) expect(b.manifest[m]?.isDynamicEntry, `${id}: ${m}`).toBe(true);
    }
    expect(b.files.has('precache.json')).toBe(false);
  }, 300_000);
});
