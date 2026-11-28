// =============================================================================
// THE JUNGLE LODGE: BEAUTY PASS 8 (2026-11-28), the jungle answers her voice and her moves. NET ZERO triangles, no mesh, no caster, no light, no collider, no word, no gameplay effect, no progress.
// A small pool of pooled points (more points of the one `jungle:motes` Points, nothing else) that the walk's own verbs set off. Each kind of reaction waits 1.5 s before it can come again, and
// all of it is points far from the screen's edges and the HUD:
//   * MEOW (the bus's tip:did 'call'): birds in the canopy answer with a call and a flurry, frogs croak back in a chorus, fireflies swirl in to her, the sloth turns its head, a monkey echoes.
//   * POUNCE / LAND (session.pounceTime, the bus's pounce:land): a kick of leaf litter, a burst of leaves, petals shaken down from the low branches, a splash in the wet.
//   * SNIFF (session.sniffTime): scent sparkles drift to the nearest flower or mushroom (a hint, not a quest), with one soft chime.
//   * SIT / LOAF (session.idleTime past 2.2 s): butterflies come to land on her, dragonflies hover.
//   * ZOOMIES (session.wasZooming): a wake of leaves and a streak of fireflies behind her.
// Reduced motion: the sounds only. Lite: fewer points and no dragonflies. Draws no random number at run time (a hash of a counter) and reads no clock (time arrives as `t`). Pure but for `step`.
// =============================================================================
const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;

export const RX = Object.freeze({ gap: 1.5, still: 2.2, pool: Object.freeze({ high: 44, low: 28, lite: 14 }), scale: Object.freeze({ high: 1, low: 0.65, lite: 0.35 }), reach: 26 });
const BIRD = Object.freeze([[1, 0.08, 0.04], [1, 0.72, 0], [0, 0.42, 1], [0, 0.9, 0.2]]);
const LEAF = Object.freeze([[0.5, 0.95, 0], [0.95, 0.4, 0], [1, 0.72, 0], [0.7, 0.25, 0]]);
const PETAL = Object.freeze([[1, 0.1, 0.45], [1, 0.45, 0], [0.6, 0.15, 1], [1, 0.8, 0]]);
const WING = Object.freeze([[1, 0.45, 0], [0, 0.55, 1], [1, 0.85, 0], [0.8, 0.2, 1]]);

/** The points this pass adds (descriptors; every colour, size and place is set per frame by `at`). */
export const rxPoints = (rung) => Array.from({ length: RX.pool[rung] }, (_x, i) => ({ kind: 'rx', i, size: 0.6, rgb: [1, 1, 1] }));

/** A leaf lying in the camera's way at a vista (a big lime leaf near the lens) is shrunk and deepened. cam = the vista's stand and the camera 4.4 m behind it. Pure. */
export function inCamZone(x, z, V) {
  const dx = V.fx - V.x; const dz = V.fz - V.z; const L = Math.hypot(dx, dz) || 1;
  const cx = V.x - (dx / L) * 4.4; const cz = V.z - (dz / L) * 4.4;
  return Math.hypot(x - cx, z - cz) < 4.5 || Math.hypot(x - V.x, z - V.z) < 1.8;
}

/** The reactions. opts { rung, motion (false under reduced motion), voice { call(k), croak(k), chime(k, v) } (optional), ground(x, z), targets [{ x, z, y }] (flowers, mushrooms), sloth (the creature's state or null) }. */
export function createReactions({ rung = 'high', motion = true, voice = null, ground = () => 0, targets = [], sloth = null }) {
  const N = RX.pool[rung]; const K = RX.scale[rung];
  const ps = Array.from({ length: N }, () => ({ t0: -1, life: 0, fade: 0.5, mode: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ay: 0, floor: -99, a0: 0, spin: 0, r0: 0, r1: 0, y0: 0, y1: 0, dur: 1, bob: 0, g: 0.6, fl: 0, fw: 10, ph: 0, size: 0.6, rgb: BIRD[0] }));
  let head = 0; let seq = 1;
  const cool = {}; const queue = []; const c = { x: 0, y: 0, z: 0, fa: 0 };
  const st = { prevPounce: 0, prevSniff: 0, armedSit: true, zoomOn: false, zoomT: 0, nextTrail: 0, meowed: false, landed: false, counts: { meow: 0, land: 0, pounce: 0, sniff: 0, sit: 0, zoom: 0 } };
  const h = (k) => hash(seq * 7 + k * 13);
  const ready = (kind, t) => { if (t < (cool[kind] ?? -1)) return false; cool[kind] = t + RX.gap; st.counts[kind]++; return true; };
  const n = (full) => Math.max(1, Math.round(full * K));
  function take(t0, life, o) { const p = ps[head]; head = (head + 1) % N; seq++; return Object.assign(p, { t0, life, fade: 0.5, mode: 0, vx: 0, vy: 0, vz: 0, ay: 0, floor: -99, spin: 0, bob: 0, g: 0.7, fl: 0, fw: 10, ph: h(1) * TAU }, o); }
  const say = (t, at, fn, k, v) => { if (voice) queue.push({ at: t + at, fn, k, v }); };

  function meow(t, emit) {
    const base = c.fa; // the way the camera looks: what she hears answers in front of her, where it can be seen
    if (emit) {
    for (let i = 0; i < n(8); i++) { // birds go up from the canopy round her, out and over
      const a = base + (i - 3.5) * 0.26 + (h(3) - 0.5) * 0.2; const r = 5.5 + 3.5 * h(4 + i); const ox = c.x + Math.cos(a) * r; const oz = c.z + Math.sin(a) * r;
      take(t + 0.45 + 0.1 * i, 2.6, { x: ox, y: c.y + 3.6 + 2 * h(5 + i), z: oz, vx: Math.cos(a) * 1.5 + Math.sin(a) * 1.1 * (i % 2 ? 1 : -1), vz: Math.sin(a) * 1.5 - Math.cos(a) * 1.1 * (i % 2 ? 1 : -1), vy: 1.7, ay: -0.35, size: 0.8, rgb: BIRD[i % 4], g: 0.7, fl: 0.7, fw: 17, fade: 0.8 });
    }
    for (let i = 0; i < n(6); i++) { // fireflies swirl in to her
      take(t + 0.25 + 0.1 * i, 5.2, { mode: 1, a0: base + (i - 2.5) * 0.45, spin: 1.1 * (i % 2 ? 1 : -1), r0: 5 + 2 * h(8 + i), r1: 0.9 + 0.7 * h(9 + i), y0: c.y + 1.4 + h(10 + i), y1: c.y + 0.9 + 0.5 * h(11 + i), dur: 2.4, bob: 0.12, size: 0.32, rgb: [0.85, 1, 0.35], g: 0.95, fl: 0.5, fw: 5, fade: 1.2 });
    }
    for (let i = 0; i < n(3); i++) { // the frogs' chorus: a green glow at each croak
      const a = base + (i - 1) * 0.7; const r = 3.5 + 2 * h(12 + i);
      take(t + 0.9 + 0.28 * i, 0.9, { x: c.x + Math.cos(a) * r, y: ground(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r) + 0.3, z: c.z + Math.sin(a) * r, size: 0.9, rgb: [0.45, 1, 0.5], g: 0.8, fl: 0.5, fw: 14, fade: 0.5 });
    }
    }
    say(t, 0.45, 'call', 140 + st.counts.meow * 3); say(t, 0.95, 'croak', 80 + st.counts.meow); say(t, 1.22, 'croak', 83 + st.counts.meow); say(t, 1.5, 'croak', 86 + st.counts.meow); say(t, 2.0, 'call', 230 + st.counts.meow * 5);
    if (sloth) sloth.hear = t + 7; // the sloth hears her from farther off and turns its head
  }
  function leaves(t, cnt, vmul, from = 0) {
    for (let i = 0; i < cnt; i++) {
      const a = h(20 + i) * TAU; const s = (1.1 + 1.5 * h(21 + i)) * vmul;
      take(t, 1.1 + 0.4 * h(22 + i), { x: c.x + Math.cos(a) * 0.25, y: c.y + 0.15, z: c.z + Math.sin(a) * 0.25, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: (2 + 1.6 * h(23 + i)) * vmul, ay: -9, floor: c.y + 0.05, size: 0.42, rgb: LEAF[(i + from) % 4], g: 0.6, fl: 0.4, fw: 12, fade: 0.4 });
    }
  }
  function land(t, rain) {
    leaves(t, n(8), 1);
    for (let i = 0; i < n(6); i++) { // petals shaken down from the low branches
      const a = h(30 + i) * TAU; const r = 0.4 + 1.4 * h(31 + i);
      take(t + 0.12 + 0.08 * i, 3.2, { x: c.x + Math.cos(a) * r, y: c.y + 2.7 + 0.9 * h(32 + i), z: c.z + Math.sin(a) * r, vx: 0.25 * Math.sin(i), vz: 0.2 * Math.cos(i * 2), vy: -0.45, ay: 0, floor: c.y + 0.04, size: 0.55, rgb: PETAL[i % 4], g: 0.6, fl: 0.35, fw: 4, fade: 0.6 });
    }
    if (rain > 0.15) for (let i = 0; i < n(5); i++) { const a = h(40 + i) * TAU; take(t, 0.75, { x: c.x + Math.cos(a) * 0.3, y: c.y + 0.1, z: c.z + Math.sin(a) * 0.3, vx: Math.cos(a) * 1.1, vz: Math.sin(a) * 1.1, vy: 2.3 + h(41 + i), ay: -9, floor: c.y + 0.03, size: 0.26, rgb: [0.7, 0.9, 1], g: 0.9, fl: 0.2, fw: 20, fade: 0.3 }); }
  }
  function sniff(t) {
    let best = null; let bd = RX.reach;
    for (const o of targets) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < bd && d > 1.2 && ((o.x - c.x) * Math.cos(c.fa) + (o.z - c.z) * Math.sin(c.fa)) / d > 0.2) { bd = d; best = o; } } // the nearest one in the way she faces
    const dur = 2.2 + Math.min(1.8, bd * 0.08);
    for (let i = 0; i < n(6); i++) {
      const dl = 0.12 * i; const wob = 0.35 * Math.sin(i * 2.3);
      if (best) {
        const ux = (best.x - c.x) / bd; const uz = (best.z - c.z) / bd; const T = dur + dl;
        take(t + dl, T, { x: c.x + ux * 0.5 - uz * wob * 0.3, y: c.y + 0.4, z: c.z + uz * 0.5 + ux * wob * 0.3, vx: (best.x - c.x - ux * 0.5) / dur, vz: (best.z - c.z - uz * 0.5) / dur, vy: (best.y - c.y - 0.4) / dur + 0.15 * Math.sin(i), size: 0.36, rgb: i % 2 ? [1, 0.8, 0.2] : [1, 0.3, 0.7], g: 0.95, fl: 0.7, fw: 11, fade: 0.7 });
      } else take(t + dl, 2.2, { mode: 1, a0: i * 1.05, spin: 0.9, r0: 0.5, r1: 0.9, y0: c.y + 0.3, y1: c.y + 1.7, dur: 2, size: 0.3, rgb: [1, 0.9, 0.55], g: 0.9, fl: 0.7, fw: 11, fade: 0.8 });
    }
    say(t, 0.3, 'chime', 20 + st.counts.sniff, 0.45);
  }
  function sit(t) {
    for (let i = 0; i < n(3); i++) { // butterflies come to land on her, and stay a while, opening and closing their wings
      take(t + 0.5 * i, 9, { mode: 1, a0: h(50 + i) * TAU, spin: 0.35, r0: 4 + h(51 + i), r1: 0.32 + 0.12 * i, y0: c.y + 2 + 0.4 * i, y1: c.y + 0.7 + 0.35 * i, dur: 2.6 + 0.3 * i, bob: 0.05, size: 0.5, rgb: WING[(i + st.counts.sit) % 4], g: 0.6, fl: 0.6, fw: 6 + i, fade: 1.2 });
    }
    if (rung !== 'lite') for (let i = 0; i < n(2); i++) { // dragonflies come and hover
      take(t + 0.3 + 0.4 * i, 7.5, { mode: 1, a0: h(55 + i) * TAU, spin: 0.9 * (i ? 1 : -1), r0: 5, r1: 1.05 + 0.3 * i, y0: c.y + 1.6, y1: c.y + 1.15 + 0.3 * i, dur: 1.6, bob: 0.1, size: 0.34, rgb: [0, 0.9, 0.8], g: 0.6, fl: 0.5, fw: 24, fade: 1 });
    }
  }
  function trail(t) { // the zoomies' wake: a leaf thrown up behind her and a firefly left hanging in the air
    leaves(t, n(2), 0.55, st.zoomT | 0);
    take(t, 1.3, { x: c.x, y: c.y + 0.5 + 0.3 * h(60), z: c.z, vx: 0.15 * Math.sin(seq), vz: 0.15 * Math.cos(seq), vy: 0.12, size: 0.3, rgb: [0.9, 1, 0.4], g: 0.95, fl: 0.45, fw: 9, fade: 0.9 });
  }

  /** One frame. cat = { x, y, z } (y may be missing), session = the walk's session or null (its pounceTime, sniffTime, idleTime, wasZooming), rain 0..1. */
  function step(dt, t, cat, session, rain = 0, fwd = null) {
    if (!cat) return;
    if (fwd && (fwd.x || fwd.z)) c.fa = Math.atan2(fwd.z, fwd.x);
    c.x = cat.x; c.z = cat.z; c.y = Number.isFinite(cat.y) ? cat.y : ground(cat.x, cat.z);
    while (queue.length && queue[0].at <= t) { const q = queue.shift(); try { if (q.fn === 'call') voice.call(q.k); else if (q.fn === 'croak') voice.croak(q.k); else voice.chime(q.k, q.v); } catch { /* the walk's audio only, and optional */ } }
    queue.sort((a, b) => a.at - b.at);
    const emit = motion;
    if (st.meowed) { st.meowed = false; if (ready('meow', t)) meow(t, emit); }
    if (st.landed) { st.landed = false; if (ready('land', t) && emit) land(t, rain); }
    if (session) {
      const pt = +session.pounceTime || 0; if (pt > 0 && st.prevPounce <= 0 && ready('pounce', t) && emit) leaves(t, n(4), 0.6); st.prevPounce = pt;
      const sn = +session.sniffTime || 0; if (sn > 0.01 && st.prevSniff <= 0.01 && ready('sniff', t) && emit) sniff(t); st.prevSniff = sn;
      const idle = +session.idleTime || 0;
      if (idle < 0.5 || session.perched) st.armedSit = !session.perched; else if (idle >= RX.still && st.armedSit && ready('sit', t)) { st.armedSit = false; if (emit) sit(t); }
      const z = !!session.wasZooming;
      if (z && !st.zoomOn && ready('zoom', t)) { st.zoomOn = true; st.zoomT = 0; st.nextTrail = t; }
      if (!z) st.zoomOn = false;
      if (st.zoomOn) { st.zoomT += dt; if (st.zoomT > 4) st.zoomOn = false; else if (t >= st.nextTrail && emit) { trail(t); st.nextTrail = t + 0.13; } }
    }
  }
  /** One point at time t for the cat c: fills out { x, y, z, g, size, rgb }. Pure. */
  function at(i, t, out) {
    const p = ps[i]; const age = t - p.t0; out.size = p.size; out.rgb = p.rgb; out.g = 0; out.x = c.x; out.z = c.z; out.y = -50;
    if (p.t0 < 0 || age < 0 || age > p.life) return out;
    if (p.mode === 0) { out.x = p.x + p.vx * age; out.z = p.z + p.vz * age; out.y = Math.max(p.floor, p.y + p.vy * age + 0.5 * p.ay * age * age); }
    else { const u = sstep(age / p.dur); const r = p.r0 + (p.r1 - p.r0) * u; const a = p.a0 + p.spin * age; out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a) * r; out.y = p.y0 + (p.y1 - p.y0) * u + p.bob * Math.sin(age * 3 + p.ph); }
    const env = Math.min(1, age / 0.15) * Math.min(1, (p.life - age) / p.fade);
    out.g = p.g * env * (1 - p.fl + p.fl * (0.5 + 0.5 * Math.sin(age * p.fw + p.ph)));
    return out;
  }
  return {
    points: () => rxPoints(rung), step, at, ps, state: st, queue,
    meow() { st.meowed = true; }, land() { st.landed = true; },
  };
}
