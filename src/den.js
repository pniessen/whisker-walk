// v17 Cozy Den — furniture catalog + fixed anchor spots. Data + pure helpers
// only: no THREE import here (this module is consumed by both
// src/progression.js, which must stay free of rendering deps, and the
// Task 7.2 world builder, which turns DEN_SPOTS' positions into THREE
// objects). No import back to progression.js either, so there is no cycle:
// progression.js -> den.js is one-directional.

export const DEN_ITEMS = {
  rug: { name: 'Sunbeam Rug', price: 30 },
  cattree: { name: 'Deluxe Cat Tree', price: 60 },
  fishtank: { name: 'Bubbling Fish Tank', price: 45 },
  bed: { name: 'Donut Bed', price: 25 },
  lamp: { name: 'Warm Lamp', price: 20 },
  scratcher: { name: 'Scratching Post', price: 20 },
};

// Six fixed anchor points inside a 16x16 den room centered on the origin
// (bounds ±8 on both axes). Every spot sits at least 2 units from every
// other spot and at least 1.5 units clear of the walls, so the Task 7.2
// world builder can drop a furniture mesh at each position without it
// clipping a wall or overlapping a neighboring piece.
export const DEN_SPOTS = [
  { id: 'rug-spot', x: 0, z: 2 },
  { id: 'corner-a', x: -6, z: -6 },
  { id: 'corner-b', x: 6, z: -6 },
  { id: 'window', x: 0, z: -6.5 },
  { id: 'shelf', x: 6.5, z: 0 },
  { id: 'center', x: 0, z: 0 },
];
