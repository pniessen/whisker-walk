import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { mulberry32 } from '../src/rng.js';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument({ measureText: 10, pointerLock: true });

const { createRoofsLife, stirSleeper, stirLift, newSleeper, STIR } = await import('../src/roofslife.js');
const { ROOFS_SLEEPERS, roofsArea, ROOFS_TRAVERSAL, LEVELS } = await import('../src/world/roofsplan.js');
const { bus } = await import('../src/events.js');
const { phrase } = await import('../src/clanphrases.js');
const { yardWalk } = await import('./helpers/traversalwalk.js');
const { BASE_ABILITIES } = await import('../src/traversal.js');

// A fake clock: the machine only ever sees the dt it is given.
function tick(s, seconds, near, dt = 0.1) {
  const out = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) out.push(stirSleeper(s, dt, near));
  return out;
}

describe('a sleeper stirs (pure machine, fake clock)', () => {
  it('sleeps while she is away, and a short pass does not wake it', () => {
    const s = newSleeper();
    expect(tick(s, 30, false).every((e) => e === null)).toBe(true);
    expect(s.phase).toBe('asleep');
    tick(s, STIR.sniff * 0.5, true);
    tick(s, 5, false); // gone again: the sniff drains away
    expect(s.phase).toBe('asleep');
    expect(s.near).toBe(0);
  });

  it('a sniff wakes it once, it stirs, dozes, then sleeps again and can be stirred again', () => {
    const s = newSleeper();
    const events = tick(s, STIR.sniff + 0.2, true);
    expect(events.filter((e) => e === 'stir')).toHaveLength(1);
    expect(s.phase).toBe('stirring');
    expect(tick(s, STIR.stir + 0.3, true).includes('stir')).toBe(false); // standing there does not re-stir it
    expect(s.phase).toBe('dozing');
    expect(stirLift(s)).toBe(0);
    expect(tick(s, STIR.doze - 1, true).includes('stir')).toBe(false); // dozing: it will not stir
    tick(s, 1.5, false);
    expect(s.phase).toBe('asleep');
    expect(tick(s, STIR.sniff + 0.2, true)).toContain('stir');
  });

  it('the lift swells from 0 to 1 and back, never outside 0..1', () => {
    const s = newSleeper();
    tick(s, STIR.sniff + 0.1, true);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      stirSleeper(s, 0.1, true);
      const l = stirLift(s);
      expect(l).toBeGreaterThanOrEqual(0);
      expect(l).toBeLessThanOrEqual(1);
      peak = Math.max(peak, l);
    }
    expect(peak).toBeGreaterThan(0.95);
  });
});

function life(reducedMotion, log) {
  const sleepers = ROOFS_SLEEPERS.map((s) => { const o = new THREE.Object3D(); o.position.set(s.x, s.y, s.z); o.rotation.y = s.yaw; return o; });
  const bg = { isTexture: true, dispose: vi.fn() };
  const area = { skySunset: { top: 1, horizon: 2 }, skyDusk: { top: 3, horizon: 4 }, sleepers };
  const l = createRoofsLife(area)({ scene: { background: bg, fog: null }, sun: { intensity: 1 }, fill: { intensity: 1 }, reducedMotion, log });
  return { sleepers, l };
}
const nose = (s) => ({ x: s.x + 0.8, y: s.y, z: s.z + 0.4 });

describe('the sleepers in the Rooftops life', () => {
  it('say one line the first time, in the discovery bus, and nothing the second time (both word sets)', () => {
    const marks = new Map();
    const log = { count: (k) => marks.get(k) ?? 0, mark: (k) => marks.set(k, 1) };
    const heard = [];
    const off = bus.on('discovery', (e) => heard.push(e));
    const { sleepers, l } = life(false, log);
    const at = nose(ROOFS_SLEEPERS[0]);
    for (let i = 0; i < 300; i++) l.update(0.05, 0, at);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ points: 0, label: phrase('roofs.sleeper.stir') });
    expect(heard[0].label).toMatch(/house cat/);
    expect(marks.get('roofs-sleeper-ginger')).toBe(1);
    // it stirred, so it moved a little at some point, and is back where it was
    l.dispose();
    expect(sleepers[0].rotation.y).toBe(ROOFS_SLEEPERS[0].yaw);
    off?.();
  });

  it('it turns and lifts when stirring; under reduced motion it still says its line but nothing moves', () => {
    for (const reduced of [false, true]) {
      const marks = new Set();
      const log = { count: (k) => (marks.has(k) ? 1 : 0), mark: (k) => marks.add(k) };
      const { sleepers, l } = life(reduced, log);
      const base = ROOFS_SLEEPERS[1].yaw;
      let moved = 0;
      const at = nose(ROOFS_SLEEPERS[1]);
      for (let i = 0; i < 100; i++) {
        l.update(0.05, 0, at);
        moved = Math.max(moved, Math.abs(sleepers[1].rotation.y - base));
      }
      expect(marks.has('roofs-sleeper-greyWhite')).toBe(true);
      if (reduced) expect(moved).toBe(0);
      else expect(moved).toBeGreaterThan(0.05);
    }
  });

  it('far away, or on another roof, it never stirs', () => {
    const marks = new Set();
    const log = { count: (k) => (marks.has(k) ? 1 : 0), mark: (k) => marks.add(k) };
    const { l } = life(false, log);
    const s = ROOFS_SLEEPERS[0];
    for (let i = 0; i < 400; i++) l.update(0.05, 0, i % 2 ? { x: s.x, y: s.y + 5, z: s.z } : { x: s.x + 6, y: s.y, z: s.z });
    l.update(0.05, 0, null);
    expect(marks.size).toBe(0);
  });
});

// The tank-to-loft beam (pipe-1) is a rail: once she is on it only the push
// along it counts, so stick wander cannot take her off. What a pad costs is the
// mount (test/roofsbeampad.test.js) and a graze off an end, both forgiven.
describe('pipe-1 crossed end to end with a wandering pad stick', () => {
  const pipe = ROOFS_TRAVERSAL.crossings.find((c) => c.id === 'pipe-1');
  const A = pipe.points[0];
  const B = pipe.points[pipe.points.length - 1];

  function cross(seed, sigma, back) {
    const rng = mulberry32(seed);
    const gauss = () => Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());
    const area = roofsArea();
    const [from, to] = back ? [B, A] : [A, B];
    const w = yardWalk({ area, at: back ? [-33, -41.6] : [-26, -33], face: [0, -1], colliders: area.colliders, abilities: () => BASE_ABILITIES });
    const dt = 1 / 60;
    const k = Math.exp(-dt / 0.3);
    let ang = 0;
    let mounted = false;
    let minY = Infinity;
    let off = false;
    for (let i = 0; i < 60 * 30; i++) {
      const p = w.cat.position;
      ang = ang * k + sigma * Math.sqrt(1 - k * k) * gauss();
      const g = mounted || !back ? { x: to.x + (to.x - from.x) * 0.3, z: to.z + (to.z - from.z) * 0.3 } : { x: from.x, z: from.z };
      let dx = g.x - p.x;
      let dz = g.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const mag = Math.min(1, 0.75 + 0.25 * rng());
      w.push((dx * c - dz * s) * mag, (dx * s + dz * c) * mag);
      w.frame(dt);
      if (w.live.crossing) mounted = true;
      else if (mounted && Math.hypot(p.x - to.x, p.z - to.z) > 1.2) off = true; // stepped back off an end (a firm push the wrong way): not a fall
      if (mounted) minY = Math.min(minY, p.y);
      if (mounted && !w.live.crossing && Math.hypot(p.x - to.x, p.z - to.z) < 1.2) return { done: true, off, minY };
    }
    return { done: false, off, minY };
  }

  it('over 200 seeded pad walkers (wander 0.4 and a shaky 0.7 rad) none falls, and 95% get across', () => {
    for (const sigma of [0.4, 0.7]) {
      let done = 0;
      let off = 0;
      for (let seed = 1; seed <= 100; seed++) {
        const r = cross(seed, sigma, false);
        if (r.off) off++;
        if (r.minY !== Infinity) expect(r.minY).toBeGreaterThan(LEVELS.TANK - 1e-6);
        if (r.done) done++;
      }
      expect(done).toBeGreaterThanOrEqual(95);
      expect(off).toBeLessThanOrEqual(5); // a firm push back off the near end, now and then, and she is on the lid
    }
  });
});
