// =============================================================================
// THE OLD HOUSE: BEAUTY PASS 2 (2026-11-28), light, colour and motion with NO new geometry. The house's lit atlas material (the walls' dressing, the furniture, the floors, the
// garden's kit) gets a small shader patch, so everything already in the picture changes:
//   * WINDOW LIGHT: the four windows nearest the cat (by day, on her floor) lay a bright pane-barred patch of sun on the boards, rugs and furniture tops beneath them;
//   * LAMP GLOW and FIRELIGHT: the three lamps nearest her warm the wall and furniture round them; the hearth's firelight flickers on the rugs, chairs and walls of the parlour
//     (an emissive add on the surface's own colour, no real light), and the flames' cones lick upward;
//   * GOLDEN AFTERNOON: a warm lean and a richer saturation on everything by day, the rugs richer still;
//   * CURTAINS STIR: the curtains' folds ripple in a breeze (a texture shift, no vertex moves, so walls and sinking are untouched);
//   * GARDEN: blooms, butterflies' wings and low leaves in the garden's kit sway on one slow gust clock (hedge, gate, birdbath and washing poles are kept still).
// BEAUTY PASS 3 (2026-11-28), THE HOUSE REACTS TO THE CAT AND LIVES, still no mesh, triangle, light or texture:
//   * PAWS: while she walks on a floor, a soft dust haze hangs under her and a ring of ruffle runs out across the boards and (more) across the rugs;
//   * CURTAINS billow more as she brushes past them;
//   * THE DAY: dayPart(hour) tints the whole house by the clock (cool morning, gold noon, amber evening, blue night with moonlit shafts and fuller lamp pools);
//   * THE FIRE's crackle brightens in bursts (uBurst, from the pops housesound.js plays);
//   * RAIN on the panes: pale streaks and beads slide down the glass (patchPane), and the sun patches dim and grey.
// Reduced motion holds every time-driven thing still (uTime 0); LITE draws no firelight flicker or sway. It adds no mesh, no triangle, no light, no texture: the walk's life
// (houselife.js) drives the uniforms once a frame. Pure lists (windowPatches, LAMP_SLOTS...) so tests read it without a renderer.
// =============================================================================

import * as THREE from 'three';
import { STORY_FUNCS, SEASON_TONE, SEASON_BREEZE } from './housestories.js';

export const WIN_SLOTS = 6;
export const LIVE_WIN = Object.freeze({ high: 6, low: 2 });
export const LAMP_SLOTS = 3;
export const FIRE = Object.freeze({ x: 13.72, y: 0.5, z: 7.0, r: 4.0, clip: Object.freeze({ minX: 4, maxX: 13.98, minZ: 2.02, maxZ: 11.98 }) });
export const SWAY = Object.freeze({ amp: 0.05, band: [0.1, 0.7] });
const PATCH = Object.freeze({ depth: 1.9, half: 0.7 }); // metres: how far into the room the sun's patch lands, and its half width

// The day's look by the clock: keyframes at an hour (0-24): the house's tone (a multiply), the colour and strength of the window patches, and the extra lamp warmth.
const DAY = [
  [0, [0.72, 0.82, 1.06], [0.45, 0.6, 1.0], 1.0, 1.6, [0.26, 0.36, 0.78], 0.28],
  [5.5, [0.72, 0.82, 1.06], [0.45, 0.6, 1.0], 1.0, 1.6, [0.26, 0.36, 0.78], 0.28],
  [7.5, [0.95, 1.02, 1.12], [0.8, 0.9, 1.0], 0.8, 0.2, [0.74, 0.9, 1.15], 0.8],
  [10, [1.08, 1.02, 0.86], [1.0, 0.86, 0.52], 1.0, 0, [1, 1, 1], 1],
  [15, [1.1, 1.0, 0.82], [1.0, 0.84, 0.5], 1.0, 0, [1, 1, 1], 1],
  [17.5, [1.25, 0.95, 0.62], [1.0, 0.5, 0.2], 1.0, 0.45, [1.15, 0.62, 0.32], 0.7],
  [19.5, [1.0, 0.82, 0.78], [0.9, 0.42, 0.34], 0.85, 1.0, [0.7, 0.42, 0.5], 0.45],
  [21, [0.72, 0.82, 1.06], [0.45, 0.6, 1.0], 1.0, 1.6, [0.26, 0.36, 0.78], 0.28],
  [24, [0.72, 0.82, 1.06], [0.45, 0.6, 1.0], 1.0, 1.6, [0.26, 0.36, 0.78], 0.28],
];
// dayPart(hour, out) -> out { tone[3], sun[3], lit[3] (the sun's and the fill's colour multiply), env (the image light's strength), sunK, lampK, night }: the keyframes blended at `hour` (written into `out`, nothing allocated when it is given). Pure.
export function dayPart(hour, out = { tone: [1, 1, 1], sun: [1, 1, 1], lit: [1, 1, 1], env: 1, sunK: 1, lampK: 0, night: 0 }) {
  const h = ((hour % 24) + 24) % 24;
  let i = 1;
  while (i < DAY.length - 1 && DAY[i][0] < h) i++;
  const a = DAY[i - 1], b = DAY[i];
  const k = (h - a[0]) / (b[0] - a[0]);
  for (let c = 0; c < 3; c++) { out.lit[c] = a[5][c] + (b[5][c] - a[5][c]) * k; out.tone[c] = a[1][c] + (b[1][c] - a[1][c]) * k; out.sun[c] = a[2][c] + (b[2][c] - a[2][c]) * k; }
  out.env = a[6] + (b[6] - a[6]) * k;
  out.sunK = a[3] + (b[3] - a[3]) * k;
  out.lampK = a[4] + (b[4] - a[4]) * k;
  out.night = h < 5.5 || h >= 21 ? 1 : 0;
  return out;
}

// beauty pass 5 (2026-11-28): ONE daily rhythm for the whole house. Lamps, hearth, window light, creatures and the sound beds all read the same few numbers (rhythm(part), from the real clock's
// dayPart), so every room agrees what time it is: day 1 by daylight and 0 at night, lamp 0..1 (the lamps' warmth), fire 0.75..1.1 (the hearth burns brighter as the lamps come on).
export function rhythm(part, out = { day: 1, lamp: 0, fire: 0.8 }) {
  out.lamp = Math.min(1, part.lampK);
  out.day = part.night ? 0 : Math.max(0, 1 - out.lamp);
  out.fire = 0.75 + 0.35 * out.lamp;
  return out;
}
// One draught for the whole house: it blows along WIND (towards the north-east), in gusts on one slow clock. The garden's leaves and blooms lean along it (the vertex shader), the curtains billow
// with it (uBreeze follows gustAt), and the creatures' drifting leaves and the attic's creaks keep to it.
export const WIND = Object.freeze({ x: 0.8, z: 0.6 });
export const gustAt = (t) => 0.6 + 0.4 * Math.sin(t * 0.37); // 0.2..1 (the garden's own gust, at the origin)
// the hall lamp, which warms as she arrives
export const HALL_LAMP = Object.freeze({ x: -2.9, z: 10.6 });

const DEFAULT_SUN = [1.0, 0.84, 0.5];
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
  transformed.x += (sin(uTime * 1.9 + w0.x * 1.3 + w0.z * 0.7) * ${SWAY.amp.toFixed(3)} + ${(WIND.x * 0.06).toFixed(3)}) * band * gust;
  transformed.z += (sin(uTime * 1.5 + w0.z * 1.1 - w0.x * 0.5) * ${SWAY.amp.toFixed(3)} + ${(WIND.z * 0.06).toFixed(3)}) * band * gust;` : `// the hearth's flames lick upward (the cones standing in the grate, nothing else is in that box)
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
uniform vec4 uCat;
uniform vec3 uTone;
uniform vec3 uSunCol;
uniform float uLampK;
uniform float uBurst;
uniform float uSeason;
uniform float uBox;
uniform float uCuckoo;
uniform float uBreeze;
varying vec3 vTw;
varying vec3 vNw;
float hCell(vec2 uv) { return floor(uv.x * 8.0) + 8.0 * floor(uv.y * 8.0); }
${STORY_FUNCS}`;
// the curtains (atlas cells 27 red, 28 green, 29 blue, 30 gingham) ripple: the fold pattern slides a few pixels either way
const MAP_FRAG = `{
  float cid = hCell(vMapUv);
  vec2 huv = vMapUv;
  if (cid > 26.5 && cid < 30.5) {
    float nearC = (1.0 - smoothstep(0.7, 2.6, distance(vTw.xz, uCat.xz))) * (1.0 - smoothstep(2.0, 3.5, abs(vTw.y - uCat.y)));
    huv.x += (3.0 / 512.0) * sin(uTime * (1.35 + 1.2 * nearC) + vTw.x * 0.9 + vTw.z * 0.9 + vTw.y * 2.2) * uFlick * uBreeze * (1.0 + 2.6 * nearC * (0.35 + 0.65 * uCat.w));
  }
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
  diffuseColor.rgb = stories(diffuseColor.rgb, vTw, normalize(vNw), uSeason, uBox, uCuckoo, uTime);
  diffuseColor.rgb *= mix(uTone, vec3(1.0), uDusk);
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
  totalEmissiveRadiance += (base * 0.95 + vec3(0.05, 0.035, 0.01)) * uSunCol * sunk * 1.7;
  totalEmissiveRadiance += storiesGlow(base, vTw, n, uSeason, uBox, uTime);
  float pool = 0.0;
  for (int i = 0; i < ${LAMP_SLOTS}; i++) {
    vec3 d = vTw - uLamp[i].xyz;
    float a = clamp(1.0 - dot(d, d) / 9.0, 0.0, 1.0);
    float f = clamp(dot(n, -normalize(d + vec3(0.0, 0.001, 0.0))) * 0.5 + 0.55, 0.0, 1.0);
    pool += a * a * f * uLamp[i].w;
  }
  totalEmissiveRadiance += (base + vec3(0.04, 0.02, 0.0)) * vec3(1.0, 0.7, 0.36) * pool * (0.5 + 0.55 * uDusk + uLampK * (1.0 - uDusk));
  vec3 fd = vTw - uFire.xyz;
  if (uFire.w > 0.0 && vTw.x < ${FIRE.clip.maxX.toFixed(2)} && vTw.x > ${FIRE.clip.minX.toFixed(1)} && vTw.z > ${FIRE.clip.minZ.toFixed(2)} && vTw.z < ${FIRE.clip.maxZ.toFixed(2)}) {
    float fa = clamp(1.0 - dot(fd, fd) / ${(FIRE.r * FIRE.r).toFixed(1)}, 0.0, 1.0);
    float ff = clamp(dot(n, -normalize(fd + vec3(0.0, 0.001, 0.0))) * 0.5 + 0.5, 0.0, 1.0);
    float fl = 0.72 + 0.16 * sin(uTime * 7.3) + 0.1 * sin(uTime * 12.7 + 1.3) + 0.06 * sin(uTime * 19.0 + vTw.z * 2.0);
    totalEmissiveRadiance += (base * 1.1 + vec3(0.06, 0.02, 0.0)) * vec3(1.0, 0.46, 0.16) * fa * ff * (mix(0.85, fl, uFlick) + uBurst * 0.9) * uFire.w * 1.9;
  }
  vec2 pd = vTw.xz - uCat.xz;
  float pr = length(pd);
  float onFloor = step(0.7, n.y) * (1.0 - smoothstep(0.12, 0.3, abs(vTw.y - uCat.y)));
  if (uCat.w > 0.0 && onFloor > 0.0 && pr < 1.6) {
    float pc = hCell(vMapUv);
    float rugK = (pc == 13.0 || pc == 14.0 || pc == 31.0) ? 0.9 : 0.35;
    float ring = sin(pr * 15.0 - uTime * 7.5) * exp(-pr * 2.2) * smoothstep(1.6, 0.3, pr);
    float haze = exp(-pr * pr * 5.0) * (0.55 + 0.45 * sin(uTime * 3.3 + pr * 4.0 + pd.x * 5.0));
    totalEmissiveRadiance += onFloor * uCat.w * (base * rugK * ring + vec3(0.95, 0.86, 0.68) * haze * 0.18);
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
  material.customProgramCacheKey = () => (garden ? 'house-glow-garden-v2' : 'house-glow-v2');
  material.needsUpdate = true;
}

// RAIN ON THE PANES (pass 3): a small patch of the pane's own material: beads and falling streaks (cells of the wall's run, each with its own speed) in pale blue, lifting
// the glass's alpha where they lie. uRain is 0 (dry: nothing drawn) or 1; still under reduced motion (uTime 0).
function patchPane(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uRain = uniforms.uRain;
    shader.uniforms.uSeason = uniforms.uSeason;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPw;\nvarying vec3 vPm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPw = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvPm = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uRain;\nuniform float uSeason;\nvarying vec3 vPw;\nvarying vec3 vPm;\nfloat rh(float n) { return fract(sin(n * 91.7 + 13.1) * 43758.5); }')
      .replace('#include <color_fragment>', `#include <color_fragment>
  if (uSeason < 0.5) {
    // winter (beauty pass 4): frost creeps in from the pane's edges (relative to the pane's middle, which is the mesh's origin), ferned and sparkling
    vec3 mid = vPm;
    float ly = vPw.y - mid.y;
    float lr = (vPw.x + vPw.z) - (mid.x + mid.z);
    float edge = max(smoothstep(0.1, 0.42, abs(ly)), smoothstep(0.12, 0.42, abs(lr)));
    float frost = clamp(edge * (0.6 + 0.4 * sin(lr * 38.0 + ly * 23.0 + sin(ly * 31.0) * 1.8)) + step(0.97, rh(floor(lr * 40.0) * 11.0 + floor(ly * 40.0))) * edge, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.94, 1.0), frost * 0.95);
    totalEmissiveRadiance += vec3(0.5, 0.58, 0.66) * frost * 0.5;
    diffuseColor.a = max(diffuseColor.a, frost * 0.97);
  }
  if (uRain > 0.0) {
    float run = vPw.x + vPw.z;
    float col = floor(run * 9.0);
    float h = rh(col);
    float fx = abs(fract(run * 9.0) - 0.5);
    float fall = fract(vPw.y * 0.9 + uTime * (0.1 + 0.2 * h) + h * 7.0);
    float line = (1.0 - smoothstep(0.05, 0.15, fx)) * smoothstep(0.0, 0.04, fall) * (1.0 - smoothstep(0.04, 0.6, fall)) * step(0.2, h);
    vec2 bc = vec2(run * 24.0, vPw.y * 24.0);
    vec2 bi = floor(bc);
    float bead = (1.0 - smoothstep(0.14, 0.3, length(fract(bc) - 0.5))) * step(0.62, rh(bi.x * 7.0 + bi.y));
    float drops = clamp(line + bead * 0.8, 0.0, 1.0) * uRain;
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.45 * uRain), vec3(0.85, 0.93, 1.0), drops * 0.9);
    totalEmissiveRadiance = totalEmissiveRadiance * (1.0 - 0.6 * uRain) + vec3(0.5, 0.6, 0.72) * drops;
    diffuseColor.a = max(diffuseColor.a, drops * 0.95);
  }`);
  };
  material.customProgramCacheKey = () => 'house-pane-rain-v2';
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
    uCat: { value: new THREE.Vector4(0, -100, 0, 0) }, uTone: { value: new THREE.Vector3(1.1, 1.0, 0.82) }, uSunCol: { value: new THREE.Vector3(1.0, 0.84, 0.5) },
    uLampK: { value: 0 }, uBurst: { value: 0 }, uRain: { value: 0 }, uSeason: { value: 3 }, uBox: { value: 0 }, uCuckoo: { value: 0 }, uBreeze: { value: 1 },
    uWin: { value: Array.from({ length: WIN_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uWinB: { value: Array.from({ length: WIN_SLOTS }, () => new THREE.Vector4(0, 1, 0.5, 1)) },
    uLamp: { value: Array.from({ length: LAMP_SLOTS }, () => new THREE.Vector4(0, -100, 0, 0)) },
    uFire: { value: new THREE.Vector4(FIRE.x, FIRE.y, FIRE.z, fire ? 1 : 0) },
    uKeep: { value: Array.from({ length: 3 }, (_, i) => (keep[i] ? new THREE.Vector4(keep[i].minX, keep[i].maxX, keep[i].minZ, keep[i].maxZ) : new THREE.Vector4(1, 0, 1, 0))) },
  };
  const fireOn = !!fire;
  const wd = new Float64Array(wins.length);
  const wt = new Uint8Array(wins.length);
  const ld = new Float64Array(lights.length);
  const lt = new Uint8Array(lights.length);
  const glow = {
    uniforms, wins, lights,
    patch(material, garden = false) { patch(material, uniforms, garden); return material; },
    patchPane(material) { patchPane(material, uniforms); return material; },
    // t: the walk's clock; cat { x, y, z }; still: reduced motion; dusk: the lamplight look; low: LOW and LITE tiers
    // pass 3: part (dayPart's result, null: the afternoon the house always had), rain (0 or 1), burst (0..1, the fire's crackle), energy (0..1, how hard she is walking)
    update(t, cat, { still = false, dusk = false, low = false, part = null, rain = 0, burst = 0, energy = 0, season = 3, box = 0, cuckoo = 0, fireK = 1, warm = 1 } = {}) {
      const calm = still || low;
      uniforms.uCat.value.set(cat?.x ?? 0, cat?.y ?? -100, cat?.z ?? 0, calm ? 0 : energy);
      uniforms.uBurst.value = calm ? 0 : burst;
      uniforms.uRain.value = rain;
      uniforms.uSeason.value = season;
      uniforms.uBox.value = box;
      uniforms.uCuckoo.value = cuckoo;
      uniforms.uBreeze.value = (SEASON_BREEZE[season] ?? 1) * (still ? 1 : 0.7 + 0.5 * gustAt(t)); // the curtains breathe with the same gusts as the garden
      uniforms.uFire.value.w = fireOn ? fireK : 0;
      const sunK = part ? part.sunK : 1;
      const st = SEASON_TONE[season] ?? SEASON_TONE[3];
      if (part) { uniforms.uTone.value.set(part.tone[0] * st[0], part.tone[1] * st[1], part.tone[2] * st[2]); uniforms.uLampK.value = part.lampK; } else { uniforms.uTone.value.set(1.1 * st[0], 1.0 * st[1], 0.82 * st[2]); uniforms.uLampK.value = 0; }
      const sc = part ? part.sun : DEFAULT_SUN;
      uniforms.uSunCol.value.set(sc[0] + (0.7 - sc[0]) * rain * 0.5, sc[1] + (0.76 - sc[1]) * rain * 0.5, sc[2] + (0.85 - sc[2]) * rain * 0.5);
      uniforms.uTime.value = still || low ? 0 : t;
      uniforms.uDusk.value = dusk ? 1 : 0;
      uniforms.uFlick.value = still || low ? 0 : 1;
      const sun = (1 - 0.6 * rain) * sunK * (0.9 + (still ? 0 : 0.1 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1))); // a slow cloud (and the day's strength, and the rain's dimming)
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
        a.set(l.x, l.y, l.z, l.w * (still ? 1 : 0.94 + 0.06 * Math.sin(t * 2.3 + best * 1.9)) * (l.x === HALL_LAMP.x && l.z === HALL_LAMP.z ? warm : 1));
      }
    },
  };
  return glow;
}
