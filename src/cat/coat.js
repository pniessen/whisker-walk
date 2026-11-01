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

// A STYLE row's coat. Patch `at` points are in the old torso's frame
// (LEGACY_BODY), where they were authored; `frame` is the row's body factors.
export function coatFromStyle(s) {
  const patches = [];
  if (s.patches) {
    patches.push({ at: [0.12, 0.54, -0.08], halfX: 0.62, halfZ: 0.72, colour: s.accent });
    patches.push({ at: [-0.12, 0.54, 0.14], halfX: 0.56, halfZ: 0.64, colour: 0x333333 });
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
    frame: s.body ?? [1, 1, 1],
  };
}

// Paint `coat` into `geo`'s colour attribute, per vertex of geo.userData.unit:
// base fur, then the tabby pattern toward `accent`, then each patch in order.
export function paintCoat(geo, coat) {
  const unit = geo.userData.unit;
  const n = unit.length / 3;
  const scale = LEGACY_BODY.SCALE.map((k, i) => k * coat.frame[i]);
  const patches = coat.patches.map((p) => {
    const dir = p.at.map((a, i) => (a - LEGACY_BODY.CENTRE[i]) / scale[i]);
    return { dir, halfX: p.halfX, halfZ: p.halfZ, colour: new THREE.Color(p.colour), toPole: poleFrame(dir) };
  });
  const base = new THREE.Color(coat.base);
  const accent = new THREE.Color(coat.accent);
  const c = new THREE.Color();
  const col = new Float32Array(n * 3);
  const u = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    u[0] = unit[i * 3]; u[1] = unit[i * 3 + 1]; u[2] = unit[i * 3 + 2];
    c.copy(base);
    if (coat.stripes) c.lerp(accent, tabbyMix(u[0], u[1], u[2]) * coat.stripeStrength);
    for (const p of patches) {
      const m = patchMask(u, p, p.toPole);
      if (m > 0) c.lerp(p.colour, m);
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
