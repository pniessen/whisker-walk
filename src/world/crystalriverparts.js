// =============================================================================
// THE CRYSTAL CAVE, WING C: THE RIVER, THE FALLS AND THE BOAT (milestone C1): THE DRAWING. One flat water mesh (the river, the two pools, the channel and the basin,
// 0.04 m over crystalY), the cliff and the fall, two little docks, the boat with its bow lantern (an emissive ball and a soft halo: never a light), the flow's pale dashes,
// the fall's streaks and the spray. Everything is made by the stage's live code, flagged out of the static merge, and uses no random number (seeded streams only).
// Reduced motion freezes the flow, the fall and the bob; LOW keeps half the spray. Imports THREE (already in the cave's own chunk), so this stage costs only its own code.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial } from '../render/materials.js';
import { mulberry32 } from '../rng.js';
import { paint, dotTexture } from './crystalparts.js';
import { crystalY } from './crystalplan.js';
import * as R from './crystalriverplan.js';

export const SPRAY = Object.freeze({ high: 24, low: 12 });
export const STREAKS = 7;
export const DASHES = 16;
const lift = R.WATER_LIFT;
const _c = new THREE.Color();
const _c2 = new THREE.Color();

const flag = (m, name) => {
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  m.frustumCulled = false;
  m.userData.noMerge = true;
  m.userData.noCast = true;
  m.userData.noContactShadow = true;
  return m;
};

// ---- the water ---------------------------------------------------------------------------------------------------------------
// A strip along a line (three vertices across: pale edge, deep middle, pale edge) and a disc (deep middle, pale rim), as indexed geometry with a colour.
const EDGE = 0x78e4e8;
const DEEP = 0x2f9cc4;
function colour(arr, hex) { _c.setHex(hex); arr.push(_c.r, _c.g, _c.b); }
function strip(pts, halfW, y = (x, z) => crystalY(x, z) + lift) {
  const pos = [], col = [], idx = [];
  pts.forEach((p, i) => {
    for (const [k, hex] of [[-1, EDGE], [0, DEEP], [1, EDGE]]) { const x = p.x + p.nx * halfW * k, z = p.z + p.nz * halfW * k; pos.push(x, y(x, z), z); colour(col, hex); }
    if (i) { const a = (i - 1) * 3, b = i * 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
  });
  return { pos, col, idx };
}
function disc(c, r, seg = 18) {
  const pos = [c.x, crystalY(c.x, c.z) + lift, c.z], col = [], idx = [];
  colour(col, DEEP);
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    pos.push(x, crystalY(x, z) + lift, z); colour(col, EDGE);
    idx.push(0, 1 + i, 1 + ((i + 1) % seg));
  }
  return { pos, col, idx };
}
function mergeParts(parts) {
  const geos = parts.map((p) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
    g.setIndex(p.idx);
    return g;
  });
  return mergeGeometries(geos);
}
export function drawWater() {
  const river = R.sampleLine(R.CENTRE, 1.2);
  const last = R.CENTRE[R.CENTRE.length - 1];
  river.push({ ...river[river.length - 1], x: last.x, z: last.z });
  const F = R.FALLS;
  const chan = [];
  for (let x = F.channelX0 - 2; x <= F.basin.x; x += 1.6) chan.push({ x, z: F.z, nx: 0, nz: 1 });
  const geo = mergeParts([strip(river, R.HALF_WIDTH), disc(R.PLUNGE, R.PLUNGE.r), disc(R.STILL, R.STILL.r), strip(chan, F.channelW / 2), disc(F.basin, F.basin.r)]);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const m = flag(new THREE.Mesh(geo, mat), 'cr:water');
  m.renderOrder = 1;
  return m;
}

// ---- the cliff and the fall --------------------------------------------------------------------------------------------------
export function drawCliff() {
  const C = R.FALLS.cliff;
  const rng = mulberry32(0x66616c6c);
  const geos = [];
  const rows = 4;
  for (let i = 0; i < 9; i++) for (let j = 0; j < rows; j++) {
    const z = C.z0 + ((i + 0.5 + (rng() - 0.5) * 0.5) / 9) * (C.z1 - C.z0);
    const y0 = (j / rows) * C.h;
    const r = 0.8 + rng() * 0.5;
    const x = C.x0 + 0.3 + rng() * (C.x1 - C.x0 - 0.3);
    const g = new THREE.DodecahedronGeometry(r, 0).scale(1.1, 1.0 + rng() * 0.5, 1.2).rotateY(rng() * 6).translate(x, y0 + r * 0.7 + crystalY(36, R.FALLS.z), z);
    geos.push(paint(g, [0x6c5a70, 0x5a4a62, 0x7c6a82, 0x6a5870][(i + j) % 4], Math.sin(i * 2.3 + j)));
  }
  const m = flag(new THREE.Mesh(mergeGeometries(geos), litMaterial(0xffffff, { vertexColors: true, roughness: 0.9 })), 'cr:cliff');
  return m;
}
/** The fall's sheet (pale, vertical, facing the cave), as one mesh; its streaks and spray are moved by the live code. */
export function drawSheet() {
  const F = R.FALLS;
  const y0 = crystalY(36, F.z);
  const g = new THREE.PlaneGeometry(F.w, F.top, 1, 6).rotateY(-Math.PI / 2).translate(F.x, y0 + F.top / 2, F.z);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { _c.setHex(0xd8f6ff).lerp(_c2.setHex(0x8fdcf0), 1 - (pos.getY(i) - y0) / F.top); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return flag(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide })), 'cr:sheet');
}

/** A line of small instanced quads (the fall's streaks): returns { mesh, set(i, x, y, z) }. */
export function dashes(count, w, h, hex, opacity, name, flat) {
  const geo = new THREE.PlaneGeometry(w, h);
  if (flat) geo.rotateX(-Math.PI / 2); else geo.rotateY(-Math.PI / 2);
  const mesh = flag(new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }), count), name);
  const dummy = new THREE.Object3D();
  return { mesh, put(i, x, y, z, yaw = 0) { dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.instanceMatrix.needsUpdate = true; } };
}

/** The spray at the fall's foot: a few soft dots (half of them on the lower rungs). Returns { points, count, set(positions) }. */
export function drawSpray(count) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const pts = flag(new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture(), color: 0xe8fbff, size: 0.28, transparent: true, opacity: 0.75, depthWrite: false })), 'cr:spray');
  return pts;
}

// ---- the docks -------------------------------------------------------------------------------------------------------------------
export function drawDocks() {
  const geos = [];
  const wood = [0x8a6a4a, 0x9a7a54, 0x7c5e42];
  for (const d of R.DOCKS) {
    for (let i = 0; i < 7; i++) {
      const x = d.x + 0.4 + i * 0.36 - 1.3;
      geos.push(paint(new THREE.BoxGeometry(0.32, 0.05, 2.1).translate(x, crystalY(x, d.z) + 0.05, d.z), wood[i % 3], Math.sin(i + d.x)));
    }
    for (const dz of [-1.0, 1.0]) {
      const x = d.x + 1.1;
      geos.push(paint(new THREE.CylinderGeometry(0.07, 0.08, 0.7, 6).translate(x, crystalY(x, d.z + dz) + 0.35, d.z + dz), 0x6a4e36));
    }
  }
  return flag(new THREE.Mesh(mergeGeometries(geos), litMaterial(0xffffff, { vertexColors: true, roughness: 0.9 })), 'cr:docks');
}
/** The two dock lanterns' emissive balls (plain meshes; they sit on the posts, no light). */
export function drawDockLamps() {
  const geos = R.DOCKS.map((d) => new THREE.SphereGeometry(0.09, 8, 6).translate(d.x + 1.1, crystalY(d.x + 1.1, d.z + 1.0) + 0.82, d.z + 1.0));
  return flag(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: 0xffd98a })), 'cr:docklamps');
}

// ---- the boat ----------------------------------------------------------------------------------------------------------------------
// Local axes: +z is the bow. The hull is a half-ellipsoid bowl, a pink gunwale, two benches, a bow post and the lantern. About 2.2 m long, 1.1 m wide.
export function drawBoat() {
  const g = new THREE.Group();
  const hull = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.55, 0.4, 1.2).translate(0, 0.4, 0);
  const rim = new THREE.TorusGeometry(1, 0.05, 5, 20).rotateX(Math.PI / 2).scale(0.56, 1, 1.21).translate(0, 0.4, 0);
  const parts = [
    paint(hull, 0xc89a5a, 0.4), paint(rim, 0xffa8c4),
    paint(new THREE.BoxGeometry(0.9, 0.05, 0.28).translate(0, 0.27, -0.3), 0xb8864a),
    paint(new THREE.BoxGeometry(0.8, 0.05, 0.26).translate(0, 0.27, 0.5), 0xb8864a),
    paint(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 6).translate(0, 0.7, 1.05), 0x6a4e36),
  ];
  const body = new THREE.Mesh(mergeGeometries(parts), litMaterial(0xffffff, { vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  flag(body, 'cr:boat:hull');
  const lamp = flag(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd98a })), 'cr:boat:lamp');
  lamp.position.set(0, R.BOAT.lanternY, 1.05);
  const halo = flag(new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: 0xffcf80, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })), 'cr:boat:halo');
  halo.scale.setScalar(0.8);
  halo.position.copy(lamp.position);
  g.add(body, lamp, halo);
  g.name = 'cr:boat';
  return { group: g, halo };
}
