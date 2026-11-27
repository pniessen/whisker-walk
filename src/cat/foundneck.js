// Found outfits: the neck and collar slots, on the cat and on Hagrid the hen.
// Every walk hides one find-only outfit (src/foundwear/ holds the records).
//
// NECK. THE ANCHORS are addPrizeNeck's (model.js), the same the Streamer
// Scarf uses, so a found neck piece sits where it sits:
//   k        size (1 on the cat, 0.67 on Hagrid)
//   y, z     the neck seam's front, where a scarf's band sits
//   ringR    a band's radius round the neck (0.15 / 0.155)
//   ringBack how far a band is set back (+z) so its front lies on the throat
//            (the cat's NECK_RING_BACK.streamer; 0 on Hagrid)
//   tilt     NECK_RING_TILT (model.js): a band round the neck is tipped by
//            Math.PI / 2 - tilt, as the scarf's is
// Head frame: +y up, -z forward.
// A PIECE THAT GOES ROUND THE NECK is a THREE.TorusGeometry mesh: on Hagrid,
// model.js re-rings every torus round his leaning neck (ringTheNeck); the
// other pieces hang where they were built. Add meshes straight to `head`,
// never a group. On the cat they are carried on the neck as neckwear
// (animator.js fitNeck).
// THE TABLE: FOUND_NECKS[id] = (head, { k, y, z, ringR, ringBack, tilt })
// -> void.
//
// COLLAR. buildCollar (model.js) makes the ring for the cat and for Hagrid,
// then, for a FOUND_COLLARS style, colours it and calls its dress:
//   FOUND_COLLARS[style] = { ring, charmed, dress }
//   ring     the ring's colour (hex)
//   charmed  true when a charm hangs at the throat (wearkind.js isCharmed:
//            a cape's clasp is then left off under it)
//   dress(group, ring, { ringR, tubeR, charmPos }) -> void: adds the pieces,
//            either on `ring` in its local XY plane (they follow its tilt, as
//            the studs do) or on `group` at `charmPos` (a charm, facing -z).
//            Cat: ringR 0.15, tubeR 0.028; Hagrid: 0.135, 0.024 (his charms
//            are turned back to face forward after).
//
// model.js tags each mesh it adds through this file userData.foundWear = id
// (for a collar, the whole group, ring and all).
//
// THE RULES every found outfit keeps (test/foundwearfit.test.js checks them
// for every record in src/foundwear/):
//   * it only looks: no perk. The perks on shop ids ('backpack', 'booties',
//     'bandana', the Glow Collar) stay on those ids alone;
//   * worn, it adds at most 4 meshes to a cat, full and simple, and at most
//     900 triangles full, 450 simple (a coat shell: no more than the Striped
//     Sweater; a pack: 1200 full, 600 simple). On Hagrid, at most 4 meshes;
//   * no material is emissive, and no colour is the yarn ball's 0x5b7fc7 or a
//     treasure's 0xf25c8a: on the walk it must never read as either;
//   * nothing of it goes into the ground, standing, sitting or napping;
//   * nothing here throws its own dice or reads the clock (no Math.random,
//     walkRng, Date.now or performance.now): two players see the same thing;
//   * every mesh model.js adds through this file is tagged
//     userData.foundWear = id (model.js tagFound), so the ground look
//     (src/foundwear/display.js wornPieces) is made from the worn pieces.
// An id is 3 to 16 lowercase letters (the colony server's check), the
// record's in src/foundwear/, and never changes once shipped. An unknown id,
// or anything that is not a string, adds nothing.
//
// wearkind.js imports this file, so its hasEntry is written out here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { henNeckFrontZ } from './hen.js';

// ---- helpers --------------------------------------------------------------

const plain = (hex) => litMaterial(hex);
const painted = (extra) => litMaterial(0xffffff, { vertexColors: true, ...extra });

// Flat-shaded, uv-less and coloured per vertex, so any pieces can be merged.
// `hex` is one colour, or a function (x, y, z) -> hex of each vertex.
function colour(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, c = new THREE.Color(), arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(typeof hex === 'function' ? hex(p.getX(i), p.getY(i), p.getZ(i)) : hex).toArray(arr, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getHex();

// A flat fan facing +z: the centre (lifted `dome` toward +z), then the points
// in order (a star, a disc, a scallop); rim colours rimHex(i) or one hex.
function fan(points, hex, centre = [0, 0], dome = 0, rimHex = null, centreHex = hex) {
  const pos = [], col = [], c = new THREE.Color();
  const put = (x, y, z, h) => { pos.push(x, y, z); c.set(h); col.push(c.r, c.g, c.b); };
  for (let i = 0; i + 1 < points.length; i++) {
    put(centre[0], centre[1], dome, centreHex);
    put(...points[i], 0, rimHex ? rimHex(i) : hex);
    put(...points[i + 1], 0, rimHex ? rimHex(i + 1) : hex);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
const ringPoints = (n, r, inner = r, from = 0, to = Math.PI * 2) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = from + (to - from) * i / n, rr = i % 2 ? inner : r; return [rr * Math.cos(a), rr * Math.sin(a)]; });

// A torus painted per vertex by paint(u, v): u the angle round the ring, v
// the angle round its tube (0 its outer equator, pi/2 the +z side).
function paintedTorus(R, r, radial, tubular, paint, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(R, r, radial, tubular, arc);
  const n = g.attributes.position.count, cols = new Float32Array(n * 3), c = new THREE.Color();
  for (let j = 0; j <= radial; j++) for (let i = 0; i <= tubular; i++) {
    c.set(paint((i / tubular) * arc, (j / radial) * Math.PI * 2)).toArray(cols, (j * (tubular + 1) + i) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// Put a piece built facing +z, hanging toward -y, on the ring's circle at angle
// `theta`, `r` from its axis and `dz` along it (+z, the way the ring's axis
// runs, down the neck): its face looks away from the neck.
function onRing(geo, theta, r, dz = 0) {
  const c = Math.cos(theta), s = Math.sin(theta);
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(s, -c, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(c, s, 0)).setPosition(r * c, r * s, dz));
  return geo;
}

// The ring round the neck: a TorusGeometry mesh tipped as the streamer scarf's
// band is (Hagrid's ringTheNeck then re-rings it round his leaning neck). What
// is made to go round it is added as its child, in the ring's own frame, so it
// follows the ring on the cat and on Hagrid alike.
function neckRing(head, { k, y, z, ringR, ringBack, tilt }, geo, material, children = [], childExtra) {
  const ring = new THREE.Mesh(geo, material);
  ring.rotation.x = Math.PI / 2 - tilt;
  ring.position.set(0, y, z + ringBack);
  head.add(ring);
  if (children.length) ring.add(new THREE.Mesh(mergeGeometries(children), painted(childExtra)));
  return ring;
}

// Where a front piece sits: the ring's front on the cat; on Hagrid (k < 1) his
// neck's front surface, 5 cm below the anchor, where the necktie's knot sits.
function frontOf({ k, y, z, ringR, ringBack, tilt }) {
  if (k === 1) return { y: y - ringR * Math.cos(Math.PI / 2 - tilt), z: z + ringBack - ringR * Math.sin(Math.PI / 2 - tilt) };
  return { y: y - 0.05, z: henNeckFrontZ(y - 0.05) - 0.02 };
}

// ---- Daisy Chain ----------------------------------------------------------

// Six big daisies on a twisted green stem ring, one at the throat, a leaf
// between each two: eight rounded white petals tipped pink round a domed gold
// centre, each lying against the ring, facing out. The stem is two greens
// wound round each other, darker than any coat's middle tones, so the chain
// reads on a tabby as on a white cat.
const DAISY_STEM = [0x3f7a2a, 0x5a9a3c], DAISY_PETAL = 0xfdfdf8, DAISY_TIP = 0xf4b8c8, DAISY_GOLD = 0xf2b62e;
// a daisy's rim: per petal a notch, a shoulder, the rounded tip, a shoulder
const DAISY_RIM = (r) => Array.from({ length: 33 }, (_, i) => {
  const a = ((Math.floor(i / 4) + [-0.5, -0.2, 0, 0.2][i % 4]) / 8) * Math.PI * 2, rr = r * [0.38, 0.86, 1, 0.86][i % 4];
  return [rr * Math.cos(a), rr * Math.sin(a)];
});
function addDaisyChain(head, a) {
  const { k, ringR } = a, tube = 0.0085 * k, parts = [];
  for (let i = 0; i < 6; i++) {
    const theta = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const petals = fan(DAISY_RIM(0.056 * k), DAISY_PETAL, [0, 0], 0.005 * k, (j) => (j % 4 === 2 ? DAISY_TIP : DAISY_PETAL));
    const centre = fan(ringPoints(6, 0.016 * k), DAISY_GOLD, [0, 0], 0.009 * k, null, 0xf7d65a);
    centre.translate(0, 0, 0.005 * k);
    // tipped to face out and up a little, toward whoever looks down at her
    parts.push(onRing(mergeGeometries([petals, centre]).rotateZ(i * 0.4).rotateX(-0.55), theta, ringR + tube + 0.006 * k));
    // a leaf halfway to the next daisy, lying along the stem
    const leaf = fan([[0.024 * k, 0], [0, 0.008 * k], [-0.024 * k, 0], [0, -0.008 * k], [0.024 * k, 0]], DAISY_STEM[1], [0, 0], 0.002 * k, null, 0x8cc06a);
    leaf.rotateZ(0.5);
    parts.push(onRing(leaf, theta + Math.PI / 6, ringR + tube + 0.002 * k));
  }
  neckRing(head, a, paintedTorus(ringR, tube, 5, 14, (u, v) => DAISY_STEM[(Math.floor(u * 7 / Math.PI + v / Math.PI)) & 1]), painted(), parts);
}

// ---- Garden Glove Scarf ---------------------------------------------------

// A check scarf: the band's vertices alternate light and dark green, so the
// quads shade into checks of three greens; a knot at the front, and a canvas gardening
// glove tucked in it, cuff up, fingers down the chest: a soft palm, four
// rounded fingers and a thumb, a green-striped cuff, three pink flowers
// printed on its back.
function addGardenGloveScarf(head, a) {
  const { k, ringR } = a, GREEN = 0x6a9a4a, LIGHT = 0xa6d085, DEEP = 0x4a7a32;
  const band = new THREE.TorusGeometry(ringR, 0.036 * k, 6, 14);
  const cols = new Float32Array(band.attributes.position.count * 3), w = band.parameters.tubularSegments + 1;
  for (let v = 0; v < band.attributes.position.count; v++) new THREE.Color([GREEN, LIGHT, GREEN, DEEP][((v % w) % 2) + 2 * (Math.floor(v / w) % 2)]).toArray(cols, v * 3);
  band.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  neckRing(head, a, band, painted());
  const f = frontOf(a);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.034 * k, 6, 4), plain(GREEN));
  knot.position.set(0, f.y - 0.01 * k, f.z - 0.012 * k);
  head.add(knot);
  const GLOVE = 0xf2d7a0, SEAM = 0xd8b880, CUFF = 0x5a9a3c, FLOWER = 0xe27a9a;
  const glove = (x, y) => (y > -0.012 * k ? (Math.abs(y + 0.004 * k) < 0.003 * k ? 0xf7e6c0 : CUFF) : GLOVE);
  const palm = colour(new THREE.SphereGeometry(0.031 * k, 7, 4).scale(1, 1.05, 0.32).translate(0, -0.035 * k, 0), (x, y) => (y < -0.06 * k ? SEAM : GLOVE));
  const cuff = colour(new THREE.CylinderGeometry(0.03 * k, 0.027 * k, 0.02 * k, 8, 1).scale(1, 1, 0.42).translate(0, -0.004 * k, 0), glove);
  const parts = [palm, cuff];
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.CylinderGeometry(0.0068 * k, 0.0058 * k, 0.034 * k, 5, 1).translate(0, -0.017 * k, 0);
    finger.rotateZ((i - 1.5) * 0.08).translate((-1.5 + i) * 0.0135 * k, -0.062 * k, 0);
    parts.push(colour(finger, (x, y) => (y < -0.09 * k ? SEAM : GLOVE)));
  }
  parts.push(colour(new THREE.CylinderGeometry(0.0075 * k, 0.0065 * k, 0.03 * k, 5, 1).translate(0, -0.015 * k, 0).rotateZ(0.9).translate(0.026 * k, -0.03 * k, 0), GLOVE));
  for (const [x, y] of [[-0.012, -0.03], [0.011, -0.042], [-0.004, -0.052]]) {
    // printed on the back of the hand, facing out (-z)
    parts.push(fan(ringPoints(10, 0.0085 * k, 0.004 * k), FLOWER, [0, 0], 0.001 * k, null, 0xf7d65a).rotateY(Math.PI).translate(x * k, y * k, -0.0105 * k));
  }
  const g = new THREE.Mesh(mergeGeometries(parts), painted());
  g.position.set(0, f.y - 0.024 * k, f.z - 0.032 * k);
  g.rotation.x = -0.38;
  g.scale.setScalar(1.25);
  head.add(g);
}

// ---- Sailor's Shell Necklace ----------------------------------------------

// A dark tarred cord with ten plump cowrie shells hung round it, cream
// blushing to coral at their tips, a pale bead between every other two, and
// at the front one big scallop: a ridged fan, its ribs coral and cream in
// turn, its hinge up on the cord. Shells, beads and scallop are one mesh.
const SHELL_CREAM = 0xfbf1e2, SHELL_CORAL = 0xe86a52, SHELL_CORD = 0x4a3222;
function addShellNecklace(head, a) {
  const { k } = a, ringR = a.ringR + 0.012 * k, tube = 0.0075 * k, shells = [];
  for (let i = 0; i < 12; i++) {
    const theta = (i / 12) * Math.PI * 2 - Math.PI / 2 + 0.26;
    const front = Math.abs(Math.atan2(Math.sin(theta + Math.PI / 2), Math.cos(theta + Math.PI / 2)));
    if (front < 0.45) continue; // the scallop's place, at the front
    const r = 0.017 * k;
    const cowrie = new THREE.SphereGeometry(r, 5, 3).scale(0.85, 1.45, 0.6).translate(0, -r * 1.45 - 0.003 * k, 0);
    shells.push(onRing(colour(cowrie, (x, y, z) => (z > 0.6 * r * 0.8 ? 0xa86a4a : mixHex(SHELL_CREAM, SHELL_CORAL, (-y / k - 0.01) / 0.04))), theta, ringR + tube + 0.004 * k));
    if (i % 2) shells.push(onRing(colour(new THREE.OctahedronGeometry(0.0072 * k), (x, y) => (y > 0 ? 0xfff8ee : 0xe8dccb)), theta + Math.PI / 12, ringR + tube + 0.002 * k));
  }
  // the scallop: 13 rim points, a scalloped edge, its ribs from a hinge on the cord
  const rim = ringPoints(12, 0.074 * k, 0.067 * k, Math.PI * 1.12, Math.PI * 1.88);
  const scallop = fan(rim, SHELL_CREAM, [0, 0.008 * k], 0.01 * k, (j) => (j % 4 < 2 ? SHELL_CORAL : SHELL_CREAM), 0xfff6ea);
  const ears = fan([[-0.016 * k, 0.012 * k], [0.016 * k, 0.012 * k], [0.012 * k, -0.002 * k], [-0.012 * k, -0.002 * k], [-0.016 * k, 0.012 * k]], SHELL_CORAL, [0, 0.005 * k], 0.004 * k);
  // the scallop hangs from the front of the cord, its hinge up
  shells.push(onRing(mergeGeometries([scallop, ears]).translate(0, -0.002 * k, 0), -Math.PI / 2, ringR + tube * 0.6, 0.006 * k));
  neckRing(head, a, paintedTorus(ringR, tube, 4, 16, (u) => (((u * 16 / Math.PI) | 0) % 2 ? SHELL_CORD : 0x6a4a32)), painted(), shells);
}

// ---- Gingham Neckerchief --------------------------------------------------

// Splits every triangle of a non-indexed geometry into four, `levels` times.
function subdivide(geo, levels) {
  let pos = Array.from(geo.attributes.position.array);
  for (let l = 0; l < levels; l++) {
    const out = [];
    for (let i = 0; i < pos.length; i += 9) {
      const A = pos.slice(i, i + 3), B = pos.slice(i + 3, i + 6), C = pos.slice(i + 6, i + 9);
      const mid = (P, Q) => P.map((v, j) => (v + Q[j]) / 2), ab = mid(A, B), bc = mid(B, C), ca = mid(C, A);
      out.push(...A, ...ab, ...ca, ...ab, ...B, ...bc, ...ca, ...bc, ...C, ...ab, ...bc, ...ca);
    }
    pos = out;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Gingham: three tones, as the weave makes them: red where a red stripe
// crosses a red one, pink where it crosses white, white where white crosses
// white. A look's `cloth` is its three tones. A `net` cloth (the Market's
// Shopping-Bag Scarf) is a string bag's mesh instead, cut one level finer
// (its cone open at the base, hidden at the throat): subdivide cuts each
// triangle into three corners and a turned-over middle, so every middle is a
// gap (cloth[0]) and the corners, joined all over the cloth, are the string
// (cloth[1]); the tied ends are string too.
const KERCHIEFS = {
  neckerchief: { cloth: [0xf7f2ea, 0xe87a78, 0xd8403a], band: [0xd8403a, 0xc0302a], knot: [0xe85a50, 0xc0302a] },
  stringbagscarf: { cloth: [0x245a48, 0x8fd0ac], net: 1, band: [0xf0ead0, 0x6fb894], knot: [0x9fd4b4, 0x4f9a7a] },
  // the Captain's Chest (the Reef): a red cloth with white spots, the gingham's three tones as spots on red; a black-blue band
  // Snowville's Snowflake Scarf: white and ice-blue checks on a pale blue band
  snowflakescarf: { cloth: [0xf2f7fc, 0xb4d4f0, 0x7aaee0], band: [0x6a9ad0, 0x8cb6e4], knot: [0xf2f7fc, 0xb4d4f0] },
  piratebandana: { cloth: [0xc8322c, 0xf2ece0, 0xa8221e], band: [0x1c2a4a, 0x2a3a5e], knot: [0x2a3a5e, 0x1c2a4a] },
};
const ginghamAt = (L, u, v, cell) => (L.net ? L.cloth[1] : L.cloth[(Math.floor(u / cell) & 1) + (Math.floor(v / cell) & 1)]);

// The bandana's cone (three sides, point down), flattened onto the chest and
// cut into small triangles, each painted by where its centre falls on the
// gingham.
function ginghamCone(L, radius, height, cell) {
  const g = subdivide(new THREE.ConeGeometry(radius, height, 3, 1, !!L.net).toNonIndexed(), L.net ? 3 : 2);
  const p = g.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, yy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    c.set(L.net ? L.cloth[i % 12 === 9 ? 0 : 1] : ginghamAt(L, x + radius, yy + height, cell));
    for (let j = 0; j < 3; j++) c.toArray(cols, (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// A gingham triangle tied at the throat by a red band round the neck, its
// point down the chest, laid like the bandana's and flattened onto it; a knot
// at the throat and two short tied ends either side of it. `id` picks the
// look (KERCHIEFS): its cloth, the band's two tones and the knot's.
const kerchief = (id) => (head, a) => {
  const L = KERCHIEFS[id], { k, y, z, ringR } = a, [B0, B1] = L.band;
  neckRing(head, a, paintedTorus(ringR, 0.012 * k, 4, 14, (u) => (((u * 14 / Math.PI) | 0) % 2 ? B0 : B1)), painted());
  const cat = k === 1, R = cat ? 0.145 : 0.125, H = cat ? 0.175 : 0.155;
  const cloth = ginghamCone(L, R, H, 0.021 * k);
  cloth.scale(1, 1, 0.85);
  // the knot and its two ends, at the cone's base (y = -H / 2: the throat, once
  // turned point down), on its front (-z: the face away from the neck)
  const knotAt = [0, -H / 2 + 0.006 * k, -R * 0.56];
  const knot = colour(new THREE.SphereGeometry(0.02 * k, 6, 4).scale(1.2, 0.9, 0.8).translate(...knotAt), (x, yy) => L.knot[yy < knotAt[1] ? 0 : 1]);
  const ends = [-1, 1].map((s) => colour(new THREE.ConeGeometry(0.015 * k, 0.042 * k, 4, 1).rotateZ(s * 0.9).translate(knotAt[0] + s * 0.026 * k, knotAt[1] + 0.012 * k, knotAt[2]), (x) => ginghamAt(L, x * 4 + 1, 0.5, 0.025)));
  const tri = new THREE.Mesh(mergeGeometries([cloth, knot, ...ends]), painted());
  if (cat) {
    tri.rotation.set(Math.PI, Math.PI, 0);
    tri.position.set(0, y - 0.03, z - 0.05);
  } else {
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.21, henNeckFrontZ(-0.135) - 0.066); // the bandana's, on his neck
  }
  head.add(tri);
};

// ---- Ticket-stub Garland --------------------------------------------------

// A fair ticket: a 4 x 4 grid, its ends cream paper and its middle a band of
// colour, a notch bitten out of each side halfway down; built facing +z,
// hanging from its top edge toward -y, seen from both sides.
function ticket(w, h, hex) {
  const xs = [-w, -0.55 * w, 0.55 * w, w], ys = [0, -h / 3, -2 * h / 3, -h], P = [], C = [], c = new THREE.Color();
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const notch = (j === 1 || j === 2) && (i === 0 || i === 3) ? 0.3 * w * Math.sign(xs[i]) : 0;
    P.push(xs[i] - notch, ys[j], 0);
    c.set(i === 0 || i === 3 || j === 0 || j === 3 ? 0xfaf3e0 : hex).toArray(C, C.length);
  }
  const idx = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const q = j * 4 + i; idx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

// Eleven paper tickets, four bright colours in turn, hung from a red-and-
// white twisted string round the neck by one corner each, so they swing at
// odd angles and twist a little, as if they had just fluttered. The tickets
// are one mesh.
function addTicketGarland(head, a) {
  const { k } = a, ringR = a.ringR + 0.012 * k, tube = 0.0055 * k, stubs = [], COLOURS = [0xf7b52b, 0xe2433a, 0x3fae5e, 0x3f8fd8];
  for (let i = 0; i < 11; i++) {
    const stub = ticket(0.025 * k, 0.066 * k, COLOURS[i % 4]);
    stub.translate(0, -0.003 * k, 0).rotateZ([0.22, -0.16, 0.3, -0.26, 0.12, -0.3, 0.2, -0.1, 0.28, -0.2, 0.15][i]).rotateY([0.3, -0.25, 0.15, -0.35, 0.25, -0.15, 0.35, -0.3, 0.2, -0.2, 0.3][i]);
    stub.computeVertexNormals();
    stubs.push(onRing(stub, (i / 11) * Math.PI * 2 + 0.1, ringR + tube + 0.004 * k));
  }
  neckRing(head, a, paintedTorus(ringR, tube, 3, 18, (u) => (((u * 18 / Math.PI) | 0) % 2 ? 0xf5f5f5 : 0xe2433a)), painted(), stubs, { side: THREE.DoubleSide });
}

// ---- Birthday Rosette (a gift outfit, src/foundwear/gifts.js) --------------

// A purple ribbon round the neck with a gold edge, and at the throat a
// pleated rosette: sixteen pleats in pink and gold round a cream middle, a
// gold button, five white sparkles round its rim and two ribbon tails, teal
// and purple, hanging under it. The ribbon is one mesh, the rosette another.
const ROSETTE_RIBBON = 0x8a5cf0, ROSETTE_GOLD = 0xf5c518, ROSETTE_PINK = 0xf27ab0, ROSETTE_CREAM = 0xfff4e0;
function addBirthdayRosette(head, a) {
  const { k } = a, tube = 0.011 * k, ringR = a.ringR + 0.004 * k;
  const c = [0, -0.03 * k];
  const at = (g, dz = 0) => g.translate(c[0], c[1], dz);
  const pleats = at(fan(ringPoints(16, 0.05 * k, 0.04 * k), ROSETTE_PINK, [0, 0], 0.007 * k, (i) => (i % 2 ? ROSETTE_GOLD : ROSETTE_PINK), ROSETTE_PINK));
  const middle = at(fan(ringPoints(10, 0.028 * k), ROSETTE_CREAM, [0, 0], 0.005 * k), 0.004 * k);
  const button = at(colour(new THREE.SphereGeometry(0.013 * k, 6, 4).scale(1, 1, 0.55), (x, y) => (y > 0 ? 0xffe066 : ROSETTE_GOLD)), 0.01 * k);
  const parts = [pleats, middle, button];
  for (const s of [-1, 1]) {
    const tail = new THREE.BoxGeometry(0.02 * k, 0.062 * k, 0.004 * k).translate(0, -0.031 * k, 0).rotateZ(s * 0.28).translate(s * 0.012 * k, c[1] - 0.03 * k, -0.002 * k);
    parts.push(colour(tail, s < 0 ? 0x4ec9d4 : ROSETTE_RIBBON));
  }
  for (let i = 0; i < 5; i++) {
    const t = Math.PI / 2 + (i / 5) * Math.PI * 2;
    parts.push(colour(new THREE.OctahedronGeometry(0.007 * k).scale(1, 1.4, 0.6).translate(c[0] + Math.cos(t) * 0.043 * k, c[1] + Math.sin(t) * 0.043 * k, 0.008 * k), 0xffffff));
  }
  const rosette = onRing(mergeGeometries(parts), -Math.PI / 2, ringR + tube + 0.006 * k, 0);
  neckRing(head, { ...a, ringR }, paintedTorus(ringR, tube, 4, 16, (u, v) => (Math.abs(Math.sin(v)) > 0.85 ? ROSETTE_GOLD : ROSETTE_RIBBON)), painted(), [rosette], { side: THREE.DoubleSide });
}

export const FOUND_NECKS = Object.freeze({
  daisychain: addDaisyChain,
  gardenglovescarf: addGardenGloveScarf,
  shellnecklace: addShellNecklace,
  neckerchief: kerchief('neckerchief'),
  ticketgarland: addTicketGarland,
  bdayrosette: addBirthdayRosette,
  stringbagscarf: kerchief('stringbagscarf'),
  piratebandana: kerchief('piratebandana'),
  snowflakescarf: kerchief('snowflakescarf'),
});
// ---- Collars --------------------------------------------------------------

// Bottle-top Collar: a dark leather band, a pale stitch line along each edge,
// with seven crimped bottle caps all round it, in the ring's plane as the
// studs are. Each cap is a fluted skirt (twelve crimps) and a top whose
// middle is its label's colour: red with a white middle, silver with red,
// gold with green, green with white, in turn. The band and caps are one
// mesh each.
const CAPS = [[0xd84040, 0xfaf3e0], [0xc8ccd4, 0xd84040], [0xf2c14e, 0x3f9e4d], [0x3f9e4d, 0xfaf3e0]];
function bottleCap(r, h, [rim, label]) {
  const P = [], C = [], c = new THREE.Color(), n = 12;
  const put = (x, y, z, hex) => { P.push(x, y, z); c.set(hex).toArray(C, C.length); };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const r0 = i % 2 ? r : r * 0.86, r1 = (i + 1) % 2 ? r : r * 0.86, t = r * 0.86;
    const B0 = [Math.cos(a0) * r0, -h / 2, Math.sin(a0) * r0], B1 = [Math.cos(a1) * r1, -h / 2, Math.sin(a1) * r1];
    const T0 = [Math.cos(a0) * t, h / 2, Math.sin(a0) * t], T1 = [Math.cos(a1) * t, h / 2, Math.sin(a1) * t];
    const dark = new THREE.Color(rim).multiplyScalar(0.72).getHex();
    put(...B0, dark); put(...T0, rim); put(...B1, dark);
    put(...B1, dark); put(...T0, rim); put(...T1, rim);
    put(...T0, rim); put(0, h / 2 + 0.15 * h, 0, label); put(...T1, rim);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}
function dressBottleTops(group, ring, { ringR, tubeR }) {
  ring.geometry = paintedTorus(ringR, tubeR, 6, 12, (u, v) => (Math.abs(Math.cos(v)) < 0.3 ? 0x8a8a92 : 0x3a3a42));
  ring.material = painted();
  const caps = [], h = tubeR * 0.6, r = tubeR * 1.25;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
    const cap = bottleCap(r, h, CAPS[i % 4]);
    cap.rotateZ(a - Math.PI / 2);
    cap.translate(Math.cos(a) * (ringR + tubeR * 0.75 + h / 2), Math.sin(a) * (ringR + tubeR * 0.75 + h / 2), 0);
    caps.push(cap);
  }
  ring.add(new THREE.Mesh(mergeGeometries(caps), painted()));
}

// Rope Collar: the ring itself twisted into a three-strand rope (its tube
// swells and narrows with three strands winding round it, each strand lit
// on its crown and shaded in its groove), and a reef knot at the throat: two
// small loops locked through each other, two frayed ends hanging from it.
// The knot is one mesh.
const ROPE = [0xc89a58, 0x8a6234];
function dressRope(group, ring, { ringR, tubeR, charmPos }) {
  const radial = 6, tubular = 24, geo = new THREE.TorusGeometry(ringR, tubeR, radial, tubular);
  const p = geo.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let j = 0; j <= radial; j++) for (let i = 0; i <= tubular; i++) {
    const u = (i / tubular) * Math.PI * 2, v = (j / radial) * Math.PI * 2, at = j * (tubular + 1) + i;
    const strand = Math.cos(3 * v - 8 * u);       // three strands winding round the tube, eight turns round the ring
    const swell = 1 + 0.16 * strand;
    const cx = Math.cos(u) * ringR, cy = Math.sin(u) * ringR;
    p.setXYZ(at, cx + (p.getX(at) - cx) * swell, cy + (p.getY(at) - cy) * swell, p.getZ(at) * swell);
    c.set(ROPE[strand > 0 ? 0 : 1]).toArray(cols, at * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  ring.geometry = geo;
  ring.material = painted();
  const u = tubeR, parts = [];
  for (const s of [-1, 1]) {
    parts.push(colour(new THREE.TorusGeometry(u * 0.75, u * 0.42, 3, 8).rotateY(s * 0.6).translate(s * u * 0.45, 0, 0), (x, y) => (y > 0 ? ROPE[0] : ROPE[1])));
    parts.push(colour(new THREE.CylinderGeometry(u * 0.38, u * 0.5, u * 2.2, 5, 1).translate(0, -u * 1.1, 0).rotateZ(s * 0.3).translate(s * u * 0.5, -u * 0.6, 0),
      (x, y) => (y < -u * 2.4 ? 0xf0dcae : ROPE[(Math.round(y / u * 3) & 1)])));
  }
  const knot = new THREE.Mesh(mergeGeometries(parts), painted());
  knot.position.copy(charmPos);
  group.add(knot);
}

// A charm's hang: the band in `band[0]` piped `band[1]` along both edges,
// and at the throat one mesh, `parts(u)` (u: the charm's unit, from the
// band's thickness), facing -z, its hanging ring at the top.
const charm = (band, parts) => (group, ring, { ringR, tubeR, charmPos }) => {
  ring.geometry = paintedTorus(ringR, tubeR, 8, 12, (u, v) => band[Math.abs(Math.sin(v)) > 0.9 ? 1 : 0]);
  ring.material = painted();
  const piece = new THREE.Mesh(mergeGeometries(parts(tubeR * 1.25)), painted());
  piece.position.copy(charmPos);
  group.add(piece);
};

// Anchor Charm: a navy band piped white along both edges, and a gold
// anchor at the throat, facing -z, one mesh: a ring at the top, a stock
// across with round ends, the shank, and two curved arms rising to arrow-head
// flukes.
const ANCHOR_GOLD = 0xf2c14e, ANCHOR_SHADE = 0xc8952a;
const gold = (u) => (x, y, z) => (z < -0.1 * u ? ANCHOR_GOLD : ANCHOR_SHADE);
const dressAnchor = charm([0x24365c, 0xf5f5f0], (u) => [
  colour(new THREE.TorusGeometry(0.3 * u, 0.1 * u, 4, 8).translate(0, 1.45 * u, 0), gold(u)),
  colour(new THREE.CylinderGeometry(0.13 * u, 0.13 * u, 2.3 * u, 5, 1).translate(0, 0.05 * u, 0), gold(u)),
  colour(new THREE.CylinderGeometry(0.1 * u, 0.1 * u, 1.3 * u, 5, 1).rotateZ(Math.PI / 2).translate(0, 0.85 * u, 0), gold(u)),
  ...[-1, 1].map((s) => colour(new THREE.SphereGeometry(0.14 * u, 5, 3).translate(s * 0.68 * u, 0.85 * u, 0), gold(u))),
  colour(new THREE.TorusGeometry(0.85 * u, 0.12 * u, 4, 9, Math.PI * 0.8).rotateZ(Math.PI * 1.1).translate(0, -0.25 * u, 0), gold(u)),
  ...[-1, 1].map((s) => colour(new THREE.ConeGeometry(0.22 * u, 0.42 * u, 4, 1).rotateZ(s * 0.5).translate(s * 0.8 * u, -0.12 * u, 0), gold(u))),
]);

// Apple Charm (the Market Square): the anchor's hang on a brown leather band
// piped cream, and from the same gold ring a small red apple, a paler shine
// on its upper left and a darker blush below, a brown stalk and one green leaf.
const dressApple = charm([0x8a5a32, 0xf2e6c8], (u) => [
  colour(new THREE.TorusGeometry(0.3 * u, 0.1 * u, 4, 8).translate(0, 1.45 * u, 0), gold(u)),
  colour(new THREE.SphereGeometry(0.6 * u, 8, 6).scale(1, 0.9, 0.8).translate(0, 0.45 * u, 0), (x, y, z) => (y > 0.6 * u && x < 0 ? 0xf27060 : y < 0.15 * u ? 0xa8222a : 0xd8303c)),
  colour(new THREE.CylinderGeometry(0.05 * u, 0.07 * u, 0.4 * u, 4, 1).rotateZ(-0.2).translate(0.03 * u, 1.1 * u, 0), 0x5a3a1c),
  colour(new THREE.SphereGeometry(0.24 * u, 5, 3).scale(1.7, 0.6, 0.4).rotateZ(0.4).translate(0.36 * u, 1.04 * u, -0.08 * u), (x, y) => (y > 1.04 * u ? 0x7cc04e : 0x3f8a32)),
]);

// Cake Charm (a gift outfit, src/foundwear/gifts.js): a pink ribbon collar
// and, at the throat, a slice of birthday cake facing -z, one mesh: a
// wedge, point down, in layers (sponge, jam, sponge), white frosting along
// its wide top, and a red cherry on the frosting.
const CAKE_SPONGE = 0xf2c46e, CAKE_JAM = 0xd8607e, CAKE_FROSTING = 0xfff4e0, CAKE_CHERRY = 0xd8303c;
function dressCakeCharm(group, ring, { tubeR, charmPos }) {
  const u = tubeR * 1.6, W = 1.5 * u, yTip = -0.95 * u, yTop = 0.55 * u, d = 0.42 * u;
  const half = (y) => (W / 2) * (y - yTip) / (yTop - yTip);
  const layer = (y0, y1, hex, grow = 0, deep = d) => {
    const pts = [[-half(y0) - grow, y0], [half(y0) + grow, y0], [half(y1) + grow, y1], [-half(y1) - grow, y1]];
    const shape = new THREE.Shape((y0 <= yTip ? [pts[0], pts[2], pts[3]] : pts).map(([x, y]) => new THREE.Vector2(x, y)));
    return colour(new THREE.ExtrudeGeometry(shape, { depth: deep, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -deep / 2), hex);
  };
  const parts = [
    layer(yTip, -0.15 * u, CAKE_SPONGE),
    layer(-0.15 * u, 0.02 * u, CAKE_JAM),
    layer(0.02 * u, 0.4 * u, CAKE_SPONGE),
    layer(0.4 * u, yTop + 0.12 * u, CAKE_FROSTING, 0.05 * u, d * 1.15),
    colour(new THREE.SphereGeometry(0.2 * u, 6, 4).translate(0.05 * u, yTop + 0.3 * u, -0.05 * u), (x, y) => (y > yTop + 0.38 * u ? 0xf06a6a : CAKE_CHERRY)),
  ];
  const cake = new THREE.Mesh(mergeGeometries(parts), painted());
  cake.position.copy(charmPos);
  group.add(cake);
}

// Moon Badge (the Moon's story prize): a pale-steel band piped blue, and at the throat a small silver disc with a crescent (a thick
// arc of the disc's own silver, raised) and a gold star beside it, facing -z. One mesh.
const dressMoonBadge = charm([0x8e98b0, 0x3a4a86], (u) => [
  colour(new THREE.CylinderGeometry(0.95 * u, 0.95 * u, 0.2 * u, 12, 1).rotateX(Math.PI / 2), 0xc9d1e0),
  colour(new THREE.TorusGeometry(0.55 * u, 0.15 * u, 4, 10, Math.PI * 1.25).rotateZ(Math.PI * 0.4).translate(-0.12 * u, 0, -0.16 * u), 0xf4f7ff),
  colour(new THREE.OctahedronGeometry(0.22 * u).scale(1, 1, 0.5).translate(0.4 * u, 0.2 * u, -0.16 * u), 0xf2c14e),
]);

// Pearl Collar (the Reef): a pale seafoam band piped white, and at the throat one large pearl with a pale shine, a small gold cap above it
// and a smaller pearl either side. Faces -z, one mesh.
const dressPearl = charm([0xa8d8cf, 0xf5f5f0], (u) => [
  colour(new THREE.SphereGeometry(0.7 * u, 8, 6).translate(0, -0.1 * u, 0), (x, y, z) => (z < -0.35 * u && y > 0.2 * u ? 0xffffff : 0xf1ece4)),
  colour(new THREE.CylinderGeometry(0.2 * u, 0.28 * u, 0.28 * u, 5, 1).translate(0, 0.78 * u, 0), () => 0xf2c14e),
  ...[-1, 1].map((sx) => colour(new THREE.SphereGeometry(0.32 * u, 6, 4).translate(sx * 1.05 * u, 0.3 * u, 0), () => 0xe8e2d6)),
]);

// Glimmer Collar (the Crystal Cave): a violet band piped pale rose, and at the throat one tall rose-pink crystal with a smaller sky-blue one and a gold one
// either side, a pale shine on the tall one. Faces -z, one mesh.
const dressGlimmer = charm([0x8a6ac0, 0xf4c6dc], (u) => [
  colour(new THREE.OctahedronGeometry(0.5 * u).scale(0.7, 1.5, 0.6).translate(0, -0.05 * u, 0), (x, y, z) => (z < -0.15 * u && y > 0.2 * u ? 0xffe4f4 : 0xff6fa8)),
  colour(new THREE.OctahedronGeometry(0.3 * u).scale(0.7, 1.3, 0.6).translate(-0.7 * u, 0.1 * u, 0), () => 0x62b8ff),
  colour(new THREE.OctahedronGeometry(0.3 * u).scale(0.7, 1.3, 0.6).translate(0.7 * u, 0.1 * u, 0), () => 0xffc65a),
]);

// Signal Tag (the Moon's Old Relay Station): a teal band piped white, and at the throat a small silver tag with a gold dot and a signal arc over it. Faces -z, one mesh.
const dressSignalTag = charm([0x3fb8a8, 0xf1f3f8], (u) => [
  colour(new THREE.CylinderGeometry(0.8 * u, 0.8 * u, 0.18 * u, 10, 1).rotateX(Math.PI / 2), 0xc9d1e0),
  colour(new THREE.SphereGeometry(0.2 * u, 6, 4).translate(0, -0.3 * u, -0.14 * u), () => 0xf2c14e),
  colour(new THREE.TorusGeometry(0.42 * u, 0.09 * u, 4, 8, Math.PI).translate(0, -0.05 * u, -0.14 * u), () => 0x3fb8a8),
]);

export const FOUND_COLLARS = Object.freeze({
  glimmercollar: Object.freeze({ ring: 0x8a6ac0, charmed: true, dress: dressGlimmer }),
  pearlcollar: Object.freeze({ ring: 0xa8d8cf, charmed: true, dress: dressPearl }),
  moonbadge: Object.freeze({ ring: 0x8e98b0, charmed: true, dress: dressMoonBadge }),
  signaltag: Object.freeze({ ring: 0x3fb8a8, charmed: true, dress: dressSignalTag }),
  bottletopcollar: Object.freeze({ ring: 0x3a3a42, charmed: false, dress: dressBottleTops }),
  ropecollar: Object.freeze({ ring: 0xc8a46a, charmed: true, dress: dressRope }),
  anchorcharm: Object.freeze({ ring: 0x24365c, charmed: true, dress: dressAnchor }),
  cakecharm: Object.freeze({ ring: 0xf2a0c0, charmed: true, dress: dressCakeCharm }),
  applecharm: Object.freeze({ ring: 0x8a5a32, charmed: true, dress: dressApple }),
});

// The found neck piece, if `id` is one; nothing otherwise.
export function addFoundNeck(head, id, { k, y, z, ringR, ringBack = 0, tilt }) {
  if (typeof id === 'string' && Object.hasOwn(FOUND_NECKS, id)) FOUND_NECKS[id](head, { k, y, z, ringR, ringBack, tilt });
}
