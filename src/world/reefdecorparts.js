// =============================================================================
// THE REEF: THE SEABED'S DECOR, DRAWN. Two meshes (two draw calls) and nothing else: `reef:tufts`, ONE InstancedMesh of seagrass and anemone tufts (the sway in
// the kelp's vertex shader, on the kelp's own time uniform, so reduced motion freezes it), and `reef:decor`, every still piece (sea fans, small coral heads, sponge
// tubes, small coral arches, urchins and starfish, shells, sand dollars, pebbles, rock piles with algae, driftwood, sand ripples) vertex-coloured and merged into one
// non-casting mesh. The lower rungs draw about half: the tufts' `count` and the decor's draw range are cut to the first half (life/reeflife.js reads
// userData.baseCount and userData.baseVerts). Every number is reefdecor.js's seeded plan; no real lights, no canvas, no Math.random.
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint, at, nudge, shadePaint, kelpMaterial } from './reefparts.js';
import { reefY } from './reefplan.js';
import * as D from './reefdecor.js';

const cyl = (rt, rb, h, seg = 6, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

// ---- the tufts: seven tapered blades fanned from one root, pale at the foot and white at the tip (the instance's colour does the rest) -----------------------------------
export function tuftGeometry() {
  const parts = [];
  for (let b = 0; b < 7; b++) {
    const a = b * 2.4;
    const hb = 0.62 + 0.38 * ((b * 5) % 7) / 6; // heights between 0.62 and 1 (the tallest stands at 1: the shader's sway reads y in 0..1)
    const tilt = 0.12 + 0.12 * ((b * 3) % 5);
    const g = new THREE.PlaneGeometry(0.13, 1, 1, 2);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) p.setX(v, p.getX(v) * (1 - 0.85 * p.getY(v)));
    g.scale(1, hb, 1).rotateX(tilt).rotateY(a).translate(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
    parts.push(g.toNonIndexed());
    g.dispose();
  }
  const geo = mergeGeometries(parts);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let v = 0; v < p.count; v++) { const k = 0.5 + 0.5 * Math.min(1, p.getY(v)); col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = k; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function drawTufts(kelpTime) {
  const list = D.scatterTufts();
  const mat = kelpMaterial(kelpTime);
  const mesh = new THREE.InstancedMesh(tuftGeometry(), mat, Math.max(1, list.length));
  mesh.name = 'reef:tufts';
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eu = new THREE.Euler();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  list.forEach((t, i) => {
    eu.set(0, t.yaw, 0);
    q.setFromEuler(eu);
    pos.set(t.x, reefY(t.x, t.z) - 0.03, t.z);
    sc.set(t.w, t.h, t.w);
    m4.compose(pos, q, sc);
    mesh.setMatrixAt(i, m4);
    tint.setRGB(t.tint[0], t.tint[1], t.tint[2]);
    mesh.setColorAt(i, tint);
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true, baseCount: list.filter((t) => !t.half).length });
  mesh.frustumCulled = false;
  return mesh;
}

// ---- the still pieces ---------------------------------------------------------------------------------------------------------------------------------
// A fan of triangles (apex at the origin, rim ragged, a little bowed), stripes alternating c1 and c2, both faces: sea fans and scallop shells.
function fanGeo(sc, c1, c2, N = 9, spread = Math.PI * 0.85) {
  const pos = [];
  const col = [];
  const A = new THREE.Color(c1);
  const B = new THREE.Color(c2);
  const base = new THREE.Color(c2).multiplyScalar(0.7);
  const a0 = Math.PI / 2 - spread / 2;
  const pt = (i) => { const a = a0 + (spread * i) / N; const r = sc * (0.82 + 0.18 * Math.abs(Math.sin(i * 2.3 + sc * 5))); return [Math.cos(a) * r, Math.sin(a) * r, 0.16 * sc * Math.cos(a) ** 2]; };
  for (let i = 0; i < N; i++) {
    const p = pt(i);
    const q = pt(i + 1);
    const c = i % 2 ? A : B;
    pos.push(0, 0, 0, ...p, ...q, 0, 0, 0, ...q, ...p);
    for (let k = 0; k < 2; k++) col.push(base.r, base.g, base.b, c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}
// A five-armed star lying flat, a little domed (ten triangles from the middle).
function starGeo(r, hex) {
  const pos = [];
  const c = new THREE.Color(hex);
  const pale = new THREE.Color(hex).offsetHSL(0, -0.1, 0.14);
  const col = [];
  const ring = (i) => { const a = (i * Math.PI) / 5; const rr = i % 2 ? r * 0.38 : r; return [Math.cos(a) * rr, i % 2 ? 0.026 : 0.012, Math.sin(a) * rr]; };
  for (let i = 0; i < 10; i++) { pos.push(0, 0.05, 0, ...ring(i + 1), ...ring(i)); col.push(pale.r, pale.g, pale.b, c.r, c.g, c.b, c.r, c.g, c.b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

// The seabed's slope along a short piece lying at yaw `ry` (the angle `at` rolls it by so both ends meet the sand).
function slopeOf(x, z, ry, len) {
  const dx = Math.cos(ry) * len / 2;
  const dz = -Math.sin(ry) * len / 2;
  return Math.atan2(reefY(x + dx, z + dz) - reefY(x - dx, z - dz), len);
}

// Everything still, as { a: [geometries of the first half], b: [the rest] }; `a` is what the lower rungs draw.
export function decorGeometries() {
  const d = D.scatterDecor();
  const a = [];
  const b = [];
  const put = (it, geo, x, z, dy, ry, rz, hex) => (it.half ? b : a).push(shadePaint(hex === null ? at(geo, x, z, dy, ry, rz) : paint(at(geo, x, z, dy, ry, rz), hex)));
  const pairOf = (table, it) => { const l = table[it.zone]; return l[it.c % l.length]; };
  const jit = (hex, it, k = 1) => nudge(hex, (it.t - 0.5) * 0.04 * k, (it.s - 0.5) * 0.14 * k, (it.t * 3 % 1 - 0.5) * 0.1 * k);

  for (const it of d.arch) {
    const [c1, c2] = pairOf(D.FAN_PAIRS, it);
    const R = 0.55 + 0.2 * it.s;
    const tube = 0.13 + 0.04 * it.t;
    put(it, new THREE.TorusGeometry(R, tube, 5, 8, Math.PI), it.x, it.z, -0.05, it.yaw, 0, jit(c1, it));
    for (const [px, py, pr] of [[0, R, 0.1], [-R * 0.7, R * 0.7, 0.08], [R * 0.72, R * 0.68, 0.08]]) put(it, new THREE.OctahedronGeometry(pr, 0).translate(px, py + tube, 0), it.x, it.z, 0, it.yaw, 0, nudge(c1, 0, -0.1, 0.18));
    put(it, new THREE.DodecahedronGeometry(tube * 1.8, 0).scale(1, 0.5, 1).translate(-R, 0, 0), it.x, it.z, 0.02, it.yaw, 0, c2); // a foot on each side
    put(it, new THREE.DodecahedronGeometry(tube * 1.8, 0).scale(1, 0.5, 1).translate(R, 0, 0), it.x, it.z, 0.02, it.yaw, 0, c2);
  }
  for (const it of d.pile) {
    const stones = D.STONE_TONES[it.zone];
    const algae = D.ALGAE[it.zone];
    const n = 3 + Math.floor(it.s * 3);
    for (let i = 0; i < n; i++) {
      const ang = it.yaw + i * 2.2;
      const top = i === n - 1;
      const r = top ? 0.13 + 0.05 * it.t : 0.16 + 0.12 * ((it.c * (i + 3)) % 7) / 7;
      const ox = top ? 0 : Math.cos(ang) * 0.27;
      const oz = top ? 0 : Math.sin(ang) * 0.27;
      put(it, new THREE.IcosahedronGeometry(r, 0).scale(1.15, 0.58, 0.95).rotateY(ang).translate(ox, top ? 0.2 : r * 0.38, oz), it.x, it.z, -0.02, 0, 0, jit(stones[(it.c + i) % stones.length], it));
      if (i < 2) put(it, new THREE.OctahedronGeometry(r * 0.8, 0).scale(1, 0.32, 1).translate(ox, (top ? 0.2 : r * 0.38) + r * 0.34, oz), it.x, it.z, -0.02, 0, 0, jit(algae[(it.c + i) % algae.length], it, 2));
    }
  }
  for (const it of d.wood) {
    const L = 1.0 + 0.8 * it.s;
    const wood = [0x9a8264, 0xb09a78, 0x7d6a52][it.c % 3];
    const rz = slopeOf(it.x, it.z, it.yaw, L);
    put(it, cyl(0.04, 0.07, L, 5).rotateZ(Math.PI / 2), it.x, it.z, 0.05, it.yaw, rz, jit(wood, it));
    put(it, cyl(0.016, 0.03, 0.45, 4).translate(0, 0.22, 0).rotateZ(-0.7).translate(L * 0.1, 0.03, 0), it.x, it.z, 0.05, it.yaw, rz, jit(wood, it, 0.5));
    if (it.t > 0.4) put(it, cyl(0.012, 0.026, 0.35, 4).translate(0, 0.17, 0).rotateZ(0.8).translate(-L * 0.2, 0.03, 0), it.x, it.z, 0.05, it.yaw, rz, jit(wood, it, 0.5));
  }
  for (const it of d.fan) {
    const [c1, c2] = pairOf(D.FAN_PAIRS, it);
    const sc = 0.4 + 0.45 * it.s;
    put(it, fanGeo(sc, jit(c1, it), jit(c2, it), 9), it.x, it.z, 0.1 * sc, it.yaw, 0, null);
    put(it, cyl(0.03, 0.05, 0.14 * sc + 0.08, 4).translate(0, 0.05, 0), it.x, it.z, 0, it.yaw, 0, c2);
  }
  for (const it of d.head) {
    const [c1, c2] = pairOf(D.FAN_PAIRS, it);
    const r = 0.18 + 0.2 * it.s;
    put(it, new THREE.SphereGeometry(r, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.72, 1), it.x, it.z, -0.02, it.yaw, 0, jit(c1, it));
    for (let i = 0; i < 3; i++) put(it, new THREE.OctahedronGeometry(r * 0.28, 0).translate(Math.cos(i * 2.1 + it.yaw) * r * 0.45, r * 0.62, Math.sin(i * 2.1 + it.yaw) * r * 0.45), it.x, it.z, 0, 0, 0, nudge(c1, 0, -0.1, 0.17));
    put(it, new THREE.TorusGeometry(r * 0.75, r * 0.07, 3, 8).rotateX(Math.PI / 2).translate(0, r * 0.18, 0), it.x, it.z, 0, 0, 0, c2);
  }
  for (const it of d.sponge) {
    const [c1, c2] = pairOf(D.SPONGE_PAIRS, it);
    const n = 3 + Math.floor(it.s * 3);
    for (let i = 0; i < n; i++) {
      const h = 0.22 + 0.4 * (((it.c + i * 3) % 5) / 4);
      const rr = 0.06 + 0.05 * (((it.c + i) % 3) / 2);
      const ang = i * 2.4 + it.yaw;
      const ox = Math.cos(ang) * 0.13 * (i ? 1 : 0);
      const oz = Math.sin(ang) * 0.13 * (i ? 1 : 0);
      put(it, cyl(rr * 0.8, rr * 1.15, h, 6, true).translate(ox, h / 2, oz), it.x, it.z, -0.02, 0, 0, jit(c1, it));
      put(it, new THREE.CircleGeometry(rr * 0.7, 6).rotateX(-Math.PI / 2).translate(ox, h - 0.012, oz), it.x, it.z, -0.02, 0, 0, c2);
    }
  }
  const URCH = { kelp: [0x7a2a3a, 0xe0a8a0], coral: [0x6a2a70, 0xe8c0e0], deep: [0x23305a, 0x8fb8e0] };
  for (const it of d.urchin) {
    const [body, spine] = URCH[it.zone] ?? [0x5a3a78, 0xc9b4d8];
    put(it, new THREE.IcosahedronGeometry(0.1, 0).scale(1, 0.8, 1), it.x, it.z, 0.08, 0, 0, body);
    for (let i = 0; i < 6; i++) put(it, cyl(0.01, 0.02, 0.15, 3, true).translate(0, 0.075, 0).rotateZ(0.9 + 0.5 * ((i + it.c) % 3) / 2).rotateY(i * 1.05 + it.yaw), it.x, it.z, 0.09, 0, 0, spine);
  }
  for (const it of d.star) {
    const tones = D.STAR_TONES[it.zone];
    put(it, starGeo(0.1 + 0.08 * it.s, tones[it.c % tones.length]), it.x, it.z, 0.012, it.yaw, 0, null);
  }
  for (const it of d.shell) {
    const tone = D.SHELL_TONES[it.c % D.SHELL_TONES.length];
    if (it.c % 2) put(it, fanGeo(0.06 + 0.04 * it.s, tone, nudge(tone, 0, -0.1, -0.1), 6, Math.PI * 0.8).rotateX(-Math.PI / 2 + 0.3), it.x, it.z, 0.025, it.yaw, 0, null);
    else put(it, new THREE.ConeGeometry(0.045, 0.14, 5).rotateZ(Math.PI / 2 - 0.2), it.x, it.z, 0.04, it.yaw, 0, tone);
  }
  for (const it of d.dollar) {
    put(it, new THREE.CircleGeometry(0.09 + 0.03 * it.s, 8).rotateX(-Math.PI / 2), it.x, it.z, 0.035, 0, 0, 0xe9dcc0);
    put(it, new THREE.CircleGeometry(0.05, 5).rotateX(-Math.PI / 2).translate(0, 0.006, 0), it.x, it.z, 0.035, it.yaw, 0, 0xc4b392);
  }
  for (const it of d.pebble) {
    const tones = D.STONE_TONES[it.zone];
    const r = 0.04 + 0.07 * it.s;
    put(it, new THREE.OctahedronGeometry(r, 0).scale(1, 0.5, 1 + it.t * 0.5), it.x, it.z, r * 0.15, it.yaw, 0, jit(tones[it.c % tones.length], it));
  }
  for (const it of d.ripple) {
    const L = 0.9 + 1.1 * it.s;
    const ry = it.pyaw + (it.t - 0.5) * 0.25;
    const rz = slopeOf(it.x, it.z, ry, L);
    put(it, cyl(0.07, 0.07, L, 4).rotateZ(Math.PI / 2).scale(1, 0.32, 1), it.x, it.z, 0.0, ry, rz, 0xf3e5b5);
  }
  return { a, b };
}

export function drawDecor(M) {
  const { a, b } = decorGeometries();
  const all = [...a, ...b];
  const geo = mergeGeometries(all);
  const mesh = new THREE.Mesh(geo, M.paint);
  mesh.name = 'reef:decor';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true, baseVerts: a.reduce((n, g) => n + g.attributes.position.count, 0) });
  return mesh;
}
