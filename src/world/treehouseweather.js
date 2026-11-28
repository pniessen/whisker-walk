// The Treehouse, beauty pass 6 (2026-11-28): weather and atmosphere as EVENTS, no triangle, mesh, light or caster. Four events and the clear-up:
//   * RAIN (the walk's own slots, or the real weather): drops drumming, eave drips in rhythm, puddle rings and bowing boughs (treehouseglow.js), lamps warmer (the pools, treehouseglow.js), far thunder, then
//     a clearing: steam off the leaves and the rainbow;
//   * MISTY DAWN (the real clock): fog banks between the trunks, deeper shafts, birds taking up the chorus one by one;
//   * GOLDEN HOUR (the real clock): a warm lean, long shafts, seeds and pollen drifting;
//   * STORM WIND (rare): the whole canopy leans and sways, leaves stream, the lamps swing wide, creaks and chimes louder (the life reads `stormK`).
// Everything here is pooled Points and uniforms (pooled Points are not meshes). Reduced motion keeps only the still tints and one still bank of fog; LITE has fewer drops and no motes.
// `eventAt` and `shape` are pure (no clock of their own: the walk's time and the seed).
import * as THREE from 'three';
import * as P from './treehouseplan.js';

export const SLOT = 420; // seconds of the walk per weather slot
export const DUR = Object.freeze({ rain: 215, storm: 34 }); // the event's whole life, the rain's clearing included
const sm = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const fr = (v) => v - Math.floor(v);

/** What event is on at the walk's time t: { kind: 'rain' | 'storm' | null, age, key }. forced: a name (the picture page, a test); real: the real weather's condition. */
export function eventAt(t, { seed = 0, real = null, forced = null, forcedAge = 0, hash }) {
  if (forced === 'rain' || forced === 'storm') return { kind: forced, age: t + forcedAge, key: -1 };
  if (forced === 'steam') return { kind: 'rain', age: 135 + t, key: -1 };
  if (forced) return { kind: null, age: 0, key: -2 };
  const k = Math.floor(t / SLOT); const roll = hash(k, 600 + (seed % 97));
  const kind = real === 'rain' ? (roll < 0.65 ? 'rain' : roll > 0.95 ? 'storm' : null) : (roll < 0.1 ? 'rain' : roll < 0.14 ? 'storm' : null);
  if (!kind) return { kind: null, age: 0, key: k };
  const age = t - k * SLOT - (40 + 120 * hash(k, 601));
  return age >= 0 && age <= DUR[kind] ? { kind, age, key: k } : { kind: null, age: 0, key: k };
}
/** The event's strengths { rain, storm, steam } 0..1 (pure). */
export function shape(kind, age, out = {}) {
  out.rain = out.storm = out.steam = 0;
  if (kind === 'rain') { out.rain = sm(age / 18) * (1 - sm((age - 125) / 25)); out.steam = sm((age - 128) / 14) * (1 - sm((age - 165) / 50)); }
  else if (kind === 'storm') out.storm = sm(age / 6) * (1 - sm((age - 24) / 10));
  return out;
}
export const CLAPS = Object.freeze([38, 72, 104]); // rain-age seconds of the lightning (a few seconds of jitter added)

const BOX = 26; const TOP = 10;

/** createWeather(ctx, env) -> { update(t, catPos, rh), shaftK, lampK, stormK, dispose() }. env: { hash01, rung, reducedMotion, dotTexture, sky, wind, aud, blip }. */
export function createWeather(ctx, env) {
  const { scene } = ctx; const { hash01, rung, reducedMotion: still, sky, wind: WIND } = env; const lite = rung === 'lite';
  const NR = lite ? 80 : 260; const ND = 15; const NM = lite ? 0 : 64; const NT = NR + ND + NM;
  const pos = new Float32Array(NT * 3); const col = new Float32Array(NT * 3);
  const mk = (arr, vc) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); if (vc) g.setAttribute('color', new THREE.BufferAttribute(vc, 3)); return g; };
  const NF = lite ? 0 : 12; const fpos = new Float32Array(NF * 3);
  const dots = new THREE.Points(mk(pos, col), new THREE.PointsMaterial({ map: env.dotTexture(), alphaTest: 0.05, size: 0.3, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  const fog = new THREE.Points(mk(fpos), new THREE.PointsMaterial({ map: env.dotTexture(), size: 17, sizeAttenuation: true, color: 0xf2eee6, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  const all = [dots, fog];
  for (const o of all) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); o.visible = false; scene.add(o); }
  dots.name = 'treehouse:weather'; fog.name = 'treehouse:fogbanks';
  const fseed = []; for (let i = 0; i < NF; i++) fseed.push([hash01(i, 610), hash01(i, 611), hash01(i, 612)]);
  for (let i = 0; i < NF; i++) { fpos[i * 3] = -20 + 40 * fseed[i][0]; fpos[i * 3 + 1] = 1.6 + 3 * fseed[i][1]; fpos[i * 3 + 2] = -20 + 36 * fseed[i][2]; } // the still bank (reduced motion keeps these)
  const eaves = []; // the huts' eaves: five drip points round each, each on its own beat of the one rhythm
  for (const k of P.DECKS) if (k.hut) for (let j = 0; j < 5; j++) { const a = j * 1.2566 + 0.3; eaves.push({ x: k.hut.x + Math.cos(a) * (k.hut.r + 0.2), z: k.hut.z + Math.sin(a) * (k.hut.r + 0.2), y: k.y + k.hut.h * 0.95, h: k.hut.h * 0.95, ph: hash01(eaves.length, 620) }); }
  const forced = ctx.wx ?? null; const wxAge = Number(ctx.wxAge ?? 40) || 0;
  const S = {}; const out = { shaftK: 1, lampK: 1, stormK: 0, rain: 0, storm: 0, mist: 0, gold: 0, steam: 0, bow: 0 };
  let clap = 0; let clapKey = -9; let flash = 0; let flashAt = -9;
  const gust = (u) => 0.65 + 0.35 * Math.sin(u * 0.31);

  // ---- sound (the beds are the life's: it reads `state`) ----
  const aud = env.aud; // the life's own sound helpers (treehouseliving.js)
  function thunder(delay) { // far away: a low rumble that swells and rolls off
    const ac = aud(); if (!ac) return; const w = ac.currentTime + delay; const g = ac.createGain(); const f = ac.createBiquadFilter(); const o = ac.createOscillator();
    f.type = 'lowpass'; f.frequency.value = 140; o.type = 'sawtooth'; o.frequency.setValueAtTime(48, w); o.frequency.exponentialRampToValueAtTime(34, w + 3.4);
    g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(0.05, w + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, w + 3.6);
    o.connect(f); f.connect(g); g.connect(ctx.audio.getMaster?.() ?? ac.destination); o.start(w); o.stop(w + 3.8);
  }

  function setLook() {
    sky?.setWx(out.rain, out.mist, out.gold, out.storm, out.steam, flash, out.steam * 0.95);
  }

  let lastClock = -99;
  return {
    get shaftK() { return out.shaftK; }, get lampK() { return out.lampK; }, get stormK() { return out.storm; }, get state() { return out; },
    /** Each frame (the walk's time t, her position, the day's weights from rhythm(), reduced motion). */
    update(t, catPos, rh0) {
      let rh = rh0;
      if (forced === 'off') rh = { dawn: 0, gold: 0 };
      const e = still ? { kind: null, age: 0, key: -3 } : eventAt(t, { seed: ctx.roomSeed ?? 0, real: ctx.weather?.condition ?? null, forced, forcedAge: wxAge, hash: hash01 });
      shape(e.kind, e.age, S);
      out.rain = S.rain; out.storm = S.storm; out.steam = S.steam;
      const wet = Math.max(S.rain, S.steam * 0.6);
      out.mist = Math.max(0, sm(rh.dawn * 1.15) * (1 - 0.7 * S.rain)) + 0.35 * wet; // the dawn's fog banks; the rain and its clearing raise a modest haze of their own
      out.gold = rh.gold * (1 - S.rain) * (1 - 0.6 * S.storm);
      out.shaftK = Math.max(0.12, (1 + 0.45 * out.mist + 0.6 * out.gold) * (1 - 0.8 * S.rain) * (1 + 0.35 * S.steam));
      out.lampK = 1 + 0.55 * S.rain + 0.2 * out.gold + 0.15 * out.mist;
      // thunder: a few claps in each rain, a flash now and the far rumble a moment after
      if (e.kind === 'rain') {
        if (e.key !== clapKey) { clapKey = e.key; clap = 0; }
        while (clap < CLAPS.length && e.age >= CLAPS[clap] + 3 * hash01(clap, 630)) { flashAt = t; thunder(0.7 + 1.1 * hash01(clap, 631)); clap++; }
      } else clapKey = -9;
      flash = t - flashAt < 0.5 ? Math.max(0, 1 - (t - flashAt) * 2.4) * (0.55 + 0.45 * Math.sin((t - flashAt) * 40)) * 0.5 : 0;
      setLook();
      if (still) { if (lastClock < 0) { lastClock = 0; fog.visible = NF > 0 && out.mist > 0.03; fog.material.opacity = 0.3 * out.mist; } return; } // one still look: the day's tints and one bank of fog; nothing moves
      const cx = catPos ? catPos.x : 0; const cy = catPos && Number.isFinite(catPos.y) ? catPos.y : 1; const cz = catPos ? catPos.z : 0;
      const wrap = (v, c) => c - BOX / 2 + ((((v - (c - BOX / 2)) % BOX) + BOX) % BOX);
      const wrap40 = (v, c) => c - 20 + ((((v - (c - 20)) % 40) + 40) % 40);
      let n = 0;
      const put = (x, y, z, r, g, b) => { pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; col[n * 3] = r; col[n * 3 + 1] = g; col[n * 3 + 2] = b; n++; };
      const away = () => put(0, -200, 0, 0, 0, 0);
      for (let i = 0; i < NR; i++) { // rain: world-anchored drops that fall slanted with the wind and wrap round her
        if (out.rain < 0.03 || i > NR * Math.min(1, out.rain * 1.2)) { away(); continue; }
        const u = fr(t * (0.65 + 0.2 * hash01(i, 640)) + hash01(i, 641)); const a = 0.9 * out.rain;
        put(wrap(hash01(i, 642) * 200 + WIND.x * u * 2.5, cx), cy + TOP - u * (TOP + 3), wrap(hash01(i, 643) * 200 + WIND.z * u * 2.5, cz), 0.75 * a, 0.88 * a, 1.0 * a);
      }
      const dripOn = out.rain > 0.15 || S.steam > 0.2;
      for (let i = 0; i < ND; i++) { // the eaves drip in one rhythm (each point on its own beat); the drop falls from the eave to the deck
        const e2 = eaves[i % eaves.length]; if (!e2 || !dripOn) { away(); continue; }
        const T = Math.sqrt(2 * e2.h / 9.8); const per = 1.5; const tau = fr(t / per + e2.ph) * per - (per - T);
        if (tau < 0) { away(); continue; }
        const a = 0.9 * Math.max(out.rain, 0.4);
        put(e2.x, e2.y - 0.5 * 9.8 * tau * tau, e2.z, 0.65 * a, 0.78 * a, 0.9 * a);
      }
      for (let i = 0; i < NM; i++) { // one pool: the storm's leaves streaming down the wind, golden-hour seeds and pollen, or steam rising off the leaves after the rain
        const sv = S.steam; const g = out.gold; const k = out.storm > 0.04 ? 0 : sv > g ? 1 : 2; const w = k ? (k > 1 ? g : sv) : out.storm; if (w < 0.04) { away(); continue; }
        const u = fr(t * [0.18, 0.1, 0.03][k] * (0.7 + 0.6 * hash01(i, 650)) + hash01(i, 651)); const sw = Math.sin(t * 0.7 + i * 1.9); const f = k ? 3 : 40; const l = k > 1 ? 0.5 + 0.5 * Math.sin(t * 2 + i * 3) : k ? 1 - u : 1; const gl = k ? k - 1 : hash01(i, 652) > 0.55 ? 1 : 0;
        put(wrap(hash01(i, 653) * 200 + sw * 0.6 + WIND.x * u * f, cx), cy + 0.5 + (k === 0 ? 6 * hash01(i, 654) + 1.4 * sw - u : k === 1 ? 7 * u : 4 * u + 1.2 * Math.sin(t * 0.9 + i)), wrap(hash01(i, 655) * 200 + sw * 0.4 + WIND.z * u * f, cz),
          w * l * (k === 1 ? 0.5 : gl ? 0.9 : 0.35), w * l * (k === 1 ? 0.62 : gl ? 0.7 : 0.6), w * l * (k === 1 ? 0.58 : gl ? 0.3 : 0.18));
      }
      dots.visible = true;
      dots.geometry.attributes.position.needsUpdate = true; dots.geometry.attributes.color.needsUpdate = true;
      if (NF) { // fog banks between the trunks: slow drifting banks low in the clearing, modest so the prompts and the guide arrow stay readable
        fog.visible = out.mist > 0.03; fog.material.color.set(S.rain > 0.1 || S.steam > 0.1 ? 0xb4bfc4 : 0xf4ecdf); fog.material.opacity = Math.min(0.32, 0.3 * out.mist);
        for (let i = 0; i < NF; i++) { const a = t * 0.05 + i * 2.3; fpos[i * 3] = wrap40(fseed[i][0] * 400 + WIND.x * 3 * Math.sin(a), cx); fpos[i * 3 + 1] = 1.3 + 3 * fseed[i][1] + 0.4 * Math.sin(a * 1.3); fpos[i * 3 + 2] = wrap40(fseed[i][2] * 400 + WIND.z * 3 * Math.sin(a), cz); }
        fog.geometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(...all); for (const o of all) { o.geometry.dispose(); o.material.dispose(); }
      sky?.setWx(0, 0, 0, 0, 0, 0, 0);
    },
  };
}
