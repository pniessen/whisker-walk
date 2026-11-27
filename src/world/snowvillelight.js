// =============================================================================
// SNOWVILLE: THE LIGHT (milestone V1). What the snow does, all of it drawing and none of it a rule:
//   * the soft snow HAZE (the walk's dusk look carries the fog: duskLight in snowville.js; the colour is the sky's horizon so the two agree);
//   * the FLAKES: a ring of soft round dots falling round the cat (one Points; 60, 30 on the low rungs, 20 and standing still in reduced motion);
//   * the GLINTS: tiny sparks on the snow that twinkle (one Points; half on the low rungs, held still in reduced motion);
//   * the BRAZIER's one real light, breathing a little (steady on the low rungs and in reduced motion);
//   * the CHEEKS: her cheeks go pink as she stays out in the open and warm again at a hearth (snowvillewarmth.js); a tint, never saved, never in the way.
// Made by the walk's life, after the caster sweep, the contact-shadow scan and the prop merge. Draws no random number and reads no clock (time arrives as `t`).
// =============================================================================

import * as THREE from 'three';
import * as P from './snowvilleplan.js';
import { dotTexture, LIGHT } from './snowvilleparts.js';
import { coldStep, cheekTint, lineStep, nearWarm } from './snowvillewarmth.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';

export const FLAKE_LOOK = Object.freeze({ size: 0.14, opacity: 0.9, sway: 0.5 });
export const GLINT_LOOK = Object.freeze({ size: 0.1, opacity: 0.85, wobble: 0.4, rate: 1.7 });
export const CHEEK_PINK = 0xff8fa8;
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export const isLowTier = (tier) => !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });

// The flake `i` at time t over a cat at (cx, cz): wrapped into a box round her so there are always flakes near her, however far she walks. Pure.
export function flakeAt(i, t, cx, cz, out = { x: 0, y: 0, z: 0 }) {
  const B = P.FLAKES.box;
  const hx = hash(i, 1) * 2 * B; const hz = hash(i, 2) * 2 * B;
  const wrap = (v, c) => ((((v - c) % (2 * B)) + 2 * B) % (2 * B)) - B + c;
  const fall = (0.6 + 0.8 * hash(i, 3)) * P.FLAKES.fall;
  const y = P.FLAKES.top - ((hash(i, 4) * P.FLAKES.top + t * fall) % P.FLAKES.top);
  out.x = wrap(hx - B, cx) + FLAKE_LOOK.sway * Math.sin(t * 0.5 + i * 1.9);
  out.z = wrap(hz - B, cz) + FLAKE_LOOK.sway * Math.cos(t * 0.43 + i * 2.7);
  out.y = P.snowY(out.x, out.z) + y;
  return out;
}

// The cat's cheeks: the face's own cheek pads (userData.cheek, src/cat/model.js), found on the session's cat and tinted toward pink by `k` (0 puts them back exactly).
function createCheeks() {
  let pads = [];
  let last = -1;
  const find = (cat) => {
    pads = [];
    cat?.traverse?.((o) => { if (o.userData?.cheek && o.material?.color) pads.push({ o, base: o.material.color.clone() }); });
  };
  return {
    get count() { return pads.length; },
    set(cat, k) {
      if (!cat) return;
      if (!pads.length || pads.some((p) => !p.o.parent)) find(cat);
      if (Math.abs(k - last) < 0.004) return;
      last = k;
      for (const p of pads) p.o.material.color.copy(p.base).lerp(_pink, k);
    },
    restore() { for (const p of pads) p.o.material.color.copy(p.base); pads = []; last = -1; },
  };
}
const _pink = new THREE.Color(CHEEK_PINK);

// createSnowvilleLight({ scene, tier, reducedMotion }) -> { flakes, glints, light, cold, update(dt, t, catPos, camera, session), dispose() }
export function createSnowvilleLight({ scene, tier = null, reducedMotion = false }) {
  const low = isLowTier(tier);
  const nFlakes = reducedMotion ? P.FLAKES.reduced : low ? P.FLAKES.low : P.FLAKES.count;

  const fPos = new Float32Array(nFlakes * 3);
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  const flakes = new THREE.Points(fGeo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.02, size: FLAKE_LOOK.size * 2.2, sizeAttenuation: true, color: 0xffffff, transparent: true, opacity: FLAKE_LOOK.opacity, depthWrite: false, fog: true,
  }));
  flakes.name = 'snowville:flakes';
  flakes.frustumCulled = false;
  Object.assign(flakes.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(flakes);

  const all = P.scatterGlints();
  const spots = low ? all.filter((_, i) => i % 2 === 0) : all;
  const gPos = new Float32Array(spots.length * 3);
  spots.forEach((s, i) => { gPos[i * 3] = s.x; gPos[i * 3 + 1] = s.y; gPos[i * 3 + 2] = s.z; });
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  const glints = new THREE.Points(gGeo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.02, size: GLINT_LOOK.size * 2.2, sizeAttenuation: true, color: 0xffffff, transparent: true, opacity: GLINT_LOOK.opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  glints.name = 'snowville:glints';
  glints.frustumCulled = false;
  Object.assign(glints.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(glints);

  const light = scene.getObjectByName('snowville:light') ?? null;
  const cheeks = createCheeks();
  const talk = { said: false };
  let cold = 0;
  const tmp = { x: 0, y: 0, z: 0 };

  function place(t, cx, cz) {
    const tt = reducedMotion ? 0 : t; // standing still in reduced motion: the same flakes round her, each at a fixed offset, none falling
    for (let i = 0; i < nFlakes; i++) { flakeAt(i, tt, cx, cz, tmp); fPos[i * 3] = tmp.x; fPos[i * 3 + 1] = tmp.y; fPos[i * 3 + 2] = tmp.z; }
    fGeo.attributes.position.needsUpdate = true;
  }
  place(0, P.SNOWVILLE_SPAWN.x, P.SNOWVILLE_SPAWN.z);

  return {
    flakes,
    glints,
    light,
    get cold() { return cold; },
    cheeks,
    update(dt, t, catPos, _camera, session) {
      const cx = catPos?.x ?? P.SNOWVILLE_SPAWN.x;
      const cz = catPos?.z ?? P.SNOWVILLE_SPAWN.z;
      place(t, cx, cz);
      if (!reducedMotion) glints.material.opacity = GLINT_LOOK.opacity - GLINT_LOOK.wobble * (0.5 + 0.5 * Math.sin(t * GLINT_LOOK.rate));
      if (light) light.intensity = reducedMotion || low ? LIGHT.intensity : LIGHT.intensity * (1 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1));
      const warm = nearWarm(cx, cz);
      const before = cold;
      cold = coldStep(cold, dt, warm);
      if (lineStep(talk, cold)) say('snowville-cold', phrase('snowville.cold'));
      else if (warm && before > 0.6 && cold <= 0.6) say('snowville-warm', phrase('snowville.warm'));
      cheeks.set(session?.cat ?? null, cheekTint(cold));
    },
    dispose() {
      cheeks.restore();
      scene.remove(flakes, glints);
      fGeo.dispose(); flakes.material.dispose();
      gGeo.dispose(); glints.material.dispose();
    },
  };
}
