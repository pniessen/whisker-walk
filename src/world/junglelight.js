// =============================================================================
// THE JUNGLE LODGE: THE LIGHT (milestone J1). What the air does, all of it drawing and none of it a rule:
//   * the green HAZE (the walk's dusk look carries the fog: duskLight in jungle.js; the colour is the sky's horizon so the two agree);
//   * the MIST: soft low patches drifting along the river and the court (one Points; half on the low rungs, held still in reduced motion);
//   * the RAIN: a warm shower on a seeded, repeating schedule (jungleplan.js createRainSchedule): a box of falling streaks round her (one LineSegments; half on the low rungs,
//     NONE in reduced motion), hidden round her while she stands under the veranda or a giant leaf, and the RAINBOW after it (one arc, fading in and out; in reduced motion it
//     simply shows and hides, never fades);
//   * the veranda LANTERN's one real light, breathing a little (steady on the low rungs and in reduced motion).
// Made by the walk's life, after the caster sweep, the contact-shadow scan and the prop merge. Draws no random number and reads no clock (time arrives as `t`, the walk's own).
// =============================================================================

import * as THREE from 'three';
import * as P from './jungleplan.js';
import { dotTexture, LIGHT } from './jungleparts.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';

export const MIST_LOOK = Object.freeze({ opacity: 0.16, drift: 0.35 });
export const RAIN_LOOK = Object.freeze({ opacity: 0.55, color: 0xd6e8f2, sway: 0.15 });
export const RAINBOW_COLOURS = Object.freeze([0xf0605a, 0xf5a04a, 0xf5dc5a, 0x7ccf6a, 0x5ab4e8, 0x6a74d8, 0xa066d0]);
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });
export const isLowTier = (tier) => !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);

// The drop `i` at time t over a cat at (cx, cz): wrapped into a box round her so there is always rain near her, however far she walks. Fills `out` with the streak's top and bottom. Pure.
export function dropAt(i, t, cx, cz, out = { x: 0, y: 0, z: 0, y2: 0 }) {
  const B = P.DROPS.box;
  const hx = hash(i, 11) * 2 * B; const hz = hash(i, 12) * 2 * B;
  const wrap = (v, c) => ((((v - c) % (2 * B)) + 2 * B) % (2 * B)) - B + c;
  const fall = (0.85 + 0.3 * hash(i, 13)) * P.DROPS.fall;
  const y = P.DROPS.top - ((hash(i, 14) * P.DROPS.top + t * fall) % P.DROPS.top);
  out.x = wrap(hx - B, cx);
  out.z = wrap(hz - B, cz);
  out.y = P.jungleY(out.x, out.z) + y;
  out.y2 = out.y + P.DROPS.len;
  return out;
}

// The mist patch `i` drifting: a slow loop about its home. Pure.
export function mistAt(spot, t, out = { x: 0, y: 0, z: 0 }) {
  out.x = spot.x + 2.2 * Math.sin(t * 0.07 * MIST_LOOK.drift * 6 + spot.phase);
  out.z = spot.z + 1.6 * Math.cos(t * 0.05 * MIST_LOOK.drift * 6 + spot.phase * 1.7);
  out.y = P.jungleY(spot.x, spot.z) + spot.y;
  return out;
}

// The rainbow: seven thin half-rings, one mesh with vertex colours, standing over the north edge. Faces +z (the way she looks from the court).
export function rainbowGeometry() {
  const pos = [];
  const col = [];
  const index = [];
  const seg = 28;
  const c = new THREE.Color();
  RAINBOW_COLOURS.forEach((hex, band) => {
    const r0 = P.RAINBOW.r - band * (P.RAINBOW.w / 7); const r1 = r0 - P.RAINBOW.w / 7;
    c.setHex(hex);
    const base = pos.length / 3;
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI;
      for (const r of [r0, r1]) { pos.push(P.RAINBOW.x + Math.cos(a) * r, Math.sin(a) * r - 4, P.RAINBOW.z); col.push(c.r, c.g, c.b); }
    }
    for (let s = 0; s < seg; s++) { const a = base + s * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setIndex(index);
  return g;
}

// createJungleLight({ scene, tier, reducedMotion, schedule }) -> { rain, mist, rainbow, light, update(dt, t, catPos), dispose() }
export function createJungleLight({ scene, tier = null, reducedMotion = false, schedule = P.rainSchedule }) {
  const low = isLowTier(tier);
  const nDrops = reducedMotion ? 0 : low ? P.DROPS.low : P.DROPS.count;

  const rPos = new Float32Array(nDrops * 6);
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  const rain = new THREE.LineSegments(rGeo, new THREE.LineBasicMaterial({ color: RAIN_LOOK.color, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  rain.name = 'jungle:rain';
  rain.frustumCulled = false;
  rain.visible = false;
  Object.assign(rain.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(rain);

  const all = P.scatterMist();
  const spots = !low ? all : all.filter((_, i) => i % 2 === 0);
  const mPos = new Float32Array(spots.length * 3);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
  const mist = new THREE.Points(mGeo, new THREE.PointsMaterial({
    map: dotTexture(), alphaTest: 0.01, size: 6.5, sizeAttenuation: true, color: 0xf0f8e8, transparent: true, opacity: MIST_LOOK.opacity, depthWrite: false, fog: true,
  }));
  mist.name = 'jungle:mist';
  mist.frustumCulled = false;
  Object.assign(mist.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(mist);

  const rainbow = new THREE.Mesh(rainbowGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  rainbow.name = 'jungle:rainbow';
  rainbow.frustumCulled = false;
  rainbow.visible = false;
  Object.assign(rainbow.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(rainbow);

  const light = scene.getObjectByName('jungle:light') ?? null;
  const tmp = { x: 0, y: 0, z: 0, y2: 0 };
  const mt = { x: 0, y: 0, z: 0 };
  const told = { rain: false, rainbow: false }; // each soft line is said once a walk
  let cover = 0; // 0 in the open, 1 under cover: eases so the rain does not snap off at the veranda's edge
  const state = { strength: 0, rainbow: 0, phase: 'clear', cover: 0 };
  const show = { rain: 0, bow: 0, glow: 0 }; // the Rain Supper's own rain, rainbow and lantern lift (milestone J5, world/junglewinglive.js): added to the schedule, never replacing it

  function placeMist(t) {
    const tt = reducedMotion ? 0 : t;
    spots.forEach((s, i) => { mistAt(s, tt, mt); mPos[i * 3] = mt.x; mPos[i * 3 + 1] = mt.y; mPos[i * 3 + 2] = mt.z; });
    mGeo.attributes.position.needsUpdate = true;
  }
  placeMist(0);

  return {
    rain,
    mist,
    rainbow,
    light,
    state,
    // the Rain Supper's pictures, each 0 to 1 (a show that is over sets them back to 0)
    setShow(rain = 0, bow = 0, glow = 0) { show.rain = rain; show.bow = bow; show.glow = glow; },
    update(dt, t, catPos) {
      const cx = catPos?.x ?? P.JUNGLE_SPAWN.x;
      const cz = catPos?.z ?? P.JUNGLE_SPAWN.z;
      const strength = Math.max(schedule.intensity(t), show.rain);
      const bow = Math.max(schedule.rainbow(t), show.bow);
      state.phase = schedule.phase(t);
      if (state.phase === 'rain' && !told.rain && strength > 0.5) { told.rain = true; say('jungle-rain', phrase('jungle.rain')); }
      if (state.phase === 'rainbow' && !told.rainbow && bow > 0.5) { told.rainbow = true; say('jungle-rainbow', phrase('jungle.rainbow')); }
      cover += ((P.sheltered(cx, cz) ? 1 : 0) - cover) * Math.min(1, Math.max(0, dt) * 6);
      state.strength = strength;
      state.cover = cover;
      // the rainbow: fades in reduced motion too, but as a plain show/hide (no fade)
      state.rainbow = reducedMotion ? (bow > 0.01 ? 1 : 0) : bow;
      rainbow.visible = state.rainbow > 0.01;
      rainbow.material.opacity = 0.55 * state.rainbow;
      // the shower: nothing at all in reduced motion
      const seen = reducedMotion ? 0 : strength * (1 - 0.92 * cover);
      rain.visible = seen > 0.01 && nDrops > 0;
      rain.material.opacity = RAIN_LOOK.opacity * seen;
      if (rain.visible) {
        for (let i = 0; i < nDrops; i++) {
          dropAt(i, t, cx, cz, tmp);
          rPos[i * 6] = tmp.x; rPos[i * 6 + 1] = tmp.y; rPos[i * 6 + 2] = tmp.z;
          rPos[i * 6 + 3] = tmp.x + RAIN_LOOK.sway * 0.4; rPos[i * 6 + 4] = tmp.y2; rPos[i * 6 + 5] = tmp.z;
        }
        rGeo.attributes.position.needsUpdate = true;
      }
      if (!reducedMotion) placeMist(t);
      // the lantern breathes a little (steady on the low rungs and in reduced motion)
      if (light) light.intensity = (reducedMotion || low ? LIGHT.intensity : LIGHT.intensity * (1 + 0.08 * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 11.7 + 1))) * (1 + 0.3 * show.glow);
    },
    dispose() {
      scene.remove(rain, mist, rainbow);
      rGeo.dispose(); rain.material.dispose();
      mGeo.dispose(); mist.material.dispose();
      rainbow.geometry.dispose(); rainbow.material.dispose();
    },
  };
}
