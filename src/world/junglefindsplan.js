// =============================================================================
// THE JUNGLE LODGE: THE FINDS' PLAN (milestone J3). Where the six discoveries are, the six collectibles and the three golden mice (the same three as src/goldmice.js;
// test/junglefinds.test.js holds the two lists equal). Pure data: no THREE, no clock, no rng. All are found by where she stands and how still she is, on foot, with no skill (the
// ground is one smooth function, so a ring has no height). North is -z. The places name the plan's (docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 3.7, 3.8):
// the sloth, the canopy walk and the orchid are drawn by later milestones (J4, J5); their rings stand on bare ground now, so the find works the day the thing is drawn.
// =============================================================================

// ---- the discoveries: zone by short id (src/junglepages.js: lodge, river, sloth, canopy, rainbow, orchid) -------------------------------------------
// { x, z, r, still }: she finds it standing within r for `still` seconds.
const F = (x, z, r, still) => Object.freeze({ x, z, r, still });
export const JUNGLE_FIND_ZONES = Object.freeze({
  lodge: Object.freeze([F(-8.4, 15.2, 1.1, 0.6)]), // the veranda, by the kitchen table
  river: Object.freeze([F(-8.5, -8.8, 1.2, 0.8)]), // in the slow river's shallows
  sloth: Object.freeze([F(-32.5, -14.8, 1.4, 1.0)]), // the sloth's tree
  canopy: Object.freeze([F(20.5, -20.5, 1.4, 0.8)]), // under the canopy walk, at the foot of its rise
  rainbow: Object.freeze([F(0, -31, 1.5, 1.2)]), // the north edge, where the rainbow rises
  orchid: Object.freeze([F(36, 10, 1.4, 1.0)]), // the hidden orchid, in the east ferns
});
export const JUNGLE_FIND_IDS = Object.freeze(['lodge', 'river', 'sloth', 'canopy', 'rainbow', 'orchid']);
export const JUNGLE_FIND_MARKS = Object.freeze(Object.fromEntries(JUNGLE_FIND_IDS.map((id) => [id, Object.freeze({ x: JUNGLE_FIND_ZONES[id][0].x, z: JUNGLE_FIND_ZONES[id][0].z })])));

// ---- the six collectibles: four jungle berries and two bright feathers, out on open ground (ids load-bearing once shipped) -----------------------------
const K = (id, x, z, kind) => Object.freeze({ id, x, z, kind });
export const JUNGLE_COLLECTIBLES = Object.freeze([
  K('jungle-1', -16, 26, 'berry'), K('jungle-2', 18, 25, 'berry'), K('jungle-3', -30, 22, 'feather'),
  K('jungle-4', 30, -6, 'berry'), K('jungle-5', -14, -22, 'feather'), K('jungle-6', 12, -26, 'berry'),
]);

// ---- the three golden mice (y is metres over the ground under them; all on foot): on the veranda boards, under the giant leaf by the river, on the canopy walk's low branch ----
// (the branch is drawn by J5, which lifts the third onto it, one hop)
export const JUNGLE_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-jungle-1', x: -3.4, z: 17.2, y: 0 }),
  Object.freeze({ id: 'gm-jungle-2', x: 6.2, z: -3.8, y: 0 }),
  Object.freeze({ id: 'gm-jungle-3', x: 26, z: -26, y: 0 }),
]);
