// =============================================================================
// SNOWVILLE: THE BEAUTY PASS'S DRAWING (milestone V8). Mid-height clutter and accent hues on top of the village, and the skyline: holly-and-snow shrub clumps (not solid, like
// the drifts), woodpiles and crates against the cottage walls, icicles at the eaves, a wreath on every door in its zone's hue, two strings of pennants between lamp posts (teal and
// gold in the gate court, red and cream in the square), and the far ridge. Everything goes into the kit's merged buckets (paint, and the ridge's own non-casting bucket): one new
// mesh. A seeded stream of its own, no clock, no Math.random, no visible text. The ground's extra tones are snowvillebeautyplan.js's, read per vertex by snowvilleparts.js.
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import * as BP from './snowvillebeautyplan.js';
import { mulberry32 } from '../rng.js';
import { COL, paint, stand, box, cyl, ball, laneDist, hot } from './snowvilleparts.js';
import { ST } from './snowvillestages.js';
import { POND } from './snowvilleplan.js';

const HOLLY = 0x3b6a52;
const BERRY = 0xd23a3a;

// ---- shrub clumps: a seeded stream, in open ground, off the lane, never in a zone's heart ------------------------------------------------
export const SHRUB_CLUMPS = 16;
export function scatterShrubs() {
  const rng = mulberry32(0x73687262);
  const out = [];
  let tries = 0;
  while (out.length < SHRUB_CLUMPS && tries++ < 6000) {
    const B = P.SNOWVILLE_BOUNDS;
    const x = B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    const n = 3 + Math.floor(rng() * 2);
    const yaw = rng() * 6.28;
    if (!P.clearOf(x, z, 1.8) || laneDist(x, z) < 3) continue;
    if (x > 17 && x < 30 && z > 4 && z < 30) continue; // the snowmobile's lawn (its ring and garage) stays clear of shrubs
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
    out.push({ x, z, n, yaw });
  }
  return out;
}

function putShrub(kit, M, x, z, s, i) {
  kit.put('paint', M.paint, paint(stand(ball(0.55 * s, 6, 4).scale(1.2, 0.8, 1.2).translate(0, 0.38 * s, 0), x, z, -0.05), HOLLY, Math.sin(i * 3.7)));
  kit.put('paint', M.paint, paint(stand(ball(0.5 * s, 6, 3).scale(1.25, 0.4, 1.25).translate(0, 0.68 * s, 0), x, z, -0.05), COL.snowBright), { noCast: true });
  for (let b = 0; b < 2; b++) {
    const a = b * 1.9 + i;
    kit.put('paint', M.paint, paint(stand(ball(0.06, 4, 3).translate(Math.cos(a) * 0.5 * s, 0.42 * s + (b % 2) * 0.12, Math.sin(a) * 0.5 * s), x, z, -0.05), BERRY), { noCast: true });
  }
}

// ---- things against the cottages (in each cottage's own frame: door on +z, the window on +x, so the woodpile takes the -x side) ---------------
function onCottage(kit, M, c, geo, hex, jit = 0, opts = {}) {
  kit.put('paint', M.paint, stand(paint(geo, hex, jit), c.x, c.z, -0.08, c.yaw), opts);
}
function woodpile(kit, M, c) {
  const x = -c.w / 2 - 0.55; const z = -c.d * 0.1;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    onCottage(kit, M, c, cyl(0.12, 0.12, 1.3, 6).rotateX(Math.PI / 2).translate(x + (row ? 0.12 : 0), 0.14 + row * 0.22, z - 0.65 + 0.26 * i + row * 0.13), COL.wood, Math.sin(i * 2 + row * 3 + c.x));
  }
  onCottage(kit, M, c, box(0.5, 0.12, 1.4).translate(x, 0.74, z), COL.snowBright, 0, { noCast: true });
}
function crates(kit, M, c) {
  const x = c.w * 0.36; const z = c.d / 2 + 0.55;
  onCottage(kit, M, c, box(0.62, 0.55, 0.62).translate(x, 0.275, z), COL.wood, Math.sin(c.z));
  onCottage(kit, M, c, box(0.5, 0.45, 0.5).rotateY(0.5).translate(x + 0.15, 0.78, z + 0.05), COL.woodDark);
  onCottage(kit, M, c, box(0.66, 0.1, 0.66).translate(x, 0.6, z), COL.snowBright, 0, { noCast: true });
  onCottage(kit, M, c, cyl(0.3, 0.3, 0.7, 8).translate(x - 0.85, 0.35, z - 0.05), 0x7a5438);
  onCottage(kit, M, c, cyl(0.28, 0.28, 0.08, 8).translate(x - 0.85, 0.72, z - 0.05), COL.snowBright, 0, { noCast: true });
}
function icicles(kit, M, c) {
  const n = Math.round(c.w * 1.6);
  for (let i = 0; i < n; i++) {
    const lx = -c.w / 2 - 0.1 + ((c.w + 0.2) * (i + 0.5)) / n;
    onCottage(kit, M, c, new THREE.ConeGeometry(0.04, 0.2 + 0.09 * ((i * 7) % 3), 4).rotateX(Math.PI).translate(lx, c.h - 0.05, c.d / 2 + 0.36), COL.ice, 0, { noCast: true });
  }
}
function wreath(kit, M, c) {
  onCottage(kit, M, c, new THREE.TorusGeometry(0.24, 0.06, 4, 8).translate(0, 1.2, c.d / 2 + 0.12), COL.fir, 0, { noCast: true });
  onCottage(kit, M, c, box(0.18, 0.12, 0.05).translate(0, 0.96, c.d / 2 + 0.14), BERRY, 0, { noCast: true });
}

// ---- pennants between two lamp posts -------------------------------------------------------------------------------------------------------
function segment(a, b, r, hex) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 3, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return paint(g, hex);
}
const BUNT_Y = 2.62;
function buntingAt(la, lb) {
  const ya = P.snowY(la.x, la.z) + BUNT_Y; const yb = P.snowY(lb.x, lb.z) + BUNT_Y;
  return (t) => new THREE.Vector3(la.x + (lb.x - la.x) * t, ya + (yb - ya) * t - 0.55 * 4 * t * (1 - t), la.z + (lb.z - la.z) * t);
}
function bunting(kit, M, la, lb, hues, n = 9) {
  const at = buntingAt(la, lb);
  for (let i = 0; i < n; i++) kit.put('paint', M.paint, segment(at(i / n), at((i + 1) / n), 0.012, COL.iron), { noCast: true });
  for (let i = 0; i < n - 1; i++) {
    const p = at((i + 0.5) / n);
    kit.put('paint', M.paint, paint(new THREE.ConeGeometry(0.13, 0.3, 3, 1).rotateX(Math.PI).translate(p.x, p.y - 0.15, p.z), hues[i % hues.length]), { noCast: true });
  }
}

// ---- the far ridge: one non-casting merged bucket --------------------------------------------------------------------------------------------
function peakGeometry(k) {
  const H = k.h + 2;
  const g = new THREE.ConeGeometry(k.r, H, k.seg, 3, true).toNonIndexed();
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(); const b = new THREE.Color();
  for (let v = 0; v < pos.count; v++) {
    const t = Math.max(0, Math.min(1, (pos.getY(v) + H / 2) / H)); // 0 at the foot .. 1 at the tip
    const lit = 0.5 + 0.5 * Math.sin(Math.atan2(pos.getX(v), pos.getZ(v)) + k.yaw); // one flank lighter than the other
    a.setHex(0x7f93b3).lerp(b.setHex(0xa9bbd6), lit * 0.6).lerp(b.setHex(0xf6f9ff), Math.max(0, Math.min(1, (t - 0.28) * 2.1)));
    col[v * 3] = a.r; col[v * 3 + 1] = a.g; col[v * 3 + 2] = a.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateY(k.yaw);
  g.translate(k.x, -1.5 + H / 2, k.z);
  return g;
}

// ---- BEAUTY PASS 1 (2026-11-28): colour and warmth on what is already there. All merged into the same buckets (no new mesh, no caster); the lite rungs skip the finest pieces. -------
const BULBS = [0xff6b5e, 0xffd45a, 0x6fd6a0, 0x7ab8ff, 0xff9ad0];
const FROST = 0xeaf6ff;
// A string of little coloured bulbs along each cottage's front eave: glow-coloured (no real light), sagging a hair between the hooks.
// Beauty pass 2: they are lit past 1 (bloom picks them up) and each has a twinkling halo (snowvillelight.js reads litSpots()).
const toWorld = (c, lx, ly, lz) => { const s = Math.sin(c.yaw); const co = Math.cos(c.yaw); const x = c.x + lx * co + lz * s; const z = c.z - lx * s + lz * co; return [x, P.snowY(c.x, c.z) - 0.08 + ly, z]; };
function eaveSpots(c) {
  const n = Math.round(c.w * 1.6);
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const lx = -c.w / 2 + 0.1 + (c.w - 0.2) * u;
    const sag = 0.12 * Math.sin(Math.PI * ((i % 4) / 3 + 0.0)) * 0.6;
    out.push({ lx, ly: c.h - 0.2 - sag, lz: c.d / 2 + 0.5, hex: BULBS[(i + Math.round(c.x)) % BULBS.length] });
  }
  return out;
}
function eaveLights(kit, M, c) {
  for (const b of eaveSpots(c)) {
    kit.put('glow', M.glow, stand(hot(paint(new THREE.OctahedronGeometry(0.07, 0).translate(b.lx, b.ly, b.lz), b.hex), 1.9), c.x, c.z, -0.08, c.yaw), { noCast: true });
  }
}
// Frost in the top corners of each front window, a holly-and-berry planter on the left sill, a red bow on the wreath and holly on the lintel.
function cottageExtras(kit, M, c, low) {
  const put = (geo, hex) => kit.put('paint', M.paint, stand(paint(geo, hex), c.x, c.z, -0.08, c.yaw), { noCast: true });
  const wy = c.h * 0.55; const fz = c.d / 2 + 0.056;
  for (const sx of [-1, 1]) {
    const wx = sx * c.w * 0.32;
    for (const k of [-1, 1]) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([k * 0.35, 0.31, 0, k * 0.35 - k * 0.2, 0.31, 0, k * 0.35, 0.31 - 0.17, 0], 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
      if (k > 0) g.setIndex([0, 1, 2]); else g.setIndex([0, 2, 1]);
      put(g.translate(wx, wy, fz), FROST);
    }
  }
  if (low) return;
  const px = -c.w * 0.32; const py = wy - 0.4 + 0.12; const pz = c.d / 2 + 0.12;
  put(box(0.8, 0.12, 0.17).translate(px, py, pz), COL.woodDark);
  for (let i = 0; i < 3; i++) put(new THREE.OctahedronGeometry(0.1, 0).scale(1, 0.8, 1).translate(px - 0.26 + i * 0.26, py + 0.1, pz), i === 1 ? 0xe9f3ff : HOLLY);
  put(new THREE.TetrahedronGeometry(0.045, 0).translate(px - 0.13, py + 0.2, pz + 0.04), BERRY);
  put(new THREE.TetrahedronGeometry(0.045, 0).translate(px + 0.13, py + 0.2, pz + 0.04), BERRY);
  // the wreath's bow
  put(new THREE.ConeGeometry(0.07, 0.2, 3).rotateZ(Math.PI / 2).translate(-0.12, 1.47, c.d / 2 + 0.16), BERRY);
  put(new THREE.ConeGeometry(0.07, 0.2, 3).rotateZ(-Math.PI / 2).translate(0.12, 1.47, c.d / 2 + 0.16), BERRY);
  put(new THREE.OctahedronGeometry(0.05, 0).translate(0, 1.47, c.d / 2 + 0.17), 0xf2c14e);
  // holly and berries heaped on the snow of the lintel
  for (const sx of [-0.45, 0.45]) {
    for (const o of [-0.1, 0.1]) put(new THREE.OctahedronGeometry(0.08, 0).scale(1.2, 0.8, 1).translate(sx + o, 1.97, c.d / 2 + 0.3), HOLLY);
    put(new THREE.TetrahedronGeometry(0.04, 0).translate(sx, 2.02, c.d / 2 + 0.34), BERRY);
  }
}
// A few pairs of skates left on the snow round the pond (one boot, its blade, a snow cap), where nothing else stands.
function skatesAbout(kit, M) {
  const hard = [...P.snowvilleColliders(), ...(ST.b?.colliders?.() ?? [])];
  let pairs = 0;
  for (let i = 0; i < 14 && pairs < 4; i++) {
    const a = 0.35 + i * 0.62;
    const r = 9.6 + (i % 2) * 0.5;
    const x = POND.x + Math.cos(a) * r; const z = POND.z + Math.sin(a) * r;
    if (hard.some((h) => (h.r != null ? Math.hypot(x - h.x, z - h.z) < h.r + 0.7 : false))) continue;
    if (!P.clearOf(x, z, -0.5)) continue;
    pairs++;
    const put = (geo, hex, jit = 0) => kit.put('paint', M.paint, paint(stand(geo, x, z, 0.0, a * 2), hex, jit), { noCast: true });
    for (const s of [-1, 1]) {
      put(box(0.1, 0.1, 0.26).translate(s * 0.09, 0.1, 0), i % 2 ? 0xc8483f : 0x2f8f8a);
      put(box(0.09, 0.14, 0.09).translate(s * 0.09, 0.2, -0.08), i % 2 ? 0xc8483f : 0x2f8f8a);
      put(box(0.02, 0.035, 0.32).translate(s * 0.09, 0.025, 0), 0xc9d3e0);
      put(box(0.11, 0.025, 0.26).translate(s * 0.09, 0.17, 0.0), COL.snowBright);
    }
  }
}

// ---- BEAUTY PASS 2 (2026-11-28): light and colour. The village fir wears a spiral garland and presents at its foot, eight firs about the village are strung with coloured lights, the two pennant strings and the lamp
// posts carry lit bulbs, and every lit thing has a twinkling halo (the halo layer is a Points in snowvillelight.js, which reads litSpots(): one list for the bulbs drawn here and the halos). ------------
const FIR_LIGHT_HUES = [0xff5a4e, 0xffd24a, 0x62e0a0, 0x6cb4ff, 0xff8ad0];
const jigf = (i, n) => { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); }; // snowvilleparts.js's jig (each fir's own width and height)
let _strung = null;
// The firs strung with lights: the nearest eight of the village's own firs (not the wood's rim), with each bulb's place on the tier cones (in the fir's frame: scaled, turned, stood).
export function stringFirs() {
  if (_strung) return _strung;
  const all = P.scatterFirs();
  const picks = all.map((k, i) => ({ k, i })).filter(({ k }) => !k.rim && Math.hypot(k.x + 2, k.z - 12) < 30 && Math.hypot(k.x - P.SQUARE_FIR.x, k.z - P.SQUARE_FIR.z) > 3)
    .sort((a, b) => Math.hypot(a.k.x + 2, a.k.z - 12) - Math.hypot(b.k.x + 2, b.k.z - 12)).slice(0, 8);
  _strung = picks.map(({ k, i }) => {
    const wf = 0.78 + 0.5 * jigf(i, 1); const hf = 0.88 + 0.3 * jigf(i, 2);
    const H = 4.5 * k.s; const out = [];
    for (let t = 0; t < k.tiers; t++) {
      const f = t / k.tiers; const r = (1.55 - 1.1 * f) * k.s; const h = H * (0.42 - 0.06 * f); const y = H * (0.18 + 0.68 * f);
      const n = 7 - t;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + t * 1.1; const kk = 0.1 + 0.16 * ((j * 5 + t) % 3) / 2;
        const lx = Math.cos(a) * r * (1 - kk) * 1.04 * wf; const lz = Math.sin(a) * r * (1 - kk) * 1.04 * wf; const ly = (y + kk * h) * hf;
        const ry = k.x * 7; // geo.rotateY(ry)
        const x = lx * Math.cos(ry) + lz * Math.sin(ry); const z = -lx * Math.sin(ry) + lz * Math.cos(ry);
        out.push({ x: k.x + x, z: k.z + z, y: P.snowY(k.x, k.z) - 0.1 + ly, hex: FIR_LIGHT_HUES[(j + t + i) % FIR_LIGHT_HUES.length], r: 0.075 });
      }
    }
    return out;
  }).flat();
  return _strung;
}
// The village fir's garland: a spiral up from low to the star, plus the baubles' own places (for their halos).
export function gardenFir() {
  const F = P.SQUARE_FIR; const sc = F.h / 4.5; const out = [];
  for (let n = 0; n < 40; n++) {
    const f = n / 39; const a = n * 0.95;
    const r = (1.5 - 1.1 * (0.1 + 0.78 * f)) * sc * 0.95;
    out.push({ x: F.x + Math.cos(a) * r, z: F.z + Math.sin(a) * r, y: P.snowY(F.x, F.z) + F.h * (0.2 + 0.66 * f), hex: n % 2 ? 0xffe28a : 0xfff4d0, r: 0.065 });
  }
  return out;
}
function strungSpots() {
  const out = [...stringFirs(), ...gardenFir()];
  const L = P.LAMPS;
  for (const [la, lb] of [[L[0], L[1]], [L[2], L[3]]]) {
    const at = buntingAt(la, lb);
    for (let i = 1; i < 9; i++) { const p = at(i / 9); out.push({ x: p.x, z: p.z, y: p.y - 0.04, hex: FIR_LIGHT_HUES[i % FIR_LIGHT_HUES.length], r: 0.05 }); }
  }
  return out;
}
// Presents round the village fir's foot (small, non-solid: nothing to stand on, no collider).
export function presents() {
  const F = P.SQUARE_FIR;
  return [[0.9, 0.3, 0.5, 0xc8483f], [1.3, -0.4, 0.4, 0x2f8f8a], [-0.2, 1.2, 0.45, 0xf2c14e], [-1.1, 0.8, 0.5, 0x6a4a9a]].map(([dx, dz, s, hex], i) => ({ x: F.x + dx * 1.25, z: F.z + dz * 1.25, s, hex, a: i * 0.7 }));
}

// Where each cottage's door and wreath are, in the world (beauty pass 3: she jingles the bells there). Pure.
export const toDoors = () => P.COTTAGES.map((c) => { const w = toWorld(c, 0, 1.2, c.d / 2 + 0.6); return { x: w[0], z: w[2] }; });

// Every lit thing's halo: { x, y, z, hex, big (a window or lamp glow, else a bulb), ph (its own twinkle phase) }, in world coordinates. Pure; no clock.
let _spots = null;
export function litSpots() {
  if (_spots) return _spots;
  const out = [];
  const add = (x, y, z, hex, big, i) => out.push({ x, y, z, hex, big, ph: jigf(i, 7) });
  let n = 0;
  for (const c of P.COTTAGES) {
    for (const b of eaveSpots(c)) { const w = toWorld(c, b.lx, b.ly, b.lz); add(w[0], w[1], w[2], b.hex, false, n++); }
    for (const sx of [-1, 1]) { const w = toWorld(c, sx * c.w * 0.32, c.h * 0.55, c.d / 2 + 0.12); add(w[0], w[1], w[2], 0xffa850, true, n++); }
    const w = toWorld(c, c.w / 2 + 0.12, c.h * 0.55, 0); add(w[0], w[1], w[2], 0xffa850, true, n++);
  }
  for (const sp of strungSpots()) add(sp.x, sp.y, sp.z, sp.hex, false, n++);
  for (const l of P.LAMPS) add(l.x, P.snowY(l.x, l.z) + 2.75, l.z, 0xffc070, true, n++);
  add(P.SQUARE_FIR.x, P.snowY(P.SQUARE_FIR.x, P.SQUARE_FIR.z) + P.SQUARE_FIR.h + 0.12, P.SQUARE_FIR.z, 0xffd45a, true, n++);
  _spots = out;
  return out;
}

export function drawBeauty(kit, M, { low = false } = {}) {
  scatterShrubs().forEach((k, ci) => {
    for (let i = 0; i < k.n; i++) {
      const a = k.yaw + i * 2.2;
      putShrub(kit, M, k.x + Math.cos(a) * 0.55 * i, k.z + Math.sin(a) * 0.55 * i, 0.9 + 0.25 * ((i + ci) % 3), ci * 5 + i);
    }
  });
  const by = (id) => P.COTTAGES.find((c) => c.id === id);
  for (const id of ['west2', 'north1', 'east1', 'baker']) woodpile(kit, M, by(id));
  for (const id of ['baker', 'gate1', 'gate2', 'west1']) crates(kit, M, by(id));
  for (const c of P.COTTAGES) { icicles(kit, M, c); wreath(kit, M, c); }
  for (const c of P.COTTAGES) { cottageExtras(kit, M, c, low); if (!low) eaveLights(kit, M, c); }
  skatesAbout(kit, M);
  const L = P.LAMPS;
  bunting(kit, M, L[0], L[1], [0x2f8f8a, 0xf2c14e]);
  bunting(kit, M, L[2], L[3], [0xc8483f, 0xf4ecd8]);
  for (const sp of strungSpots()) kit.put('glow', M.glow, hot(paint(new THREE.TetrahedronGeometry(sp.r, 0).translate(sp.x, sp.y, sp.z), sp.hex), 1.9), { noCast: true });
  if (!low) for (const g of presents()) kit.put('paint', M.paint, stand(paint(box(g.s, g.s * 0.8, g.s).rotateY(g.a), g.hex), g.x, g.z, g.s * 0.4 - 0.05), { noCast: true });
  for (const k of BP.ridgePeaks()) kit.put('ridge', M.paint, peakGeometry(k), { noCast: true });
}
