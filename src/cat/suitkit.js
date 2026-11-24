// The suit kit (suit kit M1 spike): four wearable pieces drawn in two colourways,
// the Moon's white space suit ('space') and the Reef's yellow and blue diving
// suit ('dive'). LAZY: only a suit place's chunk (or a picture sheet) imports
// this file, then calls installSuitKit(); start-up carries only the hook slot
// in src/suithook.js. The kit is not an accessory: it has no catalog row and is
// never saved; src/suithook.js effectiveWear says when a cat is drawn in it.
//
// One geometry per piece, recoloured by look: each vertex is painted from its
// part (body, trim, joint, ring, dial, tank, cap, hose, patch), so there is no
// texture and no extra mesh. Pieces: the helmet (a clear bubble, no shadow, and
// one opaque mesh for the neck ring and the antenna or the hose stub), the
// body (a coat shell painted white with grey joints and a paw-flag patch, or
// yellow with blue trim), the pack (a boxy life-support pack with dials, or an
// air tank with a blue cap and a hose) and the boots (the paws made chunky and
// grey, or flat yellow fins). Boots and fins reshape the cat's own paws, so
// they add no mesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { SKULL, PAW_HALF, TORSO } from './torso.js';
import { placeOnBack, seatedAnchor } from './backitems.js';
import { registerSuitKit } from '../suithook.js';

export const SUIT_PALETTE = Object.freeze({
  space: Object.freeze({
    body: 0xf0f0f2, joint: 0x8b919b, ring: 0xe6e6ea, antenna: 0xb4b9c2, ball: 0xd8403a, glass: 0xcfe6ff,
    pack: 0xdadade, dial: 0x2f343c, dialFace: 0xf2c14e, boot: 0x9ea4ad, sole: 0x5d636d, patch: 0xd8403a, patchDot: 0xffffff,
  }),
  dive: Object.freeze({
    body: 0xf2c230, joint: 0x2f6fb5, ring: 0xf2c230, antenna: 0x2a2f38, ball: 0x2a2f38, glass: 0xbfe4f2,
    pack: 0xb7c3cf, dial: 0x2a2f38, dialFace: 0xf2c230, boot: 0xf2c230, sole: 0x2f6fb5, patch: 0x2f6fb5, patchDot: 0xf2c230,
    cap: 0x2f6fb5, hose: 0x2a2f38,
  }),
});

const SA = SKULL.R * SKULL.SCALE[0], SB = SKULL.R * SKULL.SCALE[1], SC = SKULL.R * SKULL.SCALE[2];

// One part: geometry painted in one colour, plain (no uv, no index) so parts merge.
function part(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merged(parts) {
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}
const vcMesh = (geo, tag) => {
  const m = new THREE.Mesh(geo, litMaterial(0xffffff, { vertexColors: true, roughness: 0.6 }));
  m.userData.suit = tag;
  return m;
};
// A tube from a to b.
function tube(a, b, r, hex, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  g.translate(...A.add(B).multiplyScalar(0.5).toArray());
  return part(g, hex);
}

// The glass: one transparent mesh, no shadow, depth not written.
function glassMesh(geo, hex, tag) {
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }));
  m.userData.noCast = true;
  m.userData.suit = tag;
  return m;
}

// --- the helmet ------------------------------------------------------------
// The head frame has the skull's centre at its origin (+y up, -z forward). The
// bubble is 1.25x the skull; its lower rim is open at the neck, where a ring sits.
function helmet(head, { look, simple }) {
  const P = SUIT_PALETTE[look], w = simple ? 8 : 12, h = simple ? 4 : 7;
  const R = [SA * 1.25, SB * 1.3, SC * 1.32], at = [0, -0.005, -0.015];
  const bubble = new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI * 0.78).scale(...R).translate(...at);
  const rimY = at[1] + R[1] * Math.cos(Math.PI * 0.78), rimR = Math.sin(Math.PI * 0.78);
  const ring = new THREE.TorusGeometry(R[0] * rimR * 0.97, 0.016, 4, simple ? 8 : 12).rotateX(Math.PI / 2).translate(0, rimY, at[2]);
  const parts = [part(ring, P.ring)];
  if (look === 'space') {
    const top = at[1] + R[1] * 0.93;
    parts.push(tube([0.05, top - 0.01, 0.02], [0.07, top + 0.12, 0.02], 0.006, P.antenna, 4));
    parts.push(part(new THREE.SphereGeometry(0.02, 6, 4).translate(0.07, top + 0.13, 0.02), P.ball));
  } else {
    // a hose stub out of the back of the bubble, bent down toward the tank
    parts.push(tube([0, 0.02, R[2] * 0.92 + at[2]], [0, 0.0, R[2] + 0.07], 0.018, P.hose, 6));
    parts.push(part(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 6).rotateX(Math.PI / 2).translate(0, 0.02, R[2] * 0.92 + at[2]), P.ring));
  }
  const trim = vcMesh(merged(parts), 'helmet');
  head.add(trim, glassMesh(bubble, P.glass, 'helmet'));
}

// Hagrid's: the same bubble, a hen-sized one (his skull is about 0.13).
function henHelmet(head, { look }) {
  const P = SUIT_PALETTE[look], R = [0.21, 0.2, 0.25], at = [0, 0.015, -0.03];
  const bubble = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.78).scale(...R).translate(...at);
  const rimY = at[1] + R[1] * Math.cos(Math.PI * 0.78);
  const ring = new THREE.TorusGeometry(R[0] * Math.sin(Math.PI * 0.78) * 0.97, 0.014, 4, 12).rotateX(Math.PI / 2).translate(0, rimY, at[2]);
  head.add(vcMesh(merged([part(ring, P.ring)]), 'helmet'), glassMesh(bubble, P.glass, 'helmet'));
}

// --- the body --------------------------------------------------------------
// The coat shell (model.js coatShell) painted by the shell vertex's unit
// direction (x side, y up, z toward the tail, front -z): bands at the shoulders
// and hips, and a small flag on the left shoulder.
function suitPaint(look) {
  const P = SUIT_PALETTE[look];
  return (ux, uy, uz) => {
    if (Math.abs(uz + 0.66) < 0.07 || Math.abs(uz - 0.62) < 0.07) return P.joint;
    const dx = ux - 0.9, dy = uy - 0.12, dz = uz + 0.3, d = Math.hypot(dx * 0.6, dy, dz);
    if (look === 'space' && d < 0.27) return d < 0.1 ? P.patchDot : P.patch;
    return P.body;
  };
}
const PUFF = 1.02;
function body({ coatShell, look, simple }) {
  // a light tube: a coarser grid than the coats (the fur tufts under it are hidden, as a coat hides them)
  const shell = coatShell(null, suitPaint(look), simple ? [10, 8] : [18, 14]);
  // a little fuller than a coat, so a coarse grid never lets the belly fur through
  const pos = shell.geometry.attributes.position, cy = TORSO.CENTRE_Y;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * PUFF, pos.getY(i) - Math.min(0, pos.getY(i) - cy) * 0 + Math.max(0, pos.getY(i) - cy) * (PUFF - 1), pos.getZ(i) * PUFF);
  shell.geometry.computeVertexNormals();
  shell.userData.suit = 'body';
}

// --- the pack --------------------------------------------------------------
const PACK_DIR = [0, 0.94, 0.18];
function pack({ bodyScale, cover, simple, look }) {
  const P = SUIT_PALETTE[look], seg = simple ? 5 : 8;
  const parts = [];
  if (look === 'space') {
    // a boxy life-support pack, two dials on its back face
    parts.push(part(new THREE.BoxGeometry(0.2, 0.1, 0.16).translate(0, 0.05, 0), P.pack));
    for (const x of [-0.045, 0.045]) {
      parts.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.012, seg).translate(x, 0.106, 0.03), P.dial));
      parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.004, seg).translate(x, 0.113, 0.03), P.dialFace));
    }
    parts.push(part(new THREE.BoxGeometry(0.2, 0.014, 0.04).translate(0, 0.012, 0.09), P.joint));
  } else {
    // an air tank lying along the back, a blue cap, a hose arcing up toward the neck
    const tank = new THREE.CylinderGeometry(0.052, 0.052, 0.2, seg).rotateX(Math.PI / 2).translate(0, 0.058, 0.02);
    parts.push(part(tank, P.pack));
    parts.push(part(new THREE.SphereGeometry(0.052, seg, simple ? 3 : 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0.058, -0.08), P.cap));
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.03, seg).translate(0, 0.118, -0.05), P.cap));
    const arc = [[0, 0.125, -0.05], [0, 0.17, -0.09], [0, 0.185, -0.15], [0, 0.17, -0.2]];
    for (let i = 0; i < 3; i++) parts.push(tube(arc[i], arc[i + 1], 0.011, P.hose, 5));
    parts.push(part(new THREE.BoxGeometry(0.11, 0.012, 0.03).translate(0, 0.006, 0.02), P.joint));
  }
  const geo = merged(parts);
  const anchor = seatedAnchor(geo, PACK_DIR, cover, bodyScale, -0.008);
  placeOnBack(geo, anchor, bodyScale);
  geo.computeVertexNormals();
  const m = vcMesh(geo, 'pack');
  m.userData.backItem = `suit-pack-${look}`;
  return [m];
}

// --- the boots -------------------------------------------------------------
// Each paw is made chunky and painted (a darker sole): no new mesh. The fins are
// the paw flattened and fanned forward, then lowered so the sole stays on the ground.
function boots(legs, { plainPaw, mat, PAW_Y, look }) {
  const P = SUIT_PALETTE[look];
  for (const leg of legs) {
    const paw = plainPaw(leg);
    const [sx, sy, sz] = look === 'space' ? [1.2, 1.55, 1.18] : [1.9, 0.5, 2.2];
    paw.scale.set(sx, sy, sz);
    paw.geometry.computeBoundingBox();
    const hb = paw.geometry.boundingBox.max, p = paw.geometry.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / hb.y, z = p.getZ(i) / hb.z;
      c.set(y < -0.45 ? P.sole : P.boot);
      if (look === 'dive' && z < -0.8) c.set(P.sole);   // the fin's blue tip
      c.toArray(col, i * 3);
    }
    paw.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    paw.material = litMaterial(0xffffff, { vertexColors: true, roughness: 0.55 });
    paw.userData.suit = 'boots';
    if (look === 'dive') {
      paw.position.y -= PAW_HALF * (1 - sy);
      paw.position.z -= hb.z * (sz - 1) * 0.55;   // the fin fans forward
    }
  }
}

export const SUIT_KIT = Object.freeze({ helmet, henHelmet, body, pack, boots });
export function installSuitKit() { registerSuitKit(SUIT_KIT); }
