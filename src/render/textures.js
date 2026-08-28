import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';

// Procedural, asset-free tiling surface textures.
//
// Everything here is painted onto a <canvas> at runtime. There are no image
// files and there never will be: this game ships as an offline PWA on GitHub
// Pages, so an asset fetch is a failure mode we simply do not have.
//
// The precedent is already in the codebase — world/builder.js paints the TV
// panel onto a canvas and nametag.js paints a tag per cat, both wrapping the
// result in a CanvasTexture with an explicit colorSpace. This module is the
// same trick applied to surfaces, with three things those two do not need:
// memoisation, seamless tiling, and a quality-tier gate.
//
// ---------------------------------------------------------------------------
// TWO NAMESPACES. READ THIS BEFORE CALLING ANYTHING HERE.
// ---------------------------------------------------------------------------
// There are two vocabularies in the surface system and they are NOT the same
// set of names:
//
//   TEXTURES (this file, SURFACE_NAMES) — 7 painted tiles:
//     brick, siding, shingle, plank, cobble, sand, grass
//
//   SURFACE PRESETS (materials.js, SURFACE_PRESET_NAMES) — 16 light
//     responses, of which 7 carry a map, and they do NOT map one-to-one:
//     'wood' uses the plank texture; 'cobble' AND 'wetStone' both use the
//     cobble texture; 'glass', 'bark', 'paintedMetal' and five others carry
//     no texture at all.
//
// A world file speaks PRESET names, because that is what litMaterial takes.
// This file speaks TEXTURE names. Everything a call site should need is
// therefore exported from materials.js in the preset vocabulary —
// litMaterial, surfaceMaterial, repeatFor, tileMetres — and nothing in this
// file takes a preset name.
//
// This was not always true, and the way it went wrong is the reason for the
// warning: repeatFor used to live here, keyed on texture names, so
// `repeatFor('wetStone', w, h)` fell through to a plausible-looking [1, 1]
// and rendered cobbles at three times their intended size, with no error and
// no warning. If you are adding a lookup that a world file might call, put it
// in materials.js and make it speak presets.
//
// ---------------------------------------------------------------------------
// THE ART-DIRECTION RULE, which every number below obeys
// ---------------------------------------------------------------------------
// materials.js line 1 says the cozy low-poly look stays flat and matte, and
// that is deliberate. Texture is exactly how cozy-low-poly turns into
// muddy-low-poly, so these maps are a *hint of grain*, not a skin.
//
// The rule, stated as a property of the finished pixels:
//
//     NO TEXEL IN ANY SURFACE MAY FALL BELOW FLOOR_LUM (0.87) LUMINANCE.
//
// Since every painter's ground is pure white, that also caps the total value
// range inside a tile at 13%. A brick reads as brick-ish at 3m and as flat
// colour at 20m; it never becomes a pattern competing with the silhouettes.
//
// Three mechanisms hold that property, in increasing order of how much they
// can be trusted:
//
//  1. DARKEN ONLY. Every painter starts from an opaque white ground and only
//     lays ink over it. A colour map multiplies the material's `color`, so a
//     white texel is a no-op — the flat colour the call site chose is still
//     the colour you see.
//
//  2. A STACKED-ALPHA BUDGET (see STACK_MAX). This is the part that was got
//     wrong the first time and is worth spelling out, because it is easy to
//     get wrong again: capping each individual stroke does NOT cap the
//     result. Overlapping source-over strokes composite multiplicatively —
//     three 0.14 passes over one texel give 1 - 0.86³ = 0.33, which is more
//     than twice the budget. So the alphas below are chosen so that the
//     WORST-CASE STACK at any texel stays under STACK_MAX, and each painter
//     states its own worst case explicitly. Where two strong marks would
//     otherwise cross (a shingle's split line and its course shadow, a
//     siding lap's shadow and its board curve) the painter is arranged so
//     they abut instead of overlapping, rather than being made weaker.
//
//  3. A HARD CLAMP, applied to the finished pixels (see clampToFloor). The
//     canvas is read back once, flattened onto opaque white, and if its
//     darkest texel is still under the floor, every texel is lerped toward
//     white until it isn't.
//
// (3) is the one that actually GUARANTEES the property. (1) and (2) are
// discipline, and discipline is what produced a near-black cobble grid the
// first time round: the painter laid its grout on a canvas it had forgotten
// to whiten, so the grout's raw RGB stayed the near-black ink itself. The
// clamp's flatten-onto-white step would have caught exactly that. Treat (3)
// as the invariant and (1)/(2) as how the surface gets to look deliberate on
// the way there — a painter that leans on the clamp will find its contrast
// silently scaled down and will just look washed out.
//
// What that costs a call site: a textured material reads slightly darker on
// average than the same colour untextured, because a tile's mean is below 1.
// Measured on the finished pixels, post-clamp:
//     min texel / mean, per surface
//     brick   236  0.948      siding  222  0.988
//     shingle 225  0.963      plank   222  0.980
//     cobble  228  0.961      sand    238  0.998
//     grass   222  0.955
// Brick and grass are the two worth compensating for — lighten the base
// colour by about 5% if a wall or a lawn needs to land on exactly the colour
// it ships today. Sand is deliberately at 0.998: sand's read is entirely
// per-texel VARIANCE and none of it is a shift in overall value, because a
// beach that goes darker when you texture it just looks wet.
//
// The fourth mechanism is free: mipmapping. At 20m a tile is under a pixel
// and trilinear filtering resolves it to its mean — flat colour, which is
// what the silhouette-driven look wants at that distance. So do NOT disable
// generateMipmaps here to "keep it crisp"; the blur at distance is the point.

// ---------------------------------------------------------------------------
// Tile resolution
// ---------------------------------------------------------------------------
// 256x256, power-of-two. 256 rather than 128 because the structured surfaces
// (brick courses, shingle splits, plank seams) carry 1-2px lines, and at 128
// those lines land on half-pixels and alias into a shimmer as the camera
// moves — the single most un-cozy artefact available to us. 256 rather than
// 512 because the budget is texture memory on a phone: 256x256 RGBA is 256KB,
// ~350KB with the mip chain, and the full vocabulary of seven surfaces is
// therefore about 2.4MB *if every one of them is used*. They are built lazily,
// so a walk that never sees a brick never pays for brick. 512 would put the
// same vocabulary at 9.6MB, which is real money on a mid-range Android.
const TILE_PX = 256;

// The darkening ink. A warm near-black rather than pure black, so the shading
// nudges a surface very slightly warm instead of desaturating it toward grey.
// At these alphas the hue shift is barely measurable and entirely intentional
// — it is what stops the grain reading as dirt.
const INK = [40, 34, 28];
const ink = (a) => `rgba(${INK[0]},${INK[1]},${INK[2]},${a})`;

// Rec.709 luminance, 0..1 from 0..255 channels.
const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// The floor, and the stroke budget derived from it.
//
// Compositing alpha `a` of INK over white gives luminance 1 - 0.863a, so the
// floor of 0.87 is reached at a = 0.151. STACK_MAX is set at 0.14 — the
// worst-case stack any painter is allowed to produce — which lands at
// luminance 0.879 and leaves a little margin for the rounding that a
// Uint8ClampedArray does on the way through the clamp.
export const FLOOR_LUM = 0.87;
const STACK_MAX = 0.14;

// ---------------------------------------------------------------------------
// The surface vocabulary
// ---------------------------------------------------------------------------
// Deliberately small and closed. Each entry declares:
//   metres      — how much WORLD SIZE one tile is meant to cover, so callers
//                 can derive a repeat from a face's real dimensions rather
//                 than guessing (see repeatFor).
//   repeat      — the fallback repeat when a caller asks for no specific one.
//                 Sized for a roughly 2m face, the commonest prop in the game.
//
// `metres` is ART scale, not survey scale. Real brick courses are 75mm; at
// that scale a 3.6m house wall carries 48 courses and reads as noise from any
// distance a player actually stands at. Every figure below is roughly 2-3x
// life size, which is the same exaggeration the low-poly geometry already
// applies to doors, windows and cats.
const SURFACES = {
  // Running-bond brick. 4 courses, 2 stretchers per course.
  brick: { metres: 0.9, repeat: [2, 2] },
  // Horizontal lap siding / clapboard. 6 laps per tile ~= 0.2m exposure,
  // against a real 0.15m — the closest to life-size in the set, because lap
  // siding is the one surface whose whole read is the rhythm of its shadow
  // lines and stretching it loses that.
  siding: { metres: 1.2, repeat: [2, 2] },
  // Roof shingle. 4 courses, 4 tabs each.
  shingle: { metres: 1.0, repeat: [3, 3] },
  // Sawn planking with grain — decking, fences, crates, dock boards.
  // 4 planks per tile ~= 0.25m boards against a real 0.14m.
  plank: { metres: 1.0, repeat: [2, 2] },
  // Cobble setts. 4x4 stones ~= 0.3m each against real setts of 0.1-0.2m.
  // Chunky on purpose: a cobble you cannot pick out individually is just
  // noise, and noise is the thing this module exists not to add.
  cobble: { metres: 1.2, repeat: [3, 3] },
  // Beach sand. Fine speckle, so the tile has to stay small in world terms
  // or the grain stops being grain and becomes blotches.
  sand: { metres: 0.8, repeat: [6, 6] },
  // Lawn mottle. The largest tile in the set by a wide margin: grass is
  // applied to the biggest single surfaces in the game, and a small repeat
  // on a 40m lawn produces a visible plaid that no amount of subtlety saves.
  grass: { metres: 3.0, repeat: [8, 8] },
};

export const SURFACE_NAMES = Object.freeze(Object.keys(SURFACES));

// ---------------------------------------------------------------------------
// Quality tier
// ---------------------------------------------------------------------------
// render/quality.js resolves a tier per walk; the low tier is what a phone
// and a reduced-motion desktop get, and it is where texture memory actually
// hurts. On 'low' this module builds nothing at all and hands back null, so a
// low-tier walk pays zero bytes — the materials still get their preset
// roughness/metalness (those are free, they are two floats in a uniform
// block), they simply render as flat colour.
//
// HOW A CALLER OPTS IN: call setTextureTier(tier) once in startWalk, on the
// line after resolveQuality(...) and BEFORE the world is built. Anything
// built before that call uses whatever tier was set last.
//
// The default is 'high' because that is the correct answer for the machine
// that never calls this at all (a desktop dev session, a test harness poking
// at one prop). A phone always goes through startWalk, so it always gets its
// gate set before geometry exists.
let tierName = 'high';

// Accepts either a tier object from resolveQuality ({ name: 'high' | 'low' })
// or the bare string. Anything unrecognised leaves the tier alone rather than
// silently disabling textures — a typo should not quietly cost the look.
export function setTextureTier(tier) {
  const name = typeof tier === 'string' ? tier : tier && tier.name;
  if (name === 'high' || name === 'low') tierName = name;
  return tierName;
}

export function getTextureTier() {
  return tierName;
}

// --- Anisotropy -------------------------------------------------------
// Sharpness of a tile viewed at a grazing angle. Trilinear mipmapping alone
// picks a blurry level for a surface raked away from the camera, and on a
// large tiled ground plane that reads as a crawling shimmer as the cat walks.
//
// The Docks ground is the case that forced this: a 120m plane at 100x100
// cobble tiles, seen from a 2.2m-high camera, is almost entirely grazing
// angle. Static frames looked clean; the risk is only visible in motion.
//
// It lives HERE and not in a world file for the reason the two-namespace note
// above gives about shared state: the base tiles are memoised for the app's
// lifetime and shared by every area, so a world file setting `map.anisotropy`
// would silently mutate every other area's tiles too.
//
// The cap is the renderer's (`renderer.capabilities.getMaxAnisotropy()`), and
// this module has no renderer — so main.js passes it in, once, next to
// setTextureTier. Until it does, 1 is three.js's own default and nothing
// changes. Applied to already-built textures as well as future ones, so the
// call order between this and the first walk does not matter.
let anisotropy = 1;

export function setTextureAnisotropy(max) {
  const n = Math.floor(Number(max));
  if (!Number.isFinite(n) || n < 1) return anisotropy;
  anisotropy = n;
  for (const tex of bases.values()) applyAnisotropy(tex);
  for (const tex of variants.values()) applyAnisotropy(tex);
  return anisotropy;
}

export function getTextureAnisotropy() {
  return anisotropy;
}

function applyAnisotropy(tex) {
  if (!tex || tex.anisotropy === anisotropy) return;
  tex.anisotropy = anisotropy;
  // Anisotropy is a sampler parameter, so the GPU-side texture has to be told
  // to re-read its parameters. Clones share one Source, and every clone
  // carries the same value, so they cannot disagree about it.
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Memoisation
// ---------------------------------------------------------------------------
// Same lifecycle buildEnvMap documents: built lazily on first use, then kept
// for the app's lifetime and reused across every walk. It is never disposed
// per-walk, and endWalk's scene traversal must not dispose it either — these
// textures outlive the scene that first asked for them on purpose. Rebuilding
// per walk would repaint seven canvases and strand seven GPU uploads every
// time the player steps outside, which is a leak with extra steps.
//
// Two caches, and the split matters:
//   `bases`    name -> the master Texture, at the surface's default repeat.
//   `variants` "name|rx|ry" -> a clone of the master with its own repeat.
//
// The clone is what makes per-prop tiling density affordable. THREE.Texture
// clones share their `Source`, and WebGLTextures keys its GPU allocation on
// (Source, sampler-parameters) — repeat is a uniform, not a sampler
// parameter, so N clones differing only in repeat are ONE texture on the GPU.
// Verified against the bundled three (WebGLTextures.initTexture /
// getTextureCacheKey), not assumed. The variant cache exists so that call
// sites asking for the same density also share one JS object, which keeps
// three's material/uniform bookkeeping happy.
const bases = new Map();
const variants = new Map();

// Test-only. The caches are app-lifetime by design, so nothing in the game
// should ever call this; it exists so a test file can assert memoisation from
// a known-empty state without depending on which test ran first.
export function __resetSurfaceTextures() {
  bases.clear();
  variants.clear();
  tierName = 'high';
}

// Returns the tiling texture for a surface, or null when there isn't one to
// give. Null is a normal, expected answer in three cases and every caller
// must treat it as "no map, just use the flat colour":
//   * no `document` — headless Vitest and any SSR-ish context. Same guard,
//     same contract as makeNameTag.
//   * the low quality tier (see above).
//   * an unknown surface name.
//
// opts.repeat is [x, y]; omit it to get the surface's default density.
export function surfaceTexture(name, { repeat } = {}) {
  const spec = SURFACES[name];
  if (!spec) return null;
  if (tierName === 'low') return null;
  if (typeof document === 'undefined') return null;

  const base = baseTexture(name, spec);
  if (!base) return null;
  if (!repeat) return base;

  const rx = repeat[0];
  const ry = repeat[1];
  if (rx === spec.repeat[0] && ry === spec.repeat[1]) return base;

  const key = `${name}|${rx}|${ry}`;
  let variant = variants.get(key);
  if (!variant) {
    variant = base.clone();
    variant.repeat.set(rx, ry);
    applyAnisotropy(variant);
    // A clone starts life with needsUpdate already set by the CanvasTexture
    // constructor, so the shared Source uploads once and the clone binds it.
    variants.set(key, variant);
  }
  return variant;
}

function baseTexture(name, spec) {
  let tex = bases.get(name);
  if (tex) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Seeded from the surface name, so a given surface is byte-identical on
  // every boot, on every machine, in every walk. No bare Math.random anywhere
  // in this module: a texture that differs between two co-walkers' clients is
  // a difference they can see, and "the cobbles look different on your
  // screen" is not a bug anyone wants to chase.
  PAINTERS[name](ctx, TILE_PX, mulberry32(seedFromCode(name)));
  clampToFloor(ctx, TILE_PX);

  tex = new THREE.CanvasTexture(canvas);
  // sRGB because these are colour maps multiplied against sRGB material
  // colours. Getting this wrong is the classic washed-out-texture bug; both
  // existing canvas-texture call sites in this repo set it, and so does this.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(spec.repeat[0], spec.repeat[1]);
  tex.name = `surface:${name}`;
  // Load-bearing beyond identification: endWalk's teardown traversal disposes
  // `m.map` on every material it finds, and these tiles are memoised for the
  // app's lifetime and shared by every later walk. walk.js keys its skip on
  // this `surface:` prefix, and THREE.Texture.copy carries the name onto the
  // repeat-variant clones, so one check covers bases and variants alike.
  applyAnisotropy(tex);
  bases.set(name, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// The clamp — where the pixel-level guarantee actually lives
// ---------------------------------------------------------------------------
// One readback pass over 256x256 at first use of a surface, so seven passes
// across the whole app's lifetime. Two steps, and both matter:
//
//   1. FLATTEN ONTO OPAQUE WHITE. A material map is sampled for its RGB and
//      (unless the material is transparent) its alpha is ignored entirely.
//      So a painter that leaves a texel at alpha 0.14 has NOT painted a light
//      grey — it has painted the raw ink, and the shader will read it as
//      near-black. That is not hypothetical: it is exactly how the first cut
//      of paintCobble shipped a black grid. Compositing over white here makes
//      the canvas mean what the painter meant, and makes the whole class of
//      forgotten-ground bug impossible rather than merely tested-for.
//
//   2. LERP TO THE FLOOR. If the darkest texel is still below FLOOR_LUM,
//      every texel's *distance from white* is scaled by one shared factor.
//      One factor, applied per channel, so the structure the painter drew and
//      the ink's warm hue both survive exactly — the tile gets quieter, never
//      flatter in some places than others.
//
// Guarded for the headless path: with no real 2D context there is no
// getImageData, and the painters were drawing into a stub anyway.
//
// Returns true when it actually ran, so a test can tell the difference
// between "clamped" and "silently skipped".
export function clampToFloor(ctx, size) {
  if (!ctx || typeof ctx.getImageData !== 'function' || typeof ctx.putImageData !== 'function') {
    return false;
  }
  // `img` is dereferenced before `d` is checked, so it has to be guarded on
  // its own. A blanket Proxy stub — which six world test files use as their
  // fake canvas — answers `typeof ctx.getImageData === 'function'` with true
  // and then returns undefined, so the typeof guard above passes and
  // `img.data` throws. That crashed every world test the moment an area
  // builder asked for a texture, and the first integrator hit it immediately.
  // Guarding here rather than in each test's stub is what stops the next four
  // area integrators from each rediscovering it and patching it their own way.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img?.data;
  if (!d || d.length < size * size * 4) return false;

  let minL = 1;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const r = d[i] * a + 255 * (1 - a);
    const g = d[i + 1] * a + 255 * (1 - a);
    const b = d[i + 2] * a + 255 * (1 - a);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
    const L = lum(r, g, b);
    if (L < minL) minL = L;
  }

  if (minL < FLOOR_LUM) {
    const scale = (1 - FLOOR_LUM) / (1 - minL);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - (255 - d[i]) * scale;
      d[i + 1] = 255 - (255 - d[i + 1]) * scale;
      d[i + 2] = 255 - (255 - d[i + 2]) * scale;
    }
  }

  ctx.putImageData(img, 0, 0);
  return true;
}

// The world size one tile of a TEXTURE covers, or null if there is no such
// texture. Texture namespace only — see the note at the top of this file.
//
// This is the raw table lookup that materials.js's repeatFor() and
// tileMetres() are built on. It is exported for that one caller. If you are
// in a world file and want a repeat for a prop, you want THEIR versions, not
// this: they speak the surface-preset vocabulary that litMaterial takes, and
// this does not.
export function textureTileMetres(textureName) {
  const spec = SURFACES[textureName];
  return spec ? spec.metres : null;
}

export function isTextureName(name) {
  return Object.prototype.hasOwnProperty.call(SURFACES, name);
}

// ---------------------------------------------------------------------------
// Painters
// ---------------------------------------------------------------------------
// Every painter must satisfy two rules.
//
// SEAMLESS: anything crossing an edge is drawn again shifted by a whole tile,
// and anything with per-unit randomness indexes a precomputed table by unit
// position (never by draw order), so a unit and its wrapped twin get the SAME
// jitter. Getting that second one wrong produces a seam that is invisible in
// a screenshot of the tile and glaring on a wall.
//
// IN BUDGET: the worst-case STACK of overlapping strokes at any one texel
// stays under STACK_MAX. Each painter states its own worst case in a comment
// and those comments are arithmetic, not aspiration — 1 - Π(1 - aᵢ). If you
// add a stroke to a painter, redo that product.

// Per-painter alphas. Deliberately NOT one shared set: the whole lesson of
// the first cut is that "every stroke <= X" says nothing about the result, so
// each painter's numbers are sized against ITS OWN overlap pattern.
const BRICK_FACE = 0.075; // a brick against its mortar
const BRICK_JITTER = 0.04; // +/- per-brick value variation
const BRICK_BED = 0.065; // the horizontal bed joint, drawn in the mortar gap

const SIDING_LAP = 0.1; // the shadow under each lap: the whole read
const SIDING_CURVE = 0.05; // the board's own curve, drawn below the lap band
const SIDING_GRAIN = 0.035; // timber grain, max

const SHINGLE_TAB = 0.035; // a tab against the course line
const SHINGLE_JITTER = 0.02; // +/- per-tab
const SHINGLE_LINE = 0.085; // both the split and the course shadow; they abut

const PLANK_BOARD = 0.04; // board-to-board variation, max
const PLANK_SEAM = 0.1; // the gap between boards
const PLANK_GRAIN = 0.05; // grain streaks, max

const COBBLE_GROUT = 0.12; // the channel between setts
const COBBLE_JITTER = 0.02; // +/- per-stone, on the stones only

const SAND_FINE = 0.04; // one grain, max
const SAND_COARSE = 0.025; // the 2px pass, max

const GRASS_BLOB = 0.028; // one mottle patch at its centre, max
const GRASS_FLECK = 0.028; // a blade fleck, max

// Deterministic per-unit jitter table. `count` entries drawn once, then
// indexed by a possibly-negative unit index — which is how a unit drawn off
// the left edge gets the same value as its twin drawn off the right.
function jitterTable(rand, count, amp) {
  const t = new Array(count);
  for (let i = 0; i < count; i++) t[i] = (rand() - 0.5) * 2 * amp;
  return t;
}
const wrapIndex = (i, n) => ((i % n) + n) % n;

// The opaque white ground. Every painter's first call, without exception —
// see the clamp's step 1 for what happens to a painter that skips it.
function fillWhite(ctx, S) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
}

// --- brick -----------------------------------------------------------------
// Running bond: 4 courses of 2 stretchers, every other course offset by half
// a brick. White ground = the mortar (mortar is lighter than brick on every
// real wall, which is lucky, because darken-only painting wants the ground to
// be the lightest thing in the tile).
//
// Worst-case stack: the bed joint is drawn INSIDE the mortar gap, in the
// JOINT/2 band the bricks are inset out of, so it never lands on a brick.
// Worst texel is therefore a single dark brick: 0.075 + 0.04 = 0.115.
function paintBrick(ctx, S, rand) {
  const COURSES = 4;
  const PER_COURSE = 2;
  const H = S / COURSES;
  const W = S / PER_COURSE;
  // The joint. ~4px at 256 — thin enough to vanish into flat colour by the
  // second mip level, thick enough to survive the first.
  const JOINT = Math.max(2, Math.round(S / 64));
  fillWhite(ctx, S);
  for (let row = 0; row < COURSES; row++) {
    const jitter = jitterTable(rand, PER_COURSE, BRICK_JITTER);
    const y = row * H;
    const offset = row % 2 ? W / 2 : 0;
    // -1 .. PER_COURSE inclusive: the extra units on each side are the
    // wrapped halves, and they read the same jitter slot as their twin.
    for (let i = -1; i <= PER_COURSE; i++) {
      ctx.fillStyle = ink(BRICK_FACE + jitter[wrapIndex(i, PER_COURSE)]);
      ctx.fillRect(offset + i * W + JOINT / 2, y + JOINT / 2, W - JOINT, H - JOINT);
    }
  }
  // The horizontal bed joints get a touch more weight than the perpends, as
  // they do on a real wall where they carry the run of the courses.
  ctx.fillStyle = ink(BRICK_BED);
  for (let row = 0; row < COURSES; row++) ctx.fillRect(0, row * H, S, JOINT / 2);
}

// --- siding ----------------------------------------------------------------
// Clapboard. The read is entirely the shadow under each lap, so that is the
// only strong mark; the faint gradient below it is the board's own curve
// catching light, and the vertical streaks are just enough timber grain to
// stop the boards looking like extruded plastic.
//
// The curve gradient starts BELOW the lap shadow rather than under it. That
// is not a detail: overlapped, those two are the pair that put the first cut
// of this surface 23% out of range. Abutting, they cost nothing and the board
// still reads as curved, because the eye takes the shadow and the falloff as
// one continuous thing.
//
// Worst-case stack: lap shadow ∘ grain = 1 - (0.90)(0.965) = 0.1315.
function paintSiding(ctx, S, rand) {
  const LAPS = 6;
  const H = S / LAPS;
  const SHADOW = Math.max(2, Math.round(S / 72)); // ~4px at 256
  fillWhite(ctx, S);
  for (let i = 0; i < LAPS; i++) {
    const y = i * H;
    ctx.fillStyle = ink(SIDING_LAP);
    ctx.fillRect(0, y, S, SHADOW);
    if (typeof ctx.createLinearGradient === 'function') {
      // A linear gradient rather than a second flat band because a hard
      // second edge reads as two boards, not one board with a shadow.
      const top = y + SHADOW;
      const g = ctx.createLinearGradient(0, top, 0, top + H * 0.4);
      g.addColorStop(0, ink(SIDING_CURVE));
      g.addColorStop(1, ink(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, top, S, H * 0.4);
    }
  }
  // Vertical grain. Full-height lines, so they tile vertically for free, and
  // integer x inside [0,S) so they tile horizontally for free too.
  for (let n = 0; n < 34; n++) {
    ctx.fillStyle = ink(SIDING_GRAIN * (0.4 + rand() * 0.6));
    ctx.fillRect(Math.floor(rand() * S), 0, 1, S);
  }
}

// --- shingle ---------------------------------------------------------------
// Asphalt/slate tabs: 4 courses of 4, half-offset, each course casting a line
// of shadow onto the one below. Per-tab jitter is what sells it — a roof of
// identically-valued tabs reads as graph paper.
//
// The split lines run from the bottom of the course shadow rather than the
// top of the course, so a split and a shadow never cross. Same reasoning as
// siding: the two strong marks abut, and the L-junction at each tab corner
// (which is where the first cut stacked three passes into a 26% range) simply
// stops existing.
//
// Worst-case stack: tab ∘ line = 1 - (0.945)(0.915) = 0.1352.
function paintShingle(ctx, S, rand) {
  const COURSES = 4;
  const PER_COURSE = 4;
  const H = S / COURSES;
  const W = S / PER_COURSE;
  const SPLIT = Math.max(1, Math.round(S / 128)); // ~2px: tabs butt, they do not grout
  const SHADOW = Math.max(2, Math.round(S / 64));
  fillWhite(ctx, S);
  for (let row = 0; row < COURSES; row++) {
    const jitter = jitterTable(rand, PER_COURSE, SHINGLE_JITTER);
    const y = row * H;
    const offset = row % 2 ? W / 2 : 0;
    for (let i = -1; i <= PER_COURSE; i++) {
      const x = offset + i * W;
      ctx.fillStyle = ink(SHINGLE_TAB + jitter[wrapIndex(i, PER_COURSE)]);
      ctx.fillRect(x, y, W, H);
    }
    // The overlap shadow along the butt edge of the course above.
    ctx.fillStyle = ink(SHINGLE_LINE);
    ctx.fillRect(0, y, S, SHADOW);
    // The splits between tabs, starting where the shadow ends.
    for (let i = -1; i <= PER_COURSE; i++) {
      ctx.fillStyle = ink(SHINGLE_LINE);
      ctx.fillRect(offset + i * W, y + SHADOW, SPLIT, H - SHADOW);
    }
  }
}

// --- plank -----------------------------------------------------------------
// Sawn boards with grain. The seams are the structure; the grain is the
// texture. Grain lines are sine-warped with a whole number of periods across
// the tile height so their x at y=0 matches their x at y=S — that is what
// makes a wavy line tile vertically, and it is the reason the frequency is an
// integer rather than something prettier.
//
// The wander amplitude is subtracted from the streak's usable span, so a
// streak can never wash across a seam. That keeps grain and seam from ever
// stacking, and also stops grain from a board bleeding onto its neighbour.
//
// Worst-case stack: board ∘ seam = 1 - (0.96)(0.90) = 0.136.
function paintPlank(ctx, S, rand) {
  const PLANKS = 4;
  const W = S / PLANKS;
  const SEAM = Math.max(2, Math.round(S / 96));
  fillWhite(ctx, S);
  for (let p = 0; p < PLANKS; p++) {
    const x0 = p * W;
    // Board-to-board value variation: real timber never comes off the stack
    // matched, and this is the cheapest way to say so.
    ctx.fillStyle = ink(Math.max(0, (rand() - 0.5) * 2 * PLANK_BOARD));
    ctx.fillRect(x0, 0, W, S);
    ctx.fillStyle = ink(PLANK_SEAM);
    ctx.fillRect(x0, 0, SEAM, S);
    // ~7 grain streaks per board.
    for (let n = 0; n < 7; n++) {
      const amp = 1 + rand() * (W * 0.1);
      const span = W - SEAM - 2 * amp;
      if (span <= 0) continue;
      const baseX = x0 + SEAM + amp + rand() * span;
      const freq = 1 + Math.floor(rand() * 3); // integer periods => vertical tiling
      const phase = rand() * Math.PI * 2;
      ctx.fillStyle = ink(PLANK_GRAIN * (0.5 + rand() * 0.5));
      for (let y = 0; y < S; y++) {
        const dx = Math.sin((y / S) * Math.PI * 2 * freq + phase) * amp;
        ctx.fillRect(Math.round(baseX + dx), y, 1, 1);
      }
    }
  }
}

// --- cobble ----------------------------------------------------------------
// Setts on a 4x4 grid. This is the one surface where the ground colour is not
// also the lightest thing in the tile: cobble grout really is darker than the
// stone, so the grout is laid as one flat pass over white and the stones are
// then painted back to opaque white on top. Each stone stays strictly inside
// its cell, which is what makes the tile seamless without any wrapped copies.
//
// The first cut of this painter laid the grout WITHOUT whitening the canvas
// first. Over transparent black, an 0.12-alpha ink fill leaves raw RGB of
// (40,34,28) — near-black — and a material map is sampled for RGB with its
// alpha ignored, so the road rendered as a black grid. fillWhite below is
// that fix; the clamp's flatten-onto-white step is the backstop that makes
// the same mistake un-shippable in any future painter.
//
// Worst-case stack: grout alone, 0.12. The per-stone jitter is filled on the
// stone path only, so it never lands on grout. Grout is a touch under the
// other surfaces' strongest marks on purpose — a road is seen at a shallow
// grazing angle, which stretches a grid pattern across far more screen than a
// wall's equivalent, and the whole point of this surface is not to be a grid.
function paintCobble(ctx, S, rand) {
  const CELLS = 4;
  const C = S / CELLS;
  fillWhite(ctx, S);
  ctx.fillStyle = ink(COBBLE_GROUT);
  ctx.fillRect(0, 0, S, S);
  for (let row = 0; row < CELLS; row++) {
    for (let col = 0; col < CELLS; col++) {
      // Inset 8-14% of the cell, jittered per stone and independently per
      // edge, so the grout channels wander instead of ruling straight lines
      // across the road. Straight grout is the tell that gives away a grid.
      const l = C * (0.08 + rand() * 0.06);
      const t = C * (0.08 + rand() * 0.06);
      const r = C * (0.08 + rand() * 0.06);
      const b = C * (0.08 + rand() * 0.06);
      const x = col * C + l;
      const y = row * C + t;
      const w = C - l - r;
      const h = C - t - b;
      const rad = Math.min(w, h) * (0.22 + rand() * 0.16);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, rad);
      else ctx.rect(x, y, w, h);
      // Opaque white: this erases the grout under the stone rather than
      // tinting it, which is what keeps the stone at the tile's maximum.
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      // Per-stone value, on the stone only. Half the amplitude of brick's,
      // because a road is seen at a grazing angle where value differences
      // stretch and exaggerate, whereas a wall is seen face on.
      ctx.fillStyle = ink(Math.max(0, (rand() - 0.5) * COBBLE_JITTER));
      ctx.fill();
    }
  }
}

// --- sand ------------------------------------------------------------------
// Pure speckle at two scales. No structure at all: the moment sand acquires a
// pattern it stops being sand. The two scales exist because a single-pixel
// speckle disappears entirely by mip level 2, and the 2px pass is what keeps
// a hint of tooth on the beach at mid distance.
//
// Worst-case stack is statistical rather than structural — dots land where
// they land. At 2600 fine dots over 65536 texels the mean is 0.04 dots per
// texel, so a triple hit (0.04 ∘ 0.04 ∘ 0.04 ∘ coarse = 0.14) is expected on
// well under one texel per tile. That tail is precisely what the clamp is
// for, and it is why sand's per-dot alphas are the smallest in the set.
function paintSand(ctx, S, rand) {
  fillWhite(ctx, S);
  for (let n = 0; n < 2600; n++) {
    ctx.fillStyle = ink(SAND_FINE * (0.3 + rand() * 0.7));
    ctx.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 1, 1);
  }
  for (let n = 0; n < 700; n++) {
    ctx.fillStyle = ink(SAND_COARSE * (0.3 + rand() * 0.7));
    // Modulo keeps the 2x2 block inside the tile, so no wrapped copy needed.
    ctx.fillRect(Math.floor(rand() * S) % (S - 1), Math.floor(rand() * S) % (S - 1), 2, 2);
  }
}

// --- grass -----------------------------------------------------------------
// Low-frequency mottle — patches of slightly deeper green — plus a scatter of
// darker flecks for blade detail. Soft radial gradients rather than shapes,
// because a lawn has no edges in it anywhere, and every blob is drawn nine
// times at whole-tile offsets so the ones straddling an edge come back on the
// far side. Nine unconditional copies rather than a nearness test: it is 26
// extra fills once in the app's lifetime, and the test is the kind of thing
// that is subtly wrong for months.
//
// Like sand, this surface's overlap is statistical: blobs are wide and do
// pile up. Four overlapping blob centres plus a fleck is 1 - (0.972)^5 =
// 0.133, which is the practical worst case and is in budget; a deeper pile-up
// than that is rare and is the clamp's job.
function paintGrass(ctx, S, rand) {
  fillWhite(ctx, S);
  const BLOBS = 26;
  for (let n = 0; n < BLOBS; n++) {
    const cx = rand() * S;
    const cy = rand() * S;
    const rad = S * (0.09 + rand() * 0.13);
    const a = GRASS_BLOB * (0.5 + rand() * 0.5);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const x = cx + ox * S;
        const y = cy + oy * S;
        if (typeof ctx.createRadialGradient === 'function') {
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
          g.addColorStop(0, ink(a));
          g.addColorStop(1, ink(0));
          ctx.fillStyle = g;
        } else {
          ctx.fillStyle = ink(a);
        }
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  }
  for (let n = 0; n < 900; n++) {
    ctx.fillStyle = ink(GRASS_FLECK * (0.4 + rand() * 0.6));
    ctx.fillRect(Math.floor(rand() * S), Math.floor(rand() * S), 1, 2);
  }
}

const PAINTERS = {
  brick: paintBrick,
  siding: paintSiding,
  shingle: paintShingle,
  plank: paintPlank,
  cobble: paintCobble,
  sand: paintSand,
  grass: paintGrass,
};

// Exposed for the pixel-level test, which needs to know what "in budget"
// means without re-deriving it. Not used by the game.
export const __BUDGET = Object.freeze({ FLOOR_LUM, STACK_MAX, INK: Object.freeze([...INK]) });
