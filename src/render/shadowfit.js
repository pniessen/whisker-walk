import * as THREE from 'three';

// =============================================================================
// SHADOW FIT — a sun shadow camera that follows the player, snapped to whole
// shadow-map texels so it does not shimmer while it does.
//
// WHAT WAS WRONG. The shadow camera was pinned at the world origin with an
// orthographic half-extent of 70, sized to cover the entire 110m area at once.
// At the high tier's 2048 map that is 140 world units over 2048 texels =
// 6.8 cm per texel, and 13.7 cm on the low tier's 1024. Nothing smaller than a
// parked car had a legible contact shadow, and measured against a
// shadows-off A/B the whole shadow pass moved 1.45% of screen pixels
// (docs/VISUAL-PASS.md section 1, "Flat", cause 3). The pass was being paid
// for in draw calls and returning nothing.
//
// WHAT THIS DOES. Almost nothing in a walk is more than ~30m from the camera
// and still readable — scene.fog starts at 40 and is opaque by 130 — so the
// map does not need to cover the area, it needs to cover the VIEW. Each frame
// the light and its target are moved to sit over a point just ahead of the
// camera and the frustum is tightened to +/-20 (quality.js's shadowFitRadius).
// 40 units over 2048 is 2.0 cm per texel: a 3.5x sharpening, and it makes the
// low tier's 1024 (3.9 cm) sharper than the high tier is today.
//
// WHY +/-20 COVERS MORE GROUND THAN IT SOUNDS LIKE. The frustum's half-extent
// is measured in LIGHT space, not world space, and light space is the world
// foreshortened by the sun's elevation. A ground point offset from the fit
// centre along the sun's azimuth by d metres sits only d*sin(elevation) from
// the centre in light space. At the 20 degree sun this pass moved to
// (walk.js's SUN_POSITION), sin(20.3 deg) = 0.347, so the +/-20 box reaches
// roughly +/-58m along the sun axis and +/-20m across it. That asymmetry is
// right one: it is the along-sun axis that long shadows travel down, so the
// casters whose shadows reach into view are the ones that stay inside the
// box. A caster outside the box laterally cannot cast into it at all —
// shadow rays travel along light-space z — so there is no "tall building just
// out of frame" case to worry about, only a genuinely distant one.
//
// WHY THE SNAPPING IS NOT OPTIONAL. A shadow map is a grid sampled in light
// space. Slide that grid by a third of a texel and every shadow edge in the
// scene re-quantises against a different set of texel boundaries — the edge
// visibly boils and crawls as the player walks, which is worse to look at
// than the soft, stable, useless shadows this replaces. The cure is to move
// the camera only in whole-texel steps: the grid then lands on exactly the
// same world positions it did last frame, and edges stay put. See
// snapToTexelGrid below for the arithmetic.
// =============================================================================

const WORLD_UP = new THREE.Vector3(0, 1, 0);

// How far back along the sun direction the light is parked from the fit
// centre, and the depth range the shadow camera keeps.
//
// NEAR/FAR ARE DELIBERATELY THE SAME 1..160 THE FIXED CAMERA USED. three's
// shadow.bias is applied in normalised [0,1] depth, so its world-space
// meaning is (far - near) * bias. Keeping that span identical means the
// tightening below changes the map's LATERAL resolution and nothing else, and
// the bias retune in walk.js can be argued purely from texel size rather than
// from two variables moving at once.
//
// BACKOFF is then the one number that has to keep the world inside that span.
// The worst case is a caster at the far edge of the light-space box on the
// sun-facing side: at the 19 degree sun that is ~61m of ground, or ~58 units of
// depth, either side of the centre. 80 leaves the near side at ~22 and the far
// side at ~138, both comfortably inside 1..160, with headroom for a sun several
// degrees lower again before anything clips.
const BACKOFF = 80;
const NEAR = 1;
const FAR = 160;

// The fit centre sits this fraction of a radius in front of the camera rather
// than on it. The chase camera is 4.5m behind the cat (catcam.js), so centring
// on the camera itself would spend a quarter of the box on ground behind the
// player that is never on screen.
//
// 0.75 by measurement: pushing the centre out from 0.5 to 0.75 of a radius
// gains about 2% of shadowed screen pixels across the audit's 24-view panel,
// and everything past 0.75 is flat — the box has by then reached as far down
// the view as the fog leaves anything worth shadowing. Stopping at the point
// the curve flattens rather than going further leaves the near edge of the box
// a comfortable 9m behind the cat, so a fast turn cannot swing the cat's own
// contact shadow out of the map.
const LEAD_FRACTION = 0.75;

// Peter-panning offset, as a MULTIPLE OF ONE TEXEL rather than a constant.
// three's normalBias pushes the shadow lookup along the surface normal in
// world units; what it exists to hide is the depth error across a single
// shadow texel, so the right size for it scales with the texel and not with
// the scene. Expressed this way, the high tier (2.0 cm texels) gets 1.4 cm and
// the low tier (3.9 cm) gets 2.7 cm from one line, where the old code gave
// both the same 2 cm and therefore over-biased high and under-biased low.
// 0.7 rather than 1.0: PCFSoftShadowMap already spreads its taps, so a full
// texel of normal offset detaches contact shadows visibly at the grazing sun
// angle this pass introduces — and a detached contact shadow is the exact
// thing the whole item exists to fix.
const NORMAL_BIAS_TEXELS = 0.7;

// The orthonormal light-space basis, matching THREE's own to the sign.
//
// This has to agree with three EXACTLY or the snapping snaps to the wrong
// grid. WebGLShadowMap points the shadow camera with
// `shadowCamera.lookAt(target)`, and Object3D.lookAt on a camera builds
// Matrix4.lookAt(position, target, this.up) — which is z = normalize(eye -
// target), x = normalize(up x z), y = z x x, with the shadow camera's default
// up of world +Y. So z here points FROM the target TOWARD the light, the same
// direction `sun.position` sits in.
export function lightBasis(direction, up = WORLD_UP) {
  const z = direction.clone().normalize();
  const x = new THREE.Vector3().crossVectors(up, z);
  // Degenerate only if the sun is straight overhead or straight below, which
  // no area authors and the game has no night. Nudged rather than thrown on:
  // a silently wrong basis is a debugging afternoon, a visibly wrong shadow
  // direction is a five-second bug report.
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return { x, y, z };
}

// Snap a world-space point to the shadow map's own texel grid.
//
// THE MATHS. The shadow map is an orthographic rendering along basis.z, so its
// texels are a regular grid on the (basis.x, basis.y) plane, `texelSize` world
// units apart. Decompose the centre into that basis — because the basis is
// orthonormal, the components are plain dot products and the reconstruction is
// an exact sum — round the two LATERAL components to whole multiples of the
// texel size, and rebuild. The grid the camera then rasterises lands on the
// same world positions every frame regardless of where the player is, so a
// given world point always falls in the same texel and its shadow edge stops
// crawling.
//
// The DEPTH component (along basis.z) is deliberately left unrounded. Depth is
// compared as a continuous value, not bucketed into a grid, so quantising it
// would buy nothing and would add a periodic depth wobble of its own — which
// is exactly the kind of thing that turns into intermittent acne.
export function snapToTexelGrid(centre, basis, texelSize, out = new THREE.Vector3()) {
  const lateralX = Math.round(centre.dot(basis.x) / texelSize) * texelSize;
  const lateralY = Math.round(centre.dot(basis.y) / texelSize) * texelSize;
  const depth = centre.dot(basis.z);
  return out
    .set(0, 0, 0)
    .addScaledVector(basis.x, lateralX)
    .addScaledVector(basis.y, lateralY)
    .addScaledVector(basis.z, depth);
}

// The ground point the shadow box is centred on: `lead` metres in front of the
// camera, flattened to y = 0.
//
// Flattened deliberately. The camera pitches (catcam.js's pitch clamp runs
// -0.3 to 0.9 rad) and rises with the zoomies FOV kick, and letting the box
// centre ride up and down with it would slide the whole light-space grid
// vertically for no gain — the ground the shadows land on is at y = 0 either
// way. Taking the y out here means a player who only looks around, without
// moving, moves the fit centre in a plane rather than in space, which is one
// fewer axis for the snapping to have to hold still.
export function fitCentre(camera, lead, out = new THREE.Vector3()) {
  out.set(0, 0, -1).applyQuaternion(camera.quaternion);
  out.y = 0;
  // Camera pointing straight down or straight up: the horizontal forward is
  // undefined, so fall back to centring on the camera itself rather than
  // sending the box to NaN.
  if (out.lengthSq() < 1e-8) out.set(0, 0, 0);
  else out.normalize().multiplyScalar(lead);
  out.x += camera.position.x;
  out.z += camera.position.z;
  out.y = 0;
  return out;
}

// The per-walk rig, in the same { update, dispose } shape the session already
// uses for water, wind, fx and scent — so walk.js hangs it on the session and
// main.js's render loop calls it beside session.water.update(dt) with no new
// convention to learn.
//
// `sun` must be at its authored position, with its target still at the origin
// three left it at, when this is called: the light DIRECTION is read once here
// as (position - target) and then held fixed for the walk, because from the
// next frame onward this rig OWNS both of those and reading the direction back
// off them would be circular. A fresh walk always builds a fresh light, so the
// only way to trip over this is to rebuild a rig around a light some earlier
// rig has already aimed.
//
// `lead` defaults from the radius and exists as an option purely so
// verify-lighting.html can sweep it; nothing in the game passes it.
export function createShadowFit(sun, camera, { radius, mapSize, lead = radius * LEAD_FRACTION }) {
  sun.castShadow = true;
  sun.shadow.mapSize.set(mapSize, mapSize);

  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -radius;
  shadowCamera.right = radius;
  shadowCamera.top = radius;
  shadowCamera.bottom = -radius;
  shadowCamera.near = NEAR;
  shadowCamera.far = FAR;
  shadowCamera.updateProjectionMatrix();

  const texelSize = (2 * radius) / mapSize;
  sun.shadow.normalBias = texelSize * NORMAL_BIAS_TEXELS;

  const direction = sun.position.clone().sub(sun.target.position).normalize();
  const basis = lightBasis(direction);

  const centre = new THREE.Vector3();
  const snapped = new THREE.Vector3();

  function update() {
    fitCentre(camera, lead, centre);
    snapToTexelGrid(centre, basis, texelSize, snapped);
    sun.target.position.copy(snapped);
    // sun.target is a bare Object3D that has never been added to the scene
    // (three constructs one for every DirectionalLight and leaves it
    // parentless), so nothing else will ever refresh its matrixWorld — and
    // DirectionalLightShadow.updateMatrices reads the light's aim straight off
    // that matrix. For a parentless object updateMatrixWorld() is just
    // matrixWorld = matrix, i.e. two copies; doing it here is cheaper and far
    // less invasive than putting a second object into the scene graph that
    // endWalk's dispose traversal would then have to know about.
    sun.target.updateMatrixWorld();
    sun.position.copy(snapped).addScaledVector(direction, BACKOFF);
  }

  update(); // so the walk's very first frame is already fitted, not centred on the world origin

  return {
    update,
    // Nothing to release: the rig allocates no GPU resource of its own. The
    // shadow map belongs to the light, which endWalk's scene teardown already
    // drops along with the rest of the walk. Present because every session rig
    // has it and the render loop calls them uniformly.
    dispose() {},
  };
}
