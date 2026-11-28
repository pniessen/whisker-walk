// =============================================================================
// THE SQUARE REACTS AND LIVES (Market beauty pass 3). Shader work only: no
// triangle, mesh or caster is added. One shared uniforms record (createReact)
// is driven each frame by the square's life (marketlife.js) and read by
//   * the cobbles, the flagstones and the paint (addSquareLife 'ground' and
//     'paint'): a tone for the part of the day (morning cool, midday bright,
//     evening warm), the shadow of a drifting cloud over the ground, rings
//     that spread from her paws on the puddles she walks through, and a
//     glint on the wishing-coins that grows as she nears the fountain;
//   * the fountain's pool ('water'): sparse glints on the water;
//   * the awnings and the bunting (marketparts.js addFlutter): they sway
//     harder as she brushes past (uMkSway, uMkCat).
// Neutral at build (tone 1, everything else 0): a page that never runs the
// life draws what the square drew before. Reduced motion and the lite rungs
// are the life's to switch off (it sets the amplitudes to 0).
// =============================================================================
import * as THREE from 'three';
import { STALLS } from './marketplan.js';

// Beauty pass 5: each stall's colour identity (its awning, sign and counter are this hue already), echoed by the bunting
// over it and the cloth on the cobbles in front of it (the shaders below read it from the react record).
export const STALL_HUES = Object.freeze({
  fish: 0x4a86b8, baker: 0xe0a030, cheese: 0xf0d040, milk: 0x7ec0e0, flowers: 0xe0609a, fruit: 0x5cae3c,
  toys: 0x8a5ac0, plants: 0x2f8a5a, bric: 0xc88030, butcher: 0xd04050,
});
const SHOPS = STALLS.filter((s) => s.w > 0 && STALL_HUES[s.id] !== undefined);

export function createReact(puddles = []) {
  const pud = [];
  for (let i = 0; i < 5; i++) {
    const p = puddles[i] ?? [1e4, 1e4, 1, 1];
    pud.push(new THREE.Vector4(p[0], p[1], p[2], p[3]));
  }
  return {
    uMkR: { value: 0 }, // walk seconds (frozen under reduced motion)
    uMkCat: { value: new THREE.Vector3(0, -99, 0) },
    uMkTone: { value: new THREE.Vector3(1, 1, 1) },
    uMkCloud: { value: 0 },
    uMkRip: { value: 0 },
    uMkSpark: { value: 0 },
    uMkSway: { value: 0 },
    uMkSea: { value: new THREE.Vector4(0, 0, 0, 0) }, // beauty pass 4: the season's weights, x autumn, y winter, z spring, w summer (marketseason.js)
    uMkPud: { value: pud },
    // beauty pass 5: the day's rhythm (x: how open, the morning's lift; y: how shut, the evening's dim), and the ten stalls
    // (x, z, face x, face z) with their hues, for the bunting's and the cloth's echo. 0 / 0 draws the square as before.
    uMkDay: { value: new THREE.Vector2(0, 0) },
    uMkSt: { value: Array.from({ length: 10 }, (_, i) => (SHOPS[i] ? new THREE.Vector4(SHOPS[i].at.x, SHOPS[i].at.z, SHOPS[i].face.x, SHOPS[i].face.z) : new THREE.Vector4(1e4, 1e4, 0, 1))) },
    uMkStC: { value: Array.from({ length: 10 }, (_, i) => new THREE.Color(SHOPS[i] ? STALL_HUES[SHOPS[i].id] : 0xffffff).convertSRGBToLinear()) },
  };
}

const f = (n) => n.toFixed(3);

// kind 'ground' | 'paint' | 'water'; geo { fx, fz, c0, c1 }: the fountain's middle and the coins' ring (m)
export function addSquareLife(material, kind, react, geo) {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  const colour = kind === 'water' ? '' : `{
  vec3 w = vMkW;
  diffuseColor.rgb *= uMkTone;${kind === 'paint' ? `
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.78, 0.9), uMkDay.y);` : ''}
  {
    // beauty pass 4: the season. A warm russet foliage and a golden tone in autumn, frost and a cool tone in winter,
    // fresh green and blossom in spring, a bright richer tone in summer; fallen leaves, petals or daisies on the flat ground
    vec3 c = diffuseColor.rgb;
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    float fol = smoothstep(0.02, 0.08, c.g - max(c.r, c.b));
    c = mix(c, vec3(lum * 2.0 + 0.04, lum * 1.0, lum * 0.3), uMkSea.x * fol * 0.8);
    c = mix(c, c * vec3(1.06, 1.14, 0.92), uMkSea.z * fol);
    c = mix(c, vec3(lum * 0.9 + 0.1, lum * 1.0 + 0.1, lum * 1.05 + 0.13), uMkSea.y * fol * 0.7);
    c *= vec3(1.0) + uMkSea.x * vec3(0.10, -0.02, -0.16) + uMkSea.y * vec3(-0.05, 0.0, 0.07) + uMkSea.w * vec3(0.05, 0.04, -0.01);
    if (w.y < 0.03) {
      vec2 sp = w.xz * 6.0;
      vec2 cell = floor(sp);
      float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      float h2 = fract(h * 91.7);
      float spot = step(0.9, h) * (1.0 - smoothstep(0.12, 0.3, length(fract(sp) - 0.5)));
      vec3 sc = uMkSea.x > 0.5 ? mix(vec3(0.72, 0.3, 0.07), vec3(0.88, 0.64, 0.14), h2)
        : uMkSea.z > 0.5 ? mix(vec3(0.98, 0.78, 0.86), vec3(1.0, 0.96, 0.92), h2)
        : uMkSea.w > 0.5 ? mix(vec3(0.98, 0.92, 0.5), vec3(1.0, 1.0, 0.95), h2)
        : vec3(0.9, 0.95, 1.0);
      c = mix(c, sc, spot * (uMkSea.x + uMkSea.z + uMkSea.w * 0.6 + uMkSea.y * 0.5) * 0.85);
    }
${kind === 'ground' ? `    if (w.y < 0.03) {
      // beauty pass 5: a woven cloth in each stall's hue on the cobbles under and before its counter
      for (int i = 0; i < 10; i++) {
        vec4 st = uMkSt[i];
        vec2 dp = w.xz - st.xy;
        float lz = dot(dp, st.zw);
        float lx = dot(dp, vec2(-st.w, st.z));
        float inside = (1.0 - smoothstep(1.35, 1.6, abs(lx))) * smoothstep(-0.9, -0.7, lz) * (1.0 - smoothstep(2.0, 2.3, lz));
        float weave = 0.5 + 0.5 * sign(sin(lx * 14.0) * sin(lz * 14.0));
        c = mix(c, uMkStC[i] * (0.85 + 0.3 * weave), inside * (0.2 + 0.16 * weave));
      }
    }
` : ''}${kind === 'paint' ? `    c = mix(c, vec3(0.92, 0.96, 1.0), uMkSea.y * smoothstep(0.6, 0.9, vMkN.y) * smoothstep(0.35, 0.9, w.y) * 0.75);
` : ''}    diffuseColor.rgb = c;
  }
  float low = 1.0 - smoothstep(0.25, 0.45, w.y);
  vec2 q = w.xz * 0.05 + vec2(uMkR * 0.021, uMkR * 0.009);
  float c = 0.5 * sin(q.x * 3.1 + sin(q.y * 2.3)) + 0.5 * sin(q.y * 2.7 + 1.7 - q.x * 1.1);
  diffuseColor.rgb *= 1.0 - uMkCloud * 0.36 * smoothstep(0.0, 0.7, c) * low;${kind === 'paint' ? `
  if (w.y < 0.03 && uMkRip > 0.0) {
    float pr = 0.0;
    float r = length(w.xz - uMkCat.xz);
    float wave = pow(0.5 + 0.5 * sin(r * 22.0 - uMkR * 9.0), 3.0) * smoothstep(1.7, 0.2, r);
    for (int i = 0; i < 5; i++) {
      vec4 p = uMkPud[i];
      vec2 d = (w.xz - p.xy) / p.zw;
      vec2 cd = (uMkCat.xz - p.xy) / p.zw;
      pr += (1.0 - smoothstep(0.7, 1.0, dot(d, d))) * (1.0 - smoothstep(1.3, 2.4, dot(cd, cd)));
    }
    diffuseColor.rgb += vec3(0.5, 0.68, 0.8) * wave * min(pr, 1.0) * uMkRip * 0.9;
  }` : ''}
}`;
  const glow = kind === 'ground' ? '' : kind === 'water' ? `{
  vec2 gp = vMkW.xz * 6.0 + vec2(uMkR * 0.3, uMkR * 0.17);
  vec2 cell = floor(gp);
  float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float tw = step(0.8, h) * pow(0.5 + 0.5 * sin(uMkR * 2.6 + h * 80.0), 6.0) * smoothstep(0.55, 0.15, length(fract(gp) - 0.5));
  totalEmissiveRadiance += vec3(1.0, 0.97, 0.85) * tw * uMkSpark * 1.8;
}` : `{
  vec3 w = vMkW;
  vec2 fd = w.xz - vec2(${f(geo.fx)}, ${f(geo.fz)});
  float cd = length(fd);
  float coin = step(0.16, w.y) * step(w.y, 0.19) * step(${f(geo.c0)}, cd) * step(cd, ${f(geo.c1)});
  float near = smoothstep(9.0, 3.5, length(uMkCat.xz - vec2(${f(geo.fx)}, ${f(geo.fz)})));
  float ph = floor(atan(fd.y, fd.x) * 23.0);
  float tw = pow(0.5 + 0.5 * sin(uMkR * 3.3 + ph * 2.1), 5.0);
  totalEmissiveRadiance += vec3(1.0, 0.88, 0.5) * coin * (0.25 + 1.6 * near * tw + 0.5 * tw) * uMkSpark;
}`;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    for (const k of Object.keys(react)) shader.uniforms[k] = react[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMkW;\nvarying vec3 vMkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMkW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvMkN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vMkW;
varying vec3 vMkN;
uniform float uMkR; uniform vec3 uMkCat; uniform vec3 uMkTone; uniform float uMkCloud; uniform float uMkRip; uniform float uMkSpark;
uniform vec4 uMkPud[5];
uniform vec4 uMkSea;\nuniform vec2 uMkDay;\nuniform vec4 uMkSt[10];\nuniform vec3 uMkStC[10];`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${colour}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${glow}`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey.call(material) : ''}|market-life-${kind}-v3`;
}

// The part of the day for walk second t: 0 morning .. 1 evening, over `period` seconds, then back
export const DAY_PERIOD = 600;
export function dayPart(t, period = DAY_PERIOD) {
  const x = (t / period) % 1;
  return x < 0.5 ? x * 2 : 2 - x * 2; // a morning, up to the evening's warmth at the middle, and round again
}
const COOL = [0.9, 0.97, 1.09];
const BRIGHT = [1.06, 1.05, 1.0];
const WARM = [1.12, 0.9, 0.7];
// the tone at part p (0 cool morning, 0.5 bright midday, 1 warm evening), into out
export function toneAt(p, out) {
  const a = p < 0.5 ? COOL : BRIGHT;
  const b = p < 0.5 ? BRIGHT : WARM;
  const k = p < 0.5 ? p * 2 : p * 2 - 1;
  out.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
  return out;
}

// Beauty pass 5: the day's rhythm for part p of the day: how open the stalls are (the awnings lift their tint through the
// morning) and how shut (the evening dims them, as the lanterns brighten).
export const openAt = (p) => 1 - Math.min(1, Math.max(0, p / 0.3));
export function closeAt(p) {
  const k = Math.min(1, Math.max(0, (p - 0.55) / 0.4));
  return k * k * (3 - 2 * k);
}
