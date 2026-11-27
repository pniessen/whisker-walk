// Found outfits: the body and back slots, on the cat only (Hagrid wears no
// body or back item). Every walk hides one find-only outfit (src/foundwear/
// holds the records).
//
// BODY. FOUND_BODY[id] is one of:
//   { kind: 'cape', colour, accent, paint? }
//     a cloak on the back, built by model.js capeOn as the Hero Cape is: the
//     cloth (stand and sit) and its throat clasp and bands (accent: the
//     clasp's colour). paint(a, s) -> hex colours the cloth: a runs across it
//     (-1 one flank, 0 the spine, +1 the other), s along it (0 at the neck,
//     1 at the hem); without it the cloth is plain `colour`;
//   { kind: 'shell', colour, paint? }
//     a coat cut from the torso, built by model.js coatShell as the sweater
//     is. paint(ux, uy, uz) -> hex colours each vertex by its unit direction
//     on the torso (geo.userData.unit: +y up, -z the chest); without it the
//     coat is plain `colour`.
// The kind is wearkind.js bodyKind's answer, so the fur it covers, a pack
// resting on it and the hood all make room as for the shop's.
//
// BACK, FLOATS. FOUND_FLOATS[id] = (kit) -> void, something floating over the
// cat on strings like the balloons. kit is model.js's own balloon kit:
//   onBack(x, y, z)        [x, y, z]: a point on the back (cat frame), moved
//                          from where it sat on the old torso onto this one
//   floatOn(piece, tie)    hangs `piece` on the cat, floating from `tie`
//   floatString(tie, top, r) a string from `tie` up to `top`
//   ball(r, colour, sx, sy, sz, wSeg, hSeg), mat(colour)
// (animator.js floatBalloons keeps each floating piece upright over its tie.)
// A found PACK is not here: it is a backitems.js BACK_ITEM_IDS entry, built
// by buildBackItem like the Tiny Backpack (its meshes carry userData.backItem).
//
// model.js tags each mesh it adds through this file userData.foundWear = id.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';

// The Doormat Cape: coir, woven in ridges (every other row of the cloth a
// shade darker, flecked), a dark border down the flanks (|a| > 0.85) and at
// the hem (s > 0.88), and a big dark paw print in the middle of the back,
// where the walk camera sees it: a pad and four toes. Counted from a and s, so
// it is the same cloth on the stand and sit grids and in a simple build
// (which has every other vertex: the print comes out coarser, not elsewhere).
const COIR = 0xc08d4e, COIR_RIDGE = 0xa8783c, COIR_BORDER = 0x5a3c22, COIR_PRINT = 0x4a3020;
const COIR_FLECK = new THREE.Color(COIR).multiplyScalar(0.85).getHex();
const PAW = [[0, 0.7, 0.24, 0.12], [-0.3, 0.52, 0.09, 0.055], [-0.11, 0.46, 0.09, 0.055], [0.11, 0.46, 0.09, 0.055], [0.3, 0.52, 0.09, 0.055]];
function doormatPaint(a, s) {
  if (Math.abs(a) > 0.85 || s > 0.88) return COIR_BORDER;
  if (PAW.some(([pa, ps, ra, rs]) => ((a - pa) / ra) ** 2 + ((s - ps) / rs) ** 2 < 1)) return COIR_PRINT;
  const row = Math.round(s * 20);
  if (row % 2) return COIR_RIDGE;
  return (Math.round((a + 1) * 12) + 2 * row) % 3 === 0 ? COIR_FLECK : COIR;
}

// The Beach-towel Cape: broad stripes across it, four sunny colours in turn,
// a thin white line between each two, and a white fringed hem.
const TOWEL_STRIPES = [0xf2763c, 0xf7d84a, 0x2fa6a0, 0xf28aa8];
function towelPaint(a, s) {
  if (s > 0.94) return Math.round((a + 1) * 12) % 2 ? 0xfaf6ec : TOWEL_STRIPES[0];
  const band = s * 6.2, f = band - Math.floor(band);
  return f < 0.12 ? 0xfaf6ec : TOWEL_STRIPES[Math.floor(band) % 4];
}

// The Fisherman's Jumper: a thick cream knit, its rows ribbed (every other
// row of the shell a shade darker, so the knit catches the light in ridges),
// two broad navy bands round the body with a thin red line between them, as
// a harbour jumper has, and deep ribbing round both ends, the neck and the
// hem. Painted by uz (along the body) for its bands: the shell's grid draws
// those cleanly (narrow lengthwise cables came out as blotches).
const JUMPER = 0xeee2c6, JUMPER_KNIT = 0xdccaa4, JUMPER_SHADOW = 0xb8a47e, JUMPER_NAVY = 0x2a3f66, JUMPER_RED = 0xc8463c;
function jumperPaint(ux, uy, uz) {
  if (uz > 0.82 || uz < -0.72) return Math.round(Math.atan2(ux, uy) * 12) % 2 ? JUMPER : JUMPER_SHADOW; // ribbing
  if (Math.abs(uz - 0.02) < 0.1 || Math.abs(uz - 0.44) < 0.1) return JUMPER_NAVY;
  if (Math.abs(uz - 0.23) < 0.04) return JUMPER_RED;
  return Math.round(uz * 16) % 2 ? JUMPER : JUMPER_KNIT;
}

// The Starlight Cape (the Moon): deep navy cloth shading darker toward the hem, a scatter of small stars (pale gold and ice blue) at
// hand-chosen cloth cells, a pale seam down the flanks and at the hem. Counted from a and s like the others, so the stand, sit and
// simple grids all show the same sky.
const NIGHT = 0x2a3a82, NIGHT_LOW = 0x1c2766, STAR = 0xfff4c4, STAR_ICE = 0xd2e2ff, SEAM = 0xc9d3ee;
function starlightPaint(a, s) {
  if (Math.abs(a) > 0.88 || s > 0.93) return SEAM;
  const i = Math.round(a * 6), j = Math.round(s * 10), h = (i * 7 + j * 13 + i * j * 5 + 40) % 8;
  if (h < 3 && Math.hypot(a * 6 - i, (s * 10 - j) * 0.7) < 0.6) return h ? STAR_ICE : STAR;
  return s > 0.6 ? NIGHT_LOW : NIGHT;
}


// The Evergreen Sweater (a Christmas shop item): deep evergreen knit, ribbed at the neck and hem, a band of small red and cream
// diamonds round the chest. Painted by uz (along the body) like the jumper's bands, so the shell's grid draws it cleanly.
const EVERGREEN = 0x2f7a4a, EVERGREEN_KNIT = 0x3a8a58, EVERGREEN_SHADOW = 0x24623b, SWEATER_RED = 0xc8303a, SWEATER_CREAM = 0xf3ead2;
function evergreenPaint(ux, uy, uz) {
  if (uz > 0.82 || uz < -0.72) return Math.round(Math.atan2(ux, uy) * 12) % 2 ? EVERGREEN : EVERGREEN_SHADOW;
  if (Math.abs(uz - 0.12) < 0.1) return (Math.round(Math.atan2(ux, uy) * 7) + Math.round(uz * 20)) % 2 ? SWEATER_RED : SWEATER_CREAM;
  return Math.round(uz * 16) % 2 ? EVERGREEN : EVERGREEN_KNIT;
}

export const FOUND_BODY = Object.freeze({
  doormatcape: Object.freeze({ kind: 'cape', colour: COIR, accent: COIR_BORDER, paint: doormatPaint }),
  beachtowelcape: Object.freeze({ kind: 'cape', colour: 0xf2763c, accent: 0xf2c14e, paint: towelPaint }),
  fishermansjumper: Object.freeze({ kind: 'shell', colour: JUMPER, paint: jumperPaint }),
  starlightcape: Object.freeze({ kind: 'cape', colour: NIGHT, accent: STAR_ICE, paint: starlightPaint }),
  evergreensweater: Object.freeze({ kind: 'shell', colour: EVERGREEN, paint: evergreenPaint }),
});

// The Kite-tail Ribbon: a little diamond kite flying up behind her on a white
// string tied at the root of the tail (as the Tail Balloon's is), its four
// panels two colours with dark spars across, and its tail of five ribbon bows
// along the string below it: each bow two flattened cones meeting at a round
// knot. Kite and bows are one vertex-coloured mesh, built where they hang
// (its position stays at the origin, floatOn keeps it over the tie). Under
// the whole-cat thumbnail's top.
const KITE_BOWS = Object.freeze([0xe2433a, 0xf7c93b, 0x3fae5e, 0x3f8fd8, 0xf08a2c]);
const KITE = Object.freeze([0xe2433a, 0xf7c93b]), KITE_SPAR = 0x5a3a1c;
function kiteTail({ onBack, floatOn, floatString }) {
  const foot = new THREE.Vector3(...onBack(0, 0.5, 0.31)), top = new THREE.Vector3(0, 0.86, 0.44);
  floatString(foot, top, 0.003);
  const parts = [];
  KITE_BOWS.forEach((hex, i) => {
    const at = foot.clone().lerp(top, 0.2 + 0.16 * i);
    for (const side of [-1, 1]) {
      const wing = new THREE.ConeGeometry(0.024, 0.056, 6, 1);
      wing.rotateZ(side * Math.PI / 2);          // the point toward the knot, the wide end out
      wing.scale(1, 1, 0.3);                     // flattened
      wing.rotateZ(side * 0.25);                 // the loops lift a little
      wing.translate(side * 0.028 + at.x, at.y, at.z);
      wing.deleteAttribute('uv');
      parts.push(paintedGeo(wing, (x) => (Math.abs(x - at.x) > 0.04 ? new THREE.Color(hex).multiplyScalar(0.8).getHex() : hex)));
    }
    const knot = new THREE.SphereGeometry(0.009, 5, 3).translate(at.x, at.y, at.z);
    knot.deleteAttribute('uv');
    parts.push(paintedGeo(knot, () => new THREE.Color(hex).multiplyScalar(0.75).getHex()));
  });
  // the kite: a diamond 13 cm tall, bowed (its middle 1.5 cm proud on each face)
  const c = top.clone().add(new THREE.Vector3(0, 0.07, 0.01)), H = 0.065, W = 0.048, B = 0.012;
  const corners = [[0, H], [W, 0.02], [0, -H * 1.1], [-W, 0.02]];
  const pos = [], col = [];
  for (const face of [-1, 1]) for (let q = 0; q < 4; q++) {
    const [ax, ay] = corners[q], [bx, by] = corners[(q + 1) % 4], hex = KITE[q % 2];
    const tri = [[0, 0.02, face * B], [ax, ay, 0], [bx, by, 0]];
    if (face < 0) tri.reverse();
    for (const [x, y, z] of tri) {
      pos.push(c.x + x, c.y + y, c.z + z);
      new THREE.Color(Math.hypot(x, y - 0.02) < 0.004 ? KITE_SPAR : hex).toArray(col, col.length);
    }
  }
  const kite = new THREE.BufferGeometry();
  kite.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  kite.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  kite.computeVertexNormals();
  parts.push(kite);
  for (const [w, h, rot] of [[0.004, H * 2.05, 0], [0.004, W * 2, Math.PI / 2]]) {
    const spar = new THREE.BoxGeometry(w, h, 0.004).toNonIndexed();
    spar.rotateZ(rot).translate(c.x, c.y + (rot ? 0.02 : -0.0035), c.z + B * 0.5);
    spar.deleteAttribute('uv');
    parts.push(paintedGeo(spar, () => KITE_SPAR));
  }
  floatOn(new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), litMaterial(0xffffff, { vertexColors: true })), foot);
}

// The Candyfloss Puff: a striped paper cone on a stick, on a string from the
// back up over the shoulders, and on the cone a pink cloud of candyfloss:
// seven soft wisps (small balls, their surfaces tufted), deeper pink low and pale,
// nearly white, on top. One vertex-coloured mesh.
const FLOSS = 0xf7b6d2, FLOSS_DEEP = 0xee8fb8, FLOSS_PALE = 0xfde4ee, FLOSS_STICK = 0xf5f0e0, FLOSS_CONE = [0xfaf6ec, 0x7ac6e0];
function candyfloss({ onBack, floatOn, floatString }) {
  const tie = new THREE.Vector3(...onBack(0.05, 0.6, 0.2)), top = new THREE.Vector3(0.05, 0.86, 0.2);
  floatString(tie, top, 0.0035).material = litMaterial(FLOSS_STICK);
  const lumps = [[0, 0.012, 0, 0.056], [-0.046, 0, 0.012, 0.044], [0.046, 0, -0.012, 0.044], [0.006, -0.004, 0.046, 0.042], [-0.006, -0.004, -0.046, 0.042],
    [-0.018, 0.048, 0.006, 0.036], [0.022, -0.04, 0.004, 0.036]];
  const parts = lumps.map(([x, y, z, r], k) => {
    const ball = new THREE.SphereGeometry(r, 7, 5);
    const p = ball.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const tuft = 1 + 0.07 * Math.sin(p.getX(i) * 211 + k) * Math.cos(p.getY(i) * 173 + p.getZ(i) * 97);
      p.setXYZ(i, p.getX(i) * tuft, p.getY(i) * tuft, p.getZ(i) * tuft);
    }
    ball.translate(x, y, z);
    ball.deleteAttribute('uv');
    ball.computeVertexNormals();
    return paintedGeo(ball, (px, py) => (py > 0.035 ? FLOSS_PALE : py < -0.03 ? FLOSS_DEEP : FLOSS));
  });
  // the paper cone it was spun onto, under the cloud, striped round
  const cone = new THREE.ConeGeometry(0.022, 0.07, 8, 2, true).rotateX(Math.PI).translate(0, -0.075, 0);
  cone.deleteAttribute('uv');
  parts.push(paintedGeo(cone, (px, py, pz) => FLOSS_CONE[Math.round(Math.atan2(px, pz) * 8 / Math.PI + py * 60) & 1]));
  const puff = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), litMaterial(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
  puff.name = 'candyflosspuff';
  puff.position.set(0.05, 0.95, 0.2);
  floatOn(puff, tie);
}
// Birthday Balloon (a gift outfit, src/foundwear/gifts.js): one round purple
// balloon on a white string tied on where the tail begins, as the Tail
// Balloon is, floating up behind her a little to one side; a gold knot under
// it. Not the Party Balloon's pink nor the Tail Balloon's yellow.
const BDAY_BALLOON = 0xa45ce8, BDAY_KNOT = 0xf5c518;
function birthdayBalloon({ onBack, floatOn, floatString, ball }) {
  const foot = new THREE.Vector3(...onBack(0, 0.5, 0.31)), top = new THREE.Vector3(0.05, 0.85, 0.42);
  floatString(foot, top, 0.0035);
  const knot = ball(0.016, BDAY_KNOT, 1, 1.2, 1, 6, 4);
  knot.position.set(0.05, 0.865, 0.42);
  floatOn(knot, foot);
  const balloon = ball(0.092, BDAY_BALLOON, 1, 1.14, 1, 12, 9);
  balloon.position.set(0.05, 0.965, 0.42);
  floatOn(balloon, foot);
}

// A flat five-pointed star, `depth` thick, facing -z (the back's open side) once hung: one mesh, its points straight up.
function starMesh(outer, inner, depth, hex) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer, a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  geo.deleteAttribute('uv');
  return new THREE.Mesh(geo, litMaterial(hex));
}
// Little Gold Star (a Christmas earned piece): one gold star hovering over her shoulders on a white string tied where the tail begins.
function littleGoldStar({ onBack, floatOn, floatString }) {
  const foot = new THREE.Vector3(...onBack(0, 0.5, 0.31)), top = new THREE.Vector3(0, 0.84, 0.4);
  floatString(foot, top, 0.0035);
  const star = starMesh(0.058, 0.026, 0.014, 0xf2c14e);
  star.position.set(0, 0.9, 0.4);
  floatOn(star, foot);
}
// Star Topper Halo (a Winter Lights earned piece): a thin gold ring lying flat over the shoulders with a small pale-gold star standing on it.
function starTopperHalo({ onBack, floatOn, floatString }) {
  const foot = new THREE.Vector3(...onBack(0, 0.5, 0.31)), top = new THREE.Vector3(0, 0.8, 0.4);
  floatString(foot, top, 0.0035);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.009, 4, 14).rotateX(Math.PI / 2), litMaterial(0xe0a82e));
  ring.position.set(0, 0.84, 0.4);
  floatOn(ring, foot);
  const star = starMesh(0.036, 0.016, 0.01, 0xffe08a);
  star.position.set(0, 0.9, 0.4);
  floatOn(star, foot);
}
export const FOUND_FLOATS = Object.freeze({ kitetailribbon: kiteTail, candyflosspuff: candyfloss, bdayballoon: birthdayBalloon, littlegoldstar: littleGoldStar, startopper: starTopperHalo });

function paintedGeo(geo, hexOf) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) c.setHex(hexOf(p.getX(i), p.getY(i), p.getZ(i))).toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// buildFoldedJumper() -> one vertex-coloured mesh named 'wear:fishermansjumper',
// the jumper's ground look: folded soft and square, about 24 x 5 x 18 cm,
// puffed on top and rounded at its edges, its two navy bands and red line
// across it, its ribbed hem along the near edge and its ribbed neckline
// folded on top at the far one; painted as the coat is (jumperPaint). Built
// about its own centre; seatDisplay stands it on the ground.
export function buildFoldedJumper() {
  const W = 0.24, H = 0.05, D = 0.18;
  const fold = new THREE.BoxGeometry(W, H, D, 6, 1, 7);
  const p = fold.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), fx = x / (W / 2), fz = z / (D / 2), fy = y / (H / 2);
    const round = 1 - 0.07 * fy * fy;                       // its edges rounded
    const puff = fy > 0 ? 0.012 * (1 - fx * fx) * (1 - fz * fz) : 0; // its top puffed
    p.setXYZ(i, x * round, y + puff, z * round);
  }
  fold.deleteAttribute('uv');
  fold.computeVertexNormals();
  paintedGeo(fold, (x, y, z) => jumperPaint(x / (W / 2) * 0.62, y, z / (D / 2) * 0.64 + 0.21));
  // the ribbed neckline, folded on top at the far edge
  const neck = new THREE.TorusGeometry(0.05, 0.011, 3, 8, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.6, 0.75).translate(0, H / 2 + 0.008, -D / 2 + 0.012);
  neck.deleteAttribute('uv');
  const parts = [fold, paintedGeo(neck, (x) => (Math.round(x * 120) % 2 ? JUMPER : JUMPER_SHADOW))];
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), litMaterial(0xffffff, { vertexColors: true }));
  mesh.name = 'wear:fishermansjumper';
  return mesh;
}
