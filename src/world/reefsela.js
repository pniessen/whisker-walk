// =============================================================================
// THE REEF: SELA, A REAL SEA TURTLE. Drawing only. Four meshes (no more than the old three plus the head): the shell with its rear flippers and
// tail (a domed carapace of scute plates, growth rings, olive to brown with a cream-yellow rim, and a pale plastron), the head on its own neck pivot
// (rounded, scaly, eyes and a beak, a slow sway), and the two paddle front flippers (long, tapered, with a slight curl).
// The stroke is a pure function of time: a flipper stroke, then a long glide; the body banks into the turns. Reduced motion freezes the pose.
// No Math.random, no clock read; the colours come from vertex colours (one Lambert material, no texture).
// =============================================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const STROKE = Object.freeze({ period: 11, stroke: 0.3 }); // seconds a cycle; the share of it that is the stroke (the rest is the glide)

const frac = (x) => x - Math.floor(x);
const cellHash = (a, b) => frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453);

// Her attitude at time t. yaw / yawLater: her heading now and half a second on (the bank follows the turn); still: reduced motion's pose.
// Returns { flap, sweep, rear, pitch, roll, headYaw, headPitch } in radians.
export function selaAttitude(t, still, yaw = 0, yawLater = 0, out = {}) {
  if (still) { out.flap = 0.05; out.sweep = 0.1; out.rear = 0; out.pitch = 0; out.roll = 0; out.headYaw = 0; out.headPitch = 0; return out; }
  const c = frac(t / STROKE.period + 0.17);
  const s = c / STROKE.stroke;
  const stroking = s < 1;
  const env = stroking ? Math.sin(Math.PI * s) : 0;
  // one broad down-and-up stroke (down first), then the flippers lift slightly and rest in the glide
  out.flap = stroking ? 0.7 * Math.sin(2 * Math.PI * s) * (0.4 + 0.6 * env) : 0.06 + 0.04 * Math.sin(t * 0.4);
  out.sweep = stroking ? 0.3 * Math.sin(2 * Math.PI * s - 1.0) : 0.12;
  out.rear = stroking ? 0.25 * Math.sin(2 * Math.PI * s - 0.6) : 0.04 * Math.sin(t * 0.5);
  let dyaw = yawLater - yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); // the shortest way round
  out.roll = Math.max(-0.3, Math.min(0.3, -dyaw * 1.2)) + 0.025 * Math.sin(t * 0.35);
  out.pitch = (stroking ? -0.05 * Math.sin(2 * Math.PI * s - 0.4) : 0.02) + 0.02 * Math.sin(t * 0.5 + 1);
  out.headYaw = 0.22 * Math.sin(t * 0.37) + 0.1 * Math.sin(t * 0.9 + 2) + dyaw * 0.5; // a slow look about, and a look into the turn
  out.headPitch = 0.07 * Math.sin(t * 0.6 + 0.5) + (stroking ? 0.06 * Math.sin(2 * Math.PI * s) : 0);
  return out;
}

function colour(g, fn) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const ball = (rx, ry, rz, x, y, z, seg, rings) => { const g = new THREE.SphereGeometry(1, seg, rings).scale(rx, ry, rz).translate(x, y, z); g.deleteAttribute('uv'); return g; };
const flat = (g, hex) => colour(g, (c) => c.set(hex));

// Hexagon-ish scute panels over the carapace in (x, z): a panel's id, its distance from its middle (0 at it, 1 at its seam).
const HEX = 0.3;
function panel(x, z) {
  const q = (x * Math.sqrt(3) / 3 - z / 3) / HEX; const r = (z * 2 / 3) / HEX;
  let rq = Math.round(q); let rr = Math.round(r); const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q); const dr = Math.abs(rr - r); const ds = Math.abs(rs - (-q - r));
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  const cx = HEX * Math.sqrt(3) * (rq + rr / 2); const cz = HEX * 1.5 * rr;
  return { id: cellHash(rq, rr), d: Math.min(1, Math.hypot(x - cx, z - cz) / (HEX * 0.93)) };
}

function shell() {
  const g = ball(0.5, 0.21, 0.63, 0, 0.04, 0, 22, 12);
  colour(g, (c, x, y, z) => {
    const ny = (y - 0.04) / 0.21; // -1 under, 0 at the rim, 1 on top
    if (ny < 0.05) { // plastron and the cream rim
      c.setRGB(0.93, 0.86, 0.6).multiplyScalar(0.8 + 0.2 * (1 + ny));
      return;
    }
    const p = panel(x, z);
    const base = new THREE.Color().setHSL(0.2 - 0.09 * p.id, 0.42, 0.26 + 0.1 * (1 - p.id)); // olive to brown, panel by panel
    const ring = 0.5 + 0.5 * Math.cos(p.d * 9); // growth rings in each plate
    base.multiplyScalar(0.85 + 0.18 * ring);
    base.multiplyScalar(1 - 0.55 * Math.max(0, (p.d - 0.72) / 0.28) ** 1.4); // the seams between plates
    const rim = Math.max(0, 1 - ny / 0.4); // the cream-yellow edge of the shell
    c.copy(base).lerp(new THREE.Color(0xd8c986), rim * rim * 0.85);
  });
  return g;
}

// A paddle flipper, length len along +x from its shoulder: broad at the base, tapering to a rounded tip, thin, curled up and swept back a little.
function paddle(len, wid, hex, under) {
  const g = new THREE.SphereGeometry(1, 10, 5);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + 1) / 2; // 0 shoulder, 1 tip
    const profile = Math.pow(Math.sin(Math.PI * (0.06 + 0.9 * (1 - u * 0.62 * u))), 0.8); // fullest near the shoulder
    const w = wid * (1 - 0.68 * u) * (0.35 + profile * 0.65);
    pos.setXYZ(i, u * len, pos.getY(i) * 0.05 * (1 - 0.45 * u) + 0.14 * u * u, -0.2 * u * u * len * 0.4 + pos.getZ(i) * w);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const top = new THREE.Color(hex); const low = new THREE.Color(under);
  colour(g, (c, x, y, z, nx, ny) => {
    c.copy(top).lerp(low, ny < -0.2 ? 0.8 : 0);
    const edge = Math.min(1, Math.abs(z) / (wid * 0.5)); // a paler leading and trailing edge
    c.lerp(low, edge * edge * 0.3);
    c.multiplyScalar(0.92 + 0.12 * Math.sin(x * 38 + z * 21)); // scales
  });
  return g;
}

function head() {
  // built round a neck pivot at the origin, looking along +z
  const skin = new THREE.Color(0x8d9a52); const pale = new THREE.Color(0xd9cf8e);
  const skull = ball(0.19, 0.16, 0.27, 0, 0.0, 0.26, 12, 8);
  colour(skull, (c, x, y, z) => {
    c.copy(skin).lerp(pale, Math.max(0, -y / 0.16) * 0.7);
    c.multiplyScalar(0.9 + 0.14 * Math.sin(x * 70) * Math.sin(z * 60)); // small scales
    if (Math.abs(y - 0.07) < 0.025 && z > 0.2) c.multiplyScalar(0.85);
  });
  const neck = colour(ball(0.16, 0.13, 0.2, 0, -0.01, 0.0, 8, 5), (c, x, y) => c.copy(skin).lerp(pale, Math.max(0, -y / 0.13) * 0.7));
  const beak = flat(ball(0.09, 0.055, 0.1, 0, -0.04, 0.5, 6, 4), 0xc9bd7a);
  const brow = flat(ball(0.13, 0.04, 0.12, 0, 0.1, 0.42, 6, 3), 0x6f7a3c);
  const eyes = [-1, 1].map((sx) => flat(ball(0.036, 0.04, 0.036, sx * 0.145, 0.055, 0.4, 6, 4), 0x14180f));
  const glints = [-1, 1].map((sx) => flat(ball(0.011, 0.011, 0.011, sx * 0.158, 0.075, 0.425, 4, 2), 0xfff8e0));
  return mergeGeometries([skull, neck, beak, brow, ...eyes, ...glints], false);
}

// createSela(scene) -> { group, update(t, still, yaw, yawLater, pose), dispose }  (the caller sets her place and heading)
export function buildSela() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const rear = (sx) => {
    const g = paddle(0.4, 0.13, 0x6f8447, 0xcfc58a);
    g.rotateY(sx > 0 ? 0.7 : 2.44); // out and back from the hind end
    return g.translate(sx * 0.2, 0.0, -0.46);
  };
  const tail = flat(ball(0.05, 0.04, 0.16, 0, 0.0, -0.74, 6, 4), 0x7f8c4c);
  const hullGeo = mergeGeometries([shell(), rear(1), rear(-1), tail], false);
  const headGeo = head();
  const flipGeo = paddle(1.05, 0.28, 0x748b4b, 0xd6cc90);
  const hull = new THREE.Mesh(hullGeo, mat);
  const headMesh = new THREE.Mesh(headGeo, mat);
  headMesh.position.set(0, 0.05, 0.5);
  const right = new THREE.Mesh(flipGeo, mat);
  const left = new THREE.Mesh(flipGeo, mat);
  right.position.set(0.36, 0.0, 0.2);
  left.position.set(-0.36, 0.0, 0.2);
  left.scale.x = -1;
  const group = new THREE.Group();
  group.name = 'reef:sela';
  group.add(hull, headMesh, right, left);
  group.scale.setScalar(1.15);
  group.traverse((o) => { if (o.isMesh) Object.assign(o.userData, { noCast: true, noContactShadow: true, noMerge: true }); o.frustumCulled = false; });
  const att = {};
  return {
    group,
    hull, head: headMesh, right, left,
    update(t, still, yaw, yawLater) {
      selaAttitude(t, still, yaw, yawLater, att);
      group.rotation.set(att.pitch, yaw, att.roll, 'YXZ');
      right.rotation.set(0, att.sweep, att.flap);
      left.rotation.set(0, -att.sweep, -att.flap);
      headMesh.rotation.set(att.headPitch, att.headYaw, 0);
    },
    dispose() { hullGeo.dispose(); headGeo.dispose(); flipGeo.dispose(); mat.dispose(); },
  };
}
