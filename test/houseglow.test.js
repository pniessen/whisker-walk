import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });

const { createHouseGlow, dayPart, windowPatches, WIN_SLOTS, LAMP_SLOTS, FIRE, LIVE_WIN } = await import('../src/world/houseglow.js');
const { HOUSE_WINDOWS, HOUSE_ROOMS, HOUSE_LEVELS, HOUSE_LAMPS } = await import('../src/world/houseplan.js');

// The Old House beauty pass 2 (2026-11-28): the light patch, firelight and sway uniforms. No geometry, no light.
const mk = () => createHouseGlow({ windows: HOUSE_WINDOWS, rooms: HOUSE_ROOMS, levels: HOUSE_LEVELS, lamps: HOUSE_LAMPS });
const liveWins = (g) => g.uniforms.uWin.value.filter((v) => v.w > 0);

describe('the old house glow', () => {
  it('throws a sun patch inside the room under every window but the cellar\'s', () => {
    const patches = windowPatches(HOUSE_WINDOWS, HOUSE_ROOMS, HOUSE_LEVELS);
    expect(patches.length).toBe(HOUSE_WINDOWS.filter((w) => HOUSE_ROOMS.find((r) => r.id === w.room).level !== 'cellar').length);
    for (const p of patches) {
      const w = HOUSE_WINDOWS.find((q) => Math.abs((q.side === 'n' || q.side === 's' ? p.x : p.z) - q.at) < 1e-9);
      expect(w).toBeTruthy();
    }
    const hall = HOUSE_ROOMS.find((r) => r.id === 'hall');
    for (const p of patches.filter((q) => q.level === 'ground' && q.z > hall.minZ && q.z < hall.maxZ && q.x > hall.minX && q.x < hall.maxX)) expect(p.iz).toBe(-1); // the hall's windows are on its south wall: the patch lies north of them
  });
  it('lights the windows nearest her on her floor by day, none at dusk, fewer on LOW', () => {
    const g = mk();
    g.update(1, { x: 0, y: 0, z: 7 }, {});
    expect(liveWins(g).length).toBeGreaterThan(0);
    expect(liveWins(g).length).toBeLessThanOrEqual(WIN_SLOTS);
    const low = mk();
    low.update(1, { x: 0, y: 0, z: 7 }, { low: true });
    expect(liveWins(low).length).toBeLessThanOrEqual(LIVE_WIN.low);
    g.update(1, { x: 0, y: 0, z: 7 }, { dusk: true });
    expect(liveWins(g)).toHaveLength(0);
    expect(g.uniforms.uDusk.value).toBe(1);
  });
  it('lights no window on another floor', () => {
    const g = mk();
    g.update(1, { x: 0, y: 40, z: 7 }, {});
    expect(liveWins(g)).toHaveLength(0);
  });
  it('holds every time-driven thing still under reduced motion and on LOW', () => {
    for (const o of [{ still: true }, { low: true }]) {
      const g = mk();
      g.update(12.3, { x: 0, y: 0, z: 7 }, o);
      expect(g.uniforms.uTime.value).toBe(0);
      expect(g.uniforms.uFlick.value).toBe(0);
    }
    const g = mk();
    g.update(12.3, { x: 0, y: 0, z: 7 }, {});
    expect(g.uniforms.uTime.value).toBe(12.3);
    expect(g.uniforms.uFlick.value).toBe(1);
  });
  it('keeps the nearest lamps live (never more than the slots) and the fire in the parlour', () => {
    const g = mk();
    g.update(1, { x: 12, y: 0, z: 9 }, {});
    const live = g.uniforms.uLamp.value.filter((v) => v.w > 0);
    expect(live.length).toBeGreaterThan(0);
    expect(live.length).toBeLessThanOrEqual(LAMP_SLOTS);
    const parlour = HOUSE_ROOMS.find((r) => r.id === 'parlour');
    expect(FIRE.x).toBeGreaterThan(parlour.minX);
    expect(FIRE.x).toBeLessThan(parlour.maxX);
    expect(FIRE.z).toBeGreaterThan(parlour.minZ);
    expect(FIRE.z).toBeLessThan(parlour.maxZ);
  });
});

describe('the old house glow, pass 3 (the house reacts and lives)', () => {
  it('tints the house by the clock: cool morning, gold noon, amber evening, blue night', () => {
    const m = dayPart(7.5), n = dayPart(12), e = dayPart(17.5), k = dayPart(23);
    expect(m.tone[2]).toBeGreaterThan(m.tone[0]);
    expect(n.tone[0]).toBeGreaterThan(n.tone[2]);
    expect(e.tone[0] / e.tone[2]).toBeGreaterThan(n.tone[0] / n.tone[2]);
    expect(k.tone[2]).toBeGreaterThan(k.tone[0]);
    expect(k.night).toBe(1);
    expect(n.night).toBe(0);
    expect(dayPart(15).tone).toEqual([1.1, 1.0, 0.82]); // the afternoon the house always had
    const out = { tone: [0, 0, 0], sun: [0, 0, 0], lit: [0, 0, 0], env: 0, sunK: 0, lampK: 0, night: 0 };
    expect(dayPart(30, out)).toBe(out); // wraps, writes in place
  });
  it('carries her walk and the fire\'s burst into the uniforms, and the rain dims the sun patches', () => {
    const g = mk();
    g.update(1, { x: 12, y: 0, z: 9 }, { energy: 0.8, burst: 0.5 });
    expect(g.uniforms.uCat.value.w).toBeCloseTo(0.8);
    expect(g.uniforms.uBurst.value).toBeCloseTo(0.5);
    const dry = g.uniforms.uWin.value.find((v) => v.w > 0)?.w ?? 0;
    g.update(1, { x: 12, y: 0, z: 9 }, { rain: 1 });
    expect(g.uniforms.uRain.value).toBe(1);
    const wet = g.uniforms.uWin.value.find((v) => v.w > 0)?.w ?? 0;
    expect(wet).toBeLessThan(dry);
  });
  it('holds her dust, the crackle and the time still under reduced motion and on LOW', () => {
    for (const o of [{ still: true }, { low: true }]) {
      const g = mk();
      g.update(5, { x: 12, y: 0, z: 9 }, { ...o, energy: 1, burst: 1 });
      expect(g.uniforms.uCat.value.w).toBe(0);
      expect(g.uniforms.uBurst.value).toBe(0);
      expect(g.uniforms.uTime.value).toBe(0);
    }
  });
});
