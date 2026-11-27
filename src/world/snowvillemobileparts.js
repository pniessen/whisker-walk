// =============================================================================
// SNOWVILLE: THE SNOWMOBILE, DRAWN (round four). Two kinds of thing:
//   AT BUILD (static, merged into the kit's buckets: no mesh of its own, no caster of its own):
//     the RING   a packed-snow ribbon round the south-east lawn (the non-casting bucket), two faint grooves, a start line across it;
//     the MARKS  orange stakes on the lane's outer edge and white on its inner, a little flag on each;
//     the GARAGE an open lean-to (three posts, a sloped roof with a cap of snow, a back wall of boards, a shelf with two crates and a lantern's glass), a bench with the helmet lying on it.
//   THE MACHINE (buildMobile, below): ONE vertex-coloured mesh the live moves; built facing +z and standing on the ground at the origin. It is not a caster (a moving machine throws no shadow). Its
//     headlight is a pale-yellow patch of its own paint (no emissive, no light).
// Stage chunk code (snowvillestagec.js); start-up never imports it. No random number, no clock.
// =============================================================================
import * as THREE from 'three';
import * as M from './snowvillemobileplan.js';
import { COL, paint, stand, box, cyl, ball } from './snowvilleparts.js';
import { meshY } from './snowvillesledparts.js';

export const MOBILE_COL = Object.freeze({ track: 0xc4d2e6, groove: 0xa6bad6, edge: 0xb4c7e2, start: 0xf2f6fb, orange: 0xe8793a, white: 0xf5f8fc, red: 0xc23a30, redDark: 0x8e2a24, cream: 0xf2e6cc, seat: 0x2f3a4e, dark: 0x30343e, rubber: 0x23262d, screen: 0xa8d4ee, lamp: 0xfff1b0, tail: 0xff5a4a, metal: 0x9aa3b2, helmet: 0xe8793a, visor: 0x2f3a4e, crate: 0xb98a5a, glass: 0xe6f3ff });

// ---- the ring (at build) ----------------------------------------------------------------------------------------------------------------------
const HALF = 2.0;
function ribbon() {
  const n = Math.max(8, Math.round(M.MOBILE_LEN / 0.7));
  const cols = [[-HALF, MOBILE_COL.edge], [-0.5, MOBILE_COL.groove], [0.5, MOBILE_COL.groove], [HALF, MOBILE_COL.edge]];
  const W = cols.length;
  const pos = []; const col = []; const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) { // (the last row is the first again: a ring)
    const s = (M.MOBILE_LEN * i) / n;
    for (const [lat, hex] of cols) {
      const p = M.mobilePos(s, lat);
      pos.push(p.x, meshY(p.x, p.z) + 0.04, p.z);
      c.setHex(i === 0 ? MOBILE_COL.start : hex); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < W - 1; k++) { const a = i * W + k; const b = ((i + 1) % n) * W + k; idx.push(a, a + 1, b, a + 1, b + 1, b); } // (counter-clockwise from above, as the sled's)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const pole = (x, z, h, hex) => paint(stand(cyl(0.03, 0.04, h, 4), x, z, h / 2), hex);
const flag = (x, z, h, yaw, hex) => paint(stand(new THREE.ConeGeometry(0.11, 0.3, 3).rotateZ(-Math.PI / 2).translate(0.13, 0, 0), x, z, h, yaw), hex);

export function drawMobile(kit, M0) {
  const g = ribbon().toNonIndexed();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  kit.put('treeBack', M0.paint, g, { noCast: true });
  const put = (geo) => kit.put('paint', M0.paint, geo);
  for (const k of M.MARKS) {
    const hex = k.side < 0 ? MOBILE_COL.orange : MOBILE_COL.white;
    put(pole(k.x, k.z, 0.9, hex));
    put(flag(k.x, k.z, 0.82, k.side < 0 ? 0 : Math.PI, hex));
  }
  // the garage: local frame (lx across, lz deep), the open side facing the lane (the right of the ring's start, +x of the yaw frame turned)
  const { x: gx, z: gz, w, d } = M.GARAGE;
  const yaw = M.GARAGE.yaw - Math.PI / 2; // its +z faces the lane (the ring's right), its back wall is away from it
  const loc = (lx, lz) => [gx + lx * Math.cos(yaw) + lz * Math.sin(yaw), gz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  const at = (geo, lx, lz, dy, hex, rot = 0) => { const [px, pz] = loc(lx, lz); put(paint(stand(geo, px, pz, dy, yaw + rot), hex)); };
  for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) { at(cyl(0.07, 0.08, 2.1, 5), sx, d / 2 - 0.1, 1.05, COL.wood); at(cyl(0.07, 0.08, 2.6, 5), sx, -d / 2 + 0.1, 1.3, COL.wood); }
  at(box(w, 0.1, d + 0.4).rotateX(0.22), 0, 0, 2.45, COL.woodDark); // the sloped roof (high at the back)
  at(box(w + 0.1, 0.16, d + 0.5).rotateX(0.22), 0, 0, 2.58, 0xeaf0f8); // its cap of snow
  at(box(w, 2.3, 0.08), 0, -d / 2 + 0.05, 1.15, COL.wood); // the back wall of boards
  for (let i = -1; i <= 1; i++) at(box(0.05, 2.3, 0.1), i * (w / 3), -d / 2 + 0.1, 1.15, COL.woodDark);
  at(box(w - 0.5, 0.06, 0.4), 0, -d / 2 + 0.32, 1.1, COL.woodDark); // the shelf
  for (const sx of [-0.7, 0.5]) at(box(0.38, 0.3, 0.3), sx, -d / 2 + 0.32, 1.28, MOBILE_COL.crate);
  at(cyl(0.07, 0.07, 0.16, 6), 0.0, -d / 2 + 0.32, 1.21, MOBILE_COL.glass); // a lantern's glass on it
  at(box(w, 0.04, d), 0, 0, 0.03, COL.woodDark); // the floor boards
  // the bench beside it, with the helmet lying on it
  const { x: bx, z: bz, yaw: by } = M.BENCH;
  put(paint(stand(box(1.2, 0.07, 0.4), bx, bz, 0.45, by), COL.wood));
  for (const sx of [-0.5, 0.5]) { const [px, pz] = [bx + sx * Math.cos(by), bz - sx * Math.sin(by)]; put(paint(stand(box(0.07, 0.42, 0.34), px, pz, 0.21, by), COL.woodDark)); }
  put(paint(stand(ball(0.12, 8, 5).scale(1, 0.85, 1.1), bx, bz, 0.55, by), MOBILE_COL.helmet));
  put(paint(stand(box(0.16, 0.06, 0.1).translate(0, 0, 0.12), bx, bz, 0.52, by), MOBILE_COL.visor));
}

// ---- the machine (the live's one moving mesh) --------------------------------------------------------------------------------------------
function mergeParts(parts) {
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const size = parts[0].attributes[name].itemSize;
    const arr = new Float32Array(n * size);
    let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
export function buildMobileGeometry() {
  const C = MOBILE_COL;
  const parts = [];
  const add = (geo, hex) => parts.push(paint(geo, hex));
  // the track: a rubber belt under the back half with a roller at each end and cross treads
  add(box(0.5, 0.2, 1.0).translate(0, 0.14, -0.55), C.rubber);
  for (const z of [-1.05, -0.05]) add(cyl(0.12, 0.12, 0.5, 8).rotateZ(Math.PI / 2).translate(0, 0.14, z), C.rubber);
  for (let i = 0; i < 6; i++) add(box(0.56, 0.035, 0.05).translate(0, 0.03, -1.0 + i * 0.18), C.dark);
  // the front skis: two long boards with curled tips, on a short strut each
  for (const sx of [-0.3, 0.3]) {
    add(box(0.14, 0.04, 0.95).translate(sx, 0.07, 0.72), C.red);
    add(box(0.14, 0.04, 0.22).rotateX(-0.55).translate(sx, 0.12, 1.26), C.red);
    add(box(0.05, 0.3, 0.06).translate(sx * 0.8, 0.22, 0.6), C.metal);
  }
  // the body: a chunky lower shell, a rounded nose, a hood, side panels with a cream stripe
  add(box(0.8, 0.26, 1.9).translate(0, 0.38, -0.05), C.red);
  add(ball(0.42, 9, 6).scale(0.95, 0.62, 1.2).translate(0, 0.5, 0.78), C.red);
  add(box(0.64, 0.14, 0.7).rotateX(0.16).translate(0, 0.66, 0.5), C.redDark);
  for (const sx of [-1, 1]) {
    add(box(0.03, 0.07, 1.7).translate(sx * 0.415, 0.4, -0.05), C.cream);
    add(box(0.05, 0.2, 0.6).translate(sx * 0.4, 0.3, -0.7), C.redDark); // the back fender
  }
  // the windscreen, the handlebars with their grips and little mirrors, the headlight and the tail light
  add(box(0.52, 0.3, 0.03).rotateX(-0.6).translate(0, 0.92, 0.28), C.screen);
  add(cyl(0.024, 0.024, 0.78, 6).rotateZ(Math.PI / 2).translate(0, 0.82, 0.16), C.metal);
  for (const sx of [-1, 1]) {
    add(cyl(0.04, 0.04, 0.12, 6).rotateZ(Math.PI / 2).translate(sx * 0.4, 0.82, 0.16), C.rubber);
    add(box(0.07, 0.05, 0.02).translate(sx * 0.3, 1.0, 0.3), C.metal);
  }
  add(cyl(0.12, 0.14, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.56, 1.1), C.lamp);
  add(cyl(0.15, 0.15, 0.03, 10).rotateX(Math.PI / 2).translate(0, 0.56, 1.05), C.metal);
  add(box(0.3, 0.06, 0.03).translate(0, 0.5, -1.02), C.tail);
  // the long seat (two people), a rolled back and a little rack
  add(box(0.5, 0.12, 1.15).translate(0, 0.58, -0.3), C.seat);
  add(cyl(0.06, 0.06, 0.5, 8).rotateZ(Math.PI / 2).translate(0, 0.64, -0.88), C.seat);
  add(box(0.5, 0.04, 0.35).translate(0, 0.62, -1.15), C.metal);
  for (const sx of [-0.2, 0.2]) add(box(0.03, 0.12, 0.03).translate(sx, 0.56, -1.3), C.metal);
  add(cyl(0.035, 0.04, 0.3, 6).rotateX(Math.PI / 2).translate(0.28, 0.35, -1.0), C.metal); // the exhaust
  return mergeParts(parts);
}
export function buildMobile(M0) {
  const m = new THREE.Mesh(buildMobileGeometry(), M0.paint);
  m.name = 'snowville:mobile';
  m.castShadow = false;
  Object.assign(m.userData, { noContactShadow: true, noMerge: true, noCast: true });
  return m;
}
