// =============================================================================
// THE CRYSTAL CAVE: SMALL STORIES (beauty round 4), THE DRAWING. Every piece joins the decor's three existing meshes (stone, glow, light): no mesh, draw, light or caster more.
// The plan (sites, rungs) is crystaltalesplan.js; the helpers (tone, cone, raw, tag, glint, disc, the hue colours) come in from crystaldecorparts.js as H (so the two files
// need not import each other). Nothing here is solid or registered: it is all picture.
// =============================================================================

import * as THREE from 'three';
import * as P from './crystalplan.js';
import { CAMP, WHEEL, BENCH, MURAL, BED, RAINBOW, WAYMARKS, trailPrints, talesRung } from './crystaltalesplan.js';

const TAU = Math.PI * 2;
const col = (hex) => new THREE.Color(hex);

// A group's frame: local x/z about the site, turned by yaw, standing on the floor at the site's height.
function frame(site) {
  const y0 = P.crystalY(site.x, site.z);
  const k = site.k ?? 1; // a prop's own scale (the camp and the bench are drawn a little over life size, so they read from the play camera)
  return (geo, lx = 0, lz = 0, dy = 0) => { if (k !== 1) geo.scale(k, k, k); geo.translate(lx * k, dy * k, lz * k); geo.rotateY(site.yaw); geo.translate(site.x, y0, site.z); return geo; };
}
const box = (H, w, h, d, lo, hi) => H.tone(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), lo, hi, h);

// A flat-colour decal builder: triangles in (u, v) mapped to the world by `map`, each corner with its own rgb (additive, so black fades to nothing).
function decal(map) {
  const pos = []; const colr = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) { const w = map(p[0], p[1]); pos.push(w[0], w[1], w[2]); colr.push(p[2], p[3], p[4]); } };
  // a fan: an ellipse about (cx, cy), n triangles, bright centre colour c0 and rim colour c1
  const fan = (cx, cy, rx, ry, n, c0, c1, rot = 0) => {
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * TAU; const a1 = rot + ((i + 1) / n) * TAU;
      tri([cx, cy, ...c0], [cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, ...c1], [cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, ...c1]);
    }
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(b, d, c); };
  return { tri, fan, quad, pos, colr };
}
const sc = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// ---- the camp ---------------------------------------------------------------------------------------------------------------
function camp(H, stone, glow, light) {
  const F = frame(CAMP);
  // a cold ring of five stones, one ember still breathing in the ash
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3; const r = 0.3 + 0.03 * (i % 2);
    stone.push(F(H.tone(new THREE.OctahedronGeometry(0.1 + 0.015 * (i % 3), 0), 0x5e5060, 0x8c7c8e, 0.14), Math.cos(a) * r, Math.sin(a) * r, 0).rotateX(0));
  }
  light.push(H.tag(ember(H), 2, 0.3));
  // the bedroll (a rolled mat and its blanket laid flat) and a satchel with a strap
  const roll = H.tone(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 6).rotateZ(Math.PI / 2).translate(0, 0.12, 0), 0x6a4a3a, 0xb08a68, 0.24);
  stone.push(F(roll, -0.2, 0.75, 0));
  stone.push(F(box(H, 0.62, 0.035, 0.95, 0x4a6a78, 0x6a8a98), 0.55, 0.3, 0).rotateY(0));
  stone.push(F(box(H, 0.3, 0.07, 0.2, 0xcab894, 0xe8dcc0), 0.55, 0.62, 0.04));
  stone.push(F(box(H, 0.24, 0.18, 0.12, 0x5a3e2c, 0x8a6446), -0.55, -0.15, 0));
  stone.push(F(box(H, 0.24, 0.04, 0.13, 0x3e2a1e, 0x6a4a34), -0.55, -0.15, 0.17));
  // the lantern, still lit: a dark frame, a warm flame, and a pool of firelight that breathes
  stone.push(F(box(H, 0.3, 0.06, 0.3, 0x6a5c6c, 0x8c7c90), 0.05, -0.62, 0));
  stone.push(F(box(H, 0.13, 0.2, 0.13, 0x3a3030, 0x6a5848), 0.05, -0.62, 0.06));
  stone.push(F(H.tone(H.cone(0.1, 0.1, 5).translate(0, 0.06, 0), 0x4a3a30, 0x7a6450, 0.16), 0.05, -0.62, 0.27));
  glow.push(F(H.tone(new THREE.OctahedronGeometry(0.07, 0), 0xffa838, 0xfff0b0, 0.14).scale(1, 1.4, 1), 0.05, -0.62, 0.17));
  light.push(H.tag(H.disc(CAMP.x, CAMP.z, 3.0, 1, (t) => { const k = 0.26 * (1 - t) ** 1.7; return [1 * k, 0.62 * k, 0.24 * k]; }, 3, 12), 2, 0.8));
  // a tiny sparkle on the lantern glass
  light.push(F(H.glint(0, 0, 0, 0.1, 0xffd890, 0.3), 0.05, -0.62, 0.3));
}
// the fire ring's last ember: a small warm disc
function ember(H) { return H.disc(CAMP.x, CAMP.z, 0.42, 2, (t) => { const k = 0.5 * (1 - t) ** 1.4; return [k, 0.34 * k, 0.1 * k]; }, 2, 8); }

// ---- the toppled wheel ------------------------------------------------------------------------------------------------------
function wheel(H, stone, glow, light) {
  const F = frame(WHEEL);
  const wood = (g) => H.tone(g, 0x4a3224, 0x8a6446, 1.2);
  const rim = wood(new THREE.TorusGeometry(0.5, 0.045, 4, 12).rotateX(0)); // a ring in the XY plane, its centre 0.5 m up
  rim.translate(0, 0.5, 0);
  const hub = wood(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0.5, 0));
  const spokes = [0, 1, 2].map((k) => wood(new THREE.BoxGeometry(0.95, 0.035, 0.035).rotateZ((k / 3) * Math.PI).translate(0, 0.5, 0)));
  for (const g of [rim, hub, ...spokes]) { g.scale(1.45, 1.45, 1.45); g.rotateX(-0.95); stone.push(F(g, 0, 0, 0)); } // it lies tipped over, one edge on the floor, leaning on a rock
  stone.push(F(H.tone(new THREE.OctahedronGeometry(0.2, 0).scale(1, 0.8, 1.1), 0x6a5a70, 0x9a8a9c, 0.2), 0.1, -0.5, 0.04));
  stone.push(F(box(H, 0.7, 0.05, 0.14, 0x4a3224, 0x7a5a3c), -0.2, 0.95, 0).rotateY(0)); // a splintered plank
  // the ore it spilled: a few little glowing stones in a drift, and a spark
  [[-0.55, -0.45, 0xffc65a], [-0.3, -0.62, 0xff6fa8], [0.1, -0.75, 0xffc65a], [0.45, -0.52, 0x62b8ff]].forEach(([lx, lz, hex], i) => {
    glow.push(F(H.tone(new THREE.OctahedronGeometry(0.07 + 0.015 * (i % 2), 0), 0x7a5a30, hex, 0.12).scale(1, 1.3, 1), lx, lz, 0.04));
  });
  light.push(F(H.glint(0, 0, 0, 0.12, 0xffc65a, 0.8), -0.3, -0.62, 0.22));
}

// ---- the collector's workbench ----------------------------------------------------------------------------------------------
function bench(H, stone, glow, light) {
  const F = frame(BENCH);
  const wood = (w, h, d, a = 0x5a4030, b = 0x8c6c4a) => box(H, w, h, d, a, b);
  stone.push(F(wood(1.1, 0.06, 0.5), 0, 0, 0.5));
  for (const [lx, lz] of [[-0.48, -0.2], [0.48, -0.2], [-0.48, 0.2], [0.48, 0.2]]) stone.push(F(wood(0.06, 0.5, 0.06, 0x3e2a1e, 0x6a4c34), lx, lz, 0));
  stone.push(F(wood(0.95, 0.04, 0.4, 0x4a3426, 0x7a5c40), 0, 0, 0.16));
  stone.push(F(wood(0.04, 0.04, 0.3, 0x3a2a20, 0x6a4a34), -0.28, 0.1, 0.57)); // a hammer on the bench
  stone.push(F(wood(0.14, 0.05, 0.05, 0x707080, 0xa0a0b0), -0.28, 0.24, 0.57));
  stone.push(F(wood(0.18, 0.03, 0.14, 0xcab894, 0xe8dcc0), 0.32, 0.12, 0.56)); // a notebook
  // the samples: five little crystals in different colours standing in a row, two more on the lower shelf
  [[-0.42, -0.08, 0xff6fa8, 0.2], [-0.2, 0.1, 0x62b8ff, 0.26], [0.02, -0.06, 0xffc65a, 0.22], [0.2, 0.12, 0xffa8f0, 0.28], [0.4, -0.1, 0x7af0b8, 0.2]].forEach(([lx, lz, hex, h], i) => {
    glow.push(F(H.tone(H.cone(0.05, h, 5), 0x302030, hex, h), lx, lz, 0.56 + 0.0 * i));
    if (i % 2 === 0) light.push(F(H.glint(0, 0, 0, 0.1 + 0.02 * i, hex, i), lx, lz, 0.56 + h + 0.04));
  });
  glow.push(F(H.tone(H.cone(0.05, 0.16, 5), 0x302030, 0xff6fa8, 0.16), -0.2, 0.0, 0.2));
  glow.push(F(H.tone(H.cone(0.05, 0.2, 5), 0x302030, 0x62b8ff, 0.2), 0.25, -0.05, 0.2));
  light.push(H.disc(BENCH.x, BENCH.z, 2.1, 3, (t) => { const k = 0.2 * (1 - t) ** 1.6; return [0.55 * k, 0.65 * k, 1 * k]; }, 2, 10));
}

// ---- the mural of cats ------------------------------------------------------------------------------------------------------
const PIGMENTS = [[1, 0.72, 0.28], [1, 0.42, 0.66], [0.3, 0.9, 0.82], [0.7, 0.5, 1], [1, 0.58, 0.3], [0.5, 0.85, 1]];
function mural(H, stone, light) {
  const F = frame(MURAL);
  // the slab: a wide grey-violet stone, a little taller in the middle, leaning back a touch
  stone.push(F(box(H, MURAL.w, MURAL.h, 0.5, 0x4c3e58, 0x8c7c9c), 0, 0, 0));
  stone.push(F(box(H, MURAL.w * 0.8, 0.4, 0.45, 0x4c3e58, 0x7c6c8c), 0, 0, MURAL.h));
  // the paint: a faint moon, a row of sitting cats (one different each), pawprints along the foot, a border
  const y0 = P.crystalY(MURAL.x, MURAL.z); const ca = Math.cos(MURAL.yaw); const sa = Math.sin(MURAL.yaw);
  const K = 1.5; // the paint is drawn at 1.5 times the sketch's size and set up high on the slab, so it clears the rim rocks in front
  const D = decal((u, v) => [MURAL.x + u * K * ca, y0 + 0.85 + v * K, MURAL.z - u * K * sa + 0.27]);
  D.fan(0.7, 1.4, 0.55, 0.55, 12, [0.24, 0.2, 0.12], [0.03, 0.02, 0.01]);
  const kitty = (u, v, s, c, flip = 1, tail = 1) => {
    const hot = sc(c, 0.6); const rim = sc(c, 0.3);
    D.fan(u, v + 0.2 * s, 0.17 * s, 0.22 * s, 7, hot, rim);
    D.fan(u + 0.1 * s * flip, v + 0.46 * s, 0.1 * s, 0.09 * s, 6, hot, rim);
    D.tri([u + 0.03 * s * flip, v + 0.5 * s, ...rim], [u + 0.07 * s * flip, v + 0.64 * s, ...hot], [u + 0.1 * s * flip, v + 0.52 * s, ...rim]);
    D.tri([u + 0.12 * s * flip, v + 0.52 * s, ...rim], [u + 0.16 * s * flip, v + 0.63 * s, ...hot], [u + 0.19 * s * flip, v + 0.48 * s, ...rim]);
    const tx = u - 0.17 * s * flip;
    D.tri([tx, v + 0.04 * s, ...hot], [tx, v + 0.14 * s, ...hot], [tx - 0.24 * s * flip, v + (0.1 + 0.2 * tail) * s, ...rim]);
    D.tri([tx - 0.24 * s * flip, v + (0.1 + 0.2 * tail) * s, ...rim], [tx, v + 0.14 * s, ...hot], [tx - 0.22 * s * flip, v + (0.3 + 0.2 * tail) * s, ...rim]);
  };
  [[-1.5, 0.35, 1.2, 0, 1, 1], [-0.7, 0.3, 1.0, 1, 1, 0.4], [0.05, 0.4, 1.35, 2, -1, 1], [0.8, 0.28, 0.95, 3, 1, 0.2], [1.45, 0.34, 1.15, 4, -1, 0.8], [-0.35, 1.2, 0.75, 5, 1, 0.6]]
    .forEach(([u, v, s, ci, flip, tail]) => kitty(u, v, s, PIGMENTS[ci], flip, tail));
  // pawprints in a row along the foot: a pad and two toes each
  for (let i = 0; i < 5; i++) { const u = -1.6 + i * 0.8; D.fan(u, 0.08, 0.05, 0.04, 5, [0.5, 0.42, 0.28], [0.1, 0.08, 0.05]); D.fan(u - 0.04, 0.15, 0.02, 0.02, 3, [0.4, 0.34, 0.22], [0, 0, 0]); D.fan(u + 0.04, 0.15, 0.02, 0.02, 3, [0.4, 0.34, 0.22], [0, 0, 0]); }
  light.push(H.raw(D.pos, D.colr));
}

// ---- the moss bed ------------------------------------------------------------------------------------------------------------
function bed(H, stone, glow, light) {
  const F = frame(BED);
  glow.push(F(H.tone(new THREE.SphereGeometry(0.85, 8, 3, 0, TAU, 0, Math.PI / 2).scale(1, 0.4, 0.85), 0x1c5a34, 0x78e8a0, 0.34), 0, 0, 0));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; stone.push(F(H.tone(new THREE.OctahedronGeometry(0.12 + 0.02 * (i % 2), 0), 0x5e5060, 0x8c7c8e, 0.16).scale(1, 0.7, 1), Math.cos(a) * 1.0, Math.sin(a) * 0.84, 0)); }
  light.push(H.disc(BED.x, BED.z, 1.9, 3, (t) => { const k = 0.6 * (1 - t) ** 1.2; return [0.26 * k, 0.9 * k, 0.5 * k]; }, 3, 9));
}

// ---- the waymarks and the paw prints -------------------------------------------------------------------------------------
function waymarks(H, stone, light, n) {
  WAYMARKS.slice(0, n).forEach((w) => {
    const F = frame(w);
    stone.push(F(box(H, 0.73, 0.13, 0.91, 0x4c3e58, 0x8c7c9c), 0, 0, 0)); // a low flat slab with an arrow carved in its top, pointing the way (local +z)
    stone.push(F(H.tone(new THREE.OctahedronGeometry(0.09, 0), 0x5e5060, 0x8c7c8e, 0.14), 0.36, -0.22, 0));
    const y0 = P.crystalY(w.x, w.z) + 0.13; const ca = Math.cos(w.yaw); const sa = Math.sin(w.yaw);
    const D = decal((u, v) => [w.x + u * 1.3 * ca + v * 1.3 * sa, y0 + 0.03, w.z - u * 1.3 * sa + v * 1.3 * ca]);
    const c = [1, 0.9, 0.6];
    D.quad([-0.035, -0.26, ...sc(c, 0.4)], [0.035, -0.26, ...sc(c, 0.4)], [-0.035, 0.1, ...c], [0.035, 0.1, ...c]);
    D.tri([-0.14, 0.08, ...sc(c, 0.6)], [0.14, 0.08, ...sc(c, 0.6)], [0, 0.3, ...c]);
    light.push(H.raw(D.pos, D.colr));
  });
}
function prints(H, light, n) {
  const list = trailPrints().slice(0, n);
  list.forEach((p, i) => {
    const ca = Math.cos(p.yaw); const sa = Math.sin(p.yaw);
    const D = decal((u, v) => { const wx = p.x + u * 3.2 * ca + v * 3.2 * sa; const wz = p.z - u * 3.2 * sa + v * 3.2 * ca; return [wx, P.crystalY(wx, wz) + 0.045, wz]; }); // (drawn 3.2 times the sketch, so a print reads from the play camera)
    const k = 0.7 + 0.5 * Math.sin((i / Math.max(1, list.length - 1)) * Math.PI); const c = [0.95 * k, 0.82 * k, 0.5 * k]; const rim = sc(c, 0.3);
    D.fan(0, 0, 0.055, 0.07, 5, c, rim);
    for (let t = 0; t < 4; t++) { const u = (t - 1.5) * 0.045; const v = 0.105 + 0.015 * (t === 1 || t === 2 ? 1 : 0); D.tri([u - 0.02, v, ...rim], [u + 0.02, v, ...rim], [u, v + 0.05, ...c]); D.tri([u - 0.02, v, ...rim], [u + 0.02, v, ...rim], [u, v - 0.015, ...sc(c, 0.7)]); }
    light.push(H.raw(D.pos, D.colr));
  });
}

// ---- the rainbow over the Blue Pool's mist (shown only by the bloom: kind 7 in the shader) ----------------------------
function rainbow(H, light) {
  const bands = [[1, 0.1, 0.12], [1, 0.5, 0.05], [0.55, 1, 0.1], [0.1, 0.7, 1], [0.55, 0.2, 1]];
  const y0 = P.crystalY(RAINBOW.x, RAINBOW.z) + 0.6; const seg = 8; const w = 0.4;
  const pos = []; const colr = [];
  bands.forEach((c, b) => {
    const r0 = RAINBOW.R - b * w; const r1 = r0 - w * 0.95;
    const at = (a, r, k) => { pos.push(RAINBOW.x + Math.cos(a) * r * RAINBOW.tx, y0 + Math.sin(a) * r * 0.85, RAINBOW.z + Math.cos(a) * r * RAINBOW.tz); colr.push(c[0] * k, c[1] * k, c[2] * k); };
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI; const a1 = ((s + 1) / seg) * Math.PI;
      const e0 = Math.sin(a0) ** 0.6; const e1 = Math.sin(a1) ** 0.6; // fades to nothing where it meets the water
      at(a0, r0, 0.4 * e0); at(a0, r1, 0.4 * e0); at(a1, r0, 0.4 * e1); at(a1, r0, 0.4 * e1); at(a0, r1, 0.4 * e0); at(a1, r1, 0.4 * e1);
    }
  });
  light.push(H.tag(H.raw(pos, colr), 7));
}

// drawTales(H, rung, { stone, glow, light }): push every piece into the three lists
export function drawTales(H, rung, { stone, glow, light }) {
  const R = talesRung(rung);
  camp(H, stone, glow, light); wheel(H, stone, glow, light); bench(H, stone, glow, light); mural(H, stone, light); bed(H, stone, glow, light);
  waymarks(H, stone, light, R.marks); prints(H, light, R.prints);
  if (R.rainbow) rainbow(H, light);
}
