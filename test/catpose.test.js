import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildCat } from '../src/cat/model.js';
import { CATALOG } from '../src/progression.js';
import { PRESETS, STATES, poseMeasure, meshCount } from './helpers/catfingerprint.js';

// The old rig's pose heights and accessory mesh costs, recorded once before the reshape.
// Record with RECORD_BASELINE=1 (write-once: only if the files are missing).
const BASE_FILE = new URL('./fixtures/catpose-baseline.json', import.meta.url);
const DELTA_FILE = new URL('./fixtures/accessory-mesh-delta.json', import.meta.url);

if (process.env.RECORD_BASELINE) {
  if (!fs.existsSync(BASE_FILE)) {
    const out = {};
    for (const b of PRESETS) {
      out[b] = { legLift: buildCat(b).userData.base.legLift ?? 0 };
      for (const s of STATES) out[b][s] = poseMeasure(buildCat(b), s);
    }
    fs.writeFileSync(BASE_FILE, JSON.stringify(out, null, 1));
  }
  if (!fs.existsSync(DELTA_FILE)) {
    const bare = { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null };
    const base = meshCount(buildCat('tabby', bare));
    const out = {};
    for (const [id, a] of Object.entries(CATALOG.accessories)) out[id] = meshCount(buildCat('tabby', { ...bare, [a.slot]: id })) - base;
    fs.writeFileSync(DELTA_FILE, JSON.stringify(out, null, 1));
  }
}
const BASELINE = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
const ACCESSORY_DELTA = JSON.parse(fs.readFileSync(DELTA_FILE, 'utf8'));

describe('old-rig pose baseline', () => {
  it('covers every preset, state and accessory', () => {
    for (const b of PRESETS) {
      expect(typeof BASELINE[b].legLift).toBe('number');
      for (const s of STATES) expect(BASELINE[b][s].torsoMin).toBeGreaterThanOrEqual(BASELINE[b][s].min);
    }
    expect(Object.keys(ACCESSORY_DELTA)).toEqual(Object.keys(CATALOG.accessories));
  });
  it('only digit has a leg lift today', () => {
    for (const b of PRESETS) expect(BASELINE[b].legLift).toBeCloseTo(b === 'digit' ? 0.091 : 0, 6);
  });
});
