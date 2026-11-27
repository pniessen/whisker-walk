// =============================================================================
// JUNGLE WING B: THE PLAN (milestone J5). Where the banana bunch lies across the river's log bridge, the low branch on the canopy walk (the one hop for the cacao pod and the third golden
// mouse), the canopy walk itself with its two trunks, its lookout and its vine swing, the sleepy sloth's tree and the hidden orchid (the rings the finds left bare in J3), the lodge's
// supper: the ring of hanging lanterns along the veranda's eave, the windows the supper lights in turn, the strings of lights along the log bridge's rope and the eave. Pure data and pure
// functions (no THREE, no clock, no Math.random). North is -z. Stage chunk code (junglestageb.js); start-up never imports it. docs/superpowers/plans/2026-11-27-new-areas-snowville-
// treehouse-jungle.md 3.3, 3.4, 3.6, 3.8. NO swimming: the river is shallows and the log bridge is for show. Numbers marked "start" are tuned from pictures.
// =============================================================================

import * as P from './jungleplan.js';
import { TABLE, MOSSY } from './junglestory.js';

const r2 = (v) => Math.round(v * 100) / 100;
const f = (o) => Object.freeze(o);

// ---- the second and third fruit ------------------------------------------------------------------------------------------------------------
// The banana bunch lies at the foot of its plant on the river's far (north) bank; she wades or walks the log bridge (x 10, z -10.1 to -1.9) and carries it back.
export const BANANA_PLANT = f({ x: 15.4, z: -14.9, r: 0.4, h: 3.2 });
// The low branch: a stout limb out from a big tree's trunk, 1.0 m over the hill's ground at its outer end: ONE hop (no skill), with the third golden mouse (gm-jungle-3) at its
// outer end and the cacao pod 1.5 m in along it. She hops up from the ground beside it and picks the pod from the branch.
export const BRANCH = f({ x: 26, z: -26, h: 1.0 });
export const BRANCH_TREE = f({ x: 28.3, z: -28.3, r: 0.55, h: 8 });
export const branchY = () => r2(P.jungleY(BRANCH.x, BRANCH.z) + BRANCH.h); // the top of the branch where she stands on it
const POD = f({ x: 27.0, z: -27.0 });
export const FRUITS_B = Object.freeze([
  f({ id: 1, kind: 'banana', x: 13.6, z: -13.4, y: 0.14, reach: 1.9 }),
  f({ id: 2, kind: 'cacao', x: POD.x, z: POD.z, y: r2(branchY() - P.jungleY(POD.x, POD.z) + 0.1), reach: 2.0, minY: r2(branchY() - 0.35) }),
]);

// ---- the canopy walk, the sloth and the orchid (the rings J3 left empty) -----------------------------------------------------------------------
// Two tall trunks hold a plank walkway high over the hill (a lookout at the north-east end, a vine swing hanging under it); she cannot climb it, it is for looking at (and the birds).
export const WALK_HEIGHT = 6.2;
export const WALK = f({ a: f({ x: 18.6, z: -18.6 }), b: f({ x: 30.8, z: -30.8 }), r: 0.55, h: 7.4, w: 1.3 });
export const SWING = f({ x: 23.0, z: -23.0, drop: WALK_HEIGHT - 0.7, w: 0.55 });
// The sleepy sloth hangs from a limb of its tree on the west side, above the Sleepy Sloth's find ring (-32.5, -14.8): she stands under it.
export const SLOTH_TREE = f({ x: -34.4, z: -15.2, r: 0.45, h: 7 });
export const SLOTH = f({ x: -32.9, z: -14.9, limbY: 3.0 });
// The hidden orchid blooms on a mossy stump in the east ferns, beside the Hidden Orchid's find ring (36, 10).
export const ORCHID = f({ x: 38.0, z: 9.2, r: 0.4, h: 0.7 });

// ---- the Rain Supper: the table, the lanterns, the windows, the strings --------------------------------------------------------------------------
const L = P.LODGE;
export const EAVE_Z = r2(L.z1 + 0.3); // the front edge of the veranda's roof
// The ring of hanging lanterns: ten along the eave, a little higher and lower in turn; the supper lights them one after another.
export const LANTERN_COUNT = 10;
export const supperBulbs = (n = LANTERN_COUNT) => [...Array(n)].map((_, i) => f({ x: r2(L.x0 + 0.7 + (i * (L.x1 - L.x0 - 1.4)) / (n - 1)), y: r2(L.deck + 2.55 - 0.2 * (i % 2)), z: EAVE_Z }));
// The windows the supper lights in turn: the lodge's two front windows and its door. (The lodge draws the panes; these are the glows over them.)
export const WINDOWS = Object.freeze([
  f({ x: -9.5, y: r2(L.deck + 1.5), z: r2(L.wallZ + 0.4) }),
  f({ x: -2.5, y: r2(L.deck + 1.5), z: r2(L.wallZ + 0.4) }),
  f({ x: -6, y: r2(L.deck + 1.2), z: r2(L.wallZ + 0.4) }),
]);
export const WINDOW_COUNT = WINDOWS.length;
// The plates on the table (the supper's candle-glows stand over them): the table's own three fruit slots.
export const PLATES = Object.freeze(TABLE.slots.map((s) => f({ x: s.x, y: r2(s.y + 0.15), z: s.z })));
// She may ask Mossy for the supper this near (Mossy sits at the veranda's back; the table is 3.8 m from her).
export const BEGIN_REACH = 3.2;
// The strings of lights (they come on when the table is set, and stay): along the log bridge's rope rail, and swung along the eave.
export function stringBulbs(step = 0.9) {
  const out = [];
  const B = P.LOG_BRIDGE;
  const n = Math.floor((B.len - 1) / step);
  for (let i = 0; i <= n; i++) {
    const z = B.z - (B.len - 1) / 2 + i * step;
    out.push(f({ x: r2(B.x + 0.75), y: r2(P.jungleY(B.x, z) + 1.25), z: r2(z) }));
  }
  const m = Math.round((L.x1 - L.x0) / step);
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    out.push(f({ x: r2(L.x0 + (L.x1 - L.x0) * t), y: r2(L.deck + 2.85 - 0.25 * Math.sin(Math.PI * t)), z: r2(EAVE_Z + 0.35) }));
  }
  return out;
}
// The fireflies of the supper glide in over the veranda's yard (see junglesupper.js): their orbit stands over the front of the veranda.
export const YARD = f({ x: r2((L.x0 + L.x1) / 2), z: r2(L.z1 + 3.2), y: 1.6 });

// ---- what is solid and what she can hop to -----------------------------------------------------------------------------------------------------
export const wingColliders = () => [
  f({ x: BANANA_PLANT.x, z: BANANA_PLANT.z, r: BANANA_PLANT.r }),
  f({ x: BRANCH_TREE.x, z: BRANCH_TREE.z, r: BRANCH_TREE.r }),
  f({ x: WALK.a.x, z: WALK.a.z, r: WALK.r }), f({ x: WALK.b.x, z: WALK.b.z, r: WALK.r }),
  f({ x: SLOTH_TREE.x, z: SLOTH_TREE.z, r: SLOTH_TREE.r }),
  f({ x: ORCHID.x, z: ORCHID.z, r: ORCHID.r }),
];
// The one hop: the low branch (kind 'tree': a living limb; a hop of 1.0 m, no skill, from the ground beside it).
export const wingPerches = () => [{ x: BRANCH.x, z: BRANCH.z, y: branchY(), kind: 'tree' }];

// The story's table for the base's Mossy (junglestory.js allFruits, and her goal spots for the meow's ring).
export const wingStory = () => ({
  fruits: FRUITS_B,
  spots: f({ set: f({ x: TABLE.x, z: TABLE.z, up: TABLE.y }), supper: f({ x: MOSSY.start.x, z: MOSSY.start.z, up: TABLE.y }) }),
});
