// =============================================================================
// THE MOON: A LIGHT ON THE CAT (beauty round 3). With the sun low behind her the suited cat is a dark shape on a black sky: the sun lights her back, the cool fill
// is faint, and nothing lights the front a child looks at. Two cheap, Moon-only things, run by the Moon's life (no light is added, no draw call, no texture):
//   * a RIM on the suit's own materials (the kit makes one material per suit mesh, so patching them touches no other place): a Fresnel term added to the
//     emissive, a few instructions on the suit's pixels only, stronger the more the camera looks toward the sun;
//   * a FILL swell: the scene's one hemisphere light rises by up to FILL_SWELL (about half again) while the camera looks into the sun, so her fur and face are
//     not black against the sky (Earth and the lit dust are all round her, and a real camera would expose for her). It eases back when she turns.
// Both are numbers a test can pin (backlit(), rimStrength(), fillFactor()), and both are per-frame constants: no per-pixel cost beyond the rim term.
// =============================================================================

import * as THREE from 'three';
import { SUN } from './moonbeautyplan.js';

export const FILL_SWELL = 0.55; // the hemisphere light's gain at full backlight
export const RIM_BASE = 0.3; // the rim's strength with the sun at her side or behind the camera
export const RIM_FULL = 1.15; // ... and looking straight into the sun
export const RIM_COLOR = [0.62, 0.7, 0.9]; // cool, a little warm at the edge: Earthshine and the sun's glare

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// How much the camera looks into the sun, 0..1: forward is the camera's horizontal heading.
export function backlit(fx, fz) {
  const m = Math.hypot(fx, fz) || 1;
  return smooth(0.1, 0.85, (fx / m) * SUN.x + (fz / m) * SUN.z);
}
export const rimStrength = (k) => RIM_BASE + (RIM_FULL - RIM_BASE) * k;
export const fillFactor = (k) => 1 + FILL_SWELL * k;

// The rim, added to a suit mesh's standard material: the emissive gains rim * (1 - n.v)^2.4 in a cool colour.
export function patchRim(mat, uniform) {
  if (!mat || mat.userData.moonRim || mat.isMeshBasicMaterial || mat.transparent) return false;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uRim = uniform;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      totalEmissiveRadiance += vec3(${RIM_COLOR.map((c) => c.toFixed(2)).join(', ')}) * uRim * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `${key ? key() : ''}moon-rim`;
  mat.userData.moonRim = true;
  mat.needsUpdate = true;
  return true;
}

// createCatRim({ scene }) -> { update(dt, camera, cat), dispose() }. Finds the suit's meshes on the cat twice a second (a redress makes new ones), the scene's
// hemisphere light once, and eases both numbers toward the camera's heading.
export function createCatRim({ scene }) {
  const uniform = { value: RIM_BASE };
  let hemi = null;
  let base = 0;
  let set = 0;
  let k = 0;
  let scan = 0;
  const seen = new WeakSet();
  const fwd = new THREE.Vector3();
  return {
    uniform,
    update(dt, camera, cat) {
      if (!camera?.getWorldDirection) return; // (a picture page or a test may hand in a plain camera)
      camera.getWorldDirection(fwd);
      k += (backlit(fwd.x, fwd.z) - k) * Math.min(1, dt * 3);
      uniform.value = rimStrength(k);
      if (!hemi) hemi = scene.children.find((c) => c.isHemisphereLight) ?? null;
      if (hemi) {
        if (!base || Math.abs(hemi.intensity - set) > 1e-6) base = hemi.intensity; // someone else moved it: take that as the new base
        set = base * fillFactor(k);
        hemi.intensity = set;
      }
      scan -= dt;
      if (scan <= 0 && cat?.traverse) {
        scan = 0.5;
        cat.traverse((o) => { if (o.userData?.suit && o.isMesh && !seen.has(o)) { seen.add(o); patchRim(o.material, uniform); } });
      }
    },
    dispose() { if (hemi && base) hemi.intensity = base; },
  };
}
