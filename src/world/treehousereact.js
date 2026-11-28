// =============================================================================
// THE TREEHOUSE VILLAGE: BEAUTY PASS 8 (2026-11-28), the village answers her voice and her moves. NET ZERO triangles, no mesh, no caster, no light, no collider, no word, no gameplay effect, no progress.
// More slots of two Points the life already owns (the fireflies, additive, and the falling leaves), a few numbers for the shader (sky.fx: the lamps' flare and sway, the planks' flex, the canopy's shiver),
// the owl's head and the squirrels' ears, and sounds on the walk's own audio object. Each kind of reaction waits 1.5 s before it can come again.
//   * MEOW (the bus's tip:did 'call'): the chimes ring in a cascade, the lanterns flare and sway, the birds answer (a flurry rises and they call), the squirrels sit up and chitter, the leaves shiver, the owl turns to her.
//   * POUNCE / LAND (the bus's pounce:land, session.pounceTime): a shower of leaves and a thump, the planks flex (the landing's own flex, scaled up).
//   * SNIFF (session.sniffTime): scent sparkles drift off towards the Bakery (a hint, not a quest) with one soft chime.
//   * STILL (session.idleTime past 2.2 s): fireflies and dust motes gather round her and a leaf comes down to land on her back.
//   * ZOOMIES (session.wasZooming): leaves whirl up behind her and the bridge and the lamps sway.
// Reduced motion: the sounds only (no slot, no shader number). Lite: fewer slots. Draws no random number at run time (a hash of a counter) and reads no clock (time arrives as `t`).
// =============================================================================
const TAU = Math.PI * 2;
const sstep = (u) => { const x = u < 0 ? 0 : u > 1 ? 1 : u; return x * x * (3 - 2 * x); };
const hash = (n) => { let h = (n * 374761393 + 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export const RX = Object.freeze({ gap: 1.5, still: 2.2, glow: Object.freeze({ high: 64, low: 36, lite: 16 }), leaf: Object.freeze({ high: 30, low: 16, lite: 8 }), scale: Object.freeze({ high: 1, low: 0.6, lite: 0.35 }), bakery: Object.freeze({ x: -9.6, y: 2.8, z: 7.5 }) });
const BIRD = Object.freeze([[1, 0.85, 0.3], [0.5, 0.75, 1], [1, 0.55, 0.35], [0.7, 1, 0.5]]);
const LEAF = Object.freeze([[0.45, 0.8, 0.2], [0.85, 0.6, 0.15], [0.8, 0.35, 0.12], [0.6, 0.7, 0.2]]);

/** A short bird or squirrel voice on the walk's own audio object only (silent when muted or absent): n quick blips from f Hz, each a little higher (bird) or lower (squirrel). */
export function chirp(audio, f, n, step, dur, gain) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return false;
  const ac = audio.getContext(); if (!ac || !ac.createOscillator || !ac.createGain) return false;
  for (let i = 0; i < n; i++) {
    const at = ac.currentTime + i * (dur + 0.03); const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f + i * step, at); o.frequency.exponentialRampToValueAtTime(Math.max(200, f + i * step + step * 2 + 300), at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(audio.getMaster?.() ?? ac.destination); o.start(at); o.stop(at + dur + 0.02);
  }
  return true;
}

/** opts { rung, motion, voice { chime(k, pitch), bird(k), squirrel(k) }, sky (the glow's sky: .fx and .lampList), owl (state { hear }), squirrels (state { hear }), nearBridge(x, z) }. */
export function createReact({ rung = 'high', motion = true, voice = null, sky = null, owl = null, squirrels = null, nearBridge = () => false }) {
  const NG = motion ? RX.glow[rung] : 0; const NL = motion ? RX.leaf[rung] : 0; const K = RX.scale[rung];
  const mkp = () => ({ t0: -1, life: 0, fade: 0.5, mode: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ay: 0, floor: -99, a0: 0, spin: 0, r0: 0, r1: 0, y0: 0, y1: 0, dur: 1, bob: 0, g: 0.6, fl: 0, fw: 10, ph: 0, rgb: BIRD[0] });
  const pools = [Array.from({ length: NG }, mkp), Array.from({ length: NL }, mkp)]; // 0 = glow (additive), 1 = leaves
  const heads = [0, 0]; let seq = 1;
  const cool = {}; const queue = []; const c = { x: 0, y: 0, z: 0, fa: 0 };
  const st = { prevPounce: 0, prevSniff: 0, armedSit: true, zoomOn: false, zoomT: 0, nextTrail: 0, meowed: false, landed: false, meowAt: -99, landAt: -99, zoomUntil: -99, counts: { meow: 0, land: 0, pounce: 0, sniff: 0, sit: 0, zoom: 0 } };
  const fxo = { flare: 0, sway: 0, flex: 0, shake: 0 };
  const h = (k) => hash(seq * 7 + k * 13);
  const ready = (kind, t) => { if (t < (cool[kind] ?? -1)) return false; cool[kind] = t + RX.gap; st.counts[kind]++; return true; };
  const n = (full) => Math.max(1, Math.round(full * K));
  function take(pool, t0, life, o) { const a = pools[pool]; if (!a.length) return; const p = a[heads[pool]]; heads[pool] = (heads[pool] + 1) % a.length; seq++; Object.assign(p, mkp(), { t0, life, ph: h(1) * TAU }, o); }
  const say = (t, at, fn, k, v) => { if (voice) queue.push({ at: t + at, fn, k, v }); };

  function meow(t, emit) {
    const base = c.fa; st.meowAt = t;
    if (emit) {
      for (let i = 0; i < n(12); i++) { // the birds answer: a flurry goes up from the boughs round her, out and over
        const a = base + (i - 5.5) * 0.24 + (h(3) - 0.5) * 0.2; const r = 4 + 3 * h(4 + i);
        take(0, t + 0.2 + 0.07 * i, 2.6, { x: c.x + Math.cos(a) * r, y: c.y + 2.6 + 1.6 * h(5 + i), z: c.z + Math.sin(a) * r, vx: Math.cos(a) * 1.3 + Math.sin(a) * (i % 2 ? 1 : -1), vz: Math.sin(a) * 1.3 - Math.cos(a) * (i % 2 ? 1 : -1), vy: 1.5, ay: -0.3, rgb: BIRD[i % 4], g: 1.7, fl: 0.6, fw: 17, fade: 0.8 });
      }
      for (let i = 0; i < n(12); i++) { // her voice goes out as a ring of glints that rise and open
        take(0, t + 0.04 * i, 1.6, { mode: 1, a0: i * (TAU / n(12)), spin: 1.2, r0: 0.3, r1: 2.6, y0: c.y + 0.5, y1: c.y + 1.9 + 0.5 * h(70 + i), dur: 1.1, rgb: i % 2 ? [1, 0.9, 0.5] : [0.8, 1, 0.7], g: 2, fl: 0.25, fw: 10, fade: 0.7 });
      }
    }
    for (let i = 0; i < 4; i++) say(t, 0.12 + 0.2 * i, 'chime', 60 + st.counts.meow * 4 + i, [1, 1.122, 1.26, 1.498][i]); // the cascade, up the scale
    say(t, 0.25, 'bird', 3 + st.counts.meow); say(t, 0.8, 'bird', 7 + st.counts.meow); say(t, 1.2, 'squirrel', 2 + st.counts.meow);
    if (owl) owl.hear = t + 4; if (squirrels) squirrels.hear = t + 3.5;
  }
  function leaves(t, cnt, vmul, from = 0) {
    for (let i = 0; i < cnt; i++) {
      const a = h(20 + i) * TAU; const s = (1.1 + 1.5 * h(21 + i)) * vmul;
      take(1, t, 1.2 + 0.4 * h(22 + i), { x: c.x + Math.cos(a) * 0.25, y: c.y + 0.2, z: c.z + Math.sin(a) * 0.25, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: (2.3 + 1.6 * h(23 + i)) * vmul, ay: -9, floor: c.y + 0.05, rgb: LEAF[(i + from) % 4], g: 1, fl: 0, fade: 0.4 });
    }
  }
  function land(t) {
    leaves(t, n(14), 1);
    for (let i = 0; i < n(10); i++) { // leaves shaken down from the boughs overhead
      const a = h(30 + i) * TAU; const r = 0.4 + 1.6 * h(31 + i);
      take(1, t + 0.1 + 0.07 * i, 3.4, { x: c.x + Math.cos(a) * r, y: c.y + 3 + 1.2 * h(32 + i), z: c.z + Math.sin(a) * r, vx: 0.3 * Math.sin(i), vz: 0.25 * Math.cos(i * 2), vy: -0.9, floor: c.y + 0.04, rgb: LEAF[(i + 1) % 4], g: 1, fl: 0, fade: 0.6 });
    }
    st.landAt = t;
  }
  function sniff(t) {
    const B = RX.bakery; const dx = B.x - c.x; const dz = B.z - c.z; const d = Math.hypot(dx, dz);
    const dur = 2.4 + Math.min(1.8, d * 0.07);
    for (let i = 0; i < n(11); i++) {
      const dl = 0.1 * i; const wob = 0.4 * Math.sin(i * 2.3);
      if (d > 2.5) { const ux = dx / d; const uz = dz / d; take(0, t + dl, dur + dl, { x: c.x + ux * 0.5 - uz * wob * 0.3, y: c.y + 0.45, z: c.z + uz * 0.5 + ux * wob * 0.3, vx: (dx - ux * 0.5) / dur, vz: (dz - uz * 0.5) / dur, vy: (B.y - c.y - 0.45) / dur + 0.2 * Math.sin(i), rgb: i % 2 ? [1, 0.8, 0.35] : [1, 0.55, 0.45], g: 1, fl: 0.7, fw: 11, fade: 0.7 }); }
      else take(0, t + dl, 2.2, { mode: 1, a0: i * 0.9, spin: 0.9, r0: 0.5, r1: 0.9, y0: c.y + 0.3, y1: c.y + 1.7, dur: 2, rgb: [1, 0.8, 0.4], g: 1, fl: 0.7, fw: 11, fade: 0.8 });
    }
    say(t, 0.3, 'chime', 20 + st.counts.sniff, 1.5);
  }
  function sit(t) {
    for (let i = 0; i < n(14); i++) { // fireflies gather to her, slow, and dust motes with them
      const mote = i >= n(9);
      take(0, t + 0.15 * i, 8, { mode: 1, a0: h(50 + i) * TAU, spin: (mote ? 0.3 : 0.55) * (i % 2 ? 1 : -1), r0: 4.5 + h(51 + i), r1: 0.7 + 0.5 * h(52 + i), y0: c.y + 1.8 + 0.4 * i * 0.2, y1: c.y + 0.7 + 0.5 * h(53 + i), dur: 3 + 0.2 * i, bob: 0.08, rgb: mote ? [0.8, 0.75, 0.6] : [0.85, 1, 0.35], g: mote ? 0.6 : 1, fl: mote ? 0.2 : 0.5, fw: mote ? 3 : 5, fade: 1.4 });
    }
    take(1, t + 0.4, 10, { mode: 1, a0: 0.6, spin: 0.15, r0: 0.45, r1: 0.06, y0: c.y + 3.2, y1: c.y + 0.5, dur: 4.2, bob: 0.02, rgb: LEAF[(st.counts.sit + 1) % 4], g: 1, fl: 0, fade: 1.5 }); // a leaf comes down and lands on her back
  }
  function trail(t) { // the zoomies' wake: leaves caught up and whirling where she has been
    const cnt = n(3);
    for (let i = 0; i < cnt; i++) take(1, t, 1.5, { mode: 3, x: c.x, z: c.z, a0: h(60 + i) * TAU, spin: 7 * (i % 2 ? 1 : -1), r0: 0.3, r1: 0.95, y0: c.y + 0.15, vy: 1.5 + h(61 + i), dur: 1.5, rgb: LEAF[(i + (st.zoomT | 0)) % 4], g: 1, fl: 0, fade: 0.4 });
  }

  /** One frame. cat = { x, y, z }, session = the walk's session or null, fwd = the camera's direction (or null). */
  function step(dt, t, cat, session, fwd = null) {
    if (!cat) return;
    if (fwd && (fwd.x || fwd.z)) c.fa = Math.atan2(fwd.z, fwd.x);
    c.x = cat.x; c.z = cat.z; c.y = Number.isFinite(cat.y) ? cat.y : 0;
    while (queue.length && queue[0].at <= t) { const q = queue.shift(); try { voice[q.fn](q.k, q.v); } catch { /* the walk's audio only, and optional */ } }
    queue.sort((a, b) => a.at - b.at);
    if (st.meowed) { st.meowed = false; if (ready('meow', t)) meow(t, motion); }
    if (st.landed) { st.landed = false; if (ready('land', t) && motion) land(t); }
    if (session) {
      const pt = +session.pounceTime || 0; if (pt > 0 && st.prevPounce <= 0 && ready('pounce', t) && motion) { leaves(t, n(5), 0.7); st.landAt = t; } st.prevPounce = pt;
      const sn = +session.sniffTime || 0; if (sn > 0.01 && st.prevSniff <= 0.01 && ready('sniff', t) && motion) sniff(t); st.prevSniff = sn;
      const idle = +session.idleTime || 0;
      if (idle < 0.5 || session.perched) st.armedSit = !session.perched; else if (idle >= RX.still && st.armedSit && ready('sit', t)) { st.armedSit = false; if (motion) sit(t); }
      const z = !!session.wasZooming;
      if (z && !st.zoomOn && ready('zoom', t)) { st.zoomOn = true; st.zoomT = 0; st.nextTrail = t; }
      if (!z) st.zoomOn = false;
      if (st.zoomOn) { st.zoomT += dt; st.zoomUntil = t + 0.6; if (st.zoomT > 4) st.zoomOn = false; else if (t >= st.nextTrail && motion) { trail(t); st.nextTrail = t + 0.1; } }
    }
    if (sky && sky.fx && motion) { // the shader's numbers (the glow's sky takes the larger of these and its own, and holds them still under reduced motion)
      const ma = t - st.meowAt; const la = t - st.landAt; const zk = st.zoomOn ? 1 : sstep((st.zoomUntil - t) / 0.6);
      fxo.flare = ma >= 0 && ma < 2.6 ? Math.min(1, ma / 0.12) * Math.exp(-Math.max(0, ma - 0.12) * 1.5) : 0;
      fxo.sway = Math.max(ma >= 0 && ma < 3 ? 0.6 * Math.exp(-ma * 1.1) : 0, 0.4 * zk);
      fxo.shake = Math.max(ma >= 0 && ma < 1.6 ? 0.85 * Math.exp(-ma * 1.6) : 0, la >= 0 && la < 1.2 ? 0.7 * (1 - la / 1.2) : 0);
      fxo.flex = Math.max(la >= 0 && la < 1.4 ? 1.1 * Math.exp(-la * 2.4) : 0, zk * (nearBridge(c.x, c.z) ? 0.95 : 0.55) * (0.8 + 0.2 * Math.sin(t * 9)));
      Object.assign(sky.fx, fxo);
    }
  }
  /** One slot of pool `pool` at time t: fills out { x, y, z, g, rgb }. Pure. */
  function at(pool, i, t, out) {
    const p = pools[pool][i]; const age = t - p.t0; out.rgb = p.rgb; out.g = 0; out.x = c.x; out.z = c.z; out.y = -200;
    if (p.t0 < 0 || age < 0 || age > p.life) return out;
    if (p.mode === 0) { out.x = p.x + p.vx * age; out.z = p.z + p.vz * age; out.y = Math.max(p.floor, p.y + p.vy * age + 0.5 * p.ay * age * age); }
    else if (p.mode === 3) { const r = p.r0 + (p.r1 - p.r0) * sstep(age / p.dur); const a = p.a0 + p.spin * age; out.x = p.x + Math.cos(a) * r; out.z = p.z + Math.sin(a) * r; out.y = p.y0 + p.vy * age - 0.5 * age * age; }
    else { const u = sstep(age / p.dur); const r = p.r0 + (p.r1 - p.r0) * u; const a = p.a0 + p.spin * age; out.x = c.x + Math.cos(a) * r; out.z = c.z + Math.sin(a) * r; out.y = p.y0 + (p.y1 - p.y0) * u + p.bob * Math.sin(age * 3 + p.ph); }
    const env = Math.min(1, age / 0.15) * Math.min(1, (p.life - age) / p.fade);
    out.g = p.g * env * (1 - p.fl + p.fl * (0.5 + 0.5 * Math.sin(age * p.fw + p.ph)));
    return out;
  }
  const live = (t) => { let k = 0; const o = {}; for (let q = 0; q < 2; q++) for (let i = 0; i < pools[q].length; i++) { at(q, i, t, o); if (o.g > 0) k++; } return k; };
  return { step, at, live, sizes: [NG, NL], pools, state: st, queue, fx: fxo, meow() { st.meowed = true; }, land() { st.landed = true; } };
}
