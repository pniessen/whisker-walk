// =============================================================================
// THE MOON'S SOUNDS (milestone 2): Pip's beeps, the cell's click and the base's power-up hum, synthesised on the game's own
// AudioContext into its master (the Lighthouse's way, world/lighthousesound.js): a few oscillators through a gain
// envelope each, nothing made and the context never asked for until a call is due, silent while muted, a suspended or closed
// context plays nothing, and anything that throws silences the rest of the walk. No randomness and no clock. The fanfare when the
// base wakes is the game's own (audio.fanfare), played by the life; the hum here goes under it.
// =============================================================================

export const BEEP = Object.freeze({ gain: 0.045, notes: Object.freeze([Object.freeze({ at: 0, f: 880, dur: 0.1 }), Object.freeze({ at: 0.13, f: 1320, dur: 0.14 })]) });
export const CHIRP = Object.freeze({ gain: 0.04, f: 600, to: 1500, dur: 0.22 });
export const CLICK = Object.freeze({ gain: 0.05, f: 300, to: 900, dur: 0.12, ping: 1568 });
export const HONK = Object.freeze({ gain: 0.05, notes: Object.freeze([Object.freeze({ at: 0, f: 330, dur: 0.16 }), Object.freeze({ at: 0.2, f: 262, dur: 0.22 })]) });
export const HUM = Object.freeze({ gain: 0.05, dur: 2.8, notes: Object.freeze([110, 165, 220, 330]) });

export function createMoonSound(audio) {
  let dead = false;
  const live = new Set();

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

  function voice(c, master, { type = 'sine', f, to = f, at = 0, dur, gain, attack = 0.02, now }) {
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
    osc.onended = () => { live.delete(osc); try { osc.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }

  return {
    beep: () => play((c, m, now) => { for (const n of BEEP.notes) voice(c, m, { type: 'square', ...n, gain: BEEP.gain, now }); }),
    chirp: () => play((c, m, now) => voice(c, m, { type: 'triangle', ...CHIRP, now })),
    click: () => play((c, m, now) => { voice(c, m, { type: 'triangle', f: CLICK.f, to: CLICK.to, dur: CLICK.dur, gain: CLICK.gain, now }); voice(c, m, { f: CLICK.ping, at: 0.1, dur: 0.5, gain: CLICK.gain * 0.5, now }); }),
    honk: () => play((c, m, now) => { for (const n of HONK.notes) voice(c, m, { type: 'square', ...n, gain: HONK.gain, now }); }),
    hum: () => play((c, m, now) => { HUM.notes.forEach((f, i) => voice(c, m, { type: 'sine', f, to: f * 1.01, at: i * 0.35, dur: HUM.dur - i * 0.35, gain: HUM.gain / (1 + i * 0.4), attack: 0.4, now })); }),
    dispose() {
      dead = true;
      for (const n of live) { try { n.stop?.(); n.disconnect?.(); } catch { /* already gone */ } }
      live.clear();
    },
  };
}
