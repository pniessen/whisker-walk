// The Old House's worst-spot budget (Old House step 1, Task 5). What is drawn at
// once depends only on her level (ruling H6): every top-level child that is not a
// level's furniture (`fixed`), the furniture of her level and the levels a stair
// joins to it (userData.houseDetail + houseLevel), and the plain stand-in of every
// other level (userData.houseSimple). Each cost is test/budget.test.js's own count
// (budgetOf: every mesh a draw, a caster by the walk's rule), over the scene as
// walk.js renders it: measure after the build and mergeStaticProps (and dusk).
import { budgetOf } from './growriver.js';
import { fullLevels } from '../../src/houselevels.js';
import { LEVEL_LINKS } from '../../src/world/houseplan.js';

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
