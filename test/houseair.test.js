import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });

const { createHouseAir, SUNBEAM } = await import('../src/world/houseair.js');
const { HOUSE_ROOMS, HOUSE_LEVELS, HOUSE_WINDOWS, HOUSE_ZONES } = await import('../src/world/houseplan.js');

// The Old House, step 2, Task 7 (ruling D16): sunbeams and dust motes.
const make = (over = {}) => {
  const scene = new THREE.Scene();
  const air = createHouseAir(scene, { windows: HOUSE_WINDOWS, rooms: HOUSE_ROOMS, levels: HOUSE_LEVELS, dusk: false, reducedMotion: false, ...over });
  return { scene, air };
};
const all = new Set(HOUSE_ZONES.map((z) => z.id)); // the old levels and the east wing's zones: a beam is drawn with its zone
const objects = (scene) => { const o = []; scene.traverse((c) => { if (c.isMesh || c.isPoints) o.push(c); }); return o; };
const roomsWithSun = new Set(HOUSE_WINDOWS.map((w) => HOUSE_ROOMS.find((r) => r.id === w.room)).filter((r) => r.level !== 'cellar').map((r) => r.zone ?? r.level));

describe('the house air', () => {
  it('by day the windows throw sunbeams with motes in them; at dusk there are none', () => {
    const { scene, air } = make();
    const meshes = objects(scene).filter((o) => o.isMesh);
    const points = objects(scene).filter((o) => o.isPoints);
    expect(meshes).toHaveLength(roomsWithSun.size);
    expect(points).toHaveLength(roomsWithSun.size);
    expect(air.beams.length).toBe(HOUSE_WINDOWS.filter((w) => HOUSE_ROOMS.find((r) => r.id === w.room).level !== 'cellar').length);
    expect(air.beams.some((b) => b.level === 'cellar')).toBe(false);
    for (const m of meshes) {
      expect(m.material.blending).toBe(THREE.AdditiveBlending);
      expect(m.material.depthWrite).toBe(false);
      expect(m.userData.noCast).toBe(true);
      expect(m.userData.noMerge).toBe(true);
      expect(m.userData.houseDetail).toBe(true);
      expect(typeof m.userData.houseLevel).toBe('string');
    }
    for (const p of points) {
      const level = p.userData.houseLevel;
      const beams = air.beams.filter((b) => b.level === level).length;
      expect(p.geometry.getAttribute('position').count).toBe(SUNBEAM.motes * beams);
    }
    const dusk = make({ dusk: { evening: true } });
    expect(objects(dusk.scene)).toHaveLength(0);
    dusk.air.update(1 / 60, 0, all);
    dusk.air.dispose();
  });

  it('the motes stay inside their beams and draw nothing from Math.random', () => {
    const { scene, air } = make();
    const spy = vi.spyOn(Math, 'random'); // after the build: three's own uuids draw on it
    const pad = 0.25;
    for (let i = 0; i < 600; i++) {
      air.update(1 / 60, i / 60, all);
      if (i % 100 !== 0) continue;
      for (const p of objects(scene).filter((o) => o.isPoints)) {
        const boxes = air.beams.filter((b) => b.level === p.userData.houseLevel);
        const pos = p.geometry.getAttribute('position');
        for (let k = 0; k < boxes.length; k++) {
          const b = boxes[k];
          for (let m = 0; m < SUNBEAM.motes; m++) {
            const j = k * SUNBEAM.motes + m;
            const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
            expect(x).toBeGreaterThanOrEqual(b.min[0] - pad);
            expect(x).toBeLessThanOrEqual(b.max[0] + pad);
            expect(y).toBeGreaterThanOrEqual(b.min[1] - pad);
            expect(y).toBeLessThanOrEqual(b.max[1] + pad);
            expect(z).toBeGreaterThanOrEqual(b.min[2] - pad);
            expect(z).toBeLessThanOrEqual(b.max[2] + pad);
          }
        }
      }
    }
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('the motes drift by day', () => {
    const { scene, air } = make();
    const p = objects(scene).find((o) => o.isPoints);
    air.update(1 / 60, 0, all);
    const before = Array.from(p.geometry.getAttribute('position').array);
    air.update(1 / 60, 5, all);
    expect(Array.from(p.geometry.getAttribute('position').array)).not.toEqual(before);
  });

  it('under reduced motion the motes hold still', () => {
    const { scene, air } = make({ reducedMotion: true });
    const p = objects(scene).find((o) => o.isPoints);
    air.update(1 / 60, 0, all);
    const before = Array.from(p.geometry.getAttribute('position').array);
    for (let i = 1; i <= 300; i++) air.update(1 / 60, 5 * (i / 300), all);
    expect(Array.from(p.geometry.getAttribute('position').array)).toEqual(before);
  });

  it('draws the air only on levels drawn in full', () => {
    const { scene, air } = make();
    air.update(1 / 60, 0, new Set(['attic', 'upstairs']));
    for (const o of objects(scene)) expect(o.visible).toBe(['attic', 'upstairs'].includes(o.userData.houseLevel));
    air.update(1 / 60, 0, new Set(['ground', 'cellar']));
    for (const o of objects(scene)) expect(o.visible).toBe(o.userData.houseLevel === 'ground');
  });

  it('disposing takes the air out of the scene', () => {
    const { scene, air } = make();
    air.dispose();
    expect(objects(scene)).toHaveLength(0);
  });
});
