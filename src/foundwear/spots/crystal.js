// The Crystal Cave's find spots for the Glimmer Collar (src/world/crystalfindsplan.js, spawn (0, 28)): four on open stone, all on the floor (no hop, no
// skill), in the Rose hall and the passages beside it. None within 15 m of the spawn, 2 m of a golden mouse or a collectible, or inside a collider. Both
// editions. Four, not twelve: the plan (section 1) hides the collar in four places; test/foundspots.test.js allows four for the Reef and the cave.
export const CRYSTAL_SPOTS = Object.freeze([
  // behind the Rose hall's western crystals
  { id: 'fw-crystal-1', x: -31, z: 11, y: 0, look: 'grass' },
  // in the passage between the entry hall and the pool
  { id: 'fw-crystal-2', x: -8, z: 10, y: 0, look: 'grass' },
  // on the stone south of the Rose hall
  { id: 'fw-crystal-3', x: -27, z: -9, y: 0, look: 'grass' },
  // in the middle of the cave, near the pool's western end
  { id: 'fw-crystal-4', x: 3, z: 8, y: 0, look: 'grass' },
]);
