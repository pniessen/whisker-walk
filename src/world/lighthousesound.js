// =============================================================================
// LIGHTHOUSE POINT'S SOUNDS (milestone 2: the ship's horn; milestone 3: the fog bell, the cave's echo, a gull's
// call, the kitten's mew and the keeper's cat's purr). Chunk code, made per walk by world/lighthouselife.js with
// the walk's audio.
//
// SYNTHESISED HERE, on the game's own AudioContext (audio.getContext()) into its master
// (audio.getMaster()), so the volume setting is the master's: a few oscillators through a gain
// envelope each. Nothing is made, and the context is never asked for, until a call is due.
// MUTED: while audio.isMuted?.() is anything but false nothing plays and the context is never asked
// for (an audio without isMuted, a stub, is silent). A suspended or closed context plays nothing
// (its clock stands still, so it would all sound at once when it woke). Where asking for the context
// or making a node throws, the rest of the walk is silent. No randomness and no clock.
//
// THE HORN: a far ship answers the lamp. Two soft low toots (a triangle and a fifth above it, 98 Hz
// and 147 Hz, each sagging a little as a horn does), 0.9 s and 1.3 s long, 1.5 s apart: far away, so
// quiet (gain 0.05 before the master), and brief (under 3 s in all).
//
// THE REST are as brief and as soft: the BELL is one struck note (392 Hz and two inharmonic partials, each a sine,
// ringing out over 2.6 s at gain 0.06); the ECHO is her call given back three times, a rising mew glide each
// time, each quieter and later (0.5 s, 1.0 s, 1.5 s: 0.04, 0.025, 0.014); the GULL a two-part cry (a falling
// glide, then a rising one, 0.45 s, gain 0.035); the MEW a rising glide 0.3 s (gain 0.05); the PURR a low sawtooth
// under a 22 Hz tremolo for 1.6 s (gain 0.035). Every call is its own function and each one is silent while muted.
// =============================================================================

import { createCaps } from './lighthousecaps.js';
export const HORN = Object.freeze({
  gain: 0.05,
  toots: Object.freeze([
    Object.freeze({ at: 0, dur: 0.9, f: 98, to: 92 }),
    Object.freeze({ at: 1.5, dur: 1.3, f: 98, to: 86 }),
  ]),
  fifth: 1.5,
  fifthGain: 0.5,
  attack: 0.12,
});

export const BELL = Object.freeze({ gain: 0.06, f: 392, dur: 2.6, partials: Object.freeze([[1, 1], [2.76, 0.45], [5.4, 0.2]]), attack: 0.01 });
export const ECHO = Object.freeze({ delays: Object.freeze([0.5, 1.0, 1.5]), gains: Object.freeze([0.04, 0.025, 0.014]), f: 520, to: 760, dur: 0.3 });
export const GULL = Object.freeze({ gain: 0.035, parts: Object.freeze([Object.freeze({ at: 0, dur: 0.22, f: 1500, to: 1000 }), Object.freeze({ at: 0.24, dur: 0.22, f: 1000, to: 1400 })]) });
export const SURF = Object.freeze({ gain: 0.03, rise: 2.1, dur: 5.2, from: 240, to: 520 });
export const MEW = Object.freeze({ gain: 0.05, f: 700, to: 1050, dur: 0.3 });
// pass five: the sound beds (always faint, cross-faded by where she stands: surf at the shore, wind up at the tower and on the plateau, a creak of
// rope and wood at the quay and the harbour post, a gull now and then over the cliffs). A bed never starts while muted or before the context runs.
export const BEDS = Object.freeze({ surf: 0.016, wind: 0.011, creak: 0.007, shore: Object.freeze({ east: 36, west: -40 }), tower: Object.freeze({ x: -22, z: -20 }), quays: Object.freeze([[35, -12], [35, 21], [11.6, 32.6]]), glide: 0.9 });
export const PURR = Object.freeze({ gain: 0.035, f: 48, dur: 1.6, tremolo: 22 });

export function createLighthouseSound(audio) {
  let dead = false;
  const caps = createCaps(); // beauty pass 10: the shared glow budget, event rule and four-accent cap (lighthousecaps.js)
  // a transient accent (gull, seal, chime, swell) takes one of four slots on the audio clock, or is skipped; a stub clock or a muted walk passes straight through
  const accent = (dur, fn) => { try { const now = audio?.isMuted?.() === false ? audio.getContext?.()?.currentTime : undefined; if (Number.isFinite(now) && !caps.slot(now, dur)) return false; } catch { /* optional */ } return fn(); };
  const live = new Set();

  function hush() {
    for (const n of live) { try { n.stop?.(); n.disconnect?.(); } catch { /* already gone */ } }
    live.clear();
  }

  // The one place a sound is made: `build(c, master, now)` makes the nodes (and returns them to be stopped), or
  // nothing when it is muted, the context is not running, or anything throws (the rest of the walk is then silent).
  function play(build) {
    if (dead || !audio || audio.isMuted?.() !== false) return false;
    try {
      const c = audio.getContext();
      if (!c || c.state === 'suspended' || c.state === 'closed') return false;
      build(c, audio.getMaster(), c.currentTime);
      return true;
    } catch {
      dead = true;
      return false;
    }
  }

  // one oscillator through its own gain, a rise and a fall, into the master
  function voice(c, master, { type = 'sine', f, to = f, at = 0, dur, gain, attack = 0.03, now, tremolo = 0 }) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const t0 = now + at;
    osc.frequency.setValueAtTime(f, t0);
    if (to !== f) osc.frequency.linearRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    live.add(osc);
    const extra = [];
    if (tremolo) { // the purr: a slow wobble in the volume
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.setValueAtTime(tremolo, t0);
      depth.gain.setValueAtTime(gain * 0.6, t0);
      lfo.connect(depth).connect(g.gain);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
      live.add(lfo);
      extra.push(lfo, depth);
    }
    osc.onended = () => { live.delete(osc); for (const n of extra) { live.delete(n); try { n.disconnect(); } catch { /* gone */ } } try { osc.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }

  // each returns whether it sounded
  function horn() {
    return play((c, master, now) => {
      for (const toot of HORN.toots) {
        for (const [mul, gainMul] of [[1, 1], [HORN.fifth, HORN.fifthGain]]) {
          voice(c, master, { type: 'triangle', f: toot.f * mul, to: toot.to * mul, at: toot.at, dur: toot.dur, gain: HORN.gain * gainMul, attack: HORN.attack, now });
        }
      }
    });
  }
  const bell = () => play((c, master, now) => { for (const [mul, k] of BELL.partials) voice(c, master, { f: BELL.f * mul, dur: BELL.dur / (1 + (mul - 1) * 0.25), gain: BELL.gain * k, attack: BELL.attack, now }); });
  const echo = () => play((c, master, now) => { ECHO.delays.forEach((d, i) => voice(c, master, { type: 'triangle', f: ECHO.f, to: ECHO.to, at: d, dur: ECHO.dur, gain: ECHO.gains[i], now })); });
  let hushGulls = false; // fog: the gulls fall silent (lighthouseweather.js)
  const gull = () => !hushGulls && accent(1.1, () => play((c, master, now) => { for (const p of GULL.parts) voice(c, master, { type: 'sawtooth', ...p, gain: GULL.gain, attack: 0.02, now }); }));
  // a swell of surf as a foam row lands (lighthousealive.js times it): deterministic noise (a small LCG, never Math.random) through a
  // low-pass that opens as the wave comes in and closes as it drains; k (0..1) is how near she is to the water
  const surf = (k = 1) => accent(SURF.dur, () => play((c, master, now) => {
    if (typeof c.createBuffer !== 'function' || typeof c.createBufferSource !== 'function' || typeof c.createBiquadFilter !== 'function') return; // (a context without noise nodes: this swell is skipped, the walk's other sounds are not silenced)
    const n = Math.floor(c.sampleRate * 1.5);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 20261128;
    for (let i = 0; i < n; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(SURF.from, now);
    lp.frequency.linearRampToValueAtTime(SURF.to, now + SURF.rise);
    lp.frequency.linearRampToValueAtTime(SURF.from, now + SURF.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(SURF.gain * k, now + SURF.rise);
    g.gain.exponentialRampToValueAtTime(0.001, now + SURF.dur);
    src.connect(lp).connect(g).connect(master);
    src.start(now); src.stop(now + SURF.dur + 0.05);
    live.add(src);
    src.onended = () => { live.delete(src); try { src.disconnect(); lp.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }));
  const mew = () => play((c, master, now) => voice(c, master, { type: 'triangle', ...MEW, now }));
  const purr = () => play((c, master, now) => voice(c, master, { type: 'sawtooth', f: PURR.f, dur: PURR.dur, gain: PURR.gain, attack: 0.2, tremolo: PURR.tremolo, now }));

  // ---- the beds: one looping noise, three filtered voices whose gains follow her position (setTargetAtTime: a smooth blend, never a jump)
  let stormK = 0; let fogK = 0; // the weather's (lighthouseweather.js): the wind bed rises into a howl in a storm
  // the ambient sounds (the beds, the arrival's call and wash) belong to the game's own audio only (it has playBuffer and setVolume); a bare stub never has them asked of it
  const ambient = typeof audio?.playBuffer === 'function' && typeof audio?.setVolume === 'function';
  let bed = null; let bedAcc = 0; let nextCliffGull = 6; let bedClock = 0;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  // [filter type, Hz, Q, gain, zone(cat) -> 0..1]: surf by the nearest shore, wind by height and the tower, creak by the quays and the post
  const ZONES = [
    ['lowpass', 380, 0.7, BEDS.surf, (c) => clamp01(1 - Math.max(0, Math.min(BEDS.shore.east - c.x, c.x - BEDS.shore.west)) / 40)],
    ['bandpass', 760, 0.6, BEDS.wind, (c) => clamp01(0.25 + 0.5 * clamp01(((c.y ?? 0) - 4) / 9) + 0.4 * clamp01(1 - Math.hypot(c.x - BEDS.tower.x, c.z - BEDS.tower.z) / 22))],
    ['bandpass', 250, 9, BEDS.creak, (c) => clamp01(1 - Math.min(...BEDS.quays.map(([x, z]) => Math.hypot(c.x - x, c.z - z))) / 14)],
  ];
  function makeBed() {
    const c = audio.getContext();
    if (!c || c.state === 'suspended' || c.state === 'closed' || typeof c.createBuffer !== 'function' || typeof c.createBufferSource !== 'function' || typeof c.createBiquadFilter !== 'function') return null;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 20261129;
    for (let i = 0; i < d.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const voices = ZONES.map(([type, f, q]) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g).connect(audio.getMaster()); return { fl, g }; });
    src.start(c.currentTime);
    live.add(src);
    return { c, voices };
  }
  // dt s; cat { x, y, z }: the gains ease toward her zone's values (setTargetAtTime: a smooth blend, never a jump)
  function beds(dt, cat) {
    if (dead || !ambient || !cat) return;
    bedAcc += dt > 0 ? dt : 0;
    if (bedAcc < 0.2) return;
    bedClock += bedAcc; bedAcc = 0;
    try {
      const on = audio.isMuted?.() === false;
      if (!bed && on) bed = makeBed();
      if (!bed) return;
      ZONES.forEach(([, , , gain, zone], i) => { const wxk = i === 1 ? 1 + 6 * stormK + 1.5 * fogK : i === 0 ? 1 + 2.2 * stormK : 1; bed.voices[i].g.gain.setTargetAtTime(on ? gain * zone(cat) * wxk : 0, bed.c.currentTime, BEDS.glide); if (i === 1) bed.voices[i].fl.frequency.setTargetAtTime?.(760 + 520 * stormK, bed.c.currentTime, 1.2); });
      if (on && cat.x < -4 && bedClock > nextCliffGull) { nextCliffGull = bedClock + 14 + 9 * ((bedClock * 7.31) % 1); gull(); } // (gulls over the cliffs, now and then)
    } catch { dead = true; }
  }

  // the golden moment's one soft chime (beauty pass 7): a bright fifth, two sines that ring and fade
  const chime = () => accent(1.9, () => play((c, master, now) => { [[784, 0], [1175, 0.16]].forEach(([f, at]) => voice(c, master, { f, at, dur: 1.7, gain: 0.022, attack: 0.02, now })); }));
  const weather = (storm = 0, fog = 0) => { stormK = storm; fogK = fog; };
  const quiet = (on) => { hushGulls = !!on; };
  return { caps, accent, weather, quiet, chime, horn, bell, echo, gull, surf, mew, purr, beds, ambient, dispose() { dead = true; hush(); bed = null; } };
}
