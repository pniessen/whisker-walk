// =============================================================================
// THE OLD HOUSE: BEAUTY PASS 2 (2026-11-28), light, colour and motion with NO new geometry. The house's lit atlas material (the walls' dressing, the furniture, the floors, the
// garden's kit) gets a small shader patch, so everything already in the picture changes:
//   * WINDOW LIGHT: the four windows nearest the cat (by day, on her floor) lay a bright pane-barred patch of sun on the boards, rugs and furniture tops beneath them;
//   * LAMP GLOW and FIRELIGHT: the three lamps nearest her warm the wall and furniture round them; the hearth's firelight flickers on the rugs, chairs and walls of the parlour
//     (an emissive add on the surface's own colour, no real light), and the flames' cones lick upward;
//   * GOLDEN AFTERNOON: a warm lean and a richer saturation on everything by day, the rugs richer still;
//   * CURTAINS STIR: the curtains' folds ripple in a breeze (a texture shift, no vertex moves, so walls and sinking are untouched);
//   * GARDEN: blooms, butterflies' wings and low leaves in the garden's kit sway on one slow gust clock (hedge, gate, birdbath and washing poles are kept still).
// Reduced motion holds every time-driven thing still (uTime 0); LITE draws no firelight flicker or sway. It adds no mesh, no triangle, no light, no texture: the walk's life
// (houselife.js) drives the uniforms once a frame. Pure lists (windowPatches, LAMP_SLOTS...) so tests read it without a renderer.
// =============================================================================

import * as THREE from 'three';

export const WIN_SLOTS = 6;
export const LIVE_WIN = Object.freeze({ high: 6, low: 2 });
export const LAMP_SLOTS = 3;
export const FIRE = Object.freeze({ x: 13.72, y: 0.5, z: 7.0, r: 4.0, clip: Object.freeze({ minX: 4, maxX: 13.98, minZ: 2.02, maxZ: 11.98 }) });
export const SWAY = Object.freeze({ amp: 0.05, band: [0.1, 0.7] });
const PATCH = Object.freeze({ depth: 1.9, half: 0.7 }); // metres: how far into the room the sun's patch lands, and its half width

const INWARD = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };

// The floor patches the windows throw: { x, y, z, ix, iz, hw, hd, level } (the cellar's window throws none). Pure.
export function windowPatches(windows, rooms, levels) {
  const levelY = new Map(levels.map((l) => [l.id, l.y]));
  const out = [];
  for (const w of windows) {
    const room = rooms.find((r) => r.id === w.room);
    if (!room || room.level === 'cellar') continue;
    const [ix, iz] = INWARD[w.side];
    const edge = w.side === 'n' ? room.minZ : w.side === 's' ? room.maxZ : w.side === 'w' ? room.minX : room.maxX;
    const into = edge + (ix + iz) * PATCH.depth;
    const alongX = iz !== 0;
    out.push({
      x: alongX ? w.at : into, z: alongX ? into : w.at, y: levelY.get(room.level) ?? 0,
      ix, iz, hw: Math.min(PATCH.half, w.width / 2), hd: PATCH.depth * 0.6, level: room.zone ?? room.level,
    });
  }
  return out;
}

const COMMON_VERT = `#include <common>
uniform float uTime;
uniform vec4 uKeep[3];
varying vec3 vTw;
varying vec3 vNw;`;
const BEGIN_VERT = (garden) => `#include <begin_vertex>
{
  vec3 w0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  ${garden ? `float band = smoothstep(${SWAY.band[0].toFixed(2)}, 0.3, w0.y) * (1.0 - smoothstep(0.45, ${SWAY.band[1].toFixed(2)}, w0.y));
  for (int i = 0; i < 3; i++) if (w0.x > uKeep[i].x && w0.x < uKeep[i].y && w0.z > uKeep[i].z && w0.z < uKeep[i].w) band = 0.0;
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + w0.x * 0.08 + w0.z * 0.05);
  transformed.x += sin(uTime * 1.9 + w0.x * 1.3 + w0.z * 0.7) * ${SWAY.amp.toFixed(3)} * band * gust;
  transformed.z += sin(uTime * 1.5 + w0.z * 1.1 - w0.x * 0.5) * ${SWAY.amp.toFixed(3)} * band * gust;` : `// the hearth's flames lick upward (the cones standing in the grate, nothing else is in that box)
  if (w0.x > 13.55 && w0.x < 13.88 && w0.z > 6.7 && w0.z < 7.3 && w0.y > 0.21 && w0.y < 0.7 && uFlick > 0.0) {
    transformed.y += (w0.y - 0.2) * 0.34 * uFlick * (0.5 + 0.5 * sin(uTime * 9.0 + w0.z * 11.0) * sin(uTime * 5.3 + 1.7));
  }`}
  vTw = (modelMatrix * vec4(transformed, 1.0)).xyz;
}`;
const COMMON_FRAG = `#include <common>
uniform float uTime;
uniform float uDusk;
uniform float uFlick;
uniform vec4 uWin[${WIN_SLOTS}];
uniform vec4 uWinB[${WIN_SLOTS}];
uniform vec4 uLamp[${LAMP_SLOTS}];
uniform vec4 uFire;
varying vec3 vTw;
varying vec3 vNw;
float hCell(vec2 uv) { return floor(uv.x * 8.0) + 8.0 * floor(uv.y * 8.0); }`;
// the curtains (atlas cells 27 red, 28 green, 29 blue, 30 gingham) ripple: the fold pattern slides a few pixels either way
const MAP_FRAG = `{
  float cid = hCell(vMapUv);
  vec2 huv = vMapUv;
  if (cid > 26.5 && cid < 30.5) huv.x += (3.0 / 512.0) * sin(uTime * 1.35 + vTw.x * 0.9 + vTw.z * 0.9 + vTw.y * 2.2) * uFlick;
  vec4 sampledDiffuseColor = texture2D( map, huv );
  diffuseColor *= sampledDiffuseColor;
}`;
const COLOR_FRAG = `#include <color_fragment>
{
  float cid = hCell(vMapUv);
  float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  bool rug = cid == 13.0 || cid == 14.0 || cid == 31.0;
  float sat = rug ? 1.6 : 1.3;
  diffuseColor.rgb = max(vec3(0.0), mix(vec3(lum), diffuseColor.rgb, sat));
  diffuseColor.rgb *= mix(vec3(1.1, 1.0, 0.82), vec3(1.0), uDusk);
}`;
const EMISSIVE_FRAG = `#include <emissivemap_fragment>
{
  vec3 base = diffuseColor.rgb;
  vec3 n = normalize(vNw);
  float sunk = 0.0;
  for (int i = 0; i < ${WIN_SLOTS}; i++) {
    vec3 d = vTw - uWin[i].xyz;
    vec2 t = vec2(uWinB[i].y, -uWinB[i].x);
    float a = dot(d.xz, t);
    float b = dot(d.xz, uWinB[i].xy);
    float sa = 1.0 - smoothstep(uWinB[i].z - 0.12, uWinB[i].z + 0.04, abs(a));
    float sb = 1.0 - smoothstep(uWinB[i].w - 0.25, uWinB[i].w + 0.05, abs(b));
    float bar = smoothstep(0.03, 0.075, abs(a)) * smoothstep(0.03, 0.075, abs(b + 0.1));
    float up = clamp(n.y, 0.0, 1.0);
    float hgt = d.y < -0.12 ? 0.0 : 1.0 - smoothstep(0.15, 1.3, d.y);
    sunk += uWin[i].w * sa * sb * mix(0.35, 1.0, bar) * up * hgt;
  }
  totalEmissiveRadiance += (base * 0.95 + vec3(0.05, 0.035, 0.01)) * vec3(1.0, 0.84, 0.5) * sunk * 1.7;
  float pool = 0.0;
  for (int i = 0; i < ${LAMP_SLOTS}; i++) {
    vec3 d = vTw - uLamp[i].xyz;
    float a = clamp(1.0 - dot(d, d) / 9.0, 0.0, 1.0);
    float f = clamp(dot(n, -normalize(d + vec3(0.0, 0.001, 0.0))) * 0.5 + 0.55, 0.0, 1.0);
    pool += a * a * f * uLamp[i].w;
  }
  totalEmissiveRadiance += (base + vec3(0.04, 0.02, 0.0)) * vec3(1.0, 0.7, 0.36) * pool * (0.5 + 0.55 * uDusk);
  vec3 fd = vTw - uFire.xyz;
  if (uFire.w > 0.0 && vTw.x < ${FIRE.clip.maxX.toFixed(2)} && vTw.x > ${FIRE.clip.minX.toFixed(1)} && vTw.z > ${FIRE.clip.minZ.toFixed(2)} && vTw.z < ${FIRE.clip.maxZ.toFixed(2)}) {
    float fa = clamp(1.0 - dot(fd, fd) / ${(FIRE.r * FIRE.r).toFixed(1)}, 0.0, 1.0);
    float ff = clamp(dot(n, -normalize(fd + vec3(0.0, 0.001, 0.0))) * 0.5 + 0.5, 0.0, 1.0);
    float fl = 0.72 + 0.16 * sin(uTime * 7.3) + 0.1 * sin(uTime * 12.7 + 1.3) + 0.06 * sin(uTime * 19.0 + vTw.z * 2.0);
    totalEmissiveRadiance += (base * 1.1 + vec3(0.06, 0.02, 0.0)) * vec3(1.0, 0.46, 0.16) * fa * ff * mix(0.85, fl, uFlick) * uFire.w * 1.9;
  }
}`;

function patch(material, uniforms, garden) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', COMMON_VERT + (garden ? '' : '\nuniform float uFlick;'))
      .replace('#include <begin_vertex>', BEGIN_VERT(garden));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', COMMON_FRAG)
      .replace('#include <map_fragment>', MAP_FRAG)
      .replace('#include <color_fragment>', COLOR_FRAG)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAG);
  };
  material.customProgramCacheKey = () => (garden ? 'house-glow-garden-v1' : 'house-glow-v1');
  material.needsUpdate = true;
}

// createHouseGlow({ plan, levels, keep }) -> { uniforms, patch(material, garden), update(t, cat, { still, dusk, low }) }.
// `keep`: up to three { minX, maxX, minZ, maxZ } rectangles the garden's sway leaves still. Nothing is made per frame.
export function createHouseGlow({ windows = [], rooms = [], levels = [], lamps = [], sconces = [], keep = [], fire = true } = {}) {
  const wins = windowPatches(windows, rooms, levels);
  const lights = [
    ...lamps.map((l) => ({ x: l.x, y: (levels.find((v) => v.id === rooms.find((r) => r.id === l.room)?.level)?.y ?? 0) + 1.5, z: l.z, w: 1 })),
    ...sconces.map((s) => ({ x: s.x + s.nx * 0.4, y: s.y, z: s.z + s.nz * 0.4, w: 0.7 })),
  ];
  const uniforms = {
    uTime: { value: 0 }, uDusk: { value: 0 }, uFlick: { value: 1 },
    uWin: { value: Array.from({ length: WIN_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uWinB: { value: Array.from({ length: WIN_SLOTS }, () => new THREE.Vector4(0, 1, 0.5, 1)) },
    uLamp: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uFire: { value: new THREE.Vector4(FIRE.x, FIRE.y, FIRE.z, fire ? 1 : 0) },
    uKeep: { value: Array.from({ length: 3 }, (_, i) => (keep[i] ? new THREE.Vector4(keep[i].minX, keep[i].maxX, keep[i].minZ, keep[i].maxZ) : new THREE.Vector4(1, 0, 1, 0))) },
  };
  const wd = new Float64Array(wins.length);
  const wt = new Uint8Array(wins.length);
  const ld = new Float64Array(lights.length);
  const lt = new Uint8Array(lights.length);
  const glow = {
    uniforms, wins, lights,
    patch(material, garden = false) { patch(material, uniforms, garden); return material; },
    // t: the walk's clock; cat { x, y, z }; still: reduced motion; dusk: the lamplight look; low: LOW and LITE tiers
    update(t, cat, { still = false, dusk = false, low = false } = {}) {
      uniforms.uTime.value = still || low ? 0 : t;
      uniforms.uDusk.value = dusk ? 1 : 0;
      uniforms.uFlick.value = still || low ? 0 : 1;
      const sun = 0.9 + (still ? 0 : 0.1 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1)); // a slow cloud
      // the windows nearest the cat on her floor, by day only
      wt.fill(0);
      for (let i = 0; i < wins.length; i++) { const w = wins[i]; wd[i] = Math.abs((cat?.y ?? 0) - w.y) > 1.8 ? 1e9 : (w.x - (cat?.x ?? 0)) ** 2 + (w.z - (cat?.z ?? 0)) ** 2; }
      for (let s = 0; s < WIN_SLOTS; s++) {
        let best = -1;
        if (s >= (low ? LIVE_WIN.low : LIVE_WIN.high)) { uniforms.uWin.value[s].w = 0; continue; }
        for (let i = 0; i < wins.length; i++) if (!wt[i] && wd[i] < 1e8 && (best < 0 || wd[i] < wd[best])) best = i;
        const a = uniforms.uWin.value[s], b = uniforms.uWinB.value[s];
        if (best < 0 || dusk) { a.w = 0; continue; }
        wt[best] = 1;
        const w = wins[best];
        a.set(w.x, w.y, w.z, sun);
        b.set(w.ix, w.iz, w.hw, w.hd);
      }
      lt.fill(0);
      for (let i = 0; i < lights.length; i++) { const l = lights[i]; ld[i] = Math.abs((cat?.y ?? 0) + 1.2 - l.y) > 2.4 ? 1e9 : (l.x - (cat?.x ?? 0)) ** 2 + (l.z - (cat?.z ?? 0)) ** 2; }
      for (let s = 0; s < LAMP_SLOTS; s++) {
        let best = -1;
        for (let i = 0; i < lights.length; i++) if (!lt[i] && ld[i] < 1e8 && (best < 0 || ld[i] < ld[best])) best = i;
        const a = uniforms.uLamp.value[s];
        if (best < 0) { a.w = 0; continue; }
        lt[best] = 1;
        const l = lights[best];
        a.set(l.x, l.y, l.z, l.w * (still ? 1 : 0.94 + 0.06 * Math.sin(t * 2.3 + best * 1.9)));
      }
    },
  };
  return glow;
}
