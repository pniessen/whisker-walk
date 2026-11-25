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

// (Beauty round 2, bolder in round 3) A big bowl's terraced wall and central peak, painted flat (the heightfield's bowl is a smooth cosine; the shading is what reads as depth): on the
// far wall (the side away from the sun, where the sun lights it) three stepped lips, each a pale line over a dark one, a few dark slump streaks down the wall, and
// a small peak at the middle (a lit wedge on the sun's side, a shadowed one away from it, a dark moat of floor round the foot).
export function bigBowl(g, cx, cy, R, str = 1) {
  const a0 = Math.atan2(-SUN.z, -SUN.x); // the far wall's middle: away from the sun
  g.save();
  g.beginPath();
  g.arc(cx, cy, R * 0.98, 0, TAU);
  g.clip();
  g.lineCap = 'round';
  for (const [f, span, band] of [[0.52, 1.0, 0.13], [0.69, 1.15, 0.13], [0.85, 1.25, 0.13]]) { // each terrace: a broad lit tread below its lip, a dark riser, a pale lip
    g.strokeStyle = rgb(PAL.pale, 0.16 * str);
    g.lineWidth = Math.max(2, R * band);
    g.beginPath();
    g.arc(cx, cy, R * (f + band * 0.5), a0 - span, a0 + span);
    g.stroke();
    for (const [dy, col, al] of [[0, PAL.dark, 0.6], [-R * 0.022, PAL.pale, 0.75]]) {
      g.strokeStyle = rgb(col, al * str);
      g.lineWidth = Math.max(1, R * 0.04);
      g.beginPath();
      g.arc(cx + dy * SUN.x, cy + dy * SUN.z, R * f, a0 - span, a0 + span);
      g.stroke();
    }
  }
  for (let i = -3; i <= 3; i++) { // slump streaks: thin dark fans from the lip down the wall
    const a = a0 + i * 0.3 + (i & 1) * 0.07;
    const x0 = cx + Math.cos(a) * R * 0.95; const y0 = cy + Math.sin(a) * R * 0.95;
    const x1 = cx + Math.cos(a + 0.02 * i) * R * 0.58; const y1 = cy + Math.sin(a + 0.02 * i) * R * 0.58;
    const q = g.createLinearGradient(x0, y0, x1, y1);
    q.addColorStop(0, rgb(PAL.dark, 0.3 * str));
    q.addColorStop(1, rgb(PAL.dark, 0));
    g.strokeStyle = q;
    g.lineWidth = Math.max(1, R * 0.045);
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  soft(g, cx, cy, R * 0.24, PAL.floor, 0.45 * str); // the moat
  const pr = R * 0.13;
  soft(g, cx - SUN.x * pr * 0.6, cy - SUN.z * pr * 0.6, pr * 1.1, PAL.floor, 0.65 * str); // the shadowed side
  soft(g, cx + SUN.x * pr * 0.55, cy + SUN.z * pr * 0.55, pr * 0.95, PAL.ray, 0.75 * str); // the lit side
  g.restore();
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
    if (c.r >= 8) bigBowl(g, px(c.x), px(c.z), c.r * k, lite ? 0.8 : 1); // the two big bowls: terraces, slumps and a central peak
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
  // (beauty round 3) pebbles at her feet: each a pale lit pixel pair on the sun's side with a dark one on the other (the game's fixed sun), so the dust has relief close up
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rng() * S); const y = Math.floor(rng() * S); const w = 2 + (rng() < 0.2 ? 1 : 0);
    const dx = Math.round(-SUN.x * 1.4); const dy = Math.round(-SUN.z * 1.4);
    g.fillStyle = 'rgba(20,20,20,0.5)';
    g.fillRect(x + dx, y + dy, w, w);
    g.fillStyle = `rgba(${215 + (rng() * 30 | 0)},${215 + (rng() * 30 | 0)},${210 + (rng() * 30 | 0)},0.6)`;
    g.fillRect(x, y, w, w);
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
  rockTone(g, salt);
  return g;
}

// (beauty round 3) A rock's own tone, baked per facet into vertex colours (the material takes them with the instance's tint): the tops pale where the dust and the
// sun have settled, the flanks mid, the undersides and the foot dark, a wobble from facet to facet so no two faces match. A rock was one flat grey.
export const ROCK_TOP = 1.28;
export const ROCK_UNDER = 0.6;
export const ROCK_FLANK = 0.95;
export function rockFacetTone(ny, jitter) {
  const up = Math.max(-1, Math.min(1, ny));
  const t = up >= 0 ? ROCK_FLANK + (ROCK_TOP - ROCK_FLANK) * up ** 0.8 : ROCK_FLANK + (ROCK_UNDER - ROCK_FLANK) * Math.min(1, -up * 1.6);
  return t * (0.9 + 0.2 * jitter);
}
function rockTone(g, salt) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  for (let f = 0; f + 2 < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const v = rockFacetTone(n.y, hash(f, salt + 3));
    for (let k = 0; k < 3; k++) {
      const low = pos.getY(f + k) < -0.25 ? 0.85 : 1; // the foot: a little darker still, where it sits in its own shadow
      col[(f + k) * 3] = v * low * (n.y > 0.5 ? 1.02 : 1);
      col[(f + k) * 3 + 1] = v * low * (n.y > 0.5 ? 1.0 : 0.99);
      col[(f + k) * 3 + 2] = v * low * (n.y > 0.5 ? 0.97 : 1.01);
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// ---- dust on the buildings (beauty round 2) -------------------------------------------------------------------------

export const DUST_TINT = 0x8a8680; // the dust the buildings pick up: the regolith's own light, warm-neutral grey
export const DUST_REACH = 1.5; // m above the ground the kicked-up dust climbs
const _d = new THREE.Color(DUST_TINT);

// How much dust a surface point carries, 0..1: a veil on everything low (it climbs a metre off the ground, ragged), a fainter one settled on the tops (an up-facing face).
export function dustAmount(h, ny, x, z, reach = DUST_REACH, gain = 1) {
  const rag = 0.75 + 0.25 * Math.sin(x * 7.1 + z * 3.3) * Math.cos(z * 5.7 - x * 1.9); // streaks, not a ruler line
  const low = h < reach ? (1 - Math.max(0, h) / reach) ** 1.5 * 0.55 * rag * gain : 0;
  const top = ny > 0.6 ? 0.24 * ((ny - 0.6) / 0.4) * rag * Math.min(1, gain) : 0;
  return Math.min(0.75, low + top);
}

// Bakes that dust into a vertex-coloured geometry that is already in world coordinates (the Moon's kit is): the colour goes toward the dust by dustAmount.
// Pure on the geometry and the height function; no draw call, no texture.
export function dustGeometry(geo, groundY = P.moonY, { reach = DUST_REACH, gain = 1 } = {}) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  if (!pos || !nor || !col) return geo;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const z = pos.getZ(i);
    const k = dustAmount(pos.getY(i) - groundY(x, z), nor.getY(i), x, z, reach, gain);
    if (k <= 0) continue;
    col.setXYZ(i, col.getX(i) + (_d.r - col.getX(i)) * k, col.getY(i) + (_d.g - col.getY(i)) * k, col.getZ(i) + (_d.b - col.getZ(i)) * k);
  }
  col.needsUpdate = true;
  return geo;
}
