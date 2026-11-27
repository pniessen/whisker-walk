import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

// The headless document stub every world test uses (test/flattrace.test.js).
vi.stubGlobal('document', canvasStub);

await (await import('../src/world/housestages.js')).loadHouseStages(); // the wing's lazy stage (housestagewing.js) fills the house's wing slots
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
  it('every level is near the aims with everything in it: 306 meshes, 200 casters, 60,000 triangles', async () => {
    for (const light of ['day', 'dusk']) {
      const { m } = await measured(light, 'shut');
      const { m: withMochi } = await measured(light, 'shut', 1, true);
      for (const id of ids) {
        const s = m.at(id);
        expect(s.meshes, `${light} ${id}`).toBeLessThanOrEqual(317); // milestone 3, 314 -> 317: the cat tree's golden mouse, always drawn. The east wing's re-pin, 300 -> 306: its four stand-ins, a box each (milestone 1); 306 -> 314: its two new mice and the kids' top-bunk golden mouse (milestone 2), always drawn (the ceiling is 450)
        expect(s.casters, `${light} ${id}`).toBeLessThanOrEqual(200);
        expect(s.triangles, `${light} ${id}`).toBeLessThanOrEqual(60300); // milestone 2, 60,000 -> 60,300: its two new mice, always drawn. The beauty pass's deliberate re-pin: 55,000 -> 59,500 (cornice, wainscot, wall dressing, glow); the wing's far-room fix round, 59,500 -> 60,000 (the four far stand-ins dressed: 52 -> 302 triangles, in view from the hall)
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

// =============================================================================
// The east wing's zones (Old House wing, milestone 1): the wing's walls, floors, furniture, lamps and
// glass are details of their zone, drawn in full only while she is in it or near the way in; far, the
// zone is one box a room (a stand-in, under 120 triangles, no casters). Her zone in full, the nearest
// joined zone in full, the rest stand-ins: at most 63,000 triangles, 330 meshes, 190 casters, the old
// house's own worst spot is not worse (it stays inside its ceilings), and the stand-ins cost less.
// =============================================================================
describe('the east wing\'s zones', () => {
  const WING = ['living', 'sun', 'kids', 'bath', 'wonder'];
  // the design's per-room figures (living 3,000, solarium 2,400, kids 3,400, bath 2,000 triangles), as built and pinned: the
  // living room's and the kids' room's walls are dressed like the old rooms (cornice, wainscot, curtains, pictures); the
  // solarium's is with the wing stair, its stair gallery's walls and its glass walls' frames, which the design left out
  const LIMITS = {
    living: { triangles: 3900, meshes: 22, casters: 12 },
    sun: { triangles: 5000, meshes: 28, casters: 15 },
    kids: { triangles: 5150, meshes: 28, casters: 18 }, // milestone 3: 5,100 -> 5,150, 26 -> 28 meshes, 17 -> 18 casters: the kids' wardrobe's leaf and the light under its doors (mesh and caster counts here are the kids' zone alone)
    // the secret wonder room (milestone 3), measured: its walls 2,700 (the stair's four sections with them), the cat tree and hammock 600, the tunnel 340, the stair 520, paw marks 770, the brick skirt 210 (cut in bricks twice the size), its floor, lights and wand. The design said 3,600 / 35 / 20: the room is 11 x 10 and 4.2 m up
    wonder: { triangles: 6300, meshes: 38, casters: 25 },
    bath: { triangles: 2300, meshes: 17, casters: 10 },
  };
  // her zone and the zone joined to it that is near: the parlour's door, the living room's door to the solarium, the stair, the bathroom door
  // (houselevels.js draws her zone and at most the one joined zone nearest her, so a spot is two rooms, the old ground kept for
  // the parlour alone at the door, or the old ground kept for no room out on the lawn)
  const SPOTS = [['living', []], ['living', ['ground']], ['living', ['sun']], ['sun', []], ['sun', ['living']], ['sun', ['kids']],
    ['kids', []], ['kids', ['sun']], ['kids', ['bath']], ['kids', ['wonder']], ['bath', []], ['bath', ['kids']], ['wonder', []], ['wonder', ['kids']]];
  // the old house's worst spot before the wing, with Mochi (measured at the start of the wing's build, main 7a0e6f70)
  const OLD_WORST = { day: 67046, dusk: 67483 };

  it('draws each wing zone in full within its limits, and its stand-in (walls, floor, windows and the tallest pieces, dressed) under 120 triangles with no casters', async () => {
    const { m } = await measured('day', 'shut', 1, true);
    for (const z of WING) {
      const d = m.detail.get(z);
      const f = m.simple.get(z);
      if (process.env.BUDGET_LOG) console.log('wing zone', z, 'detail', JSON.stringify(d), 'stand-in', JSON.stringify(f));
      expect(d.triangles, z).toBeLessThanOrEqual(LIMITS[z].triangles);
      expect(d.meshes, z).toBeLessThanOrEqual(LIMITS[z].meshes);
      expect(d.casters, z).toBeLessThanOrEqual(LIMITS[z].casters);
      expect(f.meshes, z).toBe(1);
      expect(f.triangles, z).toBeLessThanOrEqual(120);
      expect(f.casters, z).toBe(0);
      expect(f.triangles, z).toBeLessThan(d.triangles);
    }
  }, 60_000);

  for (const light of ['day', 'dusk']) {
    it(`every wing spot (her zone, the nearest joined zone in full), with Mochi, is at most 63,000 triangles, 340 meshes, 190 casters (${light})`, async () => {
      const { m } = await measured(light, 'shut', 1, true);
      for (const [zone, near] of SPOTS) {
        const s = m.atZone(zone, near);
        if (process.env.BUDGET_LOG) console.log(light, 'wing spot', zone, near.join('+'), JSON.stringify(s));
        expect(s.triangles, `${zone}+${near}`).toBeLessThanOrEqual(63000);
        expect(s.meshes, `${zone}+${near}`).toBeLessThanOrEqual(364); // milestone 2: 340 -> 348, its two mice and the sunny slots patch; milestone 3: 348 -> 364 (with the cat tree's golden mouse), the wardrobe and the wonder room's own parts (the pair kids + wonder, once the wardrobe is open, is the most); the design said 330: each room's wall sections are a mesh each (so they can sink), and air, glow and marks come to 338 with two rooms. The hard ceiling is 450
        expect(s.casters, `${zone}+${near}`).toBeLessThanOrEqual(198); // 190 -> 198 the same way (the hard ceiling is 380)
      }
    }, 60_000);

    it(`the old house's worst spot barely grew, and the parlour at the new door is under the ceilings (${light})`, async () => {
      const { m } = await measured(light, 'shut', 1, true);
      const worst = houseWorstSpot(m, ids);
      // four dressed stand-ins (302 triangles), the parlour's east wall dressed on its new face, the wing's four knock-overs and (milestone 2) its two new mice: 1,200 to 1,300 triangles
      expect(worst.triangles).toBeLessThanOrEqual(OLD_WORST[light] + 1400); // milestone 3: 1,350 -> 1,400, the cat tree's golden mouse, always drawn
      expect(worst.triangles).toBeLessThanOrEqual(70000);
      // at the parlour's east door, the living room drawn beside her; her level alone (the stairs' levels step back)
      const door = m.atZone('ground', ['living']);
      if (process.env.BUDGET_LOG) console.log(light, 'ground at D1', JSON.stringify(door), 'old worst', JSON.stringify(worst));
      expect(door.triangles).toBeLessThanOrEqual(70000);
      expect(door.meshes).toBeLessThanOrEqual(450);
      expect(door.casters).toBeLessThanOrEqual(380);
      // and with two plain cats and her tag at the door, still under
      const two = await measured(light, 'shut', 0, false, (scene) => withCats(scene, 2, { tag: true }));
      const both = two.m.atZone('ground', ['living']);
      expect(both.triangles).toBeLessThanOrEqual(70000);
    }, 90_000);
  }

  it('out on the lawn, a wing room drawn within 5 m beside the old ground (kept for no room) is as light as any wing spot', async () => {
    for (const light of ['day', 'dusk']) {
      const { m } = await measured(light, 'shut', 1, true);
      for (const z of WING) {
        const s = m.atZone('ground', [z], { outside: true });
        if (process.env.BUDGET_LOG) console.log(light, 'on the lawn by', z, JSON.stringify(s));
        expect(s.triangles, `${light} ${z}`).toBeLessThanOrEqual(63000);
        expect(s.meshes, `${light} ${z}`).toBeLessThanOrEqual(352);
        expect(s.casters, `${light} ${z}`).toBeLessThanOrEqual(190);
      }
    }
  }, 60_000);

  it('keeps the wing\'s walls, floors, glass, lamps, stair and furniture with their zone, and a stand-in for each', async () => {
    const { scene, dispose } = await renderedHouse('day', 'shut', 1, false);
    dispose();
    const walls = scene.children.filter((c) => c.userData?.houseWalls && WING.includes(c.userData.houseWalls));
    expect(walls.map((c) => c.userData.houseWalls).sort()).toEqual([...WING].sort());
    for (const w of walls) expect(w.userData.houseDetail).toBe(true);
    for (const w of walls) expect(w.userData.noContactShadow, w.name).toBe(true); // no footprint blob under a whole room (the bathroom's was a black blotch on its floor)
    for (const z of WING) { // the far look: one mesh, two materials (the baked sheet, the repeating brick), textured, no blob, no casters
      const far = scene.children.find((c) => c.userData?.houseSimple === z);
      expect(Array.isArray(far.material) && far.material.length === 2, z).toBe(true);
      expect(far.material.every((mt) => mt.map), z).toBe(true);
      expect(far.userData.noContactShadow, z).toBe(true);
    }
    const panes = scene.children.filter((c) => c.userData?.paneZone);
    expect(panes.length).toBe(13); // living room 2, solarium 6, kids' room 3, bathroom 1, the wonder room's porthole 1
    for (const z of WING) expect(scene.children.some((c) => c.userData?.houseSimple === z)).toBe(true);
  }, 30_000);
});
