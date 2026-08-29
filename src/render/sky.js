import * as THREE from 'three';

// =============================================================================
// SKY — a gradient scene.background, with zero extra draw calls.
//
// Every area calls world/builder.js's applySky(scene, top, horizon) with a
// flat top colour and a flat horizon colour, and until now that horizon
// colour was used for nothing but scene.fog: scene.background was a single
// solid THREE.Color, so a wide shot was one unbroken cyan field meeting one
// unbroken green field at a dead-straight line (docs/VISUAL-PASS.md section 1,
// "Flat", cause 4). This module replaces that with a painted vertical
// gradient, without adding a mesh.
//
// HOW A FLAT COLOUR AND A CanvasTexture CAN BOTH BE scene.background: three's
// WebGLRenderer branches on the type — a Color clears to a solid, a Texture
// with an equirectangular `mapping` is sampled per background pixel by view
// direction. Either way the background is one full-screen pass that happens
// regardless; this trades a solid fill for a slightly more expensive fill of
// the SAME pass. No new mesh, no new draw call — see VISUAL-PASS.md section 0
// on why that is non-negotiable: this scene is draw-call bound at 580 calls
// for 380 meshes, and an inverted sphere would be mesh #381.
//
// THE MAPPING, and why the horizon lands exactly at canvas row = height/2.
// Three's equirectUv() (renderers/shaders/ShaderChunk/common.glsl.js) turns a
// view direction into (azimuth / 2π, acos(dir.y) / π). acos(1)/π = 0 for
// straight up and acos(-1)/π = 1 for straight down, so v=0 is the zenith and
// v=1 is the nadir — and critically v=0.5 is dir.y=0, i.e. looking exactly
// level, which is where the ground plane's horizon sits for a camera at any
// height. That is what lets this canvas paint its horizon stop at exactly
// half its height and have it land on the sky/ground seam with no fudge
// factor, area to area, camera height to camera height. There is no
// horizontal variation in any of this — the sky does not need to differ by
// compass direction — so the canvas is only WIDTH px wide; a single column
// would risk some GPUs treating a 1px-wide texture as a degenerate case, and
// a few extra columns cost nothing either way.
//
// THE CAMERA ONLY EVER SEES A SLIVER OF THIS RAMP, and getting the stops'
// POSITIONS wrong here is what turned v1 of this module into a regression —
// it painted a real gradient, measurably paler at every height than the flat
// colour it replaced, because every height the player actually looks at was
// down near the horizon end of the ramp. Worth doing the arithmetic once,
// in-repo, rather than trusting a mental picture of "sky at the top, ground
// at the bottom":
//
//   walk.js's default view is camera.position.copy(cat.position).add(
//   cameraOffset(0, 0.18)), looking at (catX, 0.6, catZ). cameraOffset (see
//   catcam.js) with pitch 0.18 and its default dist=4.5/height=2.2 puts the
//   camera at (0, 2.925, 4.427) relative to the cat, so the view direction
//   is pitched 27.7° BELOW horizontal. main.js's camera is a 70°-vertical-FOV
//   PerspectiveCamera, so the TOP of the frame sits at 27.7 - 35 = -7.3, i.e.
//   7.3° ABOVE horizontal — nowhere near the zenith. Feeding that through the
//   equirectUv formula above (v = acos(sin(elevation))/π, since dir.y is the
//   sine of elevation) gives v = 0.4595 for the top pixel row at the DEFAULT
//   pitch, and v = 0.335 even at the most-upward pitch the camera allows
//   (cameraOffset clamps pitch to [-0.3, 0.9]; -0.3 is "look up"). Both
//   numbers were checked against the live game, not just derived: probing
//   verify-lighting.html's rendered frame at the matching view direction
//   reproduces them.
//
// So the ENTIRE visible sky, at any pitch the player can reach, lives in
// v ∈ [0.335, 0.5] — the top third of the canvas by area, not "everything
// above the horizon". A gradient authored across the full v ∈ [0, 0.5] (v1's
// mistake) spends 87% of its range on a hemisphere the camera cannot point
// at, and hands the player only the last, palest few percent of it.
//
// THE FIX is SKY_V, below: the `top` colour now owns the FLAT region from
// v=0 through v=SKY_V=0.47, not just the single point v=0. A canvas gradient
// clamps to a stop's colour for every offset before it, so this costs nothing
// extra to draw — it is one stop moved from 0.47 rather than an additional
// stop. 0.47 clears the default pitch's top-of-frame (0.4595) with a ~0.6°
// safety margin (window resizes change aspect but not vertical FOV, so that
// margin holds at any window size) and clears the full-pitch-up case
// (0.335) with room to spare. The practical effect: at the default pitch the
// player's top screen edge is the UNTOUCHED `top` hex — at least as rich as
// the flat colour it replaces, because for a few pixels it *is* that flat
// colour — and pitching the camera up just reveals more of that same flat
// field, exactly like the flat-Color version did. The gradient is now
// entirely a v ∈ [0.47, 0.5] phenomenon: three percent of the canvas, but
// 100% of the sky strip visible at default pitch (which itself only spans
// 0.4595-0.5), so nothing about the transition is actually lost — it is
// concentrated into the band the camera spends the most time looking at,
// right where the sky meets the fogged-in ground.
//
// THE STOPS:
//   1. TOP (v=0 through v=SKY_V) — the existing `top` colour, byte-for-byte.
//      See above for why it now covers a range instead of a point, and why
//      that is what makes "at least as rich as the flat colour" true instead
//      of aspirational.
//   2. HAZE (v=HAZE_V, between SKY_V and the horizon) — see ADAPTIVE HAZE
//      below. Not every area gets one.
//   3. HORIZON (v=0.5 through v=1) — the same `horizon` colour scene.fog
//      already uses (see applySky in world/builder.js). This is the one
//      stop that was never in question: geometry fades INTO scene.fog as it
//      recedes, so if this drifted from the fog colour the fade would land
//      on a sky colour that does not exist and the seam would get WORSE, not
//      better. Flat from 0.5 to 1 rather than blending toward black — the
//      ground plane occludes the nadir at any normal camera pitch, so there
//      is nothing back there worth selling.
//
// ADAPTIVE HAZE, and why the lift is no longer a flat 0.32 toward white.
// v1 lifted every horizon colour toward white by the same fraction, reasoned
// as "atmosphere scatters light most at the horizon". That reasoning is fine
// in the abstract and wrong in this specific palette set, because four of
// the six (top, horizon) pairs in the game already AUTHOR a horizon that is
// most of the way to white:
//
//     pair                 horizon   luminance
//     den / neighborhood   0xcfe8f0  0.891
//     park                 0xd8f0e0  0.917
//     seaside              0xe8e0d0  0.881
//     sunset (weather.js)  0xf8c890  0.808
//     docks                0x8e9aae  0.600
//     rain (weather.js)    0x8a9aa8  0.595
//
// Lifting 0xcfe8f0 32% further toward white spends the whole haze band
// crossing the last 11% of the distance to pure white — a move that shows up
// as desaturation and nothing else, which is exactly the "washed out"
// complaint. Docks and rain are the opposite case: their horizon is a real
// mid-grey-blue with room to brighten, and a lifted band there reads as an
// actual haze cue rather than a rounding error.
//
// So the lift scales with how much room a horizon colour has: zero at
// LUM_THRESHOLD and above (den/neighborhood/park/seaside/sunset all clear
// it, sunset only barely), rising linearly to HAZE_LIFT_MAX as luminance
// drops toward 0 (docks and rain land around a 5% lift — present, modest,
// nothing like v1's 32%). This is computed from the actual horizon colour
// passed in, not hand-picked per area, so a future area or weather condition
// gets the right answer without anyone having to remember this table.
//
// MEMOISATION. Same lifecycle as textures.js's `bases`: built lazily on first
// use, kept for the app's lifetime, shared by every area and every walk that
// asks for the same (top, horizon) pair. A neighbourhood walk that ends and
// restarts repaints nothing — it gets back the exact same CanvasTexture
// object, GPU upload and all. Keyed on the colour pair rather than on the area
// name because that is genuinely all a sky is a function of, and it means two
// areas that happen to share a palette (den and neighborhood both currently
// use `applySky(scene, 0x9fd4e8, 0xcfe8f0)`) also share one texture rather
// than paying for two identical canvases.
const WIDTH = 8;
const HEIGHT = 256;

const HORIZON_V = 0.5; // where dir.y = 0 lands, per the mapping note above
// Where the flat `top` region ends and the transition to the horizon begins.
// Must stay >= the default-pitch top-of-frame v (0.4595, derived above) or
// the player's top screen edge stops being the untouched `top` colour.
//
// Elevation above the horizon is 90 - v*180, so the two numbers that matter
// are: top-of-frame sits at 7.29 degrees, and SKY_V = 0.47 sits at 5.40. The
// flat `top` region is therefore the top 1.9 degrees of a 7.3-degree visible
// sky band — about a quarter of the strip stays the authored colour and the
// remaining three quarters ramp into the fog. That ratio is the whole point:
// all flat is what we came from, all ramp is what washed it out.
//
// It also clears the full-pitch-up case (0.335) with plenty to spare, so
// pitching the camera up only ever reveals MORE flat `top`, never something
// odd.
const SKY_V = 0.47;
// Where the haze stop sits inside the [SKY_V, HORIZON_V] band — closer to
// the horizon than to SKY_V, so most of that already-narrow band still reads
// as the rich `top` colour before it warms/lightens into the ground fog.
const HAZE_V = 0.485;
// The lift is 0 at this luminance and above, rising to HAZE_LIFT_MAX as a
// horizon's luminance falls toward 0 — see ADAPTIVE HAZE above.
const LUM_THRESHOLD = 0.85;
const HAZE_LIFT_MAX = 0.18;

const cache = new Map();

// Test-only, same contract as textures.js's __resetSurfaceTextures: the cache
// is app-lifetime by design, so nothing in the game should ever call this.
export function __resetSkyTextures() {
  cache.clear();
}

function hexToRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// Plain RGB lerp in sRGB space, matching how the hex colours are already
// authored and drawn — this module has no lighting to get physically right,
// only a canvas fillStyle to compute, so there is nothing to gain from routing
// through THREE.Color's linear working space.
function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbToCss([r, g, b]) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// Rec.709 luminance, 0..1 — same weights and the same "how pale is this
// already" question textures.js's clamp asks, just applied to one colour
// instead of a canvas. Drives the ADAPTIVE HAZE lift described above.
function lum([r, g, b]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// 0 at LUM_THRESHOLD and above, rising to HAZE_LIFT_MAX as `horizonRgb`'s
// luminance falls toward 0. See ADAPTIVE HAZE above for the per-area numbers
// this produces.
function hazeLift(horizonRgb) {
  const room = (LUM_THRESHOLD - lum(horizonRgb)) / LUM_THRESHOLD;
  return HAZE_LIFT_MAX * Math.max(0, Math.min(1, room));
}

// Returns the memoised equirectangular gradient for one (top, horizon) pair,
// or null when there is nothing to give — no `document` (headless Vitest,
// same guard as every other canvas-texture call site in this repo). Null is
// the expected answer in that case, not an error; callers use skyBackground()
// below to fall back to the flat colour this replaces.
export function skyTexture(top, horizon) {
  if (typeof document === 'undefined') return null;

  const key = `${top}|${horizon}`;
  let tex = cache.get(key);
  if (tex) return tex;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const topRgb = hexToRgb(top);
  const horizonRgb = hexToRgb(horizon);
  const hazeRgb = lerpRgb(horizonRgb, [255, 255, 255], hazeLift(horizonRgb));

  const g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  // No stop at 0: SKY_V is the first one, and everything before it clamps to
  // its colour automatically (canvas gradient semantics) — that clamp IS the
  // flat `top` region described above, not a separate thing to draw.
  g.addColorStop(SKY_V, rgbToCss(topRgb));
  g.addColorStop(HAZE_V, rgbToCss(hazeRgb));
  g.addColorStop(HORIZON_V, rgbToCss(horizonRgb));
  g.addColorStop(1, rgbToCss(horizonRgb));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  tex = new THREE.CanvasTexture(canvas);
  // The one line that makes three treat this as a skybox instead of a decal:
  // without it, a CanvasTexture assigned to scene.background is read as a
  // flat 2D backdrop stretched to the viewport, not projected by view
  // direction, and the gradient would swim as the camera turned.
  tex.mapping = THREE.EquirectangularReflectionMapping;
  // sRGB for the same reason every other canvas-texture call site in this
  // repo sets it (see textures.js baseTexture): these are colour values, not
  // data, and skipping this is the classic washed-out-texture bug.
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = `sky:${top}-${horizon}`;
  cache.set(key, tex);
  return tex;
}

// The caller-facing helper: a gradient where one is available, the exact flat
// Color it replaces where it is not (headless). Every call site — applySky,
// walk.js's dusk swap, weather.js's sunset/rain swaps — goes through this
// rather than skyTexture directly, so "no canvas support" degrades to
// today's behaviour instead of an undefined scene.background.
export function skyBackground(top, horizon) {
  return skyTexture(top, horizon) || new THREE.Color(top);
}
