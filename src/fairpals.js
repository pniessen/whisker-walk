// =============================================================================
// THE FAIRGROUND: BEAUTY PASS 5, LIVING CREATURES AND A WORLD THAT AGREES WITH ITSELF. All pooled THREE.Points (no mesh, no triangle, no caster, no collider, never a perch or a rule):
//   * PIGEONS AND SPARROWS hop and peck for crumbs by the stalls and fly up (and away, and home again) when she runs by or comes close;
//   * A STRAY (a ginger cat) sits and watches the merry-go-round, flicks its tail, and edges off if she comes near;
//   * MOTHS flit round the stall bulbs at dusk; LADYBIRDS crawl on the hay bales;
//   * ARRIVAL: a ticket-bell and a puff of confetti as she walks in under the gate's arch; the big wheel sparkles round its rim as she first comes near;
//   * ONE WIND (WIND) for the bunting's confetti, steam, lanterns and the balloon; ONE BEAT (the calliope's bar) for the pennants' flutter and the lights' pulse;
//   * SOUND BEDS that cross-fade with where she stands (the barkers' murmur, a sizzle by the food stalls, birds, a cow and hens in the fields beyond), a slow blend, never a switch.
// Reduced motion: the stray and the ladybirds stand still, nothing else is drawn. Lite: fewer. Hash of counters only; no Math.random.
// =============================================================================
import * as THREE from 'three';
import { FAIR_CLOCK } from './world/fairkit.js';

// the one wind (it blows towards +x and a little +z, over the fair), and the one beat (the music box's note, 3 to a calliope bar: test/fairlights checks it is TUNE.NOTE)
// Where things stand, copied from world/fair.js and fairrides.js (the stage must not import the place: it would pull the place into the start-up chunk); test/fair5.test.js checks they agree.
const E = Math.PI / 2;
export const SPOTS = Object.freeze({
  gateZ: 45, gateHalf: 3.3, mgr: Object.freeze({ x: 0, z: 0 }), wheelR: 6.3,
  bales: Object.freeze([Object.freeze({ x: -20.4, z: 39.3, yaw: 0.45 }), Object.freeze({ x: -23.5, z: 40.9, yaw: 0.12 }), Object.freeze({ x: -36.6, z: -0.8, yaw: E }), Object.freeze({ x: -36.7, z: 4.6, yaw: E + 0.12 })]),
});
const BALE_SEATS = SPOTS.bales; const MGR_AT = SPOTS.mgr; const GATE_AT = { z: SPOTS.gateZ }; const GATE_HALF = SPOTS.gateHalf; const FERRIS = { R: SPOTS.wheelR };
export const WIND = Object.freeze({ x: 0.96, z: 0.28 });
export const BEAT = Object.freeze({ note: 0.26, bar: 0.78 });
export const PALS = Object.freeze({
  birds: 8, flee: 2.3, fleeRun: 4.2, runSpeed: 3.2, flight: 2.6, away: 9, perch: 6,
  homes: Object.freeze([[3.4, 41.5], [2.9, 38.6], [-3.4, 41.8], [-2.8, 37.5], [3.1, 31], [-3.0, 28.5], [2.8, 20], [-2.9, 18.5]]),
  stray: Object.freeze({ x: 6.2, z: 5.2, wary: 3.2, hide: 1.4, size: 1.3 }),
  moths: 8, ladybirds: 8, sparkle: 14, wheelNear: 26, welcomeLen: 3.2, welcomeEvery: 90,
  // sound beds: where each is loud (x, z, r), how often it sounds and how loud it is at its loudest
  beds: Object.freeze({
    barkers: Object.freeze({ zones: [[0, 30, 17]], every: 2.9, vol: 0.8 }),
    sizzle: Object.freeze({ zones: [[-5.7, 40, 9], [5.7, 40, 9], [-5.7, 15.5, 8]], every: 0.9, vol: 0.4 }),
    birds: Object.freeze({ zones: [[3, 36, 14]], every: 3.7, vol: 0.45 }),
    farm: Object.freeze({ zones: [[-40, -4, 22], [11, -38, 20], [38, 38, 20]], every: 8.5, vol: 0.5 }),
  }),
});
const hash = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

/** How loudly each sound bed would be heard from (x, z), 0..1, the carousel's music taking its share (a pure function of where she stands). */
export function bedWeights(x, z, mgrNear = 0) {
  const out = {};
  for (const [id, b] of Object.entries(PALS.beds)) {
    let w = 0;
    for (const [bx, bz, r] of b.zones) w = Math.max(w, 1 - smooth(r * 0.4, r, Math.hypot(x - bx, z - bz)));
    out[id] = w * (1 - 0.5 * mgrNear);
  }
  return out;
}

// a sitting stray, front on, two frames side by side (watching; tail flick and a blink or a tongue). Drawn on a canvas; none where there is no document.
function strayTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const g = c.getContext('2d'); if (!g) return null;
  const fur = '#e08a36'; const dark = '#a85a1a'; const light = '#fbefd8';
  for (let f = 0; f < 2; f++) {
    const o = f * 64; g.lineWidth = 2; g.strokeStyle = dark;
    const ell = (x, y, rx, ry, col) => { g.beginPath(); g.ellipse(o + x, y, rx, ry, 0, 0, 7); g.fillStyle = col; g.fill(); g.stroke(); };
    // tail (flicks out to the other side in frame 2)
    g.beginPath(); g.lineWidth = 5; g.lineCap = 'round'; g.strokeStyle = fur;
    g.moveTo(o + 40, 58); g.quadraticCurveTo(o + (f ? 58 : 54), f ? 52 : 60, o + (f ? 56 : 52), f ? 38 : 46); g.stroke(); g.lineWidth = 2;
    ell(32, 44, 15, 17, fur); ell(32, 50, 7, 10, light); // body, chest
    ell(25, 60, 5, 3, fur); ell(39, 60, 5, 3, fur); // paws
    ell(32, 24, 12, 11, fur); // head
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(o + 32 + s * 12, 20); g.lineTo(o + 32 + s * 9, 5); g.lineTo(o + 32 + s * 2, 15); g.closePath(); g.fillStyle = fur; g.fill(); g.stroke(); }
    ell(32, 29, 6, 4.5, light); // muzzle
    g.fillStyle = '#2a1a10';
    for (const s of [-1, 1]) { if (f) { g.fillRect(o + 32 + s * 5 - 2, 21, 4, 1.5); } else { g.beginPath(); g.arc(o + 32 + s * 5, 21, 2, 0, 7); g.fill(); } }
    g.beginPath(); g.arc(o + 32, 27, 1.7, 0, 7); g.fillStyle = '#d9788a'; g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  t.repeat.set(0.5, 1); t.needsUpdate = true;
  return t;
}

// createFairPals({ scene, reducedMotion, scale, makePoints, hub, onEvent, puff, day }) -> { update(dt, T, catPos, lit, speed), counts, dispose() }
export function createFairPals({ scene, reducedMotion = false, scale = 1, makePoints, hub = null, onEvent = () => {}, puff = () => {} }) {
  const k = Math.max(0.25, Math.min(1, Number.isFinite(scale) ? scale : 1));
  const nBirds = reducedMotion ? 0 : Math.max(3, Math.round(PALS.birds * k));
  const nMoths = reducedMotion || k < 0.5 ? 0 : PALS.moths;
  const nLady = Math.max(2, Math.round(PALS.ladybirds * k));
  const nSpark = reducedMotion || k < 0.5 ? 0 : PALS.sparkle;
  const tex = strayTexture();
  const body = makePoints(Math.max(1, nBirds), 0.45, false, 'fair:birds');
  const parts = makePoints(Math.max(1, nBirds * 3), 0.22, false, 'fair:birdparts');
  const lady = makePoints(nLady, 0.12, false, 'fair:ladybirds');
  const moth = makePoints(Math.max(1, nMoths), 0.2, true, 'fair:moths');
  const spark = makePoints(Math.max(1, nSpark), 1.4, true, 'fair:wheelsparkle');
  const stray = makePoints(1, PALS.stray.size, false, 'fair:stray');
  if (tex) { stray.pts.material.map = tex; stray.pts.material.alphaTest = 0.4; stray.pts.material.needsUpdate = true; stray.col.fill(1); stray.geo.attributes.color.needsUpdate = true; }
  const all = [body, parts, lady, moth, spark, stray];
  const sc = scene?.add ? scene : null;
  for (const q of all) q.pts.visible = false;
  if (sc) sc.add(...all.map((q) => q.pts));

  const birds = Array.from({ length: nBirds }, (_, i) => {
    const h = PALS.homes[i % PALS.homes.length]; const sparrow = i % 3 === 2;
    return { i, hx: h[0] + (i >= PALS.homes.length ? 0.5 : 0), hz: h[1], x: h[0], z: h[1], y: 0.13, st: 0, t: 0, dx: 1, dz: 0, fx: 0, fz: 0, ax: 0, az: 0, sparrow, away: 0 };
  });
  const lvl = { barkers: 0, sizzle: 0, birds: 0, farm: 0 }; const due = { barkers: 1, sizzle: 0.3, birds: 2, farm: 3 };
  const strayAt = { x: PALS.stray.x, z: PALS.stray.z, ox: 0, oz: 0 };
  const ladyDefs = Array.from({ length: nLady }, (_, i) => { const b = BALE_SEATS[i % BALE_SEATS.length]; return { b, ph: hash(i, 91) * 6.28, sp: 0.06 + hash(i, 92) * 0.05, wp: hash(i, 93) * 6.28 }; });
  let lastCat = null; let arrivedAt = -999; let welcomeAt = -999; let welcomeEnded = true; let drawnStatic = false;

  function drawLady(T) {
    for (let i = 0; i < nLady; i++) {
      const d = ladyDefs[i]; const u = 0.38 * Math.sin(T * d.sp * 2 + d.ph); const w = 0.12 * Math.sin(T * d.sp * 1.3 + d.wp); const ya = d.b.yaw;
      lady.pos[i * 3] = d.b.x + u * Math.cos(ya) + w * Math.sin(ya); lady.pos[i * 3 + 1] = 0.47; lady.pos[i * 3 + 2] = d.b.z - u * Math.sin(ya) + w * Math.cos(ya);
      lady.col[i * 3] = 0.86; lady.col[i * 3 + 1] = 0.1; lady.col[i * 3 + 2] = 0.07;
    }
    lady.geo.attributes.position.needsUpdate = lady.geo.attributes.color.needsUpdate = true; lady.pts.visible = true;
  }
  function drawStray(T, cat, dim) {
    const S = PALS.stray; const d = cat ? Math.hypot(cat.x - strayAt.x, cat.z - strayAt.z) : 99;
    let tx = 0; let tz = 0;
    if (cat && d < S.wary) { const a = Math.max(0, Math.min(2.6, (S.wary - d) * 1.2)); tx = (strayAt.x - cat.x) / (d || 1) * a; tz = (strayAt.z - cat.z) / (d || 1) * a; }
    strayAt.ox += (tx - strayAt.ox) * 0.04; strayAt.oz += (tz - strayAt.oz) * 0.04;
    stray.pos[0] = strayAt.x + strayAt.ox; stray.pos[1] = cat && d < S.hide ? -999 : S.size * 0.5 * 0.82; stray.pos[2] = strayAt.z + strayAt.oz;
    if (tex) tex.offset.x = (reducedMotion ? 0 : (frac(T / 9.1) < 0.07 || frac(T / 5.3) < 0.03) ? 0.5 : 0);
    stray.col[0] = stray.col[1] = stray.col[2] = dim;
    stray.geo.attributes.position.needsUpdate = stray.geo.attributes.color.needsUpdate = true; stray.pts.visible = !!tex;
  }
  function bird(b, T, dt, cat, speed, dim) {
    let x; let z; let y; let fl = false;
    const near = cat ? Math.hypot(cat.x - b.x, cat.z - b.z) : 99;
    if (b.st === 0) {
      if (cat && (near < PALS.flee || (speed > PALS.runSpeed && near < PALS.fleeRun))) { // startled: up and away from her
        b.st = 1; b.t = 0; b.fx = b.x; b.fz = b.z; const dx = b.x - cat.x; const dz = b.z - cat.z; const l = Math.hypot(dx, dz) || 1;
        b.ax = dx / l * 10 + WIND.x * 3; b.az = dz / l * 10 + WIND.z * 3; b.away = PALS.away + hash(b.i, 17) * 6; b.dx = dx / l; b.dz = dz / l;
      } else { // hop and peck
        const P = 1.7 + hash(b.i, 3) * 1.4; const q = (T + b.i * 3.1) / P; const n = Math.floor(q); const u = q - n;
        const tg = (m) => [b.hx + (hash(m, b.i * 7 + 1) - 0.5) * 0.9, b.hz + (hash(m, b.i * 7 + 2) - 0.5) * 0.9];
        const a = tg(n - 1); const c = tg(n); const h = smooth(0, 0.16, u);
        x = a[0] + (c[0] - a[0]) * h; z = a[1] + (c[1] - a[1]) * h; y = 0.13 + (u < 0.16 ? 0.16 * Math.sin(Math.PI * u / 0.16) : 0);
        const dx = c[0] - a[0]; const dz = c[1] - a[1]; const l = Math.hypot(dx, dz); if (l > 0.05) { b.dx = dx / l; b.dz = dz / l; }
        b.x = x; b.z = z; b.peck = u > 0.3 && hash(n, b.i + 11) < 0.7 ? Math.max(0, Math.sin((u - 0.3) * 6 * Math.PI)) : 0;
      }
    }
    if (b.st === 1) { // away: a bird flies out and up, then is gone for a while
      b.t += dt; const u = Math.min(1, b.t / PALS.flight); fl = true;
      x = b.fx + b.ax * u; z = b.fz + b.az * u; y = 0.13 + 6 * Math.sin(u * Math.PI * 0.55) ** 1.4;
      if (u >= 1) { b.st = 2; b.t = 0; }
    } else if (b.st === 2) {
      b.t += dt;
      if (b.t > b.away && !(cat && Math.hypot(cat.x - b.hx, cat.z - b.hz) < 4)) { b.st = 3; b.t = 0; b.fx = b.hx - b.dx * 11; b.fz = b.hz - b.dz * 11; }
      else { x = z = 0; y = -999; }
    } else if (b.st === 3) { // back again: down in a glide
      b.t += dt; const u = Math.min(1, b.t / PALS.flight); fl = u < 0.85; const e = 1 - (1 - u) * (1 - u);
      x = b.fx + (b.hx - b.fx) * e; z = b.fz + (b.hz - b.fz) * e; y = 0.13 + 5 * (1 - e) ** 1.5;
      b.dx = (b.hx - b.fx) / 11; b.dz = (b.hz - b.fz) / 11;
      if (u >= 1) { b.st = 0; b.x = b.hx; b.z = b.hz; }
    }
    const o = b.i * 3; const o3 = b.i * 9;
    if (y === undefined) { y = -999; x = z = 0; }
    const sp = b.sparrow;
    const cr = (sp ? 0.34 : 0.3) * dim; const cg = (sp ? 0.2 : 0.32) * dim; const cb = (sp ? 0.1 : 0.38) * dim;
    body.pos[o] = x; body.pos[o + 1] = y < -900 ? -999 : y + 0.04; body.pos[o + 2] = z;
    body.col[o] = cr; body.col[o + 1] = cg; body.col[o + 2] = cb;
    const px = -b.dz; const pz = b.dx; const hid = y < -900;
    const slot = (j, ox, oy, oz, r, g, bl) => { const q = o3 + j * 3; parts.pos[q] = x + ox; parts.pos[q + 1] = hid ? -999 : y + oy; parts.pos[q + 2] = z + oz; parts.col[q] = r * dim; parts.col[q + 1] = g * dim; parts.col[q + 2] = bl * dim; };
    if (fl) {
      const f = Math.sin(T * 26 + b.i * 2) * 0.2;
      slot(0, px * 0.25 - b.dx * 0.0, 0.08 + f, pz * 0.25, cr / dim * 0.8, cg / dim * 0.8, cb / dim * 0.8);
      slot(1, -px * 0.25, 0.08 - f, -pz * 0.25, cr / dim * 0.8, cg / dim * 0.8, cb / dim * 0.8);
      slot(2, -b.dx * 0.2, 0.03, -b.dz * 0.2, 0.3, 0.3, 0.32);
    } else {
      const pk = b.peck ?? 0; const f = 0.15 + 0.06 * (1 - pk); const hy = 0.17 - 0.12 * pk;
      slot(0, b.dx * f * (1 + pk * 0.5), hy, b.dz * f * (1 + pk * 0.5), sp ? 0.5 : 0.16, sp ? 0.22 : 0.3, sp ? 0.1 : 0.28); // head (a sparrow's cap is rust, a pigeon's neck green-grey)
      slot(1, -b.dx * 0.17, 0.07, -b.dz * 0.17, 0.12, 0.12, 0.14); // tail
      const q = o3 + 6; parts.pos[q + 1] = -999; // third slot unused on the ground
    }
  }

  return {
    counts: { birds: nBirds, moths: nMoths, ladybirds: nLady, sparkle: nSpark, stray: tex ? 1 : 0 },
    // update(dt, T, catPos {x, z} or null, lit 0..1, speed m/s)
    update(dt, T, cat, lit = 0, speed = 0) {
      dt = Math.max(0, Math.min(dt, 0.25)) || 0;
      const dim = 1 - 0.45 * lit;
      if (reducedMotion) { if (!drawnStatic) { drawnStatic = true; drawLady(T); drawStray(T, null, dim); } return; }
      for (const q of all) q.pts.visible = true;
      drawLady(T); drawStray(T, cat, dim);
      for (const b of birds) bird(b, T, dt, cat, speed, dim);
      body.geo.attributes.position.needsUpdate = body.geo.attributes.color.needsUpdate = true;
      parts.geo.attributes.position.needsUpdate = parts.geo.attributes.color.needsUpdate = true;
      // moths at dusk: round the stall bulbs
      const mo = smooth(0.5, 0.9, lit);
      for (let i = 0; i < nMoths; i++) {
        const bl = [[-3.3, 40, 2.14], [4.2, 40, 2.12], [3.3, 34.5, 2.14], [-3.3, 26, 2.14]][i >> 1]; const o = i * 3; const w = 5 + hash(i, 5) * 4;
        const a = T * w + i * 2; const r = 0.28 + 0.14 * Math.sin(T * 1.7 + i);
        moth.pos[o] = bl[0] + Math.cos(a) * r; moth.pos[o + 1] = mo > 0.02 ? bl[2] + 0.2 + 0.18 * Math.sin(a * 1.7 + i) : -999; moth.pos[o + 2] = bl[1] + Math.sin(a * 1.3) * r;
        const f = mo * (0.5 + 0.5 * hash(Math.floor(T * 16), i + 40));
        moth.col[o] = 0.9 * f; moth.col[o + 1] = 0.82 * f; moth.col[o + 2] = 0.55 * f;
      }
      moth.geo.attributes.position.needsUpdate = moth.geo.attributes.color.needsUpdate = true;
      // the big wheel's welcome: a ring of sparkles round its rim as she first comes near
      const hx = hub ? hub.x : 0; const hy = hub ? hub.y : 8; const hz = hub ? hub.z : -30;
      if (cat) {
        const dw = Math.hypot(cat.x - hx, cat.z - hz);
        if (dw < PALS.wheelNear && T - welcomeAt > PALS.welcomeEvery && welcomeEnded) { welcomeAt = T; welcomeEnded = false; }
        if (dw > PALS.wheelNear + 8) welcomeEnded = true;
      }
      const wt = T - welcomeAt; const on = wt >= 0 && wt < PALS.welcomeLen;
      for (let i = 0; i < nSpark; i++) {
        const a = (i / nSpark) * Math.PI * 2; const o = i * 3;
        spark.pos[o] = hx + Math.cos(a) * FERRIS.R; spark.pos[o + 1] = on ? hy + Math.sin(a) * FERRIS.R : -999; spark.pos[o + 2] = hz + 1.0;
        const env = smooth(0, 0.4, wt) * (1 - smooth(2.0, PALS.welcomeLen, wt));
        const f = env * (0.35 + 0.65 * Math.max(0, Math.sin(wt * 9 + i * 2.4))) * (1 + 0.8 * Math.max(0, Math.cos(a - wt * 3.5)));
        spark.col[o] = 1.2 * f; spark.col[o + 1] = (i % 2 ? 0.95 : 0.7) * f; spark.col[o + 2] = (i % 2 ? 0.8 : 0.4) * f;
      }
      spark.geo.attributes.position.needsUpdate = spark.geo.attributes.color.needsUpdate = true;
      // arrival: she walks in under the gate's arch
      if (cat && lastCat && lastCat.z > GATE_AT.z && cat.z <= GATE_AT.z && Math.abs(cat.x) < GATE_HALF + 0.4 && T - arrivedAt > 20) {
        arrivedAt = T; puff(cat.x, cat.z); onEvent({ type: 'arrive', x: cat.x, z: cat.z });
      }
      if (cat) { lastCat = lastCat ?? { x: 0, z: 0 }; lastCat.x = cat.x; lastCat.z = cat.z; }
      // sound beds: each swells and fades with where she stands (a slow blend), the carousel's music taking its share
      if (cat) {
        const mg = 1 - smooth(8, 30, Math.hypot(cat.x - MGR_AT.x, cat.z - MGR_AT.z));
        const tw = bedWeights(cat.x, cat.z, mg);
        const e = Math.min(1, dt / 1.4);
        for (const id of Object.keys(lvl)) {
          lvl[id] += (tw[id] - lvl[id]) * e; due[id] -= dt;
          if (due[id] <= 0) {
            due[id] = PALS.beds[id].every * (0.8 + 0.4 * hash(Math.floor(T), id.length * 7));
            if (lvl[id] > 0.05) onEvent({ type: 'bed', bed: id, volume: Math.min(1, lvl[id] * PALS.beds[id].vol), n: Math.floor(T) });
          }
        }
      }
    },
    dispose() {
      if (sc) sc.remove(...all.map((q) => q.pts));
      for (const q of all) { q.geo.dispose(); q.pts.material.dispose(); }
      tex?.dispose();
    },
  };
}

// The pennants flutter on the calliope's bar (a half bar and two bars: no longer on their own clocks), and the lights' beat has a downbeat (the calliope's oom, then two softer pahs).
export function syncToBeat(T) {
  if (!(FAIR_CLOCK.flutterOn.value > 0) || !Number.isFinite(T)) return;
  FAIR_CLOCK.flutterA.value = frac(T / (2 * BEAT.bar)) * Math.PI * 2;
  FAIR_CLOCK.flutterB.value = frac(T / BEAT.bar) * Math.PI * 2;
  FAIR_CLOCK.beat.value *= Math.floor(T / BEAT.note) % 3 === 0 ? 1 : 0.55;
}
