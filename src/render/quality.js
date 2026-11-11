// Pure quality-tier resolver. No DOM/three imports — this stays a leaf
// module so it can be unit-tested without a WebGL context (see
// test/quality.test.js). Task 5 wires the resulting tier into the renderer
// (shadow map size, env intensity, post-fx composer, pixel ratio cap) at
// walk start; a settings change here only takes effect next walk.
const HIGH = Object.freeze({
  name: 'high',
  // What the ?perf readout calls the tier. The same as `name` on the four
  // upper rungs; the two rungs below LOW keep name 'low' (the readers of
  // `name` must go on treating them as low) and are told apart by this.
  label: 'high',
  rung: 0,
  // Ambient strays per area (game/walk.js). A count knob, not a look knob.
  strays: 22,
  shadowMapSize: 2048,
  // The sun's real shadow pass. On everywhere but the lite rung (see LITE).
  shadows: true,
  // Shadow-caster trim (render/rig.js trimShadowCasters): a part smaller
  // than this many metres stops casting. 0 is no trim, which is every rung
  // down to and including LOW; see SHADOW_LIGHT for the one that trims.
  shadowMinPart: 0,
  // Whether the cats she has fed are kept even when the stray count is
  // smaller than her colony here (game/walk.js). Only the lite rung's count
  // is small enough to need it; see LITE.
  keepFedCats: false,
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
  // Paw prints (render/pawprints.js; VISUAL-PASS.md "Stream 4 round four —
  // paw prints"): the ring's size and a print's life in seconds on sand. ONE
  // draw call either way and none in the shadow pass; what these trade is a
  // few transparent pixels per print. 96 prints at a trot's ~0.45m stride is
  // ~43m of trail, so the 9s fade, not the ring, is what usually ends a print.
  pawPrints: 96,
  pawFade: 9,
  // Drifting sky clouds (render/clouds.js; VISUAL-PASS.md "Stream 4 round
  // four — clouds"): how many. Every puff of every cloud is one instance of
  // one InstancedMesh, so any count is ONE main-pass draw call and no
  // shadow-pass draws; the count trades a few thousand cheap triangles and
  // how full the sky looks. 0 turns them off.
  cloudCount: 10,
  // Ambient life (render/ambient.js; VISUAL-PASS.md "Stream 4 round four —
  // ambient life"): falling leaves in the park, surf mist at the seaside,
  // dusk moths or canal motes at the Docks, dandelion fluff in the
  // neighbourhood. A multiplier on each effect's particle count (1 = the
  // full, still sparse, count: 40 leaves at most). One draw call whatever
  // the value; 0 would switch the effect off and cost no draw at all.
  ambientScale: 1,
  // Swimming and wading effects (render/splash.js): the ring-buffer sizes of
  // the droplet and ripple pools. Two draw calls whatever the size, and none
  // when no cat is in the water. A swimming wake alone keeps ~18 rings alive
  // (a pair every 0.16 s for 1.2 s, plus the head rings), so 20 is the floor.
  splashDrops: 64,
  splashRings: 32,
});

const LOW = Object.freeze({
  name: 'low',
  label: 'low',
  rung: 3,
  strays: 14,
  shadowMapSize: 1024,
  shadows: true,
  shadowMinPart: 0,
  keepFedCats: false,
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
  // Half the ring and a shorter life: fewer overlapping transparent quads on
  // the fill-bound rung. Still on — the trail is the thing the kids notice.
  pawPrints: 48,
  pawFade: 6,
  // Fewer clouds, same single draw call: a sparser sky on the rung where
  // fill-bound devices land, since a big near cloud is mostly overdraw.
  cloudCount: 6,
  // Half the particles. Still one draw call; what halves is the overdraw of
  // the soft sprites (the surf mist is the big one), which is fill rate —
  // the thing this rung is short of. Kept on rather than 0 because the
  // effect is a few dozen points and the low rung is where most phones live.
  ambientScale: 0.5,
  // Half the droplets; 20 rings is the floor a swimming wake needs.
  splashDrops: 32,
  splashRings: 20,
});

// ---------------------------------------------------------------------------
// The two rungs below LOW, for a device LOW is still too much for (the
// weakest target is an iPad 7th generation: A10 Fusion, 3 GB). Reached by
// Auto and by ?rung only; the manual "Low" setting still means LOW.
//
// The order things are given up in is the design. Resolution and glow went
// first (rungs 1 and 2); next comes shadow quality (rung 4), then scenery
// density and the real shadows themselves (rung 5), and last of all frame
// rate (the 30 fps cap, render/adaptive.js). What never goes: her cat, the
// cats she has befriended, paw prints, the goals, and anything that changes
// what the game pays or how it plays.
//
// Rungs 0-2 were "fill rate first" because a fast phone that struggles is
// GPU-bound. An A10 is the other case: draw calls are CPU work, and the
// shadow pass is about 73% of them (217 of 297 in the Neighborhood on the
// iPhone 18 reading), so below LOW the lever is the shadow pass.
//
// RUNG 4, "shadow-light": the same shadows, drawn with far fewer calls.
//
// Where the shadow draws actually are was counted (headless, at each area's
// spawn, against the real shadow frustum): the static world puts only 24-72
// casters in the Neighborhood's shadow box, and the rest are CATS. A cat is
// 31 separate meshes (25 for a stray) and every one of them is its own shadow
// draw: eyes, pupils, nose, whiskers, cheeks, paws, inner ears. Half a dozen
// cats near the player cost more shadow draws than every house, tree and
// fence in view together.
//
// So this rung stops the SMALL PARTS casting (rig.js trimShadowCasters): a
// part casts only if it is at least 30 cm across, or a fifth the size of
// the thing it belongs to. A cat goes from 31 (or 25) shadow draws to 10:
// body, belly, head, four legs, tail, and the two ears, which are kept by
// name because they are what makes a cat's shadow a cat's. Windows stop
// casting too (they lie flat on a wall that already casts). At this rung's
// 3.9 cm shadow texels, softened by another 4 cm, a part under 30 cm is a
// few texels that fall inside the shadow of the body it is attached to.
//
// The options weighed, and why not:
//   - A 512 map: texels are not draws. It would blur every shadow and remove
//     no CPU work at all.
//   - A tighter shadow box (radius 20 -> 16): removes about a quarter of what
//     is left, but shadows then end visibly nearer the camera. Kept at 20.
//   - Only her cat and big static shapes cast: more draws saved, but every
//     other cat loses its shadow, which is easy to see. The trim keeps them.
//   - Redrawing the shadow map every other frame: halves the draws on
//     average but makes frames alternately heavy and light, the uneven frame
//     pacing this whole ladder exists to remove.
//   - Rendering the static world's shadows once and only the cats' each
//     frame: three has no such split for one light, and the shadow box
//     follows the camera, so "once" would be every few steps anyway.
//
// It is all live: flipping castShadow needs no rebuild and nothing visibly
// pops, so a step to this rung takes effect on the very next frame.
const SHADOW_LIGHT = Object.freeze({
  ...LOW,
  label: 'shadow-light',
  rung: 4,
  shadowMinPart: 0.3,
});

// RUNG 5, "lite": no real shadow pass at all, and less of everything that is
// scenery rather than game.
const LITE = Object.freeze({
  ...SHADOW_LIGHT,
  label: 'lite',
  rung: 5,
  // The sun casts nothing, so the shadow pass draws nothing (game/walk.js
  // builds the walk with createNoShadows). The contact-shadow decals under
  // every cat and prop stay (they are two draws, and have no tier knob for
  // exactly this reason), so nothing floats. Mid-walk the shadows fade out
  // over 1.5 s (game/adaptquality.js), the bloom fade's care again.
  shadows: false,
  shadowMapSize: 0,
  // One device pixel per CSS pixel. On the 2160x1620 iPad that is a quarter
  // of the native pixels, and less than half of LOW's 1.5 cap.
  pixelRatioCap: 1,
  // Eight strays. A stray is 25 main-pass draws as well as its shadow draws,
  // so the count is the biggest scene-pass lever there is. Where a clan
  // lives, the clan's own nine cats take all eight places (clancast.js), so
  // the camp is still full and only the passing loners go.
  strays: 8,
  // ...but never the cats she has fed. createStrayCats counts her colony
  // inside the stray count, so a count this small could drop a fed cat;
  // with this set, walk.js raises the count to her colony's size here.
  keepFedCats: true,
  // A bare sky. Clouds are one draw call whatever the count, so this is
  // not about draws: a near cloud is mostly overdraw, and this rung is the
  // last stop before giving up frame rate.
  cloudCount: 0,
  // 613 tufts at most (LOW: 1,129; HIGH: 4,053), still one draw: the lawn
  // near the cat keeps some texture for a seventh of HIGH's vertex work.
  grassRadius: 5,
  grassSpacing: 0.5,
  // A quarter of the particles (LOW: half): 10 leaves, 3 to 7 of the rest.
  // Still on, because a handful of points in one draw costs next to nothing.
  ambientScale: 0.25,
  // Paw prints, splashes and everything else exactly as LOW. The trail is
  // the thing the children notice, and 48 prints are one draw call.
});

// The adaptive ladder. Order is fill rate first (pixel ratio, then post-fx and
// MSAA, then today's LOW), then the shadow pass, then scenery: see "Rung
// order" in
// docs/superpowers/plans/2026-10-25-whisker-walk-v21-stream4-adaptive.md and
// "The rungs — fill rate first" and "Below LOW" in docs/VISUAL-PASS.md.
// `name` stays 'high' for rungs 0-2 and 'low' for rungs 3-5 because
// render/textures.js, render/water.js, render/waterdress.js and weather.js
// read it.
const RUNG1 = Object.freeze({ ...HIGH, rung: 1, pixelRatioCap: 1.5 });
const RUNG2 = Object.freeze({ ...RUNG1, rung: 2, postFx: false, msaaSamples: 0 });
export const LADDER = Object.freeze([HIGH, RUNG1, RUNG2, LOW, SHADOW_LIGHT, LITE]);
// Today's LOW: what the manual "Low" setting and reduced motion mean, and
// the last rung whose step waits for the next walk without doing anything
// live.
export const LOW_RUNG = 3;
export const FLOOR_RUNG = 5;

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

// ?rung=N, for looking at a rung on a device that would never reach it by
// itself (nobody has a slow enough device to hand): Auto starts on rung N and
// stays there for the whole page load. It never steps and never reads or
// writes the adapt memory (game/adaptquality.js), so a look at the floor on a
// fast phone leaves no trace. Returns the rung, or null when the switch is
// absent or is not a whole number; a number past the last rung means the
// last rung. `search` is location.search (the iOS app passes it too: see
// AppScheme.startURL in ios/).
export function parseForcedRung(search, maxRung = FLOOR_RUNG) {
  let text = null;
  try {
    text = new URLSearchParams(search ?? '').get('rung');
  } catch {
    return null;
  }
  if (text == null || !/^\d{1,3}$/.test(text.trim())) return null;
  return Math.min(maxRung, Number(text.trim()));
}

// True when the governor may move the rung during a walk.
export function isAdaptive({ reducedMotion, override } = {}) {
  return override === 'auto' && !reducedMotion;
}
