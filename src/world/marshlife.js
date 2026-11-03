import * as THREE from 'three';
import { hash01, inWater } from './builder.js';
import { RIVER_WATERS, RIVER_DECKS } from './river.js';

// =============================================================================
// The River's life on a walk (polish-rivermoor Task 3): a soft low mist over
// the water at dusk and at sunset, and small jewel-coloured dragonflies darting
// over the water by day. Looks only: two noCast meshes, no colliders, no
// random numbers at run time, nothing a co-walker could see differ in play.
//
// river.js builds both meshes (under withLocalUuids('river-life'), so the
// build's Math.random draws stay what they were) and hands walk.js
// a `life` hook that calls createMarshLife({ ...ctx, mist, flies }). main.js calls
// update(dt, t, catPos, camera) every frame; all shader time comes from there.
//
// river.js imports this module and this module imports river.js. Nothing here
// reads river.js at load time, only inside riverDragonflyHomes, so the cycle
// is safe (riverdress.js does the same).
// =============================================================================

// --- The mist ----------------------------------------------------------------
// Two flat sheets, 0.25 m and 0.55 m over the water: low enough that a cat
// wades through the top of it, never a wall. Each water's sheet is its
// footprint 0.5 m wider on every side (1 m wider in all), clipped to the
// bounds. The fragment shader fades the mist toward every shore of all the
// waters together (so where two waters meet there is no seam), toward the
// bounds, and out to nothing within 3 m of the camera, so a camera dipping to
// the water never looks into a white wall. Where two sheets overlap, only the
// first water's sheet draws (the others discard), so the overlap is never
// twice as thick.
export const MIST_HEIGHTS = [0.25, 0.55];
const MIST_GROW = 0.5;
// A big water (the lake) only gets a strip this wide along its shores.
const MIST_STRIP = 10;
// Grid step of each sheet (m). The look is all per-fragment; the grid is only
// so fog and the camera fade are sampled finely enough across a 70 m sheet.
const MIST_SEG = 4;
// Fade distances (m): from the grown edge inward, and in from the bounds.
const SHORE_FADE = 2.0;
const BOUNDS_FADE = 4;
const MIST_BASE = 0xdfe4ea;
export const MIST_DUSK = 0xb8b4c8;
export const MIST_SUNSET = 0xe8d4c4;
const MIST_RATE = 0.5; // strength per second
// Each sheet's densest wisp. Two sheets drift apart, so the densest spot seen
// through both is about 0.45 and most of the mist is far thinner.
export const MIST_PEAK = 0.27;
// The noise band mapped to 0..1: below the first value the water is clear.
const MIST_CUT = [0.45, 0.74];

const f1 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

// The in-bounds rectangle a water's sheet covers, or null when none of it is in.
function sheetRect(w, bounds) {
  const g = MIST_GROW;
  const r = w.kind === 'circle'
    ? { minX: w.x - w.r - g, maxX: w.x + w.r + g, minZ: w.z - w.r - g, maxZ: w.z + w.r + g }
    : { minX: w.minX - g, maxX: w.maxX + g, minZ: w.minZ - g, maxZ: w.maxZ + g };
  const c = {
    minX: Math.max(r.minX, bounds.minX), maxX: Math.min(r.maxX, bounds.maxX),
    minZ: Math.max(r.minZ, bounds.minZ), maxZ: Math.min(r.maxZ, bounds.maxZ),
  };
  return c.maxX - c.minX > 0.5 && c.maxZ - c.minZ > 0.5 ? c : null;
}

// GLSL: how far inside water i's grown footprint p is (m, negative outside).
function insideExpr(w, strip) {
  const g = MIST_GROW;
  if (w.kind === 'circle') return `(${f1(w.r + g)} - length(p - vec2(${f1(w.x)}, ${f1(w.z)})))`;
  const d = `min(min(p.x - ${f1(w.minX - g)}, ${f1(w.maxX + g)} - p.x), min(p.y - ${f1(w.minZ - g)}, ${f1(w.maxZ + g)} - p.y))`;
  return strip ? `min(${d}, ${f1(MIST_STRIP)} - ${d})` : d;
}

export function marshMist(waters, bounds) {
  // Which waters get a sheet, and whether each is a shore strip.
  const sheets = [];
  for (const w of waters) {
    const rect = sheetRect(w, bounds);
    if (!rect) continue;
    const strip = w.kind !== 'circle'
      && Math.min(rect.maxX - rect.minX, rect.maxZ - rect.minZ) > MIST_STRIP + 2;
    sheets.push({ w, rect, strip });
  }

  const pos = [], uv = [], sheetIdx = [], index = [];
  for (const y of MIST_HEIGHTS) {
    sheets.forEach(({ rect }, s) => {
      const nx = Math.max(1, Math.ceil((rect.maxX - rect.minX) / MIST_SEG));
      const nz = Math.max(1, Math.ceil((rect.maxZ - rect.minZ) / MIST_SEG));
      const base = pos.length / 3;
      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i <= nx; i++) {
          pos.push(rect.minX + (rect.maxX - rect.minX) * i / nx, y, rect.minZ + (rect.maxZ - rect.minZ) * j / nz);
          uv.push(i / nx, j / nz);
          sheetIdx.push(s);
        }
      }
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
          const a = base + j * (nx + 1) + i, b2 = a + 1, c = a + nx + 1, d = c + 1;
          // Facing up.
          index.push(a, c, b2, b2, c, d);
        }
      }
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aSheet', new THREE.Float32BufferAttribute(sheetIdx, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();

  // The shore field: the deepest any point is inside any water, and the first
  // water (in sheet order) that owns it.
  const shapeLines = sheets.map(({ w, strip }, s) =>
    `  d = ${insideExpr(w, strip)}; if (d > 0.0 && owner < 0.0) owner = ${s}.0; edge = max(edge, d);`).join('\n');
  const boundsIn = `min(min(p.x - ${f1(bounds.minX)}, ${f1(bounds.maxX)} - p.x), min(p.y - ${f1(bounds.minZ)}, ${f1(bounds.maxZ)} - p.y))`;

  const uniforms = {
    uTime: { value: 0 },
    uMist: { value: 0 },
    uColor: { value: new THREE.Color(MIST_BASE) },
  };
  const material = new THREE.MeshBasicMaterial({ color: MIST_BASE, transparent: true, depthWrite: false, fog: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aSheet;
varying vec3 vMistW;
varying float vSheet;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vMistW = (modelMatrix * vec4(position, 1.0)).xyz;
vSheet = aSheet;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uMist;
uniform vec3 uColor;
varying vec3 vMistW;
varying float vSheet;
float mistHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float mistNoise(vec2 q) {
  vec2 i = floor(q), f = fract(q);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mistHash(i), mistHash(i + vec2(1.0, 0.0)), u.x),
             mix(mistHash(i + vec2(0.0, 1.0)), mistHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Two octaves at different scales, drifting their own ways.
float mistField(vec2 q, vec2 q2) { return 0.6 * mistNoise(q) + 0.4 * mistNoise(q2); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vMistW.xz;
  float d;
  float edge = -1.0;
  float owner = -1.0;
${shapeLines}
  if (abs(owner - vSheet) > 0.5) discard;
  float edgeFade = smoothstep(0.0, ${f1(SHORE_FADE)}, edge) * smoothstep(0.0, ${f1(BOUNDS_FADE)}, ${boundsIn});
  // Each sheet drifts its own way, the upper one a touch faster.
  float drift = 1.0 + vMistW.y;
  vec2 q = p * 0.18 + vec2(uTime * 0.05 * drift, uTime * 0.03 * drift) + vMistW.y * 9.0;
  vec2 q2 = p * 0.47 + vec2(-uTime * 0.03 * drift, uTime * 0.06 * drift) + 17.0 + vMistW.y * 5.0;
  // Drifting patches, not a sheet: about half the water is clear between
  // them, and a fine third octave frays each patch into wisps.
  float n = smoothstep(${f1(MIST_CUT[0])}, ${f1(MIST_CUT[1])}, mistField(q, q2));
  n *= 0.55 + 0.45 * mistNoise(p * 1.3 + vec2(uTime * 0.08 * drift, 0.0) + 41.0);
  // Thinner out over the middle of wide still water, so a pond's outline
  // never prints as a lid of mist.
  float wide = 1.0 - 0.5 * smoothstep(2.0, 6.0, edge);
  float near = smoothstep(1.0, 3.0, distance(cameraPosition, vMistW));
  diffuseColor.rgb = uColor;
  diffuseColor.a *= uMist * ${f1(MIST_PEAK)} * n * wide * edgeFade * near;
  if (diffuseColor.a < 0.002) discard;
}`);
  };
  material.customProgramCacheKey = () => 'marsh-mist-v2';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'marshMist';
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.userData.marshMist = uniforms;
  mesh.visible = false;
  return mesh;
}

// --- The dragonflies --------------------------------------------------------
// Each fly is a thin three-sided body 0.1 m long, drawn FLY_SCALE (1.6x) big
// for a storybook marsh (6 triangles), and two pairs of glassy wings (one quad a pair, 4 triangles). All the motion is in the
// vertex shader: a fly hovers over its stretch of water, then every 1.6-3 s
// dashes (0.25 s, eased) to a new spot within 1.8 m of home, 0.35-0.9 m up,
// turning to face where it went. Its wings are a blur of flapping. With
// reduced motion it simply hovers at home, bobbing 3 cm, wings still.
const FLY_HUES = [0x2f8fb0, 0x3fa070, 0xc04a3a];
const WING_COLOR = 0xd6eaee;
const FLY_COUNT = 14;
const FLY_ROAM = 1.8;
// Storybook-sized (owner ruling): 1.6x a real one, so the kids can spot them.
export const FLY_SCALE = 1.6;
// How fast the flies come and go with the rain (share per second).
const FLY_FADE = 1.0;
const FLY_Y = [0.35, 0.9];

function flyParts() {
  // Body along local +x, head forward. Three corners round the axis.
  const ring = (x, r) => [0, 1, 2].map((k) => {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    return [x, Math.sin(a) * r, Math.cos(a) * r];
  });
  const tail = ring(-0.05, 0.006), head = ring(0.05, 0.014);
  const body = [];
  for (let k = 0; k < 3; k++) {
    const k2 = (k + 1) % 3;
    body.push(tail[k], head[k], head[k2], tail[k], head[k2], tail[k2]);
  }
  // A wing pair: two blades sharing the root along the back, tips out wide.
  const pair = (x, span) => {
    const rf = [x + 0.012, 0.008, 0], rb = [x - 0.012, 0.008, 0];
    const tl = [x - 0.008, 0.01, -span], tr = [x - 0.008, 0.01, span];
    return [rf, tl, rb, rf, rb, tr];
  };
  const wings = [...pair(0.02, 0.06), ...pair(0.0, 0.055)];
  const sc = (v) => v.map((c) => c * FLY_SCALE);
  return { body: body.map(sc), wings: wings.map(sc) };
}

export function dragonflies(homes) {
  const { body, wings } = flyParts();
  const pos = [], col = [], home = [], seed = [], wing = [];
  const c = new THREE.Color();
  const w = new THREE.Color(WING_COLOR);
  homes.forEach((h, i) => {
    c.setHex(h.hue);
    const s = i * 7.31 + hash01(h.x, h.z, 41) * 5;
    for (const v of body) {
      pos.push(...v); col.push(c.r, c.g, c.b); home.push(h.x, h.y, h.z); seed.push(s); wing.push(0);
    }
    for (const v of wings) {
      const tip = Math.abs(v[2]) > 0.02 ? 1 : 0;
      // Roots take a little of the body's colour, tips are clear.
      const wc = tip ? w : w.clone().lerp(c, 0.35);
      pos.push(...v); col.push(wc.r, wc.g, wc.b); home.push(h.x, h.y, h.z); seed.push(s); wing.push(tip);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('aHome', new THREE.Float32BufferAttribute(home, 3));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  geometry.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));

  const uniforms = { uTime: { value: 0 }, uCalm: { value: 0 }, uShow: { value: 1 } };
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aHome;
attribute float aSeed;
attribute float aWing;
uniform float uTime;
uniform float uCalm;
uniform float uShow;
float dfHash(float n) { return fract(sin(n) * 43758.5453); }
// Where a fly is headed in its k-th hop: an offset within the roam disc, and
// a height in the band. The hop index wraps at 256 so sin() never sees a
// big argument on a phone GPU (hop k's start is hop k-1's end, wrapped too).
vec3 dfTarget(float s, float k) {
  k = mod(k, 256.0);
  float r = ${f1(FLY_ROAM)} * sqrt(dfHash(s * 12.9898 + k * 78.233));
  float a = 6.2831853 * dfHash(s * 39.346 + k * 11.135 + 1.7);
  float y = ${f1(FLY_Y[0])} + ${f1(FLY_Y[1] - FLY_Y[0])} * dfHash(s * 73.156 + k * 52.235 + 3.1);
  return vec3(cos(a) * r, y, sin(a) * r);
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  // Shrinks to nothing as the rain comes, grows back after.
  vec3 local = position * uShow;
  // Wings: a fast blur of beats, the front and hind pairs out of step.
  local.y += aWing * 0.022 * sin(uTime * 70.0 + aSeed + position.x * 60.0) * (1.0 - uCalm);
  float period = 1.6 + 1.4 * dfHash(aSeed * 1.31 + 0.5);
  float tt = uTime + aSeed * 3.0;
  float k = floor(tt / period);
  float ph = tt - k * period;
  vec3 from = dfTarget(aSeed, k - 1.0);
  vec3 to = dfTarget(aSeed, k);
  float e = smoothstep(0.0, 0.25, ph);
  vec3 off = mix(from, to, e);
  // A small bob while hovering.
  off.y += 0.02 * sin(uTime * 3.1 + aSeed * 2.0) * (1.0 - e * (1.0 - e) * 4.0);
  vec3 dart = vec3(aHome.x + off.x, off.y, aHome.z + off.z);
  float yaw = atan(to.z - from.z, to.x - from.x);
  vec3 calm = aHome + vec3(0.0, 0.03 * sin(uTime * 0.8 + aSeed * 6.2831853), 0.0);
  float calmYaw = aSeed * 6.2831853;
  vec3 at = uCalm > 0.5 ? calm : dart;
  float th = uCalm > 0.5 ? calmYaw : yaw;
  float cy = cos(th), sy = sin(th);
  transformed = vec3(local.x * cy - local.z * sy, local.y, local.x * sy + local.z * cy) + at;
}`);
  };
  material.customProgramCacheKey = () => 'dragonflies-v1';

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'dragonflies';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.noCast = true;
  mesh.userData.dragonflies = uniforms;
  return mesh;
}

// --- Where the dragonflies live -------------------------------------------------
// 14 homes over the water near the banks: four on river-west, three on
// river-east, three on the pond, four on the pools. None within 3 m of a deck,
// and 3 m apart. Seeded by hash01, so every device has the same flies.
const HOME_PLAN = [
  'river-west', 'river-west', 'river-west', 'river-west',
  'river-east', 'river-east', 'river-east',
  'pond', 'pond', 'pond',
  'pool-1', 'pool-1', 'pool-2', 'pool-3',
];
const r2 = (v) => Math.round(v * 100) / 100;
const rectDist = (d, x, z) => Math.hypot(Math.max(d.minX - x, 0, x - d.maxX), Math.max(d.minZ - z, 0, z - d.maxZ));
const IN = { minX: -48, maxX: 48, minZ: -48, maxZ: 48 };

export function riverDragonflyHomes() {
  const open = RIVER_WATERS.map((w) => ({ ...w, decks: [] }));
  const homes = [];
  HOME_PLAN.forEach((id, i) => {
    const w = RIVER_WATERS.find((v) => v.id === id);
    for (let t = 0; t < 64; t++) {
      const h1 = hash01(i, t, 11), h2 = hash01(i, t, 23), h3 = hash01(i, t, 37);
      let x, z;
      if (w.kind === 'circle') {
        const a = h1 * Math.PI * 2;
        const r = Math.max(0.8, w.r - 1.0);
        x = w.x + Math.cos(a) * r;
        z = w.z + Math.sin(a) * r;
      } else {
        const x0 = Math.max(w.minX, IN.minX) + 1, x1 = Math.min(w.maxX, IN.maxX) - 1;
        x = x0 + (x1 - x0) * h1;
        z = h2 < 0.5 ? w.minZ + 1.0 : w.maxZ - 1.0;
      }
      x = r2(x); z = r2(z);
      if (x < IN.minX || x > IN.maxX || z < IN.minZ || z > IN.maxZ) continue;
      if (!inWater(open, x, z)) continue;
      if (RIVER_DECKS.some((d) => rectDist(d, x, z) < 3)) continue;
      if (homes.some((o) => Math.hypot(o.x - x, o.z - z) < 3)) continue;
      homes.push({ x, y: r2(0.45 + 0.3 * h3), z, hue: FLY_HUES[i % 3] });
      break;
    }
  });
  return homes;
}

// --- The life hook --------------------------------------------------------------
// Mist: full on a dusk walk, 0.7 on a sunset, none otherwise (the game has no
// dawn: ruling R1), eased in at 0.5 a second and hidden when it is nothing.
// Lavender-grey at dusk, warm at sunset. Dragonflies by day and out of the
// rain; calm (hovering, wings still) with reduced motion, and the mist does
// not drift then either.
export function createMarshLife({ mist, flies, dusk = false, weather = null, reducedMotion = false, quality = 'high' }) {
  const mu = mist.userData.marshMist;
  const fu = flies.userData.dragonflies;
  const sunset = () => weather?.condition === 'sunset';
  // Quality 'low' (phones on the lowest setting) never shows the mist.
  const target = () => (quality === 'low' ? 0 : dusk ? 1 : sunset() ? 0.7 : 0);
  let strength = 0;
  let time = 0;
  mu.uColor.value.setHex(dusk || !sunset() ? MIST_DUSK : MIST_SUNSET);
  mu.uMist.value = 0;
  mist.visible = false;
  fu.uCalm.value = reducedMotion ? 1 : 0;
  const fliesOut = () => !dusk && !weather?.isRaining?.();
  // Flies already gone (dusk, a rainy start) are simply not there; rain
  // arriving or passing mid-walk shrinks or grows them over a second.
  let show = fliesOut() ? 1 : 0;
  fu.uShow.value = show;
  flies.visible = show > 0.001;
  return {
    update(dt) {
      if (!(dt > 0)) return;
      const goal = target();
      const step = MIST_RATE * dt;
      strength = goal > strength ? Math.min(goal, strength + step) : Math.max(goal, strength - step);
      mu.uMist.value = strength;
      mist.visible = strength > 0.001;
      time += dt;
      fu.uTime.value = time;
      if (!reducedMotion) mu.uTime.value += dt;
      const want = fliesOut() ? 1 : 0;
      const fstep = FLY_FADE * dt;
      show = want > show ? Math.min(want, show + fstep) : Math.max(want, show - fstep);
      fu.uShow.value = show;
      flies.visible = show > 0.001;
    },
    dispose() {
      mist.visible = false;
      fu.uShow.value = 1;
      flies.visible = true;
    },
  };
}
