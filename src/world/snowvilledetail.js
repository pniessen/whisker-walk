// =============================================================================
// SNOWVILLE: THE ROUND-TWO DETAIL, DRAWN (the owner's live play: the houses, trees, notice board and the rest need more to look at). Stage chunk code (snowvillestageb.js); start-up never imports it.
//   * the cottages: snow-laden roof ridges and eave lips with thickness, a shadow-blue band where the snow meets the wall, a roof-coloured eave board, window frames and mullions round the warm glass,
//     shutters, drifts against the walls, porch steps, a lantern by each door, plank lines, a chimney with bands and a pot, icicles down the side eave, the footprints to the door, and the roof and
//     snow tones of their own (a cooler blue-white than the ground: snowvilleparts.js COL.roofSnow);
//   * the trees: snow clumps on the fir tiers, piled on the wind's side; bare frosted birches; stumps with snow caps (the fir shapes themselves vary in snowvilleparts.js putFir);
//   * the notice board: eight pinned notices with drawn pictures and mark-lines for the words (no real text);
//   * the village: three more snowmen, the well, sleds leaning on walls, woodpiles and more pennants.
// Everything goes into the kit's merged buckets (paint, glow): no new mesh. No clock, no Math.random: every number is snowvilledetailplan.js's. Triangles are cheap, draws are not.
// =============================================================================
import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import * as D from './snowvilledetailplan.js';
import { COL, LANE, paint, stand, box, cyl, ball } from './snowvilleparts.js';

const BERRY = 0xd23a3a;
const GLASS = 0x2b2f3a;
const PAPER_MARK = 0x4a4038;
const tube = (rt, rb, h, seg) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true); // no hidden caps

// ---- the cottages (in each cottage's frame: door on +z, the side window on +x, back at -z) ---------------------------------------------------------------------
// Pieces too small to throw a shadow go in the treeline's non-casting bucket ('fine'), so the shadow pass does not draw them; the rest are in 'paint'.
const FINE = 'treeBack';
let LOW = false; // the lower rungs (build's opts.water.quality) skip the fine pieces: clumps, footprints, planks, mullions, frames, icicles, drifts, the notices' pictures, the birches' branches
const on = (kit, M, c, geo, hex, jit = 0, key = 'paint') => (LOW && key === 'fine' ? null : kit.put(key === 'fine' ? FINE : key, key === 'glow' ? M.glow : M.paint, stand(paint(geo, hex, jit), c.x, c.z, -0.08, c.yaw), { noCast: key === 'fine' }));
function houseDetail(kit, M, c, i) {
  const rise = Math.min(c.w, c.d) * 0.36 + 0.4;
  const ez = c.d / 2 + 0.44; // the eaves' z (the roof is d + 0.8 deep)
  // the roof: a snow lip along each eave, a ridge cap with thickness, the roof boards peeping below the lip, and the shadow band on the wall under the eave
  for (const sz of [-1, 1]) {
    on(kit, M, c, box(c.w + 0.86, 0.17, 0.3).translate(0, c.h + 0.1, sz * ez), COL.roofSnow);
    on(kit, M, c, box(c.w + 0.5, 0.08, 0.07).translate(0, c.h - 0.02, sz * (ez + 0.1)), D.ROOF_BOARD[c.id] ?? c.roof, 0, 'fine');
  }
  on(kit, M, c, box(c.w + 0.84, 0.2, 0.5).translate(0, c.h + rise + 0.1, 0), COL.roofSnow);
  on(kit, M, c, box(c.w + 0.5, 0.2, 0.06).translate(0, c.h - 0.13, c.d / 2 + 0.005), COL.roofShade, 0, 'fine');
  for (const sx of [-1, 1]) on(kit, M, c, box(0.06, 0.2, c.d + 0.02).translate(sx * (c.w / 2 + 0.005), c.h - 0.13, 0), COL.roofShade, 0, 'fine');
  // the chimney: two brick bands and a pot under its snow
  const chx = c.w * 0.28; const chz = -c.d * 0.2; const top = c.h + rise + 0.8;
  on(kit, M, c, box(0.68, 0.09, 0.68).translate(chx, top - 0.4, chz), 0x8a5a4a, 0, 'fine');
  on(kit, M, c, box(0.66, 0.09, 0.66).translate(chx, top - 0.75, chz), 0x8a5a4a, 0, 'fine');
  on(kit, M, c, cyl(0.1, 0.12, 0.26, 6).translate(chx, top + 0.24, chz), COL.iron);
  // windows: a frame behind the warm glass and a mullion cross in front of it, a shutter each side (the front pair)
  const shut = D.SHUTTER_HUE[c.id] ?? COL.woodDark;
  for (const sx of [-1, 1]) {
    const wx = sx * c.w * 0.32; const wy = c.h * 0.55; const wz = c.d / 2;
    on(kit, M, c, box(0.86, 0.78, 0.05).translate(wx, wy, wz + 0.005), COL.woodDark, 0, 'fine');
    on(kit, M, c, box(0.04, 0.64, 0.03).translate(wx, wy, wz + 0.075), COL.woodDark, 0, 'fine');
    on(kit, M, c, box(0.72, 0.04, 0.03).translate(wx, wy, wz + 0.075), COL.woodDark, 0, 'fine');
    for (const k of [-1, 1]) on(kit, M, c, box(0.3, 0.7, 0.05).translate(wx + k * 0.58, wy, wz + 0.02), shut, Math.sin(i + k));
  }
  // the door: a frame, a ledge of snow on it is the plan's; porch steps with snow, and a lantern on a bracket
  on(kit, M, c, box(1.12, 1.9, 0.06).translate(0, 0.95, c.d / 2 + 0.0), COL.woodDark, 0, 'fine');
  on(kit, M, c, box(1.5, 0.15, 0.55).translate(0, 0.075, c.d / 2 + 0.34), COL.wood, i);
  on(kit, M, c, box(1.7, 0.12, 0.42).translate(0, 0.0, c.d / 2 + 0.78), COL.wood, i + 1);
  on(kit, M, c, box(1.56, 0.07, 0.5).translate(0, 0.18, c.d / 2 + 0.34), COL.snowBright, 0, 'fine');
  on(kit, M, c, box(0.04, 0.04, 0.22).translate(0.88, 1.7, c.d / 2 + 0.12), COL.iron, 0, 'fine');
  on(kit, M, c, box(0.14, 0.04, 0.14).translate(0.88, 1.5, c.d / 2 + 0.22), COL.iron, 0, 'fine');
  on(kit, M, c, box(0.14, 0.04, 0.14).translate(0.88, 1.68, c.d / 2 + 0.22), COL.iron, 0, 'fine');
  on(kit, M, c, ball(0.09, 5, 4).translate(0.88, 1.59, c.d / 2 + 0.22), COL.warm, 0, 'glow');
  // plank lines: thin dark strips across the front wall and the side wall
  for (let r = 1; r <= 4; r++) {
    const y = (c.h * r) / 5 - 0.04;
    on(kit, M, c, box(c.w + 0.01, 0.022, 0.02).translate(0, y, c.d / 2 + 0.005), COL.woodDark, 0, 'fine');
    on(kit, M, c, box(0.02, 0.022, c.d + 0.01).translate(c.w / 2 + 0.005, y, 0), COL.woodDark, 0, 'fine');
  }
  // drifts against the walls (a low heap along the front's foot and the back) and a strand of icicles down the side eave
  for (let k = 0; k < 3; k++) on(kit, M, c, ball(0.55, 6, 3).scale(1.4, 0.5, 0.8).translate(-c.w * 0.36 + k * c.w * 0.36, 0.08, -c.d / 2 - 0.32), COL.snowBright, k, 'fine');
  on(kit, M, c, ball(0.6, 6, 3).scale(1.5, 0.5, 0.9).translate(-c.w * 0.3, 0.02, c.d / 2 + 0.35), COL.snowBright, 2, 'fine');
  const n = Math.round(c.d * 1.4);
  for (let k = 0; k < n; k++) on(kit, M, c, new THREE.ConeGeometry(0.035, 0.18 + 0.1 * ((k * 5) % 3), 4).rotateX(Math.PI).translate(c.w / 2 + 0.4, c.h - 0.02, -c.d / 2 + (c.d * (k + 0.5)) / n), COL.ice, 0, 'fine');
  // the footprints in the snow to the door: shallow blue-grey ovals, a world position each (the ground rolls a little)
  if (!LOW) for (const p of D.footprints(c)) {
    const [x, z] = D.toWorld(c, p.lx, p.lz);
    kit.put(FINE, M.paint, stand(paint(new THREE.CircleGeometry(0.1, 5).rotateX(-Math.PI / 2).scale(1, 1, 1.7), 0xa9bad2), x, z, 0.03, c.yaw + p.yaw));
  }
}
// a stack of logs under its snow (a cottage's frame), and a sled leaning on the +x wall
function woodpile(kit, M, c) {
  const x = c.w / 2 + 0.6; const z = -c.d * 0.28;
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4 - row; i++) on(kit, M, c, cyl(0.11, 0.11, 1.0, 6).rotateZ(Math.PI / 2).translate(x, 0.12 + row * 0.21, z - 0.4 + 0.22 * i + row * 0.11).rotateY(0), COL.wood, Math.sin(i * 2 + row * 3 + c.x));
  on(kit, M, c, box(0.5, 0.1, 1.0).translate(x, 0.52, z), COL.snowBright);
}
function leaningSled(kit, M, c, hue) {
  const place = (geo, hex) => {
    geo.rotateZ(0.26); // the top leans into the wall
    return paint(stand(geo.translate(c.w / 2 + 0.5, 0.0, c.d * 0.12 + 0.0), c.x, c.z, 0.64, c.yaw), hex);
  };
  kit.put('paint', M.paint, place(box(0.46, 1.28, 0.05), hue));
  for (const sx of [-1, 1]) kit.put('paint', M.paint, place(box(0.04, 1.34, 0.07).translate(sx * 0.2, 0, 0.04), COL.iron));
  kit.put('paint', M.paint, place(box(0.4, 0.03, 0.03).translate(0, -0.3, 0.07), COL.wood));
}

// ---- the trees ---------------------------------------------------------------------------------------------------------------------------------------------------
function firClumps(kit, M) {
  if (LOW) return;
  P.scatterFirs().forEach((k, i) => {
    if (k.rim) return;
    const H = 4.5 * k.s;
    for (const q of D.clumps(k, i)) {
      const f = q.tier / k.tiers;
      const r = (1.55 - 1.1 * f) * k.s; const h = H * (0.42 - 0.06 * f); const y = H * (0.18 + 0.68 * f);
      const rad = r * (1 - q.u) * 0.92;
      const x = k.x + Math.cos(q.a) * rad; const z = k.z + Math.sin(q.a) * rad;
      kit.put(FINE, M.paint, paint(stand(ball(0.34 * k.s * q.s, 6, 3).scale(1.3, 0.7, 1.3), x, z, -0.1 + y + h * q.u + 0.03), COL.snowBright, Math.sin(i + q.a)), { noCast: true });
    }
  });
}
function birch(kit, M, b, i) {
  const H = 3.4 + b.s * 1.4;
  const lean = Math.sin(i * 2.1) * 0.05;
  const t = (geo, hex, jit = 0) => kit.put('paint', M.paint, paint(stand(geo.rotateZ(lean), b.x, b.z, -0.05, b.yaw), hex, jit));
  t(tube(0.06, 0.11, H, 5).translate(0, H / 2, 0), 0xe9e7e0); // (open at both ends: the foot is in the snow, the top under its cap)
  for (let k = 0; k < 3; k++) t(tube(0.126 - 0.05 * (0.18 + 0.2 * k), 0.126 - 0.05 * (0.18 + 0.2 * k), 0.06, 5).translate(0, H * (0.18 + 0.2 * k), 0), 0x2f2b2a); // dark bark bands, just proud of the trunk (they were hidden inside it, closed)
  for (let k = 0; k < (LOW ? 0 : 6); k++) { // bare branches up and out, with a fleck of frost at the end of each
    const a = k * 2.4 + i; const y = H * (0.5 + 0.08 * k); const L = 0.9 - 0.08 * k;
    const g = cyl(0.014, 0.03, L, 3).translate(0, L / 2, 0).rotateZ(-0.9).rotateY(a).translate(0, y, 0);
    t(g, 0x6b5a55);
    t(ball(0.11, 4, 2).translate(Math.cos(a) * L * 0.78, y + L * 0.62, -Math.sin(a) * L * 0.78), COL.snowBright);
  }
  t(ball(0.2, 5, 3).scale(1, 0.5, 1).translate(0, H + 0.02, 0), COL.snowBright);
}
function stump(kit, M, s, i) {
  const t = (geo, hex, jit = 0) => kit.put('paint', M.paint, paint(stand(geo, s.x, s.z, -0.05, s.yaw), hex, jit));
  t(tube(0.3 * s.s, 0.38 * s.s, 0.4 * s.s, 7).translate(0, 0.2 * s.s, 0), 0x7a5438, i);
  t(new THREE.CircleGeometry(0.3 * s.s, 7).rotateX(-Math.PI / 2).translate(0, 0.415 * s.s, 0), 0xc9a47a); // the cut top: a flat pad (was a closed cylinder)
  t(ball(0.36 * s.s, 6, 3).scale(1, 0.38, 1).translate(0, 0.42 * s.s, 0), COL.snowBright);
}

// ---- the notice board (the board's own frame: x across, y up, z out; the board stands at P.BOARD, yaw as the plan's) ----------------------------------------------
function notice(kit, M, n, i) {
  const B = P.BOARD;
  const put = (geo, hex, key = 'paint') => kit.put(key === 'glow' ? 'glow' : FINE, key === 'glow' ? M.glow : M.paint, stand(paint(geo, hex), B.x, B.z, 0, B.yaw), { noCast: true });
  const mv = (geo, x, y) => rotAbout(geo, n, n.x + x, n.y + y, 0.08);
  put(rotAbout(box(n.w, n.h, 0.014), n, n.x, n.y, 0.07), n.paper);
  put(rotAbout(ball(0.028, 4, 3), n, n.x + 0.02, n.y + n.h / 2 - 0.04, 0.09), BERRY); // the pin
  const mark = (dx, dy, len) => put(rotAbout(box(len, 0.012, 0.004), n, n.x + dx, n.y + dy, 0.082), PAPER_MARK);
  // mark-lines (the text): two to four short grey dashes of varied length near the foot
  const rows = n.pic === 'none' ? 6 : 2;
  for (let r = 0; r < rows; r++) mark(-0.02 * ((r + i) % 3), (n.pic === 'none' ? 0.12 : -0.12) - r * 0.045, 0.18 + 0.11 * ((r * 3 + i) % 3));
  const m = (geo, hex, dx, dy, key) => put(mv(geo, dx, dy), hex, key);
  switch (LOW ? 'none-low' : n.pic) {
    case 'pond': // a blue oval of ice with two crossed skate blades
      m(new THREE.CircleGeometry(0.11, 10).scale(1.4, 0.8, 1), 0x9fd0ee, 0, 0.05);
      m(box(0.16, 0.012, 0.006).rotateZ(0.5), 0xeaf4fb, 0, 0.05); m(box(0.16, 0.012, 0.006).rotateZ(-0.4), 0xeaf4fb, 0, 0.05);
      break;
    case 'mitten': // a red mitten and its thumb
      m(box(0.1, 0.14, 0.01), 0xc8483f, 0, 0.04); m(ball(0.035, 5, 4), 0xc8483f, -0.07, 0.03); m(box(0.11, 0.025, 0.012), 0xf4ecd8, 0, -0.04);
      break;
    case 'lantern': // a hanging lantern with a gold glow
      m(box(0.09, 0.12, 0.01), COL.iron, 0, 0.04); m(ball(0.04, 5, 4), 0xffd45a, 0, 0.04, 'glow'); m(box(0.012, 0.07, 0.006), COL.iron, 0, 0.14);
      break;
    case 'fish': // a fish: an oval body, a tail and an eye
      m(ball(0.065, 6, 4).scale(1.6, 0.8, 0.2), 0x6aa8d8, 0, 0.05); m(new THREE.ConeGeometry(0.05, 0.08, 3).rotateZ(-Math.PI / 2).scale(1, 1, 0.2), 0x6aa8d8, 0.12, 0.05); m(ball(0.012, 4, 3), COL.iron, -0.08, 0.06);
      break;
    case 'paw': // a paw print: a pad and four toes
      m(ball(0.04, 5, 4).scale(1.3, 1, 0.2), 0x6b5a55, 0, 0.03); for (const dx of [-0.055, -0.02, 0.02, 0.055]) m(ball(0.02, 4, 3).scale(1, 1, 0.3), 0x6b5a55, dx, 0.095 - Math.abs(dx) * 0.4);
      break;
    case 'star':
      m(new THREE.CircleGeometry(0.075, 5).rotateZ(0.3), 0xf2c14e, 0, 0.05);
      break;
    case 'mug': // a cocoa mug with steam
      m(box(0.08, 0.09, 0.01), 0xc8483f, 0, 0.03); m(box(0.03, 0.05, 0.008), 0xc8483f, 0.06, 0.03); m(box(0.01, 0.05, 0.004), 0xcfd8e4, -0.015, 0.11); m(box(0.01, 0.05, 0.004), 0xcfd8e4, 0.015, 0.12);
      break;
    default: break;
  }
}
// Turn a piece (built flat on the board's face) about the notice's tilt, round the notice's centre, and place it at (px, py, pz).
function rotAbout(geo, n, px, py, pz) {
  geo.translate(px - n.x, py - n.y, 0);
  geo.rotateZ(n.tilt);
  geo.translate(n.x, n.y, pz);
  return geo;
}

// ---- the village's small things ---------------------------------------------------------------------------------------------------------------------------------
function snowman(kit, M, s) {
  const t = (geo, hex) => kit.put('paint', M.paint, paint(stand(geo, s.x, s.z, 0, s.yaw), hex));
  const k = s.kit === 1 ? 0.8 : 1;
  t(ball(0.5 * k, 8, 5).translate(0, 0.42 * k, 0), COL.snowBright); t(ball(0.37 * k, 8, 5).translate(0, 1.1 * k, 0), COL.snowBright); t(ball(0.27 * k, 8, 5).translate(0, 1.64 * k, 0), COL.snowBright);
  t(new THREE.ConeGeometry(0.05 * k, 0.26 * k, 5).rotateX(Math.PI / 2).translate(0, 1.66 * k, 0.32 * k), 0xe8782a);
  for (const sx of [-1, 1]) { t(ball(0.035, 4, 3).translate(sx * 0.09 * k, 1.72 * k, 0.24 * k), 0x22252c); t(cyl(0.018, 0.018, 0.7 * k, 4).rotateZ(sx * 1.15).translate(sx * 0.58 * k, 1.2 * k, 0), COL.woodDark); }
  const hue = [0xc8483f, 0x2f8f8a, 0xd69a2e][s.kit % 3];
  t(new THREE.TorusGeometry(0.25 * k, 0.06, 4, 8).rotateX(Math.PI / 2).translate(0, 1.4 * k, 0), hue);
  if (s.kit === 0) { t(cyl(0.2, 0.2, 0.04, 8).translate(0, 1.9, 0), 0x22252c); t(cyl(0.14, 0.15, 0.22, 8).translate(0, 2.02, 0), 0x22252c); } // a top hat
  else t(ball(0.3 * k, 7, 3).scale(1, 0.45, 1).translate(0, 1.9 * k, 0), hue); // a knitted cap
}
function wellAt(kit, M, w) {
  const t = (geo, hex, jit = 0) => kit.put('paint', M.paint, paint(stand(geo, w.x, w.z, -0.05, w.yaw), hex, jit));
  t(tube(0.72, 0.78, 0.62, 9).translate(0, 0.31, 0), COL.rock, 1);
  t(new THREE.CircleGeometry(0.58, 9).rotateX(-Math.PI / 2).translate(0, 0.62, 0), 0x2b3a4a); // the water: a flat pad
  t(ball(0.82, 8, 3).scale(1, 0.26, 1).translate(0, 0.66, 0), COL.snowBright);
  for (const sx of [-1, 1]) t(box(0.1, 1.5, 0.1).translate(sx * 0.66, 1.3, 0), COL.woodDark);
  t(cyl(0.05, 0.05, 1.4, 5).rotateZ(Math.PI / 2).translate(0, 1.7, 0), COL.wood);
  t(new THREE.ConeGeometry(1.15, 0.65, 4).rotateY(Math.PI / 4).scale(1.15, 1, 0.8).translate(0, 2.3, 0), 0x6f3a2f);
  t(new THREE.ConeGeometry(1.2, 0.34, 4).rotateY(Math.PI / 4).scale(1.15, 1, 0.8).translate(0, 2.46, 0), COL.roofSnow);
  t(cyl(0.01, 0.01, 0.6, 4).translate(0, 1.4, 0), COL.iron);
  t(cyl(0.1, 0.08, 0.14, 6).translate(0, 1.05, 0), COL.wood);
}
function pennants(kit, M, a, b, hues, n, ya, yb, sag = 0.5) {
  const at = (u) => new THREE.Vector3(a.x + (b.x - a.x) * u, ya + (yb - ya) * u - sag * 4 * u * (1 - u), a.z + (b.z - a.z) * u);
  for (let i = 0; i < n; i++) {
    const p0 = at(i / n); const p1 = at((i + 1) / n);
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const g = new THREE.CylinderGeometry(0.01, 0.01, dir.length(), 3, 1);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
    g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    kit.put('paint', M.paint, paint(g, COL.iron));
    if (i < n - 1) { const p = at((i + 0.5) / n); kit.put('paint', M.paint, paint(new THREE.ConeGeometry(0.12, 0.28, 3, 1).rotateX(Math.PI).translate(p.x, p.y - 0.14, p.z), hues[i % hues.length])); }
  }
}


// ---- the frost round (beauty round): side-wall drifts, the west eave's icicles, frosted tufts at the corners, the lane's snow edging and its footprints; all non-casting, in the fine bucket ----
function frost(kit, M, c, i) {
  for (const sx of [-1, 1]) on(kit, M, c, ball(0.5, 5, 3).scale(0.7, 0.6, 1.5).translate(sx * (c.w / 2 + 0.3), 0.06, c.d * (0.2 - 0.1 * sx)), COL.roofSnow, i + sx, 'fine');
  const n = Math.round(c.d * 1.4);
  for (let k = 0; k < n; k++) on(kit, M, c, new THREE.ConeGeometry(0.035, 0.16 + 0.1 * ((k * 3) % 3), 4, 1, true).rotateX(Math.PI).translate(-c.w / 2 - 0.4, c.h - 0.02, -c.d / 2 + (c.d * (k + 0.5)) / n), COL.ice, 0, 'fine');
  for (let k = 0; k < 6; k++) { // a tuft at each corner and one each side of the porch, two blades leaning apart
    const x = [-1, 1, -1, 1, -0.45, 0.45][k] * (c.w / 2 + (k < 4 ? 0.25 : -0.2)); const z = (k % 2 ? 1 : -1) * c.d / 2 + (k < 4 ? 0 : 0.7);
    for (const b of [-1, 1]) on(kit, M, c, new THREE.ConeGeometry(0.075, 0.5, 3, 1, true).rotateZ(b * 0.3).translate(x + b * 0.07, 0.18, z), (k + i) % 2 ? 0x6f9a86 : 0x93b39e, 0, 'fine');
  }
}
function lane(kit, M) { // snow banked along both edges of the trodden lane, and the first walker's prints down its middle
  for (let s = 0; s < LANE.length - 1; s++) for (let u = 0; u < 4; u++) {
    const [ax, az] = LANE[s]; const [bx, bz] = LANE[s + 1]; const t = (u + 0.5) / 4; const px = ax + (bx - ax) * t; const pz = az + (bz - az) * t;
    const a = Math.atan2(bx - ax, bz - az); const nx = Math.cos(a); const nz = -Math.sin(a);
    for (const sd of [-1, 1]) kit.put(FINE, M.paint, paint(stand(ball(0.34, 5, 3).scale(1, 0.4, 2.2), px + sd * nx * 1.45, pz + sd * nz * 1.45, -0.05, a), COL.roofSnow, sd + u), { noCast: true });
    for (const k of [0, 1]) kit.put(FINE, M.paint, stand(paint(new THREE.CircleGeometry(0.1, 5).rotateX(-Math.PI / 2).scale(1, 1, 1.7), 0x93a6c4), px + (k - 0.5) * nx * 0.4 - nx * 0.1 * (u % 2), pz + (k - 0.5) * nz * 0.4 - nz * 0.1 * (u % 2), 0.03, a + 0.08 * (k - 0.5)), { noCast: true });
  }
}

export function drawDetail(kit, M, { low = false } = {}) {
  LOW = !!low;
  P.COTTAGES.forEach((c, i) => houseDetail(kit, M, c, i));
  if (!LOW) { P.COTTAGES.forEach((c, i) => frost(kit, M, c, i)); lane(kit, M); }
  const by = (id) => P.COTTAGES.find((c) => c.id === id);
  for (const id of D.EXTRA_WOODPILES) woodpile(kit, M, by(id));
  for (const s of D.LEANING_SLEDS) leaningSled(kit, M, by(s.id), s.hue);
  firClumps(kit, M);
  D.birches().forEach((b, i) => birch(kit, M, b, i));
  D.stumps().forEach((s, i) => stump(kit, M, s, i));
  D.NOTICES.forEach((n, i) => notice(kit, M, n, i));
  D.snowmen().forEach((s) => snowman(kit, M, s));
  wellAt(kit, M, D.well());
  // two more strings of pennants: lamp to lamp across the square's east side, and the baker's eave to the lamp by the stall
  const L = P.LAMPS;
  pennants(kit, M, L[3], L[5], [0xc8483f, 0xf4ecd8, 0x2f8f8a], 9, P.snowY(L[3].x, L[3].z) + 2.55, P.snowY(L[5].x, L[5].z) + 2.55, 0.5);
  const bk = by('baker'); const [ex, ez] = D.toWorld(bk, -bk.w / 2 - 0.3, bk.d / 2 + 0.4);
  pennants(kit, M, { x: ex, z: ez }, L[5], [0xf2c14e, 0x6aa8e8, 0xf4ecd8], 7, P.snowY(ex, ez) + bk.h + 0.1, P.snowY(L[5].x, L[5].z) + 2.55, 0.35);
}
