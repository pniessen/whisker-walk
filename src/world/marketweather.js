// =============================================================================
// WEATHER AND ATMOSPHERE AS EVENTS (Market beauty pass 6). Part of the Market's story stage (marketstagelife.js): no triangle,
// mesh or caster is added. One pooled Points of soft pictures drawn in its own shader (no texture) carries the air, and a few
// uniforms the square already has (the tone, the lanterns' glow, the cloth's sway, the cobbles' new uMkWet) carry the look:
//   * RAIN: the cobbles darken and shine and ripple with drops, awnings drum and drip, the lanterns glow warmer in halos, thunder
//     far off; then it clears: steam off the cobbles and a rainbow over the fountain. On a walk the game itself made rainy
//     (ctx.weather) it follows the game's rain and its rainbow; on a clear walk a shower comes now and then of its own.
//   * MORNING MIST: low fog drifting about the stalls, shafts of light, the bakery's steam, birds starting up.
//   * GOLDEN HOUR: a warm key on the cobbles and the sun, the lanterns' halos coming on.
//   * A FESTIVAL EVENING (rare: some days of the real calendar): strings of lights round the square, a banner swag over the
//     fountain, confetti and a soft street tune.
//   * A WIND GUST (rare): awnings billow, bunting streams, paper and leaves swirl across the square.
// Everything is a pure function of the walk's seconds and hash01 (no Math.random); the schedule is moodAt below. Fog and rain are
// modest and keep clear of the cat so prompts, bubbles and the guide arrow stay readable. Reduced motion has no events; the lite
// rung has no points (the tone and the lanterns only).
// =============================================================================
import * as THREE from 'three';
import { hash01 } from './warehouselook.js';
import { withLocalUuids } from './localuuids.js';
import { STALLS, FOUNTAIN, MARKET_BOUNDS, CAFE, AWNING, awningHeight, fromStall, stallById } from './marketplan.js';
import { DAY_PERIOD } from './marketreact.js';
import { loudness } from './roofssound.js';
import { VISTA_N, defVista, paintVista } from './marketvista.js';
import { NIGHT_N, defNight, createNight } from './marketnight.js';

export const WSALT = 257;
const ss = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// a rare festival: about one day in seven of the real calendar
export function festivalDay(d = new Date()) {
  return hash01(d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate(), 0, WSALT) < 0.14;
}

// The weights of the events at walk second t: o = { part, cond ('clear' | 'rain' | 'sunset'), raining, rainbow, festival, dusk }.
// A fresh object each call is fine (it runs once a frame, and tests read it); `force` names one event for a picture.
export function moodAt(t, o, m = {}) {
  m.wet = m.clear = m.mist = m.golden = m.fest = m.gust = m.rain = 0;
  if (o.still) return m;
  const n = Math.floor(t / DAY_PERIOD);
  const u = t - n * DAY_PERIOD;
  const R = o.cond === 'rain';
  const calm = !R && o.cond !== 'sunset' && !o.dusk;
  if (R) {
    m.wet = o.raining ? 1 : 0;
    m.clear = o.rainbow ? 1 : 0;
  } else if (calm) {
    const x = u - (120 + 90 * hash01(n, 1, WSALT)); // a shower, one cycle in two: in 10 s, out by 75, then it clears
    if (hash01(n, 2, WSALT) < 0.5) {
      m.wet = ss(0, 10, x) * (1 - ss(55, 75, x));
      m.clear = ss(62, 78, x) * (1 - ss(95, 125, x));
      m.rain = m.wet;
    }
    const g = u - (330 + 100 * hash01(n, 3, WSALT)); // a gust, two cycles in five, 26 s
    if (hash01(n, 4, WSALT) < 0.4 && g > 0 && g < 26 && m.wet < 0.05) m.gust = Math.sin((Math.PI * g) / 26);
  }
  if (calm) m.mist = (1 - ss(0.08, 0.3, o.part)) * (1 - m.wet);
  m.golden = R ? 0 : o.dusk || o.cond === 'sunset' ? 0.85 : ss(0.55, 0.8, o.part) * (1 - m.wet);
  if (o.festival && !R) m.fest = o.dusk || o.cond === 'sunset' ? 0.9 : ss(0.78, 0.9, o.part);
  const f = o.force;
  if (f) { // a picture's choice: the one event at full
    m.wet = f === 'rain' ? 1 : 0; m.rain = m.wet; m.clear = f === 'clearing' ? 1 : 0; m.mist = f === 'mist' ? 1 : 0;
    m.golden = f === 'golden' ? 1 : 0; m.fest = f === 'festival' ? 1 : 0; m.gust = f === 'gust' ? 1 : 0;
  }
  return m;
}

// ---- the pool
const KIND = { soft: 0, streak: 1, dot: 2, bird: 3, rect: 4, shaft: 5, pennant: 6, bulb: 7 };
const FEST_COLOURS = [0xf06fa0, 0xf3d54a, 0x6fb8f0, 0xff8a50, 0x9be08a, 0xb48ad8];
const BOW = [0xe84a4a, 0xf0a030, 0xf0e050, 0x60c860, 0x5090e8, 0x9060d0];
const SHOPS = STALLS.filter((s) => s.w > 0);
const N = { mist: 26, shaft: 5, steam: 14, bird: 6, rain: 64, drip: 20, halo: 20, bulb: 56, pennant: 18, confetti: 36, leaf: 22, bow: 6 * 18, ...VISTA_N, ...NIGHT_N };
const I = {};
let total = 0;
for (const k of Object.keys(N)) { I[k] = total; total += N[k]; }
export const WEATHER_COUNT = total;
const B = MARKET_BOUNDS;
const EDGE = AWNING.front; // the awning's front edge, from the stall's counter line

const VERT = `
attribute float aKind; attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aCol;
uniform float uPx;
varying float vK; varying float vA; varying float vR; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vK = aKind; vA = aAlpha; vR = aRot; vC = aCol;
  gl_Position = aAlpha < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uPx * projectionMatrix[1][1] / max(0.1, -mv.z), 1.0, 380.0);
}`;
const FRAG = `
varying float vK; varying float vA; varying float vR; varying vec3 vC;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float a = 0.0;
  vec3 c = vC;
  int k = int(vK + 0.5);
  if (k == 0) a = pow(1.0 - min(r, 1.0), 2.0);
  else if (k == 1) a = (1.0 - smoothstep(0.0, 0.16, abs(p.x))) * (1.0 - smoothstep(0.55, 1.0, abs(p.y)));
  else if (k == 2) a = 1.0 - smoothstep(0.55, 0.85, r);
  else if (k == 3) a = (1.0 - smoothstep(0.08, 0.16, abs(p.y + 0.15 - abs(p.x) * (0.9 - vR * 1.4)))) * step(abs(p.x), 0.95);
  else if (k == 4) { float s = sin(vR); float q = cos(vR); vec2 d = vec2(q * p.x - s * p.y, s * p.x + q * p.y); a = step(abs(d.x), 0.8) * step(abs(d.y), 0.45); }
  else if (k == 5) a = (1.0 - smoothstep(0.0, 0.34, abs(p.x - p.y * 0.18))) * (1.0 - smoothstep(0.5, 1.0, abs(p.y)));
  else if (k == 6) a = step(abs(p.x), 0.9 * (0.95 - p.y) * 0.5) * step(abs(p.y), 0.9);
  else { float core = 1.0 - smoothstep(0.1, 0.26, r); a = max(core, 0.5 * pow(1.0 - min(r, 1.0), 2.0)); c = mix(c, vec3(1.0, 0.97, 0.88), core * 0.7); }
  gl_FragColor = vec4(c, a * vA);
  #include <colorspace_fragment>
}`;

const SORTED = [...SHOPS, { id: 'cafe', at: { x: CAFE.tables[1].x, z: CAFE.tables[1].z } }].sort((a, b) => Math.atan2(a.at.z, a.at.x) - Math.atan2(b.at.z, b.at.x));
const rungLite = (tier) => !!tier && (tier.shadows === false || tier.name === 'low' || (tier.rung ?? 0) >= 3);
const wrap = (v, c, span) => c + ((((v - c) % span) + span * 1.5) % span) - span / 2;

// createWeather(scene, area, { reducedMotion, tier, dusk, now, weather, sun, force, festival }) -> { update, glow, amp, gust, mood, points, dispose }
export function createMarketWeather(scene, area, ctx = {}) {
  const react = area?.react ?? null;
  const reduced = !!ctx.reducedMotion;
  const lite = rungLite(ctx.tier);
  const festival = ctx.festival ?? festivalDay(ctx.now ?? new Date());
  const sun = ctx.sun ?? null;
  const sun0 = sun?.color ? { c: sun.color.clone(), i: sun.intensity } : null;
  const fill = ctx.fill ?? null;
  const fill0 = fill ? fill.intensity : 0;
  const warm = new THREE.Color(0xffd9a0);
  const cur = { wet: 0, clear: 0, mist: 0, golden: 0, fest: 0, gust: 0, rain: 0 };
  const tgt = { wet: 0, clear: 0, mist: 0, golden: 0, fest: 0, gust: 0, rain: 0 };
  const tone = new THREE.Vector3();
  const api = { points: null, mood: cur, glow: 0, amp: 1, gust: 0, vista: null };
  let live = scene && !lite && !reduced;
  let pos; let kind; let size; let alpha; let rot; let col; let geo; let mat; let points;
  if (live) {
    pos = new Float32Array(total * 3); kind = new Float32Array(total); size = new Float32Array(total); alpha = new Float32Array(total);
    rot = new Float32Array(total); col = new Float32Array(total * 3);
    geo = new THREE.BufferGeometry();
    for (const [name, arr, n] of [['position', pos, 3], ['aKind', kind, 1], ['aSize', size, 1], ['aAlpha', alpha, 1], ['aRot', rot, 1], ['aCol', col, 3]]) geo.setAttribute(name, new THREE.BufferAttribute(arr, n));
    const made = withLocalUuids('market-weather', () => {
      const m = new THREE.ShaderMaterial({ uniforms: { uPx: { value: 270 } }, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
      return { m, p: new THREE.Points(geo, m) };
    });
    mat = made.m; points = made.p;
    points.name = 'marketWeather';
    points.frustumCulled = false;
    Object.assign(points.userData, { noCast: true, noContactShadow: true, noMerge: true });
    scene.add(points);
    api.points = points;
  }
  const night = createNight({ ...ctx, scene, reducedMotion: reduced });
  const hex = new THREE.Color();
  const def = (k, i, kd, sz, h) => { const j = I[k] + i; kind[j] = KIND[kd]; size[j] = sz; hex.setHex(h); col.set([hex.r, hex.g, hex.b], j * 3); return j; };
  const put = (j, x, y, z, a, r = 0) => { pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z; alpha[j] = a; rot[j] = r; };
  const colour = (j, c) => col.set(c, j * 3);
  const slot = { put, I, get alpha() { return alpha; }, get size() { return size; }, colour };
  const off = (k, from = 0) => { for (let j = I[k] + from; j < I[k] + N[k]; j++) alpha[j] = 0; };

  // the fixed spots
  const homes = []; // mist
  const drips = []; // x, y, z
  const halos = [];
  const strings = []; // x, y, z, twinkle phase
  if (live) {
    for (let i = 0; i < N.mist; i++) {
      const s = SHOPS[i % SHOPS.length];
      homes.push(i < 20 ? { x: s.at.x + (hash01(i, 1, WSALT) - 0.5) * 7, z: s.at.z + (hash01(i, 2, WSALT) - 0.5) * 7 } : { x: B.minX + (B.maxX - B.minX) * hash01(i, 3, WSALT), z: B.minZ + (B.maxZ - B.minZ) * hash01(i, 4, WSALT) });
      def('mist', i, 'soft', 4 + 3 * hash01(i, 5, WSALT), 0xeaf0f6);
    }
    for (let i = 0; i < N.shaft; i++) def('shaft', i, 'shaft', 7.5, 0xfff0c0);
    for (let i = 0; i < N.steam; i++) def('steam', i, 'soft', 1.5 + hash01(i, 6, WSALT), 0xf4f6f8);
    for (let i = 0; i < N.bird; i++) def('bird', i, 'bird', 1.5, 0x2e2e36);
    for (let i = 0; i < N.rain; i++) def('rain', i, 'streak', 0.5, 0xdcebf8);
    SHOPS.forEach((s, si) => [-0.3, 0.3].forEach((f, k) => {
      const lx = f * s.w; const lz = s.d / 2 + EDGE;
      const p = fromStall(s, lx, lz);
      const y = awningHeight(s, lx, lz);
      drips.push(p.x, y - 0.12, p.z);
      def('drip', si * 2 + k, 'dot', 0.11, 0xd8ecff);
      [-0.5, 0.5].forEach((h, q) => {
        const lx2 = h * (s.w - 0.3) * 0.9;
        const p2 = fromStall(s, lx2, lz + 0.03);
        const j = def('halo', si * 2 + q, 'soft', 1.2, 0xffc060);
        halos.push(p2.x, awningHeight(s, lx2, lz) - 0.4, p2.z, j);
      });
    }));
    for (let i = 0, b = 0; i < SORTED.length && b < N.bulb; i++) { // a string from each stall to the next round the square, sagging
      const a = SORTED[i]; const c = SORTED[(i + 1) % SORTED.length];
      const len = Math.hypot(c.at.x - a.at.x, c.at.z - a.at.z);
      const cnt = Math.min(N.bulb - b, Math.max(2, Math.round(len / 2.2)));
      for (let q = 0; q < cnt; q++, b++) {
        const s = (q + 0.5) / cnt;
        strings.push(a.at.x + (c.at.x - a.at.x) * s, 3.6 - 1.1 * 4 * s * (1 - s), a.at.z + (c.at.z - a.at.z) * s, b);
        def('bulb', b, 'bulb', 0.26, FEST_COLOURS[b % FEST_COLOURS.length]);
      }
    }
    for (let i = 0; i < N.pennant; i++) def('pennant', i, 'pennant', 0.55, FEST_COLOURS[i % FEST_COLOURS.length]);
    for (let i = 0; i < N.confetti; i++) def('confetti', i, 'rect', 0.16, FEST_COLOURS[i % FEST_COLOURS.length]);
    for (let i = 0; i < N.leaf; i++) def('leaf', i, 'rect', 0.4, [0xe8dcc0, 0xc8a050, 0x7aa84a, 0xf4f0e0][i % 4]);
    for (let b = 0; b < 6; b++) for (let i = 0; i < 18; i++) def('bow', b * 18 + i, 'dot', 2.3, BOW[b]);
    defVista(def); // beauty pass 7 (marketvista.js)
    defNight(def); // beauty pass 8 (marketnight.js)
  }

  // the rainbow's plane, set when a clearing begins: behind the fountain from where the camera looks
  const bow = { dx: 0, dz: -1, set: false };
  const wind = { x: 0.9, z: 0.43 };
  const state = { thunderAt: -1, thunderN: 0, tuneAt: 6, dawnAt: 4, dawnN: 0 };

  function paint(dt, t, cat, camera) {
    const cx = cat?.x ?? 0; const cz = cat?.z ?? 14;
    const near = (x, z, r0, r1) => (cat ? ss(r0, r1, Math.hypot(x - cx, z - cz)) : 1); // fog keeps off her
    // mist, shafts, steam
    const mw = Math.max(cur.mist, cur.wet * 0.5); // the rain's grey haze is the same low fog, thinner
    if (mw > 0.01) {
      for (let i = 0; i < N.mist; i++) {
        const h = homes[i];
        const x = h.x + Math.sin(t * 0.11 + i * 2.3) * 2.2; const z = h.z + Math.cos(t * 0.09 + i * 1.7) * 1.8;
        put(I.mist + i, x, 0.3 + 0.7 * hash01(i, 7, WSALT), z, 0.2 * mw * near(x, z, 1.5, 5));
      }
    } else off('mist');
    const sh = Math.max(0.14 * cur.mist, 0.08 * cur.golden);
    for (let i = 0; i < N.shaft; i++) put(I.shaft + i, -14 + i * 7 + Math.sin(t * 0.05 + i) * 1.2, 3.4, -4 + (i % 2) * 6, sh > 0.004 ? sh : 0);
    const bs = stallById('baker');
    const sk = Math.max(cur.clear, cur.mist * 0.6, cur.wet * 0.5);
    for (let i = 0; i < N.steam; i++) { // steam off the cobbles after rain; the first four are the bakery's, by its counter
      const q = (t * (i < 4 ? 0.2 : 0.12) + (i < 4 ? i * 0.25 : hash01(i, 8, WSALT))) % 1;
      const x = i < 4 ? bs.at.x + bs.face.x * 0.6 : B.minX + (B.maxX - B.minX) * hash01(i, 9, WSALT);
      const z = i < 4 ? bs.at.z + bs.face.z * 0.6 : B.minZ + (B.maxZ - B.minZ) * hash01(i, 10, WSALT);
      const a = (i < 4 ? sk * 0.9 : cur.clear) * 0.26 * Math.sin(Math.PI * q) * near(x, z, 1.5, 4.5);
      put(I.steam + i, x + Math.sin(t * 0.4 + i) * 0.4, i < 4 ? 1.5 + q * 1.1 : 0.2 + q * 1.5, z, a > 0.004 ? a : 0);
    }
    // birds starting up: across the sky in the mist, one after another
    for (let i = 0; i < N.bird; i++) {
      const q = ((t - 8 - i * 1.7) / 16) % 1;
      const on = cur.mist > 0.15 && t > 8 + i * 1.7 && q >= 0;
      put(I.bird + i, -32 + q * 64, 9 + (i % 3) * 1.4 + Math.sin(q * 20 + i) * 0.4, -6 + i * 3.5, on ? 0.85 : 0, 0.5 + 0.5 * Math.sin(t * 8 + i));
    }
    // rain (the walk's own shower; the game draws its own rain on a rainy walk) and the awnings' drips, the rhythm of a drum
    if (cur.rain > 0.01 && cat) {
      for (let i = 0; i < N.rain; i++) {
        const q = (t * (1.7 + 0.4 * hash01(i, 11, WSALT)) + hash01(i, 12, WSALT)) % 1;
        put(I.rain + i, wrap(B.minX + (B.maxX - B.minX) * hash01(i, 13, WSALT) + q * 0.6, cx, 18), 7 - q * 7, wrap(B.minZ + (B.maxZ - B.minZ) * hash01(i, 14, WSALT), cz, 18), 0.6 * cur.rain);
      }
    } else off('rain');
    if (cur.wet > 0.02) {
      for (let i = 0; i < N.drip; i++) {
        const per = 0.45 + 0.35 * hash01(i, 15, WSALT);
        const q = ((t + hash01(i, 16, WSALT) * 3) % per) / per;
        put(I.drip + i, drips[i * 3], drips[i * 3 + 1] - q * q * 0.8, drips[i * 3 + 2], 0.7 * cur.wet * (q < 0.96 ? 1 : 0));
      }
    } else off('drip');
    // halos on the lanterns: warmer in rain, in the golden hour and at the festival
    const lit = Math.min(1, cur.wet * 0.9 + cur.fest + cur.golden * 0.6 + night.state.w);
    for (let i = 0; i < N.halo; i++) {
      const j = halos[i * 4 + 3];
      put(j, halos[i * 4], halos[i * 4 + 1], halos[i * 4 + 2], lit > 0.02 ? 0.3 * lit * (0.9 + 0.1 * Math.sin(t * 2 + i)) : 0);
    }
    // the festival's lights, banner swag and confetti
    if (cur.fest > 0.02) {
      for (let i = 0; i < N.bulb; i++) put(I.bulb + i, strings[i * 4], strings[i * 4 + 1] - Math.abs(Math.sin(t * 0.8 + i)) * 0.03, strings[i * 4 + 2], i * 4 < strings.length ? cur.fest * (0.8 + 0.2 * Math.sin(t * 3 + i * 1.7)) : 0);
      const fa = SHOPS.find((s) => s.id === 'fish').at; const fb = SHOPS.find((s) => s.id === 'flowers').at;
      for (let i = 0; i < N.pennant; i++) {
        const s = 0.06 + 0.88 * (i / (N.pennant - 1));
        put(I.pennant + i, fa.x + (fb.x - fa.x) * s, 5.8 - 2.3 * 4 * s * (1 - s) - 0.28 + Math.sin(t * 1.7 + i) * 0.04, fa.z + (fb.z - fa.z) * s, cur.fest);
      }
      for (let i = 0; i < N.confetti; i++) {
        const q = (t * (0.12 + 0.08 * hash01(i, 17, WSALT)) + hash01(i, 18, WSALT)) % 1;
        put(I.confetti + i, FOUNTAIN.x + (hash01(i, 19, WSALT) - 0.5) * 30 + Math.sin(t * 0.9 + i) * 1.1, 7 - q * 7, FOUNTAIN.z + (hash01(i, 20, WSALT) - 0.5) * 30 + Math.cos(t * 0.7 + i) * 0.9, 0.9 * cur.fest, t * (2 + hash01(i, 21, WSALT) * 3) + i);
      }
    } else { off('bulb'); off('pennant'); off('confetti'); }
    // a gust: paper and leaves swirl across the square
    if (cur.gust > 0.02) {
      for (let i = 0; i < N.leaf; i++) {
        const q = (t * 0.1 + hash01(i, 22, WSALT)) % 1;
        const a = t * 1.3 + i * 2.1;
        put(I.leaf + i, wrap(cx - 13 + 26 * hash01(i, 22, WSALT) + q * 40 * wind.x, cx, 26) + Math.sin(a) * 1.6, 0.5 + 1.5 * hash01(i, 23, WSALT) + Math.sin(a * 1.3) * 0.7, wrap(cz - 9 + 18 * hash01(i, 24, WSALT) + q * 40 * wind.z, cz, 18) + Math.cos(a) * 1.4, Math.min(1, cur.gust * 1.5), a * 1.4);
      }
    } else off('leaf');
    // the rainbow over the fountain: faces the camera as the clearing begins
    if (cur.clear > 0.05) {
      if (!bow.set && camera?.position) {
        const dx = FOUNTAIN.x - camera.position.x; const dz = FOUNTAIN.z - camera.position.z; const l = Math.hypot(dx, dz) || 1;
        bow.dx = dx / l; bow.dz = dz / l; bow.set = true;
      }
      const R0 = 7.5;
      const mid = { x: FOUNTAIN.x + bow.dx * 9, z: FOUNTAIN.z + bow.dz * 9 };
      for (let b = 0; b < 6; b++) for (let i = 0; i < 18; i++) {
        const a = (i / 17) * Math.PI; const R = R0 + (2.5 - b) * 0.42;
        put(I.bow + b * 18 + i, mid.x - bow.dz * Math.cos(a) * R, -0.4 + Math.sin(a) * R, mid.z + bow.dx * Math.cos(a) * R, 0.2 * cur.clear * Math.min(1, Math.sin(a) * 2.5));
      }
    } else { off('bow'); bow.set = false; }
  }

  // the sounds, only on the game's own audio object (marketsound.js), optional-safe
  function sounds(t, cat, sound) {
    if (!sound) return;
    sound.air?.(cur.wet, cur.gust);
    sound.night?.(night.state.w, t);
    if (cur.wet > 0.8 && t > state.thunderAt) {
      if (state.thunderAt > 0) sound.thunder?.(0.5);
      state.thunderAt = t + 14 + 10 * hash01(state.thunderN++, 28, WSALT);
    } else if (cur.wet < 0.3) state.thunderAt = -1;
    if (cur.mist > 0.3 && t > state.dawnAt) { sound.dawn?.(0.7 * cur.mist); state.dawnAt = t + 5 + 4 * hash01(state.dawnN++, 29, WSALT); }
    if (cur.fest > 0.5 && t > state.tuneAt) {
      sound.festive?.(cat ? loudness(Math.hypot(cat.x - FOUNTAIN.x, cat.z - FOUNTAIN.z), 16) : 0);
      state.tuneAt = t + 16;
    }
  }

  Object.assign(api, {
    update(dt, t, cat, camera, part, session, sound) {
      const w = ctx.weather ?? session?.weather ?? null;
      moodAt(t, { part, cond: w?.condition ?? 'clear', raining: !!w?.isRaining?.(), rainbow: !!w?.rainbowVisible, festival, dusk: !!ctx.dusk, still: reduced, force: ctx.force }, tgt);
      const vs = api.vista; // beauty pass 7: the vista's weight, set by marketlife.js just before
      if (vs && !ctx.force) tgt.golden = Math.max(tgt.golden, vs.warm);
      const k = Math.min(1, dt * 1.6);
      for (const key of Object.keys(cur)) cur[key] += (tgt[key] - cur[key]) * k;
      if (react) {
        react.uMkWet.value = cur.wet;
        react.uMkTone.value.multiply(tone.set(1 - 0.2 * cur.wet + 0.1 * cur.golden - 0.04 * cur.fest, 1 - 0.14 * cur.wet + 0.02 * cur.golden - 0.04 * cur.fest, 1 + 0.02 * cur.wet - 0.15 * cur.golden - 0.02 * cur.fest));
        react.uMkVig.value = vs ? 0.3 * vs.w : 0; // the screen's edges dim a little at a vista (the square's own materials read it)
      }
      if (sun0 && !ctx.dusk && (w?.condition ?? 'clear') === 'clear') { // a clear walk's own sun: dimmer in the shower, warm in the golden hour (put back at the end)
        sun.intensity = sun0.i * (1 - 0.4 * cur.wet) * (1 + 0.1 * cur.golden);
        if (fill) fill.intensity = fill0 * (1 - 0.15 * cur.wet) * (1 + 0.12 * (vs?.rim ?? 0)); // a vista's warm rim on her fur
        sun.color.copy(sun0.c).lerp(warm, 0.55 * cur.golden);
      }
      const nw = night.grade(dt, react, lite);
      api.glow = 0.25 * nw + 0.5 * cur.wet + 0.35 * cur.fest + 0.2 * cur.golden + (vs?.glow ?? 0);
      api.amp = 1 + 1.5 * cur.gust + 0.3 * cur.wet * Math.max(0, Math.sin(t * 7)) ** 2;
      api.gust = cur.gust;
      if (!live) return;
      if (typeof window !== 'undefined' && window.innerHeight) mat.uniforms.uPx.value = window.innerHeight * Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      paint(dt, t, cat, camera);
      if (vs) paintVista(slot, vs, t, camera, cat);
      if (night.on) night.paint(slot, t, cat, sound);
      for (const a of ['position', 'aAlpha', 'aRot', 'aCol', 'aSize']) geo.attributes[a].needsUpdate = true;
      sounds(t, cat, sound);
    },
    dispose() {
      if (sun0) { sun.color.copy(sun0.c); sun.intensity = sun0.i; }
      if (fill) fill.intensity = fill0;
      night.restore();
      if (react) { react.uMkWet.value = 0; react.uMkVig.value = 0; }
      if (live) { scene.remove(points); geo.dispose(); mat.dispose(); }
      live = false;
    },
  });
  return api;
}
