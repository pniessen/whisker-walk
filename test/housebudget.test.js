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
const { measureHouse, houseWorstSpot, houseWalkThings } = await import('./helpers/housebudget.js');

// =============================================================================
// The Old House, the worst-spot budget (Old House step 1, Task 5). What is drawn
// at once depends only on her level (H6), so the worst spot is the worst level:
// the street ceiling holds for every level's drawn set, by day and at dusk, on the
// scene as walk.js renders it (the build, then the prop merge, then dusk).
// =============================================================================

const rig = { castsFromBox, isTransparentMat };
const ids = HOUSE_LEVELS.map((l) => l.id);

// The scene as the walk renders it: the build, the prop merge, dusk, then the walk's own
// things (knock-overs, golden mice, mice, the yarn ball) and the house life's air.
async function renderedHouse(light, secret = 'shut') {
  const scene = new THREE.Scene();
  const area = build(scene);
  mergeStaticProps(scene); // walk.js's order: merge, then dusk
  if (light === 'dusk') {
    applyDusk({ scene, sun: createSun(), fill: createFill(area.groundBounce), areaData: area });
    createLampPools(scene);
  }
  const dispose = await houseWalkThings(scene, area, { dusk: light === 'dusk', open: secret === 'open' });
  return { scene, dispose };
}
async function measured(light, secret) {
  const { scene, dispose } = await renderedHouse(light, secret);
  const m = measureHouse(scene, rig);
  const pointsDrawn = (() => { let n = 0; scene.traverse((o) => { if (o.isPoints) n++; }); return n; })();
  dispose();
  return { m, pointsDrawn };
}

describe('the worst spot in the house', () => {
  for (const light of ['day', 'dusk']) for (const secret of ['shut', 'open']) {
    it(`every level's drawn set, with the walk's own things, is under 450 meshes, 380 casters, 70,000 triangles (${light}, bookcase ${secret})`, async () => {
      const { m } = await measured(light, secret);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, id).toBeLessThanOrEqual(450);
        expect(s.casters, id).toBeLessThanOrEqual(380);
        expect(s.triangles, id).toBeLessThanOrEqual(70000);
      }
      const worst = houseWorstSpot(m, ids);
      if (process.env.BUDGET_LOG) {
        console.log(light, secret, JSON.stringify(worst));
        for (const id of ids) console.log(light, secret, id, JSON.stringify(m.at(id)), 'detail', JSON.stringify(m.detail.get(id)), 'simple', JSON.stringify(m.simple.get(id)));
        console.log(light, secret, 'fixed', JSON.stringify(m.fixed));
      }
    }, 60_000);
  }

  it('counts the motes and the walk\'s things: by day the life adds a Points per level and the fixed set grows, at dusk no air', async () => {
    const bare = new THREE.Scene();
    build(bare);
    mergeStaticProps(bare);
    const base = measureHouse(bare, rig).fixed;
    const day = await measured('day', 'shut');
    const dusk = await measured('dusk', 'shut');
    expect(day.pointsDrawn).toBeGreaterThan(0);
    expect(dusk.pointsDrawn).toBe(0);
    expect(day.m.fixed.meshes).toBeGreaterThan(base.meshes); // knock-overs, mice, golden mice and the ball are drawn
    for (const id of ids) expect(day.m.at(id).meshes, id).toBeGreaterThan(dusk.m.at(id).meshes - 1);
  }, 60_000);

  it('draws far levels simply: a stand-in costs less than the detail it stands for', async () => {
    const { m } = await measured('day', 'shut');
    for (const id of ids) {
      expect(m.detail.get(id), id).toBeTruthy();
      expect(m.simple.get(id), id).toBeTruthy();
      expect(m.simple.get(id).meshes, id).toBeLessThan(m.detail.get(id).meshes);
      expect(m.simple.get(id).triangles, id).toBeLessThan(m.detail.get(id).triangles);
      expect(m.simple.get(id).casters, id).toBe(0);
    }
  }, 60_000);

  it('every level is near the aims with everything in it: 300 meshes, 200 casters, 55,000 triangles', async () => {
    for (const light of ['day', 'dusk']) {
      const { m } = await measured(light, 'shut');
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, `${light} ${id}`).toBeLessThanOrEqual(300);
        expect(s.casters, `${light} ${id}`).toBeLessThanOrEqual(200);
        expect(s.triangles, `${light} ${id}`).toBeLessThanOrEqual(55000);
      }
    }
  }, 90_000);

  it('opening the bookcase adds no draw', async () => {
    for (const light of ['day', 'dusk']) {
      const shut = (await measured(light, 'shut')).m;
      const open = (await measured(light, 'open')).m;
      for (const id of ids) expect(open.at(id), `${light} ${id}`).toEqual(shut.at(id));
    }
  }, 90_000);
});
