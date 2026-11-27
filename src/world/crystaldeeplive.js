// =============================================================================
// THE ECHO DEEP ON A WALK (milestone C2). createDeepLife(ctx) draws the three meshes (crystaldeepparts.js) and switches them by distance: the detail (stone and glow) shows within
// NEAR of the hall or the nook, a low stand-in glow beyond (the iPad 7 floor). The glow breathes very slowly; REDUCED MOTION holds it still at its gentle peak. It adds no light,
// draws no random number, reads no clock (only the own dt of the walk), saves nothing and touches nothing she owns. The wall, the prisms and Tink are C3 and C4.
// =============================================================================
import { nearDeep } from './crystaldeepplan.js';
import { drawDeep } from './crystaldeepparts.js';

export const GLOW = Object.freeze({ lo: 0.84, hi: 1.0 });
export const deepRung = (tier) => (tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3) ? 'low' : 'high');
export const deepGlow = (t) => GLOW.lo + (GLOW.hi - GLOW.lo) * (0.5 + 0.5 * Math.sin(t * 0.7));
// which meshes show for a cat at (x, z): the detail pair near, the stand-in far (never both)
export const deepVisible = (x, z) => (nearDeep(x, z) ? { detail: true, standIn: false } : { detail: false, standIn: true });

export function createDeepLife({ scene, tier = null, reducedMotion = false }) {
  const d = drawDeep(deepRung(tier));
  const meshes = d.meshes;
  for (const m of meshes) scene.add(m);
  let clock = 0;
  let disposed = false;
  const show = (x, z) => { const v = deepVisible(x, z); d.stone.visible = v.detail; d.glow.visible = v.detail; d.standIn.visible = v.standIn; };
  const set = (t) => { const s = reducedMotion ? 1 : deepGlow(t); d.glow.material.color.setScalar(s); d.standIn.material.color.setScalar(s); };
  show(0, 28); // the spawn: far
  set(0);
  return {
    rung: deepRung(tier), meshes, spottable: [],
    get draws() { return meshes.length; },
    get triangles() { return meshes.reduce((s, m) => s + m.geometry.attributes.position.count / 3, 0); },
    update(dt, t, catPos) {
      if (disposed) return;
      if (catPos) show(catPos.x, catPos.z);
      if (reducedMotion) return;
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
