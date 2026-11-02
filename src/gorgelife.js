import * as THREE from 'three';
import { litMaterial } from './render/materials.js';
import { caveDepth, underCeiling } from './caves.js';

// =============================================================================
// The Gorge's life on a walk: what only the Gorge does at run time.
//
// gorge.js's build() hands walk.js `life: (ctx) => createGorgeLife(ctx)`;
// walk.js calls it once per walk, after weather and dusk have set the sun, and
// main.js calls update(dt, t, catPos, camera) every frame after the weather's
// update.
// endWalk calls dispose(). Every other area has no `life` and runs walk.js's
// NO_AREA_LIFE instead, so nothing changes there.
//
// Three things live here:
//   * SHADE BY HEIGHT (G5). Down on the gorge floor the walls keep the sun
//     off her; up on the clifftop it is bright. The sun is scaled by
//     shadeFor(the ground under her) and the fill by 0.85 + 0.15 * shade,
//     eased so a climb brightens gradually. Both go through composeIntensity,
//     so weather's own writes (the rainbow's 2.2, a sunset's 1.5, dusk's 0.7)
//     become the new base and are never lost or undone.
//   * WHEELING BIRDS (G11). Three birds circling high over the gorge, above
//     every rim and above the highest camera: one InstancedMesh, no shadow,
//     driven by time alone (no rng, so every device agrees). None with
//     reducedMotion.
//   * THE AMBIENCE MIX. audio.setAmbientMix({ high, cave }) at most 4 times
//     a second: the wind rises and the stream's lap fades as she climbs, and
//     soft drips come in by how deep into a cave she is (part 3, C7).
//
// And, from part 3 (the caves), never scary:
//   * DARKER DEEPER (C2). The light factor is darkFor(caveDepth(her spot)),
//     never under DARK_FLOOR, and moves toward it at a LINEAR 1.2 a second
//     going in and 2.0 coming out (a bend's small depth jump never flickers).
//     The sun gets shade x dark, the fill (0.85 + 0.15 shade) x dark, through
//     the same composeIntensity state, so a weather write is still the base.
//   * A WARM GLOW (C3). One PointLight round her cat, no shadow, added here
//     before the first frame (so no shader recompiles mid-walk) and always
//     there on a Gorge walk, at 0 outside. Removed by dispose.
//   * RAIN OUTSIDE (C6). While the camera is under a ceiling the weather
//     hides its rain column (weather.setSheltered, only on a change).
// =============================================================================

// The sun's share on the gorge floor; 1 from y 10 up.
export const SHADE_FLOOR = 0.6;
const SHADE_LOW = 2;
const SHADE_HIGH = 10;
// How fast shade moves toward its target, per second.
const SHADE_RATE = 1.5;
// The fill never drops as far as the sun: sky light still reaches the floor.
const FILL_FLOOR = 0.85;
// The ambience mix is sent at most this often (seconds).
const MIX_EVERY = 0.25;

// --- The caves (part 3) ---------------------------------------------------------
// Lights never fall below this share of what they were outside.
export const DARK_FLOOR = 0.3;
// The glow's intensity at full depth.
export const GLOW_MAX = 2.0;
// The light factor's linear rates, per second: in (darker) and out (lighter).
const DARK_IN_RATE = 1.2;
const DARK_OUT_RATE = 2.0;
// The glow reaches GLOW_MAX by this depth.
const GLOW_FULL_DEPTH = 0.35;
// The glow sits this far over her cat.
const GLOW_LIFT = 0.7;

// The light factor at a depth: 1 outside, DARK_FLOOR at the far end.
export function darkFor(depth) {
  return 1 - (1 - DARK_FLOOR) * depth;
}

// `value` moved toward `target` by at most `up` (rising) or `down` (falling).
function approach(value, target, up, down) {
  if (target > value) return Math.min(target, value + up);
  return Math.max(target, value - down);
}

function smoothstep(e0, e1, x) {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

// 0 on the floor, 1 from y 10: how high she is, for shade and the ambience.
const highFor = (groundY) => smoothstep(SHADE_LOW, SHADE_HIGH, groundY);

export function shadeFor(groundY) {
  return SHADE_FLOOR + (1 - SHADE_FLOOR) * highFor(groundY);
}

// Scales a light that someone else may also write. `state` is
// { base, written }: if the light no longer holds what we last wrote, someone
// else (weather's rainbow, dusk) set it, and that value is the new base.
export function composeIntensity(state, light, factor) {
  if (light.intensity !== state.written) state.base = light.intensity;
  light.intensity = state.base * factor;
  state.written = light.intensity;
}

const lightState = (light) => ({ base: light.intensity, written: light.intensity });

// --- Birds ------------------------------------------------------------------
// Each bird circles a centre over the gorge at radius r (9-14 m), turning at w
// rad/s (about 3.8 m/s along the circle), dir 1 or -1, and rises and falls
// gently about BIRD_Y. Heights stay in 32-36: over the 20 m rims and the
// highest camera (about 28 m), under the fog's reach. The sky's passing
// flock flies at the same height (gorge.js hands it to createSkyLife).
export const GORGE_BIRD_Y = 34;
const BIRD_BOB = 1.2;
const BIRDS = Object.freeze([
  { cx: -8, cz: -18, r: 12, w: 0.32, dir: 1, phase: 0 },
  { cx: -4, cz: 14, r: 9, w: 0.42, dir: -1, phase: 2.1 },
  { cx: 10, cz: -28, r: 14, w: 0.28, dir: 1, phase: 4.2 },
]);
const BIRD_BANK = 0.35;

// A gliding bird seen from below: two swept wings, nose toward +z.
function birdGeometry() {
  const nose = [0, 0, 0.35];
  const tail = [0, 0, -0.25];
  const left = [-1, 0.12, -0.15];
  const right = [1, 0.12, -0.15];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...nose, ...tail, ...left, ...nose, ...right, ...tail], 3));
  g.computeVertexNormals();
  return g;
}

function createBirds(scene) {
  const mesh = new THREE.InstancedMesh(birdGeometry(), litMaterial(0x3a3028, { side: THREE.DoubleSide }), BIRDS.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = false;
  mesh.userData.noCast = true;
  // The instances wheel far from the mesh's origin.
  mesh.frustumCulled = false;
  mesh.name = 'gorgeBirds';
  const dummy = new THREE.Object3D();

  function place(t) {
    BIRDS.forEach((b, i) => {
      const a = b.phase + b.dir * b.w * t;
      dummy.position.set(b.cx + b.r * Math.cos(a), GORGE_BIRD_Y + BIRD_BOB * Math.sin(0.4 * t + b.phase), b.cz + b.r * Math.sin(a));
      // facing along the circle, banked into the turn
      dummy.rotation.set(0, Math.atan2(-b.dir * Math.sin(a), b.dir * Math.cos(a)), b.dir * BIRD_BANK);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  place(0);
  scene.add(mesh);
  return {
    place,
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}

// The warm glow round her cat (C3). Never a shadow: castShadow stays false,
// and the caster sweep (render/rig.js) only ever touches meshes.
function createGlow(scene) {
  const glow = new THREE.PointLight(0xffd9a8, 0, 6, 1.5);
  glow.castShadow = false;
  glow.name = 'caveGlow';
  scene.add(glow);
  return glow;
}

// --- The life ---------------------------------------------------------------
// ctx: { scene, sun, fill, ground, reducedMotion, audio, caves, weather }.
// `audio` is the game's audio (setAmbientMix); without it the mix is skipped.
// `caves` is gorge.js's GORGE_CAVES (none: nowhere is a cave). `weather` is
// the walk's weather (setSheltered); without it the shelter is skipped.
// update(dt, t, catPos, camera): `camera` (its position) for the shelter.
export function createGorgeLife({ scene, sun, fill, ground, reducedMotion = false, audio = null, caves = null, weather = null }) {
  const sunState = lightState(sun);
  const fillState = lightState(fill);
  const birds = reducedMotion ? null : createBirds(scene);
  const glow = createGlow(scene);
  let shade = 1;
  // The eased light factor (1 outside, DARK_FLOOR at full depth) and glow.
  let dark = 1;
  let glowLevel = 0;
  let sheltered = false;
  let started = false;
  let mixTimer = 0;

  function light() {
    composeIntensity(sunState, sun, shade * dark);
    composeIntensity(fillState, fill, (FILL_FLOOR + (1 - FILL_FLOOR) * shade) * dark);
  }

  return {
    get shade() { return shade; },
    // How deep she is, eased: the depth the light factor stands for.
    get depth() { return (1 - dark) / (1 - DARK_FLOOR); },
    update(dt, t, catPos, camera) {
      const groundY = ground.y(catPos.x, catPos.z);
      const target = shadeFor(groundY);
      const depth = caveDepth(caves, catPos.x, catPos.z);
      const darkTarget = darkFor(depth);
      const glowTarget = GLOW_MAX * smoothstep(0, GLOW_FULL_DEPTH, depth);
      // The walk starts in the light she stands in; after that, eased.
      if (!started) {
        shade = target;
        dark = darkTarget;
        glowLevel = glowTarget;
        started = true;
      } else {
        const step = SHADE_RATE * dt;
        shade = Math.abs(target - shade) <= step ? target : shade + Math.sign(target - shade) * step;
        dark = approach(dark, darkTarget, DARK_OUT_RATE * dt, DARK_IN_RATE * dt);
        glowLevel = approach(glowLevel, glowTarget, DARK_IN_RATE * GLOW_MAX * dt, DARK_OUT_RATE * GLOW_MAX * dt);
      }
      light();
      glow.position.set(catPos.x, catPos.y + GLOW_LIFT, catPos.z);
      glow.intensity = glowLevel;
      if (weather && camera) {
        const p = camera.position;
        const under = underCeiling(ground, p.x, p.y, p.z);
        if (under !== sheltered) {
          sheltered = under;
          weather.setSheltered(under);
        }
      }
      birds?.place(t);
      mixTimer -= dt;
      if (mixTimer <= 0) {
        mixTimer = MIX_EVERY;
        audio?.setAmbientMix({ high: highFor(groundY), cave: (1 - dark) / (1 - DARK_FLOOR) });
      }
    },
    // Hands the lights back at full strength (keeping any weather write made
    // since the last frame), the rain back if it was hidden, and takes the
    // birds and the glow out.
    dispose() {
      composeIntensity(sunState, sun, 1);
      composeIntensity(fillState, fill, 1);
      if (sheltered) {
        sheltered = false;
        weather?.setSheltered(false);
      }
      birds?.dispose();
      scene.remove(glow);
      glow.dispose();
    },
  };
}
