// =============================================================================
// THE REEF: BEAUTY PASS 2 (pooled points only: no mesh, so not one triangle and no caster is added). What reads at play distance:
//   * two SHOALS of silvery fish (Points, ~200 glints): each school circles its own water, flashes as it turns, and SPLITS AROUND HER when she swims
//     into it (each fish springs away from the cat, then closes up again);
//   * BIOLUMINESCENT GLOW: a pulsing halo on each Sealab porthole and a swirl of coloured plankton round each of the three lantern corals;
//   * a BUBBLE TRAIL: her stroke leaves a short chain of bubbles behind her (a pool of 28 that she reuses);
//   * the water's TINT BY DEPTH: the fog goes from a warm sea-green near the surface to a cool blue down by the sand, by the camera's height.
// A pure function of (index, time) apart from the cat's push and the trail's pool; draws no random number and reads no clock.
// Reduced motion: the shoals stand still (no scatter), the plankton and halos do not move, no trail, the tint is held at its middle.
// The lite rung draws a third of the glints and no plankton. Nothing here is a rule.
// =============================================================================

import * as THREE from 'three';
import * as P from './reefplan.js';
import * as W from './reefwing.js';
import { softDisc } from './reeflight.js';
import { hash01 } from './reefcritters.js';

const SALT = 0x62656175;
const H = (i, k) => hash01(i + k * 977, SALT);

export const SHOALS = Object.freeze([
  Object.freeze({ x: -9, z: 22, rx: 9, rz: 6, y: 3.2, w: 0.16, n: 150 }), // over the Kelp Garden and the Ladder: what she sees as she starts
  Object.freeze({ x: 15, z: 1, rx: 8, rz: 7, y: 3.6, w: -0.19, n: 110 }), // over the Coral Garden
]);
export const SHOAL_COUNT = Object.freeze({ high: 1, low: 0.6, lite: 0.35 });
export const SCATTER = Object.freeze({ radius: 5, push: 1.3, snap: 5, settle: 0.7 });
export const TRAIL = Object.freeze({ pool: 28, life: 1.6, gap: 0.07 });
// Sealab portholes (reeflabhull.js): north, south and west faces; the floor stands LAB_FLOOR_Y over the seabed's zero.
const LAB = Object.freeze({ minX: -0.5, minZ: -39.5, maxZ: -29.5, y: 0.45 + 2.0, pad: 0.7 });
export const WINDOWS = Object.freeze([
  ...[1.9, 4.9, 7.9, 10.9, 13.9].map((x) => ({ x, z: LAB.minZ - LAB.pad })),
  ...[1.9, 4.9, 7.9].map((x) => ({ x, z: LAB.maxZ + LAB.pad })),
  ...[-37.0, -34.5, -32.0].map((z) => ({ x: LAB.minX - LAB.pad, z })),
]);
export const MOTES_PER_LANTERN = 12;
const TINT = Object.freeze([[0.6, 0.85, 1.0], [1.0, 0.82, 0.45]]); // one school silver-blue, the other gold

// Points with a size and a colour each (additive, soft round dot). Colour is the brightness too (additive), so a dim point is a faint one.
export function makeGlow(n, size, maxPx = 400) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const mat = new THREE.PointsMaterial({ size, sizeAttenuation: true, map: softDisc(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aS;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aS;')
      .replace('#include <logdepthbuf_vertex>', `gl_PointSize = min(gl_PointSize, ${maxPx.toFixed(1)});\n#include <logdepthbuf_vertex>`);
  };
  mat.customProgramCacheKey = () => `reef-glow-points-${maxPx}`;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
  return pts;
}

export const shoalSize = (rung) => SHOALS.reduce((a, s) => a + Math.round(s.n * (SHOAL_COUNT[rung] ?? 1)), 0);

// Where glint i of a shoal is at time t, before the cat's push: { x, y, z, flash }. A school of points circling on a loop with its own spread.
export function glintPose(shoal, i, t, out = {}) {
  const ph = H(i, 1) * 6.2832;
  const a = (shoal.w * t + H(i, 2) * 0.22) * 6.2832; // along the loop, spread over a fifth of it so the school is a long cloud
  const breathe = 1 + 0.12 * Math.sin(t * 0.21 + shoal.x);
  const r = (0.75 + 0.5 * H(i, 3)) * breathe;
  out.x = shoal.x + Math.cos(a) * shoal.rx * r + Math.sin(t * 0.9 + ph) * 0.9;
  out.z = shoal.z + Math.sin(a) * shoal.rz * r + Math.cos(t * 0.8 + ph) * 0.9;
  out.y = Math.max(P.reefY(out.x, out.z) + 1.2, shoal.y + (H(i, 4) - 0.5) * 2.4 + 0.4 * Math.sin(t * 0.5 + ph));
  const s = Math.sin(t * (1.6 + 1.4 * H(i, 5)) + ph + a * 3); // the glint: a fish turning its side to the light
  out.flash = 0.25 + 0.75 * Math.max(0, s) ** 3;
  return out;
}

export function createReefBeauty2({ scene, reducedMotion = false, rung = 'high' }) {
  const group = new THREE.Group();
  group.name = 'reefBeauty2';
  const pose = {};

  // ---- the shoals
  const k = SHOAL_COUNT[rung] ?? 1;
  const counts = SHOALS.map((s) => Math.round(s.n * k));
  const nFish = counts.reduce((a, b) => a + b, 0);
  const shoal = makeGlow(nFish, 0.4, 26);
  shoal.name = 'reef:shoal';
  const off = new Float32Array(nFish * 3);
  const sp = shoal.geometry.attributes.position; const sc = shoal.geometry.attributes.color; const ss = shoal.geometry.attributes.aS;
  for (let i = 0; i < nFish; i++) ss.setX(i, 0.75 + 0.5 * H(i, 6));
  group.add(shoal);

  // ---- the glow: portholes, lantern halos and their plankton
  const motes = rung === 'lite' ? 0 : MOTES_PER_LANTERN;
  const nGlow = WINDOWS.length + W.LANTERNS.length + motes * W.LANTERNS.length;
  const glow = makeGlow(nGlow, 1);
  glow.name = 'reef:biolight';
  const gp = glow.geometry.attributes.position; const gc = glow.geometry.attributes.color; const gs = glow.geometry.attributes.aS;
  const win = new THREE.Color(0xffd69a);
  const tmp = new THREE.Color();
  group.add(glow);

  // ---- the trail
  const trail = makeGlow(TRAIL.pool, 0.22, 20);
  trail.name = 'reef:trail';
  const tp = trail.geometry.attributes.position; const tc = trail.geometry.attributes.color; const ts = trail.geometry.attributes.aS;
  const tAge = new Float32Array(TRAIL.pool).fill(99);
  const tVel = new Float32Array(TRAIL.pool * 3);
  let tNext = 0; let tClock = 0; let tLast = 0;
  const last = new THREE.Vector3(); let haveLast = false;
  if (!reducedMotion) group.add(trail);
  scene.add(group);

  // ---- the tint
  const fog = scene.fog?.isFog ? scene.fog : null;
  const warm = new THREE.Color(0x58b8a4); const cool = new THREE.Color(0x3a88a8); const base = fog ? fog.color.clone() : null;
  const mid = new THREE.Color();

  const drawShoal = (t, cat, dt) => {
    let i = 0;
    SHOALS.forEach((s, si) => {
      for (let j = 0; j < counts[si]; j++, i++) {
        glintPose(s, j + si * 200, t, pose);
        if (!reducedMotion && cat) {
          const dx = pose.x - cat.x; const dy = pose.y - (cat.y + 0.5); const dz = pose.z - cat.z;
          const d = Math.hypot(dx, dy, dz) || 0.001;
          const near = d < SCATTER.radius;
          const push = near ? (SCATTER.radius - d) * SCATTER.push : 0;
          const rate = Math.min(1, dt * (near ? SCATTER.snap : SCATTER.settle));
          const o = i * 3;
          off[o] += ((dx / d) * push - off[o]) * rate;
          off[o + 1] += ((dy / d) * push * 0.5 - off[o + 1]) * rate;
          off[o + 2] += ((dz / d) * push - off[o + 2]) * rate;
        }
        sp.setXYZ(i, pose.x + off[i * 3], pose.y + off[i * 3 + 1], pose.z + off[i * 3 + 2]);
        const f = pose.flash;
        const tn = TINT[si % TINT.length];
        sc.setXYZ(i, tn[0] * f, tn[1] * f, tn[2] * f);
      }
    });
    sp.needsUpdate = true; sc.needsUpdate = true; ss.needsUpdate = true;
  };

  const drawGlow = (t) => {
    let i = 0;
    for (let w = 0; w < WINDOWS.length; w++, i++) {
      const p = WINDOWS[w];
      const pulse = reducedMotion ? 0.8 : 0.72 + 0.28 * Math.sin(t * 0.9 + w * 1.7);
      gp.setXYZ(i, p.x, LAB.y, p.z);
      gc.setXYZ(i, win.r * 0.55 * pulse, win.g * 0.55 * pulse, win.b * 0.55 * pulse);
      gs.setX(i, 3.2);
    }
    W.LANTERNS.forEach((l, li) => {
      const hex = W.LANTERN_COLORS[li];
      const pulse = reducedMotion ? 0.8 : 0.7 + 0.3 * Math.sin(t * 1.1 + li * 2.3);
      tmp.set(hex);
      gp.setXYZ(i, l.x, P.reefY(l.x, l.z) + l.h * 0.7, l.z);
      gc.setXYZ(i, tmp.r * 0.38 * pulse, tmp.g * 0.38 * pulse, tmp.b * 0.38 * pulse);
      gs.setX(i, 10);
      i++;
      for (let m = 0; m < motes; m++, i++) {
        const q = li * 40 + m;
        const a = (reducedMotion ? 0 : t) * (0.25 + 0.3 * H(q, 7)) * (H(q, 8) < 0.5 ? 1 : -1) + H(q, 9) * 6.2832;
        const r = 0.9 + 1.5 * H(q, 10);
        gp.setXYZ(i, l.x + Math.cos(a) * r, P.reefY(l.x, l.z) + 0.4 + H(q, 11) * (l.h + 0.8) + (reducedMotion ? 0 : 0.25 * Math.sin(t * 0.7 + q)), l.z + Math.sin(a) * r);
        const tw = reducedMotion ? 0.8 : 0.45 + 0.55 * Math.max(0, Math.sin(t * (1.1 + H(q, 12)) + q));
        gc.setXYZ(i, tmp.r * 0.9 * tw, tmp.g * 0.9 * tw, tmp.b * 0.9 * tw);
        gs.setX(i, 0.22 + 0.2 * H(q, 13));
      }
    });
    gp.needsUpdate = true; gc.needsUpdate = true; gs.needsUpdate = true;
  };

  const stepTrail = (dt, cat, swimming) => {
    tClock += dt;
    if (cat) {
      const moved = haveLast ? last.distanceTo(cat) / Math.max(dt, 1e-3) : 0;
      if (swimming && moved > 0.8 && tClock - tLast > TRAIL.gap) {
        tLast = tClock;
        const n = tNext; tNext = (tNext + 1) % TRAIL.pool;
        tAge[n] = 0;
        tp.setXYZ(n, cat.x, cat.y + 0.35, cat.z); // (a pool slot: the stroke's own bubbles, their drift hashed from the slot and the moment)
        tVel[n * 3] = (H(n + Math.floor(tClock * 10), 14) - 0.5) * 0.3;
        tVel[n * 3 + 1] = 0.45 + 0.4 * H(n + Math.floor(tClock * 10), 15);
        tVel[n * 3 + 2] = (H(n + Math.floor(tClock * 10), 16) - 0.5) * 0.3;
      }
      last.copy(cat); haveLast = true;
    }
    for (let n = 0; n < TRAIL.pool; n++) {
      if (tAge[n] > TRAIL.life) { tc.setXYZ(n, 0, 0, 0); continue; }
      tAge[n] += dt;
      const u = tAge[n] / TRAIL.life;
      tp.setXYZ(n, tp.getX(n) + tVel[n * 3] * dt, tp.getY(n) + tVel[n * 3 + 1] * dt, tp.getZ(n) + tVel[n * 3 + 2] * dt);
      const a = Math.max(0, 1 - u) * Math.min(1, tAge[n] * 8);
      tc.setXYZ(n, 0.8 * a, 1.0 * a, 1.0 * a);
      ts.setX(n, 0.7 + 0.8 * H(n, 17) + 0.4 * u);
    }
    tp.needsUpdate = true; tc.needsUpdate = true; ts.needsUpdate = true;
  };

  let clock = 0;
  const api = {
    group, shoal, glow, trail, counts: { fish: nFish, glow: nGlow, trail: TRAIL.pool },
    update(dt, t, cat, camera, swimming = false) {
      dt = Math.max(0, Math.min(dt, 1)) || 0;
      clock += dt;
      const tt = reducedMotion ? 0 : clock;
      drawShoal(tt, cat, dt);
      drawGlow(tt);
      if (!reducedMotion) stepTrail(dt, cat, swimming);
      if (fog && base) {
        const cy = reducedMotion ? 3 : camera?.position?.y ?? 3;
        const u = Math.min(1, Math.max(0, (cy - 0.4) / 5.5));
        mid.copy(cool).lerp(warm, u);
        fog.color.copy(mid);
      }
    },
    dispose() {
      scene.remove(group);
      for (const p of [shoal, glow, trail]) { p.geometry.dispose(); p.material.dispose(); }
      if (fog && base) fog.color.copy(base);
    },
  };
  return api;
}
