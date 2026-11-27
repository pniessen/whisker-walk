// =============================================================================
// SNOWVILLE WING B: THE DRAWING (milestone V5). The frozen pond (a pale ice disc with the otters' skate marks, a ring of bank stones and reeds, the stump), the sled hill (its summit
// rock, a trodden sled path with two runner lines, a sled leaning at the top, the hill rock), the village hearth (a ring of stones, crossed logs, an emissive flame, two log seats), the Great
// Fir (a very tall fir with a gold star) and the hare's burrow. All of it goes into the kit's merged buckets (paint, glow, tree): no mesh of its own, so the place's draw calls do not grow
// (the budget row counts triangles). Stage chunk code (snowvillestageb.js); start-up never imports it. Every number is snowvillewingplan.js's.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import * as W from './snowvillewingplan.js';
import { COL, paint, firParts } from './snowvilleparts.js';

const at = (geo, x, z, dy = 0, ry = 0) => {
  if (ry) geo.rotateY(ry);
  geo.translate(x, P.snowY(x, z) + dy, z);
  return geo;
};
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
const ball = (r, ws = 7, hs = 5) => new THREE.SphereGeometry(r, ws, hs);
const rock = (r) => new THREE.DodecahedronGeometry(r, 0);

const ICE = Object.freeze({ mid: 0xd4ebfb, edge: 0xf2f9ff, mark: 0xf8fcff, bank: 0xb9c6d6 });
const _c = new THREE.Color();
const _d = new THREE.Color();

// The ice: a flat disc whose colour goes from pale blue in the middle to white at the rim (one vertex-coloured geometry), a hair over the snow.
export function iceGeometry() {
  const I = W.ICE;
  const g = new THREE.CircleGeometry(I.r, 28, 0, Math.PI * 2).rotateX(-Math.PI / 2).toNonIndexed();
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i)) / I.r;
    _c.setHex(ICE.mid).lerp(_d.setHex(ICE.edge), Math.max(0, d - 0.5) * 2);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g.translate(I.x, I.y, I.z);
}

export function drawPond(kit, M) {
  const I = W.ICE;
  kit.put('paint', M.paint, iceGeometry(), { noCast: true });
  // the skate marks: thin pale rings on the ice, at the otters' own radii (two broken: only the bold ones read from far)
  W.SKATE_RINGS.forEach((rr, i) => {
    kit.put('paint', M.paint, paint(new THREE.RingGeometry(rr - 0.05, rr + 0.05, 36, 1, i * 0.7, Math.PI * (1.5 + 0.2 * i)).rotateX(-Math.PI / 2).translate(I.x, I.y + 0.012, I.z), ICE.mark), { noCast: true });
  });
  // the bank: stones round the rim (the same count each time), snow heaped on the larger ones, and a few reeds on the far side
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const s = 0.34 + 0.16 * Math.sin(i * 2.7) ** 2;
    const x = I.x + Math.cos(a) * (I.r + 0.35); const z = I.z + Math.sin(a) * (I.r + 0.35);
    kit.put('paint', M.paint, paint(at(rock(s).scale(1, 0.7, 1), x, z, s * 0.25, a), ICE.bank, Math.sin(i * 1.9)));
    if (i % 2 === 0) kit.put('paint', M.paint, paint(at(ball(s * 0.8, 6, 4).scale(1, 0.4, 1), x, z, s * 0.62, a), COL.snowBright), { noCast: true });
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + 0.1 * i); // the south-east bank
    const x = I.x + Math.cos(a) * (I.r + 1.0 + 0.3 * Math.sin(i * 3.1)); const z = I.z + Math.sin(a) * (I.r + 1.0 + 0.3 * Math.sin(i * 3.1));
    kit.put('paint', M.paint, paint(at(cyl(0.015, 0.03, 1.1 + 0.25 * Math.sin(i * 2.3)), x, z, 0.55), 0x8a7a4a), { noCast: true });
    kit.put('paint', M.paint, paint(at(cyl(0.04, 0.04, 0.22, 5), x, z, 1.15 + 0.12 * Math.sin(i * 2.3)), 0x6a4a32), { noCast: true });
  }
  // the stump the second candle waits on: a short log with its rings, snow on one side
  const S = W.STUMP;
  kit.put('paint', M.paint, paint(at(cyl(S.r * 0.9, S.r * 1.1, S.h, 9), S.x, S.z, S.h / 2), COL.wood));
  kit.put('paint', M.paint, paint(at(cyl(S.r * 0.78, S.r * 0.78, 0.03, 9), S.x, S.z, S.h + 0.01), 0xc9a074), { noCast: true });
  kit.put('paint', M.paint, paint(at(ball(0.32, 6, 4).scale(1, 0.35, 1), S.x - 0.2, S.z + 0.15, S.h + 0.02), COL.snowBright), { noCast: true });
}

export function drawHill(kit, M) {
  // the summit rock (the third candle stands on it) with a cap of snow
  const U = W.SUMMIT;
  kit.put('paint', M.paint, paint(at(rock(U.r).scale(1, U.h / U.r * 0.9, 1).translate(0, U.h * 0.45, 0), U.x, U.z), COL.rock));
  kit.put('paint', M.paint, paint(at(ball(U.r * 0.75, 7, 4).scale(1, 0.4, 1), U.x, U.z, U.h * 0.98), COL.snowBright), { noCast: true });
  // the sled path: two runner lines of short flat slabs, summit to foot, a little bluer than the drifts
  const run = W.SLED_PATH;
  for (let i = 0; i + 1 < run.length; i++) {
    const a = run[i]; const b = run[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const n = Math.round(len / 1.1);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      for (const sx of [-0.55, 0.55]) {
        const x = a.x + (b.x - a.x) * t + Math.cos(yaw) * sx; const z = a.z + (b.z - a.z) * t - Math.sin(yaw) * sx;
        kit.put('paint', M.paint, paint(at(box(0.16, 0.03, len / n * 0.9), x, z, 0.02, yaw), COL.shade), { noCast: true });
      }
    }
  }
  // a wooden sled leaning on the summit rock: a plank, two runners and a pull rope
  const sx = U.x + 1.9; const sz = U.z + 0.5;
  kit.put('paint', M.paint, paint(at(box(0.5, 0.06, 1.2).rotateX(-0.25).translate(0, 0.32, 0), sx, sz, 0, 0.5), COL.wood));
  for (const side of [-0.2, 0.2]) kit.put('paint', M.paint, paint(at(box(0.05, 0.05, 1.3).rotateX(-0.25).translate(side, 0.2, 0), sx, sz, 0, 0.5), COL.iron));
  kit.put('paint', M.paint, paint(at(cyl(0.012, 0.012, 0.9, 4).rotateX(Math.PI / 2 - 0.5).translate(0, 0.42, 0.85), sx, sz, 0, 0.5), 0xc8483f), { noCast: true });
  // the hill rock: two boulders side by side, one hop (1.0 m) up from the snow beside them
  const H = W.HILL_ROCK;
  for (const dx of [-0.5, 0.5]) kit.put('paint', M.paint, paint(at(rock(H.r + 0.25).scale(1, H.h / (H.r + 0.25) * 0.85, 1).translate(0, H.h * 0.42, 0), H.x + dx, H.z, 0, dx * 4), COL.rock));
  kit.put('paint', M.paint, paint(at(ball(0.7, 7, 4).scale(1.4, 0.3, 0.9), H.x, H.z, H.h * 0.95), COL.snowBright), { noCast: true });
}

// The village hearth: a ring of stones, three crossed logs and a flame (emissive), a log seat either side (she warms herself here at story step 5).
export function drawHearth(kit, M) {
  const { x, z } = W.HEARTH;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    kit.put('paint', M.paint, paint(at(rock(0.24 + 0.05 * Math.sin(i * 2.1)).scale(1, 0.75, 1), x + Math.cos(a) * 0.95, z + Math.sin(a) * 0.95, 0.12, a), COL.rock, Math.sin(i * 1.3)));
  }
  kit.put('paint', M.paint, paint(at(cyl(0.8, 0.8, 0.06, 9), x, z, 0.04), 0x4a4540), { noCast: true });
  for (let i = 0; i < 3; i++) kit.put('paint', M.paint, paint(at(cyl(0.08, 0.08, 1.0, 5).rotateZ(Math.PI / 2).rotateY(i * 1.05), x, z, 0.2), COL.woodDark));
  kit.put('glow', M.glow, paint(at(new THREE.ConeGeometry(0.42, 1.0, 7, 1), x, z, 0.75), COL.flame), { noCast: true });
  kit.put('glow', M.glow, paint(at(new THREE.ConeGeometry(0.22, 0.72, 5, 1), x, z, 0.7), 0xffe08a), { noCast: true });
  for (const [dx, dz, ry] of [[-2.0, 0.2, 0.2], [1.9, -0.5, -0.3]]) {
    kit.put('paint', M.paint, paint(at(cyl(0.2, 0.2, 1.5, 6).rotateZ(Math.PI / 2), x + dx, z + dz, 0.22, ry), COL.wood));
    kit.put('paint', M.paint, paint(at(ball(0.3, 6, 4).scale(1.5, 0.3, 0.7), x + dx, z + dz, 0.45, ry), COL.snowBright), { noCast: true });
  }
}

// The Great Fir: the tallest tree in the valley, with a gold star (its bulbs are the show's life, not the kit's).
export function drawGreatFir(kit, M) {
  const G = W.GREAT_FIR;
  for (const [geo, hex] of firParts(G.s, G.tiers)) kit.put('tree', M.paint, at(hex === null ? geo : paint(geo, hex), G.x, G.z, -0.1));
  kit.put('glow', M.glow, paint(at(new THREE.OctahedronGeometry(0.4, 0), G.x, G.z, G.h + 0.1), 0xffd45a), { noCast: true });
}

// The hare's burrow: a low mound with a round hole in its side, a twig tuft and two tracks of paw prints.
export function drawBurrow(kit, M) {
  const B = W.BURROW;
  kit.put('paint', M.paint, paint(at(ball(0.75, 8, 5).scale(1.2, 0.5, 1), B.x, B.z, -0.05, 0.6), COL.snow));
  kit.put('paint', M.paint, paint(at(cyl(0.2, 0.2, 0.05, 8).rotateX(Math.PI / 2 - 0.4).translate(0.25, 0.2, 0.55), B.x, B.z, 0, 0.6), 0x4a3a30), { noCast: true });
  kit.put('paint', M.paint, paint(at(cyl(0.03, 0.03, 0.5, 4).rotateZ(0.9).translate(-0.6, 0.2, 0.2), B.x, B.z, 0, 0.6), COL.woodDark), { noCast: true });
  for (let i = 0; i < 6; i++) kit.put('paint', M.paint, paint(at(ball(0.05, 4, 3).scale(1, 0.3, 1.4), B.x + 0.9 + i * 0.5, B.z + 0.9 + 0.2 * (i % 2), 0.02), COL.shade), { noCast: true });
}

export function drawWing(kit, M) {
  drawPond(kit, M);
  drawHill(kit, M);
  drawHearth(kit, M);
  drawGreatFir(kit, M);
  drawBurrow(kit, M);
}
