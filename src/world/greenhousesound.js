// =============================================================================
// THE GREENHOUSE'S SOUNDS (milestone G5). Chunk code, made per walk by greenhouselife.js when the walk hands it the
// game's audio; update(dt, catPos, ctx) every frame, dispose() at the walk's end. audio.js's 'greenhouse' ambience already
// holds the wind, the water lap, the birdsong wash and the rain wash; these are the near, placed sounds on top of it:
//   * DRIPS under glass (in a house: every 1.6 to 4.2 s, one soft falling plink);
//   * THE TRICKLE by the fountain court (within TRICKLE.ear of it: a few tiny plinks, every 0.2 to 0.5 s, fading with distance);
//   * BIRDS in the garden (out of the glass, by day and not in rain: a two-note chirp every 5 to 11 s, heard within EAR);
//   * THE RAIN PATTER (sheltered under glass while it rains: tiny ticks on the panes, every 0.08 to 0.2 s).
// Every sound is one or two oscillators through their own gain envelope into the game's master (audio.getMaster()), so the
// volume setting is the master's. Nothing is made and the context is never asked for until a sound is due and heard.
// MUTED: while audio.isMuted?.() is anything but false nothing plays and the context is never asked for (an audio without
// isMuted, a stub, is silent). The clocks run on while muted, so unmuting brings no burst. A suspended or closed context
// plays nothing; a context that throws silences the rest of the walk. Sound is not motion, so reduced motion changes nothing
// here except that the patter is sparser (half as many ticks). Timing is by hash01 streams of GH_SOUND_SALT, never a random
// number or a clock.
// =============================================================================
import { hash01 } from './warehouselook.js';
import { loudness } from './roofssound.js';
import * as P from './greenhouseplan.js';

export const GH_SOUND_SALT = 0x6e5e0; // the four streams below add their own offset (all distinct from every other salt)
export const STREAM = Object.freeze({ drip: 0, trickle: 1, bird: 2, rain: 3 });
export const EVERY = Object.freeze({ drip: [1.6, 4.2], trickle: [0.2, 0.5], bird: [5, 11], rain: [0.08, 0.2] });
export const GAIN = Object.freeze({ drip: 0.02, trickle: 0.012, bird: 0.02, rain: 0.006 });
export const TRICKLE = Object.freeze({ ear: 9 });
export const BIRD_EAR = 22;
const QUIET = 0.0003;
const FLOOR = 0.0001;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createGreenhouseSound(audio, { weather = null, dusk = false, reducedMotion = false } = {}) {
  let ac = null;
  let master = null;
  let broken = false;
  let disposed = false;
  const live = new Set();
  const count = { drip: 0, trickle: 0, bird: 0, rain: 0 };
  const due = { drip: 0, trickle: 0, bird: 0, rain: 0 };
  let walk = 0;

  const gap = (k) => {
    const [a, b] = EVERY[k];
    const g = a + (b - a) * hash01(count[k], 1, GH_SOUND_SALT + STREAM[k]);
    return k === 'rain' && reducedMotion ? g * 2 : g;
  };
  for (const k of Object.keys(due)) due[k] = gap(k) * hash01(0, 2, GH_SOUND_SALT + STREAM[k]);
  const muted = () => audio?.isMuted?.() !== false;

  function hush() {
    for (const o of live) { try { o.stop?.(); o.disconnect?.(); } catch { /* already gone */ } }
    live.clear();
  }
  function bus() {
    if (broken || disposed) return null;
    if (!ac) {
      try {
        ac = audio.getContext() ?? null;
        master = ac ? audio.getMaster() ?? null : null;
      } catch { broken = true; ac = null; return null; }
    }
    if (!ac || !master || ac.state === 'suspended' || ac.state === 'closed') return null;
    return ac;
  }
  // one plink: a sine sliding f -> to over dur, a quick rise and a fall
  function plink(c, f, to, at, dur, amp) {
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.linearRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    live.add(osc);
    osc.onended = () => { live.delete(osc); try { osc.disconnect(); g.disconnect(); } catch { /* gone */ } };
  }
  function make(k, level) {
    const c = bus();
    if (!c || level * GAIN[k] < QUIET) return false;
    const amp = GAIN[k] * level;
    const h = hash01(count[k], 3, GH_SOUND_SALT + STREAM[k]);
    try {
      if (k === 'drip') plink(c, 1500 + 700 * h, 700 + 200 * h, 0, 0.11, amp);
      else if (k === 'trickle') { for (let i = 0; i < 3; i++) plink(c, 1800 + 1400 * hash01(count[k], 5 + i, GH_SOUND_SALT + STREAM[k]), 1200, i * 0.045, 0.04, amp); }
      else if (k === 'bird') { const f = 2800 + 700 * h; plink(c, f, f + 700, 0, 0.07, amp); plink(c, f + 100, f + 800, 0.11, 0.07, amp); }
      else plink(c, 4200 + 1800 * h, 3000, 0, 0.012, amp);
    } catch { broken = true; return false; }
    return true;
  }

  // which of the four are wanted now, and how loudly (0: not at all)
  function level(k, catPos, under, raining) {
    if (k === 'drip') return under && !raining ? 1 : 0;
    if (k === 'rain') return under && raining ? 1 : 0;
    if (k === 'trickle') return under ? 0 : loudness(dist(catPos, P.FOUNTAIN), TRICKLE.ear);
    let best = 0;
    if (!under && !raining && !dusk) for (const [x, z] of P.BIRD_SPOTS) best = Math.max(best, loudness(dist(catPos, { x, z }), BIRD_EAR));
    return best;
  }

  return {
    update(dt, catPos, under = false) {
      if (disposed || !audio || !catPos) return;
      walk += dt > 0 ? dt : 0;
      const quiet = muted();
      if (quiet) hush();
      const raining = !!weather?.isRaining?.();
      for (const k of Object.keys(due)) {
        if (walk < due[k]) continue;
        const l = quiet ? 0 : level(k, catPos, under, raining);
        if (l > 0) make(k, l);
        count[k]++; // a call that falls out of earshot or while muted is skipped and counted: the schedule is the same
        due[k] = walk + gap(k);
      }
    },
    dispose() { disposed = true; hush(); },
  };
}
