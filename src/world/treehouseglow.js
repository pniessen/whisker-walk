// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY PASS 2 (2026-11-28), colour, light and wind with NO new geometry. The village's two lit materials ('paint' and 'leaves', the merged buckets) get a
// small shader patch, so every plank, wall and leaf already in the picture changes:
//   * LAMP POOLS: warm light pooled on whatever is near the lanterns and the lit windows (an emissive add, the surface's own colour times a warm tone, fading with distance and with
//     facing away); the six lamps nearest the cat are the live ones (four on LOW, three on LITE), so it costs one short loop and never a real light;
//   * GOLDEN HOUR: a warm lean on every surface, a touch more on the leaves;
//   * AUTUMN POPS: slow patches of gold and copper through the leaves that stand above the walk (the canopy and the tall trees), in the one leaves mesh;
//   * GUSTS: the leaves above 3 m sway on one shared time uniform with a slow gust envelope (reduced motion and LITE hold them still; the paint never moves: no collider, perch or shadow
//     mismatch).
//
// BEAUTY PASS 3 (2026-11-28), the village reacts to the cat and lives, still all in these two shaders and their uniforms:
//   * FLEX: the boards within a few metres of her feet ride a soft ripple (the planks and bridge boards give a little under her, harder after a landing, a faint creak of travelling waves
//     while she walks); LEAVES near her shiver as she brushes the boughs, hard after a landing;
//   * GUST WAVES: a travelling front crosses the canopy, bending the leaves further and lightening them as it passes;
//   * CLOUD SHADE: a slow drifting patch of cloud shadow over every surface that faces up; FLOOR MIST: a low pale haze round the stilts, trunk feet and the undersides of the decks;
//   * LAMP SWING: the lamp pools sway when she passes close (the lanterns' light swings with them);
//   * LANDINGS: `sky.reaction` says when she has just landed from a drop (the life shakes a shower of leaves loose and thumps the boards).
// Reduced motion holds all of it still (uTime 0, no flex, no shiver); LITE keeps the cloud and mist (cheap) but drops the flex, shiver and waves.
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

export const FLEX = Object.freeze({ dip: 0.07, near: 0.5, far: 3.2, band: 0.9 }); // metres a board gives at most, the ring it gives in, and how far above and below her feet a board still feels her
export const SHIVER = Object.freeze({ reach: 4.5, amp: 0.2 }); // metres a leaf feels her from, and how far it shakes at most
export const LAND = Object.freeze({ minFall: 2.2, fullFall: 6, decay: 3.2, shake: 2.4 }); // m/s of fall that counts as a landing, a hard one, how fast the shock fades (1/s), seconds the leaves keep shivering
const COMMON_VERT = `#include <common>
uniform float uTime;
uniform float uSway;
uniform vec4 uCat;
uniform vec3 uReact;
varying vec3 vTw;
varying vec3 vNw;
varying float vGf;`;
const BEGIN_VERT = (leaves) => `#include <begin_vertex>
{
  vec3 w0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  vGf = 0.0;
  ${leaves ? '' : `// FLEX: boards in the ring round her feet and level with them ride a ripple (uReact.x is the flex strength: the walk's, and the landing's)
  float fd = length(w0.xz - uCat.xz);
  float ring = smoothstep(${FLEX.near.toFixed(1)}, ${(FLEX.near + 0.7).toFixed(1)}, fd) * (1.0 - smoothstep(${(FLEX.far - 1.4).toFixed(1)}, ${FLEX.far.toFixed(1)}, fd));
  float lvl = 1.0 - smoothstep(0.25, ${FLEX.band.toFixed(2)}, abs(w0.y - uCat.y));
  transformed.y -= ${FLEX.dip.toFixed(3)} * uReact.x * ring * lvl * (0.55 + 0.45 * sin(uTime * 11.0 - fd * 5.0));`}
  ${leaves ? `float h = smoothstep(${GUST.from.toFixed(1)}, ${GUST.to.toFixed(1)}, w0.y) * uSway;
  float front = pow(0.5 + 0.5 * sin(dot(w0.xz, vec2(0.8, 0.6)) * 0.09 - uTime * 0.7), 3.0) * uSway;
  vGf = front;
  float gust = (0.55 + 0.45 * sin(uTime * 0.31 + w0.x * 0.045 + w0.z * 0.03)) * (1.0 + 1.6 * front);
  float a = sin(uTime * 1.7 + w0.x * 0.6 + w0.z * 0.45 + w0.y * 0.3);
  float b = sin(uTime * 1.13 + w0.z * 0.7 - w0.x * 0.3);
  transformed.x += a * ${GUST.amp.toFixed(2)} * h * gust;
  transformed.z += b * ${GUST.amp.toFixed(2)} * h * gust;
  transformed.y += a * 0.03 * h * gust;
  // SHIVER: leaves near her shake as she brushes them (uReact.y), the harder after a landing
  float sd = length(w0 - uCat.xyz - vec3(0.0, 1.6, 0.0));
  float sh = (1.0 - smoothstep(1.0, ${SHIVER.reach.toFixed(1)}, sd)) * uReact.y * h;
  transformed.x += sin(uTime * 17.0 + w0.z * 2.3 + w0.y) * ${SHIVER.amp.toFixed(2)} * sh;
  transformed.z += sin(uTime * 15.0 + w0.x * 2.1) * ${SHIVER.amp.toFixed(2)} * sh;
  transformed.y += sin(uTime * 13.0 + w0.x + w0.z) * 0.08 * sh;` : ''}
  vTw = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`;
const COMMON_FRAG = `#include <common>
uniform vec4 uLamp[${LAMP_SLOTS}];
uniform float uTime;
varying vec3 vTw;
varying vec3 vNw;
varying float vGf;`;
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
  // CLOUD SHADE: a slow patch of shadow drifting over the village (more on what faces up), the gaps between bright and warm
  float cl = sin(vTw.x * 0.075 + uTime * 0.24) * sin(vTw.z * 0.065 - uTime * 0.17 + 1.0) + 0.5 * sin(vTw.x * 0.031 - vTw.z * 0.044 + uTime * 0.09);
  float up = 0.55 + 0.45 * clamp(vNw.y, 0.0, 1.0);
  diffuseColor.rgb *= 1.0 - 0.26 * smoothstep(0.05, 0.85, cl) * up;
  diffuseColor.rgb *= 1.0 + 0.1 * smoothstep(-0.3, -0.9, cl) * up;
  ${leaves ? 'diffuseColor.rgb *= 1.0 + 0.22 * vGf;' : ''}
  // FLOOR MIST: a pale haze low round the stilts, trunk feet and the undersides of the decks, thickest on the ground
  float mst = (1.0 - smoothstep(0.0, 1.25, vTw.y)) * (0.8 + 0.2 * sin(vTw.x * 0.5 + vTw.z * 0.4 + uTime * 0.3));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72, 0.8, 0.82), 0.4 * mst);
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
  material.customProgramCacheKey = () => (leaves ? 'treehouse-sky-leaves-v2' : 'treehouse-sky-paint-v2');
}

// skyPatch(M) patches M.paint and M.leaves and leaves `userData.sky = { update(t, cat, still, rung) }` on each. The lamp vec4s are pre-made (no allocation per frame).
export function skyPatch(M) {
  const uniforms = { uTime: { value: 0 }, uSway: { value: 1 }, uCat: { value: new THREE.Vector4(0, -100, 0, 0) }, uReact: { value: new THREE.Vector3() }, uLamp: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) } };
  patch(M.paint, uniforms, false);
  patch(M.leaves, uniforms, true);
  const lamps = lampPoints();
  const dist = new Float64Array(lamps.length);
  const taken = new Uint8Array(lamps.length);
  const swing = new Float64Array(lamps.length); // each lamp's swing (0..1), kicked when she passes close, fading
  // her reaction state: `landedAt` is the walk's time of the last landing (0 before any), `land` its strength (0..1), `moving` her speed on the 0..1 scale of a stride
  const reaction = { landedAt: 0, land: 0, moving: 0, flex: 0, shake: 0 };
  let lastT = -1; let lx = 0; let ly = 0; let lz = 0; let have = false; let fall = 0;
  const sky = {
    uniforms,
    reaction,
    // Watches her speed and her falls: a drop of LAND.minFall m/s or more that ends is a landing (the strength grows to LAND.fullFall). Never allocates.
    react(t, cat, still, rung) {
      const dt = t - lastT; lastT = t;
      const r = reaction;
      if (!cat || !(dt > 0) || dt > 0.5 || !Number.isFinite(cat.y)) { have = false; fall = 0; if (cat) { lx = cat.x; ly = cat.y; lz = cat.z; have = Number.isFinite(cat.y); } }
      else if (have) {
        const dx = cat.x - lx; const dz = cat.z - lz; const dy = cat.y - ly;
        if (Math.abs(dx) + Math.abs(dz) > 3 || Math.abs(dy) > 4) fall = 0; // a door or a teleport is not a fall
        else {
          const vy = dy / dt;
          if (vy < -0.6) fall = Math.max(fall, -vy);
          else { if (fall >= LAND.minFall) { r.landedAt = t; r.land = Math.min(1, (fall - LAND.minFall) / (LAND.fullFall - LAND.minFall) * 0.8 + 0.3); } fall = 0; }
          r.moving += (Math.min(1, Math.hypot(dx, dz) / dt / 3) - r.moving) * Math.min(1, dt * 6);
        }
        lx = cat.x; ly = cat.y; lz = cat.z;
      } else { lx = cat.x; ly = cat.y; lz = cat.z; have = true; }
      const age = r.landedAt > 0 ? t - r.landedAt : 99;
      const hit = age >= 0 ? r.land * Math.exp(-age * LAND.decay) : 0;
      const calm = still || rung === 'lite';
      r.flex = calm ? 0 : Math.min(1.4, 0.3 * r.moving + hit * 1.6);
      r.shake = calm ? 0 : Math.min(1, 0.25 * r.moving + (age < LAND.shake ? r.land * (1 - age / LAND.shake) : 0));
      uniforms.uReact.value.set(r.flex, r.shake, 0);
      if (cat) uniforms.uCat.value.set(cat.x, cat.y, cat.z, 1); else uniforms.uCat.value.set(0, -100, 0, 0);
    },
    // t: the walk's time; cat: { x, y, z } or null; still: reduced motion; rung: 'high' | 'low' | 'lite'
    update(t, cat, still, rung) {
      uniforms.uTime.value = still ? 0 : t;
      sky.react(t, cat, still, rung);
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
        const near = cat ? Math.max(0, 1 - Math.hypot(l.x - cat.x, l.z - cat.z) / 3.2) : 0; // a lantern she passes close to swings, and its pool with it
        swing[best] = still || rung === 'lite' ? 0 : Math.max(swing[best] * 0.985, near * (0.5 + reaction.moving * 0.5));
        const sw = swing[best] * 0.55 * Math.sin(t * 2.6 + best * 1.7);
        slot.set(l.x + sw, l.y - Math.abs(sw) * 0.1, l.z + sw * 0.6, l.w * (still ? 1 : 0.9 + 0.1 * Math.sin(t * 3.1 + best * 2.3) * Math.sin(t * 1.3 + best)));
      }
    },
  };
  M.paint.userData.sky = sky;
  M.leaves.userData.sky = sky;
  return sky;
}
