import { hash01 } from './builder.js';
import {
  colorParts, blob, Tris, lin, scale3, lerp3, unit, smoothField, smoothstep, r2,
} from './dressing.js';

// =============================================================================
// The Moor beauty round (docs/beauty-backlog.md, MOR-1 and MOR-3 in spirit; no
// heather, the owner parked that for good). The moor was a clean olive lawn
// with the heather cushions and grass tufts on it; this scatters the small
// things a real moor has: cotton-grass nodding in the damp ground by the
// water, tormentil, harebell and white flowers in drifts, peaty bog patches
// and bilberry mats in the hollows, moss round the boulders, wool snagged
// near the sheep paths, and the print of a
// hoof here and there on the track.
//
// Everything is folded into the two meshes moordress.js already builds: the
// raised bits join `dressing`, the flat patches join `groundPaint`. No new
// mesh, no caster, no collider, no draw. Every place is seeded by hash01 and
// counted off in a fixed order, so every walk and both co-walkers get the same
// moor. moordress.js hands in its own helpers (ctx), so this module imports
// nothing from it (moordress.js imports this one).
// =============================================================================

const BOUNDS = 49;

// --- where things may go ------------------------------------------------------
// A scatter of `want` places out of `tries` seeded candidates: each must fit
// the rule ctx.fits is given, pass `ok`, and keep `gap` from the ones kept.
function scatter(ctx, { salt, tries, want, rule, ok = () => true, gap = 0, reach = 0 }) {
  const out = [];
  for (let i = 0; i < tries && out.length < want; i++) {
    const x = r2(-BOUNDS + 2 * BOUNDS * hash01(i, salt, 1));
    const z = r2(-BOUNDS + 2 * BOUNDS * hash01(salt, i, 2));
    const r = reach * (0.7 + 0.6 * hash01(i, salt, 3));
    const rl = { ...rule, path: rule.path + r, trail: rule.trail + r, clear: rule.clear + r, water: rule.water + r };
    if (!ctx.fits(x, z, rl)) continue;
    if (ctx.nearest(ctx.heather, x, z) < 0.8 + r || ctx.nearest(ctx.gorse, x, z) < 1.4 + r) continue;
    if (ctx.nearest(ctx.reeds, x, z) < 0.8) continue;
    if (!ok(x, z, i)) continue;
    if (gap && out.some((o) => Math.hypot(o.x - x, o.z - z) < gap + r + (o.r || 0))) continue;
    out.push({ x, z, r, i });
  }
  return out;
}

// --- colours ------------------------------------------------------------------
const WHITE = [lin(0xf2eee2), lin(0xe2ddca)];
const TORMENTIL = lin(0xf0cf36);
const TORMENTIL_EYE = lin(0xc98f1c);
const HAREBELL = lin(0x8f9de0);
const DAISY = lin(0xf4f0e6);
const STEM = lin(0x6f8a3c);
const WOOL = [lin(0xb4ad98), lin(0xa49d88)];
const HOOF = lin(0x57513c);
const PEAT = lin(0x3a2e1c);
const BOG_RIM = lin(0x686f3a);
const BILBERRY = lin(0x4d6030);
const MAT_EDGE = lin(0x6c7a3e);
const BILBERRY_FRUIT = lin(0x57582f);
const MOSS = lin(0x5c7434);
const MOSS_EDGE = lin(0x6e7e42);

// --- raised pieces (into `dressing`, double sided) -------------------------------
const UP = [0, 1, 0];

// A thin blade: base to a tip leaning toward (lx, lz), `w` wide at the foot.
function blade(t, x, z, h, lx, lz, w, root, tip) {
  const sx = -lz, sz = lx;
  t.v(x - sx * w, 0, z - sz * w, UP, root);
  t.v(x + sx * w, 0, z + sz * w, UP, root);
  t.v(x + lx * h * 0.35, h, z + lz * h * 0.35, UP, tip);
}

// A small round pom (a 4-sided double pyramid, normals out from its middle)
// of radius r at (x, y, z).
function pom(t, x, y, z, r, col, dark) {
  const ring = [0, 1, 2, 3].map((k) => {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
  });
  for (const [ty, c0, c1] of [[y + r * 0.9, col, dark], [y - r * 0.9, dark, scale3(dark, 0.8)]]) {
    for (let k = 0; k < 4; k++) {
      const p = ring[k], q = ring[(k + 1) % 4];
      const n = unit((p[0] + q[0]) / 2 - x, ty > y ? 0.7 : -0.7, (p[2] + q[2]) / 2 - z);
      t.v(p[0], p[1], p[2], n, c1);
      t.v(q[0], q[1], q[2], n, c1);
      t.v(x, ty, z, n, c0);
    }
  }
}

// Cotton-grass: a clump of four wiry stems, each with a white pom nodding at
// the tip, in the damp ground by the water.
function cottonGrass(t, c) {
  for (let k = 0; k < 2; k++) {
    const a = hash01(c.x + k, c.z, 2101) * Math.PI * 2;
    const d = k === 0 ? 0 : 0.08 + 0.14 * hash01(c.x, c.z + k, 2111);
    const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
    const h = 0.2 + 0.1 * hash01(x, z, 2121);
    const lean = (hash01(z, x, 2131) - 0.5) * 2;
    const lx = Math.cos(lean * 3), lz = Math.sin(lean * 3);
    blade(t, x, z, h * 0.9, lx, lz, 0.016, scale3(STEM, 0.55), STEM);
    const col = WHITE[k & 1];
    pom(t, x + lx * h * 0.3, h * 0.92, z + lz * h * 0.3, 0.055 + 0.015 * hash01(x, z, 2141), col, scale3(col, 0.72));
  }
}

// A flower: a thin stem and a five-petal head tipped up toward the sky.
function flower(t, x, z, h, r, petal, eye) {
  const lx = Math.cos(hash01(z, x, 2151) * 6.28) * 0.5, lz = Math.sin(hash01(z, x, 2151) * 6.28) * 0.5;
  blade(t, x, z, h, lx, lz, 0.012, scale3(STEM, 0.6), STEM);
  x += lx * h * 0.35; z += lz * h * 0.35; // the head sits on the stem tip
  const cy = h + 0.012;
  const lean = hash01(x, z, 2161) * Math.PI * 2;
  const ex = Math.cos(lean) * r, ez = Math.sin(lean) * r;
  // a diamond head, tipped a little up toward the middle
  const P = [[x + ex, cy, z + ez], [x - ez, cy, z + ex], [x - ex, cy, z - ez], [x + ez, cy, z - ex]];
  for (const k of [0, 2]) {
    t.v(P[k][0], P[k][1], P[k][2], UP, petal);
    t.v(P[k + 1][0], P[k + 1][1], P[k + 1][2], UP, petal);
    t.v(P[(k + 2) % 4][0], P[(k + 2) % 4][1], P[(k + 2) % 4][2], UP, petal);
  }
  t.v(x, cy + 0.006, z, UP, eye); // a bright eye: one more small triangle
  t.v(x + ex * 0.35, cy + 0.006, z + ez * 0.35, UP, eye);
  t.v(x - ez * 0.35, cy + 0.006, z + ex * 0.35, UP, eye);
}
function flowerClump(t, c, hue) {
  const petal = hue === 0 ? TORMENTIL : hue === 1 ? HAREBELL : DAISY;
  const eye = hue === 0 ? TORMENTIL_EYE : hue === 1 ? lin(0xe8e0a0) : lin(0xe3b43a);
  for (let k = 0; k < 4; k++) {
    const a = hash01(c.x + k, c.z, 2171) * Math.PI * 2;
    const d = 0.04 + 0.2 * hash01(c.x, c.z + k, 2181);
    flower(t, c.x + Math.cos(a) * d, c.z + Math.sin(a) * d,
      0.13 + 0.1 * hash01(k, c.x + c.z, 2191), 0.08 + 0.025 * hash01(c.x, k, 2201), petal, eye);
  }
}

// A snag of wool: a flattened eight-sided lump, cream, lying on the grass.
function woolTuft(t, c) {
  const r = 0.09 + 0.05 * hash01(c.x, c.z, 2211);
  const col = WOOL[c.i & 1];
  const top = [c.x, r * 0.55, c.z];
  const ring = [0, 1, 2, 3].map((k) => {
    const a = (k / 4) * Math.PI * 2 + hash01(c.x, c.z, 2221) * 3;
    return [c.x + Math.cos(a) * r * (0.8 + 0.4 * hash01(k, c.x, 2231)), 0.008, c.z + Math.sin(a) * r * (0.8 + 0.4 * hash01(k, c.z, 2241))];
  });
  for (let k = 0; k < 4; k++) {
    const p = ring[k], q = ring[(k + 1) % 4];
    t.v(p[0], p[1], p[2], UP, scale3(col, 0.85));
    t.v(q[0], q[1], q[2], UP, scale3(col, 0.85));
    t.v(top[0], top[1], top[2], UP, col);
  }
}

// A split hoof print: two slim dark wedges side by side, 1.2 cm above the track
// (the track is paint, so a print on it has to stand a hair clear of it).
function hoofPair(t, x, z, ang) {
  const fx = Math.cos(ang), fz = Math.sin(ang);
  const sx = -fz, sz = fx;
  for (const side of [-1, 1]) {
    const cx = x + sx * 0.035 * side, cz = z + sz * 0.035 * side;
    t.v(cx - fx * 0.05 + sx * 0.012 * side, 0.012, cz - fz * 0.05 + sz * 0.012 * side, UP, HOOF);
    t.v(cx - fx * 0.05 - sx * 0.012 * side, 0.012, cz - fz * 0.05 - sz * 0.012 * side, UP, HOOF);
    t.v(cx + fx * 0.055, 0.012, cz + fz * 0.055, UP, HOOF);
  }
}

// --- flat patches (into `groundPaint`) --------------------------------------------
// A patch fading from `inner` at its middle to `edge` (a touch darker than the turf, so it never rings pale) at the
// rim, so it has no hard line; the fan vertices carry the colours.
function patch(x, z, r, n, salt, inner, edge) {
  return colorParts(blob(x, z, r, { n, salt, wobble: 0.28 }), (vx, vy, vz) =>
    lerp3(inner, edge, smoothstep(0.3, 1.0, Math.hypot(vx - x, vz - z) / r)));
}

export function moorBeautyParts(ctx) {
  const t = new Tris();
  const paint = [];
  const tight = { water: 0.4, deck: 2, path: 1.9, trail: 1.4, clear: 1.5, spawn: 3, tor: 0.3, trunk: 0.6, camp: 0 };

  // cotton-grass in the damp strip 1.8 to 8 m back from the water
  const damp = (lo, hi) => (x, z) => { const d = ctx.waterDist(x, z); return d >= lo && d <= hi; };
  const cotton = scatter(ctx, { salt: 2301, tries: 900, want: 8, rule: tight, ok: damp(1.8, 8), gap: 1.1 });
  for (const c of cotton) cottonGrass(t, c);

  // flowers in drifts: the hue goes by a slow field, so a drift is one colour
  const flowers = scatter(ctx, {
    salt: 2401, tries: 2400, want: 26, rule: tight, gap: 1.5,
    ok: (x, z) => smoothstep(-0.2, 0.5, smoothField(x, z, 2411, 30)) > hash01(x, z, 2421) * 0.7,
  });
  for (const c of flowers) {
    const f = smoothField(c.x, c.z, 2431, 40);
    flowerClump(t, c, f < -0.12 ? 0 : f < 0.18 ? 2 : 1);
  }

  // wool snagged near the sheep paths, 1 to 4 m off the track
  const lines = ctx.sheepLines;
  const wool = scatter(ctx, {
    salt: 2501, tries: 700, want: 8, rule: { ...tight, path: 0.2, trail: 0.2 }, gap: 1.2,
    ok: (x, z) => { const d = ctx.nearestLine(lines, x, z); return d >= 1 && d <= 4; },
  });
  for (const c of wool) woolTuft(t, c);

  // the hoof prints on the sheep paths
  lines.forEach((line, li) => {
    for (let k = 3; k < line.length - 2; k += 2) {
      const [x, z] = line[k];
      const [x2, z2] = line[k + 1];
      const ang = Math.atan2(z2 - z, x2 - x);
      const nx = -Math.sin(ang), nz = Math.cos(ang);
      if (hash01(z, x, 2641 + li) < 0.35) {
        const o = (hash01(x, z, 2651) - 0.5) * 0.3;
        hoofPair(t, x + nx * o, z + nz * o, ang + (hash01(x, z, 2661) - 0.5) * 0.5);
      }
    }
  });

  // peaty bog patches in the damp hollows: dark in the middle, mossy at the rim
  const bogs = scatter(ctx, {
    salt: 2701, tries: 700, want: 6, rule: tight, reach: 1.5, gap: 3.6,
    ok: damp(3.8, 13),
  });
  for (const b of bogs) {
    const r = 1.2 + 0.6 * hash01(b.x, b.z, 2711);
    paint.push(patch(b.x, b.z, r * 1.25, 12, 2721, PEAT, BOG_RIM));
  }

  // bilberry mats on the drier crests, dark green with a purple bloom
  const mats = scatter(ctx, {
    salt: 2801, tries: 900, want: 8, rule: tight, reach: 0.6, gap: 2.4,
    ok: (x, z) => ctx.waterDist(x, z) > 6 && smoothField(x, z, 41, 34) > -0.1
      && ctx.nearest(bogs, x, z) > 3,
  });
  for (const m of mats) {
    const r = 0.5 + 0.3 * hash01(m.x, m.z, 2811);
    paint.push(patch(m.x, m.z, r * 1.2, 9, 2821, hash01(m.x, m.z, 2831) < 0.5 ? BILBERRY : BILBERRY_FRUIT, MAT_EDGE));
  }

  // moss round the boulders (away from the shingle, the paths and the paint above)
  let mossed = 0;
  for (const b of ctx.boulders) {
    if (mossed >= 10) break;
    if (ctx.waterDist(b.x, b.z) < 3.2) continue;
    if (ctx.nearest(bogs, b.x, b.z) < 3.5 || ctx.nearest(mats, b.x, b.z) < 2.4) continue;
    paint.push(patch(b.x, b.z, b.r * 2.1, 8, 2901, MOSS, MOSS_EDGE));
    mossed++;
  }

  return { dress: [t.geometry()], paint };
}
