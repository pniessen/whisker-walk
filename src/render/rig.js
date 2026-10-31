// The one lighting rig: the key light, the fill, the shadow bias and the
// shadow-caster rule, shared by the game (game/walk.js), the budget test
// (test/budget.test.js) and the verify harnesses (verify-park.html,
// verify-docks.html, verify-seaside.html, verify-neighborhood.html), so none
// of them can drift from the others. The comments below are the design
// record for every number here; they moved from game/walk.js with the values.
//
// Building the lights and calling the sweep stays the caller's job, in the
// caller's order: walk.js builds the sun before the world, the fill after it
// (it needs areaData.groundBounce), and runs assignShadowCasters after the
// world, the contact decals, the merge and every mover are in the scene.
import * as THREE from 'three';

// -----------------------------------------------------------------------------
// THE KEY LIGHT AND THE FILL, as one calibrated pair (docs/VISUAL-PASS.md 1.2
// and 1.3). They are written down together because they were TUNED together:
// either number read against the other's old value is meaningless, which is why
// the two plan items were done as one change.
//
// SUN_POSITION — was (30, 50, 20), an elevation of 54 degrees, i.e. near noon
// and the single flattest angle a directional light has. A 3m tree cast a 2.2m
// shadow that never escaped its own canopy. This is 19.1 degrees, where the
// same tree casts 8.7m.
//
// AZIMUTH: the sun is on the OTHER END of the axis it used to be on, and this
// is the one number in the pair that was never tuned. Wave 1.3 set (36, 15,
// 24) — bearing 56.3 degrees, measured from +z toward +x — and its comment
// claimed the sun "was already coming over the player's shoulder at spawn,
// which is the flattering direction for a chase camera". Both halves of that
// were wrong. Over the shoulder is where the sun was, and over the shoulder is
// the WORST place for it: every shadow then falls away from the viewer and
// hides behind the object casting it. Wave 1's own audit recorded the symptom
// without naming the cause — shadow contribution ranging 0% to 44% across the
// 24-view panel — and left it as the pass's largest open item.
//
// (-36, 15, -24) is the exact antipode: same 43.27m ground radius, same y, so
// the same 19.1 degrees of elevation BY CONSTRUCTION rather than by rounding,
// and bearing 236.3. The sun keeps the compass AXIS Wave 1.3 gave it and
// changes only which end of it it sits on, so shadows travel toward the camera
// and across the frame instead of away from it. Elevation and intensity are
// untouched and must stay untouched — they were tuned together and re-reading
// either against the other's old value is meaningless (see below).
//
// MEASURED, on the 24-view panel (six positions x four yaws through the real
// chase camera) run in all four outdoor areas — 96 views, in
// verify-lighting.html after that harness was brought in step with Wave 3.3's
// caster rule, which it had never carried:
//
//                        before (56.3)      after (236.3)
//   views under 2%       39 of 96           21 of 96
//   1st quartile          1.29%              2.39%
//   median                3.23%              5.09%
//   maximum              58.39%             41.41%
//   std deviation        12.38              9.36
//   mean                  8.92%              8.12%
//
// The MEAN GOES DOWN, and that is the result, not a cost. A mean of 10% made
// of a 0% view and a 44% view is a worse image than a uniform 9%: the average
// was never the thing that was broken, the spread was. Every one of the four
// areas moves the same way — minimum up, maximum down, spread down — and the
// per-yaw means flatten in all four (the neighborhood's four yaws go from
// 7.3/11.1/13.0/10.6 to 9.4/7.5/8.0/7.1, the park's to 3.7/3.7/3.4/4.0).
//
// WHY ONE GLOBAL NUMBER RATHER THAN ONE PER AREA. A per-area sun was the
// obvious shape for this — `groundBounce` right below is threaded exactly that
// way — and it was measured before being rejected. Sweeping the bearing in 15
// degree steps through all four areas, the aggregate "views under 2%" curve
// has a single broad plateau at 214-238 degrees with no cliff anywhere in it,
// and each area's own optimum either sits inside that plateau or is flat
// enough not to care: the neighborhood is best over 180-238, the park over
// 232-256, the seaside over 195-225, and the Docks is dense enough to be
// nearly insensitive (1 view under 2% at almost every bearing). Fitting four
// separate numbers recovers 4 more views out of 96 than this one does.
//
// That is not worth a knob, and the reason it is so small is the interesting
// part: THE WIN IS A PROPERTY OF THE CAMERA, NOT OF THE WORLD. What was wrong
// was the sun's angle to the chase camera, and the chase camera is identical
// in every area — so the fix generalises, and the residue that a per-area
// number would chase is just which props happen to stand near which sample
// point today. The plan's premise that each area has its own dominant
// sightline to align to did not survive contact with the areas either: the
// neighborhood is a CROSSROADS (two sightlines at right angles, so there is no
// single axis), the park is deliberately open, the Docks' canal and its
// warehouse row both run east-west, and only the seaside has one shore line —
// and the seaside's own optimum lands inside the global plateau anyway.
//
// Two things that stay true across the move, both checked rather than assumed:
// the shadow-fit basis is exactly as well conditioned as before (its
// conditioning depends only on the angle to world-up, which is unchanged —
// see lightBasis in render/shadowfit.js), and the sun is still never in shot,
// because the chase camera's top of frame is 7.2 degrees above horizontal and
// the sun sits at 19.1. There is no sun disc in the sky gradient either
// (render/sky.js is a function of elevation only), so nothing in the
// background has to move with this.
//
// The plan (docs/VISUAL-PASS.md 1.3) proposed (36, 20, 24) — 25 degrees — as an
// estimate, and y is the one number that came back different from measurement.
// 25 degrees turns out to be almost exactly the angle at which the
// neighbourhood's shadows still fail to reach past the props casting them, so
// the plan's own acceptance gate misses at the plan's own number. Measured in
// verify-lighting.html at its audit camera, the shadow pass moves 1.5% of
// screen pixels at 25 degrees (i.e. no better than the ~1.5% it replaced) and
// 10.3% at 19 — a cliff rather than a slope, because 19 is where the corner
// house's shadow first reaches across the street into frame.
//
// A cliff is a bad thing to tune against, so the choice was made on the
// harness's 24-view panel (six positions x four yaws through the real chase
// camera) instead, where the same sweep is smooth and monotonic: 9.56% at 25
// degrees, 10.42% at 19, flattening after. 19 degrees is where that curve
// stops paying and the single-camera gate is comfortably mid-band rather than
// balanced on its edge. Hence 15 and not 20.
//
// SUN_INTENSITY — RAISED from 2.2, which is the opposite of what the plan
// braced for, and the geometry says why. A grazing sun is brighter on walls
// (cos(19 deg) = 0.95 against the old cos(54 deg) = 0.59) but much DIMMER on
// the ground, which is most of the screen under a camera pitched 28 degrees
// down: sin(19 deg) = 0.33 against the old sin(54 deg) = 0.81, well under half.
// Left at 2.2 the world goes flat-dim and the shadows lose the contrast that is
// the entire point of casting them. 3.0 restores the ground and is still
// nowhere near a blow-out — measured across the audit's views, not one pixel
// reaches 252 in any channel even at 3.4, because ACES rolls the highlights off
// long before they clip. Lit facades do get brighter, and that is the intended
// read: a sunlit wall beside its own shaded return is the form this pass exists
// to put back.
//
// One knock-on worth knowing about before Wave 5.2 re-calibrates the surface
// table: the Docks' 'wetStone' preset is glossy enough that a grazing sun puts
// a real specular sheet on the quay. Measured, it peaks at 248/255 and covers
// 1.5% of that frame — a hot highlight, not a clipped one, and arguably the
// most flattering thing that has ever happened to wet cobbles — but it is the
// first place to look if that table gets re-judged.
//
// Exposure is deliberately NOT the dial used here — the key light was the thing
// that was wrong. renderer.toneMappingExposure is owned by game/composer.js and
// multiplied by Night Eyes; moving it would have dragged the sky, the fog and
// the bloom threshold along with the sun.
//
// Dusk overrides this to 0.7 in game/walk.js and is unaffected by the
// number here, but the fill below is NOT overridden, so the dusk walk was
// re-checked against the pair rather than assumed.
export const SUN_POSITION = [-36, 15, -24];
export const SUN_INTENSITY = 3.0;

// The fill. AmbientLight(0xbfd8ff, 0.9) added a constant to every surface
// regardless of its normal — by construction, the thing that removes form
// (VISUAL-PASS.md section 1, "Flat", cause 1). A HemisphereLight costs exactly
// the same (no shadow map, no extra pass, not a draw call) but ramps from sky
// on up-facing normals to ground-bounce on down-facing ones, so every mesh in
// the game gains vertical form for nothing.
//
// HEMI_SKY is the old ambient colour unchanged: it was already a cool daylight
// blue, and it was already the right colour for the up-facing half. What it was
// wrong about was applying to the DOWN-facing half too.
//
// HEMI_INTENSITY is half the old 0.9 because 0.9 was compensation. With a
// near-noon sun and no form in the fill, the fill had to be strong enough to
// keep shadowed sides from going dead — and that is precisely what flattened
// them. With the sun down at 19 degrees the shaded side of a wall reads as
// shaded on its own, so the fill's job shrinks back to "keep it from being
// black".
//
// 0.45 against a 3.0 sun was picked by measurement, holding two things at once:
// the deepest shadow in the audit frame goes from 82/765 of RGB to 154 (nearly
// twice the contrast the old rig could produce), while mean frame luminance
// lands within 3.5% of the pre-change image (208.3 -> 201.1 of 255). That
// second half is what makes the first half honest — a "more contrast" claim you
// get by dimming everything is just an exposure change wearing a lighting
// change's clothes.
export const HEMI_SKY = 0xbfd8ff;
export const HEMI_INTENSITY = 0.45;
// The bounce colour an area gets if it has not been threaded (see each area's
// `groundBounce`). A desaturated warm grey rather than any one area's palette:
// it is what an un-threaded area's fill degrades TO, so it must not smuggle a
// green cast into a stone courtyard or a sand cast into a lawn.
export const DEFAULT_GROUND_BOUNCE = 0x9a9086;

// The key light's colour: a warm daylight white. Unchanged since the first
// rig; the pair above was tuned against it.
export const SUN_COLOR = 0xfff2d8;

// Constant depth bias, and smaller than the -0.0004 it replaces. Bias is
// applied in normalised depth and shadowfit.js deliberately keeps the same
// 1..160 near/far span the fixed camera had, so this number means the same
// world-space offset it always did — 0.0004 * 159 = 6.4cm. That was sized
// against 6.8cm texels; against the new 2.0cm ones it is three whole texels
// of slide, which is exactly the peter-panning that would keep the cat from
// visibly touching the ground after all this work. Acne is what the bias is
// guarding against and acne scales with texel size, so shrinking the texels
// by 3.4x is licence to shrink this too: 0.00015 * 159 = 2.4cm, about one
// texel, verified acne-free on both tiers in verify-lighting.html.
// (normalBias is set inside render/shadowfit.js, where it can be derived from
// the texel size directly.)
export const SUN_BIAS = -0.00015;

// Wave 3.3 (docs/VISUAL-PASS.md): every mesh casting is why 415 meshes cost
// 553 draw calls — each caster is a second draw, into the shadow map, on
// top of the one it already gets in the main pass. RECEIVING stays
// unconditional (a mesh with no shadow of its own can still sit under
// someone else's, and receiving costs nothing extra in the shadow pass —
// only casters do); this sweep only trims CASTING.
//
// The opt-out has to be inferred from scene content, not authored in
// world/*.js (another agent owns those files this pass), so it runs off
// two independent, purely geometric reads:
//
// GRANULARITY: per TOP-LEVEL scene child (exactly contactshadows.js's
// scanFootprints granularity), not per individual mesh. The cat is ~30
// meshes — ears, whiskers, a torus tail — several of them a few
// centimetres across; judged mesh-by-mesh, the cat would lose most of its
// own shadow. Judged as the one group the builders actually author (a
// house, a tree, a bollard, the whole cat), the composite reads as what it
// visually is. MEASURED (measure-tmp.mjs against the live builders):
// tabby cat 0.56 x 0.85 x 1.67 (nose-to-tail, tail out, easily the widest
// axis), bollard 0.62 x 0.73 x 0.59, barrel 0.57 x 0.75 x 0.60, lamp post
// ~0.44 wide by ~3.52 tall, mailbox ~0.5 wide by ~1.23 tall.
//
// THE RULE, not contactshadows.qualifies() — the docstring above the
// opt-out flag warns against reusing that predicate, and the numbers show
// why: a tree and a bollard both qualify for a decal, but only the tree
// should still cast, and a lamp post is TALLER than a mailbox despite
// being much thinner than it end-on. So height and footprint span are
// checked independently rather than folded into one "size" number:
//
//   - CAST_FLAT_HEIGHT: shorter than this and the object has no vertical
//     face to catch the sun on — the ground plane, paths, sidewalks,
//     puddles, water, leaf litter, den rugs. All of these are ~0.05 or
//     under; 0.12 is comfortably above the tallest of them and below
//     every standing prop measured.
//   - CAST_TALL_HEIGHT: tall enough to throw a real shadow regardless of
//     how thin it is — a lamp post (3.52) or a villager (1.46) draws a
//     long raking line at this sun's 19 degrees even though neither is
//     wide. Set to 1.3, just above the mailbox's 1.23 (a small roadside
//     prop, meant to fall on the "too small" side) and comfortably below
//     the next thing up.
//
//     RE-JUDGED after the sun's azimuth moved (see SUN_POSITION), because
//     the whole reason to re-open it was that a better azimuth ought to
//     make small-prop shadows more visible and therefore more worth
//     paying for. MEASURED, IT DID THE OPPOSITE.
//
//     First, what the constant actually decides. Enumerated across all
//     four outdoor areas, the props that fail this test but clear
//     CAST_FLAT_HEIGHT are: eight neighborhood mailboxes at 1.23m, one
//     Docks prop at 1.25m — and then NOTHING until 0.93m. The threshold is
//     not balanced on a slope, it is parked in a 30cm-wide empty band, so
//     any value in [1.26, 1.30] is the same rule and the only question it
//     answers is "do the mailboxes cast". The park and the seaside have
//     nothing in the band at all: moving it is a no-op in two of the five
//     areas.
//
//     Second, the trade, measured at 1.2 against 1.3 on the 24-view panel
//     with the decals present, in the neighborhood where the mailboxes
//     are:
//
//                                    old azimuth   new azimuth
//       pixels moved, standing        0.442%        0.197%
//         beside the mailboxes
//       deepest single-pixel delta     182/765       98/765
//       pixels moved, ordinary panel   --            0.024%
//       extra draw calls               +7.9          +7.9  (+2.6%)
//
//     Restoring mailbox casting is worth LESS than half what it was worth
//     before the sun moved, and the reason is that the frame it lands in
//     changed: at the new azimuth the lamp posts, trees and house gables
//     are already raking long shadows across the same ground, so a
//     mailbox's 3.5m line now mostly falls inside one of them. In the
//     strongest of the 24 views the two frames are indistinguishable by
//     eye. Meanwhile the cost is unchanged and is paid in the shadow pass,
//     on the low tier as much as the high one.
//
//     So it stays at 1.3, and the trade is stated plainly: eight mailboxes
//     and one Docks bollard-sized prop keep a symmetric contact blob
//     instead of a raking line, and the frame keeps ~8 draw calls. That is
//     Wave 2.1's bargain working exactly as designed — the decal is what
//     makes the trim affordable, and it is doing its job here.
//   - CAST_WIDE_SPAN: wide enough to throw a real shadow regardless of
//     height — a car, a bench, a market stall, a fence run, and (this is
//     the one that matters most) the cat itself, whose 1.67m nose-to-tail
//     span clears it easily even though its 0.85m height does not clear
//     CAST_TALL_HEIGHT. Strays and ghosts are the same buildCat geometry
//     (0.85x scale for strays) so they clear it the same way, with no
//     special-casing needed. Set to 1.0, above the bollard/barrel's ~0.6
//     and below the cat's 1.67.
//
//   A child is eligible if it clears CAST_FLAT_HEIGHT AND (clears
//   CAST_TALL_HEIGHT OR clears CAST_WIDE_SPAN). A bollard and a barrel
//   clear neither extra test and stop casting — the contact decal under
//   them (render/contactshadows.js) is already carrying their grounding.
//   Small critters (birds, mice, butterflies) and small static dressing
//   (flowerbeds' individual stems, den knick-knacks) fail the same way.
//
// TRANSPARENCY is checked separately, per MESH rather than per group,
// because it is a leaf property that varies within one group — a car's
// glass cabin is opaque (materials.js's 'glass' preset is glossy, not
// see-through) but a fountain's water is not, and a rainy-day rainbow arc
// (weather.js, MeshBasicMaterial transparent) is exactly the kind of
// large-but-see-through mesh that would otherwise slip past the span test
// and paint a shadow of a rainbow. three's shadow map has no idea about
// alpha, so a transparent mesh casts its full opaque silhouette — always
// wrong for glass, water and glow, which is why the traversal used to
// catch these (they cost a draw and taught nothing).
export const CAST_FLAT_HEIGHT = 0.12;
export const CAST_TALL_HEIGHT = 1.3;
export const CAST_WIDE_SPAN = 1.0;

// The key light, at its calibrated position. createShadowFit (render/
// shadowfit.js) takes over sun.position from here, keeping its direction.
export function createSun() {
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.position.set(...SUN_POSITION);
  return sun;
}

// The fill, taking the area's own ground bounce (areaData.groundBounce), or
// DEFAULT_GROUND_BOUNCE for an area that has not been threaded.
export function createFill(groundBounce) {
  return new THREE.HemisphereLight(
    HEMI_SKY,
    groundBounce ?? DEFAULT_GROUND_BOUNCE,
    HEMI_INTENSITY,
  );
}

// Array-aware: a multi-material mesh is transparent if any of its slots is.
export function isTransparentMat(material) {
  return Array.isArray(material)
    ? material.some(isTransparentMat)
    : !!material?.transparent;
}

// The eligibility rule for one top-level child's world bounding box: clears
// CAST_FLAT_HEIGHT AND (clears CAST_TALL_HEIGHT OR clears CAST_WIDE_SPAN). An
// empty box (a light, an empty group) is never eligible.
export function castsFromBox(box) {
  if (box.isEmpty()) return false;
  const height = box.max.y - box.min.y;
  const span = Math.max(
    box.max.x - box.min.x,
    box.max.z - box.min.z,
  );
  return height >= CAST_FLAT_HEIGHT
    && (height >= CAST_TALL_HEIGHT || span >= CAST_WIDE_SPAN);
}

// The sweep, per top-level scene child (see GRANULARITY above). Every mesh
// receives; a mesh casts if its top-level child is eligible and its own
// material is opaque. Returns how many meshes it set and how many of them
// cast, for a harness HUD.
const casterBox = new THREE.Box3();
export function assignShadowCasters(scene) {
  let meshes = 0;
  let casters = 0;
  for (const child of scene.children) {
    const r = assignShadowCastersFor(child);
    meshes += r.meshes;
    casters += r.casters;
  }
  return { meshes, casters };
}

// The same rule for ONE top-level child — the sweep above is this, per child.
// Exported for a prop that joins the scene after the sweep has run: the den
// shop's furniture, placed during a den walk (game/denlive.js).
export function assignShadowCastersFor(child) {
  let meshes = 0;
  let casters = 0;
  if (!child || !child.isObject3D) return { meshes, casters };
  casterBox.setFromObject(child);
  const eligible = castsFromBox(casterBox);
  child.traverse((obj) => {
    // userData.contactDecal is render/contactshadows.js's two
    // InstancedMeshes opting out. They are already shadows: casting from
    // them would draw a hard black quad into the shadow map under every
    // prop, and receiving would band them with the very shadows they
    // exist to reinforce. The module sets castShadow/receiveShadow false
    // itself; without the opt-out here this sweep would overwrite it
    // moments later. userData.grass (render/grass.js) opts out the same way:
    // ground cover must never cast (its whole budget is 0 shadow-pass draws),
    // and walk.js adds it after this sweep anyway — this is the guard rail.
    // userData.ambient (render/ambient.js's particles) likewise: a THREE.Points
    // is not isMesh today, but the flag keeps it out if that ever changes.
    if (obj.isMesh && !obj.userData.contactDecal && !obj.userData.grass && !obj.userData.ambient) {
      obj.receiveShadow = true;
      obj.castShadow = eligible && !isTransparentMat(obj.material);
      meshes++;
      if (obj.castShadow) casters++;
    }
  });
  return { meshes, casters };
}
