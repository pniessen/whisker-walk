// =============================================================================
// THE CRYSTAL CAVE: THE LIGHT (milestone C1). What the cave's glow does, all of it drawing and none of it a rule:
//   * a warm rose FOG (5 m from the eye, gone at 38 m), whose colour is the dome's horizon so the two agree;
//   * the crystals' slow PULSE: each hue's one merged mesh (userData.pulse) breathes its material colour by a few percent, out of step with the others;
//   * the GLINTS: tiny additive sparks that hang by the crystals and twinkle (one Points);
//   * LOW and LITE (the walk's low tier) drop the pulse and half the glints; reduced motion holds every crystal still at its drawn colour.
// Made by the walk's life, after the caster sweep, the contact-shadow scan and the prop merge. Draws no random number. Every number is crystalplan.js's.
// =============================================================================

import * as THREE from 'three';
import * as P from './crystalplan.js';
import { dotTexture } from './crystalparts.js';

export const PULSE = Object.freeze({ depth: 0.14, rate: 0.9 }); // the colour scalar swings 1 +- depth, once in about 7 s
export const GLINT_LOOK = Object.freeze({ size: 0.09, opacity: 0.85, wobble: 0.3, rate: 1.6 });

// the dust motes: slow warm specks in the air, thicker round the great crystals once they are lit (the three great crystals' own lit numbers drive their colours)
export const MOTES = Object.freeze({ ambient: 30, perGreat: 12, size: 0.07, opacity: 0.55 });
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const GREAT_AT = Object.freeze([[P.ROSE_GREAT.x, P.ROSE_GREAT.z, 'rose'], [7.5, -1.5, 'blue'], [-12.5, -19.5, 'gold']]);

export const isLowTier = (tier) => !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);

// createCrystalLight({ scene, tier, reducedMotion }) -> { glints, pulsing, update(dt, t), dispose() }
export function createCrystalLight({ scene, tier = null, reducedMotion = false }) {
  const lowTier = isLowTier(tier);
  scene.fog = new THREE.Fog(P.CAVE_LOOK.fog, P.CAVE_LOOK.fogNear, P.CAVE_LOOK.fogFar);

  const pulsing = [];
  scene.traverse((o) => { if (o.isMesh && o.userData?.pulse) pulsing.push({ mat: o.material, phase: P.HUES.indexOf(o.userData.pulse.hue) * 1.7 }); });
  const doPulse = !reducedMotion && !lowTier;

  const all = P.scatterGlints();
  const spots = lowTier ? all.filter((_, i) => i % 2 === 0) : all;
  const pos = new Float32Array(spots.length * 3);
  const col = new Float32Array(spots.length * 3);
  const c = new THREE.Color();
  spots.forEach((s, i) => {
    pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z;
    c.setHex(P.HUE_COLOURS[s.hue]).lerp(new THREE.Color(0xffffff), 0.6);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const glints = new THREE.Points(geo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.02, size: GLINT_LOOK.size * 2.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: GLINT_LOOK.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  glints.name = 'crystal:glints';
  glints.frustumCulled = false;
  Object.assign(glints.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(glints);

  // the motes: ambient ones over the chambers, and a few round each great crystal that only show once it is lit
  const lowMotes = lowTier ? 0.5 : 1;
  const nAmb = Math.round(MOTES.ambient * lowMotes);
  const nGreat = Math.round(MOTES.perGreat * lowMotes);
  const nMotes = nAmb + nGreat * 3;
  const home = [];
  for (let i = 0; i < nAmb; i++) { const zn = P.ZONES[2 + (i % 4)]; const a = hash(i, 1) * 6.283; const r = Math.sqrt(hash(i, 2)) * zn.r; home.push([zn.x + Math.cos(a) * r, 0.6 + hash(i, 3) * 3.4, zn.z + Math.sin(a) * r, -1]); }
  for (let g = 0; g < 3; g++) for (let i = 0; i < nGreat; i++) { const a = hash(i + g * 40, 4) * 6.283; const r = 1.2 + Math.sqrt(hash(i + g * 40, 5)) * 4; home.push([GREAT_AT[g][0] + Math.cos(a) * r, 0.5 + hash(i + g * 40, 6) * 4, GREAT_AT[g][1] + Math.sin(a) * r, g]); }
  const mPos = new Float32Array(nMotes * 3);
  const mCol = new Float32Array(nMotes * 3);
  const mBase = new Float32Array(nMotes * 3);
  const warm = new THREE.Color(0xffe2b4);
  home.forEach((h, i) => { c.copy(warm); if (h[3] >= 0) c.lerp(new THREE.Color(P.HUE_COLOURS[GREAT_AT[h[3]][2]]), 0.4); mBase.set([c.r, c.g, c.b], i * 3); });
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
  const motes = new THREE.Points(mGeo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.02, size: MOTES.size * 2.2, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: MOTES.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  motes.name = 'crystal:dust';
  motes.frustumCulled = false;
  Object.assign(motes.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(motes);
  const greatUniform = () => scene.getObjectByName('crystal:greats')?.material?.userData?.great?.uLit?.value ?? null;
  let moteLit = [-1, -1, -1];
  let placed = false;
  function placeMotes(t) {
    const lit = greatUniform();
    const L = lit ? [lit.x, lit.y, lit.z] : [0, 0, 0];
    const changed = L.some((v, g) => Math.abs(v - moteLit[g]) > 0.004);
    if (changed) {
      moteLit = L;
      home.forEach((h, i) => { const k = h[3] < 0 ? 0.35 + 0.15 * L.reduce((m, v) => Math.max(m, v), 0) : L[h[3]]; mCol[i * 3] = mBase[i * 3] * k; mCol[i * 3 + 1] = mBase[i * 3 + 1] * k; mCol[i * 3 + 2] = mBase[i * 3 + 2] * k; });
      mGeo.attributes.color.needsUpdate = true;
    }
    if (reducedMotion && placed) return; // still: placed once at time zero
    placed = true;
    const tt = reducedMotion ? 0 : t;
    home.forEach((h, i) => {
      mPos[i * 3] = h[0] + 0.5 * Math.sin(tt * 0.11 + i * 1.7);
      mPos[i * 3 + 1] = P.crystalY(h[0], h[2]) + h[1] + 0.4 * Math.sin(tt * 0.17 + i * 2.3);
      mPos[i * 3 + 2] = h[2] + 0.5 * Math.cos(tt * 0.09 + i * 2.9);
    });
    mGeo.attributes.position.needsUpdate = true;
  }
  placeMotes(0);

  return {
    glints,
    motes,
    pulsing,
    light: scene.getObjectByName('crystal:light') ?? null,
    update(_dt, t) {
      placeMotes(t);
      if (doPulse) for (const p of pulsing) p.mat.color.setScalar(1 + PULSE.depth * Math.sin(t * PULSE.rate + p.phase));
      if (!reducedMotion) glints.material.opacity = GLINT_LOOK.opacity - GLINT_LOOK.wobble * (0.5 + 0.5 * Math.sin(t * GLINT_LOOK.rate));
    },
    dispose() {
      scene.remove(glints, motes);
      mGeo.dispose(); motes.material.dispose();
      geo.dispose(); glints.material.dispose();
      for (const p of pulsing) p.mat.color.setScalar(1);
    },
  };
}
