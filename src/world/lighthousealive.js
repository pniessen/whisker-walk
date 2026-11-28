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
// PASS THREE (2026-11-28), THE PLACE REACTS TO HER AND LIVES: she is now handed in (catPos). Where she wades a pool or the
// sea's edge, rings of foam spread from her paws (RINGS, additive, in the sea fx mesh); the paws she brings out of the
// water leave dark wet prints on the dry sand that fade (a small normal-blended mesh of their own, 'lighthouse:wetprints',
// which also holds the tide's wet band along each beach); the circling gulls climb, spread and beat harder when she runs
// under them, then settle; the moored boats bob more as she nears the quay. It lives by itself too: a slow tide (the foam
// lines, the wet band and its edge rise and fall together), a few drifting banks of low mist, and a far ship's lights that
// cross the east horizon now and then (silent: the lamp's own ship horn, lighthouselife.js, stays the walk's one horn). Her rings, prints, the tide and the ship stand still in reduced motion; the LOW tier
// has fewer rings and prints and no mist or ship. Every number is from hash01 or a constant; the only state is the walk's t.
//
// REDUCED MOTION freezes all of it (the gulls hang in their first positions, the foam lies still, the boats sit level, the
// lanterns burn steady). The LOW tier draws fewer gulls and foam rows, and no twinkle. Nothing here is a collider, a
// perch or a light, and it never touches the walk's save.
// =============================================================================

import * as THREE from 'three';
import { hash01 } from './builder.js';
import * as P from './lighthouseplan.js';
import { wonderFor, drawWonder, WONDER_TRIS, STRIKES, THUNDER_LAG } from './lighthousewonders.js';
import { getSeason } from './lighthouseseason.js';
import { createCritters, CRIT_TRIS, CRIT_TRIS_LOW, doorGlow, DOOR } from './lighthousecritters.js';

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
export const RINGS_HIGH = 4;
export const RINGS_LOW = 2;
const RING_SEG = 10;
const RING_LIFE = 1.4; // s
const RING_R = 1.7; // m the outer edge reaches
const PRINTS_HIGH = 8;
const PRINTS_LOW = 4;
const PRINT_LIFE = 7; // s a wet print takes to dry
const WET_TRAVEL = 7; // m she walks on dry sand before her paws are dry
const TIDE_PERIOD = 96; // s
const TIDE_RANGE = 1.1; // m the foam and the wet line move
const MISTS = 3;
const SHIP_PERIOD = 190; // s: the far ship is on the horizon for SHIP_SPAN of it
const SHIP_SPAN = 110;
const SHIP_Z = -44;
const SCARE_R = 24; // m: gulls this near (over the ground) are put up by her running
const RUN_SPEED = 2.6; // m/s
const QUAY_R = 17; // m from a moored boat her nearness stirs it
const clamp01 = (v) => Math.min(1, Math.max(0, v));
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
      phase: h01(i, 5, 901) * TAU, flap: TAU * (1.3 + 0.5 * h01(i, 6, 901)), fphase: h01(i, 7, 901) * TAU, bob: 0.6 + 1.2 * h01(i, 8, 901), scare: 0,
    });
  }
  return gulls;
}

// four triangles a gull: a diamond body (two triangles) and a wing each side (one triangle); 12 vertices
function writeGull(pos, o, g, t, still) {
  const a = g.phase + g.w * (still ? 0 : t);
  const sc = still ? 0 : g.scare;
  const rr = g.r * (1 + 0.35 * sc);
  const x = g.cx + Math.cos(a) * rr;
  const z = g.cz + Math.sin(a) * rr;
  const y = g.y + (still ? 0 : Math.sin(t * 0.5 + g.fphase) * g.bob) + 3.2 * sc;
  const dirx = -Math.sin(a) * Math.sign(g.w); const dirz = Math.cos(a) * Math.sign(g.w);
  // local frame: forward f, right s; a flap lifts and drops the tips; in a glide the wings sit a little up
  const f = [dirx, dirz]; const s = [-dirz, dirx];
  const beat = still ? 0.15 : sc > 0.15 ? Math.sin(t * g.flap * 1.7 + g.fphase) : (Math.sin(t * g.flap + g.fphase) > -0.2 && Math.sin(t * 0.37 + g.fphase * 2) > -0.3 ? Math.sin(t * g.flap + g.fphase) : 0.25);
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
const MISTC = new THREE.Color(0xe8d8c8);
const SHIPW = new THREE.Color(0xfff2c8);
const SHIPR = new THREE.Color(0xff5a40);
const NEAR_ROCKS = (x, z) => {
  const r = (R, k) => Math.hypot(x - R.x, z - R.z) < R.r * k;
  return r(P.GULL_ROCK, 2.2) || r(P.PINNACLE, 2.2);
};

export function createLighthouseAlive({ scene, reducedMotion = false, tier = null, sound = null, seed = null, wonder = null, tone = null, night = 0 } = {}) {
  const low = tier?.name === 'low';
  const TN = tone && tone.length === 3 ? tone : [1, 1, 1]; // the hour's colour (lighthouseday.js): the glints, sheen and lanterns follow the same clock as the sky
  const glintCol = new THREE.Color(GOLD.r * TN[0], GOLD.g * TN[1], GOLD.b * TN[2]);
  const still = !!reducedMotion;
  const critters = createCritters({ low, still });
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
  const nRings = low ? RINGS_LOW : RINGS_HIGH;
  const nMist = low ? 0 : MISTS;
  const nWonder = low || still ? 0 : WONDER_TRIS;
  const maxV = nWonder * 3 + SEAS.length * (foamRows * FOAM_SEG * 6 + glintN * 6 + 12) + 4 * HALO_FAN * 3 + 12 * 3 + 24 * 3 + nRings * RING_SEG * 6 + nMist * 18 + 12 + 6;
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
    for (let q = 0; q < 4; q++) { V.setCol(v + q * 3, 0, 0, 0); V.setCol(v + q * 3 + 1, 0, 0, 0); V.setCol(v + q * 3 + 2, 0.3 * TN[0], 0.18 * TN[1], 0.06 * TN[2]); }
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
  // pass three: her rings in the shallows (RING_SEG quads each), the drifting mist (a 6-triangle fan each) and the far ship's two lights (4 triangles)
  const rings = [];
  const mists = [];
  for (let i = 0; i < nMist; i++) {
    const v = V.n; for (let q = 0; q < 6; q++) V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
    const east = i % 2 === 0;
    mists.push({ v, east, x: east ? 46 + 22 * h01(i, 1, 951) : -48 - 22 * h01(i, 1, 951), z0: -34 + 70 * h01(i, 2, 951), speed: 0.35 + 0.3 * h01(i, 3, 951), w: 11 + 7 * h01(i, 4, 951), ph: TAU * h01(i, 5, 951) });
  }
  const shipV = nMist ? V.n : -1;
  if (nMist) for (let q = 0; q < 4; q++) V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
  // pass five: the tail's packed part. Her rings and the tower door's glow are written one after another from here each frame, only the ones in
  // use, and the draw range ends after the last (a ring that has faded, or a door she is far from, costs no triangles)
  const dynV = V.n;
  for (let i = 0; i < nRings; i++) { rings.push({ v: dynV, age: RING_LIFE, x: 0, z: 0, y: 0.1 }); for (let q = 0; q < RING_SEG * 2; q++) V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]); }
  const doorV = V.n;
  V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]); V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
  // pass four: the pool the rare surprise (lighthousewonders.js) draws in; it is at the tail, and out of the draw range while nothing plays
  const wonderV = V.n;
  for (let i = 0; i < nWonder; i++) V.tri([0, 0, 0], [0, 0, 0], [0, 0, 0]);
  const moment = nWonder ? wonderFor({ seed, season: getSeason(), force: wonder }) : null;
  const thundered = new Set();
  let momentOn = false;
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(V.pos, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setAttribute('color', new THREE.BufferAttribute(V.col, 3).setUsage(THREE.DynamicDrawUsage));
  fGeo.setDrawRange(0, dynV);
  const fMesh = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); // (unfogged: an additive black would fog up to the sky's colour)
  fMesh.name = 'lighthouse:seafx';
  fMesh.frustumCulled = false;
  fMesh.renderOrder = 4; // after the seas, so the water does not cut the foam and the sheen
  fMesh.castShadow = false; fMesh.receiveShadow = false;
  fMesh.userData.noMerge = true; fMesh.userData.noCast = true;
  objs.push(fMesh);
  // the wet mesh: dark, alpha-blended (an additive mesh can only lighten): her wet prints and each beach's wet band, which the tide moves
  const nPrints = low ? PRINTS_LOW : PRINTS_HIGH;
  const critTris = low ? CRIT_TRIS_LOW : CRIT_TRIS;
  const wetN = (nPrints * 4 + SEAS.length * 2 + critTris) * 3; // (the band first; then, packed each frame, only the prints in use and the little lives)
  const wPos = new Float32Array(wetN * 3); const wCol = new Float32Array(wetN * 4);
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3).setUsage(THREE.DynamicDrawUsage));
  wGeo.setAttribute('color', new THREE.BufferAttribute(wCol, 4).setUsage(THREE.DynamicDrawUsage));
  const wMesh = new THREE.Mesh(wGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  wMesh.name = 'lighthouse:wetprints';
  wMesh.frustumCulled = false;
  wMesh.renderOrder = 3;
  wMesh.castShadow = false; wMesh.receiveShadow = false;
  wMesh.userData.noMerge = true; wMesh.userData.noCast = true;
  objs.push(wMesh);
  const prints = []; for (let i = 0; i < nPrints; i++) prints.push({ v: 0, born: -99, x: 0, z: 0, y: 0, yaw: 0, a: 0 });
  const bandV = 0;
  const wetDyn = SEAS.length * 6;
  wGeo.setDrawRange(0, wetDyn);
  for (const o of objs) scene?.add(o);

  const pos = V.pos; const col = V.col;
  const put = (v, i, p) => { pos[(v + i) * 3] = p[0]; pos[(v + i) * 3 + 1] = p[1]; pos[(v + i) * 3 + 2] = p[2]; };
  const quad = (v, a, b, c, d) => { put(v, 0, a); put(v, 1, b); put(v, 2, c); put(v, 3, c); put(v, 4, b); put(v, 5, d); };
  const tint = (v, n, c, k) => { for (let i = 0; i < n; i++) { col[(v + i) * 3] = c.r * k; col[(v + i) * 3 + 1] = c.g * k; col[(v + i) * 3 + 2] = c.b * k; } };

  const right = new THREE.Vector3(); const up = new THREE.Vector3();
  const base = boatsMesh ? boatsMesh.userData.base : null;
  const baseN = boatsMesh ? boatsMesh.userData.baseN : null;
  let stir = 0; // 0..1: how near she is to the moored boats
  // sinusoidal rocking of each boat about its own centre
  function rockBoats(t) {
    if (!boatsMesh) return [];
    const bp = boatsMesh.geometry.attributes.position.array; const bn = boatsMesh.geometry.attributes.normal.array;
    const out = [];
    boatsMesh.userData.boats.forEach((b, bi) => {
      const ph = bi * 2.1;
      const k = 1 + 2.2 * stir; // she nears the quay: the boats ride livelier
      const dy = still ? 0 : k * (0.05 * Math.sin(t * 1.05 + ph) + 0.02 * Math.sin(t * 1.9 + ph * 3));
      const roll = still ? 0 : k * 0.05 * Math.sin(t * 0.9 + ph + 1);
      const pitch = still ? 0 : k * 0.03 * Math.sin(t * 0.75 + ph * 2);
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
  let lastPrints = 0;
  // ---- pass three: what she sets off, and what goes on without her ----
  const cat = { x: 0, z: 0, set: false, speed: 0 };
  const st = { wet: 0, travel: 0, sinceRing: 0, sinceStamp: 0, side: 1, surfBeat: -1, gullCalled: -99, since: 0, arrivedGull: false, arrivedSurf: false };
  let tide = 0;
  const flatRight = new THREE.Vector3();
  const inWaterAt = (p) => Math.abs(p.y) < 0.8 && (P.POOLS.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < q.r + 0.1) || p.x > P.SEA_EAST.minX - 0.4 || p.x < P.SEA_WEST.maxX + 0.4);
  const oldest = (list, key) => list.reduce((b, q) => (q[key] < b[key] ? q : b), list[0]);
  function react(dt, t, catPos) {
    if (catPos && still) { cat.x = catPos.x; cat.z = catPos.z; cat.set = true; } // (the door's glow and the little lives still know where she is)
    if (!catPos || still || !(dt > 0)) { if (!catPos) cat.set = false; return; }
    const moved = cat.set ? Math.hypot(catPos.x - cat.x, catPos.z - cat.z) : 0;
    const dx = catPos.x - cat.x; const dz = catPos.z - cat.z;
    cat.speed += (moved / dt - cat.speed) * clamp01(dt * 8);
    cat.x = catPos.x; cat.z = catPos.z; cat.set = true;
    // the arrival: a gull's call, then a wash of surf, a moment after she lands (once a walk)
    st.since += dt;
    if (sound?.ambient && !st.arrivedGull && st.since > 0.9) { st.arrivedGull = true; sound?.gull?.(); }
    if (sound?.ambient && !st.arrivedSurf && st.since > 2.4) { st.arrivedSurf = true; sound?.surf?.(0.9); }
    if (moved > 3) return; // a jump (a teleport, a respawn), not a step
    const inWater = inWaterAt(catPos);
    if (inWater) { st.wet = 1; st.travel = 0; } else if (st.wet > 0) { st.travel += moved; if (st.travel > WET_TRAVEL) st.wet = 0; }
    // rings spread from her paws as she wades
    if (inWater && moved > 0) {
      st.sinceRing += moved;
      if (st.sinceRing > 0.5) { st.sinceRing = 0; const r = oldest(rings, 'age'); r.age = 0; r.x = catPos.x; r.z = catPos.z; }
    }
    // wet prints on the dry sand
    if (!inWater && st.wet > 0 && moved > 0 && Math.abs(catPos.y) < 0.8) {
      st.sinceStamp += moved;
      if (st.sinceStamp > 0.5) {
        st.sinceStamp = 0; st.side = -st.side;
        const p = oldest(prints, 'born');
        const yaw = Math.atan2(dx, dz); const sx = Math.cos(yaw); const sz = -Math.sin(yaw);
        p.born = t; p.yaw = yaw; p.x = catPos.x + sx * 0.12 * st.side; p.z = catPos.z + sz * 0.12 * st.side; p.y = Math.max(0.07, catPos.y + 0.04); p.a = 0.1 + 0.34 * (1 - st.travel / WET_TRAVEL);
      }
    }
    // the gulls overhead are put up by her running
    const was = gulls.some((g) => g.scare > 0.5);
    const runs = cat.speed > RUN_SPEED;
    for (const g of gulls) {
      const a = g.phase + g.w * t;
      const near = Math.hypot(g.cx + Math.cos(a) * g.r - catPos.x, g.cz + Math.sin(a) * g.r - catPos.z) < SCARE_R;
      if (runs && near) g.scare = Math.min(1, g.scare + dt * 3); else g.scare = Math.max(0, g.scare - dt / 6);
    }
    if (!was && gulls.some((g) => g.scare > 0.5) && t - st.gullCalled > 9) { st.gullCalled = t; sound?.gull?.(); }
    // the boats stir as she nears the quay
    let near = 0;
    if (boatsMesh) for (const b of boatsMesh.userData.boats) near = Math.max(near, clamp01(1 - Math.hypot(catPos.x - b.cx, catPos.z - b.cz) / QUAY_R));
    stir += (near - stir) * clamp01(dt * 0.9);
    // the surf's rhythm follows the foam's: a swell as the first row lands, soft when she is far from either shore
    const beat = Math.floor(t / FOAM_PERIOD);
    if (st.surfBeat < 0) st.surfBeat = beat;
    else if (beat !== st.surfBeat) {
      st.surfBeat = beat;
      const d = Math.min(P.SEA_EAST.minX - catPos.x, catPos.x - P.SEA_WEST.maxX);
      const k = clamp01(1 - Math.max(0, d) / 46);
      if (k > 0.05) sound?.surf?.(k);
    }
  }

  function update(t, dt, camera, beamA, glowK, catPos) {
    react(dt, t, catPos);
    tide = still ? 0 : Math.sin((t * TAU) / TIDE_PERIOD);
    // gulls
    placeGulls(t);
    // foam: rows slide to the shore, swell then thin out; broken by each piece's own length and wobble
    for (const f of foam) {
      const sea = f.sea;
      const s = (still ? f.row / foamRows : ((t / FOAM_PERIOD) + f.row / foamRows) % 1);
      const x = sea.shoreX - sea.dir * tide * TIDE_RANGE * 0.7 + sea.dir * (FOAM_REACH * (1 - s) ** 1.4 + 0.6);
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
      tint(g.v, 6, glintCol, 0.2 + 0.9 * k);
    }
    // sheens breathe
    for (const sh of sheens) {
      const k = 0.85 + (still ? 0 : 0.15 * Math.sin(t * 0.4 + sh.v));
      for (let q = 0; q < 4; q++) V.setCol(sh.v + q * 3 + 2, 0.3 * k * TN[0], 0.18 * k * TN[1], 0.06 * k * TN[2]);
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
        tint(v, 1, WARM, 0.55 * flick * (1 + 0.6 * night)); tint(v + 1, 2, WARM, 0); // (the lanterns burn brighter as the night comes on)
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
    // her rings: a flat annulus that widens and thins (only the live ones are written, one after another from the packed tail's start)
    let dyn = dynV;
    for (const r of rings) {
      if (!still) r.age = Math.min(RING_LIFE, r.age + (dt > 0 ? dt : 0));
      const k = r.age / RING_LIFE;
      if (!(k < 1)) continue;
      r.v = dyn; dyn += RING_SEG * 6;
      const r1 = 0.25 + RING_R * Math.sqrt(k); const r0 = Math.max(0.05, r1 - 0.12 - 0.16 * k);
      const br = (1 - k) ** 1.3 * 0.75;
      for (let q = 0; q < RING_SEG; q++) {
        const a0 = (q / RING_SEG) * TAU; const a1 = ((q + 1) / RING_SEG) * TAU;
        const pt = (a, rr) => [r.x + Math.cos(a) * rr, 0.1, r.z + Math.sin(a) * rr];
        const v = r.v + q * 6;
        quad(v, pt(a0, r0), pt(a0, r1), pt(a1, r0), pt(a1, r1));
        tint(v, 6, FOAM, br);
        for (const i of [0, 2, 3]) tint(v + i, 1, FOAM, br * 0.12); // (the inner edge feathers out)
      }
    }
    // the tower door's warm glow as she nears it (a camera-facing quad over the doorway, lightening only)
    const dk = camera && !low ? doorGlow(cat) : 0;
    if (dk > 0) {
      const w = 0.78; const h0 = DOOR.y - 1.05; const h1 = DOOR.y + 1.05; const ox = DOOR.x + DOOR.nx * 0.32; const oz = DOOR.z + DOOR.nz * 0.32;
      const tx = -DOOR.nz * w; const tz = DOOR.nx * w;
      quad(dyn, [ox - tx, h0, oz - tz], [ox + tx, h0, oz + tz], [ox - tx, h1, oz - tz], [ox + tx, h1, oz + tz]);
      const flick = still ? 1 : 0.9 + 0.1 * Math.sin(t * 2.1) + 0.05 * Math.sin(t * 6.7);
      tint(dyn, 6, WARM, dk * 0.4 * flick * (1 + 0.5 * night));
      dyn += 6;
    }
    const dynUsed = dyn;
    // low mist banks drifting over the seas (horizontal billboards, lightening only)
    if (nMist) {
      if (camera) flatRight.set(1, 0, 0).applyQuaternion(camera.quaternion); else flatRight.set(1, 0, 0);
      flatRight.y = 0; flatRight.normalize();
      for (const m of mists) {
        const zz = ((m.z0 + (still ? 0 : t) * m.speed + 50) % 100 + 100) % 100 - 50;
        const fade = Math.sin(Math.PI * (zz + 50) / 100) ** 0.8;
        const cx = m.x + 2.5 * Math.sin((still ? 0 : t) * 0.07 + m.ph); const cyy = 1.3 + 0.2 * Math.sin((still ? 0 : t) * 0.11 + m.ph);
        const W = m.w;
        const MIST = 0.8;
        for (let q = 0; q < 6; q++) {
          const a0 = (q / 6) * TAU; const a1 = ((q + 1) / 6) * TAU;
          const rim = (a) => [cx + flatRight.x * Math.cos(a) * W, cyy + Math.sin(a) * 2.6, zz + flatRight.z * Math.cos(a) * W];
          put(m.v + q * 3, 0, [cx, cyy, zz]); put(m.v + q * 3, 1, rim(a0)); put(m.v + q * 3, 2, rim(a1));
          tint(m.v + q * 3, 1, MISTC, MIST * fade); tint(m.v + q * 3 + 1, 2, MISTC, 0);
        }
      }
      // a far ship's lights crossing the east horizon now and then (a white masthead and a red side-light); it is quiet in stillness
      const ph = (t + 20) % SHIP_PERIOD;
      const on = !still && ph < SHIP_SPAN;
      const k = ph / SHIP_SPAN;
      const sx = 104 - 54 * k; const fade = on ? Math.sin(Math.PI * k) ** 0.5 : 0;
      const dia = (v, cx0, cy0, cz0, r) => { put(v, 0, [cx0 - r * flatRight.x, cy0, cz0 - r * flatRight.z]); put(v, 1, [cx0, cy0 + r, cz0]); put(v, 2, [cx0 + r * flatRight.x, cy0, cz0 + r * flatRight.z]); };
      dia(shipV, sx, 1.4, SHIP_Z, 0.7); tint(shipV, 3, SHIPW, 0.9 * fade);
      put(shipV + 3, 0, [sx - 0.2 * flatRight.x, 0.8, SHIP_Z]); put(shipV + 3, 1, [sx + 1.6 * flatRight.x, 1.4, SHIP_Z]); put(shipV + 3, 2, [sx + 1.6 * flatRight.x, 0.5, SHIP_Z]);
      tint(shipV + 3, 3, SHIPR, 0.8 * fade);
    }
    // the rare surprise, in the pool at the tail
    const lt = moment && camera ? t - moment.at : -1;
    const playing = lt >= 0 && lt < moment.dur;
    if (playing) {
      let wi = 0;
      const wv = { cam: [camera.position.x, camera.position.y, camera.position.z], right: [right.x, right.y, right.z], up: [up.x, up.y, up.z], fwd: [0, 0, -1] };
      const fw = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); wv.fwd = [fw.x, fw.y, fw.z];
      for (let i = wonderV; i < wonderV + nWonder * 3; i++) { col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0; }
      drawWonder(moment.kind, lt / moment.dur, lt, wv, (a, b, c, ca, cb, cc) => {
        if (wi >= nWonder) return false;
        const v = wonderV + wi * 3; wi++;
        put(v, 0, a); put(v, 1, b); put(v, 2, c);
        V.setCol(v, ca[0], ca[1], ca[2]); V.setCol(v + 1, cb[0], cb[1], cb[2]); V.setCol(v + 2, cc[0], cc[1], cc[2]);
        return true;
      });
      for (let i = wi; i < nWonder; i++) { const v = wonderV + i * 3; for (let q = 0; q < 3; q++) put(v, q, [0, 0, 0]); }
      if (moment.kind === 'lightning') STRIKES.forEach((s, k) => { if (lt >= s + THUNDER_LAG && !thundered.has(k)) { thundered.add(k); sound?.surf?.(0.5 + 0.2 * k); } });
    }
    if (playing) for (let i = dynUsed; i < wonderV; i++) { put(i, 0, [0, 0, 0]); col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0; } // (the unused packed slots, drawn while the surprise plays, are empty)
    momentOn = playing;
    fGeo.setDrawRange(0, playing ? V.n : dynUsed);
    fGeo.attributes.position.needsUpdate = true;
    fGeo.attributes.color.needsUpdate = true;
    // the wet mesh: prints, and each beach's wet line that the tide moves
    const wp = wPos; const wc = wCol;
    const wput = (i, x, y, z, a) => { wp[i * 3] = x; wp[i * 3 + 1] = y; wp[i * 3 + 2] = z; wc[i * 4] = 0.12; wc[i * 4 + 1] = 0.08; wc[i * 4 + 2] = 0.05; wc[i * 4 + 3] = a; };
    let wn = wetDyn;
    for (const pr of prints) {
      const age = t - pr.born; const a = !still && age >= 0 && age < PRINT_LIFE ? Math.min(0.75, pr.a * 1.5) * (1 - age / PRINT_LIFE) ** 0.8 : 0;
      if (!(a > 0)) continue;
      pr.v = wn; wn += 12;
      const c = Math.cos(pr.yaw); const sn = Math.sin(pr.yaw);
      const at = (u, w) => [pr.x + (w * c + u * sn), pr.y, pr.z + (-w * sn + u * c)]; // u forward, w right
      const tri = (i, A, B, C) => { for (const [j, pt] of [A, B, C].entries()) wput(pr.v + i * 3 + j, pt[0], pt[1], pt[2], a); };
      tri(0, at(-0.24, 0), at(0.05, -0.17), at(0.05, 0.17)); // the pad
      tri(1, at(0.34, -0.17), at(0.1, -0.27), at(0.1, -0.07)); // three toes
      tri(2, at(0.42, 0), at(0.17, -0.1), at(0.17, 0.1));
      tri(3, at(0.34, 0.17), at(0.1, 0.07), at(0.1, 0.27));
    }
    lastPrints = wn - wetDyn;
    // the little lives (lighthousecritters.js), after the prints: crabs, sandpipers, seals' heads, the cormorant, the jellyfish
    {
      const lim = wetN;
      flatRight.set(1, 0, 0); if (camera) flatRight.applyQuaternion(camera.quaternion);
      flatRight.y = 0; if (flatRight.lengthSq() < 1e-6) flatRight.set(1, 0, 0); flatRight.normalize();
      critters.update(t, dt, cat, [flatRight.x, flatRight.z], (A, B, C, ca, cb, cc) => {
        if (wn + 3 > lim) return false;
        for (const [j, pt, col4] of [[0, A, ca], [1, B, cb], [2, C, cc]]) { const i = wn + j; wp[i * 3] = pt[0]; wp[i * 3 + 1] = pt[1]; wp[i * 3 + 2] = pt[2]; wc[i * 4] = col4[0]; wc[i * 4 + 1] = col4[1]; wc[i * 4 + 2] = col4[2]; wc[i * 4 + 3] = col4[3]; }
        wn += 3;
        return true;
      });
    }
    wGeo.setDrawRange(0, wn);
    SEAS.forEach((sea, i) => {
      const edge = sea.dir > 0 ? P.SEA_EAST.minX : P.SEA_WEST.maxX;
      const inland = edge - sea.dir * (3.6 + 1.5 * tide);
      const out = edge + sea.dir * 1.2;
      const base = bandV + i * 6;
      const a0 = 0; const a1 = 0.5;
      const Z0 = -60; const Z1 = 60;
      wput(base, inland, 0.075, Z0, a0); wput(base + 1, out, 0.075, Z0, a1); wput(base + 2, inland, 0.075, Z1, a0);
      wput(base + 3, inland, 0.075, Z1, a0); wput(base + 4, out, 0.075, Z0, a1); wput(base + 5, out, 0.075, Z1, a1);
    });
    wGeo.attributes.position.needsUpdate = true;
    wGeo.attributes.color.needsUpdate = true;
    void lastRock;
  }

  update(0, 0, null, 0, 0, null);
  return {
    update(dt, t, camera, beamA, glowK, catPos = null) { update(still ? 0 : t, dt, camera, beamA, glowK, catPos); },
    dispose() {
      for (const o of objs) { scene?.remove(o); o.geometry.dispose(); o.material.dispose(); }
      if (boatsMesh && base) { boatsMesh.geometry.attributes.position.array.set(base); boatsMesh.geometry.attributes.normal.array.set(baseN); boatsMesh.geometry.attributes.position.needsUpdate = true; boatsMesh.geometry.attributes.normal.needsUpdate = true; }
    },
    get gulls() { return gulls; },
    get printVerts() { return lastPrints; },
    get creatureTris() { return (wGeo.drawRange.count - wetDyn - lastPrints) / 3; },
    objects: objs,
  };
}
