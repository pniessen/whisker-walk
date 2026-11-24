// The Moon's find spots (src/world/moonplan.js, spawn (0, 45)): twelve on open dust, all on the ground (no hop needed), none within 15 m
// of the spawn, 2 m of a golden mouse or a pebble, 3 m of a job's point (Pip's bed, the cells, the board, Dot), a collider or a
// crater's wall, and each well away from the ground the later wings are built on (Star Hill, the Launch Complex, the Cave Massif).
// test/foundspots.test.js proves each one against the built place.
export const MOON_SPOTS = Object.freeze([
  { id: 'fw-moon-1', x: -8, z: 28, y: 0, look: 'post' },
  { id: 'fw-moon-2', x: 17, z: 46, y: 0, look: 'grass' },
  { id: 'fw-moon-3', x: -42, z: 42, y: 0, look: 'post' },
  { id: 'fw-moon-4', x: -44, z: -22, y: 0, look: 'grass' },
  { id: 'fw-moon-5', x: -12, z: 12, y: 0, look: 'post' },
  { id: 'fw-moon-6', x: 10, z: 18, y: 0, look: 'grass' },
  { id: 'fw-moon-7', x: 28, z: 12, y: 0, look: 'post' },
  { id: 'fw-moon-8', x: 46, z: -24, y: 0, look: 'grass' },
  { id: 'fw-moon-9', x: -34, z: -8, y: 0, look: 'post' },
  { id: 'fw-moon-10', x: 2, z: -14, y: 0, look: 'grass' },
  { id: 'fw-moon-11', x: 20, z: -12, y: 0, look: 'post' },
  { id: 'fw-moon-12', x: -48, z: 36, y: 0, look: 'grass' },
]);
