import * as THREE from 'three';
import { surfaceProps } from '../render/materials.js';
import { withLocalUuids } from './localuuids.js';

// The fountain's stone (park.js builds the basin and the spire with it): a warm
// mid grey, matte. polish-quayside: it was 0xb8b8c0 at 'cobble's 0.8, nearly
// white, and beside the water's glare (below) the whole bowl read as one
// white blaze from a low camera.
export const FOUNTAIN_STONE = Object.freeze({ color: 0x9e978c, roughness: 0.95 });
// Both pools' water: the 'water' preset's colour and smoothness, with the
// specular turned down to a third. Seen from cat height the 4.6 m basin is
// at a grazing angle, where Fresnel takes any surface's reflectance toward
// 1: the sun's highlight sat on screen at full strength and the bloom spread
// it over the rim as a white blaze (rougher water only made the blaze wider).
// specularIntensity scales both ends of the Fresnel curve, so the highlight
// is a sheen and the water still reads wet. One material per mesh, as before.
// polish-sheen: 0.3 -> 0.04. Survey 9 still saw a white bloom across the
// basin's right rim from a low camera; hiding the parts one by one showed it
// was this disc's sun highlight (the stone at 0.95 was innocent). A live
// sweep: at 0.1, and even 0.04, the 'water' preset's 0.12 roughness keeps
// the sun's lobe tight and bright enough to bloom; 0.04 at roughness 0.4
// spreads it into a soft sheen that never blooms, and the sky's reflection
// still says water. (Pass 6 found rougher water only widened the blaze; that
// was at three times this specular.)
export const FOUNTAIN_WATER = Object.freeze({ color: 0x8ab8d8, specularIntensity: 0.04, roughness: 0.4 });
export function fountainWaterMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: FOUNTAIN_WATER.color, ...surfaceProps('water'), specularIntensity: FOUNTAIN_WATER.specularIntensity,
    roughness: FOUNTAIN_WATER.roughness,
  });
}

// =============================================================================
// The Park's two-tier fountain (polish-park2 Task 2).
//
// park.js keeps the three shipped constructor slots in order — basin, water
// disc, spire — so the area build draws exactly the Math.random it always did
// (three's uuids: 4 draws per object, geometry and material). This module
// supplies their new SHAPES (pure data: lathe profiles) and builds everything
// else the fountain gained inside withLocalUuids('park-fountain'), which never
// touches the real Math.random:
//
//   * fountainUpperWater — the small still disc in the upper bowl ('water'
//     preset, static, merges like any prop);
//   * fountainDrops — ONE mesh of small stretched octahedra: a ring of streams
//     spilling over the upper bowl's rim and arcing down into the basin, and a
//     few short jets from the spout into the upper bowl. Every vertex carries
//     its drop's arc (start, velocity, flight time, phase); the vertex shader
//     moves it along the parabola from one uniform, uTime;
//   * fountainRipples — ONE mesh of flat quads, one at each landing point,
//     whose fragment shader draws an expanding, fading ring from the same
//     uTime.
//
// Both animated meshes are noMerge (mergeprops would bake them flat) and
// noCast (no shadow-pass draws); every phase comes from the drop's index
// through a fixed hash, never Math.random. Reduced motion freezes uTime at
// FROZEN_TIME: the streams still hang in the air, they just do not move.
// =============================================================================

export const FOUNTAIN_SEED = 'park-fountain';
export const FROZEN_TIME = 0.37;
export const DROPS_SHADER_KEY = 'park-fountain-drops-v1';
export const RIPPLES_SHADER_KEY = 'park-fountain-ripples-v1';

// Storybook gravity: a touch under the real 9.8, so the arcs hang a moment
// longer and read as falling water rather than as a blur.
const G = 7.0;

const STONE_SEGMENTS = 32;

// Basin profile [r, y], traversed so the visible face is on the right
// (three's lathe normal is (dy, -dx)): up the outside, over the lip, down the
// inside to below the water line. Plinth r 2.65 at the ground; the rounded lip
// tops out at y 0.70 (the shipped 'fountain-edge lookout' perch is y 0.75);
// the water's surface is y 0.62. The short chamfer points keep the long faces'
// normals clean (three weights a vertex's normal by its segment lengths).
export const BASIN_PROFILE = Object.freeze([
  [2.65, 0.0], [2.65, 0.10], [2.64, 0.12], [2.60, 0.13],   // plinth
  [2.46, 0.14], [2.44, 0.16],                               // step in
  [2.42, 0.20], [2.41, 0.48],                               // wall
  [2.45, 0.53], [2.53, 0.58], [2.59, 0.62],                 // lip flares out
  [2.61, 0.66], [2.58, 0.69], [2.52, 0.70],                 // rounded outer lip
  [2.40, 0.70], [2.32, 0.69], [2.28, 0.66],                 // top, inner round
  [2.27, 0.60], [2.27, 0.48],                               // inner wall into the water
]);

// Spire profile: a flared foot standing in the basin's water, a slim column
// with a collar, the upper bowl (rim r 0.88 at y ~1.55, shallow inside), then
// a small spout column and a ball finial (top 2.2).
export const SPIRE_PROFILE = Object.freeze([
  [0.46, 0.50], [0.46, 0.62], [0.43, 0.68],                 // foot plinth (in the water)
  [0.34, 0.74], [0.25, 0.82], [0.20, 0.92],                 // flare up
  [0.18, 1.02], [0.17, 1.12],                               // column
  [0.19, 1.14], [0.24, 1.16], [0.25, 1.20], [0.24, 1.23], [0.19, 1.25], // collar
  [0.16, 1.28], [0.17, 1.33],                               // neck
  [0.24, 1.38], [0.40, 1.44], [0.62, 1.49], [0.80, 1.52],   // bowl underside
  [0.87, 1.54], [0.89, 1.57], [0.87, 1.60], [0.83, 1.61],   // rounded rim
  [0.78, 1.57], [0.70, 1.52], [0.45, 1.50], [0.13, 1.49],   // shallow inside
  [0.10, 1.52], [0.085, 1.60], [0.08, 1.82],                // spout column
  [0.11, 1.84], [0.125, 1.87], [0.12, 1.90], [0.08, 1.92],  // spout lip
  [0.05, 1.95], [0.06, 1.98],                               // neck
  [0.09, 2.01], [0.105, 2.06], [0.10, 2.11], [0.085, 2.15], // ball finial
  [0.055, 2.18], [0.025, 2.195], [0.0, 2.20],
]);

export const BASIN_WATER = Object.freeze({ r: 2.29, top: 0.62, h: 0.1, segments: 32 });
export const UPPER_WATER = Object.freeze({ r: 0.80, top: 1.56, h: 0.05, segments: 24 });

// The arcs. Rim streams spill over the upper rim with a little lift and land
// in the basin at r ~1.6; spout jets rise from the spout lip and land in the
// upper bowl at r ~0.55.
export const STREAMS = 24;
export const STREAM_DROPS = 6;
export const JETS = 8;
export const JET_DROPS = 5;

const RIM = { r: 0.90, y: 1.585, lift: 0.15, land: 1.6, landY: BASIN_WATER.top };
const SPOUT = { r: 0.13, y: 1.89, lift: 0.75, land: 0.55, landY: UPPER_WATER.top };

export const latheGeometry = (profile, segments = STONE_SEGMENTS) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);

// Deterministic 0..1 from an index.
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The flight time from (r0, y0) with upward speed vy to height y1.
const flightTime = (y0, vy, y1) => (vy + Math.sqrt(vy * vy + 2 * G * (y0 - y1))) / G;

// One arc per stream/jet: start (fountain-local), velocity, flight time.
export function fountainArcs() {
  const arcs = [];
  for (let i = 0; i < STREAMS; i++) {
    const a = (i / STREAMS) * Math.PI * 2 + (hash(i) - 0.5) * 0.06;
    const land = RIM.land + (hash(i + 50) - 0.5) * 0.12;
    const lift = RIM.lift * (0.85 + hash(i + 90) * 0.3);
    const T = flightTime(RIM.y, lift, RIM.landY);
    arcs.push({ kind: 'stream', a, r0: RIM.r, y0: RIM.y, vr: (land - RIM.r) / T, vy: lift, T, land, landY: RIM.landY, drops: STREAM_DROPS, seed: i });
  }
  for (let i = 0; i < JETS; i++) {
    const a = ((i + 0.5) / JETS) * Math.PI * 2;
    const land = SPOUT.land + (hash(i + 200) - 0.5) * 0.08;
    const lift = SPOUT.lift * (0.9 + hash(i + 240) * 0.2);
    const T = flightTime(SPOUT.y, lift, SPOUT.landY);
    arcs.push({ kind: 'jet', a, r0: SPOUT.r, y0: SPOUT.y, vr: (land - SPOUT.r) / T, vy: lift, T, land, landY: SPOUT.landY, drops: JET_DROPS, seed: 100 + i });
  }
  return arcs;
}

// A unit octahedron, long along y: 8 faces, flat-shaded (non-indexed).
const OCTA = (() => {
  const P = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const F = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  return F.map((f) => f.map((k) => P[k]));
})();

function dropsGeometry(arcs) {
  let n = 0;
  for (const arc of arcs) n += arc.drops;
  const verts = n * 24;
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3);
  const start = new Float32Array(verts * 3);
  const vel = new Float32Array(verts * 3);
  const time = new Float32Array(verts * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  let v = 0;
  for (const arc of arcs) {
    const cx = Math.cos(arc.a), sz = Math.sin(arc.a);
    const s0 = [cx * arc.r0, arc.y0, sz * arc.r0];
    const v0 = [cx * arc.vr, arc.vy, sz * arc.vr];
    // Drops a stream's length apart, with a little per-drop jitter so the
    // stream reads as falling water rather than a conveyor belt.
    for (let d = 0; d < arc.drops; d++) {
      const phase = (d + (hash(arc.seed * 13 + d) - 0.5) * 0.35) / arc.drops + hash(arc.seed + 400);
      // A size per drop: the stream's own scale (x = width, y = length scale).
      const w = arc.kind === 'stream' ? 0.018 + hash(arc.seed * 7 + d) * 0.008 : 0.014;
      for (const face of OCTA) {
        a.fromArray(face[0]); b.fromArray(face[1]); c.fromArray(face[2]);
        fn.copy(c).sub(b).cross(a.clone().sub(b)).normalize();
        for (const p of face) {
          pos.set([p[0] * w, p[1], p[2] * w], v * 3);
          // Object-space normal of the unstretched face; the shader re-derives
          // the stretch so this is only the direction the face turns.
          nrm.set([fn.x, fn.y, fn.z], v * 3);
          start.set(s0, v * 3);
          vel.set(v0, v * 3);
          time.set([arc.T, phase - Math.floor(phase)], v * 2);
          v++;
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aFlight', new THREE.BufferAttribute(time, 2));
  // The rest positions all sit round the origin; the drops actually fly
  // through the whole upper half of the fountain, so the culling sphere is
  // set to cover every arc (and the box too, for anything that measures it).
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1.9, 0.55, -1.9), new THREE.Vector3(1.9, 2.05, 1.9));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.3, 0), 2.1);
  return geo;
}

// Replaces `anchor` in `src` with anchor + code; throws if the anchor is gone
// (a three upgrade that renamed a chunk must fail loudly, not draw nothing).
export function inject(src, anchor, code) {
  if (!src.includes(anchor)) throw new Error(`fountain shader: anchor ${anchor} not found`);
  return src.replace(anchor, `${anchor}\n${code}`);
}

export function patchDropsShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = inject(shader.vertexShader, '#include <common>', `
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec2 aFlight;
uniform float uFountainTime;
vec3 fdPos;
mat3 fdBasis;
float fdSize;`);
  shader.vertexShader = inject(shader.vertexShader, '#include <beginnormal_vertex>', `
{
  float T = aFlight.x;
  float s = fract(uFountainTime / T + aFlight.y);
  float t = s * T;
  fdPos = aStart + aVel * t + vec3(0.0, -0.5 * ${G.toFixed(2)} * t * t, 0.0);
  vec3 vel = aVel + vec3(0.0, -${G.toFixed(2)} * t, 0.0);
  float speed = length(vel);
  vec3 dir = vel / max(speed, 1e-4);
  // constant per drop: the launch heading's horizontal normal (aVel always
  // has a horizontal part), so it never flips or vanishes at the apex
  vec3 side = normalize(vec3(-aVel.z, 0.0, aVel.x));
  vec3 fwd = cross(side, dir);
  // swell in at the lip, shrink into the water: no pop at either end
  fdSize = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.9, 1.0, s));
  // long along the flight, longer the faster it falls
  fdBasis = mat3(side, dir * (0.035 + 0.02 * speed), fwd);
}
// a drop is thin and long, so its faces turn mostly sideways
objectNormal = normalize(fdBasis[0] * objectNormal.x + normalize(fdBasis[1]) * objectNormal.y * 0.3 + fdBasis[2] * objectNormal.z);`);
  shader.vertexShader = inject(shader.vertexShader, '#include <begin_vertex>', `
transformed = fdPos + fdBasis * transformed * fdSize;`);
  return shader;
}

export function patchRipplesShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = inject(shader.vertexShader, '#include <common>', `
attribute vec3 aRipple;
varying vec3 vRipple;`);
  shader.vertexShader = inject(shader.vertexShader, '#include <begin_vertex>', `
vRipple = aRipple;`);
  shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', `
uniform float uFountainTime;
varying vec3 vRipple;`);
  shader.fragmentShader = inject(shader.fragmentShader, '#include <color_fragment>', `
{
  // vRipple.xy: -1..1 across the quad; z: period in seconds + phase in the
  // fraction (period = floor(z) / 10).
  float d = length(vRipple.xy);
  float period = floor(vRipple.z) / 10.0;
  float ph = fract(vRipple.z);
  float ring = 0.0;
  for (int k = 0; k < 2; k++) {
    float s = fract(uFountainTime / period + ph + float(k) * 0.5);
    float r = mix(0.12, 0.92, s);
    float w = mix(0.1, 0.24, s);
    ring += (1.0 - smoothstep(0.0, w, abs(d - r))) * (1.0 - s) * smoothstep(0.0, 0.12, s);
  }
  diffuseColor.a *= clamp(ring, 0.0, 1.0) * (1.0 - smoothstep(0.85, 1.0, d));
}`);
  return shader;
}

function ripplesGeometry(arcs) {
  const quads = arcs.length;
  const pos = new Float32Array(quads * 4 * 3);
  const rip = new Float32Array(quads * 4 * 3);
  const idx = [];
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  arcs.forEach((arc, i) => {
    const x = Math.cos(arc.a) * arc.land, z = Math.sin(arc.a) * arc.land;
    const half = arc.kind === 'stream' ? 0.26 : 0.13;
    const y = arc.landY + 0.006;
    // 0.9-1.4 s rings, phase from the index
    const period = Math.round((arc.kind === 'stream' ? 11 : 8) + hash(arc.seed + 700) * 4);
    // phase kept well inside (0.05, 0.95) so floor() of the interpolated
    // varying can never land on the wrong period
    const z3 = period + 0.05 + 0.9 * hash(arc.seed + 800);
    corners.forEach(([u, w], k) => {
      pos.set([x + u * half, y, z + w * half], (i * 4 + k) * 3);
      rip.set([u, w, z3], (i * 4 + k) * 3);
    });
    const o = i * 4;
    idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(quads * 4 * 3).map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geo.setAttribute('aRipple', new THREE.BufferAttribute(rip, 3));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

const quiet = (mesh, name, animated) => {
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  if (animated) mesh.userData.noMerge = true;
  return mesh;
};

// Adds the upper water, drops and ripples to `fountain` (the group park.js
// built), all under local uuids. Returns { upperWater, drops, ripples,
// uniforms }.
export function dressFountain(fountain, { reducedMotion = false } = {}) {
  return withLocalUuids(FOUNTAIN_SEED, () => {
    const uniforms = { uFountainTime: { value: FROZEN_TIME } };
    const tick = reducedMotion
      ? null
      // Wrapped well before float precision matters; the jump once an hour
      // is one frame's twitch (docksdressing.js's gulls do the same).
      : () => { uniforms.uFountainTime.value = (performance.now() / 1000) % 3600; };

    const upperWater = new THREE.Mesh(
      new THREE.CylinderGeometry(UPPER_WATER.r, UPPER_WATER.r, UPPER_WATER.h, UPPER_WATER.segments),
      fountainWaterMaterial(),
    );
    upperWater.position.y = UPPER_WATER.top - UPPER_WATER.h / 2;
    quiet(upperWater, 'fountainUpperWater', false);

    const arcs = fountainArcs();

    const dropsMat = new THREE.MeshStandardMaterial({
      color: 0xd8eef8, emissive: 0x2a3c48, roughness: 0.18, metalness: 0,
      transparent: true, opacity: 0.78, depthWrite: false,
    });
    dropsMat.onBeforeCompile = (shader) => patchDropsShader(shader, uniforms);
    dropsMat.customProgramCacheKey = () => DROPS_SHADER_KEY;
    const drops = quiet(new THREE.Mesh(dropsGeometry(arcs), dropsMat), 'fountainDrops', true);
    drops.renderOrder = 0; // sorted by distance, so faded trees / rain in front still cover it

    const ripplesMat = new THREE.MeshStandardMaterial({
      color: 0xeef8ff, emissive: 0x1c2830, roughness: 0.2, metalness: 0,
      transparent: true, opacity: 0.32, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    ripplesMat.onBeforeCompile = (shader) => patchRipplesShader(shader, uniforms);
    ripplesMat.customProgramCacheKey = () => RIPPLES_SHADER_KEY;
    const ripples = quiet(new THREE.Mesh(ripplesGeometry(arcs), ripplesMat), 'fountainRipples', true);
    ripples.renderOrder = 0;

    if (tick) {
      drops.onBeforeRender = tick;
      ripples.onBeforeRender = tick;
    }
    drops.userData.fountain = uniforms;
    ripples.userData.fountain = uniforms;

    fountain.add(upperWater, drops, ripples);
    return { upperWater, drops, ripples, uniforms };
  });
}
