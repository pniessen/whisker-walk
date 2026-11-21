// =============================================================================
// THE ROOFTOPS' BIRDS, HEARD (Rooftops step 5, ruling R10). Made per walk by
// the area's life (roofslife.js) where the place has its flock and the walk
// hands it the game's audio; update(dt, catPos) every frame after the flock's,
// dispose() at the walk's end.
//
// SYNTHESISED HERE. Every call is a few short tones made on the game's own
// AudioContext (audio.getContext()), each an oscillator through its own gain
// envelope into the game's master (audio.getMaster()), so the volume setting
// is the master's. No samples, nothing downloaded. Nothing is made, and the
// context is never asked for, until the first call that she would hear is
// due.
//
// MUTED. While audio.isMuted?.() is anything but false, nothing plays and the
// context is never asked for: an audio without isMuted (a stub, a test's) is
// silent. Muted mid-walk, the next frame stops whatever is still sounding
// (eased to silence over HUSH s, so it does not click).
// The clocks run on while muted, so unmuting brings no burst of calls.
//
// NO CONTEXT TO PLAY ON. While the game's context is suspended (iOS before
// her first tap) or closed, a due call makes nothing (its clock stands still,
// so anything made would all sound at once when it resumes); it is skipped
// and counted, as out of earshot. Where asking for the context, or making a
// node, throws (no Web Audio), the rest of the walk is silent and it is never
// asked again. An ended tone lets go of its nodes (disconnects them).
//
// THE CALLS (CALLS: each call's tones, `gain` its loudest, before the
// master), each tone's gain x loudness(d, ear), d her distance from the bird
// (or the loft's centre) when the call is due:
//   * the loft coos, once every 2 to 4 s, heard within EAR.loft;
//   * a perched pigeon coos every 6 to 12 s, within EAR.pigeon;
//   * a sparrow chirps, two quick notes rising 3200 -> 3800 Hz, every 4 to 9 s,
//     within EAR.sparrow;
//   * a gull cries (the game's gull: a sawtooth falling 1400 -> 900 Hz, twice)
//     every 12 to 24 s, within EAR.gull;
//   * a bird that takes off (its `flying` turned true since the last frame)
//     within EAR.flap flaps: six soft beats 60 ms apart;
//   * the following pigeon (roofsbirds.js `following`, ruling R5) coos when
//     it lands.
//
// THE SCHEDULE. Each caller (the loft, then each bird) keeps its own clock in
// walk seconds (the sum of the dt it is given): its next call is due
// every[0] + (every[1] - every[0]) x hash01(caller, its call count, the
// call's salt) after its last. A call due while she is out of earshot (or
// muted) is skipped and counted, so the schedule is the same whatever she
// does. No randomness, no clock: the same walk makes the same calls.
// =============================================================================
import { hash01 } from './warehouselook.js';

// How far each call carries (m): heard at full loudness beside it, at none
// from this far.
export const EAR = Object.freeze({ loft: 16, pigeon: 8, sparrow: 10, gull: 30, flap: 8 });

// clamp(1 - d / ear, 0, 1) squared: soft fall-off, none past the ear.
export function loudness(d, ear) {
  const k = Math.min(1, Math.max(0, 1 - d / ear));
  return k * k;
}

const note = (type, f, to, at, dur, attack, gain = 1) => Object.freeze({ type, f, to, at, dur, attack, gain });

// Each call: `every` [min, max] s between calls (none for a take-off), `gain`
// its loudest tone's gain before the master, `salt` its schedule's, and its
// tones: `type`, `f` -> `to` Hz over `dur` s, starting `at` s into the call,
// rising over `attack` s, each at `gain` x the call's.
export const CALLS = Object.freeze({
  // the loft: a few birds together, coo-roo-coo
  loft: Object.freeze({
    every: Object.freeze([2, 4]),
    gain: 0.04,
    salt: 31,
    notes: Object.freeze([
      note('triangle', 460, 540, 0, 0.2, 0.03),
      note('triangle', 540, 400, 0.24, 0.34, 0.04),
      note('triangle', 430, 380, 0.66, 0.22, 0.03, 0.7),
    ]),
  }),
  // one pigeon: coo-COO
  pigeon: Object.freeze({
    every: Object.freeze([6, 12]),
    gain: 0.03,
    salt: 37,
    notes: Object.freeze([
      note('triangle', 500, 580, 0, 0.18, 0.03),
      note('triangle', 580, 430, 0.22, 0.3, 0.04),
    ]),
  }),
  sparrow: Object.freeze({
    every: Object.freeze([4, 9]),
    gain: 0.02,
    salt: 41,
    notes: Object.freeze([
      note('sine', 3200, 3800, 0, 0.07, 0.005),
      note('sine', 3200, 3800, 0.11, 0.07, 0.005),
    ]),
  }),
  gull: Object.freeze({
    every: Object.freeze([12, 24]),
    gain: 0.014,
    salt: 43,
    notes: Object.freeze([
      note('sawtooth', 1400, 900, 0, 0.25, 0.01),
      note('sawtooth', 1400, 900, 0.3, 0.25, 0.01),
    ]),
  }),
  // six soft beats of the wings, 60 ms apart
  flap: Object.freeze({
    every: null,
    gain: 0.03,
    salt: 0,
    notes: Object.freeze(Array.from({ length: 6 }, (_, i) => note('triangle', 240, 90, i * 0.06, 0.045, 0.004))),
  }),
});

// Which call each kind of bird makes on its own clock (a pigeon only while
// perched).
const BIRD_CALL = Object.freeze({ pigeon: 'pigeon', sparrow: 'sparrow', gull: 'gull' });

const QUIET = 0.0003; // a call quieter than this (before the master) is not made
const FLOOR = 0.0001; // the envelope's silence (an exponential ramp needs > 0)
const HUSH = 0.02; // s a tone still sounding takes to fall silent when hushed

const dist = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);

// createRoofsSound(audio, { birds, loft }) -> { update(dt, catPos), dispose() }.
// `audio` is the game's (src/audio.js: getContext, getMaster, isMuted);
// `birds` the flock (roofsbirds.js: its `birds`, { kind, flying, pos }, and
// `following`); `loft` the loft's centre ({ x, y, z }), or null.
export function createRoofsSound(audio, { birds, loft = null } = {}) {
  const list = birds?.birds ?? [];
  let walk = 0;
  let ac = null;
  let master = null;
  let broken = false; // the context threw: silent for the rest of the walk
  const sounding = []; // { osc, g, end } in the context's time
  // callers: 0 the loft, i + 1 bird i
  const count = new Array(list.length + 1).fill(0);
  const due = new Array(list.length + 1).fill(0);
  const wasFlying = list.map((b) => b.flying);
  const gap = (k, call) => call.every[0] + (call.every[1] - call.every[0]) * hash01(k, count[k], call.salt);
  const callOf = (k) => (k === 0 ? CALLS.loft : CALLS[BIRD_CALL[list[k - 1].kind]] ?? null);
  for (let k = 0; k < due.length; k++) {
    const call = callOf(k);
    if (call) due[k] = gap(k, call);
  }

  const muted = () => audio?.isMuted?.() !== false;

  // Stops every tone still sounding: its gain eased to silence over HUSH s
  // (no click), then the oscillator stopped.
  function hush() {
    if (!ac || sounding.length === 0) return;
    const now = ac.currentTime;
    for (const s of sounding) {
      try {
        const p = s.g.gain;
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now);
        else p.cancelScheduledValues(now);
        p.setTargetAtTime(FLOOR, now, HUSH / 4);
        s.osc.stop(now + HUSH);
      } catch {
        // already stopped
      }
    }
    sounding.length = 0;
  }

  // The game's context and master, asked for once; null while there is none
  // to play on (not made yet, suspended before her first tap, closed). A
  // throw (no Web Audio at all) silences the rest of the walk.
  function bus() {
    if (broken) return null;
    if (!ac) {
      try {
        ac = audio.getContext() ?? null;
        master = ac ? audio.getMaster() ?? null : null;
      } catch {
        broken = true;
        ac = null;
        return null;
      }
    }
    if (!ac || !master) return null;
    // a suspended context's clock stands still: anything made now would
    // all sound at once when it resumes
    if (ac.state === 'suspended' || ac.state === 'closed') return null;
    return ac;
  }

  function play(call, l) {
    const amp = call.gain * l;
    if (amp < QUIET) return;
    const c = bus();
    if (!c) return;
    try {
      const now = c.currentTime;
      for (let i = sounding.length - 1; i >= 0; i--) if (sounding[i].end <= now) sounding.splice(i, 1);
      for (const n of call.notes) {
        const t0 = now + n.at;
        const a = Math.max(amp * n.gain, FLOOR * 2);
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = n.type;
        osc.frequency.setValueAtTime(n.f, t0);
        osc.frequency.linearRampToValueAtTime(n.to, t0 + n.dur);
        g.gain.value = FLOOR;
        g.gain.setValueAtTime(FLOOR, t0);
        g.gain.linearRampToValueAtTime(a, t0 + n.attack);
        g.gain.exponentialRampToValueAtTime(FLOOR, t0 + n.dur);
        osc.connect(g).connect(master);
        // ended: let go of both nodes
        osc.onended = () => {
          try {
            osc.disconnect();
            g.disconnect();
          } catch {
            // already let go
          }
        };
        osc.start(t0);
        osc.stop(t0 + n.dur + 0.05);
        sounding.push({ osc, g, end: t0 + n.dur + 0.05 });
      }
    } catch {
      broken = true;
    }
  }

  return {
    update(dt, catPos) {
      walk += dt;
      const quiet = muted() || !catPos;
      if (quiet) hush();
      // each caller's own clock: due, it calls (if she hears it) and counts
      for (let k = 0; k < due.length; k++) {
        if (walk < due[k]) continue;
        const call = callOf(k);
        if (!call) continue;
        if (!quiet) {
          if (k === 0) {
            if (loft) play(call, loudness(dist(catPos, loft), EAR.loft));
          } else {
            const b = list[k - 1];
            if (!(b.kind === 'pigeon' && b.flying)) play(call, loudness(dist(catPos, b.pos), EAR[BIRD_CALL[b.kind]]));
          }
        }
        count[k]++;
        due[k] += gap(k, call);
        if (due[k] <= walk) due[k] = walk + gap(k, call); // a long frame: no backlog
      }
      // take-offs flap; the following pigeon coos as it lands
      const follower = birds?.following ?? null;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!quiet && b.flying && !wasFlying[i]) play(CALLS.flap, loudness(dist(catPos, b.pos), EAR.flap));
        if (!quiet && !b.flying && wasFlying[i] && follower === b.id) play(CALLS.pigeon, loudness(dist(catPos, b.pos), EAR.pigeon));
        wasFlying[i] = b.flying;
      }
    },
    dispose() {
      hush();
    },
    // How many tones are sounding (or queued) now.
    get playing() {
      return sounding.length;
    },
  };
}
