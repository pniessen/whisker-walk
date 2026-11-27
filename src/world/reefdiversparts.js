// =============================================================================
// THE REEF: THE DIVERS, THE RESEARCH SHIP AND THE BIG SPOTTED SHARK, THE DRAWING (milestone R18). The same vertex-coloured "soup" as the seals and the mantas
// (reefsealsparts.js: tubes, ellipsoids and paddles written into one BufferGeometry), simple low-poly shapes: the people kit (src/people, 54 kB gzipped) is far too big
// for the Reef's download, so a diver is about twenty capsules (a wetsuit torso with a coloured stripe, a bare head, goggles pushed up on the forehead, a tank, fins).
// Nothing here knows the time or the cat: reefdiverslive.js hands in the poses reefdivers.js worked out. Draws no random number.
// =============================================================================
import { VESSEL, LADDER_AT, SUB, hash01 } from './reefdivers.js';

// The soup's drawing calls (reefsealsparts.js) come in through the kit, so this stage chunk imports nothing from the Reef's main chunk.
let tube; let ellipsoid; let paddle; let bodyMatrix;
export function useKit(k) { ({ tube, ellipsoid, paddle, bodyMatrix } = k); }
const TAU = Math.PI * 2;

const flat = (c) => ({ top: c, bot: c });
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const SUIT = { top: [36, 40, 54], bot: [18, 20, 28] };
const METAL = { top: [196, 202, 208], bot: [118, 126, 138] };
const BRASS = flat([214, 170, 60]);
const DARKC = flat([26, 24, 30]);
const GLASS = { top: [176, 228, 242], bot: [104, 164, 192] };

const bez = (A, B, C, s, o) => {
  const u = 1 - s;
  o.x = u * u * A[0] + 2 * u * s * B[0] + s * s * C[0]; o.y = u * u * A[1] + 2 * u * s * B[1] + s * s * C[1]; o.z = u * u * A[2] + 2 * u * s * B[2] + s * s * C[2];
};
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ---- a diver ----------------------------------------------------------------------------------------------------------------------
// pose: { x, y, z, yaw, pitch, wave (0 to 1), kick, beat, look, swing (0 or 1: the wave's to-and-fro; 0 under reduced motion) }. About 1.7 m, nose along +z.
export function drawDiver(soup, p) {
  const m = bodyMatrix(p.x, p.y, p.z, p.yaw, p.pitch, 0, 1);
  const { accent, skin, hair, style } = p.look;
  const sk = { top: skin, bot: shade(skin, 0.86) };
  const acc = { top: accent, bot: shade(accent, 0.8) };
  // torso (hips to chest), a stripe of the diver's colour across the middle
  tube(soup, (s, o) => { o.x = 0; o.y = 0; o.z = -0.3 + 0.64 * s; }, (s) => [0.15 + 0.045 * Math.sin(Math.PI * s * 0.9), 0.11 + 0.025 * s], 5, 8, m,
    { ring: (s) => (s > 0.42 && s < 0.6 ? acc : SUIT) });
  ellipsoid(soup, m, 0, 0.0, 0.42, 0.07, 0.07, 0.07, SUIT, 3, 6); // the neck
  // the head: bare, with hair at the back and top only (a short crop, a ponytail, or none)
  ellipsoid(soup, m, 0, 0.03, 0.6, 0.1, 0.11, 0.12, sk, 4, 7);
  if (hair) {
    const hc = { top: hair, bot: shade(hair, 0.8) };
    ellipsoid(soup, m, 0, 0.065, 0.55, 0.098, 0.088, 0.09, hc, 3, 6);
    if (style === 'tail') {
      const sway = 0.04 * Math.sin(p.kick * 0.5);
      tube(soup, (s, o) => { o.x = sway * s; o.y = 0.1 + 0.05 * s - 0.06 * s * s; o.z = 0.5 - 0.3 * s; }, (s) => { const r = 0.035 * (1 - 0.6 * s) + 0.005; return [r, r]; }, 4, 4, m, hc);
    }
  }
  // goggles pushed up on the forehead: a strap round the head, a frame and a bright lens
  tube(soup, (s, o) => { const a = s * TAU; o.x = 0.098 * Math.cos(a); o.y = 0.03 + 0.108 * Math.sin(a); o.z = 0.66; }, () => [0.011, 0.011], 11, 3, m, acc);
  ellipsoid(soup, m, 0, 0.125, 0.665, 0.085, 0.034, 0.04, acc, 3, 6);
  ellipsoid(soup, m, 0, 0.13, 0.7, 0.064, 0.022, 0.016, GLASS, 3, 6);
  for (const sx of [-1, 1]) ellipsoid(soup, m, sx * 0.042, 0.03, 0.712, 0.014, 0.016, 0.014, DARKC, 3, 4); // the eyes
  // the tank on the back and its brass valve
  ellipsoid(soup, m, 0, 0.2, 0.18, 0.075, 0.075, 0.3, METAL, 4, 7);
  ellipsoid(soup, m, 0, 0.27, 0.46, 0.025, 0.03, 0.03, BRASS, 3, 4);
  // the arms: the left trails; the right comes up and waves when she is near
  const w = p.wave;
  const sw = p.swing * Math.sin(p.beat * 1.4);
  for (const sx of [-1, 1]) {
    const S = [sx * 0.2, 0, 0.3];
    let B = [sx * 0.27, -0.1, 0.1]; let C = [sx * 0.22, -0.08, -0.16];
    if (sx > 0 && w > 0) { B = lerp3(B, [0.36, 0.12, 0.36], w); C = lerp3(C, [0.4 + 0.12 * sw, 0.42, 0.4], w); }
    tube(soup, (s, o) => bez(S, B, C, s, o), (s) => { const r = 0.052 - 0.014 * s; return [r, r]; }, 5, 5, m, SUIT);
    ellipsoid(soup, m, C[0], C[1], C[2], 0.04, 0.04, 0.04, sk, 3, 5); // the hand
  }
  // the legs and the fins (a slow kick, one leg then the other)
  for (const sx of [-1, 1]) {
    const kc = 0.12 * Math.sin(p.kick + (sx > 0 ? 0 : Math.PI));
    tube(soup, (s, o) => { o.x = sx * (0.08 + 0.01 * s); o.y = -0.01 + kc * s * s; o.z = -0.3 - 0.65 * s; }, (s) => { const r = 0.08 - 0.028 * s; return [r, r]; }, 5, 5, m,
      { ring: (s) => (s > 0.72 && s < 0.88 ? acc : SUIT) });
    paddle(soup, m, [sx * 0.09, kc, -0.95], [sx * 0.1, kc * 1.5 - 0.02, -1.4], 0.09, 0.012, acc, 3, 4);
  }
}

// ---- the big spotted shark ------------------------------------------------------------------------------------------------------
const SHARK_BODY = [[0, 0.04], [0.05, 0.32], [0.18, 0.5], [0.4, 0.56], [0.62, 0.4], [0.82, 0.2], [1, 0.07]];
const body = (tbl, s) => {
  for (let i = 1; i < tbl.length; i++) if (s <= tbl[i][0]) { const a = tbl[i - 1]; return a[1] + (tbl[i][1] - a[1]) * ((s - a[0]) / (tbl[i][0] - a[0] || 1)); }
  return tbl[tbl.length - 1][1];
};
const SHARK_COL = { top: [74, 104, 128], bot: [226, 232, 230], spots: 0.28, seed: 3 };
const DOT = flat([238, 238, 214]);
const SHARK_SALT = 0x77736863; // 'wshc'
// pose: { x, y, z, yaw, pitch, roll, beat, size }; `dots` how many pale spots (18 on the top rung, 12 below).
export function drawShark(soup, p, dots = 18) {
  const m = bodyMatrix(p.x, p.y, p.z, p.yaw, p.pitch, p.roll, p.size);
  const sway = (s) => 0.36 * Math.sin(p.beat - 3.4 * s) * s ** 1.4;
  tube(soup, (s, o) => { o.x = sway(s); o.y = 0; o.z = 3.2 - 6.4 * s; }, (s) => { const r = body(SHARK_BODY, s); return [r, r * 0.78]; }, 13, 10, m, SHARK_COL);
  for (let i = 0; i < dots; i++) { // the pale spots on the back and the upper sides
    const s = 0.1 + 0.62 * hash01(i, SHARK_SALT); const f = 0.4 + (Math.PI - 0.8) * hash01(i + 64, SHARK_SALT);
    const r = body(SHARK_BODY, s);
    ellipsoid(soup, m, sway(s) + r * Math.cos(f), r * 0.78 * Math.sin(f), 3.2 - 6.4 * s, 0.06, 0.035, 0.06, DOT, 3, 5);
  }
  ellipsoid(soup, m, 0, -0.13, 3.0, 0.3, 0.03, 0.1, DARKC, 3, 5); // the wide, gentle mouth
  for (const sx of [-1, 1]) ellipsoid(soup, m, sx * 0.4, 0.07, 2.55, 0.03, 0.03, 0.03, DARKC, 3, 4);
  const tx = sway(1);
  paddle(soup, m, [sway(0.34), 0.5, 0.6], [sway(0.5), 1.25, -0.4], 0.32, 0.06, SHARK_COL, 4, 6); // the back fin
  paddle(soup, m, [sway(0.78), 0.3, -2.2], [sway(0.84), 0.7, -2.75], 0.14, 0.04, SHARK_COL, 3, 5);
  for (const sx of [-1, 1]) paddle(soup, m, [sx * 0.45, -0.22, 1.5], [sx * 1.7, -0.55 + 0.06 * Math.sin(p.beat * 0.5 + sx), 0.5], 0.5, 0.05, SHARK_COL, 4, 6);
  paddle(soup, m, [tx, 0, -3.1], [tx + 0.2, 1.35, -4.0], 0.3, 0.05, SHARK_COL, 4, 5); // the tail's two lobes
  paddle(soup, m, [tx, 0, -3.1], [tx - 0.1, -0.85, -3.7], 0.22, 0.045, SHARK_COL, 4, 5);
}

// ---- the research ship ------------------------------------------------------------------------------------------------------------
// Drawn once, in world space, lying on the shimmer ceiling: a hull (white above the waterline, sea-blue under it), a deckhouse and funnel, a keel, a dive ladder and a
// small yellow submersible on two cables from a davit. `sides` is the hull's smoothness (10 on the low rungs).
export function drawVessel(soup, sides = 14) {
  const m = bodyMatrix(VESSEL.x, 0, VESSEL.z, VESSEL.yaw, 0, 0, 1);
  const HULL = { top: [238, 240, 236], bot: [44, 96, 132] };
  const L = VESSEL.length / 2;
  ellipsoid(soup, m, 0, 9.2, 0, VESSEL.beam / 2, 2.0, L, HULL, 9, sides);
  ellipsoid(soup, m, 0, 10.1, L - 2.4, 0.95, 1.1, 2.3, { top: [244, 244, 240], bot: [210, 214, 216] }, 4, 7); // the raised bow
  ellipsoid(soup, m, 0, 11.3, -2.6, 1.7, 1.0, 2.4, { top: [250, 250, 246], bot: [214, 218, 220] }, 4, 8); // the deckhouse
  ellipsoid(soup, m, 0, 11.45, -0.55, 1.35, 0.3, 0.32, GLASS, 3, 7); // its windows
  tube(soup, (s, o) => { o.x = 0; o.y = 11.9 + 1.5 * s; o.z = -4.7; }, (s) => { const r = 0.5 - 0.06 * s; return [r, r]; }, 4, 8, m,
    { ring: (s) => (s > 0.55 && s < 0.78 ? flat([248, 248, 244]) : s > 0.9 ? DARKC : flat([204, 62, 52])) }); // the funnel
  tube(soup, (s, o) => { o.x = 0; o.y = 11.2 + 3.2 * s; o.z = 1.6; }, () => [0.07, 0.07], 3, 4, m, METAL); // the mast
  ellipsoid(soup, m, 0, 14.4, 1.6, 0.5, 0.05, 0.18, METAL, 3, 5);
  tube(soup, (s, o) => { o.x = 0; o.y = 7.0; o.z = -8 + 16 * s; }, () => [0.1, 0.28], 4, 5, m, flat([112, 52, 42])); // the keel
  ellipsoid(soup, m, 0, 7.9, -L + 1.2, 0.09, 0.8, 0.5, flat([112, 52, 42]), 3, 5); // the rudder
  // the dive ladder: two rails, a bracket for each, and rungs
  const lx = -(LADDER_AT.z - VESSEL.z); const lz = LADDER_AT.x - VESSEL.x; // (the world point in the ship's own frame)
  for (const dz of [-0.28, 0.28]) {
    tube(soup, (s, o) => { o.x = lx; o.y = LADDER_AT.bottom + (LADDER_AT.top - LADDER_AT.bottom) * s; o.z = lz + dz; }, () => [0.03, 0.03], 3, 4, m, METAL);
    tube(soup, (s, o) => { o.x = lx + 1.0 * (1 - s); o.y = LADDER_AT.top; o.z = lz + dz; }, () => [0.03, 0.03], 2, 4, m, METAL);
  }
  for (let y = LADDER_AT.bottom + 0.4; y < LADDER_AT.top - 0.2; y += 0.55) tube(soup, (s, o) => { o.x = lx; o.y = y; o.z = lz - 0.28 + 0.56 * s; }, () => [0.02, 0.02], 2, 4, m, METAL);
  // the davit, the cables and the yellow submersible
  const sx = SUB.lx; const sz = SUB.lz; const sy = SUB.y;
  tube(soup, (s, o) => { o.x = -1.2 + (sx + 1.2) * s; o.y = 11.0; o.z = sz; }, () => [0.12, 0.12], 3, 5, m, METAL);
  for (const dz of [-0.35, 0.35]) tube(soup, (s, o) => { o.x = sx; o.y = 11.0 - 4.3 * s; o.z = sz + dz; }, () => [0.025, 0.025], 2, 4, m, DARKC);
  ellipsoid(soup, m, sx, sy, sz, 0.85, 0.7, 1.15, { top: [255, 210, 40], bot: [226, 160, 30] }, 5, 9);
  ellipsoid(soup, m, sx, sy + 0.15, sz + 0.85, 0.5, 0.4, 0.34, GLASS, 3, 7); // the round window
  tube(soup, (s, o) => { const a = s * TAU; o.x = sx + 0.36 * Math.cos(a); o.y = sy + 0.36 * Math.sin(a); o.z = sz - 1.2; }, () => [0.03, 0.03], 9, 3, m, DARKC); // the propeller ring
  for (const dx of [-0.5, 0.5]) tube(soup, (s, o) => { o.x = sx + dx; o.y = sy - 0.85; o.z = sz - 1.0 + 2.0 * s; }, () => [0.05, 0.05], 3, 4, m, DARKC); // the skids
}
