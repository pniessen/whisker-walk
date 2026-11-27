// =============================================================================
// THE TREEHOUSE VILLAGE: THE FINDS' PLAN (milestone T3). Where the six discoveries are, the six collectibles, the three golden mice (the same three as src/goldmice.js;
// test/treehousefinds.test.js holds the two lists equal) and the markers. Pure data: no THREE, no clock, no rng. A find is made by where she stands, how HIGH she stands (a deck is
// not the ground under it) and how still she is, on foot or by the planned hops (at most 1.4 m each, no skill). North is -z. Every ring sits on a perch of treehouseplan.js (or on
// open roots), so it is reached the day the deck is drawn. Plan: docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 2.7, 2.8.
// =============================================================================

// ---- the discoveries: zone by short id (src/treehousepages.js: bakery, books, bell, bridge, lookout, acorn) --------------------------------------
// { x, z, y, r, still }: she finds it standing within r, within HIGH_TOL of y, for `still` seconds.
export const HIGH_TOL = 0.8;
const F = (x, z, y, r, still) => Object.freeze({ x, z, y, r, still });
export const TREEHOUSE_FIND_ZONES = Object.freeze({
  bakery: Object.freeze([F(-8.2, 10.4, 1.4, 1.2, 0.6)]), // the Bakery deck, by the warm window
  books: Object.freeze([F(7.6, 1.2, 2.8, 1.3, 0.6)]), // the Bookshop deck, under the shelves
  bell: Object.freeze([F(-0.6, -14.0, 5.6, 0.9, 0.5)]), // the Crown deck, beneath the Bell Tower's bell
  bridge: Object.freeze([F(3.15, 3.5, 2.8, 1.2, 0.8)]), // the branch walk, halfway across
  lookout: Object.freeze([F(-2.6, -14.6, 5.6, 0.9, 0.8)]), // the Crown deck's lookout, looking out over the leaves
  acorn: Object.freeze([F(12, -14, 0, 1.6, 1.0)]), // the giant acorn, under the far branches
});
export const TREEHOUSE_FIND_IDS = Object.freeze(['bakery', 'books', 'bell', 'bridge', 'lookout', 'acorn']);
export const TREEHOUSE_FIND_MARKS = Object.freeze(Object.fromEntries(TREEHOUSE_FIND_IDS.map((id) => { const z = TREEHOUSE_FIND_ZONES[id][0]; return [id, Object.freeze({ x: z.x, z: z.z, y: z.y })]; })));

// ---- the six collectibles: four acorns and two golden leaves, out on the open roots (ids load-bearing once shipped) ----------------------------
const K = (id, x, z, kind) => Object.freeze({ id, x, z, kind });
export const TREEHOUSE_COLLECTIBLES = Object.freeze([
  K('tree-1', -12, 22, 'acorn'), K('tree-2', 14, 20, 'acorn'), K('tree-3', -20, 2, 'leaf'),
  K('tree-4', 20, -2, 'acorn'), K('tree-5', -12, -6, 'leaf'), K('tree-6', 22, -14, 'acorn'),
]);

// ---- the three golden mice (y is metres over the ground): on the roots, on the far platform, on the crown deck by the bell. Each stands on a perch of the plan (f2, k1). ----
export const TREEHOUSE_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-treehouse-1', x: -5.5, z: -2.5, y: 0 }),
  Object.freeze({ id: 'gm-treehouse-2', x: 6.2, z: -5.6, y: 4.2 }),
  Object.freeze({ id: 'gm-treehouse-3', x: 1.4, z: -13.2, y: 5.6 }),
]);
