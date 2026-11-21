import * as THREE from 'three';
import {
  hash01, box, cyl, ball, sheet, stripes, stripedSlab, bunting, bulb, bulbString, meshOf, canvasOf, glowMesh, recentre,
  BULB_COLORS, BUNTING_COLORS,
} from './fairkit.js';

// =============================================================================
// THE FAIRGROUND'S MODELS, everything but the five rides (world/fairrides.js):
// the gate, the stalls, the three games, the tents, the bandstand, the picnic
// tables, the bunting and the strings of bulbs.
//
// Farmparts.js's three rules hold here too: LOCAL UUIDS (fair.js calls all of
// this inside withLocalUuids; variation is hash01, never Math.random), FEW
// DRAWS, NO RECORDS (fair.js owns every collider, perch and point).
//
// FEW DRAWS, the fair's way. The small things all over the fairground are not
// meshes of their own. Each builder pushes its pieces onto the lists of a
// `kit` (lists(), below), and fair.js turns each list into ONE mesh:
//
//   solid     wood, paint, metal: casts a shadow
//   canvas    awnings and tents, drawn on both faces: casts a shadow
//   flags     bunting, its wires, washing on a line: no shadow
//   bulbs     every light bulb, on the one glow material: no shadow
//   balloons  shiny, round: no shadow
//   fence     the front fence's pickets: no shadow
//
// Only what must be its own object is one: the gate, the fortune teller's tent
// and the bandstand's roof (each fades when it hides the cat), and the pieces
// step 3's games will move (the tins, the ducks, the bell's marker).
// =============================================================================

export const FAIR_PAINT = Object.freeze({
  red: 0xe2433a, cream: 0xfbf1dc, gold: 0xf2c230, sky: 0x4fb2e6, blue: 0x2f6fc0, green: 0x55b85a,
  pink: 0xf59ac0, orange: 0xf58a2e, purple: 0x8a55c8, mint: 0x8fe0c0, white: 0xf7f4ec, wood: 0xd0a060,
  woodDark: 0x8f6a44, steel: 0xcfd6da, dark: 0x3a3440, yellow: 0xf9d648, night: 0x4a3f9a,
});
const C = FAIR_PAINT;

// A rounded lump from an octahedron cut once (detail 1: 32 triangles, smooth
// normals) or not at all (detail 0: 8), where the kit's `ball` is an
// icosahedron (80 at detail 1). Same options as the kit's pieces: yaw, pitch,
// roll, sx/sy/sz, shade. Painted and non-indexed, ready for a kit list.
function blob(P, r, x, y, z, hex, o = {}) {
  let g = new THREE.OctahedronGeometry(r, o.detail ?? 1);
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(o.pitch ?? 0, o.yaw ?? 0, o.roll ?? 0, 'YXZ')),
    new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1)));
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  const k = o.shade ?? 1;
  for (let i = 0; i < n; i++) { col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  P.push(g);
  return g;
}

// A flat painted polygon facing `face` (an outward direction): the points are
// wound the right way round whichever order they were given in. For the
// stalls' paint, which only needs showing from outside (one face, no depth).
function plate(P, pts, hex, face, shade = 1) {
  const a = pts[0];
  const u = [pts[1][0] - a[0], pts[1][1] - a[1], pts[1][2] - a[2]];
  const v = [pts[2][0] - a[0], pts[2][1] - a[1], pts[2][2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const flip = n[0] * face[0] + n[1] * face[1] + n[2] * face[2] < 0;
  return sheet(P, flip ? pts.slice().reverse() : pts, hex, { shade });
}
// A rectangle (x0..x1, y0..y1) in the plane z = zz facing +z or -z; and the
// same in the plane x = xx facing +x or -x, with z0..z1 along the stall.
const rectZ = (P, x0, x1, y0, y1, zz, dir, hex, shade) => plate(P, [[x0, y0, zz], [x1, y0, zz], [x1, y1, zz], [x0, y1, zz]], hex, [0, 0, dir], shade);
const rectX = (P, z0, z1, y0, y1, xx, dir, hex, shade) => plate(P, [[xx, y0, z0], [xx, y0, z1], [xx, y1, z1], [xx, y1, z0]], hex, [dir, 0, 0], shade);

const LISTS = ['solid', 'canvas', 'flags', 'bulbs', 'balloons', 'fence'];
export function lists() {
  return { solid: [], canvas: [], flags: [], bulbs: [], balloons: [], fence: [] };
}
// Runs fn on a fresh kit in its own frame, then sets everything it made down
// at (x, z) turned `yaw` (a model's front, +z, turns to face east at PI/2).
export function into(K, x, z, yaw, fn) {
  const sub = lists();
  fn(sub);
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  for (const name of LISTS) for (const g of sub[name]) { g.applyMatrix4(m); K[name].push(g); }
}

// ---- balloons ---------------------------------------------------------------------------
const BALLOON_COLORS = Object.freeze([0xe8423a, 0xf6c92e, 0x3aa0e0, 0x4cba62, 0xf58a2e, 0xb061d6, 0xf59ac0]);
// A bunch of `n` balloons tied at (x, y, z).
export function balloonBunch(K, x, y, z, n = 5, salt = 0) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash01(i, salt, 3) * 0.8;
    const lean = 0.25 + 0.3 * hash01(i, salt, 5);
    const up = 1.0 + 0.5 * hash01(salt, i, 7) + (i === 0 ? 0.35 : 0);
    const bx = x + Math.cos(a) * lean;
    const bz = z + Math.sin(a) * lean;
    blob(K.balloons, 0.22, bx, y + up, bz, BALLOON_COLORS[(i + salt) % BALLOON_COLORS.length], { detail: 1, sy: 1.25 });
    sheet(K.flags, [[x - 0.008, y, z], [x + 0.008, y, z], [bx + 0.008, y + up - 0.26, bz], [bx - 0.008, y + up - 0.26, bz]], 0xe8e2d6);
  }
}

// ---- the gate --------------------------------------------------------------------------------
// Two striped posts either side of the midway, an arch over it and the fair's
// name. The Group fades for a camera passing under it, as the Farm's gate does.
export const GATE = Object.freeze({ postH: 4.0, archY: 5.1, signY: 3.55 });
export function gateArch(x, z, halfSpan, glow, title = 'The Fairground') {
  const g = new THREE.Group();
  g.name = 'fairGate';
  const P = [];
  for (const s of [-1, 1]) {
    stripes(P, 0.3, 0, 0.26, GATE.postH, [C.red, C.cream], s * halfSpan, 0, 0, { sides: 10 });
    cyl(P, 0.42, 0.46, 0.3, s * halfSpan, 0, 0, C.blue, { sides: 10 });
    cyl(P, 0.36, 0.3, 0.16, s * halfSpan, GATE.postH, 0, C.gold, { sides: 10 });
    blob(P, 0.24, s * halfSpan, GATE.postH + 0.34, 0, C.gold);
  }
  // the arch: one smooth bent band from post to post, painted in a rainbow of
  // lengths, with four faces each (front, back, top, underside)
  const N = 20;
  const rise = GATE.archY - GATE.postH;
  const bow = (t) => [halfSpan * Math.cos(Math.PI * t) * -1, GATE.postH + 0.1 + rise * Math.sin(Math.PI * t)];
  const ARCH = [C.red, C.orange, C.yellow, C.green, C.sky, C.purple];
  const HW = 0.17; // half the band's width, across the arch
  const HT = 0.08; // half its thickness, front to back
  const ring = (i) => {
    const t = i / N;
    const [cx, cy] = bow(t);
    const tx = halfSpan * Math.PI * Math.sin(Math.PI * t);
    const ty = rise * Math.PI * Math.cos(Math.PI * t);
    const l = Math.hypot(tx, ty);
    const nx = -ty / l; // out of the arch's curve
    const ny = tx / l;
    const at = (u, v) => [cx + nx * v, cy + ny * v, u];
    return { n: [nx, ny, 0], fo: at(HT, HW), fi: at(HT, -HW), bo: at(-HT, HW), bi: at(-HT, -HW) };
  };
  let r0 = ring(0);
  for (let i = 0; i < N; i++) {
    const r1 = ring(i + 1);
    const hex = ARCH[i % ARCH.length];
    plate(P, [r0.fi, r1.fi, r1.fo, r0.fo], hex, [0, 0, 1]);
    plate(P, [r0.bi, r1.bi, r1.bo, r0.bo], hex, [0, 0, -1]);
    plate(P, [r0.fo, r1.fo, r1.bo, r0.bo], hex, r0.n, 1.06);
    plate(P, [r0.fi, r1.fi, r1.bi, r0.bi], hex, [-r0.n[0], -r0.n[1], 0], 0.8);
    r0 = r1;
  }
  // the sign board, hung under the arch
  box(P, 4.3, 0.96, 0.1, 0, GATE.signY - 0.48, 0, C.gold, { shade: 0.95 });
  for (const s of [-1, 1]) box(P, 0.06, 0.5, 0.06, s * 1.7, GATE.signY + 0.4, 0, C.dark);
  g.add(meshOf(P, 'fairGateFrame', { roughness: 0.6 }));
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff6dc';
  ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = '#e2433a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 500, 100);
  ctx.fillStyle = '#2f6fc0';
  ctx.textAlign = 'center';
  ctx.font = 'bold 56px Avenir, Trebuchet MS, sans-serif';
  ctx.fillText(title, 256, 76);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 0.8), new THREE.MeshBasicMaterial({ map: texture }));
    panel.name = 'fairGateSign';
    panel.position.set(0, GATE.signY, s * 0.056);
    panel.rotation.y = s > 0 ? 0 : Math.PI;
    panel.userData.noCast = true;
    g.add(panel);
  }
  const L = [];
  const NB = 14; // bulbs along the top, as many as before
  for (let i = 0; i <= NB; i++) {
    const [bx, by] = bow(i / NB);
    bulb(L, bx, by + 0.22, 0.1, BULB_COLORS[i % 2], 0.09);
    bulb(L, bx, by + 0.22, -0.1, BULB_COLORS[i % 2], 0.09);
  }
  g.add(glowMesh(L, 'fairGateBulbs', glow));
  g.position.set(x, 0, z);
  g.userData.fadeOccluder = [{ t: 'cyl', r: halfSpan + 0.5, y0: 2.6, y1: GATE.archY + 0.4 }];
  return g;
}

// ---- the front fence -----------------------------------------------------------------------------
// White pickets with coloured caps, along the fair's south side. No collider:
// a cat slips between the pickets.
export const FENCE = Object.freeze({ top: 0.9, step: 2.0 });
// Whitewash gone soft in the sun, not paper white.
const FENCE_PAINT = 0xeee3c8;
export function fence(K, runs) {
  for (const r of runs) {
    const [x1, z1] = r.a;
    const [x2, z2] = r.b;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.round(len / FENCE.step));
    for (let i = 0; i <= n; i++) {
      const px = x1 + ((x2 - x1) * i) / n;
      const pz = z1 + ((z2 - z1) * i) / n;
      box(K.fence, 0.12, 1.0, 0.12, px, 0, pz, FENCE_PAINT, { yaw });
      // a painted top: one flat square (the fence is drawn on both faces)
      const cap = BUNTING_COLORS[i % BUNTING_COLORS.length];
      sheet(K.fence, [[px - 0.09, 1.001, pz - 0.09], [px + 0.09, 1.001, pz - 0.09], [px + 0.09, 1.001, pz + 0.09], [px - 0.09, 1.001, pz + 0.09]], cap);
      sheet(K.fence, [[px - 0.07, 0.9, pz + 0.062], [px + 0.07, 0.9, pz + 0.062], [px + 0.07, 1.0, pz + 0.062], [px - 0.07, 1.0, pz + 0.062]], cap);
      sheet(K.fence, [[px - 0.07, 0.9, pz - 0.062], [px + 0.07, 0.9, pz - 0.062], [px + 0.07, 1.0, pz - 0.062], [px - 0.07, 1.0, pz - 0.062]], cap);
    }
    // each run ends in a stout striped post with a gold knob, where the hedge
    // (or the gate's post) takes over from the pickets
    for (const [ex, ez] of [r.a, r.b]) {
      stripes(K.fence, 0.1, 0, 0.1, 1.14, [C.red, C.cream], ex, 0, ez, { sides: 6 });
      blob(K.fence, 0.09, ex, 1.19, ez, C.gold, { detail: 0 });
    }
    for (const ry of [0.4, 0.78]) box(K.fence, 0.05, 0.1, len, (x1 + x2) / 2, ry, (z1 + z2) / 2, FENCE_PAINT, { c: true, yaw });
    const m = Math.max(2, Math.round(len / 0.42));
    for (let i = 0; i < m; i++) {
      const t = (i + 0.5) / m;
      const px = x1 + (x2 - x1) * t;
      const pz = z1 + (z2 - z1) * t;
      const ux = ((x2 - x1) / len) * 0.05;
      const uz = ((z2 - z1) / len) * 0.05;
      // a flat board with a pointed top (the fence is drawn on both faces)
      sheet(K.fence, [[px - ux, 0.1, pz - uz], [px + ux, 0.1, pz + uz], [px + ux, 0.84, pz + uz], [px, 0.93, pz], [px - ux, 0.84, pz - uz]], FENCE_PAINT);
    }
  }
}

// ---- stalls -------------------------------------------------------------------------------------------
// A booth with a counter along its front (+z). `top` is 'flat' (a striped
// awning a cat can stand on) or 'tent' (a round striped canopy). `goods` says
// what is on the counter and the back shelf.
export const STALL = Object.freeze({ w: 3.2, d: 2.2, counterY: 0.9, counterZ: 0.85, roofY: 2.32, tentY: 3.5, shelfY: 1.3 });

// Where a stall's words go, in the stall's own frame (the middle of the
// board's face): on the board over a flat awning, or on the board hung under
// a tent top. fair.js writes them (signWriter below).
export const STALL_SIGN = Object.freeze({
  flat: Object.freeze({ y: STALL.roofY + 0.25, z: STALL.d / 2 + 0.256, w: 1.56, h: 0.27 }),
  tent: Object.freeze({ y: 1.8, z: 1.29, w: 1.6, h: 0.3 }),
});

// A teddy bear sitting facing +z, `y` the bottom of its feet.
function teddy(P, x, y, z, hex) {
  blob(P, 0.15, x, y + 0.15, z, hex, { sy: 1.05 });
  blob(P, 0.115, x, y + 0.38, z + 0.01, hex);
  for (const s of [-1, 1]) {
    blob(P, 0.05, x + s * 0.085, y + 0.47, z, hex, { detail: 0 });
    blob(P, 0.055, x + s * 0.155, y + 0.2, z + 0.04, hex, { detail: 0, sy: 1.3, roll: -s * 0.4 });
    blob(P, 0.06, x + s * 0.085, y + 0.045, z + 0.1, hex, { detail: 0, sz: 1.4, sy: 0.8 });
    blob(P, 0.018, x + s * 0.045, y + 0.41, z + 0.115, 0x2a2228, { detail: 0 });
  }
  blob(P, 0.05, x, y + 0.35, z + 0.105, 0xf3e3c8, { detail: 0, sz: 0.8 });
  blob(P, 0.02, x, y + 0.365, z + 0.15, 0x2a2228, { detail: 0 });
}

export function stall(K, { top = 'flat', colors = [C.red, C.cream], goods = 'plain', salt = 0 } = {}) {
  const P = K.solid;
  const { w, d, counterY, counterZ, roofY } = STALL;
  const hw = w / 2;
  const hd = d / 2;
  const [a, b] = colors;
  // the back and half-depth sides, in the stall's colour with a pale dado
  box(P, w, 2.1, 0.08, 0, 0, -hd + 0.04, a, { shade: 0.86 });
  // the inside of the back, a pale dado and a pale board over it, is on the
  // glow list (beauty round two): at dusk the stall's inside is softly
  // lamp-lit, by day it is paint, shaded by the roof like the rest. A pane
  // glows as bright as its paint (fairkit.js GLOW_LOOK.pane), so these are
  // painted dim: a warm glow, not a white box
  box(K.bulbs, w - 0.3, 0.9, 0.03, 0, 0.1, -hd + 0.1, b, { shade: 0.75 });
  box(K.bulbs, w - 0.3, 0.86, 0.03, 0, 1.08, -hd + 0.1, b, { shade: 0.66 });
  for (const s of [-1, 1]) {
    box(P, 0.08, 2.1, 1.3, s * (hw - 0.04), 0, -hd + 0.65, a, { shade: 0.92 });
    for (const pz of [-hd + 0.05, hd - 0.05]) box(P, 0.1, 2.2, 0.1, s * (hw - 0.05), 0, pz, C.white);
  }
  // the outside: a skirt board at the foot, a trim along the top edge, and on
  // the back and each side a painted panel (flat paint, a hair proud of the wood)
  const bz = -hd - 0.012;
  const bx = hw - 0.1;
  rectZ(P, -bx, bx, 0, 0.34, bz, -1, b, 0.92);
  rectZ(P, -bx, bx, 0.34, 0.39, bz, -1, a, 0.6);
  rectZ(P, -0.95, 0.95, 0.62, 1.62, bz, -1, b);
  rectZ(P, -0.88, 0.88, 0.69, 1.55, bz - 0.007, -1, a, 1.04);
  plate(P, [[0, 0.88, bz - 0.014], [0.34, 1.12, bz - 0.014], [0, 1.36, bz - 0.014], [-0.34, 1.12, bz - 0.014]], C.gold, [0, 0, -1]);
  for (const s of [-1, 1]) plate(P, [[s * 0.62, 1.0, bz - 0.014], [s * 0.72, 1.12, bz - 0.014], [s * 0.62, 1.24, bz - 0.014], [s * 0.52, 1.12, bz - 0.014]], b, [0, 0, -1]);
  box(P, w + 0.06, 0.12, 0.15, 0, 2.02, -hd + 0.03, b);
  for (const s of [-1, 1]) {
    const sx = s * (hw + 0.012);
    rectX(P, -hd + 0.1, 0.1, 0, 0.34, sx, s, b, 0.92);
    rectX(P, -hd + 0.1, 0.1, 0.34, 0.39, sx, s, a, 0.6);
    rectX(P, -0.88, 0.02, 0.62, 1.52, sx, s, b);
    rectX(P, -0.81, -0.05, 0.69, 1.45, sx + s * 0.007, s, a, 1.04);
    plate(P, [[sx + s * 0.014, 0.92, -0.43], [sx + s * 0.014, 1.07, -0.28], [sx + s * 0.014, 1.22, -0.43], [sx + s * 0.014, 1.07, -0.58]], C.gold, [s, 0, 0]);
    box(P, 0.12, 0.12, 1.34, s * hw, 2.02, -hd + 0.65, b);
  }
  // the counter: a white front with two-tone panels and a painted band under its top, a board top
  box(P, w, counterY - 0.06, 0.5, 0, 0, counterZ, C.white);
  const cf = counterZ + 0.25 + 0.006;
  rectZ(P, -hw + 0.04, hw - 0.04, 0, 0.1, cf, 1, b, 0.92);
  rectZ(P, -hw + 0.04, hw - 0.04, 0.74, 0.83, cf + 0.004, 1, a);
  for (let i = 0; i < 4; i++) {
    const cx = -hw + 0.4 + i * ((w - 0.8) / 3);
    const outer = i % 2 ? a : b;
    const inner = i % 2 ? b : a;
    const cut = (hx, y0, y1, dz, hex) => plate(P, [[cx - hx, y0, cf + dz], [cx + hx, y0, cf + dz], [cx + hx, y1 - 0.1, cf + dz], [cx + hx - 0.1, y1, cf + dz], [cx - hx + 0.1, y1, cf + dz], [cx - hx, y1 - 0.1, cf + dz]], hex, [0, 0, 1]);
    cut(0.25, 0.16, 0.7, 0, outer);
    cut(0.19, 0.22, 0.64, 0.007, inner);
  }
  box(P, w + 0.1, 0.06, 0.62, 0, counterY - 0.06, counterZ, C.wood);
  // the back shelf
  box(P, w - 0.3, 0.05, 0.36, 0, STALL.shelfY - 0.05, -hd + 0.28, C.wood);

  if (top === 'flat') {
    stripedSlab(P, w + 0.5, 0.12, d + 0.5, [a, b], 0, roofY - 0.12, 0.05, { n: 8 });
    // a zig-zag valance along the front and a sign board over it
    const n = 12;
    const fz = hd + 0.3;
    for (let i = 0; i < n; i++) {
      const x0 = -hw - 0.25 + (i / n) * (w + 0.5);
      const x1 = x0 + (w + 0.5) / n;
      sheet(K.canvas, [[x0, roofY - 0.12, fz], [x1, roofY - 0.12, fz], [(x0 + x1) / 2, roofY - 0.44, fz]], i % 2 ? a : b);
    }
    box(K.bulbs, 1.9, 0.5, 0.08, 0, roofY, hd + 0.2, C.gold, { shade: 0.74 }); // on the glow list: it lights at dusk
    box(P, 1.6, 0.3, 0.1, 0, roofY + 0.1, hd + 0.2, a);
    for (let i = 0; i < 8; i++) bulb(K.bulbs, -hw + 0.1 + i * ((w - 0.2) / 7), roofY - 0.2, fz + 0.075, BULB_COLORS[(i + salt) % BULB_COLORS.length]);
  } else {
    stripes(K.canvas, 2.35, 2.2, 0, STALL.tentY, [a, b], 0, 0, 0, { sides: 12 });
    stripes(K.canvas, 2.36, 2.2, 2.36, 2.2, [b, a], 0, 0, 0, { sides: 12, scallop: 0.3 });
    blob(P, 0.14, 0, STALL.tentY + 0.06, 0, C.gold);
    // a sign board hung under the canopy, over the counter's front
    box(K.bulbs, STALL_SIGN.tent.w + 0.12, STALL_SIGN.tent.h + 0.1, 0.06, 0, STALL_SIGN.tent.y - STALL_SIGN.tent.h / 2 - 0.05, STALL_SIGN.tent.z - 0.036, C.gold, { shade: 0.74 });
    for (const s of [-1, 1]) box(P, 0.03, 2.3 - STALL_SIGN.tent.y - STALL_SIGN.tent.h / 2, 0.03, s * 0.7, STALL_SIGN.tent.y + STALL_SIGN.tent.h / 2, STALL_SIGN.tent.z - 0.036, C.dark);
    for (let i = 0; i < 7; i++) {
      const t = Math.PI / 2 - 0.9 + (i / 6) * 1.8;
      bulb(K.bulbs, Math.cos(t) * 2.4, 2.14, Math.sin(t) * 2.4, BULB_COLORS[(i + salt) % BULB_COLORS.length]);
    }
  }

  const cy = counterY;
  const sy = STALL.shelfY;
  const sz = -hd + 0.28;
  if (goods === 'floss') {
    // the spinning pan with a big pink cloud in it, and sticks of floss in a rack
    cyl(P, 0.46, 0.4, 0.26, -0.75, cy, counterZ - 0.02, C.steel, { sides: 14 });
    // a cloud of lumps, not one blob: a big heart and a ring of puffs round it
    blob(P, 0.28, -0.75, cy + 0.44, counterZ - 0.02, C.pink, { sy: 0.85 });
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * Math.PI * 2 + 0.4;
      blob(P, 0.15 + 0.03 * hash01(i, salt, 71), -0.75 + Math.cos(t) * 0.24, cy + 0.36 + 0.12 * hash01(i, 4, 72), counterZ - 0.02 + Math.sin(t) * 0.24,
        i % 2 ? 0xfdb0d2 : C.pink, { shade: 1 + 0.05 * (i % 3) });
    }
    box(P, 1.1, 0.1, 0.24, 0.75, cy, counterZ, C.wood);
    for (let i = 0; i < 4; i++) {
      cyl(P, 0.015, 0.015, 0.34, 0.33 + i * 0.28, cy + 0.1, counterZ, C.cream, { sides: 4 });
      const fc = i % 2 ? 0x9fd8ff : C.pink;
      blob(P, 0.13, 0.33 + i * 0.28, cy + 0.52, counterZ, fc, { sy: 1.15 });
      blob(P, 0.085, 0.33 + i * 0.28 + 0.07, cy + 0.6, counterZ + 0.03, fc, { detail: 0, shade: 1.08 });
    }
    for (let i = 0; i < 3; i++) blob(P, 0.17, -0.8 + i * 0.8, sy + 0.2, sz, i % 2 ? C.pink : 0x9fd8ff);
  } else if (goods === 'apples') {
    box(P, 1.6, 0.05, 0.36, 0.5, cy, counterZ, C.steel);
    for (let i = 0; i < 6; i++) {
      const ax = -0.15 + i * 0.26;
      ball(P, 0.1, ax, cy + 0.15, counterZ, i % 3 === 2 ? 0x7ac74f : 0xd3261f);
      cyl(P, 0.012, 0.012, 0.22, ax, cy + 0.22, counterZ, C.wood, { sides: 4 });
    }
    for (let i = 0; i < 4; i++) cyl(P, 0.11, 0.09, 0.26, -1.0 + i * 0.6, sy, sz, [C.red, C.yellow, C.green, C.orange][i], { sides: 8 });
  } else if (goods === 'popcorn') {
    // a glass-sided popper heaped with popcorn, and striped boxes of it
    box(P, 0.8, 0.7, 0.42, -0.8, cy, counterZ, 0xcfeaf4);
    box(P, 0.86, 0.08, 0.48, -0.8, cy + 0.7, counterZ, C.red);
    blob(P, 0.24, -0.8, cy + 0.2, counterZ + 0.02, 0xfff0b0, { sy: 0.75 });
    for (let i = 0; i < 5; i++) blob(P, 0.1, -0.8 + (hash01(i, 9, 81) - 0.5) * 0.46, cy + 0.2 + 0.08 * hash01(i, 8, 82), counterZ + (hash01(i, 7, 83) - 0.5) * 0.24, i % 3 ? 0xffe9a0 : 0xfff8d8, { detail: 0 });
    for (let i = 0; i < 4; i++) {
      const px = 0.3 + i * 0.3;
      box(P, 0.2, 0.28, 0.16, px, cy, counterZ, i % 2 ? C.red : C.white);
      blob(P, 0.09, px - 0.04, cy + 0.3, counterZ, 0xfff0b0, { detail: 0 });
      blob(P, 0.08, px + 0.05, cy + 0.31, counterZ + 0.02, 0xffe9a0, { detail: 0 });
    }
    for (let i = 0; i < 3; i++) cyl(P, 0.08, 0.1, 0.34, -0.7 + i * 0.7, sy, sz, [C.yellow, C.pink, C.sky][i], { sides: 8 });
  } else if (goods === 'prizes') {
    const fur = [0xc98a4c, 0xf3d9b0, 0xf59ac0, 0x9ad0f0, 0xb98ad8];
    for (let i = 0; i < 4; i++) teddy(P, -1.05 + i * 0.7, sy, sz, fur[(i + salt) % 5]);
    for (let i = 0; i < 2; i++) teddy(P, -0.6 + i * 1.2, cy, counterZ - 0.05, fur[(i + salt + 2) % 5]);
  } else if (goods === 'hoops') {
    // pegs to throw rings over
    for (let i = 0; i < 5; i++) {
      const px = -1.1 + i * 0.55;
      cyl(P, 0.03, 0.03, 0.3, px, cy, counterZ, C.wood, { sides: 6 });
      cyl(P, 0.14, 0.14, 0.03, px, cy + (i % 2 ? 0.02 : 0.14), counterZ, BUNTING_COLORS[i], { sides: 10 });
    }
    // toys on the back shelf, to win: a drum, a block with a stripe, a striped ball, a rocket
    const hx = (i) => -0.9 + i * 0.6;
    cyl(P, 0.1, 0.1, 0.15, hx(0), sy, sz, C.cream, { sides: 7 });
    cyl(P, 0.103, 0.103, 0.05, hx(0), sy + 0.05, sz, C.red, { sides: 7 });
    box(P, 0.17, 0.17, 0.17, hx(1), sy, sz, C.sky);
    rectZ(P, hx(1) - 0.085, hx(1) + 0.085, sy + 0.05, sy + 0.1, sz + 0.09, 1, C.yellow);
    blob(P, 0.1, hx(2), sy + 0.1, sz, C.green);
    blob(P, 0.1, hx(2), sy + 0.1, sz, C.cream, { detail: 0, sy: 0.22, sx: 1.06, sz: 1.06 });
    cyl(P, 0.07, 0.07, 0.18, hx(3), sy, sz, C.purple, { sides: 6 });
    cyl(P, 0.0, 0.07, 0.14, hx(3), sy + 0.18, sz, C.red, { sides: 6 });
  } else if (goods === 'drinks') {
    for (let i = 0; i < 5; i++) {
      cyl(P, 0.07, 0.06, 0.26, -0.9 + i * 0.4, cy, counterZ, [0xf9d648, 0xf59ac0, 0xf58a2e, 0x8fe0c0, 0xf9d648][i], { sides: 8 });
      cyl(P, 0.01, 0.01, 0.14, -0.87 + i * 0.4, cy + 0.24, counterZ, C.red, { sides: 4 });
    }
    cyl(P, 0.22, 0.18, 0.5, 1.0, cy, counterZ, 0xcfeaf4, { sides: 10 });
    cyl(P, 0.2, 0.17, 0.3, 1.0, cy + 0.02, counterZ, 0xf9d648, { sides: 10 });
    for (let i = 0; i < 4; i++) ball(P, 0.1, -0.9 + i * 0.6, sy + 0.1, sz, i % 2 ? 0xf9d648 : 0xf58a2e);
  }
  // 'tins' and 'plain' leave the counter bare (the tin-can alley's shelf is tinCanShelf)
}

// ---- tin-can alley ---------------------------------------------------------------------------------------
// The game's shelf stands in the booth behind the counter; the tins are six
// separate meshes in a pyramid on it, so step 3 can send each one flying.
export const TINS = Object.freeze({
  shelfY: 0.9, shelfZ: -0.55, r: 0.09, h: 0.22,
  // [x, row] in the stall's own frame
  places: Object.freeze([[-0.2, 0], [0, 0], [0.2, 0], [-0.1, 1], [0.1, 1], [0, 2]].map((p) => Object.freeze(p))),
});
export function tinCanShelf(K) {
  const P = K.solid;
  box(P, 1.5, 0.06, 0.5, 0, TINS.shelfY - 0.06, TINS.shelfZ, C.wood);
  for (const sx of [-1, 1]) box(P, 0.08, TINS.shelfY - 0.06, 0.4, sx * 0.65, 0, TINS.shelfZ, C.woodDark);
  // three bean bags on the counter to throw
  for (let i = 0; i < 3; i++) ball(P, 0.09, 0.9 + i * 0.2, STALL.counterY + 0.05, STALL.counterZ, [C.red, C.blue, C.yellow][i], { sy: 0.6 });
}
export function tinCans(spots) {
  const g = new THREE.Group();
  g.name = 'tinCans';
  g.userData.noMerge = true;
  spots.forEach((s, i) => {
    const P = [];
    cyl(P, TINS.r, TINS.r, TINS.h, 0, 0, 0, C.steel, { sides: 10 });
    cyl(P, TINS.r + 0.004, TINS.r + 0.004, TINS.h * 0.55, 0, TINS.h * 0.22, 0, [C.red, C.blue, C.yellow, C.green, C.orange, C.purple][i % 6], { sides: 10, open: true });
    const m = meshOf(P, 'tin' + i, { roughness: 0.35 });
    m.position.set(s.x, s.y, s.z);
    m.userData.home = { x: s.x, y: s.y, z: s.z };
    g.add(m);
  });
  return g;
}

// ---- hook-a-duck ---------------------------------------------------------------------------------------------
// A paddling pool: a low fat rim round the water (the water itself is the
// area's, drawn from its record), and rubber ducks as separate small meshes.
export const POOL = Object.freeze({ rim: 0.2, waterY: 0.1 });
export function duckPoolTub(K, x, z, r) {
  stripes(K.canvas, r + 0.26, 0, r + 0.2, POOL.rim, [C.sky, C.white], x, 0, z, { sides: 24 });
  stripes(K.canvas, r + 0.2, POOL.rim, r + 0.03, POOL.rim, [C.white, C.sky], x, 0, z, { sides: 24 });
  stripes(K.canvas, r + 0.03, POOL.rim, r, 0, [C.sky], x, 0, z, { sides: 24 });
  // a striped parasol beside it, and a rack of hooking rods
  const px = x - (r + 0.9) * 0.8;
  const pz = z - (r + 0.9) * 0.6;
  cyl(K.solid, 0.04, 0.05, 2.5, px, 0, pz, C.white, { sides: 6 });
  stripes(K.canvas, 1.5, 2.2, 0, 2.75, [C.yellow, C.white], px, 0, pz, { sides: 10 });
  stripes(K.canvas, 1.5, 2.2, 1.5, 2.2, [C.white, C.yellow], px, 0, pz, { sides: 10, scallop: 0.2 });
  const rx = x + (r + 0.9) * 0.3;
  const rz = z - (r + 0.9) * 0.95;
  for (const s of [-1, 1]) box(K.solid, 0.07, 1.0, 0.07, rx + s * 0.5, 0, rz, C.woodDark);
  box(K.solid, 1.1, 0.07, 0.07, rx, 0.95, rz, C.woodDark);
  for (let i = 0; i < 3; i++) {
    cyl(K.solid, 0.018, 0.018, 1.2, rx - 0.3 + i * 0.3, 0.05, rz + 0.12, [C.red, C.blue, C.green][i], { sides: 5, pitch: -0.12 });
    ball(K.solid, 0.035, rx - 0.3 + i * 0.3, 1.26, rz - 0.02, C.gold);
  }
}
export function rubberDucks(spots) {
  const g = new THREE.Group();
  g.name = 'rubberDucks';
  g.userData.noMerge = true;
  spots.forEach((s, i) => {
    const P = [];
    blob(P, 0.14, 0, 0.07, 0, C.yellow, { sy: 0.78, sz: 1.25 });
    ball(P, 0.09, 0, 0.21, 0.11, C.yellow);
    box(P, 0.07, 0.03, 0.08, 0, 0.19, 0.21, C.orange, { c: true });
    box(P, 0.05, 0.07, 0.05, 0, 0.12, -0.17, C.yellow, { c: true, pitch: 0.6 });
    for (const sx of [-1, 1]) box(P, 0.02, 0.025, 0.02, sx * 0.055, 0.24, 0.17, 0x2a2228, { c: true });
    const m = meshOf(P, 'rubberDuck' + i, { roughness: 0.3, noCast: true });
    m.position.set(s.x, POOL.waterY, s.z);
    m.rotation.y = s.yaw ?? 0;
    m.userData.star = !!s.star; // a star painted underneath: step 3's prize ducks
    g.add(m);
  });
  return g;
}

// ---- ring the bell -------------------------------------------------------------------------------------------------
// A tall painted board with a bell on top. The pad the cat pounces on lies on
// the ground in front (+z); the marker is a mesh of its own that slides up
// the board from BELL.markerFrom to BELL.markerTo.
export const BELL = Object.freeze({ boardH: 4.2, markerFrom: 0.6, markerTo: 3.9, bellY: 4.5, padZ: 1.25, padR: 0.55, padY: 0.16 });
export function ringTheBell(x, z, yaw, K) {
  const g = new THREE.Group();
  g.name = 'ringTheBell';
  g.userData.noMerge = true;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const P = [];
  box(P, 0.9, 0.2, 0.7, 0, 0, 0, C.blue);
  box(P, 0.56, BELL.boardH, 0.12, 0, 0.2, 0, C.cream);
  // five painted bands, green at the bottom to red at the top
  const BANDS = [C.green, 0x9ad84e, C.yellow, C.orange, C.red];
  BANDS.forEach((hex, i) => box(P, 0.5, (BELL.boardH - 0.3) / 5 - 0.04, 0.03, 0, 0.36 + i * ((BELL.boardH - 0.3) / 5), 0.06, hex));
  box(P, 0.07, BELL.boardH - 0.3, 0.03, 0, 0.34, 0.085, C.dark);
  // the bell, on a little bracket, and a star above it
  box(P, 0.12, 0.5, 0.12, 0, BELL.boardH + 0.2, 0, C.cream);
  cyl(P, 0.1, 0.3, 0.3, 0, BELL.bellY - 0.16, 0.18, C.gold, { sides: 12 });
  cyl(P, 0.32, 0.32, 0.04, 0, BELL.bellY - 0.19, 0.18, C.gold, { sides: 12 });
  ball(P, 0.06, 0, BELL.bellY - 0.24, 0.18, C.dark);
  box(P, 0.5, 0.5, 0.06, 0, BELL.boardH + 0.95, 0, C.yellow, { c: true, roll: Math.PI / 4 });
  box(P, 0.5, 0.5, 0.06, 0, BELL.boardH + 0.95, 0.001, C.yellow, { c: true });
  // the pad: a fat red cushion with a target on it, and the arm to the board
  cyl(P, BELL.padR, BELL.padR + 0.05, BELL.padY - 0.01, 0, 0, BELL.padZ, C.red, { sides: 16 });
  cyl(P, 0.36, 0.36, BELL.padY, 0, 0, BELL.padZ, C.white, { sides: 16 });
  cyl(P, 0.18, 0.18, BELL.padY + 0.004, 0, 0, BELL.padZ, C.red, { sides: 12 });
  box(P, 0.16, 0.1, BELL.padZ - 0.7, 0, 0.02, (BELL.padZ - 0.2) / 2 + 0.1, C.woodDark);
  g.add(meshOf(P, 'bellBoard', { roughness: 0.55 }));
  const M = [];
  box(M, 0.3, 0.16, 0.08, 0, -0.08, 0, C.blue);
  box(M, 0.12, 0.12, 0.09, 0, -0.06, 0.005, C.white, { roll: Math.PI / 4 });
  const marker = meshOf(M, 'bellMarker', { roughness: 0.4, noCast: true });
  marker.position.set(0, BELL.markerFrom, 0.13);
  marker.userData.travel = { from: BELL.markerFrom, to: BELL.markerTo };
  g.add(marker);
  // bulbs up both edges of the board, on the fair's one glow mesh
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
  for (let i = 0; i < 9; i++) {
    for (const s of [-1, 1]) {
      const b = bulb([], s * 0.33, 0.5 + i * 0.44, 0.07, BULB_COLORS[i % BULB_COLORS.length]);
      b.applyMatrix4(m);
      K.bulbs.push(b);
    }
  }
  return { group: g, marker };
}

// ---- the fortune teller's tent --------------------------------------------------------------------------------------
// A round tent of deep blue and purple with gold stars, open at the front
// (+z). The Group fades when it hides a cat inside; the table and the crystal
// ball are separate (fortuneTable), so they stay solid.
export const FORTUNE = Object.freeze({ r: 2.6, wallH: 2.0, apexY: 4.3, doorHalf: 0.62, tableX: 0, tableZ: -0.95, tableY: 0.62, ballR: 0.24, seatX: 0.1, seatZ: 0.5 });
export function fortuneTent(x, z, yaw, glow) {
  const g = new THREE.Group();
  g.name = 'fortuneTent';
  const { r, wallH, apexY, doorHalf } = FORTUNE;
  const T = [];
  const front = Math.PI / 2;
  stripes(T, r, 0, r, wallH, [C.night, C.purple], 0, 0, 0, { sides: 18, from: front + doorHalf, to: front + Math.PI * 2 - doorHalf });
  stripes(T, r + 0.25, wallH, 0, apexY, [C.purple, C.night], 0, 0, 0, { sides: 20 });
  stripes(T, r + 0.26, wallH, r + 0.26, wallH, [C.gold], 0, 0, 0, { sides: 20, scallop: 0.3 });
  // the door's curtains, tied back
  for (const s of [-1, 1]) {
    const a0 = front + s * doorHalf;
    const a1 = front + s * (doorHalf - 0.3);
    sheet(T, [[Math.cos(a0) * r, wallH, Math.sin(a0) * r], [Math.cos(a1) * r, wallH, Math.sin(a1) * r], [Math.cos(a0) * (r - 0.05), 0.9, Math.sin(a0) * (r - 0.05)]], C.red);
    sheet(T, [[Math.cos(a0) * r, 0.9, Math.sin(a0) * r], [Math.cos(a0) * (r + 0.02), 0, Math.sin(a0) * (r + 0.02)], [Math.cos(a0 - s * 0.12) * r, 0, Math.sin(a0 - s * 0.12) * r]], C.red, { shade: 0.9 });
  }
  // gold stars on the wall and a rug on the floor
  for (let i = 0; i < 16; i++) {
    const a = front + doorHalf + 0.2 + (i / 15) * (Math.PI * 2 - 2 * doorHalf - 0.4);
    const sy = 0.5 + 1.1 * hash01(i, 3, 41);
    const sr = r + 0.02;
    const cx = Math.cos(a) * sr;
    const cz = Math.sin(a) * sr;
    const tx = -Math.sin(a);
    const tz = Math.cos(a);
    const k = 0.11 + 0.05 * hash01(i, 5, 43);
    sheet(T, [[cx - tx * k, sy, cz - tz * k], [cx, sy + k, cz], [cx + tx * k, sy, cz + tz * k], [cx, sy - k, cz]], C.gold);
  }
  g.add(canvasOf(T, 'fortuneTentCanvas'));
  const S = [];
  blob(S, 0.2, 0, apexY + 0.12, 0, C.gold);
  // a crescent moon on a stalk
  cyl(S, 0.03, 0.03, 0.5, 0, apexY + 0.2, 0, C.gold, { sides: 5 });
  cyl(S, 0.26, 0.26, 0.05, 0, apexY + 0.9, 0, C.gold, { c: true, pitch: Math.PI / 2, sides: 14 });
  g.add(meshOf(S, 'fortuneTentPole', { roughness: 0.5 }));
  const L = [];
  for (let i = 0; i < 7; i++) {
    const a = front - doorHalf - 0.25 + (i / 6) * (2 * doorHalf + 0.5);
    bulb(L, Math.cos(a) * (r + 0.3), wallH - 0.06, Math.sin(a) * (r + 0.3), BULB_COLORS[i % BULB_COLORS.length]);
  }
  // a ring of small lamps round the crystal ball's stand (the ball is a mesh of its
  // own, in fortuneTable, set at the same spot and turn), so at dusk it sits in a
  // violet-and-gold glow and a second ring lights its underside
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    bulb(L, FORTUNE.tableX + Math.cos(a) * 0.3, FORTUNE.tableY + 0.07, FORTUNE.tableZ + Math.sin(a) * 0.3, i % 2 ? 0xd8b8ff : 0xffe49a, 0.05);
  }
  g.add(glowMesh(L, 'fortuneBulbs', glow));
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.userData.fadeOccluder = [{ t: 'cyl', r: r + 0.3, y0: 0, y1: apexY }];
  return g;
}
// The table with its cloth, the rug and a cushion. The crystal ball is a mesh
// of its own with its own material (step 3 shows the cat's face in it).
export function fortuneTable(x, z, yaw) {
  const g = new THREE.Group();
  g.name = 'fortuneTable';
  g.userData.noMerge = true;
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  const P = [];
  const { tableX, tableZ, tableY } = FORTUNE;
  cyl(P, 1.75, 1.75, 0.02, 0, 0.005, 0, 0xa83a3a, { sides: 20 });
  stripes(P, 1.32, 0.026, 1.2, 0.026, [C.gold], 0, 0, 0, { sides: 20 });
  cyl(P, 0.5, 0.62, tableY, tableX, 0, tableZ, C.purple, { sides: 14 });
  cyl(P, 0.52, 0.52, 0.03, tableX, tableY - 0.03, tableZ, C.gold, { sides: 14 });
  cyl(P, 0.16, 0.2, 0.08, tableX, tableY, tableZ, C.gold, { sides: 10 });
  // a cushion for the visitor, and a deck of cards
  blob(P, 0.4, FORTUNE.seatX, 0.06, FORTUNE.seatZ, C.pink, { sy: 0.3 });
  box(P, 0.12, 0.03, 0.18, tableX + 0.32, tableY, tableZ + 0.1, C.cream, { yaw: 0.4 });
  g.add(meshOf(P, 'fortuneTableBody', { roughness: 0.7 }));
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(FORTUNE.ballR, 2),
    new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.08, metalness: 0, emissive: 0x6fb8ff, emissiveIntensity: 0.4 }));
  orb.name = 'crystalBall';
  orb.position.set(tableX, tableY + 0.08 + FORTUNE.ballR - 0.03, tableZ);
  orb.userData.noCast = true;
  orb.castShadow = false;
  g.add(orb);
  return { group: g, ball: orb };
}

// ---- the tents' backs -----------------------------------------------------------------------------------------------
// A plain ridge tent, its door flap on +z.
export const RIDGE_TENT = Object.freeze({ w: 3.0, d: 3.6, ridge: 2.3 });
export function ridgeTent(K, colors = [C.cream, C.red]) {
  const { w, d, ridge } = RIDGE_TENT;
  const hw = w / 2;
  const hd = d / 2;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const z0 = -hd + (i / n) * d;
    const z1 = z0 + d / n;
    for (const s of [-1, 1]) sheet(K.canvas, [[s * hw, 0, z0], [s * hw, 0, z1], [0, ridge, z1], [0, ridge, z0]], colors[i % 2], { shade: s < 0 ? 0.93 : 1 });
  }
  sheet(K.canvas, [[-hw, 0, -hd], [hw, 0, -hd], [0, ridge, -hd]], colors[0], { shade: 0.9 });
  // the front: two flaps, one folded back
  sheet(K.canvas, [[-hw, 0, hd], [-0.05, 0, hd], [0, ridge, hd]], colors[0]);
  sheet(K.canvas, [[hw, 0, hd], [0.75, 0, hd], [0, ridge, hd]], colors[0], { shade: 0.95 });
  for (const z of [-hd, hd]) box(K.solid, 0.08, ridge + 0.25, 0.08, 0, 0, z, C.woodDark);
  box(K.solid, 0.06, 0.06, d + 0.3, 0, ridge, 0, C.woodDark);
}
// Where the juggler practises: a trunk, a stool, clubs and balls in the grass.
export function jugglerSpot(K) {
  const P = K.solid;
  box(P, 1.0, 0.5, 0.55, -1.3, 0, -0.5, C.red, { yaw: 0.3 });
  box(P, 1.06, 0.06, 0.6, -1.3, 0.5, -0.5, C.gold, { yaw: 0.3 });
  cyl(P, 0.24, 0.28, 0.42, 1.1, 0, -0.7, C.blue, { sides: 10 });
  cyl(P, 0.27, 0.27, 0.05, 1.1, 0.42, -0.7, C.yellow, { sides: 10 });
  const clubs = [[-0.5, 0.3, 0.6, C.red], [-0.2, 0.75, 2.2, C.sky], [0.35, 0.45, 4.0, C.yellow]];
  for (const [cx, cz, yw, hex] of clubs) {
    cyl(P, 0.07, 0.03, 0.42, cx, 0.07, cz, hex, { c: true, roll: Math.PI / 2, yaw: yw, sides: 7 });
    ball(P, 0.05, cx - Math.cos(yw) * 0.23, 0.07, cz + Math.sin(yw) * 0.23, C.gold);
  }
  const balls = [[0.6, 0.09, -0.1, C.red], [0.85, 0.09, 0.3, C.green], [-0.9, 0.09, 0.5, C.yellow], [0.2, 0.09, -0.5, C.sky], [-1.25, 0.65, -0.5, C.orange]];
  for (const [bx, by, bz, hex] of balls) ball(P, 0.09, bx, by, bz, hex);
  // three rings leaning on the trunk
  for (let i = 0; i < 3; i++) cyl(P, 0.24, 0.24, 0.03, -0.62 + i * 0.05, 0.24, -0.3 + i * 0.05, [C.orange, C.purple, C.green][i], { c: true, roll: Math.PI / 2 - 0.3, yaw: 0.3, sides: 12, open: false });
}
// A washing line between two poles (a -> b), hung with costumes.
export function washingLine(K, a, b) {
  for (const p of [a, b]) cyl(K.solid, 0.04, 0.05, 2.0, p[0], 0, p[1], C.woodDark, { sides: 6 });
  const n = 7;
  const at = (t) => [a[0] + (b[0] - a[0]) * t, 1.9 - 0.25 * 4 * t * (1 - t), a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < 12; i++) {
    const p = at(i / 12);
    const q = at((i + 1) / 12);
    sheet(K.flags, [[p[0], p[1] + 0.012, p[2]], [q[0], q[1] + 0.012, q[2]], [q[0], q[1] - 0.012, q[2]], [p[0], p[1] - 0.012, p[2]]], 0x6a5a4a);
  }
  const clothes = [C.red, C.yellow, C.sky, C.pink, C.green, C.white, C.purple];
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.15) / n);
    const q = at((i + 0.8) / n);
    const drop = 0.5 + 0.35 * hash01(i, 2, 61);
    sheet(K.flags, [p, q, [q[0], q[1] - drop, q[2]], [p[0], p[1] - drop, p[2]]], clothes[i]);
  }
}

// ---- the bandstand ----------------------------------------------------------------------------------------------------
// Eight-sided, its steps on +z. The roof is a mesh of its own (it fades when
// it hides a cat on the deck).
export const BANDSTAND = Object.freeze({ r: 3.0, deckY: 0.6, postR: 2.7, roofY: 3.3, apexY: 5.0, roofR: 3.6 });
export function bandstand(K, x, z, yaw) {
  const { r, deckY, postR, roofY } = BANDSTAND;
  into(K, x, z, yaw, (L) => {
    const P = L.solid;
    const turn = Math.PI / 8;
    cyl(P, r, r, deckY - 0.04, 0, 0, 0, C.cream, { sides: 8, yaw: turn });
    cyl(P, r + 0.06, r + 0.06, 0.12, 0, 0, 0, C.green, { sides: 8, yaw: turn });
    cyl(P, r + 0.05, r + 0.05, 0.04, 0, deckY - 0.04, 0, C.wood, { sides: 8, yaw: turn });
    for (let i = 0; i < 8; i++) {
      // posts stand on the corners: the corners are at turn + i * 45 degrees from +z
      const a = turn + (i * Math.PI) / 4;
      const px = Math.sin(a) * postR;
      const pz = Math.cos(a) * postR;
      box(P, 0.14, roofY - deckY, 0.14, px, deckY, pz, C.white, { yaw: a });
      const b = a + Math.PI / 4;
      const qx = Math.sin(b) * postR;
      const qz = Math.cos(b) * postR;
      const mid = (a + b) / 2;
      // a rail between the posts, but not across the steps (+z is between posts 7 and 0)
      if (i !== 7) {
        const len = Math.hypot(qx - px, qz - pz);
        box(P, len, 0.07, 0.07, (px + qx) / 2, deckY + 0.78, (pz + qz) / 2, C.green, { c: true, yaw: mid });
        for (let k = 1; k < 4; k++) {
          const t = k / 4;
          box(P, 0.05, 0.74, 0.05, px + (qx - px) * t, deckY, pz + (qz - pz) * t, C.white);
        }
      }
      // a little bracket under the eaves
      box(P, 0.6, 0.06, 0.06, Math.sin(a) * (postR - 0.0) + Math.sin(mid) * 0.0, roofY - 0.3, Math.cos(a) * postR, C.green, { c: true, yaw: mid });
    }
    // the steps
    box(P, 1.8, deckY * 0.66, 0.4, 0, 0, r * Math.cos(turn) + 0.2, C.wood);
    box(P, 1.8, deckY * 0.33, 0.4, 0, 0, r * Math.cos(turn) + 0.6, C.wood);
    // a big drum and two music stands, left ready for the band
    cyl(P, 0.45, 0.45, 0.4, -1.0, deckY + 0.45, -1.0, C.red, { c: true, pitch: Math.PI / 2, yaw: 0.6, sides: 14 });
    cyl(P, 0.41, 0.41, 0.44, -1.0, deckY + 0.45, -1.0, C.cream, { c: true, pitch: Math.PI / 2, yaw: 0.6, sides: 14 });
    for (const [sx, sz, yw] of [[0.9, -1.2, -0.5], [1.5, -0.2, -1.1]]) {
      cyl(P, 0.02, 0.02, 1.0, sx, deckY, sz, C.dark, { sides: 5 });
      box(P, 0.4, 0.3, 0.02, sx, deckY + 1.0, sz, C.dark, { yaw: yw, pitch: -0.3 });
      box(P, 0.34, 0.24, 0.02, sx + Math.sin(yw) * 0.012, deckY + 1.03, sz + Math.cos(yw) * 0.012, C.cream, { yaw: yw, pitch: -0.3 });
    }
  });
}
export function bandstandRoof(x, z, yaw, glow) {
  const { roofY, apexY, roofR } = BANDSTAND;
  const g = new THREE.Group();
  g.name = 'bandstandRoof';
  const T = [];
  const turn = Math.PI / 2 - Math.PI / 8;
  stripes(T, roofR, roofY, 0.5, apexY - 0.5, [0x3f9a84, 0x57b39a], 0, 0, 0, { sides: 8, from: turn, to: turn + Math.PI * 2 });
  stripes(T, 0.5, apexY - 0.5, 0, apexY, [0x57b39a, 0x3f9a84], 0, 0, 0, { sides: 8, from: turn, to: turn + Math.PI * 2 });
  stripes(T, roofR + 0.01, roofY, roofR + 0.01, roofY, [C.cream], 0, 0, 0, { sides: 32, from: turn, to: turn + Math.PI * 2, scallop: 0.26 });
  g.add(canvasOf(T, 'bandstandRoofCanvas'));
  const S = [];
  blob(S, 0.2, 0, apexY + 0.1, 0, C.gold);
  cyl(S, 0.03, 0.03, 0.8, 0, apexY + 0.2, 0, C.gold, { sides: 5 });
  box(S, 0.5, 0.26, 0.02, 0.27, apexY + 0.72, 0, C.red);
  g.add(meshOf(S, 'bandstandFinial', { roughness: 0.5 }));
  const L = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    bulb(L, Math.cos(a) * (roofR - 0.25), roofY - 0.06, Math.sin(a) * (roofR - 0.25), BULB_COLORS[i % 2]);
  }
  g.add(glowMesh(L, 'bandstandBulbs', glow));
  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  g.userData.fadeOccluder = [{ t: 'cyl', r: roofR, y0: roofY - 0.3, y1: apexY }];
  return g;
}

// ---- picnic tables and small things ------------------------------------------------------------------------------------
// A table with a bench down each side, its length along x.
export const PICNIC = Object.freeze({ w: 1.8, d: 0.8, topY: 0.75, benchY: 0.45, benchZ: 0.72 });
export function picnicTable(K) {
  const P = K.solid;
  const { w, d, topY, benchY, benchZ } = PICNIC;
  for (let i = 0; i < 4; i++) box(P, w, 0.06, d / 4, 0, topY - 0.06, -d / 2 + (i + 0.5) * (d / 4), C.wood, { shade: 0.93 + 0.07 * (i % 2) });
  for (const s of [-1, 1]) {
    box(P, w, 0.05, 0.28, 0, benchY - 0.05, s * benchZ, C.wood, { shade: 0.9 });
    for (const ex of [-1, 1]) {
      box(P, 0.08, 0.92, 0.1, ex * (w / 2 - 0.2), topY / 2 - 0.02, s * 0.42, C.woodDark, { c: true, pitch: -s * 0.55 });
    }
  }
  for (const ex of [-1, 1]) box(P, 0.07, 0.07, benchZ * 2 + 0.2, ex * (w / 2 - 0.2), benchY - 0.12, 0, C.woodDark);
}
// A tall thin pole with a gold ball on top: the bunting and the strings of
// bulbs hang from these.
export function pole(K, x, z, h = 4.2) {
  stripes(K.solid, 0.07, 0, 0.055, h, [C.white, C.red], x, 0, z, { sides: 6 });
  ball(K.solid, 0.11, x, h + 0.08, z, C.gold);
}
// The balloon seller's handcart.
export function balloonCart(K) {
  const P = K.solid;
  box(P, 1.3, 0.5, 0.8, 0, 0.5, 0, C.sky);
  box(P, 1.36, 0.06, 0.86, 0, 1.0, 0, C.cream);
  for (const s of [-1, 1]) {
    cyl(P, 0.36, 0.36, 0.07, 0.2, 0.36, s * 0.46, C.red, { c: true, pitch: Math.PI / 2, sides: 14 });
    cyl(P, 0.1, 0.1, 0.09, 0.2, 0.36, s * 0.46, C.gold, { c: true, pitch: Math.PI / 2, sides: 8 });
    box(P, 0.9, 0.05, 0.05, -1.0, 0.86, s * 0.34, C.woodDark, { roll: 0.12 });
  }
  box(P, 0.07, 0.5, 0.07, -0.55, 0, 0, C.woodDark);
  cyl(P, 0.03, 0.03, 1.5, 0.3, 1.0, 0, C.white, { sides: 5 });
  stripes(K.canvas, 0.9, 2.35, 0, 2.7, [C.red, C.white], 0.3, 0, 0, { sides: 8 });
}

// A showman's wagon: a painted caravan on four wheels, its door and steps on
// +z. WAGON gives its footprint for the collider.
export const WAGON = Object.freeze({ w: 3.4, d: 1.9, floor: 0.6, wall: 1.7 });
export function wagon(K, colors = [C.red, C.gold]) {
  const P = K.solid;
  const { w, d, floor, wall } = WAGON;
  const [a, t] = colors;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(P, 0.42, 0.42, 0.1, sx * 1.1, 0.42, sz * (d / 2 + 0.02), C.gold, { c: true, pitch: Math.PI / 2, sides: 10 });
    box(P, 0.2, 0.2, 0.13, sx * 1.1, 0.42, sz * (d / 2 + 0.02), C.red, { c: true });
  }
  box(P, w, 0.12, d, 0, floor - 0.12, 0, C.woodDark);
  box(P, w, wall, d, 0, floor, 0, a);
  // a bowed roof, wider than the walls
  cyl(P, d / 2 + 0.16, d / 2 + 0.16, w + 0.3, 0, floor + wall - 0.02, 0, C.cream, { c: true, roll: Math.PI / 2, sides: 12, sy: 1, sz: 1, sx: 0.42 });
  // trim boards, two windows with shutters, the door and its steps
  box(P, w + 0.04, 0.1, d + 0.04, 0, floor, 0, t);
  box(P, w + 0.04, 0.1, d + 0.04, 0, floor + wall - 0.14, 0, t);
  for (const sx of [-1, 1]) {
    // the pane is on the glow list, a lamp-lit curtain colour: it lights at dusk
    box(K.bulbs, 0.7, 0.6, 0.05, sx * 1.05, floor + 0.75, d / 2 + 0.01, 0xffe4a8);
    rectZ(P, sx * 1.05 - 0.016, sx * 1.05 + 0.016, floor + 0.75, floor + 1.35, d / 2 + 0.04, 1, t);
    rectZ(P, sx * 1.05 - 0.35, sx * 1.05 + 0.35, floor + 1.035, floor + 1.065, d / 2 + 0.041, 1, t);
    for (const s2 of [-1, 1]) box(P, 0.2, 0.66, 0.06, sx * 1.05 + s2 * 0.46, floor + 0.72, d / 2 + 0.02, t);
    box(P, 0.9, 0.12, 0.2, sx * 1.05, floor + 0.6, d / 2 + 0.1, C.green);
    for (let i = 0; i < 3; i++) ball(P, 0.08, sx * 1.05 - 0.26 + i * 0.26, floor + 0.78, d / 2 + 0.12, [C.pink, C.yellow, C.white][i]);
  }
  box(P, 0.62, 1.35, 0.06, 0, floor, d / 2 + 0.01, t);
  box(P, 0.46, 0.5, 0.07, 0, floor + 0.72, d / 2 + 0.015, a, { shade: 0.85 });
  box(P, 0.8, floor * 0.66, 0.3, 0, 0, d / 2 + 0.2, C.woodDark);
  box(P, 0.8, floor * 0.33, 0.3, 0, 0, d / 2 + 0.5, C.woodDark);
  // a painted star on each end
  for (const sx of [-1, 1]) {
    box(P, 0.05, 0.5, 0.5, sx * (w / 2 + 0.005), floor + 0.95, 0, t, { c: true, pitch: Math.PI / 4 });
    box(P, 0.05, 0.5, 0.5, sx * (w / 2 + 0.006), floor + 0.95, 0, t, { c: true });
  }
  cyl(P, 0.07, 0.07, 0.5, 1.2, floor + wall + 0.5, -0.3, C.dark, { sides: 6 });
}
// A picnic rug in red-and-white squares, a basket on one corner.
export function picnicRug(K, colors = [C.red, C.white]) {
  const P = K.solid;
  box(P, 2.0, 0.02, 1.5, 0, 0.004, 0, colors[1]);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) box(P, 0.5, 0.026, 0.5, -0.75 + i * 0.5, 0.004, -0.5 + j * 0.5, colors[0]);
  box(P, 0.5, 0.3, 0.36, 0.55, 0.03, -0.3, 0xc99a58, { yaw: 0.4 });
  box(P, 0.54, 0.05, 0.4, 0.55, 0.33, -0.3, 0xb58444, { yaw: 0.4 });
  ball(P, 0.09, -0.3, 0.12, 0.2, 0xd3261f);
  ball(P, 0.09, -0.1, 0.12, 0.34, 0x7ac74f);
  cyl(P, 0.08, 0.07, 0.2, -0.55, 0.03, -0.2, C.yellow, { sides: 8 });
}

// ---- strings overhead ---------------------------------------------------------------------------------------------------
// ---- the signs' words ---------------------------------------------------------------------------------------------
// Every painted word at the fair but the gate's is on ONE texture (a row a
// sign) and ONE mesh (a flat panel a sign), so all of them cost one draw call.
// add() takes the middle of a panel in the world and the way it faces (a yaw
// of 0 faces +z).
export const SIGN_ROW = Object.freeze({ w: 512, h: 96 });
export function signWriter() {
  const rows = [];
  const panels = [];
  return {
    get texts() { return rows.slice(); },
    get count() { return panels.length; },
    add(text, x, y, z, yaw, w, h) {
      let row = rows.indexOf(text);
      if (row < 0) { rows.push(text); row = rows.length - 1; }
      panels.push({ row, x, y, z, yaw, w, h });
    },
    mesh(name = 'fairSigns') {
      const n = Math.max(1, rows.length);
      const canvas = document.createElement('canvas');
      canvas.width = SIGN_ROW.w;
      canvas.height = SIGN_ROW.h * n;
      const ctx = canvas.getContext('2d');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      rows.forEach((text, i) => {
        const y0 = i * SIGN_ROW.h;
        ctx.fillStyle = '#fff6dc';
        ctx.fillRect(0, y0, SIGN_ROW.w, SIGN_ROW.h);
        ctx.strokeStyle = '#e2433a';
        ctx.lineWidth = 8;
        ctx.strokeRect(6, y0 + 6, SIGN_ROW.w - 12, SIGN_ROW.h - 12);
        ctx.fillStyle = '#2f6fc0';
        ctx.font = 'bold 60px Avenir, Trebuchet MS, sans-serif';
        ctx.fillText(text, SIGN_ROW.w / 2, y0 + SIGN_ROW.h / 2 + 3, SIGN_ROW.w - 44);
      });
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const pos = [];
      const uv = [];
      for (const p of panels) {
        const rx = Math.cos(p.yaw) * p.w / 2;
        const rz = -Math.sin(p.yaw) * p.w / 2;
        const v1 = 1 - p.row / n;
        const v0 = 1 - (p.row + 1) / n;
        const BL = [p.x - rx, p.y - p.h / 2, p.z - rz, 0, v0];
        const BR = [p.x + rx, p.y - p.h / 2, p.z + rz, 1, v0];
        const TR = [p.x + rx, p.y + p.h / 2, p.z + rz, 1, v1];
        const TL = [p.x - rx, p.y + p.h / 2, p.z - rz, 0, v1];
        for (const v of [BL, BR, TR, BL, TR, TL]) { pos.push(v[0], v[1], v[2]); uv.push(v[3], v[4]); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texture }));
      m.name = name;
      m.userData.noCast = true;
      m.userData.noMerge = true;
      m.castShadow = false;
      return m;
    },
  };
}
// A little sign on a post, its board facing +z and -z: for a game that has no
// booth to hang its name on. Too thin to need a collider.
export const SIGN_POST = Object.freeze({ y: 1.3, w: 1.3, h: 0.3 });
export function signPost(K) {
  const P = K.solid;
  box(P, 0.07, SIGN_POST.y + SIGN_POST.h / 2 + 0.12, 0.07, 0, 0, 0, C.white);
  box(P, SIGN_POST.w + 0.1, SIGN_POST.h + 0.08, 0.06, 0, SIGN_POST.y - SIGN_POST.h / 2 - 0.04, 0, C.gold);
  ball(P, 0.07, 0, SIGN_POST.y + SIGN_POST.h / 2 + 0.16, 0, C.red);
}

export { bunting, bulbString };

// ---- turning the lists into meshes -------------------------------------------------------------------------------------------
export function meshesOf(K, glow, prefix = 'fair') {
  const out = [];
  if (K.solid.length) out.push(meshOf(K.solid, prefix + 'Props', { roughness: 0.65 }));
  if (K.canvas.length) out.push(canvasOf(K.canvas, prefix + 'Canvas'));
  if (K.flags.length) out.push(canvasOf(K.flags, prefix + 'Bunting', { noCast: true }));
  if (K.bulbs.length) {
    // receives the sun's shadow: by day the stalls' lit insides and sign
    // boards are shaded like paint (a shadow never dims the dusk glow)
    const lit = glowMesh(K.bulbs, prefix + 'Bulbs', glow);
    lit.receiveShadow = true;
    out.push(lit);
  }
  if (K.balloons.length) out.push(meshOf(K.balloons, prefix + 'Balloons', { roughness: 0.25, noCast: true }));
  if (K.fence.length) out.push(canvasOf(K.fence, prefix + 'Fence', { noCast: true }));
  return out;
}
export { recentre };
