import { hash01 } from './builder.js';
import { lin, scale3 } from './dressing.js';
import { tri, sliver } from './forestfloor.js';
import { segDist } from '../segdist.js';

// The Pines beauty round (docs/beauty-backlog.md PIN-2 and more). The sun
// frost patches are vertex colour on the ground
// (forestfloor.js pinesFloorTint). The bits here are painted triangles drawn
// into the existing noCast forestFloor mesh (the `extra` option of forestFloorMesh), so the
// Pines gains no mesh and no draw. Nothing draws Math.random: every place and
// every size comes from hash01 of the spot, so no seeded layout moves.
//   * fallen twigs, one with a fork, lying near the trunks;
//   * tree roots, three flat tapered ribs running out of each big trunk;
//   * fairy rings of small amber toadstools in the open between the pines;
//   * grass tufts and a blue harebell now and then along the path edges.

const TWIG = [0x5c4430, 0x6e5438, 0x4c3a2a].map(lin);
const ROOT = lin(0x7a5638);
const ROOT_LO = lin(0x5e4128);
const CAP = [0xd9b36a, 0xa8602e].map(lin);
const STEM = lin(0xece4d2);
const GRASS = [0x4a7a3c, 0x365f30, 0x5a8a40].map(lin);
const PETAL = lin(0x7a8ee0);
const HEART = lin(0xf0e6a0);

const flat = (t, A, B, C, col) => {
  // wound so the face looks up
  const n = (B[0] - A[0]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[0] - A[0]);
  if (n <= 0) tri(t, A, B, C, col); else tri(t, A, C, B, col);
};

const r2 = (v) => Math.round(v * 100) / 100;

// A fallen twig: a thin flat quad 0.35-0.6 m long, and a short fork off it.
function twig(t, x, z) {
  const L = 0.6 + 0.45 * hash01(x, z, 201);
  const yaw = hash01(x, z, 202) * Math.PI;
  const c = Math.cos(yaw), s = Math.sin(yaw), w = 0.03;
  const col = scale3(TWIG[Math.floor(hash01(x, z, 203) * 3) % 3], 0.92 + 0.16 * hash01(x, z, 204));
  const y = 0.04;
  const a = [x - c * L / 2, y, z - s * L / 2], b = [x + c * L / 2, y + 0.008, z + s * L / 2];
  const o = [-s * w, 0, c * w];
  flat(t, [a[0] - o[0], a[1], a[2] - o[2]], [a[0] + o[0], a[1], a[2] + o[2]], [b[0] + o[0], b[1], b[2] + o[2]], col);
  flat(t, [a[0] - o[0], a[1], a[2] - o[2]], [b[0] + o[0], b[1], b[2] + o[2]], [b[0] - o[0], b[1], b[2] - o[2]], col);
  if (hash01(x, z, 205) < 0.7) {
    const f = 0.2 + 0.5 * hash01(x, z, 206);
    const m = [a[0] + (b[0] - a[0]) * f, y + 0.004, a[2] + (b[2] - a[2]) * f];
    const side = hash01(x, z, 207) < 0.5 ? 1 : -1;
    const fa = yaw + side * (0.5 + 0.4 * hash01(x, z, 208));
    const fl = L * 0.35;
    flat(t, [m[0] - o[0], m[1], m[2] - o[2]], [m[0] + o[0], m[1], m[2] + o[2]], [m[0] + Math.cos(fa) * fl, y + 0.008, m[2] + Math.sin(fa) * fl], col);
  }
}

// A root rib: a flat tapered quad running out of the trunk, high at the trunk
// and sinking into the ground (two triangles).
function root(t, tx, tz, scale, k) {
  const a = hash01(tx, tz, 211 + k) * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  const r0 = 0.25 * scale, r1 = (1.0 + 0.5 * hash01(tx, tz, 215 + k)) * scale;
  const w0 = 0.15 * scale, w1 = 0.015 * scale;
  const h0 = 0.16 * scale;
  const P = (r, w, y) => [tx + c * r - s * w, y, tz + s * r + c * w];
  // a ridge: the crest runs from high at the trunk down into the ground, the
  // two flanks are the two triangles
  const top = P(r0 + 0.1 * scale, 0, h0), tip = P(r1, 0, 0.005);
  tri(t, top, P(r0, -w0, 0.02), tip, ROOT, [top[0], -0.2, top[2]]);
  tri(t, top, tip, P(r0, w0, 0.02), ROOT_LO, [top[0], -0.2, top[2]]);
}

// A small toadstool of a fairy ring: a 4-sided cap on a one-triangle stem.
function toadstool(t, x, z, k) {
  const r = 0.07 + 0.03 * hash01(x, z, 221), h = 0.08 + 0.04 * hash01(x, z, 222);
  const a = hash01(x, z, 223) * Math.PI;
  sliver(t, [x - Math.cos(a) * 0.008, 0, z - Math.sin(a) * 0.008], [x + Math.cos(a) * 0.008, 0, z + Math.sin(a) * 0.008], [x, h, z], STEM);
  const col = CAP[k % 2];
  const top = [x, h + 0.05, z];
  for (let i = 0; i < 4; i++) {
    const a0 = a + (i / 4) * Math.PI * 2, a1 = a + ((i + 1) / 4) * Math.PI * 2;
    tri(t, top, [x + Math.cos(a0) * r, h - 0.006, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, h - 0.006, z + Math.sin(a1) * r], col, [x, h - 0.04, z]);
  }
}

// A grass tuft of three blades, now and then with a harebell beside it.
function tuft(t, x, z) {
  for (let k = 0; k < 3; k++) {
    const a = hash01(x + k, z, 231) * Math.PI * 2;
    const h = 0.22 + 0.2 * hash01(x, z + k, 232);
    const dx = Math.cos(a) * 0.07, dz = Math.sin(a) * 0.07;
    sliver(t, [x - dz, 0, z + dx], [x + dz, 0, z - dx], [x + dx * 1.6, h, z + dz * 1.6], GRASS[k % 3]);
  }
  if (hash01(x, z, 233) < 0.3) {
    const fx = x + 0.15, fz = z - 0.1, y = 0.2;
    const rr = 0.06;
    sliver(t, [fx - 0.006, 0, fz], [fx + 0.006, 0, fz], [fx, y, fz], GRASS[1]);
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * Math.PI * 2 + 0.4, a1 = ((i + 1) / 3) * Math.PI * 2 + 0.4;
      tri(t, [fx, y + 0.012, fz], [fx + Math.cos(a0) * rr, y, fz + Math.sin(a0) * rr], [fx + Math.cos(a1) * rr, y, fz + Math.sin(a1) * rr], i === 0 ? HEART : PETAL, [fx, y - 0.1, fz]);
    }
  }
}

// Where the bits go. `trees` are the tree spots of the Pines; `ok` is a fit rule for
// something lying flat, `okTall` for something standing, `okEdge` for what
// sits beside a path (all (x, z) => bool, built in pines.js from its own
// rules); `paths` are the path segments.
export function pinesBeauty({ trees, ok, okTall, okEdge, paths }) {
  const twigs = [], roots = [], rings = [], tufts = [];
  for (const tr of trees) {
    if (hash01(tr.x, tr.z, 241) < 0.4) {
      const a = hash01(tr.x, tr.z, 242) * Math.PI * 2, d = (1.5 + 1.6 * hash01(tr.x, tr.z, 243)) * tr.scale;
      const x = Math.round((tr.x + Math.cos(a) * d) * 100) / 100, z = Math.round((tr.z + Math.sin(a) * d) * 100) / 100;
      if (ok(x, z)) twigs.push([x, z]);
    }
    if (tr.scale >= 1.2 && hash01(tr.x, tr.z, 244) < 0.75) {
      const rs = [0, 1, 2].filter((k) => {
        const a = hash01(tr.x, tr.z, 211 + k) * Math.PI * 2;
        return ok(tr.x + Math.cos(a) * 0.9 * tr.scale, tr.z + Math.sin(a) * 0.9 * tr.scale);
      });
      if (rs.length) roots.push({ x: tr.x, z: tr.z, scale: tr.scale, rs });
    }
  }
  // fairy rings: scan a coarse grid over the Pines, keep the first spots whose whole ring fits
  for (let gz = -45; gz <= 45 && rings.length < 3; gz += 5) {
    for (let gx = -45; gx <= 45 && rings.length < 3; gx += 5) {
      const x = gx + (hash01(gx, gz, 251) - 0.5) * 5, z = gz + (hash01(gx, gz, 252) - 0.5) * 5;
      if (hash01(gx, gz, 253) > 0.3) continue;
      // seen from the paths: 3-8 m off the nearest one
      const near = Math.min(...paths.map((q) => segDist(x, z, ...q)));
      if (near < 3 || near > 8) continue;
      if (rings.some((r) => Math.hypot(r.x - x, r.z - z) < 20)) continue;
      const n = 6, R = 0.4 + 0.15 * hash01(gx, gz, 254);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + hash01(gx, gz, 255);
        pts.push([x + Math.cos(a) * R * (0.92 + 0.16 * hash01(gx + i, gz, 256)), z + Math.sin(a) * R * (0.92 + 0.16 * hash01(gx, gz + i, 257))]);
      }
      if (okTall(x, z) && pts.every(([px, pz]) => okTall(px, pz))) rings.push({ x, z, pts });
    }
  }
  // tufts and harebells along the path edges, every ~2.6 m, alternating sides
  for (const [x1, z1, x2, z2] of paths) {
    const len = Math.hypot(x2 - x1, z2 - z1), ux = (x2 - x1) / len, uz = (z2 - z1) / len;
    for (let d = 1, i = 0; d < len; d += 2.6, i++) {
      if (hash01(x1 + d, z1, 261) < 0.35) continue;
      const side = i % 2 ? 1 : -1, off = 1.75 + 0.45 * hash01(x1 + d, z2, 262);
      const x = Math.round((x1 + ux * d - uz * side * off) * 100) / 100, z = Math.round((z1 + uz * d + ux * side * off) * 100) / 100;
      if (okEdge(x, z)) tufts.push([x, z]);
    }
  }
  // what each bit stands on, for cutting the merged floor per tile when the
  // bigger-areas switch streams it (render/tilesplit.js)
  const items = [
    ...twigs.map(([x, z]) => ({ x, z, r: 0.6 })),
    ...roots.map((r) => ({ x: r.x, z: r.z, r: r2(1.5 * r.scale) })),
    ...rings.map((r) => ({ x: r.x, z: r.z, r: 0.7 })),
    ...tufts.map(([x, z]) => ({ x, z, r: 0.25 })),
  ];
  return {
    twigs, roots, rings, tufts, items,
    draw(t) {
      for (const [x, z] of twigs) twig(t, x, z);
      for (const r of roots) for (const k of r.rs) root(t, r.x, r.z, r.scale, k);
      for (const r of rings) r.pts.forEach(([x, z], i) => toadstool(t, x, z, i));
      for (const [x, z] of tufts) tuft(t, x, z);
    },
  };
}
