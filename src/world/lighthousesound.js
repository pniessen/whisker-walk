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
export const MEW = Object.freeze({ gain: 0.05, f: 700, to: 1050, dur: 0.3 });
export const PURR = Object.freeze({ gain: 0.035, f: 48, dur: 1.6, tremolo: 22 });

export function createLighthouseSound(audio) {
  let dead = false;
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
  const gull = () => play((c, master, now) => { for (const p of GULL.parts) voice(c, master, { type: 'sawtooth', ...p, gain: GULL.gain, attack: 0.02, now }); });
  const mew = () => play((c, master, now) => voice(c, master, { type: 'triangle', ...MEW, now }));
  const purr = () => play((c, master, now) => voice(c, master, { type: 'sawtooth', f: PURR.f, dur: PURR.dur, gain: PURR.gain, attack: 0.2, tremolo: PURR.tremolo, now }));

  return { horn, bell, echo, gull, mew, purr, dispose() { dead = true; hush(); } };
}
