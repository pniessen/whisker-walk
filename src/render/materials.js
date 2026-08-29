import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { surfaceTexture, surfaceMaps, textureTileMetres, isTextureName } from './textures.js';

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
// TWO NAMESPACES. The 17 PRESET names here are not the 8 TEXTURE names in
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
//
// ---------------------------------------------------------------------------
// normalScale (Wave 5.1) — READ THIS BEFORE CHANGING ONE
// ---------------------------------------------------------------------------
// A `normalScale` on a preset means "attach the derived normal map for my
// texture, at this strength". Absent or 0 means no normal map is derived, no
// normal map is uploaded and no VRAM is spent — see `grass`, which is the one
// mapped preset that deliberately gets none.
//
// WHAT THE NUMBER IS A FRACTION OF. textures.js bakes all eight tiles at one
// shared gain, chosen so that the deepest mark the painters' stacked-alpha
// budget permits encodes as a 26-degree face at normalScale 1.0. The painters
// are darken-only over white, so ink depth already IS depth and the RELATIVE
// relief between surfaces is already art-directed: cobble grout genuinely is
// the deepest mark in the vocabulary and grass's mottle genuinely is flat.
// None of these numbers is trying to restate that.
//
// WHAT THE NUMBER IS ACTUALLY FOR, then: correcting for how violently THIS
// LIGHT RIG amplifies a given surface's viewing geometry. The sun sits at 19.1
// degrees elevation (walk.js SUN_POSITION/SUN_INTENSITY, Wave 1.3 — it was 54
// degrees when this table was first written). That single change splits the
// table in two:
//
//   * A VERTICAL WALL faces a 19-degree sun almost head-on: N.L = cos(19.1) =
//     0.945, and tilting a facet by theta moves it by only ~sin(19.1)*theta.
//     Eight degrees of relief is about +5%/-11% on a lit facade.
//
//   * A GROUND PLANE faces it edge-on: N.L = sin(19.1) = 0.33, and tilting by
//     theta takes it to sin(19.1 + theta). Eight degrees is +43%/-40%. The
//     SAME normal map is roughly ten times louder on the road than on the wall.
//
// So the ground surfaces below all converge on a peak tilt of about 5 degrees
// and the wall surfaces on about 9, and each preset's number is simply
// whatever fraction gets its own baked peak to that budget. If a future wave
// moves the sun, these move together and the two budgets are the thing to
// re-derive — not the individual numbers.
//
// TWO SURFACES GET NONE, for two different measured reasons: `grass`, whose
// height field contains no relief to derive, and `sand`, whose height field
// contains only symmetric per-texel noise that measured as invisible on the
// real renderer even at 2.5x the strength it would have shipped at. Both
// arguments are written out at their entries. The saving is real — a normal
// map is a second 256x256 RGBA tile, ~341KB with its mip chain — and the
// gating is at THIS level, not in textures.js: a preset with no normalScale
// never asks for a derivation, so nothing is built and nothing is uploaded.
//
// AND THE STANDING RULE STILL GOVERNS. This is a hint of relief, not a skin.
// A normal map strong enough to make brick look photographed is the same
// failure as a colour map strong enough to break the 0.87 floor, arriving by a
// different door (VISUAL-PASS.md section 2).
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
  //
  // normalScale 0.60. Brick is the surface this whole wave exists for: the
  // bond was legible in colour and had no depth at all, so a wall read as a
  // printed pattern. Its baked peak is a ~15-degree face (the mortar gap
  // against a brick's 0.075 ink), and 0.60 of that is ~9 degrees, which is the
  // wall budget. Highest number in the table, and it earns it twice — mortar
  // joints are genuinely the deepest relief on a real facade at this scale,
  // and brick is almost always a vertical face, which is the geometry a
  // 19-degree sun treats most gently.
  brick: { roughness: 0.88, metalness: 0.0, texture: 'brick', normalScale: 0.6 },

  // Painted timber lap siding. 0.7 because the read here is the PAINT FILM,
  // not the wood: exterior house paint is a continuous polymer layer and it
  // holds a broad soft highlight along each board. 0.7 rather than 0.6 keeps
  // that highlight from picking out the lap shadows hard enough to turn a
  // wall into stripes.
  //
  // normalScale 0.40, and it is deliberately the lowest of the four wall
  // surfaces despite siding having the SECOND-deepest baked peak (~19 degrees,
  // from the lap shadow's hard 4px band). Two reasons to hold it back:
  //   * The lap shadow is already a PAINTED shadow. Unlike brick's mortar,
  //     which is a colour difference the normal map turns into depth, this
  //     mark is depth the painter has already drawn. Running it at full wall
  //     strength double-counts the same lap and turns clapboard into deep
  //     shiplap with 20mm reveals.
  //   * At roughness 0.7 siding is the glossiest of the wall set, so a broad
  //     specular lobe rides over the relief on top of the diffuse term.
  // 0.40 of 19 degrees is ~7.6 degrees: the board gets a rounded lift below
  // each lap instead of a second shadow under the first one.
  siding: { roughness: 0.7, metalness: 0.0, texture: 'siding', normalScale: 0.4 },

  // Asphalt/slate roof tabs. 0.85, between brick and plaster: a shingle has
  // a mineral-granule face that scatters widely, but roofs are seen at a
  // grazing angle where even rough dielectrics brighten, and going rougher
  // than this kills that grazing lift entirely.
  //
  // normalScale 0.55. Baked peak ~16 degrees (the course shadow and the tab
  // splits share SHINGLE_LINE), so this lands at ~9 degrees, the wall budget.
  // A roof is not a wall, but it is not a ground plane either: the pitches in
  // this game run 25-40 degrees, which puts N.L for a sun-facing slope
  // comfortably off the grazing end where the amplification gets ugly. What
  // decides the number in the end is distance — roofs are read at 6-15m, where
  // the tile is already two or three mip levels down, so a shingle course
  // needs the top of the wall budget just to survive to the eye at all.
  shingle: { roughness: 0.85, metalness: 0.0, texture: 'shingle', normalScale: 0.55 },

  // Sawn, weathered softwood — decking, fences, crates, dock boards. 0.75:
  // smoother than bark because a sawn face is geometrically flat, rougher
  // than paint because nothing in this game is varnished. 0.75 rather than
  // 0.5 for exactly that reason — 0.5 is a French-polished tabletop.
  //
  // normalScale 0.30, the lowest of any structural surface, for a reason that
  // is about where 'wood' is USED rather than about timber. Baked peak is ~19
  // degrees (the seam), so this is ~5.7 degrees — the GROUND budget, not the
  // wall one, because more than half the wood in the game is horizontal:
  // b.platform decking at the Docks and the Neighborhood, dock boards, steps.
  // A horizontal plank under a 19-degree sun amplifies exactly like a road
  // does, and a shared preset has to be safe on its worst geometry. It is also
  // the truer number physically: a sawn deck board has a 3-5mm gap where a
  // raked mortar joint has 10mm, and grain on sawn timber is a colour
  // difference with no relief whatsoever, so the grain streaks contributing
  // almost nothing here is correct rather than a loss.
  wood: { roughness: 0.75, metalness: 0.0, texture: 'plank', normalScale: 0.3 },

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
  //
  // NO normalScale, on purpose, and it is the one entry in this table where
  // the right answer was "don't". Three independent reasons, any one of which
  // would be enough:
  //   * THERE IS NO RELIEF IN THE HEIGHT FIELD. paintGrass is 26 radial
  //     gradients ~30 texels wide at 2.8% amplitude, which differentiates to a
  //     slope of about 0.003 — a fifth of a degree, indistinguishable from
  //     flat. Its only high-frequency content is 900 one-by-two-pixel flecks,
  //     which is not structure, it is noise.
  //   * SO THE MAP WOULD BE NOTHING BUT THAT NOISE, applied to the largest
  //     surfaces in the game (a 120m lawn in both the Park and the
  //     Neighborhood) at the most grazing angle available, under the sun angle
  //     that amplifies ground normals hardest. That is every risk factor in
  //     the wave lined up behind a signal that isn't there.
  //   * And it would cost ~350KB of VRAM and a derivation pass to do it.
  // Grass stays colour-only. Its form comes from the HemisphereLight's sky
  // term and, later, from Wave 2.2's ground vertex colours — a lawn is lit,
  // not textured.
  grass: { roughness: 0.95, metalness: 0.0, texture: 'grass' },

  // Dry beach sand. 0.92, a step drier than the default. Individual quartz
  // grains are glossy, but they face every direction, so the aggregate is
  // nearly matte. Lower than this and a beach starts to look damp — and damp
  // sand is a different material with a different colour, not a shinier
  // version of this one.
  //
  // NO normalScale, and this one was decided by measurement rather than by
  // argument — it shipped at 0.12 and was taken out again.
  //
  // Sand's baked tilt statistics look promising: the highest MEAN tilt in the
  // vocabulary (7.3 degrees, against 1.5-2.9 for the structured surfaces),
  // because its 2px grain octave puts a step between every pair of adjacent
  // blocks. But that is a description of NOISE, not of relief, and noise is
  // the one thing a normal map cannot deliver:
  //   * It is symmetric and spatially uncorrelated, so neighbouring texels
  //     tilt opposite ways and their contributions cancel to nearly nothing
  //     the moment the tile is more than a texel per pixel — which on the
  //     Seaside beach is almost everywhere.
  //   * Measured on the real rig (verify-normals.html's full-frame A/B, cat
  //     height on the beach): at 0.12 it moved 2.1% of screen pixels by at
  //     most 6/765 of RGB, and at 0.30 — two and a half times the shipped
  //     strength, well past anything the art direction would allow — it was
  //     still 14/765. Side-by-side frames at both strengths are
  //     indistinguishable from the no-normal-map frame.
  //   * The colour map is already doing this job: sand's grain is a value
  //     field, and a value field is what a beach's tooth actually is (the
  //     shadowing between grains happens at a scale two orders of magnitude
  //     below one texel — an AO effect, not a facet a normal can describe).
  // So this is textures.js's own sand lesson repeating in the second channel:
  // the first cut of the sand COLOUR map shipped at sigma 0.5 and rendered as
  // nothing while passing every assertion, and a ~341KB normal map that moves
  // six of 765 is the same tile-for-nothing trade. Gravel keeps its normal map
  // on exactly the axis sand fails: a chip is a coherent 4-6 texel FACET with
  // a hard edge, where a sand grain is two texels of symmetric noise.
  sand: { roughness: 0.92, metalness: 0.0, texture: 'sand' },

  // Road aggregate — a gravel walk, an unmetalled lane, a chip-sealed street.
  // 0.88, and the number is fixed by its two neighbours rather than picked:
  //   * rougher than cobble (0.80), because a sett is polished smooth along
  //     the walking line by decades of feet while crushed aggregate presents
  //     freshly fractured faces pointing in every direction;
  //   * smoother than sand (0.92), because a chip is a flat facet large
  //     enough to hold a coherent highlight, and a sand grain is not.
  // It shares 0.88 with brick, which is a coincidence of two different
  // arguments landing on the same number, not a shared reason.
  //
  // normalScale 0.30. Baked peak ~18 degrees (a chip's hard one-texel edge),
  // so this is ~5.4 degrees, the ground budget. Higher than sand's 0.12
  // despite sitting on the same kind of geometry, and the difference is
  // exactly the difference the gravel tile exists to express: a chip IS a
  // facet — an angular fractured face 20-40mm across, large enough to catch
  // the sun at a different angle from its neighbour — where a sand grain is
  // not. This is the one ground surface where the normal map is describing
  // something real rather than merely not lying.
  gravel: { roughness: 0.88, metalness: 0.0, texture: 'gravel', normalScale: 0.3 },

  // Dry cobble / stone setts. 0.8: stone is rougher than brick's fired skin
  // but is polished smooth on the walking line by decades of feet, and 0.8 is
  // the compromise that lets the wet variant below feel like a real change.
  //
  // normalScale 0.25. Cobble has the deepest baked peak in the whole
  // vocabulary (~22 degrees — COBBLE_GROUT at 0.12 is the strongest single
  // mark any painter lays) and it sits on the worst possible geometry: a
  // ground plane under a grazing sun, seen at 20-60m along the sidewalk runs.
  // 0.25 brings it to ~5.6 degrees. At the wall number it would be 13 degrees,
  // which on a ground plane is sin(32)/sin(19) — a 70% swing in the sun term —
  // and the Docks quay would read as rubble rather than as setts. The value
  // that makes cobble the loudest surface in the colour map is the same value
  // that makes it need the most restraint here, which is the whole lesson of
  // this table in one entry.
  cobble: { roughness: 0.8, metalness: 0.0, texture: 'cobble', normalScale: 0.25 },

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
  //
  // normalScale 0.15, and the fact that it differs from `cobble` above while
  // sharing a map is the point. `normalScale` is a material uniform, not a
  // property of the tile, so one derived normal map serves both presets at two
  // strengths and costs one upload.
  //   * It has to be lower, because a specular lobe reacts to a normal
  //     perturbation at roughly TWICE the rate a diffuse term does — the
  //     reflection vector turns through 2*theta for theta of normal tilt — and
  //     at roughness 0.42 this preset has a real lobe. walk.js measured the
  //     grazing sun already putting a specular sheet on the Docks quay peaking
  //     at 248/255 over 1.5% of frame; a normal map at cobble's 0.25 shatters
  //     that sheet into individual glints that crawl as the camera moves.
  //   * It should not be zero, because breaking that sheet up A LITTLE is the
  //     single most flattering thing available to wet stone. 0.15 (~3.4
  //     degrees) softens it into a broad mottle drifting across the quay,
  //     which is what wet setts actually look like, without resolving into
  //     countable sparkles.
  wetStone: { roughness: 0.42, metalness: 0.0, texture: 'cobble', normalScale: 0.15 },

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
    const opts = repeat ? { repeat } : undefined;
    // Wave 5.1. `strength` decides whether a normal map is even DERIVED, not
    // just whether it is attached: a preset with no normalScale (grass) must
    // cost zero, and surfaceMaps() builds the map it is asked for. So the
    // no-normal case goes through the colour-only entry point, and the normal
    // case goes through surfaceMaps — which is the ONLY exported path to a
    // normal map precisely so that the two maps' `repeat` cannot be given
    // separately and cannot therefore disagree. See its comment in
    // textures.js: the normal's density is read off the colour texture that
    // was actually resolved, so there is no second argument to get wrong.
    const strength = preset.normalScale ?? 0;
    const { map, normalMap } =
      strength > 0
        ? surfaceMaps(preset.texture, opts)
        // May be null — headless, low quality tier, or an unknown texture
        // name. Null is the normal "flat colour, no map" answer and must never
        // become `map: undefined` in the params object, because
        // THREE.Material.setValues warns on an explicitly-undefined parameter.
        : { map: surfaceTexture(preset.texture, opts), normalMap: null };
    if (map) params.map = map;
    if (normalMap) {
      params.normalMap = normalMap;
      // Uniform in x and y. An asymmetric normalScale is how you fake
      // anisotropic relief, and nothing in this vocabulary has any — every
      // painter's structure is axis-aligned but symmetric in depth.
      params.normalScale = new THREE.Vector2(strength, strength);
    }
  }
  return new THREE.MeshStandardMaterial({ ...params, ...rest });
}

// A surface's LIGHT RESPONSE with its map deliberately left off.
//
// Promoted here from world/builder.js, where it had been written as a local
// `surfNoMap` and then restated verbatim in world/park.js — two copies of a
// four-line helper is the point at which it belongs next to the preset table
// instead.
//
// Two situations need it, and both are geometry problems rather than art
// ones, which is why no amount of choosing a better repeat fixes them:
//   * a planar tiling map smears badly around a 6-, 8- or 12-sided cylinder,
//     so trunks, posts, bollards and fountain bowls take the roughness and
//     skip the texture;
//   * a member narrower than one tile (a fence rail, a window mullion) gets a
//     whole tile squashed into it, which reads as a smear rather than as a
//     surface.
// In both, the preset's roughness/metalness is still exactly right — an oak
// post is still 'wood' — so this keeps that half and drops the other.
export function surfaceMaterialNoMap(surface, color, extra = {}) {
  return litMaterial(color, { ...surfaceProps(surface), ...extra });
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
