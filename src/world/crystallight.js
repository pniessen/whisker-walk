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

  return {
    glints,
    pulsing,
    light: scene.getObjectByName('crystal:light') ?? null,
    update(_dt, t) {
      if (doPulse) for (const p of pulsing) p.mat.color.setScalar(1 + PULSE.depth * Math.sin(t * PULSE.rate + p.phase));
      if (!reducedMotion) glints.material.opacity = GLINT_LOOK.opacity - GLINT_LOOK.wobble * (0.5 + 0.5 * Math.sin(t * GLINT_LOOK.rate));
    },
    dispose() {
      scene.remove(glints);
      geo.dispose(); glints.material.dispose();
      for (const p of pulsing) p.mat.color.setScalar(1);
    },
  };
}
