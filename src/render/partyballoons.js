import * as THREE from 'three';
import { FLAT_GROUND } from '../ground.js';
import { underCeiling } from '../caves.js';

// ---------------------------------------------------------------------------
// THE BIRTHDAY BALLOONS (2026-11-21; src/ui/party.js birthdayPartyOn): while
// the party is on, two balloons bob along behind her cat on soft strings,
// like a gentle tail. Pure decoration on this device only: no collider, no
// wire event, no walkRng or Math.random (the bob is a function of time).
//
// THE BUDGET. One InstancedMesh (both balloons) and one LineSegments (both
// strings): two main-pass draws, none in the shadow pass, nothing allocated
// per frame. Hidden (0 draws) while she swims, rides, or is under a ceiling
// (a cave), where a balloon would poke through the rock; never in the den,
// which is indoors.
//
// Each balloon springs toward a spot behind and above her back, is pushed out
// of the area's colliders (circles, so it never sits inside a wall or a tree
// trunk; it may float above a low thing), kept under any ceiling and over the
// ground, and held to its string's length.
// ---------------------------------------------------------------------------

export const BALLOON_COUNT = 2;
export const STRING_LEN = 1.25; // metres, her back to the balloon's knot
const COLORS = [0xf27ab0, 0x4ec9d4]; // pink and turquoise, the party's
const SIDE = [-0.2, 0.24]; // metres to her left / right
const BACK = 0.45; // metres behind her
const TIE_Y = 0.3; // the string's end on her back, over her paws
const RADIUS = 0.2;
const SEGS = 8; // per string
const TELEPORT = 3;
const DRAG = 0.4; // metres further back at a run
const NEAR = STRING_LEN + 2.5; // metres: colliders a balloon could touch before the list is redone // a jump further than this in a frame snaps them to her

const NO_BALLOONS = Object.freeze({ mesh: null, update() {}, positionOf() { return null; }, dispose() {} });

// A balloon: a lathed teardrop with its knot at y 0, the body above.
function balloonGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    const r = Math.sin(a) * RADIUS * (1 - 0.18 * Math.cos(a));
    pts.push(new THREE.Vector2(Math.max(r, 0.012), RADIUS * 1.15 * (1 - Math.cos(a)) + 0.03));
  }
  pts.unshift(new THREE.Vector2(0.001, 0), new THREE.Vector2(0.022, 0.012));
  const g = new THREE.LatheGeometry(pts.reverse(), 14);
  g.computeVertexNormals();
  return g;
}

// createPartyBalloons(scene, { on, areaId, areaData, ground, reducedMotion, dusk })
// — the per-walk rig in the session's { update, dispose } shape; the no-op
// stub when the party is off or in the den.
export function createPartyBalloons(scene, { on = false, areaId, areaData, ground = FLAT_GROUND, reducedMotion = false, dusk = false } = {}) {
  if (!on || areaId === 'den') return NO_BALLOONS;
  const colliders = areaData?.colliders ?? [];
  const bob = reducedMotion ? { amp: 0.025, rate: 0.7 } : { amp: 0.09, rate: 1.5 };

  const material = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0 });
  // A little of their own colour as glow, more at dusk, so they read at night.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
totalEmissiveRadiance += diffuseColor.rgb * ${dusk ? '0.4' : '0.12'};`);
  };
  material.customProgramCacheKey = () => `whisker-balloons-${dusk ? 1 : 0}`;
  const mesh = new THREE.InstancedMesh(balloonGeometry(), material, BALLOON_COUNT);
  mesh.name = 'partyBalloons';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const c = new THREE.Color();
  for (let i = 0; i < BALLOON_COUNT; i++) mesh.setColorAt(i, c.setHex(COLORS[i]));

  const linePos = new Float32Array(BALLOON_COUNT * SEGS * 2 * 3);
  const lineGeo = new THREE.BufferGeometry();
  const lineAttr = new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('position', lineAttr);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf4f0f8, transparent: true, opacity: 0.85 });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.name = 'partyStrings';
  lines.castShadow = false;
  lines.frustumCulled = false;
  scene.add(mesh, lines);

  const pos = Array.from({ length: BALLOON_COUNT }, () => new THREE.Vector3());
  const vel = Array.from({ length: BALLOON_COUNT }, () => new THREE.Vector3());
  const prev = new THREE.Vector3();
  const tie = new THREE.Vector3();
  const target = new THREE.Vector3();
  const d3 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const s3 = new THREE.Vector3(1, 1, 1);
  const m4 = new THREE.Matrix4();
  const last = { x: NaN, z: NaN, vx: 0, vz: 0 }; // her last spot and eased velocity
  const near = []; // the colliders within NEAR of nearAt; grows once, then reused
  const nearAt = { x: NaN, z: NaN };

  function setVisible(v) {
    mesh.visible = v;
    lines.visible = v;
  }

  function targetOf(i, x, y, z, yaw, t) {
    // Her forward is (sin yaw, cos yaw); her right (-cos yaw, sin yaw).
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const ph = t * bob.rate + i * 2.1;
    // Trailing a little further back the faster she goes (at most DRAG m).
    const sp = Math.hypot(last.vx, last.vz);
    const drag = sp > 1e-3 ? Math.min(DRAG, sp * 0.12) / sp : 0;
    target.set(
      x - fx * BACK - fz * SIDE[i] - last.vx * drag + Math.sin(ph * 0.7) * bob.amp * 0.5,
      y + TIE_Y + STRING_LEN * 0.92 + Math.sin(ph) * bob.amp,
      z - fz * BACK + fx * SIDE[i] - last.vz * drag + Math.cos(ph * 0.6) * bob.amp * 0.5,
    );
    return target;
  }

  // update(dt, t, { x, y, z, yaw, hidden }) — once a frame with her cat's
  // pose; `hidden` while she swims or rides. Keeps no reference to the pose.
  function update(dt, t, { x, y = 0, z, yaw = 0, hidden = false } = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const h = Math.min(Math.max(dt || 0, 0), 0.05);
    const jump = !Number.isFinite(last.x) || Math.hypot(x - last.x, z - last.z) > TELEPORT;
    if (jump) { last.vx = 0; last.vz = 0; } else if (h > 0) {
      const e = Math.min(1, h * 8);
      last.vx += ((x - last.x) / h - last.vx) * e;
      last.vz += ((z - last.z) / h - last.vz) * e;
    }
    last.x = x;
    last.z = z;
    if (hidden || underCeiling(ground, x, y, z)) { setVisible(false); last.x = NaN; return; }
    setVisible(true);
    tie.set(x, y + TIE_Y, z);
    if (jump || Math.hypot(x - nearAt.x, z - nearAt.z) > 1) {
      nearAt.x = x;
      nearAt.z = z;
      near.length = 0;
      for (const col of colliders) {
        if (Math.hypot(col.x - x, col.z - z) < col.r + NEAR) near.push(col);
      }
    }
    let tucked = false;
    for (let i = 0; i < BALLOON_COUNT; i++) {
      const p = pos[i];
      const v = vel[i];
      targetOf(i, x, y, z, yaw, t);
      if (jump) { p.copy(target); v.set(0, 0, 0); }
      prev.copy(p);
      // A soft, critically damped spring that moves along with her (damped
      // against her velocity, so it does not fall ever further behind): a
      // lazy, floaty follow that swings out on turns and starts.
      v.x += (8 * (target.x - p.x) - 5.6 * (v.x - last.vx)) * h;
      v.y += (8 * (target.y - p.y) - 5.6 * v.y) * h;
      v.z += (8 * (target.z - p.z) - 5.6 * (v.z - last.vz)) * h;
      p.addScaledVector(v, h);
      // Apart from each other.
      if (i > 0) {
        d3.subVectors(p, pos[0]);
        const dl = d3.length();
        if (dl < RADIUS * 2.1 && dl > 1e-4) p.addScaledVector(d3, (RADIUS * 2.1 - dl) / dl);
      }
      // On its string.
      d3.subVectors(p, tie);
      const len = d3.length();
      if (len > STRING_LEN) p.copy(tie).addScaledVector(d3, STRING_LEN / len);
      // Out of walls and trunks, last, so the string never pulls it back in
      // (only the colliders near her, listed when she has moved a metre).
      for (let c = 0; c < near.length; c++) {
        const col = near[c];
        const dx = p.x - col.x;
        const dz = p.z - col.z;
        const min = col.r + RADIUS;
        const dd = dx * dx + dz * dz;
        if (dd < min * min && dd > 1e-8) {
          const dl = Math.sqrt(dd);
          p.x = col.x + (dx / dl) * min;
          p.z = col.z + (dz / dl) * min;
        }
      }
      // Over the ground, under a ceiling; where one is too low to float
      // under (an eave of rock she is beside), they hide.
      const floor = ground.y(p.x, p.z) + 0.4;
      if (p.y < floor) p.y = floor;
      const ceil = ground.ceil(p.x, p.z); // null or Infinity in the open
      if (Number.isFinite(ceil) && p.y > ceil - RADIUS * 2.6) {
        p.y = ceil - RADIUS * 2.6;
        if (p.y < floor) tucked = true;
      }
      if (h > 0) v.subVectors(p, prev).divideScalar(h);
      // The balloon leans along its string.
      d3.subVectors(p, tie).normalize();
      q.setFromUnitVectors(up, d3);
      mesh.setMatrixAt(i, m4.compose(p, q, s3));
      // The string: a gentle sag from her back to the knot.
      const sag = Math.max(0, STRING_LEN - len) * 0.5 + 0.06;
      for (let k = 0, o = i * SEGS * 6; k < SEGS * 2; k++, o += 3) {
        const u = ((k + 1) >> 1) / SEGS; // 0, 1/8, 1/8, 2/8, 2/8, ...
        linePos[o] = tie.x + (p.x - tie.x) * u;
        linePos[o + 1] = tie.y + (p.y - tie.y) * u - Math.sin(u * Math.PI) * sag;
        linePos[o + 2] = tie.z + (p.z - tie.z) * u;
      }
    }
    if (tucked) { setVisible(false); last.x = NaN; return; }
    mesh.instanceMatrix.needsUpdate = true;
    lineAttr.needsUpdate = true;
  }

  function dispose() {
    scene.remove(mesh, lines);
    mesh.geometry.dispose();
    material.dispose();
    mesh.dispose();
    lineGeo.dispose();
    lineMat.dispose();
  }

  return { mesh, lines, update, positionOf: (i) => pos[i], dispose };
}
