// Pure quality-tier resolver. No DOM/three imports — this stays a leaf
// module so it can be unit-tested without a WebGL context (see
// test/quality.test.js). Task 5 wires the resulting tier into the renderer
// (shadow map size, env intensity, post-fx composer, pixel ratio cap) at
// walk start; a settings change here only takes effect next walk.
const HIGH = Object.freeze({
  name: 'high',
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
  // (`coarse` pointers) where texture memory is the scarce resource. The
  // colour tiles are already gated the same way and for the same reason.
  //
  // It is a separate flag rather than a read of `name === 'high'` so that a
  // future "high tier, but this GPU is a laptop iGPU" case has somewhere to
  // land without inventing a third tier.
  normalMaps: true,
});

const LOW = Object.freeze({
  name: 'low',
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
});

// coarse: matchMedia('(pointer: coarse)') — touch/mobile input.
// reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').
// override: the persisted 'quality' setting — 'auto' defers to device
// signals, 'high'/'low' force a tier regardless of device.
export function resolveQuality({ coarse, reducedMotion, override }) {
  if (override === 'high') return HIGH;
  if (override === 'low') return LOW;
  return coarse || reducedMotion ? LOW : HIGH;
}
