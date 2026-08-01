import { describe, it, expect } from 'vitest';
import { CAT_NAMES, createStrayCats } from '../src/straycats.js';

const scene = { add() {}, remove() {} };
const AREA = { bounds: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 } };

describe('cat society', () => {
  it('has at least 48 unique names', () => {
    expect(CAT_NAMES.length).toBeGreaterThanOrEqual(48);
    expect(new Set(CAT_NAMES).size).toBe(CAT_NAMES.length);
  });

  it('spawns 22 strays with unique names and valid personalities', () => {
    const s = createStrayCats(scene, AREA, 22, () => 0.42);
    expect(s.strays).toHaveLength(22);
    expect(new Set(s.strays.map((x) => x.name)).size).toBe(22);
    for (const st of s.strays) {
      expect(['bold', 'shy', 'playful']).toContain(st.personality);
    }
  });

  it('shy strays scurry from a fast non-stalking approach', () => {
    const s = createStrayCats(scene, AREA, 22, () => 0.42);
    const shy = s.strays.find((x) => x.personality === 'shy');
    const start = shy.group.position.clone();
    const catPos = start.clone();
    catPos.x += 2;
    for (let i = 0; i < 60; i++) s.update(0.05, i * 0.05, catPos, { stalking: false, catSpeed: 4, toy: null });
    expect(shy.group.position.distanceTo(catPos)).toBeGreaterThan(start.distanceTo(catPos));
  });
});
