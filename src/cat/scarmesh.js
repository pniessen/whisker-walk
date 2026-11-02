import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import { HEAD, SKULL } from './torso.js';

// The scar mesh (2026-11-01 fight moves and scars, Task 4). A scar is three
// short scratch lines (sketch E): thin strips raised a hair off the head or
// the torso, vertex-coloured by how far the scar has faded. Coats are painted
// per vertex (coat.js) and far too coarse for a crisp line, so the strips are
// real geometry. A cat's scars (at most two, scars.js) are ONE mesh hung on the
// cat group with an identity transform (R13): +1 mesh only on a scarred cat,
// none at all on an unscarred one, so every golden stays byte-identical.
//
// The strips are authored once, at build, in their owner's local space (the
// head group for a face scar, the body mesh for the others), and fitScars
// re-places every vertex from its owner's transform at the end of each
// animateCat: a face scar rides the head, a body scar the torso, in one draw.
// It casts no shadow (a 4 mm ridge has none worth drawing), and a scar under a
// body item or a fluffy ruff is simply hidden by it.

// Each strip: 4 segments, so 10 vertices and 8 triangles; three strips a scar,
// two scars a cat: 60 vertices, 48 triangles at most (R13).
export const SCAR_STRIP = Object.freeze({ lift: 0.004, segments: 4 });
const STRIP_SCARS_MAX = 2;
// Narrower at the ends, like a claw's scratch. Index = section along the strip.
const TAPER = [0.55, 0.9, 1, 0.9, 0.55];

// R14: full is a soft red; a coat too close to it (colourDistance below
// minDistance, the L1 metric over linear 0-1 channels of
// test/helpers/catfingerprint.js) gets a pale pink instead. Half and faint
// lerp that colour toward the coat under each vertex by `half` and `faint`.
export const SCAR_COLOURS = Object.freeze({ full: 0xd04a5a, pale: 0xf2a6ae, half: 0.45, faint: 0.75, minDistance: 0.25 });

// Where each site's three lines go, in the cat group's own units (before its
// scale). `dir` is the direction from the owner's centre to the scar's middle
// for the cat's RIGHT side (+x; the left mirrors x): head-local for the face,
// along the torso as it stands (its base scale applied) for the rest. `ref` is
// the direction the lines run along before they slant, `toward` the direction
// they slant by `slant` radians (the lines' upper ends lean that way); 'out'
// is away from the cat's midline. `length` is each line's length and `gap`
// the distance between neighbouring lines, `width` a line's width at its
// middle. The body's lines are a touch longer and wider than the face's: the
// torso is seen from further off (the walk camera rides behind it).
//   face: over the eye, on the brow above it and a little outward, slanting
//         down and in across the eye's top (sketch E).
//   shoulder: high on the front of the flank. side: mid flank. hind: over the
//         hip. They rake down and back, the way a paw swipes.
//   back: beside the spine, three lines slanting across the back.
const UP = [0, 1, 0];
const FWD = [0, 0, -1];
const OUT = 'out';
export const SCAR_LAYOUT = Object.freeze({
  face: Object.freeze({ dir: [0.1, 0.1, -0.155], ref: UP, toward: OUT, slant: 0.5, length: 0.065, gap: 0.02, width: 0.008 }),
  shoulder: Object.freeze({ dir: [0.9, 0.5, -0.85], ref: UP, toward: FWD, slant: 0.45, length: 0.075, gap: 0.025, width: 0.01 }),
  back: Object.freeze({ dir: [0.28, 1, 0.1], ref: FWD, toward: OUT, slant: 0.6, length: 0.075, gap: 0.025, width: 0.01 }),
  side: Object.freeze({ dir: [1, 0.15, 0.05], ref: UP, toward: FWD, slant: 0.45, length: 0.075, gap: 0.025, width: 0.01 }),
  hind: Object.freeze({ dir: [0.8, 0.5, 0.75], ref: UP, toward: FWD, slant: 0.45, length: 0.075, gap: 0.025, width: 0.01 }),
});

// ---------------------------------------------------------------------------
// Build-time surfaces. Each takes a direction from the owner's centre (in the
// layout's units) and returns { point, normal, colour } on the surface there.

// The skull: SKULL's ellipsoid, centred on the head's origin, in head-local
// units (the head's own scale, HEAD.SCALE, is applied by its matrix).
function skullSurface(colour) {
  const [a, b, c] = SKULL.SCALE.map((k) => SKULL.R * k);
  return (d) => {
    const t = 1 / Math.hypot(d.x / a, d.y / b, d.z / c);
    const point = d.clone().multiplyScalar(t);
    const normal = new THREE.Vector3(point.x / (a * a), point.y / (b * b), point.z / (c * c)).normalize();
    return { point, normal, colour };
  };
}

// The torso: a ray from its centre along `d` against the body mesh's own
// geometry (its base scale applied), so a strip lies on the facets actually
// drawn, full or simple. Normal and colour are the hit triangle's vertex
// normals and painted colours, interpolated.
function torsoHit(geo, S) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const col = geo.attributes.color;
  const index = geo.index;
  const tris = index ? index.count / 3 : pos.count / 3;
  const at = (k) => (index ? index.getX(k) : k);
  const ray = new THREE.Ray();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const hit = new THREE.Vector3();
  return (d) => {
    // The ray in the geometry's own (unscaled) space.
    ray.origin.set(0, 0, 0);
    ray.direction.set(d.x / S[0], d.y / S[1], d.z / S[2]).normalize();
    let best = Infinity, bi = -1;
    const bestPt = new THREE.Vector3();
    for (let k = 0; k < tris; k++) {
      A.fromBufferAttribute(pos, at(3 * k));
      B.fromBufferAttribute(pos, at(3 * k + 1));
      C.fromBufferAttribute(pos, at(3 * k + 2));
      if (!ray.intersectTriangle(A, B, C, false, hit)) continue;
      const dist = hit.length();
      if (dist < best) { best = dist; bi = k; bestPt.copy(hit); }
    }
    if (bi < 0) throw new Error('scar: no torso surface along ' + d.toArray());
    const ia = at(3 * bi), ib = at(3 * bi + 1), ic = at(3 * bi + 2);
    A.fromBufferAttribute(pos, ia); B.fromBufferAttribute(pos, ib); C.fromBufferAttribute(pos, ic);
    const bary = THREE.Triangle.getBarycoord(bestPt, A, B, C, new THREE.Vector3());
    const blend = (attr) => new THREE.Vector3()
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(attr, ia), bary.x)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(attr, ib), bary.y)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(attr, ic), bary.z);
    const n = blend(nor);
    // A normal goes through the inverse transpose of the scale: 1/S.
    const normal = new THREE.Vector3(n.x / S[0], n.y / S[1], n.z / S[2]).normalize();
    const point = bestPt.clone().multiply(new THREE.Vector3(...S));
    if (normal.dot(point) < 0) normal.negate();
    const c = blend(col);
    return { point, normal, colour: new THREE.Color(c.x, c.y, c.z) };
  };
}

// The torso's base coat: its most common painted colour (bands, patches and
// bibs cover only part of it; the rest is exactly the base).
function coatBase(geo) {
  const col = geo.attributes.color;
  const counts = new Map();
  let best = null, bestN = 0;
  for (let i = 0; i < col.count; i++) {
    const key = `${Math.round(col.getX(i) * 1e4)},${Math.round(col.getY(i) * 1e4)},${Math.round(col.getZ(i) * 1e4)}`;
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    if (n > bestN) { bestN = n; best = i; }
  }
  return new THREE.Color(col.getX(best), col.getY(best), col.getZ(best));
}

const colourDistance = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

// Gram-Schmidt: `v` with its parts along the unit vectors `ns` taken out.
function tangent(v, ...ns) {
  const t = v.clone();
  for (const n of ns) t.addScaledVector(n, -t.dot(n));
  return t.normalize();
}

// One scar's three strips: positions (in the layout's units), normals and the
// coat colour under each vertex, appended to `out`.
function layScar(layout, sx, surface, out) {
  const { length, gap, slant } = layout;
  const units = out.units;
  const d = new THREE.Vector3(layout.dir[0] * sx, layout.dir[1], layout.dir[2]);
  const { point: P, normal: N } = surface(d);
  const U = tangent(new THREE.Vector3(...layout.ref), N);
  const T = tangent(layout.toward === OUT ? new THREE.Vector3(sx, 0, 0) : new THREE.Vector3(...layout.toward), N, U);
  const along = U.clone().multiplyScalar(Math.cos(slant)).addScaledVector(T, Math.sin(slant));
  const perp = new THREE.Vector3().crossVectors(N, along).normalize();
  const segs = SCAR_STRIP.segments;
  for (const off of [-gap, 0, gap]) {
    for (let j = 0; j <= segs; j++) {
      const q = P.clone()
        .addScaledVector(along, (j / segs - 0.5) * length / units)
        .addScaledVector(perp, off / units);
      const { point: H, normal: Nh, colour } = surface(q);
      const side = tangent(perp, Nh);
      const w = (layout.width / 2) * TAPER[j] / units;
      const lifted = H.clone().addScaledVector(Nh, SCAR_STRIP.lift / units);
      for (const s of [1, -1]) {
        out.points.push(lifted.clone().addScaledVector(side, s * w));
        out.normals.push(Nh.clone());
        out.under.push(colour);
      }
    }
  }
}

// The full stage's colour for a scar over `under` (every vertex's coat) on a
// cat whose coat base is `base`: the soft red, or pale where it would not read.
function fullColour(under, base) {
  const red = new THREE.Color(SCAR_COLOURS.full);
  const close = [base, ...under].some((c) => colourDistance(red, c) < SCAR_COLOURS.minDistance);
  return close ? new THREE.Color(SCAR_COLOURS.pale) : red;
}

const SITES = Object.keys(SCAR_LAYOUT);
const STAGE_FADE = { full: 0, half: SCAR_COLOURS.half, faint: SCAR_COLOURS.faint };

function removeScars(cat) {
  const parts = cat.userData.parts;
  const mesh = parts?.scars;
  if (!mesh) return;
  mesh.removeFromParent();
  mesh.geometry.dispose();
  mesh.material.dispose();
  delete parts.scars;
}

// Replace the cat's scars with `scars` (scars.js render entries,
// [{ site, stage, side }]): any scar mesh is removed and disposed, then, if
// there is a scar to draw and the cat is not Hagrid, ONE mesh named 'scars' is
// built and fitted, and kept as cat.userData.parts.scars. Unknown sites are
// skipped; at most the first two scars are drawn.
export function setCatScars(cat, scars) {
  removeScars(cat);
  const parts = cat.userData.parts;
  if (!parts || cat.userData.breed === 'hagrid' || !Array.isArray(scars)) return;
  const list = scars.filter((s) => s && SITES.includes(s.site)).slice(0, STRIP_SCARS_MAX);
  if (list.length === 0) return;
  // The face scar's vertices come first: fitScars fits [0, split) to the head.
  list.sort((a, b) => (b.site === 'face') - (a.site === 'face'));
  const { head, body } = parts;
  const S = cat.userData.base?.bodyScale ?? body.scale.toArray();
  const base = coatBase(body.geometry);
  const skull = head.children.find((m) => m.isMesh && m.geometry.parameters?.radius === SKULL.R);
  const onSkull = skullSurface(skull ? skull.material.color.clone() : base);
  const onTorso = torsoHit(body.geometry, S);

  const rest = [], restNormal = [], under = [], colours = [];
  let split = 0;
  for (const scar of list) {
    const face = scar.site === 'face';
    const out = { points: [], normals: [], under: [], units: face ? HEAD.SCALE : 1 };
    layScar(SCAR_LAYOUT[scar.site], scar.side === 'l' ? -1 : 1, face ? onSkull : onTorso, out);
    // Rest positions in the owner's local space: the body mesh's scale is in
    // its matrix, so a torso point is divided by it (the head's layout is
    // already head-local).
    for (const p of out.points) rest.push(...(face ? p.toArray() : [p.x / S[0], p.y / S[1], p.z / S[2]]));
    for (const n of out.normals) restNormal.push(...n.toArray());
    const full = fullColour(out.under, base);
    const fade = STAGE_FADE[scar.stage] ?? 0;
    for (const u of out.under) {
      under.push(u.r, u.g, u.b);
      const c = full.clone().lerp(u, fade);
      colours.push(c.r, c.g, c.b);
    }
    if (face) split = rest.length / 3;
  }

  const n = rest.length / 3;
  const geo = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', position);
  geo.setAttribute('normal', normal);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3));
  const index = [];
  const segs = SCAR_STRIP.segments;
  for (let s = 0; s < n / ((segs + 1) * 2); s++) {
    const o = s * (segs + 1) * 2;
    for (let j = 0; j < segs; j++) {
      const a0 = o + j * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
      index.push(a0, a1, b0, a1, b1, b0); // counter-clockwise seen from outside
    }
  }
  geo.setIndex(index);

  const mesh = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'scars';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.noCast = true;
  mesh.userData.rest = new Float32Array(rest);
  mesh.userData.restNormal = new Float32Array(restNormal);
  mesh.userData.split = split;
  mesh.userData.under = new Float32Array(under);
  cat.add(mesh);
  parts.scars = mesh;
  fitScars(cat);
}

// Scratch, module-level: fitScars allocates nothing.
const _head = new THREE.Matrix4();
const _body = new THREE.Matrix4();
const _v = new THREE.Vector3();

// Re-place every scar vertex from its owner's transform this frame (position,
// rotation, scale): vertex = owner's local matrix × rest, normal = owner's
// rotation × rest normal. Run last in animateCat. No-op without a scar mesh.
export function fitScars(cat) {
  const parts = cat.userData.parts;
  const mesh = parts?.scars;
  if (!mesh) return;
  const { head, body } = parts;
  _head.compose(head.position, head.quaternion, head.scale);
  _body.compose(body.position, body.quaternion, body.scale);
  const { rest, restNormal, split } = mesh.userData;
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const pa = position.array, na = normal.array;
  for (let i = 0; i < position.count; i++) {
    const onHead = i < split;
    _v.fromArray(rest, i * 3).applyMatrix4(onHead ? _head : _body).toArray(pa, i * 3);
    _v.fromArray(restNormal, i * 3).applyQuaternion(onHead ? head.quaternion : body.quaternion).toArray(na, i * 3);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}
