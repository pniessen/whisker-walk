import * as THREE from 'three';
import { TORSO, deformTorso, shellInflate } from './torso.js';

// The capes' cloth (moved out of model.js so backitems.js reads CAPE and
// CAPE_SIT without an import cycle; model.js re-exports all four names).
// A cape (either) is a cloak (polish-pose Task 2): cloth hung on the torso
// (capeGeometry, below), with no scale of its own, so it follows every pose as
// the coats do. It was a 32×40 cm slab behind the rump that read, the owner
// said, "like a dishtowel draped over the tail". Its grid runs across a (-1 one
// flank, 0 the spine, +1 the other) and along s (0 the neck edge, 1 the hem):
// the unit direction's z goes from zFront to zBackAt(a) = zBack + (zBackSide -
// zBack)·a², short at the spine so the tail comes out from under the hem, long
// round the haunches; its half-wrap from the top line blends wrapFront (over
// the shoulders) through wrapMid to wrapBack (the haunch), radians. A point is
// the torso's own surface there, inflated like a coat (shellInflate) and by
// `inflate` more, the lower edge pushed out sideways by up to `flare` so it
// hangs off the flank like cloth. Measured on every preset, full and simple,
// in every state at t 0.4/1.3/2.2 (and walking at 1.5): the cloth is never
// nearer the fur than 1.5 cm (nap) nor the ground than 16 cm (the stalk; the
// sit wears CAPE_SIT, below, which is 15.6 cm up; this cloth was 1.6), and
// never nearer the tail's root than 4.2 cm (stretch) — a longer spine (zBack)
// reaches it. The neck edge's spine end lies under the head.
export const CAPE = Object.freeze({ zFront: -0.8, zBack: 0.68, zBackSide: 0.98, wrapFront: 1.9, wrapMid: 1.85, wrapBack: 1.7, inflate: 1.03, flare: 0.08 });
// The sit's cloth (polish-pose fix wave): the same cloak with its haunch hem
// taken up, worn only in the sit (animator.js swaps the geometry; both are
// built here). The upright sit curls the tail forward round the left haunch
// on the ground, and the standing hem (zBackSide 0.98, half-wrap 1.7 down the
// flank, flared) lay over that curl: from behind and above 192 of 464 seen
// tabby tail vertices were under the cloth, and it came within 0.1 mm of
// link 2 (it clipped). Here the hem ends further forward round the haunch
// (zBackSide 0.75) and higher up the flank (wrapBack 1.0 rad). Measured on
// every preset, full and simple, both sits at t 0..3 every 0.5, from behind
// and from behind-left at the walk camera's distance: no seen tail vertex is
// under the cloth (wrapBack 1.1 left Digit's flicking tip 3-5% under it), and
// the cloth is at least 4.5 cm from every tail vertex (Digit; 5.7 the
// others). Its lowest point is 15.6 cm off the ground (the standing cloth came to 1.6 in the sit). The
// neck edge (s 0) is the same, so the clasp does not move; the sitting back
// is still covered from the shoulders to the hips.
export const CAPE_SIT = Object.freeze({ ...CAPE, zBackSide: 0.75, wrapBack: 1.0 });
// The cape's point at (a, s): a across (-1 one flank, 0 the spine, +1 the
// other), s along (0 the neck edge, 1 the hem). Body-local, before the body's
// scale (the frame of the torso's own geometry). See CAPE.
const capeSmooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export function capePoint(a, s, out = new THREE.Vector3(), C = CAPE) {
  const wrap = s < 0.5
    ? C.wrapFront + (C.wrapMid - C.wrapFront) * capeSmooth(0, 0.5, s)
    : C.wrapMid + (C.wrapBack - C.wrapMid) * capeSmooth(0.5, 1, s);
  const zBackAt = C.zBack + (C.zBackSide - C.zBack) * a * a;
  const uz = C.zFront + (zBackAt - C.zFront) * s;
  const r = Math.sqrt(1 - uz * uz), phi = a * wrap;
  const dx = r * Math.sin(phi), dy = r * Math.cos(phi);
  const [x, y, z] = deformTorso(dx, dy, uz);
  const k = TORSO.R * shellInflate(dy) * C.inflate;
  out.set(x * k, y * k, z * k);
  out.x += Math.sign(dx) * C.flare * capeSmooth(0.3, -0.2, dy);
  return out;
}

// The cape's cloth: a grid of (a, s), 24×20 (12×10 simple), double-sided.
export function capeGeometry(simple, C = CAPE) {
  const [na, ns] = simple ? [12, 10] : [24, 20];
  const pos = new Float32Array((na + 1) * (ns + 1) * 3), idx = [], p = new THREE.Vector3();
  for (let j = 0; j <= ns; j++) {
    for (let i = 0; i <= na; i++) {
      capePoint(-1 + (2 * i) / na, j / ns, p, C);
      p.toArray(pos, (j * (na + 1) + i) * 3);
      if (i < na && j < ns) {
        const q = j * (na + 1) + i, r = q + na + 1;
        idx.push(q, r, q + 1, q + 1, r, r + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
