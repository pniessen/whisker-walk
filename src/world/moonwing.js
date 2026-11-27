// =============================================================================
// THE MOON: WING B, STAR HILL, AS DRAWING (milestone 5). Two parts, so the zone logic (world/moonzones.js) can hold the wing as a stand-in:
//   the STAND-IN   always drawn: the tower and its spiral ramp, about 450 triangles put into the Moon's own 'stone' bucket (the one merged mesh of
//                  stone that Skip Ridge and Earthrise Rock are in), so it costs NO draw call of its own and stands on the horizon from anywhere;
//   'moon:wing'    drawn within 55 m: the observatory (eight pillars, a ring beam, a shallow dome with a slit and a dark inside, the telescope on its
//                  pedestal, the table's stone) as one paint mesh, and ONE additive mesh 'moon:wingfigs' that holds the Star Table's
//                  five pictures and the Great Cat on the ceiling (a figure is a colour write: world/moonfigures.js setLevel).
// So the wing is two meshes (three draws with its shadow) when she is near and none when she is not. Every number is moonplan.js's. No random number, no clock.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as P from './moonplan.js';
import { createKit, paint, box, cyl } from './moonparts.js';
import { tableFigureGeometry, ceilingFigureGeometry, mergeFigures, figureMaterial } from './moonfigures.js';
import { skyDir } from './moonstars.js';

export const WING_COL = Object.freeze({ stone: 0x9b9899, top: 0xb4b2b1, band: 0x7c7a7d, white: 0xf1f3f8, steel: 0x7d848f, navy: 0x141b2e, brass: 0xd9a441, lamp: 0xffd987, table: 0xaeb1ba, hazard: 0xf0c43c });
const TAU = Math.PI * 2;
const STEPS = 72; // the ramp's stations

// The ramp as one geometry in world coordinates: the top strip, the outer wall down to the ground, the end face. `base` is the dust's height.
function rampGeometry() {
  const H = P.STAR_HILL;
  const ri = H.rs - H.w / 2;
  const ro = H.rs + H.w / 2;
  const floor = -0.3;
  const top = [];
  const wall = [];
  const end = [];
  const st = (t, r) => {
    const a = P.rampAngle(t);
    const x = H.x + Math.cos(a) * r;
    const z = H.z + Math.sin(a) * r;
    return [x, P.moonBaseY(x, z) + P.rampHeight(t), z];
  };
  const down = (p) => [p[0], floor, p[2]];
  const quad = (list, a, b, c, d) => list.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < STEPS; i++) {
    const t0 = i / STEPS;
    const t1 = (i + 1) / STEPS;
    const i0 = st(t0, ri); const o0 = st(t0, ro); const i1 = st(t1, ri); const o1 = st(t1, ro);
    quad(top, i0, i1, o1, o0);
    if (P.rampHeight(t1) > 0.02) quad(wall, o0, o1, down(o1), down(o0));
  }
  const ei = st(1, ri); const eo = st(1, ro);
  quad(end, ei, eo, down(eo), down(ei));
  const make = (list, hex) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3)); g.computeVertexNormals(); return paint(g, hex); };
  return [make(top, WING_COL.top), make(wall, WING_COL.stone), make(end, WING_COL.band)];
}

// flip: turn a geometry inside out (the dome's inside: front faces look inward), keeping it non-indexed with normals.
function flip(g) {
  const geo = g.index ? g.toNonIndexed() : g;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i + 2 < p.count; i += 3) {
    for (const a of [p, geo.attributes.uv].filter(Boolean)) {
      const s = a.itemSize;
      for (let k = 0; k < s; k++) { const v = a.array[i * s + k]; a.array[i * s + k] = a.array[(i + 2) * s + k]; a.array[(i + 2) * s + k] = v; }
    }
  }
  if (n) for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return geo;
}

// A shallow dome of radius `rad` at its base and `rise` high with a slit, base ring at y = 0, as a cap of a larger sphere.
function domeCap(rad, rise, slitMid, slitW, inset = 0) {
  const Rs = (rad * rad + rise * rise) / (2 * rise);
  const R = Rs - inset;
  const th = Math.asin(Math.min(1, rad / Rs));
  const g = new THREE.SphereGeometry(R, 28, 6, slitMid + slitW / 2, TAU - slitW, 0, th);
  g.translate(0, -Rs * Math.cos(th), 0);
  return { g, Rs, drop: Rs * Math.cos(th) };
}

// drawWing(mainKit, M) -> { wing, figs, floorY }: the stand-in goes into the Moon's own kit; the returned group is the detail.
export function drawWing(mainKit, M) {
  const H = P.STAR_HILL;
  const O = P.OBSERVATORY;
  const T = P.STAR_TABLE;

  // ---- always drawn: the tower and its ramp (one stone mesh) -----------------------------------------------------------------
  const far = mainKit; // (the Moon's own kit: its 'stone' bucket is one merged mesh that is always drawn)
  const g0 = P.moonBaseY(H.x, H.z);
  far.put('stone', M.stone, paint(new THREE.CylinderGeometry(H.top, H.top + 0.05, H.h + 0.3 + g0, 20).translate(H.x, (H.h + g0 - 0.3) / 2, H.z), WING_COL.stone));
  far.put('stone', M.stone, paint(new THREE.CylinderGeometry(H.top - 0.15, H.top, 0.34, 20).translate(H.x, g0 + H.h - 0.12, H.z), WING_COL.band));
  far.put('stone', M.stone, paint(new THREE.CircleGeometry(H.top, 20).rotateX(-Math.PI / 2).translate(H.x, g0 + H.h + 0.02, H.z), WING_COL.top));
  // the paving (a lighter disc and a darker ring inside it) is part of the same mesh, a hair above the top: a separate mesh 5 cm over a caster is shadow acne
  far.put('stone', M.stone, paint(new THREE.CircleGeometry(P.OBSERVATORY.floor, 24).rotateX(-Math.PI / 2).translate(H.x, g0 + H.h + 0.035, H.z), WING_COL.table));
  far.put('stone', M.stone, paint(new THREE.RingGeometry(P.OBSERVATORY.ring + 0.5, P.OBSERVATORY.ring + 0.75, 24).rotateX(-Math.PI / 2).translate(H.x, g0 + H.h + 0.05, H.z), WING_COL.steel));
  // two courses of lighter stone round the tower, so a wall of one colour reads as laid stone
  for (const y of [1.7, 3.4]) far.put('stone', M.stone, paint(new THREE.CylinderGeometry(H.top + 0.06, H.top + 0.06, 0.22, 20).translate(H.x, g0 + y, H.z), WING_COL.top));
  for (const g of rampGeometry()) far.put('stone', M.stone, g);

  // ---- within 55 m: the observatory, the lamps, the table, the ceiling ---------------------------------------------------------
  const kit = createKit('moonB2');
  const fy = g0 + H.h; // the floor's height
  const slitMid = Math.atan2(-Math.cos((12 * Math.PI) / 180), Math.sin((12 * Math.PI) / 180)); // toward Earth, in a sphere's own phi
  // the paved floor, a darker ring at its edge, eight pillars and the ring beam
  for (const p of P.PILLAR_SPOTS) {
    kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(O.pillarR * 0.8, O.pillarR, O.pillarH, 8).translate(p.x, fy + O.pillarH / 2, p.z), WING_COL.white));
    kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(O.pillarR * 1.25, O.pillarR * 1.25, 0.18, 8).translate(p.x, fy + 0.09, p.z), WING_COL.steel));
  }
  kit.put('paint', M.paint, paint(new THREE.TorusGeometry(O.ring, 0.16, 5, 28).rotateX(Math.PI / 2).translate(O.x, fy + O.pillarH, O.z), WING_COL.white));
  // the dome (white outside) and its dark inside, both with the slit toward Earth
  const out = domeCap(O.dome, O.domeRise, slitMid, 0.55);
  out.g.translate(O.x, fy + O.pillarH, O.z);
  kit.put('paint', M.paint, paint(out.g, WING_COL.white));
  const inn = domeCap(O.dome, O.domeRise, slitMid, 0.55, 0.12);
  inn.g.translate(O.x, fy + O.pillarH, O.z);
  kit.put('paint', M.paint, paint(flip(inn.g), WING_COL.navy), { noCast: true });
  // (buildings beauty) a hazard band under the dome's ring and eight pale lit slits between the pillars
  kit.put('paint', M.paint, paint(new THREE.TorusGeometry(O.ring, 0.05, 3, 28).rotateX(Math.PI / 2).translate(O.x, fy + O.pillarH - 0.2, O.z), WING_COL.hazard), { noCast: true });
  for (let i = 0; i < O.pillars; i++) {
    const a = (i / O.pillars) * Math.PI * 2;
    kit.put('paint', M.paint, paint(new THREE.BoxGeometry(0.5, 0.14, 0.05).rotateY(-a - Math.PI / 2).translate(O.x + Math.cos(a) * (O.ring + 0.05), fy + 0.7, O.z + Math.sin(a) * (O.ring + 0.05)), WING_COL.lamp), { noCast: true }); // (a bright paint, not a glow mesh: the wing group's draw count stays at its two)
  }
  // the telescope's pedestal and mount (the tube is a mesh of its own)
  kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 10).translate(O.x, fy + 0.3, O.z), WING_COL.steel));
  kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(0.16, 0.22, 1.1, 8).translate(O.x, fy + 1.0, O.z), WING_COL.white));
  kit.put('paint', M.paint, paint(new THREE.BoxGeometry(0.8, 0.12, 0.14).translate(O.x, fy + 1.58, O.z), WING_COL.steel));
  // the ramp's lamps: a small post every few metres along its outer edge (each topped with a small cream stone)
  for (let i = 1; i <= 12; i++) {
    const t = (i / 12) * (1 - H.flat) * 0.96;
    const p = P.rampPoint(t, H.w / 2 - 0.12);
    const gy = P.moonBaseY(p.x, p.z) + p.y;
    kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6).translate(p.x, gy + 0.15, p.z), WING_COL.steel), { noCast: true });
    kit.put('paint', M.paint, paint(new THREE.OctahedronGeometry(0.17, 0).translate(p.x, gy + 0.4, p.z), WING_COL.lamp), { noCast: true });
  }
  // a hazard stripe at the ramp's mouth, so the way up reads from the plain
  { const m = P.rampPoint(0.02, 0); kit.put('paint', M.paint, paint(box(2.8, 0.05, 0.3), WING_COL.hazard).rotateY(-P.rampAngle(0.02)).translate(m.x, P.moonBaseY(m.x, m.z) + m.y + 0.05, m.z), { noCast: true }); }
  // the Star Table: a stone pedestal and a tilted round top
  const ty = P.moonBaseY(T.x, T.z);
  kit.put('paint', M.paint, paint(cyl(0.5, 0.75, T.top - 0.05, 10).translate(T.x, ty + (T.top - 0.05) / 2, T.z), WING_COL.stone));
  kit.put('paint', M.paint, paint(new THREE.CylinderGeometry(T.r, T.r, 0.12, 20).rotateX(0.3).translate(T.x, ty + T.top, T.z), WING_COL.navy));
  kit.put('paint', M.paint, paint(new THREE.TorusGeometry(T.r, 0.07, 4, 20).rotateX(Math.PI / 2 + 0.3).translate(T.x, ty + T.top + 0.04, T.z), WING_COL.white), { noCast: true });

  // the telescope's tube sits in the paint mesh, resting toward Earth (it does not move: the scope's page hides the 3D scene while it is open)
  const tube = mergeTube();
  tube.rotateX((-21 * Math.PI) / 180).rotateY(Math.atan2(skyDir(12, 21).x, skyDir(12, 21).z)).translate(O.x, fy + 1.7, O.z);
  kit.put('paint', M.paint, tube);

  // the additive figures mesh: the table's five pictures ('t' + c0..c4) and the ceiling's Great Cat ('ceil' + cat)
  const tableGeo = tableFigureGeometry().rotateX(0.3).translate(T.x, ty + T.top + 0.12, T.z);
  // the ceiling's picture lies on a sphere with the dome's own middle (Rs cos(theta) under the ring beam), a hair inside the dark shell
  const ceilGeo = ceilingFigureGeometry(inn.Rs - 0.17, 1.45).translate(O.x, fy + O.pillarH - inn.drop, O.z);
  const figsGeo = mergeFigures([['t', tableGeo], ['ceil', ceilGeo]]);
  const figs = new THREE.Mesh(figsGeo, figureMaterial());
  figs.name = 'moon:wingfigs';
  figs.castShadow = false;
  figs.receiveShadow = false;
  figs.renderOrder = 3;
  Object.assign(figs.userData, { noMerge: true, noCast: true, noContactShadow: true });

  const wing = new THREE.Group();
  wing.name = 'moon:wing';
  for (const m of kit.meshes()) wing.add(m);
  wing.add(figs);
  return { wing, figs, floorY: fy };
}

// The telescope's tube: a long white cylinder with a brass band, a dark lens cap and a finder, along +z from its middle (the mesh turns it).
function mergeTube() {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.2, 0.24, 2.4, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5), WING_COL.white),
    paint(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 10).rotateX(Math.PI / 2).translate(0, 0, 1.4), WING_COL.brass),
    paint(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 10).rotateX(Math.PI / 2).translate(0, 0, 1.73), WING_COL.navy),
    paint(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6).rotateX(Math.PI / 2).translate(0, 0.28, 0.8), WING_COL.steel),
  ]);
}
