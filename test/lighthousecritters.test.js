import { describe, it, expect } from 'vitest';
import { createCritters, CRIT_TRIS, CRIT_TRIS_LOW, doorGlow, DOOR } from '../src/world/lighthousecritters.js';
import { hourLook, hourNow } from '../src/world/lighthouseday.js';
import { createLighthouseSound, BEDS } from '../src/world/lighthousesound.js';
import { seasonData } from '../src/world/lighthouseseason.js';

const FLAT = [1, 0];
function run(c, secs, cat, t0 = 0) {
  let n = 0;
  for (let i = 0; i < secs * 30; i++) { n = 0; c.update(t0 + i / 30, 1 / 30, cat, FLAT, () => { n++; return true; }); }
  return n;
}

describe('lighthouse little lives (pass 5)', () => {
  it('fit their pooled triangles, high and low', () => {
    expect(run(createCritters({}), 3, { x: 14, z: 36, set: true })).toBeLessThanOrEqual(CRIT_TRIS);
    expect(run(createCritters({ low: true }), 3, { x: 14, z: 36, set: true })).toBeLessThanOrEqual(CRIT_TRIS_LOW);
  });
  it('crabs run for their holes when she comes near, vanish, and come back when she has gone', () => {
    const c = createCritters({});
    run(c, 2, { x: 14, z: 40, set: true });
    run(c, 4, { x: c.crabs[0].hx, z: c.crabs[0].hz + 2, set: true }, 2);
    expect(c.crabs.some((k) => k.mode === 'gone')).toBe(true);
    run(c, 5, { x: 14, z: 44, set: true }, 6); // away: all out again
    expect(c.crabs.every((k) => k.mode === 'out')).toBe(true);
  });
  it('sandpipers fly up when she nears', () => {
    const c = createCritters({});
    run(c, 1, { x: 14, z: 36, set: true });
    const b = c.pipers[0];
    run(c, 1, { x: b.x - 2, z: b.z, set: true }, 1);
    expect(b.fly).toBeGreaterThanOrEqual(0);
  });
  it('reduced motion freezes them in place', () => {
    const c = createCritters({ still: true });
    const snap = () => { const o = []; c.update(7, 0, { x: 14, z: 36, set: true }, FLAT, (a) => { o.push(a.join()); return true; }); return o.join('|'); };
    const a = snap();
    c.update(9, 1 / 30, { x: c.crabs[0].x, z: c.crabs[0].z, set: true }, FLAT, () => true);
    expect(snap()).toBe(a);
  });
  it('the tower door glows only as she nears it', () => {
    expect(doorGlow({ x: DOOR.x + 30, z: DOOR.z, set: true })).toBe(0);
    expect(doorGlow({ x: DOOR.x + 2, z: DOOR.z + 2, set: true })).toBeGreaterThan(0.5);
    expect(doorGlow(null)).toBe(0);
  });
});

describe('lighthouse daily rhythm', () => {
  const sd = seasonData('autumn');
  it('golden hour is the season sky, night is dark and cool, noon brighter and bluer', () => {
    const g = hourLook(18.5, sd); const n = hourLook(1, sd); const d = hourLook(12, sd); const dawn = hourLook(6.5, sd);
    expect(g.sky.top).toBe(sd.sky.top);
    expect(g.tone).toEqual([1, 1, 1]);
    expect(n.night).toBe(1);
    expect(n.light.sunIntensity).toBeLessThan(g.light.sunIntensity);
    expect(d.light.sunIntensity).toBeGreaterThan(g.light.sunIntensity);
    expect(d.tone[2]).toBeGreaterThan(d.tone[0]);
    expect(dawn.sky.horizon).not.toBe(g.sky.horizon);
    expect(hourNow(new Date(2026, 0, 1, 6, 30))).toBe(6.5);
  });
});

describe('lighthouse sound beds', () => {
  it('start nothing while muted or without a context, and follow her once running', () => {
    const made = [];
    const mk = (muted) => ({
      isMuted: () => muted, playBuffer() {}, setVolume() {},
      getMaster: () => ({}),
      getContext: () => {
        made.push('ctx');
        const node = () => ({ connect: (x) => x ?? {}, disconnect() {}, start() {}, stop() {}, gain: { value: 0, setTargetAtTime: (v) => made.push(v) }, frequency: { value: 0 }, Q: { value: 0 } });
        return { state: 'running', sampleRate: 100, currentTime: 0, createBuffer: () => ({ getChannelData: () => new Float32Array(200) }), createBufferSource: node, createBiquadFilter: node, createGain: node, createOscillator: node };
      },
    });
    createLighthouseSound(mk(true)).beds(1, { x: 30, y: 0, z: 30 });
    expect(made).toEqual([]);
    const s = createLighthouseSound(mk(false));
    s.beds(1, { x: 30, y: 0, z: 30 });
    expect(made.filter((v) => typeof v === 'number').length).toBe(3);
    expect(Math.max(...made.filter((v) => typeof v === 'number'))).toBeLessThanOrEqual(BEDS.surf);
    createLighthouseSound(null).beds(1, { x: 0, y: 0, z: 0 });
    s.dispose();
  });
});
