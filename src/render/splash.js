import * as THREE from 'three';

// ---------------------------------------------------------------------------
// SPLASHES — droplets, ripples, a swimmer's V-wake and the shake's puff of
// spray (swimming, Task 7).
//
// THE BUDGET. Two InstancedMeshes, one per kind: the droplets and the rings.
// At most TWO main-pass draw calls, none in the shadow pass (castShadow and
// receiveShadow false), and NONE when no cat is in the water: a mesh is
// `visible` only while it holds a live instance. Each pool is a fixed ring
// buffer sized by the quality tier (splashDrops, splashRings); a new effect
// overwrites the oldest slot, and nothing is allocated after construction.
//
// Every frame update() compacts the live slots into instances 0..n-1, so
// `count` is exactly the live count and a dead slot costs nothing.
//
// The rings fade on a per-instance `aAlpha` attribute patched into
// MeshBasicMaterial, the way render/pawprints.js patches its prints.
//
// PURELY LOCAL. Nothing here touches the walk's seeded RNG or the wire; the
// droplets' scatter comes from a tiny private generator.
//
// REDUCED MOTION: no splashes, ripples or wake. The shake is a short puff of
// 6 droplets only (splashEmits says so; the pools just obey).
// ---------------------------------------------------------------------------

// Above every water surface: the highest is the Seaside sea at 0.05, and the
// water plane is opaque, so a ring must sit on top of it.
export const RING_Y = 0.06;

const GRAVITY = 9.8;
const MOVING = 0.3; // speed (m/s) above which a cat is "moving" for effects
const ENTER_SPEED = 1; // a faster entry throws a splash
const WADE_EVERY = 0.22; // s between wading drop bursts
const WAKE_EVERY = 0.16; // s between wake pairs
const RING_EVERY = 0.6; // s between head rings while swimming
const STILL_RING_EVERY = 1.1; // s between rings while floating still
const WADE_DROPS = 3;
const ENTER_DROPS = 6;
const PUFF_DROPS = 16;
const RM_PUFF_DROPS = 6;

const DROP_TTL = 0.45;
const PUFF_TTL = 0.6;
const RM_PUFF_TTL = 0.3;

// A ring grows r0 -> r1 metres over ttl seconds and fades out.
const RING = { r0: 0.15, r1: 0.6, ttl: 1.2 };
const STILL_RING = { r0: 0.2, r1: 0.9, ttl: 1.6 };
const WAKE_SIDE = 0.18; // × cat scale, to each side
const WAKE_BACK = 0.35; // × cat scale, behind
const WAKE_DRIFT = 0.5; // m/s, out and back: the V
const RING_ALPHA = 0.55;

// splashEmits(st, speed, dt, reducedMotion, out) -> out
// Pure: advances st.fxClock / st.ringClock and fills `out` with this frame's
// counts — drops (droplets), wake (left-and-right ring pairs), ring (head or
// still rings) and puff (shake droplets).
export function splashEmits(st, speed, dt, reducedMotion, out) {
  out.drops = 0;
  out.wake = 0;
  out.ring = 0;
  out.puff = 0;
  if (st.shook) out.puff = reducedMotion ? RM_PUFF_DROPS : PUFF_DROPS;
  const moving = speed > MOVING;
  if (reducedMotion || st.mode === 'dry') {
    st.fxClock = 0;
    st.ringClock = 0;
    return out;
  }
  if (st.entered && speed > ENTER_SPEED) out.drops += ENTER_DROPS;
  if (st.mode === 'wade') {
    st.ringClock = 0;
    if (!moving) {
      st.fxClock = 0;
      return out;
    }
    st.fxClock += dt;
    if (st.fxClock >= WADE_EVERY) {
      st.fxClock = Math.min(st.fxClock - WADE_EVERY, WADE_EVERY);
      out.drops += WADE_DROPS;
    }
    return out;
  }
  // Swimming.
  st.ringClock += dt;
  if (moving) {
    st.fxClock += dt;
    if (st.fxClock >= WAKE_EVERY) {
      st.fxClock = Math.min(st.fxClock - WAKE_EVERY, WAKE_EVERY);
      out.wake = 1;
    }
    if (st.ringClock >= RING_EVERY) {
      st.ringClock = Math.min(st.ringClock - RING_EVERY, RING_EVERY);
      out.ring = 1;
    }
  } else {
    st.fxClock = 0;
    if (st.ringClock >= STILL_RING_EVERY) {
      st.ringClock = Math.min(st.ringClock - STILL_RING_EVERY, STILL_RING_EVERY);
      out.ring = 1;
    }
  }
  return out;
}

// The stub for an area with no water (the den, the neighbourhood).
export const NO_SPLASH = Object.freeze({
  meshes: Object.freeze([]),
  capacity: Object.freeze({ drops: 0, rings: 0 }),
  track() {},
  update() {},
  dispose() {},
  get drawCount() { return 0; },
});

// createSplash(scene, { areaData, tier, reducedMotion })
export function createSplash(scene, { areaData, tier, reducedMotion = false } = {}) {
  if (!areaData?.waters?.length) return NO_SPLASH;
  const dropCap = Math.max(1, Math.floor(tier?.splashDrops ?? 32));
  const ringCap = Math.max(1, Math.floor(tier?.splashRings ?? 20));

  // --- the droplets -------------------------------------------------------
  const dropGeo = new THREE.IcosahedronGeometry(0.025, 0);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.85 });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, dropCap);
  drops.name = 'splashDrops';
  // dp: [x, y, z, vx, vy, vz, age, ttl] per slot; a slot is live while age < ttl.
  const dp = new Float32Array(dropCap * 8);
  let dropHead = 0;

  // --- the rings ----------------------------------------------------------
  const ringGeo = new THREE.RingGeometry(0.85, 1, 24);
  ringGeo.rotateX(-Math.PI / 2); // flat, facing up
  const alphas = new Float32Array(ringCap);
  const aAlpha = new THREE.InstancedBufferAttribute(alphas, 1);
  aAlpha.setUsage(THREE.DynamicDrawUsage);
  ringGeo.setAttribute('aAlpha', aAlpha);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
  ringMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aAlpha;
varying float vRingAlpha;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRingAlpha = aAlpha;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vRingAlpha;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.a *= vRingAlpha;`);
  };
  ringMat.customProgramCacheKey = () => 'whisker-splash-rings';
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, ringCap);
  rings.name = 'splashRings';
  // rp: [x, z, vx, vz, age, ttl, r0, r1] per slot.
  const rp = new Float32Array(ringCap * 8);
  let ringHead = 0;

  for (const m of [drops, rings]) {
    m.userData.splash = true;
    m.castShadow = false;
    m.receiveShadow = false;
    // Instances move every frame; three's cached bounds would go stale.
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.visible = false;
    scene.add(m);
  }
  // Every slot starts dead.
  for (let i = 0; i < dropCap; i++) dp[i * 8 + 6] = dp[i * 8 + 7] = 1;
  for (let i = 0; i < ringCap; i++) rp[i * 8 + 4] = rp[i * 8 + 5] = 1;

  const out = { drops: 0, wake: 0, ring: 0, puff: 0 };
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  let seed = 0x2545f491;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  function spawnDrop(x, y, z, vx, vy, vz, ttl) {
    const o = (dropHead % dropCap) * 8;
    dropHead++;
    dp[o] = x; dp[o + 1] = y; dp[o + 2] = z;
    dp[o + 3] = vx; dp[o + 4] = vy; dp[o + 5] = vz;
    dp[o + 6] = 0; dp[o + 7] = ttl;
  }

  function spawnRing(x, z, vx, vz, kind) {
    const o = (ringHead % ringCap) * 8;
    ringHead++;
    rp[o] = x; rp[o + 1] = z; rp[o + 2] = vx; rp[o + 3] = vz;
    rp[o + 4] = 0; rp[o + 5] = kind.ttl; rp[o + 6] = kind.r0; rp[o + 7] = kind.r1;
  }

  // n drops from around (x, z) at height y, flung out at hMin..hMax m/s
  // horizontally and vMin..vMax up.
  function burst(n, x, y, z, spread, hMin, hMax, vMin, vMax, ttl) {
    for (let i = 0; i < n; i++) {
      const a = ((i + rand()) / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const h = hMin + (hMax - hMin) * rand();
      spawnDrop(x + c * spread, y, z + s * spread, c * h, vMin + (vMax - vMin) * rand(), s * h, ttl);
    }
  }

  // track(st, x, z, yaw, speed, scale, dt) — once per frame per cat in view,
  // after its water state has stepped this frame.
  function track(st, x, z, yaw, speed, scale, dt) {
    if (!st) return;
    const k = scale > 0 ? scale : 1;
    splashEmits(st, speed, dt, reducedMotion, out);
    // The cat faces -(sin yaw, cos yaw) (player.js: yaw = atan2(vx, vz) + PI).
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    if (out.drops > 0) {
      // A wading cat kicks up spray at its front paws; an entry splash is wider.
      const big = out.drops > WADE_DROPS;
      burst(out.drops, x + fx * 0.15 * k, 0.05, z + fz * 0.15 * k, big ? 0.12 * k : 0.06 * k,
        big ? 0.5 : 0.25, big ? 1.1 : 0.6, big ? 1.6 : 1.0, big ? 2.2 : 1.5, DROP_TTL);
    }
    if (out.puff > 0) {
      burst(out.puff, x, 0.22 * k, z, 0.1 * k, 1.0, 1.6, 0.6, 1.2, reducedMotion ? RM_PUFF_TTL : PUFF_TTL);
    }
    if (out.wake > 0) {
      // Side vector (perpendicular to forward) and behind; the two rings start
      // either side, behind the cat, and drift out-and-back: the V.
      const sx = -fz;
      const sz = fx;
      const bx = -fx;
      const bz = -fz;
      const d = WAKE_DRIFT / Math.SQRT2;
      for (let side = -1; side <= 1; side += 2) {
        spawnRing(
          x + (sx * side * WAKE_SIDE + bx * WAKE_BACK) * k,
          z + (sz * side * WAKE_SIDE + bz * WAKE_BACK) * k,
          (sx * side + bx) * d, (sz * side + bz) * d, RING,
        );
      }
    }
    if (out.ring > 0) spawnRing(x, z, 0, 0, speed > MOVING ? RING : STILL_RING);
  }

  // update(dt) — once per frame, after every track(): ages, moves and draws.
  function update(dt) {
    const t = Math.max(0, dt || 0);
    let n = 0;
    quat.identity();
    for (let i = 0; i < dropCap; i++) {
      const o = i * 8;
      if (dp[o + 6] >= dp[o + 7]) continue;
      dp[o + 6] += t;
      if (dp[o + 6] >= dp[o + 7]) continue;
      dp[o + 4] -= GRAVITY * t;
      dp[o] += dp[o + 3] * t;
      dp[o + 1] += dp[o + 4] * t;
      dp[o + 2] += dp[o + 5] * t;
      const u = dp[o + 6] / dp[o + 7];
      const s = 1 - 0.5 * u * u;
      pos.set(dp[o], Math.max(dp[o + 1], RING_Y), dp[o + 2]);
      scl.set(s, s, s);
      drops.setMatrixAt(n++, m4.compose(pos, quat, scl));
    }
    drops.count = n;
    drops.visible = n > 0;
    if (n > 0) drops.instanceMatrix.needsUpdate = true;

    n = 0;
    for (let i = 0; i < ringCap; i++) {
      const o = i * 8;
      if (rp[o + 4] >= rp[o + 5]) continue;
      rp[o + 4] += t;
      if (rp[o + 4] >= rp[o + 5]) continue;
      rp[o] += rp[o + 2] * t;
      rp[o + 1] += rp[o + 3] * t;
      const u = rp[o + 4] / rp[o + 5];
      const grow = 1 - (1 - u) * (1 - u); // ease out
      const r = rp[o + 6] + (rp[o + 7] - rp[o + 6]) * grow;
      pos.set(rp[o], RING_Y, rp[o + 1]);
      scl.set(r, 1, r);
      rings.setMatrixAt(n, m4.compose(pos, quat, scl));
      // A quick fade-in, then out as it grows.
      alphas[n] = RING_ALPHA * Math.min(1, rp[o + 4] / 0.08) * (1 - u) * (1 - u);
      n++;
    }
    rings.count = n;
    rings.visible = n > 0;
    if (n > 0) {
      rings.instanceMatrix.needsUpdate = true;
      aAlpha.needsUpdate = true;
    }
  }

  function dispose() {
    for (const m of [drops, rings]) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
  }

  return {
    meshes: [drops, rings],
    capacity: { drops: dropCap, rings: ringCap },
    track,
    update,
    dispose,
    get drawCount() { return (drops.visible ? 1 : 0) + (rings.visible ? 1 : 0); },
  };
}
