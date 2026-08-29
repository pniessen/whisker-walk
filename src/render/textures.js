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
//   TEXTURES (this file, SURFACE_NAMES) — 8 painted tiles:
//     brick, siding, shingle, plank, cobble, sand, gravel, grass
//
//   SURFACE PRESETS (materials.js, SURFACE_PRESET_NAMES) — 17 light
//     responses, of which 9 carry a map, and they do NOT map one-to-one
//     (9 presets over 8 tiles, because two presets share one):
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
//     min texel / mean / pixel sigma, per surface
//     brick   236  0.947  4.3      siding  222  0.980  6.9
//     shingle 225  0.963  5.9      plank   223  0.979  6.0
//     cobble  228  0.954 12.9      sand    228  0.969  6.2
//     gravel  225  0.961  7.9      grass   237  0.988  2.4
// Brick is the one worth compensating for — lighten the base colour by about
// 5% if a wall needs to land on exactly the colour it ships today; cobble,
// shingle and sand are 3-4% and only matter if a prop is colour-matched to a
// neighbour that is untextured.
//
// Sigma is in 8-bit steps and is the number to look at when asking "will
// anyone see this". Anything at or above ~2 reads on a real screen. Sand
// originally shipped at sigma 0.5 — under one value step — and was measured
// on the real renderer as literally invisible across three areas; see
// paintSand for the reasoning error that produced it.
//
// The fourth mechanism is free: mipmapping. At 20m a tile is under a pixel
// and trilinear filtering resolves it to its mean — flat colour, which is
// what the silhouette-driven look wants at that distance. So do NOT disable
// generateMipmaps here to "keep it crisp"; the blur at distance is the point.
//
// ---------------------------------------------------------------------------
// THE SECOND CHANNEL: derived normal maps (VISUAL-PASS.md 5.1)
// ---------------------------------------------------------------------------
// Everything above is about the COLOUR map and none of it has changed. The
// normal map is a second, derived channel over the same finished pixels:
// luminance is read back as a height field, Sobel gives its gradient, and the
// gradient is packed as a tangent-space normal. See deriveNormalPixels.
//
// Three properties of that arrangement are the whole reason it is allowed to
// exist next to the rules above:
//
//   * IT ADDS NOTHING TO THE COLOUR TILE. The painters are untouched, the
//     floor is untouched, the clamp is untouched and the stacked-alpha budget
//     is untouched. The derivation runs AFTER clampToFloor, on a separate
//     canvas, and never writes to the colour one. If you are here to make a
//     surface louder, this is not the lever — see VISUAL-PASS.md section 2.
//
//   * THE PAINTERS ARE ALREADY HEIGHT FIELDS, for free, because they are
//     darken-only over white. Ink depth IS depth: a mortar joint at 0.065
//     alpha is literally deeper than a brick face at 0.075 minus its jitter,
//     and a cobble grout channel at 0.12 is the deepest thing in the
//     vocabulary. So the RELATIVE relief across all eight surfaces is already
//     art-directed and a single shared gain preserves it. What the per-surface
//     `normalScale` in materials.js then dials is not "how bumpy is this
//     material" — the painter answered that — but "how much does the LIGHT
//     amplify it", which is a property of viewing geometry, not of the tile.
//
//   * IT IS HIGH-TIER ONLY, gated on the same switch the colour tiles use.
//
// One warning that is easy to miss and expensive to learn. The luminance floor
// caps the colour map's total contrast at 13%, and the eye reads that as a
// hint. It does NOT cap the normal map's effect, because a normal map does not
// multiply the surface — it steers a nonlinear lighting term. Under the 19.1
// degree sun this game now has, a ground plane's diffuse response is
// sin(19.1 deg) = 0.33, and tilting a facet by theta changes it to
// sin(19.1 + theta): +67% at 14 degrees of tilt. The same 14 degrees on a
// VERTICAL wall, where the sun is nearly perpendicular, changes N.L by about
// 0.33 * theta — five percent. That factor of roughly ten between a ground
// surface and a wall surface under this specific sun is why the normalScale
// table in materials.js is not one number, and why it is not the number your
// intuition from a noon sun would give you.

// ---------------------------------------------------------------------------
// Tile resolution
// ---------------------------------------------------------------------------
// 256x256, power-of-two. 256 rather than 128 because the structured surfaces
// (brick courses, shingle splits, plank seams) carry 1-2px lines, and at 128
// those lines land on half-pixels and alias into a shimmer as the camera
// moves — the single most un-cozy artefact available to us. 256 rather than
// 512 because the budget is texture memory on a phone: 256x256 RGBA is 256KB,
// ~350KB with the mip chain, and the full vocabulary of eight surfaces is
// therefore about 2.8MB *if every one of them is used*. They are built lazily,
// so a walk that never sees a brick never pays for brick. 512 would put the
// same vocabulary at 11MB, which is real money on a mid-range Android.
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
  // Road aggregate — an unmetalled lane, a park's gravel walk, a chip-sealed
  // street. Sand's coarser, angrier cousin, and it exists because two areas
  // were borrowing `sand` for roads and inheriting the wrong SCALE: sand's
  // grains are ~6mm at its 0.8m tile, where road aggregate is 10-40mm.
  //
  // 1.4m per tile is what makes those millimetres come out right. At 256px
  // that is 5.5mm of world per texel, so the 2px grain octave is an 11mm
  // fine, the 8px clump octave is a 44mm patch, and the scattered chips at
  // 4-7px are 22-38mm stones. That is the real grading of a crushed
  // aggregate, not an adjective.
  gravel: { metres: 1.4, repeat: [2, 2] },
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

// The normal-map half of the same gate, tracked separately because
// quality.js tracks it separately (`tier.normalMaps`). Two flags rather than
// one because they answer two different questions — "does this device get
// painted tiles at all" and "does it get the second, derived channel" — and
// the plan's per-tier budget table lists them as two rows. A future tier that
// wants colour tiles without normals has somewhere to say so.
let normalMapsEnabled = true;

// Accepts either a tier object from resolveQuality ({ name, normalMaps, … })
// or the bare string. Anything unrecognised leaves the tier alone rather than
// silently disabling textures — a typo should not quietly cost the look.
//
// A bare string carries no `normalMaps`, so it falls back to the answer the
// named tier would have given ('high' yes, 'low' no). That keeps
// setTextureTier('high') meaning the same thing it means in every test and
// harness that already says it, while a real resolveQuality tier stays the
// authority when one is passed.
export function setTextureTier(tier) {
  const name = typeof tier === 'string' ? tier : tier && tier.name;
  if (name !== 'high' && name !== 'low') return tierName;
  tierName = name;
  normalMapsEnabled =
    tier && typeof tier === 'object' && typeof tier.normalMaps === 'boolean'
      ? tier.normalMaps
      : name === 'high';
  return tierName;
}

export function getTextureTier() {
  return tierName;
}

export function getNormalMapsEnabled() {
  return normalMapsEnabled;
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
  // The normal maps too, and for exactly the argument above rather than as a
  // formality: the Docks ground is the case that forced anisotropy, and a
  // normal map raked to the horizon aliases harder than the colour map does,
  // because it drives a nonlinear lighting term rather than a multiply.
  for (const tex of normals.values()) applyAnisotropy(tex);
  for (const tex of normalVariants.values()) applyAnisotropy(tex);
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
// per walk would repaint eight canvases and strand eight GPU uploads every
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

// The normal channel, cached the same way and for the same reasons:
//   `normals`        name -> the master normal Texture, at the default repeat.
//   `normalVariants` "name|rx|ry" -> a clone with its own repeat.
//
// The one extra cache is `sourceCtx`: name -> the 2D context of the COLOUR
// tile's canvas, kept so the derivation can read the finished pixels back
// without repainting. It holds nothing the `bases` texture is not already
// holding — a CanvasTexture keeps its canvas alive as `tex.image` — so this
// is a reference, not a second allocation.
//
// Populated by baseTexture, never by the normal path, which is what makes the
// dependency one-directional: a normal map cannot exist without its colour
// tile, and a colour tile never triggers a normal build.
const normals = new Map();
const normalVariants = new Map();
const sourceCtx = new Map();

// Test-only. The caches are app-lifetime by design, so nothing in the game
// should ever call this; it exists so a test file can assert memoisation from
// a known-empty state without depending on which test ran first.
export function __resetSurfaceTextures() {
  bases.clear();
  variants.clear();
  normals.clear();
  normalVariants.clear();
  sourceCtx.clear();
  tierName = 'high';
  normalMapsEnabled = true;
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

// ---------------------------------------------------------------------------
// surfaceMaps — the ONLY way to get a normal map, and why
// ---------------------------------------------------------------------------
// Returns { map, normalMap } for a surface. Both may be null (headless, low
// tier, unknown name); normalMap alone may be null (normal maps off for the
// tier, or a context with no readback).
//
// THIS IS THE ONLY EXPORTED PATH TO A NORMAL MAP, deliberately. A colour map
// and a normal map that disagree about `repeat` do not fail — they render, and
// the relief slides across the colour it is supposed to belong to, at a beat
// frequency set by the ratio of the two repeats. On a 120m ground plane at
// 100x100 tiles that is a slow crawling moire that looks like a shader bug and
// is very hard to trace back to a number in a world file.
//
// So the caller never gets to state the normal map's repeat at all. The
// normal's density is read off the COLOUR TEXTURE THAT WAS ACTUALLY RESOLVED,
// after the surface default, the variant cache and the "asked for the default,
// got the base" shortcut have all had their say. There is no argument to pass
// wrongly and nothing for a call site to remember.
export function surfaceMaps(name, opts) {
  const map = surfaceTexture(name, opts);
  if (!map) return { map: null, normalMap: null };
  return { map, normalMap: normalFor(name, map.repeat.x, map.repeat.y) };
}

function normalFor(name, rx, ry) {
  if (!normalMapsEnabled) return null;
  const spec = SURFACES[name];
  if (!spec) return null;
  const base = normalBase(name, spec);
  if (!base) return null;
  if (rx === spec.repeat[0] && ry === spec.repeat[1]) return base;

  const key = `${name}|${rx}|${ry}`;
  let variant = normalVariants.get(key);
  if (!variant) {
    // Same clone-shares-one-Source economics as the colour variants: N
    // densities of one surface are one texture in VRAM.
    variant = base.clone();
    variant.repeat.set(rx, ry);
    applyAnisotropy(variant);
    normalVariants.set(key, variant);
  }
  return variant;
}

function normalBase(name, spec) {
  // `has`, not a truthy check: a FAILED derivation is cached as null too.
  // Every reason it can fail — no readback on the context, no createImageData
  // — is a property of the environment and will not change during the app's
  // life, so re-attempting means allocating a fresh canvas for every material
  // built from that surface. That is the cheapest possible leak and the
  // hardest to notice.
  if (normals.has(name)) return normals.get(name);

  // The colour tile is built first, unconditionally — the height field IS the
  // finished colour tile, post-clamp. Ordering matters: derived before the
  // clamp, a surface that the clamp scales down would carry relief that
  // disagrees with the colour it ships with.
  const ctx = sourceCtx.get(name);
  if (!ctx || typeof ctx.getImageData !== 'function') return fail(name);
  const src = ctx.getImageData(0, 0, TILE_PX, TILE_PX);
  const sd = src?.data;
  if (!sd || sd.length < TILE_PX * TILE_PX * 4) return fail(name);

  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const nctx = canvas.getContext('2d');
  // createImageData/putImageData rather than any drawing call: the packed
  // normal bytes are DATA, and anything that goes through the 2D paint path
  // (a fillRect per texel, drawImage of a scaled canvas) would be resampled,
  // premultiplied or colour-managed on the way. The same guard the clamp uses,
  // for the same headless contexts.
  if (!nctx || typeof nctx.createImageData !== 'function' || typeof nctx.putImageData !== 'function') {
    return fail(name);
  }
  const img = nctx.createImageData(TILE_PX, TILE_PX);
  if (!img?.data || img.data.length < TILE_PX * TILE_PX * 4) return fail(name);
  img.data.set(deriveNormalPixels(sd, TILE_PX));
  nctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  // NOT sRGB, and this is the one line in the file where getting the colour
  // space wrong is silent rather than obvious. A normal map is data: three
  // would de-gamma an sRGB-tagged one before unpacking, which pulls every
  // channel toward zero and tilts the whole surface toward (-1, -1, +) — a
  // uniform lighting bias that reads as "the material got darker on one side"
  // rather than as a broken texture. NoColorSpace is already Texture's
  // default; it is stated because the line above it states the opposite.
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(spec.repeat[0], spec.repeat[1]);
  // The `surface:` prefix is load-bearing: endWalk's teardown traversal skips
  // disposing maps whose name starts with it, and these are memoised for the
  // app's lifetime exactly as the colour tiles are. Today that traversal only
  // reaches `m.map`, so a normal map is safe either way — the prefix is what
  // keeps it safe on the day someone extends the traversal to `m.normalMap`,
  // which is the obvious next thing to do and would otherwise strand a GPU
  // upload per surface per walk.
  tex.name = `surface:${name}:normal`;
  applyAnisotropy(tex);
  normals.set(name, tex);
  return tex;
}

function fail(name) {
  normals.set(name, null);
  return null;
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------
// How steep the map is allowed to get, expressed as tangent-space slope
// (dh/du) before normalisation and before materials.js's per-surface
// normalScale.
//
// NORMAL_GAIN converts "luminance units per texel" into that slope. The Sobel
// below is scaled to approximate a central difference, so a clean one-texel
// cliff of depth dL comes out at dL/2 per texel. The deepest mark any painter
// is allowed to lay is STACK_MAX = 0.14 of ink, which over white is a 12.1%
// drop in luminance, so the steepest edge the vocabulary can contain is
// g = 0.0604. At gain 8 that is a slope of 0.484, a 25.8-degree face.
//
// So: GAIN 8 MEANS "THE DEEPEST MARK THE BUDGET ALLOWS BECOMES A 26-DEGREE
// FACE AT normalScale 1". That is the sentence the number exists to make true,
// and it is what lets the normalScale table in materials.js be read as a
// fraction of a known maximum rather than as eight unrelated magic numbers.
//
// One shared gain across all eight surfaces, NOT a per-surface
// self-normalisation like water.js's buildRippleTexture. water.js normalises
// because its one field's peak is an accident of which wave trains happen to
// be summed. Here the peaks are not accidents: the painters are argued
// darken-only height fields, so cobble grout really is deeper than a plank
// seam and grass's mottle really is almost flat. Self-normalising would
// throw that away and amplify grass — the flattest surface in the set, on the
// largest and most grazing-angle geometry in the game — to the same peak as
// cobble.
const NORMAL_GAIN = 8;

// A guard, not a tuning knob: no texel may encode a face steeper than this
// (0.75 slope = 36.9 degrees). Nothing in the current vocabulary comes near —
// the budget caps the honest maximum at 0.484 — so this never fires today. It
// exists because the failure it prevents is nasty and silent: a single
// pathological texel (a future painter's hard 1px line, or a clamp interacting
// badly with a new stroke) would encode a near-vertical face, and a
// near-vertical tangent normal on a surface lit by a 19-degree sun flips
// between fully lit and fully dark across one texel, which is a hard white
// speck that crawls.
const MAX_SLOPE = 0.75;

// deriveNormalPixels(rgba, size) -> Uint8ClampedArray of packed RGBA normals.
//
// Pure: no canvas, no THREE, no module state. That is what lets the seam-wrap
// property be asserted directly in a unit test rather than inferred from a
// screenshot, and it is the property most likely to be subtly wrong while
// looking perfect in the middle of a tile.
//
// HEIGHT = LUMINANCE, sRGB-ENCODED, NOT LINEARISED. This looks like the
// classic colour-space mistake and is the opposite of one. What the height
// field is meant to represent is INK DEPTH: every painter composites ink over
// white through the canvas 2D pipeline, which composites in the encoded space,
// so encoded luminance is exactly linear in the alpha the painter laid
// (L = 1 - 0.863a). Linearising would bend that relationship and make the
// deeper marks disproportionately deeper for no reason anyone chose.
//
// ONE CONSEQUENCE OF "DARKER IS LOWER" WORTH KNOWING ABOUT, because it is a
// deliberate choice rather than an oversight. For seven of the eight surfaces
// the rule is simply true: cobble grout, plank seams, shingle course shadows,
// siding lap shadows, gravel's inter-chip shade and sand's grain are all both
// darker AND lower, so the derivation gets the direction of relief right for
// free. BRICK is the exception, because mortar is the one recessed element in
// the vocabulary that is LIGHTER than what surrounds it. Its joints therefore
// come out proud rather than raked. It was left that way on purpose:
//   * At the ~9 degrees of tilt brick actually ships with, what the eye reads
//     at 2-4m is "there is a step at the course line", and both signs deliver
//     that. Measured on the real renderer the difference between the two is
//     about 11 of 255 at the joint, on a mark that is 4 texels wide.
//   * The alternative is a per-surface height inversion, which is a knob only
//     brick would ever set, justified by a fact about brick's COLOUR rather
//     than by anything in the derivation. That is a worse thing to own than a
//     documented quirk.
// If Wave 5.2 revisits this, inverting brick means negating BOTH gradients
// (h -> 1 - h), not flipping the green channel — flipping green inverts the
// vertical relief and leaves the perpends pointing the old way, which looks
// like a bug rather than like a decision.
//
// SEAMLESS BY CONSTRUCTION. Every neighbour fetch below wraps with modulo, so
// the kernel at column 0 reads column size-1 exactly as the tile's own
// repetition will present it. This is not a nicety: the colour tiles are
// seamless, so an edge column whose gradient was computed against a clamped
// (repeated or zeroed) neighbour would put a one-texel line of wrong normals
// down every tile boundary — on a 100x100-tile ground plane that is 200 hard
// lines ruled across the road, which is worse than shipping no normal map at
// all. The unit test asserts it as translation equivariance (deriving from a
// rolled tile equals rolling the derived tile), which is the strongest
// available statement of "the edges are not special".
export function deriveNormalPixels(rgba, size, gain = NORMAL_GAIN) {
  const S = size;
  const h = new Float32Array(S * S);
  for (let i = 0, p = 0; i < h.length; i++, p += 4) {
    h[i] = lum(rgba[p], rgba[p + 1], rgba[p + 2]);
  }

  const out = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) {
    const rowUp = ((y - 1 + S) % S) * S;
    const row = y * S;
    const rowDn = ((y + 1) % S) * S;
    for (let x = 0; x < S; x++) {
      const xl = (x - 1 + S) % S;
      const xr = (x + 1) % S;
      const tl = h[rowUp + xl];
      const tm = h[rowUp + x];
      const tr = h[rowUp + xr];
      const ml = h[row + xl];
      const mr = h[row + xr];
      const bl = h[rowDn + xl];
      const bm = h[rowDn + x];
      const br = h[rowDn + xr];
      // Sobel, divided by 8 so it approximates dh per texel rather than the
      // raw kernel sum. 3x3 Sobel rather than a bare central difference
      // because the two-texel vertical/horizontal smoothing is what stops a
      // single-texel grain (sand, gravel fines, grass flecks) from encoding a
      // face as steep as a structural edge — the surfaces that are noise get
      // damped relative to the surfaces that are structure, which is the
      // whole art-direction problem, solved by the operator rather than by a
      // per-surface fudge.
      const gx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) / 8;
      const gy = (bl + 2 * bm + br - (tl + 2 * tm + tr)) / 8;
      // Tangent-space normal of a height field: (-dh/du, -dh/dv, 1).
      //
      // THE GREEN CHANNEL'S SIGN, which is the one thing here that cannot be
      // reasoned out from the maths alone. A CanvasTexture has flipY = true,
      // so texture v runs UP the canvas while the pixel row index y runs DOWN
      // it: dh/dv = -gy. Therefore n.y = -dh/dv = +gy, where n.x = -gx keeps
      // its minus because u and x agree. Getting this backwards does not look
      // broken, it looks INVERTED — mortar courses read as raised ribs and
      // cobbles read as dimples — which is exactly the class of bug that ships.
      // Verified on the real renderer against a raking sun, not derived and
      // hoped for. (water.js's ripple map uses -gv for the same slot because a
      // DataTexture sets flipY = false; the two are consistent, not in
      // conflict.)
      let nx = -gain * gx;
      let ny = gain * gy;
      const slope = Math.hypot(nx, ny);
      if (slope > MAX_SLOPE) {
        nx = (nx / slope) * MAX_SLOPE;
        ny = (ny / slope) * MAX_SLOPE;
      }
      const len = Math.hypot(nx, ny, 1);
      const o = (row + x) * 4;
      out[o] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((1 / len) * 0.5 * 255 + 0.5 * 255);
      out[o + 3] = 255;
    }
  }
  return out;
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
  // Kept so the normal derivation can read these finished pixels back later
  // without repainting, and stored HERE rather than in the normal path so the
  // normal path can never build a height field from anything but the exact
  // tile that shipped — post-painter, post-clamp, no second rng draw.
  sourceCtx.set(name, ctx);
  return tex;
}

// ---------------------------------------------------------------------------
// The clamp — where the pixel-level guarantee actually lives
// ---------------------------------------------------------------------------
// One readback pass over 256x256 at first use of a surface, so eight passes
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

// Sand is per-texel rather than per-dot; see paintSand for why the scattered
// version it replaced was invisible.
const SAND_GRAIN = 0.09; // the 2px grain octave, max
const SAND_CLUMP = 0.035; // the 8px clumping octave, max
const SAND_SKEW = 2.5; // pow() bias: most texels near clean, a tail of dark grains

// Gravel. Same machinery as sand, tuned the other way on every axis: coarser,
// harder-edged and higher-contrast. See paintGravel.
// Most of the budget goes to the CHIPS, because a bimodal field (stone or
// not-stone) carries far more contrast per unit of darkening than a smooth
// one. The first cut of this painter had it the other way round — fat
// continuous octaves and 90 sparse chips covering 3% of the tile — and
// measured sigma 5.64, BELOW sand's 6.15, which is the opposite of what a
// coarse aggregate should be. Variance, not mean darkening, is what reads.
const GRAVEL_CHIP = 0.095; // one stone, max — the dominant mark
const GRAVEL_CHIPS = 1200; // stones per tile, max-merged (see chipField)
const GRAVEL_GRAIN = 0.035; // the 2px fines octave, max
const GRAVEL_CLUMP = 0.015; // the 8px patchiness octave, max
const GRAVEL_SKEW = 1.4; // flatter than sand's 2.5 — many dark texels, not a thin tail

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
// Two octaves of per-texel grain: a 2px "grain" octave that gives the surface
// its tooth, and an 8px "clump" octave that keeps the beach from reading as
// uniform static. Every texel carries some grain — this is a value field, not
// a scatter of dots.
//
// WHY IT IS BUILT THIS WAY, because the first version was a measured failure.
// It scattered ~2600 one-pixel dots at alpha <= 0.04, which covered about 2%
// of the tile and landed the mean at 0.998. On the real renderer that is a
// pixel sigma of roughly half a value step: two people measuring three
// different areas independently reported the same thing, which is that the
// beach, the gravel walks and the street strips were all paying ~350KB for a
// tile that rendered as nothing at all.
//
// The reasoning behind that 0.998 was wrong in a specific and instructive
// way. It held sand's mean near 1.0 on the grounds that a beach which darkens
// when textured looks wet. That is true of a LARGE shift and false of a small
// one — brick sits at 0.948, a 5% darkening, and reads as brick rather than
// as wet brick. Worse, it asked for something the pipeline cannot provide: a
// colour map MULTIPLIES, so it can only darken. "Variance with no change in
// mean" is not on the menu. Some mean reduction is the price of any visible
// grain at all, and sand was the only surface in the vocabulary held to a
// standard that made it invisible.
//
// So sand now sits with everything else, around 0.96.
//
// ALIASING, which sand is the surface most at risk of. Its features are the
// smallest in the set, and at the default 0.8m tile one texel is 3.1mm of
// world — at cat height (0.6m eye) that is roughly one screen pixel on the
// near ground, exactly where per-texel white noise shimmers as the camera
// moves. Hence the 2px block rather than 1px: the finest feature is two
// texels wide, ~6mm of world, which the trilinear mip chain can actually
// resolve instead of flickering between levels. The trade is that a grain is
// twice the size it could be — coarse sand rather than fine — and that is the
// right side to err on, because a shimmering beach is a bug and a slightly
// chunky one is a style.
//
// The 8px octave's block edges are hard, which is a grid risk. It is capped
// at 0.035 so the largest step across an edge is a 3.5% value change — under
// the ~5% where a hard edge starts reading as a line rather than as a change
// of tone. Do not raise it without checking that on a real screen.
//
// Worst-case stack: grain ∘ clump = 1 - (0.91)(0.965) = 0.122.
function paintSand(ctx, S, rand) {
  fillWhite(ctx, S);
  grainPass(ctx, S, rand, [
    { block: 8, amp: SAND_CLUMP, skew: SAND_SKEW },
    { block: 2, amp: SAND_GRAIN, skew: SAND_SKEW },
  ]);
}

// --- gravel ----------------------------------------------------------------
// Road aggregate: a park's gravel walk, an unmetalled lane, a chip-sealed
// street. Three layers, coarse to fine:
//
//   1. CHIPS — ~90 scattered stones per tile at 4-7px (22-38mm at the 1.4m
//      tile). Drawn as plain axis-aligned rects, deliberately: crushed
//      aggregate is ANGULAR, and the rounded setts of paintCobble are exactly
//      what gravel is not. They vary in size and overlap freely, which is
//      what stops a field of rectangles reading as a mosaic.
//   2. CLUMP — the 8px octave, 44mm patches, so the road is not uniform.
//   3. GRAIN — the 2px octave, 11mm fines, the dust and chippings between
//      the stones.
//
// It is sand's machinery pointed the other way on every axis. Where sand
// skews 2.5 (most texels near clean, a thin tail of dark grains — which is
// what a beach is), gravel skews 1.4, much closer to flat, so a large
// fraction of texels are meaningfully dark. That is the "harder-edged and
// higher-contrast" difference, and it is why gravel's sigma comes out roughly
// double sand's from octaves whose amplitudes are actually slightly smaller.
//
// The chips are laid into a FIELD with a max-merge rather than painted onto
// the canvas with source-over, and that is the load-bearing decision here.
//
// Source-over stacks: two overlapping chips at 0.095 composite to 0.181,
// straight through STACK_MAX, and at the ~40% coverage a real aggregate needs
// overlaps are not a rare tail but a constant. The alternatives were all
// worse — thin the chips until a double overlap fits the budget (which is the
// low-contrast painter this replaced), or place them on a non-overlapping
// grid (which needs chips nearly as large as their cells, and reads as a
// grid). Merging with max() means two stones that touch become ONE LARGER
// STONE, which is both what crushed aggregate actually looks like and a hard
// guarantee that the chip layer never exceeds GRAVEL_CHIP.
//
// The field also wraps by modulo, so the tile is seamless without the nine
// whole-tile copies paintGrass needs.
//
// Worst-case stack, and it is now exact rather than statistical:
//   chip ∘ clump ∘ grain = 1 - (0.905)(0.985)(0.965) = 0.140.
// That is the tightest budget in the vocabulary and it is deliberate — gravel
// carries the most contrast of any ground surface. Do not add a fourth layer
// without taking amplitude out of one of these three.
function paintGravel(ctx, S, rand) {
  fillWhite(ctx, S);
  const chips = chipField(S, rand, {
    count: GRAVEL_CHIPS,
    // Two grades, 4px and 6px, which at 256px over a 1.4m tile is 22mm and
    // 33mm stones — squarely inside the 10-40mm that road aggregate is
    // actually graded to. Even sizes only; see chipField for why that
    // matters more than a wider size range does.
    minPx: Math.max(2, Math.round(S / 64)),
    grades: 2,
    amp: GRAVEL_CHIP,
  });
  grainPass(ctx, S, rand, [
    { field: chips },
    { block: 8, amp: GRAVEL_CLUMP, skew: GRAVEL_SKEW },
    { block: 2, amp: GRAVEL_GRAIN, skew: GRAVEL_SKEW },
  ]);
}

// A scatter of angular stones as a per-texel alpha field.
//
// Rects, not rounded shapes: crushed aggregate is angular, and paintCobble's
// rounded setts are precisely what gravel is not. Overlapping rects of varied
// size are what keeps a field of rectangles from reading as a mosaic.
//
// max() rather than +: see paintGravel. Stones merge, they never stack.
// Modulo wrap: a stone running off one edge continues on the other, so the
// tile is seamless with no wrapped copies.
function chipField(size, rand, { count, minPx, grades, amp }) {
  const f = new Float32Array(size * size);
  for (let n = 0; n < count; n++) {
    // EVERY chip edge lands on an even coordinate, and every chip is an even
    // number of texels across. That snaps all of them to the 2x2 cells the
    // first mip level averages over, which makes mip1 an exact reduction of
    // mip0 rather than a blur of it — measured, the mip0->mip1 contrast step
    // goes from 10.6% to nothing. Odd-positioned chip edges were the only
    // high-frequency energy in the tile that the mip chain could not carry
    // cleanly, and edges are exactly what shimmers.
    const x0 = Math.floor(rand() * (size / 2)) * 2;
    const y0 = Math.floor(rand() * (size / 2)) * 2;
    const w = minPx + 2 * Math.floor(rand() * grades);
    const h = minPx + 2 * Math.floor(rand() * grades);
    const a = amp * (0.4 + rand() * 0.6);
    for (let dy = 0; dy < h; dy++) {
      const y = (y0 + dy) % size;
      for (let dx = 0; dx < w; dx++) {
        const i = y * size + ((x0 + dx) % size);
        if (a > f[i]) f[i] = a;
      }
    }
  }
  return f;
}

// Lays one or more octaves of per-texel value noise over whatever is already
// painted, via a single ImageData round trip.
//
// Per-texel rather than per-fillRect for two reasons. Coverage: a grain field
// that touches every texel is 65536 draw calls as fillRects and one pass as
// pixels. And control: the alpha of each texel is known exactly here, so an
// octave's worst case is its amp and not a statistical tail.
//
// `block` must divide `size` — the field is laid on a size/block grid and
// every texel in a block takes its cell's value, which is what keeps the tile
// seamless (the grid wraps exactly) and what sets the octave's frequency.
//
// The noise is skewed by pow(rand(), skew): with skew 2.5 most texels come
// out near clean and a minority are properly dark, which is what granular
// material looks like. A flat distribution reads as television static.
//
// Guarded like everything else that touches real pixels: with no readback
// (the headless recording contexts in the tests) this is a no-op and the
// surface keeps whatever the fillRect layers drew. It draws no random numbers
// in that case, so it must stay LAST in a painter or the two paths' rng
// streams would diverge.
function grainPass(ctx, size, rand, octaves) {
  if (typeof ctx.getImageData !== 'function' || typeof ctx.putImageData !== 'function') {
    return false;
  }
  // Every field is drawn up front, in a fixed order, so the values do not
  // depend on how the pixels are subsequently walked.
  //
  // An octave is either generated here from {block, amp, skew} — a block/block
  // grid of skewed noise — or supplied whole as {field}, a full-resolution
  // per-texel array built by the painter (chipField does this). A supplied
  // field is just block 1.
  const fields = octaves.map((o) => {
    if (o.field) return { block: 1, cells: size, f: o.field };
    const cells = Math.round(size / o.block);
    const f = new Float32Array(cells * cells);
    for (let i = 0; i < f.length; i++) f[i] = o.amp * Math.pow(rand(), o.skew);
    return { block: o.block, cells, f };
  });

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      // Octaves composite against each other exactly as overlapping strokes
      // would, so the worst case is the same product the painters quote.
      for (const { block, cells, f } of fields) {
        const v = f[((y / block) | 0) * cells + ((x / block) | 0)];
        a = a + v - a * v;
      }
      if (a <= 0) continue;
      const i = (y * size + x) * 4;
      d[i] = d[i] * (1 - a) + INK[0] * a;
      d[i + 1] = d[i + 1] * (1 - a) + INK[1] * a;
      d[i + 2] = d[i + 2] * (1 - a) + INK[2] * a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return true;
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
  gravel: paintGravel,
  grass: paintGrass,
};

// Exposed for the pixel-level test, which needs to know what "in budget"
// means without re-deriving it. Not used by the game.
export const __BUDGET = Object.freeze({
  FLOOR_LUM,
  STACK_MAX,
  INK: Object.freeze([...INK]),
  // The normal channel's two constants, exposed on the same terms: a test
  // asserting "the steepest face the budget can produce" should not have to
  // restate the arithmetic that produced them.
  NORMAL_GAIN,
  MAX_SLOPE,
  TILE_PX,
});
