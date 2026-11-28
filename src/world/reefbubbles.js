// =============================================================================
// THE REEF: REAL BUBBLES. One Points (one draw), every bubble a pure function of (index, time, reduced): no rng, no clock.
//   * a bubble sprite made in the fragment shader: a clear middle, a thin brighter rim (fresnel-like), a crisp glint up and left, a faint
//     opposite reflection, a thin-film tint of cyan and pink at the edge, and a tiny ring flash as it reaches the shimmer ceiling;
//   * sizes mostly small and a few large; small ones rise fast and wobble sideways, big ones drift in a slow ellipse and squash a little;
//   * each seep sends its bubbles in chains and bursts (two bursts a cycle); they shrink and fade just under the ceiling;
//   * reduced motion: still bubbles in the same sprite, spread up the water, no wobble, fewer.
// =============================================================================

import * as THREE from 'three';
import * as P from './reefplan.js';

export const BUB = Object.freeze({ high: 60, low: 36, lite: 36, reduced: 14, seeps: 6, cycle: 20, perBurst: 6, top: P.SURFACE_Y - 0.3, fadeFrom: 0.84, salt: 0x62756262, base: 0.17 });

function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((salt | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const H = (i, k) => hash01(i + k * 1000, BUB.salt);

// The plan for bubble i: fixed numbers from its index. seeps: [{x, z}] (BUBBLES.seeps of them).
export function bubblePlan(i, seeps, out = {}) {
  const k = i % BUB.seeps;
  const j = Math.floor(i / BUB.seeps);
  const seep = seeps[k];
  const s = H(i, 4) ** 3; // 0..1, mostly small
  out.seep = seep; out.k = k;
  out.s = s;
  out.size = 0.5 + 2.6 * s; // a multiple of BUB.base (the diameter at one metre scale): 0.5 to 3.1
  out.y0 = P.reefY(seep.x, seep.z) + 0.15;
  const len = BUB.top - out.y0;
  out.len = len;
  out.speed = Math.max(1.1 - 0.65 * s, len / (BUB.cycle - 3)) * (0.92 + 0.16 * H(i, 5)); // small fast, big slow, always home before the cycle ends
  out.dur = Math.min(BUB.cycle - 0.5, len / out.speed);
  // two bursts a cycle, a chain of bubbles each (a third of a second apart, a touch of jitter), each seep on its own beat
  const burst = Math.floor(j / BUB.perBurst) % 2;
  out.launch = H(k, 6) * BUB.cycle + burst * BUB.cycle * 0.5 + (j % BUB.perBurst) * 0.35 + H(i, 7) * 0.25;
  out.ox = (H(i, 2) - 0.5) * 0.5; out.oz = (H(i, 3) - 0.5) * 0.5;
  out.ph = H(i, 8) * 6.2832;
  out.wob = 0.07 * (1 - s) + 0.04; // small ones wobble sideways
  out.freq = 4.2 - 2.8 * s;
  out.ell = 0.1 * s; // big ones: a slow ellipse
  return out;
}

// Bubble i at time t: { x, y, z, size, squash, alpha, flash, live }. reduced: still, spread up the water, no wobble.
const plan = {};
export function bubbleState(i, t, seeps, reduced = false, out = {}) {
  const b = bubblePlan(i, seeps, plan);
  let age;
  if (reduced) age = (0.1 + 0.8 * H(i, 9)) * b.dur;
  else age = ((((t - b.launch) % BUB.cycle) + BUB.cycle) % BUB.cycle);
  const live = age < b.dur;
  const u = live ? age / b.dur : 0; // 0 at the sand, 1 at the top
  const a = reduced ? 0 : t * b.freq + b.ph;
  const grow = 0.6 + 0.8 * u; // the wobble widens as it climbs
  out.x = b.seep.x + b.ox + (reduced ? 0 : Math.sin(a) * b.wob * grow + Math.sin(t * 0.5 + b.ph) * b.ell * 2);
  out.z = b.seep.z + b.oz + (reduced ? 0 : Math.cos(a * 0.8 + 1) * b.wob * grow * 0.8 + Math.cos(t * 0.5 + b.ph) * b.ell * 1.4);
  out.y = live ? b.y0 + (BUB.top - b.y0) * u : b.y0;
  const fade = u > BUB.fadeFrom ? Math.max(0, 1 - (u - BUB.fadeFrom) / (1 - BUB.fadeFrom)) : 1;
  const born = Math.min(1, age * 3); // a quick swell as it leaves the sand
  out.live = live;
  out.alpha = live ? Math.min(fade, born) : 0;
  const shrink = 1 - 0.3 * Math.max(0, (u - 0.6) / 0.4);
  const flash = live && !reduced && u > 0.93 ? Math.sin(Math.PI * (u - 0.93) / 0.07) : 0; // a tiny ring flash as it goes
  out.flash = Math.max(0, flash);
  out.size = b.size * shrink * (1 + 0.5 * out.flash);
  out.squash = reduced ? 0 : b.s * 0.14 * Math.sin(t * 1.6 + b.ph); // big ones squash and stretch a touch
  if (!live) out.size = 0;
  return out;
}

// The sprite, as a fragment: p in -1..1 (y up), squash stretches it, flash brightens the ring.
const FRAG = `
  vec2 bp = (gl_PointCoord - 0.5) * 2.0; bp.y = -bp.y;
  bp *= vec2(1.0 + vSq, 1.0 - vSq);
  float br = length(bp);
  if (br > 1.0 || vAl < 0.01) discard;
  float edge = 1.0 - smoothstep(0.93, 1.0, br);
  float rim = pow(br, 5.0) * edge;
  float film = 0.5 + 0.5 * sin(atan(bp.y, bp.x) * 2.0 + br * 4.0);
  vec3 tint = mix(vec3(0.45, 0.95, 1.0), vec3(1.0, 0.62, 0.9), film);
  float g1 = 1.0 - smoothstep(0.0, 0.2, length(bp - vec2(-0.4, 0.42)));
  float g2 = (1.0 - smoothstep(0.0, 0.3, length(bp - vec2(0.36, -0.38)))) * 0.28;
  float ringFlash = vFl * smoothstep(0.7, 0.95, br) * edge;
  vec3 col = tint * rim * 0.95 + vec3(0.04, 0.1, 0.12) * (1.0 - br) + vec3(1.0) * (g1 + g2) + vec3(0.8, 1.0, 1.0) * ringFlash;
  diffuseColor.rgb = col;
  diffuseColor.a = clamp(rim * 0.8 + 0.07 + g1 + g2 + ringFlash * 0.7, 0.0, 1.0) * vAl * edge;
`;

// makeBubbles(n) -> { geo, mat }: attributes position + aB (size, squash, alpha, flash); the caller fills them each frame (setBubble).
export function makeBubbles(n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  const mat = new THREE.PointsMaterial({ size: BUB.base, sizeAttenuation: true, color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aB;\nvarying float vSq;\nvarying float vAl;\nvarying float vFl;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aB.x; vSq = aB.y; vAl = aB.z; vFl = aB.w;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSq;\nvarying float vAl;\nvarying float vFl;')
      .replace('#include <map_particle_fragment>', FRAG);
  };
  return { geo, mat };
}

export function setBubble(geo, i, s) {
  geo.attributes.position.setXYZ(i, s.x, s.y, s.z);
  geo.attributes.aB.setXYZW(i, s.size, s.squash, s.alpha, s.flash);
}
