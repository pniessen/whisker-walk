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
const { SECRET_STAIR_ROT_Y } = await import('../src/world/houseplan.js');
const { measureHouse, houseWorstSpot, houseWalkThings, withCats, heaviestWear, WEAR_SLOTS } = await import('./helpers/housebudget.js');
const { liveEndsFor } = await import('../src/gateways.js');
const { CATALOG } = await import('../src/progression.js');

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
// Built the way Clan Edition's walk builds it: with the house's live gate ends, so the hall's front door
// leaves are in the scene (Old House step 4, Task 5).
const gateEnds = liveEndsFor('house', CATALOG);
async function renderedHouse(light, secret = 'shut', cats = 1, kitten = false, extra = null) {
  const scene = new THREE.Scene();
  const area = build(scene, { gateEnds });
  mergeStaticProps(scene); // walk.js's order: merge, then dusk
  if (light === 'dusk') {
    applyDusk({ scene, sun: createSun(), fill: createFill(area.groundBounce), areaData: area });
    createLampPools(scene);
  }
  const dispose = await houseWalkThings(scene, area, { dusk: light === 'dusk', open: secret === 'open', cats, kitten });
  if (extra) await extra(scene);
  return { scene, dispose, area };
}
async function measured(light, secret, cats = 1, kitten = false, extra = null) {
  const { scene, dispose, area } = await renderedHouse(light, secret, cats, kitten, extra);
  const m = measureHouse(scene, rig);
  const points = new Map(); // houseLevel -> Points drawn there
  scene.traverse((o) => { if (o.isPoints) points.set(o.userData.houseLevel, (points.get(o.userData.houseLevel) ?? 0) + 1); });
  const turn = area.house.secret.group.rotation.y;
  dispose();
  return { m, points, turn };
}

describe('the worst spot in the house', () => {
  for (const light of ['day', 'dusk']) for (const secret of ['shut', 'open']) {
    // Mochi comes on every house walk once the save has her (kittenPlan: her home is every
    // place's from stage 2; the house is solo, H7), so the ceiling holds with her in it
    it(`every level's drawn set, with the walk's own things and Mochi, is under 450 meshes, 380 casters, 70,000 triangles (${light}, bookcase ${secret})`, async () => {
      const { m } = await measured(light, secret, 1, true);
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

  it('counts the motes and the walk\'s things: a Points on each lit level by day, none at dusk, and the fixed set grows', async () => {
    const bare = new THREE.Scene();
    build(bare);
    mergeStaticProps(bare);
    const base = measureHouse(bare, rig).fixed;
    const day = await measured('day', 'shut');
    const dusk = await measured('dusk', 'shut');
    for (const id of ['ground', 'upstairs', 'attic']) expect(day.points.get(id), id).toBeGreaterThanOrEqual(1);
    expect(day.points.has('cellar')).toBe(false); // the cellar has no window
    expect(dusk.points.size).toBe(0);
    expect(day.m.fixed.meshes).toBeGreaterThan(base.meshes); // the cat, knock-overs, mice, golden mice and the ball are drawn
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

  // The aims are held with her cat alone; with Mochi too the figures are reported, not held
  // (BUDGET_LOG=1): she adds about 30 meshes and 8,800 triangles, no casters, on every level.
  it('every level is near the aims with everything in it: 300 meshes, 200 casters, 55,000 triangles', async () => {
    for (const light of ['day', 'dusk']) {
      const { m } = await measured(light, 'shut');
      const { m: withMochi } = await measured(light, 'shut', 1, true);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, `${light} ${id}`).toBeLessThanOrEqual(300);
        expect(s.casters, `${light} ${id}`).toBeLessThanOrEqual(200);
        expect(s.triangles, `${light} ${id}`).toBeLessThanOrEqual(55000);
        expect(withMochi.at(id).triangles, `${light} ${id}`).toBeGreaterThan(s.triangles); // she is drawn
      }
      if (process.env.BUDGET_LOG) console.log(light, 'with Mochi', JSON.stringify(houseWorstSpot(withMochi, ids)));
    }
  }, 90_000);

  it('opening the bookcase adds no draw', async () => {
    for (const light of ['day', 'dusk']) {
      const shutRun = await measured(light, 'shut');
      const openRun = await measured(light, 'open');
      expect(shutRun.turn, light).toBeCloseTo(0, 9);
      expect(openRun.turn, light).toBeCloseTo(SECRET_STAIR_ROT_Y, 6); // it really swung open, away from her into the stair (rough edge 3)
      const shut = shutRun.m;
      const open = openRun.m;
      for (const id of ids) expect(open.at(id), `${light} ${id}`).toEqual(shut.at(id));
    }
  }, 90_000);

  // Two children in the house (ruling W15, step 4): her cat and her partner's, each in the heaviest shipped
  // wearable of every slot, with the partner's name tag (a sprite). The hall's front door is built in too.
  it('the heaviest wearable of every slot is found by building each one', async () => {
    const wear = await heaviestWear();
    for (const slot of WEAR_SLOTS) {
      expect(wear[slot], slot).toBeTruthy();
      expect(CATALOG.accessories[wear[slot]].slot, slot).toBe(slot);
    }
    if (process.env.BUDGET_LOG) console.log('heaviest wear', JSON.stringify(wear));
  }, 60_000);

  const twoCats = (scene) => withCats(scene, 2, { dressed: true, tag: true });
  const twoPlain = (scene) => withCats(scene, 2, { tag: true });
  const cases = [['day', 'shut'], ['day', 'open'], ['dusk', 'shut'], ['dusk', 'open']];
  it.each(cases)(
    'with two plain cats and her tag, every level is under 450 meshes, 380 casters, 70,000 triangles (%s, bookcase %s)',
    async (light, secret) => {
      const { m } = await measured(light, secret, 0, false, twoPlain);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, id).toBeLessThanOrEqual(450);
        expect(s.casters, id).toBeLessThanOrEqual(380);
        expect(s.triangles, id).toBeLessThanOrEqual(70000);
      }
    }, 60_000);

  // The fully dressed pair (the heaviest wearable of every slot on both cats, plus her tag) holds meshes and
  // casters only. Its triangles are reported, not held (controller ruling P-10): the whole shop on both
  // children is a measure no other place meets (the Neighborhood's 44k plus that pair is 77k), and the spec's
  // 70,000 follows growbudget, which measures the world. Measured: 77,702 triangles by day, 78,139 at dusk (ground),
  // about 8k over 70,000; the owner can decide whether to trim the house by that much.
  it.each(cases)(
    'with two fully dressed cats and her tag, every level is under 450 meshes and 380 casters (%s, bookcase %s)',
    async (light, secret) => {
      const { m } = await measured(light, secret, 0, false, twoCats);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, id).toBeLessThanOrEqual(450);
        expect(s.casters, id).toBeLessThanOrEqual(380);
      }
      const w = houseWorstSpot(m, ids);
      console.info(`two dressed cats, ${light}, bookcase ${secret}: ${w.triangles} triangles at ${w.level} (not held to 70,000)`);
    }, 60_000);

  it("the room's worst spot and the solo worst spot are reported", async () => {
    const line = (what, w) => console.info(`house worst spot, ${what}: level ${w.level}, ${w.meshes} meshes, ${w.casters} casters, ${w.triangles} triangles`);
    for (const light of ['day', 'dusk']) {
      const worst = async (cats, kitten, extra) => houseWorstSpot((await measured(light, 'shut', cats, kitten, extra)).m, ids);
      const alone = await worst(1, false);
      const mochi = await worst(1, true);
      const plain = await worst(2, false);
      const dressed = await worst(0, false, twoCats);
      line(`${light}, the cat alone`, alone);
      line(`${light}, one cat with Mochi`, mochi);
      line(`${light}, two plain cats`, plain);
      line(`${light}, two dressed cats and her tag`, dressed);
      // only the cat alone is held to the aims (S2-15); the rest are reported. Two cats cost more than one.
      expect(plain.triangles).toBeGreaterThan(alone.triangles);
      expect(dressed.triangles).toBeGreaterThanOrEqual(plain.triangles);
    }
  }, 120_000);
});
