// =============================================================================
// THE REEF, THE GALLEON (milestone R16). Pure data and pure functions (no THREE, no clock, no Math.random): the sunken ship in the south-east, its stern cabin
// at sand level under a finite ceiling (she can float inside), its open deck amidships as a tilted ramp (the ship lies on her side, the low rail faces south
// and the deck rises toward the north rail by less than 0.5 m per metre), its bow buried in the sand, the colliders, the brass diving suit on the seabed, the
// golden mouse's place and WRECK_CLUES (the torn map's trail; R17 reads it, nothing here is a rule yet). reefwreckparts.js draws it; reefwrecklife.js flies
// the flag; the tests read the numbers. u runs along the keel (the stern at -8, the bow at +8), v across it (+v is south, the low rail). North is -z.
// docs/superpowers/plans/2026-11-27-reef-wave2.md decision 6. Additive: the base Reef reads this through the stage (reefstages.js ST.wreck) only.
// =============================================================================

// This stage imports nothing from the base chunk (reefplan.js lives in the start-up download, and a file two chunks import is split out into a file of its own,
// which costs start-up size): reef.js hands the ground's functions and its two region lists in through installWreckGround before anything is drawn.
let G = null;
export const baseY = (x, z) => G.reefBaseY(x, z); // the dunes alone
export const topY = (x, z) => G.reefY(x, z); // the dunes and the deck

export const WRECK = Object.freeze({ x: 37, z: -33, half: 3, stern: -8, bow: 8, rise: 0.42, rail: 0.9, bulkhead: -3.2, foreWall: 3.4, mast: 7.4 });
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const wreckU = (x) => x - WRECK.x;
export const wreckV = (z) => z - WRECK.z;
export const wreckPoint = (u, v) => Object.freeze({ x: WRECK.x + u, z: WRECK.z + v });

// ---- the tilted deck: ground raised over the dunes ---------------------------------------------------------------------------
// Over the amidships (u -3.2 to 3.6, the whole width) the ground rises linearly from the low rail (v +3, no rise) to the high rail (v -3, 6 m x 0.42 = 2.52 m).
// The edges that meet a wall ease to nothing over half a metre (a bulkhead, the fore wall and the north rail stand there, so that part is never walked).
export const deckInside = (x, z) => { const u = wreckU(x); const v = wreckV(z); return u >= -3.2 && u <= 3.6 && v >= -3 && v <= 3; };
export function deckRaise(x, z) {
  const u = wreckU(x); const v = wreckV(z);
  return WRECK.rise * (3 - v) * smooth((u + 3.2) / 0.5) * smooth((3.6 - u) / 0.5) * smooth((v + 3) / 0.5);
}
// The deck plane over the seabed (the same line without the easing): what the planks are drawn on.
export const deckPlane = (v) => WRECK.rise * (3 - v);

// ---- the stern cabin: sand level under a flat ceiling -------------------------------------------------------------------------
export const CABIN = Object.freeze({ u0: -8, u1: -3.2, v0: -3, v1: 3 });
export const cabinInside = (x, z) => { const u = wreckU(x); const v = wreckV(z); return u >= CABIN.u0 && u <= CABIN.u1 && v >= CABIN.v0 && v <= CABIN.v1; };
// The ceiling's height over the seabed's zero: one flat roof, at least 3.3 m over the highest sand beneath it (she floats 2.2 m at most).
let roof = null;
export function cabinCeilY() {
  if (roof === null) {
    let hi = 0;
    for (let u = CABIN.u0; u <= CABIN.u1 + 1e-9; u += 0.4) for (let v = CABIN.v0; v <= CABIN.v1 + 1e-9; v += 0.4) hi = Math.max(hi, baseY(WRECK.x + u, WRECK.z + v));
    roof = Math.ceil((hi + 3.3) * 20) / 20;
  }
  return roof;
}

/** Adds the deck's raise and the cabin's ceiling to the Reef's ground (once): env is { reefY, reefBaseY, raise, ceil } (reefplan.js's two functions and two region lists). */
export function installWreckGround(env) {
  if (G) return;
  G = env;
  env.raise.push({ contains: deckInside, raise: deckRaise });
  env.ceil.push({ contains: cabinInside, ceil: () => cabinCeilY() });
}

// ---- what is solid ----------------------------------------------------------------------------------------------------------------
// Chains of circles, 0.9 m apart (r 0.5, so no cat slips between two). The hull's two sides, the stern wall, the bulkhead between the cabin and the deck, the
// fore wall, the buried bow's two sides; the openings are the cabin's breach in the south side (u -6.7 to -3.5, 2.2 m clear) and the low rail's boarding gap
// (u -1.6 to 1.6, 2.2 m clear). Then the mast, two cannons on the high rail, a cannon fallen on the sand, the cabin's table and a barrel, and the brass suit.
export const WRECK_R = 0.5;
const C = (x, z, r = WRECK_R) => Object.freeze({ x, z, r });
const chain = (a, b) => {
  const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.9));
  const out = [];
  for (let i = 0; i <= n; i++) { out.push(C(Math.round((a.x + ((b.x - a.x) * i) / n) * 100) / 100, Math.round((a.z + ((b.z - a.z) * i) / n) * 100) / 100)); }
  return out;
};
export const BREACH = Object.freeze({ u0: -6.7, u1: -3.5 });
export const BOARDING = Object.freeze({ u0: -1.6, u1: 1.6 });
export const CABIN_TABLE = Object.freeze({ x: 30.6, z: -34.4, r: 0.7 });
export const BRASS_SUIT = Object.freeze({ x: 33.6, z: -26.2, yaw: 0.5, r: 0.5 });
export const LOOSE_CANNON = Object.freeze({ x: 41.4, z: -28.8, r: 0.45 });
export const CANNONS = Object.freeze([Object.freeze({ u: -1.8, v: -2.0 }), Object.freeze({ u: 1.6, v: -2.0 })]);
export const MAST = Object.freeze({ u: 0.3, v: -0.5, r: 0.4 });
export function wreckColliders() {
  const w = WRECK;
  const out = [
    ...chain(wreckPoint(-7.65, -2.85), wreckPoint(3.4, -2.85)), // the high rail's side
    ...chain(wreckPoint(-7.65, 2.85), wreckPoint(BREACH.u0, 2.85)), // the low rail's side in three runs: the stern corner, then the breach, ...
    ...chain(wreckPoint(BREACH.u1, 2.85), wreckPoint(BOARDING.u0, 2.85)), // ...the bulkhead to the boarding gap, then the gap, ...
    ...chain(wreckPoint(BOARDING.u1, 2.85), wreckPoint(3.4, 2.85)), // ...and the forecastle
    ...chain(wreckPoint(-7.65, -2.85), wreckPoint(-7.65, 2.85)), // the stern wall
    ...chain(wreckPoint(w.bulkhead, -2.85), wreckPoint(w.bulkhead, 2.85)), // the bulkhead
    ...chain(wreckPoint(w.foreWall, -2.85), wreckPoint(w.foreWall, 2.85)), // the fore wall
    ...chain(wreckPoint(3.4, -2.85), wreckPoint(7.2, -0.3)), // the buried bow's north side...
    ...chain(wreckPoint(3.4, 2.85), wreckPoint(7.2, 0.3)), // ...and its south side
    C(wreckPoint(7.3, 0).x, wreckPoint(7.3, 0).z),
    C(wreckPoint(MAST.u, MAST.v).x, wreckPoint(MAST.u, MAST.v).z, MAST.r),
    ...CANNONS.map((c) => C(wreckPoint(c.u, c.v).x, wreckPoint(c.u, c.v).z, 0.4)),
    C(LOOSE_CANNON.x, LOOSE_CANNON.z, LOOSE_CANNON.r),
    C(CABIN_TABLE.x, CABIN_TABLE.z, CABIN_TABLE.r),
    C(wreckPoint(-7.0, 1.9).x, wreckPoint(-7.0, 1.9).z, 0.4), // a barrel in the stern corner
    C(BRASS_SUIT.x, BRASS_SUIT.z, BRASS_SUIT.r),
  ];
  return out;
}

// ---- the golden mouse and the spotted-ship point ----------------------------------------------------------------------------
export const CABIN_MOUSE = Object.freeze({ x: 31.6, z: -33.4, y: 0 }); // on the cabin floor beside the table (src/goldmice.js and reeffindsplan.js hold the same spot)
export const GALLEON_SPOT = Object.freeze({ x: WRECK.x, z: WRECK.z, range: 12 }); // the journal page 'rfgalleon' is spotted from here

// ---- the jolly roger -------------------------------------------------------------------------------------------------------------
export const FLAG = Object.freeze({ u: MAST.u, v: MAST.v, w: 1.5, h: 1.0, cols: 11, rows: 9 }); // hangs from the mast's top, streaming toward the stern
// The cloth's cells: '#' white (the skull and the crossed bones), '.' black. Eleven columns by nine rows, one string per row.
export const FLAG_CELLS = Object.freeze((() => {
  const grid = Array.from({ length: FLAG.rows }, () => Array(FLAG.cols).fill('.'));
  for (let r = 0; r < FLAG.rows; r++) { const c = Math.round((r * (FLAG.cols - 1)) / (FLAG.rows - 1)); grid[r][c] = '#'; grid[r][FLAG.cols - 1 - c] = '#'; }
  const skull = ['#####', '#.#.#', '#####', '.###.', '.#.#.'];
  for (let r = 0; r < skull.length; r++) for (let c = 0; c < 5; c++) grid[r + 2][c + 3] = skull[r][c];
  return grid.map((row) => row.join(''));
})());

// ---- the map's trail (R17 reads this; no map or chest logic exists yet) ------------------------------------------------------------
// Three places, visited in order, that the torn map points to; the chest rule is that the X marks where the Captain's Chest is buried elsewhere in the
// Reef. The anchor clue is the Old Anchor itself (reefdeep.js ANCHOR), the boat clue the Sunken Boat's open stern (BOAT_STERN) and the lantern clue the third
// lantern coral (reefwing.js LANTERNS[2]); the numbers are copied, not imported, so this stage's chunk imports nothing else from the base chunk (a shared file is
// split out of it, at a cost in size), and test/reefwreck.test.js holds them equal. `{ id, x, z }`; R17 adds the reach and the words.
export const WRECK_CLUES = Object.freeze([
  Object.freeze({ id: 'anchor', x: -23.5, z: -29.5 }),
  Object.freeze({ id: 'boat', x: -31.8, z: -27.9 }),
  Object.freeze({ id: 'lantern', x: 21.2, z: -16.4 }),
]);
