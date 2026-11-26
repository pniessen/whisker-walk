// =============================================================================
// THE GLASS-HOUSE KIT (Greenhouse milestone 0). Four cheap flat parts, no real refraction, no lights:
//   * the frame: ribs, purlins, door posts and a low plinth, ONE opaque vertex-coloured mesh;
//   * the glass: ONE transparent mesh of quads, a vertical colour gradient, FRONT FACES ONLY, SOMEWHAT FROSTED
//     (about 25 to 35 percent opaque, tinted green-white): from outside she sees a soft pane and the cat and the
//     plants inside read through it as soft shapes; from inside the pane is culled (clear views, no overdraw).
//     The glass house is NOT a fading building (the owner, 2026-11-23): it carries no userData.window, so the
//     walk camera's building fade (treefade.js) and the dusk swap (dusk.js) both leave it alone, and neither
//     the frame nor the cat inside is ever hidden when the camera stands outside and the line crosses it;
//   * mist: flat soft sheets on one shader mesh with one uTime; sun shafts: additive vertex-faded quads;
//   * the dapple: one flat floor quad with a diamond-lattice light texture, drawn in build, never at import.
// The frame and the glass share ONE top-level group (the building the camera fades). The mist, the shafts, the
// floor and the dapple are top-level siblings, so the fade never clones a shader's uniforms.
// No Math.random, no clock: every number is a function of the plan.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash01 } from './warehouselook.js';

export const COL = Object.freeze({
  frame: 0xe4eee2, plinth: 0x6f8a78, floor: 0xd9c9a4, post: 0xcfdccb,
  paneLow: 0xe8f6ec, paneHigh: 0xd6eedd, shaft: 0xffe2a8, mist: 0xf4faf7,
});
// Frosted: 0.32 on the walls, 0.34 on the roof (the owner's 25 to 35 percent), a wetter edge in the lowest 0.4 m
// that stays inside the band.
export const GLASS_ALPHA = Object.freeze({ wall: 0.32, roof: 0.34, wet: 0.01 });
const ARC_SEGMENTS = 12;
const RIB_X = [-14, -12, -10, -8, -6, -4, -1.5, 1.5, 4, 6, 8, 10, 12, 14]; // 14 ribs; the middle bay is the door's

// The rib stations of any house: the Palm House's own list, or (a stage-B room) an even spacing of about 2 m either side of the
// long-wall door's 3 m bay. The door's x is the south or north door's, or the house's middle.
export function ribsOf(h, doors = []) {
  if (h.x0 === -14 && h.x1 === 14) return RIB_X;
  const d = doors.find((k) => k.side === 'south' || k.side === 'north');
  const dx = d ? d.x : (h.x0 + h.x1) / 2;
  const half = h.doorW / 2;
  const side = (a, b) => {
    const n = Math.max(1, Math.round((b - a) / 2));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  return [...side(h.x0, dx - half), ...side(dx + half, h.x1)];
}
const doorX = (doors, side, h) => doors.find((d) => d.side === side)?.x ?? (h.x0 + h.x1) / 2;

const _col = new THREE.Color();
const _a = new THREE.Color();
const _b = new THREE.Color();

// A box from a to b, `w` x `h` in section, its length along the line.
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _mid = new THREE.Vector3();
function beam(ax, ay, az, bx, by, bz, w, h, hex) {
  _p.set(ax, ay, az);
  _q.set(bx, by, bz);
  const len = _p.distanceTo(_q);
  const g = new THREE.BoxGeometry(w, h, len);
  const dir = _q.clone().sub(_p).normalize();
  const upv = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : _up;
  _m.lookAt(_p, _q, upv);
  _mid.copy(_p).add(_q).multiplyScalar(0.5);
  _m.setPosition(_mid);
  g.applyMatrix4(_m);
  return paint(g, hex);
}
function paint(g, hex) {
  _col.set(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_col.r, _col.g, _col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

// ---------------------------------------------------------------------------------------------
// The house's cross-section: a polyline in (z, y) from the north foot over the arch to the south foot.
export function profileOf(h) {
  const zc = (h.z0 + h.z1) / 2;
  const hw = (h.z1 - h.z0) / 2;
  const rise = h.ridge - h.wallH;
  const arc = [];
  const segs = h.arcSegments ?? ARC_SEGMENTS; // (a stage-B room draws a coarser arch: fewer beams)
  for (let k = 0; k <= segs; k++) {
    const th = (k * Math.PI) / segs;
    arc.push({ z: zc - hw * Math.cos(th), y: h.wallH + rise * Math.sin(th), roof: k > 0 && k < segs });
  }
  arc[0].z = h.z0; arc[segs].z = h.z1;
  return [{ z: h.z0, y: h.plinth, roof: false }, ...arc, { z: h.z1, y: h.plinth, roof: false }];
}
const topAt = (arc, z) => {
  for (let i = 0; i + 1 < arc.length; i++) {
    const a = arc[i], b = arc[i + 1];
    if (z >= a.z - 1e-9 && z <= b.z + 1e-9) return a.y + ((b.y - a.y) * (z - a.z)) / Math.max(1e-9, b.z - a.z);
  }
  return arc[arc.length - 1].y;
};

// ---------------------------------------------------------------------------------------------
// The glass: quads, wound to face OUTWARD (the material is front-sided, so the inside sees nothing).
function glassGeometry(h, doors) {
  const prof = profileOf(h);
  const zc = (h.z0 + h.z1) / 2;
  const pos = [];
  const col = [];
  const idx = [];
  const colorAt = (y) => {
    _a.set(COL.paneLow); _b.set(COL.paneHigh);
    _col.copy(_a).lerp(_b, Math.min(1, Math.max(0, (y - h.plinth) / (h.ridge - h.plinth))));
    const roofT = Math.min(1, Math.max(0, (y - h.wallH) / (h.ridge - h.wallH)));
    const wet = GLASS_ALPHA.wet * (1 - Math.min(1, Math.max(0, (y - h.plinth) / 0.4)));
    return [_col.r, _col.g, _col.b, GLASS_ALPHA.wall + (GLASS_ALPHA.roof - GLASS_ALPHA.wall) * roofT + wet];
  };
  // A quad of four points a b c d (in order round it); its winding is made to face `out`.
  const quad = (A, B, C, D, out) => {
    const base = pos.length / 3;
    for (const P of [A, B, C, D]) { pos.push(P[0], P[1], P[2]); col.push(...colorAt(P[1])); }
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const southDoor = doors.find((d) => d.side === 'south');
  const northDoor = doors.find((d) => d.side === 'north');
  const half = h.doorW / 2;
  const ribs = ribsOf(h, doors);
  // the long surface: each profile segment, bay by bay
  for (let s = 0; s + 1 < prof.length; s++) {
    const a = prof[s], b = prof[s + 1];
    const dz = b.z - a.z, dy = b.y - a.y;
    const out = [0, dz, -dy]; // the 90-degree turn of the travel in the (z, y) plane: up on the roof, -z on the north wall, +z on the south
    const northWall = s === 0, southWall = s === prof.length - 2;
    for (let i = 0; i + 1 < ribs.length; i++) {
      const xa = ribs[i], xb = ribs[i + 1];
      let A = [xa, a.y, a.z], B = [xb, a.y, a.z], C = [xb, b.y, b.z], D = [xa, b.y, b.z];
      const wallDoor = northWall ? northDoor : southWall ? southDoor : null;
      const inDoorBay = !!wallDoor && xa >= wallDoor.x - half - 1e-6 && xb <= wallDoor.x + half + 1e-6;
      if (inDoorBay) {
        // only the transom above the doorway (the wall segment runs plinth to wall top)
        const up = Math.max(a.y, b.y);
        if (up - h.doorH < 0.05) continue;
        A = [xa, h.doorH, a.z]; B = [xb, h.doorH, a.z]; C = [xb, up, b.z]; D = [xa, up, b.z];
      }
      quad(A, B, C, D, out);
    }
  }
  // the arched ends: a strip between the plinth and the arch's top, split at the arc's nodes and the door's edges
  const arc = prof.slice(1, -1);
  const zs = [...new Set([...arc.map((p) => p.z), zc - half, zc + half])].sort((p, q) => p - q);
  for (const [x, sgn, side] of [[h.x0, -1, 'west'], [h.x1, 1, 'east']]) {
    const door = doors.some((d) => d.side === side);
    for (let i = 0; i + 1 < zs.length; i++) {
      const za = zs[i], zb = zs[i + 1];
      const inDoor = door && za >= zc - half - 1e-6 && zb <= zc + half + 1e-6;
      const lo = inDoor ? h.doorH : h.plinth;
      const ta = topAt(arc, za), tb = topAt(arc, zb);
      if (Math.min(ta, tb) - lo < 0.05 && ta - lo < 0.05) continue;
      quad([x, lo, za], [x, lo, zb], [x, tb, zb], [x, ta, za], [sgn, 0, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function frameGeometry(h, doors) {
  const prof = profileOf(h);
  const zc = (h.z0 + h.z1) / 2;
  const half = h.doorW / 2;
  const parts = [];
  const T = 0.12;
  // ribs: the arch at every rib x, foot to foot (the wall segments are the first and last)
  for (const x of ribsOf(h, doors)) {
    for (let s = 0; s + 1 < prof.length; s++) {
      const a = prof[s], b = prof[s + 1];
      // the ribs beside a door (x = +-1.5) stand to the ground; every other rib starts at the plinth
      parts.push(beam(x, a.y, a.z, x, b.y, b.z, T, T, COL.frame));
    }
  }
  // purlins: one long beam at every node of the profile (ridge, arch nodes, wall tops)
  for (const p of prof.slice(1, -1)) parts.push(beam(h.x0, p.y, p.z, h.x1, p.y, p.z, T * 0.9, T * 0.9, COL.frame));
  // door posts and lintels
  for (const d of doors) {
    if (d.side === 'south' || d.side === 'north') {
      parts.push(beam(d.x - half, h.plinth, d.z, d.x - half, h.doorH, d.z, 0.2, 0.2, COL.post));
      parts.push(beam(d.x + half, h.plinth, d.z, d.x + half, h.doorH, d.z, 0.2, 0.2, COL.post));
      parts.push(beam(d.x - half, h.doorH, d.z, d.x + half, h.doorH, d.z, 0.2, 0.16, COL.post));
    } else {
      parts.push(beam(d.x, h.plinth, zc - half, d.x, h.doorH, zc - half, 0.2, 0.2, COL.post));
      parts.push(beam(d.x, h.plinth, zc + half, d.x, h.doorH, zc + half, 0.2, 0.2, COL.post));
      parts.push(beam(d.x, h.doorH, zc - half, d.x, h.doorH, zc + half, 0.2, 0.16, COL.post));
    }
  }
  // gable mullions on the two arched ends, standing off the door's span
  const arc = prof.slice(1, -1);
  for (const x of [h.x0, h.x1]) {
    for (const p of arc) {
      if (p.y <= h.wallH + 0.01) continue;
      if (Math.abs(p.z - zc) < half + 0.05) continue;
      parts.push(beam(x, h.plinth, p.z, x, p.y, p.z, T * 0.8, T * 0.8, COL.frame));
    }
  }
  // the plinth: a low dark wall round the foot, each door left open
  const wall = (x0, z0, x1, z1) => parts.push(beam(x0, h.plinth / 2, z0, x1, h.plinth / 2, z1, 0.36, h.plinth, COL.plinth));
  // (a side with no door is one whole wall; the Palm House has all four doors)
  const nx = doorX(doors, 'north', h), sx = doorX(doors, 'south', h);
  const has = (side) => doors.some((d) => d.side === side);
  if (has('north')) { wall(h.x0, h.z0, nx - half, h.z0); wall(nx + half, h.z0, h.x1, h.z0); } else wall(h.x0, h.z0, h.x1, h.z0);
  if (has('south')) { wall(h.x0, h.z1, sx - half, h.z1); wall(sx + half, h.z1, h.x1, h.z1); } else wall(h.x0, h.z1, h.x1, h.z1);
  for (const [side, x] of [['west', h.x0], ['east', h.x1]]) {
    if (has(side)) { wall(x, h.z0, x, zc - half); wall(x, zc + half, x, h.z1); } else wall(x, h.z0, x, h.z1);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

// The whole house: frame + glass in one top-level group (the building the camera fades).
export function glassHouse(h, doors, { name = 'glassHouse' } = {}) {
  const group = new THREE.Group();
  group.name = name;
  const frame = new THREE.Mesh(frameGeometry(h, doors), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }));
  frame.name = `${name}-frame`;
  frame.userData.noCast = true; // a thin lattice would cost a shadow draw for no look: the floor gets the dapple instead
  frame.userData.noMerge = true;
  frame.castShadow = false;
  const glass = new THREE.Mesh(glassGeometry(h, doors), new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.FrontSide, fog: true,
  }));
  glass.name = `${name}-glass`;
  glass.userData.glassHouse = true; // (no userData.window: neither the building fade nor the dusk swap may touch it)
  glass.userData.noCast = true;
  glass.userData.noMerge = true;
  glass.castShadow = false;
  glass.renderOrder = 1;
  group.add(frame, glass);
  return { group, frame, glass };
}

// ---------------------------------------------------------------------------------------------
// The floor and the dapple. The dapple's canvas is drawn here, inside build, never at import.
// The paved floor: a grid of flagstones (about `cell` m), each with its own hashed tone, a slightly lighter middle (a worn
// bevel) and a soft darkening along the walls where the glass meets the plinth. Five vertices a cell, four triangles, one mesh.
export function pavedGeometry(w, d, hex, { cell = 1.4, seed = 1, edge = 0.9, ao = 0.3 } = {}) {
  const nx = Math.max(1, Math.round(w / cell)), nz = Math.max(1, Math.round(d / cell));
  const cw = w / nx, cd = d / nz;
  const base = new THREE.Color(hex);
  const pos = [], col = [], idx = [];
  const shade = (x, z, k) => {
    const e = Math.min(x + w / 2, w / 2 - x, z + d / 2, d / 2 - z); // m from the nearest wall
    const f = k * (1 - ao * Math.max(0, 1 - e / edge) ** 2);
    col.push(base.r * f, base.g * f, base.b * f);
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = -w / 2 + i * cw, z0 = -d / 2 + j * cd, x1 = x0 + cw, z1 = z0 + cd;
      const tone = 0.9 + 0.17 * hash01(i, j, seed) + (((i + j) & 1) ? 0.02 : -0.02);
      const b = pos.length / 3;
      for (const [x, z, k] of [[x0, z0, 0.94], [x1, z0, 0.94], [x1, z1, 0.94], [x0, z1, 0.94], [(x0 + x1) / 2, (z0 + z1) / 2, 1.03]]) {
        pos.push(x, 0, z);
        shade(x, z, tone * k);
      }
      idx.push(b, b + 4, b + 1, b + 1, b + 4, b + 2, b + 2, b + 4, b + 3, b + 3, b + 4, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function floorQuad(h, hex = COL.floor, name = 'glassFloor') {
  const g = pavedGeometry(h.x1 - h.x0 - 0.4, h.z1 - h.z0 - 0.4, hex, { seed: Math.round(h.x0 * 7 + h.z0 * 13) & 0xffff });
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  m.position.set((h.x0 + h.x1) / 2, 0.03, (h.z0 + h.z1) / 2);
  m.name = name;
  m.receiveShadow = true;
  return m;
}

export function dappleQuad(h, { size = 64, name = 'glassDapple' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  // a diamond lattice of soft light squares: the roof's ribs and purlins, thrown on the floor
  ctx.fillStyle = 'rgba(255, 238, 190, 0.34)';
  const step = size / 4;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * step, cy = (j + 0.5) * step;
      ctx.beginPath();
      ctx.moveTo(cx, cy - step * 0.34); ctx.lineTo(cx + step * 0.34, cy); ctx.lineTo(cx, cy + step * 0.34); ctx.lineTo(cx - step * 0.34, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = h.x1 - h.x0 - 0.4, d = h.z1 - h.z0 - 0.4;
  tex.repeat.set(Math.round(w / 2), Math.round(d / 2));
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -1 }));
  m.position.set((h.x0 + h.x1) / 2, 0.05, (h.z0 + h.z1) / 2);
  m.name = name;
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.castShadow = false;
  m.renderOrder = 1;
  return m;
}

// ---------------------------------------------------------------------------------------------
// Sun shafts: tall additive quads under the ridge, brighter at the top and fading to nothing at the floor.
// One mesh whose origin is the ridge, so the sway (a few degrees over 20 s) is one rotation.
export const SHAFT_SPOTS = Object.freeze([[-8, -12.5], [-2, -5.5], [5.5, -13], [10, -6]].map((p) => Object.freeze(p)));
export const SHAFT_GAIN = 0.16; // the additive light's strength at a shaft's top, centre (M0's 0.22 blew out)
export const SHAFT_FADE = Object.freeze({ near: 2.5, far: 8 }); // m from the camera: none, then all
export function sunShafts(h, spots = SHAFT_SPOTS, name = 'sunShafts') {
  const pos = [];
  const col = [];
  const idx = [];
  const ridge = h.ridge - 0.6;
  _col.set(COL.shaft);
  for (const [x, z] of spots) {
    // two crossed pairs of triangles leaning a little east: the top narrow and bright in the middle, soft to nothing at
    // the sides (the edge vertices are black, and additive black is nothing), the foot wide and black
    for (const yaw of [0, Math.PI / 2]) {
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const base = pos.length / 3;
      for (const [u, y, k] of [[-0.9, 0, 0], [0, 0, 1], [0.9, 0, 0], [-2.6, -ridge, 0], [0, -ridge, 0], [2.6, -ridge, 0]]) {
        const px = x + u * cs + (y === 0 ? 0 : 1.6); // the foot leans 1.6 m east of the top
        const pz = z + u * sn;
        pos.push(px, y, pz);
        col.push(_col.r * k * SHAFT_GAIN, _col.g * k * SHAFT_GAIN, _col.b * k * SHAFT_GAIN);
      }
      idx.push(base, base + 1, base + 4, base, base + 4, base + 3, base + 1, base + 2, base + 5, base + 1, base + 5, base + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  // The distance fade (M0's known bug: a camera among the shafts saw a screenful of stacked additive light, blown out
  // to white). A shaft's light fades to nothing within SHAFT_FADE.near of the camera and is whole beyond .far.
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShaftW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShaftW = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShaftW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb *= smoothstep(${SHAFT_FADE.near.toFixed(1)}, ${SHAFT_FADE.far.toFixed(1)}, distance(cameraPosition, vShaftW));`);
  };
  mat.customProgramCacheKey = () => 'greenhouse-shafts-v2';
  const m = new THREE.Mesh(g, mat);
  m.name = name;
  m.position.set(0, ridge, 0);
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.castShadow = false;
  m.renderOrder = 2;
  m.frustumCulled = false;
  return m;
}
// the sway: a few degrees over 20 s, a function of the walk's clock (frozen under reduced motion)
export const SHAFT_SWAY = Object.freeze({ deg: 2.5, period: 20 });
export function shaftAngle(t, reducedMotion = false) {
  if (reducedMotion) return 0;
  return (SHAFT_SWAY.deg * Math.PI / 180) * Math.sin((t / SHAFT_SWAY.period) * Math.PI * 2);
}

// ---------------------------------------------------------------------------------------------
// Mist: a few flat soft-edged sheets near the floor and the doors, ONE mesh, ONE uTime.
export const MIST_SHEETS = Object.freeze([
  { x: -7, z: -8, w: 7, d: 4.5, y: 0.35 }, { x: 5, z: -12, w: 8, d: 4, y: 0.5 },
  { x: 0, z: -1.6, w: 4.5, d: 2.2, y: 0.6 }, { x: 8.5, z: -4, w: 6, d: 3.5, y: 0.8 },
].map((s) => Object.freeze(s)));
export function mistSheets(sheets = MIST_SHEETS, name = 'glassMist') {
  const pos = [];
  const uv = [];
  const idx = [];
  sheets.forEach((s, k) => {
    const base = k * 4;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      pos.push(s.x + (u - 0.5) * s.w, s.y, s.z + (v - 0.5) * s.d);
      uv.push(u, v);
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(COL.mist) } };
  const material = new THREE.MeshBasicMaterial({ color: COL.mist, transparent: true, depthWrite: false, fog: true });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMistW;\nvarying vec2 vMistUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMistW = (modelMatrix * vec4(position, 1.0)).xyz;\nvMistUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uColor;
varying vec3 vMistW;
varying vec2 vMistUv;
float mH(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float mN(vec2 q) { vec2 i = floor(q), f = fract(q); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mH(i), mH(i + vec2(1.0, 0.0)), u.x), mix(mH(i + vec2(0.0, 1.0)), mH(i + vec2(1.0, 1.0)), u.x), u.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vMistW.xz;
  vec2 e = min(vMistUv, 1.0 - vMistUv);
  float edge = smoothstep(0.0, 0.4, min(e.x, e.y));
  float n = 0.6 * mN(p * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) + 0.4 * mN(p * 0.9 + vec2(-uTime * 0.03, uTime * 0.06) + 17.0);
  float a = smoothstep(0.3, 0.7, n) * edge * 0.8;
  a *= smoothstep(1.0, 3.0, distance(cameraPosition, vMistW));
  diffuseColor.rgb = uColor;
  diffuseColor.a *= a;
  if (diffuseColor.a < 0.004) discard;
}`);
  };
  material.customProgramCacheKey = () => 'greenhouse-mist-v2';
  const m = new THREE.Mesh(g, material);
  m.name = name;
  m.userData.noCast = true;
  m.userData.noMerge = true;
  m.userData.mist = uniforms;
  m.castShadow = false;
  m.renderOrder = 2;
  return m;
}
