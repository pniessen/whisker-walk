// =============================================================================
// THE MOON: DECOR, THE BASE PROPS (the enrichment plan's layer 3), as pure data. Antennas and dishes, solar arrays, crates and cargo pods, flags and beacons, lamp
// posts, signs, tool racks, oxygen tanks, two old wrecks and a garden dome's silhouette, in clumps by the buildings; the cable runs and the footprints that lead between
// them. No THREE, no canvas, no clock, no Math.random: each list is hand-placed and a prop that would land on anything a child plays with is nudged out to the nearest
// clear spot (or dropped), so every list is the same every walk. moondecorparts.js draws a list into the Moon's own kit buckets (no draw call of its own);
// each stage chunk brings the rows of its own area (the base's in moondecorbase.js, which the rover stage imports; moondecorparts.js, which draws any list.
// Items: { k (kind), x, z, yaw, c (colour pick), x2, z2 (a cable's or trail's far end) }.
// =============================================================================

import { mulberry32 } from '../rng.js';
import { MOON_BOUNDS as B, AIRLOCK, CRATERS, FLAG, OLD_DISH, PAD, QUIET_PLAIN, RETURN_GATE, STAR_HILL } from './moonplan.js';
import { clear } from './moonbeautyplan.js';

const hyp = Math.hypot;

// The radius each kind keeps clear (m): a standing kind keeps half the plan's keep-outs clear (they are sized for rocks), a flat one a quarter.
export const DECOR_R = Object.freeze({ antenna: 0.5, dish: 0.8, solar: 1.7, crate: 0.55, pod: 1.0, flag: 0.3, beacon: 0.3, lamp: 0.4, sign: 0.5, wreck: 1.8, garden: 1.9, rack: 0.9, tank: 0.8, cable: 0.12, trail: 0.12 });
const FLAT = new Set(['cable', 'trail']);

// Places the plan's own colliders do not cover: the airlock's footprint, the Quiet Plain (a margin round it), the flag's and the Old Dish's find zones, Star Hill's foot and
// ramp, the pad's disc and the craters' bowls.
export function decorFits(x, z, r, flat = false) {
  if (x < B.minX + 1.5 + r || x > B.maxX - 1.5 - r || z < B.minZ + 1.5 + r || z > B.maxZ - 1.5 - r) return false; // inside the walk's bounds, with a margin
  const A = AIRLOCK;
  if (x > A.x0 - 1.4 - r && x < A.x1 + 1.4 + r && Math.abs(z - A.z) < A.half + 1.6 + r) return false;
  const Q = QUIET_PLAIN;
  if (x > Q.x0 - 2.5 - r && x < Q.x1 + 2.5 + r && z > Q.z0 - 2.5 - r && z < Q.z1 + 2.5 + r) return false;
  if (hyp(x - FLAG.x, z - FLAG.z) < 2.6 + r) return false;
  if (hyp(x - OLD_DISH.x, z - OLD_DISH.z) < 3.4 + r) return false;
  if (hyp(x - STAR_HILL.x, z - STAR_HILL.z) < 9.8 + r) return false;
  if (hyp(x - PAD.x, z - PAD.z) < PAD.r + 0.6 + r) return false;
  if (hyp(x - RETURN_GATE.x, z - RETURN_GATE.z) < RETURN_GATE.r + 1 + r) return false;
  for (const k of CRATERS) if (hyp(x - k.x, z - k.z) < k.r * 1.1 + r) return false;
  return clear(x, z, r, flat ? 0.15 : 0.5, flat ? 0.25 : 0.5);
}

// Nudge (x, z) out to the nearest spot that fits, on a deterministic ring search (up to `reach` m); null when nothing does.
export function nudge(x, z, r, flat = false, reach = 3.2) {
  if (decorFits(x, z, r, flat)) return { x, z };
  for (let d = 0.6; d <= reach; d += 0.6) {
    const n = Math.round(d * 7);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + d;
      const px = x + Math.cos(a) * d;
      const pz = z + Math.sin(a) * d;
      if (decorFits(px, pz, r, flat)) return { x: px, z: pz };
    }
  }
  return null;
}

// One hand-placed list: rows [kind, x, z, yaw (radians), colour pick] and path rows ['trail' | 'cable', x, z, x2, z2]. Standing props are nudged clear or dropped (and kept
// 0.9 m apart); a path is walked in steps and a step that would land on anything is skipped. `lite` keeps about half (every other standing row, every second step).
export function placeDecor(rows, seed, lite = false) {
  const rng = mulberry32(seed);
  const out = [];
  rows.forEach((row, i) => {
    const [k, x, z] = row;
    if (k === 'trail' || k === 'cable') {
      const x2 = row[3];
      const z2 = row[4];
      const len = hyp(x2 - x, z2 - z);
      const yaw = Math.atan2(x2 - x, z2 - z);
      const step = k === 'trail' ? 0.95 * (lite ? 2 : 1) : 1.6;
      const n = Math.max(1, Math.round(len / step));
      for (let s = 0; s < n; s++) {
        const t = (s + 0.5) / n;
        const wob = (rng() - 0.5) * (k === 'trail' ? 0.35 : 0.5); // a wander, so a run of prints or a cable is not a ruled line
        const px = x + (x2 - x) * t + Math.cos(yaw) * wob;
        const pz = z + (z2 - z) * t - Math.sin(yaw) * wob;
        if (!decorFits(px, pz, DECOR_R[k], true)) continue;
        out.push({ k, x: px, z: pz, yaw: yaw + (rng() - 0.5) * 0.3, c: s % 2, len: (k === 'cable' ? step * 1.02 : 0) });
      }
      return;
    }
    if (lite && i % 2) return;
    const p = nudge(x, z, DECOR_R[k], FLAT.has(k));
    if (!p) return;
    if (out.some((o) => !FLAT.has(o.k) && hyp(o.x - p.x, o.z - p.z) < 0.9 + (DECOR_R[o.k] + DECOR_R[k]) * 0.4)) return;
    out.push({ k, x: p.x, z: p.z, yaw: row[3] ?? 0, c: row[4] ?? 0 });
  });
  return out;
}


// The Moon's decor lists, by group (the lists are data the stages bring: ST.decorRows.<group>, moondecorbase.js (with the rover stage), moonstagehill.js, moonstagelaunch.js, moonstagerover.js),
// placed with a seed of their own: [] if the stage has not loaded.
export const DECOR_SEEDS = Object.freeze({ base: 0x6d6f6f6e + 31, hill: 0x6d6f6f6e + 32, launch: 0x6d6f6f6e + 33, rover: 0x6d6f6f6e + 34 });
export const decorList = (group, rows = [], lite = false) => placeDecor(rows, DECOR_SEEDS[group], lite);
