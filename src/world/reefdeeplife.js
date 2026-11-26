// =============================================================================
// THE REEF, WING C: THE DEEP'S LIFE (milestone R8). The plankton (ONE Points, a few dozen small lights drifting in a slow loop, frozen under reduced motion,
// fewer on the low rungs) and the three soft lines said once a walk (arriving, resting in the boat, stepping into the cleft). It never touches what she owns
// (the three finds are the finds' life, world/reeffinds.js) and it asks nothing of the gauge. Draws no random number and reads no clock but the walk's own.
// =============================================================================
import * as THREE from 'three';
import { softDisc } from './reeflight.js';
import { phrase } from '../clanphrases.js';
import * as D from './reefdeep.js';
import { reefY } from './reefplan.js';
import './reefdeepwords.js';

// How many of the plankton each rung keeps: all of them, then two thirds, then a third.
export const planktonShare = (tier) => {
  const rung = tier?.rung ?? 0;
  return tier?.name === 'lite' || rung >= 4 ? 0.34 : tier?.name === 'low' || tier?.shadows === false || rung >= 3 ? 0.67 : 1;
};

// createReefDeepLife({ scene, reducedMotion, tier, say }) -> { update(dt, t, catPos), dispose(), plankton }
export function createReefDeepLife({ scene, reducedMotion = false, tier = null, say = null }) {
  const seeds = D.planktonSeeds();
  const list = seeds.filter((_, i) => Math.floor((i + 1) * planktonShare(tier)) > Math.floor(i * planktonShare(tier)));
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(list.length * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: softDisc(), alphaTest: 0.02, size: 0.14, sizeAttenuation: true, color: 0xb8fff0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
  const points = new THREE.Points(geo, mat);
  points.name = 'reef:plankton';
  points.frustumCulled = false;
  Object.assign(points.userData, { noMerge: true, noCast: true, noContactShadow: true });
  const place = (clock) => {
    list.forEach((p, i) => {
      const w = reducedMotion ? 0 : clock * 0.25 + p.phase;
      pos[i * 3] = p.x + Math.sin(w) * 0.35;
      pos[i * 3 + 1] = reefY(p.x, p.z) + p.y + Math.sin(w * 1.3 + p.phase) * 0.18;
      pos[i * 3 + 2] = p.z + Math.cos(w * 0.8) * 0.35;
    });
    geo.attributes.position.needsUpdate = true;
  };
  place(0);
  scene.add(points);
  const told = new Set();
  let clock = 0;
  const tell = (id, line) => { if (told.has(id)) return; told.add(id); say?.(line()); };
  return {
    plankton: points,
    update(dt, t, catPos) {
      const d = dt > 0 ? Math.min(dt, 1) : 0;
      clock += d;
      if (!reducedMotion) place(clock);
      if (!catPos || !say) return;
      if (D.insideCave(catPos.x, catPos.z)) tell('cave', () => phrase('reef.deep.cave'));
      else if (D.insideBoat(catPos.x, catPos.z)) tell('boat', () => phrase('reef.deep.boat'));
      else if (D.inDeep(catPos.x, catPos.z)) tell('arrive', () => phrase('reef.deep.arrive'));
      void t;
    },
    dispose() {
      scene.remove(points);
      geo.dispose(); mat.dispose();
    },
  };
}
