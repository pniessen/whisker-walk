// =============================================================================
// SNOWVILLE WING B: THE PLAN (milestone V5). Where the frozen pond and its ice, the pond-side stump with the second candle, the Pond lantern, the sled hill's summit rock with the
// third candle, the Hill lantern, the hill rock (the one hop for the third golden mouse), the village hearth, the Great Fir with its bulbs, the hare's burrow, the lane's strings of
// lights and the cottages' glowing windows are. Pure data and pure functions (no THREE, no clock, no Math.random). North is -z. Stage chunk code (snowvillestageb.js); start-up never
// imports it. docs/superpowers/plans/2026-11-27-new-areas-snowville-treehouse-jungle.md 1.3, 1.4, 1.6, 1.14. Numbers marked "start" are tuned from pictures.
// =============================================================================

import { POND, HILL, HEARTH, LAMPS, COTTAGES, SQUARE_FIR, snowY } from './snowvilleplan.js';

const r2 = (v) => Math.round(v * 100) / 100;
const f = (o) => Object.freeze(o);

// ---- the pond ------------------------------------------------------------------------------------------------------------------------------
export const ICE = f({ x: POND.x, z: POND.z, r: 7.4, y: 0.05 }); // the frozen pond is flat (the ground is flat inside 9 m of its middle)
export const SKATE_RINGS = Object.freeze([3.2, 4.6, 6.0]); // the otters' own rings (src/world/snowvillecritters.js OTTER): the skate marks on the ice
export const STUMP = f({ x: -27.5, z: -7.5, r: 0.5, h: 0.75 }); // the pond-side stump candle two stands on
export const POND_LANTERN = f({ id: 1, x: -18.5, z: -3.5, reach: 3.2, h: 2.3 }); // by the skating otters

// ---- the sled hill -------------------------------------------------------------------------------------------------------------------------
export const SUMMIT = f({ x: HILL.x, z: HILL.z, r: 0.85, h: 0.9 }); // the summit rock: candle three stands on it (picked from the ground beside it; hopping up is optional)
export const HILL_LANTERN = f({ id: 2, x: 21, z: -7, reach: 3.2, h: 2.3 }); // at the foot of the sled path (the Hill Lantern find's own zone, snowvillefindsplan.js)
export const HILL_ROCK = f({ x: 26, z: -26, r: 0.55, h: 1.0 }); // the sled hill's rock: ONE hop (1.0 m) up from the ground to the third golden mouse (src/goldmice.js)
export const SLED_PATH = Object.freeze([[22, -16.5], [21.6, -13], [21.2, -10], [20.6, -6.5]].map((p) => f({ x: p[0], z: p[1] }))); // the sled path's middle line, summit to foot

// ---- the three candles and their lanterns (the first is snowvillestory.js's) --------------------------------------------------------------------
export const CANDLES_B = Object.freeze([
  f({ id: 1, x: STUMP.x, z: STUMP.z, up: STUMP.h, reach: 2.2 }),
  f({ id: 2, x: SUMMIT.x, z: SUMMIT.z, up: SUMMIT.h, reach: 2.4 }),
]);
export const LANTERNS_B = Object.freeze([POND_LANTERN, HILL_LANTERN]);

// ---- the village hearth, the great fir and the burrow ---------------------------------------------------------------------------------------
export { HEARTH };
export const HEARTH_WARM = 2.7; // she is "by the hearth" within this (the warm spot itself is 3.2)
export const GREAT_FIR = f({ x: 8, z: -31.7, s: 2.1, tiers: 6, h: 9.45, r: 1.0 }); // the tallest tree in the valley (the Great Fir's find zone, centred at (8, -30), is at its foot: the trunk stands 1.7 m behind that middle)
export const BURROW = f({ x: -8.6, z: -26.4 }); // the hare's mound in the fir wood (the shy hare peeks beside it)

// ---- what she can stand at -----------------------------------------------------------------------------------------------------------------
// The two places the meow's ring goes to after the candles: the hearth, and the village fir where Lantern Night begins.
export const FIR_PROMPT = 4.4; // she may begin Lantern Night this near the village fir
export const SPOTS = f({ warm: f({ x: HEARTH.x, z: HEARTH.z, up: 0.4 }), glow: f({ x: SQUARE_FIR.x + 1.6, z: SQUARE_FIR.z + 1.6, up: 0 }) });

export const wingColliders = () => [
  f({ x: STUMP.x, z: STUMP.z, r: STUMP.r }),
  f({ x: POND_LANTERN.x, z: POND_LANTERN.z, r: 0.3 }), f({ x: HILL_LANTERN.x, z: HILL_LANTERN.z, r: 0.3 }),
  f({ x: SUMMIT.x, z: SUMMIT.z, r: SUMMIT.r }),
  f({ x: r2(HILL_ROCK.x - 0.5), z: HILL_ROCK.z, r: HILL_ROCK.r }), f({ x: r2(HILL_ROCK.x + 0.5), z: HILL_ROCK.z, r: HILL_ROCK.r }),
  f({ x: HEARTH.x, z: HEARTH.z, r: 0.95 }),
  f({ x: GREAT_FIR.x, z: GREAT_FIR.z, r: GREAT_FIR.r }),
];
// The hops: the summit rock and the hill rock (kind 'stone': no skill; a hop of 1.0 m or less each, from the snow beside it).
export const wingPerches = () => [
  { x: SUMMIT.x, z: SUMMIT.z, y: r2(snowY(SUMMIT.x, SUMMIT.z) + SUMMIT.h), kind: 'stone' },
  { x: HILL_ROCK.x, z: HILL_ROCK.z, y: r2(snowY(HILL_ROCK.x, HILL_ROCK.z) + HILL_ROCK.h), kind: 'stone' },
];

// The story's table for the base's Tilly (snowvillestory.js allCandles / allLanterns, and her goal spots).
export const wingStory = () => ({ candles: CANDLES_B, lanterns: LANTERNS_B, spots: SPOTS });

// ---- the cottages' windows (Lantern Night lights them in turn), the lane's strings, the great fir's bulbs ------------------------------------------
// Each cottage's glow stands just outside its door (its local +z), turned and placed like cottageParts in snowvilleparts.js.
export const WINDOWS = Object.freeze(COTTAGES.map((c) => {
  const lz = c.d / 2 + 0.5;
  return f({ id: c.id, x: r2(c.x + Math.sin(c.yaw) * lz), z: r2(c.z + Math.cos(c.yaw) * lz), y: r2(snowY(c.x, c.z) + c.h * 0.55), size: r2(2.4 + c.w * 0.18) });
}));

const POLE_TOP = 2.75; // a lamp post's globe (snowvilleparts.js drawSquare)
// The strings: two runs of lights hung from lamp to lamp (the court's post up the lane to the square's, and a branch to the west post), one bulb about every 0.9 m with a soft sag.
export const STRING_RUNS = Object.freeze([[6, 0, 1, 2, 3, 5], [2, 4]]);
export function lightStrings(step = 0.9) {
  const out = [];
  for (const run of STRING_RUNS) {
    for (let i = 0; i + 1 < run.length; i++) {
      const a = LAMPS[run[i]]; const b = LAMPS[run[i + 1]];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(2, Math.round(len / step));
      for (let k = (i === 0 ? 0 : 1); k <= n; k++) {
        const t = k / n;
        const x = a.x + (b.x - a.x) * t; const z = a.z + (b.z - a.z) * t;
        out.push({ x: r2(x), z: r2(z), y: r2(snowY(x, z) + POLE_TOP + 0.1 - 0.4 * Math.sin(Math.PI * t)) });
      }
    }
  }
  return out;
}

// The Great Fir's bulbs: a spiral up its tiers (n of them), from the lowest branch to just under the star. Pure.
export function firBulbs(n) {
  const out = [];
  const G = GREAT_FIR;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n; // 0 low, 1 high
    const a = i * 2.399963;
    const rad = (1.55 - 1.1 * (0.1 + 0.8 * u)) * G.s * 0.82;
    out.push({ x: r2(G.x + Math.cos(a) * rad), z: r2(G.z + Math.sin(a) * rad), y: r2(snowY(G.x, G.z) + G.h * (0.2 + 0.68 * u)) });
  }
  return out;
}
export const FIR_STAR = f({ x: GREAT_FIR.x, z: GREAT_FIR.z, y: r2(snowY(GREAT_FIR.x, GREAT_FIR.z) + GREAT_FIR.h + 0.2) });
