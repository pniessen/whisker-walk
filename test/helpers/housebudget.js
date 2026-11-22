// The Old House's worst-spot budget (Old House step 1, Task 5). What is drawn at
// once depends only on her level (ruling H6): every top-level child that is not a
// level's furniture (`fixed`), the furniture of her level and the levels a stair
// joins to it (userData.houseDetail + houseLevel), and the plain stand-in of every
// other level (userData.houseSimple). Each cost is test/budget.test.js's own count
// (budgetOf: every mesh a draw, a caster by the walk's rule), over the scene as
// walk.js renders it: measure after the build and mergeStaticProps (and dusk).
import * as THREE from 'three';
import { budgetOf as meshBudgetOf, trianglesOf } from './growriver.js';
import { fullLevels } from '../../src/houselevels.js';
import { LEVEL_LINKS } from '../../src/world/houseplan.js';

// budgetOf counts meshes; a THREE.Points (the dust motes) is a draw too, with no
// triangles and no shadow (noCast, additive), so it adds one to `meshes` here.
function budgetOf(children, rig) {
  const b = meshBudgetOf(children, rig);
  let points = 0;
  for (const c of children) c.traverse((o) => { if (o.isPoints || o.isLine || o.isSprite) points++; });
  return { ...b, meshes: b.meshes + points };
}

const ZERO = Object.freeze({ meshes: 0, casters: 0, triangles: 0 });
const add = (a, b) => ({ meshes: a.meshes + b.meshes, casters: a.casters + b.casters, triangles: a.triangles + b.triangles });

export function measureHouse(scene, rig, links = LEVEL_LINKS) {
  const fixedKids = [];
  const detailKids = new Map();
  const simpleKids = new Map();
  const push = (map, k, c) => { if (!map.has(k)) map.set(k, []); map.get(k).push(c); };
  for (const c of scene.children) {
    const u = c.userData ?? {};
    if (u.houseDetail) push(detailKids, u.houseLevel, c);
    else if (u.houseSimple) push(simpleKids, u.houseSimple, c);
    else fixedKids.push(c);
  }
  const fixed = budgetOf(fixedKids, rig);
  const detail = new Map([...detailKids].map(([k, v]) => [k, budgetOf(v, rig)]));
  const simple = new Map([...simpleKids].map(([k, v]) => [k, budgetOf(v, rig)]));
  const levels = new Set([...detail.keys(), ...simple.keys()]);
  return {
    fixed,
    detail,
    simple,
    at(levelId) {
      const full = fullLevels(levelId, links);
      let sum = fixed;
      for (const l of levels) sum = add(sum, (full.has(l) ? detail.get(l) : simple.get(l)) ?? ZERO);
      return sum;
    },
  };
}

// The level with the most triangles drawn, and what is drawn there.
export function houseWorstSpot(measure, levelIds) {
  let worst = null;
  for (const id of levelIds) {
    const s = measure.at(id);
    if (!worst || s.triangles > worst.triangles) worst = { level: id, ...s };
  }
  return worst;
}

// What the walk adds to the scene on top of the build (game/walk.js, in its order): the
// knock-overs, the golden mice, the mice, the yarn ball at its first spot, and the
// house life (the finds' parts are the build's; the life adds the sunbeams and the
// dust motes), settled once. Call after the merge and dusk. Returns dispose().
export async function houseWalkThings(scene, area, { dusk = false, open = false, cats = 1, kitten = false } = {}) {
  const { createKnockables } = await import('../../src/knockables.js');
  const { createGoldMice } = await import('../../src/goldmice.js');
  const { createCritters } = await import('../../src/critters.js');
  const { HOUSE_FINDS } = await import('../../src/world/housethings.js');
  const { createToy } = await import('../../src/toy.js');
  const { buildCat } = await import('../../src/cat/model.js');
  const { kittenPlan, createKittenEncounter } = await import('../../src/kitten.js');
  const ground = area.ground;
  const things = [];
  things.push(createKnockables(scene, area.knockables, { ground }));
  things.push(createGoldMice(scene, 'house', new Set(), { ground, rng: () => 0.5 }));
  things.push(createCritters(scene, area.critterSpawns, { ground, hides: area.hides, rng: () => 0.5, motionRng: () => 0.5 }));
  // the player's cat as walk.js builds it (tabby, nothing worn), at the spawn; the house is solo
  // until step 4 (ruling S2-13), `cats: 2` is the co-walk's second cat, beside her
  const catList = [];
  for (let i = 0; i < cats; i++) {
    const cat = buildCat('tabby', { collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null }, {});
    cat.position.set(area.spawn.x + i, ground.y(area.spawn.x + i, area.spawn.z), area.spawn.z);
    scene.add(cat);
    catList.push(cat);
  }
  // `kitten`: Mochi at home, as walk.js adds her on a solo walk once the save has her (stage 2 on:
  // kittenPlan gives every place her home), circling the house's kittenHome
  const mochi = kitten ? createKittenEncounter(scene, kittenPlan(3, 'house'), area.kittenHome, { onMew() {}, ground }) : null;
  const toy = createToy(scene, { ground });
  const spot = area.yarnSpots[0];
  toy.spot = { x: spot.x, z: spot.z };
  toy.placeAt(spot);
  toy.mesh.visible = true;
  const life = area.life({ scene, reducedMotion: open, log: null, audio: null, toy, dusk });
  const cam = { position: new THREE.Vector3(area.spawn.x, 3, area.spawn.z + 4) };
  life.settle(new THREE.Vector3(area.spawn.x, 0, area.spawn.z), cam);
  if (open) {
    // the bookcase opens the walk's own way: she holds still at its spot (reduced motion, so it swings at once)
    const f = HOUSE_FINDS.find((x) => x.trigger === 'secret');
    const cat = new THREE.Vector3(f.x, 0, f.z);
    for (let i = 0; i < 4; i++) life.update(1, i, cat, cam);
  }
  return () => {
    life.dispose?.();
    for (const c of catList) scene.remove(c);
    mochi?.dispose();
    for (const t of things) t.dispose?.();
  };
}

// ---- Old House step 4, Task 8: two cats at the worst spot (ruling W15) ----

const NO_WEAR = Object.freeze({ collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null });
export const WEAR_SLOTS = Object.freeze(['head', 'face', 'neck', 'collar', 'back', 'body', 'feet']);

// The shipped wearable with the most triangles in each slot, found by building each one on the
// tabby (the same cat the walk builds), alone in its slot. Ties go to the first in catalog order.
export async function heaviestWear() {
  const { CATALOG } = await import('../../src/progression.js');
  const { buildCat } = await import('../../src/cat/model.js');
  const best = {};
  const bestN = {};
  for (const [id, a] of Object.entries(CATALOG.accessories)) {
    if (!WEAR_SLOTS.includes(a.slot)) continue;
    const cat = buildCat('tabby', { ...NO_WEAR, [a.slot]: id }, {});
    const n = trianglesOf(cat);
    if (!(a.slot in bestN) || n > bestN[a.slot]) { best[a.slot] = id; bestN[a.slot] = n; }
  }
  return best;
}

// Adds n cats beside the spawn, as the walk does (tabby; `dressed` puts the heaviest wearable of every
// slot on each), and, with `tag`, her partner's name tag (one sprite) on each cat but the first. Returns
// the objects added, for removal.
export async function withCats(scene, n, { dressed = false, tag = false } = {}) {
  const { buildCat } = await import('../../src/cat/model.js');
  const { makeNameTag } = await import('../../src/nametag.js');
  const wear = dressed ? { ...NO_WEAR, ...(await heaviestWear()) } : NO_WEAR;
  const added = [];
  for (let i = 0; i < n; i++) {
    const cat = buildCat('tabby', wear, {});
    cat.position.set(2 + i, 0, 2);
    scene.add(cat);
    added.push(cat);
    if (tag && i > 0) {
      const t = makeNameTag('Partner') ?? new THREE.Sprite(new THREE.SpriteMaterial());
      t.visible = true;
      t.position.add(cat.position);
      scene.add(t);
      added.push(t);
    }
  }
  return added;
}
