// =============================================================================
// THE TREEHOUSE VILLAGE: A LOW-POLY CAT (one merged, vertex-coloured mesh). The tree cats are scenery seen from a few metres: an ellipsoid body, a head, two cone ears, a tail of three boxes, two dark
// dots for eyes and a colour split (belly, muzzle, points, patches, stripes), all merged into ONE geometry per pose, about 450 triangles for a sitting cat and 400 for a curled one (the walk's own
// cat model is about 4,800 simple). No texture, no whiskers, no per-eye mesh. Two poses ('sit', 'nap'), both made facing -z with the feet at y 0. Pure: no random number, no clock. A lazy-free
// file of the branches stage (treehousecats.js uses it); it imports no cat model.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, placed, beam, slab } from './shapekit.js';

const DARK = 0x1c1816;
const NOSE = 0xd98a8a;
const ell = (rx, ry, rz, x, y, z, hex, w = 8, h = 6, o = {}) => paint(placed(new THREE.SphereGeometry(1, w, h), x, y, z, { sx: rx, sy: ry, sz: rz, ...o }), hex);
const cone = (r, hgt, x, y, z, hex, o = {}) => paint(placed(new THREE.ConeGeometry(r, hgt, 4, 1), x, y, z, o), hex);

/** The geometry of a cat in a pose: look { base, belly, accent, patch?, patches?, stripes?, points? }, pose 'sit' | 'nap' -> BufferGeometry (non-indexed, vertex colours). */
export function catGeometry(look, pose = 'sit', flick = false) {
  const L = look;
  const pts = L.points ? L.accent : null; // a pointed coat's ears, muzzle, paws and tail
  const earC = pts ?? L.base; const tailC = pts ?? L.accent; const pawC = pts ?? L.base;
  const g = [];
  if (pose === 'nap') {
    g.push(ell(0.25, 0.12, 0.21, 0, 0.12, 0.02, L.base, 8, 6));
    g.push(ell(0.17, 0.05, 0.12, 0, 0.07, -0.04, L.belly, 6, 4));
    g.push(ell(0.115, 0.1, 0.1, 0.07, 0.11, -0.22, pts ?? L.base, 8, 6)); // the head, resting on her paws
    g.push(ell(0.05, 0.04, 0.035, 0.07, 0.08, -0.31, L.belly, 5, 4));
    g.push(cone(0.045, 0.1, 0.0, 0.21, -0.2, earC, { pitch: -0.2 })); g.push(cone(0.045, 0.1, 0.14, 0.2, -0.2, earC, { pitch: -0.2 }));
    g.push(slab(0.035, 0.125, -0.31, 0.04, 0.008, 0.01, DARK)); g.push(slab(0.105, 0.125, -0.31, 0.04, 0.008, 0.01, DARK)); // closed eyes
    for (const [x0, z0, x1, z1] of [[-0.2, 0.12, -0.17, 0.0], [-0.17, 0.0, -0.08, -0.2], [-0.08, -0.2, 0.05, -0.27]]) g.push(beam(x0, 0.08, z0, x1, 0.08, z1, 0.07, tailC)); // the tail round her
    g.push(beam(-0.2, 0.08, 0.2, -0.2, 0.08, 0.12, 0.07, tailC));
  } else {
    g.push(ell(0.16, 0.26, 0.17, 0, 0.27, 0.04, L.base, 8, 6));
    g.push(ell(0.1, 0.17, 0.07, 0, 0.25, -0.1, L.belly, 6, 4)); // the chest
    for (const s of [-1, 1]) {
      g.push(ell(0.07, 0.11, 0.15, 0.13 * s, 0.1, 0.06, L.base, 6, 4)); // a haunch
      g.push(paint(placed(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 5), 0.065 * s, 0.15, -0.1), L.belly)); // a front leg
      g.push(ell(0.045, 0.025, 0.06, 0.065 * s, 0.02, -0.14, pawC, 5, 3)); // a paw
    }
    g.push(ell(0.14, 0.12, 0.12, 0, 0.58, -0.1, L.base, 8, 6)); // the head
    g.push(ell(0.06, 0.045, 0.04, 0, 0.545, -0.205, pts ?? L.belly, 5, 3)); // the muzzle
    g.push(ell(0.015, 0.012, 0.012, 0, 0.565, -0.24, NOSE, 4, 3));
    for (const s of [-1, 1]) {
      g.push(cone(0.05, 0.11, 0.085 * s, 0.7, -0.08, earC, { yaw: 0, pitch: 0 }));
      g.push(ell(0.018, 0.02, 0.012, 0.05 * s, 0.6, -0.208, DARK, 4, 3)); // an eye: a dark dot
    }
    if (flick) for (const [x0, y0, z0, x1, y1, z1] of [[0.1, 0.04, 0.2, 0.22, 0.04, 0.14], [0.22, 0.04, 0.14, 0.34, 0.1, 0.02], [0.34, 0.1, 0.02, 0.4, 0.22, -0.06]]) g.push(beam(x0, y0, z0, x1, y1, z1, 0.07, tailC)); // the tail flicked out to her side (the stray at the Fairground swaps to it now and then)
    else for (const [x0, z0, x1, z1] of [[0.1, 0.2, 0.2, 0.08], [0.2, 0.08, 0.2, -0.1], [0.2, -0.1, 0.1, -0.2]]) g.push(beam(x0, 0.04, z0, x1, 0.04, z1, 0.07, tailC)); // the tail round her paws
  }
  if (L.stripes) for (const [x, z] of pose === 'nap' ? [[0.1, 0.0], [-0.04, 0.02], [-0.16, 0.06]] : [[-0.16, 0.0], [-0.16, 0.12], [0.16, 0.0], [0.16, 0.12]]) {
    g.push(pose === 'nap' ? slab(x, 0.235, z, 0.04, 0.012, 0.26, L.accent) : slab(x, 0.33, z, 0.014, 0.18, 0.045, L.accent));
  }
  if (L.patches) { g.push(ell(0.09, 0.08, 0.08, pose === 'nap' ? 0.1 : 0.06, pose === 'nap' ? 0.2 : 0.4, 0.0, L.accent, 5, 4)); g.push(ell(0.08, 0.07, 0.08, pose === 'nap' ? -0.1 : -0.07, pose === 'nap' ? 0.18 : 0.3, 0.1, L.patch, 5, 4)); }
  const merged = mergeGeometries(g);
  for (const x of g) x.dispose();
  return merged;
}
export const triCount = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
