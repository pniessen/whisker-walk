import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildCat } from '../src/cat/model.js';
import { CATALOG } from '../src/progression.js';
import { animateCat } from '../src/cat/animator.js';
import { LEGACY_BODY } from '../src/cat/torso.js';
import { PRESETS, STATES, STANDING, DRESSED, poseMeasure, meshCount } from './helpers/catfingerprint.js';

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

// R1/R2 on the reshaped body, measured against the old rig's baseline.
// The body offsets animator.js pose() gives these states (stretch bodyY + 0.04, pounce + 0.02).
const OLD_BODY_OFFSET = { stretch: 0.04, pounce: 0.02 };
const rise = (b) => buildCat(b).userData.base.legLift - BASELINE[b].legLift;
describe('poses on the new body (R1, R2)', () => {
  for (const b of PRESETS) for (const s of STATES) {
    it(`${b} ${s}`, () => {
      const now = poseMeasure(buildCat(b), s), was = BASELINE[b][s];
      expect(now.min).toBeGreaterThanOrEqual(-0.01);                         // R2: never in the ground
      expect(poseMeasure(buildCat(b, DRESSED), s).min).toBeGreaterThanOrEqual(-0.01);
      if (OLD_BODY_OFFSET[s] !== undefined) {
        // The old baseline's torsoMin here was its separate belly, which these poses never moved:
        // so R1 is measured on the body the old pose actually posed (old posed y + the added lift).
        const cat = buildCat(b); animateCat(cat, s, 1.3, 0, false);
        const oldY = LEGACY_BODY.CENTRE[1] + BASELINE[b].legLift + OLD_BODY_OFFSET[s];
        expect(Math.abs(cat.userData.parts.body.position.y - (oldY + rise(b)))).toBeLessThanOrEqual(0.02);
      } else if (STANDING.includes(s)) {
        expect(Math.abs(now.torsoMin - (was.torsoMin + rise(b)))).toBeLessThanOrEqual(0.02); // R1
      } else if (s === 'requestPet' || s === 'perch') {
        // polish-sit (2026-11-02): the upright sit rests the nose-up torso's
        // rump ON the ground (0.0002 above it, torso.js POSE_FIT), where the
        // old rig's nose-down sit held its belly 2.46 cm up, so the band
        // below (no lower than the old one less 1 cm) no longer holds: the rump
        // is on the ground, never in it, never hovering over it.
        expect(now.torsoMin).toBeGreaterThanOrEqual(-0.01);
        expect(now.torsoMin).toBeLessThanOrEqual(0.03);
      } else {
        expect(now.torsoMin).toBeGreaterThanOrEqual(Math.max(was.torsoMin - 0.01, -0.01));
        expect(now.torsoMin).toBeLessThanOrEqual(Math.max(was.torsoMin, 0) + 0.02);
      }
    });
  }
});
