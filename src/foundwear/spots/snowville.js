// Snowville's find spots for the Snowflake Scarf (src/world/snowvillefindsplan.js, spawn (0, 30)): four in the open snow, all on the ground (no hop, no skill). None within 15 m of
// the spawn, 3 m of either yarn-ball spot (src/propsets.js), 2 m of a golden mouse or a collectible, or inside a collider. Both editions. Four, not twelve: the plan (section 1.10)
// hides the scarf in four places, and all four are placed at once (adding one later changes the find key).
export const SNOWVILLE_SPOTS = Object.freeze([
  // in the drift at the village's west edge
  { id: 'fw-snowville-1', x: -33, z: 13, y: 0, look: 'grass' },
  // on the skating pond's far bank
  { id: 'fw-snowville-2', x: -31, z: -18, y: 0, look: 'grass' },
  // under the sled hill's flank, by the rock
  { id: 'fw-snowville-3', x: 30, z: -10, y: 0, look: 'grass' },
  // at the Great Fir's foot
  { id: 'fw-snowville-4', x: 11, z: -28, y: 0, look: 'grass' },
]);
