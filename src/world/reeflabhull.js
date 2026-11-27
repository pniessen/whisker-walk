// =============================================================================
// THE REEF, THE SEALAB SEEN FROM OUTSIDE (the polish round after the owner's play). The old building was a box with brass strips; this is a pressure hull: a
// rounded body (a loft around a rounded rectangle, bulging into a shoulder and a low roof), a drum under the dome, a smaller pod on the roof joined by two
// curved corridors, porthole windows ringed in metal, rivet bands, a hatch with a hand wheel, a mast with a dish and whip antennae, small glowing lamps, and
// coral and barnacle growth on the lower half. Everything is vertex colour and ends in the hull mesh (lit) and, for the lamps and the window panes, in the hatch
// mesh (unlit, always shown: outside the roof, so the rooms never see them). Its own seeded stream. The LOW and LITE rungs draw half the growth and no corridor
// ribs. reeflabparts.js hands in its small drawing kit (tone, bx, cy), so this file imports no three.
// =============================================================================
// (the same small generator as ../rng.js, written out: a lab file imports no file outside the lab's own; test/reeflab.test.js holds it to that)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const TAU = Math.PI * 2;
const BODY_R = 1.8; // the plan's corner radius
// the loft: [inset from the footprint, height] (the body's own frame: y 0 is the Sealab's floor)
const PROFILE = Object.freeze([[0, -0.6], [0, 0.8], [0, 2.9], [0.14, 3.5], [0.42, 4.0], [0.85, 4.3]]);
export const ROOF_Y = 4.3;
const DOME_DRUM = Object.freeze({ lo: 2.6, hi: 4.55 });

const LOOK = Object.freeze({
  dark: 0x2c6468, hull: 0x3f8f90, hullLight: 0x4aa0a0, brass: 0xc99a3a, cream: 0xf0e2c0, navy: 0x2e4a52, lamp: 0xffe2a8, pane: 0x9fe0ff, lampB: 0x7ee8c8,
  metal: 0x9aaeb3, algae: 0x4f8a60, algaeDark: 0x3a6e50, rust: 0x8a6a4a,
});
const GROWTH = Object.freeze([0xe0708a, 0xf09a5a, 0x9b6fd0, 0x58b87a, 0xf2c53d]);
const BARNACLE = Object.freeze([0xe6dcc4, 0xcfc4a8, 0xb9ad92]);

// The rounded footprint as a ring of points (x, z, outward nx, nz), the same count at every inset (so the loft's rows line up).
export function ringPoints(b, inset, kArc = 3, mLong = 4, mShort = 1) {
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const hx = (b.maxX - b.minX) / 2 - inset;
  const hz = (b.maxZ - b.minZ) / 2 - inset;
  const rr = Math.max(0.4, BODY_R - inset);
  const out = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]]; // counter-clockwise from +x,+z, around y: a = 0..90, 90..180, ...
  corners.forEach(([sx, sz], c) => {
    const ccx = cx + sx * (hx - rr);
    const ccz = cz + sz * (hz - rr);
    for (let k = 0; k <= kArc; k++) {
      const a = (c + k / kArc) * (Math.PI / 2);
      out.push({ x: ccx + Math.cos(a) * rr, z: ccz + Math.sin(a) * rr, nx: Math.cos(a), nz: Math.sin(a), edge: k === kArc ? c + 1 : 0 });
    }
  });
  // the straight runs between one arc's end and the next arc's start get their own mids (inserted after each arc's last point)
  const res = [];
  const n = out.length;
  for (let i = 0; i < n; i++) {
    res.push(out[i]);
    if (i % (kArc + 1) === kArc) {
      const nxt = out[(i + 1) % n];
      const long = Math.abs(nxt.x - out[i].x) > Math.abs(nxt.z - out[i].z);
      const cnt = long ? mLong : mShort;
      for (let q = 1; q <= cnt; q++) { const t = q / (cnt + 1); res.push({ x: out[i].x + (nxt.x - out[i].x) * t, z: out[i].z + (nxt.z - out[i].z) * t, nx: out[i].nx, nz: out[i].nz, edge: 0 }); }
    }
  }
  return res;
}

// One hull geometry from rows of rings: per-face colour (colour(row, col, y) -> hex), smooth ring normals, no index (so it merges with the rest).
function loft(env, rows, colour, rowNormal) {
  const { THREE } = env;
  const pos = [];
  const nor = [];
  const col = [];
  const c = new THREE.Color();
  const n = rows[0].length;
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a0 = rows[r][i]; const b0 = rows[r][j]; const a1 = rows[r + 1][i]; const b1 = rows[r + 1][j];
      c.setHex(colour(r, i, (a0.y + a1.y) / 2));
      const nr = rowNormal(r);
      const q = [[a0, a1, b0], [b0, a1, b1]]; // counter-clockwise seen from outside
      for (const tri of q) for (const v of tri) { pos.push(v.x, v.y, v.z); nor.push(v.nx * nr[0], nr[1], v.nz * nr[0]); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
}

// A curved corridor: a tube along a quadratic bezier (a, c, b), `sides` round; the colour alternates every ring (ribs) unless ribs is false. Flat per face, hand-built
// (the kit's three has no tube geometry).
function corridor(env, a, c, b, r, hexA, hexB, rings, sides, ribs) {
  const { THREE } = env;
  const at = (t) => [0, 1, 2].map((k) => (1 - t) * (1 - t) * a[k] + 2 * (1 - t) * t * c[k] + t * t * b[k]);
  const ring = (t) => {
    const p = at(t); const q = at(Math.min(1, t + 0.01)); const o = at(Math.max(0, t - 0.01));
    let tx = q[0] - o[0]; let ty = q[1] - o[1]; let tz = q[2] - o[2];
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    let sx = tz; let sz = -tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl; // side = up x tangent
    const ux = ty * sz; const uy = tz * sx - tx * sz; const uz = -ty * sx; // up = tangent x side
    return Array.from({ length: sides }, (_, i) => { const f = (i / sides) * TAU; const cs = Math.cos(f); const sn = Math.sin(f); return { x: p[0] + (sx * cs + ux * sn) * r, y: p[1] + uy * sn * r, z: p[2] + (sz * cs + uz * sn) * r, nx: sx * cs + ux * sn, ny: uy * sn, nz: sz * cs + uz * sn }; });
  };
  const pos = []; const nor = []; const col = []; const cl = new THREE.Color();
  let prev = ring(0);
  for (let k = 1; k <= rings; k++) {
    const cur = ring(k / rings);
    cl.setHex(ribs && k % 2 === 0 ? hexB : hexA);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      for (const v of [prev[i], cur[i], prev[j], prev[j], cur[i], cur[j]]) { pos.push(v.x, v.y, v.z); nor.push(v.nx, v.ny, v.nz); col.push(cl.r, cl.g, cl.b); }
    }
    prev = cur;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  return g;
}

// A porthole facing +z at the origin (ringed in metal): a short bezel and its ring face (hull mesh) and the pane (glow mesh), then turned and set.
function porthole(env, x, y, z, ry, hull, glow) {
  const { THREE, tone } = env;
  const set = (g) => g.rotateY(ry).translate(x, y, z);
  hull.push(set(tone(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.03), LOOK.metal)));
  hull.push(set(tone(new THREE.RingGeometry(0.26, 0.37, 6).translate(0, 0, 0.081), LOOK.brass)));
  glow.push(tone(new THREE.CircleGeometry(0.26, 6).translate(0, 0, 0.012), LOOK.pane).rotateY(ry).translate(x, y + env.floorY, z));
}

// hull(env, b, tier) -> { hull: [geometries], glow: [geometries (their heights are over the Sealab's floor)] }
export function hullParts(env, b, lowTier = false) {
  const { THREE, tone, bx, cy, COL, dome, domeWall, domeRise, floorY } = env;
  const rand = mulberry32(0x5ea1ab);
  const hull = [];
  const glow = [];
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  // ---- the body: a loft round a rounded rectangle, then the roof as a fan
  const rows = PROFILE.map(([inset, y]) => ringPoints(b, inset).map((p) => ({ ...p, y })));
  const rowN = (r) => { const [i0, y0] = PROFILE[r]; const [i1, y1] = PROFILE[r + 1]; const l = Math.hypot(i1 - i0, y1 - y0); return [(y1 - y0) / l, (i1 - i0) / l]; };
  const grow = []; // [x, y, z, nx, nz]: where growth may settle
  const panel = (i) => (Math.floor(i / 3) % 2 ? 0.95 : 1);
  const tint = new THREE.Color();
  const body = loft(env, rows, (r, i, y) => {
    if (r === 0) { // the dark skirt, mottled with algae and a rusty stain
      const u = rand();
      return u < 0.22 ? LOOK.algae : u < 0.34 ? LOOK.algaeDark : u < 0.42 ? LOOK.rust : LOOK.dark;
    }
    const base = r >= 3 ? LOOK.hullLight : LOOK.hull;
    return tint.setHex(base).multiplyScalar(panel(i)).getHex();
  }, rowN);
  hull.push(body);
  const top = rows[rows.length - 1];
  const roof = [];
  top.forEach((p, i) => { const q = top[(i + 1) % top.length]; roof.push(p.x, ROOF_Y, p.z, cx, ROOF_Y, cz, q.x, ROOF_Y, q.z); }); // (facing up)
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(roof), 3));
  rg.computeVertexNormals();
  hull.push(tone(rg, LOOK.cream));
  // ---- the bands: a ring of raised dashes (rivets) at two heights, brass and navy by turns, and a brass sill under the shoulder
  const dense = (inset) => ringPoints(b, inset, 4, 12, 5);
  for (const y of [1.0, 2.7]) {
    const ring = dense(-0.04).map((p) => ({ ...p, y: y - 0.07 }));
    const ring2 = dense(-0.04).map((p) => ({ ...p, y: y + 0.07 }));
    hull.push(loft(env, [ring, ring2], (r, i) => (i % 2 ? LOOK.brass : LOOK.navy), () => [1, 0]));
  }
  // ---- the dome's drum and its crown (as before, a little taller) and the lamp ring round the drum
  const dr = dome.r + 0.15;
  hull.push(tone(new THREE.CylinderGeometry(dr, dr + 0.05, DOME_DRUM.hi - DOME_DRUM.lo, 16, 1, true).translate(dome.x, (DOME_DRUM.hi + DOME_DRUM.lo) / 2, dome.z), LOOK.hull));
  hull.push(tone(new THREE.CylinderGeometry(dr + 0.06, dr + 0.06, 0.14, 16, 1, true).translate(dome.x, DOME_DRUM.hi - 0.05, dome.z), LOOK.brass));
  hull.push(tone(new THREE.SphereGeometry(1, 16, 6, 0, TAU, 0, Math.PI / 2).scale(dome.r, domeRise + 0.1, dome.r).translate(dome.x, domeWall + 0.9, dome.z), COL.domeOut));
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; hull.push(bx(0.07, 2.4, 0.07, dome.x + Math.cos(a) * (dome.r - 0.02), 3.3, dome.z + Math.sin(a) * (dome.r - 0.02), LOOK.brass)); }
  const lampsAt = (n, r, y, cxx, czz, size, hex, hexB) => { for (let k = 0; k < n; k++) { const a = (k / n) * TAU + 0.2; glow.push(tone(new THREE.SphereGeometry(size, 4, 2).translate(cxx + Math.cos(a) * r, y + floorY, czz + Math.sin(a) * r), k % 2 ? hexB : hex)); } };
  lampsAt(lowTier ? 6 : 10, dr + 0.08, DOME_DRUM.lo + 0.45, dome.x, dome.z, 0.09, LOOK.lamp, LOOK.lamp);
  // ---- the pod: a smaller dome on the roof, its sill, three portholes and a crown lamp; two curved corridors tie it to the drum and to the air tank
  const pod = { x: 4.9, z: -33.6, r: 1.5 };
  hull.push(tone(new THREE.CylinderGeometry(pod.r + 0.1, pod.r + 0.15, 0.4, 10, 1, true).translate(pod.x, ROOF_Y + 0.15, pod.z), LOOK.brass));
  hull.push(tone(new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, Math.PI / 2).scale(pod.r, 1.25, pod.r).translate(pod.x, ROOF_Y + 0.3, pod.z), LOOK.hullLight));
  for (let k = 0; k < 3; k++) { const a = Math.PI / 2 + (k - 1) * 0.95; porthole(env, pod.x + Math.cos(a) * (pod.r * 0.86), ROOF_Y + 0.85, pod.z + Math.sin(a) * (pod.r * 0.86), Math.PI / 2 - a, hull, glow); }
  hull.push(cy(0.08, 0.1, 0.18, pod.x, ROOF_Y + 1.5, pod.z, LOOK.brass, 6));
  glow.push(tone(new THREE.SphereGeometry(0.11, 4, 2).translate(pod.x, ROOF_Y + 1.78 + floorY, pod.z), LOOK.lamp));
  const rings = lowTier ? 5 : 8;
  hull.push(corridor(env, [pod.x + 1.4, ROOF_Y + 0.7, pod.z + 0.3], [(pod.x + dome.x) / 2, ROOF_Y + 2.4, pod.z - 0.4], [dome.x - dome.r - 0.1, DOME_DRUM.lo + 0.9, dome.z + 0.2], 0.42, LOOK.hullLight, LOOK.brass, rings, 6, !lowTier));
  hull.push(corridor(env, [pod.x + 0.4, ROOF_Y + 0.5, pod.z - 1.4], [6.0, ROOF_Y + 1.5, -36.0], [7.0, ROOF_Y + 0.65, -35.0], 0.28, LOOK.hull, LOOK.navy, 5, 5, false));
  // ---- the mast and its dish, the whip antennae with their lamps, and the roof's tank (as before)
  hull.push(cy(0.05, 0.07, 2.6, 3.0, ROOF_Y - 0.05, -37.0, LOOK.navy, 6));
  const dish = new THREE.SphereGeometry(0.55, 8, 3, 0, TAU, 0, Math.PI / 2.4).rotateX(Math.PI * 0.12).rotateY(0.9).translate(3.0, ROOF_Y + 2.4, -37.0);
  hull.push(tone(dish, LOOK.cream));
  hull.push(cy(0.02, 0.02, 0.55, 3.0, ROOF_Y + 2.45, -37.0, LOOK.metal, 4), bx(0.7, 0.04, 0.04, 3.0, ROOF_Y + 2.1, -37.0, LOOK.navy));
  glow.push(tone(new THREE.SphereGeometry(0.1, 4, 2).translate(3.0, ROOF_Y + 2.95 + floorY, -37.0), LOOK.lamp));
  const whips = [[dome.x, domeWall + 0.9 + domeRise + 0.05, dome.z, 1.5], [16.9, ROOF_Y - 0.05, -37.6, 1.7], [pod.x - 0.7, ROOF_Y + 1.2, pod.z + 0.5, 1.0]];
  for (const [x, y, z, h] of lowTier ? whips.slice(0, 2) : whips) {
    hull.push(cy(0.015, 0.03, h, x, y, z, LOOK.metal, 4));
    glow.push(tone(new THREE.SphereGeometry(0.07, 4, 2).translate(x, y + h + 0.04 + floorY, z), LOOK.lampB));
  }
  hull.push(cy(0.35, 0.35, 0.6, 7.0, ROOF_Y - 0.05, -35.0, LOOK.navy, 8), cy(0.38, 0.38, 0.08, 7.0, ROOF_Y + 0.55, -35.0, LOOK.brass, 8));
  // ---- porthole windows ringed in metal: north, south and west faces (on the flat runs)
  for (const x of [1.9, 4.9, 7.9, 10.9, 13.9]) porthole(env, x, 2.0, b.minZ, Math.PI, hull, glow);
  for (const x of [1.9, 4.9, 7.9]) porthole(env, x, 2.0, b.maxZ, 0, hull, glow);
  for (const z of [-37.0, -34.5, -32.0]) porthole(env, b.minX, 2.0, z, -Math.PI / 2, hull, glow);
  // ---- the side hatch with its hand wheel (south face, east of the portholes): a ringed round door, hinges, a wheel with spokes, two lamps beside it
  const hx = 11.6; const hy = 1.25; const hz = b.maxZ;
  const place = (g) => g.translate(hx, hy, hz);
  hull.push(place(tone(new THREE.TorusGeometry(0.7, 0.08, 3, 12).translate(0, 0, 0.04), LOOK.brass)));
  hull.push(place(tone(new THREE.CircleGeometry(0.66, 12).translate(0, 0, 0.05), LOOK.dark)));
  hull.push(place(tone(new THREE.TorusGeometry(0.24, 0.04, 3, 10).translate(0, 0, 0.14), LOOK.metal)));
  for (let k = 0; k < 3; k++) hull.push(place(tone(new THREE.BoxGeometry(0.46, 0.04, 0.04).rotateZ((k * Math.PI) / 3).translate(0, 0, 0.14), LOOK.metal)));
  hull.push(place(tone(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 6).rotateX(Math.PI / 2).translate(0, 0, 0.1), LOOK.brass)));
  for (const sy of [-0.38, 0.38]) hull.push(place(tone(new THREE.BoxGeometry(0.1, 0.16, 0.08).translate(-0.74, sy, 0.05), LOOK.brass)));
  for (const sx of [-1, 1]) glow.push(tone(new THREE.SphereGeometry(0.1, 4, 2).translate(hx + sx * 1.0, hy + 0.75 + floorY, hz + 0.1), sx > 0 ? LOOK.lamp : LOOK.lampB));
  // ---- growth on the lower half: barnacles (small pale cones standing out of the wall) and coral tufts (three cones leaning up), seeded
  const dense0 = ringPoints(b, 0, 6, 20, 9);
  const nBarn = lowTier ? 10 : 22;
  const nCor = lowTier ? 7 : 18;
  for (let k = 0; k < nBarn; k++) {
    const p = dense0[Math.floor(rand() * dense0.length)];
    const y = 0.05 + rand() * 1.9; // (the lowest metre is under the sand)
    for (let q = 0; q < 2; q++) {
      const g = new THREE.ConeGeometry(0.14 + rand() * 0.07, 0.2, 4, 1, true).rotateX(Math.PI / 2).rotateY(Math.atan2(p.nx, p.nz));
      hull.push(tone(g.translate(p.x + p.nx * 0.02 + (rand() - 0.5) * 0.12, y + (rand() - 0.5) * 0.1, p.z + p.nz * 0.02 + (rand() - 0.5) * 0.12), BARNACLE[Math.floor(rand() * BARNACLE.length)]));
    }
  }
  for (let k = 0; k < nCor; k++) {
    const p = dense0[Math.floor(rand() * dense0.length)];
    const y = 0.1 + rand() * 1.3;
    const hex = GROWTH[Math.floor(rand() * GROWTH.length)];
    for (let q = 0; q < 3; q++) {
      const g = new THREE.ConeGeometry(0.15, 0.7 + rand() * 0.5, 4, 1, true).rotateX(Math.PI / 2 - 0.55 - rand() * 0.3).rotateY(Math.atan2(p.nx, p.nz) + (q - 1) * 0.5);
      hull.push(tone(g.translate(p.x + p.nx * 0.03 + (q - 1) * 0.16 * -p.nz, y, p.z + p.nz * 0.03 + (q - 1) * 0.16 * p.nx), hex));
    }
  }
  return { hull, glow };
}
