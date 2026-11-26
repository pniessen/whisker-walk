// The Reef's find spots for the Pearl Collar (src/world/reeffindsplan.js, spawn (0, 36)): four on the seabed, all on open sand (no hop; the float
// is never needed), a clam in the coral's outskirts, beside where the Old Anchor will lie, behind where the Sunken Boat will rest and on the Sandy
// Flats beside the chest. None within 15 m of the spawn, 2 m of a golden mouse or a collectible, or inside a collider. Both editions. Four, not
// twelve: the plan (section 6) hides the collar in four places; test/foundspots.test.js allows four for the Reef alone.
export const REEF_SPOTS = Object.freeze([
  // a clam in the coral's east outskirts
  { id: 'fw-reef-1', x: 24, z: -12, y: 0, look: 'grass' },
  // on the sand east of where the Old Anchor will lie
  { id: 'fw-reef-2', x: -17, z: -30, y: 0, look: 'grass' },
  // on the sand behind where the Sunken Boat will rest
  { id: 'fw-reef-3', x: -27, z: -39, y: 0, look: 'grass' },
  // on the Sandy Flats, a few strides from the chest
  { id: 'fw-reef-4', x: -1.5, z: -18.5, y: 0, look: 'grass' },
]);
