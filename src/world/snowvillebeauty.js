// =============================================================================
// SNOWVILLE: THE BEAUTY PASS'S DRAWING (milestone V8). Mid-height clutter and accent hues on top of the village, and the skyline: holly-and-snow shrub clumps (not solid, like
// the drifts), woodpiles and crates against the cottage walls, icicles at the eaves, a wreath on every door in its zone's hue, two strings of pennants between lamp posts (teal and
// gold in the gate court, red and cream in the square), and the far ridge. Everything goes into the kit's merged buckets (paint, and the ridge's own non-casting bucket): one new
// mesh. A seeded stream of its own, no clock, no Math.random, no visible text. The ground's extra tones are snowvillebeautyplan.js's, read per vertex by snowvilleparts.js.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import * as BP from './snowvillebeautyplan.js';
import { mulberry32 } from '../rng.js';
import { COL, paint, stand, box, cyl, ball, laneDist } from './snowvilleparts.js';

const HOLLY = 0x3b6a52;
const BERRY = 0xd23a3a;

// ---- shrub clumps: a seeded stream, in open ground, off the lane, never in a zone's heart ------------------------------------------------
export const SHRUB_CLUMPS = 16;
export function scatterShrubs() {
  const rng = mulberry32(0x73687262);
  const out = [];
  let tries = 0;
  while (out.length < SHRUB_CLUMPS && tries++ < 6000) {
    const B = P.SNOWVILLE_BOUNDS;
    const x = B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    const n = 3 + Math.floor(rng() * 2);
    const yaw = rng() * 6.28;
    if (!P.clearOf(x, z, 1.8) || laneDist(x, z) < 3) continue;
    if (x > 17 && x < 30 && z > 4 && z < 30) continue; // the snowmobile's lawn (its ring and garage) stays clear of shrubs
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
    out.push({ x, z, n, yaw });
  }
  return out;
}

function putShrub(kit, M, x, z, s, i) {
  kit.put('paint', M.paint, paint(stand(ball(0.55 * s, 6, 4).scale(1.2, 0.8, 1.2).translate(0, 0.38 * s, 0), x, z, -0.05), HOLLY, Math.sin(i * 3.7)));
  kit.put('paint', M.paint, paint(stand(ball(0.5 * s, 6, 3).scale(1.25, 0.4, 1.25).translate(0, 0.68 * s, 0), x, z, -0.05), COL.snowBright), { noCast: true });
  for (let b = 0; b < 2; b++) {
    const a = b * 1.9 + i;
    kit.put('paint', M.paint, paint(stand(ball(0.06, 4, 3).translate(Math.cos(a) * 0.5 * s, 0.42 * s + (b % 2) * 0.12, Math.sin(a) * 0.5 * s), x, z, -0.05), BERRY), { noCast: true });
  }
}

// ---- things against the cottages (in each cottage's own frame: door on +z, the window on +x, so the woodpile takes the -x side) ---------------
function onCottage(kit, M, c, geo, hex, jit = 0, opts = {}) {
  kit.put('paint', M.paint, stand(paint(geo, hex, jit), c.x, c.z, -0.08, c.yaw), opts);
}
function woodpile(kit, M, c) {
  const x = -c.w / 2 - 0.55; const z = -c.d * 0.1;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    onCottage(kit, M, c, cyl(0.12, 0.12, 1.3, 6).rotateX(Math.PI / 2).translate(x + (row ? 0.12 : 0), 0.14 + row * 0.22, z - 0.65 + 0.26 * i + row * 0.13), COL.wood, Math.sin(i * 2 + row * 3 + c.x));
  }
  onCottage(kit, M, c, box(0.5, 0.12, 1.4).translate(x, 0.74, z), COL.snowBright, 0, { noCast: true });
}
function crates(kit, M, c) {
  const x = c.w * 0.36; const z = c.d / 2 + 0.55;
  onCottage(kit, M, c, box(0.62, 0.55, 0.62).translate(x, 0.275, z), COL.wood, Math.sin(c.z));
  onCottage(kit, M, c, box(0.5, 0.45, 0.5).rotateY(0.5).translate(x + 0.15, 0.78, z + 0.05), COL.woodDark);
  onCottage(kit, M, c, box(0.66, 0.1, 0.66).translate(x, 0.6, z), COL.snowBright, 0, { noCast: true });
  onCottage(kit, M, c, cyl(0.3, 0.3, 0.7, 8).translate(x - 0.85, 0.35, z - 0.05), 0x7a5438);
  onCottage(kit, M, c, cyl(0.28, 0.28, 0.08, 8).translate(x - 0.85, 0.72, z - 0.05), COL.snowBright, 0, { noCast: true });
}
function icicles(kit, M, c) {
  const n = Math.round(c.w * 1.6);
  for (let i = 0; i < n; i++) {
    const lx = -c.w / 2 - 0.1 + ((c.w + 0.2) * (i + 0.5)) / n;
    onCottage(kit, M, c, new THREE.ConeGeometry(0.04, 0.2 + 0.09 * ((i * 7) % 3), 4).rotateX(Math.PI).translate(lx, c.h - 0.05, c.d / 2 + 0.36), COL.ice, 0, { noCast: true });
  }
}
function wreath(kit, M, c) {
  onCottage(kit, M, c, new THREE.TorusGeometry(0.24, 0.06, 4, 8).translate(0, 1.2, c.d / 2 + 0.12), COL.fir, 0, { noCast: true });
  onCottage(kit, M, c, box(0.18, 0.12, 0.05).translate(0, 0.96, c.d / 2 + 0.14), BERRY, 0, { noCast: true });
}

// ---- pennants between two lamp posts -------------------------------------------------------------------------------------------------------
function segment(a, b, r, hex) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 3, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return paint(g, hex);
}
function bunting(kit, M, la, lb, hues, n = 9) {
  const y = 2.62;
  const ya = P.snowY(la.x, la.z) + y; const yb = P.snowY(lb.x, lb.z) + y;
  const at = (t) => new THREE.Vector3(la.x + (lb.x - la.x) * t, ya + (yb - ya) * t - 0.55 * 4 * t * (1 - t), la.z + (lb.z - la.z) * t);
  for (let i = 0; i < n; i++) kit.put('paint', M.paint, segment(at(i / n), at((i + 1) / n), 0.012, COL.iron), { noCast: true });
  for (let i = 0; i < n - 1; i++) {
    const p = at((i + 0.5) / n);
    kit.put('paint', M.paint, paint(new THREE.ConeGeometry(0.13, 0.3, 3, 1).rotateX(Math.PI).translate(p.x, p.y - 0.15, p.z), hues[i % hues.length]), { noCast: true });
  }
}

// ---- the far ridge: one non-casting merged bucket --------------------------------------------------------------------------------------------
function peakGeometry(k) {
  const H = k.h + 2;
  const g = new THREE.ConeGeometry(k.r, H, k.seg, 3, true).toNonIndexed();
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(); const b = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const t = Math.max(0, Math.min(1, (pos.getY(v) + H / 2) / H)); // 0 at the foot .. 1 at the tip
    const lit = 0.5 + 0.5 * Math.sin(Math.atan2(pos.getX(v), pos.getZ(v)) + k.yaw); // one flank lighter than the other
    a.setHex(0x7f93b3).lerp(b.setHex(0xa9bbd6), lit * 0.6).lerp(b.setHex(0xf6f9ff), Math.max(0, Math.min(1, (t - 0.28) * 2.1)));
    col[v * 3] = a.r; col[v * 3 + 1] = a.g; col[v * 3 + 2] = a.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateY(k.yaw);
  g.translate(k.x, -1.5 + H / 2, k.z);
  return g;
}

export function drawBeauty(kit, M) {
  scatterShrubs().forEach((k, ci) => {
    for (let i = 0; i < k.n; i++) {
      const a = k.yaw + i * 2.2;
      putShrub(kit, M, k.x + Math.cos(a) * 0.55 * i, k.z + Math.sin(a) * 0.55 * i, 0.9 + 0.25 * ((i + ci) % 3), ci * 5 + i);
    }
  });
  const by = (id) => P.COTTAGES.find((c) => c.id === id);
  for (const id of ['west2', 'north1', 'east1', 'baker']) woodpile(kit, M, by(id));
  for (const id of ['baker', 'gate1', 'gate2', 'west1']) crates(kit, M, by(id));
  for (const c of P.COTTAGES) { icicles(kit, M, c); wreath(kit, M, c); }
  const L = P.LAMPS;
  bunting(kit, M, L[0], L[1], [0x2f8f8a, 0xf2c14e]);
  bunting(kit, M, L[2], L[3], [0xc8483f, 0xf4ecd8]);
  for (const k of BP.ridgePeaks()) kit.put('ridge', M.paint, peakGeometry(k), { noCast: true });
}
