// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY PASS 2 (2026-11-28), colour, light and wind with NO new geometry. The village's two lit materials ('paint' and 'leaves', the merged buckets) get a
// small shader patch, so every plank, wall and leaf already in the picture changes:
//   * LAMP POOLS: warm light pooled on whatever is near the lanterns and the lit windows (an emissive add, the surface's own colour times a warm tone, fading with distance and with
//     facing away); the six lamps nearest the cat are the live ones (four on LOW, three on LITE), so it costs one short loop and never a real light;
//   * GOLDEN HOUR: a warm lean on every surface, a touch more on the leaves;
//   * AUTUMN POPS: slow patches of gold and copper through the leaves that stand above the walk (the canopy and the tall trees), in the one leaves mesh;
//   * GUSTS: the leaves above 3 m sway on one shared time uniform with a slow gust envelope (reduced motion and LITE hold them still; the paint never moves: no collider, perch or shadow
//     mismatch).
// It adds no mesh, no triangle, no light, no texture. The walk's life (treehouselight.js) drives the uniforms once a frame through `userData.sky.update`; nothing is made per frame.
// A pure list (lampPoints) says where the lamps are; tests read it without THREE.
// =============================================================================

import * as THREE from 'three';
import * as P from './treehouseplan.js';

export const LAMP_RADIUS = 4.2; // metres a lantern's pool reaches
export const LAMP_SLOTS = 6; // the shader's lamp array (the live count is lower on LOW and LITE)
export const LIVE = Object.freeze({ high: 6, low: 4, lite: 3 });
export const GUST = Object.freeze({ amp: 0.1, from: 3, to: 9 }); // metres a leaf blob moves at most, and the heights the sway fades in over

// Every lamp: the lanterns hung at the deck corners and the bridge ends (treehouseparts.js lantern()), and the lit windows' spill on the decks.
export function lampPoints() {
  const out = [];
  for (const k of P.DECKS) for (const sx of [-1, 1]) out.push({ x: k.x + (sx * k.w) / 2, y: k.y + P.RAIL_H + 0.7, z: k.z - k.d / 2, w: 1 });
  for (const line of P.BRIDGE_LINES) for (const p of [line[0], line.at(-1)]) out.push({ x: p.x, y: p.y + P.RAIL_H + 0.8, z: p.z, w: 0.9 });
  for (const k of P.DECKS) if (k.hut) out.push({ x: k.hut.x, y: k.y + k.hut.h * 0.55, z: k.hut.z + k.hut.r + 0.5, w: 0.8 });
  return out;
}

const COMMON_VERT = `#include <common>
uniform float uTime;
uniform float uSway;
varying vec3 vTw;
varying vec3 vNw;`;
const BEGIN_VERT = (leaves) => `#include <begin_vertex>
{
  vec3 w0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  ${leaves ? `float h = smoothstep(${GUST.from.toFixed(1)}, ${GUST.to.toFixed(1)}, w0.y) * uSway;
  float gust = 0.55 + 0.45 * sin(uTime * 0.31 + w0.x * 0.045 + w0.z * 0.03);
  float a = sin(uTime * 1.7 + w0.x * 0.6 + w0.z * 0.45 + w0.y * 0.3);
  float b = sin(uTime * 1.13 + w0.z * 0.7 - w0.x * 0.3);
  transformed.x += a * ${GUST.amp.toFixed(2)} * h * gust;
  transformed.z += b * ${GUST.amp.toFixed(2)} * h * gust;
  transformed.y += a * 0.03 * h * gust;` : ''}
  vTw = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`;
const COMMON_FRAG = `#include <common>
uniform vec4 uLamp[${LAMP_SLOTS}];
uniform float uTime;
varying vec3 vTw;
varying vec3 vNw;`;
const EMISSIVE_FRAG = (leaves) => `#include <emissivemap_fragment>
{
  vec3 base = diffuseColor.rgb;
  float pool = 0.0;
  for (int i = 0; i < ${LAMP_SLOTS}; i++) {
    vec3 d = vTw - uLamp[i].xyz;
    float a = clamp(1.0 - dot(d, d) / ${(LAMP_RADIUS * LAMP_RADIUS).toFixed(2)}, 0.0, 1.0);
    float f = clamp(dot(normalize(vNw), -normalize(d + vec3(0.0, 0.001, 0.0))) * 0.6 + 0.45, 0.0, 1.0);
    pool += a * a * f * uLamp[i].w;
  }
  totalEmissiveRadiance += (base * 1.1 + vec3(0.05, 0.025, 0.0)) * vec3(1.0, 0.62, 0.26) * pool * 1.5;
}`;
const COLOR_FRAG = (leaves) => `#include <color_fragment>
{
  diffuseColor.rgb *= mix(vec3(1.0), vec3(${leaves ? '1.12, 1.0, 0.8' : '1.08, 1.0, 0.86'}), 0.55);
  ${leaves ? `float n = sin(vTw.x * 0.21 + 1.3) * sin(vTw.z * 0.19 + 0.4) + 0.6 * sin(vTw.x * 0.07 + vTw.z * 0.11);
  float pop = smoothstep(0.2, 0.7, n) * smoothstep(3.5, 8.0, vTw.y);
  vec3 fall = mix(vec3(0.95, 0.62, 0.14), vec3(0.82, 0.3, 0.1), smoothstep(-0.3, 0.6, sin(vTw.x * 0.33 - vTw.z * 0.27)));
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = mix(diffuseColor.rgb, fall * (0.5 + lum * 1.4), pop * 0.85);` : ''}
}`;

// patch(material, leaves) -> { uTime, uSway, uLamp } uniforms. The two materials share one uniform set (the same objects), so one update drives both.
function patch(material, uniforms, leaves) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', COMMON_VERT).replace('#include <begin_vertex>', BEGIN_VERT(leaves));
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', COMMON_FRAG).replace('#include <color_fragment>', COLOR_FRAG(leaves)).replace('#include <emissivemap_fragment>', EMISSIVE_FRAG(leaves));
  };
  material.customProgramCacheKey = () => (leaves ? 'treehouse-sky-leaves-v1' : 'treehouse-sky-paint-v1');
}

// skyPatch(M) patches M.paint and M.leaves and leaves `userData.sky = { update(t, cat, still, rung) }` on each. The lamp vec4s are pre-made (no allocation per frame).
export function skyPatch(M) {
  const uniforms = { uTime: { value: 0 }, uSway: { value: 1 }, uLamp: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) } };
  patch(M.paint, uniforms, false);
  patch(M.leaves, uniforms, true);
  const lamps = lampPoints();
  const dist = new Float64Array(lamps.length);
  const taken = new Uint8Array(lamps.length);
  const sky = {
    uniforms,
    // t: the walk's time; cat: { x, y, z } or null; still: reduced motion; rung: 'high' | 'low' | 'lite'
    update(t, cat, still, rung) {
      uniforms.uTime.value = still ? 0 : t;
      uniforms.uSway.value = still || rung === 'lite' ? 0 : 1;
      const live = LIVE[rung] ?? LIVE.high;
      taken.fill(0);
      for (let i = 0; i < lamps.length; i++) { const l = lamps[i]; dist[i] = cat ? (l.x - cat.x) ** 2 + (l.z - cat.z) ** 2 : i; }
      for (let s = 0; s < LAMP_SLOTS; s++) {
        const slot = uniforms.uLamp.value[s];
        let best = -1;
        if (s < live) for (let i = 0; i < lamps.length; i++) if (!taken[i] && (best < 0 || dist[i] < dist[best])) best = i;
        if (best < 0) { slot.w = 0; continue; }
        taken[best] = 1;
        const l = lamps[best];
        slot.set(l.x, l.y, l.z, l.w * (still ? 1 : 0.9 + 0.1 * Math.sin(t * 3.1 + best * 2.3) * Math.sin(t * 1.3 + best)));
      }
    },
  };
  M.paint.userData.sky = sky;
  M.leaves.userData.sky = sky;
  return sky;
}
