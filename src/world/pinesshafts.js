// Beauty PIN-1: the Pines' sun shafts. ONE merged, non-casting mesh of soft additive
// tapered tubes, bright at the canopy and fading to nothing at the floor, leaning the
// way the sun does, standing in the gaps between the pines. Hidden on LOW and LITE,
// breathing slowly otherwise and held still under reduced motion. The places come
// from the pass's own seeded stream ('pines-shafts'), never the walk's, so no existing
// layout moves. No visible text.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, seedFromCode } from '../rng.js';

export const SHAFT_OPACITY = 0.17;
const TOP_Y = 10.5;
const SIDES = 5;
export const SHAFT_RULE = Object.freeze({ from: -40, to: 40, cell: 14, jitter: 4, keep: 0.75, cap: 8, clear: 3.2 });
export const isLowTier = (tier) => !!tier && (tier.name === 'low' || tier.name === 'lite' || tier.shadows === false || (tier.rung ?? 0) >= 3);

// A pure plan: [{ x, z, rTop, rBot, lean, bright }]. Every random number is drawn
// whether or not its spot is kept; `fits(x, z)` is the area's own open-ground rule.
export function pinesShaftPlan(fits, trunks = []) {
  const rng = mulberry32(seedFromCode('pines-shafts'));
  const r = SHAFT_RULE;
  const out = [];
  for (let gz = r.from; gz < r.to; gz += r.cell) {
    for (let gx = r.from; gx < r.to; gx += r.cell) {
      const x = Math.round((gx + (rng() * 2 - 1) * r.jitter) * 100) / 100;
      const z = Math.round((gz + (rng() * 2 - 1) * r.jitter) * 100) / 100;
      const keep = rng() < r.keep;
      const s = { x, z, rTop: 0.35 + rng() * 0.4, rBot: 0.9 + rng() * 0.9, lean: 0.25 + rng() * 0.12, bright: 0.6 + rng() * 0.4 };
      if (keep && out.length < r.cap && fits(x, z) && trunks.every((t) => Math.hypot(x - t.x, z - t.z) > r.clear * (t.scale ?? 1))) out.push(s);
    }
  }
  return out;
}

function shaftGeometry(s) {
  const pos = [];
  const col = [];
  const c = new THREE.Color(0xfff0c0);
  const ring = (y, rad, ox, oz, a) => Array.from({ length: SIDES }, (_, i) => [s.x + ox + Math.cos((i / SIDES) * Math.PI * 2) * rad, y, s.z + oz + Math.sin((i / SIDES) * Math.PI * 2) * rad, a]);
  const top = ring(TOP_Y, s.rTop, -s.lean * TOP_Y, -s.lean * TOP_Y * 0.4, s.bright * 0.5);
  const bot = ring(0.05, s.rBot, 0, 0, 0);
  const put = (p) => { pos.push(p[0], p[1], p[2]); col.push(c.r * p[3], c.g * p[3], c.b * p[3]); };
  for (let i = 0; i < SIDES; i++) {
    const j = (i + 1) % SIDES;
    for (const p of [top[i], bot[i], top[j], top[j], bot[i], bot[j]]) put(p);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// addPinesShafts(scene, plan) -> { mesh, life(ctx) } or null for an empty plan.
export function addPinesShafts(scene, plan) {
  if (!plan.length) return null;
  const geo = mergeGeometries(plan.map(shaftGeometry), false);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: SHAFT_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'pines:shafts';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  Object.assign(mesh.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(mesh);
  return {
    mesh,
    // the walk's area life: LOW/LITE hide the shafts, reduced motion holds them at their drawn strength
    life(ctx = {}) {
      const low = isLowTier(ctx.tier);
      mesh.visible = !low;
      return {
        update(_dt, t) { if (!low && !ctx.reducedMotion && typeof t === 'number') mat.opacity = SHAFT_OPACITY * (0.88 + 0.12 * Math.sin(t * 0.25)); },
        dispose() {},
      };
    },
  };
}
