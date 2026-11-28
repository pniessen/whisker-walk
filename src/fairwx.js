// =============================================================================
// THE FAIRGROUND: BEAUTY PASS 6, WEATHER AND ATMOSPHERE AS EVENTS. Nothing here is a mesh, a triangle, a caster, a collider or a rule: slots in the pooled Points
// of fairalive.js (each point has its own size, makePoints' aSize), the shared lamp numbers and, for the rainbow, the weather's own arc. Pure functions of the walk's
// weather ({ condition, isRaining(), rainbowVisible }) and of the real clock T, so every device sees the same gusts and the same finale.
//   RAIN       the lights come up, a wet shine on the midway, mist halos round the bulbs and the rides' lights, streaks through them, splashes round her, a patter on the
//              canvas and thunder far off; then it CLEARS: the lights fade, the midway steams, and the rainbow stands over the big wheel
//   SUNNY      a clear day: kites high over the wheel, glints on the midway, 
//   GOLDEN     a golden-hour walk's lights ramp up to night: calliope sparks, fireflies at the hay bales, and (rarely) a firework finale
//   WIND       (rare) pennants and the balloon streaming, leaves and paper swirling over the midway, a whoosh
// Reduced motion: none of it moves (fairalive returns first). Lite: fewer. Hash of counters only; no Math.random.
// =============================================================================
import { FAIR_CLOCK, GLOW_MAX, LAMP_LOOK } from './world/fairkit.js';
import { SPOTS, WIND, BEAT } from './fairpals.js';
import { FLAT_GROUND } from './ground.js';

// the numbers of the pass (a gust: every 330 s, 40% of them, 42 s long; a finale: every 540 s, 30%, 11 s, a burst each 0.55 s living 1.9 s)
const RAIN_LIT = 0.5; const RAIN_UP = 6; const RAIN_DOWN = 25; const GOLD_TO = 0.95; const GOLD_FROM = 20; const GOLD_LEN = 260; const SHINE = 0.75;
const GUST_EVERY = 330; const GUST_LEN = 42; const FIN_EVERY = 540; const FIN_LEN = 11; const FIN_STEP = 0.55; const FIN_LIFE = 1.9; const THUNDER_EVERY = 43; const DRUM_EVERY = 1.1; const RAINBOW_BACK = 6;
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

/** How hard a rare gust of wind blows at time-of-day T: 0 (none) to 1, easing in and out over its 42 s. */
export function gustAt(T) {
  const n = Math.floor(T / GUST_EVERY); const l = T - n * GUST_EVERY;
  return hash(n, 101) < 0.4 && l < GUST_LEN ? Math.sin(Math.PI * l / GUST_LEN) ** 0.6 : 0;
}
/** Seconds into the firework finale (a rare 11 s barrage at dusk), or -1. */
export function finaleAt(T) { const n = Math.floor(T / FIN_EVERY); const l = T - n * FIN_EVERY; return hash(n, 111) < 0.3 && l < FIN_LEN ? l : -1; }
/** Which burst of the finale `fin` seconds in is each lane (4 lanes) showing: { k, local } or null. */
export function finaleLane(fin, lane) {
  const top = Math.floor(fin / FIN_STEP); const k = top - (((top - lane) % 4) + 4) % 4;
  if (k < 0) return null;
  const local = fin - k * FIN_STEP;
  return local < FIN_LIFE ? { k, local } : null;
}
/** The lamps' level a walk wants: a golden-hour walk climbs to night; rain brings the lights up. */
export function wantedLit(base, condition, walkT) {
  return condition === 'sunset' ? base + (GOLD_TO - base) * smooth(GOLD_FROM, GOLD_FROM + GOLD_LEN, walkT) : base;
}

/** How many slots each pool gives this pass: { glow, bits, fire } (nothing with reduced motion, fewer when lite). */
export function wxCounts(k, reducedMotion) {
  if (reducedMotion) return { glow: 0, bits: 0, fire: 0 };
  const lite = k < 0.5;
  return { glow: 10 + 16 + 10 + 10 + 10 + 8 + 8, bits: lite ? 6 : 30 + 18, fire: lite ? 0 : 24 }; // (lite: no kites, no finale)
}

/** createFairWx({ scene, area, k, onEvent, weather, hub, mgr, calli, bulbs, glow, bits, fire }) -> { update(dt, T, me, lit, dim) } (the pools: { pos, col, siz, at } each) */
export function createFairWx({ scene, area, k = 1, onEvent = () => {}, weather = null, ground = FLAT_GROUND, hub, mgr, calli, bulbs, glow, bits, fire }) {
  const lite = k < 0.5; let base = -1; let walkT = 0; let rl = 0; let rw = 0; let cw = 0; let applied = -1;
  let lastThunder = -1; let nextDrum = 0; let gustN = -1; let lastK = -1; let wet = null; let rainbow = null;
  const lam = (a) => { FAIR_CLOCK.lit.value = a; const g = area?.glow; if (!g?.material) return; g.material.emissiveIntensity = GLOW_MAX * a; for (const m of g.lamps ?? []) m.emissiveIntensity = LAMP_LOOK.max * a; g.level = a; };
  const put = (p, i, x, y, z, r, g, b, s) => { const o = (p.at + i) * 3; p.pos[o] = x; p.pos[o + 1] = y; p.pos[o + 2] = z; p.col[o] = r; p.col[o + 1] = g; p.col[o + 2] = b; if (s) p.siz[p.at + i] = s; };
  const off = (p, i) => { p.col[(p.at + i) * 3] = p.col[(p.at + i) * 3 + 1] = p.col[(p.at + i) * 3 + 2] = 0; p.pos[(p.at + i) * 3 + 1] = -999; };

  function shine(w) { // wet midway: the sawdust path's gloss, put back as it dries
    if (!wet) { if (w < 0.01) return; wet = scene.children.filter((c) => c.isMesh && c.name === 'path' && c.material && 'roughness' in c.material).map((m) => ({ m: m.material, r: m.material.roughness })); }
    for (const q of wet) q.m.roughness = q.r * (1 - SHINE * w);
  }
  function arc() { // the rainbow stands over the big wheel (the weather's own arc, moved; its award reads the same spot)
    if (rainbow || !weather?.rainbowVisible) return;
    rainbow = scene.children.find((o) => o.isGroup && o.children[0]?.geometry?.type === 'TorusGeometry');
    if (!rainbow) return;
    rainbow.position.set(hub.x, ground.y(hub.x, hub.z - RAINBOW_BACK), hub.z - RAINBOW_BACK); rainbow.rotation.y = 0;
    if (weather.rainbowPos) { weather.rainbowPos.x = hub.x; weather.rainbowPos.z = hub.z - RAINBOW_BACK; }
  }

  return {
    update(dt, T, me, lit, dim = 1) {
      walkT += dt; if (base < 0) base = lit;
      const raining = !!weather?.isRaining?.(); const clearing = !raining && !!weather?.rainbowVisible;
      const cond = weather?.condition ?? 'clear';
      rw += ((raining ? 1 : 0) - rw) * Math.min(1, dt / 3); cw += ((clearing ? 1 : 0) - cw) * Math.min(1, dt / (clearing ? 5 : 12));
      rl += ((raining ? RAIN_LIT : 0) - rl) * Math.min(1, dt / (raining ? RAIN_UP : RAIN_DOWN));
      const want = Math.max(wantedLit(base, cond, walkT), rl);
      if (Math.abs(want - applied) > 0.004) { applied = want; lam(want); lit = want; }
      const wetK = Math.min(1, rl / RAIN_LIT); if (wetK > 0.01 || wet) shine(wetK);
      if (clearing) arc();
      const g = gustAt(T); const litK = smooth(0.2, 0.7, lit); const mist = Math.max(rw, 0.6 * cw) * litK; const sunny = cond === 'clear' && base < 0.25 && rl < 0.02 ? 1 : 0;
      const c = me ?? { x: 0, z: 25 };
      FAIR_CLOCK.flutterOn.value *= 1 + 1.8 * g; // bunting streaming (the shader scales its sway by this)
      // ---- the glow pool (additive) ----
      let i = 0;
      const P = glow;
      for (let b = 0; b < 10; b++, i++) { // mist halos: the bulbs, the big wheel's hub, the merry-go-round's canopy
        const q = b < 8 ? bulbs[b] : b === 8 ? [hub.x, hub.z, hub.y] : [mgr.x, mgr.z, 3.4];
        if (mist < 0.01) { off(P, i); continue; }
        put(P, i, q[0], q[2], q[1], 0.5 * mist, 0.34 * mist, 0.17 * mist, 5.5 + 0.6 * Math.sin(T * 0.8 + b));
      }
      for (let s = 0; s < 16; s++, i++) { // streaks of rain through the lit bulbs
        const q = bulbs[s >> 1]; const u = frac(T * (2.6 + 0.5 * hash(s, 3)) + hash(s, 4));
        if (rw * litK < 0.02) { off(P, i); continue; }
        put(P, i, q[0] + (s & 1 ? 0.22 : -0.2) + (hash(s, 5) - 0.5) * 0.1, q[2] + 0.8 - u * 1.9, q[1] + (hash(s, 6) - 0.5) * 0.3, 1.0 * rw * litK, 1.1 * rw * litK, 1.2 * rw * litK, 0.9);
      }
      for (let s = 0; s < 10; s++, i++) { // splashes on the sawdust round her, each a ring of light that grows and goes
        const q = T * 1.7 + hash(s, 7); const n = Math.floor(q); const u = q - n;
        if (rw < 0.02) { off(P, i); continue; }
        const a = hash(n, s * 3 + 1) * 6.283; const r = 2.6 + hash(n, s * 3 + 2) * 8;
        put(P, i, c.x + Math.cos(a) * r, 0.07, c.z + Math.sin(a) * r, 0.3 * rw * (1 - u) ** 2, 0.38 * rw * (1 - u) ** 2, 0.45 * rw * (1 - u) ** 2, 0.15 + 0.4 * u);
      }
      for (let s = 0; s < 10; s++, i++) { // glints in the sun: a bright twinkle on the midway's sawdust, the wheel's rim, the tin roofs
        const tw = Math.max(0, Math.sin(T * (1.6 + hash(s, 8)) + hash(s, 9) * 6.283)) ** 6;
        if (!sunny) { off(P, i); continue; }
        put(P, i, (hash(s, 10) - 0.5) * 9, 0.3 + hash(s, 11) * 2, 14 + hash(s, 12) * 30, tw, tw * 0.95, tw * 0.75, 0.55);
      }
      for (let s = 0; s < 10; s++, i++) { // steam off the wet midway as it clears
        const u = frac(T / 6 + s / 10);
        if (cw < 0.02) { off(P, i); continue; }
        const f = Math.sin(Math.PI * u) * 0.16 * cw;
        put(P, i, c.x + (hash(s, 13) - 0.5) * 12, 0.15 + u * 2.4, c.z - 3 + (hash(s, 14) - 0.5) * 12, 0.82 * f, 0.84 * f, 0.88 * f, 2.6);
      }
      for (let s = 0; s < 8; s++, i++) { // fireflies at the hay bales, as the lights come up
        const bl = SPOTS.bales[s & 3]; const fl = smooth(0.4, 0.75, lit) * (1 - rw);
        if (fl < 0.02 || lit < 0.4) { off(P, i); continue; }
        const bk = Math.max(0, Math.sin(T * (0.9 + hash(s, 15)) + s * 2)) ** 3 * fl;
        put(P, i, bl.x + Math.sin(T * 0.45 + s * 1.7) * 1.4, 0.45 + 0.7 * (0.5 + 0.5 * Math.sin(T * 0.8 + s * 2.3)), bl.z + Math.cos(T * 0.37 + s * 2.9) * 1.4, 1.1 * bk, 1.3 * bk, 0.4 * bk, 0.8);
      }
      for (let s = 0; s < 8; s++, i++) { // sparks from the calliope, rising on its beat
        const u = frac(T / (2 * BEAT.bar) + s / 8); const fl = smooth(0.3, 0.7, lit) * (1 - rw) * (1 - u) ** 1.5;
        if (fl < 0.01) { off(P, i); continue; }
        put(P, i, calli.x + Math.sin(s * 2.1 + u * 5) * 0.5 * u + u * 1.4 * WIND.x, calli.y + 0.6 + u * 2.8, calli.z + Math.cos(s * 1.3) * 0.4 * u + u * 1.4 * WIND.z, fl, 0.62 * fl, 0.22 * fl, 0.32);
      }
      // ---- the normal-blended pool: kites on a sunny day, leaves and paper in a gust ----
      const B = bits; let j = 0;
      if (!lite) for (let q = 0; q < 3; q++) {
        const kx = -17 + q * 17 + Math.sin(T * 0.23 + q * 2) * 4 + g * 4 * WIND.x; const ky = 11 + (q & 1) * 1.8 + Math.sin(T * 0.31 + q) * 1.1 + g * 1.5; const kz = -16 - q * 3 + 4 * Math.sin(T * 0.17 + q * 2.4);
        const col = [[0.95, 0.25, 0.2], [0.98, 0.8, 0.2], [0.25, 0.6, 0.95]][q]; const sw = Math.sin(T * 0.9 + q) * 0.3; const up = sunny || g > 0.05;
        for (let p = 0; p < 10; p++, j++) { // a diamond of four blobs round a cross-bar, and a zigzag tail
          if (!up) { B.pos[(B.at + j) * 3 + 1] = -999; continue; }
          const t = p - 5; const o = p < 5 ? [[0, 0], [0, 1.5], [0, -1.5], [-1, 0], [1, 0]][p] : [sw * (t + 1) * (t & 1 ? 0.7 : -0.7) - sw * 0.2, -1.9 - t * 0.8];
          const w = p ? (p > 2 && p < 5 ? 0.8 : 1) * dim : 1;
          put(B, j, kx + o[0] + sw * 0.2, ky + o[1], kz, col[0] * w, col[1] * w, col[2] * w, p < 5 ? 11 : 3.2);
        }
      }
      for (; j < (lite ? 6 : 48); j++) { // leaves and paper blown across the midway
        const s = j - (lite ? 0 : 30);
        if (g < 0.05) { B.pos[(B.at + j) * 3 + 1] = -999; continue; }
        const sp = 4 + 5 * g; const x = (((hash(s, 21) * 30 + T * sp * WIND.x * (0.6 + hash(s, 22)) - c.x) % 30) + 45) % 30 - 15 + c.x;
        const z = c.z - 1 - hash(s, 23) * 14 + T * sp * 0.3 * WIND.z % 3 + Math.sin(T * 2.2 + s) * 1.4; const y = 0.5 + 2.2 * Math.abs(Math.sin(T * 1.6 + s * 1.9)) * g + hash(s, 24) * 0.6;
        const pal = [0xe8403a, 0xf7c93b, 0x3b8de0, 0xc8782a, 0x7a9a3a, 0xffffff][s % 6];
        put(B, j, x, y, z, (pal >> 16) / 255 * dim, ((pal >> 8) & 255) / 255 * dim, (pal & 255) / 255 * dim, 2.8);
      }
      // ---- the finale: four lanes of bursts (sparks in the fire pool's extra slots) ----
      const fin = !lite && lit > 0.85 && rw < 0.2 ? finaleAt(T) : -1;
      for (let m = 0; m < fire.n; m++) {
        const lane = m % 4; const ln = fin >= 0 ? finaleLane(fin, lane) : null;
        if (!ln) { off(fire, m); continue; }
        const sky = [[-14, 12, -6], [13, 13, -12], [-5, 15, -22], [20, 12, -4], [-22, 13, -16], [0, 16, -18], [7, 14, -28]][Math.floor(hash(ln.k, 78) * 7)];
        const u = ln.local / FIN_LIFE; const a = (Math.floor(m / 4) / (fire.n / 4)) * 6.283 * 1.7 + hash(ln.k, 79) * 6; const el = (hash(m, ln.k) - 0.5) * 2.2; const r = 4.4 * (1 - (1 - u) * (1 - u));
        const f = (1 - u) * (1 - u) * 1.8; const hue = hash(ln.k, 80); const cc = [Math.abs(Math.sin(hue * 6.283)), Math.abs(Math.sin(hue * 6.283 + 2.1)), Math.abs(Math.sin(hue * 6.283 + 4.2))];
        put(fire, m, sky[0] + Math.cos(a) * Math.cos(el) * r, sky[1] + Math.sin(el) * r - 2.2 * u * u, sky[2] + Math.sin(a) * Math.cos(el) * r, (0.3 + cc[0]) * f, (0.3 + cc[1]) * f, (0.3 + cc[2]) * f, 0.9);
      }
      if (fin >= 0) { const kk = Math.floor(fin / FIN_STEP); if (kk > lastK) { lastK = kk; if (me) onEvent({ type: 'firework-pop', volume: 0.35 }); } } else lastK = -1;
      // ---- sounds (the game's own, through its events) ----
      if (me && rw > 0.5) {
        const near = 1 - smooth(8, 24, Math.hypot(me.x, me.z - 28)); nextDrum -= dt;
        if (nextDrum <= 0) { nextDrum = DRUM_EVERY * (0.8 + 0.4 * hash(Math.floor(T), 31)); if (near > 0.05) onEvent({ type: 'bed', bed: 'drum', volume: 0.35 * near, n: Math.floor(T) }); }
        const tn = Math.floor(T / THUNDER_EVERY);
        if (tn !== lastThunder && T - tn * THUNDER_EVERY > 12) { lastThunder = tn; if (hash(tn, 33) < 0.7) onEvent({ type: 'bed', bed: 'thunder', volume: 0.5, n: tn }); }
      }
      if (me && g > 0.3) { const gn = Math.floor(T / GUST_EVERY); if (gn !== gustN) { gustN = gn; onEvent({ type: 'bed', bed: 'gust', volume: 0.6, n: gn }); } }
      return { g, mist, sunny, rw, cw, lit, fin };
    },
  };
}
