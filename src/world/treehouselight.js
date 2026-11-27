// =============================================================================
// THE TREEHOUSE VILLAGE: THE LIGHT (milestone T1). What the canopy's light does, all of it drawing and none of it a rule:
//   * a DAPPLE: one big translucent quad just over the floor with soft blotches of leaf shade, scrolled very slowly (a data texture, no canvas, seeded);
//   * the one real light (the PointLight made at build, intensity 0) which later milestones move to the lit house (setGlow), never a second one;
//   * the rain is kept off by the leaves (weather.setSheltered), so the place has the same quiet light on every walk.
// LOW and LITE (the walk's low tier) drop the dapple altogether; reduced motion holds it still at its drawn place. Draws no random number (mulberry32) and reads no
// clock (the walk's `t`). Made by the walk's life, after the caster sweep, the contact-shadow scan and the prop merge. Every number is treehouseplan.js's.
// =============================================================================

import * as THREE from 'three';
import { mulberry32 } from '../rng.js';

export const DAPPLE = Object.freeze({ size: 72, opacity: 0.2, drift: 0.004, tile: 3 }); // metres across, how dark, texture turns a second, how many times it repeats
export const SHAFT_OPACITY = 0.2; // the shafts' drawn strength (the same number as treehousebeauty.js's, kept here so stage A never imports the lift stage)
export const isLowTier = (tier) => !!tier && (tier.name === 'low' || tier.name === 'lite' || tier.shadows === false || (tier.rung ?? 0) >= 3);

let _tex = null;
// A 64 x 64 soft blotch texture (alpha only matters): the same bytes every time.
export function dappleTexture() {
  if (_tex) return _tex;
  const n = 64;
  const rng = mulberry32(0x64617070);
  const blobs = [];
  for (let i = 0; i < 22; i++) blobs.push([rng() * n, rng() * n, 4 + rng() * 7]);
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let a = 0;
      for (const [bx, by, r] of blobs) {
        for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { // wraps, so the tiling shows no seam
          const d = Math.hypot(x - bx - ox, y - by - oy) / r;
          if (d < 1) a = Math.max(a, (1 - d) ** 1.6);
        }
      }
      const k = (y * n + x) * 4;
      data[k] = 20; data[k + 1] = 40; data[k + 2] = 18; data[k + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  _tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  _tex.wrapS = _tex.wrapT = THREE.RepeatWrapping;
  _tex.magFilter = _tex.minFilter = THREE.LinearFilter;
  _tex.needsUpdate = true;
  return _tex;
}

// createTreehouseLight({ scene, tier, reducedMotion, weather }) -> { dapple, light, setGlow(x, y, z, intensity), update(dt, t), dispose() }
export function createTreehouseLight({ scene, tier = null, reducedMotion = false, weather = null }) {
  weather?.setSheltered?.(true); // the leaves keep the rain off the village
  const low = isLowTier(tier);
  let dapple = null;
  let map = null;
  if (!low) {
    map = dappleTexture().clone();
    map.needsUpdate = true;
    map.repeat.set(DAPPLE.tile, DAPPLE.tile);
    dapple = new THREE.Mesh(
      new THREE.PlaneGeometry(DAPPLE.size, DAPPLE.size),
      new THREE.MeshBasicMaterial({ map, transparent: true, opacity: DAPPLE.opacity, depthWrite: false, fog: true }),
    );
    dapple.rotation.x = -Math.PI / 2;
    dapple.position.y = 0.045;
    dapple.name = 'treehouse:dapple';
    dapple.renderOrder = 1;
    Object.assign(dapple.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(dapple);
  }
  const light = scene.getObjectByName('treehouse:light') ?? null;
  // the shafts of sun (milestone T8, drawn in treehousebeauty.js): LOW and LITE hide them, the rest breathe slowly, reduced motion holds them at their drawn strength
  const shafts = scene.getObjectByName('treehouse:shafts') ?? null;
  if (shafts) { shafts.renderOrder = 2; shafts.visible = !low; }
  return {
    dapple,
    light,
    setGlow(x, y, z, intensity) { if (light) { light.position.set(x, y, z); light.intensity = intensity; } },
    update(_dt, t) {
      if (shafts && !low && !reducedMotion) shafts.material.opacity = SHAFT_OPACITY * (0.88 + 0.12 * Math.sin(t * 0.25));
      if (!map || reducedMotion) return;
      map.offset.set((t * DAPPLE.drift) % 1, (t * DAPPLE.drift * 0.6) % 1);
    },
    dispose() {
      weather?.setSheltered?.(false);
      if (dapple) { scene.remove(dapple); dapple.geometry.dispose(); dapple.material.dispose(); map.dispose(); }
      if (light) light.intensity = 0;
    },
  };
}
