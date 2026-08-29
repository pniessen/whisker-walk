import * as THREE from 'three';

// =============================================================================
// CONTACT SHADOWS — a soft dark blob on the ground under every prop, drawn as
// ONE InstancedMesh for the whole area and a second one for everything that
// moves. Two draw calls, total, for the entire grounding pass.
//
// WHY THIS EXISTS. Wave 1 gave the scene a real 19.1-degree sun and a
// view-fitted shadow camera, and the measured shadow contribution went from
// 1.5% of screen pixels to a 10.5% mean — but with two caveats the audit wrote
// down explicitly (docs/VISUAL-PASS.md, Wave 1 result block):
//
//   * it is STRONGLY VIEW-DEPENDENT — 0% to 44% across the 24-view panel,
//     because on any sightline with the sun behind the camera a prop's shadow
//     falls away from the viewer and hides behind the prop casting it; and
//   * it is SOFT — max single-pixel delta 174/765, because the HemisphereLight
//     and the IBL fill the shade straight back in.
//
// Neither is fixable by turning the sun up. A contact decal is fixable by
// construction: it is directly UNDER the prop, so it is visible from every
// direction and at every time of day, and it is composited as a multiply over
// whatever the lighting produced, so its depth does not depend on how much
// fill light the shade is getting. It is also the right answer for this art
// direction — screen-space AO on a scene made of large flat facets draws a
// dark outline around every one of them, which fights cozy-low-poly, whereas a
// soft blob under an object is what a children's-book illustrator draws.
//
// -----------------------------------------------------------------------------
// THE CONSTRAINT THAT SHAPES EVERYTHING BELOW
// -----------------------------------------------------------------------------
// VISUAL-PASS.md section 0: this scene is 380 meshes / 407 draw calls for 7,321
// triangles. It is draw-call bound and nowhere near triangle bound. The naive
// version of this feature — a quad under each prop — is 380 new meshes and
// costs more than tripling the whole polygon budget would. So the decals are
// instanced: one geometry, one material, one draw, N matrices.
//
// -----------------------------------------------------------------------------
// WHY TWO INSTANCED MESHES AND NOT ONE WITH A RESERVED RANGE
// -----------------------------------------------------------------------------
// The obvious saving is to put the movers in the tail of the static mesh's
// buffer and pay one call instead of two. Three reasons not to:
//
//   1. BUFFER USAGE. The static half is written once at build and never
//      touched again (StaticDrawUsage — the driver may put it in fast,
//      write-once memory); the mover half is rewritten and re-uploaded every
//      frame (DynamicDrawUsage). One buffer can only carry one hint, so
//      sharing means marking ~90 never-changing matrices as dynamic and
//      re-uploading them 60 times a second forever.
//   2. CAPACITY. InstancedMesh's count is fixed at construction. The static
//      count is known exactly (the scan below has already run); the mover
//      count is NOT — ghosts arrive from an async cloud fetch mid-walk, and a
//      co-walk's remote cats come and go with presence. A shared buffer means
//      the static write has to guess the mover reservation up front, and a
//      guess that is wrong either wastes instances or overwrites props.
//   3. FAILURE ISOLATION. A bug in the per-frame mover write can only corrupt
//      the mover mesh. In a shared buffer an off-by-one walks into the static
//      props and every tree in the area loses its shadow.
//
// The cost of all three is exactly one draw call, on a budget where the thing
// being bought is 380 of them. It also lets the two halves carry different
// opacities, which they want: a mover reads best a little darker than a static
// prop, because it is the object the player is actually looking at.
//
// -----------------------------------------------------------------------------
// WHY THE FOOTPRINTS ARE SCANNED OFF THE BUILT SCENE, NOT EMITTED BY BUILDERS
// -----------------------------------------------------------------------------
// VISUAL-PASS.md drafted this as "emit the instances from the existing builder
// helpers, the way colliders and waters are already returned". Scanning the
// finished scene graph instead is both simpler and more robust:
//
//   * it is ~50 builder functions across 6 world files that would otherwise
//     each have to learn a new return channel, versus one traversal here;
//   * a prop added later gets a decal for free, with no chance of a new
//     builder forgetting to emit one;
//   * Box3.setFromObject reports the WORLD footprint, so it is correct through
//     a group's rotation and scale — which the builders' own local `r` values
//     are not (several props are placed with a rotY the collider ignores).
//
// The cost is that the rule about WHICH objects deserve a decal has to be
// inferred from geometry rather than declared. That rule is qualifies(),
// below, and it is written out at length because it is the whole judgement
// call in this module.
// =============================================================================

// ---- the alpha texture -----------------------------------------------------

// 128px, painted once, memoised for the app's lifetime — the same contract
// render/textures.js's surface tiles and render/sky.js's gradient have, and for
// the same reason: this game ships as an offline PWA on GitHub Pages, so an
// asset fetch is a failure mode we do not have, and every walk after the first
// should reuse the canvas the first one painted.
//
// It is an ALPHA map, not a colour map. MeshBasicMaterial samples alphaMap's
// GREEN channel into diffuseColor.a, so white at the centre is fully-opaque
// black shadow and black at the rim is fully transparent. The material colour
// stays pure black and never changes; the gradient is the entire look.
const TEX_SIZE = 128;

// The falloff, and the shape of this curve was MEASURED BY EYE against the
// live rig rather than guessed, because the first plausible-looking version of
// it was wrong in an instructive way.
//
// v1 was a gentle ramp — near-solid to 35% of the radius, then a smooth glide
// to zero. On a gradient that is exactly what a soft shadow should look like,
// and in the scene it was almost invisible. The reason is obvious in hindsight:
// THE STRONG PART OF THE GRADIENT IS THE PART THE OBJECT IS STANDING ON. The
// only region of the decal a player ever sees is the annulus that escapes the
// object's own silhouette, i.e. the OUTER third of the radius — and on a gentle
// ramp the outer third is where the alpha has already fallen below 0.3.
//
// So the profile is a disc, not a bell: essentially flat out to 70% of the
// radius, and then the entire falloff crammed into the last 30%. That keeps
// the visible ring dark enough to read while still having no perceptible edge.
// The softness comes from the width of the fade in world units, which scales
// with the decal — a 3.4m tree blob fades over 50cm, a 1m bollard blob over
// 15cm, which is the right relationship.
const FALLOFF = [
  [0.00, 1.00],
  [0.42, 0.95],
  [0.70, 0.70],
  [0.88, 0.30],
  [1.00, 0.00],
];

let cachedTexture = null;

export function contactShadowTexture() {
  if (cachedTexture) return cachedTexture;
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  // Clear to black (alpha 0) first: the gradient's outermost stop is only
  // reached exactly ON the circle, and the canvas corners are outside it.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  const half = TEX_SIZE / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  for (const [stop, value] of FALLOFF) {
    const v = Math.round(value * 255);
    g.addColorStop(stop, `rgb(${v},${v},${v})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);

  const tex = new THREE.CanvasTexture(canvas);
  // NO colorSpace assignment, deliberately. An alpha map is data, not colour:
  // tagging it sRGB would push it through the inverse-gamma decode and bend
  // the falloff curve painted above. three's default for a CanvasTexture is
  // NoColorSpace, which is the right answer here — contrast render/sky.js,
  // which DOES set SRGBColorSpace because its canvas really is colour.
  tex.colorSpace = THREE.NoColorSpace;
  // Mipmaps on: these are viewed at every distance from 1m to the fog wall, and
  // an un-mipmapped gradient sparkles at range. Clamped because the quad is
  // exactly one tile and a repeat would wrap the falloff back on itself.
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  // Named for the same reason the surface tiles are: game/walk.js's endWalk
  // traversal disposes per-walk textures and must leave app-lifetime ones
  // alone. It only inspects `material.map` today and this lives on `alphaMap`,
  // so the name is belt-and-braces against that check ever widening.
  tex.name = 'surface:contact-shadow';
  cachedTexture = tex;
  return tex;
}

// ---- the qualifying rule ---------------------------------------------------
//
// Given one top-level scene child's WORLD bounding box, does it get a decal?
// Four independent tests, each with a reason:
//
// 1. MIN_HEIGHT — the object must stand UP off the ground. A decal under a
//    thing that is already lying flat on the ground is nonsense: there is no
//    gap under it to darken, and the blob would either be hidden beneath the
//    object or, worse, paint a dark smudge in the middle of it. This single
//    test is what excludes the ground plane itself (height 0), every path and
//    sidewalk (0), every water surface (0), puddles (0), leaf litter (0), the
//    den's rugs (0.03) and floor seams (0.01). 0.1m is comfortably above all
//    of those — the tallest thing in that group is a rug at 0.03 — and below
//    the shortest real standing prop, which is a den cat toy at 0.12. The gap
//    between 0.03 and 0.12 is empty in every area, so this threshold is not
//    balanced on a knife edge; it can move anywhere in that band without
//    changing a single decision.
//
//    Seaside's beach towel (0.15) is the one thing that squeaks over the line,
//    and it does not matter: the towel's own surface sits at y=0.02, above
//    DECAL_Y, so its decal is drawn UNDERNEATH it and never seen. That is the
//    layering doing its job rather than a rule needing another clause.
//
// 2. MAX_BASE_Y — the object must be ON THE GROUND. The decal is drawn at a
//    fixed y just above the world ground plane, because that is what makes it
//    one instanced draw; it has no idea what surface is underneath any given
//    prop. So anything sitting on a platform, a pier, a rooftop, a fire escape
//    or a wall would otherwise get a blob painted on the ground several metres
//    BELOW it, floating free of its own object. The rule is that the bottom of
//    the box has to be within 0.35m of y=0. That is generous enough for props
//    that sink slightly into the ground on purpose (rocks bottom out at -0.28)
//    and for a bench on a 0.14m bridge deck, and tight enough to reject the
//    Docks' pier crates (0.76), its roof tank (5.0), and every wall-mounted
//    prop in the den — pictures (1.38), the clock (1.25), curtains, shelves
//    (0.9 and 1.93) and the books standing on them (1.0). Requirement met
//    without a single den-specific special case.
//
// 3. MIN_SPAN — a footprint under 0.2m across would be a sub-pixel smudge at
//    any distance the player actually sees it from. Nothing shipped is
//    excluded by this; it is a guard against a future tiny prop.
//
// 4. MAX_SPAN — and this is the one that is a judgement rather than a
//    mechanism. Anything wider than 6.5m does NOT get a decal:
//
//      * Buildings do not need one. A 5m house at a 19-degree sun casts a
//        14m shadow across its own front garden, which is enormously visible
//        from every angle; the floating-prop problem this wave exists to fix
//        is a problem of SMALL and MEDIUM props, which the shadow map cannot
//        resolve and which hide their own shadows behind themselves.
//      * A giant soft blob under a building is actively bad. It would reach
//        several metres out past the walls onto the pavement and read as a
//        dark halo — precisely the artefact that got SSAO rejected for this
//        art direction two paragraphs into this file.
//      * A bounding box stops describing a footprint at that size. A house's
//        box is 11.03m across because the 45-degree-rotated pyramid roof
//        spreads its corners, while the actual body standing on the ground is
//        5x4. Every large prop in the game has that problem and no small one
//        does.
//      * The long thin runs — an 8.1m fence, a 26m garden fence, a 13m pier,
//        a 9m barge — would each collapse to one absurd needle-shaped ellipse
//        spanning the whole run. Per-post decals would need a deeper traversal
//        and a different rule; excluding them is the honest answer until
//        someone wants that.
//
//    6.5 rather than a rounder 6 for one specific prop: the Docks' market
//    stalls are 6.05m across and are exactly the mid-size, ground-standing,
//    heavily-occluded thing this pass is for.
export const MIN_HEIGHT = 0.1;
export const MAX_BASE_Y = 0.35;
export const MIN_SPAN = 0.2;
export const MAX_SPAN = 6.5;

export function qualifies(box) {
  if (!box || box.isEmpty()) return false;                    // lights, empty groups
  if (box.max.y - box.min.y < MIN_HEIGHT) return false;       // 1. lying flat
  if (box.min.y > MAX_BASE_Y) return false;                   // 2. not on the ground
  const spanX = box.max.x - box.min.x;
  const spanZ = box.max.z - box.min.z;
  const span = Math.max(spanX, spanZ);
  if (span < MIN_SPAN) return false;                          // 3. sub-pixel
  if (span > MAX_SPAN) return false;                          // 4. building-scale
  return true;
}

// ---- footprint sizing ------------------------------------------------------

// half-extent = bbox half-extent * FOOTPRINT_SHRINK + FOOTPRINT_SPREAD
//
// TWO TERMS, and the second one is what makes the feature visible at all.
//
// The SHRINK term is the correction for a bounding box being an over-estimate
// of a footprint whenever the widest part of an object is not its base — a
// tree (canopy), a lamp post (globe), a bench (backrest overhang), a mailbox
// (the box on the post). 0.72 rather than 1.0 pulls those back toward what is
// actually resting on the ground.
//
// The SPREAD term is the shadow spilling out PAST the object, and it is a
// constant rather than a proportion for the reason the FALLOFF comment above
// explains at length: a decal exactly the size of its object is completely
// hidden underneath it. Real contact occlusion does spill — the darkening on
// the floor beside a box extends roughly a hand's width past the box, and it
// does that whether the box is small or large, because it is set by the size
// of the sky's own solid angle, not by the size of the occluder. So a fixed
// 28cm of spill is both the physically-motivated shape AND the thing that
// guarantees every prop, however small and however ground-hugging, has some
// visible shadow that is not underneath itself.
//
// Worked through: a bollard (a 0.57m box) gets a 0.92m blob, so an 18cm ring
// of visible shade all round it. A tree (a 4m canopy) gets 3.44m, which is
// canopy-sized, which is what the ground under a tree actually looks like.
export const FOOTPRINT_SHRINK = 0.72;
export const FOOTPRINT_SPREAD = 0.28;

// Floor on each half-extent. The spread term above already keeps every prop
// well clear of this on its LONG axis (MIN_SPAN alone guarantees 0.16m), so
// what this actually catches is the minor axis of a thin panel — a billboard
// 19cm deep — and a degenerate box.
export const MIN_HALF = 0.15;

// Per-prop size variation, +/-8%, so a row of identical bollards does not read
// as a stamped repeat.
//
// DERIVED FROM POSITION, never from Math.random and never from walk.js's
// walkRng — the same rule and the same arithmetic as render/wind.js's
// windPhase and world/builder.js's hash01, and for the same reason: co-walkers
// build the same world from the same area data, so a function of (x, z) gives
// both clients the identical answer without either of them drawing from a
// shared, order-sensitive stream. See the warning at the top of startWalk.
const JITTER = 0.08;

function hash01(x, z) {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

// ...with one clamp on the spread: it can never exceed the object's own
// half-width. Without it a 33cm pair of pet bowls gets 28cm of spill on every
// side and ends up under an 89cm smudge four times its own size, which reads
// as a stain on the floorboards rather than as the bowls sitting on them. The
// clamp only binds below about 31cm of half-width, so nothing larger than a
// den toy is affected at all.
export function halfExtent(bboxHalf) {
  const spread = Math.min(FOOTPRINT_SPREAD, bboxHalf * 0.9);
  return Math.max(MIN_HALF, bboxHalf * FOOTPRINT_SHRINK + spread);
}

export function footprintFor(box) {
  const x = (box.min.x + box.max.x) / 2;
  const z = (box.min.z + box.max.z) / 2;
  const jitter = 1 - JITTER + hash01(x, z) * 2 * JITTER;
  return {
    x,
    z,
    halfX: halfExtent((box.max.x - box.min.x) / 2) * jitter,
    halfZ: halfExtent((box.max.z - box.min.z) / 2) * jitter,
  };
}

// scanFootprints(root) — one decal per TOP-LEVEL child of the scene.
//
// Top-level and not a full recursive traverse, because that is the granularity
// the world files author at: builder.js returns a Group per prop (a house, a
// tree, a bench, a market stall) and every area adds those groups straight to
// the scene. Recursing would give a house five decals — one under each wall
// panel and one under the roof — which is both wrong and 380 instances instead
// of ~90.
export function scanFootprints(root) {
  const out = [];
  const box = new THREE.Box3();
  for (const child of root.children) {
    // setFromObject updates the child's world matrices itself, so this is
    // correct even on a scene that has never been rendered — which is exactly
    // the case at build time, and the case a test runs in.
    box.setFromObject(child);
    if (!qualifies(box)) continue;
    out.push(footprintFor(box));
  }
  return out;
}

// ---- the rig ---------------------------------------------------------------

// HOW Z-FIGHTING IS BEATEN, and it takes all three of these.
//
// The decal is a horizontal plane a few millimetres above a 120m horizontal
// ground plane, viewed at a grazing angle by a camera pitched 28 degrees down.
// That is the textbook worst case for depth precision, and getting it wrong
// does not look like a small artefact — it looks like the whole ground surface
// boiling as the player walks.
//
//   1. DECAL_Y — 15mm of physical separation. Sized against what is already
//      layered down there: builder.js's ground plane sits at y=0, its paths
//      and sidewalks at 0.01, puddles at 0.02, water surfaces at 0.04-0.05.
//      15mm clears the ground and the paths (the two surfaces a decal actually
//      lands on) and deliberately stays UNDER the puddles and the water, so a
//      decal never floats on top of a reflective surface it has no business
//      being on. At the far end of the useful view, ~40m out where the fog
//      starts, a 24-bit depth buffer with near=0.1 resolves about 1mm, so 15mm
//      is roughly fifteen depth units of margin — comfortable, and it is not
//      the only defence.
//   2. polygonOffset — a slope-scaled depth bias applied by the rasteriser
//      itself. This is the defence that actually holds at a grazing angle,
//      because the error term it corrects for is proportional to the depth
//      SLOPE across the polygon, which is exactly what a grazing angle
//      maximises. -2/-2 is a light touch; it does not need to be large because
//      it is working with 15mm of real separation rather than against zero.
//   3. depthWrite: false — the decal contributes nothing to the depth buffer.
//      Decals cannot then fight EACH OTHER where two props stand close enough
//      for their blobs to overlap (which is common: a bench beside a bin), and
//      nothing drawn later is ever occluded by a shadow blob.
//
// depthTest stays ON: a decal behind a wall must not show through it.
const DECAL_Y = 0.015;

// Both meshes draw before every other transparent object in the scene.
//
// three sorts the transparent pass back-to-front by each object's bounding
// sphere centre, and an InstancedMesh spanning the whole area has its centre in
// the middle of the area — so its sort key is meaningless and it could land
// anywhere in that order. renderOrder makes it deterministic. -1 (before the
// default 0) is the correct end: a contact shadow is the bottom layer of the
// composite, and the particles, glow rings, scent trails and water that blend
// over the ground should blend over the shadows too.
const RENDER_ORDER = -1;

// Movers' decals shrink as they leave the ground, and are gone by 0.9m up.
//
// This is one line covering three separate cases: the cat mid-pounce or perched
// on a wall, butterflies and fireflies (which spawn at y=1 and never land), and
// ghosts. Shrinking rather than fading because a shrinking blob is what a real
// contact shadow does as its caster rises, it costs one multiply, and fading
// would need a per-instance alpha, which an alphaMap cannot carry.
const LIFT_START = 0.06;
const LIFT_RANGE = 0.9;

// Static props read slightly lighter than movers. The cat is on screen 100% of
// the time and is the thing the player is looking at; a row of bollards is
// scenery, and scenery that is too dark at the base reads as sooty.
const STATIC_OPACITY = 0.45;
const MOVER_OPACITY = 0.5;

// Headroom for cat + up to 22 strays + ~25 critters + 3 ghosts, with room for
// the co-walk remotes a later wave may want to register. Costs 96 * 64 bytes
// of instance matrix, i.e. 6KB.
const MOVER_CAPACITY = 96;

function decalMaterial(opacity) {
  return new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: contactShadowTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// One unit quad, lying in the XZ plane with its face up, with the rotation
// BAKED INTO THE GEOMETRY rather than carried per instance. That is what lets
// every instance matrix be a plain scale-and-translate (see writeInstance),
// which is both cheaper to compose and impossible to get subtly wrong.
function decalGeometry() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _box = new THREE.Box3();

function writeInstance(mesh, i, x, z, halfX, halfZ) {
  // makeScale then setPosition, in that order: setPosition overwrites only the
  // translation column, so the result is T * S — scale about the decal's own
  // centre, then move it. Reversing them would scale the translation too.
  _m.makeScale(halfX * 2, 1, halfZ * 2);
  _m.setPosition(x, DECAL_Y, z);
  mesh.setMatrixAt(i, _m);
}

/**
 * createContactShadows(scene, opts) -> { update, dispose, follow, ... }
 *
 * Call it AFTER the area has built and BEFORE anything that moves has been
 * added to the scene — the static scan is a snapshot of scene.children, and
 * the cat standing in it at scan time would be baked in as a permanent stain
 * on the spawn point.
 *
 * Same { update, dispose } shape every other per-walk rig uses (water, wind,
 * fx, scent, shadows), so game/walk.js hangs it on the session and main.js's
 * render loop calls it beside session.shadows.update() with no new convention.
 */
export function createContactShadows(scene, {
  staticOpacity = STATIC_OPACITY,
  moverOpacity = MOVER_OPACITY,
  moverCapacity = MOVER_CAPACITY,
} = {}) {
  const footprints = scanFootprints(scene);

  let staticMesh = null;
  if (footprints.length) {
    staticMesh = new THREE.InstancedMesh(decalGeometry(), decalMaterial(staticOpacity), footprints.length);
    staticMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < footprints.length; i++) {
      const f = footprints[i];
      writeInstance(staticMesh, i, f.x, f.z, f.halfX, f.halfZ);
    }
    staticMesh.instanceMatrix.needsUpdate = true;
    prepare(staticMesh);
    scene.add(staticMesh);
  }

  const moverMesh = new THREE.InstancedMesh(decalGeometry(), decalMaterial(moverOpacity), moverCapacity);
  moverMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Every instance starts collapsed to zero scale, i.e. invisible. The mesh is
  // in the scene from frame one with its full capacity allocated, and follow()
  // only ever activates a slot — so a walk with no movers registered draws one
  // empty pass rather than nothing, and a ghost arriving 8 seconds in needs no
  // reallocation.
  for (let i = 0; i < moverCapacity; i++) writeInstance(moverMesh, i, 0, 0, 0, 0);
  moverMesh.instanceMatrix.needsUpdate = true;
  prepare(moverMesh);
  scene.add(moverMesh);

  function prepare(mesh) {
    mesh.renderOrder = RENDER_ORDER;
    // A shadow does not cast a shadow, and a decal must not receive one
    // either: it is already a shadow, and shading it again at a grazing sun
    // angle produces a dark band across the blob.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    // The explicit opt-out. game/walk.js runs a scene.traverse that sets
    // castShadow = receiveShadow = true on EVERY mesh, and it runs after this
    // rig is built, so the two lines above would be overwritten within
    // microseconds without this flag. walk.js reads it; nothing else does.
    mesh.userData.contactDecal = true;
    // Never culled, and this is not laziness. three culls an InstancedMesh
    // against a bounding sphere it computes from the instance matrices and
    // then CACHES — rewriting matrices every frame (which the mover mesh does
    // by definition) leaves that sphere stale, and a stale sphere culls
    // decals that are on screen. Both meshes are one draw call each and the
    // static one spans the whole area, so culling could never have saved
    // anything here anyway.
    mesh.frustumCulled = false;
  }

  // ---- movers --------------------------------------------------------------

  const followers = [];

  /**
   * follow(object3d, radius) — give a moving object a live decal.
   *
   * `radius` defaults to the object's own footprint at registration time.
   * Movers get a CIRCULAR decal (one radius, both axes) rather than the
   * rectangular footprint a static prop gets, because a mover rotates: an
   * elliptical blob sized to the cat's world bounding box at spawn would be
   * the wrong way round the moment the cat turned a corner, and re-measuring
   * a bounding box per mover per frame is exactly the kind of cost this
   * module's whole design is avoiding.
   */
  function follow(object3d, radius) {
    if (!object3d) return;
    // Silently ignored past capacity rather than thrown: a missing shadow on
    // the 97th critter is a cosmetic non-event, and a walk that throws in the
    // middle of spawning strays is not.
    if (followers.length >= moverCapacity) return;
    let r = radius;
    if (!(r > 0)) {
      _box.setFromObject(object3d);
      r = _box.isEmpty()
        ? MIN_HALF
        : halfExtent(Math.max(_box.max.x - _box.min.x, _box.max.z - _box.min.z) / 2);
    }
    followers.push({ object: object3d, radius: r });
  }

  function update() {
    if (!followers.length) return;
    for (let i = 0; i < followers.length; i++) {
      const f = followers[i];
      const o = f.object;
      o.getWorldPosition(_v);
      // Detached (a despawned critter, a stray removed on teardown) or
      // explicitly hidden: collapse the instance rather than leaving its last
      // blob painted on the ground forever.
      const live = o.parent !== null && o.visible;
      const lift = Math.max(0, _v.y - LIFT_START);
      const r = live ? f.radius * Math.max(0, 1 - lift / LIFT_RANGE) : 0;
      writeInstance(moverMesh, i, _v.x, _v.z, r, r);
    }
    moverMesh.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    for (const mesh of [staticMesh, moverMesh]) {
      if (!mesh) continue;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose(); // frees the instance matrix attribute's GPU buffer
    }
    followers.length = 0;
    // The gradient texture is NOT disposed. It is memoised for the app's
    // lifetime and shared by every walk after this one — the same contract
    // render/textures.js's surface tiles have, and endWalk's traversal is
    // already written to leave 'surface:'-named textures alone.
  }

  return {
    update,
    dispose,
    follow,
    // Read by the verify harness and by tests; not used by the game.
    get staticCount() { return footprints.length; },
    get moverCount() { return followers.length; },
    staticMesh,
    moverMesh,
  };
}
