// =============================================================================
// THE CRYSTAL CAVE: THE FINDS' PLAN (milestone C3). Where the six discoveries are, the six collectibles, the three golden mice (the same three as
// src/goldmice.js; test/crystalfinds.test.js holds the two lists equal), the three scenic spots and the markers. Pure data: no THREE, no clock, no rng.
// The Rose Crystal and the Echo Wall (entry hall and Rose hall) and the Crystal Garden (the Rose hall's south) stand in the places C1 drew; the Glow Pool, the
// Gold Vein and the Heart Crystal are at their plan coordinates on floor that milestone C5 dresses. All are found by where she stands and how still she is,
// on foot, with no skill. North is -z. docs/superpowers/plans/2026-11-26-crystal-cave.md sections 1, 4 and 6.
// =============================================================================

// ---- the discoveries: zone by journal short id (src/crystalpages.js: rose, echo, pool, gold, garden, heart) -------------------------------------------
// { x, z, r, still }: she finds it standing within r for `still` seconds.
const F = (x, z, r, still) => Object.freeze({ x, z, r, still });
export const CRYSTAL_FIND_ZONES = Object.freeze({
  rose: Object.freeze([F(-19.2, 2.8, 1.8, 0.5)]), // beside the great Rose crystal
  echo: Object.freeze([F(-6.5, 20.5, 1.5, 0.8)]), // the entry hall's wall: stand by it and it hums back
  pool: Object.freeze([F(17.5, -0.5, 1.6, 1)]), // the Blue Pool's east shore (milestone C5 draws the water)
  gold: Object.freeze([F(-10.5, -25, 1.5, 0.6)]), // the Gold Gallery's wall (milestone C5)
  garden: Object.freeze([F(-17, -4.5, 1.6, 1.2)]), // the Rose hall's south: tiny crystals like flowers
  heart: Object.freeze([F(19, -18.5, 1.8, 1.5)]), // before the Heart Crystal's hall (milestone C5)
});
export const CRYSTAL_FIND_IDS = Object.freeze(['rose', 'echo', 'pool', 'gold', 'garden', 'heart']);
export const CRYSTAL_FIND_MARKS = Object.freeze(Object.fromEntries(CRYSTAL_FIND_IDS.map((id) => [id, Object.freeze({ x: CRYSTAL_FIND_ZONES[id][0].x, z: CRYSTAL_FIND_ZONES[id][0].z })])));

// ---- the six collectibles: four crystal bits and two smooth pebbles, in the entry hall, the passage and the Rose hall (ids load-bearing once shipped) -----
const K = (id, x, z, kind) => Object.freeze({ id, x, z, kind });
export const CRYSTAL_COLLECTIBLES = Object.freeze([
  K('cave-1', -2.5, 17, 'bit'), K('cave-2', 6, 18, 'pebble'), K('cave-3', -13, 11.5, 'bit'),
  K('cave-4', -26, 9, 'bit'), K('cave-5', -15, 0.5, 'pebble'), K('cave-6', -24, -4, 'bit'),
]);

// ---- the three golden mice: one under the Rose arch, one on a stepping crystal at the pool, one behind the Heart (y is metres over the floor; all on foot) --
export const CRYSTAL_GOLD = Object.freeze([
  Object.freeze({ id: 'gm-crystal-1', x: -28, z: 4, y: 0 }),
  Object.freeze({ id: 'gm-crystal-2', x: 14, z: -4, y: 0 }),
  Object.freeze({ id: 'gm-crystal-3', x: 26, z: -26, y: 0 }),
  // wing C stubs (X0; the same two as src/goldmice.js): the scatter reads only the first three by name (crystaldecor.js CRYSTAL_GOLD_SCATTER_IDS), so nothing reshuffles
  Object.freeze({ id: 'gm-crystal-4', x: 25, z: 12, y: 0 }),
  Object.freeze({ id: 'gm-crystal-5', x: -25, z: 19.5, y: 1.0 }), // (on the forge shelf since C2)
  // second story stubs (C0; the same two as src/goldmice.js, placed for real in C7): the scatter reads only the first three by name
  Object.freeze({ id: 'gm-crystal-6', x: -28, z: -26, y: 0 }),
  Object.freeze({ id: 'gm-crystal-7', x: -31, z: -28, y: 0.9 }),
]);

// ---- scenic spots (the daily goal "visit a scenic spot"; plain nouns, the same in both word sets) --------------------------------------------------
export const CRYSTAL_SCENICS = Object.freeze([
  Object.freeze({ id: 'cave-rose', x: -20.5, z: 7, label: 'the Rose Hall' }),
  Object.freeze({ id: 'cave-pool', x: 10, z: -1, label: 'the Blue Pool' }),
  Object.freeze({ id: 'cave-gold', x: -3.5, z: -19, label: 'the Gold Gallery' }),
]);
