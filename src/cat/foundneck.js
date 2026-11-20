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
const painted = () => litMaterial(0xffffff, { vertexColors: true });

// Flat-shaded, uv-less and coloured per vertex, so any pieces can be merged.
function colour(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// A flat fan facing +z: the centre, then the points in order (a star, a disc,
// a scallop).
function fan(points, hex, centre = [0, 0]) {
  const pos = [];
  for (let i = 0; i + 1 < points.length; i++) pos.push(centre[0], centre[1], 0, ...points[i], 0, ...points[i + 1], 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return colour(g, hex);
}
const ringPoints = (n, r, inner = r, from = 0, to = Math.PI * 2) =>
  Array.from({ length: n + 1 }, (_, i) => { const a = from + (to - from) * i / n, rr = i % 2 ? inner : r; return [rr * Math.cos(a), rr * Math.sin(a)]; });

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
function neckRing(head, { k, y, z, ringR, ringBack, tilt }, geo, material, children = []) {
  const ring = new THREE.Mesh(geo, material);
  ring.rotation.x = Math.PI / 2 - tilt;
  ring.position.set(0, y, z + ringBack);
  head.add(ring);
  if (children.length) ring.add(new THREE.Mesh(mergeGeometries(children), painted()));
  return ring;
}

// Where a front piece sits: the ring's front on the cat; on Hagrid (k < 1) his
// neck's front surface, 5 cm below the anchor, where the necktie's knot sits.
function frontOf({ k, y, z, ringR, ringBack, tilt }) {
  if (k === 1) return { y: y - ringR * Math.cos(Math.PI / 2 - tilt), z: z + ringBack - ringR * Math.sin(Math.PI / 2 - tilt) };
  return { y: y - 0.05, z: henNeckFrontZ(y - 0.05) - 0.02 };
}

// ---- Daisy Chain ----------------------------------------------------------

// Nine daisies on a thin green stem ring: six white petals round a gold
// centre, each lying against the ring, facing out. One vertex-coloured mesh.
function addDaisyChain(head, a) {
  const { k, ringR } = a, tube = 0.008 * k, daisies = [];
  for (let i = 0; i < 9; i++) {
    const theta = (i / 9) * Math.PI * 2 + 0.2;
    const petals = fan(ringPoints(12, 0.034 * k, 0.014 * k), 0xf8f8f0);
    const centre = fan(ringPoints(6, 0.011 * k), 0xf2c14e); centre.translate(0, 0, 0.003 * k);
    daisies.push(onRing(mergeGeometries([petals, centre]), theta, ringR + tube + 0.002 * k));
  }
  neckRing(head, a, new THREE.TorusGeometry(ringR, tube, 5, 12), plain(0x5a9a3c), daisies);
}

// ---- Garden Glove Scarf ---------------------------------------------------

// A check scarf: the band's vertices alternate light and dark green, so the
// quads shade into soft checks; a knot at the front, and a gardening glove
// tucked in it, cuff up, fingers down the chest, three flowers on its back.
function addGardenGloveScarf(head, a) {
  const { k, ringR } = a, GREEN = 0x6a9a4a, LIGHT = 0x88b868;
  const band = new THREE.TorusGeometry(ringR, 0.04 * k, 6, 14);
  const cols = new Float32Array(band.attributes.position.count * 3), w = band.parameters.tubularSegments + 1;
  for (let v = 0; v < band.attributes.position.count; v++) new THREE.Color(((v % w) + Math.floor(v / w)) % 2 ? LIGHT : GREEN).toArray(cols, v * 3);
  band.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  neckRing(head, a, band, painted());
  const f = frontOf(a);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.034 * k, 6, 4), plain(GREEN));
  knot.position.set(0, f.y - 0.01 * k, f.z - 0.012 * k);
  head.add(knot);
  const box = (w2, h, d, x, y, hex) => colour(new THREE.BoxGeometry(w2 * k, h * k, d * k).translate(x * k, y * k, 0), hex);
  const GLOVE = 0xf2d7a0, FLOWER = 0xe27a9a;
  const parts = [box(0.056, 0.05, 0.014, 0, -0.03, GLOVE), box(0.062, 0.016, 0.018, 0, -0.005, GLOVE)];
  for (let i = 0; i < 4; i++) parts.push(box(0.012, 0.036, 0.01, (-1.5 + i) * 0.0135, -0.073, GLOVE));
  parts.push(box(0.014, 0.03, 0.01, 0.04, -0.045, GLOVE));
  for (const [x, y] of [[-0.012, -0.022], [0.012, -0.04], [-0.005, -0.056]]) {
    const flower = fan(ringPoints(6, 0.009 * k), FLOWER); flower.translate(x * k, y * k, -0.0085 * k);
    parts.push(flower);
  }
  const glove = new THREE.Mesh(mergeGeometries(parts), painted());
  glove.position.set(0, f.y - 0.022 * k, f.z - 0.03 * k);
  glove.rotation.x = -0.38;
  head.add(glove);
}

// ---- Sailor's Shell Necklace ----------------------------------------------

// A cord with eleven small cone shells hung round it and, at the front, one
// big scallop (a ridged fan). The shells and the scallop are one mesh.
function addShellNecklace(head, a) {
  const { k } = a, ringR = a.ringR + 0.012 * k, tube = 0.006 * k, shells = [];
  for (let i = 0; i < 11; i++) {
    const theta = (i / 11) * Math.PI * 2 - Math.PI / 2 + 0.3;
    if (Math.abs(Math.atan2(Math.sin(theta + Math.PI / 2), Math.cos(theta + Math.PI / 2))) < 0.4) continue; // the scallop's place, at the front
    shells.push(onRing(colour(new THREE.ConeGeometry(0.014 * k, 0.034 * k, 5, 1).rotateX(Math.PI), i % 2 ? 0xf2c6b0 : 0xf6e7d2).translate(0, -0.012 * k, 0), theta, ringR + tube));
  }
  const scallop = fan(ringPoints(10, 0.05 * k, 0.043 * k, Math.PI * 1.15, Math.PI * 1.85), 0xf7d9c4, [0, 0.02 * k]);
  // the scallop hangs from the front of the cord, its hinge up
  shells.push(onRing(scallop, -Math.PI / 2, ringR + tube + 0.004 * k, 0.012 * k));
  neckRing(head, a, new THREE.TorusGeometry(ringR, tube, 4, 14), plain(0x8a6a4a), shells);
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

// The bandana's cone (three sides, point down), cut into small triangles each
// painted red or white by where its centre falls on a grid of cells: gingham.
function ginghamCone(radius, height, cell) {
  const g = subdivide(new THREE.ConeGeometry(radius, height, 3, 1).toNonIndexed(), 2);
  const p = g.attributes.position, cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    c.set((Math.floor(x / cell) + Math.floor(z / cell)) & 1 ? 0xd8403a : 0xf5f0e8);
    for (let j = 0; j < 3; j++) c.toArray(cols, (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

// A gingham triangle tied at the throat by a red band round the neck, its
// point down the chest, laid like the bandana's.
function addNeckerchief(head, a) {
  const { k, y, z, ringR } = a;
  neckRing(head, a, new THREE.TorusGeometry(ringR, 0.012 * k, 4, 14), plain(0xd8403a));
  const cat = k === 1;
  const tri = new THREE.Mesh(ginghamCone(cat ? 0.14 : 0.12, cat ? 0.17 : 0.15, 0.04 * k), painted());
  if (cat) {
    tri.rotation.set(Math.PI, Math.PI, 0);
    tri.position.set(0, y - 0.03, z - 0.05);
  } else {
    tri.rotation.x = Math.PI;
    tri.position.set(0, -0.21, henNeckFrontZ(-0.135) - 0.066); // the bandana's, on his neck
  }
  head.add(tri);
}

// ---- Ticket-stub Garland --------------------------------------------------

// Eleven little paper stubs, four colours in turn, hung from a white string
// round the neck. The stubs are one mesh.
function addTicketGarland(head, a) {
  const { k } = a, ringR = a.ringR + 0.012 * k, tube = 0.005 * k, stubs = [], COLOURS = [0xf7c93b, 0xe2433a, 0x4eb86a, 0xf08a2c];
  for (let i = 0; i < 11; i++) {
    const stub = colour(new THREE.BoxGeometry(0.04 * k, 0.056 * k, 0.004 * k).translate(0, -0.026 * k, 0), COLOURS[i % 4]);
    stub.rotateZ(i % 2 ? 0.14 : -0.14);
    stubs.push(onRing(stub, (i / 11) * Math.PI * 2 + 0.1, ringR + tube + 0.002 * k));
  }
  neckRing(head, a, new THREE.TorusGeometry(ringR, tube, 3, 14), plain(0xf5f5f5), stubs);
}

export const FOUND_NECKS = Object.freeze({
  daisychain: addDaisyChain,
  gardenglovescarf: addGardenGloveScarf,
  shellnecklace: addShellNecklace,
  neckerchief: addNeckerchief,
  ticketgarland: addTicketGarland,
});
export const FOUND_COLLARS = Object.freeze({});

// The found neck piece, if `id` is one; nothing otherwise.
export function addFoundNeck(head, id, { k, y, z, ringR, ringBack = 0, tilt }) {
  if (typeof id === 'string' && Object.hasOwn(FOUND_NECKS, id)) FOUND_NECKS[id](head, { k, y, z, ringR, ringBack, tilt });
}
