import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });

const { createHouseGlow, windowPatches, WIN_SLOTS, LAMP_SLOTS, FIRE, LIVE_WIN } = await import('../src/world/houseglow.js');
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
