// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 5 (2026-11-28), living creatures and a world that agrees with itself. NET ZERO triangles, no mesh, no caster, no light, no collider, no word.
//   * CREATURES, only as points of the one pooled `jungle:motes` Points (no rig, no mesh, no triangle): dragonflies that hover over the river and dart away when she comes; frogs on
//     lily pads that plop (a ring and a sound) when she nears and climb back a while later; glowing beetles on the trunks at dusk; a sloth in a crown that slowly turns its head
//     toward her. And one hanging vine (recoloured banded, in junglebeauty2's soup) that sways when she looks at it.
//   * ONE COLOUR STORY from where she stands: warm amber at the lodge porch, lush green in the garden, cool teal at the river bank, gold-green on the canopy rise. `zoneWeights` is
//     pure; the place eases the weights over a second and a half (so there is no seam) and leans the haze, the sun, the mist and the shafts toward the blend.
//   * SOUND BEDS that cross-fade by the same weights: porch wind chimes, garden insects, river water, canopy birds; the water and the leaf-wind beds follow the gust the sway cloth
//     uses, and the mist drifts the way the wind blows, so water, wind and cloth agree.
//   * ARRIVAL: a soft burst of petals and a flush of birds the first time she is in the clearing, and a gentle light bloom the first time she reaches the river.
// Draws no random number at run time, reads no clock. Reduced motion: nothing here moves (the creatures keep their resting places; no arrival; the beds still breathe).
// =============================================================================
import * as P from './jungleplan.js';

const TAU = Math.PI * 2;
const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };

export const B5 = Object.freeze({
  dragons: Object.freeze({ high: 3, low: 2, lite: 1 }),
  frogs: Object.freeze({ high: 4, low: 3, lite: 2 }),
  beetles: Object.freeze({ high: 8, low: 5, lite: 3 }),
});
/** the wind, the same for the sway cloth, the mist and the water: a direction (unit) */
export const WIND = Object.freeze({ x: 0.8 / Math.hypot(0.8, 0.55), z: 0.55 / Math.hypot(0.8, 0.55) });

// ---- the colour story ------------------------------------------------------------------------------------------------------------------
export const ZONE_IDS = Object.freeze(['porch', 'garden', 'river', 'canopy']);
export const ZONE_TINT = Object.freeze({ porch: [1, 0.64, 0.24], garden: [0.72, 0.98, 0.58], river: [0.18, 0.74, 0.88], canopy: [0.92, 0.88, 0.26] });
const L = P.LODGE;
/** Where she is, as a share of each place (they sum to 1): the porch (the veranda and its steps), the river bank, the canopy rise; the garden is what is left. Pure. */
export function zoneWeights(x, z, out = { porch: 0, garden: 1, river: 0, canopy: 0 }) {
  const dx = Math.max(L.x0 - 1.5 - x, 0, x - (L.x1 + 1.5)); const dz = Math.max(L.wallZ - 1 - z, 0, z - (L.z1 + 2.5));
  const porch = sstep(1 - Math.hypot(dx, dz) / 7);
  const river = sstep(1 - Math.max(0, P.riverDist(x, z) - P.RIVER_W) / 7);
  const canopy = sstep(1 - Math.max(0, Math.hypot(x - P.CANOPY_HILL.x, z - P.CANOPY_HILL.z) - 8) / 8);
  const garden = 0.25;
  const s = porch + river + canopy + garden;
  out.porch = porch / s; out.river = river / s; out.canopy = canopy / s; out.garden = garden / s;
  return out;
}
/** Eases `cur` toward `target` (the listener-position blend: no jump, about a second and a half). */
export function easeWeights(cur, target, dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) / 0.7);
  for (const id of ZONE_IDS) cur[id] += (target[id] - cur[id]) * k;
  return cur;
}
/** The blend's colour: out = sum of weight * tint. */
export function zoneColor(w, out = [0, 0, 0]) {
  out[0] = out[1] = out[2] = 0;
  for (const id of ZONE_IDS) { const t = ZONE_TINT[id]; out[0] += w[id] * t[0]; out[1] += w[id] * t[1]; out[2] += w[id] * t[2]; }
  return out;
}

// ---- the creatures (pure plan) -----------------------------------------------------------------------------------------------------------
const onRiver = (f, lat) => {
  const p = P.RIVER_PATH; const j = Math.min(p.length - 2, Math.floor(f)); const u = f - j;
  return { x: p[j][0] + (p[j + 1][0] - p[j][0]) * u, z: p[j][1] + (p[j + 1][1] - p[j][1]) * u + lat };
};
const FROG_AT = Object.freeze([[3.2, 1.2], [3.72, -1.1], [2.4, 0.9], [4.12, 1.0]]);
const DRAGON_AT = Object.freeze([[3.35, 0.4], [3.9, -0.8], [2.55, 0.6]]);
const trunkR = (k) => 0.36 * k.s;
/** { dragons, frogs, beetles, sloth } at the full ('high') count; the lower rungs keep a prefix. Pure and seeded (no random draw). */
export function creaturePlan() {
  const dragons = DRAGON_AT.map(([f, lat], i) => { const o = onRiver(f, lat); return { x: o.x, z: o.z, y: P.jungleY(o.x, o.z) + 1.0 + 0.35 * hash(i * 3 + 1), ph: i * 2.3 + 0.7 }; });
  const frogs = FROG_AT.map(([f, lat], i) => { const o = onRiver(f, lat); return { x: o.x, z: o.z, y: P.jungleY(o.x, o.z) + P.RIVER_DEPTH + 0.03, ph: i * 1.9 }; });
  const trees = P.scatterTrees().filter((k) => !k.rim && k.kind !== 'palm' && k.shape !== 'snag');
  const heart = { x: -3, z: 27 }; // the way from the ring to the lodge
  const byWay = trees.slice().sort((a, b) => Math.hypot(a.x - heart.x, a.z - heart.z) - Math.hypot(b.x - heart.x, b.z - heart.z));
  const beetles = byWay.slice(0, 8).map((k, i) => {
    const a = Math.atan2(heart.z - k.z, heart.x - k.x) + (hash(i * 5 + 2) - 0.5) * 1.2; // the trunk's face toward the way, a little to a side
    const r = trunkR(k) + 0.04;
    return { x: k.x + Math.cos(a) * r, z: k.z + Math.sin(a) * r, y0: 0.7 + 1.0 * hash(i * 7 + 3), ph: hash(i * 11 + 4) * TAU, tx: k.x, tz: k.z };
  });
  const hosts = byWay.filter((k) => k.top >= 6 && Math.hypot(k.x - heart.x, k.z - heart.z) > 6.5);
  const h = hosts[0] ?? byWay[byWay.length - 1];
  const ux = heart.x - h.x; const uz = heart.z - h.z; const ul = Math.hypot(ux, uz) || 1; // it clings to the trunk's face toward the way
  const sloth = { x: h.x + (ux / ul) * (trunkR(h) + 0.3), z: h.z + (uz / ul) * (trunkR(h) + 0.3), y: Math.min(h.top - 1.2, 5.2 + 0.4 * h.s), s: h.s };
  return { dragons, frogs, beetles, sloth };
}

/** The vine that turns snake-like: the low hanging one nearest the way she first walks (its index in beauty2Plan().vines). */
export function snakeIndex(vines) {
  let best = -1; let bd = 1e9;
  vines.forEach((v, i) => { if (v.len < 2) return; const d = Math.hypot(v.x + 2, v.z - 26) / 2 + 3 * (v.y0 - v.len); if (d < bd) { bd = d; best = i; } });
  return best;
}
/** The snake's stripes (banded olive and gold) */
export const snakeHex = (k) => [0x7a8a1c, 0xe8c030, 0x4a6a18, 0xd0a020][k % 4];

// ---- the creatures alive (small pooled state) ---------------------------------------------------------------------------------------------
export const SLOTH_REST = 0.5; // where its head points before it sees her (radians, x toward z)
export const CRITTER = Object.freeze({ scare: 5.5, dart: 6.5, plopAt: 3.0, frogRest: 14, slothSee: 16 });
const DART_SLOT = 3.1;
export function createCreatures(rung = 'high') {
  const plan = creaturePlan();
  const dragons = plan.dragons.slice(0, B5.dragons[rung]).map((d) => ({ ...d, flee: 0, ax: 0, az: 0 }));
  const frogs = plan.frogs.slice(0, B5.frogs[rung]).map((f) => ({ ...f, hideUntil: -1, shown: 1 }));
  const beetles = plan.beetles.slice(0, B5.beetles[rung]);
  const sl = { ...plan.sloth, ang: SLOTH_REST, want: SLOTH_REST, see: 0 };
  /** one frame of her effect: dragonflies shy, frogs plop (calls onPlop(x, y, z) once each), the sloth turns. cat may be null. */
  function step(dt, t, cat, onPlop) {
    for (const d of dragons) {
      let near = 0;
      if (cat) { const dx = d.x - cat.x; const dz = d.z - cat.z; const dd = Math.hypot(dx, dz); if (dd < CRITTER.scare) { near = 1; if (dd > 1e-3) { d.ax = dx / dd; d.az = dz / dd; } } }
      d.flee += near ? (1 - d.flee) * Math.min(1, dt * 5) : -d.flee * Math.min(1, dt * 0.22);
    }
    for (const f of frogs) {
      if (cat && t >= f.hideUntil && Math.hypot(f.x - cat.x, f.z - cat.z) < CRITTER.plopAt) { f.hideUntil = t + CRITTER.frogRest; f.shown = 0; if (onPlop) onPlop(f.x, f.y, f.z); }
      else if (t >= f.hideUntil) f.shown = Math.min(1, f.shown + dt / 1.2);
    }
    if (cat) {
      const dx = cat.x - sl.x; const dz = cat.z - sl.z; const dd = Math.hypot(dx, dz);
      sl.see = dd < CRITTER.slothSee ? 1 : 0; sl.want = sl.see ? Math.atan2(dz, dx) : SLOTH_REST + 1.6 * Math.sin(t * 0.045);
    } else sl.want = SLOTH_REST + 1.6 * Math.sin(t * 0.045);
    let da = sl.want - sl.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); // the long way round never; slow as a sloth
    sl.ang += Math.max(-0.35 * dt, Math.min(0.35 * dt, da));
  }
  /** A point of the creature set: fills out { x, y, z, g, size }. part names the point. */
  function at(c, t, day, out) {
    out.size = c.size;
    if (c.kind === 'dragon' || c.kind === 'dragonwing') {
      const d = dragons[c.i]; const slot = Math.floor((t + d.ph) / DART_SLOT); const u = ((t + d.ph) / DART_SLOT) - slot; const k = sstep(u * 6); // a quick dart each slot, then a hover
      const sx = (hash(slot * 7 + c.i * 3) - 0.5) * 2.4; const sz = (hash(slot * 7 + c.i * 3 + 1) - 0.5) * 2.4; const px = (hash((slot - 1) * 7 + c.i * 3) - 0.5) * 2.4; const pz = (hash((slot - 1) * 7 + c.i * 3 + 1) - 0.5) * 2.4;
      const fx = d.ax * CRITTER.dart * d.flee; const fz = d.az * CRITTER.dart * d.flee;
      out.x = d.x + px + (sx - px) * k + fx; out.z = d.z + pz + (sz - pz) * k + fz;
      out.y = d.y + 0.12 * Math.sin(t * 2.1 + d.ph) + 1.6 * d.flee + (c.kind === 'dragonwing' ? 0.03 : 0);
      out.g = (c.kind === 'dragon' ? 0.9 : 0.3 + 0.3 * Math.sin(t * 46 + d.ph)) * (1 - 0.85 * day.dusk) * (1 - 0.6 * d.flee);
    } else if (c.kind === 'frogeye') { // a gold glint on the frog's brow (the frog and its pad are triangles in junglebeauty2's soup)
      const f = frogs[c.i]; out.x = f.x + 0.06; out.z = f.z; out.y = f.y + 0.3; out.g = f.shown * f.shown * 0.9;
    } else if (c.kind === 'beetle') {
      const b = beetles[c.i]; out.x = b.x; out.z = b.z; out.y = P.jungleY(b.x, b.z) + b.y0 + 0.18 * Math.sin(t * 0.09 + b.ph);
      out.g = (0.08 + 0.95 * day.dusk) * (0.75 + 0.25 * Math.sin(t * 1.3 + b.ph));
    } else { // the sloth's two eyes, on the head that turns (the fur and the head are triangles in the soup)
      const a = sl.ang; const sd = c.side > 0 ? 0.1 : -0.1;
      out.x = sl.x + Math.cos(a) * 0.6 - Math.sin(a) * sd; out.z = sl.z + Math.sin(a) * 0.6 + Math.cos(a) * sd; out.y = P.jungleY(sl.x, sl.z) + sl.y + 0.16; out.g = 0.25 + 0.75 * sl.see;
    }
    return out;
  }
  /** the point descriptors the Points mesh gets: [{ kind: 'cr', c: { kind, i, size }, size, rgb }] */
  function points() {
    const pts = []; const add = (kind, i, size, rgb, extra = {}) => pts.push({ kind: 'cr', c: { kind, i, size, ...extra }, size, rgb });
    dragons.forEach((_, i) => { add('dragon', i, 1.0, [0.1, 0.85, 1]); add('dragonwing', i, 2.2, [0.7, 0.9, 1]); });
    frogs.forEach((_, i) => add('frogeye', i, 0.3, [1, 0.95, 0.4]));
    beetles.forEach((_, i) => add('beetle', i, 0.55, [0.75, 1, 0.3]));
    add('slotheye', 0, 0.22, [1, 0.95, 0.7], { side: 1 }); add('slotheye', 0, 0.22, [1, 0.95, 0.7], { side: -1 });
    return pts;
  }
  const still = (k) => k === 'frogeye';
  return { step, at, points, dragons, frogs, beetles, sloth: sl, still };
}

// ---- the snake vine: how much she is looking at it ---------------------------------------------------------------------------------------------
/** 0..1: how squarely the camera (position cx, cy, cz, looking along unit f) faces a point and how near it is. Pure. */
export function gazeAt(cam, f, px, py, pz) {
  const dx = px - cam.x; const dy = py - cam.y; const dz = pz - cam.z; const d = Math.hypot(dx, dy, dz);
  if (d < 0.5 || d > 18) return 0;
  const dot = (dx * f.x + dy * f.y + dz * f.z) / d;
  return sstep((dot - 0.86) / 0.1);
}

// ---- the arrival -----------------------------------------------------------------------------------------------------------------------
export const ARRIVE = Object.freeze({ clearing: 8.5, river: 3.6, after: 0.6 });
/** Which arrival moment is due now: 'clearing' once, then 'river' once, else null. state = { clearing: false, river: false }. Pure besides the state. */
export function arrivalDue(state, t, cat) {
  if (!cat || t < ARRIVE.after) return null;
  if (!state.clearing && Math.hypot(cat.x - P.RING.x, cat.z - P.RING.z) <= ARRIVE.clearing) { state.clearing = true; return 'clearing'; }
  if (!state.river && P.riverDist(cat.x, cat.z) <= P.RIVER_W + ARRIVE.river) { state.river = true; return 'river'; }
  return null;
}
/** The light bloom's brightness at an age (a second to open, four to fade): 0..1. */
export const bloomLight = (age) => (age < 0 || age > 5.2 ? 0 : age < 1 ? sstep(age) : (1 - (age - 1) / 4.2) ** 1.6);

// ---- the sound beds -----------------------------------------------------------------------------------------------------------------------
/** A wind chime: three soft glassy notes of a pentatonic row, long decays; strength 0..1. Silent when muted. */
export function chimeNote(audio, k = 0, strength = 1) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return false;
  const ac = audio.getContext(); if (!ac) return false;
  const now = ac.currentTime; const row = [784, 880, 1047, 1175, 1319];
  for (let n = 0; n < 3; n++) {
    const at = now + n * (0.18 + 0.1 * hash(k * 5 + n)); const f = row[Math.floor(hash(k * 3 + n * 7) * row.length)];
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.011 * strength), at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);
    o.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
    o.start(at); o.stop(at + 1.6);
  }
  return true;
}
const noiseBuf = (ac) => { const n = Math.floor(ac.sampleRate * 2); const b = ac.createBuffer(1, n, ac.sampleRate); const d = b.getChannelData(0); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.06 * (hash(i + 77) * 2 - 1)) / 1.06; d[i] = last * 6; } return b; };
/** The two continuous beds, made the first time the sound is on: water (low, rushing) and leaf-wind (a breath). They follow the zone weights and the gust. */
export function createBeds(audio) {
  let nodes = null; let broken = false;
  const live = () => !broken && audio && typeof audio.getContext === 'function' && !audio.isMuted?.() && audio.getContext();
  const to = (param, v, now, k) => { if (param.setTargetAtTime) param.setTargetAtTime(v, now, k); else param.value = v; };
  return {
    get on() { return !!nodes; },
    update(w, gust) {
      const ac = live();
      if (!ac) { if (nodes) { const now = nodes.ac.currentTime; to(nodes.water.g.gain, 0, now, 0.3); to(nodes.air.g.gain, 0, now, 0.3); } return false; }
      if (!nodes) {
        try {
          const mk = (type, f, q) => { const src = ac.createBufferSource(); src.buffer = noiseBuf(ac); src.loop = true; const flt = ac.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; const g = ac.createGain(); g.gain.value = 0; src.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination); src.start(); return { src, flt, g }; };
          nodes = { ac, water: mk('lowpass', 800, 0.6), air: mk('bandpass', 520, 0.5) };
        } catch (e) { broken = true; nodes = null; return false; } // a sound system without these parts just has no beds
      }
      const now = ac.currentTime;
      to(nodes.water.g.gain, 0.05 * (0.06 + w.river) * (0.7 + 0.5 * gust), now, 0.5); to(nodes.water.flt.frequency, 600 + 700 * gust, now, 0.5);
      to(nodes.air.g.gain, 0.028 * (0.25 + 0.5 * w.canopy + 0.3 * w.porch + 0.2 * w.garden) * gust, now, 0.6);
      return true;
    },
    dispose() { if (nodes) { try { nodes.water.src.stop(); nodes.air.src.stop(); } catch (e) { /* already stopped */ } nodes = null; } },
  };
}
