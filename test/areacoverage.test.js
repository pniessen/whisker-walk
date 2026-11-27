// A new place must be wired everywhere at once: a walks counter in a fresh save, a loader,
// an entry module (the build's chunk table), a region, and a couch-play row.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { CATALOG, sanitizeSave } from '../src/progression.js';
import { AREA_LOADERS, AREA_ENTRY_MODULES } from '../src/world/areas.js';
import { REGIONS } from '../src/regions.js';
import { COOP_READY } from '../src/coop/table.js';

const IDS = [...new Set([...Object.keys(CATALOG.areas), 'den'])];
// The den is the home, not a map place: it is in no region (src/regions.js lists catalog and teleport places only).
const NO_REGION = new Set(['den']);
const fresh = sanitizeSave({});

describe('every place is wired everywhere', () => {
  for (const id of IDS) {
    it(`${id}`, () => {
      expect(Object.hasOwn(fresh.walks, id), `${id}: no walks key in a fresh save`).toBe(true);
      expect(typeof AREA_LOADERS[id], `${id}: no AREA_LOADERS entry`).toBe('function');
      const mods = AREA_ENTRY_MODULES[id];
      expect(Array.isArray(mods) && mods.length > 0, `${id}: no AREA_ENTRY_MODULES entry`).toBe(true);
      for (const m of mods) expect(existsSync(new URL('../' + m, import.meta.url)), `${id}: entry module ${m} missing`).toBe(true);
      if (!NO_REGION.has(id)) expect(REGIONS.some((r) => r.members.includes(id)), `${id}: in no region`).toBe(true);
      expect(Object.hasOwn(COOP_READY, id), `${id}: no coop/table.js key`).toBe(true);
    });
  }
});
