import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';

// The Gorge beauty round (docs/beauty-backlog.md GRG-2, and the bare floor).
// Nothing here is a mesh of its own: gorgeBeautyParts hands back flat
// vertex-coloured triangles that meadowMesh (gorge.js) appends to the noCast
// gorgeMeadow mesh, so the Gorge gains no mesh and no draw. It draws from its
// own seeded stream (never Math.random), and every candidate draws all its
// numbers whether it is kept or not, so a change to one rule moves nothing
// but what that rule keeps out.
//   * reed clumps along both banks of the stream;
//   * wildflower clumps on the banks, the clifftop and the ledges;
//   * sage shrubs on the floor and the clifftop;
//   * fern fans in the angle of each wall and its talus, where the wet is;
//   * small flat stones in twos and threes beside the water and the walls.
// Everything stands on the flat ground only (floor, ledges, clifftop), clear
// of the paths near the water, every find, cave and den.

const REED = [0x5f7e36, 0x70903f, 0x4f6c2c];
const FLOWER = [0xe2b83c, 0x9a78c4, 0xd8582c, 0xf0ead8];
const SAGE = [0x6f8a5c, 0x7a9468, 0x62805a];
const FERN = [0x4f8a3e, 0x62a04c];
const STONE = [0xcdbb9c, 0xb8a384, 0xa89a82, 0xd6c4a4];

// vertex colours are linear, as THREE.Color holds them (a hex is sRGB)
const _c = new THREE.Color();
const rgb = (hex, k = 1) => { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; };

// ctx: { ground(x, z) -> y or null where the spot may carry decor, near(x, z) -> m to the nearest path or
//        water edge for the keep rules, free(x, z) -> bool, walls: [[x1, z1, x2, z2, nx, nz]], stream: {minX, maxX} }
export function gorgeBeautyParts(ctx) {
  const pos = [], col = [];
  const tri = (a, b, c, ca, cb = ca, cc = ca) => {
    for (const [p, k] of [[a, ca], [b, cb], [c, cc]]) { pos.push(p[0], p[1], p[2]); col.push(k[0], k[1], k[2]); }
  };
  // a blade seen from both sides, base wide, tip leaning
  const blade = (x, y, z, a, w, h, lean, base, tip) => {
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    const tx = x + Math.cos(a) * lean, tz = z + Math.sin(a) * lean;
    tri([x - px, y, z - pz], [x + px, y, z + pz], [tx, y + h, tz], base, base, tip);
    tri([x + px, y, z + pz], [x - px, y, z - pz], [tx, y + h, tz], base, base, tip);
  };
  const free = (x, z) => ctx.free(x, z);

  // ---- reeds along the water ----------------------------------------------------
  {
    const rng = mulberry32(seedFromCode('gorge-beauty-reeds'));
    for (let i = 0; i < 70; i++) {
      const uz = rng(), us = rng(), ue = rng(), uo = rng();
      const east = ue < 0.5;
      const x = (east ? ctx.stream.maxX + 0.14 : ctx.stream.minX - 0.14) + (east ? 1 : -1) * uo * 0.18;
      const z = -48 + uz * 96;
      const y = ctx.ground(x, z);
      if (y === null || !free(x, z) || ctx.nearDeck(x, z) < 0.9 || ctx.nearPath(x, z) < 1.1 || us < 0.38) continue;
      const c = REED[i % REED.length];
      for (let k = 0; k < 4; k++) {
        const a = ((i * 7 + k * 2.1) % 6.283);
        const h = 0.6 + 0.5 * rng() + 0.12 * k;
        blade(x + Math.cos(a) * 0.05, y, z + Math.sin(a) * 0.05, a, 0.03, h, 0.12 + 0.06 * k, rgb(c, 0.7), rgb(c, 1.12));
      }
    }
  }
  // ---- wildflowers --------------------------------------------------------------
  {
    const rng = mulberry32(seedFromCode('gorge-beauty-flowers'));
    for (let i = 0; i < 135; i++) {
      const ux = rng(), uz = rng(), ut = rng(), uc = rng(), un = rng();
      // the banks, the clifftop, the ledges
      const zone = ut < 0.45 ? 0 : 1;
      const x = zone === 0 ? (uc < 0.5 ? -11.4 + ux * 1.7 : -7.8 + ux * 1.7) : 3 + ux * 30;
      const z = zone === 0 ? -48 + uz * 96 : -39 + uz * 20;
      const y = ctx.ground(x, z);
      if (y === null || !free(x, z) || ctx.nearPath(x, z) < 1.6 || un < 0.35) continue;
      const hex = FLOWER[Math.floor(uc * 7.9) % FLOWER.length];
      const n = 3 + Math.floor(un * 2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.283 + ux * 9, d = 0.08 + 0.1 * ((k * 0.37 + uz * 5) % 1);
        const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d;
        const h = 0.3 + 0.2 * ((k * 0.61 + ux * 3) % 1);
        const lean = 0.03;
        const hx = fx + Math.cos(a) * lean, hz = fz + Math.sin(a) * lean;
        const stem = rgb(0x5d7d3a);
        tri([fx - 0.012, y, fz], [fx + 0.012, y, fz], [hx, y + h, hz], stem, stem, rgb(0x7a9a4c));
        // the head: two crossed petal diamonds (four triangles would cost twice as much)
        const r = 0.075, top = y + h + 0.08, head = rgb(hex, 0.85), rim = rgb(hex, 1), mid = rgb(hex, 0.6);
        tri([hx - r, top, hz], [hx + r, top, hz], [hx, y + h - 0.01, hz], rim, rim, mid);
        tri([hx, top, hz - r], [hx, top, hz + r], [hx, y + h - 0.01, hz], head, head, mid);
      }
      // a low tuft at the foot of the clump
      const a = ux * 6.283;
      blade(x, y, z + 0.05, a, 0.03, 0.15, 0.06, rgb(0x6f8a45, 0.75), rgb(0x8f9a52));
    }
  }
  // ---- sage shrubs --------------------------------------------------------------
  {
    const rng = mulberry32(seedFromCode('gorge-beauty-sage'));
    for (let i = 0; i < 70; i++) {
      const ux = rng(), uz = rng(), ut = rng(), us = rng(), un = rng();
      const top = ut < 0.4;
      const x = top ? 3 + ux * 30 : -17 + ux * 18, z = top ? -39 + uz * 20 : -48 + uz * 96;
      const y = ctx.ground(x, z);
      if (y === null || !free(x, z) || ctx.nearPath(x, z) < 1.8 || ctx.nearWater(x, z) < 1.2 || un < 0.45) continue;
      const s = 0.2 + 0.14 * us, c = SAGE[i % SAGE.length];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * 6.283 + i;
        blade(x, y, z, a, s * 0.45, s * (1.3 + 0.35 * ((k * 0.37 + us) % 1)), s * 0.55, rgb(c, 0.6), rgb(c, 1.12));
      }
    }
  }
  // ---- ferns where the walls meet the floor ----------------------------------------
  {
    const rng = mulberry32(seedFromCode('gorge-beauty-ferns'));
    for (let i = 0; i < 64; i++) {
      const uw = rng(), ut = rng(), uo = rng(), un = rng();
      const w = ctx.walls[Math.floor(uw * ctx.walls.length) % ctx.walls.length];
      const [x1, z1, x2, z2, nx, nz] = w;
      const len = Math.hypot(x2 - x1, z2 - z1);
      const d = 0.45 + 0.35 * uo;
      const x = x1 + (x2 - x1) * ut + nx * d, z = z1 + (z2 - z1) * ut + nz * d;
      const y = ctx.ground(x, z);
      if (y === null || !free(x, z) || ctx.nearPath(x, z) < 1.7 || ctx.nearWater(x, z) < 0.5 || un < 0.28 || len < 1) continue;
      const c = FERN[i % FERN.length];
      for (let k = 0; k < 4; k++) {
        const a = Math.atan2(nz, nx) + (k - 1.5) * 0.6;
        // an arching frond: out, up and over
        const h = 0.3 + 0.14 * ((k * 0.43 + un * 3) % 1);
        const px = -Math.sin(a) * 0.05, pz = Math.cos(a) * 0.05;
        const mx = x + Math.cos(a) * 0.14, mz = z + Math.sin(a) * 0.14;
        const tx = x + Math.cos(a) * 0.36, tz = z + Math.sin(a) * 0.36;
        const base = rgb(c, 0.62), mid = rgb(c, 0.95), tip = rgb(c, 1.15);
        tri([x - px, y, z - pz], [x + px, y, z + pz], [mx + px, y + h, mz + pz], base, base, mid);
        tri([x - px, y, z - pz], [mx + px, y + h, mz + pz], [mx - px, y + h, mz - pz], base, mid, mid);
        tri([mx - px, y + h, mz - pz], [mx + px, y + h, mz + pz], [tx, y + h * 0.55, tz], mid, mid, tip);
        // the underside, so it shows from the floor side too
        tri([x + px, y, z + pz], [x - px, y, z - pz], [mx - px, y + h, mz - pz], base, base, mid);
        tri([mx + px, y + h, mz + pz], [mx - px, y + h, mz - pz], [tx, y + h * 0.55, tz], mid, mid, tip);
      }
    }
  }
  // ---- small flat stones ----------------------------------------------------------------
  {
    const rng = mulberry32(seedFromCode('gorge-beauty-stones'));
    for (let i = 0; i < 70; i++) {
      const ux = rng(), uz = rng(), ut = rng(), us = rng(), ua = rng();
      const bank = ut < 0.5;
      const x = bank ? -12 + ux * 6 : -17 + ux * 18, z = -48 + uz * 96;
      const y = ctx.ground(x, z);
      if (y === null || !free(x, z) || ctx.nearDeck(x, z) < 0.8 || ctx.nearWater(x, z) < 0.15 || ctx.nearPath(x, z) < 0.5 || us < 0.3) continue;
      const n = 1 + Math.floor(ua * 3);
      for (let k = 0; k < n; k++) {
        const a0 = ua * 20 + k * 2.4, ox = x + Math.cos(a0) * 0.18 * k, oz = z + Math.sin(a0) * 0.18 * k;
        const r = 0.05 + 0.06 * ((us * 7 + k * 0.3) % 1), h = r * 0.55;
        const c = STONE[(i + k) % STONE.length];
        const tipc = rgb(c, 1.05), basec = rgb(c, 0.72), sideA = rgb(c, 0.88);
        const apex = [ox + r * 0.1, y + h, oz];
        for (let j = 0; j < 5; j++) {
          const t0 = a0 + (j / 5) * 6.283, t1 = a0 + ((j + 1) / 5) * 6.283;
          const rr = (q) => r * (0.85 + 0.3 * (((i * 3 + k + q) * 0.37) % 1));
          tri([ox + Math.cos(t0) * rr(j), y, oz + Math.sin(t0) * rr(j)], [ox + Math.cos(t1) * rr(j + 1), y, oz + Math.sin(t1) * rr(j + 1)], apex, basec, sideA, tipc);
        }
      }
    }
  }
  return { pos, col };
}
