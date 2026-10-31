import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';

// ---------------------------------------------------------------------------
// CLOUDS — a few soft low-poly clouds drifting across the outdoor skies
// (Stream 4 round four, docs/VISUAL-PASS.md "Stream 4 round four — clouds").
//
// THE BUDGET. Every puff of every cloud is one instance of ONE InstancedMesh
// with ONE material: +1 draw call in the main pass, 0 in the shadow pass
// (castShadow false, and rig.js's caster sweep and mergeprops.js both skip
// `userData.clouds`). Triangles are the cheap resource (VISUAL-PASS.md
// section 0), so the puffs are a subdivided icosahedron rather than a bare one.
//
// THE CLOUDS FOLLOW THE CAMERA. Real clouds are kilometres away and show no
// parallax when you walk; ours are centred on the camera's xz every frame, so
// they behave the same and, just as importantly, their distance from the
// camera is bounded by construction. That is what keeps them inside the game
// camera's 300m far plane (main.js) wherever the cat walks, and lets them sit
// as far out — and so as low in the sky — as that plane allows. The default
// game view only shows the sky up to ~7 degrees above level (render/sky.js's
// header does that arithmetic), so a cloud has to be far out to be seen at all.
//
// THE DRIFT. Each cloud runs along the lawn's wind direction (grass.js's
// WIND_DIR, so the world agrees with itself) on a chord of a disc of radius
// SKY_RADIUS around the camera, and wraps from the downwind end of its chord
// back to the upwind end. A cloud shrinks to nothing over the last FADE_LEN
// metres of its chord and grows back from nothing at the start, so the wrap is
// a slow dissolve far out at the horizon, never a pop. Positions are a pure
// function of absolute time (cloudPlace), so there is no running state to
// drift and reduced motion is simply "always t = 0".
//
// DETERMINISM. Layout comes from a fixed per-area seed (a hash of the area
// id) on its own mulberry32 stream. It never touches walkRng, so the shared
// co-walk randomness is untouched, and it sends nothing over the wire: every
// client lays out the same sky for the same area anyway.
//
// COLOUR. The vertex colours carry SHADING, not colour: red = a baked
// per-face facet light (the flat low-poly look without lighting the material),
// green = how far up the puff the face sits (0 on the flat underside). The
// shader turns those into mix(under, top, green) * red from two uniforms, and
// cloudPalette() picks those from the live fog colour each frame. That fog
// colour is the sky's own horizon stop (world/builder.js applySky), the dusk
// horizon (walk.js), or the rain/sunset horizon (weather.js), so the clouds
// re-tint by themselves when a shower clears and the sky comes back.
//
// FOG. The material has fog off: scene fog runs out at 110-130m and every
// cloud is further than that, so fogged clouds would vanish into the haze. A
// gentler manual haze (HAZE_NEAR..HAZE_FAR, at most HAZE_MAX) pulls the far
// ones toward the horizon colour instead, the way distance softens real ones.
// ---------------------------------------------------------------------------

// Outdoor areas only: the den is a room and its window does not show sky
// far enough out to matter.
export const CLOUD_AREAS = Object.freeze(['neighborhood', 'park', 'seaside', 'docks']);

// One wind direction for the whole world: grass.js's WIND_DIR (0.8, 0.6).
export const WIND_DIR = Object.freeze([0.8, 0.6]);
// Across-wind unit vector (WIND_DIR turned 90 degrees in xz).
const ACROSS = Object.freeze([-0.6, 0.8]);

// The disc around the camera the cloud centres live in (metres). With the
// largest cloud's reach and top that is still ~30m inside the 300m far plane.
export const SKY_RADIUS = 220;
// No chord passes closer than this to the camera: a cloud straight overhead is
// out of view at every pitch the camera allows, so it would waste a cloud.
const MIN_ACROSS = 0.25;
const MAX_ACROSS = 0.85;
// The dissolve at each end of a chord.
export const FADE_LEN = 45;
// m/s. ~0.4 degrees a second for a cloud 150m out: you can see it move if
// you watch, but it never pulls the eye.
const SPEED_MIN = 0.6;
const SPEED_MAX = 1.1;

// Altitude of a cloud's flat base. The floor is the default; createClouds
// raises it per area if the horizon band is tall enough that a cloud at the
// edge of the disc would sit behind its crest (the Docks' skyline is).
export const BASE_MIN = 30;
export const BASE_SPREAD = 16;
// From the area centre, at cat height, a cloud's base clears the horizon
// band's highest point by at least this much elevation.
export const BAND_CLEARANCE_DEG = 1.5;
const EYE_Y = 2;

// Puff shape. A unit icosahedron with every vertex below FLAT_Y pulled up to
// it: the flat underside is the classic low-poly cloud, and it is where the
// darker sky-tinted colour lives.
const FLAT_Y = -0.35;
// Puffs are squashed to this fraction of their width.
export const SQUASH = 0.6;
const PUFF_MIN = 7;
const PUFF_MAX = 13;

// Haze, by distance from the camera (metres) and its strength at the far end.
const HAZE_NEAR = 120;
const HAZE_FAR = 280;
const HAZE_MAX = 0.5;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in test/clouds.test.js)
// ---------------------------------------------------------------------------

// The fixed per-area seed: FNV-1a of the area id (rng.js's seedFromCode)
// with a salt so it never shares a stream with anything else keyed on a name.
export function areaSeed(areaId) {
  return (seedFromCode(`clouds:${areaId}`) ^ 0x5c10d5) >>> 0;
}

// layoutClouds(areaId, count, baseMin) — `count` clouds, each
//   { v, u0, speed, base, yaw, scale, puffs: [{ x, z, r, yaw }] }
// in its own frame (puff x along the cloud's long axis). Deterministic: the
// same area and count always give the same sky.
export function layoutClouds(areaId, count, baseMin = BASE_MIN) {
  const rng = mulberry32(areaSeed(areaId));
  const clouds = [];
  for (let i = 0; i < count; i++) {
    // Start bearings are stratified round the compass (one slot per cloud,
    // jittered within it), so the first look at the sky in any direction finds
    // a cloud or two rather than a lucky clump on one side and a bare
    // quarter on the other. The start point is then read back as a chord:
    // how far across the wind (v, kept off the overhead band and off the
    // disc's rim) and how far along it (u0).
    const bearing = ((i + 0.15 + rng() * 0.7) / count) * Math.PI * 2;
    const dist = SKY_RADIUS * (0.45 + 0.45 * rng());
    const sx = Math.cos(bearing) * dist;
    const sz = Math.sin(bearing) * dist;
    let v = sx * ACROSS[0] + sz * ACROSS[1];
    const lim = Math.min(Math.max(Math.abs(v), SKY_RADIUS * MIN_ACROSS), SKY_RADIUS * MAX_ACROSS);
    v = v < 0 ? -lim : lim;
    const half = Math.sqrt(SKY_RADIUS * SKY_RADIUS - v * v);
    const u0 = Math.min(Math.max(sx * WIND_DIR[0] + sz * WIND_DIR[1], -half), half);
    const n = 3 + Math.floor(rng() * 4); // 3-6 puffs
    const span = 4 + n * 3.5;
    const puffs = [];
    for (let j = 0; j < n; j++) {
      // Spread along the long axis, biggest in the middle so the cloud domes.
      const x = n === 1 ? 0 : -span + (2 * span * j) / (n - 1) + (rng() - 0.5) * 3;
      const edge = Math.abs(x) / span;
      puffs.push({
        x,
        z: (rng() - 0.5) * 8,
        r: (PUFF_MIN + rng() * (PUFF_MAX - PUFF_MIN)) * (1 - 0.4 * edge),
        yaw: rng() * Math.PI * 2,
      });
    }
    clouds.push({
      v,
      u0,
      speed: SPEED_MIN + rng() * (SPEED_MAX - SPEED_MIN),
      base: baseMin + rng() * BASE_SPREAD,
      // A small twist off broadside; see update() for why broadside.
      yaw: (rng() - 0.5) * 0.8,
      scale: 0.8 + rng() * 0.5,
      puffs,
    });
  }
  return clouds;
}

// wrap x into [-half, half).
function wrap(x, half) {
  const w = 2 * half;
  return ((((x + half) % w) + w) % w) - half;
}

// cloudPlace(cloud, t, out) — where a cloud's centre is at absolute time t,
// relative to the camera's xz, and its dissolve factor (0 at a chord end,
// 1 for most of the chord): { x, z, u, half, fade }. Writes into `out` when
// given (update() passes one scratch object, so the frame allocates nothing),
// else returns a fresh object.
export function cloudPlace(cloud, t, out = null) {
  const half = Math.sqrt(SKY_RADIUS * SKY_RADIUS - cloud.v * cloud.v);
  const u = wrap(cloud.u0 + cloud.speed * t, half);
  const d = half - Math.abs(u);
  const k = Math.min(Math.max(d / FADE_LEN, 0), 1);
  const o = out ?? {};
  o.x = u * WIND_DIR[0] + cloud.v * ACROSS[0];
  o.z = u * WIND_DIR[1] + cloud.v * ACROSS[1];
  o.u = u;
  o.half = half;
  o.fade = k * k * (3 - 2 * k);
  return o;
}

// The furthest any cloud vertex can reach horizontally from its cloud's
// centre, and the highest any reaches above its base (metres). For the far
// plane check: a centre is within SKY_RADIUS, so a vertex is within
// SKY_RADIUS + cloudReach of the camera's xz.
export function cloudReach(cloud) {
  let h = 0;
  let top = 0;
  for (const p of cloud.puffs) {
    h = Math.max(h, (Math.hypot(p.x, p.z) + p.r) * cloud.scale);
    top = Math.max(top, (1 - FLAT_Y) * p.r * SQUASH * cloud.scale);
  }
  return { horizontal: h, top };
}

// The lowest base that keeps a cloud at the disc's edge (plus its reach)
// above the band's highest elevation seen from the area centre at cat height.
// `bandDeg` is that elevation in degrees (bandElevation below).
export function baseFor(bandDeg, reach = 0) {
  const tan = Math.tan(((bandDeg + BAND_CLEARANCE_DEG) * Math.PI) / 180);
  return Math.max(BASE_MIN, Math.ceil(EYE_Y + tan * (SKY_RADIUS + reach)));
}

// bandElevation(scene, centre) — the steepest elevation (degrees) of any
// horizon-band vertex as seen from (centre.x, EYE_Y, centre.z). 0 when the
// scene has no band.
export function bandElevation(scene, centre = { x: 0, z: 0 }) {
  const band = scene.getObjectByName('horizonBand');
  const pos = band?.geometry?.attributes?.position;
  if (!pos) return 0;
  band.updateWorldMatrix(true, false);
  const v = new THREE.Vector3();
  let best = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(band.matrixWorld);
    const el = Math.atan2(v.y - EYE_Y, Math.hypot(v.x - centre.x, v.z - centre.z));
    if (el > best) best = el;
  }
  return (best * 180) / Math.PI;
}

// cloudPalette(horizon, mood, out) — { top, under, haze } THREE.Colors from
// the sky's live horizon colour. `mood` is 'day' (or false), 'dusk' (or true,
// the old boolean) or 'sunset'.
// Day: near-white tops (a breath of the horizon in them) over an underside
// pulled from the horizon toward a cool slate, which is what lets the clouds
// read against the Seaside's nearly white horizon.
// Dusk: the lit side goes warm and dim (a peach mixed into the purple horizon)
// and the underside drops below the horizon, so nothing glows white against a
// dusk sky.
// Sunset (weather.js's sunset walk, whose fog is the peach 0xf8c890 horizon):
// the tops catch the low sun, a warm cream only a step brighter than the
// horizon, never the day's near-white; the undersides go a dusky mauve.
// Without this a sunset walk used the day palette and its tops read as white
// cut-outs against an orange sky.
const WHITE = new THREE.Color(0xffffff);
const SLATE = new THREE.Color(0x76869e);
const PEACH = new THREE.Color(0xf2b08c);
const SUNLIT = new THREE.Color(0xffe2c4);
const MAUVE = new THREE.Color(0x8a6a80);
export function cloudPalette(horizon, mood = false, out = null) {
  const h = horizon instanceof THREE.Color ? horizon : new THREE.Color(horizon);
  const p = out ?? { top: new THREE.Color(), under: new THREE.Color(), haze: new THREE.Color() };
  p.haze.copy(h);
  if (mood === true || mood === 'dusk') {
    p.top.copy(h).lerp(PEACH, 0.38);
    p.under.copy(h).multiplyScalar(0.72);
  } else if (mood === 'sunset') {
    p.top.copy(h).lerp(SUNLIT, 0.45);
    p.under.copy(h).lerp(MAUVE, 0.5).multiplyScalar(0.85);
  } else {
    p.top.copy(WHITE).lerp(h, 0.12);
    p.under.copy(h).lerp(SLATE, 0.42).multiplyScalar(0.88);
  }
  return p;
}

// The unit puff: an icosahedron with a flat underside, and its per-face
// shading baked into vertex colours (see COLOUR above).
const LIGHT = new THREE.Vector3(-0.5, 1, -0.33).normalize();
export function puffGeometry(detail = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail); // non-indexed already
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < FLAT_Y) pos.setY(i, FLAT_Y);
  }
  const colors = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f);
    b.fromBufferAttribute(pos, f + 1);
    c.fromBufferAttribute(pos, f + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize();
    // Degenerate (fully flattened) faces have no normal; they lie in the
    // flat base, which faces straight down anyway.
    if (!Number.isFinite(n.x)) n.set(0, -1, 0);
    if (n.dot(a) < 0) n.negate(); // outward
    const shade = 0.84 + 0.16 * Math.max(0, n.dot(LIGHT));
    const cy = (a.y + b.y + c.y) / 3;
    const k = Math.min(Math.max((cy - FLAT_Y) / (0.5 - FLAT_Y), 0), 1);
    const up = n.y <= -0.99 ? 0 : k * k * (3 - 2 * k);
    for (let v = 0; v < 3; v++) {
      colors[(f + v) * 3] = shade;
      colors[(f + v) * 3 + 1] = up;
      colors[(f + v) * 3 + 2] = 0;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const NO_CLOUDS = Object.freeze({ mesh: null, clouds: [], update() {}, dispose() {} });

// createClouds(scene, { areaId, tier, camera, reducedMotion, dusk, sunset, centre })
// — the per-walk rig, in the session's { update, dispose } shape. Call it
// AFTER rig.js's assignShadowCasters and mergeStaticProps have scanned the
// scene (both also skip `userData.clouds`, belt and braces). A no-op stub for
// the den, an unknown area, or a tier with clouds off. `centre` is the area's
// middle, used once to measure the horizon band; it defaults to the origin
// every world is built around. `sunset` is a sunset-weather walk (walk.js
// passes weather.condition === 'sunset'); weather never rolls on a dusk walk,
// and a sunset lasts the whole walk, so the mood is fixed at creation while
// the colours themselves still follow the live fog.
export function createClouds(scene, {
  areaId, tier, camera, reducedMotion = false, dusk = false, sunset = false, centre,
} = {}) {
  const count = tier?.cloudCount ?? 0;
  if (!CLOUD_AREAS.includes(areaId) || !(count > 0) || !camera) return NO_CLOUDS;

  // Lay out once at the floor to learn the reach, then raise the base if the
  // band needs it, and lay out again at that base (same seed, same shapes).
  let clouds = layoutClouds(areaId, count);
  const reach = Math.max(...clouds.map((c) => cloudReach(c).horizontal));
  const baseMin = baseFor(bandElevation(scene, centre), reach);
  if (baseMin !== BASE_MIN) clouds = layoutClouds(areaId, count, baseMin);

  const total = clouds.reduce((s, c) => s + c.puffs.length, 0);
  const mood = dusk ? 'dusk' : sunset ? 'sunset' : 'day';
  const palette = cloudPalette(scene.fog?.color ?? 0xcfe8f0, mood);
  const uniforms = {
    uTop: { value: palette.top },
    uUnder: { value: palette.under },
    uHaze: { value: palette.haze },
    uHazeRange: { value: new THREE.Vector3(HAZE_NEAR, HAZE_FAR, HAZE_MAX) },
  };
  // toneMapped false: the sky behind them is a background texture, which the
  // renderer does not tone-map, so the clouds are authored in the same display
  // colours as the sky. Tone-mapped, ACES pulls their white down to a dull
  // grey against an untouched sky. (On the composer path the output pass
  // tone-maps the whole frame, sky and clouds alike, so they still agree.)
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform vec3 uHazeRange;
varying float vHaze;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vHaze = smoothstep(uHazeRange.x, uHazeRange.y, length(mvPosition.xyz)) * uHazeRange.z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uTop;
uniform vec3 uUnder;
uniform vec3 uHaze;
varying float vHaze;`)
      // vColor is (facet shade, height up the puff, 0); see COLOUR above.
      .replace('#include <color_fragment>', `diffuseColor.rgb = mix(uUnder, uTop, vColor.g) * vColor.r;
diffuseColor.rgb = mix(diffuseColor.rgb, uHaze, vHaze);`);
  };
  material.customProgramCacheKey = () => 'whisker-clouds';

  const mesh = new THREE.InstancedMesh(puffGeometry(1), material, total);
  mesh.name = 'clouds';
  mesh.userData.clouds = true;
  // No cloud shadows: the shadow pass is the expensive one on the phone.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // The instances move every frame and follow the camera, so three's cached
  // instance bounding sphere would be stale; the clouds are around the
  // camera by construction anyway.
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const at = { x: 0, z: 0, u: 0, half: 0, fade: 0 }; // cloudPlace's scratch

  // update(t) — once per rendered frame, after the camera moved. `t` is
  // absolute elapsed seconds (the same t wind/grass take).
  function update(t = 0) {
    const time = reducedMotion ? 0 : t;
    const cx = camera.position.x;
    const cz = camera.position.z;
    let i = 0;
    for (const cloud of clouds) {
      cloudPlace(cloud, time, at);
      const s = cloud.scale * at.fade;
      // Long axis across the line of sight (tangent to the circle round the
      // camera), give or take the cloud's own twist: end-on, a row of puffs
      // collapses into a stack and reads as a mushroom. Being camera-relative,
      // this turns only as fast as the cloud's bearing does, a fraction of a
      // degree a second far out, which nobody can see.
      const yaw = Math.atan2(at.z, at.x) + Math.PI / 2 + cloud.yaw;
      const cos = Math.cos(yaw);
      const sin = Math.sin(yaw);
      for (const p of cloud.puffs) {
        // A cloud dissolves toward its centre, keeping its flat base level.
        const ox = (p.x * cos - p.z * sin) * s;
        const oz = (p.x * sin + p.z * cos) * s;
        p3.set(cx + at.x + ox, cloud.base - FLAT_Y * p.r * SQUASH * s, cz + at.z + oz);
        q.setFromAxisAngle(up, p.yaw);
        s3.set(p.r * s, p.r * SQUASH * s, p.r * s);
        m4.compose(p3, q, s3);
        mesh.setMatrixAt(i++, m4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    // Follow the sky: a shower that clears hands the fog its old colour back.
    if (scene.fog) cloudPalette(scene.fog.color, mood, palette);
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
    mesh.dispose();
  }

  update(0); // placed before the first frame
  return { mesh, clouds, palette, update, dispose };
}
