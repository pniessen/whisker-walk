// =============================================================================
// THE REEF, WING C, REBUILT: THE SUNKEN BOAT AND THE OLD ANCHOR (the polish round after the owner's play). Both used to be separate pieces set by hand offsets, so
// they drew as gapped planks and as a cross with nothing joined. Now each is ONE set of attachment points, and every piece starts where its neighbour ends:
//   the boat: a curved keel, a raked stem, eight strakes (planked sides) that share their seams from the keel to the rail, ribs on the inner skin, a rail on each
//             side, two thwarts that run into the planking, one broken mast (a step on the keel, the stump, splinters, and the broken top lying on the rail) and a
//             little coral on the rail; the stern is a ragged broken edge.
//   the anchor: a shank with a ring at one end (the first chain link goes through the ring, the rest hang to the sand), a stock through the shank, a crown at the
//             other end and two arms that start at the crown; each fluke's base sits on its arm's tip. It lies on its side, rolled, half in the sand.
// The pieces are returned as { name, geo, cast } (world coordinates) by boatPieces and anchorPieces, so the tests can check that neighbours touch; drawBoat and drawAnchor
// put them into the kit's 'paint' bucket. No random number, no clock. This file imports nothing: reefdeepparts.js hands in { THREE (the kit's), paint, reefY, D (reefdeep.js) }
// (a wreck-stage file stays out of the base chunk, test/reefwreck.test.js).
// =============================================================================

const WOOD = 0x8a6a46;
const WOOD_DARK = 0x5f4630;
const WOOD_WORN = 0xa58a62;
const WOOD_MID = 0x74583a;
const IRON = 0x5d6b70;
const IRON_LIGHT = 0x7d8d90;
const RUST = 0x7a5f4c;
const CORAL = Object.freeze([0xe8708a, 0xf08a4b, 0xa45fc4, 0xe8c34a]);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// A pile of triangles with a colour each, made into one flat-shaded geometry (non-indexed, with normal, uv and colour, so every piece merges).
function pile(THREE) {
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  // `face` (a vector, or a function of the triangle's middle) is the way the triangle must look: the paint is one-sided, so a triangle that would face the other way is turned over
  const tri = (a, b, d, hex, face) => {
    if (face) {
      const m = [(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3];
      const f = typeof face === 'function' ? face(m) : face;
      const n = cross(sub(b, a), sub(d, a));
      if (n[0] * f[0] + n[1] * f[1] + n[2] * f[2] < 0) { const t = b; b = d; d = t; }
    }
    c.setHex(hex);
    for (const p of [a, b, d]) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); }
  };
  return {
    tri,
    quad: (a, b, d, e, hex, face) => { tri(a, b, d, hex, face); tri(b, e, d, hex, face); }, // a b / d e as a grid cell: a-b along one side, d-e along the other
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.computeVertexNormals();
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
      return g;
    },
  };
}

// A round tube along the points `pts` (radius r0 at the first to r1 at the last), `sides` round, flat-shaded, capped at both ends. A bar is a tube of two points.
function tube(THREE, pts, r0, r1, sides, hex) {
  const pl = pile(THREE);
  const rings = pts.map((p, k) => {
    const a = pts[Math.max(0, k - 1)]; const b = pts[Math.min(pts.length - 1, k + 1)];
    const t = unit(sub(b, a));
    let s = cross([0, 1, 0], t);
    if (Math.hypot(...s) < 0.1) s = cross([1, 0, 0], t);
    s = unit(s);
    const u = unit(cross(t, s));
    const r = r0 + (r1 - r0) * (k / Math.max(1, pts.length - 1));
    return Array.from({ length: sides }, (_, i) => { const f = (i / sides) * Math.PI * 2; return add3(add3(p, s, Math.cos(f) * r), u, Math.sin(f) * r); });
  });
  for (let k = 0; k < rings.length - 1; k++) {
    const mid = (rings[k][0].map((_, q) => (pts[k][q] + pts[k + 1][q]) / 2));
    for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; pl.quad(rings[k][i], rings[k][j], rings[k + 1][i], rings[k + 1][j], hex, (m) => sub(m, mid)); }
  }
  const dirs = [unit(sub(pts[0], pts[1])), unit(sub(pts[pts.length - 1], pts[pts.length - 2]))];
  for (const [k, e] of [[0, pts[0]], [rings.length - 1, pts[pts.length - 1]]]) for (let i = 0; i < sides; i++) pl.tri(e, rings[k][i], rings[k][(i + 1) % sides], hex, dirs[k === 0 ? 0 : 1]);
  return pl.geo();
}
const bar = (THREE, p, q, r0, r1, sides, hex) => tube(THREE, [p, q], r0, r1, sides, hex);
// A box from two opposite corners' centres: a beam from p to q with a rectangular section (w across the horizontal side, h up), turned by the beam's own direction.
function beam(THREE, p, q, w, h, hex) {
  const pl = pile(THREE);
  const t = unit(sub(q, p));
  let s = cross([0, 1, 0], t);
  if (Math.hypot(...s) < 0.1) s = cross([1, 0, 0], t);
  s = unit(s);
  const u = unit(cross(t, s));
  const c = (e, a, b) => add3(add3(e, s, a * w / 2), u, b * h / 2);
  const P = [p, q].map((e) => [c(e, -1, -1), c(e, 1, -1), c(e, 1, 1), c(e, -1, 1)]);
  const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pl.quad(P[0][i], P[0][j], P[1][i], P[1][j], hex, (m) => sub(m, mid)); }
  pl.quad(P[0][0], P[0][1], P[0][3], P[0][2], hex, sub(p, q)); pl.quad(P[1][0], P[1][1], P[1][3], P[1][2], hex, sub(q, p));
  return pl.geo();
}

// ---- the Sunken Boat -----------------------------------------------------------------------------------------------------------------
export const BOAT_N = 14; // stations along the keel
export const BOAT_M = 8; // strakes across (the planked sides, from one rim over the keel to the other)
export const PLANK = 0.1; // the planking's thickness
const STERN_END = Object.freeze([BOAT_N - 3, BOAT_N - 1, BOAT_N, BOAT_N, BOAT_N, BOAT_N, BOAT_N - 2, BOAT_N - 4]); // how far each strake runs toward the stern: a ragged broken edge
const PITCH = 0.05; // the stern lifts a little, so the curved keel shows at the open end

/** boatPieces(env) -> [{ name, geo, cast }] in world coordinates. env = { THREE, paint, reefY, D }. */
export function boatPieces(env) {
  const { THREE, reefY, D } = env;
  const B = D.BOAT;
  const Lh = B.length / 2;
  const N = BOAT_N;
  const M = BOAT_M;
  const T = PLANK;
  const base = reefY(B.x, B.z) - 0.3; // the hull is set 0.3 m into the sand
  const dep = (t) => B.depth * (t > 0 ? 1 - 0.4 * t * t : 1); // the keel comes up toward the open stern
  // a point of a skin: station t in [-1, 1], angle a across (-pi/2 one rim, 0 the keel, +pi/2 the other rim), `inset` in from the outer skin
  const S = (t, a, inset = 0) => [t * Lh, D.hullRim(t) - (dep(t) - inset) * Math.cos(a), Math.max(0.001, D.hullHalf(t) - inset) * Math.sin(a)];
  const tAt = (i) => -1 + (2 * i) / N;
  const aAt = (j) => -Math.PI / 2 + (Math.PI * j) / M;
  const world = (geo) => geo.rotateZ(PITCH).rotateX(B.roll).rotateY(-B.yaw).translate(B.x, base, B.z);
  const out = [];
  const put = (name, geo, cast = false) => out.push({ name, geo: world(geo), cast });
  const out3 = (t, inward = false) => (m) => { const f = [0, m[1] - D.hullRim(t), m[2]]; return inward ? [0, -f[1], -f[2]] : f; }; // out of the cross-section's middle (the rim's height on the keel line)
  const woods = [WOOD, WOOD_WORN, WOOD_MID, WOOD_WORN, WOOD, WOOD_MID, WOOD_WORN, WOOD];
  // the strakes: each is its own outer and inner skin, the broken end and (the two outermost) the top edge; neighbours share every point of their seam
  for (let j = 0; j < M; j++) {
    const pl = pile(THREE);
    const E = STERN_END[j];
    for (let i = 0; i < E; i++) {
      const dark = i % 4 === 3; // the planks' butt joints
      const hexO = dark ? WOOD_DARK : woods[j];
      pl.quad(S(tAt(i), aAt(j)), S(tAt(i + 1), aAt(j)), S(tAt(i), aAt(j + 1)), S(tAt(i + 1), aAt(j + 1)), hexO, out3(tAt(i)));
      pl.quad(S(tAt(i), aAt(j), T), S(tAt(i + 1), aAt(j), T), S(tAt(i), aAt(j + 1), T), S(tAt(i + 1), aAt(j + 1), T), j % 2 ? WOOD_DARK : WOOD_MID, out3(tAt(i), true));
      if (j === 0 || j === M - 1) pl.quad(S(tAt(i), aAt(j === 0 ? 0 : M)), S(tAt(i + 1), aAt(j === 0 ? 0 : M)), S(tAt(i), aAt(j === 0 ? 0 : M), T), S(tAt(i + 1), aAt(j === 0 ? 0 : M), T), WOOD_WORN, [0, 1, 0]); // the rim's top edge
    }
    if (E < N) pl.quad(S(tAt(E), aAt(j)), S(tAt(E), aAt(j + 1)), S(tAt(E), aAt(j), T), S(tAt(E), aAt(j + 1), T), WOOD_DARK, [1, 0, 0]); // the broken end
    put(`strake${j}`, pl.geo(), true);
  }
  // the keel: a beam along the outer skin's lowest line, its top a little over the inner skin
  const kp = Array.from({ length: N + 1 }, (_, i) => { const p = S(tAt(i), 0); return [p[0], p[1] + 0.03, 0]; });
  {
    const pl = pile(THREE);
    const sec = kp.map((p) => [[p[0], p[1] - 0.1, -0.09], [p[0], p[1] - 0.1, 0.09], [p[0], p[1] + 0.12, 0.09], [p[0], p[1] + 0.12, -0.09]]);
    for (let k = 0; k < N; k++) for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; const cc = [kp[k][0], kp[k][1] + 0.01, 0]; pl.quad(sec[k][i], sec[k][j], sec[k + 1][i], sec[k + 1][j], WOOD_DARK, (m) => sub(m, cc)); }
    put('keel', pl.geo(), true);
  }
  // the stem: a raked post from the keel's bow end up past the rim (the strakes all meet at the bow's line)
  put('stem', bar(THREE, [kp[0][0] + 0.02, kp[0][1] - 0.02, 0], [-Lh - 0.2, D.hullRim(-1) + 0.45, 0], 0.1, 0.07, 5, WOOD_DARK), true);
  // the ribs: arcs on the inner skin at five stations, each swept round the inside of the hull
  for (const i of [2, 4, 6, 8, 10]) {
    const t0 = tAt(i) - 0.07 / Lh;
    const t1 = tAt(i) + 0.07 / Lh;
    const pl = pile(THREE);
    const K = 8;
    for (let k = 0; k < K; k++) {
      const a0 = -Math.PI / 2 + (Math.PI * k) / K;
      const a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / K;
      const c = (t, a, ins) => S(t, a, ins);
      pl.quad(c(t0, a0, T + 0.1), c(t0, a1, T + 0.1), c(t1, a0, T + 0.1), c(t1, a1, T + 0.1), WOOD_DARK, out3(tAt(i), true)); // the rib's inner face
      pl.quad(c(t0, a0, T), c(t0, a1, T), c(t0, a0, T + 0.1), c(t0, a1, T + 0.1), WOOD_MID, [-1, 0, 0]); // and its two sides
      pl.quad(c(t1, a0, T), c(t1, a1, T), c(t1, a0, T + 0.1), c(t1, a1, T + 0.1), WOOD_MID, [1, 0, 0]);
    }
    put(`rib${i}`, pl.geo());
  }
  // the rail: a gunwale along each side's rim, as far as that side's strake runs
  for (const [name, j, sg] of [['railL', 0, -1], ['railR', M - 1, 1]]) {
    const E = STERN_END[j];
    const pl = pile(THREE);
    const sec = (i) => { const t = tAt(i); const hw = Math.max(0.001, D.hullHalf(t)); const rim = D.hullRim(t); const x = t * Lh; return [[x, rim - 0.03, sg * (hw + 0.05)], [x, rim + 0.07, sg * (hw + 0.05)], [x, rim + 0.07, sg * Math.max(0.001, hw - T - 0.06)], [x, rim - 0.03, sg * Math.max(0.001, hw - T - 0.06)]]; };
    for (let i = 0; i < E; i++) { const a = sec(i); const b = sec(i + 1); const cc = [(a[0][0] + b[0][0]) / 2, D.hullRim(tAt(i)) + 0.02, sg * Math.max(0.001, D.hullHalf(tAt(i)) - 0.005)]; for (let q = 0; q < 3; q++) pl.quad(a[q], a[q + 1], b[q], b[q + 1], q === 1 ? WOOD_WORN : WOOD, (m) => sub(m, cc)); pl.quad(a[0], a[3], b[0], b[3], WOOD, [0, -1, 0]); }
    put(name, pl.geo());
  }
  // two thwarts (seats) across the hull, each running into the planking at both ends
  const thwart = (name, u) => {
    const t = u / Lh;
    const yS = D.hullRim(t) - 0.42; // the seat's height
    const d = dep(t) - T;
    const aS = Math.acos(Math.min(1, Math.max(-1, (D.hullRim(t) - yS) / d)));
    const half = Math.max(0.001, D.hullHalf(t) - T) * Math.sin(aS) + 0.05;
    put(name, beam(THREE, [u, yS, -half], [u, yS, half], 0.34, 0.07, WOOD_WORN));
  };
  thwart('thwart0', -2.0);
  thwart('thwart1', 1.2);
  // the one broken mast: a step on the keel, the stump through the first thwart's reach, jagged splinters on its break, and the broken top lying across the rail
  const xm = -0.6;
  const tm = xm / Lh;
  const keelY = S(tm, 0)[1] + 0.03 + 0.12;
  put('mastStep', beam(THREE, [xm - 0.2, keelY + 0.07, 0], [xm + 0.2, keelY + 0.07, 0], 0.42, 0.14, WOOD_DARK));
  const topY = D.hullRim(tm) + 0.95;
  put('mast', bar(THREE, [xm, keelY, 0], [xm, topY, 0], 0.12, 0.085, 6, WOOD_DARK), true);
  [[-0.04, 0.03, 0.42], [0.05, 0.02, 0.3], [0.0, -0.05, 0.22]].forEach(([dx, dz, h], k) => put(`splinter${k}`, bar(THREE, [xm + dx * 0.4, topY, dz * 0.4], [xm + dx, topY + h, dz], 0.04, 0.005, 3, WOOD_WORN)));
  const hwm = D.hullHalf(tm);
  put('mastTop', bar(THREE, [xm, topY, 0], [xm + 0.45, D.hullRim(tm) + 0.07 + 0.07, hwm - 0.1], 0.085, 0.07, 6, WOOD));
  // a little coral on the rails, so the boat is the reef's own now
  for (let i = 0; i < 7; i++) {
    const u = -2.4 + i * 0.9;
    const t = u / Lh;
    const sg = i % 2 ? 1 : -1;
    const E = STERN_END[i % 2 ? M - 1 : 0];
    if (t > tAt(E - 1)) continue;
    put(`coral${i}`, bar(THREE, [u, D.hullRim(t) + 0.06, sg * (D.hullHalf(t) - 0.01)], [u, D.hullRim(t) + 0.06 + 0.3 + (i % 3) * 0.16, sg * (D.hullHalf(t) - 0.01)], 0.13, 0.05, 6, CORAL[i % 4]));
  }
  return out;
}

export function drawBoat(kit, M, env) {
  for (const p of boatPieces(env)) kit.put('paint', M.paint, p.geo, p.cast ? undefined : { noCast: true });
}

// ---- the Old Anchor ------------------------------------------------------------------------------------------------------------------
export const ANCHOR_ROLL = 0.9; // rolled about the shank, so it lies on its side with one arm up, one down in the sand
export const ANCHOR_TILT = -0.1; // the ring end lifted a little
export const ANCHOR_LINKS = 9;

/** anchorPieces(env) -> [{ name, geo, cast }] in world coordinates (the chain too). env = { THREE, paint, reefY, D }. */
export function anchorPieces(env) {
  const { THREE, reefY, D } = env;
  const A = D.ANCHOR;
  const L2 = A.shank / 2;
  const gy0 = reefY(A.x, A.z);
  const cr = Math.cos(ANCHOR_ROLL); const sr = Math.sin(ANCHOR_ROLL);
  const ct = Math.cos(ANCHOR_TILT); const st = Math.sin(ANCHOR_TILT);
  const cy = Math.cos(-A.yaw); const sy = Math.sin(-A.yaw);
  // the same three turns the geometry gets (roll about the shank, tilt, the area's yaw) then set on the dune, for a point
  const place = (p) => {
    const y1 = p[1] * cr - p[2] * sr; const z1 = p[1] * sr + p[2] * cr;
    const x2 = p[0] * ct - y1 * st; const y2 = p[0] * st + y1 * ct;
    return [x2 * cy + z1 * sy + A.x, y2 + gy0 + 0.25, -x2 * sy + z1 * cy + A.z];
  };
  const world = (g) => g.rotateX(ANCHOR_ROLL).rotateZ(ANCHOR_TILT).rotateY(-A.yaw).translate(A.x, gy0 + 0.25, A.z);
  const out = [];
  const put = (name, geo, cast = false) => out.push({ name, geo: world(geo), cast });
  const sphere = (r, c) => { const g = new THREE.SphereGeometry(r, 6, 4).translate(c[0], c[1], c[2]); return env.paint(g, IRON_LIGHT); };
  const ringX = -L2 - 0.12; // the ring's middle, its inner edge just inside the shank's end
  put('shank', bar(THREE, [-L2, 0, 0], [L2, 0, 0], 0.08, 0.115, 6, IRON), true);
  put('shankRust', bar(THREE, [0.15, 0, 0], [0.9, 0, 0], 0.118, 0.123, 6, RUST));
  put('ring', env.paint(new THREE.TorusGeometry(0.2, 0.045, 5, 10).translate(ringX, 0, 0), IRON_LIGHT));
  put('stock', bar(THREE, [-L2 + 0.18, 0, -0.75], [-L2 + 0.18, 0, 0.75], 0.045, 0.045, 5, IRON_LIGHT));
  put('stockKnobA', sphere(0.075, [-L2 + 0.18, 0, -0.75]));
  put('stockKnobB', sphere(0.075, [-L2 + 0.18, 0, 0.75]));
  put('crown', sphere(0.17, [L2, 0, 0]));
  // the two arms: each starts at the crown, bows out and curves back toward the ring; a fluke's base (a flat triangular blade) sits exactly on the tip
  for (const s of [-1, 1]) {
    const P0 = [L2, 0, 0]; const P1 = [L2 + 0.35, s * 0.7, 0]; const P2 = [L2 - 0.35, s * 0.82, 0];
    const pts = Array.from({ length: 6 }, (_, k) => { const u = k / 5; return [0, 1, 2].map((q) => (1 - u) * (1 - u) * P0[q] + 2 * (1 - u) * u * P1[q] + u * u * P2[q]); });
    put(s > 0 ? 'armR' : 'armL', tube(THREE, pts, 0.085, 0.06, 6, s > 0 ? RUST : IRON), true);
    const te = unit(sub(P2, P1)); // the arm's end direction
    const nn = [-te[1], te[0], 0]; // across it, in the arms' plane
    const apex = add3(P2, te, 0.42);
    const pl = pile(THREE);
    const L = add3(P2, nn, 0.19); const R = add3(P2, nn, -0.19);
    const cen = [(L[0] + R[0] + apex[0]) / 3, (L[1] + R[1] + apex[1]) / 3, 0];
    for (const z of [-0.03, 0.03]) { const lift = (p) => [p[0], p[1], p[2] + z]; pl.tri(lift(L), lift(R), lift(apex), IRON_LIGHT, [0, 0, z]); }
    for (const [a, b] of [[L, R], [R, apex], [apex, L]]) pl.quad([a[0], a[1], -0.03], [b[0], b[1], -0.03], [a[0], a[1], 0.03], [b[0], b[1], 0.03], IRON_LIGHT, (m) => [m[0] - cen[0], m[1] - cen[1], 0]);
    put(s > 0 ? 'flukeR' : 'flukeL', pl.geo());
  }
  // the chain: the first link goes through the ring's far side, the next ones hang down to the sand and the rest lie along it
  const tip = place([ringX - 0.2, 0, 0]);
  const away = unit([cy * -1, 0, sy]); // the shank's ring end, seen from above (local -x turned by the yaw)
  const side = [-away[2], 0, away[0]];
  const links = [];
  for (let k = 0; k < ANCHOR_LINKS; k++) {
    const x = tip[0] + away[0] * 0.14 * k + side[0] * 0.04 * k;
    const z = tip[2] + away[2] * 0.14 * k + side[2] * 0.04 * k;
    const g = reefY(x, z) + 0.05;
    const y = g + Math.max(0, tip[1] - reefY(tip[0], tip[2]) - 0.05) * Math.max(0, 1 - k / 3.5) ** 2;
    links.push([x, k === 0 ? tip[1] : y, z]);
  }
  links.forEach((c, k) => {
    const n = links[Math.min(links.length - 1, k + 1)]; const p = links[Math.max(0, k - 1)];
    const d = sub(n, p);
    const geo = new THREE.TorusGeometry(0.085, 0.028, 4, 8).scale(1.45, 1, 1).rotateX(k % 2 ? 0 : Math.PI / 2).rotateZ(Math.atan2(d[1], Math.hypot(d[0], d[2]))).rotateY(Math.atan2(-d[2], d[0])).translate(c[0], c[1], c[2]);
    out.push({ name: `chain${k}`, geo: env.paint(geo, IRON_LIGHT), cast: false });
  });
  return out;
}

export function drawAnchor(kit, M, env) {
  for (const p of anchorPieces(env)) kit.put('paint', M.paint, p.geo, p.cast ? undefined : { noCast: true });
}
