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
// downwind with a small curl, grows and is gone, then is born again at the
// pot. Made inside withLocalUuids, so it draws nothing on Math.random. Under
// reduced motion it runs at half speed.
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

export const SMOKE = Object.freeze({ perPot: 7, life: 6, rise: 0.45, drift: 0.35, top: 3.2, size: Object.freeze([0.12, 0.5]) });
const CURL = Object.freeze({ amp: 0.15, rate: 1.3, wave: 0.5 }); // m across the wind at the column's top; per s of age; per s of time
const BORN = 0.05; // of a puff's life, swelling from nothing
const FADE = 0.15; // of a puff's life, shrinking back to nothing

// Puff `i` of `pot`'s column at walk second `t`: out.x, .y, .z (its centre),
// .s (its radius). Pure: the same column at the same time on every device.
export function puffAt(pot, i, t, out = {}) {
  const f = (((t / SMOKE.life + i / SMOKE.perPot) % 1) + 1) % 1;
  const age = f * SMOKE.life;
  const curl = CURL.amp * f * Math.sin(CURL.rate * age - CURL.wave * t + hash01(pot.x, pot.z, 71) * TAU);
  out.x = pot.x + WX * SMOKE.drift * age - WZ * curl;
  out.z = pot.z + WZ * SMOKE.drift * age + WX * curl;
  out.y = pot.y + Math.min(SMOKE.top, SMOKE.rise * age);
  const [s0, s1] = SMOKE.size;
  const grown = s0 + (s1 - s0) * Math.min(1, f / (1 - FADE));
  out.s = f < BORN ? grown * (f / BORN) : f > 1 - FADE ? s1 * ((1 - f) / FADE) : grown;
  return out;
}

// The smoke over `pots` ([{ x, y, z }]): one InstancedMesh (roofsSmoke) of
// SMOKE.perPot puffs each. update(t) takes walk seconds.
export function createRoofsSmoke(scene, pots, { reducedMotion = false } = {}) {
  const count = pots.length * SMOKE.perPot;
  const mesh = withLocalUuids('roofs-smoke', () => {
    const m = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xb8b4b0, roughness: 1, metalness: 0, flatShading: true, transparent: true, opacity: 0.55, depthWrite: false }),
      count,
    );
    m.name = 'roofsSmoke';
    m.castShadow = false;
    m.receiveShadow = false;
    m.userData.noCast = true;
    m.frustumCulled = false; // S12: always one draw
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  });
  const speed = reducedMotion ? 0.5 : 1;
  const at = { x: 0, y: 0, z: 0, s: 0 };
  const e = mesh.instanceMatrix.array;

  function update(t) {
    const tt = t * speed;
    let n = 0;
    for (const pot of pots) {
      for (let i = 0; i < SMOKE.perPot; i++, n++) {
        puffAt(pot, i, tt, at);
        // a scale and a place, written straight into the matrix (column-major)
        const o = n * 16;
        e.fill(0, o, o + 16);
        e[o] = at.s;
        e[o + 5] = at.s;
        e[o + 10] = at.s;
        e[o + 12] = at.x;
        e[o + 13] = at.y;
        e[o + 14] = at.z;
        e[o + 15] = 1;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
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
