// =============================================================================
// SNOWVILLE: BEAUTY PASS 4, THE STORIES IN THE DETAILS (drawn in stage b, merged into the fine non-casting bucket; no new mesh, no caster, no collider, nothing to stand on). Every cottage says
// who lives there, in colour and in pictures (no letters): the knitter (a yarn basket, a striped scarf drying on a line), the baker (flour handprints by the door, loaves in the window), the
// carpenter (a half-built sled and a saw by the door), the fisher (a net on a rack, buoys and yellow boots), the stargazer (a telescope on its tripod), the postwoman (a letterbox) and the herb
// gardener (bunches drying under the eave); each door has a hand-painted sign with a picture, a snowman family in the lane (two small ones beside the big snowman, each with its own scarf and cap)
// and a snow fort with a tiny flag. The pieces are flat paint, thin boxes and eight-sided stones: the pass pays for them with unseen geometry elsewhere (snowvilleparts.js firParts, snowvillebeauty.js
// ridge). Pure drawing: the layout is fixed data, the fort's and the snowlings' places are the first open ones (snowvilledetailplan.js isOpen), no clock, no Math.random.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import * as D from './snowvilledetailplan.js';
import { COL, paint, stand, box, cyl, ball } from './snowvilleparts.js';

const FINE = 'treeBack';
const FLOUR = 0xfaf4e4;
const flat = (w, h) => new THREE.PlaneGeometry(w, h);
const tri = (a, b, c) => { // one flat triangle facing +z (corners [x, y] each)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
  g.setIndex([0, 1, 2]);
  return g;
};
const thin = (r, h, rotZ = 0) => new THREE.CylinderGeometry(r, r, h, 3, 1, true).rotateZ(rotZ); // a stick: three sides, no caps (6 triangles)

// Where each cottage's sign hangs (right of the door, between it and the window) and what it shows.
export const SIGN = Object.freeze({ x: 0.86, y: 1.45, w: 0.46, h: 0.4 });
export const TRADES = Object.freeze({ baker: 'loaf', west1: 'yarn', west2: 'hammer', east1: 'fish', north1: 'star', gate1: 'letter', gate2: 'leaf' });
export const SIGN_HUE = Object.freeze({ loaf: 0xf0dcae, yarn: 0xf0d6d8, hammer: 0xdbe3c8, fish: 0xcfe2f0, star: 0xe4daf0, letter: 0xf0e8c8, leaf: 0xdceac8 });

// The snowlings: two small snowmen beside the big one in the lane's east verge, each with its own scarf and cap (the families of the village's other snowmen wear teal, red and gold).
export const SNOWLINGS = Object.freeze([
  Object.freeze({ dx: -1.35, dz: 1.15, k: 0.62, scarf: 0x8a4ab0, cap: 0x3f7f9a, yaw: 2.9 }),
  Object.freeze({ dx: 1.3, dz: 0.95, k: 0.46, scarf: 0xe8a838, cap: 0xc8483f, yaw: 3.5 }),
]);
// The snow fort: the first open spot of these, a ring of snow-block walls (two gaps) with a pole and a red-and-gold flag.
export const FORT_SPOTS = Object.freeze([[-24, 7], [12, 10], [-12, 7], [9, 22], [-3, -8], [30, 4]]);
export const fortSpot = () => FORT_SPOTS.find(([x, z]) => D.isOpen(x, z, 3.0, [])) ?? null;

export function drawLore(kit, M, { low = false } = {}) {
  const by = (id) => P.COTTAGES.find((c) => c.id === id);
  const on = (c, geo, hex, jit = 0) => kit.put(FINE, M.paint, stand(paint(geo, hex, jit), c.x, c.z, -0.08, c.yaw), { noCast: true });
  const zf = (c) => c.d / 2;

  // ---- the signs ----------------------------------------------------------------------------------------------------------------------
  for (const [id, pic] of Object.entries(TRADES)) {
    const c = by(id); const s = SIGN; const z = zf(c) + 0.1; const x = s.x;
    on(c, box(s.w + 0.08, s.h + 0.08, 0.04).translate(x, s.y, z), COL.woodDark);
    on(c, box(s.w, s.h, 0.04).translate(x, s.y, z + 0.015), SIGN_HUE[pic]);
    const f = (g, hex) => on(c, g.translate(0, 0, z + 0.04), hex);
    const at = (g, dx, dy) => g.translate(x + dx, s.y + dy, 0);
    if (pic === 'loaf') { f(at(new THREE.CircleGeometry(0.15, 6).scale(1.35, 0.8, 1), 0, -0.03), 0xb8793a); f(at(flat(0.04, 0.12).rotateZ(0.5), -0.05, -0.03), 0xe8c07a); f(at(flat(0.04, 0.12).rotateZ(0.5), 0.05, -0.03), 0xe8c07a); }
    else if (pic === 'yarn') { f(at(new THREE.CircleGeometry(0.13, 6), -0.03, -0.03), 0xc8483f); f(at(flat(0.2, 0.025).rotateZ(0.7), -0.03, -0.03), 0xf6d0d0); f(at(flat(0.03, 0.3).rotateZ(-0.45), 0.13, 0.02), 0x6a5a4a); }
    else if (pic === 'hammer') { f(at(flat(0.04, 0.3).rotateZ(0.4), 0, -0.02), 0x7a5438); f(at(flat(0.16, 0.07).rotateZ(0.4), 0.04, 0.1), 0x4a4f5c); }
    else if (pic === 'fish') { f(at(new THREE.CircleGeometry(0.12, 5).scale(1.4, 0.8, 1), -0.03, 0), 0x3f7f9a); f(at(tri([0, 0], [0.11, 0.09], [0.11, -0.09]), 0.13, 0), 0x3f7f9a); }
    else if (pic === 'star') { f(at(tri([0, 0.16], [-0.14, -0.1], [0.14, -0.1]), 0, 0.01), 0xd6a82e); f(at(tri([0, -0.16], [0.14, 0.1], [-0.14, 0.1]), 0, -0.01), 0xd6a82e); }
    else if (pic === 'letter') { f(at(flat(0.3, 0.2), 0, 0), 0xfaf4e4); f(at(tri([-0.15, 0.1], [0.15, 0.1], [0, -0.04]), 0, 0), 0xc8483f); }
    else { f(at(new THREE.CircleGeometry(0.13, 4).scale(0.8, 1.35, 1), 0, 0.01), 0x4f9a5e); f(at(flat(0.025, 0.2).rotateZ(0.2), 0, -0.1), 0x3a6a46); }
  }

  // ---- the baker: flour handprints by the door and two loaves on the sill ----------------------------------------------------------------
  { const c = by('baker'); const z = zf(c) + 0.012;
    for (const [hx, hy, a] of [[-0.95, 1.2, 0.2], [-1.25, 0.8, -0.3], [-0.78, 0.62, 0.1]]) {
      on(c, flat(0.14, 0.15).rotateZ(a).translate(hx, hy, z), FLOUR);
      for (let k = 0; k < 4; k++) on(c, flat(0.03, 0.09).rotateZ(a + (k - 1.5) * 0.28).translate(hx + Math.sin(-a - (k - 1.5) * 0.28) * 0.115, hy + Math.cos(a + (k - 1.5) * 0.28) * 0.115, z), FLOUR);
    }
    const sx = c.w * 0.32; const sy = c.h * 0.55 - 0.4 + 0.13;
    on(c, ball(0.2, 5, 3).scale(1.5, 0.7, 0.8).translate(sx - 0.15, sy + 0.04, c.d / 2 + 0.16), 0xb8793a);
    on(c, ball(0.15, 5, 3).scale(1.2, 0.8, 1).translate(sx + 0.22, sy + 0.03, c.d / 2 + 0.16), 0xd29a52);
  }

  // ---- the knitter: a yarn basket, a striped scarf on a line from the eave to a post -----------------------------------------------------------
  { const c = by('west1'); const bx = -c.w * 0.28; const bz = zf(c) + 0.7;
    on(c, cyl(0.26, 0.2, 0.28, 6).translate(bx, 0.14, bz), 0x9a7448);
    for (const [dx, dz, hex] of [[-0.08, 0, 0xc8483f], [0.1, 0.06, 0x3f7f9a], [0.02, -0.1, 0xe8a838]]) on(c, new THREE.OctahedronGeometry(0.11, 0).translate(bx + dx, 0.34, bz + dz), hex);
    for (const s of [-1, 1]) on(c, thin(0.012, 0.5, s * 0.45).translate(bx + 0.08 + s * 0.02, 0.5, bz + 0.05), 0xd9c9a8);
    const px = -c.w / 2 - 1.7; const pz = zf(c) + 0.5; const ex = -c.w / 2 + 0.1; const ez = zf(c) + 0.25;
    on(c, thin(0.04, 2.0).translate(px, 1.0, pz), COL.woodDark);
    const hx = (px + ex) / 2; const hz = (pz + ez) / 2; const len = Math.hypot(ex - px, ez - pz); const ang = Math.atan2(ex - px, ez - pz);
    on(c, new THREE.CylinderGeometry(0.008, 0.008, len, 3, 1, true).rotateX(Math.PI / 2).rotateY(ang).translate(hx, 1.98 - 0.08, hz), COL.iron);
    [0xc8483f, 0xf4ecd8, 0x3f7f9a, 0xf4ecd8, 0xe8a838].forEach((hex, i) => on(c, box(0.14, 0.62, 0.025).rotateY(ang + Math.PI / 2).translate(hx - Math.sin(ang) * (i - 2) * 0.14, 1.62, hz - Math.cos(ang) * (i - 2) * 0.14), hex));
  }

  // ---- the carpenter: a half-built sled on a bench by the door, a saw and a plank ----------------------------------------------------------------
  { const c = by('west2'); const bx = -c.w * 0.3; const bz = zf(c) + 0.9;
    on(c, box(0.5, 0.42, 1.1).translate(bx, 0.21, bz), COL.wood, 1);
    for (const s of [-1, 1]) on(c, box(0.05, 0.07, 1.0).translate(bx + s * 0.2, 0.46, bz), 0xb89060);
    for (const k of [-0.32, 0, 0.32]) on(c, box(0.46, 0.025, 0.1).translate(bx, 0.5, bz + k), k === 0.32 ? 0xe6d2a8 : 0xc8a26a);
    on(c, box(0.3, 0.012, 0.09).translate(bx - 0.02, 0.51, bz - 0.46), 0x9aa4b4); on(c, box(0.07, 0.07, 0.07).translate(bx + 0.16, 0.52, bz - 0.46), 0x7a5438); // the saw
    on(c, box(1.0, 0.04, 0.2).rotateZ(0.5).translate(c.w * 0.1 - 0.4, 0.55, zf(c) + 0.15), 0xe6d2a8); // a plank leaning
    on(c, new THREE.OctahedronGeometry(0.05, 0).scale(1.6, 0.4, 1.6).translate(bx + 0.5, 0.03, bz + 0.1), 0xf0dcae); // sawdust
  }

  // ---- the fisher: a net on a rack, buoys, yellow boots by the door --------------------------------------------------------------------------------
  { const c = by('east1'); const rx = c.w / 2 + 0.7; const rz = zf(c) - 0.1;
    for (const s of [-1, 1]) on(c, thin(0.04, 1.9).translate(rx, 0.95, rz + s * 0.8), COL.woodDark);
    on(c, thin(0.03, 1.8, Math.PI / 2).rotateY(Math.PI / 2).translate(rx, 1.85, rz), COL.woodDark);
    on(c, box(0.04, 1.2, 1.4).translate(rx, 1.2, rz), 0x4f7f86); on(c, box(0.04, 0.5, 1.0).translate(rx, 0.45, rz + 0.1), 0x5a8a90); // the net hung over the rack
    for (const [dz, hex] of [[-0.6, 0xe8782a], [0.1, 0xf4ecd8], [0.6, 0xe8782a]]) on(c, new THREE.OctahedronGeometry(0.1, 0).translate(rx + 0.1, 1.5, rz + dz), hex);
    for (const s of [-1, 1]) { const bx = 0.45 * s + 0.1; on(c, box(0.14, 0.34, 0.14).translate(bx, 0.17, zf(c) + 0.55), 0xe6b82a); on(c, box(0.14, 0.1, 0.24).translate(bx, 0.05, zf(c) + 0.62), 0xe6b82a); }
  }

  // ---- the stargazer: a telescope on a tripod ---------------------------------------------------------------------------------------------------------
  { const c = by('north1'); const bx = c.w * 0.3 + 0.2; const bz = zf(c) + 1.1;
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; on(c, new THREE.ConeGeometry(0.02, 1.0, 3, 1, true).rotateZ(Math.cos(a) * 0.25).rotateX(-Math.sin(a) * 0.25).translate(bx + Math.cos(a) * 0.14, 0.5, bz + Math.sin(a) * 0.14), COL.woodDark); }
    on(c, new THREE.CylinderGeometry(0.05, 0.07, 0.8, 5, 1, true).rotateZ(-0.9).translate(bx + 0.22, 1.18, bz), 0xb89040);
    on(c, new THREE.OctahedronGeometry(0.05, 0).translate(bx + 0.54, 1.46, bz), 0xf6d56a);
  }

  // ---- the postwoman: a letterbox on a post by the path --------------------------------------------------------------------------------------------------
  { const c = by('gate1'); const bx = -c.w * 0.35 - 0.2; const bz = zf(c) + 1.5;
    on(c, thin(0.04, 1.2).translate(bx, 0.6, bz), COL.woodDark);
    on(c, box(0.34, 0.26, 0.24).translate(bx, 1.3, bz), 0xc8483f); on(c, box(0.36, 0.07, 0.26).translate(bx, 1.46, bz), COL.snowBright);
    on(c, flat(0.08, 0.14).translate(bx + 0.19, 1.36, bz).rotateY(0), 0xf2c14e);
  }

  // ---- the herb gardener: bunches of herbs drying under the eave, a spade in the snow -----------------------------------------------------------------------
  { const c = by('gate2');
    for (let k = 0; k < 4; k++) { const hx = -c.w * 0.5 + 0.7 + k * 0.5; on(c, new THREE.ConeGeometry(0.07, 0.28, 3, 1, true).rotateX(Math.PI).translate(hx, c.h - 0.35, zf(c) + 0.28), [0x5f8a4a, 0x8aa05a, 0x6a5a8a, 0x5f8a4a][k]); }
    const sx = c.w * 0.5 + 0.5; on(c, thin(0.03, 1.1, 0.12).translate(sx, 0.55, zf(c) + 0.2), COL.wood); on(c, box(0.22, 0.28, 0.03).translate(sx - 0.02, 1.2, zf(c) + 0.2), 0x9aa4b4);
  }

  if (low) return;
  // ---- the snowlings in the lane, and the fort -------------------------------------------------------------------------------------------------------------------
  const N = P.SNOWMAN;
  for (const s of SNOWLINGS) {
    const x = N.x + s.dx; const z = N.z + s.dz;
    const put = (geo, hex) => kit.put(FINE, M.paint, paint(stand(geo, x, z, 0, s.yaw), hex), { noCast: true });
    put(ball(0.34 * s.k * 1.6, 5, 3).translate(0, 0.3 * s.k * 1.6, 0), COL.snowBright); put(ball(0.25 * s.k * 1.6, 5, 3).translate(0, 0.82 * s.k * 1.6, 0), COL.snowBright);
    put(new THREE.TorusGeometry(0.2 * s.k * 1.6, 0.05, 3, 6).rotateX(Math.PI / 2).translate(0, 0.66 * s.k * 1.6, 0), s.scarf);
    put(box(0.06, 0.26 * s.k * 1.6, 0.04).translate(0.12 * s.k * 1.6, 0.52 * s.k * 1.6, 0.18 * s.k * 1.6), s.scarf); // the scarf's end
    put(new THREE.ConeGeometry(0.17 * s.k * 1.6, 0.2 * s.k * 1.6, 5).translate(0, 1.14 * s.k * 1.6, 0), s.cap);
    put(new THREE.ConeGeometry(0.035, 0.2, 3, 1, true).rotateX(Math.PI / 2).translate(0, 0.84 * s.k * 1.6, 0.25 * s.k * 1.6), 0xe8782a);
  }
  const f = fortSpot();
  if (f) {
    const [x, z] = f;
    const put = (geo, hex, ry = 0) => kit.put(FINE, M.paint, paint(stand(geo, x, z, -0.05, ry), hex, 0), { noCast: true });
    for (let k = 0; k < 6; k++) {
      if (k === 2 || k === 3) continue; // the doorway and a gap
      const a = k * (Math.PI / 3) + 0.3;
      put(box(1.1, 0.7 + 0.1 * (k % 2), 0.4).rotateY(-a).translate(Math.sin(a) * 1.6, 0.34, Math.cos(a) * 1.6), k % 2 ? COL.roofSnow : COL.snowBright);
    }
    put(thin(0.03, 1.6).translate(0, 0.8, 0), COL.woodDark);
    put(tri([0, 0], [0.5, 0.14], [0, 0.28]).translate(0.03, 1.4, 0.02), 0xc8483f);
    put(tri([0, 0.28], [0.5, 0.14], [0, 0]).translate(0.03, 1.4, 0.02), 0xf2c14e);
    for (const [dx, dz] of [[0.5, 0.4], [-0.4, 0.55]]) put(ball(0.14, 4, 3).translate(dx, 0.1, dz), COL.snowBright); // a few snowballs ready
  }
}
