// =============================================================================
// THE MOON: DECOR, THE DRAWING (the enrichment plan's layer 3). Draws a decor list (moondecor.js) into the Moon's own kit buckets: 'paint' for the solid pieces,
// 'floor' for what lies flat (cables, footprints, lamp pools: never a caster), 'glow' (a basic vertex-coloured material: an emissive tint, no real light) for lamp
// heads, beacons, panels' status studs and the garden dome. So the whole decor costs NO draw call of its own. A beacon is a still amber glow (nothing to freeze
// for reduced motion). No random number, no clock: every number is the list's or a fixed one here.
// =============================================================================

import * as THREE from 'three';
import { moonY } from './moonplan.js';
import { paint } from './moonparts.js';

const C = Object.freeze({
  steel: 0x7d848f, white: 0xe9ecf2, dark: 0x2a2f3a, yellow: 0xf0c43c, red: 0xd8503c, teal: 0x3a9aa8, panel: 0x25407a, cell: 0x3d62a8, frame: 0xc9cdd6,
  warm: 0xffd987, amber: 0xffb23c, pool: 0x9f9784, cable: 0x23272f, print: 0x6c6c72, rust: 0x8a6f5e, old: 0xb8b2a4, green: 0x2f6f5c, rim: 0xd9dde6,
});
const CRATES = [C.yellow, C.red, C.steel];

// A piece sits at (x, z) on the ground, `yaw` about the vertical; `geo` is built round its own origin, `dy` over the ground.
function putter(kit, M, it) {
  const gy = moonY(it.x, it.z);
  return (geo, hex, dy = 0, { flat = false, glow = false, dx = 0, dz = 0 } = {}) => {
    if (dx || dz) geo.translate(dx, 0, dz);
    geo.rotateY(it.yaw);
    geo.translate(it.x, gy + dy, it.z);
    if (glow) kit.put('glow', M.glow, paint(geo, hex), { noCast: true });
    else if (flat) kit.put('floor', M.paint, paint(geo, hex), { noCast: true });
    else kit.put('paint', M.paint, paint(geo, hex));
  };
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (a, b, h, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
const flatPlane = (w, d) => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
const ball = (r, w = 5, h = 3) => new THREE.SphereGeometry(r, w, h);

const KINDS = {
  antenna(p, it) {
    p(cyl(0.04, 0.07, 3.2, 4), C.steel, 1.6);
    p(box(1.0, 0.04, 0.04), C.steel, 2.6);
        p(cyl(0.2, 0.2, 0.1, 5), C.dark, 0.05);
    p(ball(0.08, 4, 2), 0xff5a4a, 3.25, { glow: true });
  },
  dish(p) {
    p(cyl(0.06, 0.09, 1.1), C.steel, 0.55);
    const cap = new THREE.SphereGeometry(0.75, 10, 3, 0, Math.PI * 2, Math.PI - 0.8, 0.8).translate(0, 0.75, 0).rotateX(0.7);
    p(cap, C.white, 1.1);
    p(cyl(0.02, 0.02, 0.6, 4).rotateX(0.7).translate(0, 0.25, 0.3), C.steel, 1.4);
  },
  solar(p, it) {
    for (let i = 0; i < 2; i++) {
      const dx = (i - 0.5) * 1.55;
      p(box(1.45, 0.05, 0.95).rotateX(-0.5), C.panel, 0.72, { dx });
      p(box(1.47, 0.056, 0.03).rotateX(-0.5), C.frame, 0.73, { dx }); // a seam across the cells
      p(cyl(0.04, 0.05, 0.7, 4), C.steel, 0.35, { dx, dz: 0.25 });
    }
    p(ball(0.07, 4, 2), (it.c ?? 0) ? C.amber : 0x8affc0, 0.9, { glow: true, dx: -1.6, dz: 0.3 });
  },
  crate(p, it) {
    const col = CRATES[it.c % 3];
    p(box(0.9, 0.7, 0.7), col, 0.35);
    p(box(0.94, 0.08, 0.74), C.dark, 0.5);
    p(box(0.1, 0.72, 0.72), C.frame, 0.35, { dx: 0.2 });
  },
  pod(p) {
    p(cyl(0.45, 0.45, 1.9, 6).rotateZ(Math.PI / 2), C.white, 0.55);
    p(cyl(0.47, 0.47, 0.22, 6).rotateZ(Math.PI / 2), C.teal, 0.55, { dx: -0.45 });
    for (const s of [-1, 1]) p(box(0.12, 0.2, 0.7), C.steel, 0.1, { dx: s * 0.65 });
  },
  flag(p, it) {
    p(cyl(0.025, 0.035, 2.2, 5), C.steel, 1.1);
    p(box(0.7, 0.45, 0.02), it.c ? C.red : C.teal, 1.95, { dx: 0.37 });
    p(box(0.7, 0.07, 0.025), C.white, 1.85, { dx: 0.37 });
  },
  beacon(p) {
    p(cyl(0.05, 0.08, 1.3, 4), C.steel, 0.65);
    p(cyl(0.16, 0.2, 0.12, 5), C.dark, 0.06);
    
    p(ball(0.15, 4, 3), C.amber, 1.5, { glow: true });
  },
  lamp(p) {
    p(cyl(0.04, 0.07, 2.4), C.steel, 1.2);
    p(box(0.5, 0.05, 0.05), C.steel, 2.4, { dx: 0.2 });
    p(new THREE.OctahedronGeometry(0.15, 0), C.warm, 2.32, { glow: true, dx: 0.42 });
    p(new THREE.CircleGeometry(1.1, 8).rotateX(-Math.PI / 2), C.pool, 0.03, { flat: true, dx: 0.42 }); // the lamp's soft pool on the dust
  },
  sign(p) {
    p(cyl(0.035, 0.045, 1.5, 5), C.steel, 0.75);
    p(box(0.95, 0.5, 0.05), C.dark, 1.4);
    p(box(0.95, 0.1, 0.06), C.yellow, 1.62);
    p(box(0.55, 0.06, 0.06), C.white, 1.34, { dx: -0.1 });
    p(box(0.12, 0.2, 0.06), C.teal, 1.32, { dx: 0.34 });
  },
  wreck(p) {
    p(cyl(1.0, 1.15, 0.9, 8).rotateZ(0.32), C.old, 0.7);
    p(cyl(1.02, 1.02, 0.18, 8).rotateZ(0.32), C.rust, 0.75, { dx: 0.05 });
    p(box(0.7, 0.9, 0.08).rotateZ(0.32), C.dark, 0.8, { dz: 1.0 });
    p(box(0.16, 1.5, 0.16).rotateZ(1.0), C.steel, 0.25, { dx: 1.4, dz: 0.4 });
    p(box(0.16, 1.4, 0.16).rotateZ(-0.35), C.steel, 0.5, { dx: -1.2, dz: -0.5 });
    p(box(1.3, 0.05, 0.8).rotateX(0.2), C.panel, 0.15, { dx: 0.4, dz: -1.2 });
    p(cyl(0.04, 0.04, 1.0, 4).rotateZ(1.3), C.steel, 0.9, { dx: -0.2, dz: 0.2 });
  },
  garden(p) {
    p(cyl(1.75, 1.85, 0.3, 10), C.rim, 0.15);
    const dome = new THREE.SphereGeometry(1.7, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1);
    p(dome, C.green, 0.3, { glow: true }); // a still silhouette: dark green, the glow of plants behind glass
    for (let i = 0; i < 2; i++) p(new THREE.TorusGeometry(1.7, 0.04, 3, 8, Math.PI).scale(1, 0.62, 1).rotateY((i / 2) * Math.PI), C.rim, 0.3);
    p(box(0.8, 0.9, 0.6), C.white, 0.45, { dz: 1.9 }); // the door pod
  },
  rack(p) {
    for (const s of [-1, 1]) p(box(0.08, 1.4, 0.08), C.steel, 0.7, { dx: s * 0.7 });
    p(box(1.5, 0.06, 0.1), C.steel, 1.35);
    p(box(1.5, 0.05, 0.1), C.steel, 0.7);
    [[-0.5, C.red], [-0.15, C.yellow], [0.2, C.teal], [0.55, C.red]].forEach(([x, hex], i) => p(box(0.07, 0.55 + 0.08 * i, 0.04), hex, 1.05, { dx: x, dz: 0.07 }));
    p(box(0.5, 0.25, 0.3), C.frame, 0.12, { dx: 0.2, dz: 0.3 });
  },
  tank(p) {
    for (let i = 0; i < 2; i++) {
      const dx = (i - 0.5) * 0.5;
      p(cyl(0.2, 0.2, 1.1, 6), i ? C.teal : C.white, 0.65, { dx });
      p(cyl(0.1, 0.2, 0.22, 6), C.yellow, 1.3, { dx }); // the valve's shoulder
    }
    p(box(1.3, 0.06, 0.5), C.steel, 0.14);
  },
  cable(p, it) {
    p(flatPlane(0.11, it.len || 1.6), C.cable, 0.03, { flat: true });
    if (it.c) p(box(0.2, 0.08, 0.2), C.steel, 0.05, { flat: true });
  },
  trail(p, it) {
    // a pair of paw-sized prints, one a step ahead of the other
    const s = it.c ? 1 : -1;
    p(flatPlane(0.17, 0.26), C.print, 0.035, { flat: true, dx: 0.16 * s });
    p(flatPlane(0.17, 0.26), C.print, 0.035, { flat: true, dx: -0.16 * s, dz: 0.38 });
  },
};

/** Draws a decor list (moondecor.js placeDecor) into the kit's buckets; no mesh of its own. */
export function drawDecor(kit, M, list) {
  for (const it of list) KINDS[it.k](putter(kit, M, it), it);
}
