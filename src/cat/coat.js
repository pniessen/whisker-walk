import * as THREE from 'three';
import { LEGACY_BODY } from './torso.js';

// Painted coats (cat body Task 4). A cat's body markings — tabby bands, the
// calico's patches, Robbie's bib and flanks, D2's shoulder band — used to be
// separate patch meshes lying on the torso, one draw call per colour. They are
// now painted into the torso's own vertex colours, so they cost no meshes at
// all, cannot z-fight, and follow every squash and stretch of the torso.
// Everything here works on each vertex's UNDEFORMED unit direction
// (torsoGeometry's userData.unit), nose at -z, spine at +y.

export const WHITE_FUR = 0xf5f5f5;

// How far past a patch's ellipse its edge fades out, in units of that ellipse.
export const PATCH_EDGE = 0.12;

// The tabby pattern: ~7 broken, uneven bands from nose to tail, a dark line
// down the spine, all fading out before the belly. 0 is clean base fur, 1 is
// full accent. Copied verbatim from the approved Version 2 sketch.
export function tabbyMix(x, y, z) {
  const a = Math.atan2(x, y);                          // 0 on the spine, ±π under the belly
  const wob = 0.10 * Math.sin(a * 3.1 + z * 4.7) + 0.05 * Math.sin(a * 7.3 - z * 9.1);
  const t = (z + 1) * 3.4 + wob;                       // ~7 bands nose to tail
  const k = Math.floor(t), f = t - k;
  const h = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const width = 0.16 + 0.16 * h(k);                    // each band its own width
  const edge = 0.10;
  let band = 1 - Math.min(1, Math.max(0, (Math.abs(f - 0.5) - width) / edge));
  band *= 0.55 + 0.45 * Math.max(0, Math.sin(a * 5.3 + z * 6.1 + k * 1.7) * 0.5 + 0.5); // breaks along the band
  const spine = Math.exp(-(a * a) / 0.06);             // dark line down the back
  const sides = Math.min(1, Math.max(0, (y + 0.35) / 0.55)); // fade before the belly
  return Math.min(1, Math.max(band, spine * 0.8) * sides);
}

const UP = new THREE.Vector3(0, 1, 0);
const poleFrame = (dir) => new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize()).invert();
const v = new THREE.Vector3();

// How much of a patch covers the unit direction `unit`: the same tangent-plane
// ellipse model.js's patchGeometry draws (halfX/halfZ are tangent half-extents
// at the patch's pole), 1 inside it, fading linearly to 0 over PATCH_EDGE,
// and 0 on the far hemisphere. `toPole` is an optional precomputed frame.
export function patchMask(unit, { dir, halfX, halfZ }, toPole = poleFrame(dir)) {
  v.set(unit[0], unit[1], unit[2]).applyQuaternion(toPole);
  if (v.y <= 0) return 0;
  const e = Math.hypot(v.x / v.y / halfX, v.z / v.y / halfZ);
  if (e <= 1) return 1;
  return Math.max(0, 1 - (e - 1) / PATCH_EDGE);
}

// COAT DETAIL (cat realism A5, 2026-11-15). Colour only, and only on a coat
// built with `detail` (model.js: every cat but the four family cats, whose
// markings are drawn from photos):
//   * every coat: a slightly darker line along the back (`back` of the base
//     fur's brightness off, in a soft band `backW` wide about the spine, in
//     the same angle the tabby's own spine line uses) and a slightly paler
//     underside (the base fur eased `under` of the way to the belly colour
//     from `underFrom` down to `underTo`, undeformed unit y). Both are laid on
//     the base fur, under the stripes and the patches: a calico's patches, a
//     pointed cat's points and a clan coat's patches are exactly as they were,
//     and a black cat stays black (its belly is a shade off its coat).
//   * striped coats: one or two "necklace" bars across the chest (`necklace`
//     of the way to the stripe colour, at `bars` on the chest ball's own
//     height, `barW` half-wide, on its front: the ball's rings level with its
//     centre and 30° under it, so the pale ring between them, where the bib's
//     middle is, stays the bib's own colour), and barred legs (limbs.js
//     paintLimb: `legBars` of the way to the stripe colour at `legAt` along
//     the leg, `legW` half-wide).
export const COAT_DETAIL = Object.freeze({
  back: 0.1, backW: 0.14, under: 0.3, underFrom: -0.1, underTo: -0.7,
  necklace: 0.45, bars: Object.freeze([0, -0.577]), barW: 0.12,
  legBars: 0.5, legAt: Object.freeze([2 / 9, 4 / 9, 6 / 9]), legW: 0.09,
});
// How much of a necklace bar lies at the unit direction `d` from the chest's centre (cat frame).
export function necklaceMix(d) {
  const front = Math.min(1, Math.max(0, (-d[2] - 0.1) / 0.3));
  if (front <= 0) return 0;
  let bar = 0;
  for (const at of COAT_DETAIL.bars) bar = Math.max(bar, 1 - Math.abs(d[1] - at) / COAT_DETAIL.barW);
  return bar <= 0 ? 0 : bar * front * COAT_DETAIL.necklace;
}
// The leg bars' share of the stripe colour at curve parameter t (0 hip .. 1 paw).
export function legBarMix(t) {
  let bar = 0;
  for (const at of COAT_DETAIL.legAt) bar = Math.max(bar, 1 - Math.abs(t - at) / COAT_DETAIL.legW);
  return Math.max(0, bar) * COAT_DETAIL.legBars;
}

// A STYLE row's coat. Patch `at` points are in the old torso's frame
// (LEGACY_BODY), where they were authored; `frame` is the row's body factors.
// `detail`: the coat detail above (off unless asked for).
export function coatFromStyle(s, { detail = false } = {}) {
  const patches = [];
  if (s.patches) {
    patches.push({ at: [0.12, 0.54, -0.08], halfX: 0.62, halfZ: 0.72, colour: s.accent });
    // patch2 (Clan Life Part 1): a row's own second patch colour, so a clan
    // tortoiseshell stays in its palette. The calico has none: unchanged.
    patches.push({ at: [-0.12, 0.54, 0.14], halfX: 0.56, halfZ: 0.64, colour: s.patch2 ?? 0x333333 });
    // cat-beauty A5 (the calico's own row, `calicoMore`): a real calico is
    // white below with BIG patches of both colours on top, so add a black
    // saddle over the hips, an orange one on the right haunch and a black spot
    // on the left shoulder. Painted, so free.
    if (s.calicoMore) {
      patches.push({ at: [0.05, 0.56, 0.36], halfX: 0.7, halfZ: 0.42, colour: s.patch2 ?? 0x333333 });
      patches.push({ at: [0.24, 0.42, 0.40], halfX: 0.5, halfZ: 0.5, colour: s.accent });
      patches.push({ at: [-0.24, 0.48, -0.28], halfX: 0.45, halfZ: 0.4, colour: s.patch2 ?? 0x333333 });
    }
  }
  if (s.cow) {
    // Robbie: white flanks low on each side, and the bib on the front of the chest.
    patches.push({ at: [0.27, 0.27, 0.06], halfX: 0.70, halfZ: 0.90, colour: s.belly });
    patches.push({ at: [-0.27, 0.27, 0.06], halfX: 0.70, halfZ: 0.90, colour: s.belly });
    patches.push({ at: [0, 0.36, -0.43], halfX: 0.55, halfZ: 0.75, colour: s.belly });
  }
  // D2's white band over the shoulders; last, so it covers the stripes under it.
  if (s.band) patches.push({ at: [0, 0.58, -0.30], halfX: 1.45, halfZ: 0.14, colour: s.belly });
  return {
    base: s.base,
    belly: s.belly,
    accent: s.accent,
    stripes: !!s.stripes,
    stripeStrength: s.stripes ? 0.9 : 0,
    patches,
    chest: s.bib ? WHITE_FUR : s.belly,
    detail: !!detail,
    frame: s.body ?? [1, 1, 1],
  };
}

// A coat's patches, resolved once into the torso's unit-direction frame.
// Cached per coat object (a coat is built once per cat and never edited).
const prepared = new WeakMap();
function prepare(coat) {
  let p = prepared.get(coat);
  if (p) return p;
  const scale = LEGACY_BODY.SCALE.map((k, i) => k * coat.frame[i]);
  const patches = coat.patches.map((q) => {
    const dir = q.at.map((a, i) => (a - LEGACY_BODY.CENTRE[i]) / scale[i]);
    return { dir, halfX: q.halfX, halfZ: q.halfZ, colour: new THREE.Color(q.colour), toPole: poleFrame(dir) };
  });
  p = { patches, base: new THREE.Color(coat.base), accent: new THREE.Color(coat.accent), belly: new THREE.Color(coat.belly) };
  prepared.set(coat, p);
  return p;
}

// The base fur `out` (a THREE.Color, changed in place) with the coat detail's
// paler underside (eased toward `belly`) and darker line along the back at
// the undeformed unit direction `unit` (COAT_DETAIL).
export function furDetail(out, belly, unit) {
  const D = COAT_DETAIL;
  const k = Math.min(1, Math.max(0, (unit[1] - D.underFrom) / (D.underTo - D.underFrom)));
  if (k > 0) out.lerp(belly, D.under * k * k * (3 - 2 * k));
  if (unit[1] > 0) { const a = Math.atan2(unit[0], unit[1]); out.multiplyScalar(1 - D.back * Math.exp(-(a * a) / D.backW)); }
  return out;
}

// The colour `coat` paints at the undeformed unit direction `unit` ([x, y, z]):
// base fur, then the tabby pattern toward `accent`, then each patch in order.
// paintCoat paints every torso vertex with it; a limb's top blends from it.
export function coatColourAt(coat, unit, out = new THREE.Color()) {
  const { patches, base, accent, belly } = prepare(coat);
  out.copy(base);
  if (coat.detail) furDetail(out, belly, unit);
  if (coat.stripes) out.lerp(accent, tabbyMix(unit[0], unit[1], unit[2]) * coat.stripeStrength);
  for (const p of patches) {
    const m = patchMask(unit, p, p.toPole);
    if (m > 0) out.lerp(p.colour, m);
  }
  return out.multiplyScalar(furShade(unit[0], unit[1], unit[2]));
}

// SOFT FUR SHADING (cat-beauty A4): a baked ambient-occlusion term on the
// coat, by undeformed torso direction. The fur darkens toward the underside
// (the sky cannot reach it) and a little more where the legs join (the armpit
// and the groin, low at the front and back), so the torso reads as a rounded
// furry body rather than an evenly lit ball. It is part of the coat colour, so
// the limb tops (limbs.js) and the underside's eased rim (undersideColourAt)
// take it too and every seam still matches. Colour only.
export const FUR_SHADE = Object.freeze({ low: 0.2, joint: 0.1, from: -0.05, to: -0.85 });
export function furShade(x, y, z) {
  const k = Math.min(1, Math.max(0, (y - FUR_SHADE.from) / (FUR_SHADE.to - FUR_SHADE.from)));
  const low = k * k * (3 - 2 * k);
  const j = Math.max(0, Math.abs(z) - 0.35) / 0.65; // toward the shoulders' and hips' ends
  return 1 - FUR_SHADE.low * low - FUR_SHADE.joint * low * j;
}

// Paint `coat` into `geo`'s colour attribute, per vertex of geo.userData.unit.
export function paintCoat(geo, coat) {
  const unit = geo.userData.unit;
  const n = unit.length / 3;
  const c = new THREE.Color();
  const col = new Float32Array(n * 3);
  const u = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    u[0] = unit[i * 3]; u[1] = unit[i * 3 + 1]; u[2] = unit[i * 3 + 2];
    coatColourAt(coat, u, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// The underside's chest and belly (polish-catlooks, 2026-11-02). Painted one
// solid pale colour, each ball showed a hard disc where it left the torso (the
// "snowman"). Now each is its pale colour only where it faces out along its
// front axis, easing (smoothstep) to the coat painted on the torso under it by
// its rim, so stripes, patches, Robbie's bib and D2's band run on over it.
// `inner`/`outer` are cosine distances off the front axis (0 on the axis, 1 at
// 90° off it).
// The chest's axis looks forward and a little DOWN, (0, -0.27, -1), 15° below
// level (polish-sit Task 3). The sit now pitches the torso NOSE-UP by 0.75
// rad (torso.js SIT), and the old axis, (0, 0.15, -1), 8° up, put the bib's
// pale cap 56-67° up in the sit: a pale band under the chin, the ball's lower
// half the coat. Tilted down, the cap (the mean of its palest vertices, from
// the chest's centre; catcoat.test.js) looks 15-22° DOWN standing and 14-23°
// UP sitting on every preset, so a front camera sees the bib's middle in
// both. On this axis the chest meets the torso nearer the axis (its lower
// edge on D2 and the socks look), so the band is pulled in: full colour out
// to 0.05 (~18°), the coat by 0.8 (~78°). Measured against catcoat.test.js:
// outer 0.85 leaves D2's rim 0.13 off its coat (allowed 0.12); 0.75 puts 91%
// of the change on one edge of the simple Digit's chest (allowed 90%).
// The belly hugs the torso (never more than ~4 mm proud) and sinks under the
// coat from ~0.2-0.45 off straight down, so its band is tight: a soft pale
// smudge, mostly hidden. Brief's starting values were { inner: 0.35, outer:
// 0.85 } on the down-tilted axis: past that axis's rim (0.67), so it kept a
// pale edge.
export const UNDER_BLEND = Object.freeze({ inner: 0.05, outer: 0.8 });
export const BELLY_BLEND = Object.freeze({ inner: 0, outer: 0.38 });
// The parts' front axes, cat frame (nose at -z).
export const UNDER_FRONT = Object.freeze({
  chest: Object.freeze(new THREE.Vector3(0, -0.27, -1).normalize().toArray()),
  belly: Object.freeze([0, -1, 0]),
});

const paleC = new THREE.Color();
// The colour at an underside vertex: `bellyHex` where the unit direction from
// the part's centre (`unitFromPartCentre`, cat frame) lies on `front`, easing
// over `band` to coatColourAt(coat, unitOnTorso) — `unitOnTorso` being the
// UNDEFORMED torso direction under the vertex (torso.js torsoUnitAt).
export function undersideColourAt(coat, bellyHex, unitFromPartCentre, unitOnTorso, out = new THREE.Color(),
  front = UNDER_FRONT.chest, band = UNDER_BLEND) {
  const cd = 1 - (unitFromPartCentre[0] * front[0] + unitFromPartCentre[1] * front[1] + unitFromPartCentre[2] * front[2]);
  const x = Math.min(1, Math.max(0, (cd - band.inner) / (band.outer - band.inner)));
  const t = x * x * (3 - 2 * x);
  coatColourAt(coat, unitOnTorso, out);
  if (t < 1) out.lerp(paleC.set(bellyHex), 1 - t);
  // a striped coat's necklace bars, across the chest only (COAT_DETAIL)
  if (coat.detail && coat.stripes && front === UNDER_FRONT.chest) {
    const m = necklaceMix(unitFromPartCentre);
    if (m > 0) out.lerp(prepare(coat).accent, m);
  }
  return out;
}
