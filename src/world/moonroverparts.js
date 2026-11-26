// =============================================================================
// DOT AND HER COURSE: THE DRAWING (milestone 3). Dot the rover (an open buggy on six wheels with a roll bar, two seats, a headlamp and a
// little flag: five meshes, about 1,500 triangles, one caster, nothing transparent), and the course she drives: the Rover Depot (a shed,
// a charging pad), the track's lit posts every 6 m and the Far Beacon at its east end with the Rover cell's plinth. The course joins the
// Moon's kit by material, as milestones 1 and 2 (one merged mesh per bucket); Dot herself is the walk's own (she moves).
// No real lights, no canvas, no random number: every number is moonplan.js's or here.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { dustGeometry, machineTone, treadTone } from './moonbeauty.js';
import { litMaterial } from '../render/materials.js';
import * as P from './moonplan.js';
import { trackPosts } from './moonrover.js';
import { paint, at, box, cyl } from './moonparts.js';
import { BASE_COL } from './moonbase.js';

export const DOT_COL = Object.freeze({ body: 0xf1f3f8, panel: 0xf0c43c, trim: 0x3a9aa8, dark: 0x2a2f3a, steel: 0x7d848f, tyre: 0x30343c, hub: 0x9aa4b4, seat: 0x3b4252, lamp: 0xfff1b8, flag: 0xd8503c });
// Where her two cats sit, in Dot's own frame (+z is forward, +x is her left): the driver on the right, the passenger on the left, y the
// cushion's top. The cat's own origin is her feet: the sit pose is placed from there (moonroverlive.js).
export const DOT_SEATS = Object.freeze([Object.freeze({ x: -0.4, z: -0.02, y: 0.66 }), Object.freeze({ x: 0.4, z: -0.02, y: 0.66 })]);
export const DOT_WHEEL = Object.freeze({ r: 0.36, w: 0.26, x: 0.92, axles: Object.freeze([-0.95, 0, 0.95]) });

const col = (geo, hex) => paint(geo, hex);

// ---- Dot --------------------------------------------------------------------------------------------------------------
export function buildDot() {
  const C = DOT_COL;
  const parts = [];
  const put = (g, hex) => parts.push(col(g, hex));
  // the tub: a low white hull, a yellow side panel each side, a teal stripe, the dark floor, a rounded nose
  put(box(1.5, 0.34, 2.5).translate(0, 0.58, 0), C.body);
  put(box(1.54, 0.12, 2.54).translate(0, 0.38, 0), C.dark);
  for (const s of [-1, 1]) {
    put(box(0.05, 0.22, 1.7).translate(s * 0.76, 0.6, -0.15), C.panel);
    put(box(0.05, 0.06, 2.3).translate(s * 0.765, 0.5, 0), C.trim);
  }
  put(box(1.3, 0.26, 0.8).translate(0, 0.74, 0.95), C.body); // the bonnet
  put(box(1.1, 0.16, 0.3).translate(0, 0.62, 1.34), C.body);
  put(box(1.4, 0.1, 0.12).translate(0, 0.46, 1.36), C.steel); // the bumper
  // the battery box behind the seats (Dot's own power cell sits in it: a teal strip shows)
  put(box(1.2, 0.5, 0.62).translate(0, 0.92, -0.92), C.body);
  put(box(0.7, 0.07, 0.5).translate(0, 1.2, -0.92), C.trim);
  put(box(0.5, 0.1, 0.04).translate(0, 0.96, -1.24), C.trim);
  // two seats: a cushion and a back each
  for (const s of DOT_SEATS) {
    put(box(0.5, 0.1, 0.52).translate(s.x, s.y - 0.07, s.z), C.seat);
    put(box(0.5, 0.42, 0.1).translate(s.x, s.y + 0.18, s.z - 0.3), C.seat);
  }
  // the roll bar: two legs and a top rail over the seats, with a brace
  for (const s of [-1, 1]) put(cyl(0.035, 0.035, 0.98, 6).translate(s * 0.72, 1.12, -0.36), C.steel);
  put(cyl(0.035, 0.035, 1.5, 6).rotateZ(Math.PI / 2).translate(0, 1.61, -0.36), C.steel);
  for (const s of [-1, 1]) put(cyl(0.025, 0.025, 0.7, 5).rotateX(0.9).translate(s * 0.72, 1.15, -0.62), C.steel);
  // the aerial and its little red flag
  put(cyl(0.012, 0.012, 1.3, 4).translate(0.62, 1.62, -1.18), C.steel);
  put(box(0.02, 0.16, 0.26).translate(0.62, 2.18, -1.3), C.flag);
  // wheel arches: a low guard over each of the three axles, each side
  for (const z of DOT_WHEEL.axles) for (const s of [-1, 1]) put(box(0.3, 0.05, 0.62).translate(s * 0.92, 0.82, z), C.body);
  // a front grille and a spare small crate on the back
  put(box(0.6, 0.12, 0.04).translate(0, 0.7, 1.37), C.dark);
  put(box(0.4, 0.2, 0.3).translate(0.3, 0.78, -1.32), C.panel);
  // (beauty round 4) fittings: a belt line and a door seam along each flank, a housing round each headlamp and tail lamp, vent slats on the battery box, a dark rear bumper with
  // a hazard bar, mud flaps behind the rear wheels, a stitched strip on each cushion and a tow eye at the nose.
  for (const s of [-1, 1]) {
    put(box(0.02, 0.014, 2.46).translate(s * 0.765, 0.67, 0), C.steel);
    put(box(0.02, 0.2, 0.014).translate(s * 0.765, 0.58, 0.55), C.steel);
    put(box(0.02, 0.2, 0.014).translate(s * 0.765, 0.58, -0.55), C.steel);
    put(cyl(0.19, 0.19, 0.08, 8).rotateX(Math.PI / 2).translate(s * 0.44, 0.74, 1.34), C.dark);
    put(box(0.14, 0.12, 0.05).translate(s * 0.5, 0.78, -1.25), C.dark);
    put(box(0.04, 0.3, 0.26).translate(s * 0.9, 0.45, -1.28), C.dark);
  }
  for (let i = 0; i < 3; i++) put(box(0.5, 0.025, 0.02).translate(0, 0.84 + i * 0.1, -1.24), C.dark);
  put(box(1.46, 0.1, 0.1).translate(0, 0.5, -1.3), C.dark);
  put(box(0.5, 0.05, 0.12).translate(0.45, 0.5, -1.36), C.panel);
  put(box(0.5, 0.05, 0.12).translate(-0.45, 0.5, -1.36), C.panel);
  for (const s of DOT_SEATS) put(box(0.38, 0.012, 0.4).translate(s.x, s.y - 0.012, s.z), 0x5a6478);
  put(cyl(0.05, 0.05, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0.52, 1.46), C.steel);
  put(box(0.22, 0.012, 0.74).translate(0, 0.875, 0.98), C.trim); // a racing stripe down the bonnet
  put(box(0.08, 0.012, 0.74).translate(0.19, 0.875, 0.98), C.panel);
  put(box(0.08, 0.012, 0.74).translate(-0.19, 0.875, 0.98), C.panel);
  for (const s of [-1, 1]) { // a round badge on each flank: a teal disc with a pale ring
    put(cyl(0.17, 0.17, 0.02, 10).rotateZ(Math.PI / 2).translate(s * 0.785, 0.62, 0.82), C.trim);
    put(cyl(0.1, 0.1, 0.026, 10).rotateZ(Math.PI / 2).translate(s * 0.79, 0.62, 0.82), C.body);
  }
  const hull = mergeGeometries(parts);
  const body = new THREE.Mesh(dustGeometry(machineTone(hull), () => 0, { reach: 1.7, gain: 3.4 }), litMaterial(0xffffff, { vertexColors: true, roughness: 0.55 }));
  body.name = 'dot:body';
  // the headlamp and the tail lamps: one mesh (a basic material the life brightens: a flash on a honk)
  const lampGeo = mergeGeometries([
    col(new THREE.SphereGeometry(0.15, 8, 6).translate(-0.44, 0.74, 1.4), C.lamp),
    col(new THREE.SphereGeometry(0.15, 8, 6).translate(0.44, 0.74, 1.4), C.lamp),
    col(new THREE.SphereGeometry(0.06, 6, 4).translate(-0.5, 0.78, -1.26), 0xff6a5a),
    col(new THREE.SphereGeometry(0.06, 6, 4).translate(0.5, 0.78, -1.26), 0xff6a5a),
  ]);
  const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x9a9a9a }));
  lamp.name = 'dot:lamp';
  // three axles, each with a wheel at either end (a mesh each: it turns about its own middle as she rolls)
  const tyreMat = litMaterial(0xffffff, { vertexColors: true, roughness: 0.95 });
  const axles = DOT_WHEEL.axles.map((z, i) => {
    const w = DOT_WHEEL;
    const g = [col(cyl(0.05, 0.05, w.x * 2, 5).rotateZ(Math.PI / 2), C.steel)];
    for (const s of [-1, 1]) {
      g.push(col(cyl(w.r, w.r, w.w, 12).rotateZ(Math.PI / 2).translate(s * w.x, 0, 0), C.tyre));
      g.push(col(cyl(w.r * 0.5, w.r * 0.5, w.w + 0.04, 6).rotateZ(Math.PI / 2).translate(s * w.x, 0, 0), C.hub));
      g.push(col(box(w.w + 0.05, 0.07, 0.07).translate(s * w.x, w.r * 0.7, 0), C.panel)); // a mark on the rim, so the turning shows
    }
    const m = new THREE.Mesh(dustGeometry(treadTone(mergeGeometries(g)), () => -w.r, { reach: 1.4, gain: 3.2 }), tyreMat);
    m.name = `dot:axle${i}`;
    m.position.set(0, w.r, z);
    return m;
  });
  const group = new THREE.Group();
  group.name = 'dot';
  group.add(body, lamp, ...axles);
  for (const m of [body, lamp, ...axles]) { m.castShadow = false; m.receiveShadow = true; m.userData.noMerge = true; m.userData.noCast = true; m.userData.noContactShadow = true; }
  body.castShadow = true;
  delete body.userData.noCast;
  return { group, body, lamp, axles };
}

// ---- the course (joins the kit) ---------------------------------------------------------------------------------------

const oct = (r) => new THREE.OctahedronGeometry(r, 0);
const flat = (r0, r1, seg = 24) => new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2);

// (milestone 4: the track's lit posts, the depot's lamp and the beacon's studs go into the place's own `glow` bucket (M.glow, the same basic
// vertex-coloured material): one draw less. The track keeps no material of its own.)
export function trackMaterials() {
  return {};
}

export function drawDepot(kit, M, T) {
  const { x, z, w, d, h } = P.SHED;
  // the shed: a white box open on its east side (a dark bay), a steel roof slab, hazard-yellow door posts and a lintel, a lamp on a mast
  kit.put('paint', M.paint, paint(at(box(w, h, d), x, z, h / 2), BASE_COL.rail));
  kit.put('paint', M.paint, paint(at(box(w + 0.5, 0.22, d + 0.5), x, z, h + 0.11), BASE_COL.core));
  kit.put('floor', M.paint, paint(at(box(0.1, h - 0.7, d - 1.2), x + w / 2 + 0.03, z, (h - 0.7) / 2 + 0.05), 0x1a2029), { noCast: true });
  for (const s of [-1, 1]) kit.put('paint', M.paint, paint(at(box(0.3, h - 0.5, 0.3), x + w / 2 + 0.1, z + s * (d / 2 - 0.55), (h - 0.5) / 2), BASE_COL.hazard));
  kit.put('paint', M.paint, paint(at(box(0.3, 0.3, d - 0.5), x + w / 2 + 0.1, z, h - 0.45), BASE_COL.hazard));
  kit.put('paint', M.paint, paint(at(cyl(0.05, 0.07, 3.4, 5), x + w / 2 + 0.9, z + d / 2 - 0.2, 1.7), BASE_COL.core));
  kit.put('glow', M.glow, paint(at(new THREE.SphereGeometry(0.2, 8, 6), x + w / 2 + 0.9, z + d / 2 - 0.2, 3.5), 0xfff0c4), { noCast: true });
  // a tool crate and a spare wheel beside it
  kit.put('paint', M.paint, paint(at(box(0.9, 0.7, 0.7), x + w / 2 + 0.7, z - d / 2 + 0.2, 0.35), BASE_COL.hazard));
  kit.put('paint', M.paint, paint(at(cyl(0.34, 0.34, 0.24, 10).rotateX(Math.PI / 2), x - 0.3, z + d / 2 + 0.2, 0.34), 0x30343c));
  // the charging pad under Dot: a dark disc, a teal ring and four lit studs
  const pk = P.DOT_PARK;
  kit.put('floor', M.paint, paint(at(new THREE.CircleGeometry(2.0, 28).rotateX(-Math.PI / 2), pk.x, pk.z, 0.05), 0x4a515d), { noCast: true });
  kit.put('floor', M.paint, paint(at(flat(1.7, 1.95, 28), pk.x, pk.z, 0.07), BASE_COL.teal), { noCast: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    kit.put('glow', M.glow, paint(at(oct(0.1), pk.x + Math.cos(a) * 1.82, pk.z + Math.sin(a) * 1.82, 0.14), BASE_COL.amber), { noCast: true });
  }
}

export function drawTrackPosts(kit, M, T) {
  for (const p of trackPosts(P.TRACK_POST_EVERY)) {
    kit.put('paint', M.paint, paint(at(cyl(0.035, 0.05, 0.9, 4, true), p.x, p.z, 0.45), BASE_COL.core), { noCast: true });
    kit.put('glow', M.glow, paint(at(oct(0.13), p.x, p.z, 1.0), BASE_COL.amber), { noCast: true });
  }
}

// The Far Beacon: a round pad, a mast of red and white bands with a lamp at its head, the Rover cell's plinth with a teal ring, and a ring
// of eight small lights. The mast's lamp is the 'beacon' mesh (the life blinks it while the cell waits and lets it rest once it is taken).
export function drawFarBeacon(kit, M, B, T) {
  const { x, z, mast } = P.FAR_BEACON;
  kit.put('floor', M.paint, paint(at(new THREE.CircleGeometry(2.6, 28).rotateX(-Math.PI / 2), x, z, 0.05), 0x4a515d), { noCast: true });
  kit.put('floor', M.paint, paint(at(flat(2.3, 2.55, 28), x, z, 0.07), BASE_COL.hazard), { noCast: true });
  // the plinth: a low drum, a dark seat for the cell and a teal ring round it
  kit.put('paint', M.paint, paint(at(cyl(0.5, 0.58, 0.5, 10), x, z, 0.25), BASE_COL.hazard));
  kit.put('paint', M.paint, paint(at(cyl(0.38, 0.38, 0.06, 10), x, z, 0.52), BASE_COL.core), { noCast: true });
  kit.put('glow', M.glow, paint(at(flat(0.3, 0.4, 12), x, z, 0.57), BASE_COL.teal), { noCast: true });
  // the mast: five bands, a cap, a pair of cross arms and the lamp
  const mx = x + 1.1;
  const seg = mast / 5;
  for (let i = 0; i < 5; i++) kit.put('paint', M.paint, paint(at(cyl(0.09, 0.1, seg, 6), mx, z, seg * (i + 0.5)), i % 2 ? 0xf1f3f8 : 0xd8503c));
  kit.put('paint', M.paint, paint(at(box(0.9, 0.06, 0.06), mx, z, mast - 0.4), BASE_COL.core));
  kit.put('paint', M.paint, paint(at(cyl(0.2, 0.1, 0.12, 8), mx, z, mast + 0.06), BASE_COL.core));
  kit.put('beacon', B.beacon, paint(at(new THREE.SphereGeometry(0.26, 10, 8), mx, z, mast + 0.3), BASE_COL.amber), { noCast: true });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    kit.put('glow', M.glow, paint(at(oct(0.1), x + Math.cos(a) * 2.42, z + Math.sin(a) * 2.42, 0.13), i % 2 ? BASE_COL.amber : 0xf1f3f8), { noCast: true });
  }
}

export function drawRoverCourse(kit, M, B) {
  const T = trackMaterials();
  drawDepot(kit, M, T);
  drawTrackPosts(kit, M, T);
  drawFarBeacon(kit, M, B, T);
  return T;
}
