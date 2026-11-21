// The shapes a person is built from: lathed limbs and solids, the head's egg
// with its softer jaw and tucked occiput, the hair shell, the neck's frame and
// the neckline's dip. Metres, faces -z, the figure's origin between the feet.
// Pure geometry: no colour, no joints (parts.js adds those), no Math.random
// beyond three.js's own uuids.
import * as THREE from 'three';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, k) => a + (b - a) * k;

// A limb: a lathed tube hanging from y = 0 down to y = -len, tapering r0 -> r1
// (with an optional bulge, the calf or the forearm's muscle), each end closed
// by a rounded cap so two limbs overlap smoothly at the elbow or knee. The
// caps meet the axis at a point, so their tips are zero-area triangles that
// dropDegenerate removes.
export function limbGeo(len, r0, r1, { bulge = 0, bulgeAt = 0.3, segs = 8, rings = 6, capTop = 1, capBot = 1, capN = 2 } = {}) {
  const pts = [];
  for (let i = 0; i <= capN; i++) { // the bottom cap, from the tip up
    const a = (i / capN) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r1 * Math.sin(a), -len - r1 * capBot * Math.cos(a)));
  }
  for (let i = 1; i < rings; i++) {
    const k = i / rings; // 0 at the bottom
    const t = 1 - k;     // 0 at the top
    const r = lerp(r1, r0, k) + bulge * Math.exp(-((t - bulgeAt) ** 2) / 0.04);
    pts.push(new THREE.Vector2(r, -len + len * k));
  }
  for (let i = 0; i <= capN; i++) { // the top cap, up to its tip
    const a = (i / capN) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r0 * Math.cos(a), r0 * capTop * Math.sin(a)));
  }
  return new THREE.LatheGeometry(pts, segs);
}

// A lathed solid from [r, y] points, bottom to top, scaled in x and z. A
// phiStart of (pi / 2) mod (2 pi / segs) puts a vertex at +-x (the flares use
// it, so their width at the side is the profile's own radius).
export function lathe(points, segs, sx = 1, sz = 1, phiStart = 0) {
  const geo = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs, phiStart);
  geo.scale(sx, 1, sz);
  return geo;
}

// A closed tube through horizontal rings, bottom to top, each [L, rx, rz, y]:
// a stadium, two half-ellipses (radii rx, rz) centred at x = +-L and joined by
// straight sides front and back (L = 0: an ellipse; rx = rz = 0: a point or a
// ridge). Each half has `half` points at the angles a limb of 2 * (half - 1)
// sides puts its own (-90, ..., +90 degrees round its axis), so the seat's
// ends and the thighs (L = their hipX) share their facets and their seam is a
// clean line. Indexed; the zero-area triangles of a point or a ridge are left
// for dropDegenerate.
export function stadiumTube(rings, half) {
  const n = half * 2;
  const pos = [];
  for (const [L, rx, rz, y] of rings) {
    for (let side = 0; side < 2; side++) {
      const sd = side === 0 ? 1 : -1; // the right half (+x) first, then the left
      for (let k = 0; k < half; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / (half - 1); // -90..+90 round its own centre
        const c = Math.cos(a), sn = Math.sin(a);
        // going round: +x half from -z to +z, then the -x half from +z back to -z
        pos.push(sd * (L + rx * c), y, sd * rz * sn);
      }
    }
  }
  const index = [];
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n);
      const c = a + n, e = b + n;
      index.push(a, c, b, b, c, e); // outward, as a lathe winds
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

export function ellipsoid(rx, ry, rz, ws, hs) {
  return new THREE.SphereGeometry(1, ws, hs).scale(rx, ry, rz);
}

// The head's shape: an egg whose lower half narrows to a softer jaw.
export function jawTaper(y, yr) {
  const k = clamp01(-y / yr); // 0 at the middle, 1 at the chin
  return { x: 1 - 0.24 * k * k, z: 1 - 0.1 * k * k };
}

// The neckline dips at the front, down to the notch between the collarbones:
// the sides keep the trapezius's height, the front of the neck runs longer
// (on a 1.80 m man about 8 cm from chin to notch, as a real one). `front` is
// how squarely the point faces forward (v2 measured it as depth, so the rings
// closing the chest's top inside the neck stayed up and stood above the notch).
export function necklineDip(x, y, z, d) {
  if (z >= 0 || y < d.shoulderY - 0.01 * d.s) return 0;
  const front = -z / Math.hypot(x, z);
  const mid = clamp01(1 - Math.abs(x) / (d.neckR * 2.6));
  const up = clamp01((y - (d.shoulderY - 0.01 * d.s)) / (d.neckY - d.shoulderY + 0.01 * d.s));
  return 0.016 * d.H * front * mid * mid * up;
}

export function dipNeckline(geo, d) {
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - necklineDip(p.getX(i), p.getY(i), p.getZ(i), d));
  geo.computeVertexNormals();
  return geo;
}

// The back of the skull ends above the nape: below the head's middle, the
// back half is drawn in toward the neck, so the neck shows behind the jaw.
// Head-centre frame; returns the factor for z.
export function occiputTuck(y, z, d) {
  if (z <= 0 || y >= 0) return 1;
  const back = clamp01(z / d.headZr);
  const low = clamp01(-y / d.headYr);
  return 1 - 0.42 * back * low * low * (3 - 2 * low);
}

// The head, centred on the origin (parts.js sets it on the neck).
export function headGeo(d, ws, hs) {
  const geo = ellipsoid(d.headXr, d.headYr, d.headZr, ws, hs);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = jawTaper(y, d.headYr);
    p.setX(i, p.getX(i) * t.x);
    const z = p.getZ(i) * t.z;
    p.setZ(i, z * occiputTuck(y, z, d));
  }
  geo.computeVertexNormals();
  return geo;
}

// The z of the face's front at (x, y), head-centre frame, `out` metres
// further forward (a negative `out` is inside the face).
export function onFace(d, x, y, out = 0) {
  const t = jawTaper(y, d.headYr);
  const q = 1 - (x / (d.headXr * t.x)) ** 2 - (y / d.headYr) ** 2;
  return -d.headZr * t.z * Math.sqrt(Math.max(0, q)) - out;
}

// Where the face's features sit, head-centre frame (shared by the parts and
// the eye and mouth joints). A child's eyes are a little larger and lower.
export function faceLayout(d) {
  const child = !!d.child;
  const eyeR = d.headXr * (child ? 0.115 : 0.095);
  const smileArc = Math.PI * 0.8;           // 0.8 of a half turn
  const smileR = d.headXr * 0.42 / 2;       // 0.42 (v2: 2 x 0.17 = 0.34) of headXr across the circle
  return {
    eyeX: d.headXr * (child ? 0.4 : 0.37),
    eyeY: -d.headYr * (child ? 0.16 : 0.05),
    eyeR,                                   // the dot's half-width; taller than wide
    eyeH: eyeR * 1.22,
    eyeZr: eyeR * 0.55,                     // its depth (z radius)
    eyeIn: eyeR * 0.35,                     // its centre this far inside the face
    // the imagined eyeball's centre, this far behind the dot's centre (a real
    // eyeball is about 12 mm in radius): the eye joint turns about it, so the
    // dot slides over the face (0.3 rad moves it about 4 mm)
    eyeBall: d.headZr * (child ? 0.13 : 0.12),
    noseY: -d.headYr * (child ? 0.34 : 0.3),
    mouthY: -d.headYr * (child ? 0.55 : 0.52), // the smile's middle
    smileR,
    smileArc,
    smileTube: d.headXr * 0.025 * 1.4,      // 1.4 x v2's line
    smileIn: 0.003,                         // its line's centre inside the face
    // the circle's centre above the smile's middle: halfway between the
    // lowest point (-R) and the corners (-R cos(arc / 2))
    smileLift: smileR * (1 + Math.cos(smileArc / 2)) / 2,
  };
}

// A hair shell: the head's egg a little larger, every vertex held between a
// top line (`top`, the polar angle from the crown) and a hairline that runs
// from `front` (above the brows) through `side` (over the ears) to `back`
// (the nape). The front line never comes below the brows: hair never covers
// the eyes. `flare` pushes the lower edge out (a bob). Clamping folds rows of
// the sphere onto the hairline; those zero-area triangles are dropped.
export function hairShell(d, { top = 0, front, side, back, thick = 1.07, flare = 0, reach = 1 }, ws, hs) {
  const geo = new THREE.SphereGeometry(1, ws, hs);
  const p = geo.getAttribute('position');
  const v = new THREE.Vector3();
  const capped = new Uint8Array(p.count); // held down to the top line
  const nadir = new Uint8Array(p.count);  // the sphere's bottom pole
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const flat = Math.hypot(v.x, v.z);
    let theta = Math.acos(THREE.MathUtils.clamp(v.y, -1, 1));
    capped[i] = theta < top ? 1 : 0;
    nadir[i] = flat <= 1e-6 && v.y < 0 ? 1 : 0;
    const fr = flat > 1e-6 ? -v.z / flat : 1; // 1 straight ahead, -1 behind
    const lim = fr >= 0 ? lerp(side, front, clamp01(fr * reach)) : lerp(side, back, -fr);
    theta = Math.min(Math.max(theta, top), Math.max(lim, top));
    const az = Math.atan2(v.x, v.z);
    const sr = Math.sin(theta);
    const y = Math.cos(theta);
    const yy = y * d.headYr * thick;
    const t = jawTaper(yy, d.headYr);
    const fl = 1 + flare * clamp01(-y * 1.6);
    const zz = Math.cos(az) * sr * d.headZr * thick * t.z * fl;
    p.setXYZ(i, Math.sin(az) * sr * d.headXr * thick * t.x * fl, yy, zz * occiputTuck(yy, zz, d));
  }
  // Two sheets would cross the head, and are dropped: the bottom pole has no
  // azimuth, so it lands on the hairline's front and fans out to the whole
  // hairline (on a bald head, across the eyes); and a crown held down to the
  // top line (a bald head, the hair under a hat) folds flat across the head.
  const idx = geo.index.array;
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]];
    if (nadir[a] || nadir[b] || nadir[c] || (capped[a] && capped[b] && capped[c])) continue;
    keep.push(a, b, c);
  }
  geo.setIndex(keep);
  geo.computeVertexNormals();
  return dropDegenerate(geo);
}

export const HAIR_STYLES = Object.freeze({
  // polar angles (radians from the crown) of the hairline
  short: Object.freeze({ front: 0.34 * Math.PI, side: 0.47 * Math.PI, back: 0.62 * Math.PI, thick: 1.07 }),
  crop: Object.freeze({ front: 0.30 * Math.PI, side: 0.44 * Math.PI, back: 0.6 * Math.PI, thick: 1.045 }),
  bob: Object.freeze({ front: 0.31 * Math.PI, side: 0.7 * Math.PI, back: 0.72 * Math.PI, thick: 1.1, flare: 0.12 }),
  long: Object.freeze({ front: 0.33 * Math.PI, side: 0.66 * Math.PI, back: 0.72 * Math.PI, thick: 1.09 }),
  ponytail: Object.freeze({ front: 0.34 * Math.PI, side: 0.5 * Math.PI, back: 0.64 * Math.PI, thick: 1.07 }),
  bun: Object.freeze({ front: 0.34 * Math.PI, side: 0.5 * Math.PI, back: 0.64 * Math.PI, thick: 1.07 }),
  pigtails: Object.freeze({ front: 0.33 * Math.PI, side: 0.52 * Math.PI, back: 0.62 * Math.PI, thick: 1.07 }),
  // a bald crown with a fringe round the back; its top line a little above
  // the head's middle (v2 had it at the middle, 0.5 pi, so on the far build
  // the fringe's front tip came round to the eyes' corners at their height)
  bald: Object.freeze({ top: 0.47 * Math.PI, front: 0.47 * Math.PI, side: 0.62 * Math.PI, back: 0.68 * Math.PI, thick: 1.03, reach: 2.5 }),
});

// Where the neck runs and the head sits (shared by the parts and the joints).
// The neck rises from inside the chest, a little behind the middle, leaning
// forward; the head's middle sits forward of its top, where a skull balances.
export function neckFrame(d) {
  const headCY = d.chinY + d.headYr * 0.92;
  const baseY = d.neckY - 0.035 * d.s;        // its root, inside the chest
  const baseZ = 0.012 * d.s;                  // a touch behind the middle
  const topY = d.chinY + d.headYr * 0.5;      // its top, inside the head behind the jaw
  const len = (topY - baseY) / Math.cos(d.neckLean);
  const topZ = baseZ - len * Math.sin(d.neckLean);
  const headCZ = topZ - d.headZr * 0.22;      // the head's middle forward of the neck
  return { headCY, baseY, baseZ, topY, topZ, len, headCZ };
}

// Drop the zero-area triangles (a lathe's tips, a hair shell's folded rims)
// and the vertices only they used. In place; returns the geometry. A
// triangle counts as zero-area when it is under a micrometre high: rows
// folded onto one line still differ by a float32 step (about 1e-8 m), and
// the thinnest real triangle here is over 1e-4 m high.
const DEGENERATE = 1e-6; // m
export function dropDegenerate(geo) {
  const index = geo.index;
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
  const keep = [];
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i); const ib = index.getX(i + 1); const ic = index.getX(i + 2);
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const edge = Math.sqrt(Math.max(a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a)));
    b.sub(a); c.sub(a);
    // height over the longest edge = |cross| / edge
    if (edge > 0 && b.cross(c).length() > DEGENERATE * edge) keep.push(ia, ib, ic);
  }
  // the kept vertices, renumbered in their own order (nothing moves when
  // every vertex is still used)
  const used = new Uint8Array(pos.count);
  for (const i of keep) used[i] = 1;
  const remap = new Int32Array(pos.count).fill(-1);
  let n = 0;
  for (let i = 0; i < pos.count; i++) if (used[i]) remap[i] = n++;
  if (n !== pos.count) {
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.getAttribute(name);
      const size = attr.itemSize;
      const out = new attr.array.constructor(n * size);
      for (let i = 0; i < pos.count; i++) {
        const j = remap[i];
        if (j >= 0) for (let k = 0; k < size; k++) out[j * size + k] = attr.array[i * size + k];
      }
      geo.setAttribute(name, new THREE.BufferAttribute(out, size, attr.normalized));
    }
  }
  geo.setIndex(keep.map((i) => remap[i]));
  return geo;
}
