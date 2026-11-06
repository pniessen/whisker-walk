// polish-cosy — the den's cosy shell. Looks only: wallpaper and a sage
// wainscot, a dado rail, oak beams across the wall tops, a hanging lamp over
// the window spot, a painted door with a cat flap in the north wall, a curtain
// pelmet, and a braided rag rug in front of the door.
//
// FOUR MESHES, FOUR DRAWS. Everything is written straight into one indexed,
// vertex-coloured BufferGeometry per material, so the whole shell costs four
// draw calls and (the woodwork only) one shadow caster:
//
//   denWallpaper  noCast, receives shadow  papered walls, stripes and sprigs
//   denWoodwork   casts                    dado, beams, door, pelmet, lamp
//   denRagRug     noCast, receives shadow  the rug, flat on the boards
//   denLampGlow   noCast, unlit            the bulb inside the shade
//
// Every mesh carries userData.noMerge. mergeStaticProps keys on material
// parameters, not on castShadow or userData, and three of these materials
// are the same white vertex-coloured litMaterial — left mergeable, the noCast
// wallpaper and rug would weld into the casting woodwork. They are already one
// mesh each, so there is nothing for the merge to save anyway.
//
// noCast meshes are skipped ENTIRELY by rig.js's caster sweep (it does not set
// receiveShadow on them either), so receiveShadow is set here at build time.
//
// NOTHING HERE TOUCHES LAYOUT. No collider, perch, spot or shop value moves:
// the wall dressing lives within 0.16 of the wall planes (the cat is held to
// |x|,|z| <= 8 by bounds), the beams and lamp are above the walls' tops or the
// camera's default height, and the rug is 12 mm of paint on the floor.
//
// THE CAMERA. The follow camera sits ~2.2-2.9 up at the default step and up
// to ~5.4 pitched up, anywhere in the room. So: beams sit ON the wall tops
// (bottom at wallH) and never south of z 2.5; the lamp hangs at z -6, over the
// window spot, far from the spawn camera path; and the open south wall's
// DEN_CAMERA_WEDGE gets nothing at all. test/dencosy.test.js pins all three.
//
// Deterministic: the only jitter (which sprig is a leaf and which a bud, a
// whisper of shade along the beams) is drawn from mulberry32 seeded from a
// fixed code, in a fixed order. Two builds are byte-identical.
import * as THREE from 'three';
import { litMaterial } from '../render/materials.js';
import { mulberry32, seedFromCode } from '../rng.js';

export const DEN_DOOR = Object.freeze({ x: -7.3, w: 0.95, h: 2.1 });
export const RAG_RUG = Object.freeze({ x: -7.3, z: -7.55, rx: 0.75, rz: 0.48 });
export const BEAM_Z = Object.freeze([-6, -1.5]);
export const LAMP = Object.freeze({ x: 0, z: -6, shadeBottom: 2.78 });

// Palette.
const SAGE = 0xa9b28a;
const CREAM = 0xe6d6bc;
const STRIPE = 0xd9c6a6;
const LEAF = 0x9aa77a;
const BUD = 0xc98a7a;
const TRIM = 0xf0e4d0;
const OAK = 0x8a6038;
const OAK_END = 0x6a4628;
const DOOR = 0x6f8a6a;
const DOOR_PANEL = 0x5f7a5b;
const BRASS = 0xc9a24a;
const FLAP_FRAME = 0x4a4a4a;
const FLAP = 0x7a8a7a;
const PELMET = 0x8a5a3a;
const SHADE = 0xe8b86a;
const SHADE_INNER = 0xf4d49a;
const CORD = 0x4a3a2a;
const GLOW = 0xffd890;
const RUG_RINGS = [0xb85a4e, 0xe0c48a, 0x5a7a8a, 0x8a6a9a, 0xd8a070, 0x6a8a5a];

// Wall dressing heights.
const WAINSCOT_Y0 = 0.08;
const DADO_Y = 0.95;
const PAPER_Y1 = 2.25;
const STRIPE_W = 0.12;
const STRIPE_PITCH = 0.36;
const SPRIG_ROWS = [1.27, 1.6, 1.93];
const SPRIG_W = 0.06;
const SPRIG_H = 0.085;
const PAPER_OFF = 0.004;  // wallpaper in front of the wall's inner face
const SPRIG_OFF = 0.007;  // sprigs in front of the paper
const ARCH_W = 0.08;
const DOOR_FACE = 8.76;   // |z| of the door's front face

// ---------------------------------------------------------------------------
// A tiny accumulator: positions, normals, linear colours, indices.
// ---------------------------------------------------------------------------
function sink() {
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpN = new THREE.Vector3();
  function vert(p, n, hex, shade = 1) {
    c.setHex(hex);
    pos.push(p[0], p[1], p[2]);
    nor.push(n[0], n[1], n[2]);
    col.push(c.r * shade, c.g * shade, c.b * shade);
    return pos.length / 3 - 1;
  }
  return {
    // A planar quad a-b-c-d (in order round its edge), wound to face `n`.
    quad(a, b, cc, d, n, hex, shade = 1) {
      tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      tmpB.set(cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]);
      tmpN.crossVectors(tmpA, tmpB);
      const flip = tmpN.x * n[0] + tmpN.y * n[1] + tmpN.z * n[2] < 0;
      const i0 = vert(a, n, hex, shade);
      const i1 = vert(b, n, hex, shade);
      const i2 = vert(cc, n, hex, shade);
      const i3 = vert(d, n, hex, shade);
      if (flip) idx.push(i0, i2, i1, i0, i3, i2);
      else idx.push(i0, i1, i2, i0, i2, i3);
    },
    // A triangle a-b-c, wound to face `n`.
    tri(a, b, cc, n, hex, shade = 1) {
      tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      tmpB.set(cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]);
      tmpN.crossVectors(tmpA, tmpB);
      const flip = tmpN.x * n[0] + tmpN.y * n[1] + tmpN.z * n[2] < 0;
      const i0 = vert(a, n, hex, shade);
      const i1 = vert(b, n, hex, shade);
      const i2 = vert(cc, n, hex, shade);
      if (flip) idx.push(i0, i2, i1);
      else idx.push(i0, i1, i2);
    },
    // An axis-aligned box from min to max corners; `skip` names faces left
    // out ('-x', '+y', ...) because they are buried in a wall or a beam.
    box(x0, y0, z0, x1, y1, z1, hex, skip = '', shade = 1) {
      const f = (name, a, b, cc, d, n) => { if (!skip.includes(name)) this.quad(a, b, cc, d, n, hex, shade); };
      f('-x', [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
      f('+x', [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
      f('-y', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
      f('+y', [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
      f('-z', [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
      f('+z', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    },
    // A THREE primitive, transformed by `matrix`, in one colour. `flip`
    // reverses its winding and normals (the inside of the lamp shade).
    geometry(geo, matrix, hex, flip = false) {
      geo.applyMatrix4(matrix);
      const p = geo.attributes.position;
      const n = geo.attributes.normal;
      const base = pos.length / 3;
      const s = flip ? -1 : 1;
      for (let i = 0; i < p.count; i++) {
        vert([p.getX(i), p.getY(i), p.getZ(i)], [n.getX(i) * s, n.getY(i) * s, n.getZ(i) * s], hex);
      }
      const ix = geo.index;
      const count = ix ? ix.count : p.count;
      for (let i = 0; i < count; i += 3) {
        const a = ix ? ix.getX(i) : i;
        const b = ix ? ix.getX(i + 1) : i + 1;
        const cc = ix ? ix.getX(i + 2) : i + 2;
        if (flip) idx.push(base + a, base + cc, base + b);
        else idx.push(base + a, base + b, base + cc);
      }
      geo.dispose();
    },
    build() {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    },
  };
}

// ---------------------------------------------------------------------------
// The three dressed walls, each as a 2-D frame (u along the wall, y up) and a
// map from (u, y, offset-into-room) to world space.
// ---------------------------------------------------------------------------
function walls({ wallX, wallZ, winHalf, sillY, winTop }) {
  const ix = wallX - 0.1; // inner faces: the wall boxes are 0.2 thick
  const iz = wallZ - 0.1;
  const doorHalf = DEN_DOOR.w / 2 - 0.01 + ARCH_W; // architrave's outer edge
  const doorTop = DEN_DOOR.h + ARCH_W - 0.01;
  return [
    {
      id: 'north', u0: -ix, u1: ix, n: [0, 0, 1],
      at: (u, y, off) => [u, y, -iz + off],
      // The window opening (+0.15 margin past its jambs) and the door.
      paperSkips: [
        { u0: -winHalf - 0.15, u1: winHalf + 0.15, y0: sillY, y1: winTop },
        { u0: DEN_DOOR.x - doorHalf, u1: DEN_DOOR.x + doorHalf, y0: 0, y1: doorTop },
      ],
      // The dado also stops at the sill's ends (the sill is winHalf + 0.2).
      dadoSkips: [
        { u0: -winHalf - 0.2, u1: winHalf + 0.2 },
        { u0: DEN_DOOR.x - doorHalf, u1: DEN_DOOR.x + doorHalf },
      ],
    },
    {
      id: 'west', u0: -iz, u1: iz, n: [1, 0, 0],
      at: (u, y, off) => [-ix + off, y, u],
      // The bookcase (den.js DEN_FIXTURES: z -3.4, 1.8 wide, 1.9 tall) keeps
      // its own wooden back rather than showing wallpaper through its shelves.
      paperSkips: [{ u0: -4.3, u1: -2.5, y0: 0, y1: 1.9 }],
      dadoSkips: [{ u0: -4.3, u1: -2.5 }],
    },
    {
      id: 'east', u0: -iz, u1: iz, n: [-1, 0, 0],
      at: (u, y, off) => [ix - off, y, u],
      paperSkips: [],
      dadoSkips: [],
    },
  ];
}

// Clip [a, b] against a list of {u0, u1} holes; returns the pieces left.
function clip(a, b, holes) {
  let pieces = [[a, b]];
  for (const h of holes) {
    const next = [];
    for (const [p, q] of pieces) {
      if (h.u1 <= p || h.u0 >= q) { next.push([p, q]); continue; }
      if (h.u0 > p) next.push([p, h.u0]);
      if (h.u1 < q) next.push([h.u1, q]);
    }
    pieces = next;
  }
  return pieces;
}

// A horizontal band [y0, y1] of a wall, split into sub-bands at every skip's
// top and bottom so each sub-band clips against exactly the skips covering it.
// `runs` is the band's colour pattern along u as [u0, u1, hex] runs.
function band(s, wall, y0, y1, runs) {
  const cuts = new Set([y0, y1]);
  for (const k of wall.paperSkips) {
    if (k.y0 > y0 && k.y0 < y1) cuts.add(k.y0);
    if (k.y1 > y0 && k.y1 < y1) cuts.add(k.y1);
  }
  const ys = [...cuts].sort((p, q) => p - q);
  for (let i = 0; i < ys.length - 1; i++) {
    const ya = ys[i];
    const yb = ys[i + 1];
    const holes = wall.paperSkips.filter((k) => k.y0 <= ya && k.y1 >= yb);
    for (const [ra, rb, hex] of runs) {
      for (const [p, q] of clip(ra, rb, holes)) {
        s.quad(wall.at(p, ya, PAPER_OFF), wall.at(q, ya, PAPER_OFF),
          wall.at(q, yb, PAPER_OFF), wall.at(p, yb, PAPER_OFF), wall.n, hex);
      }
    }
  }
}

function inSkip(wall, u, y, margin) {
  return wall.paperSkips.some((k) => u > k.u0 - margin && u < k.u1 + margin && y > k.y0 - margin && y < k.y1 + margin);
}

function wallpaper(opts, rnd) {
  const s = sink();
  for (const wall of walls(opts)) {
    // Sage wainscot, plain, skirting to dado.
    band(s, wall, WAINSCOT_Y0, DADO_Y, [[wall.u0, wall.u1, SAGE]]);
    // Cream paper with soft stripes, centred on the wall's middle so the two
    // ends of every wall match.
    const runs = [];
    let u = wall.u0;
    const kMin = Math.ceil((wall.u0 - STRIPE_W / 2) / STRIPE_PITCH);
    const kMax = Math.floor((wall.u1 + STRIPE_W / 2) / STRIPE_PITCH);
    for (let k = kMin; k <= kMax; k++) {
      const a = Math.max(wall.u0, k * STRIPE_PITCH - STRIPE_W / 2);
      const b = Math.min(wall.u1, k * STRIPE_PITCH + STRIPE_W / 2);
      if (a > u) runs.push([u, a, CREAM]);
      if (b > a) runs.push([a, b, STRIPE]);
      u = Math.max(u, b);
    }
    if (u < wall.u1) runs.push([u, wall.u1, CREAM]);
    band(s, wall, DADO_Y, PAPER_Y1, runs);
    // Sprigs, centred between stripes, on three staggered rows.
    for (let r = 0; r < SPRIG_ROWS.length; r++) {
      const y = SPRIG_ROWS[r];
      for (let k = kMin; k < kMax; k++) {
        if ((k + r) % 2 !== 0) continue;
        const cu = (k + 0.5) * STRIPE_PITCH;
        const hex = rnd() < 0.5 ? LEAF : BUD;
        if (cu - SPRIG_W < wall.u0 || cu + SPRIG_W > wall.u1) continue;
        if (inSkip(wall, cu, y, 0.08)) continue;
        s.quad(wall.at(cu, y - SPRIG_H / 2, SPRIG_OFF), wall.at(cu + SPRIG_W / 2, y, SPRIG_OFF),
          wall.at(cu, y + SPRIG_H / 2, SPRIG_OFF), wall.at(cu - SPRIG_W / 2, y, SPRIG_OFF), wall.n, hex);
      }
    }
  }
  return s.build();
}

// A wall-local box: u along the wall, y up, `off` out from the wall face.
function wallBox(s, wall, ua, ub, ya, yb, offA, offB, hex, shade = 1) {
  const p = wall.at(ua, ya, offA);
  const q = wall.at(ub, yb, offB);
  s.box(Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.min(p[2], q[2]),
    Math.max(p[0], q[0]), Math.max(p[1], q[1]), Math.max(p[2], q[2]), hex, '', shade);
}

function woodwork(opts, rnd) {
  const { wallX, wallH, winHalf, winTop } = opts;
  const s = sink();
  const all = walls(opts);

  // Dado rail, 0.05 x 0.05, broken at the window, the door and the bookcase.
  for (const wall of all) {
    for (const [p, q] of clip(wall.u0, wall.u1, wall.dadoSkips)) {
      wallBox(s, wall, p, q, DADO_Y - 0.025, DADO_Y + 0.025, 0, 0.05, TRIM);
    }
  }

  // Two beams across the wall tops, darker where they meet the walls. Two,
  // not three: a third at z 2 sat 6 m in front of the spawn camera and drew a
  // heavy bar across the top of the opening view, hiding the lamp.
  const endLen = 0.25;
  for (const bz of BEAM_Z) {
    const z0 = bz - 0.1;
    const z1 = bz + 0.1;
    const y0 = wallH;
    const y1 = wallH + 0.22;
    const shade = 0.94 + rnd() * 0.08;
    s.box(-wallX + endLen, y0, z0, wallX - endLen, y1, z1, OAK, '-x+x', shade);
    s.box(-wallX, y0, z0, -wallX + endLen, y1, z1, OAK_END, '+x', shade);
    s.box(wallX - endLen, y0, z0, wallX, y1, z1, OAK_END, '-x', shade);
  }

  // The door, in the north wall.
  const north = all[0];
  const dx = DEN_DOOR.x;
  const half = DEN_DOOR.w / 2;
  const face = opts.wallZ - DOOR_FACE - 0.1; // offset of the door face from the wall's inner face
  wallBox(s, north, dx - half, dx + half, 0, DEN_DOOR.h, 0, face, DOOR);
  // Two recessed panels, read by shade: upper and lower, a hair proud.
  const pw = half - 0.17;
  wallBox(s, north, dx - pw, dx + pw, 1.18, 1.92, face, face + 0.004, DOOR_PANEL);
  wallBox(s, north, dx - pw, dx + pw, 0.52, 1.02, face, face + 0.004, DOOR_PANEL);
  // Brass knob: a short octagonal stub off the door's face.
  {
    const knob = new THREE.CylinderGeometry(0.04, 0.04, 0.07, 8, 1, false);
    knob.deleteAttribute('uv');
    const m = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const [kx, ky, kz] = north.at(dx + half - 0.12, 1.0, face + 0.035);
    m.setPosition(kx, ky, kz);
    s.geometry(knob, m, BRASS);
  }
  // Architrave, overlapping the door's edges by a centimetre.
  const ai = half - 0.01;
  const ao = ai + ARCH_W;
  const aTop = DEN_DOOR.h - 0.01;
  wallBox(s, north, dx - ao, dx - ai, 0, aTop + ARCH_W, 0, face + 0.02, TRIM);
  wallBox(s, north, dx + ai, dx + ao, 0, aTop + ARCH_W, 0, face + 0.02, TRIM);
  wallBox(s, north, dx - ai, dx + ai, aTop, aTop + ARCH_W, 0, face + 0.02, TRIM);
  // The cat flap at the door's foot: a dark frame and a grey-green flap.
  wallBox(s, north, dx - 0.16, dx + 0.16, 0.1, 0.4, face, face + 0.02, FLAP_FRAME);
  wallBox(s, north, dx - 0.12, dx + 0.12, 0.13, 0.37, face + 0.02, face + 0.026, FLAP);

  // A pelmet boxing in the existing curtain rail (rail: y winTop+0.3, z -8.65).
  {
    const w = winHalf * 2 + 1.4;
    const cy = winTop + 0.38;
    const cz = -opts.wallZ + 0.35;
    s.box(-w / 2, cy - 0.11, cz - 0.07, w / 2, cy + 0.11, cz + 0.07, PELMET, '-z');
  }

  // The lamp: a cord from the z -6 beam and an eight-sided cone shade.
  {
    const shadeH = 0.3;
    const top = LAMP.shadeBottom + shadeH;
    s.box(LAMP.x - 0.012, top, LAMP.z - 0.012, LAMP.x + 0.012, wallH, LAMP.z + 0.012, CORD, '+y');
    const m = new THREE.Matrix4().makeTranslation(LAMP.x, LAMP.shadeBottom + shadeH / 2, LAMP.z);
    const outer = new THREE.CylinderGeometry(0.12, 0.32, shadeH, 8, 1, true);
    outer.deleteAttribute('uv');
    s.geometry(outer, m, SHADE);
    const inner = new THREE.CylinderGeometry(0.12, 0.32, shadeH, 8, 1, true);
    inner.deleteAttribute('uv');
    s.geometry(inner, m, SHADE_INNER, true);
    // The closed top, both ways: shade-coloured from above (a pitched-up
    // camera looks down on it), lit-inside colour from below.
    const cm = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    cm.setPosition(LAMP.x, top, LAMP.z);
    for (const [hex, flip] of [[SHADE, false], [SHADE_INNER, true]]) {
      const cap = new THREE.CircleGeometry(0.12, 8);
      cap.deleteAttribute('uv');
      s.geometry(cap, cm, hex, flip);
    }
  }
  return s.build();
}

// Six concentric braided rings, 28 segments; every other segment a shade
// darker so each ring reads as a braid rather than a band.
function ragRug(rnd) {
  const s = sink();
  const SEG = 28;
  const y = 0.012;
  const up = [0, 1, 0];
  const pt = (f, i) => {
    const a = (i / SEG) * Math.PI * 2;
    return [RAG_RUG.x + Math.cos(a) * RAG_RUG.rx * f, y, RAG_RUG.z + Math.sin(a) * RAG_RUG.rz * f];
  };
  const rings = RUG_RINGS.length;
  for (let r = 0; r < rings; r++) {
    const hex = RUG_RINGS[r];
    const f0 = r / rings;
    const f1 = (r + 1) / rings;
    const tone = 0.97 + rnd() * 0.06;
    for (let i = 0; i < SEG; i++) {
      const shade = tone * (i % 2 ? 0.9 : 1);
      if (r === 0) {
        const c = [RAG_RUG.x, y, RAG_RUG.z];
        s.tri(c, pt(f1, i), pt(f1, i + 1), up, hex, shade);
      } else {
        s.quad(pt(f0, i), pt(f1, i), pt(f1, i + 1), pt(f0, i + 1), up, hex, shade);
      }
    }
  }
  return s.build();
}

function lampGlow() {
  const geo = new THREE.SphereGeometry(0.09, 8, 6);
  geo.deleteAttribute('uv');
  geo.translate(LAMP.x, LAMP.shadeBottom + 0.12, LAMP.z);
  return geo;
}

function meshOf(geometry, material, name, { noCast }) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.noMerge = true;
  if (noCast) {
    mesh.userData.noCast = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
  }
  return mesh;
}

export function cosyShell({ wallX = 9, wallZ = 9, wallH = 3.2, winHalf = 2.2, sillY = 1.0, winTop = 2.6 } = {}) {
  const opts = { wallX, wallZ, wallH, winHalf, sillY, winTop };
  const rnd = mulberry32(seedFromCode('DENCOSY'));
  const lit = () => litMaterial(0xffffff, { vertexColors: true });
  const group = new THREE.Group();
  group.name = 'denCosy';
  group.add(meshOf(wallpaper(opts, rnd), lit(), 'denWallpaper', { noCast: true }));
  group.add(meshOf(woodwork(opts, rnd), lit(), 'denWoodwork', { noCast: false }));
  group.add(meshOf(ragRug(rnd), lit(), 'denRagRug', { noCast: true }));
  const glow = meshOf(lampGlow(), new THREE.MeshBasicMaterial({ color: GLOW }), 'denLampGlow', { noCast: true });
  glow.receiveShadow = false;
  group.add(glow);
  return group;
}
