// =============================================================================
// THE SHAPE KIT: the small painted shapes the low-poly cats (treehousecatmesh.js) and the Treehouse's drawing kit (treehouseparts.js) share. Pure: three only, no clock, no random number.
// Split out of treehouseparts.js so a place that draws a cat need not load the Treehouse's drawing kit.
// =============================================================================
import * as THREE from 'three';

const _c = new THREE.Color();

// Paint a geometry one colour (non-indexed, with position, normal, uv and colour so any two merge). `jitter` gives each piece its own tone.
export function paint(geo, hex, jitter = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  if (jitter) _c.offsetHSL(jitter * 0.02, 0, jitter * 0.08);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const S = new THREE.Vector3();
const V = new THREE.Vector3();
export function placed(geo, x, y, z, { yaw = 0, pitch = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  Q.setFromEuler(E.set(pitch, yaw, 0, 'YXZ'));
  geo.applyMatrix4(M4.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)));
  return geo;
}
// A box with its centre at (x, y, z).
export const slab = (x, y, z, w, h, d, hex, { yaw = 0, pitch = 0, jitter = 0 } = {}) => paint(placed(new THREE.BoxGeometry(w, h, d), x, y, z, { yaw, pitch }), hex, jitter);
// A beam from (x0,y0,z0) to (x1,y1,z1), `t` thick.
export function beam(x0, y0, z0, x1, y1, z1, t, hex, jitter = 0) {
  const dx = x1 - x0; const dy = y1 - y0; const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(t, t, len);
  Q.setFromUnitVectors(V.set(0, 0, 1), S.set(dx / len, dy / len, dz / len));
  g.applyMatrix4(M4.compose(V.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), Q, S.set(1, 1, 1)));
  return paint(g, hex, jitter);
}
