// =============================================================================
// LIGHTHOUSE POINT'S SOUNDS (milestone 2: the ship's horn; the bell, the echo and the gulls are
// milestone 3's). Chunk code, made per walk by world/lighthouselife.js with the walk's audio.
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

export function createLighthouseSound(audio) {
  let dead = false;
  const live = new Set();

  function hush() {
    for (const n of live) { try { n.stop?.(); n.disconnect?.(); } catch { /* already gone */ } }
    live.clear();
  }

  // horn() -> whether it sounded.
  function horn() {
    if (dead || !audio || audio.isMuted?.() !== false) return false;
    try {
      const c = audio.getContext();
      if (!c || c.state === 'suspended' || c.state === 'closed') return false;
      const master = audio.getMaster();
      const now = c.currentTime;
      for (const toot of HORN.toots) {
        for (const [mul, gainMul] of [[1, 1], [HORN.fifth, HORN.fifthGain]]) {
          const osc = c.createOscillator();
          const g = c.createGain();
          osc.type = 'triangle';
          const t0 = now + toot.at;
          osc.frequency.setValueAtTime(toot.f * mul, t0);
          osc.frequency.linearRampToValueAtTime(toot.to * mul, t0 + toot.dur);
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(HORN.gain * gainMul, t0 + HORN.attack);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + toot.dur);
          osc.connect(g).connect(master);
          osc.start(t0);
          osc.stop(t0 + toot.dur + 0.05);
          live.add(osc);
          osc.onended = () => { live.delete(osc); try { osc.disconnect(); g.disconnect(); } catch { /* gone */ } };
        }
      }
      return true;
    } catch {
      dead = true;
      return false;
    }
  }

  return { horn, dispose() { dead = true; hush(); } };
}
