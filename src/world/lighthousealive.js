// =============================================================================
// LIGHTHOUSE POINT: BEAUTY PASS TWO, THE MOVING PART (2026-11-28). Made by lighthouselife.js with the rest of the life; part of
// the place's chunk. Two meshes of its own and one the build made (the moored boats), nothing else:
//
//   GULLS: a few white gulls circling the tower and the two seas, ONE merged mesh (a diamond body and two wings each, 4
//   triangles a gull) whose vertices are rewritten each frame: the wings beat, with a long glide between the flaps. The
//   orbit is a plain circle round a centre, its phase from hash01, so there is no random number and no clock.
//   SEA FX: ONE additive vertex-coloured mesh (no real light): rows of foam that drift in to each shore and thin out, gold
//   glints that twinkle, a golden-hour sheen on each sea, a flicker of lantern light about each boat's two lanterns, and,
//   while the lamp is lit, a soft glow over the cloud-bank where the beam points (the beam's own cone and its pool of
//   light on the sea are lighthouselife.js's).
//   BOATS: the two moored fishing boats (built into 'lighthouse:boats' by lighthousebeauty2.js) rock at anchor: their
//   vertices are rotated a little about the hull's own centre each frame.
//
// REDUCED MOTION freezes all of it (the gulls hang in their first positions, the foam lies still, the boats sit level, the
// lanterns burn steady). The LOW tier draws fewer gulls and foam rows, and no twinkle. Nothing here is a collider, a
// perch or a light, and it never touches the walk's save.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './builder.js';
import * as P from './lighthouseplan.js';

const TAU = Math.PI * 2;
const h01 = hash01;

// ---- the numbers --------------------------------------------------------------------------------------
const SPAN = 2.1; // half the wingspan of a gull, metres (a little more than life, so it reads from the beach)
export const GULLS_HIGH = 8;
export const GULLS_LOW = 4;
// orbit centres: the tower, and a loop over each sea
const ORBITS = Object.freeze([
  { x: P.TOWER.x, z: P.TOWER.z, r: [9, 15], y: [14.5, 19] },
  { x: P.TOWER.x, z: P.TOWER.z, r: [17, 24], y: [16, 23] },
  { x: 22, z: 22, r: [6, 12], y: [6, 10] },
  { x: -56, z: -6, r: [8, 16], y: [6.5, 11] },
  { x: 48, z: -2, r: [10, 18], y: [7, 12] },
]);
const HALO_FAN = 6; // triangles in a lantern's halo
const FOAM_HIGH = 5; // rows a sea
const FOAM_LOW = 3;
const FOAM_REACH = 22; // m the rows travel out from the shore
const FOAM_PERIOD = 11; // s for a row to come in
const FOAM_SEG = 14; // pieces a row
const GLINTS = 26; // twinkling glints a sea (high tier)
const SEAS = Object.freeze([
  { id: 'east', shoreX: P.SEA_EAST.minX + 2.4, dir: 1, z0: -48, z1: 48 },
  { id: 'west', shoreX: P.SEA_WEST.maxX - 1.6, dir: -1, z0: -48, z1: 48 },
]);

// ---- gulls --------------------------------------------------------------------------------------------
function makeGulls(count) {
  const gulls = [];
  for (let i = 0; i < count; i++) {
    const o = ORBITS[i % ORBITS.length];
    const k = Math.floor(i / ORBITS.length);
    const r = o.r[0] + (o.r[1] - o.r[0]) * h01(i, 1, 901);
    gulls.push({
      cx: o.x, cz: o.z, r, y: o.y[0] + (o.y[1] - o.y[0]) * h01(i, 2, 901),
      w: (0.1 + 0.07 * h01(i, 3, 901)) * (h01(i, 4, 901) < 0.5 ? -1 : 1) / (1 + 0.5 * k) * (14 / Math.max(r, 8)),
      phase: h01(i, 5, 901) * TAU, flap: TAU * (1.3 + 0.5 * h01(i, 6, 901)), fphase: h01(i, 7, 901) * TAU, bob: 0.6 + 1.2 * h01(i, 8, 901),
    });
  }
  return gulls;
}

// four triangles a gull: a diamond body (two triangles) and a wing each side (one triangle); 12 vertices
function writeGull(pos, o, g, t, still) {
  const a = g.phase + g.w * (still ? 0 : t);
  const x = g.cx + Math.cos(a) * g.r;
  const z = g.cz + Math.sin(a) * g.r;
  const y = g.y + (still ? 0 : Math.sin(t * 0.5 + g.fphase) * g.bob);
  const dirx = -Math.sin(a) * Math.sign(g.w); const dirz = Math.cos(a) * Math.sign(g.w);
  // local frame: forward f, right s; a flap lifts and drops the tips; in a glide the wings sit a little up
  const f = [dirx, dirz]; const s = [-dirz, dirx];
  const beat = still ? 0.15 : (Math.sin(t * g.flap + g.fphase) > -0.2 && Math.sin(t * 0.37 + g.fphase * 2) > -0.3 ? Math.sin(t * g.flap + g.fphase) : 0.25);
  const tipY = beat * 0.5;
  const bank = still ? 0 : 0.18 * Math.sign(g.w);
  const P3 = (lf, lu, ls) => [x + f[0] * lf * 2 + s[0] * ls, y + lu * 2 + (ls > 0 ? bank : -bank) * Math.abs(ls) * 0.5, z + f[1] * lf * 2 + s[1] * ls];
  const v = [
    P3(0.5, 0, 0), P3(0, 0, -0.13), P3(0, 0, 0.13),
    P3(0, 0, -0.13), P3(-0.5, 0, 0), P3(0, 0, 0.13),
    P3(0.22, 0.02, 0.1), P3(-0.2, 0.02, 0.1), P3(-0.05, tipY, 1 * SPAN),
    P3(0.22, 0.02, -0.1), P3(-0.05, tipY, -1 * SPAN), P3(-0.2, 0.02, -0.1),
  ];
  for (let q = 0; q < 12; q++) { pos[o + q * 3] = v[q][0]; pos[o + q * 3 + 1] = v[q][1]; pos[o + q * 3 + 2] = v[q][2]; }
}
function gullColours(n) {
  const col = new Float32Array(n * 36);
  const body = new THREE.Color(0xfff3e0); const wing = new THREE.Color(0xf7efe2); const tip = new THREE.Color(0x6d727c);
  for (let i = 0; i < n; i++) {
    const set = (v, c, k = 1) => { col[i * 36 + v * 3] = c.r * k; col[i * 36 + v * 3 + 1] = c.g * k; col[i * 36 + v * 3 + 2] = c.b * k; };
    for (let v = 0; v < 6; v++) set(v, body);
    set(6, wing); set(7, wing); set(8, tip); set(9, wing); set(10, tip); set(11, wing);
  }
  return col;
}

// ---- the additive sea fx ------------------------------------------------------------------------------
// Writers add quads/triangles to a fixed-size vertex list; each returns its first vertex index so update can rewrite it.
class Verts {
  constructor(max) { this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.n = 0; }
  tri(a, b, c) { const o = this.n * 3; for (const p of [a, b, c]) { this.pos.set(p, this.n * 3); this.n++; } void o; return this.n - 3; }
  setCol(v, r, g, b) { this.col[v * 3] = r; this.col[v * 3 + 1] = g; this.col[v * 3 + 2] = b; }
}
const GOLD = new THREE.Color(0xffc870);
const FOAM = new THREE.Color(0xdfeaf0);
const WARM = new THREE.Color(0xffa850);
const NEAR_ROCKS = (x, z) => {
  const r = (R, k) => Math.hypot(x - R.x, z - R.z) < R.r * k;
  return r(P.GULL_ROCK, 2.2) || r(P.PINNACLE, 2.2);
};

export function createLighthouseAlive({ scene, reducedMotion = false, tier = null } = {}) {
  const low = tier?.name === 'low';
  const still = !!reducedMotion;
  const nGulls = low ? GULLS_LOW : GULLS_HIGH;
  const gulls = makeGulls(nGulls);
  const objs = [];

  // gulls
  const gGeo = new THREE.BufferGeometry();
  const gPos = new Float32Array(nGulls * 36);
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gullColours(nGulls), 3));
  const gMesh = new THREE.Mesh(gGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true }));
  gMesh.name = 'lighthouse:gulls';
  gMesh.frustumCulled = false;
  gMesh.castShadow = false;
  gMesh.userData.noMerge = true; gMesh.userData.noCast = true;
  objs.push(gMesh);
  const placeGulls = (t) => { gulls.forEach((g, i) => writeGull(gPos, i * 36, g, t, still)); gGeo.attributes.position.needsUpdate = true; };

  // the fx mesh
  const foamRows = low ? FOAM_LOW : FOAM_HIGH;
  const glintN = low ? 0 : GLINTS;
  const maxV = SEAS.length * (foamRows * FOAM_SEG * 6 + glintN * 6 + 12) + 4 * HALO_FAN * 3 + 12 * 3 + 24 * 3;
  const V = new Verts(maxV);
  const foam = []; // { sea, row, seg, v, z0, z1 }
  for (const sea of SEAS) {
    for (let row = 0; row < foamRows; row++) {
      for (let k = 0; k < FOAM_SEG; k++) {
        const z0 = sea.z0 + ((sea.z1 - sea.z0) / FOAM_SEG) * k; const z1 = z0 + ((sea.z1 - sea.z0) / FOAM_SEG) * (0.55 + 0.35 * h01(row, k * 2 + (sea.dir > 0 ? 0 : 1), 911));
        const v = V.n;
        V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]); V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
        foam.push({ sea, row, k, v, z0, z1, wob: h01(row, k, 913), amp: 0.45 + 0.55 * h01(row, k, 915) });
      }
    }
  }
  const glints = [];
  for (const sea of SEAS) {
    for (let i = 0; i < glintN; i++) {
      const x = sea.shoreX + sea.dir * (3 + 32 * h01(i, 1, 921 + (sea.dir > 0 ? 0 : 7)) ** 1.3);
      const z = -52 + 104 * h01(i, 2, 921 + (sea.dir > 0 ? 0 : 7));
      if (NEAR_ROCKS(x, z)) continue;
      if (Math.hypot(x - 43, z + 12) < 3.4 || Math.hypot(x - 46, z - 21) < 3.4) continue;
      const v = V.n;
      V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]); V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
      glints.push({ v, x, z, r: 0.45 + 0.6 * h01(i, 3, 923), rate: 1.1 + 1.6 * h01(i, 4, 923), ph: TAU * h01(i, 5, 923) });
    }
  }
  // a golden-hour sheen on each sea: one fan toward the horizon glow (north), warm at its far edge and gone by the shore
  const sheens = SEAS.map((sea) => {
    const v = V.n;
    const x0 = sea.shoreX + sea.dir * 3; const x1 = sea.shoreX + sea.dir * 54;
    const A = [x0, 0.075, 4]; const B = [x1, 0.075, 4]; const C = [x1, 0.075, -66]; const D = [x0, 0.075, -66]; const M = [(x0 + x1) / 2, 0.075, -42];
    V.tri(A, B, M); V.tri(B, C, M); V.tri(C, D, M); V.tri(D, A, M);
    for (let q = 0; q < 4; q++) { V.setCol(v + q * 3, 0, 0, 0); V.setCol(v + q * 3 + 1, 0, 0, 0); V.setCol(v + q * 3 + 2, 0.3, 0.18, 0.06); }
    return { v };
  });
  // lantern halos (camera-facing quads), one for each of the boats' lanterns
  const boatsMesh = scene?.getObjectByName?.('lighthouse:boats') ?? null;
  const lanterns = [];
  if (boatsMesh) boatsMesh.userData.boats.forEach((b, bi) => b.lanterns.forEach((l, li) => { const v = V.n; for (let q = 0; q < HALO_FAN; q++) V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]); lanterns.push({ v, bi, p: l, size: li ? 0.7 : 1.1, ph: TAU * h01(bi, li, 931) }); }));
  // the beam's glow on the clouds: a camera-facing fan of 8 triangles at the beam's far end
  const SKYFAN = 8;
  const skyV = V.n;
  for (let i = 0; i < SKYFAN; i++) V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(V.pos, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute('color', new THREE.BufferAttribute(V.col, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setDrawRange(0, V.n);
  const fMesh = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); // (unfogged: an additive black would fog up to the sky's colour)
  fMesh.name = 'lighthouse:seafx';
  fMesh.frustumCulled = false;
  fMesh.renderOrder = 4; // after the seas, so the water does not cut the foam and the sheen
  fMesh.castShadow = false; fMesh.receiveShadow = false;
  fMesh.userData.noMerge = true; fMesh.userData.noCast = true;
  objs.push(fMesh);
  for (const o of objs) scene?.add(o);

  const pos = V.pos; const col = V.col;
  const put = (v, i, p) => { pos[(v + i) * 3] = p[0]; pos[(v + i) * 3 + 1] = p[1]; pos[(v + i) * 3 + 2] = p[2]; };
  const quad = (v, a, b, c, d) => { put(v, 0, a); put(v, 1, b); put(v, 2, c); put(v, 3, c); put(v, 4, b); put(v, 5, d); };
  const tint = (v, n, c, k) => { for (let i = 0; i < n; i++) { col[(v + i) * 3] = c.r * k; col[(v + i) * 3 + 1] = c.g * k; col[(v + i) * 3 + 2] = c.b * k; } };

  const right = new THREE.Vector3(); const up = new THREE.Vector3();
  const base = boatsMesh ? boatsMesh.userData.base : null;
  const baseN = boatsMesh ? boatsMesh.userData.baseN : null;
  // sinusoidal rocking of each boat about its own centre
  function rockBoats(t) {
    if (!boatsMesh) return [];
    const bp = boatsMesh.geometry.attributes.position.array; const bn = boatsMesh.geometry.attributes.normal.array;
    const out = [];
    boatsMesh.userData.boats.forEach((b, bi) => {
      const ph = bi * 2.1;
      const dy = still ? 0 : 0.05 * Math.sin(t * 1.05 + ph) + 0.02 * Math.sin(t * 1.9 + ph * 3);
      const roll = still ? 0 : 0.05 * Math.sin(t * 0.9 + ph + 1);
      const pitch = still ? 0 : 0.03 * Math.sin(t * 0.75 + ph * 2);
      // roll about the boat's long axis (its local x, turned by yaw), pitch about its local z
      const ca = Math.cos(b.yaw); const sa = Math.sin(b.yaw);
      const cr = Math.cos(roll); const sr = Math.sin(roll); const cp = Math.cos(pitch); const sp2 = Math.sin(pitch);
      const rot = (x, y, z) => {
        // into the boat's frame (rotateY(yaw): world x = lx*c + lz*s, world z = -lx*s + lz*c)
        let lx = x * ca - z * sa; let lz = x * sa + z * ca; let ly = y;
        const y1 = ly * cr - lz * sr; const z1 = ly * sr + lz * cr; ly = y1; lz = z1; // roll about local x
        const x2 = lx * cp - ly * sp2; const y2 = lx * sp2 + ly * cp; lx = x2; ly = y2; // pitch about local z
        return [lx * ca + lz * sa, ly, -lx * sa + lz * ca];
      };
      for (let i = b.start; i < b.start + b.count; i++) {
        const [x, y, z] = rot(base[i * 3] - b.cx, base[i * 3 + 1] - 0.1, base[i * 3 + 2] - b.cz);
        bp[i * 3] = b.cx + x; bp[i * 3 + 1] = 0.1 + y + dy; bp[i * 3 + 2] = b.cz + z;
        const [nx, ny, nz] = rot(baseN[i * 3], baseN[i * 3 + 1], baseN[i * 3 + 2]);
        bn[i * 3] = nx; bn[i * 3 + 1] = ny; bn[i * 3 + 2] = nz;
      }
      out.push({ dy, roll, pitch, rot });
    });
    boatsMesh.geometry.attributes.position.needsUpdate = true;
    boatsMesh.geometry.attributes.normal.needsUpdate = true;
    return out;
  }

  let lastRock = -1;
  function update(t, camera, beamA, glowK) {
    // gulls
    placeGulls(t);
    // foam: rows slide to the shore, swell then thin out; broken by each piece's own length and wobble
    for (const f of foam) {
      const sea = f.sea;
      const s = (still ? f.row / foamRows : ((t / FOAM_PERIOD) + f.row / foamRows) % 1);
      const x = sea.shoreX + sea.dir * (FOAM_REACH * (1 - s) ** 1.4 + 0.6);
      const fade = Math.sin(Math.PI * Math.min(1, s * 1.05)) ** 0.7;
      const w = 0.22 + 0.28 * s;
      const wob = Math.sin(t * 0.8 * (still ? 0 : 1) + f.wob * TAU) * 0.35;
      const skip = NEAR_ROCKS(x, (f.z0 + f.z1) / 2);
      const bright = skip ? 0 : fade * (0.35 + 0.5 * f.amp) * 0.8;
      const a = [x + wob, 0.1, f.z0]; const b = [x + wob + sea.dir * 0.3, 0.1, f.z1];
      quad(f.v, [a[0], 0.1, a[2]], [a[0] + sea.dir * w, 0.1, a[2]], [b[0], 0.1, b[2]], [b[0] + sea.dir * w, 0.1, b[2]]);
      tint(f.v, 6, FOAM, bright);
    }
    // glints: each a flat diamond that flares and fades
    for (const g of glints) {
      const k = still ? 0.35 : Math.max(0, Math.sin(t * g.rate + g.ph)) ** 3;
      const r = g.r * (0.55 + 0.6 * k);
      quad(g.v, [g.x - r, 0.095, g.z], [g.x, 0.095, g.z - r * 0.4], [g.x, 0.095, g.z + r * 0.4], [g.x + r, 0.095, g.z]);
      tint(g.v, 6, GOLD, 0.2 + 0.9 * k);
    }
    // sheens breathe
    for (const sh of sheens) {
      const k = 0.85 + (still ? 0 : 0.15 * Math.sin(t * 0.4 + sh.v));
      for (let q = 0; q < 4; q++) V.setCol(sh.v + q * 3 + 2, 0.3 * k, 0.18 * k, 0.06 * k);
    }
    // the boats and their lanterns' halos (facing the camera, flickering)
    const rocks = rockBoats(t);
    lastRock = t;
    if (camera) { right.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0).applyQuaternion(camera.quaternion); }
    else { right.set(1, 0, 0); up.set(0, 1, 0); }
    for (const l of lanterns) {
      const b = boatsMesh.userData.boats[l.bi]; const rk = rocks[l.bi];
      const [px, py, pz] = rk.rot(l.p[0] - b.cx, l.p[1] - 0.1, l.p[2] - b.cz);
      const cx = b.cx + px; const cy = 0.1 + py + rk.dy; const cz = b.cz + pz;
      const flick = still ? 0.8 : 0.75 + 0.14 * Math.sin(t * 7.3 + l.ph) + 0.1 * Math.sin(t * 12.9 + l.ph * 2) + 0.06 * Math.sin(t * 3.1 + l.ph * 3);
      const sz = l.size * (0.85 + 0.2 * flick);
      for (let q = 0; q < HALO_FAN; q++) {
        const v = l.v + q * 3; const a0 = (q / HALO_FAN) * TAU; const a1 = ((q + 1) / HALO_FAN) * TAU;
        const rim = (a) => [cx + (right.x * Math.cos(a) + up.x * Math.sin(a)) * sz, cy + (right.y * Math.cos(a) + up.y * Math.sin(a)) * sz, cz + (right.z * Math.cos(a) + up.z * Math.sin(a)) * sz];
        put(v, 0, [cx, cy, cz]); put(v, 1, rim(a0)); put(v, 2, rim(a1));
        tint(v, 1, WARM, 0.55 * flick); tint(v + 1, 2, WARM, 0);
      }
    }
    // the beam's glow on the clouds (only while the lamp is lit)
    const on = glowK > 0 && camera;
    for (let i = 0; i < SKYFAN; i++) {
      const v = skyV + i * 3;
      if (!on) { tint(v, 3, GOLD, 0); continue; }
      const a0 = (i / SKYFAN) * TAU; const a1 = ((i + 1) / SKYFAN) * TAU;
      const cx = P.TOWER.x + 70 * Math.cos(beamA); const cz = P.TOWER.z + 70 * Math.sin(beamA); const cyy = 26;
      const R = 24;
      const rim = (a) => [cx + (right.x * Math.cos(a) + up.x * Math.sin(a) * 0.7) * R, cyy + (right.y * Math.cos(a) + up.y * Math.sin(a) * 0.7) * R, cz + (right.z * Math.cos(a) + up.z * Math.sin(a) * 0.7) * R];
      put(v, 0, [cx, cyy, cz]); put(v, 1, rim(a0)); put(v, 2, rim(a1));
      tint(v, 1, GOLD, 0.34 * glowK); tint(v + 1, 2, GOLD, 0);
    }
    fGeo.attributes.position.needsUpdate = true;
    fGeo.attributes.color.needsUpdate = true;
    void lastRock;
  }

  update(0, null, 0, 0);
  return {
    update(dt, t, camera, beamA, glowK) { update(still ? 0 : t, camera, beamA, glowK); },
    dispose() {
      for (const o of objs) { scene?.remove(o); o.geometry.dispose(); o.material.dispose(); }
      if (boatsMesh && base) { boatsMesh.geometry.attributes.position.array.set(base); boatsMesh.geometry.attributes.normal.array.set(baseN); boatsMesh.geometry.attributes.position.needsUpdate = true; boatsMesh.geometry.attributes.normal.needsUpdate = true; }
    },
    get gulls() { return gulls; },
    objects: objs,
  };
}
