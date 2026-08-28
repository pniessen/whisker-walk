// v17 Cozy Den — furniture catalog + fixed anchor spots. Data + pure helpers
// only: no THREE import here (this module is consumed by both
// src/progression.js, which must stay free of rendering deps, and the
// Task 7.2 world builder, which turns DEN_SPOTS' positions into THREE
// objects). No import back to progression.js either, so there is no cycle:
// progression.js -> den.js is one-directional.

// THE CATALOG IS APPEND-ONLY. Every id here is somebody's bought furniture:
// it is persisted in `state.den.owned` (an array of ids) and referenced by
// `state.den.placed` (spot id -> item id), and progression.js's sanitizeDen
// drops any id this table no longer knows. Removing or renaming an entry
// therefore does not "retire" a piece of furniture — it silently deletes it
// from every save that bought it, refunds nothing, and empties the spot it
// stood in. The six v17 pieces below are frozen for that reason; the density
// pass adds to the bottom of the table and changes nothing above it.
//
// Prices follow the v17 ladder rather than inventing a second one: small
// clutter 15-20, a real piece of furniture 25-40, a big statement piece
// 50-60. The cat tree stays the most expensive thing in the room.
export const DEN_ITEMS = {
  // --- v17, shipped. Do not rename, do not remove. ---
  rug: { name: 'Sunbeam Rug', price: 30 },
  cattree: { name: 'Deluxe Cat Tree', price: 60 },
  fishtank: { name: 'Bubbling Fish Tank', price: 45 },
  bed: { name: 'Donut Bed', price: 25 },
  lamp: { name: 'Warm Lamp', price: 20 },
  scratcher: { name: 'Scratching Post', price: 20 },
  // --- density pass. Six more pieces, three of them climbable. ---
  toybasket: { name: 'Basket of Toys', price: 15 },
  plant: { name: 'Big Leafy Plant', price: 20 },
  tunnel: { name: 'Crinkle Tunnel', price: 35 },
  armchair: { name: 'Comfy Armchair', price: 40 },
  telly: { name: 'Telly on a Stand', price: 50 },
  dresser: { name: 'Oak Dresser', price: 55 },
};

// ---------------------------------------------------------------------------
// THE CAMERA WEDGE — why the room is furnished around a hole.
//
// The den's south side is deliberately open (a knee-high rail instead of a
// wall) because the third-person follow camera sits ~4.4 units further +z
// than the cat and would otherwise spend every den walk looking at the
// outside of a wall. See the long comment in src/world/den.js's build().
//
// Leaving the WALL open is only half of it. The cat spawns at (0, 4) facing
// -z, which puts the camera at roughly (0, 2.2, 8.4) looking down at the cat
// at (0, 0.6, 4): a straight line through the volume z >= 4.5, |x| <= 3.
// Anything tall standing in that volume fills the frame the instant a den
// walk starts, which is the same bug as a solid south wall wearing a
// different hat. So nothing taller than `maxH` may stand there — and that
// includes every ANCHOR SPOT, since a spot can hold the 1.6-tall cat tree.
//
// maxH 0.5 is chosen off the shipped south rail (0.4) plus a little: a rug, a
// mat, a bag or a basket may sit in the wedge; a bookcase, a plant or a
// dresser may not. test/den.test.js checks every spot and every fixed
// furnishing against this, so a future prop cannot quietly re-close the
// fourth wall.
// ---------------------------------------------------------------------------
export const DEN_CAMERA_WEDGE = Object.freeze({ halfWidth: 3, minZ: 4.5, maxH: 0.5 });

// clearsCamera(x, z, r, h) — may a prop of height `h` and footprint radius `r`
// stand at (x, z)? True for anything short enough not to matter, and for
// anything whose footprint clears the wedge on either side or in front of it.
export function clearsCamera(x, z, r = 0, h = 0) {
  if (h <= DEN_CAMERA_WEDGE.maxH) return true;
  return Math.abs(x) - r > DEN_CAMERA_WEDGE.halfWidth || z + r < DEN_CAMERA_WEDGE.minZ;
}

// Twelve fixed anchor points inside a 16x16 den room centered on the origin
// (bounds ±8 on both axes). Every spot sits at least 2 units from every
// other spot and at least 1.5 units clear of the walls, so the Task 7.2
// world builder can drop a furniture mesh at each position without it
// clipping a wall or overlapping a neighboring piece.
//
// The six v17 ids are frozen for the same reason the catalog ids are: they
// are the keys of `state.den.placed`. The six added by the density pass all
// clear the camera wedge above (all six are either north of z 4.5 or more
// than 3 units off the centre line), and all twelve are far enough apart that
// the room stays walkable with the widest piece in the catalog standing in
// every one of them — test/den.test.js flood-fills exactly that case.
export const DEN_SPOTS = [
  // --- v17, shipped. Do not rename, do not remove. ---
  { id: 'rug-spot', x: 0, z: 2 },
  { id: 'corner-a', x: -6, z: -6 },
  { id: 'corner-b', x: 6, z: -6 },
  { id: 'window', x: 0, z: -6.5 },
  { id: 'shelf', x: 6.5, z: 0 },
  { id: 'center', x: 0, z: 0 },
  // --- density pass. ---
  { id: 'nook', x: -3.5, z: -6.5 },       // west of the window, under the pictures
  { id: 'alcove', x: 3.5, z: -6.5 },      // east of the window
  { id: 'west-wall', x: -6.5, z: 0 },     // mirrors 'shelf' across the room
  { id: 'east-mid', x: 3.2, z: -3.2 },    // the one mid-floor anchor away from the centre
  { id: 'corner-c', x: -6.5, z: 5.5 },    // fireside, |x| 6.5 — well clear of the camera wedge
  { id: 'corner-d', x: 6.2, z: 5.5 },     // the same on the east side of the open wall
];
