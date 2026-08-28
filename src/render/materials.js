import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { surfaceTexture, textureTileMetres, isTextureName } from './textures.js';

// Cozy low-poly art direction stays flat/matte: roughness 0.9, no metalness.
// `extra` carries per-call-site overrides (emissive, transparent, opacity, …)
// straight through from the old MeshLambertMaterial call sites.
//
// ---------------------------------------------------------------------------
// SURFACES (added by the surface-foundation wave)
// ---------------------------------------------------------------------------
// The renderer runs full PBR against a baked RoomEnvironment IBL probe with
// ACES tone mapping — a stack whose entire job is telling materials apart.
// Until now every single call site used the default roughness 0.9 / metalness
// 0, so it told nothing apart: wet cobbles, glass, car paint, bark and water
// were the same matte.
//
// A surface preset is a named (roughness, metalness, map) triple that a call
// site can ask for. Asking for nothing is unchanged, forever — the no-opts
// path below is byte-for-byte the material this function has always returned,
// and 39 existing call sites depend on that.
//
// TWO NAMESPACES. The 16 PRESET names here are not the 7 TEXTURE names in
// textures.js, and the mapping between them is many-to-one with gaps:
// 'wood' uses the plank texture, 'cobble' and 'wetStone' share the cobble
// texture, and eight presets carry no texture at all. A world file should
// only ever say preset names — litMaterial, surfaceMaterial, repeatFor and
// tileMetres all live here and all speak that vocabulary. Nothing in
// textures.js does; import repeatFor from THIS module.
//
// The art-direction line at the top of this file still governs. Gloss is a
// SHEEN, not a mirror: nothing in the table below except glass and still
// water goes under roughness 0.3, because a tight specular highlight on a
// flat-shaded facet reads as a hard bright polygon, which is the exact
// opposite of the look this game has. Where a value sits between two
// defensible numbers it is set to the matter one.
//
// A note that constrains the whole table: the IBL is a low-resolution baked
// RoomEnvironment at envIntensity 0.32-0.45 (see render/quality.js). That is
// a soft, dim probe. Below about roughness 0.15 its texel structure shows up
// as hard blobs in the reflection, and above about 0.5 it smears into
// ambient and any "shininess" stops reading at all. So the useful gloss band
// here is roughly 0.15-0.5, and the presets live where they do partly
// because of what this specific probe can express.
export const SURFACE_PRESETS = Object.freeze({
  // The shipped default, named. Exists so a call site can say "yes, matte, on
  // purpose" rather than leaving a reviewer to wonder whether it was missed.
  matte: { roughness: 0.9, metalness: 0.0 },

  // Dry lime render / stucco / painted masonry. 0.95 rather than 0.9 so a
  // plastered wall sits a touch drier than the game's default props standing
  // in front of it — that half-step is the whole point of naming it. Not 1.0:
  // at full roughness the IBL contribution goes perfectly uniform and the
  // wall loses the last hint that the sky is brighter than the ground, which
  // flattens it into a sticker.
  plaster: { roughness: 0.95, metalness: 0.0 },

  // Fired brick. 0.88 — a hair SMOOTHER than the default, because a fired
  // face has a thin vitrified skin that a plastered one does not; you can see
  // it as a faint broad sheen on any brick wall in low sun. The map carries
  // the bond.
  brick: { roughness: 0.88, metalness: 0.0, texture: 'brick' },

  // Painted timber lap siding. 0.7 because the read here is the PAINT FILM,
  // not the wood: exterior house paint is a continuous polymer layer and it
  // holds a broad soft highlight along each board. 0.7 rather than 0.6 keeps
  // that highlight from picking out the lap shadows hard enough to turn a
  // wall into stripes.
  siding: { roughness: 0.7, metalness: 0.0, texture: 'siding' },

  // Asphalt/slate roof tabs. 0.85, between brick and plaster: a shingle has
  // a mineral-granule face that scatters widely, but roofs are seen at a
  // grazing angle where even rough dielectrics brighten, and going rougher
  // than this kills that grazing lift entirely.
  shingle: { roughness: 0.85, metalness: 0.0, texture: 'shingle' },

  // Sawn, weathered softwood — decking, fences, crates, dock boards. 0.75:
  // smoother than bark because a sawn face is geometrically flat, rougher
  // than paint because nothing in this game is varnished. 0.75 rather than
  // 0.5 for exactly that reason — 0.5 is a French-polished tabletop.
  wood: { roughness: 0.75, metalness: 0.0, texture: 'plank' },

  // Tree bark. The roughest thing in the game at 0.98. Bark's structure is
  // millimetre-scale fissures pointing in every direction, so there is no
  // coherent specular lobe left at all. 0.98 not 1.0 for the same reason as
  // plaster: a whisper of directional response keeps trunks reading as round.
  //
  // Deliberately has NO map. Trunks here are 6- and 8-sided cylinders, and a
  // planar tiling texture on a cylinder of that few sides smears badly at the
  // silhouette — worse than no texture. Bark is carried by colour and by the
  // roughness step against the foliage above it.
  bark: { roughness: 0.98, metalness: 0.0 },

  // Leaves and hedges. 0.8, notably glossier than bark, because a leaf has a
  // waxy cuticle and a real hedge in sun has a visible sheen band. 0.8 rather
  // than 0.6 because low-poly canopies are single large flat facets: a
  // tighter lobe would make the whole canopy flash on and off as one unit
  // when the camera orbits, which reads as a lighting bug.
  foliage: { roughness: 0.8, metalness: 0.0 },

  // Lawn. 0.95 — grass is effectively a volume of thin scatterers and behaves
  // as near-Lambertian in aggregate; the sheen you sometimes see on a lawn is
  // grazing-angle, and the ground plane is the one surface a third-person
  // camera almost never sees at a grazing angle. The map is a mottle only.
  grass: { roughness: 0.95, metalness: 0.0, texture: 'grass' },

  // Dry beach sand. 0.92, a step drier than the default. Individual quartz
  // grains are glossy, but they face every direction, so the aggregate is
  // nearly matte. Lower than this and a beach starts to look damp — and damp
  // sand is a different material with a different colour, not a shinier
  // version of this one.
  sand: { roughness: 0.92, metalness: 0.0, texture: 'sand' },

  // Dry cobble / stone setts. 0.8: stone is rougher than brick's fired skin
  // but is polished smooth on the walking line by decades of feet, and 0.8 is
  // the compromise that lets the wet variant below feel like a real change.
  cobble: { roughness: 0.8, metalness: 0.0, texture: 'cobble' },

  // Wet stone — cobbles after rain, harbour steps, the dock at high tide.
  // This is THE sheen preset and the one most at risk of ruining the look, so
  // 0.42 is chosen defensively. Physically, a water film fills the stone's
  // pores and presents one smooth dielectric surface, which is why wet ground
  // goes dark and shiny at the same time.
  //   * Not 0.2: at 0.2 the probe resolves into a tight bright highlight and
  //     a cobbled street reads as polished marble.
  //   * Not 0.6: above ~0.5 this particular low-res IBL smears into flat
  //     ambient and the wetness stops reading at all.
  // 0.42 leaves a broad soft bloom drifting across the road as the camera
  // moves, which is what "damp" looks like. Shares the cobble map.
  wetStone: { roughness: 0.42, metalness: 0.0, texture: 'cobble' },

  // Window glass. 0.08, metalness 0 (glass is a dielectric; metalness would
  // destroy its transmission-through-colour read entirely). 0.08 rather than
  // 0.0 because a perfectly smooth mirror exposes the baked probe's low
  // resolution as visible hard blobs — a touch of roughness blurs the probe
  // just past its own texel size and hides that. Callers still supply their
  // own transparent/opacity; this preset is only the light response.
  glass: { roughness: 0.08, metalness: 0.0 },

  // Still water — ponds, the harbour, puddles. 0.12: calmer than glass in
  // principle, but the plane has no ripple geometry at all, so this small
  // roughness is standing in for the fine surface chop that the mesh does not
  // have. Same probe-resolution floor as glass applies.
  water: { roughness: 0.12, metalness: 0.0 },

  // Car bodies, mailboxes, painted lamp posts, bins. 0.35.
  //   * metalness stays 0.0, and that is not an oversight: automotive paint
  //     is a smooth clearcoat over pigment, and the metal is UNDER the paint.
  //     Raising metalness would tint the highlight with the base colour and
  //     kill the diffuse term, so a red car would stop being red.
  //   * 0.35 rather than 0.2 because 0.2 is a showroom finish that fights the
  //     flat-shaded silhouettes; 0.35 keeps a clear painted-metal read while
  //     the highlight stays wide enough to sit on a facet without banding.
  paintedMetal: { roughness: 0.35, metalness: 0.0 },

  // Bare/galvanised metal — drainpipes, railings, chain-link, chimney caps.
  // The only preset with real metalness.
  //   * metalness 0.85 rather than 1.0: a pure metal has no diffuse term, so
  //     it shows only the environment and the colour the call site picked
  //     disappears. Real weathered pipework carries an oxide and dust layer
  //     that scatters diffusely, and 0.85 leaves ~15% of that so the chosen
  //     colour survives.
  //   * roughness 0.45 — brushed and weathered, a broad highlight. Polished
  //     chrome (0.1) would mirror the probe and be the single loudest
  //     material in the game.
  bareMetal: { roughness: 0.45, metalness: 0.85 },
});

export const SURFACE_PRESET_NAMES = Object.freeze(Object.keys(SURFACE_PRESETS));

// Unknown names fall back to today's default rather than throwing — a typo in
// one prop should not take the walk down — but they warn once each, because a
// silent fallback is how a surface quietly never ships.
//
// Once per NAME, shared across every lookup in this file, so a mistyped
// surface produces one line rather than one line per prop per frame.
const warned = new Set();
function warnOnce(name, message) {
  if (warned.has(name)) return;
  warned.add(name);
  if (typeof console !== 'undefined') console.warn(message);
}

function presetFor(name) {
  const preset = SURFACE_PRESETS[name];
  if (preset) return preset;
  warnOnce(name, `[materials] unknown surface "${name}"`);
  return null;
}

// Resolves a surface name to the TEXTURE that backs it, or null.
//
// Accepts either vocabulary, deliberately:
//   * a preset name ('wetStone' -> 'cobble', 'wood' -> 'plank'), which is
//     what a world file has in hand because it is what litMaterial takes;
//   * a bare texture name ('plank'), which is what someone reading
//     textures.js has in hand.
// Being forgiving here is the entire point. The bug this replaced was a
// lookup that accepted only one of the two vocabularies and answered a name
// from the other one with a plausible wrong number instead of a complaint.
//
// Returns null in two very different cases, and the difference is why the
// callers below do not collapse them:
//   * a known preset with no map (glass, bark, paintedMetal, …) — a fair
//     question with a real answer: this surface has no tiles. Silent.
//   * a name in neither vocabulary — a typo. Warns.
function mapNameFor(name) {
  const preset = SURFACE_PRESETS[name];
  if (preset) return preset.texture ?? null;
  if (isTextureName(name)) return name;
  warnOnce(name, `[materials] unknown surface "${name}"`);
  return null;
}

// The world size one tile of this surface covers, or null when the surface
// has no map (and null, with a warning, when the name is unknown).
//
// null rather than 0: a caller dividing by this gets Infinity or NaN, which
// surfaces immediately, whereas 0 reads as a legitimate number right up until
// it silently poisons an arithmetic chain.
export function tileMetres(surface) {
  const mapName = mapNameFor(surface);
  return mapName ? textureTileMetres(mapName) : null;
}

// Derives a repeat from a face's real world size, so the integration pass can
// say "this wall is 4.2 by 3.0 units" instead of guessing a number.
//
//   litMaterial(0xb05a4a, { surface: 'brick', repeat: repeatFor('brick', w, h) })
//
// The result is rounded to whole tiles (minimum 1). That is the important
// part: on a flat-shaded box, a course of bricks sliced in half at the top
// edge of a wall is far more noticeable than a course being 8% too tall. The
// scale error a round can introduce is under half a tile; the sliced unit is
// a hard edge the eye goes straight to.
//
// Returns NULL, never a fallback repeat, when the surface has no map or the
// name is unknown. That is a deliberate reversal of what this function used
// to do. The old version returned [1, 1], which is a perfectly plausible
// deliberate value — one tile across a face — so a lookup miss produced a
// texture at the wrong scale and looked like an art-direction decision. It
// took a side-by-side pilot to spot. null cannot be mistaken for an answer:
// litMaterial treats it as "no repeat given" and falls back to the surface's
// own default density (which is right), and any caller that tries to do
// arithmetic on it or spread it fails loudly and immediately.
export function repeatFor(surface, width, height) {
  const t = tileMetres(surface);
  if (!t) return null;
  return [Math.max(1, Math.round(width / t)), Math.max(1, Math.round(height / t))];
}

// Returns the plain { roughness, metalness } a preset claims, with no texture
// lookup and no THREE material built. For callers (and tests) that want to
// reason about a surface without a DOM.
export function surfaceProps(name) {
  const preset = presetFor(name);
  if (!preset) return { roughness: 0.9, metalness: 0.0 };
  return { roughness: preset.roughness, metalness: preset.metalness };
}

// litMaterial(color, extra)
//
// Unchanged for every caller that does not pass `extra.surface`.
//
// With a surface, `extra` may also carry:
//   surface  — a key of SURFACE_PRESETS.
//   repeat   — [x, y] tiling for the surface's map. Prefer deriving it from
//              the face's real size with textures.js's repeatFor(), rather
//              than picking a number; omit it to take the surface default.
// Both keys are consumed here and never reach MeshStandardMaterial (which
// warns about parameters it does not recognise). Everything else in `extra`
// is applied AFTER the preset, so a call site can always override a preset's
// roughness for one prop without editing the table.
export function litMaterial(color, extra = {}) {
  // The original line, kept literally. No spread of a possibly-undefined
  // `map`, no extra keys, no reordering: a no-surface call produces exactly
  // the material it produced before this module grew presets.
  if (extra.surface === undefined) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, ...extra });
  }
  const { surface, repeat, ...rest } = extra;
  const preset = presetFor(surface);
  if (!preset) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.0, ...rest });
  }
  const params = { color, roughness: preset.roughness, metalness: preset.metalness };
  if (preset.texture) {
    // May be null — headless, low quality tier, or an unknown texture name.
    // Null is the normal "flat colour, no map" answer and must never become
    // `map: undefined` in the params object, because THREE.Material.setValues
    // warns on an explicitly-undefined parameter.
    const map = surfaceTexture(preset.texture, repeat ? { repeat } : undefined);
    if (map) params.map = map;
  }
  return new THREE.MeshStandardMaterial({ ...params, ...rest });
}

// The reading form for a textured prop:
//   surfaceMaterial('brick', 0xb05a4a, { repeat: repeatFor('brick', 4.2, 3) })
// Identical to litMaterial(color, { surface, ...extra }); it exists because
// the surface is the interesting part of such a call and belongs first.
export function surfaceMaterial(surface, color, extra = {}) {
  return litMaterial(color, { surface, ...extra });
}

// Bakes a RoomEnvironment IBL map once via PMREMGenerator — no network
// fetch, no HDRI asset, just an in-process procedural room. Callers keep the
// returned texture for the app's lifetime and reuse it across every walk;
// it is never disposed per-walk.
export function buildEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return envTex;
}
