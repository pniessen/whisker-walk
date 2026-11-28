// =============================================================================
// LIGHTHOUSE POINT: WEATHER AND ATMOSPHERE AS EVENTS (beauty pass 6, 2026-11-28). No mesh, no triangle, no caster: uniforms and
// colours on things that already exist (the sun, the fill, the fog, the sky's brightness, the clouds, the two seas) plus TWO pooled
// Points (rain streaks; and one buffer of dots for spray, white caps, star glints, stars, sparkle and the green flash).
//   A STORM      (a timed event, or any rainy walk): the sky and light go dark, the fog closes to a slate grey, the clouds darken, the seas
//                run rougher (normal-map amplitude) with white caps and spray off the rocks and the shore, rain streaks fall past her,
//                the lamp's beam glows brighter so its cone shows in the rain, lightning flashes light the whole sea (and the thunder
//                follows), the boats pitch (lighthousealive.js reads state.storm), the wind bed rises into a howl (lighthousesound.js).
//   FOG          (a timed event, likelier in the morning): the fog closes in thick but never nearer than 10 m, the beam sweeps through it,
//                the horn answers the beam, the boats' lanterns glow, the gulls fall silent.
//   SUNSET       (the real clock, 16:50 to 21:30; no timer): a long warm light, a glassy sea (the ripple flattens, the gloss rises) with gold
//                glitter, the far sails lit gold, now and then a green flash at the horizon where the sun sets.
//   STARRY NIGHT (rare: about two night walks in five): stars over the sea and their glitter in the water, and blue-green sparkle in the
//                waves where she wades.
// Pure functions of the walk's clock, the real hour, the room seed (hash01) and the weather the walk hands in: no random number, no clock
// of its own. Reduced motion: no timed events (no storm, no fog, no flash, no rain), the sunset and the stars stand still. Lite: fewer points.
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './builder.js';
import { skyBackground } from '../render/sky.js';
import { GULL_ROCK, PINNACLE, SEA_EAST, SEA_WEST } from './lighthouseplan.js';

const SALT = 0x6c57;
export const STORM_SLOT = 300, STORM_LEN = 100, FOG_SLOT = 260, FOG_LEN = 110;
export const FORCES = Object.freeze(['storm', 'fog', 'sunset', 'night']);
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const env = (t, at, len, ramp = 8) => sm(0, ramp, t - at) * sm(0, ramp, at + len - t);

// one timed event of a repeating slot (the first slot starts early): its envelope 0..1
function slotEnv(clock, slot, len, salt, chance, first0, first1, a, b) {
  const n = Math.floor(clock / slot);
  if (hash01(a + n, b, SALT + salt * 7) >= chance) return 0;
  const at = n * slot + (n === 0 ? first0 + (first1 - first0) * hash01(a + n, b, SALT + salt * 7 + 1) : 20 + (slot - len - 40) * hash01(a + n, b, SALT + salt * 7 + 1));
  return env(clock, at, len);
}

// the lightning: one flash every ~10 s of a storm (most slots), a quick double flicker, 0..1; thunder comes THUNDER s after it starts
const flashStart = (k, a, b) => k * 10 + 1.5 + 6 * hash01(a + k, b, SALT + 40);
const flashOn = (k, a, b) => hash01(a + k, b, SALT + 41) < 0.8;
export const THUNDER = (k, a, b) => 0.9 + 1.8 * hash01(a + k, b, SALT + 42);
export function flashAt(clock, a = 0, b = 0) {
  const k = Math.floor(clock / 10);
  if (!flashOn(k, a, b)) return 0;
  const d = clock - flashStart(k, a, b);
  if (d < 0 || d > 0.6) return 0;
  return d < 0.09 ? 1 : d < 0.17 ? 0.15 : d < 0.3 ? 0.8 : 0.8 * (1 - (d - 0.3) / 0.3);
}

// what the weather is doing now, 0..1 each. `hour` is the real clock, `night` the day's own 0..1 (lighthouseday.js)
export function eventsAt(clock, { hour = 18.5, night = 0, seed = 0, rain = false, reducedMotion = false, force = null } = {}) {
  const s = Number(seed);
  const a = Number.isFinite(s) ? s % 9973 : 0;
  const b = Number.isFinite(s) ? (s >>> 4) % 7919 : 0;
  const h = ((Number.isFinite(hour) ? hour : 18.5) % 24 + 24) % 24;
  const timed = reducedMotion ? 0 : 1;
  let storm = timed * slotEnv(clock, STORM_SLOT, STORM_LEN, 1, 0.34, 40, 80, a, b);
  let fog = timed * slotEnv(clock, FOG_SLOT, FOG_LEN, 2, h >= 4.5 && h < 10 ? 0.7 : 0.24, 25, 60, a, b);
  if (rain) storm = Math.max(storm, 0.5);
  fog *= 1 - storm;
  const calm = 1 - Math.max(storm, fog);
  const sunset = sm(16.8, 18.2, h) * (1 - sm(20.2, 21.6, h)) * calm;
  const stars = (hash01(a, b, SALT + 9) < 0.4 ? night : 0) * calm * sm(0, 10, clock);
  const ev = { storm, fog, sunset, stars, flash: storm > 0.55 && !reducedMotion ? flashAt(clock, a, b) * storm : 0, a, b };
  if (force) {
    ev.storm = force === 'storm' ? 1 : 0; ev.fog = force === 'fog' ? 1 : 0; ev.sunset = force === 'sunset' ? 1 : 0; ev.stars = force === 'night' ? 1 : 0;
    ev.flash = ev.storm && !reducedMotion ? flashAt(clock, a, b) : 0;
  }
  return ev;
}

const C = (x) => new THREE.Color(x);
const STORM_FOG = C(0x4f5964), FOG_COL = C(0xcfd5d8), SUN_FOG = C(0xf0a870), FLASH_COL = C(0xdfe8ff), SUN_COOL = C(0xb8c8e0), SUN_WARM = C(0xff7a30);
const SEA_STORM = [0.6, 0.72, 0.78], SEA_FOG = [0.92, 0.96, 1], SEA_SUN = [1.14, 0.92, 0.78], SEA_NIGHT = [0.78, 0.84, 1];
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

function sprite(draw, w = 32, h = 32) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const dotTex = () => sprite((x) => { const g = x.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.65)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 32, 32); });
const streakTex = () => sprite((x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(w / 2 - 1, 0, 2, h); }, 16, 64);

// `scene`, the walk's `sun` and `fill` (found in the scene when not handed in), the `waterFx` handles of the two seas, the `weather` the walk
// made (a rainy walk is a storm of 0.5 at least), `hour` and `night` from lighthouseday.js, `force` ('storm'|'fog'|'sunset'|'night') for the picture page.
export function createLighthouseWeather({ scene, sun = null, fill = null, waterFx = [], weather = null, hour = 18.5, night = 0, seed = 0, reducedMotion = false, lite = false, force = null, waters = [] } = {}) {
  const state = { storm: 0, fog: 0, sunset: 0, stars: 0, flash: 0, clock: 0 };
  const still = !!reducedMotion;
  let disposed = false;
  let B = null; // the baselines, read on the first update (after the walk has set its look)
  const found = (type) => { let r = null; scene?.traverse?.((o) => { if (!r && o[type]) r = o; }); return r; };
  const col = new THREE.Color();

  // ---- the sea's own amplitude: the handles' update() sets the ripple's strength each frame; ours multiplies it after
  const seas = [];
  for (const h of waterFx) {
    if (!h?.material || typeof h.update !== 'function') continue;
    const orig = h.update;
    const rec = { h, orig, ns: h.material.normalScale ? h.material.normalScale.x : null, color: h.material.color ? h.material.color.clone() : null, rough: h.material.roughness };
    h.update = function wxUpdate(dt) { orig.call(h, dt); applySea(rec); };
    seas.push(rec);
  }
  const seaMul = () => Math.max(0.35, 1 + 2.4 * state.storm - 0.55 * state.sunset - 0.2 * state.stars);
  function applySea(rec) {
    const m = rec.h.material;
    if (rec.ns !== null && m.normalScale) { if (rec.h.animated) m.normalScale.multiplyScalar(seaMul()); else m.normalScale.setScalar(rec.ns * seaMul()); }
  }
  function tintSeas() {
    for (const r of seas) {
      const m = r.h.material;
      if (r.color && m.color) {
        const k = [1, 1, 1];
        for (const [w, t] of [[state.storm, SEA_STORM], [state.fog, SEA_FOG], [state.sunset, SEA_SUN], [state.stars, SEA_NIGHT]]) for (let i = 0; i < 3; i++) k[i] *= lerp(1, t[i], w);
        m.color.setRGB(r.color.r * k[0], r.color.g * k[1], r.color.b * k[2]);
      }
      if (Number.isFinite(r.rough)) m.roughness = r.rough * (1 - 0.5 * state.sunset + 0.25 * state.storm);
    }
  }

  // ---- the rain: streaks
  const RAIN = lite ? 70 : 180;
  const rPos = new Float32Array(RAIN * 3);
  const rGeo = new THREE.BufferGeometry();
  rGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  const rain = new THREE.Points(rGeo, new THREE.PointsMaterial({ map: streakTex(), color: 0xc4d4e4, size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  rain.name = 'lighthouse:wx-rain';
  const rOff = Array.from({ length: RAIN }, (_, i) => [hash01(i, 1, SALT + 50) * 2 - 1, hash01(i, 2, SALT + 50), hash01(i, 3, SALT + 50) * 2 - 1]);

  // ---- the dots: spray, caps/glitter, stars, bio sparkle, the green flash
  const SPRAY = lite ? 10 : 28, SEAP = lite ? 20 : 44, STARS = lite ? 36 : 72, BIO = lite ? 16 : 32, FLASH = 9;
  const N = SPRAY + SEAP + STARS + BIO + FLASH;
  const dPos = new Float32Array(N * 3), dCol = new Float32Array(N * 3);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const dots = new THREE.Points(dGeo, new THREE.PointsMaterial({ map: dotTex(), size: 4.5 * dpr, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  dots.name = 'lighthouse:wx-dots';
  const S0 = 0, P0 = SPRAY, T0 = SPRAY + SEAP, B0 = T0 + STARS, F0 = B0 + BIO;
  for (const p of [rain, dots]) { p.visible = false; p.castShadow = false; p.receiveShadow = false; p.frustumCulled = false; p.userData.noMerge = true; p.userData.noCast = true; p.renderOrder = 8; }
  scene?.add(rain, dots);
  const bios = Array.from({ length: BIO }, () => ({ x: 0, z: 0, born: -9 }));
  let bioNext = 0; let lastBio = null;
  const put = (i, x, y, z, r, g, b) => { dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z; dCol[i * 3] = r; dCol[i * 3 + 1] = g; dCol[i * 3 + 2] = b; };
  const inSea = (x, z) => [SEA_EAST, SEA_WEST].some((w) => x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ) || waters.some((w) => w && w.kind === 'rect' && /^sea/.test(w.id ?? '') && x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ);

  // ---- sound edges
  // ---- the sky: a storm and a fog each have their own gradient, swapped in while the brightness is dipped (the day's own sky is kept and put back)
  const dim = 1 - 0.65 * night;
  const mk = (top, hor) => skyBackground(new THREE.Color(top).multiplyScalar(dim).getHex(), new THREE.Color(hor).multiplyScalar(dim).getHex());
  const skies = {}; let sky0 = null; let skyNow = 'day';
  function setSky(name) {
    if (!scene || skyNow === name) return;
    skies.storm ??= mk(0x2a313b, 0x66727c); skies.fog ??= mk(0xa6b1b8, 0xd3d9db);
    sky0 ??= scene.background;
    scene.background = name === 'day' ? sky0 : skies[name];
    skyNow = name;
  }
  let lastThunder = -1; let hornAt = 12; let lastBeamA = 0; let turns = 0;

  function update(dt, t, camera, catPos, sound = null, beamA = 0, lit = false) {
    if (disposed) return;
    B ??= {
      sun: sun ?? found('isDirectionalLight'), fill: fill ?? found('isHemisphereLight'), fog: scene?.fog ?? null,
      bgI: scene && Number.isFinite(scene.backgroundIntensity) ? scene.backgroundIntensity : 1, envI: scene && Number.isFinite(scene.environmentIntensity) ? scene.environmentIntensity : 1,
      clouds: scene?.getObjectByName?.('clouds') ?? null,
    };
    if (!B.base) {
      B.base = { sunI: B.sun?.intensity ?? 1, sunC: B.sun ? B.sun.color.clone() : C(0xffffff), fillI: B.fill?.intensity ?? 1, fillC: B.fill ? B.fill.color.clone() : C(0xffffff), fogC: B.fog ? B.fog.color.clone() : C(0xffffff), fogN: B.fog?.near ?? 45, fogF: B.fog?.far ?? 160, cloud: B.clouds?.material?.color?.clone() ?? null };
    }
    const raining = !!(weather && typeof weather.isRaining === 'function' && weather.isRaining());
    const ev = eventsAt(t, { hour, night, seed, rain: raining, reducedMotion: still, force });
    state.storm = ev.storm; state.fog = ev.fog; state.sunset = ev.sunset; state.stars = ev.stars; state.flash = ev.flash; state.clock = t;
    const { storm, fog, sunset, stars } = state;
    const cp = sound?.caps; const gk = cp ? cp.gk() : 1; const wE = cp ? cp.k('weather') : 1; // pass 10: shared caps (the event rule and the glow budget)
    const flash = state.flash * wE; // (the lightning's flash eases with its layer)
    const base = B.base;

    // light, sky, fog, clouds
    if (B.sun) {
      B.sun.intensity = base.sunI * (1 - 0.6 * storm - 0.35 * fog) * (1 + 0.28 * sunset) + 0.9 * flash;
      B.sun.color.copy(base.sunC).lerp(SUN_COOL, storm * 0.6).lerp(SUN_WARM, sunset * 0.75);
    }
    if (B.fill) { B.fill.intensity = base.fillI * (1 - 0.3 * storm - 0.1 * fog) * (1 + 0.1 * sunset) + 0.3 * flash; B.fill.color.copy(base.fillC).lerp(SUN_FOG, sunset * 0.25); }
    if (scene) {
      // (the day's sky dips to 0.35 as a storm or fog comes on, the event's own sky swaps in at the dip and comes up to full)
      const mode = storm > 0.5 ? 'storm' : fog > 0.5 ? 'fog' : 'day';
      setSky(mode);
      const dip = mode === 'storm' ? 0.35 + 0.65 * sm(0.5, 1, storm) * 0.85 : mode === 'fog' ? 0.55 + 0.45 * sm(0.5, 1, fog) : 1 - 0.65 * sm(0, 0.5, storm) - 0.45 * sm(0, 0.5, fog);
      if (Number.isFinite(scene.backgroundIntensity)) scene.backgroundIntensity = B.bgI * dip * (1 + 0.1 * sunset) + 0.45 * flash;
      if (Number.isFinite(scene.environmentIntensity)) scene.environmentIntensity = B.envI * (1 - 0.5 * storm) + 0.25 * flash;
    }
    if (B.fog) {
      col.copy(base.fogC).lerp(STORM_FOG, storm * 0.85).lerp(FOG_COL, fog * 0.92).lerp(SUN_FOG, sunset * 0.5).lerp(FLASH_COL, flash * 0.45);
      col.multiplyScalar(1 - 0.55 * night * Math.max(fog, 0.0) - 0.35 * night * storm);
      B.fog.color.copy(col);
      B.fog.near = lerp(lerp(base.fogN, 28, storm), 10, fog);
      B.fog.far = lerp(lerp(base.fogF, 105, storm), 56, fog);
    }
    if (B.clouds?.material?.color && base.cloud) { B.clouds.material.color.copy(base.cloud).multiplyScalar(1 - 0.55 * storm - 0.15 * fog); B.clouds.material.color.lerp(C(0xffcfa8), sunset * 0.3); }
    tintSeas();

    // where the camera is
    const cx = camera?.position?.x ?? catPos?.x ?? 0; const cy = camera?.position?.y ?? 2; const cz = camera?.position?.z ?? catPos?.z ?? 0;
    const px = catPos?.x ?? cx; const pz = catPos?.z ?? cz; const py = catPos?.y ?? 0;
    const dotsOn = storm > 0.02 || stars > 0.02 || sunset > 0.02;

    // rain streaks past her
    rain.visible = storm > 0.02 && !still;
    if (rain.visible) {
      rain.material.opacity = 0.62 * Math.min(1, storm * 1.2) * wE;
      for (let i = 0; i < RAIN; i++) {
        const o = rOff[i]; const y = (((o[1] * 11 - t * 17) % 11) + 11) % 11;
        const x = px + o[0] * 13 + (y - 5) * 0.28; const z = pz + o[2] * 13;
        rPos[i * 3] = x; rPos[i * 3 + 1] = py - 0.5 + y; rPos[i * 3 + 2] = z;
      }
      rGeo.attributes.position.needsUpdate = true;
    }

    if (cp) { cp.level('weather', Math.max(storm, fog * 0.8)); cp.glow('sunglints', sunset * 0.4 + stars * 0.35); }
    dots.material.opacity = gk;
    dots.visible = dotsOn;
    if (dotsOn) {
      const tt = still ? 0 : t;
      dCol.fill(0);
      // spray: off the two rocks and the east shore, a rise and a fall
      for (let i = 0; i < SPRAY; i++) {
        const ph = hash01(i, 1, SALT + 60); const u = ((tt * (0.4 + 0.3 * hash01(i, 2, SALT + 60)) + ph) % 1 + 1) % 1; const arc = 4 * u * (1 - u);
        const rock = i % 3 === 0 ? PINNACLE : i % 3 === 1 ? GULL_ROCK : null;
        let x; let z; let drift = 0;
        if (rock) { const an = ph * TAU; x = rock.x + Math.cos(an) * rock.r * 1.5; z = rock.z + Math.sin(an) * rock.r * 1.5; drift = 0.7; x += Math.cos(an) * drift * u; z += Math.sin(an) * drift * u; }
        else { x = SEA_EAST.minX + 0.3 + 2 * hash01(i, 3, SALT + 60) - 1.1 * u; z = pz + (hash01(i, 4, SALT + 60) - 0.5) * 56; }
        const k = storm * Math.sin(Math.PI * u) ** 0.8 * 0.85 * wE;
        put(S0 + i, x, 0.2 + arc * (rock ? 3.2 : 2.4), z, k, k, k * 1.02);
      }
      // the sea's dots: white caps in a storm, gold glitter at sunset, star glints at night (the nearer sea, a box round her)
      const east = cx > -2; const edge = east ? SEA_EAST.minX : SEA_WEST.maxX; const dir = east ? 1 : -1;
      for (let i = 0; i < SEAP; i++) {
        const hx = hash01(i, 5, SALT + 61); const hz = hash01(i, 6, SALT + 61); const ph = hash01(i, 7, SALT + 61) * TAU; const rate = 1.2 + 2.4 * hash01(i, 8, SALT + 61);
        const x = edge + dir * (3 + hx * 40); const z = Math.max(-66, Math.min(66, pz + (hz - 0.5) * 70));
        const tw = still ? 0.5 : Math.max(0, Math.sin(tt * rate + ph)) ** 3;
        const cap = still ? 0 : Math.max(0, Math.sin(tt * 0.9 + ph * 2)) ** 2 * (0.6 + 0.4 * Math.sin(tt * 2.7 + ph));
        const r = storm * cap * 0.9 + sunset * tw * 1.0 + stars * tw * 0.5;
        const g = storm * cap * 0.92 + sunset * tw * 0.72 + stars * tw * 0.75;
        const b = storm * cap + sunset * tw * 0.35 + stars * tw * 1.0;
        put(P0 + i, x, 0.13, z, r, g, b);
      }
      // stars: fixed in the sky about the camera, twinkling
      for (let i = 0; i < STARS; i++) {
        const az = hash01(i, 9, SALT + 62) * TAU; const el = 0.1 + 1.2 * hash01(i, 10, SALT + 62) ** 0.75;
        const tw = still ? 0.8 : 0.55 + 0.45 * Math.sin(tt * (1 + 2 * hash01(i, 11, SALT + 62)) + i * 1.7);
        const k = stars * tw * (0.75 + 0.4 * hash01(i, 12, SALT + 62));
        put(T0 + i, cx + 190 * Math.cos(el) * Math.cos(az), cy + 190 * Math.sin(el), cz + 190 * Math.cos(el) * Math.sin(az), k * 0.85, k * 0.92, k);
      }
      // sparkle in the waves where she steps (a night with stars)
      if (stars > 0.2 && catPos && inSea(px, pz) && !still) {
        if (!lastBio || Math.hypot(px - lastBio.x, pz - lastBio.z) > 0.35) {
          lastBio = { x: px, z: pz };
          for (let q = 0; q < 5; q++) { const e = bios[bioNext]; bioNext = (bioNext + 1) % BIO; e.x = px + (hash01(bioNext, q, SALT + 63) - 0.5) * 1.3; e.z = pz + (hash01(q, bioNext, SALT + 64) - 0.5) * 1.3; e.born = t; }
        }
      }
      for (let i = 0; i < BIO; i++) {
        const e = bios[i]; const age = (t - e.born) / 1.8; const k = age >= 0 && age < 1 ? (1 - age) ** 1.3 * stars : 0;
        put(B0 + i, e.x, 0.14 + 0.25 * Math.max(0, age), e.z, 0.15 * k, 1.4 * k, 1.15 * k);
      }
      // the green flash where the sun goes down (a few seconds, now and then; not in reduced motion)
      const ft = t % 45; const fk = sunset > 0.6 && !still ? sunset * Math.exp(-(((ft - 20) / 1.4) ** 2)) : 0;
      let dx = 1; let dz = 0.3;
      if (B.sun?.position) { const tg = B.sun.target?.position; dx = B.sun.position.x - (tg?.x ?? 0); dz = B.sun.position.z - (tg?.z ?? 0); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
      const rx = -dz; const rz = dx;
      for (let i = 0; i < FLASH; i++) {
        const gx = (i % 3) - 1; const gy = Math.floor(i / 3) - 1; const f = fk * (gx === 0 && gy === 0 ? 1 : 0.5);
        put(F0 + i, cx + dx * 175 + rx * gx * 1.1, cy + 1.2 + gy * 1.1, cz + dz * 175 + rz * gx * 1.1, 0.08 * f, 1 * f, 0.18 * f);
      }
      dGeo.attributes.position.needsUpdate = true;
      dGeo.attributes.color.needsUpdate = true;
    }

    // sounds: thunder after each flash, the wind bed, the gulls hushed and the horn answering the beam in fog
    if (!still && storm > 0.55) {
      const k = Math.floor(t / 10);
      if (flashOn(k, ev.a, ev.b) && lastThunder !== k && t >= flashStart(k, ev.a, ev.b) + THUNDER(k, ev.a, ev.b) && t < flashStart(k, ev.a, ev.b) + THUNDER(k, ev.a, ev.b) + 2) { lastThunder = k; sound?.surf?.(0.9); sound?.thunder?.(); }
    }
    sound?.weather?.(storm, fog);
    sound?.quiet?.(fog > 0.4);
    if (!still && fog > 0.6) {
      if (lit) { if (beamA < lastBeamA - 1) { turns++; if (turns % 2 === 0) hornAt = t + 2.5; } } else if (hornAt < t - 28) hornAt = t + 1;
      if (hornAt > 0 && t >= hornAt && t < hornAt + 1) { hornAt = lit ? -1 : t + 30; sound?.horn?.(); }
    }
    lastBeamA = beamA;
    void dt;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const r of seas) { r.h.update = r.orig; if (r.color && r.h.material.color) r.h.material.color.copy(r.color); if (Number.isFinite(r.rough)) r.h.material.roughness = r.rough; if (r.ns !== null && r.h.material.normalScale) r.h.material.normalScale.setScalar(r.ns); }
    if (B?.base) {
      const base = B.base;
      if (B.sun) { B.sun.intensity = base.sunI; B.sun.color.copy(base.sunC); }
      if (B.fill) { B.fill.intensity = base.fillI; B.fill.color.copy(base.fillC); }
      if (scene) { if (Number.isFinite(scene.backgroundIntensity)) scene.backgroundIntensity = B.bgI; if (Number.isFinite(scene.environmentIntensity)) scene.environmentIntensity = B.envI; }
      if (B.fog) { B.fog.color.copy(base.fogC); B.fog.near = base.fogN; B.fog.far = base.fogF; }
      if (B.clouds?.material?.color && base.cloud) B.clouds.material.color.copy(base.cloud);
    }
    if (sky0 && scene) scene.background = sky0;
    for (const t of Object.values(skies)) t.dispose?.();
    for (const p of [rain, dots]) { scene?.remove(p); p.geometry.dispose(); p.material.map?.dispose(); p.material.dispose(); }
  }

  return { update, dispose, state, rain, dots, get rig() { return B; }, get counts() { return { RAIN, SPRAY, SEAP, STARS, BIO, FLASH }; } };
}
