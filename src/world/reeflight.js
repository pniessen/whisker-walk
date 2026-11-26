// =============================================================================
// THE REEF: THE LIGHT (milestone R1). What the water does to the picture, all of it drawing and none of it a rule:
//   * a warm blue-green FOG (starting 6 m from the eye, gone at 40 m), whose colour is the sky's horizon so the two agree;
//   * the SHIMMER CEILING: one quad at y 9 (the sea's surface seen from below, never a `waters` entry) carrying a scrolled, tiling ripple of light;
//     it rides along under the camera so it never ends, and its texture offset follows the camera so it does not slide with her;
//   * three additive LIGHT SHAFTS, tall quads fading out toward the seabed (dropped on the lite and low rungs, the transparent draws a phone feels);
//   * (reducedMotion) the scroll, the shafts' breathing and the kelp's sway are all frozen: the quad stays put and the kelp stands at rest.
// Made by the walk's life, after the caster sweep, the contact-shadow scan and the prop merge (so none of it is swept, merged or counted in the build).
// Draws no random number. Every number is reefplan.js's.
// =============================================================================

import * as THREE from 'three';
import * as P from './reefplan.js';

export const SHIMMER = Object.freeze({ tile: 14, scroll: 0.018, opacity: 0.5, size: 64 });
export const SHAFT_LOOK = Object.freeze({ opacity: 0.16, height: P.SURFACE_Y + 0.5, breath: 0.04, rate: 0.45, tint: 0x9fe6e2 });

// The ripple's pixels: bright, thin, wandering lines (a few cosines in whole cycles, so the tile's edges meet). RGBA, white with an alpha of the line.
export function shimmerPixels(size = SHIMMER.size) {
  const px = new Uint8Array(size * size * 4);
  const w = (Math.PI * 2) / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i * w;
      const v = j * w;
      const n = Math.sin(u * 2 + Math.sin(v * 3) * 1.1) + Math.sin(v * 2 + Math.sin(u * 3 + 1) * 1.1) + 0.6 * Math.sin((u + v) * 3);
      const line = Math.max(0, 1 - Math.abs(n) / 0.55);
      const k = (j * size + i) * 4;
      px[k] = px[k + 1] = px[k + 2] = 255;
      px[k + 3] = Math.round(255 * line * line);
    }
  }
  return px;
}

function shimmerTexture() {
  const tex = new THREE.DataTexture(shimmerPixels(), SHIMMER.size, SHIMMER.size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// One shaft: a quad `w` wide and `height` tall, bright at the top and gone at the foot (vertex colours into an additive blend).
export function shaftGeometry(w, height) {
  const g = new THREE.PlaneGeometry(w, height, 1, 1);
  g.translate(0, height / 2, 0);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(SHAFT_LOOK.tint);
  for (let v = 0; v < pos.count; v++) {
    const t = pos.getY(v) / height; // 0 at the foot, 1 at the top
    const k = t * t;
    col[v * 3] = c.r * k; col[v * 3 + 1] = c.g * k; col[v * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// createReefLight({ scene, lowTier, reducedMotion }) -> { group, shafts, shimmer, update(dt, t, camera), dispose() }
export function createReefLight({ scene, lowTier = false, reducedMotion = false }) {
  scene.fog = new THREE.Fog(P.WATER_LOOK.horizon, P.WATER_LOOK.fogNear, P.WATER_LOOK.fogFar);
  const group = new THREE.Group();
  group.name = 'reefLight';

  const tex = shimmerTexture();
  tex.repeat.set(P.GROUND_SIZE / SHIMMER.tile, P.GROUND_SIZE / SHIMMER.tile);
  const shimmer = new THREE.Mesh(
    new THREE.PlaneGeometry(P.GROUND_SIZE, P.GROUND_SIZE).rotateX(Math.PI / 2), // faces down: the sea's surface seen from below
    new THREE.MeshBasicMaterial({ map: tex, color: 0xdffcf8, transparent: true, opacity: SHIMMER.opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
  );
  shimmer.name = 'reef:shimmer';
  shimmer.position.y = P.SURFACE_Y;
  shimmer.renderOrder = 2;
  shimmer.frustumCulled = false;
  Object.assign(shimmer.userData, { noCast: true, noContactShadow: true, noMerge: true });
  group.add(shimmer);

  const shafts = [];
  if (!lowTier) {
    for (const s of P.SHAFTS) {
      const m = new THREE.Mesh(
        shaftGeometry(s.w, SHAFT_LOOK.height),
        new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: SHAFT_LOOK.opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
      );
      m.name = 'reef:shaft';
      m.position.set(s.x, P.reefY(s.x, s.z) - 0.2, s.z);
      m.rotation.set(0, s.yaw, s.lean, 'YXZ');
      m.renderOrder = 1;
      m.frustumCulled = false;
      Object.assign(m.userData, { noCast: true, noContactShadow: true, noMerge: true });
      group.add(m);
      shafts.push(m);
    }
  }
  scene.add(group);

  let scroll = 0;
  return {
    group,
    shafts,
    shimmer,
    texture: tex,
    update(dt, t, camera) {
      if (!reducedMotion) scroll += Math.max(dt, 0) * SHIMMER.scroll;
      // it rides under the camera; the texture's offset keeps the ripple fixed in the world (plus the scroll)
      const cx = camera?.position?.x ?? 0;
      const cz = camera?.position?.z ?? 0;
      shimmer.position.x = cx;
      shimmer.position.z = cz;
      tex.offset.set(cx / SHIMMER.tile + scroll, cz / SHIMMER.tile + scroll * 0.6);
      if (!reducedMotion) shafts.forEach((m, i) => { m.material.opacity = SHAFT_LOOK.opacity + SHAFT_LOOK.breath * Math.sin(t * SHAFT_LOOK.rate + i * 2.1); });
    },
    dispose() {
      scene.remove(group);
      tex.dispose();
      shimmer.geometry.dispose(); shimmer.material.dispose();
      for (const m of shafts) { m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
