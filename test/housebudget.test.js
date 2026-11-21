import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js).
vi.stubGlobal('document', canvasStub);

const { build } = await import('../src/world/house.js');
const { HOUSE_LEVELS } = await import('../src/world/houseplan.js');
const { mergeStaticProps } = await import('../src/render/mergeprops.js');
const { applyDusk, createLampPools } = await import('../src/render/dusk.js');
const { createSun, createFill, castsFromBox, isTransparentMat } = await import('../src/render/rig.js');
const { measureHouse, houseWorstSpot } = await import('./helpers/housebudget.js');

// =============================================================================
// The Old House, the worst-spot budget (Old House step 1, Task 5). What is drawn
// at once depends only on her level (H6), so the worst spot is the worst level:
// the street ceiling holds for every level's drawn set, by day and at dusk, on the
// scene as walk.js renders it (the build, then the prop merge, then dusk).
// =============================================================================

const rig = { castsFromBox, isTransparentMat };
const ids = HOUSE_LEVELS.map((l) => l.id);

function renderedHouse(light) {
  const scene = new THREE.Scene();
  const area = build(scene);
  mergeStaticProps(scene); // walk.js's order: merge, then dusk
  if (light === 'dusk') {
    applyDusk({ scene, sun: createSun(), fill: createFill(area.groundBounce), areaData: area });
    createLampPools(scene);
  }
  return scene;
}

describe('the worst spot in the house', () => {
  for (const light of ['day', 'dusk']) {
    it(`every level's drawn set is under 450 meshes, 380 casters, 70,000 triangles (${light})`, () => {
      const m = measureHouse(renderedHouse(light), rig);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, id).toBeLessThanOrEqual(450);
        expect(s.casters, id).toBeLessThanOrEqual(380);
        expect(s.triangles, id).toBeLessThanOrEqual(70000);
      }
      const worst = houseWorstSpot(m, ids);
      if (process.env.BUDGET_LOG) {
        console.log(light, JSON.stringify(worst));
        for (const id of ids) console.log(light, id, JSON.stringify(m.at(id)), 'detail', JSON.stringify(m.detail.get(id)), 'simple', JSON.stringify(m.simple.get(id)));
        console.log(light, 'fixed', JSON.stringify(m.fixed));
      }
    });
  }

  it('draws far levels simply: a stand-in costs less than the detail it stands for', () => {
    const m = measureHouse(renderedHouse('day'), rig);
    for (const id of ids) {
      expect(m.detail.get(id), id).toBeTruthy();
      expect(m.simple.get(id), id).toBeTruthy();
      expect(m.simple.get(id).meshes, id).toBeLessThan(m.detail.get(id).meshes);
      expect(m.simple.get(id).triangles, id).toBeLessThan(m.detail.get(id).triangles);
      expect(m.simple.get(id).casters, id).toBe(0);
    }
  });

  it('every level is near the aims: 300 meshes, 200 casters, 55,000 triangles', () => {
    for (const light of ['day', 'dusk']) {
      const m = measureHouse(renderedHouse(light), rig);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, `${light} ${id}`).toBeLessThanOrEqual(300);
        expect(s.casters, `${light} ${id}`).toBeLessThanOrEqual(200);
        expect(s.triangles, `${light} ${id}`).toBeLessThanOrEqual(55000);
      }
    }
  });
});
