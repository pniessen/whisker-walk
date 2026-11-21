import * as THREE from 'three';

// Her head's box, in the head part's own frame (shared by the soft bumps in
// player.js and the head scratch in src/people/reach.js, so both read her
// head the same way). Every mesh on the head part counts (what she wears on
// it too), but not an ear that stands wholly off her midline (the hand rests
// between her ears; a hen's comb is on the midline and counts), nor lines
// (whiskers). `worn: false` leaves out what she wears on her head (a mesh
// with userData.hat, and all under it): her own head, for her ears.
// Measuring walks every vertex, so callers keep the result per head part.
export const EAR_OFF = 0.03; // (head frame) an ear wholly this far off her midline is left out

const _inv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _pt = new THREE.Vector3();
const _ear = new THREE.Box3();

export const within = (o, root) => { for (let q = o; q; q = q.parent) if (q === root) return true; return false; };
const worn = (o, root) => { for (let q = o; q && q !== root; q = q.parent) if (q.userData?.hat) return true; return false; };

// every vertex of obj's meshes (but those `skip` says), in frame's frame, into box
export function boxInFrame(frame, obj, box, skip) {
  _inv.copy(frame.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || o.isSprite || (skip && skip(o))) return;
    const pos = o.geometry?.attributes?.position;
    if (!pos) return;
    _rel.multiplyMatrices(_inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) box.expandByPoint(_pt.fromBufferAttribute(pos, i).applyMatrix4(_rel));
  });
  return box;
}

// The ears that stand wholly off her midline (head frame), into `out`.
export function earsOffMidline(parts, out = []) {
  out.length = 0;
  const head = parts.head;
  head.updateWorldMatrix(true, true);
  for (const ear of [parts.earL, parts.earR]) {
    if (!ear || !within(ear, head)) continue;
    boxInFrame(head, ear, _ear.makeEmpty());
    if (!_ear.isEmpty() && (_ear.min.x >= EAR_OFF || _ear.max.x <= -EAR_OFF)) out.push(ear);
  }
  return out;
}

// The head's box (head frame) into `box`: { worn } as above.
export function headBoxIn(parts, box, { worn: wearing = true } = {}) {
  const head = parts.head;
  const off = earsOffMidline(parts);
  return boxInFrame(head, head, box.makeEmpty(), (o) => off.some((ear) => within(o, ear)) || (!wearing && worn(o, head)));
}
