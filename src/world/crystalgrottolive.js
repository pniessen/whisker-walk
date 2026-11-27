// =============================================================================
// THE GROTTO AND THE FORGE ON A WALK (milestone C2). createGrottoLife(ctx) draws the four meshes (crystalgrottoparts.js), breathes their glow and lists the two spots the photo
// and the journal read (`spottable`: ccgrotto, ccforge). The mushrooms' glow rises and falls very slowly; the hearth's light flickers a little. REDUCED MOTION holds both still at
// full glow. It adds no light, draws no random number, reads no clock (the walk's own dt only), and touches nothing she owns. The forge job itself is milestone C3.
// =============================================================================
import * as THREE from 'three';
import { phrase } from '../clanphrases.js';
import { crystalY } from './crystalplan.js';
import * as G from './crystalgrottoplan.js';
import { drawGrotto, drawForge } from './crystalgrottoparts.js';
import './crystalgrottowords.js';

export const GLOW = Object.freeze({ mushLo: 0.86, mushHi: 1.0, hearthLo: 0.82, hearthHi: 1.0 });
export const grottoRung = (tier) => (tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3) ? 'low' : 'high');
// the glow at time t (a pure function: 1 is the colour as drawn)
export const mushGlow = (t) => GLOW.mushLo + (GLOW.mushHi - GLOW.mushLo) * (0.5 + 0.5 * Math.sin(t * 0.8));
export const hearthGlow = (t) => GLOW.hearthLo + (GLOW.hearthHi - GLOW.hearthLo) * (0.5 + 0.25 * Math.sin(t * 3.1) + 0.25 * Math.sin(t * 5.3 + 1.2));

export function createGrottoLife({ scene, tier = null, reducedMotion = false }) {
  const rung = grottoRung(tier);
  const grotto = drawGrotto(rung);
  const forge = drawForge(rung);
  const meshes = [...grotto.meshes, ...forge.meshes];
  for (const m of meshes) scene.add(m);
  const spottable = G.SPOTS_C2.map((s) => ({ type: s.type, label: s.type === 'ccgrotto' ? phrase('crystal.wc.grotto.name') : phrase('crystal.wc.forge.name'), pos: new THREE.Vector3(s.x, crystalY(s.x, s.z) + s.up, s.z), range: s.range }));
  let clock = 0;
  let disposed = false;
  const set = (t) => {
    const m = reducedMotion ? 1 : mushGlow(t);
    const h = reducedMotion ? 1 : hearthGlow(t);
    grotto.caps.material.color.setScalar(m);
    grotto.halo.material.color.setScalar(m);
    forge.warm.material.color.setScalar(h);
  };
  set(0);
  return {
    rung, meshes, spottable,
    get draws() { return meshes.length; },
    get triangles() { return meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0); },
    update(dt) {
      if (disposed || reducedMotion) return;
      clock += dt > 0 ? Math.min(dt, 1) : 0;
      set(clock);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const m of meshes) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
