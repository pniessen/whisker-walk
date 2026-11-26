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
// The cat's own pieces come through model.js (it re-exports them) so the kit adds no shared chunk to start-up.
import { SKULL, PAW_HALF, TORSO, backAnchor, placeOnBack, seatedAnchor, registerSuitKit } from './model.js';

export const SUIT_PALETTE = Object.freeze({
  space: Object.freeze({
    body: 0xf0f0f2, joint: 0x8b919b, ring: 0xe6e6ea, antenna: 0xb4b9c2, ball: 0xd8403a, glass: 0xf0d58a, visor: 0xfff6d8, dark: 0x4a505a, strap: 0x555b66, box: 0xb9bec7, btnA: 0xd8403a, btnC: 0xf2c14e, screen: 0x2c6a8f, clip: 0xd9a21e, tether: 0xe9e9ee, btnB: 0x4a8fd8, lamp: 0x6fd08a, star: 0xffffff, lamp2: 0x6fd08a, stripeA: 0xd8403a, stripeB: 0xffffff, canton: 0x2f55a4,
    pack: 0xdadade, dial: 0x2f343c, dialFace: 0xf2c14e, boot: 0x9ea4ad, sole: 0x5d636d, patch: 0xd8403a, patchDot: 0xffffff,
  }),
  dive: Object.freeze({
    body: 0xf2c230, joint: 0x2f6fb5, ring: 0xf2c230, antenna: 0x2a2f38, ball: 0x2a2f38, glass: 0xbfe4f2, visor: 0xffffff, rubber: 0x1d3550, lip: 0x4a86a0, bubble: 0xe6f6fc, bubbleLow: 0x9ccfe8, strap: 0x23282f, box: 0x6b7480, dark: 0x23282f, weight: 0x9aa4b0, tank2: 0xd9dee4, brass: 0xe0b040,
    pack: 0xb7c3cf, dial: 0x2a2f38, dialFace: 0xf2c230, boot: 0xf0a82c, sole: 0x1f4f95, patch: 0x2f6fb5, patchDot: 0xf2c230,
    cap: 0x2f6fb5, hose: 0x2a2f38,
  }),
});

// where the tank hose meets the helmet: a port on the back of the bubble (head frame)
const HEAD_PORT = [0, 0.02, 0.272];
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
  // a plain painted part (part()/tube()), non-indexed with colours
  addPart(g) {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.col.push(c.getX(i), c.getY(i), c.getZ(i)); }
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

// --- the live parts (suitTick, called by animateCat every frame) ----------------
// The dive suit's tank hose is laid from the valve to the helmet's port each frame,
// so it never parts from the head in any pose; its bubbles rise in a loop and
// freeze under reduced motion. Both live in the vertex arrays of meshes already
// in the kit: no extra mesh, no allocation.
const HOSE_SEG = 6;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _t = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _X = new THREE.Vector3(1, 0, 0), _m = new THREE.Matrix4(), _n = new THREE.Vector3();
const _nodes = Array.from({ length: HOSE_SEG + 1 }, () => ({ p: new THREE.Vector3(), r: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] }));
function layHose(mesh, toBody) {
  const d = mesh.userData.suitHose, pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal;
  const P0 = d.valve, P3 = _a.set(...HEAD_PORT).applyMatrix4(toBody);
  const dir = _b.set(0, 0, 1).transformDirection(toBody);
  const P1 = _c.copy(P0).add(_n.set(0, 0.11, -0.03)), P2 = _d.copy(P3).addScaledVector(dir, 0.08);
  P2.y += 0.07;
  for (let i = 0; i <= HOSE_SEG; i++) {
    const t = i / HOSE_SEG, q = 1 - t, nd = _nodes[i];
    nd.p.set(0, 0, 0).addScaledVector(P0, q * q * q).addScaledVector(P1, 3 * q * q * t).addScaledVector(P2, 3 * q * t * t).addScaledVector(P3, t * t * t);
  }
  for (let i = 0; i <= HOSE_SEG; i++) {
    const nd = _nodes[i];
    _t.copy(_nodes[Math.min(HOSE_SEG, i + 1)].p).sub(_nodes[Math.max(0, i - 1)].p).normalize();
    _u.crossVectors(_t, _X).normalize(); _w.crossVectors(_t, _u);
    for (let k = 0; k < 3; k++) { const ang = (k * Math.PI * 2) / 3; nd.r[k].copy(_u).multiplyScalar(Math.cos(ang)).addScaledVector(_w, Math.sin(ang)); }
  }
  let v = d.start;
  const put = (nd, k) => {
    _e.copy(nd.p).addScaledVector(nd.r[k], d.r);
    pos.setXYZ(v, _e.x, _e.y, _e.z); nor.setXYZ(v, nd.r[k].x, nd.r[k].y, nd.r[k].z); v++;
  };
  for (let s = 0; s < HOSE_SEG; s++) for (let k = 0; k < 3; k++) {
    const k2 = (k + 1) % 3, A = _nodes[s], B = _nodes[s + 1];
    // two triangles a-b-c, a-c-d wound outward (the ring turns the same way each time)
    put(A, k); put(A, k2); put(B, k2);
    put(A, k); put(B, k2); put(B, k);
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
}
function driftBubbles(mesh, t, reduced) {
  const { items } = mesh.userData.suitBubbles, pos = mesh.geometry.attributes.position;
  for (const b of items) {
    const k = reduced ? b.phase : (t / b.period + b.phase) % 1;
    const s = Math.min(1, k / 0.15) * Math.min(1, (1 - k) / 0.25), dy = k * 0.22, dx = Math.sin((k + b.phase) * 6.283) * 0.01;
    for (let j = 0; j < b.count; j++) {
      const o = j * 3;
      pos.setXYZ(b.from + j, b.cx + (b.base[o] - b.cx) * s + dx, b.cy + (b.base[o + 1] - b.cy) * s + dy, b.cz + (b.base[o + 2] - b.cz) * s);
    }
  }
  pos.needsUpdate = true;
}
function findLive(cat) {
  const live = { hose: null, bubbles: null };
  cat.traverse((o) => { if (o.userData.suitHose) live.hose = o; if (o.userData.suitBubbles) live.bubbles = o; });
  return live;
}
export function suitTick(cat, t, reduced) {
  const live = (cat.userData.suitLive ??= findLive(cat));
  if (live.hose) {
    const { body, head } = cat.userData.parts;
    body.updateMatrix(); head.updateMatrix();
    layHose(live.hose, _m.copy(body.matrix).invert().multiply(head.matrix));
  }
  if (live.bubbles) driftBubbles(live.bubbles, t, reduced);
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
  let bubbleSpecs = null;
  const parts = [part(new THREE.TorusGeometry(rr, 0.018, 3, segs).rotateX(Math.PI / 2).translate(0, rimY, at[2]), P.ring)];
  // a soft glint: a small tapering crescent high on the upper left of the dome
  const arc = [];
  for (let i = 0; i <= 3; i++) {
    const a = 0.5 + i * 0.17, b = 1.0;
    arc.push([-Math.sin(a) * Math.sin(b) * R[0] * 1.004, Math.cos(a) * R[1] * 1.004 + at[1], -Math.sin(a) * Math.cos(b) * R[2] * 1.004 + at[2]]);
  }
  for (let i = 0; i < 3; i++) parts.push(tube(arc[i], arc[i + 1], [0.0055, 0.0075, 0.0045][i], P.visor, 3));
  if (look === 'space') {
    // a shine along the visor's top edge, front right of the crown
    const top = [];
    for (let i = 0; i <= 2; i++) { const a = 0.34 + i * 0.1, b = -0.5; top.push([-Math.sin(a) * Math.sin(b) * R[0] * 1.004, Math.cos(a) * R[1] * 1.004 + at[1], -Math.sin(a) * Math.cos(b) * R[2] * 1.004 + at[2]]); }
    for (let i = 0; i < 2; i++) parts.push(tube(top[i], top[i + 1], 0.0045, P.visor, 3));
  }
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
    // the hose port on the back of the bubble: the tank hose is laid to it every frame (tick), so it never parts from the helmet
    parts.push(part(new THREE.CylinderGeometry(0.022, 0.022, 0.026, 6).rotateX(Math.PI / 2).translate(0, 0.02, 0.258), P.brass));
    // a bubble trail: a few bubbles rising over the helmet (tick drifts them; frozen under reduced motion)
    const spec = [[0.07, 0.024, 0.2, 2.6], [-0.05, 0.017, 0.55, 3.1], [0.12, 0.021, 0.8, 2.9], [0.0, 0.014, 0.38, 2.3]].slice(0, simple ? 3 : 4);
    bubbleSpecs = spec;
  }
  const items = [];
  if (bubbleSpecs) for (const [cx, r, phase, period] of bubbleSpecs) {
    const from = parts.reduce((n, g) => n + g.attributes.position.count, 0), cy = 0.27 + r, cz = 0.03;
    const sp = new THREE.SphereGeometry(r, 5, 3).translate(cx, cy, cz).toNonIndexed();
    const sc = sp.attributes.position, cols = new Float32Array(sc.count * 3), k = new THREE.Color();
    for (let i = 0; i < sc.count; i++) k.set(sc.getY(i) < cy - r * 0.2 ? P.bubbleLow : P.bubble).toArray(cols, i * 3);
    sp.deleteAttribute('uv'); sp.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(sp);
    if (!simple) parts.push(part(new THREE.SphereGeometry(r * 0.28, 4, 2).translate(cx - r * 0.38, cy + r * 0.42, cz - r * 0.78), 0xffffff));
    const count = parts.reduce((n, g) => n + g.attributes.position.count, 0) - from;
    items.push({ from, count, cx, cy, cz, phase, period });
  }
  const trim = vcMesh(merged(parts), 'helmet');
  if (items.length) {
    const pos = trim.geometry.attributes.position;
    for (const b of items) b.base = pos.array.slice(b.from * 3, (b.from + b.count) * 3);
    trim.userData.suitBubbles = { items };
    trim.userData.noCast = true;   // the bubbles and the ring are too small to cast a shadow
    driftBubbles(trim, 0, false);
  }
  head.add(trim, glassMesh(bubble.toNonIndexed(), P.glass, 'helmet'));
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
const CHEST_DIR = [0.56, 0.12, -0.8];   // the upper left chest, below the collar, where the front view sees shell
function body({ coatShell, look, simple, bodyScale }) {
  const P = SUIT_PALETTE[look];
  const shell = coatShell(null, () => P.body, simple ? [10, 8] : [16, 12]);
  const pos = shell.geometry.attributes.position, cy = TORSO.CENTRE_Y;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * PUFF, pos.getY(i) - Math.min(0, pos.getY(i) - cy) * 0 + Math.max(0, pos.getY(i) - cy) * (PUFF - 1), pos.getZ(i) * PUFF);
  shell.geometry.computeVertexNormals();
  shell.userData.suit = 'body';
  const D = new Detail(bodyScale, simple), N = simple ? 12 : 26, SEAM = 12;
  D.ring(-0.62, 0.034, P.joint, N);     // shoulders
  D.ring(0.66, 0.034, P.joint, N);      // hips
  if (look === 'space') {
    // the paw-flag patch: five stripes, a blue canton with three stars; one on the left flank, a smaller one on the shoulder
    const flag = (dir, sc) => {
      const f = D.frame(dir, 0.013), W = 0.056 * sc, H = 0.04 * sc;   // half sizes: along the body, up
      const up = f.ax.clone().negate(), c = (u, z) => f.p.clone().addScaledVector(up, u).addScaledVector(f.az, z);
      const stripe = (u0, u1, hex) => D.quad(c(u0, -W), c(u0, W), c(u1, W), c(u1, -W), hex, f.n);
      for (let i = 0; i < 5; i++) stripe(H - (i * 2 * H) / 5, H - ((i + 1) * 2 * H) / 5, i % 2 ? P.stripeB : P.stripeA);
      const CZ = -W + 0.05 * sc, CH = H - 0.044 * sc;   // the canton
      D.quad(c(H, -W), c(H, CZ), c(CH, CZ), c(CH, -W), P.canton, f.n);
      for (const [dz, du] of [[0.012, 0.008], [0.027, -0.002], [0.036, 0.011]]) {
        const q = [[0, 0.006], [0.006, 0], [0, -0.006], [-0.006, 0]].map(([z, u]) => c(H - 0.022 * sc + (du + u) * sc, -W + (dz + z) * sc));
        D.quad(...q, P.star, f.n);
      }
    };
    flag([0.97, 0.18, -0.36], 1);
    if (!simple) flag([0.8, 0.6, -0.5], 0.8);
    if (!simple) {
      D.seam(0, -0.55, 0.62, 0.007, P.joint, SEAM);                   // the back seam
      D.seam(Math.PI / 2, -0.5, 0.55, 0.006, P.joint, SEAM);          // a seam down each flank
      D.seam(-Math.PI / 2, -0.5, 0.55, 0.006, P.joint, SEAM);
      // the chest control panel: a plate, a small screen and a row of four bright buttons
      const cf = D.frame(CHEST_DIR, 0.015);
      D.geo(new THREE.BoxGeometry(0.13, 0.014, 0.09), cf, 0, 0, 0.005, P.box);
      D.geo(new THREE.BoxGeometry(0.1, 0.006, 0.036), cf, 0, -0.018, 0.012, P.dark);
      D.geo(new THREE.BoxGeometry(0.086, 0.004, 0.026), cf, 0, -0.018, 0.015, P.screen);
      [P.btnA, P.btnC, P.btnB, P.lamp].forEach((hex, i) => D.geo(new THREE.BoxGeometry(0.018, 0.01, 0.016), cf, -0.042 + i * 0.028, 0.026, 0.014, hex));
      // a coiled tether with a clip on the left hip
      const tf = D.frame([0.96, -0.02, 0.5], 0.014);
      D.geo(new THREE.BoxGeometry(0.026, 0.012, 0.03), tf, 0, 0, 0.004, P.clip);
      const coil = [];
      for (let i = 0; i <= 11; i++) {
        const ang = i * 1.3;
        coil.push(tf.p.clone().addScaledVector(tf.ax, 0.014 + i * 0.0085).addScaledVector(tf.n, 0.012 + Math.cos(ang) * 0.012).addScaledVector(tf.az, Math.sin(ang) * 0.012));
      }
      for (let i = 0; i < 11; i++) D.addPart(tube(coil[i].toArray(), coil[i + 1].toArray(), 0.0042, P.tether, 3));
    }
  } else {
    // piping down the back and flanks, and a weight belt: a wide dark band round the hips with a brass buckle on the flank and lead weights hanging below it
    if (!simple) {
      D.seam(0, -0.55, 0.62, 0.008, P.joint, SEAM);
      D.seam(Math.PI / 2, -0.5, 0.55, 0.007, P.joint, SEAM);
      D.seam(-Math.PI / 2, -0.5, 0.55, 0.007, P.joint, SEAM);
    }
    const BZ = 0.34, br = Math.sqrt(1 - BZ * BZ), at = (t) => [br * Math.sin(t), br * Math.cos(t), BZ];
    D.ring(BZ, 0.05, P.rubber, N, { lift: 0.015 });
    if (!simple) {
      const bf = D.frame(at(Math.PI / 2), 0.02);
      D.geo(new THREE.BoxGeometry(0.036, 0.008, 0.046), bf, 0, 0, 0.004, P.brass);
      D.geo(new THREE.BoxGeometry(0.016, 0.01, 0.028), bf, 0, 0, 0.01, P.dark);
      for (const t of [Math.PI / 2 + 0.55, Math.PI / 2 + 0.9, -Math.PI / 2 - 0.55, -Math.PI / 2 - 0.9]) {
        const wf = D.frame(at(t), 0.016);
        D.geo(new THREE.BoxGeometry(0.034, 0.014, 0.026), wf, 0, 0, 0.007, P.weight);
      }
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
  const trim = D.mesh('pack');
  const list = [geo, ...(trim ? [trim.geometry] : [])].map((g) => { const c = (g.index ? g.toNonIndexed() : g).clone(); c.deleteAttribute('uv'); return c; });
  let hoseAt = -1;
  if (look === 'dive') {
    // the tank hose: a three-sided tube re-laid every frame from the valve to the helmet's port (suitTick)
    const n = HOSE_SEG * 18, hp = new THREE.BufferGeometry(), hc = new Float32Array(n * 3), k = new THREE.Color(P.hose);
    for (let i = 0; i < n; i++) k.toArray(hc, i * 3);
    hp.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    hp.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    hp.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    hoseAt = list.reduce((c, g) => c + g.attributes.position.count, 0);
    list.push(hp);
  }
  const m = vcMesh(merged(list), 'pack');
  if (hoseAt >= 0) {
    const a = anchor, up = a.n.clone(), tail = a.fwd.clone().negate();
    const valve = a.at.clone().addScaledVector(up, 0.1).addScaledVector(tail, -0.09).divide(D.bs);
    m.userData.suitHose = { start: hoseAt, valve, r: 0.0105 };
    layHose(m, new THREE.Matrix4().makeTranslation(0, 0.296, -0.376));   // the standing pose, until the first tick
  }
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
      else { c.set(y < -0.45 ? P.sole : P.boot); if (z < -0.8 || Math.abs(p.getX(i) / hb.x) > 0.8) c.set(P.sole); }
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

// The wear her cat is drawn with in a place that has a suit look: the same map src/suithook.js's effectiveWear makes, from this
// kit's own copy of the places' looks, so that the start-up download carries none of it (game/walk.js asks the registered kit,
// and a cat in any other place gets its own wear back). null: no suit here. test/moonplace.test.js keeps the two in step.
const LOOK_OF_PLACE = Object.freeze({ moon: 'space', reef: 'dive' });
function dress(equipped, place, hen) {
  const look = Object.hasOwn(LOOK_OF_PLACE, place) ? LOOK_OF_PLACE[place] : null; // an own key only: 'constructor' is no place
  if (!look) return null;
  const p = (name) => `suit-${name}-${look}`;
  return hen ? { ...equipped, head: p('helmet') } : { ...equipped, neck: null, head: p('helmet'), body: p('body'), back: p('pack'), feet: p('boots') };
}
export const SUIT_KIT = Object.freeze({ helmet, henHelmet, body, pack, boots, tick: suitTick, dress });
export function installSuitKit() { registerSuitKit(SUIT_KIT); }
