// =============================================================================
// WHAT THE WIND MOVES ON THE ROOFTOPS (Rooftops step 3, Task 5): the washing
// sways and three chimneys smoke, all from one wind (roofsplan.js ROOFS_WIND,
// which the weathervane shows).
//
// THE WASHING (S4) sways in the vertex shader of the cloth material the build
// already has (makeWashMaterial, an onBeforeCompile patch as
// render/rustle.js's heather). Each cloth vertex carries `aSway` (vec3): its
// drop under its line along the line's horizontal normal on the downwind
// side, and a phase (swayAttribute). The shader moves it out by k times that
// drop and lifts it a little (a swing, not a stretch):
//     k = rest + amp * (0.5 + 0.5 sin(flutter t + phase)) * (0.7 + 0.3 sin(gust t))
// so nothing on the line moves, the hem moves the most, always downwind, and
// never by more than 0.45 of its drop. The life writes walk seconds into
// uWashT once a frame; with no amplitude (reduced motion) it holds a still
// downwind lean of `rest`. washSwayAt is the same offset on the CPU, for the
// tests. No mesh, no allocation per frame; the drawn rest pose is the build's.
//
// THE SMOKE (S3) is one InstancedMesh of puffs, seven over each smoking pot
// (roofsplan.js SMOKE_POTS), always drawn (S12). Each puff is a pure function
// of its pot, its number and the walk's time (puffAt): it rises, drifts
// downwind with a small curl, grows, fades out and is gone, then is born
// again at the pot, fading in. Soft wisps, not stones: smooth normals, a pale
// thin colour, the rim of each puff faded in its fragment shader (an
// onBeforeCompile patch, so its facets vanish), its fade per instance
// (aFade), and each puff turned and squashed its own fixed way (puffShape).
// Made inside withLocalUuids, so it draws nothing on Math.random. Under
// reduced motion it runs at half speed.
//
// THE SMOKE RING (Rooftops step 5, Task 5, R6) is the warm chimney's moment:
// one flat torus over its pot (roofsplan.js SMOKE_POTS[0]) that the moments
// (roofsmoments.js) puff while she sits still by the stack or naps there. A
// puff rises RING.rise, grows to RING.grow times, drifts RING.drift downwind
// and fades out over RING.time (ringAt: eased out, every part one way), then
// the ring is hidden until the next. Twice as long under reduced motion.
// =============================================================================
import * as THREE from 'three';
import { withLocalUuids } from './localuuids.js';
import { hash01 } from './warehouselook.js';
import { downwind } from './roofsplan.js';

const TAU = Math.PI * 2;
const [WX, WZ] = downwind(); // the wind is frozen: read once

// --- the washing -------------------------------------------------------------

export const WASH = Object.freeze({ amp: 0.3, rest: 0.12, flutter: 1.9, gust: 0.12 });

// Patch the cloth material so its vertices sway by their aSway. Returns the
// uniforms, kept on material.userData.wash for the life (and the tests) to find.
export function makeWashMaterial(material) {
  const uniforms = {
    uWashT: { value: 0 },
    uWashAmp: { value: WASH.amp },
    uWashRest: { value: WASH.rest },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aSway;
uniform float uWashT;
uniform float uWashAmp;
uniform float uWashRest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float wk = uWashRest + uWashAmp * (0.5 + 0.5 * sin(${WASH.flutter.toFixed(3)} * uWashT + aSway.z)) * (0.7 + 0.3 * sin(${WASH.gust.toFixed(3)} * uWashT));
  transformed.xz += aSway.xy * wk;
  transformed.y += length(aSway.xy) * wk * wk * 0.5;
}`);
  };
  material.customProgramCacheKey = () => 'roofs-wash-v1';
  material.userData.wash = uniforms;
  return uniforms;
}

// The horizontal normal of a line running along (dx, dz), on its downwind
// side: [nx, nz], unit.
export function downwindSide(dx, dz) {
  const l = Math.hypot(dx, dz) || 1;
  const [nx, nz] = [-dz / l, dx / l];
  return nx * WX + nz * WZ >= 0 ? [nx, nz] : [-nx, -nz];
}

// Adds `aSway` to a (non-indexed or indexed) geometry: (nx * depth, nz *
// depth, phase), depth = max(0, lineY - y). `nx = nz = 0` gives a piece that
// never moves (the bicycle's tyres in the same bucket).
export function swayAttribute(geometry, { lineY, nx, nz, phase }) {
  const p = geometry.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const depth = Math.max(0, lineY - p.getY(i));
    a[i * 3] = nx * depth;
    a[i * 3 + 1] = nz * depth;
    a[i * 3 + 2] = phase;
  }
  geometry.setAttribute('aSway', new THREE.BufferAttribute(a, 3));
  return geometry;
}

// The shader's offset on the CPU. `sway` is one vertex's aSway as { x, z,
// phase } (its first, second and third component); `out` gets the offset
// { x, y, z } at walk second `t` with amplitude `amp`.
export function washSwayAt(sway, t, amp, out = {}) {
  const k = WASH.rest + amp * (0.5 + 0.5 * Math.sin(WASH.flutter * t + sway.phase)) * (0.7 + 0.3 * Math.sin(WASH.gust * t));
  const depth = Math.hypot(sway.x, sway.z);
  out.x = sway.x * k;
  out.z = sway.z * k;
  out.y = depth * k * k * 0.5;
  return out;
}

// --- the smoke ---------------------------------------------------------------

export const SMOKE = Object.freeze({ perPot: 7, life: 6, rise: 0.45, drift: 0.35, top: 3.2, size: Object.freeze([0.15, 0.55]), opacity: 0.35, color: 0xc6c2be });
const CURL = Object.freeze({ amp: 0.15, rate: 1.3, wave: 0.5 }); // m across the wind at the column's top; per s of age; per s of time
const FADE_IN = 0.1; // of a puff's life, fading in from nothing
const FADE_OUT = 0.4; // of a puff's life, fading out to nothing
const SPACING = 0.4; // of the gap between two puffs: how far each is shifted off the even spacing, at most
// Each puff's fixed shape: a turn and a slight squash (x, y, z scale ranges)
const SHAPE = Object.freeze({ x: Object.freeze([0.85, 1.15]), y: Object.freeze([0.75, 0.95]), z: Object.freeze([0.85, 1.15]) });
const SALT = Object.freeze({ curl: 71, spacing: 73, turn: 79, squash: 89 });

const ramp = (u) => {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return k * k * (3 - 2 * k);
};

// Puff `i` of `pot`'s column at walk second `t`: out.x, .y, .z (its centre),
// .s (its radius) and .a (its alpha, 0..1: the shader's aFade). It rises,
// drifts downwind with a small curl and only grows (size[0] to size[1]); it
// fades in over the first FADE_IN of its life and out over the last
// FADE_OUT, so it is born and gone unseen. The puffs of a column are spread
// unevenly (each shifted off the even spacing by its own hash), so the column
// is no string of beads. Pure: the same column at the same time on every
// device.
export function puffAt(pot, i, t, out = {}) {
  const phase = (i + SPACING * hash01(pot.x + i, pot.z, SALT.spacing)) / SMOKE.perPot;
  const f = (((t / SMOKE.life + phase) % 1) + 1) % 1;
  const age = f * SMOKE.life;
  const curl = CURL.amp * f * Math.sin(CURL.rate * age - CURL.wave * t + hash01(pot.x, pot.z, SALT.curl) * TAU);
  out.x = pot.x + WX * SMOKE.drift * age - WZ * curl;
  out.z = pot.z + WZ * SMOKE.drift * age + WX * curl;
  out.y = pot.y + Math.min(SMOKE.top, SMOKE.rise * age);
  const [s0, s1] = SMOKE.size;
  out.s = s0 + (s1 - s0) * f * (2 - f); // swelling fast, then slower
  out.a = ramp(f / FADE_IN) * ramp((1 - f) / FADE_OUT);
  return out;
}

// Puff `i` of `pot`'s fixed shape, as a column-major 3x3 (its turn times its
// squash) into `out` (9 numbers) from `o`. Pure.
export function puffShape(pot, i, out = new Float32Array(9), o = 0) {
  const h = (salt, k) => hash01(pot.x + i + 0.37 * k, pot.z - k, salt);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(h(SALT.turn, 0) * TAU, h(SALT.turn, 1) * TAU, h(SALT.turn, 2) * TAU));
  const sq = [SHAPE.x, SHAPE.y, SHAPE.z].map(([lo, hi], k) => lo + (hi - lo) * h(SALT.squash, k));
  const e = m.elements;
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) out[o + c * 3 + r] = e[c * 4 + r] * sq[c];
  return out;
}

// The puff's material: soft, its normals the sphere's (smooth), its alpha the
// instance's aFade, and the rim fading out so the silhouette's facets vanish.
function smokeMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: SMOKE.color, roughness: 1, metalness: 0, flatShading: false, transparent: true, opacity: SMOKE.opacity, depthWrite: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFade;
varying float vFade;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFade = aFade;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vFade;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
diffuseColor.a *= vFade * smoothstep(0.1, 0.8, abs(dot(normalize(vNormal), normalize(vViewPosition))));`);
  };
  material.customProgramCacheKey = () => 'roofs-smoke-v1';
  return material;
}

// The smoke over `pots` ([{ x, y, z }]): one InstancedMesh (roofsSmoke) of
// SMOKE.perPot puffs each, an icosahedron (20 triangles) with smooth normals.
// update(t) takes walk seconds and allocates nothing.
export function createRoofsSmoke(scene, pots, { reducedMotion = false } = {}) {
  const count = pots.length * SMOKE.perPot;
  const fade = new Float32Array(count);
  const mesh = withLocalUuids('roofs-smoke', () => {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    // on a unit icosahedron the sphere's normal at a vertex is the vertex
    geometry.setAttribute('normal', new THREE.BufferAttribute(geometry.attributes.position.array.slice(), 3));
    const m = new THREE.InstancedMesh(geometry, smokeMaterial(), count);
    geometry.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
    m.name = 'roofsSmoke';
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noCast = true;
    m.frustumCulled = false; // S12: always one draw
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  });
  const shapes = new Float32Array(count * 9);
  let n = 0;
  for (const pot of pots) for (let i = 0; i < SMOKE.perPot; i++, n++) puffShape(pot, i, shapes, n * 9);
  const speed = reducedMotion ? 0.5 : 1;
  const at = { x: 0, y: 0, z: 0, s: 0, a: 0 };
  const e = mesh.instanceMatrix.array;
  const aFade = mesh.geometry.attributes.aFade;

  function update(t) {
    const tt = t * speed;
    let k = 0;
    for (const pot of pots) {
      for (let i = 0; i < SMOKE.perPot; i++, k++) {
        puffAt(pot, i, tt, at);
        // its shape times its size, and its place, straight into the matrix (column-major)
        const o = k * 16;
        const q = k * 9;
        for (let c = 0; c < 3; c++) {
          e[o + c * 4] = shapes[q + c * 3] * at.s;
          e[o + c * 4 + 1] = shapes[q + c * 3 + 1] * at.s;
          e[o + c * 4 + 2] = shapes[q + c * 3 + 2] * at.s;
          e[o + c * 4 + 3] = 0;
        }
        e[o + 12] = at.x;
        e[o + 13] = at.y;
        e[o + 14] = at.z;
        e[o + 15] = 1;
        fade[k] = at.a;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    aFade.needsUpdate = true;
  }

  update(0);
  scene.add(mesh);
  return {
    mesh,
    update,
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    },
  };
}

// --- the smoke ring (Rooftops step 5) ----------------------------------------

export const RING = Object.freeze({ time: 3.2, rise: 1.4, grow: 2.4, opacity: 0.75, drift: 0.5, every: 7 });
const RING_COLOR = 0xd8d4cc;
export const RING_TILT = (35 * Math.PI) / 180;

// A puff's look at `u` (0 at the pot, 1 gone) into `out`: its height over the
// pot, its scale, its opacity and how far downwind it has gone. Eased out (it
// leaves the pot briskly and slows); y, scale and drift only grow, the
// opacity only falls, and it stays visible most of the way. Pure.
export function ringAt(u, out = {}) {
  const k = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const e = 1 - (1 - k) * (1 - k);
  out.y = RING.rise * e;
  out.scale = 1 + (RING.grow - 1) * e;
  out.opacity = RING.opacity * (1 - k * k);
  out.drift = RING.drift * e;
  return out;
}

// The ring over `pot` ({ x, y, z }): one mesh (roofsRing), a torus of 320
// triangles (fix wave, M3: 5 x 14 sides read as a flat slab), casting
// nothing, hidden between puffs. puff(eye) starts one (again from the pot if
// one is still rising), lying flat, or with `eye` (the camera's position at
// the puff) tilted RING_TILT toward it, turned about the up axis to face it,
// so the camera sees the hole; update(dt) takes the frame's seconds and
// allocates nothing.
export function createSmokeRing(scene, pot, { reducedMotion = false } = {}) {
  const mesh = withLocalUuids('roofs-ring', () => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.045, 8, 20),
      new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: RING.opacity, depthWrite: false }),
    );
    m.name = 'roofsRing';
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noCast = true;
    m.rotation.order = 'YXZ'; // turned to face the camera, then tilted toward it
    m.rotation.x = Math.PI / 2; // the torus's hole points up
    m.visible = false;
    return m;
  });
  const time = RING.time * (reducedMotion ? 2 : 1);
  const at = { y: 0, scale: 1, opacity: 0, drift: 0 };
  let age = -1; // seconds into the puff; < 0 between puffs

  function place() {
    ringAt(age / time, at);
    mesh.position.set(pot.x + WX * at.drift, pot.y + at.y, pot.z + WZ * at.drift);
    mesh.scale.setScalar(at.scale);
    mesh.material.opacity = at.opacity;
  }

  scene.add(mesh);
  return {
    mesh,
    puff(eye = null) {
      age = 0;
      const dx = eye ? eye.x - pot.x : 0;
      const dz = eye ? eye.z - pot.z : 0;
      if (dx * dx + dz * dz > 1e-8) {
        mesh.rotation.y = Math.atan2(dx, dz); // its local +z toward the camera
        mesh.rotation.x = Math.PI / 2 + RING_TILT; // the hole's top side leans toward it
      } else {
        mesh.rotation.y = 0;
        mesh.rotation.x = Math.PI / 2;
      }
      mesh.visible = true;
      place();
    },
    update(dt) {
      if (age < 0) return;
      age += dt;
      if (age >= time) {
        age = -1;
        mesh.visible = false;
        return;
      }
      place();
    },
    dispose() {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
