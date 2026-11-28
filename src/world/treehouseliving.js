// The Treehouse, beauty pass 5 (2026-11-28): living creatures and one daily rhythm. Squirrels on the bridge rails, a woodpecker, a snail, feeder birds, dragonflies, bats at dusk and a morning mist,
// all pooled Points (no mesh, no triangle); the real clock sets lamps, shafts, dapple, fireflies and chime pitch; sound beds cross-fade with her height. Reduced motion draws one still frame.
import * as THREE from 'three';
import * as P from './treehouseplan.js';
import { createWeather } from './treehouseweather.js';

export const WIND = Object.freeze({ x: 0.8, z: 0.6 }); // the one wind: leaves, canopy gusts (treehouseglow.js), mist and the pennants' lean all agree
const bump = (h, c, w) => Math.max(0, 1 - Math.abs(h - c) / w);
const sm = (u) => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const fr = (v) => v - Math.floor(v);
/** The day's four weights {dawn, noon, gold, night} for an hour 0..24 (pure). */
export function rhythm(hour, out = {}) {
  const h = ((hour % 24) + 24) % 24;
  out.dawn = bump(h, 7, 2.2); out.noon = bump(h, 12.5, 3.6); out.gold = bump(h, 17.6, 2.2);
  out.night = h >= 12 ? sm((h - 19) / 2.5) : sm((5.6 - h) / 1.6);
  out.pitch = 1 - 0.1 * out.gold - 0.25 * out.night; // chimes sound warmer and lower as the day goes down
  return out;
}
export const hourOf = (c) => { if (c.hour != null) return c.hour; if (c.dusk) return 19; const n = typeof c.now === 'function' ? c.now() : c.now; const d = n instanceof Date && Number.isFinite(n.getTime()) ? n : new Date(); return d.getHours() + d.getMinutes() / 60; };

const along = (line, p, off, out) => { // a point p (0..1) along a bridge line, off metres to its side, on the rail's top
  let len = 0; for (let i = 0; i + 1 < line.length; i++) len += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].z - line[i].z);
  let d = p * len;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]; const b = line[i + 1]; const s = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= s || i + 2 === line.length) { const u = Math.min(1, d / s); out.x = a.x + (b.x - a.x) * u - (b.z - a.z) / s * off; out.z = a.z + (b.z - a.z) * u + (b.x - a.x) / s * off; out.y = a.y + (b.y - a.y) * u + P.RAIL_H + 0.03; return out; }
    d -= s;
  }
  return out;
};
const D = P.deckOf;
const FEED = (() => { const k = D('far'); return { x: k.x + k.w / 2 - 0.5, y: k.y + P.RAIL_H + 0.06, z: k.z - k.d / 2 + 0.05 }; })();
const WOOD = { x: -0.7, y: 3.4, z: P.OAK.z + P.OAK.r + 0.1 }; // the woodpecker's trunk

/** createLiving(ctx, env) -> { flyK, update(dt, t, catPos), dispose() }. env: { dotTexture, hash01, season, reducedMotion, rung }. */
export function createLiving(ctx, env) {
  const { scene, audio = null } = ctx; const { hash01, rung, reducedMotion: still } = env; const lite = rung === 'lite'; const high = rung === 'high';
  const rh = rhythm(0); const out = {}; const ears = { hear: -1 }; // pass 8: the squirrels sit up and listen when she calls (set by treehousereact.js)
  const NS = 4 + 2 + 2 + 1 + (lite ? 0 : 2) + (high ? 8 : 0); // squirrels, woodpecker, snail, bridge-rail gap, feeder, feeder birds, bats, dragonflies
  const pos = new Float32Array(NS * 3); const col = new Float32Array(NS * 3);
  const mk = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); return g; };
  const geo = mk(pos); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const crit = new THREE.Points(geo, new THREE.PointsMaterial({ map: env.dotTexture(), alphaTest: 0.1, size: 0.5, sizeAttenuation: true, vertexColors: true, depthWrite: false, fog: true }));
  const mist = new THREE.Points(mk(new Float32Array(lite ? 3 : 21)), new THREE.PointsMaterial({ map: env.dotTexture(), size: 9, sizeAttenuation: true, color: 0xf2f4ee, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  const mp = mist.geometry.attributes.position.array;
  for (const o of [crit, mist]) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; Object.assign(o.userData, { noMerge: true, noCast: true, noContactShadow: true }); scene.add(o); }
  crit.name = 'treehouse:creatures'; mist.name = 'treehouse:mist'; mist.visible = false;
  const C = new THREE.Color();
  let n = 0;
  const put = (x, y, z, hex) => { pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z; if (hex != null) { C.set(hex); col[n * 3] = C.r; col[n * 3 + 1] = C.g; col[n * 3 + 2] = C.b; } n++; };
  const away = (hex) => put(0, -200, 0, hex);
  const dayOn = () => (still ? true : rh.night < 0.5);
  const sky = scene.getObjectByName('treehouse:leaves')?.material?.userData?.sky ?? null;
  const shafts = scene.getObjectByName('treehouse:shafts') ?? null; const shaftBase = shafts?.material?.opacity ?? 0.2;
  const dapple = scene.getObjectByName('treehouse:dapple') ?? null; const dapBase = dapple?.material?.opacity ?? 0.2;
  const out2 = { flyK: 1, pitch: 1 };
  const wx = createWeather(ctx, { hash01, rung, reducedMotion: still, dotTexture: env.dotTexture, sky, wind: WIND, aud: () => aud(), blip: (...a) => blip(...a) }); // beauty pass 6: rain, misty dawn, golden hour and the storm wind (treehouseweather.js)
  let lampBase = 1; let shaftNow = shaftBase;

  function draw(t) {
    n = 0; const day = dayOn();
    for (let i = 0; i < 2; i++) { // squirrels run the bridge rails in hops and freeze, tail up
      if (!day) { away(); away(); continue; }
      const m = fr(t / (15 + 5 * i) + hash01(i, 501)) * 8; const k = Math.floor(m); const f = fr(m);
      const raw = (k + sm(f * 1.7)) / 8; const p = raw < 0.5 ? raw * 2 : 2 - raw * 2; const dir = raw < 0.5 ? 1 : -1; const up = t < ears.hear; const moving = f * 1.7 < 1 && !up;
      along(P.BRIDGE_LINES[i], 0.04 + 0.92 * p, 0.55 * (i ? -1 : 1), out); const hop = moving ? 0.05 * Math.abs(Math.sin(t * 11 + i)) : 0;
      put(out.x, out.y + 0.07 + hop + (up ? 0.03 : 0), out.z, 0x8a5a38);
      put(out.x - dir * (i ? -0.1 : 0.1), out.y + 0.17 + hop + (moving ? 0 : 0.04) + (up ? 0.09 : 0), out.z, 0xc99a68); // (pass 8: after her meow they sit up tall)
    }
    if (day) { const c = fr(t / 9) < 0.18; const tap = c ? 0.035 * Math.sin(t * 60) : 0; put(WOOD.x, WOOD.y, WOOD.z + tap, 0x2c2a38); put(WOOD.x, WOOD.y + 0.09, WOOD.z + tap, 0xd8382a); } else { away(); away(); }
    { const k = D('bakery'); const p = fr(t / 380 + 0.2); const z = k.z - k.d / 2 + 0.1 + (k.d - 0.2) * p; const y = k.y + P.RAIL_H + 0.05; // a snail on the Bakery's west rail
      if (still || rh.night < 0.7) { put(k.x - k.w / 2, y, z, 0xd8c8a0); put(k.x - k.w / 2, y + 0.06, z - 0.02, 0xa8602c); } else { away(); away(); } }
    put(FEED.x, FEED.y, FEED.z, 0x8a6240);
    if (!lite) for (let i = 0; i < 2; i++) { // feeder birds drop in, feed and leave
      const c = fr(t / (21 + 7 * i) + hash01(i, 511)); const a = sm(c / 0.1) - sm((c - 0.4) / 0.1);
      if (!(a > 0.01) || !day) { away(); continue; }
      const k = 1 - a; const s = i ? 1 : -1;
      put(FEED.x - 0.12 * i + s * 5 * k, FEED.y + 0.04 + 2.8 * k * (1 - k) * 2, FEED.z + 3 * k, i ? 0xf0c040 : 0x7aa0d0);
    }
    if (high) {
      const bat = still ? 0 : Math.max(rh.night, rh.gold * 0.8);
      for (let i = 0; i < 4; i++) { // bats over the clearing against the dusk sky, flickering as they flap
        if (bat < 0.25) { away(0x15101c); away(0x15101c); continue; }
        const a = t * (0.5 + 0.08 * i) + i * 1.7; const w = 0.2 * Math.sin(t * 22 + i);
        for (const d of [0.2, -0.2]) put(P.OAK.x + Math.cos(a) * (12 + 2 * i) - d * Math.sin(a), 8.5 + 1.4 * Math.sin(a * 1.9 + i) + w * d * 5, P.OAK.z + Math.sin(a) * (10 + 2 * i) + d * Math.cos(a), 0x15101c);
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    if (!lite) { for (let i = 0; i < 7; i++) { const a = t * 0.35 + i * 9.1; const u = fr(a / 40 + hash01(i, 521)); mp[i * 3] = -18 + 36 * u + 2 * Math.sin(a); mp[i * 3 + 1] = 1.2 + 0.4 * Math.sin(a * 0.7); mp[i * 3 + 2] = -4 + 30 * fr(u * 0.7 + hash01(i, 522)); } mist.geometry.attributes.position.needsUpdate = true; }
  }

  // ---- sound ----
  const aud = () => { if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return null; const c = audio.getContext(); return c && c.createBuffer && c.createBufferSource && c.createBiquadFilter && c.createOscillator ? c : null; };
  let bed = null; let lastBed = -9; let tapAt = -1; let chirpAt = 12;
  function makeBed(ac) {
    const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = buf.getChannelData(0); let s = 20261129;
    for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const mk2 = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; const g = ac.createGain(); g.gain.value = 0; src.connect(b); b.connect(g); g.connect(audio.getMaster?.() ?? ac.destination); return g; };
    const up = mk2('bandpass', 480, 0.5); const low = mk2('lowpass', 260, 0.7); const rain = mk2('bandpass', 2800, 0.5);
    const cr = ac.createOscillator(); cr.type = 'sine'; cr.frequency.value = 4300; const lfo = ac.createOscillator(); lfo.frequency.value = 11; const lg = ac.createGain(); lg.gain.value = 0.5; const am = ac.createGain(); am.gain.value = 0.5; const cg = ac.createGain(); cg.gain.value = 0;
    lfo.connect(lg); lg.connect(am.gain); cr.connect(am); am.connect(cg); cg.connect(audio.getMaster?.() ?? ac.destination);
    src.start(); cr.start(); lfo.start();
    return { src, cr, lfo, up, low, cg, rain };
  }
  function beds(t, y) { // winds in the canopy up high, the forest floor (rustle, crickets) below; her height decides, smoothly
    const ac = aud();
    if (!ac) { if (bed) { for (const g of [bed.up, bed.low, bed.cg, bed.rain]) g.gain.setTargetAtTime(0, ac?.currentTime ?? 0, 0.3); } return; }
    bed ??= makeBed(ac);
    const hk = sm(((Number.isFinite(y) ? y : 0) - 1.2) / 6); const now = ac.currentTime; const gust = 0.65 + 0.35 * Math.sin(t * 0.31);
    const wo = wx.state; bed.rain.gain.setTargetAtTime(0.011 * wo.rain * (0.4 + 0.6 * hk), now, 0.6); bed.up.gain.setTargetAtTime(0.011 * (hk * gust * (1 + 2 * wo.storm) + 1.5 * wo.storm + 0.4 * wo.rain), now, 0.8); bed.low.gain.setTargetAtTime(0.01 * (1 - hk) * (0.5 + 0.5 * rh.noon), now, 0.8); bed.cg.gain.setTargetAtTime(0.0035 * (1 - 0.6 * hk) * Math.min(1, rh.night + rh.gold * 0.5), now, 1.2);
  }
  function blip(f, at, dur, gain) { const ac = aud(); if (!ac) return; const o = ac.createOscillator(); const g = ac.createGain(); const w = ac.currentTime + at; o.type = 'sine'; o.frequency.setValueAtTime(f, w); o.frequency.exponentialRampToValueAtTime(f * 1.35, w + dur); g.gain.setValueAtTime(0.0001, w); g.gain.exponentialRampToValueAtTime(gain, w + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, w + dur); o.connect(g); g.connect(audio.getMaster?.() ?? ac.destination); o.start(w); o.stop(w + dur + 0.02); }

  let lastClock = -99;
  function clock() {
    rhythm(hourOf(ctx), rh);
    out2.pitch = rh.pitch; out2.flyK = 0.12 + 0.88 * Math.min(1, rh.night + rh.gold * 0.5);
    lampBase = 0.5 + 0.4 * rh.gold + 0.95 * rh.night + 0.1 * rh.dawn;
    shaftNow = shaftBase * (0.15 + 0.85 * Math.min(1, rh.noon + 0.5 * rh.dawn + 0.7 * rh.gold)) * (1 - 0.7 * rh.night);
    if (dapple?.material) dapple.material.opacity = dapBase * (0.45 + 0.8 * rh.noon) * (1 - 0.6 * rh.night);
    mist.visible = !lite && rh.dawn > 0.03; mist.material.opacity = 0.32 * rh.dawn;
  }
  clock(); draw(0);
  return {
    ears,
    get flyK() { return out2.flyK; },
    get pitch() { return out2.pitch; },
    get stormK() { return wx.stormK; },
    update(dt, t, catPos) {
      if (t - lastClock > 5 || lastClock < 0) { lastClock = t; clock(); }
      wx.update(t, catPos, rh, sm(((catPos && Number.isFinite(catPos.y) ? catPos.y : 0) - 1.2) / 6));
      if (sky) sky.lampK = lampBase * wx.lampK;
      if (shafts?.material) shafts.material.opacity = Math.min(0.34, shaftNow * wx.shaftK);
      if (shafts?.material?.color) shafts.material.color.setRGB(1, 1 - 0.14 * wx.state.gold, 1 - 0.42 * wx.state.gold); // the golden hour's shafts run warm
      if (!still) draw(t);
      if (catPos) beds(t, catPos.y);
      if (still || !catPos) return;
      const near = Math.hypot(catPos.x - WOOD.x, catPos.z - WOOD.z) < 24;
      const c = fr(t / 9); if (near && rh.night < 0.5 && c < 0.18 && t - tapAt > 6) { tapAt = t; for (let i = 0; i < 6; i++) blip(1700, i * 0.11, 0.05, 0.01); }
      if (t > chirpAt && rh.dawn > 0.3 && rh.night < 0.5 && wx.state.rain < 0.3) { const vs = 1 + Math.floor(wx.state.mist * 5); chirpAt = t + 2.4 + 2 * hash01(Math.floor(t), 531); const f = 1700 + 280 * Math.floor(hash01(Math.floor(t), 532) * vs); for (let i = 0; i < 3; i++) blip(f + 90 * i, i * 0.13, 0.09, 0.008); } // the dawn chorus: one more bird joins as the mist thickens
    },
    dispose() {
      wx.dispose(); scene.remove(crit, mist); geo.dispose(); crit.material.dispose(); mist.geometry.dispose(); mist.material.dispose();
      if (bed) { for (const o of [bed.src, bed.cr, bed.lfo]) { try { o.stop(); o.disconnect(); } catch { /* gone */ } } for (const g of [bed.up, bed.low, bed.cg, bed.rain]) { try { g.disconnect(); } catch { /* gone */ } } bed = null; }
      if (sky) sky.lampK = 1; // (the shafts and the dapple go with the area)
    },
  };
}
