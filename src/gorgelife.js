import * as THREE from 'three';
import { litMaterial } from './render/materials.js';

// =============================================================================
// The Gorge's life on a walk: what only the Gorge does at run time.
//
// gorge.js's build() hands walk.js `life: (ctx) => createGorgeLife(ctx)`;
// walk.js calls it once per walk, after weather and dusk have set the sun, and
// main.js calls update(dt, t, catPos) every frame after the weather's update.
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
//   * THE AMBIENCE MIX. audio.setAmbientMix({ high }) at most 4 times a
//     second: the wind rises and the stream's lap fades as she climbs.
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

// --- The life ---------------------------------------------------------------
// ctx: { scene, sun, fill, ground, reducedMotion, audio }. `audio` is the
// game's audio (setAmbientMix); without it the mix is skipped.
export function createGorgeLife({ scene, sun, fill, ground, reducedMotion = false, audio = null }) {
  const sunState = lightState(sun);
  const fillState = lightState(fill);
  const birds = reducedMotion ? null : createBirds(scene);
  let shade = 1;
  let started = false;
  let mixTimer = 0;

  function light() {
    composeIntensity(sunState, sun, shade);
    composeIntensity(fillState, fill, FILL_FLOOR + (1 - FILL_FLOOR) * shade);
  }

  return {
    get shade() { return shade; },
    update(dt, t, catPos) {
      const groundY = ground.y(catPos.x, catPos.z);
      const target = shadeFor(groundY);
      // The walk starts in the light she stands in; after that, eased.
      if (!started) { shade = target; started = true; }
      else {
        const step = SHADE_RATE * dt;
        shade = Math.abs(target - shade) <= step ? target : shade + Math.sign(target - shade) * step;
      }
      light();
      birds?.place(t);
      mixTimer -= dt;
      if (mixTimer <= 0) {
        mixTimer = MIX_EVERY;
        audio?.setAmbientMix({ high: highFor(groundY) });
      }
    },
    // Hands the lights back at full strength (keeping any weather write made
    // since the last frame) and takes the birds out.
    dispose() {
      composeIntensity(sunState, sun, 1);
      composeIntensity(fillState, fill, 1);
      birds?.dispose();
    },
  };
}
