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
// two scars a cat: 60 vertices, 48 triangles (R13). polish-catlooks
// (2026-11-02): a face scar also nicks its ear (SCAR_NICK, 12 vertices and 8
// triangles), so two scars are at most 72 vertices and 56 triangles (cap 80 / 64).
export const SCAR_STRIP = Object.freeze({ lift: 0.004, segments: 4 });
const STRIP_SCARS_MAX = 2;
// Narrower at the ends, like a claw's scratch. Index = section along the strip.
const TAPER = [0.55, 0.9, 1, 0.9, 0.55];

// R14: full is a soft red; a coat too close to it (colourDistance below
// minDistance, the L1 metric over linear 0-1 channels of
// test/helpers/catfingerprint.js) gets a pale pink instead. Half and faint
// lerp that colour toward the coat under each vertex by `half` and `faint`.
// polish-catlooks (2026-11-02): full is a paler, healed pink (was the soft red
// 0xd04a5a, which read as a fresh wound) and pale is lighter to match (was
// 0xf2a6ae): the kids should be proud of a scar, not find it gory. Fix round
// (same day): the first healed pink, 0xe0848f, was as bright as a tan or
// ginger coat and vanished from the walk camera, so full is a lighter healed
// pink, clearly brighter than tan, ginger and brown and still pink on white
// and cream; pale (for a coat close to it) is a near-white blush.
export const SCAR_COLOURS = Object.freeze({ full: 0xf4b0ba, pale: 0xfde8ea, half: 0.45, faint: 0.75, minDistance: 0.25 });

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
//   shoulder: on top of the shoulder blade. side: mid flank, a little high.
//         hind: over the hip. They rake down and back, the way a paw swipes.
//   back: beside the spine, three lines slanting across the back.
// polish-catlooks (2026-11-02): the walk camera rides behind the cat and ~25
// degrees above it, so a scar has to face up or back to be seen at all. The
// shoulder moved from the front of the flank (dir [0.9, 0.5, -0.85], ~0% of
// it visible from there) to the top of the shoulder blade (the brief's
// [0.45, 1, -0.7] put it just under the back of the head on screen in the game's
// walk view, so it was tuned back and out to [0.55, 1, -0.5]); side and hind rose
// 0.15 in y so their top line clears the flank's curve; every line is wider
// (face 0.008 -> 0.011, body 0.01 -> 0.014). Fix round (same day): the body
// sites' lines were still too small to find from the walk camera, so they are
// longer and wider again (length 0.075 -> 0.095, width 0.014 -> 0.018, gap
// 0.025 -> 0.032 to match). The face's lines keep their size.
const UP = [0, 1, 0];
const FWD = [0, 0, -1];
const OUT = 'out';
export const SCAR_LAYOUT = Object.freeze({
  face: Object.freeze({ dir: [0.1, 0.1, -0.155], ref: UP, toward: OUT, slant: 0.5, length: 0.065, gap: 0.02, width: 0.011 }),
  shoulder: Object.freeze({ dir: [0.55, 1, -0.5], ref: UP, toward: FWD, slant: 0.45, length: 0.095, gap: 0.032, width: 0.018 }),
  back: Object.freeze({ dir: [0.28, 1, 0.1], ref: FWD, toward: OUT, slant: 0.6, length: 0.095, gap: 0.032, width: 0.018 }),
  side: Object.freeze({ dir: [1, 0.3, 0.05], ref: UP, toward: FWD, slant: 0.45, length: 0.095, gap: 0.032, width: 0.018 }),
  hind: Object.freeze({ dir: [0.8, 0.65, 0.75], ref: UP, toward: FWD, slant: 0.45, length: 0.095, gap: 0.032, width: 0.018 }),
});

// The ear nick (polish-catlooks, 2026-11-02): a face scar also marks the ear
// on its side, where the walk camera sees it: two short strokes in a shallow
// V across the back of the ear, toward its outer edge, about 60% of the way up
// from its base. The ear is a 4-sided cone whose base corners point back
// (+z), out, forward and in, so its back-outer facet faces the camera behind
// the cat. `points` are the V's [across, up] on that facet: across runs from
// the back corner (0) to the outer corner (1), up from the base (0) to the tip
// (1); the strokes are points[0]->points[1] and points[1]->points[2]. `lift`
// and `width` are in the cat group's units, like the layout's. 2 segments a
// stroke: 6 vertices, 4 triangles. Fix round (same day): 1.3x bigger (the V
// spread 1.3x about its middle, width 0.008 -> 0.0105) so it reads from behind.
export const SCAR_NICK = Object.freeze({
  points: Object.freeze([[0.2, 0.652], [0.55, 0.548], [0.85, 0.639]]), lift: 0.002, width: 0.0105, segments: 2,
});
const NICK_TAPER = [0.6, 1, 0.6];

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
// normals and painted colours, interpolated. A ray that meets no facet gives
// null (layScar then skips that scar): setCatScars runs inside buildCat for
// every cat that wears a scar, so it must never throw.
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
    if (bi < 0) return null;
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
// coat colour under each vertex, appended to `out`. False (and `out` left
// unused) when the surface is missing anywhere under the scar.
function layScar(layout, sx, surface, out) {
  const { length, gap, slant } = layout;
  const units = out.units;
  const d = new THREE.Vector3(layout.dir[0] * sx, layout.dir[1], layout.dir[2]);
  const centre = surface(d);
  if (!centre) return false;
  const { point: P, normal: N } = centre;
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
      const at = surface(q);
      if (!at) return false;
      const { point: H, normal: Nh, colour } = at;
      const side = tangent(perp, Nh);
      const w = (layout.width / 2) * TAPER[j] / units;
      const lifted = H.clone().addScaledVector(Nh, SCAR_STRIP.lift / units);
      for (const s of [1, -1]) {
        out.points.push(lifted.clone().addScaledVector(side, s * w));
        out.normals.push(Nh.clone());
        out.under.push(colour);
      }
    }
    out.strips.push(segs);
  }
  return true;
}

// The ear nick's two strokes on `ear` (the face scar's side, sx), in the ear's
// own local space (it is fitted through head × ear each frame, so it rolls
// with the ear when the animator pins it), appended to `out` like layScar's.
// False when the ear is not the 4-sided cone it is expected to be.
function layNick(ear, sx, out) {
  const prm = ear.geometry.parameters;
  if (!prm || prm.radialSegments !== 4 || !(prm.radius > 0) || !(prm.height > 0)) return false;
  const r = prm.radius, h = prm.height;
  // three.js puts a cone's base corner k at (r sin(k pi/2), -h/2, r cos(k pi/2)).
  const A = new THREE.Vector3(0, h / 2, 0);
  const B = new THREE.Vector3(0, -h / 2, r);
  const C = new THREE.Vector3(sx * r, -h / 2, 0);
  const N = new THREE.Vector3().crossVectors(C.clone().sub(B), A.clone().sub(B)).normalize();
  if (N.x * sx + N.z < 0) N.negate();
  const at = ([v, u]) => B.clone().lerp(C, v).lerp(A, u);
  // The coat under the nick: the ear's colour, shaded by its painted back.
  const col = ear.geometry.attributes.color;
  const mid = at(SCAR_NICK.points[1]);
  const pos = ear.geometry.attributes.position;
  let near = 0, nd = Infinity;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const dd = tmp.fromBufferAttribute(pos, i).distanceToSquared(mid);
    if (dd < nd && tmp.clone().normalize().dot(N) > 0) { nd = dd; near = i; }
  }
  const colour = ear.material.color.clone();
  if (col) colour.multiply(new THREE.Color(col.getX(near), col.getY(near), col.getZ(near)));
  const units = out.units;
  const segs = SCAR_NICK.segments;
  for (let k = 0; k < 2; k++) {
    const P0 = at(SCAR_NICK.points[k]), P1 = at(SCAR_NICK.points[k + 1]);
    const along = P1.clone().sub(P0).normalize();
    const side = new THREE.Vector3().crossVectors(N, along).normalize();
    for (let j = 0; j <= segs; j++) {
      const H = P0.clone().lerp(P1, j / segs).addScaledVector(N, SCAR_NICK.lift / units);
      const w = (SCAR_NICK.width / 2) * NICK_TAPER[j] / units;
      for (const s of [1, -1]) {
        out.points.push(H.clone().addScaledVector(side, s * w));
        out.normals.push(N.clone());
        out.under.push(colour);
      }
    }
    out.strips.push(segs);
  }
  return true;
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

  const rest = [], restNormal = [], under = [], colours = [], strips = [];
  let split = 0, earSplit = 0, earKey = null;
  for (const scar of list) {
    const face = scar.site === 'face';
    const sx = scar.side === 'l' ? -1 : 1;
    const out = { points: [], normals: [], under: [], strips: [], units: face ? HEAD.SCALE : 1 };
    if (!layScar(SCAR_LAYOUT[scar.site], sx, face ? onSkull : onTorso, out)) continue;
    // The face scar's ear nick follows its strips, in the ear's local space
    // (polish-catlooks, 2026-11-02). parts.earR is the cat's right (+x) ear.
    const nick = { points: [], normals: [], under: [], strips: [], units: HEAD.SCALE };
    const key = sx > 0 ? 'earR' : 'earL';
    const hasNick = face && parts[key]?.isMesh && layNick(parts[key], sx, nick);
    // Rest positions in the owner's local space: the body mesh's scale is in
    // its matrix, so a torso point is divided by it (the head's layout is
    // already head-local, the nick's ear-local).
    for (const p of out.points) rest.push(...(face ? p.toArray() : [p.x / S[0], p.y / S[1], p.z / S[2]]));
    if (hasNick) for (const p of nick.points) rest.push(...p.toArray());
    const normals = hasNick ? [...out.normals, ...nick.normals] : out.normals;
    const unders = hasNick ? [...out.under, ...nick.under] : out.under;
    for (const n of normals) restNormal.push(...n.toArray());
    const full = fullColour(unders, base);
    const fade = STAGE_FADE[scar.stage] ?? 0;
    for (const u of unders) {
      under.push(u.r, u.g, u.b);
      const c = full.clone().lerp(u, fade);
      colours.push(c.r, c.g, c.b);
    }
    strips.push(...out.strips);
    if (face) {
      split = (rest.length / 3) - (hasNick ? nick.points.length : 0);
      earSplit = rest.length / 3;
      if (hasNick) { strips.push(...nick.strips); earKey = key; }
    }
  }

  const n = rest.length / 3;
  if (n === 0) return; // every scar was skipped: no mesh at all
  const geo = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', position);
  geo.setAttribute('normal', normal);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colours), 3));
  const index = [];
  let o = 0;
  for (const segs of strips) {
    for (let j = 0; j < segs; j++) {
      const a0 = o + j * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
      index.push(a0, a1, b0, a1, b1, b0); // counter-clockwise seen from outside
    }
    o += (segs + 1) * 2;
  }
  geo.setIndex(index);

  const mesh = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'scars';
  mesh.castShadow = false;
  // It receives shadows (controller ruling); rig.js's shadow sweep skips a
  // noCast mesh, so the flag is set here on the mesh itself.
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.noCast = true;
  mesh.userData.rest = new Float32Array(rest);
  mesh.userData.restNormal = new Float32Array(restNormal);
  mesh.userData.split = split;       // [0, split): the face scar, on the head
  mesh.userData.earSplit = earSplit; // [split, earSplit): its ear nick, on parts[earKey]
  mesh.userData.earKey = earKey;     // [earSplit, end): the body scar, on the torso
  mesh.userData.under = new Float32Array(under);
  cat.add(mesh);
  parts.scars = mesh;
  fitScars(cat);
}

// Scratch, module-level: fitScars allocates nothing.
const _head = new THREE.Matrix4();
const _body = new THREE.Matrix4();
const _ear = new THREE.Matrix4();
const _earQ = new THREE.Quaternion();
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
  const { rest, restNormal, split, earSplit, earKey } = mesh.userData;
  // The ear nick rides head × ear, so it rolls with an ear the animator pins.
  const ear = earKey ? parts[earKey] : null;
  if (ear) {
    _ear.compose(ear.position, ear.quaternion, ear.scale).premultiply(_head);
    _earQ.multiplyQuaternions(head.quaternion, ear.quaternion);
  }
  const position = mesh.geometry.attributes.position;
  const normal = mesh.geometry.attributes.normal;
  const pa = position.array, na = normal.array;
  for (let i = 0; i < position.count; i++) {
    const onEar = ear && i >= split && i < earSplit;
    const onHead = i < split;
    const m = onEar ? _ear : onHead ? _head : _body;
    const q = onEar ? _earQ : onHead ? head.quaternion : body.quaternion;
    _v.fromArray(rest, i * 3).applyMatrix4(m).toArray(pa, i * 3);
    _v.fromArray(restNormal, i * 3).applyQuaternion(q).toArray(na, i * 3);
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}
