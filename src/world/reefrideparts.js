// =============================================================================
// THE REEF RIDES: THE DRAWING (milestone R12). The Sea Scooter (a slim teal-and-orange hull with a handlebar, a lamp and a spinning propeller) and the yellow
// Diving Saucer (a flat yellow disc with a glass bubble over two cushions, a rim of lights and three legs), and the two racks they wait on. Vertex colours
// only, no texture, no canvas, no random number, no clock, NO light (the lamps are unlit vertex colour). Each mount is one Group in its own frame (+z forward,
// +x its right, y 0 at its middle): 'ride:scooter' and 'ride:saucer'; the prop is 'ride:scooter:prop' (the live turns it). The racks are one merged mesh.
// three comes in from the Reef (useKit, as reeflabparts.js): a stage chunk that imported it itself would split three out of start-up.
// =============================================================================

import { RACKS, REST } from './reefrideplan.js';
import { RIDES } from './reefride.js';

let THREE = null;
let mergeGeometries = null;
let _c = null;
export function useKit(kit) {
  THREE = kit.THREE;
  mergeGeometries = kit.mergeGeometries;
  _c = new THREE.Color();
}

export const COL = Object.freeze({
  teal: 0x2fa7a0, tealDark: 0x1f6e72, orange: 0xf08a3c, cream: 0xf4ead0, dark: 0x2c3a40, steel: 0x8da4ad, lamp: 0xfff0b0, yellow: 0xf4c931, yellowDark: 0xd9a51d,
  glass: 0xbfeaf5, cushion: 0x3b5360, rack: 0x8a6c48, rackDark: 0x5e4730, flag: 0xe85d4a,
});

function tone(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.setHex(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const box = (w, h, d, x, y, z, hex) => tone(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const cyl = (rt, rb, h, x, y, z, hex, seg = 8) => tone(new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(x, y, z), hex);

export function rideMaterials() {
  const lit = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, emissive: 0x30302a, emissiveIntensity: 0.6, ...extra });
  return {
    paint: lit(),
    glass: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
  };
}
const flag = (m) => { m.castShadow = false; m.receiveShadow = false; m.userData.noMerge = true; m.userData.noCast = true; m.userData.noContactShadow = true; return m; };
const mesh = (parts, mat, name) => (parts.length ? flag(Object.assign(new THREE.Mesh(mergeGeometries(parts, false), mat), { name })) : null);

// ---- the Sea Scooter -------------------------------------------------------------------------------------------------------------
export function buildScooter(M) {
  const C = COL;
  const g = new THREE.Group();
  g.name = 'ride:scooter';
  const paint = [
    box(0.5, 0.3, 1.5, 0, -0.12, 0, C.teal), // the hull
    cyl(0.0, 0.25, 0.5, 0, -0.12, 0.98, C.teal, 8), // the nose (a cone turned flat below)
    box(0.52, 0.06, 1.2, 0, 0.06, -0.1, C.cream), // the deck's trim
    box(0.46, 0.1, 0.5, 0, 0.25, -0.1, C.cushion), // the seat
    box(0.3, 0.2, 0.1, 0, 0.3, -0.38, C.cushion), // its back
    box(0.06, 0.34, 0.06, 0, 0.12, 0.36, C.dark), // the stem
    box(0.7, 0.06, 0.06, 0, 0.3, 0.36, C.dark), // the handlebar
    box(0.05, 0.3, 0.5, 0, 0.06, -0.78, C.orange), // the tail fin
    box(0.5, 0.05, 0.22, 0, -0.02, -0.82, C.orange), // the tail plane
    box(0.5, 0.08, 0.5, 0, -0.32, 0.1, C.orange), // the keel
  ];
  const glow = [box(0.14, 0.1, 0.06, 0, -0.05, 1.18, C.lamp), box(0.05, 0.05, 0.05, 0.3, 0.3, 0.36, C.lamp), box(0.05, 0.05, 0.05, -0.3, 0.3, 0.36, C.lamp)];
  g.add(mesh([...paint, ...glow], M.paint, 'ride:scooter:body')); // (the lamps are bright vertex colour in the same mesh: fewer draws)
  const prop = new THREE.Group();
  prop.name = 'ride:scooter:prop';
  prop.position.set(0, -0.1, -0.9);
  const blades = [box(0.6, 0.08, 0.03, 0, 0, 0, C.steel), box(0.08, 0.6, 0.03, 0, 0, 0, C.steel), cyl(0.07, 0.07, 0.12, 0, 0, 0, C.dark, 6)];
  blades[2].rotateX(Math.PI / 2);
  prop.add(mesh(blades, M.paint, 'ride:scooter:blades'));
  g.add(prop);
  return g;
}

// ---- the Diving Saucer -----------------------------------------------------------------------------------------------------------
// The hull is an ellipsoid (radii 1.45, 0.34, 1.45) with its middle at y -0.1; a point on it at radius r from the axis is at hullY(r), and the surface tilts by hullTilt(r).
const hullY = (r) => -0.1 + 0.34 * Math.sqrt(Math.max(0, 1 - (r / 1.45) ** 2));
const hullTilt = (r) => Math.atan((0.34 * (r / 2.1025)) / Math.sqrt(Math.max(0.05, 1 - (r / 1.45) ** 2)));
export const LEG_HINGE_Y = -0.3; // the gear's hinge height (a little inside the hull's underside, which is at -0.35 where the legs stand)
export function buildSaucer(M, lowTier = false) {
  const C = COL;
  const g = new THREE.Group();
  g.name = 'ride:saucer';
  const disc = tone(new THREE.SphereGeometry(1, 14, 8).scale(1.45, 0.34, 1.45).translate(0, -0.1, 0), C.yellow);
  const paint = [
    disc,
    tone(new THREE.TorusGeometry(1.38, 0.09, 5, 20).rotateX(Math.PI / 2).translate(0, -0.08, 0), C.yellowDark), // the rim
    tone(new THREE.TorusGeometry(1.47, 0.07, 3, 20).rotateX(Math.PI / 2).translate(0, -0.2, 0), C.dark), // the bumper ring, black rubber round the edge
    cyl(0.7, 0.7, 0.1, 0, -0.42, 0, C.tealDark, 10), // the belly plate
    box(0.5, 0.1, 0.5, -0.5, 0.4, 0, C.cushion), box(0.5, 0.1, 0.5, 0.5, 0.4, 0, C.cushion), // the two cushions (their tops are the seats, 0.45)
    box(0.5, 0.26, 0.08, -0.5, 0.52, -0.3, C.cushion), box(0.5, 0.26, 0.08, 0.5, 0.52, -0.3, C.cushion),
    box(0.06, 0.4, 0.06, 0, 0.1, 0.56, C.dark), box(1.0, 0.05, 0.05, 0, 0.28, 0.56, C.dark), // the little rail across the front
    // the canopy's rim (a steel ring where the glass meets the hull) and two ribs over the glass
    tone(new THREE.TorusGeometry(1.05, 0.055, 3, 16).rotateX(Math.PI / 2).translate(0, 0.03, 0), C.steel),
    tone(new THREE.TorusGeometry(1, 0.025, 2, 8, Math.PI).scale(1.05, 0.9, 1.05).translate(0, 0.03, 0), C.steel),
    tone(new THREE.TorusGeometry(1, 0.025, 2, 8, Math.PI).scale(1.05, 0.9, 1.05).rotateY(Math.PI / 2).translate(0, 0.03, 0), C.steel),
    // panel lines: two thin rings on the disc's top and eight seams between them
    tone(new THREE.RingGeometry(0.87, 0.9, 20).rotateX(-Math.PI / 2).translate(0, hullY(0.88) + 0.008, 0), C.yellowDark),
    tone(new THREE.RingGeometry(1.24, 1.27, 20).rotateX(-Math.PI / 2).translate(0, hullY(1.25) + 0.008, 0), C.yellowDark),
    // the side hatch (port side, low in the disc's edge): a frame, a door, a handle and two hinges, turned to the hull's slope
    ...sideHatch(),
    ...thrusters(),
  ];
  for (let k = 0; k < 6; k++) {
    const rm = 1.07;
    paint.push(tone(new THREE.BoxGeometry(0.03, 0.012, 0.37).rotateX(hullTilt(rm)).translate(0, hullY(rm) + 0.01, rm).rotateY((k / 6) * Math.PI * 2 + 0.2), C.yellowDark));
  }
  const glow = [];
  for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; glow.push(box(0.1, 0.08, 0.1, Math.sin(t) * 1.4, -0.08, Math.cos(t) * 1.4, i % 2 ? C.lamp : C.orange)); } // the ring of lights
  if (!lowTier) for (let i = 0; i < 6; i++) { const t = (i / 6) * Math.PI * 2 + 0.3; glow.push(box(0.08, 0.04, 0.08, Math.sin(t) * 0.95, -0.4, Math.cos(t) * 0.95, C.lamp)); } // and a smaller ring under the belly
  glow.push(cyl(0.18, 0.18, 0.05, 0, -0.5, 0, C.lamp, 8));
  g.add(mesh([...paint, ...glow], M.paint, 'ride:saucer:body'));
  // the landing gear: three struts with their feet, ONE mesh on a group hinged at the hull (the live telescopes it up into the hull when she lifts off, a short smooth motion, and
  // puts it down when she lands: the group's height scale goes from 1 to nearly 0 about the hinge's height, which is inside the hull)
  const legs = new THREE.Group();
  legs.name = 'ride:saucer:legs';
  legs.position.y = LEG_HINGE_Y;
  const gear = [];
  for (let a = 0; a < 3; a++) {
    const t = (a / 3) * Math.PI * 2 + Math.PI / 6;
    gear.push(cyl(0.05, 0.05, 0.58, Math.sin(t) * 1.0, -0.29, Math.cos(t) * 1.0, C.steel, 5), box(0.26, 0.05, 0.26, 0, -0.58, 0, C.dark).translate(Math.sin(t) * 1.0, 0, Math.cos(t) * 1.0), cyl(0.08, 0.08, 0.12, Math.sin(t) * 1.0, -0.02, Math.cos(t) * 1.0, C.dark, 5));
  }
  legs.add(mesh(gear, M.paint, 'ride:saucer:gear'));
  g.add(legs);
  const dome = tone(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.9, 1.05).translate(0, 0.02, 0), C.glass);
  g.add(mesh([dome], M.glass, 'ride:saucer:dome'));
  return g;
}
function sideHatch() {
  const C = COL;
  const r = 1.12;
  const place = (geo) => geo.rotateZ(hullTilt(r)).translate(-r, hullY(r) + 0.01, 0.1);
  return [
    tone(place(new THREE.BoxGeometry(0.4, 0.04, 0.5)), C.yellowDark), // the frame
    tone(place(new THREE.BoxGeometry(0.32, 0.06, 0.4)), C.tealDark), // the door
    tone(place(new THREE.BoxGeometry(0.1, 0.07, 0.04).translate(0.04, 0.03, 0.12)), C.lamp), // the handle
    tone(place(new THREE.BoxGeometry(0.05, 0.07, 0.07).translate(-0.17, 0, -0.14)), C.steel), tone(place(new THREE.BoxGeometry(0.05, 0.07, 0.07).translate(-0.17, 0, 0.14)), C.steel), // the hinges
  ];
}
// two thruster pods hung at the back on the right and the left: a cylinder, a flared nozzle with a warm glow, a bracket to the hull
function thrusters() {
  const C = COL;
  const out = [];
  for (const sx of [-1, 1]) {
    out.push(tone(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 6, 1).rotateX(Math.PI / 2).translate(sx * 0.72, -0.17, -1.0), C.steel));
    out.push(tone(new THREE.CylinderGeometry(0.17, 0.1, 0.18, 6, 1).rotateX(-Math.PI / 2).translate(sx * 0.72, -0.17, -1.33), C.dark));
    out.push(tone(new THREE.CircleGeometry(0.1, 6).rotateY(Math.PI).translate(sx * 0.72, -0.17, -1.425), C.lamp));
    out.push(box(0.1, 0.16, 0.16, sx * 0.72, -0.05, -0.95, C.dark));
  }
  return out;
}

// ---- the racks and the two mounts on them --------------------------------------------------------------------------------------------
// buildRacks(scene, reefY): the racks' platforms and posts (one merged mesh, 'ride:racks') and the two mounts, set on their racks at the seabed's height there.
export function buildRacks(scene, reefY, lowTier = false) {
  const C = COL;
  const M = rideMaterials();
  const parts = [];
  for (const r of Object.values(RACKS)) {
    const y = reefY(r.x, r.z);
    const w = r.id === 'saucer' ? 3.6 : 1.8;
    const d = r.id === 'saucer' ? 3.6 : 3.0;
    const at = (g) => g.rotateY(r.yaw).translate(r.x, y, r.z);
    parts.push(at(box(w, 0.1, d, 0, 0.05, 0, C.rack))); // the platform
    for (const sx of [-1, 1]) parts.push(at(box(0.12, 0.7, 0.12, sx * (w / 2 - 0.1), 0.4, d / 2 - 0.1, C.rackDark))); // two posts at the back
    parts.push(at(box(w - 0.1, 0.1, 0.1, 0, 0.7, d / 2 - 0.1, C.rackDark))); // and the rail across them
    parts.push(at(box(0.5, 0.3, 0.05, 0, 0.9, d / 2 - 0.1, r.id === 'saucer' ? C.yellow : C.orange))); // the sign
  }
  const racks = mesh(parts, M.paint, 'ride:racks');
  racks.castShadow = false;
  scene.add(racks);
  const out = {};
  for (const id of Object.keys(RACKS)) {
    const g = id === 'saucer' ? buildSaucer(M, lowTier) : buildScooter(M);
    g.userData.noMerge = true;
    g.position.set(RACKS[id].x, reefY(RACKS[id].x, RACKS[id].z) + REST[id], RACKS[id].z);
    g.rotation.y = RACKS[id].yaw;
    scene.add(g);
    out[id] = g;
  }
  return out;
}

export const seatHeight = (id) => RIDES[id].seatsAt[0].y;
