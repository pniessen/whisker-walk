// =============================================================================
// LIGHTHOUSE POINT: THE SECOND BEAUTY ROUND (2026-11-27). The lawn was thin and the sand wide and empty, so:
// fuller grass with taller seed-headed clumps, sea-pink cushions and daisy mats on the lawn, clover patches,
// lichened stones, a worn trodden ring at the tower foot; on the sand, driftwood, pebble rings on every pool
// shelf, damp-sand patches and dune-grass runs at the cliff foot, and bladderwrack tangles at the tide line.
//
// Like lighthousebeauty.js it is flat vertex-coloured triangles put into the kit existing noCast buckets
// (flora and wet), so it adds no mesh and no draw; nothing casts, collides or moves, and every number
// comes from hash01 (never Math.random).
// =============================================================================

import { hash01 } from './builder.js';
import * as P from './lighthouseplan.js';
import { Soup, tuft, patch, shell, lawnOk, sandOk, nearCollider, poolNear, mixHex, shadeHex } from './lighthousebeauty.js';

const h01 = hash01;

// a thin stalk with a seed head: a long blade and a small dark-gold tip cluster
function seedGrass(S, x, y, z, seed, h, base, head) {
  tuft(S, x, y, z, seed, h, base, mixHex(base, 0xe8e08e, 0.5), 3);
  const a = h01(seed, 3, 601) * 6.283;
  const tx = x + Math.cos(a) * h * 0.25; const tz = z + Math.sin(a) * h * 0.25;
  S.both([x - 0.012, y, z], [x + 0.012, y, z], [tx, y + h * 1.05, tz], base, base, shadeHex(base, 1.2));
  S.both([tx - 0.02, y + h * 0.85, tz], [tx + 0.02, y + h * 0.85, tz], [tx, y + h * 1.15, tz + 0.01], head, head, shadeHex(head, 1.15));
}

// a flat daisy: six white petals and a gold eye, lying a little off the ground
function daisy(S, x, y, z, seed, hex) {
  const a = h01(seed, 1, 611) * 6.283; const r = 0.07 + 0.03 * h01(seed, 2, 611);
  for (let k = 0; k < 4; k++) {
    const a0 = a + k * 1.5708;
    S.up([x, y + 0.045, z], [x + Math.cos(a0 - 0.45) * r, y + 0.04, z + Math.sin(a0 - 0.45) * r], [x + Math.cos(a0 + 0.45) * r, y + 0.04, z + Math.sin(a0 + 0.45) * r], 0xf1c93e, hex, hex);
  }
}

// a low lichened stone: a flattened five-sided hump, grey with an orange crust on its crown
function stone(S, x, y, z, r, seed) {
  const apex = [x, y + r * 0.55, z];
  const base = 0x8e8a7c;
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * 6.283 + seed; const a1 = ((k + 1) / 5) * 6.283 + seed;
    const rr0 = r * (0.8 + 0.4 * h01(seed, k, 621)); const rr1 = r * (0.8 + 0.4 * h01(seed, (k + 1) % 5, 621));
    const tone = shadeHex(base, 0.85 + 0.3 * h01(seed, k, 623));
    S.tri(apex, [x + Math.cos(a1) * rr1, y, z + Math.sin(a1) * rr1], [x + Math.cos(a0) * rr0, y, z + Math.sin(a0) * rr0], k % 2 ? 0xc99a4a : 0xb7b09a, tone, shadeHex(tone, 0.9), [Math.cos((a0 + a1) / 2) * 0.5, 0.85, Math.sin((a0 + a1) / 2) * 0.5]);
  }
}

function drawLawnMore(kit, M) {
  const T = new Soup(); // grass
  const F = new Soup(); // daisies and clover
  const greens = [0x5f8a40, 0x6f9a45, 0x7aa24e, 0x56743a];
  const seeds = [0xb59a52, 0xc9b46a, 0x9a7a3c];
  let n = 0;
  for (let gx = -39.2; gx < -7; gx += 2.1) {
    for (let gz = -44; gz < 3.4; gz += 2.1) {
      const k0 = Math.round(gx * 10); const k1 = Math.round(gz * 10);
      const x = gx + 2 * h01(k0, k1, 631); const z = gz + 2 * h01(k0, k1, 633);
      const draw = h01(k0, k1, 635);
      if (!lawnOk(x, z)) continue;
      if (draw > 0.64) continue;
      n++;
      const g = greens[n % 4];
      if (n % 3 === 0) seedGrass(T, x, P.PLATEAU_Y, z, 900 + n, 0.55 + 0.35 * h01(n, 1, 637), shadeHex(g, 0.7), seeds[n % 3]);
      else tuft(T, x, P.PLATEAU_Y, z, 900 + n, 0.4 + 0.3 * h01(n, 2, 637), shadeHex(g, 0.6), mixHex(g, 0xe8e08e, 0.4), 5);
    }
  }
  // daisy mats and clover patches, scattered over the lawn
  for (let i = 0; i < 34; i++) {
    const cx = -38 + 30 * h01(i, 1, 641); const cz = -44 + 47 * h01(i, 2, 641);
    if (!lawnOk(cx, cz)) continue;
    patch(F, cx, P.PLATEAU_Y + 0.012, cz, 0.2 + 0.1 * h01(i, 3, 641), 1000 + i, 0x6c9646, 0x74a04e, 7, 1.2, 0.9);
    for (let k = 0; k < 5; k++) {
      const x = cx + (h01(i, k, 643) - 0.5) * 1.2; const z = cz + (h01(i, k, 645) - 0.5) * 1.0;
      if (lawnOk(x, z)) daisy(F, x, P.PLATEAU_Y, z, i * 7 + k, i % 4 === 0 ? 0xf2cf3a : 0xf6f1e4);
    }
  }
  // lichened stones
  for (let i = 0; i < 26; i++) {
    const x = -38 + 31 * h01(i, 1, 651); const z = -43 + 46 * h01(i, 2, 651);
    if (lawnOk(x, z)) stone(F, x, P.PLATEAU_Y, z, 0.12 + 0.14 * h01(i, 3, 651), i * 3 + 1);
  }
  // sea-pink cushions inland, a pink head studding a green hump
  for (let i = 0; i < 22; i++) {
    const x = -37 + 28 * h01(i, 1, 661); const z = -42 + 44 * h01(i, 2, 661);
    if (!lawnOk(x, z)) continue;
    patch(F, x, P.PLATEAU_Y + 0.05, z, 0.3 + 0.12 * h01(i, 3, 661), 1100 + i, 0x5e8a47, 0x74a055, 6);
    for (let k = 0; k < 3; k++) shell(F, x + (h01(i, k, 663) - 0.5) * 0.35, P.PLATEAU_Y + 0.08, z + (h01(i, k, 665) - 0.5) * 0.35, 0.045, k, [0xee9db8, 0xe27aa0, 0xf4b8c8][(i + k) % 3]);
  }
  // the trodden ring at the tower foot: bare earth, scuffed
  const tx = P.TOWER.x; const tz = P.TOWER.z;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * 6.283 + 0.3;
    const x = tx + Math.cos(a) * 4.9; const z = tz + Math.sin(a) * 4.9;
    if (nearCollider(x, z, 0.1)) continue;
    patch(F, x, P.PLATEAU_Y + 0.01, z, 0.5 + 0.2 * h01(k, 1, 671), 1200 + k, 0x9a8460, 0x8c7752, 5, 1.4, 1);
  }
  kit.put('flora', M.stone, [T.geometry(), F.geometry()], { noCast: true });
}

function drawSandMore(kit, M) {
  const W = new Soup();
  const D = new Soup();
  // damp-sand patches left by the last tide, darker and soft-edged
  let n = 0;
  for (let i = 0; i < 160 && n < 18; i++) {
    const x = -4 + 36 * h01(i, 1, 701); const z = 6 + 38 * h01(i, 2, 701);
    if (!sandOk(x, z)) continue;
    n++;
    patch(W, x, 0.016, z, 0.35 + 0.35 * h01(i, 3, 701), 1300 + i, 0xc4af86, 0xbba67e, 7, 1.5, 0.9);
  }
  // driftwood: grey weathered logs, one fork each, lying in the wrack zone and on the dry sand
  let logs = 0;
  for (let i = 0; i < 120 && logs < 9; i++) {
    const x = 2 + 30 * h01(i, 1, 711); const z = 18 + 26 * h01(i, 2, 711);
    if (!sandOk(x, z) || Math.hypot(x - 14, z - 37) < 4) continue; // (pass 8: none under the arrival camera, where a log seen along its length read as a stray dark line)
    logs++;
    const a = h01(i, 3, 711) * 3.14; const len = 0.9 + 1.1 * h01(i, 4, 711);
    const dx = Math.cos(a) * len / 2; const dz = Math.sin(a) * len / 2;
    const r = 0.1 + 0.05 * h01(i, 5, 711); // (fatter and paler, pass 8: the old ones were thin and dark from a low camera)
    const tone = [0xaa9e8a, 0x9a8f7c, 0xbab09c][i % 3];
    // a three-sided log: two lit faces and one underside left out
    const A0 = [x - dx, r * 1.1, z - dz]; const A1 = [x + dx, r * 0.9, z + dz];
    const nx = -Math.sin(a) * r; const nz = Math.cos(a) * r;
    D.tri([A0[0] + nx, 0.01, A0[2] + nz], [A1[0] + nx, 0.01, A1[2] + nz], A0, shadeHex(tone, 0.7), shadeHex(tone, 0.7), tone, [Math.cos(a + 1.57) * 0.8, 0.5, Math.sin(a + 1.57) * 0.8]);
    D.tri([A1[0] + nx, 0.01, A1[2] + nz], A1, A0, shadeHex(tone, 0.7), tone, tone, [Math.cos(a + 1.57) * 0.8, 0.5, Math.sin(a + 1.57) * 0.8]);
    D.tri(A0, [A0[0] - nx, 0.01, A0[2] - nz], [A1[0] - nx, 0.01, A1[2] - nz], tone, shadeHex(tone, 0.7), shadeHex(tone, 0.7), [Math.cos(a - 1.57) * 0.8, 0.5, Math.sin(a - 1.57) * 0.8]);
    D.tri(A0, [A1[0] - nx, 0.01, A1[2] - nz], A1, tone, shadeHex(tone, 0.7), tone, [Math.cos(a - 1.57) * 0.8, 0.5, Math.sin(a - 1.57) * 0.8]);
    D.tri([A0[0] + nx, 0.01, A0[2] + nz], A0, [A0[0] - nx, 0.01, A0[2] - nz], tone, tone, tone, [-Math.cos(a), 0.3, -Math.sin(a)]);
    D.tri(A1, [A1[0] + nx, 0.01, A1[2] + nz], [A1[0] - nx, 0.01, A1[2] - nz], tone, tone, tone, [Math.cos(a), 0.3, Math.sin(a)]);
    // a short fork off the side
    const fa = a + 0.7; const fx = x + Math.cos(a) * 0.1; const fz = z + Math.sin(a) * 0.1;
    D.up([fx + Math.cos(fa) * 0.3, r * 1.4, fz + Math.sin(fa) * 0.3], [fx - nx * 0.6, r * 0.9, fz - nz * 0.6], [fx + nx * 0.6, r * 0.9, fz + nz * 0.6], shadeHex(tone, 1.1), tone, tone);
  }
  // a ring of pebbles round each pool shelf, with a second scatter outside it
  P.POOLS.forEach((p, k) => {
    for (let m = 0; m < 10; m++) {
      const a = (m / 10) * 6.283 + h01(k, m, 721);
      const rr = p.r + 0.3 + 0.55 * h01(k, m, 723);
      const x = p.x + Math.cos(a) * rr; const z = p.z + Math.sin(a) * rr;
      if (nearCollider(x, z, 0.1)) continue;
      stone(W, x, 0.04, z, 0.05 + 0.07 * h01(k, m, 725), k * 20 + m);
    }
  });
  // pebble pairs and cockle shells over the open sand
  let pb = 0;
  for (let i = 0; i < 400 && pb < 40; i++) {
    const x = -3 + 34 * h01(i, 1, 751); const z = 8 + 40 * h01(i, 2, 751);
    if (!sandOk(x, z)) continue;
    pb++;
    stone(W, x, 0.01, z, 0.04 + 0.06 * h01(i, 3, 751), 3000 + i);
    if (i % 2 === 0) stone(W, x + 0.15, 0.01, z + 0.08, 0.03 + 0.03 * h01(i, 4, 751), 3500 + i);
    if (i % 3 === 0) shell(W, x - 0.2, 0.012, z + 0.1, 0.06, i, [0xf3e6cf, 0xe9b9a8, 0xf7efe0][i % 3]);
  }
  // dune grass runs along the foot of the cliffs, in long loose clumps, and bladderwrack at the tide line
  const G = new Soup();
  let g = 0;
  for (let i = 0; i < 160 && g < 28; i++) {
    const x = -5.2 + 2.4 * h01(i, 1, 731); const z = -42 + 62 * h01(i, 2, 731);
    if (nearCollider(x, z, 0.4) || (z > -22.6 && z < -15.4) || (z > 10 && z < 21)) continue;
    g++;
    seedGrass(G, x, 0.02, z, 1400 + i, 0.5 + 0.4 * h01(i, 3, 731), 0x6f7d4a, 0xc2b274);
  }
  const wrackX = (z) => 30.2 + 1.4 * Math.sin(z * 0.23) + 0.8 * Math.sin(z * 0.71 + 1);
  for (let i = 0; i < 30; i++) {
    const z = -40 + 82 * h01(i, 1, 741);
    const x = wrackX(z) + 0.6 + 0.5 * h01(i, 2, 741);
    if (poolNear(x, z, 0.8)) continue;
    patch(W, x, 0.03, z, 0.16 + 0.1 * h01(i, 3, 741), 1500 + i, 0x5a4f28, [0x7d6c36, 0x56673a, 0x8a7440][i % 3], 7, 1.6, 0.8);
    shell(W, x + 0.25, 0.04, z + 0.1, 0.04, i, 0xb2a45c);
  }
  kit.put('wet', M.stone, [W.geometry(), G.geometry(), D.geometry()], { noCast: true });
}

export function drawDetail(kit, M) {
  drawLawnMore(kit, M);
  drawSandMore(kit, M);
}
