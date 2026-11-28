// =============================================================================
// LIGHTHOUSE POINT: BEAUTY PASS ONE, ROUND THREE (2026-11-28). What the place was still missing for a child's eye:
// two little fishing boats riding at anchor off the cove, each with a lantern lit and a gull on the mast; sparkles
// of low gold sun scattered on both seas; bunting strung from the flagpole to pegs in the grass; barrels and a
// crate stack by the lobster pots; sea lettuce and weed at the rock-pool rims; and gulls perched on the pot stack,
// the upturned boat's keel and the flagpole's brass ball.
//
// Like the rounds before it, all of it goes into the kit's EXISTING noCast buckets (paint, wood, boat, glow, wet,
// glowpatch): no new mesh, no new caster, no new draw. Nothing moves (so reduced motion has nothing to respect),
// nothing is a collider or a platform (the boats float beyond the walk's bounds at x 36 to 38), and every number is
// hash01's. The lantern's light is the glow material's own emissive, never a real light.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './builder.js';
import * as P from './lighthouseplan.js';
import { COL, paint, paintBy, bx, bm, cy, sp } from './lighthouseparts.js';
import { Soup, tuft, mixHex, shadeHex } from './lighthousebeauty.js';

const h01 = hash01;

// a perched gull, built facing +x at the origin, its feet at y 0: a body, a head, a wedge of tail, two folded wing
// tips and an orange beak (about 70 triangles)
function gull(x, y, z, yaw, k = 1) {
  const gs = [];
  gs.push(sp(0, 0.13 * k, 0, 0.13 * k, 0xf4f1ea, { sx: 1.45, sy: 0.85, sz: 0.8, seg: 6, rings: 4 }));
  gs.push(sp(0.19 * k, 0.27 * k, 0, 0.07 * k, 0xf4f1ea, { seg: 5, rings: 3 }));
  gs.push(paint(new THREE.ConeGeometry(0.02 * k, 0.09 * k, 4).rotateZ(-Math.PI / 2).translate(0.29 * k, 0.26 * k, 0), 0xe9a03a));
  gs.push(paint(new THREE.ConeGeometry(0.06 * k, 0.2 * k, 4).rotateZ(Math.PI / 2).translate(-0.27 * k, 0.15 * k, 0), 0xdcd8cf));
  for (const s of [-1, 1]) gs.push(bm(-0.03 * k, 0.17 * k, s * 0.1 * k, -0.27 * k, 0.15 * k, s * 0.08 * k, 0.015 * k, 0.1 * k, 0x6b727a));
  gs.push(bx(-0.012 * k, 0.012 * k, 0, 0.05 * k, -0.04 * k, -0.02 * k, 0xe9a03a));
  gs.push(bx(-0.012 * k, 0.012 * k, 0, 0.05 * k, 0.02 * k, 0.04 * k, 0xe9a03a));
  for (const g of gs) { g.rotateY(yaw); g.translate(x, y, z); }
  return gs;
}

// a small moored fishing boat: a rounded hull with a stripe, a plank deck, a little wheelhouse, a mast with a pennant, a
// lantern hung from a boom and a gull on the masthead
function fishingBoat(kit, M, x, z, yaw, hull, trim, id) {
  const parts = [];
  const sea = 0.05;
  const hg = new THREE.SphereGeometry(1, 10, 5);
  hg.scale(1.75, 0.5, 0.68);
  hg.translate(0, sea + 0.1, 0);
  parts.push(paintBy(hg, (px, py) => (py < sea + 0.06 ? shadeHex(hull, 0.55) : py < sea + 0.34 ? hull : trim)));
  parts.push(bx(-1.2, 1.0, sea + 0.4, sea + 0.46, -0.44, 0.44, 0xb89d6a));
  parts.push(bx(-0.2, 0.6, sea + 0.46, sea + 1.0, -0.38, 0.38, 0xe8e1d0));
  parts.push(bx(-0.22, 0.62, sea + 1.0, sea + 1.07, -0.42, 0.42, trim));
  parts.push(bx(0.16, 0.62, sea + 0.62, sea + 0.86, -0.395, 0.395, COL.glass));
  parts.push(cy(0.9, 0, sea + 0.4, sea + 2.3, 0.035, 0.045, COL.post, 5));
  parts.push(bm(0.9, sea + 1.9, 0, 0.9, sea + 1.95, 0.9, 0.03, 0.03, COL.post)); // boom
  parts.push(bx(0.55, 0.9, sea + 2.0, sea + 2.28, 0.012, 0.016, trim)); // pennant (one flat flag)
  parts.push(cy(0.9, 0.9, sea + 1.63, sea + 1.9, 0.01, 0.01, COL.dark, 4)); // lantern hanger
  for (const g of parts) { g.rotateY(yaw); g.translate(x, 0, z); }
  parts.forEach((g) => kit.put('boat', M.paint, g, { noCast: true }));
  // the lantern (emissive) at the boom's end, and the masthead one
  const c = Math.cos(yaw); const s = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const [lx1, lz1] = at(0.9, 0.9);
  kit.put('glow', M.glow, sp(lx1, sea + 1.5, lz1, 0.1, COL.warm, { seg: 6, rings: 4 }), { noCast: true });
  const [lx2, lz2] = at(0.9, 0);
  kit.put('glow', M.glow, sp(lx2, sea + 2.38, lz2, 0.07, 0xffe2a0, { seg: 5, rings: 3 }), { noCast: true });
  kit.put('boat', M.paint, gull(lx2 + 0.0, sea + 2.31, lz2, yaw + (id ? 2.2 : 0.4), 0.9), { noCast: true });
  // a ring of wash about the hull and a wake (additive, so it only lightens)
  const S = new Soup();
  const seg = 14;
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * 6.283; const a1 = ((k + 1) / seg) * 6.283;
    const v = (a, rx, rz) => { const px = Math.cos(a) * rx; const pz = Math.sin(a) * rz; return [x + px * c + pz * s, 0.085, z - px * s + pz * c]; };
    const bright = 0x484c4e; const dark = 0x161819;
    S.tri(v(a0, 1.7, 0.66), v(a1, 2.15, 0.9), v(a0, 2.15, 0.9), bright, dark, dark);
    S.tri(v(a0, 1.7, 0.66), v(a1, 1.7, 0.66), v(a1, 2.15, 0.9), bright, bright, dark);
  }
  kit.put('glowpatch', M.patch, S.geometry(), { noCast: true });
}

// bunting: pennants hung along a sagging string from `a` to `b`, each a little triangle in turn red, white, gold, blue
function bunting(S, a, b, seed, n = 8) {
  const colours = [COL.red, COL.white, 0xe9b43a, 0x3f78b0];
  const sag = 0.35 + 0.3 * h01(seed, 1, 801);
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  const nx = -(b[2] - a[2]) / L; const nz = (b[0] - a[0]) / L;
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.2) / n; const t1 = (i + 0.8) / n;
    const p0 = at(t0); const p1 = at(t1);
    const tip = at((t0 + t1) / 2);
    tip[1] -= 0.3; tip[0] += nx * 0.04; tip[2] += nz * 0.04;
    S.both(p0, p1, tip, colours[(i + seed) % 4], colours[(i + seed) % 4], shadeHex(colours[(i + seed) % 4], 0.85));
  }
  // the string itself, a thin dark ribbon
  for (let i = 0; i < 6; i++) {
    const p0 = at(i / 6); const p1 = at((i + 1) / 6);
    S.both(p0, p1, [p1[0], p1[1] - 0.025, p1[2]], 0x4a3a28, 0x4a3a28, 0x4a3a28);
  }
}

function drawBoatsAndSparkle(kit, M) {
  fishingBoat(kit, M, 43, -12, 0.5, 0x2f6f95, 0xe9d8b0, 0);
  fishingBoat(kit, M, 46, 21, -0.7, 0xb5503a, 0xe8e1d0, 1);
  // low gold sun glitter: four-point glints scattered on both seas, more thickly near the shore, additive
  const S = new Soup();
  const glint = (x, z, r, seed) => {
    const gold = mixHex(0xa08a4a, 0xe0c878, h01(seed, 1, 811));
    const hot = 0xfff0b8;
    const a = h01(seed, 2, 811) * 0.5;
    const ca = Math.cos(a); const sa = Math.sin(a);
    const q = (u, w) => [x + u * ca - w * sa, 0.09, z + u * sa + w * ca];
    S.tri(q(-r, 0), q(r, 0), q(0, r * 0.18), 0x000000, 0x000000, hot);
    S.tri(q(-r, 0), q(r, 0), q(0, -r * 0.18), 0x000000, 0x000000, hot);
    S.tri(q(0, -r * 0.7), q(0, r * 0.7), q(r * 0.16, 0), 0x000000, 0x000000, gold);
    S.tri(q(0, -r * 0.7), q(0, r * 0.7), q(-r * 0.16, 0), 0x000000, 0x000000, gold);
  };
  for (let i = 0; i < 70; i++) {
    const x = 38.5 + 38 * h01(i, 1, 821) ** 1.4; const z = -62 + 124 * h01(i, 2, 821);
    if (Math.hypot(x - 43, z + 12) < 2.6 || Math.hypot(x - 46, z - 21) < 2.6) continue;
    glint(x, z, 0.35 + 0.4 * h01(i, 3, 821), i);
  }
  for (let i = 0; i < 50; i++) {
    const x = -41.5 - 36 * h01(i, 1, 831) ** 1.4; const z = -62 + 124 * h01(i, 2, 831);
    if (Math.hypot(x - P.GULL_ROCK.x, z - P.GULL_ROCK.z) < P.GULL_ROCK.r * 1.8 || Math.hypot(x - P.PINNACLE.x, z - P.PINNACLE.z) < P.PINNACLE.r * 1.8) continue;
    glint(x, z, 0.35 + 0.4 * h01(i, 3, 831), 200 + i);
  }
  kit.put('glowpatch', M.patch, S.geometry(), { noCast: true });
}

function drawFlagsAndProps(kit, M) {
  const { FLAGPOLE: F, PLATEAU_Y: Y0 } = P;
  // bunting from the flagpole's top to pegs in the grass, three strings
  const B = new Soup();
  const pegs = [[2.4, -4.6], [-4.8, -3.4], [-1.4, 5.2]];
  pegs.forEach(([dx, dz], i) => {
    const px = F.x + dx; const pz = F.z + dz;
    kit.put('wood', M.wood, cy(px, pz, Y0, Y0 + 1.5, 0.03, 0.035, COL.post, 5), { noCast: true });
    bunting(B, [F.x, Y0 + 6.7, F.z], [px, Y0 + 1.5, pz], i + 1, 7);
  });
  kit.put('paint', M.paint, B.geometry(), { noCast: true });
  // gulls: on the flagpole's brass ball, the pot stack and the upturned boat's keel
  kit.put('boat', M.paint, gull(F.x, Y0 + 7.17, F.z, 0.9, 0.9), { noCast: true });
  kit.put('boat', M.paint, gull(8.75, 0.8, 32.65, 2.6), { noCast: true });
  kit.put('boat', M.paint, gull(P.BOAT.x + 0.1, 0.57, P.BOAT.z, -P.BOAT.yaw + 0.5), { noCast: true });
  // barrels by the lobster pots (tapered, hooped), a crate stack and a coil of rope on top
  [[6.4, 35.0, 0.34], [7.2, 35.6, 0.3], [5.7, 36.0, 0.28]].forEach(([x, z, r], i) => {
    kit.put('wood', M.wood, cy(x, z, 0, 0.62, r * 0.88, r * 0.88, [0x8b6a45, 0x9a7650, 0x7d5d3b][i], 8), { noCast: true });
    for (const hy of [0.1, 0.5]) kit.put('wood', M.wood, cy(x, z, hy, hy + 0.06, r * 0.93, r * 0.93, 0x3d3226, 8), { noCast: true });
  });
  kit.put('wood', M.wood, bx(3.4, 4.4, 0, 0.52, 35.2, 36.2, 0x8f6d44), { noCast: true });
  kit.put('wood', M.wood, bx(3.55, 4.25, 0.52, 1.0, 35.3, 36.0, 0x7d5d3b), { noCast: true });
  kit.put('wood', M.wood, bx(3.38, 4.42, 0.24, 0.29, 35.17, 36.23, 0x5b4630), { noCast: true });
  kit.put('wood', M.wood, bx(3.52, 4.28, 0.74, 0.79, 35.27, 36.03, 0x5b4630), { noCast: true });
}

// sea lettuce and weed just outside the rim of each rock pool, and a few small fronds on the shelf
function drawPoolWeed(kit, M) {
  const W = new Soup();
  P.POOLS.forEach((p, k) => {
    for (let m = 0; m < 6; m++) {
      const a = (m / 6) * 6.283 + 0.9 * h01(k, m, 841);
      const x = p.x + Math.cos(a) * (p.r + 0.32); const z = p.z + Math.sin(a) * (p.r + 0.32);
      tuft(W, x, 0.05, z, 2000 + k * 10 + m, 0.32 + 0.22 * h01(k, m, 843), 0x4a6a34, [0x8cc96a, 0xa6d870, 0x6fb060][(k + m) % 3], 4);
    }
  });
  kit.put('wet', M.stone, W.geometry(), { noCast: true });
}

export function drawBeauty2(kit, M) {
  drawBoatsAndSparkle(kit, M);
  drawFlagsAndProps(kit, M);
  drawPoolWeed(kit, M);
}
