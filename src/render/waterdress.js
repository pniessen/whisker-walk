import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';
import { waterGap, waterClearance, deckDistance } from '../world/builder.js';
import { bankPieces, waterRamp } from './water.js';

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
// them sees it: castShadow and receiveShadow false, no shadow-pass draw.
//   - the band: wet earth + foam line, ONE transparent mesh (vertex colour
//     with alpha, depthWrite off, polygon offset);
//   - the stones: one opaque merged mesh (none on the LOW tier);
//   - reeds / lily pads: none today. The Woods, Moor, River and Pines all
//     plant their own reed beds along these banks, and the Pines bogs already
//     float lily pads (pines.js pinesLilyPads), so a second set would only
//     double them up. The slot is kept in the count for a style that needs it.
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

export const DRESSED_AREAS = Object.freeze(['woods', 'river', 'moor', 'pines', 'seaside']);

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

// Stones: low-poly, grey-brown, about one every STONE_EVERY metres of bank.
const STONE_EVERY = 4;
const STONE_COLORS = [0x8a8378, 0x7a7266, 0x958c7e, 0x6f6a60];

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
function smoothNoise(seed, s, period) {
  const p = phases(seed);
  let v = 0;
  for (let i = 0; i < 3; i++) {
    let k = TAU / WAVES[i];
    if (period > 0) k = (TAU * Math.max(1, Math.round(period / WAVES[i]))) / period;
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
  const clear = (o) => {
    let k = o;
    while (k > onLand && waterClearance(undecked, p.x + p.nx * k, p.z + p.nz * k) < 0.05) k -= 0.1;
    return Math.max(k, onLand);
  };
  const shoulder = clear(onLand + 0.45);
  const outer = Math.max(clear(width), shoulder + 0.05);
  const { wetC, dampC, foamC } = ctx;
  // water side first: the foam line just off the lip, then the lip
  // itself, then up onto the land and out to nothing.
  // [offset, y, colour, alpha, foam flag, swash metres]
  return [
    [wob - 0.34, waterY + LIP_LIFT, foamC, 0, 1, 0],
    [wob - 0.12, waterY + LIP_LIFT, foamC, FOAM_ALPHA, 1, 0],
    [wob, waterY + LIP_LIFT, wetC, BAND_ALPHA.lip * strength, 0, 0],
    [onLand, waterY + LIP_LIFT, wetC, BAND_ALPHA.lip * strength, 0, 0],
    [shoulder, LAND_Y, wetC, BAND_ALPHA.shoulder * strength, 0, 0],
    [outer, LAND_Y, dampC, 0, 0, 0],
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
  const out = (o) => Math.max(o, -SEA_OUT_MAX);
  return [
    [out(lip - 1.15), y, f, 0, 1, SEA_SWASH],
    [out(lip - 0.7), y, f, 0.4 * fade, 1, SEA_SWASH],
    [lip - 0.38, y, f, 0.22 * fade, 1, SEA_SWASH],
    [lip - 0.12, y, f, 0.85 * fade, 1, SEA_SWASH],
    [lip, y, f, 0.9 * fade, 1, SEA_SWASH],
    [lip + 0.14, y, f, 0, 1, SEA_SWASH],
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

function stoneSpots(runs, areaData) {
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
      if (waterClearance(ctx.undecked, x, z) < 0.1) continue;
      if (deckDistance(areaData.waters, x, z) < 1.5) continue;
      if (colliders.some((k) => Math.hypot(x - k.x, z - k.z) <= k.r + 0.1)) continue;
      spots.push({ x, z, r, spin, tone });
    }
  }
  return spots;
}

function stonesGeometry(spots) {
  const tmpl = new THREE.DodecahedronGeometry(1, 0);
  const src = tmpl.getAttribute('position');
  const per = src.count;
  const pos = new Float32Array(spots.length * per * 3);
  const col = new Float32Array(spots.length * per * 3);
  const c = new THREE.Color();
  let v = 0;
  for (const s of spots) {
    const cos = Math.cos(s.spin), sin = Math.sin(s.spin);
    c.setHex(STONE_COLORS[s.tone]);
    for (let i = 0; i < per; i++) {
      // squashed and a little longer one way, then turned
      const lx = src.getX(i) * s.r * 1.15, ly = src.getY(i) * s.r * 0.6, lz = src.getZ(i) * s.r * 0.85;
      pos[v * 3] = s.x + lx * cos - lz * sin;
      // half sunk: the centre sits at the ground, the lower half below it
      pos[v * 3 + 1] = ly;
      pos[v * 3 + 2] = s.z + lx * sin + lz * cos;
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      v++;
    }
  }
  tmpl.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

// --- styles ------------------------------------------------------------------

// The generic bank for a water: its shore runs, each carrying what the band
// and the stones need to draw it.
function genericRuns(h, { areaId, areaData, box, undecked }) {
  const w = h.footprint;
  const pieces = bankPieces(w, h.waters ?? areaData.waters);
  if (pieces.length === 0) return [];
  const bog = h.style === 'bog';
  const seed = seedFromCode(`waterdress-${areaId}-${w.id}`);
  const out = [];
  for (const ch of chains(pieces)) {
    const sampled = sampleChain(ch, w);
    const ctx = {
      seed,
      stoneSeed: seed + 7,
      period: sampled.closed ? sampled.length : 0,
      waterY: h.y ?? 0.03,
      colors: bog ? BOG_COLORS : (BANK_COLORS[areaId] ?? BANK_COLORS.woods),
      undecked,
      rows: PER,
      profile: bankProfile,
    };
    ctx.wetC = new THREE.Color(ctx.colors.wet);
    ctx.dampC = new THREE.Color(ctx.colors.damp);
    ctx.foamC = new THREE.Color(bog ? FOAM_COLORS.bog : FOAM_COLORS.clear);
    for (const run of clipRuns(sampled, box)) out.push({ ...run, w, ctx });
  }
  return out;
}

// The sea's foam strip: each straight run of its beach (a rect's listed
// `shores`), carried on along its own line SEA_REACH metres past the
// walkable bounds — past the slab's own end where that comes first, so the
// waterline runs on over the apron instead of stopping with the slab.
function seaRuns(h, { areaId, areaData }) {
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
    foamC: new THREE.Color(SEA_FOAM),
  };
  const out = [];
  for (const ch of chains(pieces)) {
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
    out.push({ samples, closed: false, w, ctx: { ...ctx0, fadeFrom: s0, fadeTo: s1 } });
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

function apronMesh(quads, color) {
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
  const [r, g, b] = color;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace),
    roughness: APRON_ROUGHNESS,
    metalness: 0,
    // a hair behind the sea where the two overlap under the slab's edge
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'waterdress:apron';
  return m;
}
const APRON_ROUGHNESS = 0.3;

// One builder per water style.
const STYLE_BUILDERS = { clear: genericRuns, bog: genericRuns, sea: seaRuns };

// ---------------------------------------------------------------------------

/**
 * createWaterDressing(scene, { areaId, areaData, tier, reducedMotion })
 *   → { meshes, update(dt), dispose() }
 *
 * Reads areaData.waterFx (water.js's handles). Areas not in DRESSED_AREAS —
 * the park, the docks, the gorge, the den, the neighbourhood — get a no-op
 * stub and add nothing to the scene.
 */
export function createWaterDressing(scene, { areaId, areaData, tier, reducedMotion = false } = {}) {
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

  const runs = [];
  for (const h of areaData.waterFx) {
    const build = STYLE_BUILDERS[h.style ?? 'clear'] ?? genericRuns;
    runs.push(...build(h, { areaId, areaData, box, undecked }));
  }
  if (runs.length === 0) return NO_DRESSING;

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
  meshes.push(band);

  // The far-sea apron, on every tier: without it the sea ends in a corner.
  const seas = areaData.waterFx.filter((h) => h.style === 'sea');
  const quads = seas.flatMap(apronQuads);
  if (quads.length) meshes.push(apronMesh(quads, waterRamp(seas[0].color ?? 0x4a90c0).deep));

  if (!low) {
    const spots = stoneSpots(runs, areaData);
    if (spots.length) {
      const stones = new THREE.Mesh(
        stonesGeometry(spots),
        new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }),
      );
      stones.name = 'waterdress:stones';
      stones.userData.centres = spots.map(({ x, z, r }) => ({ x, z, r }));
      meshes.push(stones);
    }
  }

  for (const m of meshes) {
    m.castShadow = false;
    m.receiveShadow = false;
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
        m.material.dispose();
      }
    },
  };
}
