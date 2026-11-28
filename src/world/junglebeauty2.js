// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 2 (2026-11-28), bold at play distance. Pass 1's fine detail was hard to see from the walk's camera, so this pass is big and saturated:
//   * STILL pieces (the same non-casting paint / glow buckets as pass 1; no mesh, no collider, no word): flowering shrubs with big cup blooms in hot pink, scarlet, orange, violet and
//     sun yellow; six paper lanterns along the veranda; two carved, painted totems at the lodge's front corners; glowing mushrooms beside the paths.
//   * SWAYING pieces (ONE unlit mesh, rewritten on the CPU each frame): hanging flowering vines under the tree crowns, big blossoms on the crowns, giant leaves by the paths, cloth banners
//     on the veranda beam, and a flock of bright birds that crosses the sky in front of her every so often. Every piece has its own phase, reach and beat, all leaning with a slow gust.
//   * LIGHT (ONE additive mesh): golden sun shafts through the canopy with a pool of light where each lands; and ONE Points of soft blobs: dust turning in the shafts, lantern halos,
//     mushroom glows and sparkles on the river. Each point has its own size (a patched PointsMaterial).
//   * SOUND (the walk's own audio, silent when muted): crickets and a bed of distant bird calls in the dry; a second, softer layer of leaf-drip in the rain (the critters' patter and calls
//     are reused).
// Three meshes in all, none casting, so the place's 31-mesh / 4-caster frame is unchanged. Its own seeded streams: every existing layout stays put. Draws no random number at run time and
// reads no clock (time arrives as `t`). Reduced motion: everything holds still (no flock, no gust, no twinkle). The lower rungs keep fewer pieces; LITE shows no shafts and no flock.
// =============================================================================
import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import * as P from './jungleplan.js';
import { COL, paint, pad, dotTexture } from './jungleparts.js';
import { rungOf, sparklePlan } from './junglesparkle.js';
import { callNote, patterNote, croakNote } from './junglecritters.js';
import { topHalf, tri3, seasonOf, SEASON, surpriseAt, bloomAt, bloomRamp, bloomSpots, spiralAt } from './junglebeauty4.js';
import { dayAt, brush, brushOffset, createPool, REACT, RIPPLE, PETALS, DAY } from './junglereact.js';
const SURPRISE_DUR = { spiral: 15, monkeys: 10 };

const TAU = Math.PI * 2;
export const B2 = Object.freeze({
  vines: Object.freeze({ high: 30, low: 18, lite: 10 }),
  canopy: Object.freeze({ high: 34, low: 20, lite: 10 }),
  leaves: Object.freeze({ high: 30, low: 20, lite: 12 }),
  shafts: Object.freeze({ high: 9, low: 5, lite: 0 }),
  dust: Object.freeze({ high: 7, low: 4, lite: 0 }), // per shaft
  glints: Object.freeze({ high: 34, low: 20, lite: 10 }),
  flock: Object.freeze({ high: 8, low: 6, lite: 0 }),
  shrubs: 13, mushrooms: 15, banners: 4,
});
export const HOT = Object.freeze([0xff2d7a, 0xff7a1a, 0xffd21a, 0xb04aff, 0xff3b30, 0x1ed2e8, 0xff5fd0]); // the saturated blossom palette
const PALMS = Object.freeze([COL.leafLight, 0x58c040, 0x2f9a4a, 0x8ad040]);
const BIRDS = Object.freeze([[0xff3020, 0x2060ff], [0xffd020, 0x20a0ff], [0x20c040, 0xff4030], [0xff7020, 0x30c0ff]]); // wing, tip
const FLOCK = Object.freeze({ gap: 22, first: 5, ahead: 15, high: 7.5, span: 60, speed: 6.5 });
export const SHAFT = Object.freeze({ top: 12, opacity: 0.2, lean: Object.freeze([0.3, 0.14]), sides: 5 });

const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- the plan (pure, seeded) ------------------------------------------------------------------------------------------------------------
const trunkTop = (k) => (P.TREE_SHAPES[k.shape]?.[0] ?? 5) * (k.tall ?? 1) * k.s;
/** { vines, canopy, leaves, shrubs, shafts, mushrooms, lanterns, glints } — every list is the full ('high') count; the lower rungs keep a prefix. */
export function beauty2Plan() {
  const solid = P.jungleColliders();
  const free = (x, z, m) => P.clearOf(x, z, m) && !solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + m);
  const rng = mulberry32(0x62323232); // 'b222'
  const trees = P.scatterTrees().filter((k) => !k.rim);
  const crowned = trees.filter((k) => k.kind !== 'palm' && k.shape !== 'snag');
  const vines = [];
  for (let i = 0; vines.length < B2.vines.high && i < 600; i++) {
    const k = crowned[i % crowned.length];
    const a = rng() * TAU; const r = (1.0 + rng() * 1.1) * k.s;
    const y0 = trunkTop(k) * (0.9 + rng() * 0.08);
    const len = Math.min(y0 - 0.7, 2.2 + rng() * 1.6);
    vines.push({ x: k.x + Math.cos(a) * r, z: k.z + Math.sin(a) * r, y0, len, pal: Math.floor(rng() * HOT.length), n: 4 + Math.floor(rng() * 3), ph: rng() * TAU, amp: 0.12 + rng() * 0.16, w: 0.7 + rng() * 0.6, yaw: rng() * TAU });
  }
  const canopy = [];
  for (let i = 0; canopy.length < B2.canopy.high && i < 600; i++) {
    const k = crowned[(i * 7) % crowned.length];
    const a = rng() * TAU; const r = (0.9 + rng() * 1.6) * k.s;
    canopy.push({ x: k.x + Math.cos(a) * r, z: k.z + Math.sin(a) * r, y: trunkTop(k) + (0.5 + rng() * 1.4) * k.s, r: 0.75 + rng() * 0.45, pal: Math.floor(rng() * HOT.length), ph: rng() * TAU, w: 0.5 + rng() * 0.5, amp: 0.05 + rng() * 0.05 });
  }
  const leaves = [];
  const B = P.JUNGLE_BOUNDS;
  for (let tries = 0; leaves.length < B2.leaves.high && tries++ < 4000;) {
    const near = rng() < 0.5; // half beside the way from the stone ring to the lodge, where she walks
    const x = near ? -14 + rng() * 22 : B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = near ? 20 + rng() * 14 : B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (!free(x, z, 0.9) || leaves.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2)) continue;
    leaves.push({ x, z, yaw: rng() * TAU, len: 1.2 + rng() * 0.7, wide: 0.34 + rng() * 0.16, tone: Math.floor(rng() * PALMS.length), ph: rng() * TAU, w: 0.8 + rng() * 0.7, amp: 0.1 + rng() * 0.1 });
  }
  const shrubs = [];
  for (let tries = 0; shrubs.length < B2.shrubs && tries++ < 4000;) {
    const near = rng() < 0.6; // most beside the way from the ring to the lodge
    const x = near ? -13 + rng() * 22 : B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = near ? 20 + rng() * 14 : B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (!free(x, z, 1.4) || shrubs.some((o) => Math.hypot(o.x - x, o.z - z) < 4.5) || leaves.some((o) => Math.hypot(o.x - x, o.z - z) < 1.6)) continue;
    shrubs.push({ x, z, pal: Math.floor(rng() * HOT.length), s: 0.9 + rng() * 0.5, yaw: rng() * TAU });
  }
  const shafts = [];
  for (let tries = 0; shafts.length < B2.shafts.high && tries++ < 4000;) {
    const near = rng() < 0.6; // most over the way she walks first
    const x = near ? -12 + rng() * 22 : B.minX + 6 + rng() * (B.maxX - B.minX - 12);
    const z = near ? 14 + rng() * 22 : B.minZ + 6 + rng() * (B.maxZ - B.minZ - 12);
    if (!free(x, z, 1.8) || Math.hypot(x - P.RING.x, z - P.RING.z) < 9.5 || shafts.some((o) => Math.hypot(o.x - x, o.z - z) < 6)) continue;
    shafts.push({ x, z, rTop: 0.7 + rng() * 0.5, rBot: 1.2 + rng() * 0.8, bright: 0.65 + rng() * 0.35, ph: rng() * TAU, dust: Array.from({ length: B2.dust.high }, () => ({ u: rng(), a: rng() * TAU, d: rng(), ph: rng() * TAU })) });
  }
  const mushrooms = [];
  const caps = [0x35f0d0, 0xff5fd0, 0xffc030, 0x6aa0ff];
  // small decor may stand nearer the story spots than a prop may (it is not solid): only the solid things, the river and the lodge's own footprint keep it off
  const L = P.LODGE;
  const loose = (x, z, m) => !solid.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + m) && P.riverDist(x, z) > P.RIVER_W + 0.6
    && !(x > L.x0 - 1.2 && x < L.x1 + 1.2 && z > L.z0 - 1.2 && z < L.z1 + 3.2) && x > B.minX + 3 && x < B.maxX - 3 && z > B.minZ + 3 && z < B.maxZ - 3;
  for (let tries = 0; mushrooms.length < B2.mushrooms && tries++ < 4000;) {
    const near = rng() < 0.65; // most along the way between the ring and the veranda steps
    const t = rng(); const side = rng() < 0.5 ? -1 : 1;
    const x = near ? 0 + (-6 - 0) * t + side * (2.2 + rng() * 2.2) : B.minX + 4 + rng() * (B.maxX - B.minX - 8);
    const z = near ? 31 + (22.5 - 31) * t : B.minZ + 4 + rng() * (B.maxZ - B.minZ - 8);
    if (!loose(x, z, 0.5) || mushrooms.some((o) => Math.hypot(o.x - x, o.z - z) < 2.2)) continue;
    mushrooms.push({ x, z, hex: caps[mushrooms.length % caps.length], n: 3, yaw: rng() * TAU, ph: rng() * TAU });
  }
  const posts = P.LODGE_POSTS;
  const lanterns = [-10.4, -9.0, -7.0, -5.0, -3.0, -1.6].map((x, i) => ({ x, z: P.LODGE.z1 - 0.1, y: P.LODGE_WALL.top - 0.75 - (i % 2) * 0.18, hex: [0xff6a2a, 0xffc22a, 0xff3d7a, 0xffc22a, 0xff6a2a, 0xff3d7a][i], ph: i * 1.7 }));
  const glints = [];
  const path = P.RIVER_PATH;
  for (let i = 0; i < B2.glints.high; i++) {
    const f = rng() * (path.length - 1); const j = Math.min(path.length - 2, Math.floor(f)); const u = f - j;
    const x = path[j][0] + (path[j + 1][0] - path[j][0]) * u; const z = path[j][1] + (path[j + 1][1] - path[j][1]) * u + (rng() * 2 - 1) * P.RIVER_W * 0.7;
    glints.push({ x, z, ph: rng() * TAU, w: 1.5 + rng() * 2 });
  }
  void posts;
  return { vines, canopy, leaves, shrubs, shafts, mushrooms, lanterns, glints };
}

// ---- the still pieces (stage b's soft buckets) ----------------------------------------------------------------------------------------------
/** [geometry, hex, jitter, bucket] — bucket 'paint' (lit) or 'glow' (unlit). Pure; the tests count them. */
export function beauty2Parts() {
  const out = [];
  const gy = P.jungleY;
  const { shrubs, mushrooms, lanterns } = beauty2Plan();
  // flowering shrubs: a low green mound and eight big cup blooms (open cones, seven sides) with a gold heart
  shrubs.forEach((s, si) => {
    const r = 1.0 * s.s;
    out.push([topHalf(new THREE.OctahedronGeometry(r, 0).scale(1.2, 0.7, 1.2)).translate(s.x, gy(s.x, s.z) + 0.4 * s.s, s.z), si % 2 ? COL.leaf : COL.leafDeep, si, 'paint']);
    for (let i = 0; i < 8; i++) {
      const a = s.yaw + i * 2.4; const d = r * (0.2 + 0.85 * ((i * 5) % 8) / 8);
      const x = s.x + Math.cos(a) * d * 1.1; const z = s.z + Math.sin(a) * d * 1.1;
      const y = gy(s.x, s.z) + 0.35 * s.s + (0.58 * s.s) * (1 - (d / (r * 1.2)) ** 2) + 0.12;
      const hex = i % 3 === 2 ? HOT[(s.pal + 3) % HOT.length] : HOT[s.pal];
      out.push([new THREE.ConeGeometry(0.42 * s.s, 0.26, 7, 1, true).rotateX(Math.PI).rotateZ(0.2 * Math.sin(a)).translate(x, y, z), hex, i, 'paint']);
      out.push([pad(5).scale(0.13, 1, 0.13).translate(x, y + 0.02, z), 0xffe040, 0, 'paint']);
    }
  });
  // glowing mushrooms: a cream stem, a bright cap (unlit: it reads as glowing) and a paler spot
  mushrooms.forEach((m, mi) => {
    for (let i = 0; i < m.n; i++) {
      const a = m.yaw + i * 2.2; const d = i ? 0.3 : 0;
      const x = m.x + Math.cos(a) * d; const z = m.z + Math.sin(a) * d; const h = (i ? 0.2 : 0.32) + (mi % 3) * 0.03;
      out.push([new THREE.ConeGeometry(0.035, h, 4, 1, true).translate(x, gy(x, z) + h / 2, z), 0xe8dcc0, 0, 'paint']);
      out.push([topHalf(new THREE.OctahedronGeometry(i ? 0.14 : 0.2, 0).scale(1, 0.55, 1)).translate(x, gy(x, z) + h + 0.02, z), m.hex, 0, 'glow']);
    }
  });
  // paper lanterns hung along the veranda beam: a rope, a cap, the glowing body (an eight-sided diamond) and a tassel
  const top = P.LODGE_WALL.top - 0.4;
  lanterns.forEach((l, i) => {
    out.push([new THREE.CylinderGeometry(0.012, 0.012, top - l.y - 0.2, 3, 1, true).translate(l.x, (top + l.y + 0.2) / 2, l.z), COL.rope, 0, 'paint']);
    out.push([new THREE.ConeGeometry(0.1, 0.08, 4).translate(l.x, l.y + 0.26, l.z), 0x6a4a2e, 0, 'paint']);
    out.push([new THREE.OctahedronGeometry(0.32, 0).scale(1, 1.3, 1).translate(l.x, l.y, l.z), l.hex, 0, 'glow']);
    out.push([new THREE.ConeGeometry(0.03, 0.2, 3, 1, true).rotateX(Math.PI).translate(l.x, l.y - 0.4, l.z), i % 2 ? 0xffe040 : 0xff3d7a, 0, 'paint']);
  });
  // two carved totems at the lodge's front corners: a post of three stacked blocks (a bird, a face, a snake), painted in the bold colours, with eyes, a beak and spread wings
  for (const [tx, tz, flip] of [[-12.4, 19.7, 1], [0.5, 19.7, -1]]) {
    const y0 = gy(tx, tz); const S = (g, hex, j = 0) => out.push([g.translate(tx, y0, tz), hex, j, 'paint']);
    const box = (w, h, d, y) => new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
    S(box(0.55, 0.7, 0.55, 0.35), 0x2f9a9a); // the foot: a teal snake
    S(box(0.58, 0.7, 0.58, 1.05), 0xe8402c); // a scarlet face
    S(box(0.55, 0.7, 0.55, 1.75), 0xffc22a); // a yellow bird
    // pass 4: the scarlet face is a cat's: green eyes with slit pupils, a pink nose, whiskers and two pointed ears (same box count; the mouth's box became a nose and six whisker slivers)
    S(box(0.16, 0.12, 0.04, 1.2).translate(-0.14, 0, 0.3), 0xd8f040); S(box(0.16, 0.12, 0.04, 1.2).translate(0.14, 0, 0.3), 0xd8f040);
    S(box(0.03, 0.11, 0.05, 1.2).translate(-0.14, 0, 0.33), 0x1a1a1a); S(box(0.03, 0.11, 0.05, 1.2).translate(0.14, 0, 0.33), 0x1a1a1a);
    const tr = (a, b, c) => tri3(a, b, c, [0, 0, 1]);
    S(tr([-0.05, 1.05, 0.32], [0.05, 1.05, 0.32], [0, 0.98, 0.32]), 0xff9ab0);
    for (const sx of [-1, 1]) for (const dy of [0.04, 0, -0.04]) S(tr([sx * 0.1, 0.99 + dy, 0.31], [sx * 0.3, 0.99 + dy * 2.2, 0.31], [sx * 0.1, 0.995 + dy, 0.31]), 0xfff4e0);
    for (const sx of [-1, 1]) S(new THREE.ConeGeometry(0.13, 0.26, 4, 1, true).rotateZ(-sx * 0.3).translate(sx * 0.2, 1.52, 0.02), 0xe8402c);
    S(new THREE.ConeGeometry(0.1, 0.34, 4).rotateX(Math.PI / 2).translate(0, 1.78, 0.42), 0xff7a1a); // the beak
    S(box(0.14, 0.12, 0.04, 1.86).translate(-0.14, 0, 0.29), 0x1a1a1a); S(box(0.14, 0.12, 0.04, 1.86).translate(0.14, 0, 0.29), 0x1a1a1a);
    for (const sx of [-1, 1]) S(new THREE.BoxGeometry(0.62, 0.05, 0.3).rotateZ(sx * 0.4).translate(sx * 0.55, 1.75, 0), 0xff3d7a); // spread wings
    S(new THREE.ConeGeometry(0.3, 0.5, 4).translate(0, 2.35, 0).rotateY(0.78), 0x3a8a3e); // a leafy crest
    void flip;
  }
  return out;
}

export function drawBeauty2(kit, M) {
  for (const [geo, hex, j, bucket] of beauty2Parts()) kit.put(bucket, M[bucket], paint(geo, hex, j), { noCast: true });
}

// ---- the swaying pieces: a soup of coloured triangles, each vertex with a piece and a weight (how far it moves with the piece) -------------------------
class Soup {
  constructor() { this.pos = []; this.col = []; this.wgt = []; this.pid = []; this.pieces = []; }
  piece(p) { this.pieces.push(p); return this.pieces.length - 1; }
  v(x, y, z, hex, w, id, shade = 1) { const c = _c.setHex(hex); this.pos.push(x, y, z); this.col.push(c.r * shade, c.g * shade, c.b * shade); this.wgt.push(w); this.pid.push(id); }
  tri(a, b, c, hex, id, shade = [1, 1, 1]) { [a, b, c].forEach((p, i) => this.v(p[0], p[1], p[2], hex, p[3] ?? 0, id, shade[i])); }
  // an eight-sided diamond (octahedron) of radius r at (x, y, z), tall `h`, all of weight w, lighter at the tip
  blob(x, y, z, r, h, hex, w, id) {
    const T = [x, y + h, z, w]; const Bm = [x, y - h * 0.7, z, w];
    const R = [[x + r, y, z, w], [x, y, z + r, w], [x - r, y, z, w], [x, y, z - r, w]];
    for (let i = 0; i < 4; i++) { this.tri(T, R[i], R[(i + 1) % 4], hex, id, [1.25, 1, 1]); this.tri(Bm, R[(i + 1) % 4], R[i], hex, id, [0.7, 0.9, 0.9]); }
  }
  // a hanging ribbon from (x, y0, z) down `len`, `segs` segments, `wd` wide at the top narrowing a little, turned `yaw`; weight t^1.3 down its length
  ribbon(x, y0, z, len, wd, segs, yaw, hexOf, id, taper = 0.45) {
    const sx = Math.cos(yaw); const sz = Math.sin(yaw);
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs; const t1 = (i + 1) / segs; const w0 = (wd / 2) * (1 - taper * t0); const w1 = (wd / 2) * (1 - taper * t1);
      const a = [x - sx * w0, y0 - len * t0, z - sz * w0, t0 ** 1.3]; const b = [x + sx * w0, y0 - len * t0, z + sz * w0, t0 ** 1.3];
      const c = [x - sx * w1, y0 - len * t1, z - sz * w1, t1 ** 1.3]; const d = [x + sx * w1, y0 - len * t1, z + sz * w1, t1 ** 1.3];
      const hex = hexOf(i);
      this.tri(a, b, c, hex, id, [1, 1, 0.85]); this.tri(b, d, c, hex, id, [1, 0.85, 0.85]);
    }
  }
}
const _c = new THREE.Color();

/** The swaying soup of a rung: pieces [{ ax, az, amp, w, ph }]; vertices carry piece and weight. Pure. */
export function swayParts(rung = 'high') {
  const plan = beauty2Plan();
  const S = new Soup();
  const wind = { x: 0.8, z: 0.55 };
  const mk = (ph, w, amp, lean, cx, cz, push = 0) => S.piece({ ph, w, amp, lean, cx, cz, push }); // cx, cz, push: where it stands and how far she can part it (pass 3)
  const gy = P.jungleY;
  plan.vines.slice(0, B2.vines[rung]).forEach((v, i) => {
    const id = mk(v.ph, v.w, v.amp, 0.06, v.x, v.z, REACT.vinePush);
    const gyv = gy(v.x, v.z);
    const top = Math.max(gyv + 0.9 + v.len, v.y0);
    const y0 = Math.min(v.y0, top);
    S.ribbon(v.x, y0, v.z, v.len, 0.22, 5, v.yaw, (k) => (k % 2 ? 0x3fa83a : 0x2f8a34), id, 0.5);
    for (let k = 1; k <= v.n; k++) { // leaf pairs and blossoms down the vine, the biggest at the end
      const t = k / (v.n + 0.4); const y = y0 - v.len * t; const w = t ** 1.3; const big = k === v.n;
      const lx = Math.cos(v.yaw); const lz = Math.sin(v.yaw);
      S.tri([v.x, y, v.z, w], [v.x + lx * 0.3, y - 0.1, v.z + lz * 0.3, w], [v.x + lx * 0.12, y - 0.24, v.z + lz * 0.12, w], 0x58c040, id, [1, 0.8, 0.8]);
      S.blob(v.x + lz * 0.08, y - 0.05, v.z - lx * 0.08, big ? 0.42 : 0.26 + 0.03 * (k % 2), big ? 0.44 : 0.3, HOT[(v.pal + k * 2) % HOT.length], w, id);
    }
  });
  plan.canopy.slice(0, B2.canopy[rung]).forEach((c) => {
    const id = mk(c.ph, c.w, c.amp, 0.02);
    S.blob(c.x, c.y, c.z, c.r, c.r * 0.7, HOT[c.pal], 1, id);
    S.blob(c.x + c.r * 0.7, c.y - 0.2, c.z + c.r * 0.3, c.r * 0.7, c.r * 0.55, HOT[(c.pal + 2) % HOT.length], 1, id);
  });
  plan.leaves.slice(0, B2.leaves[rung]).forEach((l) => {
    const id = mk(l.ph, l.w, l.amp, 0.1, l.x + Math.cos(l.yaw) * l.len * 0.45, l.z + Math.sin(l.yaw) * l.len * 0.45, REACT.leafPush);
    const cx = Math.cos(l.yaw); const cz = Math.sin(l.yaw); const sx = -cz; const sz = cx;
    const base = gy(l.x, l.z);
    const pt = (t) => [l.x + cx * l.len * t, base + 0.08 + l.len * 0.9 * Math.sin(t * 1.9) * (1 - 0.25 * t), l.z + cz * l.len * t];
    const edge = (t) => l.wide * Math.sin(Math.PI * (0.12 + 0.88 * t)) ** 0.8;
    const hex = PALMS[l.tone];
    for (let i = 0; i < 3; i++) {
      const t0 = i / 3; const t1 = (i + 1) / 3; const p0 = pt(t0); const p1 = pt(t1); const e0 = edge(t0); const e1 = edge(t1);
      const A = [p0[0] - sx * e0, p0[1], p0[2] - sz * e0, t0]; const Bv = [p0[0] + sx * e0, p0[1], p0[2] + sz * e0, t0];
      const Cv = [p1[0] - sx * e1, p1[1], p1[2] - sz * e1, t1]; const Dv = [p1[0] + sx * e1, p1[1], p1[2] + sz * e1, t1];
      S.tri(A, Bv, Cv, hex, id, [0.8, 0.8, 1]); S.tri(Bv, Dv, Cv, hex, id, [0.8, 1.1, 1.1]);
    }
  });
  // cloth banners on the veranda beam: striped, long, narrow, each in its own bold colours
  const L = P.LODGE;
  const bay = [-10.0, -2.1, -8.2, -3.9].slice(0, B2.banners);
  const cloth = [[0xe8402c, 0xffc22a], [0x2fa89a, 0xff3d7a], [0x9a5ae0, 0xffd21a], [0xff7a1a, 0x2f8ae8]];
  bay.forEach((x, i) => {
    const id = mk(1 + i * 1.9, 0.9 + 0.2 * i, 0.07 + 0.02 * i, 0.03);
    const y0 = P.LODGE_WALL.top - 0.3;
    S.ribbon(x - 0.17, y0, L.z1 - 0.35, 1.5, 0.32, 5, 0, () => cloth[i][0], id, 0.15);
    S.ribbon(x + 0.17, y0, L.z1 - 0.35, 1.5, 0.32, 5, 0, () => cloth[i][1], id, 0.15);
  });
  return { soup: S, flockAt: S.pos.length / 3 };
}

/** A wind with slow gusts: 0.2 to 1. Pure. */
export const gustAt = (t) => 0.6 + 0.4 * Math.sin(t * 0.17) * Math.sin(t * 0.41 + 1.1);

// ---- the flock: a V of bright birds, flapping, crossing in front of her ------------------------------------------------------------------------
function fillBird(arr, o, x, y, z, fx, fz, f, scale) {
  const rx = fz; const rz = -fx;
  const cl = Math.cos(f) * 0.55 * scale; const lift = Math.sin(f) * 0.4 * scale;
  let k = o;
  const put = (px, py, pz) => { arr[k++] = px; arr[k++] = py; arr[k++] = pz; };
  for (const s of [1, -1]) {
    const A = [x + fx * 0.22 * scale, y, z + fz * 0.22 * scale]; const D = [x - fx * 0.32 * scale, y, z - fz * 0.32 * scale];
    const Bp = [x + rx * cl * s + fx * 0.15 * scale, y + lift, z + rz * cl * s + fz * 0.15 * scale];
    const Cp = [x + rx * cl * s * 0.8 - fx * 0.3 * scale, y + lift * 0.9, z + rz * cl * s * 0.8 - fz * 0.3 * scale];
    if (s > 0) { put(...A); put(...Bp); put(...Cp); put(...A); put(...Cp); put(...D); } else { put(...A); put(...Cp); put(...Bp); put(...A); put(...D); put(...Cp); }
  }
  // the long tail: one more triangle
  put(x - fx * 0.3 * scale + rx * 0.06 * scale, y, z - fz * 0.3 * scale + rz * 0.06 * scale); put(x - fx * 0.3 * scale - rx * 0.06 * scale, y, z - fz * 0.3 * scale - rz * 0.06 * scale); put(x - fx * 0.95 * scale, y - 0.05, z - fz * 0.95 * scale);
}
const BIRD_VERTS = 15;
const flapOf = (t, ph) => 0.2 + 0.9 * (0.5 + 0.5 * Math.sin(t * 9 + ph * 4));

// ---- the sounds ---------------------------------------------------------------------------------------------------------------------------
export const SOUND_GAP = Object.freeze({ cricket: Object.freeze({ min: 2.4, span: 3.2 }), distant: Object.freeze({ first: 4, min: 6, span: 8 }), drip: 0.31 });
function soundCtx(audio) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return null;
  return audio.getContext() ?? null;
}
/** A cricket's trill: a run of five tiny high pulses, each a short sine burst. Quiet; silent when muted. */
export function cricketNote(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const f = 3900 + 700 * hash(k * 3 + 1);
  for (let n = 0; n < 5; n++) {
    const at = now + n * 0.075;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.0035, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
    o.start(at); o.stop(at + 0.07);
  }
  return true;
}

// ---- the life ---------------------------------------------------------------------------------------------------------------------------------
const shaftGeo = (s) => {
  const pos = []; const col = [];
  const N = SHAFT.sides; const c = new THREE.Color(0xffe9a0);
  const lx = SHAFT.lean[0]; const lz = SHAFT.lean[1]; const Y = SHAFT.top; const y0 = P.jungleY(s.x, s.z);
  const put = (p) => { pos.push(p[0], p[1], p[2]); col.push(c.r * p[3], c.g * p[3], c.b * p[3]); };
  // three tubes nested one inside the next (wide and faint, middle, narrow and bright) so the edge is soft and not one hard line
  for (const [wide, br] of [[1.7, 0.28], [1.1, 0.3], [0.55, 0.32]]) {
    const ring = (y, rad, a) => Array.from({ length: N }, (_, i) => [s.x - lx * (y - y0) + Math.cos((i / N) * TAU) * rad * wide, y, s.z - lz * (y - y0) + Math.sin((i / N) * TAU) * rad * wide, a]);
    const top = ring(y0 + Y, s.rTop, 0); const mid = ring(y0 + Y - 1.2, s.rTop * 1.05, s.bright * br * 2); const low = ring(y0 + 2.2, s.rBot * 0.85, s.bright * br * 1.4); const bot = ring(y0 + 0.05, s.rBot, 0);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      for (const [a, b] of [[top, mid], [mid, low], [low, bot]]) for (const p of [a[i], b[i], a[j], a[j], b[i], b[j]]) put(p);
    }
  }
  // the pool of light where it lands: a fan, bright in the middle
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * TAU; const a1 = ((i + 1) / 8) * TAU; const r = s.rBot * 1.9;
    for (const p of [[s.x, y0 + 0.07, s.z, s.bright * 0.7], [s.x + Math.cos(a0) * r, y0 + 0.07, s.z + Math.sin(a0) * r, 0], [s.x + Math.cos(a1) * r, y0 + 0.07, s.z + Math.sin(a1) * r, 0]]) put(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

/** createJungleBeauty2({ scene, tier, reducedMotion, audio }) -> { sway, shafts, motes, update(dt, t, catPos, rain, camera, cover), dispose() } */
export function createJungleBeauty2({ scene, tier = null, reducedMotion = false, audio = null, sun = null, fill = null, date = null, season = null }) {
  const rung = rungOf(tier);
  const SE = SEASON[season ?? seasonOf(date ?? new Date())]; // pass 4: wet (Nov to Apr) or dry (May to Oct), only through uniforms and tints the place already has
  const forced = { spiral: null, bloom: null, monkeys: null }; // trigger(kind, t): the picture page and the tests ask for a surprise now
  const surpriseNow = (t) => { for (const k of ['spiral', 'monkeys']) { const a = forced[k] === null ? -1 : t - forced[k]; if (a >= 0 && a < SURPRISE_DUR[k]) return { kind: k, age: a, dur: SURPRISE_DUR[k], k: 'f' + forced[k] }; } return surpriseAt(t); };
  const bloomNow = (t) => (forced.bloom === null ? bloomAt(t, DAY) : bloomRamp(t - forced.bloom));
  const plan = beauty2Plan();
  const { soup } = swayParts(rung);
  const nS = soup.pos.length / 3;
  const nBirds = reducedMotion ? 0 : B2.flock[rung];
  const total = nS + nBirds * BIRD_VERTS;
  const rest = Float32Array.from(soup.pos);
  const wgt = Float32Array.from(soup.wgt);
  const pid = Uint16Array.from(soup.pid);
  const pos = new Float32Array(total * 3); pos.set(rest);
  const col = new Float32Array(total * 3); col.set(soup.col);
  for (let b = 0; b < nBirds; b++) {
    const [w, tip] = BIRDS[b % BIRDS.length]; const c = new THREE.Color();
    for (let v = 0; v < BIRD_VERTS; v++) { c.setHex(v % 6 < 3 && v < 12 ? w : v < 12 ? tip : 0x1a1a40); col.set([c.r, c.g, c.b], (nS + b * BIRD_VERTS + v) * 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sway = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
  sway.name = 'jungle:sway';
  sway.frustumCulled = false; sway.castShadow = false;
  sway.material.color.setRGB(SE.tint[0], SE.tint[1], SE.tint[2]);
  Object.assign(sway.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(sway);

  // the sun shafts: one additive mesh (not on LITE)
  const nShaft = B2.shafts[rung];
  let shafts = null;
  if (nShaft > 0) {
    const g = new THREE.BufferGeometry();
    const parts = plan.shafts.slice(0, nShaft).map((s) => shaftGeo(s));
    const cat = (name, n) => { const out = new Float32Array(parts.reduce((m, p) => m + p.attributes[name].array.length, 0)); let o = 0; for (const p of parts) { out.set(p.attributes[name].array, o); o += p.attributes[name].array.length; } return out; };
    g.setAttribute('position', new THREE.BufferAttribute(cat('position'), 3));
    g.setAttribute('color', new THREE.BufferAttribute(cat('color'), 3));
    parts.forEach((p) => p.dispose());
    shafts = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: SHAFT.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    shafts.name = 'jungle:shafts'; shafts.renderOrder = 2; shafts.frustumCulled = false;
    Object.assign(shafts.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(shafts);
  }

  // the motes: dust in the shafts, a halo on each lantern and mushroom, sparkles on the river; every point its own size
  const pts = [];
  plan.shafts.slice(0, nShaft).forEach((s) => s.dust.slice(0, B2.dust[rung]).forEach((d) => pts.push({ kind: 'dust', s, d, size: 0.16, rgb: [1, 0.92, 0.6] })));
  if (rung !== 'lite') plan.lanterns.forEach((l) => pts.push({ kind: 'halo', x: l.x, y: l.y, z: l.z, ph: l.ph, size: 3.4, rgb: _hexRgb(l.hex) }));
  plan.mushrooms.slice(0, rung === 'lite' ? 6 : 15).forEach((m) => pts.push({ kind: 'mush', x: m.x, y: P.jungleY(m.x, m.z) + 0.25, z: m.z, ph: m.ph, size: 1.5, rgb: _hexRgb(m.hex) }));
  plan.glints.slice(0, B2.glints[rung]).forEach((g) => pts.push({ kind: 'glint', x: g.x, y: P.jungleY(g.x, g.z) + P.RIVER_DEPTH - 0.02, z: g.z, ph: g.ph, w: g.w, size: 0.3, rgb: [1, 1, 0.85] }));
  // pass 3: pooled points only (no triangle): low mist, wading rings, rain rings and a shrub's burst of petals
  const pool = createPool({ ripples: rung === 'lite' ? 1 : rung === 'low' ? 2 : 3, bursts: rung === 'lite' ? 1 : 2 });
  const nMist = rung === 'lite' ? 0 : rung === 'low' ? 4 : 8;
  for (let i = 0; i < nMist; i++) pts.push({ kind: 'mist', i, size: 6, rgb: [0.62, 0.78, 0.7] });
  pool.rings.forEach((r) => { for (let k = 0; k < RIPPLE.points; k++) pts.push({ kind: 'ring', r, k, size: 0.55, rgb: [0.78, 0.95, 1] }); });
  pool.burstSet.forEach((b) => { for (let k = 0; k < PETALS.count; k++) pts.push({ kind: 'petal', b, k, size: 0.75, rgb: [1, 1, 1] }); });
  // pass 4: night-blooms (pooled points among pass 1's flower clusters; dark until the dusk they open)
  const spots = bloomSpots(sparklePlan().anchors, rung === 'lite' ? 3 : rung === 'low' ? 8 : 14);
  spots.forEach((s, i) => { const rgb = _hexRgb(s.hex); pts.push({ kind: 'night', s, i, size: 2.2, rgb }); if (s.big) pts.push({ kind: 'night', s, i, size: 6, rgb, halo: true }); });
  const nP = pts.length;
  const mPos = new Float32Array(nP * 3); const mCol = new Float32Array(nP * 3); const mSize = Float32Array.from(pts, (p) => p.size);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  mGeo.setAttribute('aSize', new THREE.BufferAttribute(mSize, 1));
  const mMat = new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.01, size: 1, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  mMat.onBeforeCompile = (sh) => { // each point's own size
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aSize;\nvoid main() {').replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
  };
  const motes = new THREE.Points(mGeo, mMat);
  motes.name = 'jungle:motes'; motes.frustumCulled = false;
  Object.assign(motes.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(motes);

  // ---- per frame ----
  const dxs = new Float32Array(soup.pieces.length); const dzs = new Float32Array(soup.pieces.length);
  const react = new Float32Array(soup.pieces.length); const awayX = new Float32Array(soup.pieces.length); const awayZ = new Float32Array(soup.pieces.length); const _o = { x: 0, z: 0 };
  function drawSway(t) {
    const g = gustAt(t);
    for (let i = 0; i < soup.pieces.length; i++) {
      const p = soup.pieces[i];
      const flutter = Math.sin(t * p.w + p.ph) + 0.4 * Math.sin(t * p.w * 2.3 + p.ph * 1.7);
      dxs[i] = 0.8 * (p.amp * g * flutter + p.lean * g * 2.2);
      dzs[i] = 0.55 * (p.amp * g * Math.cos(t * p.w * 0.9 + p.ph) + p.lean * g * 2.2);
      if (react[i] > 0.004) { brushOffset(p, react[i], awayX[i], awayZ[i], t, _o); dxs[i] += _o.x; dzs[i] += _o.z; } // she parts it (pass 3)
    }
    for (let v = 0; v < nS; v++) {
      const w = wgt[v]; const p = pid[v];
      pos[v * 3] = rest[v * 3] + dxs[p] * w; pos[v * 3 + 1] = rest[v * 3 + 1] - 0.06 * w * Math.abs(dxs[p]) * 3; pos[v * 3 + 2] = rest[v * 3 + 2] + dzs[p] * w;
    }
  }
  const flock = { on: false, t0: 0, fx: 0, fz: 0, cx: 0, cz: 0, y: 0, next: FLOCK.first, count: 0 };
  const spiral = { key: null, cx: 0, cz: 0, y: 0, on: false }; const _sp = { x: 0, y: 0, z: 0, fx: 0, fz: 0 };
  function drawFlock(t, camera) {
    if (!nBirds) return;
    // pass 4, the rare surprise: parrots spiral up the sky in front of her (the same bird vertices, so no mesh is added)
    const su = surpriseNow(t);
    spiral.on = !!(su && su.kind === 'spiral' && camera && !flock.on);
    if (spiral.on) {
      if (spiral.key !== su.k) { spiral.key = su.k; const f = camera.getWorldDirection(_fwd); const l = Math.hypot(f.x, f.z) || 1; spiral.cx = camera.position.x + (f.x / l) * 11; spiral.cz = camera.position.z + (f.z / l) * 11; spiral.y = camera.position.y - 0.9; }
      for (let b = 0; b < nBirds; b++) { spiralAt(b, nBirds, su.age, spiral.cx, spiral.cz, spiral.y, _sp); fillBird(pos, (nS + b * BIRD_VERTS) * 3, _sp.x, _sp.y, _sp.z, _sp.fx, _sp.fz, flapOf(t, b * 0.7), 1.6); }
      return;
    }
    if (!flock.on && t >= flock.next && camera) { // a flock sets out across the sky in front of her, lane and height from its turn
      const k = flock.count++;
      const fx = camera.getWorldDirection ? camera.getWorldDirection(_fwd).x : 0; const fz = _fwd.z;
      const len = Math.hypot(fx, fz) || 1;
      flock.fx = fx / len; flock.fz = fz / len; flock.cx = camera.position.x; flock.cz = camera.position.z;
      flock.y = camera.position.y + 3.5 + 3 * hash(k * 5 + 2); flock.dir = hash(k * 7 + 3) < 0.5 ? 1 : -1; flock.ahead = FLOCK.ahead + 6 * hash(k * 11 + 4);
      flock.t0 = t; flock.on = true;
    }
    const age = flock.on ? t - flock.t0 : 0;
    const gone = age * FLOCK.speed > FLOCK.span;
    if (flock.on && gone) { flock.on = false; flock.next = t + FLOCK.gap * (0.7 + 0.6 * hash(flock.count * 13 + 5)); }
    for (let b = 0; b < nBirds; b++) {
      const o = (nS + b * BIRD_VERTS) * 3;
      if (!flock.on) { pos.fill(0, o, o + BIRD_VERTS * 3); continue; }
      const row = Math.floor((b + 1) / 2); const side = b % 2 ? 1 : -1; // a V: each pair a step further back and out
      const lat = -FLOCK.span / 2 + age * FLOCK.speed - row * 1.8; const away = row * 1.3 * side;
      const px = -flock.fz * flock.dir; const pz = flock.fx * flock.dir; // sideways, left to right
      const x = flock.cx + flock.fx * (flock.ahead + away) + px * lat;
      const z = flock.cz + flock.fz * (flock.ahead + away) + pz * lat;
      const y = flock.y + 0.4 * Math.sin(age * 1.3 + b) + 0.3 * row;
      fillBird(pos, o, x, y, z, px, pz, flapOf(t, b * 0.7), 1.25);
    }
  }
  const _fwd = new THREE.Vector3();
  const _pt = { x: 0, y: 0, z: 0, g: 0 };
  const catAt = { x: 0, z: 0 };
  function drawMotes(t, rain, day) {
    const dim = 1 - 0.8 * Math.min(1, rain); // the shafts and the dust fade in a shower
    for (let i = 0; i < nP; i++) {
      const p = pts[i]; let x; let y; let z; let g;
      if (p.kind === 'mist') { // a low haze that drifts round her, thickest at dawn
        const B = 16; const wrap = (v, c) => ((((v - c) % (2 * B)) + 2 * B) % (2 * B)) - B + c;
        x = wrap(hash(p.i * 5 + 1) * 2 * B + t * (0.25 + 0.2 * hash(p.i)), catAt.x); z = wrap(hash(p.i * 5 + 2) * 2 * B + t * 0.12, catAt.z);
        y = P.jungleY(x, z) + 2.0 + 0.5 * Math.sin(t * 0.2 + p.i); g = 0.5 * day.mist * SE.mist * (0.7 + 0.3 * Math.sin(t * 0.3 + p.i * 2));
      } else if (p.kind === 'ring') {
        pool.ringPoint(p.r, p.k, _pt); x = _pt.x; y = _pt.y; z = _pt.z; g = _pt.g * 0.9;
      } else if (p.kind === 'petal') {
        pool.petalPoint(p.b, p.k, _pt); x = _pt.x; y = _pt.y; z = _pt.z; g = _pt.g * (p.k % 2 && SE.petals < 1 ? 0 : 1);
        const c = p.b.rgb; mCol[i * 3] = c[0] * g; mCol[i * 3 + 1] = c[1] * g; mCol[i * 3 + 2] = c[2] * g; mPos[i * 3] = x; mPos[i * 3 + 1] = y; mPos[i * 3 + 2] = z; continue;
      } else if (p.kind === 'dust') {
        const s = p.s; const y0 = P.jungleY(s.x, s.z); const u = (p.d.u + t * 0.012) % 1; const h = y0 + 0.6 + u * (SHAFT.top - 1.2);
        const r = (s.rBot * (1 - u) + s.rTop * u) * p.d.d * 0.9; const a = p.d.a + t * 0.12 * (p.d.ph - 3);
        x = s.x - SHAFT.lean[0] * (h - y0) + Math.cos(a) * r; z = s.z - SHAFT.lean[1] * (h - y0) + Math.sin(a) * r; y = h;
        g = (0.35 + 0.4 * Math.sin(t * 0.9 + p.d.ph) ** 2) * s.bright * dim * Math.min(1.4, day.shaft);
      } else if (p.kind === 'night') {
        const o = bloomNow(t); const sm = o * o * (3 - 2 * o); const s = p.s;
        x = s.x; z = s.z; y = s.y + 0.25 + 0.15 * sm; g = sm * (p.halo ? 0.3 : 0.85 + 0.15 * Math.sin(t * 2.1 + p.i)); mSize[i] = p.size * (0.15 + 0.85 * sm);
      } else if (p.kind === 'halo') {
        x = p.x; y = p.y; z = p.z; g = (0.32 + 0.1 * Math.sin(t * 2.3 + p.ph * 3) + 0.06 * Math.sin(t * 5.1 + p.ph)) * (0.6 + 0.4 * dim) * day.glow;
      } else if (p.kind === 'mush') {
        x = p.x; y = p.y; z = p.z; g = (0.22 + 0.12 * Math.sin(t * 0.9 + p.ph)) * (0.7 + 0.8 * day.glow);
      } else {
        x = p.x; y = p.y; z = p.z; g = Math.max(0, Math.sin(t * p.w + p.ph)) ** 6 * dim * SE.glint;
      }
      mPos[i * 3] = x; mPos[i * 3 + 1] = y; mPos[i * 3 + 2] = z;
      mCol[i * 3] = p.rgb[0] * g; mCol[i * 3 + 1] = p.rgb[1] * g; mCol[i * 3 + 2] = p.rgb[2] * g;
    }
    mGeo.attributes.position.needsUpdate = true; mGeo.attributes.color.needsUpdate = true; mGeo.attributes.aSize.needsUpdate = true;
  }
  function draw(t, rain, camera, day) {
    drawSway(t); drawFlock(t, camera);
    geo.attributes.position.needsUpdate = true;
    drawMotes(t, rain, day);
  }
  draw(0, 0, null, dayAt(0));
  if (reducedMotion) { mCol.fill(0); for (let i = 0; i < nP; i++) if (pts[i].kind === 'halo' || pts[i].kind === 'mush') { for (let k = 0; k < 3; k++) mCol[i * 3 + k] = pts[i].rgb[k] * 0.3; } mGeo.attributes.color.needsUpdate = true; }

  // pass 3: the day's light (the sun's colour and strength, the haze's reach and tint), eased from what the place began with; put back on dispose
  const fog = scene.fog ?? null;
  const base = { sunC: sun?.color?.clone?.() ?? null, sunI: sun?.intensity ?? 0, fillC: fill?.color?.clone?.() ?? null, fillI: fill?.intensity ?? 0, env: scene.environmentIntensity ?? null, fogC: fog?.color?.clone?.() ?? null, near: fog?.near ?? 0, far: fog?.far ?? 0 };
  const orig = { ...base, fogC: base.fogC?.clone?.() ?? null };
  if (fog && base.fogC) { base.near *= SE.near; base.far *= SE.far; if (SE.gold) base.fogC.lerp(new THREE.Color(0xe8c878), SE.gold); fog.color.copy(base.fogC); fog.near = base.near; fog.far = base.far; } // pass 4: the season's haze (wet: closer, dry: far and golden)
  const tintC = new THREE.Color(); const warmC = new THREE.Color();
  function grade(day) {
    const w = day.warm; warmC.setRGB(w[0], w[1], w[2]);
    const warmth = Math.min(1, 0.45 + 0.5 * Math.max(day.dawn, day.dusk));
    if (base.sunC) { sun.color.copy(base.sunC).lerp(warmC, warmth); sun.intensity = base.sunI * (1 + 0.34 * day.noon - 0.3 * day.dawn - 0.45 * day.dusk); }
    if (fill && base.fillI) { fill.color.copy(base.fillC).lerp(warmC, 0.7 * Math.max(day.dawn, day.dusk)); fill.intensity = base.fillI * (1 + 0.15 * day.noon - 0.1 * day.dawn - 0.5 * day.dusk); }
    if (base.env !== null) scene.environmentIntensity = base.env * (1 + 0.07 * day.noon - 0.1 * day.dawn - 0.55 * day.dusk); if (scene.background) scene.backgroundIntensity = 1 + 0.08 * day.noon - 0.12 * day.dawn - 0.38 * day.dusk;
    if (fog && base.fogC) {
      tintC.setRGB(0.96, 0.82, 0.76); fog.color.copy(base.fogC).lerp(tintC, 0.45 * day.dawn);
      tintC.setRGB(0.95, 0.5, 0.28); fog.color.lerp(tintC, 0.55 * day.dusk);
      fog.near = base.near * (1 - 0.6 * day.dawn - 0.35 * day.dusk); fog.far = base.far * (1 - 0.4 * day.dawn - 0.12 * day.dusk + 0.1 * day.noon);
    }
  }
  let nextCricket = 1.5; let crickets = 0; let nextDistant = SOUND_GAP.distant.first; let distant = 0; let nextDrip = 0;
  let nextFrog = 9; let frogs = 0; let nextWind = 3; let winds = 0; let nextRustle = 0; let nextMonkey = 0; let monkeys = 0; let stirred = 0; let lastFlush = -99; let last = null;
  const hexRgb = (pal) => _hexRgb(HOT[pal % HOT.length]);
  return {
    sway, shafts, motes,
    counts: { rung, vines: Math.min(plan.vines.length, B2.vines[rung]), shafts: nShaft, points: nP, birds: nBirds, swayTriangles: nS / 3 },
    pool, react, season: SE,
    trigger(kind, t) { forced[kind] = t; if (kind === 'monkeys') nextMonkey = t; },
    update(dt, t, catPos, rain = 0, camera = null) {
      const day = dayAt(t);
      // (each schedule runs on while muted: no catching up) the day's voice: birds are loudest at dawn, crickets and frogs at dusk, a breath of wind through the leaves at noon
      if (rain > 0.05) { if (t >= nextDrip) { patterNote(audio, rain * 0.6, 0.9); nextDrip = t + SOUND_GAP.drip; } } else {
        if (t >= nextCricket) { cricketNote(audio, crickets); crickets++; nextCricket = t + (SOUND_GAP.cricket.min + SOUND_GAP.cricket.span * hash(crickets * 3 + 7)) * (1.5 - 1.1 * day.dusk); }
        if (t >= nextDistant) { callNote(audio, 100 + distant * 3 + (day.dawn > 0.4 ? 47 : 0)); distant++; nextDistant = t + (SOUND_GAP.distant.min + SOUND_GAP.distant.span * hash(distant * 5 + 9)) * (1.7 - 1.15 * day.dawn); }
        if (day.dusk > 0.4 && t >= nextFrog) { croakNote(audio, 60 + frogs); frogs++; nextFrog = t + 5 + 7 * hash(frogs * 7 + 3); }
        const su = surpriseNow(t);
        if (su && su.kind === 'monkeys' && t >= nextMonkey) { (monkeys % 2 ? croakNote : callNote)(audio, 200 + monkeys * 5); monkeys++; nextMonkey = t + 0.3 + 0.55 * hash(monkeys * 3 + 1); } // a chorus of distant monkeys, calling back and forth
        if (day.noon > 0.3 && t >= nextWind) { patterNote(audio, 0.3 + 0.5 * gustAt(t), 1); winds++; nextWind = t + 3.5 + 3 * hash(winds * 5 + 1); }
      }
      if (reducedMotion) return;
      // her: how fast she goes (to know a stroll from a stand), the foliage she brushes, the river she wades, the flowers she touches
      const moving = !!(catPos && last) && dt > 0 && Math.hypot(catPos.x - last.x, catPos.z - last.z) / dt > 0.6;
      if (catPos) { catAt.x = catPos.x; catAt.z = catPos.z; }
      if (catPos && dt > 0) {
        const n = brush(soup.pieces, react, awayX, awayZ, catPos, dt, moving); stirred += n;
        if (n > 0 && t >= nextRustle) { patterNote(audio, 1.5, 0.75); nextRustle = t + REACT.rustleGap; }
        stirred = Math.max(0, stirred - dt * 0.35);
        if (stirred >= REACT.flushAt && !flock.on && t - lastFlush > 24 && nBirds) { flock.next = t; lastFlush = t; stirred = 0; callNote(audio, 77); } // the birds go up and cross the sky
        if (pool.step(t, catPos, rain, dt, moving) === 'splash') patterNote(audio, 0.9, 0.2);
        if (pool.touch(t, catPos, plan.shrubs, hexRgb)) callNote(audio, 31 + frogs);
        pool.advance(dt);
        last = { x: catPos.x, z: catPos.z };
      }
      draw(t, rain, camera, day); grade(day);
      sway.material.color.setRGB(SE.tint[0] * (1 - 0.1 * day.noon), SE.tint[1] * (1 - 0.06 * day.noon), SE.tint[2] * (1 - 0.1 * day.noon)); // pass 4: the saturated blossoms ease a little in the noon glare
      if (shafts) { shafts.material.opacity = SHAFT.opacity * Math.min(1.3, day.shaft) * (0.85 + 0.15 * Math.sin(t * 0.27)) * (1 - 0.7 * Math.min(1, rain)); shafts.material.color.setRGB(day.warm[0], day.warm[1], day.warm[2]); }
    },
    dispose() {
      if (base.sunC) { sun.color.copy(base.sunC); sun.intensity = base.sunI; } if (fill && base.fillI) { fill.color.copy(base.fillC); fill.intensity = base.fillI; } if (base.env !== null) { scene.environmentIntensity = base.env; scene.backgroundIntensity = 1; }
      if (fog && orig.fogC) { fog.color.copy(orig.fogC); fog.near = orig.near; fog.far = orig.far; }
      scene.remove(sway, motes); geo.dispose(); sway.material.dispose(); mGeo.dispose(); mMat.dispose();
      if (shafts) { scene.remove(shafts); shafts.geometry.dispose(); shafts.material.dispose(); }
    },
  };
}
function _hexRgb(hex) { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }
