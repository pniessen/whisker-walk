import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';

// ---------------------------------------------------------------------------
// NIGHT SKY — twinkling stars and a crescent moon on dusk walks (the
// collar-glow reward). Built and driven by render/clouds.js's createClouds,
// which owns everything in the sky; see its header for the camera-following
// and determinism reasoning, which applies here unchanged.
//
// THE BUDGET. +2 draw calls in the main pass, 0 in the shadow pass: the stars
// are ONE Points (no triangles), the moon ONE camera-facing quad (2
// triangles). Both carry userData.clouds/noCast/noMerge so rig.js's caster
// sweep and mergeprops.js leave them alone.
//
// WHERE THEY SIT. Centred on the camera every frame, the stars at STAR_RADIUS
// and the moon at MOON_RADIUS: behind every cloud (SKY_RADIUS + reach) and
// inside the 300m far plane. They depth-test but never depth-write, so hills,
// cottages and clouds hide them and they never hide anything.
//
// WHAT YOU CAN SEE. The default view reaches only ~7 degrees above level and
// ~30 looking up (render/sky.js), so the stars crowd low; those right on the
// horizon fade out in its glow (starFade).
// ---------------------------------------------------------------------------

export const STAR_RADIUS = 285;
export const MOON_RADIUS = 270;
export const STAR_COUNT = 420;
// Just above the default view: look up a little and there it is.
export const MOON_ELEV_DEG = 11;
// Radians clockwise (to the right) of the walk's starting view.
export const MOON_OFFSET = 0.45;
export const MOON_SIZE = 44;

const DEG = Math.PI / 180;

// Bearings in this file turn clockwise seen from above (to the RIGHT, the
// way the player turns with a right swipe): bearing 0 looks down +z, and
// bearing b looks along (-sin b, 0, cos b).
function bearingOf(x, z) {
  return Math.atan2(-x, z);
}

// layoutStars(areaId, count) — unit directions plus per-star size (px),
// brightness (already faded at the horizon) and twinkle phase. Its own seeded
// stream per area, so every client sees the same sky and walkRng is untouched.
export function layoutStars(areaId, count = STAR_COUNT) {
  const rng = mulberry32(seedFromCode(`stars:${areaId}`));
  const dir = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const bright = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // u^1.8 crowds them low, where the camera actually looks.
    const el = 3 + 72 * rng() ** 1.8;
    const az = rng() * Math.PI * 2;
    const c = Math.cos(el * DEG);
    dir[i * 3] = Math.cos(az) * c;
    dir[i * 3 + 1] = Math.sin(el * DEG);
    dir[i * 3 + 2] = Math.sin(az) * c;
    // About one in 25 is a bright star; the rest are small.
    size[i] = rng() < 0.04 ? 3.6 + rng() * 0.6 : 1.4 + rng() * 1.8;
    const lift = (el - 3) / 72;
    bright[i] = (0.55 + 0.45 * Math.min(1, lift * 2 + rng() * 0.3)) * starFade(el);
    phase[i] = rng();
  }
  return { dir, size, bright, phase };
}

// 0 at or below 3 degrees, 1 at or above 8: the horizon glow swallows them.
export function starFade(elevDeg) {
  const k = Math.min(Math.max((elevDeg - 3) / 5, 0), 1);
  return k * k * (3 - 2 * k);
}

// The moon's direction for a walk that started looking along bearing `yaw`.
export function moonDirection(yaw) {
  const b = yaw + MOON_OFFSET;
  const c = Math.cos(MOON_ELEV_DEG * DEG);
  return new THREE.Vector3(-Math.sin(b) * c, Math.sin(MOON_ELEV_DEG * DEG), Math.cos(b) * c);
}

const STAR_VERT = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aSize;
attribute float aBright;
attribute float aPhase;
varying float vA;
void main() {
  vA = aBright * (0.72 + 0.28 * sin(uTime * (1.3 + aPhase) + aPhase * 6.283));
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const STAR_FRAG = /* glsl */ `
varying float vA;
void main() {
  float a = vA * smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
  gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), a);
}`;

// A warm crescent with a soft halo, or null headless (no canvas context).
function moonTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  const c = 64;
  const r = 64 / 3; // the halo spans the outer 3x radius, to the canvas edge
  ctx.fillStyle = '#fff6d8';
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  // Bite the disc from the upper left, leaving a lit lower-right crescent.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(c - 0.3 * r, c - 0.3 * r, r, 0, Math.PI * 2); // offset 0.42 r
  ctx.fill();
  // Halo goes BEHIND the crescent, so the bite does not cut it too.
  ctx.globalCompositeOperation = 'destination-over';
  const g = ctx.createRadialGradient(c, c, r, c, c, 3 * r);
  g.addColorStop(0, 'rgba(255, 246, 216, 0.35)');
  g.addColorStop(1, 'rgba(255, 246, 216, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skyFlags(obj) {
  obj.castShadow = false;
  obj.receiveShadow = false;
  // Centred on the camera by construction; a cached bound would be stale.
  obj.frustumCulled = false;
  Object.assign(obj.userData, { noCast: true, noMerge: true, clouds: true });
}

// createNightSky(scene, { areaId, camera, reducedMotion }) — the stars and
// moon, in the session's { update, dispose } shape. `moon` is null headless.
export function createNightSky(scene, { areaId, camera, reducedMotion = false } = {}) {
  const { dir, size, bright, phase } = layoutStars(areaId);
  const pos = new Float32Array(dir.length);
  for (let i = 0; i < dir.length; i++) pos[i] = dir[i] * STAR_RADIUS;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geometry.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  // Raw colour, like the untone-mapped sky background behind them.
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(globalThis.devicePixelRatio || 1, 2) },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = 'stars';
  skyFlags(stars);
  scene.add(stars);

  let moon = null;
  const map = moonTexture();
  if (map) {
    moon = new THREE.Mesh(
      new THREE.PlaneGeometry(MOON_SIZE, MOON_SIZE),
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    );
    moon.name = 'moon';
    moon.renderOrder = 1; // over the additive stars
    skyFlags(moon);
    scene.add(moon);
  }

  // The moon is fixed in the sky relative to where the walk started looking,
  // so it greets the player up and to the right and stays put as they turn.
  const fwd = camera.getWorldDirection(new THREE.Vector3());
  const yaw0 = Math.hypot(fwd.x, fwd.z) > 1e-6 ? bearingOf(fwd.x, fwd.z) : Math.PI; // three's default -z
  const moonDir = moonDirection(yaw0);

  // update(t) — once per frame after the camera moved; t is absolute seconds.
  function update(t = 0) {
    material.uniforms.uTime.value = reducedMotion ? 0 : t;
    stars.position.copy(camera.position);
    if (moon) {
      moon.position.copy(camera.position).addScaledVector(moonDir, MOON_RADIUS);
      moon.quaternion.copy(camera.quaternion);
    }
  }

  function dispose() {
    scene.remove(stars);
    geometry.dispose();
    material.dispose();
    if (moon) {
      scene.remove(moon);
      moon.geometry.dispose();
      moon.material.dispose();
      map.dispose();
    }
  }

  update(0);
  return { stars, moon, update, dispose };
}
