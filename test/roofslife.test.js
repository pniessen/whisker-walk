import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// The Rooftops' evening and its bus (src/roofslife.js), headless: the sky is
// spied on, so a test can count every time it is rebuilt.
const made = [];
vi.mock('../src/render/sky.js', async (importOriginal) => {
  const real = await importOriginal();
  return {
    ...real,
    skyBackground: vi.fn((top, horizon) => {
      const tex = { isTexture: true, top, horizon, dispose: vi.fn() };
      made.push(tex);
      return tex;
    }),
  };
});

const { skyBackground } = await import('../src/render/sky.js');
const { createRoofsLife, eveningAt, busAt, EVENING_RAMP, EVENING_STEPS } = await import('../src/roofslife.js');
const { BUS, ROOFS_SHOT_T, ROOFS_SHOTS } = await import('../src/world/roofsplan.js');

const SUNSET = { top: 0x4a5a8c, horizon: 0xe89a6a };
const DUSK = { top: 0x1f2a52, horizon: 0x8a5a6a };

function walk() {
  const bus = new THREE.Object3D();
  const area = { skySunset: { ...SUNSET }, skyDusk: { ...DUSK }, bus };
  // what applyDusk leaves: the dusk sky, its fog, the dusk sun and fill
  const dusk = { isTexture: true, dispose: vi.fn() };
  const scene = { background: dusk, fog: new THREE.Fog(DUSK.horizon, 40, 140) };
  const sun = { intensity: 0.8 };
  const fill = { intensity: 0.5 };
  const life = createRoofsLife(area)({ scene, sun, fill });
  return { area, bus, scene, sun, fill, life, dusk };
}
// Runs the life on to walk second `to`, in frames of `dt`.
function run(w, to, dt = 1 / 30) {
  let t = w.t ?? 0;
  while (t < to - 1e-9) {
    const d = Math.min(dt, to - t);
    t += d;
    w.life.update(d, 1000 + t); // main.js's t is the app's clock, not the walk's
  }
  w.t = t;
}

beforeEach(() => {
  skyBackground.mockClear();
  made.length = 0;
});

describe('the Rooftops’ evening', () => {
  it('the sky starts at sunset and is dusk by 240 s, rebuilt six times', () => {
    expect(EVENING_RAMP).toBe(240);
    expect(EVENING_STEPS).toBe(6);
    expect(eveningAt(0)).toBe(0);
    expect(eveningAt(EVENING_RAMP)).toBe(1);
    expect(eveningAt(EVENING_RAMP / 2)).toBeCloseTo(0.5, 6);
    const w = walk();
    const { dusk } = w;
    // at the start: the sunset sky, its fog, a brighter sun and fill than dusk's
    expect(skyBackground).toHaveBeenCalledTimes(1);
    expect(skyBackground).toHaveBeenLastCalledWith(SUNSET.top, SUNSET.horizon);
    expect(w.scene.background).toBe(made[0]);
    expect(dusk.dispose).toHaveBeenCalledTimes(1); // the old sky is let go
    expect(w.scene.fog.color.getHex()).toBe(SUNSET.horizon);
    expect(w.sun.intensity).toBeGreaterThan(0.8);
    expect(w.fill.intensity).toBeGreaterThan(0.5);
    const fog = w.scene.fog;
    run(w, EVENING_RAMP + 0.01); // by 240 s (a sum of frames lands a hair either side of it)
    // six rebuilds, the last the dusk sky; each old one disposed
    expect(skyBackground).toHaveBeenCalledTimes(1 + EVENING_STEPS);
    expect(skyBackground).toHaveBeenLastCalledWith(DUSK.top, DUSK.horizon);
    for (const tex of made.slice(0, -1)) expect(tex.dispose).toHaveBeenCalledTimes(1);
    expect(made.at(-1).dispose).not.toHaveBeenCalled();
    expect(w.scene.background).toBe(made.at(-1));
    expect(w.scene.fog).toBe(fog);
    expect(w.scene.fog.color.getHex()).toBe(DUSK.horizon);
    expect(w.sun.intensity).toBeCloseTo(0.8, 6);
    expect(w.fill.intensity).toBeCloseTo(0.5, 6);
    // and it stays dusk
    run(w, EVENING_RAMP + 120);
    expect(skyBackground).toHaveBeenCalledTimes(1 + EVENING_STEPS);
  });

  it('the bus runs the same at the same time', () => {
    expect(BUS).toMatchObject({ x0: -60, x1: 60, run: 14, every: 45 });
    const at = (t) => busAt(t, {});
    expect(at(0).x).toBeCloseTo(-60, 6);
    expect(at(7).x).toBeCloseTo(0, 6);
    expect(at(13.999).x).toBeCloseTo(60, 1);
    expect(at(7).visible).toBe(true);
    expect(at(20).visible).toBe(false); // hidden between runs
    expect(at(44).visible).toBe(false);
    expect(at(45 + 7)).toEqual(at(7)); // every 45 s
    expect(at(10 * 45 + 3.5)).toEqual(at(3.5));
    // `out` is filled in place
    const out = {};
    expect(busAt(7, out)).toBe(out);
    // two walks, run in different frames, put the bus in the same place at the same walk time
    const a = walk();
    const b = walk();
    run(a, 52.25, 1 / 60);
    run(b, 52.25, 1 / 24);
    expect(a.bus.position.x).toBeCloseTo(b.bus.position.x, 6);
    expect(a.bus.position.x).toBeCloseTo(busAt(52.25, {}).x, 6);
    expect(a.bus.visible).toBe(b.bus.visible);
    expect(a.bus.position.z).toBe(BUS.z);
  });

  it('update allocates nothing between sky steps', () => {
    const w = walk();
    run(w, 1);
    const calls = skyBackground.mock.calls.length;
    const bg = w.scene.background;
    const fog = w.scene.fog;
    const fogColor = fog.color;
    const pos = w.bus.position;
    // inside the first step (it ends at eveningAt(t) = 1/6)
    run(w, 30);
    expect(eveningAt(30)).toBeLessThan(1 / EVENING_STEPS);
    expect(skyBackground.mock.calls.length).toBe(calls);
    expect(w.scene.background).toBe(bg);
    expect(w.scene.fog).toBe(fog);
    expect(w.scene.fog.color).toBe(fogColor);
    expect(w.bus.position).toBe(pos);
    // the fog and the light did move, on the same objects
    expect(fogColor.getHex()).not.toBe(SUNSET.horizon);
    w.life.dispose();
  });
});

describe('the picture times', () => {
  it('the card is taken at sunset, the edge at full dusk, every time names a shot', () => {
    expect(Object.isFrozen(ROOFS_SHOT_T)).toBe(true);
    for (const name of Object.keys(ROOFS_SHOT_T)) expect(ROOFS_SHOTS[name]).toBeDefined();
    const at = (t) => { const w = walk(); run(w, t); return w; };
    const card = at(ROOFS_SHOT_T.card);
    expect(eveningAt(ROOFS_SHOT_T.card)).toBeLessThan(0.05);
    expect(skyBackground).toHaveBeenLastCalledWith(SUNSET.top, SUNSET.horizon);
    expect(card.scene.fog.color.getHex()).toBe(SUNSET.horizon);
    expect(card.sun.intensity).toBeGreaterThan(0.8 * 1.7);
    const edge = at(ROOFS_SHOT_T.edge);
    expect(eveningAt(ROOFS_SHOT_T.edge)).toBe(1);
    expect(skyBackground).toHaveBeenLastCalledWith(DUSK.top, DUSK.horizon);
    expect(edge.scene.fog.color.getHex()).toBe(DUSK.horizon);
    expect(edge.sun.intensity).toBeCloseTo(0.8, 6);
  });
});
