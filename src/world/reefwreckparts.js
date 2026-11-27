// =============================================================================
// THE REEF, THE GALLEON: THE DRAWING (milestone R16). The hull's walls (the high rail, the low rail with its boarding gap and the cabin's breach, the stern with
// its windows, the bulkhead, the fore wall and the buried bow with its bowsprit), the deck's planks laid on the tilted ground, the cabin (slatted roof, table, torn
// map, barrel), the mast with its yard and torn sail, three cannons and the brass diving suit standing on the sand. Everything goes into the kit's one 'paint'
// bucket (no new draw call, no real light, no canvas); every number is reefwreckplan.js's. reef.js hands in the base chunk's `paint`, `COL` and `THREE` (K), so this stage
// imports none of them (a file two chunks import is split out of the base chunk: reefparts.js costs 1.8 kB gzipped, and three's core 0.8 kB of start-up). The flag is the life's (reefwrecklife.js).
// =============================================================================

import * as W from './reefwreckplan.js';

let THREE = null; // handed in by reef.js with `paint` and `COL` (see the note above)
const reefY = W.topY;
const reefBaseY = W.baseY;

const WOOD = 0x8a6a46;
const WOOD_DARK = 0x5f4630;
const WOOD_WORN = 0xa58a62;
const IRON = 0x5d6b70;
const BRASS = 0xc9a24a;
const BRASS_DARK = 0x9a7a30;
const CANVAS = 0x7d8a6a;
const LEAD = 0x5a6064;
const GLASS = 0x8fd0d6;
const PARCHMENT = 0xe8dcb4;
const SAIL = 0xd9cfb4;

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const TILT = Math.atan(W.WRECK.rise); // about x: a +z end tilts down, the deck's slope

export function drawWreck(kit, M, K) {
  const { paint, COL } = K;
  THREE = K.THREE;
  const X = W.WRECK.x; const Z = W.WRECK.z;
  const put = (geo, hex, opts) => kit.put('paint', M.paint, paint(geo, hex), opts);
  // a box standing between two heights over a point of sand, turned about the vertical
  const wall = (u, v, len, depth, y0, y1, hex, ry = 0, opts) => put(box(len, y1 - y0, depth).rotateY(ry).translate(X + u, (y0 + y1) / 2, Z + v), hex, opts);
  const low = (u, v) => reefBaseY(X + u, Z + v) - 0.35; // a wall's foot, sunk into the sand
  const railTop = (v) => reefBaseY(X, Z + v) + W.deckPlane(v) + W.WRECK.rail; // the rail over the tilted deck at that side (the dune's own rise is small)
  const roofY = W.cabinCeilY();

  // ---- the two sides, stern to the fore wall ---------------------------------------------------------------------------------
  const plankTone = (i) => (i % 2 ? WOOD : WOOD_WORN);
  for (let i = 0, u = -7.7; u < 3.5; i++, u += 1.0) {
    const len = Math.min(1.04, 3.5 - u + 0.02);
    const mid = u + len / 2;
    wall(mid, -2.9, len, 0.34, low(mid, -2.9), Math.max(railTop(-2.9), roofY), plankTone(i)); // the high rail: tall, so the cabin and the deck share one wall
    // the low rail: a short bulwark, except at the cabin's breach (open to the roof) and the boarding gap
    const skip = (mid > W.BREACH.u0 - 0.05 && mid < W.BREACH.u1 + 0.05) || (mid > W.BOARDING.u0 - 0.05 && mid < W.BOARDING.u1 + 0.05);
    if (!skip) wall(mid, 2.9, len, 0.3, low(mid, 2.9), mid < W.CABIN.u1 ? roofY : reefBaseY(X + mid, Z + 2.9) + W.WRECK.rail, plankTone(i + 1));
  }
  // the lintels over the breach and the cabin's bulkhead side, so the roof has a beam to rest on
  wall(-5.1, 2.9, W.BREACH.u1 - W.BREACH.u0 - 1.0, 0.3, roofY - 0.5, roofY, WOOD_DARK);
  // ---- the stern wall, with its windows; the bulkhead; the fore wall -------------------------------------------------------------
  for (let i = 0, v = -2.9; v < 2.95; i++, v += 1.0) {
    wall(-7.85, v + 0.5, 0.34, 1.04, low(-7.85, v), roofY + 0.5, plankTone(i), 0, { noCast: false });
    wall(W.WRECK.bulkhead, v + 0.5, 0.3, 1.04, low(W.WRECK.bulkhead, v), roofY, plankTone(i + 1));
    wall(W.WRECK.foreWall + 0.1, v + 0.5, 0.34, 1.04, low(W.WRECK.foreWall, v), reefBaseY(X + 3.4, Z + v) + W.deckPlane(v) + 1.3, plankTone(i));
  }
  for (const v of [-1.9, 0, 1.9]) put(box(0.1, 0.55, 0.7).translate(X - 8.06, reefBaseY(X - 8, Z + v) + 2.2, Z + v), GLASS, { noCast: true }); // three stern windows
  put(box(0.4, 0.16, 6.4).translate(X - 8.1, roofY + 0.05, Z), WOOD_DARK); // the stern's gallery rail
  // the rudder hanging off the stern post, leaning
  put(box(0.14, 2.4, 0.9).rotateZ(0.08).translate(X - 8.35, reefBaseY(X - 8.3, Z) + 1.1, Z - 0.2), WOOD_DARK);

  // ---- the buried bow: a wedge of planks sinking into the sand, ribs and a bowsprit pointing up out of it -----------------------------
  for (let i = 0; i < 5; i++) {
    const u = 3.7 + i * 0.85;
    const half = 2.85 * (1 - (i / 5) ** 2) ** 0.5;
    const top = reefBaseY(X + u, Z) + 1.3 - i * 0.28;
    if (top < reefBaseY(X + u, Z) - 0.2) continue;
    for (const s of [-1, 1]) wall(u, s * half, 0.95, 0.3, low(u, s * half), top, plankTone(i + (s > 0 ? 1 : 0)), s * -0.3);
    wall(u, 0, 0.9, Math.max(0.2, half * 1.6), low(u, 0), Math.min(top, reefBaseY(X + u, Z) + 0.35 + 0.1 * (4 - i)), WOOD_DARK, 0, { noCast: true }); // the deck's own wedge, mostly under sand
  }
  put(cyl(0.1, 0.16, 4.2, 6).rotateZ(-Math.PI / 2 + 0.55).translate(X + 8.6, reefBaseY(X + 8.2, Z) + 1.6, Z), WOOD_DARK); // the bowsprit
  for (const [u, v, h, t] of [[6.2, -2.1, 1.0, 0.2], [5.6, 2.3, 0.8, -0.25], [4.6, -2.6, 0.7, 0.1]]) put(box(0.14, h, 0.2).translate(0, h / 2, 0).rotateZ(t).translate(X + u, reefBaseY(X + u, Z + v) - 0.05, Z + v), WOOD_DARK, { noCast: true }); // ribs

  // ---- the deck: thirteen planks laid across the slope ------------------------------------------------------------------------------
  const du0 = -2.7; const du1 = 3.1;
  for (let k = 0; k < 13; k++) {
    const v = -2.9 + 0.46 * k + 0.23;
    const y0 = reefY(X + du0, Z + v);
    const y1 = reefY(X + du1, Z + v); // the dune under the deck rises a little along the keel: the plank follows it
    const g = box(Math.hypot(du1 - du0, y1 - y0), 0.07, 0.45).rotateX(TILT).rotateZ(Math.atan2(y1 - y0, du1 - du0)).translate(X + (du0 + du1) / 2, (y0 + y1) / 2 + 0.01, Z + v);
    put(g, k % 2 ? WOOD : WOOD_WORN, { noCast: true });
  }
  // a few worn cross-battens over the planks
  for (const u of [-1.9, 0.9, 2.5]) put(box(0.12, 0.05, 5.8).rotateX(TILT).translate(X + u, reefY(X + u, Z) + 0.07, Z), WOOD_DARK, { noCast: true });

  // ---- the cabin: a slatted roof (the sea's light comes through), a table with the torn map, a barrel ---------------------------------
  for (let i = 0; i < 7; i++) put(box(0.5, 0.12, 6.3).translate(X + W.CABIN.u0 + 0.35 + i * 0.7, roofY + 0.05, Z), i % 2 ? WOOD_WORN : WOOD, { noCast: true });
  for (const v of [-2.7, -0.9, 0.9, 2.7]) put(box(4.9, 0.18, 0.2).translate(X - 5.6, roofY - 0.1, Z + v), WOOD_DARK, { noCast: true });
  const tb = W.CABIN_TABLE;
  const gy = reefBaseY(tb.x, tb.z);
  put(box(1.5, 0.08, 0.9).translate(tb.x, gy + 0.78, tb.z), WOOD_WORN);
  for (const [dx, dz] of [[-0.6, -0.34], [0.6, -0.34], [-0.6, 0.34], [0.6, 0.34]]) put(box(0.1, 0.78, 0.1).translate(tb.x + dx, gy + 0.39, tb.z + dz), WOOD_DARK, { noCast: true });
  put(box(0.7, 0.02, 0.5).rotateY(0.3).translate(tb.x + 0.1, gy + 0.83, tb.z), PARCHMENT, { noCast: true }); // the torn map (R17 gives it a job)
  put(box(0.2, 0.02, 0.12).rotateY(0.9).translate(tb.x + 0.2, gy + 0.845, tb.z + 0.04), 0xb4452f, { noCast: true }); // its red X
  const bz = W.wreckPoint(-7.0, 1.9);
  put(cyl(0.34, 0.38, 0.8, 8).translate(bz.x, reefBaseY(bz.x, bz.z) + 0.4, bz.z), WOOD_DARK);
  put(cyl(0.36, 0.36, 0.06, 8).translate(bz.x, reefBaseY(bz.x, bz.z) + 0.55, bz.z), IRON, { noCast: true });

  // ---- the mast, its yard and a torn sail; three cannons ----------------------------------------------------------------------------
  const m = W.wreckPoint(W.MAST.u, W.MAST.v);
  const my = reefY(m.x, m.z);
  put(cyl(0.16, 0.24, W.WRECK.mast, 7).translate(m.x, my + W.WRECK.mast / 2, m.z), WOOD_DARK);
  put(cyl(0.08, 0.1, 4.2, 6).rotateX(Math.PI / 2).translate(m.x, my + W.WRECK.mast - 1.6, m.z), WOOD); // the yard
  for (const [dz, h, tilt] of [[-1.4, 1.9, 0.06], [-0.5, 2.3, -0.04], [0.5, 1.7, 0.08], [1.4, 2.0, -0.06]]) {
    put(box(0.04, h, 0.7).translate(0, -h / 2, 0).rotateX(tilt).translate(m.x + 0.12, my + W.WRECK.mast - 1.7, m.z + dz), SAIL, { noCast: true }); // sail rags hanging from the yard
  }
  put(cyl(0.025, 0.025, 0.7, 4).translate(m.x, my + W.WRECK.mast + 0.35, m.z), WOOD); // the flag's staff (the life flies the cloth)
  for (const c of W.CANNONS) {
    const p = W.wreckPoint(c.u, c.v);
    const y = reefY(p.x, p.z);
    const gun = (geo, hex, opts) => put(geo.rotateX(TILT).translate(p.x, y + 0.02, p.z), hex, opts);
    gun(cyl(0.16, 0.2, 1.5, 7).rotateX(Math.PI / 2).translate(0, 0.36, 0), IRON);
    gun(box(0.62, 0.18, 1.0).translate(0, 0.16, 0.1), WOOD_DARK);
    for (const s of [-1, 1]) gun(cyl(0.22, 0.22, 0.08, 8).rotateZ(Math.PI / 2).translate(s * 0.34, 0.22, 0.1), WOOD, { noCast: true });
  }
  { // the cannon that rolled off, lying on the sand south of the hull
    const p = W.LOOSE_CANNON;
    const y = reefBaseY(p.x, p.z);
    put(cyl(0.16, 0.2, 1.5, 7).rotateZ(Math.PI / 2).rotateY(0.5).translate(p.x, y + 0.2, p.z), IRON);
    put(box(0.8, 0.16, 0.6).rotateY(0.5).translate(p.x + 0.9, y + 0.12, p.z - 0.5), WOOD_DARK, { noCast: true });
  }
  // a little coral on the high rail, so the galleon is the reef's own now
  for (let i = 0; i < 6; i++) { const u = -6.4 + i * 1.9; put(cyl(0.05, 0.14, 0.34 + (i % 3) * 0.16, 6).translate(X + u, railTop(-2.9) + 0.2, Z - 2.9), COL.coral[i % 4], { noCast: true }); }

  drawSuit(kit, M, paint);
}

// The old brass diving suit, standing empty on the sand: lead boots, canvas legs, arms and a body, a brass corselet with a ring of bolts, a brass helmet with a
// round porthole visor and two small side portholes, a coiled air hose. Decor only (no find, no spot): a collider keeps a cat from walking through it.
export function drawSuit(kit, M, paint) {
  // (THREE is set by drawWreck, which calls this)
  const S = W.BRASS_SUIT;
  const gy = reefBaseY(S.x, S.z);
  const put = (geo, hex, opts) => kit.put('paint', M.paint, paint(geo.rotateZ(0.06).rotateY(S.yaw).translate(S.x, gy, S.z), hex), opts);
  for (const s of [-1, 1]) {
    put(box(0.22, 0.14, 0.4).translate(s * 0.14, 0.07, 0.05), LEAD); // boots
    put(cyl(0.085, 0.1, 0.62, 6).translate(s * 0.14, 0.45, 0), CANVAS); // legs
  }
  put(cyl(0.3, 0.26, 0.55, 8).translate(0, 0.98, 0), CANVAS); // the body
  put(cyl(0.34, 0.34, 0.14, 8).translate(0, 1.3, 0), BRASS_DARK); // the corselet's rim
  put(cyl(0.24, 0.34, 0.2, 8).translate(0, 1.44, 0), BRASS); // the breastplate
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(new THREE.SphereGeometry(0.035, 4, 3).translate(Math.cos(a) * 0.3, 1.3, Math.sin(a) * 0.3), BRASS_DARK, { noCast: true }); } // bolts
  for (const s of [-1, 1]) {
    put(cyl(0.065, 0.075, 0.55, 6).rotateZ(s * 0.18).translate(s * 0.42, 0.95, 0.04), CANVAS); // arms hanging
    put(new THREE.SphereGeometry(0.09, 5, 4).translate(s * 0.47, 0.64, 0.05), LEAD, { noCast: true }); // gloves
  }
  put(new THREE.SphereGeometry(0.3, 10, 8).translate(0, 1.78, 0), BRASS); // the helmet
  put(new THREE.TorusGeometry(0.15, 0.035, 5, 10).translate(0, 1.8, 0.28), BRASS_DARK, { noCast: true }); // the visor's ring
  put(new THREE.CircleGeometry(0.14, 10).translate(0, 1.8, 0.292), GLASS, { noCast: true }); // the porthole
  for (const s of [-1, 1]) put(new THREE.CircleGeometry(0.06, 6).rotateY(s * Math.PI / 2).translate(s * 0.298, 1.8, 0), GLASS, { noCast: true }); // side portholes
  put(cyl(0.05, 0.05, 0.1, 6).translate(0, 2.1, 0), BRASS_DARK, { noCast: true }); // the air valve on top
  put(new THREE.TorusGeometry(0.3, 0.045, 4, 12).rotateX(Math.PI / 2).translate(0.55, 0.05, -0.5), 0x4a4036, { noCast: true }); // the hose's coil on the sand
  put(cyl(0.035, 0.035, 0.9, 4).rotateZ(0.9).translate(0.18, 2.12, -0.08), 0x4a4036, { noCast: true }); // the hose rising to the valve
}
