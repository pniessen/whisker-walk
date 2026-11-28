// =============================================================================
// THE CRYSTAL CAVE: IT REACTS AND LIVES (beauty round 3). One pooled Points (no mesh, no light, no collider) and the decor shader's two uniforms:
//   * the CAT'S GLOW: every glowing thing within a few metres of her brightens as she passes and fades back as she leaves (uCat in crystaldecorparts.js);
//   * FOOTSTEP SPARKLES: a few soft sparks rise from her paws as she walks, coloured by the chamber she is in; in the Blue Pool her paws also make spreading rings (uRip);
//   * GLOW CREATURES: tiny lights that drift and gather round the hero crystals, brighter when she is near;
//   * a rare SHOOTING SPARKLE that streaks across the view from the dome side.
// Reduced motion: only the brightening near her stays (nothing moves); no sparks, creatures, rings or meteor. LOW/LITE: fewer sparks and creatures, no meteor.
// Draws no Math.random (hash of the counters only). Nothing here is solid, a find or a rule.
// =============================================================================

import * as THREE from 'three';
import { dotTexture } from './crystalparts.js';
import { planCreatures, hueNear, ZONE_RGB } from './crystaldecor.js';
import * as W from './crystalwingplan.js';

export const ALIVE = Object.freeze({ sparks: 18, creatures: 14, trail: 12, step: 0.55, sparkLife: 1.1, meteorEvery: 24, meteorAt: 5, meteorLen: 1.5, ringLife: 1.7, ringStep: 0.5, glowIn: 2.5 });
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const lowTier = (tier) => !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);

// createCrystalAlive({ scene, decor, tier, reducedMotion }) -> { points, update(dt, t, catPos, camera), meteorNow(t), counts, dispose() }
export function createCrystalAlive({ scene, decor, tier = null, reducedMotion = false }) {
  const low = lowTier(tier);
  const nSp = low ? 9 : ALIVE.sparks; const nCr = low ? 7 : ALIVE.creatures; const nTr = low || reducedMotion ? 0 : ALIVE.trail;
  const total = nSp + nCr;
  const pos = new Float32Array(total * 3).fill(-999);
  const col = new Float32Array(total * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.02, size: 0.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  points.name = 'crystal:alive';
  points.frustumCulled = false;
  Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(points);

  // the shooting sparkle is its own little Points (bigger dots; hidden unless a streak is on)
  const mPos = new Float32Array(Math.max(1, nTr) * 3).fill(-999); const mCol = new Float32Array(Math.max(1, nTr) * 3);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3)); mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  const meteor = new THREE.Points(mGeo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: 0.9, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  meteor.name = 'crystal:meteor'; meteor.frustumCulled = false; meteor.visible = false;
  Object.assign(meteor.userData, { noCast: true, noContactShadow: true, noMerge: true });
  if (nTr) scene.add(meteor);
  const creatures = planCreatures(ALIVE.creatures).slice(0, nCr);
  const sparks = Array.from({ length: nSp }, () => ({ age: 99, x: 0, y: 0, z: 0, rgb: [1, 1, 1] }));
  let slot = 0; let walked = 0; let ringWalked = 0; let ringSlot = 0; let n = 0;
  let last = null; let glow = reducedMotion ? 1 : 0;
  const ringAge = [9, 9, 9];
  let meteorShift = 0;
  const U = decor?.uniforms;
  const tmp = new THREE.Vector3(); const right = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);

  const put = (i, x, y, z, r, g, b) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; };

  function spawnSpark(x, y, z, rgb) {
    const s = sparks[slot]; slot = (slot + 1) % sparks.length; n++;
    s.age = 0; s.x = x + (hash(n, 1) - 0.5) * 0.5; s.z = z + (hash(n, 2) - 0.5) * 0.5; s.y = y + 0.05; s.rgb = rgb; s.dx = (hash(n, 3) - 0.5) * 0.5; s.dz = (hash(n, 4) - 0.5) * 0.5;
  }

  return {
    points,
    counts: { sparks: nSp, creatures: nCr, trail: nTr },
    meteorNow(t) { meteorShift = ALIVE.meteorEvery - ((t - ALIVE.meteorAt) % ALIVE.meteorEvery + ALIVE.meteorEvery) % ALIVE.meteorEvery; },
    update(dt, t, catPos, camera) {
      dt = Math.max(0, Math.min(dt, 0.25)) || 0;
      glow = reducedMotion ? 1 : Math.min(1, glow + dt / ALIVE.glowIn * 1.5);
      if (U && catPos) { U.cat.value.set(catPos.x, catPos.y ?? 0, catPos.z, glow); U.catL.value.set(catPos.x, catPos.y ?? 0, catPos.z, glow * 0.4); } // (the additive floor light gets less, so it never blows out)
      if (reducedMotion) { points.visible = false; meteor.visible = false; return; }
      points.visible = true;
      // footsteps: a spark every ALIVE.step metres of walking; rings in the Blue Pool
      if (catPos) {
        if (last && dt > 0) {
          const d = Math.min(2, Math.hypot(catPos.x - last.x, catPos.z - last.z));
          walked += d; ringWalked += d;
          if (walked >= ALIVE.step) { walked = 0; spawnSpark(catPos.x, catPos.y ?? 0, catPos.z, ZONE_RGB[hueNear(catPos.x, catPos.z)]); }
          const inPool = Math.hypot(catPos.x - W.POOL.x, catPos.z - W.POOL.z) < W.POOL.r + 0.6;
          if (inPool && ringWalked >= ALIVE.ringStep && U) { ringWalked = 0; U.rip.value[ringSlot].set(catPos.x, catPos.z, 0.0001, 0); ringAge[ringSlot] = 0; ringSlot = (ringSlot + 1) % 3; spawnSpark(catPos.x, catPos.y ?? 0, catPos.z, [0.5, 0.9, 1]); }
        }
        last = { x: catPos.x, z: catPos.z };
      }
      if (U) for (let k = 0; k < 3; k++) { if (ringAge[k] < 1) { ringAge[k] = Math.min(1, ringAge[k] + dt / ALIVE.ringLife); U.rip.value[k].z = ringAge[k] >= 1 ? 9 : ringAge[k]; } }
      sparks.forEach((s, i) => {
        s.age += dt;
        const k = s.age / ALIVE.sparkLife;
        if (k >= 1) { put(i, 0, -999, 0, 0, 0, 0); return; }
        const f = (1 - k) * (1 - k);
        put(i, s.x + s.dx * k, s.y + 0.15 + k * 0.7, s.z + s.dz * k, s.rgb[0] * f + 0.25 * f, s.rgb[1] * f + 0.25 * f, s.rgb[2] * f + 0.25 * f);
      });
      // the glow creatures: slow loops round their crystal, brighter as she comes near
      creatures.forEach((c, j) => {
        const a = c.ph + t * c.rate;
        const x = c.x + Math.cos(a) * c.rad; const z = c.z + Math.sin(a * 0.83) * c.rad; const y = c.y + 0.35 * Math.sin(a * 1.7);
        const near = catPos ? Math.max(0, 1 - Math.hypot(catPos.x - x, catPos.z - z) / 8) : 0;
        const f = (0.45 + 0.35 * Math.sin(t * 1.3 + c.ph * 3)) * (0.6 + 0.9 * near);
        put(nSp + j, x, y + Math.max(0, 0), z, (c.rgb[0] * 0.7 + 0.3) * f, (c.rgb[1] * 0.7 + 0.3) * f, (c.rgb[2] * 0.7 + 0.3) * f);
      });
      // the shooting sparkle: every ALIVE.meteorEvery seconds, a streak across the upper view (placed from the camera so it is seen, not hidden behind the dome)
      if (nTr && camera) {
        const tt = t + meteorShift; const cyc = Math.floor((tt - ALIVE.meteorAt) / ALIVE.meteorEvery); const loc = tt - ALIVE.meteorAt - cyc * ALIVE.meteorEvery;
        const on = cyc >= 0 && loc < ALIVE.meteorLen;
        camera.getWorldDirection(tmp); tmp.y = 0; if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, -1); tmp.normalize();
        right.crossVectors(tmp, up).normalize();
        const side = hash(cyc, 11) < 0.5 ? -1 : 1; const hgt = 5.5 + hash(cyc, 12) * 2; const dist = 16 + hash(cyc, 13) * 4;
        for (let i = 0; i < nTr; i++) {
          const u = Math.max(0, loc / ALIVE.meteorLen - i * 0.02);
          if (!on || u <= 0 || u >= 1) { mPos.set([0, -999, 0], i * 3); mCol.set([0, 0, 0], i * 3); continue; }
          const sx = side * (14 - u * 28); const f = (1 - i / nTr) * Math.sin(u * 3.14159) * 1.3;
          mPos.set([camera.position.x + tmp.x * dist + right.x * sx, hgt - u * 2.5, camera.position.z + tmp.z * dist + right.z * sx], i * 3); mCol.set([1.0 * f, 0.95 * f, 0.8 * f], i * 3);
        }
        meteor.visible = on; mGeo.attributes.position.needsUpdate = true; mGeo.attributes.color.needsUpdate = true;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    },
    dispose() { scene.remove(points, meteor); geo.dispose(); points.material.dispose(); mGeo.dispose(); meteor.material.dispose(); },
  };
}
