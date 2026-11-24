// =============================================================================
// THE MOON'S STAR FIGURES AS DRAWING (milestone 5): the five star pictures and the Great Cat as thin quads in ONE mesh each, wherever they
// are drawn: on the real sky (hung on the camera, lit once traced), on the Star Table's top (five small pictures, each dim until traced)
// and on the observatory's ceiling (the Great Cat, faint always, bright when all five are traced). One merged mesh with vertex colours
// and one additive material, so a figure costs one draw call and the lit state is a colour write (setLevel). No random number, no clock.
// =============================================================================

import * as THREE from 'three';
import { CONSTELLATIONS, GREAT_CAT, starSky, catSky, skyDir } from './moonstars.js';

export const FIG_COL = Object.freeze({ line: [0.55, 0.75, 1.0], star: [1.0, 0.94, 0.7] });
const _s = new THREE.Vector3();
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();

// A builder of quads. line(p, q, n, width) and dot(p, n, size) push into the arrays; part(key) marks where a named range starts and ends.
function createQuads() {
  const pos = [];
  const ranges = {};
  const stars = new Set(); // the indices of the quads that are stars (lit a little brighter than the lines)
  let open = null;
  const quad = (p0, p1, p2, p3, star = false) => { if (star) stars.add(pos.length / 18); for (const p of [p0, p1, p2, p0, p2, p3]) pos.push(p.x, p.y, p.z); };
  return {
    part(key) {
      if (open) ranges[open.key] = [open.at, pos.length / 3 - open.at];
      open = key ? { key, at: pos.length / 3 } : null;
    },
    line(p, q, n, width) {
      _s.subVectors(q, p).cross(n);
      if (_s.lengthSq() < 1e-12) return;
      _s.normalize().multiplyScalar(width / 2);
      quad(p.clone().sub(_s), p.clone().add(_s), q.clone().add(_s), q.clone().sub(_s));
    },
    dot(p, n, size) {
      _t1.set(0, 1, 0);
      if (Math.abs(n.y) > 0.95) _t1.set(1, 0, 0);
      _t1.cross(n).normalize().multiplyScalar(size / 2);
      _t2.copy(n).cross(_t1).normalize().multiplyScalar(size / 2);
      const c = p;
      quad(c.clone().sub(_t1).sub(_t2), c.clone().add(_t1).sub(_t2), c.clone().add(_t1).add(_t2), c.clone().sub(_t1).add(_t2), true);
    },
    finish() {
      this.part(null);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
      g.userData.ranges = ranges;
      g.userData.starQuads = stars;
      return g;
    },
  };
}

// The quad triangles of one segment are 6 vertices; a star is 6 vertices; ranges say which vertices belong to which picture and which are
// stars (the second list: a star's vertices are lit brighter than a line's).
function chain(Q, pts, n, width, size, closed = false) {
  for (let i = 0; i + 1 < pts.length; i++) Q.line(pts[i], pts[i + 1], n(pts[i]), width);
  if (closed && pts.length > 2) Q.line(pts[pts.length - 1], pts[0], n(pts[0]), width);
  for (const p of pts) Q.dot(p, n(p), size);
}

// The figures on the sky: five pictures and the Great Cat, each its own range ('c0'..'c4', 'cat'). `radius` is the sphere they hang on; the
// quads face the middle (the camera). `lineW` and `starS` are in metres at that radius.
export function skyFigureGeometry(radius = 280, lineW = 1.1, starS = 3.2) {
  const Q = createQuads();
  const dir = { x: 0, y: 0, z: 0 };
  const at = (s) => { skyDir(s.b, s.e, dir); return new THREE.Vector3(dir.x, dir.y, dir.z).multiplyScalar(radius); };
  const facing = (p) => p.clone().normalize().negate();
  CONSTELLATIONS.forEach((c, k) => {
    Q.part(`c${k}`);
    chain(Q, c.pts.map((_, i) => at(starSky(c, i))), facing, lineW, starS);
  });
  Q.part('cat');
  chain(Q, GREAT_CAT.outline.map(([x, y]) => at(catSky(x, y))), facing, lineW, starS * 0.7, true);
  chain(Q, GREAT_CAT.tail.map(([x, y]) => at(catSky(x, y))), facing, lineW, starS * 0.7);
  for (const [x, y] of GREAT_CAT.eyes) { const p = at(catSky(x, y)); Q.dot(p, facing(p), starS * 1.2); }
  return Q.finish();
}

// The five pictures on the Star Table's top: laid flat in the xz plane, each in its own slot round a ring, `deg` metres per degree of sky,
// facing up. Ranges 'c0'..'c4'.
export function tableFigureGeometry(ringR = 0.62, deg = 0.034, lineW = 0.035, starS = 0.1) {
  const Q = createQuads();
  const up = new THREE.Vector3(0, 1, 0);
  CONSTELLATIONS.forEach((c, k) => {
    const a = (k / CONSTELLATIONS.length) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(a) * ringR;
    const cz = Math.sin(a) * ringR;
    Q.part(`c${k}`);
    // east is +x, up in the sky is toward the table's centre's far side (-z)
    chain(Q, c.pts.map(([u, v]) => new THREE.Vector3(cx + u * deg, 0, cz - v * deg)), () => up, lineW, starS);
  });
  return Q.finish();
}

// The Great Cat on the inside of a dome of radius R (the quads face down into it): figure units laid on a tangent plane at the top and
// pushed out to the sphere, `m` metres per unit. One range, 'cat'.
export function ceilingFigureGeometry(R = 4.0, m = 1.05, lineW = 0.05, starS = 0.14) {
  const Q = createQuads();
  Q.part('cat');
  const onDome = ([x, y]) => {
    const px = x * m;
    const pz = -(y - 1.15) * m; // up the picture is toward the back (north)
    const py = Math.sqrt(Math.max(0.01, R * R - px * px - pz * pz));
    return new THREE.Vector3(px, py, pz);
  };
  const facing = (p) => p.clone().normalize().negate();
  chain(Q, GREAT_CAT.outline.map(onDome), facing, lineW, starS, true);
  chain(Q, GREAT_CAT.tail.map(onDome), facing, lineW, starS);
  for (const e of GREAT_CAT.eyes) { const p = onDome(e); Q.dot(p, facing(p), starS * 1.5); }
  return Q.finish();
}

// Several figure geometries as ONE (one mesh, one draw): each part's ranges are kept under its prefix + its own key ('t' + 'c0' -> 'tc0').
export function mergeFigures(parts) {
  const pos = [];
  const ranges = {};
  const stars = new Set();
  let at = 0;
  for (const [prefix, geo] of parts) {
    const a = geo.attributes.position.array;
    for (let i = 0; i < a.length; i++) pos.push(a[i]);
    for (const [k, [start, count]] of Object.entries(geo.userData.ranges)) ranges[prefix + k] = [at + start, count];
    for (const q of geo.userData.starQuads) stars.add(at / 6 + q);
    at += a.length / 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  g.userData.ranges = ranges;
  g.userData.starQuads = stars;
  return g;
}

// setLevel(geo, key, k): light the figure's range to level k (0 dark, 1 full). Stars are lit a little brighter than their lines.
export function setLevel(geo, key, k) {
  const r = geo.userData.ranges?.[key];
  if (!r) return;
  const col = geo.attributes.color;
  const [start, count] = r;
  for (let v = 0; v < count; v++) {
    const star = geo.userData.starQuads?.has(Math.floor((start + v) / 6)); // a quad is 6 vertices
    const base = star ? FIG_COL.star : FIG_COL.line;
    const f = star ? Math.min(1, k * 1.15) : k * 0.8;
    col.setXYZ(start + v, base[0] * f, base[1] * f, base[2] * f);
  }
  col.needsUpdate = true;
}

// The material every figure mesh shares in kind: additive, vertex-coloured, double-sided, never writes depth.
export function figureMaterial({ depthTest = true } = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, side: THREE.DoubleSide, fog: false, toneMapped: false });
}
