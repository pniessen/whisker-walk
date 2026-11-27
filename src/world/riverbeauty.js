import { hash01 } from './builder.js';
import { Tris, lin } from './dressing.js';
import { RIVER_STONES, RIVER_WATERS } from './river.js';

// The River beauty round (docs/beauty-backlog.md RIV-1, the version that needs
// no change to the shared water shader). Nothing here is a mesh of its own:
// riverBeautyParts() fills a Tris that riverdress.js folds into its existing
// noCast `dressing` mesh, so the River gains no mesh and no draw.
//   * foam collars round the stepping stones, with short wakes downstream;
//   * pale and deep ripple slivers lying along the river and the lake, the
//     way ripples catch light in pairs;
//   * ring ripples on the pond, and a small one on each pool.
// It draws nothing from Math.random (hash01 only). All of it is still, so it
// holds still under reduced motion by construction. Like riverdress.js it
// reads river.js lazily, never at import.

const UP = [0, 1, 0];
const FOAM = [lin(0xe8f0ee), lin(0xd6e4e4), lin(0xf2f6f2)];
const GLINT = [lin(0xcfe4ec), lin(0xb9d6e2), lin(0xe0eef0)];
const TROUGH = [lin(0x3f6f80), lin(0x4a7a86)];
const LIFT = 0.012; // above the water plane, under the 0.05 the glint tests allow
const waterY = (id) => RIVER_WATERS.find((w) => w.id === id);

const Y = { 'river-east': 0.035, 'river-west': 0.035, lake: 0.03, pond: 0.045, 'pool-1': 0.03, 'pool-2': 0.03, 'pool-3': 0.03 };

function quad(t, a, b, c, d, y, col) {
  for (const p of [a, b, c, a, c, d]) t.v(p[0], y, p[1], UP, col);
}
// A thin tapered sliver lying along heading `yaw`.
function sliver(t, cx, cz, half, w, yaw, y, col) {
  const ux = Math.cos(yaw), uz = Math.sin(yaw);
  const A = [cx + ux * half, cz + uz * half], B = [cx - ux * half, cz - uz * half];
  const S = [cx - uz * w, cz + ux * w], T = [cx + uz * w, cz - ux * w];
  for (const p of [A, T, B, A, B, S]) t.v(p[0], y, p[1], UP, col);
}
// An arc dash of a ring at (cx, cz): radii r0..r1, angles a0..a1.
function arc(t, cx, cz, r0, r1, a0, a1, y, col, n = 1) {
  for (let i = 0; i < n; i++) {
    const s = a0 + ((a1 - a0) * i) / n, e = a0 + ((a1 - a0) * (i + 1)) / n;
    quad(t,
      [cx + Math.cos(s) * r0, cz + Math.sin(s) * r0], [cx + Math.cos(e) * r0, cz + Math.sin(e) * r0],
      [cx + Math.cos(e) * r1, cz + Math.sin(e) * r1], [cx + Math.cos(s) * r1, cz + Math.sin(s) * r1], y, col);
  }
}
const pick = (list, h) => list[Math.floor(h * list.length) % list.length];

// Foam tucked against each stone that stands in the water: a collar on the
// upstream and downstream faces (the long sides are hidden by the next stone)
// and a short wake of slivers downstream.
function stoneFoam(t) {
  const S = RIVER_STONES;
  const y = Y['river-east'] + LIFT;
  const water = waterY('river-east');
  for (let i = 0; i < S.n; i++) {
    const f = i / (S.n - 1);
    const sx = S.x, sz = S.z1 + (S.z2 - S.z1) * f;
    if (sz < water.minZ + 0.4 || sz > water.maxZ - 0.4) continue;
    const r = (S.rMin + (S.rMax - S.rMin) * hash01(i, 3, 61)) * 0.9;
    for (const side of [0, Math.PI]) {
      arc(t, sx, sz, r - 0.04, r + 0.16 + 0.06 * hash01(i, side, 1101), side - 0.85, side + 0.85, y,
        pick(FOAM, hash01(i, side, 1102)), 4);
    }
    // the wake, downstream (east)
    for (let k = 0; k < 2; k++) {
      const h = (s) => hash01(i, k, s);
      sliver(t, sx + r + 0.55 + 0.4 * k + 0.2 * h(1103), sz + (k ? 1 : -1) * (0.18 + 0.2 * h(1104)),
        0.3 + 0.2 * h(1105), 0.022, (h(1106) - 0.5) * 0.3, y, pick(FOAM, h(1107)));
    }
  }
}

// Ripple slivers on a rect of river: a loose grid, a few of them deep (the
// trough beside a crest), kept off the stones and the log bridge.
function rectGlints(t, id, x0, x1, z0, z1, step, salt, skip) {
  const y = Y[id] + LIFT;
  const rows = Math.max(1, Math.round((z1 - z0) / 1.6));
  for (let x = x0; x < x1; x += step) {
    for (let k = 0; k < rows; k++) {
      const h = (s) => hash01(Math.round(x * 10), k + salt, s);
      if (h(1200) < 0.35) continue;
      const cx = x + (h(1201) - 0.5) * step * 0.8;
      const cz = z0 + ((k + 0.5) / rows) * (z1 - z0) + (h(1202) - 0.5) * 0.7;
      if (skip && skip(cx, cz)) continue;
      const half = 0.3 + 0.35 * h(1203);
      const yaw = (h(1204) - 0.5) * 0.2;
      sliver(t, cx, cz, half, 0.025 + 0.02 * h(1205), yaw, y, pick(GLINT, h(1206)));
      if (h(1207) > 0.5) sliver(t, cx + half * 0.5, cz + 0.17, half * 0.45, 0.015, 0.05, y, pick(GLINT, h(1208)));
      if (h(1209) > 0.6) sliver(t, cx - half * 0.3, cz - 0.2, half * 0.6, 0.022, yaw, y, pick(TROUGH, h(1210)));
    }
  }
}

function pondRipples(t) {
  const p = waterY('pond');
  const y = Y.pond + LIFT;
  // widening rings round the spot the ducks come out (a little off centre),
  // broken into dashes that thin out
  const cx = p.x + 0.8, cz = p.z + 0.6;
  for (const [r, n, w] of [[1.3, 5, 0.03], [2.4, 7, 0.026], [3.5, 8, 0.022]]) {
    for (let i = 0; i < n; i++) {
      const h = (s) => hash01(i, Math.round(r * 10), s);
      if (h(1300) < 0.2) continue;
      const a0 = (i / n) * Math.PI * 2 + h(1301) * 0.3;
      arc(t, cx, cz, r, r + w, a0, a0 + (Math.PI * 2 / n) * (0.4 + 0.3 * h(1302)), y, h(1303) < 0.5 ? pick(TROUGH, h(1304)) : GLINT[1], 2);
    }
  }
}

// One small ring on each pool and a few slivers across it.
function poolRipples(t) {
  for (const id of ['pool-1', 'pool-2', 'pool-3']) {
    const p = waterY(id);
    const y = Y[id] + LIFT;
    const r = p.r * 0.45;
    for (let i = 0; i < 5; i++) {
      const h = (s) => hash01(i, p.x, s);
      const a0 = (i / 5) * Math.PI * 2 + h(1320) * 0.4;
      arc(t, p.x + 0.2, p.z - 0.2, r, r + 0.035, a0, a0 + 0.8 + 0.3 * h(1321), y, pick(GLINT, h(1322)), 2);
    }
    for (let i = 0; i < 3; i++) {
      const h = (s) => hash01(i, p.z, s);
      sliver(t, p.x + (h(1323) - 0.5) * p.r, p.z + (h(1324) - 0.5) * p.r, 0.25, 0.02, h(1325), y, pick(GLINT, h(1326)));
    }
  }
}

export function riverBeautyParts(t = new Tris()) {
  stoneFoam(t);
  const stones = RIVER_STONES;
  const nearStones = (x, z) => Math.abs(x - stones.x) < 2.2 && z > stones.z1 - 1.5 && z < stones.z2 + 1.5;
  // river-east inside the bounds, river-west short of the bend and the log bridge
  rectGlints(t, 'river-east', 14.5, 50, -13.4, -9.6, 2.6, 0, nearStones);
  rectGlints(t, 'river-west', -50, 12, -33.4, -29.6, 2.2, 40, (x) => x > -24.5 && x < -19.5);
  // the lake's visible corner
  rectGlints(t, 'lake', 27, 50, -49, -35, 4.2, 80, null);
  pondRipples(t);
  poolRipples(t);
  return t;
}

// The stones stand in the water and the ground: nobody sees a stone from
// underneath, so the bottom caps (16 triangles a stone) go. This pays for the
// detail above (the River sits about 400 triangles under its ceiling).
export function dropHiddenBottoms(mesh) {
  const g = mesh.geometry;
  const nor = g.getAttribute('normal');
  const idx = g.index;
  const keep = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    if (nor.getY(a) < -0.5 && nor.getY(b) < -0.5 && nor.getY(c) < -0.5) continue;
    keep.push(a, b, c);
  }
  g.setIndex(keep);
  return mesh;
}
