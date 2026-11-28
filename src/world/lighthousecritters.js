// =============================================================================
// LIGHTHOUSE POINT: THE LITTLE LIVES (beauty pass 5, 2026-11-28). Small creatures with one simple habit each, drawn as a few
// camera-facing triangles into the wet mesh's pooled tail (lighthousealive.js gives this module CRIT_TRIS of them and only draws the
// ones in use): no mesh, no rig, no caster, no random number (hash01 and the walk's clock only).
//   CRABS (3)       scuttle sideways in dashes on the sand by their holes; when she comes near they run for the hole and are gone,
//                   and they come out again when she has been away a while;
//   SANDPIPERS (2)  run along the wet edge and fly up over the sea when she comes near, then come back down;
//   SEALS (2)       a head and a pale snout bobbing in the east bay, now and then under;
//   A CORMORANT     on the harbour post, wings spread to dry (it folds them when she is close);
//   JELLYFISH       pale domes pulsing in the tide pools.
// One wind for the place: WIND blows toward +z, the way the mist banks drift; the cormorant sways with it and the wind bed pans to it. Reduced motion freezes them where they begin
// (crabs out, birds standing, heads up); the low tier has fewer of each. The whole of it fits CRIT_TRIS triangles.
// =============================================================================

import { hash01 } from './builder.js';

export const CRIT_TRIS = 64;
export const CRIT_TRIS_LOW = 32;
export const WIND = Object.freeze({ x: 0, z: 1 }); // the way the wind blows (the mist banks, the birds' heads, the wind bed's pan)
export const DOOR = Object.freeze({ x: -22 + 3.35 * Math.SQRT1_2, z: -20 + 3.35 * Math.SQRT1_2, y: 8.07, nx: Math.SQRT1_2, nz: Math.SQRT1_2 });
export const POST = Object.freeze({ x: 11.6, y: 1.95, z: 32.6 });

const CRABS = Object.freeze([{ x: 17.4, z: 30.2 }, { x: 22.8, z: 31.6 }, { x: 9.6, z: 25.6 }]);
const PIPERS = Object.freeze([{ z0: 22, z1: 40, x: 33.4 }, { z0: 28, z1: 43, x: 34.2 }]);
const SEALS = Object.freeze([{ x: 47, z: 33 }, { x: 54.5, z: 26.5 }]);
const JELLIES = Object.freeze([{ x: 22, z: 12, r: 1.3 }, { x: 16, z: 22, r: 1.2 }, { x: 26, z: 26, r: 1.0 }]);
const CRAB_FLEE = 4.6; const CRAB_BACK = 9; const PIPER_FLEE = 5.5;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);
const lin = (v) => (v / 255) ** 2.2; // (the mesh's colours are linear: a plain sRGB number would draw too pale)
const rgba = (hex, a = 1) => [lin((hex >> 16) & 255), lin((hex >> 8) & 255), lin(hex & 255), a];

export function createCritters({ low = false, still = false } = {}) {
  const crabs = CRABS.slice(0, low ? 2 : 3).map((c, i) => ({ ...c, hx: c.x + 0.9 + 0.4 * i, hz: c.z - 0.7, x: c.x, z: c.z, mode: 'out', gone: 0, away: 0, dir: i % 2 ? -1 : 1, ph: hash01(i, 1, 5101) * 6 }));
  const pipers = PIPERS.slice(0, low ? 1 : 2).map((p, i) => ({ ...p, z: p.z0 + (p.z1 - p.z0) * (0.35 + 0.3 * i), dir: i ? -1 : 1, fly: -1, ph: hash01(i, 2, 5101) * 6 }));
  const seals = SEALS.slice(0, low ? 1 : 2);
  const jellies = JELLIES.slice(0, low ? 1 : 3);

  function update(t, dt, cat, flat, emit, gate = 70) {
    const [rx, rz] = flat;
    const live = !still && dt > 0;
    const cx = cat?.set ? cat.x : 14; const cz = cat?.set ? cat.z : 36;
    const B = (x, y, z, S) => (u, v) => [x + rx * u * S, y + v * S, z + rz * u * S];
    // ---- crabs
    for (const c of crabs) {
      if (dist(c.x, c.z, cx, cz) > gate && c.mode === 'out') continue;
      const dc = dist(c.hx, c.hz, cx, cz);
      if (live) {
        if (c.mode === 'out') {
          if (dc < CRAB_FLEE) c.mode = 'run';
          else { const q = (t * 0.31 + c.ph) % 1; if (q < 0.3) { c.x += c.dir * 0.9 * dt; if (Math.abs(c.x - c.hx) > 1.5) { c.x = c.hx + Math.sign(c.x - c.hx) * 1.5; c.dir = -c.dir; } } }
        } else if (c.mode === 'run') {
          const dx = c.hx - c.x; const dz = c.hz - c.z; const l = Math.hypot(dx, dz);
          if (l < 0.12) { c.mode = 'gone'; c.away = 0; } else { const s = Math.min(l, 3.2 * dt); c.x += (dx / l) * s; c.z += (dz / l) * s; }
        } else if (c.mode === 'gone') {
          c.away = dc > CRAB_BACK ? c.away + dt : 0;
          if (c.away > 3) { c.mode = 'out'; c.x = c.hx; c.z = c.hz; }
        }
      }
      // the hole: a small damp-brown burrow mouth, soft at two corners (it was a near-black, 85 % opaque, half-metre wedge that read as a black triangle on the sand)
      const hole = [[c.hx - 0.16, 0.16, c.hz], [c.hx + 0.16, 0.16, c.hz - 0.06], [c.hx, 0.16, c.hz + 0.15]];
      const hc = rgba(0x4a3424, 0.6); const hs = rgba(0x6a4e36, 0.12);
      if (!emit(hole[0], hole[1], hole[2], hs, hs, hc)) return;
      if (c.mode === 'gone') continue;
      const A = B(c.x, 0.2, c.z, 1.6);
      const shell = rgba(0xd2573a); const lite = rgba(0xf08a56); const dark = rgba(0x7a2c20);
      emit(A(-0.3, 0), A(0.3, 0), A(0.2, 0.22), dark, dark, shell);
      emit(A(-0.3, 0), A(0.2, 0.22), A(-0.2, 0.22), dark, shell, lite);
      emit(A(-0.26, 0.12), A(-0.4, 0.38), A(-0.14, 0.2), shell, lite, shell);
      emit(A(0.26, 0.12), A(0.4, 0.38), A(0.14, 0.2), shell, lite, shell);
    }
    // ---- sandpipers
    pipers.forEach((b, i) => {
      if (live) {
        const dc = dist(b.x, b.z, cx, cz);
        if (b.fly < 0) {
          if (dc < PIPER_FLEE) b.fly = 0;
          else { const q = (t * 0.4 + b.ph) % 1; if (q < 0.55) { b.z += b.dir * 2.1 * dt; if (b.z > b.z1 || b.z < b.z0) { b.dir = -b.dir; b.z = Math.min(b.z1, Math.max(b.z0, b.z)); } } }
        } else { b.fly += dt / 6.5; if (b.fly >= 1) b.fly = -1; }
      }
      const f = b.fly; const u = f < 0 ? 0 : Math.sin(Math.PI * f);
      const bx = b.x + 11 * u; const by = 0.12 + 3.3 * u; const bz = b.z - 3 * u * b.dir;
      if (dist(bx, bz, cx, cz) > gate) return;
      const s = b.dir * rz >= 0 ? 1 : -1;
      const A = B(bx, by, bz, 1.2);
      const back = rgba(0x6a5848); const belly = rgba(0xb8a890); const dk = rgba(0x2a2018);
      emit(A(-0.24 * s, 0.2), A(0.04 * s, 0.3), A(0, 0.1), back, back, belly);
      emit(A(0.04 * s, 0.3), A(0.26 * s, 0.22), A(0, 0.1), back, back, belly);
      emit(A(0.26 * s, 0.22), A(0.44 * s, 0.2), A(0.26 * s, 0.17), dk, dk, dk);
      if (f >= 0) { const flap = still ? 0.2 : Math.sin(t * 26 + i) * 0.34; emit(A(0, 0.28), A(-0.1 * s, 0.34 + flap), A(0.18 * s, 0.3 + flap), back, back, dk); }
      else emit(A(-0.03, 0.1), A(0.03, 0.1), A(0, 0), dk, dk, dk);
    });
    // ---- seals' heads
    seals.forEach((sl, i) => {
      const k = still ? 1 : 0.8 + 0.2 * Math.sin(t * 0.7 + i * 2.2) - (Math.sin(t * 0.21 + i * 1.3 + 2.5) > 0.93 ? 0.9 : 0);
      if (k < 0.15 || dist(sl.x, sl.z, cx, cz) > gate + 10) return;
      const A = B(sl.x + (still ? 0 : 0.4 * Math.sin(t * 0.13 + i)), 0.1, sl.z, 2.2); const h = 0.2 + 0.35 * clamp01(k);
      const fur = rgba(0x4a4a54); const top = rgba(0x6a6a72);
      emit(A(-0.4, 0), A(0.4, 0), A(0, h), fur, fur, top);
      emit(A(-0.4, 0), A(-0.3, h * 0.7), A(0, h), fur, top, top);
      emit(A(0.4, 0), A(0, h), A(0.3, h * 0.7), fur, top, top);
    });
    // ---- the cormorant on the harbour post, wings out to dry
    if (dist(POST.x, POST.z, cx, cz) < gate) {
      const near = dist(POST.x, POST.z, cx, cz) < 3.2 && !still;
      const w = near ? 0.25 : 1; const sway = still ? 0 : 0.03 * Math.sin(t * 0.8); // (it sways with the wind)
      const A = B(POST.x, POST.y + 0.02, POST.z, 1.5);
      const bd = rgba(0x1d2b2e); const sh = rgba(0x3b5a5c); const bk = rgba(0xb6a56e);
      emit(A(-0.13, 0), A(0.13, 0), A(0.1, 0.46), bd, bd, bd);
      emit(A(-0.13, 0), A(0.1, 0.46), A(-0.1, 0.46), bd, bd, bd);
      emit(A(-0.06, 0.46), A(0.06, 0.46), A(0.01, 0.66 + sway), bd, bd, sh);
      emit(A(0.02, 0.62 + sway), A(0.18, 0.57 + sway), A(0.02, 0.55 + sway), bk, bk, bk);
      emit(A(-0.08, 0.42), A(-0.72 * w, 0.52 + sway * 2), A(-0.58 * w, 0.14 + 0.25 * (1 - w)), sh, bd, bd);
      emit(A(0.08, 0.42), A(0.72 * w, 0.52 + sway * 2), A(0.58 * w, 0.14 + 0.25 * (1 - w)), sh, bd, bd);
    }
    // ---- jellyfish in the pools
    jellies.forEach((j, i) => {
      const a = still ? i * 2 : t * 0.22 + i * 2.1;
      const x = j.x + Math.cos(a) * j.r * 0.5; const z = j.z + Math.sin(a * 1.3) * j.r * 0.5;
      if (dist(x, z, cx, cz) > gate) return;
      const pulse = still ? 1 : 0.85 + 0.2 * Math.sin(t * 2.3 + i * 1.7);
      const A = B(x, 0.16, z, 1.5);
      const dome = rgba(0xe6c4ff, 0.7); const rim = rgba(0xb89ae8, 0.55); const tent = rgba(0xcfa8ff, 0);
      emit(A(-0.26 * pulse, 0), A(0.26 * pulse, 0), A(0, 0.3 / pulse), rim, rim, dome);
      emit(A(-0.26 * pulse, 0), A(0, 0.3 / pulse), A(-0.1, 0.12), rim, dome, rim);
      emit(A(-0.12, 0), A(0.12, 0), A(0.03 * Math.sin(t + i), -0.4), rim, rim, tent);
    });
  }
  return { update, crabs, pipers };
}

// the tower door's warm glow: 0..1 by how near she is (she is walking up to a lit door)
export function doorGlow(cat) {
  if (!cat?.set) return 0;
  return clamp01((15 - Math.hypot(cat.x - DOOR.x, cat.z - DOOR.z)) / 9);
}
