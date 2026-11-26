// =============================================================================
// THE REEF, WING C: THE DRAWING (milestone R8). The Sunken Boat (an open hull of planks, a broken mast, a few ribs, a little coral on its rim), the Old Anchor
// (ring, shank, stock, two arms), and the Glow Cave (tall rocks either side of a cleft, glowing beads on the walls, a pale patch on the floor). All of it goes
// into the kit's two buckets ('paint', lit, and 'glow', unlit), so it adds no mesh to the place; every number is reefdeep.js's. No real lights, no canvas,
// no rng of its own (the area builds in withLocalUuids).
// =============================================================================

import * as THREE from 'three';
import { COL, STONES, paint, at } from './reefparts.js';
import { reefY } from './reefplan.js';
import * as D from './reefdeep.js';

const WOOD = 0x8a6a46;
const WOOD_DARK = 0x5f4630;
const WOOD_WORN = 0xa58a62;
const IRON = 0x5d6b70;
const IRON_LIGHT = 0x7d8d90;
const RUST = 0x7a5f4c;
const BEAD = Object.freeze([0x8ff0d0, 0xb4ffa0, 0x9be8ff]);

const cyl = (rt, rb, h, seg = 6) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

// The hull: a lofted shell (stations along the keel, an arc across), outer and inner skins and a rim between them. The local x axis is the keel.
function hullGeometries() {
  const N = 10;
  const M = 6;
  const Lh = D.BOAT.length / 2;
  const sk = (inset, flip) => {
    const pos = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const t = -1 + (2 * i) / N;
      const hw = Math.max(0.001, D.hullHalf(t) - inset);
      const rim = D.hullRim(t);
      const dep = D.BOAT.depth - inset;
      for (let j = 0; j <= M; j++) {
        const a = -Math.PI / 2 + (Math.PI * j) / M;
        pos.push(t * Lh, rim - dep * Math.cos(a), hw * Math.sin(a));
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j; idx.push(...(flip ? [a, a + M + 1, a + 1, a + 1, a + M + 1, a + M + 2] : [a, a + 1, a + M + 1, a + 1, a + M + 2, a + M + 1])); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  };
  // plank rows: the colour alternates every quarter metre of height
  const stripe = (g, lo, hi) => {
    const p = paint(g, lo);
    const c = p.attributes.color;
    const pos = p.attributes.position;
    const tmp = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      tmp.setHex(Math.floor(pos.getY(k) * 4) % 2 ? hi : lo);
      c.setXYZ(k, tmp.r, tmp.g, tmp.b);
    }
    return p;
  };
  const outer = stripe(sk(0, true), WOOD, WOOD_WORN);
  const inner = stripe(sk(0.14), WOOD_DARK, WOOD);
  // the rim: a thin flat strip along each side joining the skins at the top
  const rim = [];
  for (const sg of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t0 = -1 + (2 * i) / N;
      const t1 = -1 + (2 * (i + 1)) / N;
      const a = new THREE.Vector3(t0 * Lh, D.hullRim(t0) + 0.02, sg * Math.max(0.001, D.hullHalf(t0)));
      const b = new THREE.Vector3(t1 * Lh, D.hullRim(t1) + 0.02, sg * Math.max(0.001, D.hullHalf(t1)));
      const a2 = new THREE.Vector3(t0 * Lh, a.y, sg * Math.max(0.001, D.hullHalf(t0) - 0.14));
      const b2 = new THREE.Vector3(t1 * Lh, b.y, sg * Math.max(0.001, D.hullHalf(t1) - 0.14));
      const g = new THREE.BufferGeometry().setFromPoints(sg > 0 ? [a, b, a2, b, b2, a2] : [a, a2, b, b, a2, b2]);
      rim.push(paint(g, WOOD_WORN));
    }
  }
  return [outer, inner, ...rim];
}

export function drawBoat(kit, M) {
  const B = D.BOAT;
  const Lh = B.length / 2;
  const base = reefY(B.x, B.z) - 0.3; // the hull is set 0.3 m into the sand
  // a piece in the hull's own frame (x along the keel): rolled a little, turned to the plan's yaw, set on the seabed
  const local = (geo) => geo.rotateX(B.roll).rotateY(-B.yaw).translate(B.x, base, B.z);
  const put = (geo, hex, opts) => kit.put('paint', M.paint, paint(local(geo), hex), opts);
  for (const g of hullGeometries()) kit.put('paint', M.paint, local(g));
  // ribs standing out beyond the broken stern, and one cross timber across the hull
  for (const [u, v, h, tilt] of [[Lh + 0.35, -1.4, 1.0, 0.12], [Lh + 0.5, -0.1, 0.8, -0.2], [Lh + 0.3, 1.3, 1.15, 0.18]]) {
    put(new THREE.BoxGeometry(0.16, h, 0.2).translate(0, h / 2, 0).rotateZ(tilt).translate(u, 0.05, v), WOOD_DARK, { noCast: true });
  }
  put(new THREE.BoxGeometry(0.2, 0.18, B.half * 1.5).translate(-0.6, 0.65, 0), WOOD_WORN, { noCast: true });
  // the broken mast: a stump rising from the middle with a short crooked top, and the boom lying across the sand beside it
  put(cyl(0.11, 0.17, B.mast, 6).translate(-0.4, B.mast / 2 + 0.2, 0), WOOD_DARK);
  put(cyl(0.08, 0.1, 0.5, 5).rotateZ(0.5).translate(-0.4, B.mast + 0.3, 0), WOOD_DARK, { noCast: true });
  put(cyl(0.06, 0.07, 2.4, 5).rotateZ(Math.PI / 2).translate(0.4, 0.55, 0.2), WOOD, { noCast: true });
  // a little coral on the rim, so the boat is the reef's own now
  for (let i = 0; i < 7; i++) {
    const u = -2.4 + i * 0.9;
    const t = u / Lh;
    const v = (i % 2 ? 1 : -1) * (D.hullHalf(t) - 0.1);
    put(cyl(0.05, 0.13, 0.32 + (i % 3) * 0.16, 6).translate(u, D.hullRim(t) + 0.2, v), COL.coral[i % 4], { noCast: true });
  }
}

export function drawAnchor(kit, M) {
  const A = D.ANCHOR;
  const put = (geo, hex, opts) => kit.put('paint', M.paint, paint(at(geo, A.x, A.z, 0, -A.yaw), hex), opts);
  // lying on its side: the shank along x, sunk a little into the dune, tilted up at the ring
  const body = (geo, hex, opts) => put(geo.rotateZ(0.12), hex, opts);
  body(cyl(0.09, 0.11, A.shank, 6).rotateZ(Math.PI / 2).translate(0, 0.22, 0), IRON);
  body(cyl(0.095, 0.115, 0.7, 6).rotateZ(Math.PI / 2).translate(0.5, 0.22, 0), RUST); // a rust-brown stretch of the shank, where the sea has had longest
  body(new THREE.TorusGeometry(0.22, 0.05, 5, 8).translate(-A.shank / 2 - 0.12, 0.3, 0), IRON_LIGHT); // the ring at the top
  body(cyl(0.05, 0.05, 1.3, 5).rotateX(Math.PI / 2).translate(-A.shank / 2 + 0.3, 0.3, 0), IRON_LIGHT); // the stock, across the shank
  // the crown: two curved arms, each a half ring, and a fluke at each tip
  for (const s of [-1, 1]) {
    body(new THREE.TorusGeometry(0.62, 0.075, 5, 8, Math.PI * 0.7).rotateX(s > 0 ? 0 : Math.PI).rotateZ(Math.PI * 0.15).translate(A.shank / 2 - 0.3, 0.1, 0), s > 0 ? RUST : IRON);
    body(new THREE.ConeGeometry(0.17, 0.4, 4).rotateZ(-Math.PI / 2).rotateY(s * 0.7).translate(A.shank / 2 + 0.3, 0.45, s * 0.55), IRON_LIGHT, { noCast: true });
  }
  // a few links of chain trailing off across the sand
  for (let i = 0; i < 4; i++) body(new THREE.TorusGeometry(0.1, 0.03, 4, 6).rotateX(i % 2 ? 0 : Math.PI / 2).translate(-A.shank / 2 - 0.55 - i * 0.2, 0.08, 0.1 * i), IRON_LIGHT, { noCast: true });
}

export function drawGlowCave(kit, M) {
  const G = D.GLOW;
  D.WALLS.forEach((w, i) => {
    // a tall rock, leaning in toward the cleft, with a smaller one riding on its shoulder
    const lean = w.z < G.floorZ ? 0.12 : w.z > G.floorZ ? -0.12 : 0;
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(w.r, 0).scale(1.25, w.h / (w.r * 2), 1.15).translate(0, w.h / 2 - 0.2, 0).rotateX(lean), w.x, w.z, 0, i * 1.1), STONES[i % 5]));
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(w.r * 0.6, 0).translate(w.r * 0.2, w.h - 0.4, 0).rotateX(lean * 2), w.x, w.z, 0, i * 0.7), COL.stoneLight), { noCast: true });
  });
  // the rocks behind the walls, so the cleft is a pass through a bigger outcrop, and a few stones at its mouth
  let bi = 2;
  for (const [x, z, r, h] of [[-41.4, -41, 1.5, 3.6], [-44, -41.2, 1.4, 3.2], [-41.4, -33, 1.4, 3.2], [-44, -33, 1.3, 3.0], [-47, -39.6, 1.5, 3.4], [-47, -34.6, 1.4, 3.0]]) {
    kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(r, 0).scale(1.2, h / (r * 2), 1.1).translate(0, h / 2 - 0.2, 0), x, z, 0, x), STONES[bi++ % 5]));
  }
  for (const [x, z] of [[-38.2, -39.4], [-38.6, -34.6], [-37.8, -36.4]]) kit.put('paint', M.paint, paint(at(new THREE.DodecahedronGeometry(0.28, 0).scale(1, 0.6, 1), x, z, 0.05, x), COL.stoneLight), { noCast: true });
  // the glow: beads on the walls' inner faces and a pale patch on the floor (unlit, so it shines at any depth)
  D.glowBeads().forEach((b, i) => {
    const geo = new THREE.IcosahedronGeometry(b.r, 0);
    kit.put('glow', M.glow, paint(at(geo, b.x, b.z, b.y), BEAD[i % 3]), { noCast: true });
  });
  // round 3: each pale patch is brightest in the middle and fades to a soft teal at the rim (vertex colour), so it reads as a pool of light, not a white tile
  const pool = (geo, x, z, dy, r) => {
    const q = at(geo, x, z, dy);
    const p = q.attributes.position;
    const c = q.attributes.color;
    for (let v = 0; v < p.count; v++) { const k = 1 - 0.62 * Math.min(1, Math.hypot(p.getX(v) - x, p.getZ(v) - z) / r); c.setXYZ(v, c.getX(v) * k * (0.9 + 0.1 * k), c.getY(v) * k, c.getZ(v) * k * (1.1 - 0.1 * k)); }
    return q;
  };
  kit.put('glow', M.glow, pool(paint(new THREE.CircleGeometry(1.5, 10).rotateX(-Math.PI / 2), 0xbff7ea), -42, G.floorZ, 0.03, 1.5), { noCast: true });
  kit.put('glow', M.glow, pool(paint(new THREE.CircleGeometry(0.8, 8).rotateX(-Math.PI / 2), 0xe2ffd2), -44.4, G.floorZ + 0.3, 0.035, 0.8), { noCast: true });
}

export function drawDeep(kit, M) {
  drawBoat(kit, M);
  drawAnchor(kit, M);
  drawGlowCave(kit, M);
}
