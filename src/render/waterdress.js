import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';
import { waterGap, waterClearance, deckDistance } from '../world/builder.js';
import { bankPieces, waterRamp, WATER_EVENING } from './water.js';
import { fishSpots } from './fishjump.js';

// ---------------------------------------------------------------------------
// WATER DRESSING — the edge where the water meets the land (polish-water
// Task 3). Without it every bank is a knife-straight line of grass meeting
// water, and the bogs wear a pale rim. With it, a soft band of darker wet
// earth hugs the water, its lip wobbles a little out over the water and hides
// the ruler-straight edge, a thin soft foam line rides just off that lip, and
// a few half-sunk stones sit on the bank.
//
// THE BUDGET. At most three meshes, one per material, created by walk.js AFTER
// the caster sweep, the contact-shadow scan and the prop merge, so none of
// them sees it: castShadow false (no shadow-pass draw); the band and stones receive shadows.
//   - the band: wet earth + foam line, ONE transparent mesh (vertex colour
//     with alpha, depthWrite off, polygon offset);
//   - the stones: one opaque merged mesh (none on the LOW tier);
//   - the fill (`waterdress:fill`): one opaque mesh drawn with the area
//     ground's own material — the fillet fans that round a stream bend
//     (polish-waterlife, BANK_FILLETS) and the streams' bites (polish-streams,
//     see BITES below). The third mesh of every area with a stream, as none
//     of them has a sea apron;
//   - reeds / lily pads: only round the Park's duck pond (POND_PLANTS), and
//     merged into the stones mesh, so they cost no draw of their own. The
//     Woods, Moor, River and Pines all plant their own reed beds along their
//     banks, and the Pines bogs already float lily pads (pines.js
//     pinesLilyPads), so a second set there would only double them up.
//
// REAL SHORE ONLY. Where two footprints overlap (a pond over a river, a river
// mouth over a lake) the outline running under the other water is open water,
// not a bank: bankPieces (water.js) hands back only the real stretches. A
// stretch more than HORIZON_M outside the walkable bounds is horizon, not
// bank, and is skipped.
//
// STYLES. A water handle's `style` picks the builder: 'clear' and 'bog' share
// the generic band (bogs get a dull green-brown foam, never white). Each run
// carries its own cross-section (`ctx.rows` rows from `ctx.profile`), so a
// style with its own look draws into the same one mesh:
//   - 'sea' (the Seaside, Task 4): no bank and no stones on a sandy beach —
//     a wavy white foam strip lying on the wet sand where the little waves
//     run up, washing slowly in and out; and a far-sea APRON, one flat
//     deep-sea plane under the fog that carries the water on past the sea
//     slab's own ends (z +-70, x 105), so the straight shore never stops in a
//     visible corner far down the beach. The apron is the third mesh slot.
//
// PURELY LOCAL AND SEEDED. Nothing here draws on Math.random (beyond three's
// own uuids), walkRng or the stray stream: each water seeds its own wobble
// and stones from `waterdress-<area>-<water id>`.
// ---------------------------------------------------------------------------

export const DRESSED_AREAS = Object.freeze(['woods', 'river', 'moor', 'pines', 'seaside', 'park']);

// How far outside the area's walkable bounds a bank is still drawn. Past it
// the edge is the far horizon (the lake's west shore, the river's far reach).
const HORIZON_M = 10;
// Sample spacing along a bank, metres. The wobble's shortest wave is 1.3 m,
// so 0.7 m keeps it a curve rather than a zig-zag.
const STEP = 0.7;
// Heights: the lip rides just over the water, the land side just over the
// ground — under the paw prints (0.012 is theirs too, but they draw after:
// see RENDER_ORDER), the contact shadows (0.015) and the puddles (0.02).
const LIP_LIFT = 0.004;
const LAND_Y = 0.012;
// Drawn before the paw prints (-2) and the contact shadows (-1): the band is
// the ground's own colour, the bottom-most transparent layer.
const RENDER_ORDER = -3;
// The foam's slow breathe: opacity between BREATHE_LO and 1, one breath every
// BREATHE_S seconds. Static (at BREATHE_STILL) under reduced motion.
const BREATHE_S = 7;
const BREATHE_LO = 0.7;
const BREATHE_STILL = 0.85;

// The band's cross-section, from the water outwards. `o` is the offset from
// the shore line along the land normal, metres (negative is over the water);
// `lip` rows ride the wobble. Alpha fades to 0 at both ends so there is no
// edge anywhere to read as an outline.
const BAND_ALPHA = { lip: 0.7, shoulder: 0.55 };
const FOAM_ALPHA = 0.5;

// Per-area wet earth: a darker, browner, slightly olive take on that area's
// grass, so the band reads as damp ground and not as paint. `wet` is the
// lip's colour, `damp` the outer edge's (where alpha has faded to 0, so it
// only steers the gradient).
const BANK_COLORS = Object.freeze({
  woods: { wet: 0x5b4e2c, damp: 0x66703a },
  river: { wet: 0x5b4e2c, damp: 0x66703a },
  moor: { wet: 0x5a4c2e, damp: 0x6a6a3c },
  pines: { wet: 0x4a4229, damp: 0x58603a },
  // A wetter, darker sand. Task 4 gives the sea its own builder.
  seaside: { wet: 0x8c7650, damp: 0xa89470 },
  // The Park's lawn is a brighter, greener grass than the wild areas'.
  park: { wet: 0x5a5a30, damp: 0x5f8c42 },
});
// A bog is already dark and sits in dark ground, so its ring is drawn a
// little fainter (`alpha` scales the band's strength): a full-strength ring
// round a small dark pool reads as a drawn outline.
const BOG_COLORS = Object.freeze({ wet: 0x3a3622, damp: 0x4c5528, alpha: 0.75 });
const FOAM_COLORS = Object.freeze({ clear: 0xeef4ef, bog: 0x5b5a3a });

// The sea's foam strip ('sea' style). The waterline is where the foam's lace
// edge lies on the sand: SEA_LIP metres up the beach from the slab's edge on
// average, wandering +-(0.28 + 0.14) m on two sines (13 m and 4.6 m), so the
// line reads as little waves and not as a ruler. It runs SEA_REACH metres
// past both ends of the walkable beach and fades out over SEA_FADE at each
// end. The whole strip washes SEA_SWASH metres up and back every SEA_SWASH_S
// seconds, a little staggered along the beach (one stagger every
// SEA_STAGGER metres); held still under reduced motion.
const SEA_REACH = 30;
const SEA_FADE = 8;
const SEA_STEP = 0.5;
const SEA_LIP = 0.5;
const SEA_LIP_AMP = [0.28, 0.14];
const SEA_LIP_WAVES = [13, 4.6];
const SEA_SWASH = 0.22;
const SEA_SWASH_S = 6.5;
const SEA_STAGGER = 23;
const SEA_FOAM = 0xf3f7f5;
// Polish-waterlife — the foam in the evening (createWaterDressing's `evening`:
// null | 'sunset' | 'dusk'). At sunset the foam warms to the sky's peach; at
// dusk it goes a quiet blue-grey and fainter, because the day's near-white
// foam glows against a dark island. `a` scales the foam rows' alpha only
// (so the breathe's low end shrinks with it). Bog foam and the wet-earth
// bank colours are unchanged: the lawn light already darkens those.
const EVENING_FOAM = Object.freeze({
  sunset: Object.freeze({ clear: 0xf4dcc6, sea: 0xf6dcc4, clearA: 1, seaA: 1 }),
  dusk: Object.freeze({ clear: 0x7d8a94, sea: 0xa4b0bc, clearA: 0.55, seaA: 0.75 }),
});
// Never more than this far out over the water (the band-follows-real-shore
// rule is 1 m).
const SEA_OUT_MAX = 0.95;
// The apron: how far past the slab it reaches (the fog is solid by 130 m and
// the camera's far plane is 300), how far it tucks under the slab's open
// edges, and how far under the sea's surface it lies. Opaque, unlit by
// shadows, just under the sea so the sea always wins where both are.
const APRON_M = 240;
const APRON_TUCK = 0.5;
const APRON_DROP = 0.015;
const APRON_ROUGHNESS = 0.3;

// Stones: low-poly, grey-brown, about one every STONE_EVERY metres of bank.
const STONE_EVERY = 4;
const STONE_KEEP_GAP = 0.5;
const STONE_COLORS = [0x8a8378, 0x7a7266, 0x958c7e, 0x6f6a60];

// Polish-waterlife — rounded bank corners (fillets). Where two rect streams
// meet in an L, the outer corner of the bend is a hard square "swimming-pool"
// corner. A fillet rounds it, for the eye only: the footprints stay square
// (they are the colliders and the wade zones). `x, z` is the square corner,
// `r` the arc's radius, `wx, wz` point from the corner into the water, so the
// arc's centre is (x + wx*r, z + wz*r). Two things change there:
//   - the band: every bank sample on the corner's two edges within `r` of it
//     moves onto the arc (its parameter along the edge, 0 at the arc's tangent
//     point and 1 at the corner, maps to 0..45 degrees from that edge's
//     tangent point, so both edges' samples meet on the diagonal); its normal
//     becomes the radial direction; its arc length `s` is kept;
//   - the fill: the sliver of water between the arc and the square corner is
//     covered by a small fan drawn with the area ground's own material and
//     the ground's own uv / normal / colour, sampled from its grid.
// With no ground plane to borrow (or one that is not a PlaneGeometry) there is
// no fill and no bending, so the band never rounds a corner it can't cover.
// The Woods: river-west (x <= 23, z -14..-9) turns north into river-north
// (x 18..23, z <= -9); the bend's outer corner is (23, -9).
export const BANK_FILLETS = Object.freeze({
  woods: Object.freeze([Object.freeze({ x: 23, z: -9, r: 1.6, wx: -1, wz: -1 })]),
});
// Polish-streams — the wandering bank (BITES). A stream is a rect footprint
// with ruler-straight edges, and the footprint is gameplay (the collider, the
// wade zone), so it stays. For the eye only, an opaque strip drawn with the
// ground's own material is laid over the outer bankBite() metres of the water
// (0.15..0.85 on a stream, 0.10..0.60 round a pond in BITE_CIRCLES), so the
// visible shore wanders; the band then follows the bitten line. The bite
// tapers to nothing at a chain's open ends (where the stream runs into
// another water: no step at the junction), within 1 m of a deck (the path
// still meets the stepping stones or the log) and round a fillet's corner
// (the fan rounds that one). With no ground plane to borrow there is no bite,
// and the band is the old band exactly.
export const BITE_CIRCLES = Object.freeze({ park: Object.freeze(['pond']) });
export const BITE_MAX = 0.85;
const STREAM_MAX_W = 6;
// The bite's own long waves (the wobble's are 4.7 / 2.3 / 1.3 m).
const BITE_WAVES = [17, 9.5, 5.3];
// Tapers: at an open end over BITE_END m (after BITE_END_DEAD m of nothing);
// 0 within BITE_DECK of a deck, full BITE_DECK_RAMP further on; 0 within 2r
// of a fillet corner, full BITE_FILLET_RAMP further on.
const BITE_END_DEAD = 0.2;
const BITE_END = 2;
const BITE_DECK = 1;
const BITE_DECK_RAMP = 1.5;
const BITE_FILLET_RAMP = 1.5;
// The strip tucks this far under the land's edge (scaled down where the bite
// tapers away, so nothing covers a path's end by a deck); a run whose
// deepest bite is under BITE_MIN draws no strip.
const BITE_TUCK = 0.08;
const BITE_TUCK_FULL = 0.15;
const BITE_MIN = 0.02;
// The ground's colour for a bite is sampled this far onto the land (the
// ground under the water may be painted as stream bed).
const BITE_COLOR_AT = 0.6;
// A bitten stream's foam line is a line of wet mud, at every time of day.
const MUD_FOAM = 0x4a4330;
const MUD_FOAM_A = 0.6;

// Polish-streams — riffles. A few small stones mid-stream, just breaking the
// surface, each trailing one or two short pale streaks of foam on the water
// (band runs with riffleProfile), so a stream reads as moving water. Only on
// a bitten stream (so only with a ground plane, like the bites: with none the
// band stays the old band) and not on the LOW tier. Seeded per stream from
// `waterdress-<area>-<water id>-riffle`. Along the centreline one stop every
// RIFFLE_EVERY + RIFFLE_EVERY_JIT * rng() metres, 1-3 stones per stop. A stone
// is kept only RIFFLE_CLEAR beyond the deepest bite into the water, and
// RIFFLE_DECK from a deck (stepping stones read as their own row).
const RIFFLE_START = 3;
const RIFFLE_EVERY = 6;
const RIFFLE_EVERY_JIT = 4;
const RIFFLE_LATERAL = 1.6;
const RIFFLE_ALONG = 0.8;
const RIFFLE_R = [0.12, 0.14];
const RIFFLE_SINK = 0.25;
const RIFFLE_CLEAR = 0.3;
const RIFFLE_DECK = 2.5;
const STREAK_LEN = [0.5, 0.4];
const STREAK_HALF_W = [0.04, 0.02];
const STREAK_ALPHA = 0.45;

// Polish-streams — the Park's duck pond plants: a few clumps of reeds (some
// with a brown cattail) on two arcs of the south shore, and a little raft of
// round lily pads (a notch cut out of each, two with a pink flower) out on
// the water on that side. The arcs are degrees of atan2(z - centre z,
// x - centre x): the north shore (the `pond-shore` scenic and its POI) and
// the duck parade's way out to the north-east stay open. Seeded from
// `waterdress-<area>-<water id>-reeds` / `-lilies`; not on the LOW tier.
const POND_PLANTS = Object.freeze({
  park: Object.freeze({
    pond: Object.freeze({ reedArcs: [[200, 250], [290, 340]], lilyAt: 270 }),
  }),
});
// Reed clumps: one every REED_EVERY + REED_EVERY_JIT * rng() metres of rim,
// REED_OUT + REED_OUT_JIT * rng() onto the land from the visual waterline.
const REED_EVERY = 0.9;
const REED_EVERY_JIT = 0.5;
const REED_OUT = 0.05;
const REED_OUT_JIT = 0.3;
const REED_COLORS = [0x6f8a3c, 0x7f9a46, 0x5d7a34];
const CATTAIL_COLOR = 0x6b4a2a;
const CATTAIL_R = 0.05;
const CATTAIL_H = 0.18;
// Lily pads: LILY_COUNT tries for a pad round `lilyAt` (+-LILY_SPREAD
// degrees), LILY_IN +- LILY_IN_JIT metres in from the shore, out of at most
// LILY_TRIES candidates; a pad keeps 1 m off every fish spot and off its
// neighbours.
const LILY_COUNT = 7;
const LILY_TRIES = 40;
const LILY_SPREAD = 35;
const LILY_IN = 2.0;
const LILY_IN_JIT = 0.6;
const LILY_R = [0.28, 0.14];
const LILY_SEGS = 10;
const LILY_LIFT = 0.006;
const LILY_COLORS = [0x4f8a3a, 0x5c9a44];
const LILY_FLOWERS = 2;
const FLOWER_COLOR = 0xf2b6c8;
const FLOWER_H = 0.08;
const FLOWER_R = 0.06;

// Arc segments in a fill fan (one triangle each).
const FILLET_SEGS = 12;
// Opaque, so it is drawn in the opaque pass: after the water (renderOrder 0),
// and so always before the band (transparent, drawn after every opaque mesh).
const FILLET_ORDER = 1;

// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const phaseCache = new Map();
function phases(seed) {
  let p = phaseCache.get(seed);
  if (!p) {
    const r = mulberry32(seed >>> 0);
    p = [r() * TAU, r() * TAU, r() * TAU];
    phaseCache.set(seed, p);
  }
  return p;
}

// Three sines, weights summing to 1, so the result is in -1..1. With a
// `period` each wavelength is snapped to fit it a whole number of times, so a
// closed ring (a bog) meets itself without a step.
const WAVES = [4.7, 2.3, 1.3];
const WEIGHTS = [0.55, 0.3, 0.15];
function smoothNoise(seed, s, period, waves = WAVES) {
  const p = phases(seed);
  let v = 0;
  for (let i = 0; i < 3; i++) {
    let k = TAU / waves[i];
    if (period > 0) k = (TAU * Math.max(1, Math.round(period / waves[i]))) / period;
    v += WEIGHTS[i] * Math.sin(k * s + p[i]);
  }
  return v;
}

/**
 * bankWobble(seed, s[, period]) — how far the bank's lip sits from the true
 * shore line at `s` metres along it: -0.3 (out over the water) to +0.1 (just
 * onto the land), smooth along `s`. Mostly over the water, so the straight
 * edge underneath is hidden.
 */
export function bankWobble(seed, s, period = 0) {
  return -0.1 + 0.2 * smoothNoise(seed, s, period);
}

/**
 * bankBite(seed, s[, period[, kind]]) — how far the visual shore moves into
 * the water at `s` metres along a bank, before tapering: 'stream' 0.15..0.85,
 * 'pond' 0.10..0.60, smooth along `s` (snapped to `period` on a ring).
 */
export function bankBite(seed, s, period = 0, kind = 'stream') {
  const n = smoothNoise(seed, s, period, BITE_WAVES);
  return kind === 'pond' ? 0.35 + 0.25 * n : 0.5 + 0.35 * n;
}

/** isStream(h) — a narrow rect water (min side <= 6 m), not the sea or a bog. */
export function isStream(h) {
  if (!h || h.style === 'sea' || h.style === 'bog') return false;
  const w = h.footprint;
  return w?.kind === 'rect' && Math.min(w.maxX - w.minX, w.maxZ - w.minZ) <= STREAM_MAX_W;
}

// The bite a water gets in this area: 'stream', 'pond' or null.
function biteKind(areaId, h) {
  if (isStream(h)) return 'stream';
  const w = h.footprint;
  if (h.style !== 'sea' && h.style !== 'bog' && w?.kind === 'circle' && BITE_CIRCLES[areaId]?.includes(w.id)) return 'pond';
  return null;
}

// The band's reach onto the land, 0.9..1.4 m, on its own slow wobble.
function bankWidth(seed, s, period) {
  return 1.15 + 0.25 * smoothNoise(seed + 1, s, period);
}

const NO_DRESSING = Object.freeze({ meshes: Object.freeze([]), update() {}, dispose() {} });

// --- shore chains ------------------------------------------------------------

// Join a water's pieces end to end into polylines (shorePieces and bankPieces
// hand them over in outline order); a chain whose end meets its start is a
// ring.
function chains(pieces) {
  const out = [];
  let cur = null;
  const near = (ax, az, bx, bz) => Math.abs(ax - bx) < 1e-6 && Math.abs(az - bz) < 1e-6;
  for (const p of pieces) {
    if (cur) {
      const last = cur.pts[cur.pts.length - 1];
      if (near(last.x, last.z, p.ax, p.az)) { cur.pts.push({ x: p.bx, z: p.bz }); continue; }
    }
    cur = { pts: [{ x: p.ax, z: p.az }, { x: p.bx, z: p.bz }], closed: false };
    out.push(cur);
  }
  // the outline walk can start mid-run: a last chain that ends where the
  // first begins is one run
  if (out.length > 1) {
    const a = out[0], z = out[out.length - 1];
    const za = z.pts[z.pts.length - 1];
    if (near(za.x, za.z, a.pts[0].x, a.pts[0].z)) {
      a.pts = [...z.pts.slice(0, -1), ...a.pts];
      out.pop();
    }
  }
  for (const c of out) {
    const f = c.pts[0], l = c.pts[c.pts.length - 1];
    if (c.pts.length > 2 && near(f.x, f.z, l.x, l.z)) { c.closed = true; c.pts.pop(); }
  }
  return out;
}

// Samples along a chain: every vertex, plus extra ones so no gap exceeds
// STEP. Each carries its arc length `s` and the unit normal pointing onto the
// land (`nx`, `nz`).
function sampleChain(chain, w) {
  const { pts, closed } = chain;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const raw = [];
  let s = 0;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const k = Math.max(1, Math.ceil(len / STEP));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      raw.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s: s + len * t });
    }
    s += len;
  }
  if (!closed) raw.push({ x: pts[n - 1].x, z: pts[n - 1].z, s });
  const m = raw.length;
  for (let i = 0; i < m; i++) {
    const prev = raw[closed ? (i - 1 + m) % m : Math.max(0, i - 1)];
    const next = raw[closed ? (i + 1) % m : Math.min(m - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    let nx = -tz, nz = tx;
    // which side is land: probe a few centimetres out
    if (waterGap(w, raw[i].x + nx * 0.05, raw[i].z + nz * 0.05) < 0) { nx = -nx; nz = -nz; }
    raw[i].nx = nx; raw[i].nz = nz;
  }
  return { samples: raw, closed, length: s };
}

// Split a sample run where it leaves the box (bounds + HORIZON_M).
function clipRuns(sampled, box) {
  const inside = (p) => p.x >= box.minX && p.x <= box.maxX && p.z >= box.minZ && p.z <= box.maxZ;
  const all = sampled.samples.every(inside);
  if (all) return [{ samples: sampled.samples, closed: sampled.closed }];
  const runs = [];
  let cur = [];
  for (const p of sampled.samples) {
    if (inside(p)) cur.push(p);
    else { if (cur.length > 1) runs.push({ samples: cur, closed: false }); cur = []; }
  }
  if (cur.length > 1) runs.push({ samples: cur, closed: false });
  return runs;
}

// --- the band ----------------------------------------------------------------

// The generic bank's cross-section: six rows per sample. The foam line shares
// the band's strip (its two rows are the strip's water edge), which is a sixth
// fewer triangles than a strip of its own and no seam between them.
const PER = 6;

function bankProfile(p, ctx) {
  const { seed, period, waterY, colors, undecked } = ctx;
  const strength = colors.alpha ?? 1;
  const wob = bankWobble(seed, p.s, period);
  const width = bankWidth(seed, p.s, period);
  const onLand = Math.max(wob, 0) + 0.05;
  // land-side offsets, pulled back where they would reach into another
  // water (a pond's bank ending at the river it runs into)
  // (a fillet's fill is land to the eye, though the footprint says water)
  // (and a bite's strip is land to the eye: never wet over it)
  const fillets = ctx.fillets;
  const bite = p.bite ?? 0;
  const wet = (k, x, z) => k >= bite && waterClearance(undecked, x, z) < 0.05 && !(fillets && inFilletFill(fillets, x, z));
  const clear = (o) => {
    let k = o;
    while (k > onLand && wet(k, p.x + p.nx * k, p.z + p.nz * k)) k -= 0.1;
    return Math.max(k, onLand);
  };
  const shoulder = clear(onLand + 0.45);
  const outer = Math.max(clear(width), shoulder + 0.05);
  const { wetC, dampC, foamC } = ctx;
  const fa = FOAM_ALPHA * (ctx.foamA ?? 1);
  // A sample bent onto a fillet's arc: its land side lies over the fill,
  // which rides over the water, so those rows ride over the fill.
  const landY = (y) => (p.fillTop === undefined ? y : Math.max(y, p.fillTop));
  // water side first: the foam line just off the lip, then the lip
  // itself, then up onto the land and out to nothing.
  // [offset, y, colour, alpha, foam flag, swash metres]
  return [
    [wob - 0.34, waterY + LIP_LIFT, foamC, 0, 1, 0],
    [wob - 0.12, waterY + LIP_LIFT, foamC, fa, 1, 0],
    [wob, waterY + LIP_LIFT, wetC, BAND_ALPHA.lip * strength, 0, 0],
    [onLand, landY(waterY + LIP_LIFT), wetC, BAND_ALPHA.lip * strength, 0, 0],
    [shoulder, landY(LAND_Y), wetC, BAND_ALPHA.shoulder * strength, 0, 0],
    [outer, landY(LAND_Y), dampC, 0, 0, 0],
  ];
}

/** seaLip(seed, s) — the foam's lace edge, metres up the beach from the slab. */
function seaLip(seed, s) {
  const p = phases(seed);
  return SEA_LIP
    + SEA_LIP_AMP[0] * Math.sin((TAU * s) / SEA_LIP_WAVES[0] + p[0])
    + SEA_LIP_AMP[1] * Math.sin((TAU * s) / SEA_LIP_WAVES[1] + p[1]);
}

// The sea's cross-section, from out on the water up onto the sand: a faint
// outer line (the next little wave coming in), a thin clear gap, the main
// foam, the lace edge on the sand, gone. All of it white-ish and all of it
// fading to nothing at both sides, so no row reads as an outline. It lies
// just over the sea's surface the whole way, sand side included: a few
// centimetres of float are invisible from the cat's camera, and one height
// means the strip never dips under the slab's edge.
const SEA_ROWS = 6;
function seaProfile(p, ctx) {
  const lip = seaLip(ctx.seed, p.s);
  const y = ctx.waterY + LIP_LIFT;
  const fade = ctx.fadeFrom === undefined ? 1
    : smooth01((p.s - ctx.fadeFrom) / SEA_FADE) * smooth01((ctx.fadeTo - p.s) / SEA_FADE);
  const f = ctx.foamC;
  const k = ctx.foamA ?? 1;
  const out = (o) => Math.max(o, -SEA_OUT_MAX);
  return [
    [out(lip - 1.15), y, f, 0, 1, SEA_SWASH],
    [out(lip - 0.7), y, f, 0.4 * fade * k, 1, SEA_SWASH],
    [lip - 0.38, y, f, 0.22 * fade * k, 1, SEA_SWASH],
    [lip - 0.12, y, f, 0.85 * fade * k, 1, SEA_SWASH],
    [lip, y, f, 0.9 * fade * k, 1, SEA_SWASH],
    [lip + 0.14, y, f, 0, 1, SEA_SWASH],
  ];
}

// A riffle's foam streak: three rows across, the middle one pale and the
// sides gone; `p.k` fades it in and out along its length.
const RIFFLE_ROWS = 3;
function riffleProfile(p, ctx) {
  const y = ctx.waterY + LIP_LIFT;
  const c = ctx.foamC;
  const a = STREAK_ALPHA * p.k * (ctx.foamA ?? 1);
  return [
    [-ctx.halfW, y, c, 0, 1, 0],
    [0, y, c, a, 1, 0],
    [ctx.halfW, y, c, 0, 1, 0],
  ];
}

function smooth01(t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

function bandGeometry(runs) {
  let verts = 0, quads = 0;
  for (const r of runs) {
    const n = r.samples.length;
    const per = r.ctx.rows;
    verts += n * per;
    const spans = r.closed ? n : n - 1;
    quads += spans * (per - 1);
  }
  const pos = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 4);
  const foam = new Float32Array(verts);
  // (x, z) of the wash direction scaled by its reach, and a phase: the shader
  // moves the vertex by xy * sin(uSwash + phase). Zero for every bank row.
  const swash = new Float32Array(verts * 3);
  const index = new Uint32Array(quads * 6);
  let v = 0, ix = 0;
  for (const run of runs) {
    const { samples, closed, ctx } = run;
    const per = ctx.rows;
    const base = v;
    for (const p of samples) {
      const phase = (TAU * p.s) / SEA_STAGGER;
      for (const [o, y, color, a, isFoam, reach] of ctx.profile(p, ctx)) {
        pos[v * 3] = p.x + p.nx * o;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = p.z + p.nz * o;
        col[v * 4] = color.r; col[v * 4 + 1] = color.g; col[v * 4 + 2] = color.b; col[v * 4 + 3] = a;
        foam[v] = isFoam;
        swash[v * 3] = p.nx * reach;
        swash[v * 3 + 1] = p.nz * reach;
        swash[v * 3 + 2] = reach ? phase : 0;
        v++;
      }
    }
    const n = samples.length;
    const spans = closed ? n : n - 1;
    for (let i = 0; i < spans; i++) {
      const a0 = base + i * per, b0 = base + ((i + 1) % n) * per;
      for (let r = 0; r < per - 1; r++) {
        index[ix++] = a0 + r; index[ix++] = b0 + r; index[ix++] = a0 + r + 1;
        index[ix++] = a0 + r + 1; index[ix++] = b0 + r; index[ix++] = b0 + r + 1;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1));
  geo.setAttribute('aSwash', new THREE.BufferAttribute(swash, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  // the wash moves vertices up to SEA_SWASH: keep frustum culling honest
  geo.boundingSphere.radius += SEA_SWASH;
  return geo;
}

// The foam line's breathe: a per-vertex flag scales its alpha by one uniform,
// so the band and the foam share a draw and only the foam moves.
function bandMaterial(breathe, swash) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    // the lip lies a few millimetres over the water and the land side over
    // the path strips: pull it toward the camera so it never z-fights them
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    roughness: 0.75,
    metalness: 0,
    // Two-sided because the strip's winding follows whichever way the shore
    // runs; single pass, because three otherwise draws a transparent
    // two-sided material twice (back faces, then front): a flat strip has no
    // back to sort, and the second pass would be a wasted draw call.
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  mat.userData.breathe = breathe;
  mat.userData.swash = swash;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBreathe = mat.userData.breathe;
    shader.uniforms.uSwash = mat.userData.swash;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFoam;\nattribute vec3 aSwash;\nuniform float uBreathe;\nuniform float uSwash;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#if defined( USE_COLOR_ALPHA )\n\tvColor.a *= mix( 1.0, uBreathe, aFoam );\n#endif')
      // the mesh's matrix is the identity, so local x/z are world x/z
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.xz += aSwash.xy * sin( uSwash + aSwash.z );');
  };
  mat.customProgramCacheKey = () => 'waterdress-band';
  return mat;
}

// --- stones ------------------------------------------------------------------

function stoneSpots(runs, areaData, keepOut = []) {
  const b = areaData.bounds;
  const colliders = areaData.colliders ?? [];
  const spots = [];
  for (const run of runs) {
    const { samples, ctx } = run;
    if (ctx.noStones) continue;
    const rng = mulberry32(ctx.stoneSeed);
    let next = samples[0].s + rng() * STONE_EVERY;
    for (const p of samples) {
      if (p.s < next) continue;
      next = p.s + STONE_EVERY * (0.6 + 0.8 * rng());
      const out = 0.2 + 0.8 * rng();
      const r = 0.12 + 0.16 * rng();
      const spin = rng() * TAU;
      const tone = Math.floor(rng() * STONE_COLORS.length);
      const x = p.x + p.nx * out, z = p.z + p.nz * out;
      if (b && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) continue;
      // a stone on a bite's strip is on land to the eye
      if (!(out < (p.bite ?? 0) - 0.05) && waterClearance(ctx.undecked, x, z) < 0.1) continue;
      if (deckDistance(areaData.waters, x, z) < 1.5) continue;
      if (colliders.some((k) => Math.hypot(x - k.x, z - k.z) <= k.r + 0.1)) continue;
      // rest spots, finds and the like have no collider: stay clear of them too
      if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + STONE_KEEP_GAP)) continue;
      spots.push({ x, z, r, spin, tone });
    }
  }
  return spots;
}

// Each stone is a squashed, turned dodecahedron; only its faces that reach
// above its `floor` are kept (the ground at 0 for a bank stone, the water's
// surface for a riffle stone: both are opaque, so what lies wholly under them
// is never seen). That is about half the triangles of a whole stone.
function stonesGeometry(spots, extra = null) {
  const tmpl = new THREE.DodecahedronGeometry(1, 0);
  const src = tmpl.getAttribute('position');
  const per = src.count;
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const tri = new Float32Array(9);
  for (const s of spots) {
    const cos = Math.cos(s.spin), sin = Math.sin(s.spin);
    const y0 = s.y ?? 0;
    const floor = (s.floor ?? 0) + 1e-6;
    c.setHex(STONE_COLORS[s.tone]);
    for (let t = 0; t < per; t += 3) {
      let up = false;
      for (let k = 0; k < 3; k++) {
        const i = t + k;
        // squashed and a little longer one way, then turned
        const lx = src.getX(i) * s.r * 1.15, ly = src.getY(i) * s.r * 0.6, lz = src.getZ(i) * s.r * 0.85;
        tri[k * 3] = s.x + lx * cos - lz * sin;
        // half sunk: the centre sits at the ground (or at its own `y`), the
        // lower half below it
        tri[k * 3 + 1] = y0 + ly;
        tri[k * 3 + 2] = s.z + lx * sin + lz * cos;
        if (tri[k * 3 + 1] > floor) up = true;
      }
      if (!up) continue;
      for (let k = 0; k < 9; k++) pos.push(tri[k]);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  }
  tmpl.dispose();
  // the pond's reeds and lily pads, already flat triangles
  if (extra) { pos.push(...extra.pos); col.push(...extra.col); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// --- styles ------------------------------------------------------------------

// The generic bank for a water: its shore runs, each carrying what the band
// and the stones need to draw it.
function genericRuns(h, { areaId, areaData, box, undecked, evening = null, fillets = null, ground = null }) {
  const w = h.footprint;
  const pieces = bankPieces(w, h.waters ?? areaData.waters);
  if (pieces.length === 0) return [];
  const bog = h.style === 'bog';
  // bites, like fillets, need the ground to paint their strip with
  const kind = ground ? biteKind(areaId, h) : null;
  const fillY = (h.y ?? 0.03) + LIP_LIFT * 0.5;
  const seed0 = seedFromCode(`waterdress-${areaId}-${w.id}`);
  const out = [];
  // Each chain (each bank of a stream, each ring of a water) has its own
  // wobble and stone seed, so two banks of one water don't share a profile.
  // The first chain keeps the water's own seed.
  for (const [ci, ch] of chains(pieces).entries()) {
    const sampled = sampleChain(ch, w);
    if (fillets) for (const f of fillets) bendOntoFillet(sampled.samples, f);
    const seed = ci ? seedFromCode(`waterdress-${areaId}-${w.id}-${ci}`) : seed0;
    if (kind) biteChain(sampled, { seed: seed + 3, kind, fillets, waters: areaData.waters, fillY });
    const ctx = {
      seed,
      stoneSeed: seed + 7,
      period: sampled.closed ? sampled.length : 0,
      waterY: h.y ?? 0.03,
      colors: bog ? BOG_COLORS : (BANK_COLORS[areaId] ?? BANK_COLORS.woods),
      undecked,
      rows: PER,
      profile: bankProfile,
      fillets,
      biteKind: kind,
      fillY,
      chainClosed: sampled.closed,
      chainLength: sampled.length,
    };
    ctx.wetC = new THREE.Color(ctx.colors.wet);
    ctx.dampC = new THREE.Color(ctx.colors.damp);
    const ev = bog ? null : EVENING_FOAM[evening];
    ctx.foamC = new THREE.Color(bog ? FOAM_COLORS.bog : (ev ? ev.clear : FOAM_COLORS.clear));
    if (ev) ctx.foamA = ev.clearA;
    // a bitten stream's rim is wet mud, not white foam
    if (kind === 'stream') { ctx.foamC = new THREE.Color(MUD_FOAM); ctx.foamA = MUD_FOAM_A; }
    for (const run of clipRuns(sampled, box)) out.push({ ...run, w, ctx });
  }
  return out;
}

// The sea's foam strip: each straight run of its beach (a rect's listed
// `shores`), carried on along its own line SEA_REACH metres past the
// walkable bounds — past the slab's own end where that comes first, so the
// waterline runs on over the apron instead of stopping with the slab.
function seaRuns(h, { areaId, areaData, evening = null }) {
  const w = h.footprint;
  const pieces = bankPieces(w, h.waters ?? areaData.waters);
  if (pieces.length === 0) return [];
  const b = areaData.bounds ?? { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const box = {
    minX: b.minX - SEA_REACH, maxX: b.maxX + SEA_REACH,
    minZ: b.minZ - SEA_REACH, maxZ: b.maxZ + SEA_REACH,
  };
  const seed = seedFromCode(`waterdress-${areaId}-${w.id}`);
  const ctx0 = {
    seed, waterY: h.y ?? 0.05, rows: SEA_ROWS, profile: seaProfile, noStones: true,
    foamC: new THREE.Color(EVENING_FOAM[evening]?.sea ?? SEA_FOAM),
    ...(EVENING_FOAM[evening] ? { foamA: EVENING_FOAM[evening].seaA } : {}),
  };
  const out = [];
  for (const [ci, ch] of chains(pieces).entries()) {
    const a = ch.pts[0], z = ch.pts[ch.pts.length - 1];
    const len = Math.hypot(z.x - a.x, z.z - a.z);
    if (len < 1e-6) continue;
    const tx = (z.x - a.x) / len, tz = (z.z - a.z) / len;
    // land side: probe off the middle of the run
    let nx = -tz, nz = tx;
    const mx = (a.x + z.x) / 2, mz = (a.z + z.z) / 2;
    if (waterGap(w, mx + nx * 0.05, mz + nz * 0.05) < 0) { nx = -nx; nz = -nz; }
    // the stretch of this line inside the box, as arc length from `a`
    let s0 = -Infinity, s1 = Infinity;
    for (const [p, d, lo, hi] of [[a.x, tx, box.minX, box.maxX], [a.z, tz, box.minZ, box.maxZ]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { s0 = 1; s1 = 0; } continue; }
      const u = (lo - p) / d, v = (hi - p) / d;
      s0 = Math.max(s0, Math.min(u, v));
      s1 = Math.min(s1, Math.max(u, v));
    }
    if (!(s1 - s0 > SEA_STEP)) continue;
    const n = Math.ceil((s1 - s0) / SEA_STEP);
    const samples = [];
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      samples.push({ x: a.x + tx * s, z: a.z + tz * s, s, nx, nz });
    }
    out.push({
      samples, closed: false, w,
      ctx: { ...ctx0, seed: ci ? seedFromCode(`waterdress-${areaId}-${w.id}-${ci}`) : ctx0.seed, fadeFrom: s0, fadeTo: s1 },
    });
  }
  return out;
}

// The far-sea apron for one rect sea: a frame of four flat strips round the
// slab, reaching APRON_M past every edge that is not a beach, tucked
// APRON_TUCK under the slab's open edges and none at all on a beach side.
// Deep-sea colour, a little under the sea's surface.
function apronQuads(h) {
  const w = h.footprint;
  if (w.kind !== 'rect') return [];
  const shores = w.shores ?? [];
  const far = (side) => (shores.includes(side) ? 0 : APRON_M);
  const tuck = (side) => (shores.includes(side) ? 0 : APRON_TUCK);
  const outer = {
    minX: w.minX - far('minX'), maxX: w.maxX + far('maxX'),
    minZ: w.minZ - far('minZ'), maxZ: w.maxZ + far('maxZ'),
  };
  const hole = {
    minX: w.minX + tuck('minX'), maxX: w.maxX - tuck('maxX'),
    minZ: w.minZ + tuck('minZ'), maxZ: w.maxZ - tuck('maxZ'),
  };
  const y = (h.y ?? 0.05) - APRON_DROP;
  return [
    [outer.minX, hole.minX, outer.minZ, outer.maxZ],
    [hole.maxX, outer.maxX, outer.minZ, outer.maxZ],
    [hole.minX, hole.maxX, outer.minZ, hole.minZ],
    [hole.minX, hole.maxX, hole.maxZ, outer.maxZ],
  ].filter(([x0, x1, z0, z1]) => x1 - x0 > 1e-6 && z1 - z0 > 1e-6).map((q) => [...q, y]);
}

function apronMesh(quads, color, ev = null) {
  const pos = new Float32Array(quads.length * 12);
  const index = [];
  let v = 0;
  for (const [x0, x1, z0, z1, y] of quads) {
    // counter-clockwise seen from above, so the face looks up
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x1, z0]]) {
      pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
      v++;
    }
    const k = v - 4;
    index.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(v * 3).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  // The colour is sRGB 0-255; the water applies material.color in linear, so
  // the evening multiply is done in linear too, and the glow matches the
  // water's emissive: no seam at the shore at sunset or dusk.
  const [r, g, b] = color;
  const col = new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
  if (ev) col.multiply(new THREE.Color().setRGB(ev.mul[0], ev.mul[1], ev.mul[2]));
  const mat = new THREE.MeshStandardMaterial({
    color: col,
    roughness: APRON_ROUGHNESS,
    metalness: 0,
    // a hair behind the sea where the two overlap under the slab's edge
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  if (ev) mat.emissive.setHex(ev.glow);
  const m = new THREE.Mesh(geo, mat);
  m.name = 'waterdress:apron';
  return m;
}
// --- fillets (rounded bank corners) ------------------------------------------

// Move the samples on a fillet's two edges, within r of its corner, onto its
// arc (see BANK_FILLETS). Each edge leaves the corner going into the water's
// side along one axis; `u` is the radial direction of that edge's tangent
// point, `v` the perpendicular one turning toward the corner.
function bendOntoFillet(samples, f) {
  const { x, z, r, wx, wz } = f;
  const cx = x + wx * r, cz = z + wz * r;
  const e = 1e-6;
  for (const p of samples) {
    // only a bank facing out of this corner's water
    if (p.nx * -wx + p.nz * -wz <= 0) continue;
    let d, ux, uz, vx, vz;
    if (Math.abs(p.x - x) < e) {
      // the edge running along z (x = corner x)
      d = (p.z - z) * wz;
      ux = -wx; uz = 0; vx = 0; vz = -wz;
    } else if (Math.abs(p.z - z) < e) {
      // the edge running along x (z = corner z)
      d = (p.x - x) * wx;
      ux = 0; uz = -wz; vx = -wx; vz = 0;
    } else continue;
    if (d < -e || d > r + e) continue;
    const th = (1 - Math.max(0, Math.min(r, d)) / r) * (Math.PI / 4);
    const dx = ux * Math.cos(th) + vx * Math.sin(th), dz = uz * Math.cos(th) + vz * Math.sin(th);
    p.x = cx + dx * r; p.z = cz + dz * r;
    p.nx = dx; p.nz = dz;
    p.fillTop = f.fillTop;
    p.fillet = f;
  }
}

// Bite one sampled chain (see BITES): every sample keeps its true shore point
// and land normal (x0, z0, nx0, nz0) and gets `bite`, metres moved into the
// water after the tapers; a bitten sample moves there, takes its normal from
// its neighbours, and its band rows over the strip ride over it (fillTop).
// Samples already bent onto a fillet keep bite 0.
function biteChain(sampled, { seed, kind, fillets, waters, fillY }) {
  const { samples, closed, length } = sampled;
  const period = closed ? length : 0;
  for (const p of samples) {
    p.x0 = p.x; p.z0 = p.z; p.nx0 = p.nx; p.nz0 = p.nz; p.bite = 0;
    if (p.fillet) continue;
    let t = 1;
    if (!closed) t *= smooth01((Math.min(p.s, length - p.s) - BITE_END_DEAD) / BITE_END);
    if (t > 0) t *= smooth01((deckDistance(waters, p.x, p.z) - BITE_DECK) / BITE_DECK_RAMP);
    for (const f of fillets ?? []) {
      if (t > 0) t *= smooth01((Math.hypot(p.x - f.x, p.z - f.z) - 2 * f.r) / BITE_FILLET_RAMP);
    }
    if (t > 0) p.bite = bankBite(seed, p.s, period, kind) * t;
  }
  for (const p of samples) {
    if (p.bite > 0) { p.x = p.x0 - p.nx0 * p.bite; p.z = p.z0 - p.nz0 * p.bite; }
  }
  const m = samples.length;
  const n = [];
  for (let i = 0; i < m; i++) {
    const p = samples[i];
    if (!(p.bite > 0)) { n.push(null); continue; }
    const prev = samples[closed ? (i - 1 + m) % m : Math.max(0, i - 1)];
    const next = samples[closed ? (i + 1) % m : Math.min(m - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz);
    if (!(tl > 1e-9)) { n.push(null); continue; }
    tx /= tl; tz /= tl;
    let nx = -tz, nz = tx;
    if (nx * p.nx0 + nz * p.nz0 < 0) { nx = -nx; nz = -nz; }
    n.push([nx, nz]);
  }
  for (let i = 0; i < m; i++) {
    const p = samples[i];
    if (!(p.bite > 0)) continue;
    if (n[i]) { p.nx = n[i][0]; p.nz = n[i][1]; }
    p.fillTop = fillY + LIP_LIFT * 0.5;
  }
}

// Is (x, z) in a fillet's fill: inside the square r x r cell at the corner
// and outside the arc?
function inFilletFill(fillets, x, z) {
  for (const f of fillets) {
    const ax = (x - f.x) * f.wx, az = (z - f.z) * f.wz;
    if (ax < 0 || az < 0 || ax > f.r || az > f.r) continue;
    if (Math.hypot(ax - f.r, az - f.r) > f.r) return true;
  }
  return false;
}

// The area's ground plane, if it is one fillets can borrow: a top-level mesh
// tagged userData.ground (builder.js ground()) with a PlaneGeometry.
function fillGround(scene) {
  const g = scene?.children?.find((c) => c.isMesh && c.userData?.ground && c.name !== 'path' && c.visible !== false);
  if (!g || g.geometry?.type !== 'PlaneGeometry' || !g.geometry.parameters) return null;
  return g;
}

// The ground's grid, ready to sample: its inverse world matrix, normal
// matrix, plane parameters and the attributes to borrow.
function groundSampler(ground) {
  ground.updateWorldMatrix(true, false);
  const gg = ground.geometry;
  const { width, height, widthSegments: ws = 1, heightSegments: hs = 1 } = gg.parameters;
  return {
    inv: new THREE.Matrix4().copy(ground.matrixWorld).invert(),
    nmat: new THREE.Matrix3().getNormalMatrix(ground.matrixWorld),
    width, height, ws, hs,
    attrs: ['uv', 'normal', 'color'].map((n) => [n, gg.getAttribute(n)]).filter(([, a]) => a),
    local: new THREE.Vector3(),
    nrm: new THREE.Vector3(),
  };
}

// Bilinear sample of the ground's attributes (those named in `names`) at
// world (x, y, z), written into out[name] at vertex v; normals turned into
// world space, as the fill's own matrix is the identity.
// PlaneGeometry's vertex (ix, iy) sits at x = -w/2 + ix*w/ws,
// y = h/2 - iy*h/hs, index iy*(ws+1)+ix.
function sampleGround(g, x, y, z, out, v, names = null) {
  const { width, height, ws, hs } = g;
  g.local.set(x, y, z).applyMatrix4(g.inv);
  const gx = Math.min(ws, Math.max(0, ((g.local.x + width / 2) / width) * ws));
  const gy = Math.min(hs, Math.max(0, ((height / 2 - g.local.y) / height) * hs));
  const ix = Math.min(ws - 1, Math.floor(gx)), iy = Math.min(hs - 1, Math.floor(gy));
  const tx = gx - ix, ty = gy - iy;
  const k00 = iy * (ws + 1) + ix, k10 = k00 + 1, k01 = k00 + ws + 1, k11 = k01 + 1;
  for (const [name, a] of g.attrs) {
    if (names && !names.includes(name)) continue;
    const sz = a.itemSize, o = out[name];
    for (let c = 0; c < sz; c++) {
      const top = a.getComponent(k00, c) * (1 - tx) + a.getComponent(k10, c) * tx;
      const bot = a.getComponent(k01, c) * (1 - tx) + a.getComponent(k11, c) * tx;
      o[v * sz + c] = top * (1 - ty) + bot * ty;
    }
    if (name === 'normal') g.nrm.fromArray(o, v * 3).applyMatrix3(g.nmat).normalize().toArray(o, v * 3);
  }
}

// Push triangle (a, b, c) wound to look up (+y).
function pushUp(index, pos, a, b, c) {
  const abx = pos[b * 3] - pos[a * 3], abz = pos[b * 3 + 2] - pos[a * 3 + 2];
  const acx = pos[c * 3] - pos[a * 3], acz = pos[c * 3 + 2] - pos[a * 3 + 2];
  if (abz * acx - abx * acz >= 0) index.push(a, b, c); else index.push(a, c, b);
}

// The fill: first the fillet fans — for each, the corner then FILLET_SEGS + 1
// points round the arc, all at its fillY, uv / normal / colour sampled where
// each vertex lies — then, per bitten run, a strip of quads from just under
// the land's edge (x0 + nx0 * tuck) to the bitten point, at that run's fillY;
// uv and normal sampled where each vertex lies, colour on the land beside it.
// Quads whose two ends both have no bite are left out. Faces look up.
function fillGeometry(fillets, biteRuns, ground) {
  const g = groundSampler(ground);
  const per = FILLET_SEGS + 2;
  const nFan = fillets.length * per;
  const n = nFan + biteRuns.reduce((k, r) => k + r.samples.length * 2, 0);
  const pos = new Float32Array(n * 3);
  const out = Object.fromEntries(g.attrs.map(([name, a]) => [name, new Float32Array(n * a.itemSize)]));
  const index = [];
  const vertNames = ['uv', 'normal'];
  let v = 0;
  for (const f of fillets) {
    const cx = f.x + f.wx * f.r, cz = f.z + f.wz * f.r;
    const pts = [[f.x, f.z]];
    // from the z-edge's tangent point, round to the x-edge's
    for (let i = 0; i <= FILLET_SEGS; i++) {
      const th = (i / FILLET_SEGS) * (Math.PI / 2);
      pts.push([cx - f.wx * f.r * Math.cos(th), cz - f.wz * f.r * Math.sin(th)]);
    }
    const base = v;
    for (const [x, z] of pts) {
      pos[v * 3] = x; pos[v * 3 + 1] = f.fillY; pos[v * 3 + 2] = z;
      sampleGround(g, x, f.fillY, z, out, v);
      v++;
    }
    for (let i = 1; i <= FILLET_SEGS; i++) pushUp(index, pos, base, base + i, base + i + 1);
  }
  for (const run of biteRuns) {
    const { samples, closed } = run;
    const y = run.ctx.fillY;
    const base = v;
    for (const p of samples) {
      const tuck = BITE_TUCK * smooth01(p.bite / BITE_TUCK_FULL);
      const lx = p.x0 + p.nx0 * BITE_COLOR_AT, lz = p.z0 + p.nz0 * BITE_COLOR_AT;
      for (const [x, z] of [[p.x0 + p.nx0 * tuck, p.z0 + p.nz0 * tuck], [p.x0 - p.nx0 * p.bite, p.z0 - p.nz0 * p.bite]]) {
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        sampleGround(g, x, y, z, out, v, vertNames);
        sampleGround(g, lx, y, lz, out, v, ['color']);
        v++;
      }
    }
    const m = samples.length;
    const spans = closed ? m : m - 1;
    for (let i = 0; i < spans; i++) {
      const j = (i + 1) % m;
      if (!(samples[i].bite > 0) && !(samples[j].bite > 0)) continue;
      const li = base + i * 2, wi = li + 1, lj = base + j * 2, wj = lj + 1;
      pushUp(index, pos, li, wi, lj);
      pushUp(index, pos, lj, wi, wj);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  for (const [name, a] of g.attrs) geo.setAttribute(name, new THREE.BufferAttribute(out[name], a.itemSize));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return { geo, filletVerts: [0, nFan] };
}

// The riffles of one stream (see RIFFLES): its stones, and its streaks as
// band runs. Every draw comes off one rng in a fixed order per stone, before
// any filter, so a stone dropped by a filter moves no other.
function riffles(h, { areaId, areaData, box, undecked, evening, keepOut }) {
  const w = h.footprint;
  const rng = mulberry32(seedFromCode(`waterdress-${areaId}-${w.id}-riffle`));
  const alongX = w.maxX - w.minX >= w.maxZ - w.minZ;
  const lo = Math.max(alongX ? w.minX : w.minZ, alongX ? box.minX : box.minZ);
  const hi = Math.min(alongX ? w.maxX : w.maxZ, alongX ? box.maxX : box.maxZ);
  const mid = alongX ? (w.minZ + w.maxZ) / 2 : (w.minX + w.maxX) / 2;
  const hy = h.y ?? 0.03;
  const ev = EVENING_FOAM[evening];
  const foamC = new THREE.Color(ev ? ev.clear : FOAM_COLORS.clear);
  const colliders = areaData.colliders ?? [];
  const stones = [];
  const streaks = [];
  for (let t = lo + RIFFLE_START * rng(); t <= hi; t += RIFFLE_EVERY + RIFFLE_EVERY_JIT * rng()) {
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const lat = (rng() - 0.5) * RIFFLE_LATERAL;
      const a = t + (rng() - 0.5) * RIFFLE_ALONG;
      const r = RIFFLE_R[0] + RIFFLE_R[1] * rng();
      const spin = rng() * TAU;
      const tone = Math.floor(rng() * STONE_COLORS.length);
      const plan = [];
      const m = 1 + (rng() < 0.5 ? 1 : 0);
      for (let j = 0; j < m; j++) {
        plan.push({
          dir: rng() < 0.5 ? -1 : 1,
          len: STREAK_LEN[0] + STREAK_LEN[1] * rng(),
          halfW: STREAK_HALF_W[0] + STREAK_HALF_W[1] * rng(),
          side: (rng() - 0.5) * r,
        });
      }
      const x = alongX ? a : mid + lat, z = alongX ? mid + lat : a;
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      if (!(waterClearance(undecked, x, z) < -(BITE_MAX + RIFFLE_CLEAR))) continue;
      if (deckDistance(areaData.waters, x, z) < RIFFLE_DECK) continue;
      if (colliders.some((k) => Math.hypot(x - k.x, z - k.z) <= k.r + 0.1)) continue;
      if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + STONE_KEEP_GAP)) continue;
      const stone = stones.length;
      stones.push({ x, z, r, y: hy - RIFFLE_SINK * r, floor: hy, spin, tone, water: w.id });
      // along the stream (tx, tz), across it (nx, nz)
      const tx = alongX ? 1 : 0, tz = alongX ? 0 : 1;
      for (const k of plan) {
        const sx = x + tx * k.dir * r * 0.6 + tz * k.side, sz = z + tz * k.dir * r * 0.6 + tx * k.side;
        const samples = [0, 0.5, 1].map((f) => ({
          x: sx + tx * k.dir * k.len * f, z: sz + tz * k.dir * k.len * f,
          s: k.len * f, nx: tz, nz: tx, k: f === 0.5 ? 1 : 0,
        }));
        streaks.push({
          samples, closed: false, w, stone,
          ctx: {
            seed: 0, waterY: hy, rows: RIFFLE_ROWS, profile: riffleProfile, noStones: true,
            foamC, halfW: k.halfW, ...(ev ? { foamA: ev.clearA } : {}),
          },
        });
      }
    }
  }
  return { stones, streaks };
}

// The bite (metres) of a bitten ring at angle `a` round (cx, cz): the
// nearest sample's, by angle. 0 where the ring is not bitten.
function biteAtAngle(samples, cx, cz, a) {
  let best = null, bd = Infinity;
  for (const p of samples) {
    const x = p.x0 ?? p.x, z = p.z0 ?? p.z;
    let d = Math.abs(Math.atan2(z - cz, x - cx) - a);
    if (d > Math.PI) d = TAU - d;
    if (d < bd) { bd = d; best = p; }
  }
  return best?.bite ?? 0;
}

// Flat triangles for the stones mesh: positions and colours pushed per vertex.
function triSink() {
  const pos = [], col = [];
  const c = new THREE.Color();
  return {
    pos, col,
    // (a, b, c) as [x, y, z]; `up` winds a flat-ish face to look up
    tri(a, b, d, hex, up = false) {
      if (up) {
        const abx = b[0] - a[0], abz = b[2] - a[2], adx = d[0] - a[0], adz = d[2] - a[2];
        if (abz * adx - abx * adz < 0) [b, d] = [d, b];
      }
      pos.push(...a, ...b, ...d);
      c.setHex(hex);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    },
  };
}

// The duck pond's reeds and lily pads (see POND_PLANTS), for one circle
// water. Every rng draw for a clump or pad comes before its filters, so a
// dropped one moves no other.
function pondPlants(h, plan, { areaId, areaData, bankRuns, keepOut, sink }) {
  const w = h.footprint;
  const hy = h.y ?? 0.03;
  const ring = bankRuns.filter((r) => r.w === w).flatMap((r) => r.samples);
  const colliders = areaData.colliders ?? [];
  const blocked = (x, z, gap) => colliders.some((k) => Math.hypot(x - k.x, z - k.z) <= k.r + gap)
    || keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + gap);
  const reeds = [];
  const rr = mulberry32(seedFromCode(`waterdress-${areaId}-${w.id}-reeds`));
  for (const [a0, a1] of plan.reedArcs) {
    const t0 = (a0 * Math.PI) / 180, t1 = (a1 * Math.PI) / 180;
    for (let s = 0.2 * rr(); ; s += REED_EVERY + REED_EVERY_JIT * rr()) {
      const t = t0 + s / w.r;
      if (t > t1) break;
      const out = REED_OUT + REED_OUT_JIT * rr();
      const blades = 4 + Math.floor(rr() * 3);
      const cattail = rr() < 0.5;
      const parts = [];
      for (let i = 0; i < blades; i++) {
        parts.push({
          dx: (rr() - 0.5) * 0.24, dz: (rr() - 0.5) * 0.24,
          face: rr() * TAU, wide: 0.05 + 0.02 * rr(), tall: 0.6 + 0.5 * rr(),
          lean: 0.08 + 0.12 * rr(), leanAt: rr() * TAU,
          color: REED_COLORS[Math.floor(rr() * REED_COLORS.length)],
        });
      }
      const rad = w.r - biteAtAngle(ring, w.x, w.z, t) + out;
      const x = w.x + Math.cos(t) * rad, z = w.z + Math.sin(t) * rad;
      if (blocked(x, z, 0.3)) continue;
      reeds.push({ x, z });
      let top = null;
      for (const b of parts) {
        const bx = x + b.dx, bz = z + b.dz;
        const ux = Math.cos(b.face) * b.wide * 0.5, uz = Math.sin(b.face) * b.wide * 0.5;
        const tip = [bx + Math.cos(b.leanAt) * b.lean, b.tall, bz + Math.sin(b.leanAt) * b.lean];
        sink.tri([bx - ux, 0, bz - uz], [bx + ux, 0, bz + uz], tip, b.color);
        if (!top || b.tall > top.tip[1]) top = { tip, bx, bz };
      }
      if (cattail && top) {
        // a little brown head just under the tallest blade's tip, its spike
        // poking out above
        const at = (y) => {
          const f = y / top.tip[1];
          return [top.bx + (top.tip[0] - top.bx) * f, top.bz + (top.tip[2] - top.bz) * f];
        };
        const y1 = top.tip[1] - 0.04, y0 = y1 - CATTAIL_H;
        const [cx0, cz0] = at(y0), [cx1, cz1] = at(y1);
        const ringAt = (cx, cy, cz) => Array.from({ length: 6 }, (_, i) => {
          const th = (i / 6) * TAU;
          return [cx + Math.cos(th) * CATTAIL_R, cy, cz + Math.sin(th) * CATTAIL_R];
        });
        const lo = ringAt(cx0, y0, cz0), hi = ringAt(cx1, y1, cz1);
        for (let i = 0; i < 6; i++) {
          const j = (i + 1) % 6;
          sink.tri(lo[i], hi[i], lo[j], CATTAIL_COLOR);
          sink.tri(lo[j], hi[i], hi[j], CATTAIL_COLOR);
        }
        for (let i = 1; i < 5; i++) {
          sink.tri(hi[0], hi[i], hi[i + 1], CATTAIL_COLOR, true);
          sink.tri(lo[0], lo[i + 1], lo[i], CATTAIL_COLOR);
        }
      }
    }
  }

  const lilies = [];
  const lr = mulberry32(seedFromCode(`waterdress-${areaId}-${w.id}-lilies`));
  const fish = fishSpots(areaId, areaData);
  const undecked = (areaData.waters ?? []).map(({ decks, ...q }) => q);
  for (let i = 0; i < LILY_TRIES && lilies.length < LILY_COUNT; i++) {
    const t = ((plan.lilyAt + (lr() * 2 - 1) * LILY_SPREAD) * Math.PI) / 180;
    const rad = w.r - LILY_IN + (lr() * 2 - 1) * LILY_IN_JIT;
    const r = LILY_R[0] + LILY_R[1] * lr();
    const notch = Math.floor(lr() * LILY_SEGS);
    const turn = lr() * TAU;
    const color = LILY_COLORS[Math.floor(lr() * LILY_COLORS.length)];
    const x = w.x + Math.cos(t) * rad, z = w.z + Math.sin(t) * rad;
    if (!(waterClearance(undecked, x, z) <= -(0.9 + r))) continue;
    if (fish.some((f) => Math.hypot(x - f.x, z - f.z) < 1)) continue;
    if (lilies.some((l) => Math.hypot(x - l.x, z - l.z) < l.r + r + 0.15)) continue;
    lilies.push({ x, z, r });
    const y = hy + LILY_LIFT;
    for (let k = 0; k < LILY_SEGS; k++) {
      if (k === notch) continue;
      const a = turn + (k / LILY_SEGS) * TAU, b = turn + ((k + 1) / LILY_SEGS) * TAU;
      sink.tri([x, y, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * r], [x + Math.cos(b) * r, y, z + Math.sin(b) * r], color, true);
    }
    if (lilies.length <= LILY_FLOWERS) {
      // a little pink cone sitting on the pad, off its centre
      const fx = x + Math.cos(turn + Math.PI) * r * 0.3, fz = z + Math.sin(turn + Math.PI) * r * 0.3;
      const apex = [fx, y + FLOWER_H, fz];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, b = ((k + 1) / 6) * TAU;
        sink.tri([fx + Math.cos(a) * FLOWER_R, y, fz + Math.sin(a) * FLOWER_R], apex,
          [fx + Math.cos(b) * FLOWER_R, y, fz + Math.sin(b) * FLOWER_R], FLOWER_COLOR);
      }
    }
  }
  return { reeds, lilies };
}

// One builder per water style.
const STYLE_BUILDERS = { clear: genericRuns, bog: genericRuns, sea: seaRuns };

// ---------------------------------------------------------------------------

/**
 * createWaterDressing(scene, { areaId, areaData, tier, reducedMotion, keepOut: grassKeepOut, evening })
 *   → { meshes, update(dt), dispose() }
 *
 * `evening` (null | 'sunset' | 'dusk') warms or quietens the foam and tints
 * the sea apron like the water (see EVENING_FOAM); null is the day's look.
 *
 * Reads areaData.waterFx (water.js's handles). Areas not in DRESSED_AREAS —
 * the docks, the gorge, the den, the neighbourhood — get a no-op stub and
 * add nothing to the scene.
 */
export function createWaterDressing(scene, { areaId, areaData, tier, reducedMotion = false, keepOut = [], evening = null } = {}) {
  if (!DRESSED_AREAS.includes(areaId) || !areaData?.waterFx?.length) return NO_DRESSING;
  const low = (typeof tier === 'string' ? tier : tier?.name) === 'low';
  const bounds = areaData.bounds ?? { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  const box = {
    minX: bounds.minX - HORIZON_M, maxX: bounds.maxX + HORIZON_M,
    minZ: bounds.minZ - HORIZON_M, maxZ: bounds.maxZ + HORIZON_M,
  };
  // Decks are lifted out: the band may pass under a bridge, and a deck is
  // not land for a stone.
  const undecked = (areaData.waters ?? []).map(({ decks, ...w }) => w);

  // Rounded bank corners and bites need the ground plane to paint their
  // fill with.
  const wantsFill = BANK_FILLETS[areaId] || areaData.waterFx.some((h) => biteKind(areaId, h));
  const ground = wantsFill ? fillGround(scene) : null;
  const fillets = ground && BANK_FILLETS[areaId] ? BANK_FILLETS[areaId].map((f) => {
    // the fill rides just over the highest water at the corner
    const ys = areaData.waterFx
      .filter((h) => waterGap(h.footprint, f.x + f.wx * 0.01, f.z + f.wz * 0.01) < 0)
      .map((h) => h.y ?? 0.03);
    const fillY = (ys.length ? Math.max(...ys) : 0.03) + LIP_LIFT * 0.5;
    return { ...f, fillY, fillTop: fillY + LIP_LIFT * 0.5, samples: [] };
  }) : null;

  const runs = [];
  for (const h of areaData.waterFx) {
    const build = STYLE_BUILDERS[h.style ?? 'clear'] ?? genericRuns;
    runs.push(...build(h, { areaId, areaData, box, undecked, evening, fillets, ground }));
  }
  if (runs.length === 0) return NO_DRESSING;

  // Mid-stream riffles: bitten streams only (so only on ground), never LOW.
  const riffleStones = [];
  const streakRuns = [];
  if (!low && ground) {
    for (const h of areaData.waterFx) {
      if (biteKind(areaId, h) !== 'stream') continue;
      const { stones, streaks } = riffles(h, { areaId, areaData, box, undecked, evening, keepOut });
      for (const k of streaks) k.stone += riffleStones.length;
      riffleStones.push(...stones);
      streakRuns.push(...streaks);
    }
  }
  const bankRuns = runs.slice();
  runs.push(...streakRuns);

  const meshes = [];
  const breathe = { value: BREATHE_STILL };
  const swash = { value: 0 };
  const band = new THREE.Mesh(bandGeometry(runs), bandMaterial(breathe, swash));
  band.name = 'waterdress:band';
  band.renderOrder = RENDER_ORDER;
  // The sea's waterline (the foam's lace edge on the sand), for tests and
  // for anything that wants to know where the little waves reach.
  const seaLine = runs.filter((r) => r.ctx.profile === seaProfile).flatMap((r) => r.samples.map((p) => {
    const lip = seaLip(r.ctx.seed, p.s);
    return { x: p.x + p.nx * lip, z: p.z + p.nz * lip };
  }));
  if (seaLine.length) band.userData.waterline = seaLine;
  band.userData.runSeeds = bankRuns.map((r) => ({ water: r.w.id, seed: r.ctx.seed }));
  if (streakRuns.length) {
    // for tests: each streak's vertex range in the band, and its stone
    let v = 0;
    const at = new Map();
    for (const r of runs) { at.set(r, v); v += r.samples.length * r.ctx.rows; }
    band.userData.streaks = streakRuns.map((r) => ({ stone: r.stone, verts: [at.get(r), r.samples.length * r.ctx.rows] }));
  }
  meshes.push(band);

  // The bitten runs (a run whose deepest bite is too small draws no strip).
  const biteRuns = runs.filter((r) => r.ctx.biteKind
    && r.samples.reduce((k, p) => Math.max(k, p.bite ?? 0), 0) >= BITE_MIN);
  if (biteRuns.length) {
    // for tests and anything that wants to know where the visual shore is
    band.userData.bites = biteRuns.map((r) => ({
      water: r.w.id,
      maxBite: r.samples.reduce((k, p) => Math.max(k, p.bite), 0),
      seed: r.ctx.seed,
      period: r.ctx.period,
      closed: r.ctx.chainClosed,
      length: r.ctx.chainLength,
      samples: r.samples.map(({ x, z, nx, nz, s, x0, z0, nx0, nz0, bite }) => ({ x, z, nx, nz, s, x0, z0, nx0, nz0, bite })),
    }));
  }

  // The fill (fillet fans and bite strips), on every tier, sharing the
  // ground's CURRENT material (at dusk or in the rain, the tinted one): one
  // opaque mesh.
  if (fillets) {
    // for tests: the band's samples round each corner, after bending
    for (const r of bankRuns) {
      for (const p of r.samples) {
        for (const f of fillets) {
          if (Math.hypot(p.x - f.x, p.z - f.z) < 2 * f.r) f.samples.push({ x: p.x, z: p.z, nx: p.nx, nz: p.nz });
        }
      }
    }
    band.userData.fillets = fillets.map(({ x, z, r, samples }) => ({ x, z, r, samples }));
  }
  if (fillets || biteRuns.length) {
    const { geo, filletVerts } = fillGeometry(fillets ?? [], biteRuns, ground);
    const fill = new THREE.Mesh(geo, ground.material);
    fill.name = 'waterdress:fill';
    fill.renderOrder = FILLET_ORDER;
    fill.userData.sharedMaterial = true;
    fill.userData.filletVerts = filletVerts;
    meshes.push(fill);
  }

  // The far-sea apron, on every tier: without it the sea ends in a corner.
  const seas = areaData.waterFx.filter((h) => h.style === 'sea');
  const quads = seas.flatMap(apronQuads);
  if (quads.length) meshes.push(apronMesh(quads, waterRamp(seas[0].color ?? 0x4a90c0).deep, WATER_EVENING[evening] ?? null));

  if (!low) {
    const spots = [...stoneSpots(bankRuns, areaData, keepOut), ...riffleStones];
    // the duck pond's reeds and lily pads ride in the stones mesh
    const sink = triSink();
    const reeds = [], lilies = [];
    for (const h of areaData.waterFx) {
      const plan = POND_PLANTS[areaId]?.[h.footprint?.id];
      if (!plan || h.footprint.kind !== 'circle') continue;
      const got = pondPlants(h, plan, { areaId, areaData, bankRuns, keepOut, sink });
      reeds.push(...got.reeds);
      lilies.push(...got.lilies);
    }
    if (spots.length || sink.pos.length) {
      const stones = new THREE.Mesh(
        stonesGeometry(spots, sink),
        // two-sided: a reed blade and a lily pad are single flat triangles
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true, side: THREE.DoubleSide }),
      );
      stones.name = 'waterdress:stones';
      stones.userData.centres = spots.filter((s) => s.water === undefined).map(({ x, z, r }) => ({ x, z, r }));
      stones.userData.riffles = riffleStones.map(({ x, z, r, y, water }) => ({ x, z, r, y, water }));
      if (reeds.length) stones.userData.reeds = reeds;
      if (lilies.length) stones.userData.lilies = lilies;
      meshes.push(stones);
    }
  }

  for (const m of meshes) {
    // nothing in the shadow pass, but the band and stones take tree shadows
    // (the far apron is nowhere near a tree)
    m.castShadow = false;
    m.receiveShadow = m.name !== 'waterdress:apron';
    // rig.js / mergeprops.js skip these, should anything sweep again
    m.userData.noCast = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
  }

  const animated = !reducedMotion;
  let elapsed = 0;
  let disposed = false;
  return {
    meshes,
    update(dt = 0) {
      if (!animated || disposed) return;
      elapsed += dt;
      swash.value = ((elapsed / SEA_SWASH_S) % 1) * TAU;
      breathe.value = BREATHE_LO + (1 - BREATHE_LO) * (0.5 + 0.5 * Math.sin((elapsed / BREATHE_S) * TAU));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of meshes) {
        scene.remove(m);
        m.geometry.dispose();
        // the fill borrows the ground's material: never free it
        if (!m.userData.sharedMaterial) m.material.dispose();
      }
    },
  };
}
