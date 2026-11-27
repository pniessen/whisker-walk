// =============================================================================
// THE JUNGLE LODGE: BEAUTY ROUND (milestone J8). Scored against docs/beauty-backlog.md section 2, the Jungle's weakest lines were mid-height clutter (ferns only, in even
// scatter), colour accents by zone (one green palette), vertical interest under the canopy (bare trunks) and the canopy's own depth. This pass adds, in stage b's merged buckets and with
// no mesh of its own: shrub clumps and tall grass tufts in drifts (not rows) with each zone's accent flower, fallen mossy logs, buttress roots at the bigger trees' feet, bromeliad
// tufts on the trunks, and lianas looped between neighbouring crowns. Every piece is soft (no shadow, no collider, no word). Its own seeded stream (0x706f6c73), so every existing
// layout stays put. Nothing moves, so reduced motion needs nothing. The place builds once for every tier (a build has no tier), so the layer is kept small: triangles are cheap, draws are not.
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './jungleplan.js';
import { COL, paint } from './jungleparts.js';

// Each zone's accent hue (checklist line 4): the ring sun-yellow, the lodge hibiscus pink, the grove mango orange, the river water-blue and white, the canopy orchid purple.
export const ZONE_ACCENT = Object.freeze({
  ring: [0xffd23c, 0xfff0a0], lodge: [0xf0508a, 0xff8ab0], grove: [0xff8a2e, 0xffc060], river: [0x6ab4f0, 0xf4f4f0], canopy: [0xa066d0, 0xd8a0f0],
});
export const POLISH_COUNT = Object.freeze({ drifts: 18, logs: 6 });

const zoneNear = (x, z) => P.ZONES.reduce((best, k) => { const d = Math.hypot(x - k.x, z - k.z) / k.r; return d < best.d ? { d, id: k.id } : best; }, { d: Infinity, id: 'ring' }).id;

/** The pieces' plan: pure and seeded. { drifts: [{ x, z, zone, bushes: [{ dx, dz, s }], grass: [{ dx, dz, s }], flowers: [{ dx, dz, hue }] }], logs: [{ x, z, yaw, len, r }] }. */
export function polishPlan() {
  const rng = mulberry32(0x706f6c73);
  const drifts = [];
  let tries = 0;
  while (drifts.length < POLISH_COUNT.drifts && tries++ < 4000) {
    const x = P.JUNGLE_BOUNDS.minX + 3 + rng() * (P.JUNGLE_BOUNDS.maxX - P.JUNGLE_BOUNDS.minX - 6);
    const z = P.JUNGLE_BOUNDS.minZ + 3 + rng() * (P.JUNGLE_BOUNDS.maxZ - P.JUNGLE_BOUNDS.minZ - 6);
    if (!P.clearOf(x, z, 1.8)) continue;
    if (drifts.some((o) => Math.hypot(o.x - x, o.z - z) < 5)) continue;
    const zone = zoneNear(x, z);
    const part = (n, r, smin, sspan) => Array.from({ length: n }, () => { const a = rng() * 6.28; const d = Math.sqrt(rng()) * r; return { dx: Math.cos(a) * d, dz: Math.sin(a) * d, s: smin + rng() * sspan }; });
    const bushes = part(2 + Math.floor(rng() * 3), 1.8, 1.0, 0.7);
    const grass = part(4 + Math.floor(rng() * 3), 2.2, 0.6, 0.6);
    const flowers = part(3 + Math.floor(rng() * 3), 1.9, 1, 0).map((f) => ({ dx: f.dx, dz: f.dz, hue: rng() < 0.7 ? 0 : 1 }));
    drifts.push({ x, z, zone, bushes, grass, flowers });
  }
  const logs = [];
  tries = 0;
  while (logs.length < POLISH_COUNT.logs && tries++ < 3000) {
    const x = P.JUNGLE_BOUNDS.minX + 4 + rng() * (P.JUNGLE_BOUNDS.maxX - P.JUNGLE_BOUNDS.minX - 8);
    const z = P.JUNGLE_BOUNDS.minZ + 4 + rng() * (P.JUNGLE_BOUNDS.maxZ - P.JUNGLE_BOUNDS.minZ - 8);
    const len = 2.4 + rng() * 1.8;
    if (!P.clearOf(x, z, len * 0.6)) continue;
    if (logs.some((o) => Math.hypot(o.x - x, o.z - z) < 7) || drifts.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue;
    logs.push({ x, z, yaw: rng() * 3.14, len, r: 0.2 + rng() * 0.12 });
  }
  return { drifts, logs };
}

const stand = (geo, x, z, dy = 0, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.jungleY(x, z) + dy, z);
  return geo;
};

export function drawPolish(kit, M) {
  const soft = { noCast: true };
  const put = (geo, hex, j = 0) => kit.put('paint', M.paint, paint(geo, hex, j), soft);
  const { drifts, logs } = polishPlan();
  const GREENS = [COL.leaf, COL.leafLight, COL.leafDeep, COL.moss];
  drifts.forEach((d, i) => {
    const acc = ZONE_ACCENT[d.zone];
    d.bushes.forEach((b, j) => { // a shrub: two overlapping squashed lumps, a darker low one and a lighter high one
      const x = d.x + b.dx; const z = d.z + b.dz;
      put(stand(new THREE.IcosahedronGeometry(0.7 * b.s, 0).scale(1.2, 0.8, 1.1), x, z, 0.45 * b.s, j + i), GREENS[(i + j) % 4], j);
      put(stand(new THREE.IcosahedronGeometry(0.45 * b.s, 0).scale(1, 0.8, 1), x + 0.25 * b.s, z - 0.15, 0.85 * b.s, i), GREENS[(i + j + 1) % 4], j + 1);
    });
    d.grass.forEach((g, j) => { // a tuft: two thin blades leaning out
      for (let k = 0; k < 2; k++) {
        const blade = new THREE.ConeGeometry(0.06 * g.s, 0.95 * g.s, 3).translate(0, 0.475 * g.s, 0).rotateZ(0.22).rotateY((k / 2) * 6.28 + j);
        put(stand(blade, d.x + g.dx, d.z + g.dz, -0.02), GREENS[(j + k) % 3], k);
      }
    });
    d.flowers.forEach((f, j) => { // an accent bloom on a short stem
      const x = d.x + f.dx; const z = d.z + f.dz;
      put(stand(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 3), x, z, 0.25), COL.leafDeep);
      put(stand(new THREE.IcosahedronGeometry(0.1, 0), x, z, 0.55, j), acc[f.hue]);
    });
  });
  logs.forEach((l, i) => { // a fallen log with a mossy back and a lighter cut end
    const log = new THREE.CylinderGeometry(l.r, l.r * 1.1, l.len, 6).rotateZ(Math.PI / 2);
    put(stand(log, l.x, l.z, l.r * 0.9, l.yaw), COL.trunk, i);
    put(stand(new THREE.CylinderGeometry(l.r * 1.02, l.r * 1.12, l.len * 0.6, 6, 1, false, 0, 3.4).rotateZ(Math.PI / 2).translate(0, l.r * 0.15, 0), l.x, l.z, l.r * 0.9, l.yaw), COL.moss);
    put(stand(new THREE.CylinderGeometry(l.r * 0.9, l.r * 0.9, 0.04, 6).rotateZ(Math.PI / 2).translate(l.len / 2, 0, 0), l.x, l.z, l.r * 0.9, l.yaw), 0xc8a070);
  });
  // under the crowns of the bigger trees: buttress roots at the foot, a bromeliad tuft on the trunk (each zone's accent), and a liana looped to the next big tree
  const big = P.scatterTrees().filter((k) => !k.rim && k.s > 1.15 && k.kind === 'broad');
  big.forEach((k, i) => {
    const acc = ZONE_ACCENT[zoneNear(k.x, k.z)];
    for (let r = 0; r < 4; r++) {
      const a = (r / 4) * 6.28 + i;
      const root = new THREE.ConeGeometry(0.16 * k.s, 1.3 * k.s, 4).scale(1, 1, 0.5).translate(0, 0.65 * k.s, 0).rotateZ(1.2).rotateY(a);
      put(stand(root, k.x, k.z, 0), COL.trunk, r);
    }
    const ay = i * 2.1;
    for (let p = 0; p < 5; p++) {
      const petal = new THREE.ConeGeometry(0.1 * k.s, 0.55 * k.s, 3).scale(1, 1, 0.35).translate(0, 0.27 * k.s, 0).rotateZ(0.9).rotateY(ay + p * 1.26);
      put(stand(petal, k.x + Math.cos(ay) * 0.3 * k.s, k.z + Math.sin(ay) * 0.3 * k.s, 2.6 * k.s), p % 2 ? acc[0] : COL.leaf, p);
    }
    const next = big[(i + 1) % big.length];
    const dist = Math.hypot(next.x - k.x, next.z - k.z);
    if (dist > 4 && dist < 15) { // three drooping segments between the two crowns
      const ax = k.x; const az = k.z; const ah = P.jungleY(k.x, k.z) + 4.3 * k.s; const bh = P.jungleY(next.x, next.z) + 4.3 * next.s;
      let px = ax; let pz = az; let ph = ah;
      for (let sgm = 1; sgm <= 4; sgm++) {
        const t = sgm / 4;
        const qx = ax + (next.x - ax) * t; const qz = az + (next.z - az) * t;
        const qh = ah + (bh - ah) * t - Math.sin(t * Math.PI) * 1.4;
        const len = Math.hypot(qx - px, qz - pz, qh - ph);
        const seg = new THREE.CylinderGeometry(0.03, 0.03, len, 3).rotateX(Math.PI / 2);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(px, ph, pz), new THREE.Vector3(qx, qh, qz), new THREE.Vector3(0, 1, 0));
        seg.applyMatrix4(m.setPosition((px + qx) / 2, (ph + qh) / 2, (pz + qz) / 2));
        kit.put('paint', M.paint, paint(seg, COL.leafDeep, sgm), soft);
        px = qx; pz = qz; ph = qh;
      }
    }
  });
}
