// The Treehouse village's find spots for the Canopy Cap (src/world/treehousefindsplan.js, spawn (0, 25)): four, two on the ground (among the oak's roots, by the hollow log) and two on a
// deck's planks (the Bakery's sill, the branch walk), each walked to up the flights of stairs (y is metres over the ground under it: the decks are ground now, 1.4 and 2.8). None within 15 m of the spawn, 2 m of a golden mouse or a
// collectible at its own height, 3 m of either yarn-ball spot (src/propsets.js), or inside a collider. Both editions. Four, not twelve: the plan (section 2.10) hides the cap in four
// places, and all four are placed at once (adding one later changes the find key). The plan's fourth place, the lookout, is five hops up the crown, so the hollow log takes its turn.
export const TREEHOUSE_SPOTS = Object.freeze([
  { id: 'fw-treehouse-1', x: -4.4, z: -9.4, y: 0, look: 'grass' }, // among the great oak's roots
  { id: 'fw-treehouse-2', x: -6.0, z: 10.0, y: 0, look: 'perch' }, // on the Bakery deck (ground 1.4: y is metres over the ground under it), by the sill
  { id: 'fw-treehouse-3', x: -3.9, z: 7.7, y: 0, look: 'perch' }, // on the branch walk's landing (ground 2.8), a little way out
  { id: 'fw-treehouse-4', x: -21, z: -13, y: 0, look: 'grass' }, // by the hollow log and the brook
]);
