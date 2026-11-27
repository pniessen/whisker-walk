// =============================================================================
// SNOWVILLE: THE FINDS' PLAN (milestone V3). Where the six discoveries are, the six collectibles, the three golden mice (the same three as src/goldmice.js;
// test/snowvillefinds.test.js holds the two lists equal), the three scenic spots and the markers. Pure data: no THREE, no clock, no rng. All are found by where she stands
// and how still she is, on foot, with no skill. North is -z. The places name the plan's (docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 1.7, 1.8):
// the hill lantern, the pond and the burrow and the Great Fir are drawn by the later stage (V5); their zones stand on the ground now, so the find works the day the thing is drawn.
// =============================================================================

// ---- the discoveries: zone by short id (src/snowvillepages.js: lantern, pond, hare, fir, snowman, hearth) -----------------------------------------
// { x, z, r, still }: she finds it standing within r for `still` seconds.
const F = (x, z, r, still) => Object.freeze({ x, z, r, still });
export const SNOWVILLE_FIND_ZONES = Object.freeze({
  lantern: Object.freeze([F(20, -5.5, 2, 0.6)]), // the hill lantern at the foot of the sled path
  pond: Object.freeze([F(-16.5, -10, 1.8, 1)]), // the skating pond's east bank
  hare: Object.freeze([F(-8, -26, 2, 1.2)]), // the burrow in the fir wood: stand still and the shy hare peeks out
  fir: Object.freeze([F(8, -30, 2.2, 0.8)]), // the Great Fir's foot
  snowman: Object.freeze([F(4, 18, 2.2, 0.5)]), // beside the snowman in the lane
  hearth: Object.freeze([F(4.5, 31, 2.6, 0.5)]), // the spawn court's brazier
});
export const SNOWVILLE_FIND_IDS = Object.freeze(['lantern', 'pond', 'hare', 'fir', 'snowman', 'hearth']);
export const SNOWVILLE_FIND_MARKS = Object.freeze(Object.fromEntries(SNOWVILLE_FIND_IDS.map((id) => [id, Object.freeze({ x: SNOWVILLE_FIND_ZONES[id][0].x, z: SNOWVILLE_FIND_ZONES[id][0].z })])));

// ---- the six collectibles: four pinecones and two red winter berries, out in the open snow (ids load-bearing once shipped) -------------------------
const K = (id, x, z, kind) => Object.freeze({ id, x, z, kind });
export const SNOWVILLE_COLLECTIBLES = Object.freeze([
  K('snow-1', -14, 25, 'cone'), K('snow-2', 13, 31, 'berry'), K('snow-3', -29, 4, 'cone'),
  K('snow-4', 3, -9, 'cone'), K('snow-5', -17, -22, 'berry'), K('snow-6', 33, 9, 'cone'),
]);

// ---- the three golden mice: on the snow behind the baker's house, in the pond-side stump's hollow, by the sled hill's rock (y is metres over the ground; all on foot) ----
export const SNOWVILLE_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-snowville-1', x: 16, z: -1, y: 0 }),
  Object.freeze({ id: 'gm-snowville-2', x: -26, z: -4, y: 0 }),
  Object.freeze({ id: 'gm-snowville-3', x: 26, z: -26, y: 0 }),
]);

// ---- scenic spots (the daily goal "visit a scenic spot"; plain nouns, the same in both word sets) ------------------------------------------------
export const SNOWVILLE_SCENICS = Object.freeze([
  Object.freeze({ id: 'snow-square', x: -4, z: 13, label: 'the Village Square' }),
  Object.freeze({ id: 'snow-pond', x: -17, z: -6, label: 'the Skating Pond' }),
  Object.freeze({ id: 'snow-hill', x: 14, z: -10, label: 'the Sled Hill' }),
]);
