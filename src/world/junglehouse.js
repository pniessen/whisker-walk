// =============================================================================
// THE JUNGLE LODGE: HOUSE AND ROOF DETAIL (round two, from the owner's live play). The shell (walls, soffit, thatch) is jungleparts.js's, built from the one wall-top height in jungleplan.js
// (LODGE_WALL / LODGE_ROOF); this adds what makes it look made by hand: a ridge beam with its two finials, a fascia along every eave, rafters showing under the eaves, plank lines and four
// corner posts on the walls, shutters and sills at every window, the veranda's post feet, caps and rail balusters, treads on the ramp, three more hanging lanterns (glow only: the place's
// one real light stays the veranda's), and hanging pots with trailing leaves. Soft or small pieces in stage b's merged buckets; nothing moves; no word; no random number.
// =============================================================================
import * as THREE from 'three';
import * as P from './jungleplan.js';
import { COL, paint } from './jungleparts.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const ball = (r, ws = 6, hs = 4) => new THREE.SphereGeometry(r, ws, hs);
const POT = 0xb4643c;
const SHUTTER = 0x4f7a5a;

/** The detail's pieces as [bucket, geometry, colour, jitter, noCast]; pure, so the tests can read where they stand. */
export function houseParts() {
  const L = P.LODGE; const W = P.LODGE_WALL; const R = P.LODGE_ROOF;
  const out = [];
  const add = (key, geo, hex, j = 0, nc = false) => out.push([key, geo, hex, j, nc]);
  const cx = (L.x0 + L.x1) / 2; const wd = R.x1 - R.x0; const cz = (R.z0 + R.z1) / 2;
  const wh = W.top - W.base; const wy = (W.top + W.base) / 2;
  // the ridge beam and its finials; the fascia boards along both eaves and both gable edges
  add('paint', box(wd + 0.2, 0.14, 0.16).translate(cx, R.base + R.rise + 0.1, cz), COL.woodDark);
  for (const sx of [-1, 1]) add('paint', cyl(0.02, 0.07, 0.5, 5).translate(cx + sx * (wd / 2 + 0.12), R.base + R.rise + 0.35, cz), COL.wood);
  for (const z of [R.z0, R.z1]) add('paint', box(wd + 0.1, 0.16, 0.06).translate(cx, R.base + 0.02, z), COL.woodDark, 0, true);
  for (const x of [R.x0, R.x1]) add('paint', box(0.06, 0.16, R.z1 - R.z0).translate(x, R.base + 0.02, cz), COL.woodDark, 0, true);
  // rafters showing under the eaves: a beam every 0.9 m running from the back eave to the front, hanging below the soffit
  for (let x = R.x0 + 0.45; x < R.x1; x += 0.9) add('paint', box(0.1, 0.12, R.z1 - R.z0 - 0.1).translate(x, R.base - 0.06, cz), COL.wood, Math.round(x * 2), true);
  // plank walls: a darker seam between boards every 0.4 m on the front, and four corner posts the full height
  for (let y = W.base + 0.4; y < W.top - 0.1; y += 0.4) add('paint', box(W.x1 - W.x0, 0.02, 0.025).translate(cx, y, W.z1 + 0.012), 0x9a7448, 0, true);
  for (const x of [W.x0, W.x1]) for (const z of [W.z0, W.z1]) add('paint', box(0.2, wh + 0.1, 0.2).translate(x, wy, z), COL.woodDark);
  // shutters and sills: two on the front windows, one pair on each end
  for (const sx of [-1, 1]) {
    const wx = cx + sx * 3.5;
    for (const dx of [-0.82, 0.82]) add('paint', box(0.42, 0.95, 0.05).translate(wx + dx, L.deck + 1.5, W.z1 + 0.07), SHUTTER);
    add('paint', box(1.5, 0.07, 0.2).translate(wx, L.deck + 1.02, W.z1 + 0.1), COL.wood, 0, true);
    const ex = cx + sx * (W.x1 - W.x0) / 2;
    for (const dz of [-0.78, 0.78]) add('paint', box(0.05, 0.95, 0.4).translate(ex + sx * 0.06, L.deck + 1.5, 11.8 + dz), SHUTTER);
    add('paint', box(0.2, 0.07, 1.4).translate(ex + sx * 0.1, L.deck + 1.02, 11.8), COL.wood, 0, true);
  }
  // the veranda: a stone foot and a cap on every post, and balusters along the front rails (open at the steps)
  for (const p of P.LODGE_POSTS) {
    add('paint', cyl(0.2, 0.24, 0.16, 6).translate(p.x, L.deck + 0.1, p.z), COL.stone, 0, true);
    add('paint', box(0.3, 0.07, 0.3).translate(p.x, W.top - 0.04, p.z), COL.wood, 0, true);
  }
  const gap = [-6 - P.STEPS.w / 2, -6 + P.STEPS.w / 2];
  for (let x = L.x0 + 0.1; x <= L.x1; x += 0.55) if (x < gap[0] - 0.05 || x > gap[1] + 0.05) add('paint', box(0.05, 0.5, 0.05).translate(x, L.deck + 0.72, L.z1 - 0.2), COL.wood, 0, true);
  // treads across the ramp, and its two stringers
  const run = L.skirt;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    add('paint', box(P.STEPS.w - 0.5, 0.05, 0.12).translate(P.STEPS.x, P.jungleY(P.STEPS.x, L.z1 + run * t) + 0.1, L.z1 + run * t), COL.woodDark, 0, true);
  }
  // three more lanterns on cords from the eave (glow only) and four hanging pots with a trail of leaves
  for (const [x, z, y] of [[-10.6, 18.7, 2.9], [-1.4, 18.7, 2.9], [-6, 11.9, 2.8]]) {
    add('paint', cyl(0.012, 0.012, 0.55, 4).translate(x, L.deck + y + 0.25, z), COL.rope, 0, true);
    add('paint', box(0.2, 0.05, 0.2).translate(x, L.deck + y - 0.02, z), COL.woodDark, 0, true);
    add('glow', ball(0.15, 6, 4).translate(x, L.deck + y - 0.2, z), COL.warm, 0, true);
  }
  [[-9.4, 18.9], [-8.1, 18.9], [-3.9, 18.9], [-2.6, 18.9]].forEach(([x, z], i) => {
    const y = L.deck + 2.55 - (i % 2) * 0.25;
    add('paint', cyl(0.008, 0.008, W.top - y - 0.1, 3).translate(x, (W.top + y) / 2, z), COL.rope, 0, true);
    add('paint', new THREE.CylinderGeometry(0.17, 0.11, 0.2, 7).translate(x, y - 0.08, z), POT, i, true);
    add('paint', ball(0.2, 6, 4).scale(1, 0.6, 1).translate(x, y + 0.08, z), COL.leaf, i, true);
    for (let v = 0; v < 3; v++) add('paint', cyl(0.012, 0.01, 0.45 + v * 0.18, 3).translate(x + (v - 1) * 0.11, y - 0.3 - v * 0.05, z + 0.02), COL.leafDeep, v, true);
  });
  return out;
}

export function drawHouse(kit, M) {
  for (const [key, geo, hex, j, nc] of houseParts()) kit.put(key, key === 'glow' ? M.glow : M.paint, paint(geo, hex, j), { noCast: nc });
}
