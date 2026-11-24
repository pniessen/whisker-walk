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
import { backAnchor, placeOnBack, seatedAnchor } from './backitems.js';
import { registerSuitKit } from '../suithook.js';

export const SUIT_PALETTE = Object.freeze({
  space: Object.freeze({
    body: 0xf0f0f2, joint: 0x8b919b, ring: 0xe6e6ea, antenna: 0xb4b9c2, ball: 0xd8403a, glass: 0xf0d58a, visor: 0xfff6d8, dark: 0x4a505a, strap: 0x555b66, box: 0xb9bec7, btnA: 0xd8403a, btnB: 0x4a8fd8, lamp: 0x6fd08a, star: 0xffffff, lamp2: 0x6fd08a, stripeA: 0xd8403a, stripeB: 0xffffff, canton: 0x2f55a4,
    pack: 0xdadade, dial: 0x2f343c, dialFace: 0xf2c14e, boot: 0x9ea4ad, sole: 0x5d636d, patch: 0xd8403a, patchDot: 0xffffff,
  }),
  dive: Object.freeze({
    body: 0xf2c230, joint: 0x2f6fb5, ring: 0xf2c230, antenna: 0x2a2f38, ball: 0x2a2f38, glass: 0xbfe4f2, visor: 0xffffff, rubber: 0x1d3550, lip: 0x4a86a0, bubble: 0xdff3fa, strap: 0x23282f, box: 0x6b7480, dark: 0x23282f, weight: 0x5b6470, tank2: 0xd9dee4, brass: 0xe0b040,
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
  geo.deleteAttribute?.('uv');
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false }));
  m.userData.noCast = true;
  m.userData.suit = tag;
  return m;
}

// --- crisp details on the shell ---------------------------------------------
// Bands, seams, the flag patch, the chest box and the belt are real thin geometry
// laid ON the suit's shell (backitems.js backAnchor, cover 'shell'), merged into one
// vertex-coloured mesh. Painting them into the shell's vertices blurs: the grid is coarse.
class Detail {
  constructor(bodyScale, simple) {
    this.bs = new THREE.Vector3(...bodyScale); this.bsa = bodyScale; this.simple = simple;
    this.pos = []; this.col = [];
  }
  // a point on the shell over unit direction `dir`, in the body's own frame, with its normal
  at(dir, lift = 0.012) {
    const a = backAnchor(dir, { bodyScale: this.bsa, cover: 'shell' }, lift);
    return { p: a.at.clone().divide(this.bs), n: a.n.clone().divide(this.bs).normalize() };
  }
  tri(a, b, c, hex, n) {
    const f = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (f.dot(n) < 0) [b, c] = [c, b];
    const k = new THREE.Color(hex);
    for (const v of [a, b, c]) { this.pos.push(v.x, v.y, v.z); this.col.push(k.r, k.g, k.b); }
  }
  quad(a, b, c, d, hex, n) { this.tri(a, b, c, hex, n); this.tri(a, c, d, hex, n); }
  // a ribbon along `dirs`, `w` wide, closed into a ring when `closed`
  ribbon(dirs, w, hex, { lift = 0.012, closed = false } = {}) {
    const P = dirs.map((d) => this.at(d, lift)), n = P.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = P[closed ? (i + n - 1) % n : Math.max(0, i - 1)].p, b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)].p;
      const side = new THREE.Vector3().crossVectors(P[i].n, b.clone().sub(a)).normalize().multiplyScalar(w / 2);
      L.push(P[i].p.clone().sub(side)); R.push(P[i].p.clone().add(side));
    }
    for (let i = 0; i < (closed ? n : n - 1); i++) { const j = (i + 1) % n; this.quad(L[i], R[i], R[j], L[j], hex, P[i].n); }
  }
  ring(uz, w, hex, N, opts) {
    const r = Math.sqrt(1 - uz * uz), dirs = [];
    for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2; dirs.push([r * Math.sin(t), r * Math.cos(t), uz]); }
    this.ribbon(dirs, w, hex, { ...opts, closed: true });
  }
  // a ribbon down the length of the body at angle t round it (0 = the spine, pi/2 = a flank)
  seam(t, z0, z1, w, hex, steps) {
    const dirs = [];
    for (let i = 0; i <= steps; i++) { const z = z0 + ((z1 - z0) * i) / steps, r = Math.sqrt(1 - z * z); dirs.push([r * Math.sin(t), r * Math.cos(t), z]); }
    this.ribbon(dirs, w, hex);
  }
  // a frame on the shell at `dir`: o the origin, n out, az toward the tail, ax across (down on a flank)
  frame(dir, lift = 0.012) {
    const { p, n } = this.at(dir, lift), az = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
    return { p, n, az, ax: new THREE.Vector3().crossVectors(n, az).normalize() };
  }
  // a flat rectangle (x across, z along) in a frame
  rect(f, x0, x1, z0, z1, hex) {
    const c = (x, z) => f.p.clone().addScaledVector(f.ax, x).addScaledVector(f.az, z);
    this.quad(c(x0, z0), c(x1, z0), c(x1, z1), c(x0, z1), hex, f.n);
  }
  // any geometry stood in a frame at (x, z) and `up` out of the shell
  geo(g, f, x, z, up, hex) {
    const m = new THREE.Matrix4().makeBasis(f.ax, f.n, f.az).setPosition(f.p.clone().addScaledVector(f.ax, x).addScaledVector(f.az, z).addScaledVector(f.n, up));
    g = (g.index ? g.toNonIndexed() : g).clone().applyMatrix4(m);
    const p = g.attributes.position, k = new THREE.Color(hex);
    for (let i = 0; i < p.count; i++) { this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.col.push(k.r, k.g, k.b); }
  }
  mesh(tag) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return vcMesh(g, tag);
  }
}

// --- the helmet ------------------------------------------------------------
// The head frame has the skull's centre at its origin (+y up, -z forward). The
// bubble is 1.25x the skull; its lower rim is open at the neck, where two rings sit.
function helmet(head, { look, simple }) {
  const P = SUIT_PALETTE[look], w = simple ? 8 : 12, h = simple ? 4 : 7;
  const R = [SA * 1.25, SB * 1.3, SC * 1.32], at = [0, -0.005, -0.015];
  const bubble = new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI * 0.78).scale(...R).translate(...at);
  bubble.deleteAttribute('uv');
  const rimY = at[1] + R[1] * Math.cos(Math.PI * 0.78), rimR = Math.sin(Math.PI * 0.78);
  const rr = R[0] * rimR * 0.97, segs = simple ? 8 : 12;
  let bubGeo = null;
  const parts = [part(new THREE.TorusGeometry(rr, 0.018, 3, segs).rotateX(Math.PI / 2).translate(0, rimY, at[2]), P.ring)];
  // a soft glint: a small tapering crescent high on the upper left of the dome
  const arc = [];
  for (let i = 0; i <= 3; i++) {
    const a = 0.5 + i * 0.17, b = 1.0;
    arc.push([-Math.sin(a) * Math.sin(b) * R[0] * 1.004, Math.cos(a) * R[1] * 1.004 + at[1], -Math.sin(a) * Math.cos(b) * R[2] * 1.004 + at[2]]);
  }
  for (let i = 0; i < 3; i++) parts.push(tube(arc[i], arc[i + 1], [0.0055, 0.0075, 0.0045][i], P.visor, 3));
  if (look === 'space') {
    const top = at[1] + R[1] * 0.93;
    parts.push(tube([0.05, top - 0.01, 0.02], [0.07, top + 0.12, 0.02], 0.006, P.antenna, 4));
    parts.push(part(new THREE.SphereGeometry(0.024, 6, 4).translate(0.07, top + 0.135, 0.02), P.ball));
  } else {
    // the mask's thin rubber rim round the face, navy with a lighter inner lip
    const rim = new THREE.TorusGeometry(0.118, 0.0085, 3, simple ? 8 : 12).toNonIndexed(), rp = rim.attributes.position, rc = new Float32Array(rp.count * 3), k = new THREE.Color();
    for (let i = 0; i < rp.count; i++) k.set(Math.hypot(rp.getX(i), rp.getY(i)) < 0.118 ? P.lip : P.rubber).toArray(rc, i * 3);
    rim.deleteAttribute('uv'); rim.setAttribute('color', new THREE.BufferAttribute(rc, 3));
    parts.push(rim.scale(1, 0.82, 1).translate(0, 0.0, -R[2] * 0.9 + at[2]));
    // the collar junction: a nipple out of the back of the neck ring, where the tank hose plugs in (JUNCTION below)
    const J = [0, rimY, at[2] + rr];
    parts.push(tube(J, [J[0], J[1] - 0.03, J[2] + 0.025], 0.017, P.hose, 5));
    parts.push(part(new THREE.CylinderGeometry(0.024, 0.024, 0.014, 6).translate(...J), P.brass));
    // a bubble trail: static bubbles over the helmet, part of the glass (no shadow, no motion to reduce)
    const bub = [[0.09, 0.31, -0.02, 0.024], [0.04, 0.38, 0.03, 0.018], [0.12, 0.45, 0.0, 0.022], [0.07, 0.53, 0.04, 0.015]].slice(0, simple ? 3 : 4);
    bubGeo = mergeGeometries([bubble.toNonIndexed(), ...bub.map(([x, y, z, r]) => { const g = new THREE.SphereGeometry(r, 5, 3).translate(x, y, z).toNonIndexed(); g.deleteAttribute('uv'); return g; })]);
  }
  head.add(vcMesh(merged(parts), 'helmet'), glassMesh(bubGeo ?? bubble.toNonIndexed(), P.glass, 'helmet'));
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
// The coat shell (model.js coatShell), painted plain (a pale body, or yellow),
// plus a Detail mesh of crisp bands, seams, the flag patch and chest box (space)
// or the piping and weight belt (dive).
const PUFF = 1.02;
const CHEST_DIR = [0.52, 0.02, -0.85];   // the upper left chest, below the collar, where the front view sees shell
const NAPE_DIR = [0, 0.66, -0.75];   // the suit's collar socket at the nape, just behind the helmet's neck ring (the ring's own rear is inside the shell)
function body({ coatShell, look, simple, bodyScale }) {
  const P = SUIT_PALETTE[look];
  const shell = coatShell(null, () => P.body, simple ? [10, 8] : [16, 12]);
  const pos = shell.geometry.attributes.position, cy = TORSO.CENTRE_Y;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * PUFF, pos.getY(i) - Math.min(0, pos.getY(i) - cy) * 0 + Math.max(0, pos.getY(i) - cy) * (PUFF - 1), pos.getZ(i) * PUFF);
  shell.geometry.computeVertexNormals();
  shell.userData.suit = 'body';
  const D = new Detail(bodyScale, simple), N = simple ? 12 : 22;
  D.ring(-0.62, 0.034, P.joint, N);     // shoulders
  D.ring(0.66, 0.034, P.joint, N);      // hips
  if (look === 'space') {
    // the paw-flag patch on the left flank: five stripes, a blue canton with three stars
    const f = D.frame([0.97, 0.18, -0.36], 0.013), W = 0.056, H = 0.04;   // half sizes: along the body, up
    const up = f.ax.clone().negate(), c = (u, z) => f.p.clone().addScaledVector(up, u).addScaledVector(f.az, z);
    const stripe = (u0, u1, hex) => D.quad(c(u0, -W), c(u0, W), c(u1, W), c(u1, -W), hex, f.n);
    for (let i = 0; i < 5; i++) stripe(H - (i * 2 * H) / 5, H - ((i + 1) * 2 * H) / 5, i % 2 ? P.stripeB : P.stripeA);
    const CZ = -W + 0.05, CH = H - 0.044;   // the canton: the front 5 cm of the top three stripes' height
    D.quad(c(H, -W), c(H, CZ), c(CH, CZ), c(CH, -W), P.canton, f.n);
    for (const [dz, du] of [[0.012, 0.008], [0.027, -0.002], [0.036, 0.011], [0.044, -0.0005]].slice(0, 3)) {
      const q = [[0, 0.006], [0.006, 0], [0, -0.006], [-0.006, 0]].map(([z, u]) => c(H - 0.022 + du + u, -W + dz + z));
      D.quad(...q, P.star, f.n);
    }
    if (!simple) {
      D.seam(0, -0.55, 0.62, 0.007, P.joint, 10);                   // the back seam
      D.seam(Math.PI / 2, -0.5, 0.55, 0.006, P.joint, 10);          // a seam down each flank
      D.seam(-Math.PI / 2, -0.5, 0.55, 0.006, P.joint, 10);
      // the chest control box: a plate, two buttons and a small light
      const cf = D.frame(CHEST_DIR, 0.014);
      D.geo(new THREE.BoxGeometry(0.09, 0.014, 0.06), cf, 0, 0, 0.005, P.box);
      D.geo(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 6), cf, -0.024, 0.014, 0.014, P.btnA);
      D.geo(new THREE.CylinderGeometry(0.0105, 0.0105, 0.012, 6), cf, 0.0, 0.014, 0.014, P.btnB);
      D.geo(new THREE.SphereGeometry(0.0095, 4, 3), cf, 0.026, 0.014, 0.014, P.lamp);
    }
  } else {
    // contrast piping down the back and flanks, a weight belt with three weights and a buckle
    if (!simple) {
      D.seam(0, -0.55, 0.62, 0.008, P.joint, 10);
      D.seam(Math.PI / 2, -0.5, 0.55, 0.007, P.joint, 10);
      D.seam(-Math.PI / 2, -0.5, 0.55, 0.007, P.joint, 10);
    }
    D.ring(0.18, 0.04, P.weight, N, { lift: 0.015 });
    if (!simple) {
      for (const t of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
        const r = Math.sqrt(1 - 0.18 * 0.18), f = D.frame([r * Math.sin(t), r * Math.cos(t), 0.18], 0.015);
        D.geo(new THREE.BoxGeometry(0.03, 0.02, 0.026), f, 0, 0, 0.01, P.weight);
      }
      const bf = D.frame([0, -Math.sqrt(1 - 0.18 * 0.18), 0.18], 0.015);
      D.geo(new THREE.BoxGeometry(0.026, 0.01, 0.026), bf, 0, 0, 0.005, P.brass);
    }
  }
  const detail = D.mesh('body');
  if (detail) shell.parent.add(detail);   // beside the shell, on the body
}

// --- the pack --------------------------------------------------------------
const PACK_DIR = [0, 0.94, 0.18];
function pack({ bodyScale, cover, simple, look }) {
  const P = SUIT_PALETTE[look], seg = simple ? 5 : 6;
  const parts = [];
  if (look === 'space') {
    // a boxy life-support pack: a rounded lid, two dials, a vent and a base plate
    parts.push(part(new THREE.BoxGeometry(0.2, 0.09, 0.16).translate(0, 0.045, 0), P.pack));
    parts.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.17, 8, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(1.04, 0.22, 1).translate(0, 0.09, 0), P.box));   // a rounded lid
    parts.push(part(new THREE.BoxGeometry(0.13, 0.006, 0.024).translate(0, 0.1125, 0.015), P.strap));   // a cross-strap over it
    parts.push(part(new THREE.SphereGeometry(0.0095, 4, 3).translate(0, 0.116, -0.045), P.lamp2));    // a small light
    for (const x of [-0.05, 0.05]) {
      parts.push(part(new THREE.CylinderGeometry(0.018, 0.018, 0.012, seg).translate(x, 0.1, 0.07), P.dial));
      parts.push(part(new THREE.CylinderGeometry(0.011, 0.011, 0.004, seg).translate(x, 0.107, 0.07), P.dialFace));
    }
    parts.push(part(new THREE.BoxGeometry(0.2, 0.014, 0.05).translate(0, 0.006, 0.08), P.joint));
  } else {
    // twin air tanks side by side: each with a base cap, a band and a domed neck, a valve block between
    for (const x of [-0.04, 0.04]) {
      parts.push(part(new THREE.CylinderGeometry(0.038, 0.038, 0.2, seg).rotateX(Math.PI / 2).translate(x, 0.05, 0.02), P.pack));
      if (!simple) parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.016, seg).rotateX(Math.PI / 2).translate(x, 0.05, 0.12), P.cap));            // base cap
      if (!simple) parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.014, seg).rotateX(Math.PI / 2).translate(x, 0.05, 0.02), P.joint));         // band
      parts.push(part(new THREE.SphereGeometry(0.038, seg, 2, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(x, 0.05, -0.08), P.tank2));
    }
    parts.push(part(new THREE.BoxGeometry(0.05, 0.03, 0.03).translate(0, 0.074, -0.09), P.brass));    // the valve block
    parts.push(part(new THREE.CylinderGeometry(0.014, 0.014, 0.02, seg).translate(0, 0.098, -0.09), P.cap));   // the regulator knob
    parts.push(part(new THREE.BoxGeometry(0.1, 0.012, 0.03).translate(0, 0.004, 0.02), P.strap));      // the cradle under the tanks
  }
  const geo = merged(parts);
  const anchor = seatedAnchor(geo, PACK_DIR, cover, bodyScale, -0.006);
  placeOnBack(geo, anchor, bodyScale);
  // harness: two straps over the shoulders to the chest, and (dive) a hose rising over the shoulder to the nape
  const D = new Detail(bodyScale, simple);
  const steps = simple ? 4 : 7;
  for (const sx of [-1, 1]) {
    const dirs = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, phi = (0.12 + 0.95 * t) * Math.PI * 0.85;
      dirs.push([sx * (0.3 + 0.55 * Math.sin(phi)), Math.cos(phi), 0.0 - 0.38 * t]);
    }
    D.ribbon(dirs, 0.02, P.strap, { lift: cover === 'shell' ? 0.014 : 0.006 });
  }
  const out = [geo];
  if (look === 'dive' && !simple) {
    // from the valve block, up and over the left shoulder, to a stub at the nape
    const a = anchor, up = a.n.clone(), tail = a.fwd.clone().negate();
    const loc = (y, z, x = 0) => a.at.clone().addScaledVector(up, y).addScaledVector(tail, z).addScaledVector(new THREE.Vector3().crossVectors(up, tail), x).divide(D.bs);
    const J = D.at(NAPE_DIR, 0.012).p;
    const pts = [loc(0.1, -0.09), loc(0.16, -0.12, 0.03), J.clone().add(new THREE.Vector3(0.025, 0.08, 0.12)), J.clone().add(new THREE.Vector3(0.008, 0.03, 0.04)), J];
    const hose = merged(pts.slice(0, -1).map((q, i) => tube(q.toArray(), pts[i + 1].toArray(), 0.0105, P.hose, 4)));
    out.push(hose, part(new THREE.SphereGeometry(0.022, 5, 3).translate(...J.toArray()), P.brass));
  }
  const trim = D.mesh('pack');
  const m = vcMesh(merged([...out.map((g) => (g.index ? g.toNonIndexed() : g)), ...(trim ? [trim.geometry] : [])].map((g) => { const c = g.clone(); c.deleteAttribute('uv'); return c; })), 'pack');
  m.userData.backItem = `suit-pack-${look}`;
  return [m];
}

// --- the boots -------------------------------------------------------------
// Each paw is made chunky and painted (a darker sole, a cuff band): no new mesh. The
// fins are the paw spread wide and cupped (edges and tip curled up), then lowered so
// the sole stays on the ground. The dive suit's depth gauge is one band on one front leg.
function boots(legs, { plainPaw, PAW_Y, look, simple }) {
  const P = SUIT_PALETTE[look];
  for (const leg of legs) {
    const paw = plainPaw(leg);
    const [sx, sy, sz] = look === 'space' ? [1.2, 1.55, 1.18] : [2.3, 0.55, 2.4];
    paw.geometry.computeBoundingBox();
    const hb = paw.geometry.boundingBox.max, p = paw.geometry.attributes.position;
    if (look === 'dive') for (let i = 0; i < p.count; i++) {
      const nx = p.getX(i) / hb.x, nz = p.getZ(i) / hb.z;
      p.setY(i, p.getY(i) + hb.y * (0.9 * nx * nx + 1.5 * Math.max(0, -nz) ** 2));
    }
    paw.geometry.computeVertexNormals();
    paw.scale.set(sx, sy, sz);
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / hb.y, z = p.getZ(i) / hb.z;
      if (look === 'space') c.set(y < -0.45 ? P.sole : P.boot);
      else c.set(y < -0.45 ? P.sole : P.boot), z < -0.8 && c.set(P.sole);
      c.toArray(col, i * 3);
    }
    paw.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (look === 'space') {
      // a real flared cuff ring round the ankle, merged into the paw's own mesh (no new mesh)
      const base = paw.geometry.toNonIndexed();
      base.deleteAttribute('uv');
      const ring = new THREE.CylinderGeometry(1, 0.86, 0.036, 8, 1, true).scale(0.058 / sx, 1 / sy, 0.058 / sz).translate(0, hb.y * 0.92, 0.012 / sz);
      paw.geometry = mergeGeometries([base, part(ring, P.joint)]);
    }
    paw.material = litMaterial(0xffffff, { vertexColors: true, roughness: 0.55 });
    paw.userData.suit = 'boots';
    if (look === 'dive') {
      paw.position.y -= PAW_HALF * (1 - sy);
      paw.position.z -= hb.z * (sz - 1) * 0.55;
    }
  }
  if (look === 'dive' && !simple) {
    const leg = legs[0], y = PAW_Y + 0.07;
    const g = merged([
      part(new THREE.CylinderGeometry(0.049, 0.049, 0.022, 6, 1, true).translate(0, y, 0), P.joint),
      part(new THREE.CylinderGeometry(0.019, 0.019, 0.012, 6).rotateX(Math.PI / 2).translate(0, y, -0.052), P.dark),
      part(new THREE.CylinderGeometry(0.0135, 0.0135, 0.004, 6).rotateX(Math.PI / 2).translate(0, y, -0.0585), P.brass),
    ]);
    const m = vcMesh(g, 'gauge');
    m.material.side = THREE.DoubleSide;
    leg.add(m);
  }
}

export const SUIT_KIT = Object.freeze({ helmet, henHelmet, body, pack, boots });
export function installSuitKit() { registerSuitKit(SUIT_KIT); }
