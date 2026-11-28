// =============================================================================
// THE GREENHOUSE'S SOUNDS (milestone G5). Chunk code, made per walk by greenhouselife.js when the walk hands it the
// game's audio; update(dt, catPos, ctx) every frame, dispose() at the walk's end. audio.js's 'greenhouse' ambience already
// holds the wind, the water lap, the birdsong wash and the rain wash; these are the near, placed sounds on top of it:
//   * DRIPS under glass (in a house: every 1.6 to 4.2 s, one soft falling plink);
//   * THE TRICKLE by the fountain court (within TRICKLE.ear of it: a few tiny plinks, every 0.2 to 0.5 s, fading with distance);
//   * BIRDS in the garden (out of the glass, by day and not in rain: a two-note chirp every 5 to 11 s, heard within EAR);
//   * BEES (beauty pass 2: under glass, and in the garden near the catnip beds: a soft low drone that swells and fades, every 5 to 12 s);
//   * SOFT BIRDS under glass (beauty pass 2: the same two-note chirp, a third as loud, as if from the garden beyond the panes);
//   * THE BRUSH (beauty pass 3: while she walks through the beds, hedges and plants: a soft rustle of three tiny high ticks, every 0.25 to 0.5 s);
//   * CRICKETS (beauty pass 3: at dusk, dry weather: a quiet trill of fast ticks, every 2.2 to 4.6 s, out in the garden only);
//   * THE RAIN PATTER (sheltered under glass while it rains: tiny ticks on the panes, every 0.08 to 0.2 s).
//     (beauty pass 6: the patter drums in gusts; THUNDER far away every 14 to 30 s in heavy rain; a WHOOSH through the vents when the rare wind blows)
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
import { ORCHID_ROOM as ORCHID } from './greenhouserooms.js';

export const GH_SOUND_SALT = 0x6e5e0; // the four streams below add their own offset (all distinct from every other salt)
export const STREAM = Object.freeze({ drip: 0, trickle: 1, bird: 2, rain: 3, bee: 4, brush: 5, cricket: 6, tin: 7, hush: 8, thunder: 9, whoosh: 10 });
export const EVERY = Object.freeze({ drip: [1.6, 4.2], trickle: [0.2, 0.5], bird: [5, 11], rain: [0.08, 0.2], bee: [5, 12], brush: [0.25, 0.5], cricket: [2.2, 4.6], tin: [0.12, 0.4], hush: [2.2, 4.2], thunder: [14, 30], whoosh: [3, 6] });
export const GAIN = Object.freeze({ drip: 0.02, trickle: 0.012, bird: 0.02, rain: 0.006, bee: 0.011, brush: 0.012, cricket: 0.008, tin: 0.01, hush: 0.014, thunder: 0.03, whoosh: 0.014 });
export const TRICKLE = Object.freeze({ ear: 9 });
export const BIRD_EAR = 22;
export const TIN_EAR = 9; // beauty pass 5: the shed's tin roof (rain, or the sun ticking in the dry)
export const HUSH_EAR = 11; // the orchid house's humid hush
export const BEE_EAR = 9;
export const SOFT_BIRD = 0.35; // a bird heard through the glass: this share of a garden bird's level
const BRUSH_SPOTS = [...P.HIBISCUS_SPOTS, ...P.CATNIP_BEDS.map((b) => [b.x, b.z]), [P.KITCHEN_BED.x, P.KITCHEN_BED.z]]; // where the plants are thick enough to rustle
const QUIET = 0.0003;
const FLOOR = 0.0001;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createGreenhouseSound(audio, { weather = null, dusk = false, reducedMotion = false } = {}) {
  let ac = null;
  let master = null;
  let broken = false;
  let disposed = false;
  const live = new Set();
  const count = { drip: 0, trickle: 0, bird: 0, rain: 0, bee: 0, brush: 0, cricket: 0, tin: 0, hush: 0, thunder: 0, whoosh: 0 };
  const due = { drip: 0, trickle: 0, bird: 0, rain: 0, bee: 0, brush: 0, cricket: 0, tin: 0, hush: 0, thunder: 0, whoosh: 0 };
  let last = null;
  let speed = 0;
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
  function plink(c, f, to, at, dur, amp, rise = 0.01) {
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.linearRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + Math.min(rise, dur / 3));
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
      else if (k === 'bee') { const f = 170 + 50 * h; plink(c, f, f * 1.18, 0, 0.9, amp, 0.3); plink(c, f * 1.5, f * 1.75, 0.05, 0.8, amp * 0.5, 0.3); plink(c, f * 2.01, f * 2.2, 0.02, 0.85, amp * 0.3, 0.3); }
      else if (k === 'brush') { for (let i = 0; i < 3; i++) plink(c, 5200 + 2600 * hash01(count[k], 5 + i, GH_SOUND_SALT + STREAM[k]), 3800, i * 0.03, 0.025, amp, 0.004); }
      else if (k === 'thunder') { plink(c, 70 + 20 * h, 38, 0, 2.6, amp, 0.5); plink(c, 52, 30, 0.35 + 0.4 * h, 2.2, amp * 0.8, 0.6); } // far off: low, slow, a second roll
      else if (k === 'whoosh') plink(c, 260 + 120 * h, 150, 0, 1.9, amp, 0.8); // a breath through the vents
      else if (k === 'tin') plink(c, 900 + 900 * h, 700 + 400 * h, 0, 0.05, amp, 0.003);
      else if (k === 'hush') plink(c, 240 + 50 * h, 200, 0, 1.6, amp, 0.7);
      else if (k === 'cricket') { const f = 4300 + 300 * h; for (let i = 0; i < 4; i++) plink(c, f, f - 80, i * 0.07, 0.03, amp, 0.005); }
      else plink(c, 4200 + 1800 * h, 3000, 0, 0.012, amp);
    } catch { broken = true; return false; }
    return true;
  }

  // which of the four are wanted now, and how loudly (0: not at all)
  function level(k, catPos, under, raining, fx) {
    if (k === 'thunder') return raining && (fx?.rain ?? 1) > 0.6 ? (under ? 1 : 0.7) : 0;
    if (k === 'whoosh') return fx?.wind > 0.25 ? (under ? 1 : 0.5) * fx.wind : 0;
    if (k === 'drip') return under && !raining ? 1 : 0;
    if (k === 'rain') return under && raining ? 0.6 + 0.4 * Math.max(0, Math.sin(walk * 0.8 + 1)) ** 2 : 0; // the drumming comes in gusts
    if (k === 'brush') return speed > 0.8 && BRUSH_SPOTS.some(([x, z]) => Math.hypot(catPos.x - x, catPos.z - z) < 1.6) ? 1 : 0;
    if (k === 'cricket') return dusk && !raining && !under ? 1 : 0;
    if (k === 'tin') { const l = loudness(dist(catPos, P.SHED), TIN_EAR); return raining ? l : hash01(count.tin, 9, GH_SOUND_SALT + STREAM.tin) < 0.2 ? l * 0.5 : 0; }
    if (k === 'hush') return loudness(dist(catPos, { x: (ORCHID.x0 + ORCHID.x1) / 2, z: (ORCHID.z0 + ORCHID.z1) / 2 }), HUSH_EAR);
    if (k === 'trickle') return loudness(dist(catPos, P.FOUNTAIN), TRICKLE.ear + (under ? 7 : 0)) * (under ? 0.5 : 1); // under the glass it is heard through the panes
    if (k === 'bee') {
      if (raining || dusk) return 0;
      if (under) return 1;
      let near = 0;
      for (const b of P.CATNIP_BEDS) near = Math.max(near, loudness(dist(catPos, b), BEE_EAR));
      return near;
    }
    let best = 0;
    if (under && !raining && !dusk) return SOFT_BIRD;
    if (!under && !raining && !dusk) for (const [x, z] of P.BIRD_SPOTS) best = Math.max(best, loudness(dist(catPos, { x, z }), BIRD_EAR));
    return best;
  }

  return {
    update(dt, catPos, under = false, fx = null) {
      if (disposed || !audio || !catPos) return;
      walk += dt > 0 ? dt : 0;
      if (last && dt > 0) speed = Math.hypot(catPos.x - last.x, catPos.z - last.z) / dt;
      last = { x: catPos.x, z: catPos.z };
      const quiet = muted();
      if (quiet) hush();
      const raining = !!weather?.isRaining?.();
      for (const k of Object.keys(due)) {
        if (walk < due[k]) continue;
        const l = quiet ? 0 : level(k, catPos, under, raining, fx);
        if (l > 0) make(k, l);
        count[k]++; // a call that falls out of earshot or while muted is skipped and counted: the schedule is the same
        due[k] = walk + gap(k);
      }
    },
    dispose() { disposed = true; hush(); },
  };
}
