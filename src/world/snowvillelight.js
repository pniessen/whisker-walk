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
import { litSpots } from './snowvillebeauty.js';
import { ST, loadSnowvilleStoryStage } from './snowvillestages.js'; // the stages' slots (filled by their chunks, loaded with this one: areas.js)
import { coldStep, cheekTint, lineStep, nearWarm } from './snowvillewarmth.js';
import { phrase } from '../clanphrases.js';
import { bus } from '../events.js';

// Under vitest the story stage loads here (the village's life side: passes 4 to 8's wonder, living, weather, vista, reactions and the alive creatures, and the sound), so every test that imports this file gets it.
// (The flag is undefined in a build, so this line and its top-level await are dropped; the game's own loader awaits every stage with the base chunk.)
if (import.meta.env?.VITEST) await loadSnowvilleStoryStage();

export const FLAKE_LOOK = Object.freeze({ size: 0.14, opacity: 0.9, sway: 0.5 });
export const GLINT_LOOK = Object.freeze({ size: 0.1, opacity: 0.85, wobble: 0.4, rate: 1.7 });
export const CHEEK_PINK = 0xff8fa8;
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export const isLowTier = (tier) => !!tier && (tier.name === 'low' || tier.shadows === false || (tier.rung ?? 0) >= 3);
const say = (key, label) => bus.emit('discovery', { type: 'greenhousenote', key, label, points: 0, repeat: false });

// A gust of wind: a slow swell now and then (0 most of the time, up to 1), so the flakes lean and swirl together before settling. Pure; reduced motion passes t = 0 (no gust).
export const gustAt = (t) => { const g = Math.sin(t * 0.17) * Math.sin(t * 0.071 + 1.3); return g > 0.35 ? (g - 0.35) / 0.65 : 0; };
// Each flake also has its own size of sway (the big slow ones drift wide, the small quick ones fall straighter), which is how the one dot size reads as two sorts of flake.

// The flake `i` at time t over a cat at (cx, cz): wrapped into a box round her so there are always flakes near her, however far she walks. Pure.
export function flakeAt(i, t, cx, cz, out = { x: 0, y: 0, z: 0 }) {
  const B = P.FLAKES.box;
  const hx = hash(i, 1) * 2 * B; const hz = hash(i, 2) * 2 * B;
  const wrap = (v, c) => ((((v - c) % (2 * B)) + 2 * B) % (2 * B)) - B + c;
  const fall = (0.6 + 0.8 * hash(i, 3)) * P.FLAKES.fall * (hash(i, 5) < 0.3 ? 0.7 : 1);
  const y = P.FLAKES.top - ((hash(i, 4) * P.FLAKES.top + t * fall) % P.FLAKES.top);
  const big = hash(i, 5) < 0.3; // the big soft flakes sway wider and fall slower
  const g = gustAt(t) * (0.6 + 0.8 * hash(i, 6)) * (y / P.FLAKES.top) * 2.2; // a gust pushes the high flakes furthest
  out.x = wrap(hx - B, cx) + FLAKE_LOOK.sway * (big ? 1.5 : 0.8) * Math.sin(t * (big ? 0.4 : 0.6) + i * 1.9) + g;
  out.z = wrap(hz - B, cz) + FLAKE_LOOK.sway * (big ? 1.5 : 0.8) * Math.cos(t * 0.43 + i * 2.7) + g * 0.35;
  out.y = P.snowY(out.x, out.z) + y;
  return out;
}

// ---- BEAUTY PASS 2: the halos. Every lit thing (eave bulbs, fir lights, garland, lamp globes, windows, the star) gets a soft additive sprite in its own colour, twinkling on its own phase; one Points for the
// small bulbs and one for the big glows (windows, lamps), and one more for the cocoa stall's steam. A pure function of the time: the low rungs keep every second bulb; reduced motion holds them lit and still. ---
export const HALO = Object.freeze({ bulb: 0.55, big: 2.7, steam: 0.42, bulbRate: 1.6, flicker: 0.07 });
export const twinkle = (ph, t) => 0.62 + 0.38 * Math.sin(t * (1.4 + ph * 1.9) + ph * 61); // 0.24 .. 1
export const STEAM_MUGS = Object.freeze([0, 1, 2, 3].map((i) => { // the four mugs on the stall's counter (snowvilleparts.js drawSquare: local x -1 + 0.6 i, y 1.1, z d / 2 - 0.35), turned by its yaw
  const S = P.STALL; const lx = -1 + i * 0.6; const lz = S.d / 2 - 0.35; const sn = Math.sin(S.yaw); const co = Math.cos(S.yaw);
  return Object.freeze({ x: S.x + lx * co + lz * sn, z: S.z - lx * sn + lz * co });
}));
export const steamAt = (mug, j, t, out = { x: 0, y: 0, z: 0, u: 0 }) => { // puff j of a mug's three: up from the rim, thinning as it goes
  const u = (t * 0.36 + j / 3 + mug * 0.23) % 1;
  out.u = u; out.x = STEAM_MUGS[mug].x + 0.07 * Math.sin(u * 6 + mug * 2 + j); out.z = STEAM_MUGS[mug].z + 0.05 * Math.cos(u * 5 + j);
  out.y = P.snowY(STEAM_MUGS[mug].x, STEAM_MUGS[mug].z) + 1.2 + u * 0.75; return out;
};

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
const _fw = new THREE.Vector3();

// createSnowvilleLight({ scene, tier, reducedMotion }) -> { flakes, glints, light, cold, update(dt, t, catPos, camera, session), dispose() }
export function createSnowvilleLight({ scene, tier = null, reducedMotion = false, audio = null, season = null, sun = null, fill = null, now = null, force = false }) {
  const { createWonder, createLiving, createWeather, createVista, createReactions, createFestival, createAlive, waveAt, chase, glowNear, SHARED } = ST.story;
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

  // the halos
  const litAll = litSpots().filter((s, i) => !low || s.big || i % 2 === 0);
  const smalls = litAll.filter((s) => !s.big); const bigs = litAll.filter((s) => s.big);
  const haloLayer = (list, size, name) => {
    const pos = new Float32Array(list.length * 3); const col = new Float32Array(list.length * 3);
    list.forEach((s, i) => { pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
    pts.name = name; pts.frustumCulled = false;
    Object.assign(pts.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(pts);
    return { pts, g, col, list };
  };
  const _h = new THREE.Color();
  let nearX = 1e9; let nearZ = 1e9; // her place (windows and lamps wake as she comes near; the bulbs' twinkle chases along their strings)
  const paintHalos = (L, t, level) => {
    L.list.forEach((s, i) => {
      const k = level * weather.glow * (reducedMotion ? 0.8 : SHARED.breath * (L === smallL ? twinkle(s.ph, t) * chase(i, t) : (1 + HALO.flicker * Math.sin(t * 1.1 + s.ph * 40)) * glowNear(Math.hypot(s.x - nearX, s.z - nearZ)) * living.wakeAt(s.x, s.z, t) * rx.boost(s.x, s.z, t)));
      _h.setHex(s.hex);
      L.col[i * 3] = _h.r * k; L.col[i * 3 + 1] = _h.g * k; L.col[i * 3 + 2] = _h.b * k;
    });
    L.g.attributes.color.needsUpdate = true;
  };
  const weather = createWeather({ scene, sun, fill, audio, reducedMotion, low, now }); // beauty pass 6: the hour's weather and the rare events (the halos below glow with it)
  const vista = createVista({ scene, sun, fill, audio, reducedMotion, low }); // beauty pass 7: five photo spots (haze bands, a glowing focus, a warm grade, the golden moment)
  const rx = createReactions({ scene, audio, rung: (tier?.rung ?? 0) >= 3 ? 'lite' : low ? 'low' : 'high', motion: !reducedMotion, targets: [{ x: P.STALL.x - 0.8, z: P.STALL.z, y: P.snowY(P.STALL.x, P.STALL.z) + 1.4 }, { x: 11, z: 1, y: P.snowY(11, 1) + 1.7 }] }); // beauty pass 8: the village answers her voice and her moves
  const festival = createFestival({ scene, audio, rung: (tier?.rung ?? 0) >= 3 ? 'lite' : low ? 'low' : 'high', motion: !reducedMotion, now, force }); // beauty pass 9: the winter lantern festival (the festival evenings only)
  const living = createLiving({ scene, tier, reducedMotion, audio, low, sun }); // beauty pass 5: creatures, the arrival, the shared breath, hour and wind
  const smallL = haloLayer(smalls, HALO.bulb, 'snowville:halos');
  const bigL = haloLayer(bigs, HALO.big, 'snowville:glows');
  paintHalos(smallL, 0, 0.9); paintHalos(bigL, 0, 0.5);
  const nSteam = STEAM_MUGS.length * (low ? 2 : 3);
  const stPos = new Float32Array(nSteam * 3); const stCol = new Float32Array(nSteam * 3);
  const stGeo = new THREE.BufferGeometry();
  stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3)); stGeo.setAttribute('color', new THREE.BufferAttribute(stCol, 3));
  const steam = new THREE.Points(stGeo, new THREE.PointsMaterial({ map: dotTexture(), alphaTest: 0.02, size: HALO.steam, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, fog: true }));
  steam.name = 'snowville:steam'; steam.frustumCulled = false;
  Object.assign(steam.userData, { noCast: true, noContactShadow: true, noMerge: true });
  scene.add(steam);
  const stA = new THREE.Color(0xfffaf0); const stB = new THREE.Color(P.SNOW_LOOK.horizon); const sTmp = { x: 0, y: 0, z: 0, u: 0 };
  function placeSteam(t) {
    let n = 0;
    for (let m = 0; m < STEAM_MUGS.length; m++) for (let j = 0; j < nSteam / STEAM_MUGS.length; j++) {
      steamAt(m, j, reducedMotion ? 0 : t, sTmp);
      stPos[n * 3] = sTmp.x; stPos[n * 3 + 1] = sTmp.y; stPos[n * 3 + 2] = sTmp.z;
      _h.copy(stA).lerp(stB, sTmp.u * sTmp.u); stCol[n * 3] = _h.r; stCol[n * 3 + 1] = _h.g; stCol[n * 3 + 2] = _h.b; n++;
    }
    stGeo.attributes.position.needsUpdate = true; stGeo.attributes.color.needsUpdate = true;
  }
  placeSteam(0);

  const alive = createAlive({ scene, tier, reducedMotion, audio, low });
  const wonder = createWonder({ scene, tier, reducedMotion, audio, low, season }); // beauty pass 4: the season's tint, thaw drips, and the rare surprises
  weather.state.skipThaw = !!wonder.look.drips; // (the thaw season already has its own drips and puddles)
  const light = scene.getObjectByName('snowville:light') ?? null;
  const cheeks = createCheeks();
  let auroraAt = 25;
  const talk = { said: false };
  let cold = 0;
  const tmp = { x: 0, y: 0, z: 0 };

  function place(t, cx, cz) {
    const tt = reducedMotion ? 0 : t; // standing still in reduced motion: the same flakes round her, each at a fixed offset, none falling
    for (let i = 0; i < nFlakes; i++) { flakeAt(i, tt, cx, cz, tmp); fPos[i * 3] = tmp.x; fPos[i * 3 + 1] = tmp.y; fPos[i * 3 + 2] = tmp.z; }
    fGeo.attributes.position.needsUpdate = true;
    fGeo.setDrawRange(0, reducedMotion ? Math.max(8, Math.round(nFlakes * (wonder.look.flakes ?? 1))) : Math.max(8, Math.round(nFlakes * waveAt(t) * (wonder.look.flakes ?? 1)))); // the snowfall waxes and wanes in waves
  }
  place(0, P.SNOWVILLE_SPAWN.x, P.SNOWVILLE_SPAWN.z);

  return {
    flakes,
    glints,
    light,
    get cold() { return cold; },
    cheeks,
    alive,
    wonder,
    living,
    weather,
    vista,
    rx,
    festival,
    update(dt, t, catPos, _camera, session) {
      const cx = catPos?.x ?? P.SNOWVILLE_SPAWN.x;
      const cz = catPos?.z ?? P.SNOWVILLE_SPAWN.z;
      place(t, cx, cz);
      nearX = cx; nearZ = cz;
      living.update(dt, t, catPos, _camera);
      alive.update(dt, t, catPos, _camera, session);
      weather.update(dt, t, catPos, _camera);
      if (_camera?.getWorldDirection) { _camera.getWorldDirection(_fw); rx.step(dt, t, catPos ?? { x: cx, y: P.snowY(cx, cz), z: cz }, session, _fw); } else rx.step(dt, t, catPos ?? { x: cx, y: P.snowY(cx, cz), z: cz }, session);
      festival.step(dt, t, catPos ?? { x: cx, y: P.snowY(cx, cz), z: cz });
      vista.update(dt, t, catPos, _camera, session); // (after the weather: it sets the fog and the fill each frame, the vista's grade goes on top)
      wonder.update(dt, t, catPos, _camera);
      if (weather.night > 0.8 && !wonder.state.kind && t >= auroraAt) { auroraAt = t + 200; wonder.trigger('aurora'); } // a clear night: the aurora of pass 4 every few minutes
      bigL.pts.material.size = HALO.big * weather.halo * (1 + 0.8 * rx.pulse(t)); smallL.pts.material.size = HALO.bulb * (1 + 0.5 * (weather.halo - 1));
      flakes.material.color.setRGB(0.9 + 0.1 * SHARED.hour, 0.94 + 0.06 * SHARED.hour, 1 - 0.06 * SHARED.hour); // the blue hour's flakes are a touch cooler
      if (!reducedMotion) { paintHalos(smallL, t, 0.9); paintHalos(bigL, t, 0.5); placeSteam(t); }
      if (!reducedMotion) glints.material.opacity = GLINT_LOOK.opacity - GLINT_LOOK.wobble * (0.5 + 0.5 * Math.sin(t * GLINT_LOOK.rate));
      if (light) light.intensity = reducedMotion || low ? LIGHT.intensity : LIGHT.intensity * SHARED.breath * (1 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1));
      const warm = nearWarm(cx, cz);
      const before = cold;
      cold = coldStep(cold, dt, warm);
      if (lineStep(talk, cold)) say('snowville-cold', phrase('snowville.cold'));
      else if (warm && before > 0.6 && cold <= 0.6) say('snowville-warm', phrase('snowville.warm'));
      cheeks.set(session?.cat ?? null, cheekTint(cold));
    },
    dispose() {
      cheeks.restore();
      alive.dispose();
      living.dispose();
      wonder.dispose();
      weather.dispose();
      vista.dispose();
      rx.dispose();
      festival.dispose();
      scene.remove(flakes, glints, smallL.pts, bigL.pts, steam);
      for (const L of [smallL, bigL]) { L.g.dispose(); L.pts.material.dispose(); }
      stGeo.dispose(); steam.material.dispose();
      fGeo.dispose(); flakes.material.dispose();
      gGeo.dispose(); glints.material.dispose();
    },
  };
}
