import * as THREE from 'three';
import { mulberry32, seedFromCode } from '../rng.js';
import { TORSO, CHEST, SKULL, TAIL, deformTorso, torsoNormalAt, torsoUnitAt } from './torso.js';
import { coatColourAt, undersideColourAt } from './coat.js';
import { bodyKind, isPack } from './wearkind.js';

// FUR TUFTS (cat realism round 2, B7; 2026-11-15). Fur you can see in the
// cat's outline, made of solid geometry. Most of it is BANDS (addBand): a
// strip of fur lying along the coat or hanging from it, its far edge cut into
// a few uneven lobes, the clumps fur gathers into; neighbouring lobes share
// their base, so a band reads as a layer of fur with a soft broken edge, not
// as separate spikes. The bib's fringe is single LOCKS (addLock), short
// tapered clumps. Every root is sunk under the surface it
// grows from and wears that surface's normal and colour, so the light and
// the markings flow from the coat onto the fur.
//
// No transparency, no texture and no new object: everything is written into
// the arrays of a mesh the cat already has (the torso, the underside, the
// skull, the tail's links), so a cat costs exactly the draw calls
// it did, and the fur rides its part in every pose for nothing. Nothing here
// is re-fitted per frame: no fur grows from the neck's skin or from a leg
// (both are re-laid when the cat moves); the mane grows from the shoulders
// and the cheeks, the trousers from the rump over the backs of the thighs.
//
// What a cat gets (tuftPlan):
//   short hair  a little: a small band at each cheek, one across the lower
//               breast, "britches" behind each thigh, a slight broken line
//               under the belly and a brushy tail tip. Still a sleek cat.
//   long hair   a mane down each side of the neck's base (ahead of the
//               shoulder blade, where a shoulder scar lies), a fuller cheek
//               ruff, trousers, a belly skirt and a bushier tail outline (a
//               row with `tufts` also has ear tips, built into the ear by
//               face.js; `ears` in the plan leaves them out under a hat).
//               `fluffy` (D2, a builder's fluffy fur) is the
//               same set, shorter.
//   a kitten    short, even fuzz: cheeks, neck, breast, britches, tail.
// A simple build (the crowd) gets a lighter set of the same, without the skirt.
//
// Outfits (worked out once, when the cat is built; buildCat is run again when
// she changes clothes): a coat, sweater or hoodie covers the torso, so all
// the torso's and the chest's fur is left out under one; a cape covers the
// shoulders and the rump (no mane, no trousers, no chest fur: its bands cross
// the chest; a plumed tail's fur starts past its hem), the belly skirt hangs
// below its hem and stays; a backpack's, jetpack's or wings' straps run where
// the mane lies, so the mane is left out; with a collar or anything round the
// neck a long-haired cat's cheek ruff keeps to the upper cheek, above it, and
// with something round the neck the chest's fur is left out (a tie, a scarf's
// tail and a bandana lie there); a hat covers the ear tips. Hanging fur is
// drawn in where it would reach the ground in the sit, the nap or the stalk,
// and a lying tail's fur is turned off the ground and the haunch.
//
// Every band's lobes and lean are jittered by a stream seeded from the cat's
// own style (tuftSeed), never Math.random and never the walk's stream: the
// same cat always grows the same fur. No three.js object is made here (a
// geometry or a mesh would draw its uuid from Math.random and shift every
// seeded stream that follows a cat's build); the arrays are grown in place,
// as the neck's are (neck.js addNeck).

// `amount` is the taste call: 1 as built; below 1 the fur is shorter and
// lies closer, above 1 it is longer and stands out more. The picture harness
// overrides it; the game never does.
export const TUFT = {
  amount: 1,
  // the longest lobe of a band, in metres on a standard cat (before the cat's scale)
  short: { len: 0.038 },
  fluffy: { len: 0.075 },
  long: { len: 0.105 },
  kitten: { len: 0.032 },
  // a lock's ridge stands this share of its width over its edges; its root is
  // sunk this share of its width under the surface
  thick: 0.4, sink: 0.25,
  // how much darker a lock's two edges are than its ridge (a hint of depth
  // between neighbouring locks)
  edgeShade: 0.94,
  // hanging fur stays this far over the ground where the body rests on it
  floor: 0.004,
};

export const furKind = (s, kitten = false) => (kitten ? 'kitten'
  : !s.fluffy ? 'short'
    : (s.tailPlume ?? (s.tailFluff > 1 ? 1 : 0.5)) >= 1 ? 'long' : 'fluffy');

// A cat's own seed: its style row, so a breed, a family cat, a clan coat and
// every builder look each grow their own fur, the same on every device.
export function tuftSeed(s) {
  return seedFromCode(`tufts|${s.base}|${s.belly}|${s.accent}|${s.scale}|${+!!s.stripes}${+!!s.points}${+!!s.patches}${+!!s.cow}${+!!s.fluffy}${+!!s.tufts}|${(s.body ?? []).join(',')}`);
}

// Which regions grow fur, for style row `s` wearing `acc` (see the block
// comment). `cheekShort`: the cheek ruff ends above a collar.
export function tuftPlan(s, acc = {}, { simple = false, kitten = false } = {}) {
  const shell = bodyKind(acc.body) === 'shell';
  const cape = bodyKind(acc.body) === 'cape';
  const pack = isPack(acc.back);
  const neckwear = !!acc.neck || !!acc.collar || !!s.tagCollar;
  return {
    kind: furKind(s, kitten), simple,
    mane: !shell && !cape && !pack,
    trousers: !shell && !cape,
    skirt: !shell,
    chest: !shell && !cape && !acc.neck,
    cheeks: true, cheekShort: neckwear,
    // a cape's hem hangs over the tail's first links: a plume's fur starts past it
    // (and past the first link in any case: it lies against the rump, and the
    // merged cat's triangle cap is tight)
    tail: true, tailFrom: 2,
    ears: !!s.tufts && !acc.head,
  };
}

// ---------------------------------------------------------------------------
// One lock. `out` collects { pos, nor, col, idx } (plain arrays) in a part's
// own METRIC frame (the caller carries them into the mesh's). P is the root,
// on the surface; N the surface's unit normal there; T the unit direction the
// fur lies along; S, across the lock, is worked out from them.
//   len, width  the lock's size
//   rise        how far it stands off the surface, as a share of len: it
//               climbs by rise·len over its first half and droops back by
//               `droop`·len toward the tip
//   bend        sideways curl, a share of len (signed)
//   rings       3 (a full lock: 10 triangles open, 15 closed) or 2 (a small
//               one: 6 open, 9 closed)
//   closed      a lock that hangs free of the body (the skirt, the trousers,
//               an ear tip) also gets a back face
//   colourAt(t, c)  writes the coat's colour at share t along the lock
// Its first ring wears the surface's own normal, so the light flows from the
// coat onto the lock without a crease (as the seams do, torso.js SEAM); the
// normals round over toward its edges and tip further along.
const RINGS = {
  3: { t: [0, 0.45, 0.8], w: [0.75, 1, 0.7], h: [0.4, 1, 0.7], round: [0, 0.7, 1] },
  2: { t: [0, 0.58], w: [0.8, 1], h: [0.45, 1], round: [0, 0.85] },
};
const _c = [0, 0, 0];
export function addLock(out, P, N, T, { len, width, rise = 0.25, droop = 0.6, bend = 0, rings = 3, closed = false, colourAt, thick = TUFT.thick, sink = TUFT.sink, edgeShade = TUFT.edgeShade }) {
  const R = RINGS[rings];
  // S = T x N, then T made square to S (N is kept: the lock's "up")
  let sx = T[1] * N[2] - T[2] * N[1], sy = T[2] * N[0] - T[0] * N[2], sz = T[0] * N[1] - T[1] * N[0];
  const sL = Math.hypot(sx, sy, sz) || 1; sx /= sL; sy /= sL; sz /= sL;
  const h = width * thick, down = width * sink;
  const first = out.pos.length / 3;
  const put = (x, y, z, nx, ny, nz, shade) => {
    const nL = Math.hypot(nx, ny, nz) || 1;
    out.pos.push(x, y, z); out.nor.push(nx / nL, ny / nL, nz / nL);
    out.col.push(_c[0] * shade, _c[1] * shade, _c[2] * shade);
  };
  const centre = (t) => {
    const up = len * (rise * Math.min(1, t * 2) - rise * droop * t * t) - down * (1 - t);
    const side = len * bend * t * t;
    return [P[0] + T[0] * len * t + N[0] * up + sx * side, P[1] + T[1] * len * t + N[1] * up + sy * side, P[2] + T[2] * len * t + N[2] * up + sz * side];
  };
  for (let k = 0; k < rings; k++) {
    const t = R.t[k], C = centre(t), w = width * R.w[k] / 2, hk = h * R.h[k], r = R.round[k];
    colourAt(t, _c);
    // left edge, ridge, right edge; the edges lie a little under the centre line
    put(C[0] - sx * w - N[0] * hk * 0.3, C[1] - sy * w - N[1] * hk * 0.3, C[2] - sz * w - N[2] * hk * 0.3, N[0] - sx * r, N[1] - sy * r, N[2] - sz * r, k ? edgeShade : 1);
    put(C[0] + N[0] * hk, C[1] + N[1] * hk, C[2] + N[2] * hk, N[0] + T[0] * r * 0.25, N[1] + T[1] * r * 0.25, N[2] + T[2] * r * 0.25, 1);
    put(C[0] + sx * w - N[0] * hk * 0.3, C[1] + sy * w - N[1] * hk * 0.3, C[2] + sz * w - N[2] * hk * 0.3, N[0] + sx * r, N[1] + sy * r, N[2] + sz * r, k ? edgeShade : 1);
  }
  const tipC = centre(1);
  colourAt(1, _c);
  put(tipC[0], tipC[1], tipC[2], N[0] + T[0] * 0.7, N[1] + T[1] * 0.7, N[2] + T[2] * 0.7, 1);
  const tip = first + rings * 3;
  // faces, each wound to face the way `want` (N for the front, -N for the back)
  const face = (a, b, c, sign) => {
    const p = out.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const d = (uy * vz - uz * vy) * N[0] + (uz * vx - ux * vz) * N[1] + (ux * vy - uy * vx) * N[2];
    if (d * sign >= 0) out.idx.push(a, b, c); else out.idx.push(a, c, b);
  };
  for (let k = 0; k < rings - 1; k++) {
    const a = first + k * 3, b = a + 3;
    face(a, a + 1, b, 1); face(a + 1, b + 1, b, 1);
    face(a + 1, a + 2, b + 1, 1); face(a + 2, b + 2, b + 1, 1);
    if (closed) { face(a, b, a + 2, -1); face(a + 2, b, b + 2, -1); }
  }
  const last = first + (rings - 1) * 3;
  face(last, last + 1, tip, 1); face(last + 1, last + 2, tip, 1);
  if (closed) face(last, tip, last + 2, -1);
}

// ---------------------------------------------------------------------------
// One BAND: a strip of fur lying along the coat from a row of roots, its far
// edge cut into uneven LOBES (lobeReach), the clumps the fur gathers into.
// Neighbouring lobes share their base, so a band reads as one layer of fur
// with a soft broken edge, never as separate spikes. `stations` is the row:
// each { P, N, T, r }, the root on the surface, the surface's normal, the
// fur's direction there and how far the edge reaches (a share of len).
//   len         the longest lobe
//   mid, edge   how far the band's middle row and its edge stand off the
//               plane it lies in (metres; the surface curves away under it)
//   closed      a band that hangs free of the body (a skirt, the trousers)
//               also gets a back face
//   colourAt(j, k, c)  the coat's colour at station j, k = 0 the root, 0.5
//               the middle, 1 the edge
// Three vertices a station; 4 triangles a step, 6 closed. The root row is
// sunk under the surface and wears its normal (the light flows on from the
// coat); the normals round over toward the edge.
export function addBand(out, stations, { len, mid = 0.015, edge = 0, closed = false, colourAt, sink = 0.012 }) {
  const first = out.pos.length / 3;
  const put = (x, y, z, nx, ny, nz, shade) => {
    const nL = Math.hypot(nx, ny, nz) || 1;
    out.pos.push(x, y, z); out.nor.push(nx / nL, ny / nL, nz / nL);
    out.col.push(_c[0] * shade, _c[1] * shade, _c[2] * shade);
  };
  for (let j = 0; j < stations.length; j++) {
    const { P, N, T, r } = stations[j], a = len * r, h = Math.min(1, r * 1.5);
    colourAt(j, 0, _c);
    put(P[0] - N[0] * sink, P[1] - N[1] * sink, P[2] - N[2] * sink, N[0], N[1], N[2], 1);
    colourAt(j, 0.5, _c);
    put(P[0] + T[0] * a * 0.5 + N[0] * mid * h, P[1] + T[1] * a * 0.5 + N[1] * mid * h, P[2] + T[2] * a * 0.5 + N[2] * mid * h, N[0] + T[0] * 0.3, N[1] + T[1] * 0.3, N[2] + T[2] * 0.3, 1);
    colourAt(j, 1, _c);
    put(P[0] + T[0] * a + N[0] * edge * h, P[1] + T[1] * a + N[1] * edge * h, P[2] + T[2] * a + N[2] * edge * h, N[0] * 0.75 + T[0] * 0.85, N[1] * 0.75 + T[1] * 0.85, N[2] * 0.75 + T[2] * 0.85, TUFT.edgeShade);
  }
  const face = (a, b, c, N, sign) => {
    const p = out.pos;
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const d = (uy * vz - uz * vy) * N[0] + (uz * vx - ux * vz) * N[1] + (ux * vy - uy * vx) * N[2];
    if (d * sign >= 0) out.idx.push(a, b, c); else out.idx.push(a, c, b);
  };
  for (let j = 0; j < stations.length - 1; j++) {
    const a = first + j * 3, b = a + 3, N = stations[j].N;
    face(a, a + 1, b, N, 1); face(a + 1, b + 1, b, N, 1);
    face(a + 1, a + 2, b + 1, N, 1); face(a + 2, b + 2, b + 1, N, 1);
    if (closed) { face(a, b, a + 2, N, -1); face(a + 2, b, b + 2, N, -1); }
  }
}

// The edge of a band of `n` lobes, `per` steps a lobe (2: a notch and a tip;
// 3: a notch and a blunt, lopsided tip): how far the edge reaches at each
// station, as a share of the band's length (`.r`), and where each station
// lies along the band, 0..1 (`.k`). Uneven by `rand`: every lobe has its own
// length and width, its tip is broad and its notch narrow, so the edge is
// scalloped, not a saw. The two ends run down into the coat.
export function lobeReach(rand, n, per = 3) {
  const r = [0.2], at = [0];
  let x = 0;
  for (let l = 0; l < n; l++) {
    const L = 0.72 + 0.28 * rand(), lean = rand() < 0.5, notch = 0.4 + 0.2 * rand(), w = 0.75 + 0.5 * rand();
    if (per === 3) {
      r.push(L * (lean ? 1 : 0.86), L * (lean ? 0.86 : 1));
      at.push(x += w * 0.8, x += w * 1.3);
    } else {
      r.push(L);
      at.push(x += w * (lean ? 1.2 : 0.8));
    }
    r.push(l === n - 1 ? 0.2 : notch);
    at.push(x += w * (per === 3 ? 0.8 : lean ? 0.8 : 1.2));
  }
  return { r, k: at.map((v) => v / x) };
}

const newOut = () => ({ pos: [], nor: [], col: [], idx: [] });
const norm = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
// `d` laid on the plane square to the unit normal `n` (the fur lies along the
// coat), then lifted `lift` of the way back toward n.
function along(d, n, lift = 0) {
  const k = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
  const t = norm([d[0] - n[0] * k, d[1] - n[1] * k, d[2] - n[2] * k]);
  return lift ? norm([t[0] + n[0] * lift, t[1] + n[1] * lift, t[2] + n[2] * lift]) : t;
}
// ---------------------------------------------------------------------------
// THE TORSO'S FUR: the mane (long fur), the trousers or britches, the belly
// skirt or line. In the torso mesh's own frame (before the body's scale `bs`),
// ready for appendTufts on the body's geometry. Each root is a point of the
// torso's own surface, given by its undeformed unit direction, so the fur
// follows the body's shape (Digit's narrow frame too) and wears the coat
// painted there: stripes, patches, Robbie's flanks and D2's band carry on
// over it.
//
// The mane is a band down each side of the neck's base, from behind the ear
// to the breast. It starts MANE.from round from the spine and lies ahead of
// the shoulder blade, so the top of the shoulder stays bare: a shoulder scar
// lies there (scarmesh.js SCAR_LAYOUT.shoulder).
const deg = Math.PI / 180;
// from, to: degrees round from the spine; z: the roots' unit z at each end;
// the fur's direction (cat frame, the right side) at each end; lobes
export const MANE = Object.freeze({ from: 54, to: 156, z: [-0.5, -0.6], dir: [[0.75, -0.2, 0.6], [0.5, -0.75, 0.4]], lobes: 4, len: 1, mid: 0.03, edge: 0.008 });
// the paths' unit directions (the right side) and the fur's direction
export const TROUSERS = Object.freeze({ path: [[0.14, -0.3, 0.94], [0.48, -0.2, 0.86], [0.8, -0.2, 0.56]], dir: [0.4, -0.85, 0.4], lobes: 2, len: 1.05, mid: 0.02 });
export const SKIRT = Object.freeze({ path: [[0.5, -0.82, -0.46], [0.46, -0.88, 0.02], [0.5, -0.78, 0.5]], dir: [0.12, -1, 0.3], lobes: 3, len: 0.8, mid: 0.016 });

export function torsoTufts(s, coat, bs, plan, seed, lowPoses = []) {
  const out = newOut();
  const rand = mulberry32(seed ^ 0x51ed270b);
  const size = TUFT[plan.kind], long = plan.kind === 'long' || plan.kind === 'fluffy';
  const a = TUFT.amount, kLen = a < 1 ? 0.6 + 0.4 * a : 1 + 0.5 * (a - 1), kUp = a < 1 ? a : 1 + 0.6 * (a - 1);
  const R = TORSO.R, n = [0, 0, 0], uc = [0, 0, 0], c = new THREE.Color();
  // a root on the torso at unit direction `dir`: P and N in the torso's METRIC
  // frame (the mesh's, times the body's scale), u its unit direction
  const rootAt = (dir) => {
    const u = norm(dir), p = deformTorso(u[0], u[1], u[2]);
    torsoNormalAt(u, n);
    return { u, P: [p[0] * R * bs[0], p[1] * R * bs[1], p[2] * R * bs[2]], N: norm([n[0] / bs[0], n[1] / bs[1], n[2] / bs[2]]) };
  };
  // the coat under a root, moved `dist` metres along the fur
  const coatAt = (st, dist, into) => {
    const k = dist / R;
    uc[0] = st.u[0] + st.T[0] / bs[0] * k; uc[1] = st.u[1] + st.T[1] / bs[1] * k; uc[2] = st.u[2] + st.T[2] / bs[2] * k;
    const m = Math.hypot(uc[0], uc[1], uc[2]);
    uc[0] /= m; uc[1] /= m; uc[2] /= m;
    coatColourAt(coat, uc, c);
    into[0] = c.r; into[1] = c.g; into[2] = c.b;
  };
  // a band along the path `at(k)` (k 0..1, a unit direction), the fur lying
  // along `dirAt(k)`; `hang`: the fur hangs free of the body
  const band = (at, dirAt, lobes, per, len, mid, { hang = false, edge = 0, free = 0.65 } = {}) => {
    const reach = lobeReach(rand, lobes, per), turn = (rand() - 0.5) * 0.3;
    const stations = reach.r.map((r, j) => {
      const k = reach.k[j], st = rootAt(at(k)), d = norm(dirAt(k));
      const flat = along([d[0] + turn * d[2], d[1], d[2] - turn * d[0]], st.N);
      st.T = hang ? norm([flat[0] * (1 - free) + d[0] * free, flat[1] * (1 - free) + d[1] * free, flat[2] * (1 - free) + d[2] * free]) : flat;
      st.r = r;
      return st;
    });
    const L = len * kLen;
    // Off the ground (TUFT.floor) in every pose of `lowPoses` (each the torso
    // mesh's matrix in a pose where the body rests on the ground: the sit, the
    // nap, the stalk): a lobe that would reach into it is drawn in, as fur
    // lying on the ground is pressed flat.
    for (const st of stations) {
      const low = (r) => {
        const a = L * r, h = Math.min(1, r * 1.5);
        let y = Infinity;
        for (const m of lowPoses) {
          for (const [f, up] of [[0.5, mid * kUp * h], [1, edge * kUp * h]]) {
            const x = (st.P[0] + st.T[0] * a * f + st.N[0] * up) / bs[0], yy = (st.P[1] + st.T[1] * a * f + st.N[1] * up) / bs[1], z = (st.P[2] + st.T[2] * a * f + st.N[2] * up) / bs[2];
            y = Math.min(y, m[1] * x + m[5] * yy + m[9] * z + m[13]);
          }
        }
        return y;
      };
      for (let n = 0; n < 12 && st.r > 0.05 && low(st.r) < TUFT.floor; n++) st.r *= 0.8;
    }
    addBand(out, stations, { len: L, mid: mid * kUp, edge: edge * kUp, closed: hang, colourAt: (j, k, into) => coatAt(stations[j], Math.min(k, 0.6) * L * stations[j].r, into) });
  };
  const lerp3 = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  const through = (pts, side) => (k) => {
    const f = k * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), p = lerp3(pts[i], pts[i + 1], f - i);
    return [p[0] * side, p[1], p[2]];
  };
  const per = plan.simple ? 2 : 3;
  const both = (fn) => { for (const side of [1, -1]) fn(side); };
  if (plan.mane && (long || plan.kind === 'kitten')) {
    const kit = plan.kind === 'kitten';
    both((side) => band((k) => {
      const ang = (MANE.from + (MANE.to - MANE.from) * k) * deg, z = MANE.z[0] + (MANE.z[1] - MANE.z[0]) * k, r = Math.sqrt(1 - z * z);
      return [Math.sin(ang) * r * side, Math.cos(ang) * r, z];
    }, (k) => { const d = lerp3(MANE.dir[0], MANE.dir[1], k); return [d[0] * side, d[1], d[2]]; },
    plan.simple || kit ? 3 : MANE.lobes, kit ? 2 : per, size.len * MANE.len, kit ? 0.012 : MANE.mid * (plan.kind === 'long' ? 1 : 0.7), { edge: kit ? 0 : MANE.edge, hang: !kit, free: 0.5 }));
  }
  if (plan.trousers) {
    both((side) => band(through(TROUSERS.path, side), () => [TROUSERS.dir[0] * side, TROUSERS.dir[1], TROUSERS.dir[2]],
      // the crowd's short-haired cats: one lobe (Digit's simple build with two scars sits at its 5,500 cap)
      plan.simple && !long ? 1 : TROUSERS.lobes, long ? per : 2, size.len * TROUSERS.len, long ? TROUSERS.mid : 0.01, { hang: true }));
  }
  // Trimmed for the merged cat's triangle cap (2026-11-15, with realism 3's
  // face): the skirt, the least seen band, is two steps a lobe, and a crowd
  // cat has none.
  if (plan.skirt && long && !plan.simple) {
    both((side) => band(through(SKIRT.path, side), () => [SKIRT.dir[0] * side, SKIRT.dir[1], SKIRT.dir[2]],
      SKIRT.lobes, 2, size.len * SKIRT.len, SKIRT.mid, { hang: true }));
  } else if (plan.skirt && !plan.simple && plan.kind !== 'kitten') {
    // short fur: a slight broken line under the belly
    both((side) => band(through(SKIRT.path, side), () => [SKIRT.dir[0] * side, SKIRT.dir[1], SKIRT.dir[2]], 2, 2, size.len * 0.8, 0.006, { hang: true }));
  }
  return inFrame(out, [0, 0, 0], bs);
}

// ---------------------------------------------------------------------------
// THE CHEST'S FUR (short fur and kittens; a fluffy cat has its bib, ruff.js):
// one small band of three lobes across the lower breast, pointing down. In
// the underside's frame (the torso mesh's), for appendTufts on the underside's
// geometry, so it rides the chest in the sit as the chest itself does.
export const CHEST_BAND = Object.freeze({ path: [[-0.52, -0.4, -0.76], [0, -0.56, -0.83], [0.52, -0.4, -0.76]], dir: [0, -0.9, 0.35], lobes: 3 });
export function chestTufts(s, coat, f, bs, plan, seed) {
  const out = newOut();
  if (!plan.chest || plan.kind === 'long' || plan.kind === 'fluffy' || plan.simple) return inFrame(out, [0, 0, 0], bs);
  const rand = mulberry32(seed ^ 0x2c1b3c6d);
  const size = TUFT[plan.kind];
  const a = TUFT.amount, kLen = a < 1 ? 0.6 + 0.4 * a : 1 + 0.5 * (a - 1), kUp = a < 1 ? a : 1 + 0.6 * (a - 1);
  const at = [0, CHEST.DY, CHEST.Z * f[2]]; // the chest's centre from the torso's
  const rad = [CHEST.R * CHEST.SCALE[0] * f[0], CHEST.R * CHEST.SCALE[1], CHEST.R * CHEST.SCALE[2]];
  const c = new THREE.Color(), unit = [0, 0, 0], local = [0, 0, 0];
  const reach = lobeReach(rand, CHEST_BAND.lobes, 2), pts = CHEST_BAND.path;
  const stations = reach.r.map((r, j) => {
    const g = reach.k[j] * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(g));
    const d = norm([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * (g - i), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (g - i), pts[i][2] + (pts[i + 1][2] - pts[i][2]) * (g - i)]);
    const k = 1 / Math.hypot(d[0] / rad[0], d[1] / rad[1], d[2] / rad[2]);
    const P = [at[0] + d[0] * k, at[1] + d[1] * k, at[2] + d[2] * k];
    const N = norm([d[0] * k / (rad[0] * rad[0]), d[1] * k / (rad[1] * rad[1]), d[2] * k / (rad[2] * rad[2])]);
    // the colour the chest itself wears there (model.js undersideGeometry)
    local[0] = P[0] / bs[0]; local[1] = P[1] / bs[1]; local[2] = P[2] / bs[2];
    undersideColourAt(coat, coat.chest, d, torsoUnitAt(local, unit), c);
    return { P, N, T: along(CHEST_BAND.dir, N), r, col: [c.r, c.g, c.b] };
  });
  addBand(out, stations, { len: size.len * kLen, mid: 0.008 * kUp, sink: 0.008, colourAt: (j, k, into) => { const col = stations[j].col; into[0] = col[0]; into[1] = col[1]; into[2] = col[2]; } });
  return inFrame(out, [0, 0, 0], bs);
}

// ---------------------------------------------------------------------------
// THE CHEEK RUFF: a band of fur low on each side of the face, from behind the
// eye's corner down to the jaw, leaning out, down and a little back, so the
// face is wider below the eyes than the skull's ball. In the skull mesh's own
// frame (before its scale), for appendTufts on the skull's geometry.
// `colourAt(x, y, z, c)` gives the skull's colour at a point of that geometry
// (a pointed cat's mask). `R` and `scale` are the skull's own, read from its
// mesh where it is built (its sphere's radius and the mesh's scale), so the
// ruff sits on the head whatever shape the head is given.
export const CHEEKS = Object.freeze({ path: [[0.96, -0.02, -0.02], [0.93, -0.36, -0.14], [0.7, -0.68, -0.22]], dir: [[0.9, -0.4, 0.3], [0.65, -0.75, 0.2]], len: 0.85, mid: 0.018 });
export function cheekTufts(s, plan, seed, colourAt, R = SKULL.R, scale = SKULL.SCALE) {
  const out = newOut();
  if (!plan.cheeks) return out;
  const rand = mulberry32(seed ^ 0x7f4a7c15);
  const size = TUFT[plan.kind], long = plan.kind === 'long' || plan.kind === 'fluffy';
  const a = TUFT.amount, kLen = a < 1 ? 0.6 + 0.4 * a : 1 + 0.5 * (a - 1), kUp = a < 1 ? a : 1 + 0.6 * (a - 1);
  const rad = [scale[0] * R, scale[1] * R, scale[2] * R];
  const c = new THREE.Color();
  // above a collar the ruff keeps to the upper cheek, shorter, leaning out more than down
  const short = plan.cheekShort && long ? 0.5 : 1;
  for (const side of [1, -1]) {
    const reach = lobeReach(rand, 2, long && !plan.simple ? 3 : 2);
    const stations = reach.r.map((r, j) => {
      const k = reach.k[j] * (short < 1 ? 0.62 : 1), f = k * (CHEEKS.path.length - 1), i = Math.min(CHEEKS.path.length - 2, Math.floor(f));
      const p = CHEEKS.path[i], q = CHEEKS.path[i + 1];
      const d = norm([(p[0] + (q[0] - p[0]) * (f - i)) * side, p[1] + (q[1] - p[1]) * (f - i), p[2] + (q[2] - p[2]) * (f - i)]);
      const m = 1 / Math.hypot(d[0] / rad[0], d[1] / rad[1], d[2] / rad[2]);
      const P = [d[0] * m, d[1] * m, d[2] * m];
      const N = norm([P[0] / (rad[0] * rad[0]), P[1] / (rad[1] * rad[1]), P[2] / (rad[2] * rad[2])]);
      const d0 = [CHEEKS.dir[0][0] + (CHEEKS.dir[1][0] - CHEEKS.dir[0][0]) * k, CHEEKS.dir[0][1] + (CHEEKS.dir[1][1] - CHEEKS.dir[0][1]) * k, CHEEKS.dir[0][2] + (CHEEKS.dir[1][2] - CHEEKS.dir[0][2]) * k];
      const T = along([d0[0] * side, d0[1] * (short < 1 ? 0.5 : 1), d0[2] + (short < 1 ? 0.25 : 0)], N, long ? 0.6 : 0.2);
      colourAt(P[0] / scale[0], P[1] / scale[1], P[2] / scale[2], c);
      return { P, N, T, r, col: [c.r, c.g, c.b] };
    });
    addBand(out, stations, { len: size.len * CHEEKS.len * short * kLen, mid: (long ? CHEEKS.mid : 0.008) * kUp, sink: 0.008, closed: long && !plan.simple, colourAt: (j, k, into) => { const col = stations[j].col; into[0] = col[0]; into[1] = col[1]; into[2] = col[2]; } });
  }
  return inFrame(out, [0, 0, 0], scale);
}

// ---------------------------------------------------------------------------
// THE TAIL'S FUR, link `i` of five, in the link's own frame (+z along the
// tail from its pivot, +y its back). `plume` as buildCat's; `radius(u)` the
// tail's radius at share u of its length; `colourAt(z, c)` the link's own
// colour at z along it. A band along each side of the link, its lobes
// pointing to the tip and out. Short fur: the last link only, small, so the
// tip is a soft brush no longer than it was. A plume: every link past the
// root, so the tail's outline is bushy. The bands keep to the tail's sides, a
// little toward its back, off its underside: a lying tail rests on the ground
// and against the haunch there.
// `lying`: the tail's lying curves (torso.js SIT_TAIL, NAP_TAIL or the plume's).
// In those the chain rolls as it turns round the haunch, so each band is
// moved round the link, as little as it takes, until it faces no more than
// TAIL_AWAY of the way down or in toward the body in any of them: the fur is
// not pressed into the ground or the haunch. A band with no such place is
// left out.
const TAIL_AWAY = 0.3;
// For lying curve `curve`, in link i's own frame: "down" (the cat frame's -y)
// and "in" (toward the torso's middle line from the link). The animator turns
// the tail by rotX about x, then each pivot by its pivotX about x and its
// pivotY (to the cat's left) about y; the root is at the rump.
function lyingAway(curve, i) {
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1]; // the link's rotation, row-major
  const mul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
  const rx = (t) => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)];
  const ry = (t) => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)];
  m = mul(m, rx(curve.rotX));
  const at = [0, 0, TAIL.ROOT_Z], step = TAIL.LINK * TAIL.SCALE;
  for (let k = 0; k <= i; k++) {
    m = mul(mul(m, rx(curve.pivotX[k])), ry(-curve.pivotY[k]));
    const f = k === i ? 0.5 : 1; // to the link's middle
    at[0] += m[2] * step * f; at[2] += m[8] * step * f;
  }
  const inX = -at[0], inZ = Math.min(0.2, Math.max(-0.25, at[2])) - at[2], L = Math.hypot(inX, inZ) || 1;
  // the transpose times each direction
  return [[-m[3], -m[4], -m[5]], [(m[0] * inX + m[6] * inZ) / L, (m[1] * inX + m[7] * inZ) / L, (m[2] * inX + m[8] * inZ) / L]];
}
export function tailTufts(s, plan, seed, i, plume, radius, colourAt, lying = []) {
  const out = newOut();
  if (!plan.tail) return out;
  const kitten = plan.kind === 'kitten', bushy = plume > 0 && !kitten;
  if (bushy ? i < plan.tailFrom : kitten ? i < 3 : i !== 4) return out;
  const rand = mulberry32(seed ^ (0x1b873593 + i * 0x9e3779b1));
  const size = TUFT[plan.kind], LINK = TAIL.LINK;
  const a = TUFT.amount, kLen = a < 1 ? 0.6 + 0.4 * a : 1 + 0.5 * (a - 1), kUp = a < 1 ? a : 1 + 0.6 * (a - 1);
  const c = new THREE.Color();
  const slope = (radius((i + 1) / 5) - radius(i / 5)) / LINK;
  for (const side of [1, -1]) {
    if (plan.simple && (i + (side > 0 ? 1 : 0)) % 2) continue; // the crowd: one side a link, alternating
    let phi = Math.PI / 2 - side * (72 + 14 * rand()) * deg; // round from the back toward this side
    const away = lying.flatMap((curve) => lyingAway(curve, i));
    const ok = (f) => !away.some((d) => Math.cos(f) * d[0] + Math.sin(f) * d[1] > TAIL_AWAY);
    let found = ok(phi);
    for (let n = 1; n <= 12 && !found; n++) {
      for (const turn of [side * n * 12 * deg, -side * n * 12 * deg]) if (!found && ok(phi + turn)) { phi += turn; found = true; }
    }
    if (!found) continue;
    const reach = lobeReach(rand, 1, 2);
    const z0 = LINK * (bushy ? 0.04 : 0.3), z1 = LINK * (bushy ? 0.8 : 0.78);
    const stations = reach.r.map((r, j) => {
      const z = z0 + (z1 - z0) * reach.k[j], rr = radius((i + z / LINK) / 5);
      const N = norm([Math.cos(phi), Math.sin(phi), -slope]);
      const P = [Math.cos(phi) * rr, Math.sin(phi) * rr, z];
      colourAt(z, c);
      return { P, N, T: norm([N[0] * 0.28, N[1] * 0.28, 0.96]), r, col: [c.r, c.g, c.b] };
    });
    const len = bushy ? size.len * 0.6 : Math.min(size.len, 0.03);
    addBand(out, stations, { len: len * kLen, mid: (bushy ? 0.012 : 0.004) * kUp, sink: bushy ? 0.01 : 0.004,  colourAt: (j, k, into) => { const col = stations[j].col; into[0] = col[0]; into[1] = col[1]; into[2] = col[2]; } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// THE BIB'S LOCKS (a fluffy cat's ruff, ruff.js): `n` locks hanging from the
// bib's lower edge, overlapping, uneven in length and lean. They replace the
// five even points that read as a row of teeth. Each is returned on its own
// (ruff.js makes one geometry per lock, as it made one per point). Cat frame.
export function bibLocks(n, seed, simple, at, { edge, spread, y, z, rise }) {
  const rand = mulberry32(seed ^ 0x6a09e667);
  const locks = [];
  for (let i = 0; i < n; i++) {
    const out = newOut();
    const a = (i / (n - 1) - 0.5) * spread + (rand() - 0.5) * 0.12;
    const P = [at[0] + Math.sin(a) * edge, at[1] + y + Math.abs(a) * rise + (i % 2) * 0.012, at[2] + z - (i % 2) * 0.004];
    const N = norm([Math.sin(a) * 0.45, -0.25, -1]);
    const T = along([Math.sin(a) * 0.5 + (rand() - 0.5) * 0.2, -1, 0.12], N);
    const len = (0.062 - 0.012 * Math.abs(a)) * (0.85 + 0.4 * rand());
    addLock(out, P, N, T, { len, width: 0.05 * (0.9 + 0.2 * rand()), rise: 0.12, droop: 1.2, bend: (rand() - 0.5) * 0.3, rings: 3, sink: 0.3, edgeShade: 1, colourAt: (t, into) => { into[0] = 1; into[1] = 1; into[2] = 1; } });
    locks.push(out);
  }
  return locks;
}

// Carry collected locks from a part's metric frame into its mesh's own: the
// points less `origin`, divided by the mesh's `scale`; the normals by the
// transpose of that scale.
function inFrame(out, origin, scale) {
  for (let i = 0; i < out.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) out.pos[i + k] = (out.pos[i + k] - origin[k]) / scale[k];
    const nx = out.nor[i] * scale[0], ny = out.nor[i + 1] * scale[1], nz = out.nor[i + 2] * scale[2], L = Math.hypot(nx, ny, nz) || 1;
    out.nor[i] = nx / L; out.nor[i + 1] = ny / L; out.nor[i + 2] = nz / L;
  }
  return out;
}

// Add collected locks to `geo` (indexed; position and normal, a colour if it
// has one; any other attribute, such as a sphere's uv, grows with zeros).
// Records geo.userData.tufts = { start, count, index, indices } (the first tuft
// vertex, how many, the first tuft index and how many) and returns it; with no locks the
// geometry is untouched and it returns null. The arrays are grown in place of
// making a geometry to merge (see the block comment at the top).
export function appendTufts(geo, out) {
  const count = out.pos.length / 3;
  if (!count) return null;
  const start = geo.attributes.position.count;
  for (const name of Object.keys(geo.attributes)) {
    const old = geo.attributes[name], size = old.itemSize;
    const arr = new old.array.constructor(old.array.length + count * size);
    arr.set(old.array);
    const fill = name === 'position' ? out.pos : name === 'normal' ? out.nor : name === 'color' ? out.col : null;
    if (fill && size === 3) arr.set(fill, old.array.length);
    geo.setAttribute(name, new THREE.BufferAttribute(arr, size, old.normalized));
  }
  const old = geo.index.array, first = old.length;
  const idx = new (start + count > 65535 ? Uint32Array : old.constructor)(first + out.idx.length);
  idx.set(old);
  for (let k = 0; k < out.idx.length; k++) idx[first + k] = start + out.idx[k];
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  if (geo.boundingSphere) geo.computeBoundingSphere();
  if (geo.boundingBox) geo.computeBoundingBox();
  const prev = geo.userData.tufts;
  geo.userData.tufts = prev ? { ...prev, count: prev.count + count, indices: prev.indices + out.idx.length } : { start, count, index: first, indices: out.idx.length };
  return geo.userData.tufts;
}
