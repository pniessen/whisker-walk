// =============================================================================
// SNOWVILLE: THE SLED RUN, DRAWN (round two). Three small things, none of them a light:
//   the TRACK  a packed-snow ribbon down the hill's east flank with two darker runner grooves, and a stake with a red flag every few metres along each edge (merged into the kit's buckets at build: the
//              ribbon in the non-casting one; no mesh of its own);
//   the SLED   a friendly wooden sled: a deck with a red cushion, two side rails, two runners curled up at the nose, a rope (ONE vertex-coloured mesh the live moves; built facing +z, standing on the ground);
//   the LINES  a few thin pale streaks that stream past her while she rides (ONE mesh of thin boxes; the live places them; held still in reduced motion).
// Stage chunk code (snowvillestageb.js); start-up never imports it. No random number, no clock.
// =============================================================================
import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import * as S from './snowvillesledplan.js';
import { COL, paint, stand, box, cyl } from './snowvilleparts.js';

export const SLED_COL = Object.freeze({ deck: 0xc9925a, rail: 0x8a5a36, runner: 0x4a4f5c, cushion: 0xc8483f, rope: 0xf0e4c4, track: 0xb7c6dc, groove: 0x94a9c9, flag: 0xc8483f, stake: 0x6a4a34, line: 0xffffff });

// The ground's own height at (x, z): the ground mesh is a grid of 2 m cells split along one diagonal (snowvilleparts.js groundGeometry), so a thing laid flat on it must follow the cell's two triangles,
// not the smooth function the cat walks on, or it dips under the mesh on a curve (a dashed track).
export function meshY(x, z) {
  const B = P.SNOWVILLE_BOUNDS;
  const x0 = B.minX + Math.floor((x - B.minX) / 2) * 2; const z0 = B.minZ + Math.floor((z - B.minZ) / 2) * 2;
  const u = (x - x0) / 2; const v = (z - z0) / 2;
  const ya = P.snowY(x0, z0); const yb = P.snowY(x0 + 2, z0); const yc = P.snowY(x0, z0 + 2); const yd = P.snowY(x0 + 2, z0 + 2);
  return u + v <= 1 ? ya + u * (yb - ya) + v * (yc - ya) : yd + (1 - u) * (yc - yd) + (1 - v) * (yb - yd);
}

// ---- the track and its stakes (at build) -------------------------------------------------------------------------------------------
function ribbon() {
  const n = Math.max(8, Math.round(S.RUN_LEN / 0.7));
  const pos = []; const col = []; const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const s = (S.RUN_LEN * i) / n;
    for (const [lat, hex] of [[-S.TRACK.half, SLED_COL.track], [-0.34, SLED_COL.groove], [-0.2, SLED_COL.track], [0.2, SLED_COL.track], [0.34, SLED_COL.groove], [S.TRACK.half, SLED_COL.track]]) {
      const p = S.runPos(s, lat);
      pos.push(p.x, meshY(p.x, p.z) + 0.04, p.z);
      c.setHex(hex); col.push(c.r, c.g, c.b);
    }
  }
  const W = 6;
  for (let i = 0; i < n; i++) for (let k = 0; k < W - 1; k++) { const a = i * W + k; idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); } // (counter-clockwise from above: the path's right is (-cos h, sin h))
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
export function drawRun(kit, M) {
  const g = ribbon().toNonIndexed();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  kit.put('treeBack', M.paint, g, { noCast: true });
  for (const k of S.STAKES) {
    kit.put('paint', M.paint, paint(stand(cyl(0.035, 0.045, 1.0, 4), k.x, k.z, 0.5), SLED_COL.stake));
    kit.put('paint', M.paint, paint(stand(new THREE.ConeGeometry(0.11, 0.3, 3).rotateZ(-Math.PI / 2).translate(0.1, 0, 0), k.x, k.z, 0.95), SLED_COL.flag));
  }
  // the top of the run: a low wooden board marking the start, laid across the track
  const a = S.START; const next = S.runPos(0.6);
  kit.put('paint', M.paint, paint(stand(box(2.4, 0.08, 0.16), a.x, a.z, 0.08, Math.atan2(next.x - a.x, next.z - a.z) + Math.PI / 2), COL.wood));
}

// ---- the sled -------------------------------------------------------------------------------------------------------------------------------
export function buildSled(M) {
  const parts = [];
  const add = (geo, hex) => parts.push(paint(geo, hex));
  const L = S.SLED.len; const W = S.SLED.half;
  add(box(W * 2, 0.06, L).translate(0, 0.26, 0), SLED_COL.deck);
  for (const sx of [-1, 1]) {
    add(box(0.05, 0.1, L).translate(sx * W, 0.33, 0), SLED_COL.rail);
    add(box(0.05, 0.22, L * 0.96).translate(sx * (W - 0.04), 0.13, 0), SLED_COL.runner);
    add(box(0.05, 0.05, 0.24).rotateX(-0.6).translate(sx * (W - 0.04), 0.24, L / 2 + 0.07), SLED_COL.runner); // the runner curls up at the nose
  }
  add(box(W * 2 - 0.1, 0.1, 0.5).translate(0, 0.34, 0.12), SLED_COL.cushion);
  add(box(W * 2, 0.07, 0.07).translate(0, 0.32, L / 2 - 0.02), SLED_COL.rail);
  add(box(0.02, 0.02, 0.5).rotateX(-0.3).translate(0, 0.32, L / 2 + 0.24), SLED_COL.rope);
  const geo = parts.length === 1 ? parts[0] : mergeParts(parts);
  const m = new THREE.Mesh(geo, M.paint);
  m.name = 'snowville:sled';
  m.castShadow = true;
  m.userData.noContactShadow = true;
  return m;
}
function mergeParts(parts) {
  // (the same four attributes on every piece: position, normal, uv, colour)
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

// ---- the speed lines ------------------------------------------------------------------------------------------------------------------------
export function buildSpeedLines(count) {
  const geo = mergeParts(Array.from({ length: count }, () => paint(box(0.012, 0.012, 1.0), SLED_COL.line)));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.0, depthWrite: false, fog: true }));
  m.name = 'snowville:sledlines';
  m.frustumCulled = false;
  m.visible = false;
  Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
  m.castShadow = false;
  return m;
}
// Line i's place round the rider at time `clock` (a ride second; 0 for reduced motion: held still), as a lateral offset, a height and a distance ahead (negative = behind). Pure.
export function lineSpot(i, count, clock, speed) {
  const lat = (i % 2 ? 1 : -1) * (0.7 + 0.5 * ((i * 0.618) % 1));
  const y = 0.25 + 0.7 * ((i * 0.37 + 0.1) % 1);
  const drift = (((i / count) + clock * speed * 0.35) % 1);
  return { lat, y, ahead: 1.4 - drift * 3.2, len: 0.5 + 0.9 * ((i * 0.43) % 1) };
}
