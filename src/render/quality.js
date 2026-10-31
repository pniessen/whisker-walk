// Pure quality-tier resolver. No DOM/three imports — this stays a leaf
// module so it can be unit-tested without a WebGL context (see
// test/quality.test.js). Task 5 wires the resulting tier into the renderer
// (shadow map size, env intensity, post-fx composer, pixel ratio cap) at
// walk start; a settings change here only takes effect next walk.
const HIGH = Object.freeze({
  name: 'high',
  rung: 0,
  // Ambient strays per area (game/walk.js). A count knob, not a look knob.
  strays: 22,
  shadowMapSize: 2048,
  envIntensity: 0.45,
  postFx: true,
  pixelRatioCap: 2,
  // MSAA samples for the composer's render target (game/composer.js). 4 is
  // the highest sample count every WebGL implementation that advertises
  // antialiasing support is guaranteed to give you — 8 buys a barely visible
  // extra bit of edge smoothing at real fill-rate cost on hardware this tier
  // isn't aimed at, and 2 still leaves visible stairstepping on the
  // low-poly roofline silhouettes this exists to fix (see
  // docs/VISUAL-PASS.md 1.1).
  msaaSamples: 4,
  // Half-extent, in world units, of the sun's shadow frustum once it follows
  // the view instead of covering the whole area (render/shadowfit.js). 20 both
  // tiers, and that is not a placeholder: it is the one knob in this table
  // whose right value does not depend on how fast the device is. The frustum
  // is sized to the FOG's useful range, which both tiers share, and the cost
  // of shrinking it is borne entirely by the shadow map — which the tier
  // already sizes, one line up. Tightening it further on low would trade the
  // low tier's shadows for nothing, since the shadow pass's real cost is the
  // caster draw calls (VISUAL-PASS.md 3.3), not the texels.
  shadowFitRadius: 20,
  // Derived normal maps for the procedural surface tiles (render/textures.js,
  // VISUAL-PASS.md 5.1). On, and it is the only new knob that wave needs.
  //
  // This is a TEXTURE-BANDWIDTH knob, which is the line section 4 of the plan
  // already draws: anything costing draw calls or nothing ships on both tiers,
  // anything costing fill rate or texture memory is high only. A normal map is
  // a second 256x256 RGBA tile per surface — it roughly doubles what the
  // surface vocabulary costs in VRAM, and it does it on exactly the devices
  // (the ones adaptive Auto steps down to the low rung) where texture memory
  // is the scarce resource. The colour tiles are already gated the same way
  // and for the same reason.
  //
  // It is a separate flag rather than a read of `name === 'high'` so that a
  // future "high tier, but this GPU is a laptop iGPU" case has somewhere to
  // land without inventing a third tier.
  normalMaps: true,
  // Grass tufts on the lawns (render/grass.js; VISUAL-PASS.md "Stream 4 round
  // two — grass"). The radius (metres) the tufts reach around a point just
  // past the cat before fading out, and the world lattice spacing between
  // them. Either way it is ONE draw call and no shadow-pass draws, so what
  // these trade is vertex work and tuft pixels, not draw calls.
  // 9m: the camera sits 4.5m behind the cat at a 28-degree pitch, so 9m
  // around a centre just past the cat fills the near lawn where 6-15cm tufts
  // are still more than a couple of pixels; further out they are noise.
  // 0.3m: about one tuft per cat-length of lawn in each direction, dense
  // enough to read as a lawn rather than a scatter. At most 4,053 tufts
  // (41k triangles); open lawn draws ~3,500, the park's path-and-pond
  // junction ~2,200. The ?perf readout shows ~160k triangles a frame without
  // them, so this is a quarter more of the resource that is not the budget.
  grassRadius: 9,
  grassSpacing: 0.3,
  // Drifting sky clouds (render/clouds.js; VISUAL-PASS.md "Stream 4 round
  // four — clouds"): how many. Every puff of every cloud is one instance of
  // one InstancedMesh, so any count is ONE main-pass draw call and no
  // shadow-pass draws; the count trades a few thousand cheap triangles and
  // how full the sky looks. 0 turns them off.
  cloudCount: 10,
});

const LOW = Object.freeze({
  name: 'low',
  rung: 3,
  strays: 14,
  shadowMapSize: 1024,
  envIntensity: 0.32,
  postFx: false,
  pixelRatioCap: 1.5,
  // 0, deliberately: postFx is false on this tier, so walk.js renders
  // straight to the canvas main.js already built with antialias:true. That
  // canvas is already multisampled by the browser; asking the (unused)
  // composer target for samples too would just be paying the MSAA fill-rate
  // cost twice for one result.
  msaaSamples: 0,
  // The same 20 as high, deliberately — see the note there. What differs
  // between the tiers is shadowMapSize above, so this tier resolves the same
  // 40-unit box at 1024 instead of 2048: 3.9cm per texel, still nearly twice
  // as sharp as the 6.8cm the HIGH tier had before this change.
  shadowFitRadius: 20,
  // Off. A phone pays zero extra bytes for Wave 5.1 — not a weaker normal
  // map, none at all, exactly as it already pays zero for the colour tiles.
  // The surfaces still get their preset roughness/metalness, which are two
  // floats in a uniform block and cost nothing.
  normalMaps: false,
  // Smaller and sparser, because this rung is where fill-bound devices land:
  // 6m still covers the ground around the cat, and 0.42m roughly halves the
  // density, so 1,129 tufts at most (11k triangles). Still one draw call —
  // grass on the low rung costs the same draw count as on high, and it is
  // the lawn texture near the cat that the low tier needs most. Like every
  // count knob, a rung change mid-walk takes effect on the next walk.
  grassRadius: 6,
  grassSpacing: 0.42,
  // Fewer clouds, same single draw call: a sparser sky on the rung where
  // fill-bound devices land, since a big near cloud is mostly overdraw.
  cloudCount: 6,
});

// The adaptive ladder. Order is fill rate first (pixel ratio, then post-fx and
// MSAA, then today's LOW as the floor): see "Rung order" in
// docs/superpowers/plans/2026-10-25-whisker-walk-v21-stream4-adaptive.md and
// "The rungs — fill rate first" in docs/VISUAL-PASS.md (Adaptive Auto).
// `name` stays 'high' for rungs 0-2 because render/textures.js and
// render/water.js read it.
const RUNG1 = Object.freeze({ ...HIGH, rung: 1, pixelRatioCap: 1.5 });
const RUNG2 = Object.freeze({ ...RUNG1, rung: 2, postFx: false, msaaSamples: 0 });
export const LADDER = Object.freeze([HIGH, RUNG1, RUNG2, LOW]);
export const FLOOR_RUNG = 3;

// reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').
// override: the persisted 'quality' setting — 'auto' adapts, 'high'/'low'
// force a tier regardless of device.
// rung: the adaptive governor's current rung; only read in auto mode.
export function resolveQuality({ reducedMotion, override, rung = 0 } = {}) {
  if (override === 'high') return HIGH;
  if (override === 'low') return LOW;
  if (reducedMotion) return LOW;
  const r = Number.isFinite(rung) ? Math.trunc(rung) : 0;
  return LADDER[Math.min(FLOOR_RUNG, Math.max(0, r))];
}

// True when the governor may move the rung during a walk.
export function isAdaptive({ reducedMotion, override } = {}) {
  return override === 'auto' && !reducedMotion;
}
