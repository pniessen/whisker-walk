// =============================================================================
// THE MOON: THE BEAUTY PASS, ROUND 1 (the painter). The ground reads as the Moon's own regolith: one shared 1024 px canvas (512 on the lower rungs) over the
// whole 130 m ground paints the dark-grey dust with its pale and dark patches, the ejecta rays and blankets, craters of every size with their bowl shading
// (the sun's side in shadow, the far wall lit, a bright rim), the pebble speckle and the dark smudge a rock casts; and a small tiled grain texture (128 px) is
// multiplied in close to her paws for the fine speckle. Both belong to the one ground mesh and its one material: no draw call is added. The shading is
// baked for the game's fixed north-west sun (SUN in moonbeautyplan.js). Also the angular, fractured rock shapes. No Math.random (a seeded stream), no real light.
// Headless (no document, as in the tests) the ground is the plain vertex-coloured material it was.
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './moonplan.js';
import * as B from './moonbeautyplan.js';

const TAU = Math.PI * 2;
const { PAL, SUN } = B;
const rgb = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// A soft round spot: colour c at alpha a in the middle, nothing at the edge.
function soft(g, x, y, r, c, a) {
  const q = g.createRadialGradient(x, y, 0, x, y, r);
  q.addColorStop(0, rgb(c, a));
  q.addColorStop(1, rgb(c, 0));
  g.fillStyle = q;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

// One crater of radius R px at (cx, cy): the ejecta blanket (a fresh one), the sun's wall in shadow, the far wall lit, the dark floor, the bright rim. `str` 0..1.
function crater(g, cx, cy, R, fresh, str) {
  if (fresh) {
    const q = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.4);
    q.addColorStop(0, rgb(PAL.pale, 0.3 * str));
    q.addColorStop(1, rgb(PAL.pale, 0));
    g.fillStyle = q;
    g.beginPath();
    g.arc(cx, cy, R * 2.4, 0, TAU);
    g.fill();
  }
  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.clip();
  const lin = g.createLinearGradient(cx + SUN.x * R, cy + SUN.z * R, cx - SUN.x * R, cy - SUN.z * R);
  lin.addColorStop(0, rgb(PAL.floor, 0.48 * str));
  lin.addColorStop(0.3, rgb(PAL.floor, 0.26 * str));
  lin.addColorStop(0.62, rgb(PAL.floor, 0.1 * str));
  lin.addColorStop(0.86, rgb(PAL.pale, 0.2 * str));
  lin.addColorStop(1, rgb(PAL.pale, 0.42 * str));
  g.fillStyle = lin;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);
  soft(g, cx - SUN.x * R * 0.15, cy - SUN.z * R * 0.15, R * 0.8, PAL.floor, 0.3 * str);
  g.restore();
  const rim = g.createLinearGradient(cx + SUN.x * R, cy + SUN.z * R, cx - SUN.x * R, cy - SUN.z * R);
  rim.addColorStop(0, rgb(PAL.pale, 0.62 * str));
  rim.addColorStop(1, rgb(PAL.pale, 0.34 * str));
  g.strokeStyle = rim;
  g.lineWidth = Math.max(1, R * 0.17);
  g.beginPath();
  g.arc(cx, cy, R * 1.06, 0, TAU);
  g.stroke();
}

// Paints the whole ground on a canvas context (S px square for the 130 m ground). `shade`: [{ x, z, s }] the rocks whose smudge goes on the dust.
export function paintRegolith(g, S, { lite = false, shade = [] } = {}) {
  const k = S / P.GROUND_SIZE;
  const h = P.GROUND_SIZE / 2;
  const px = (x) => (x + h) * k;
  const rng = mulberry32(0x6a1e);
  g.fillStyle = rgb(PAL.base, 1);
  g.fillRect(0, 0, S, S);
  for (const p of B.patches(lite)) soft(g, px(p.x), px(p.z), p.r * k, p.k < 0 ? PAL.dark : PAL.pale, Math.abs(p.k) * 0.42);
  for (let i = 0; i < (lite ? 350 : 800); i++) soft(g, rng() * S, rng() * S, (0.5 + 2.2 * rng()) * k, rng() < 0.5 ? PAL.dark : PAL.pale, 0.05 + 0.1 * rng());
  for (const r of B.rays(lite)) {
    const x0 = px(r.x) + Math.cos(r.a) * r.from * k;
    const y0 = px(r.z) + Math.sin(r.a) * r.from * k;
    const x1 = x0 + Math.cos(r.a) * r.len * k;
    const y1 = y0 + Math.sin(r.a) * r.len * k;
    const nx = -Math.sin(r.a) * r.w * k;
    const ny = Math.cos(r.a) * r.w * k;
    const q = g.createLinearGradient(x0, y0, x1, y1);
    const c = r.dark ? PAL.dark : PAL.ray;
    q.addColorStop(0, rgb(c, 0.3 * r.k));
    q.addColorStop(1, rgb(c, 0));
    g.fillStyle = q;
    g.beginPath();
    g.moveTo(x0 + nx, y0 + ny);
    g.lineTo(x1, y1);
    g.lineTo(x0 - nx, y0 - ny);
    g.closePath();
    g.fill();
  }
  for (const c of P.CRATERS) { // the plan's bowls: a blanket of ejecta, a dark floor, the bowl's walls and rim (the heightfield shades them too, so a lighter hand)
    soft(g, px(c.x), px(c.z), c.r * 2.1 * k, PAL.pale, 0.2);
    crater(g, px(c.x), px(c.z), c.r * k, false, 0.55);
    soft(g, px(c.x), px(c.z), c.r * 0.7 * k, PAL.floor, 0.32);
  }
  for (const c of B.smallCraters(lite)) crater(g, px(c.x), px(c.z), c.r * k, c.fresh, c.fresh ? 0.95 : 0.7);
  for (const s of shade) { // a rock's smudge: dark on the dust, longer away from the sun, drawn flat
    g.save();
    g.translate(px(s.x) - SUN.x * s.s * k * 0.9, px(s.z) - SUN.z * s.s * k * 0.9);
    g.rotate(Math.atan2(-SUN.z, -SUN.x));
    g.scale(1.9, 1);
    soft(g, 0, 0, Math.max(2, s.s * 1.7 * k), PAL.dark, 0.5);
    g.restore();
  }
  for (let i = 0; i < (lite ? 2500 : 7000); i++) { // grit: single dark and pale specks (a hand's width at most)
    const d = rng() < 0.55;
    g.fillStyle = rgb(d ? PAL.dark : PAL.pale, 0.18 + 0.3 * rng());
    g.fillRect(rng() * S, rng() * S, 1 + (rng() < 0.2 ? 1 : 0), 1);
  }
}

// The tiled grain: mid-grey with dark and pale specks, 128 px. The ground multiplies it in (0.5 + g) twice at two scales.
export function paintGrain(g, S = 128) {
  const rng = mulberry32(0x91a1);
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = rng() < 0.5 ? 30 + 60 * rng() : 170 + 70 * rng();
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${0.35 + 0.5 * rng()})`;
    g.fillRect(rng() * S, rng() * S, 1 + (rng() < 0.15 ? 1 : 0), 1);
  }
}

export const GRAIN_TILE = 1.6; // metres one grain tile covers

// The one ground material (vertex colours for the broad tone, the canvas for the regolith, the grain for the close speckle), or null with no canvas.
export function regolithMaterial({ lite = false, shade = [] } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = lite ? 512 : 1024;
  const g = canvas.getContext?.('2d');
  if (!g) return null;
  paintRegolith(g, canvas.width, { lite, shade });
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = 8;
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const gg = gc.getContext?.('2d');
  if (gg) paintGrain(gg);
  const grain = new THREE.CanvasTexture(gc);
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.anisotropy = 4;
  map.addEventListener('dispose', () => grain.dispose());
  // (render/dusk.js's tintDuskLawn swaps in a clone of the ground's material, and a clone drops onBeforeCompile: so the material makes its own clones)
  const make = () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, metalness: 0, map });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGrain = { value: grain };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 grainUv;\nvarying vec2 vGrain;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrain = grainUv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uGrain;\nvarying vec2 vGrain;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 0.25 + 1.2 * texture2D(uGrain, vGrain).r + 0.6 * texture2D(uGrain, vGrain * 0.29 + 0.37).r;');
    };
    mat.customProgramCacheKey = () => 'moon-regolith';
    mat.clone = make;
    return mat;
  };
  return make();
}

// ---- the rocks ------------------------------------------------------------------------------------------------------

const hash = (i, j) => { const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };

// A fractured rock: a low-poly stone (a 20-triangle one for the small, an 80-triangle one for the big) pushed about, then CUT by flat planes, so it has
// sharp edges and flat faces like broken rock, with a flat base. Flat-shaded by the material.
export function angularRock(salt, big = true) {
  const g = new THREE.IcosahedronGeometry(1, big ? 1 : 0);
  const pos = g.attributes.position;
  const cuts = [];
  for (let i = 0; i < (big ? 5 : 3); i++) {
    const a = hash(salt, i) * TAU;
    const e = (hash(salt, i + 9) - 0.2) * 1.2;
    cuts.push([Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e), (big ? 0.55 : 0.6) + 0.22 * hash(salt, i + 4)]);
  }
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let p = seen.get(key);
    if (!p) {
      const k = 0.85 + 0.45 * hash(seen.size + 1, salt);
      p = [pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k];
      for (const [nx, ny, nz, d] of cuts) {
        const t = p[0] * nx + p[1] * ny + p[2] * nz - d;
        if (t > 0) { p[0] -= t * nx; p[1] -= t * ny; p[2] -= t * nz; }
      }
      p[1] = Math.max(p[1], -0.45) * 0.78;
      seen.set(key, p);
    }
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  g.computeVertexNormals();
  return g;
}
