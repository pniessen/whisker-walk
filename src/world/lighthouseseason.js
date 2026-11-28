// =============================================================================
// LIGHTHOUSE POINT: THE SEASON (beauty pass 4, 2026-11-28). The place keeps the calendar: its grass, flowers and dune clumps,
// its sky and its light are drawn in the season of the date the area is built (the Northern Hemisphere's: March to May
// spring, June to August summer, September to November autumn, December to February winter). It is recolouring only: the
// same meshes, the same triangles, no new caster. The frost on the rocks, the wood and the grass in winter is a tint on
// the upward-facing vertices of the meshes the kit already made (frostMeshes).
//
// `setSeason` is read once as the area builds (lighthouse.js); the walk's life (lighthousewonders.js picks its surprise
// from it) reads `getSeason`. The picture page can name a season; the game never does.
// =============================================================================

import * as THREE from 'three';

export const SEASON_NAMES = Object.freeze(['spring', 'summer', 'autumn', 'winter']);

// 'spring' ... from a Date (or a month number 0..11)
export function seasonOf(date = new Date()) {
  const m = typeof date === 'number' ? date : date.getMonth();
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

let current = null;
export function setSeason(name) { current = SEASON_NAMES.includes(name) ? name : seasonOf(new Date()); return current; }
export function getSeason() { return current ?? seasonOf(new Date()); }

// The numbers each season gives the drawing code. `greens` and `tip` are the lawn tufts; `flowers` the four flower colours;
// `dune` the marram clumps (base, tip, and the colour a spring clump may bloom in); `frost` how much white the upward faces get;
// `sky` and `light` replace the evening's (the lamp is the warm thing in every one).
export const SEASONS = Object.freeze({
  spring: Object.freeze({
    dry: 0xa8b868,
    greens: Object.freeze([0x70ae48, 0x7fba56, 0x62a044, 0x8cc460]), tip: 0xe6e89a,
    flowers: Object.freeze([0xf6f1e4, 0xf2cf3a, 0xe892ae, 0xb98fd2]),
    dune: Object.freeze({ base: 0x6f8450, tip: 0xd4cf92, bloom: Object.freeze([0xf2cf3a, 0xe8789e, 0xb584d6, 0xfaf4e6]) }),
    frost: 0,
    sky: Object.freeze({ top: 0x86a8d8, horizon: 0xf8c8a0, warm: 0xff9a4a }),
    light: Object.freeze({ sunColor: 0xffb872, sunIntensity: 1.22, hemiSky: 0xb0bce0, hemiIntensity: 0.64 }),
  }),
  summer: Object.freeze({
    dry: 0xc4bc64,
    greens: Object.freeze([0x7ab048, 0x8abc52, 0x6ea03c, 0x9cc460]), tip: 0xf0e48a,
    flowers: Object.freeze([0xf6f1e4, 0xf2cf3a, 0xf2a0b8, 0xc89ae0]),
    dune: Object.freeze({ base: 0x7a8a4a, tip: 0xe6d890, bloom: null }),
    frost: 0,
    sky: Object.freeze({ top: 0x7da4de, horizon: 0xffc880, warm: 0xffa040 }),
    light: Object.freeze({ sunColor: 0xffb45e, sunIntensity: 1.38, hemiSky: 0xb4c2e4, hemiIntensity: 0.62 }),
  }),
  autumn: Object.freeze({
    dry: 0xc8a458,
    greens: Object.freeze([0xb08a3a, 0xc29c48, 0x9a7a34, 0xcaa857]), tip: 0xe8c068,
    flowers: Object.freeze([0xc8642c, 0xdca03a, 0x9a4a30, 0xd9c08a]),
    dune: Object.freeze({ base: 0x8a6f3a, tip: 0xe0c070, bloom: null }),
    frost: 0,
    sky: Object.freeze({ top: 0x6a7392, horizon: 0xe0a070, warm: 0xff8e48 }),
    light: Object.freeze({ sunColor: 0xffa660, sunIntensity: 1.1, hemiSky: 0x98a2c4, hemiIntensity: 0.58 }),
  }),
  winter: Object.freeze({
    dry: 0x9aab9c,
    greens: Object.freeze([0x6a8a6c, 0x76966f, 0x5c7a62, 0x82a088]), tip: 0xc4d6e0,
    flowers: Object.freeze([0xf0f4f8, 0xdce6f0, 0xc8d6e8, 0xe8eef6]),
    dune: Object.freeze({ base: 0x6a7d6a, tip: 0xe0e6e8, bloom: null }),
    frost: 1,
    sky: Object.freeze({ top: 0x8fb0e4, horizon: 0xf0c4c4, warm: 0xff9a60 }),
    light: Object.freeze({ sunColor: 0xffc8a8, sunIntensity: 0.98, hemiSky: 0x9cc0f6, hemiIntensity: 0.74 }),
  }),
});

export const seasonData = (name = getSeason()) => SEASONS[name] ?? SEASONS.autumn;

// ---- the frost -----------------------------------------------------------------------------------------
const FROST = new THREE.Color(0xe4eefa);
const _c = new THREE.Color();
// Tint the upward-facing vertices of these named meshes (a build-time pass over the colour attribute only; their triangles are untouched).
export function frostMeshes(meshes, k = 1, names = ['lighthouse:rocks', 'lighthouse:flora', 'lighthouse:stone', 'lighthouse:wood']) {
  if (!(k > 0)) return 0;
  let n = 0;
  for (const m of meshes) {
    if (!names.includes(m.name)) continue;
    const g = m.geometry; const col = g.attributes.color; const nor = g.attributes.normal;
    if (!col || !nor) continue;
    for (let i = 0; i < col.count; i++) {
      const up = nor.getY(i);
      if (up < 0.45) continue;
      const a = Math.min(0.7, (up - 0.35) * 0.9) * k;
      _c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(FROST, a);
      col.setXYZ(i, _c.r, _c.g, _c.b);
      n++;
    }
    col.needsUpdate = true;
  }
  return n;
}
