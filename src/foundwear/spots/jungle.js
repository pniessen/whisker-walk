// The Jungle lodge's find spots for the Fern Anklet (src/world/junglefindsplan.js, spawn (0, 32)): four on open ground, all on foot (no hop, no skill): by the mango tree, the lodge's
// back garden, the log bridge's far bank and the canopy walk's far end. None within 15 m of the spawn, 3 m of either yarn-ball spot (src/propsets.js), 2 m of a golden mouse or a
// collectible, or inside a collider. Both editions. Four, not twelve: the plan (section 3.10) hides the anklet in four places, and all four are placed at once (adding one later
// changes the find key). The plan's first place, the stone ring, is within the spawn's 15 m, so the lodge's back garden takes its turn.
export const JUNGLE_SPOTS = Object.freeze([
  { id: 'fw-jungle-1', x: -30, z: 6, y: 0, look: 'grass' }, // by the mango tree in the fruit grove
  { id: 'fw-jungle-2', x: -16, z: 8, y: 0, look: 'grass' }, // in the ferns behind the lodge
  { id: 'fw-jungle-3', x: 10.5, z: -11, y: 0, look: 'grass' }, // on the river's north bank, past the log bridge
  { id: 'fw-jungle-4', x: 33, z: -32, y: 0, look: 'grass' }, // at the far end of the canopy walk
]);
