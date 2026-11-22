// =============================================================================
// THE MARKET'S SOUNDS (Market step 3, V9). Part of the Market chunk: made per
// walk by the square's life (marketlife.js) when the walk hands it the game's
// audio; update(dt, catPos, t) every frame, bell() when she lands in the
// bicycle's basket (Task 6), dispose() at the walk's end.
//
// SYNTHESISED HERE, as the Rooftops' birds are (roofssound.js, whose pigeon
// coo and loudness this borrows). Every sound is a few short tones or noise
// bursts made on the game's own AudioContext (audio.getContext()), each
// through its own gain envelope into the game's master (audio.getMaster()),
// so the volume setting is the master's. No samples, nothing downloaded. No
// node is made, and the context is never asked for, until the first sound
// she would hear is due. The fountain's water and the town's hum are not
// here: they are audio.js's 'market' ambience.
//
// MUTED. While audio.isMuted?.() is anything but false, nothing plays and the
// context is never asked for: an audio without isMuted (a stub, a test's) is
// silent. Muted mid-walk, the next frame stops whatever is still sounding
// (eased to silence over HUSH s, so it does not click). The clocks run on
// while muted, so unmuting brings no burst of everything missed. A context
// that is suspended (iOS before her first tap) or closed plays nothing; one
// that throws silences the rest of the walk.
//
// THE SOUNDS, each one's gain x loudness(d, ear), d her distance from it:
//   * THE TUNE (MUSIC): the street musician's fiddle, 16 soft triangle notes
//     (none longer than 0.35 s), then a rest of MUSIC.rest s, then again,
//     heard within MUSIC.ear. Each note is scheduled a moment ahead of its
//     time (LOOKAHEAD), at her distance then, so walking off fades it.
//   * THE PIGEONS: each coos (roofssound.js CALLS.pigeon) every 6 to 12 s,
//     within EAR.pigeon, unless it is flying or fleeing.
//   * THE CHATTER (CHATTER): by each of the four treat stalls, a murmur of two
//     or three short bursts of softly filtered noise every 1.4 to 3.6 s, heard
//     within CHATTER.ear: a busy, calm market, never words.
//   * THE BELL (BELL): bell(level) rings the bicycle's bell twice, at once:
//     at its full gain when she lands in its basket (level 1), at
//     loudness(d, BELL.ear) when her partner does, d her distance from it
//     (marketlife.js); level 0 rings nothing.
//
// THE SCHEDULE. Each caller keeps its clock in walk seconds (the sum of the dt
// it is given): the tune's first play starts MUSIC.rest x hash01(0, 0, salt)
// in; a pigeon's or a stall's next sound is due its gap after its last, the
// gap from hash01(caller, its count, MARKET_SOUND_SALT), as is the shape of
// each murmur. The chatter's noise is one short buffer painted once from
// hash01. A sound due while she is out of earshot (or muted) is skipped and
// counted, so the schedule is the same whatever she does. No randomness, no
// clock: the same walk makes the same sounds.
// =============================================================================
import { hash01 } from './warehouselook.js';
import { CALLS, EAR, loudness } from './roofssound.js';

export const MARKET_SOUND_SALT = 131;

const note = (f, at, dur) => Object.freeze({ f, at, dur });
const G4 = 392, A4 = 440, B4 = 493.88, D5 = 587.33, E5 = 659.25, FS5 = 739.99, G5 = 783.99;
// A happy little fiddle tune in G, 0.3 s a step.
export const MUSIC = Object.freeze({
  ear: 14,
  gain: 0.03,
  type: 'triangle',
  attack: 0.025,
  rest: 6,
  notes: Object.freeze([
    note(D5, 0, 0.26), note(B4, 0.3, 0.26), note(G4, 0.6, 0.26), note(B4, 0.9, 0.26),
    note(D5, 1.2, 0.26), note(G5, 1.5, 0.35), note(FS5, 2.1, 0.26), note(E5, 2.4, 0.26),
    note(D5, 2.7, 0.26), note(E5, 3.0, 0.26), note(D5, 3.3, 0.26), note(B4, 3.6, 0.26),
    note(A4, 3.9, 0.26), note(B4, 4.2, 0.26), note(A4, 4.5, 0.26), note(G4, 4.8, 0.35),
  ]),
});
const TUNE_LEN = MUSIC.notes.at(-1).at + MUSIC.notes.at(-1).dur;
// The bicycle's bell: two strikes `gap` s apart, each a bright tone and its
// overtone dying away over `ring` s; a partner's ring is heard within `ear` m
export const BELL = Object.freeze({ gain: 0.04, gap: 0.16, ring: 0.45, f: 2350, over: 1.4, overGain: 0.5, ear: 14 });
// The murmur of the market: bursts of noise through a band-pass, low and soft
export const CHATTER = Object.freeze({
  ear: 9,
  gain: 0.012,
  every: Object.freeze([1.4, 3.6]),
  band: Object.freeze([380, 900]), // Hz: each burst's middle
  q: 1.4,
  len: Object.freeze([0.22, 0.5]), // s: each burst
});

const LOOKAHEAD = 0.1; // s: a note is made this far ahead of its time
const LATE = 0.2; // s: a note this late (a long frame) is skipped, not played
const NOISE_S = 0.6; // s of noise in the chatter's one buffer
const QUIET = 0.0003; // a sound quieter than this (before the master) is not made
const FLOOR = 0.0001; // the envelope's silence (an exponential ramp needs > 0)
const HUSH = 0.02; // s a sound still sounding takes to fall silent when hushed
// the callers' numbers in the schedule's hash
const MUSIC_N = 0;
const STALL_N = 10;
const PIGEON_N = 20;

const posOf = (p) => p?.group?.position ?? p?.pos ?? p;
const dist = (a, b) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z);

// createMarketSound(audio, { pigeons, musician, stalls }) -> { update(dt, catPos, t), bell(), dispose() }.
// `audio` the game's (src/audio.js: getContext, getMaster, isMuted);
// `pigeons` a list read every frame: each a point { x, y?, z }, or a bird
// with `pos` or `group.position`, skipped while `flying` or `fleeing`;
// `musician` their pitch ({ x, z }) or null; `stalls` the four treat stalls'
// middles ({ x, z }). `t` (the walk's seconds) is not read: the clocks run on dt.
export function createMarketSound(audio, { pigeons = [], musician = null, stalls = [] } = {}) {
  let walk = 0;
  let ac = null;
  let master = null;
  let noise = null;
  let broken = false;
  let gone = false;
  const sounding = []; // { osc, g, end } in the context's time (osc: an oscillator or a buffer source)

  // the tune
  let tuneAt = MUSIC.rest * hash01(MUSIC_N, 0, MARKET_SOUND_SALT);
  let noteI = 0;
  // the stalls' and the pigeons' clocks
  const stallCount = stalls.map(() => 0);
  const gapOf = (n, k, every) => every[0] + (every[1] - every[0]) * hash01(n, k, MARKET_SOUND_SALT);
  const stallDue = stalls.map((_, j) => gapOf(STALL_N + j, 0, CHATTER.every));
  const pigeonCount = [];
  const pigeonDue = [];

  const muted = () => audio?.isMuted?.() !== false;

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
  // to play on. A throw (no Web Audio at all) silences the rest of the walk.
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
    if (ac.state === 'suspended' || ac.state === 'closed') return null;
    return ac;
  }

  const prune = (now) => {
    for (let i = sounding.length - 1; i >= 0; i--) if (sounding[i].end <= now) sounding.splice(i, 1);
  };
  // an ended node lets go of what it was joined to
  const letGo = (...nodes) => () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // already let go
      }
    }
  };

  // one tone: `type` at f -> to Hz from t0 for dur s, rising over attack to amp
  function tone(c, type, f, to, t0, dur, attack, amp) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    osc.frequency.linearRampToValueAtTime(to, t0 + dur);
    g.gain.value = FLOOR;
    g.gain.setValueAtTime(FLOOR, t0);
    g.gain.linearRampToValueAtTime(Math.max(amp, FLOOR * 2), t0 + attack);
    g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);
    osc.connect(g).connect(master);
    osc.onended = letGo(osc, g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    sounding.push({ osc, g, end: t0 + dur + 0.05 });
  }

  // `fn(c, now)` with the context, if there is one to play on
  function withBus(fn) {
    const c = bus();
    if (!c) return;
    try {
      const now = c.currentTime;
      prune(now);
      fn(c, now);
    } catch {
      broken = true;
    }
  }

  function noiseBuffer(c) {
    if (noise) return noise;
    const n = Math.max(1, Math.round(NOISE_S * (c.sampleRate || 44100)));
    noise = c.createBuffer(1, n, c.sampleRate || 44100);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (hash01(i, 0.5, MARKET_SOUND_SALT) * 2 - 1) * 0.9;
    return noise;
  }

  // stall j's k-th murmur: two or three bursts, at loudness l
  function murmur(j, k, l) {
    const n = STALL_N + j;
    const h = (s) => hash01(n, k * 16 + s, MARKET_SOUND_SALT);
    withBus((c, now) => {
      const buf = noiseBuffer(c);
      const bursts = 2 + (h(1) < 0.5 ? 0 : 1);
      for (let b = 0; b < bursts; b++) {
        const t0 = now + 0.02 + h(2 + b) * 0.5;
        const len = CHATTER.len[0] + (CHATTER.len[1] - CHATTER.len[0]) * h(5 + b);
        const amp = CHATTER.gain * l * (0.6 + 0.4 * h(8 + b));
        if (amp < QUIET) continue;
        const src = c.createBufferSource();
        src.buffer = buf;
        src.playbackRate.setValueAtTime(0.85 + 0.3 * h(11 + b), t0);
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(CHATTER.band[0] + (CHATTER.band[1] - CHATTER.band[0]) * h(14 + b), t0);
        bp.Q.value = CHATTER.q;
        const g = c.createGain();
        g.gain.value = FLOOR;
        g.gain.setValueAtTime(FLOOR, t0);
        g.gain.linearRampToValueAtTime(amp, t0 + 0.06);
        g.gain.exponentialRampToValueAtTime(FLOOR, t0 + len);
        src.connect(bp).connect(g).connect(master);
        src.onended = letGo(src, bp, g);
        const offset = h(15 - b) * Math.max(0, NOISE_S - len - 0.05);
        src.start(t0, offset, len + 0.05);
        src.stop(t0 + len + 0.05);
        sounding.push({ osc: src, g, end: t0 + len + 0.05 });
      }
    });
  }

  function coo(l) {
    const amp = CALLS.pigeon.gain * l;
    if (amp < QUIET) return;
    withBus((c, now) => {
      for (const n of CALLS.pigeon.notes) tone(c, n.type, n.f, n.to, now + n.at, n.dur, n.attack, amp * n.gain);
    });
  }

  function stepTune(quiet, catPos) {
    const notes = MUSIC.notes;
    // a long frame (or a walk picked up a long way in): no backlog of plays
    if (tuneAt + TUNE_LEN < walk - LATE) {
      const plays = Math.ceil((walk - LATE - tuneAt - TUNE_LEN) / (TUNE_LEN + MUSIC.rest));
      tuneAt += Math.max(1, plays) * (TUNE_LEN + MUSIC.rest);
      noteI = 0;
    }
    for (;;) {
      const n = notes[noteI];
      const when = tuneAt + n.at;
      if (when > walk + LOOKAHEAD) break;
      if (!quiet && musician && when >= walk - LATE) {
        const amp = MUSIC.gain * loudness(dist(catPos, musician), MUSIC.ear);
        if (amp >= QUIET) withBus((c, now) => tone(c, MUSIC.type, n.f, n.f, now + Math.max(0, when - walk), n.dur, MUSIC.attack, amp));
      }
      noteI++;
      if (noteI === notes.length) {
        noteI = 0;
        tuneAt += TUNE_LEN + MUSIC.rest;
      }
    }
  }

  return {
    update(dt, catPos) {
      if (gone) return;
      walk += Number.isFinite(dt) && dt > 0 ? dt : 0;
      const quiet = muted() || !catPos;
      if (quiet) hush();
      stepTune(quiet, catPos);
      // the stalls' chatter
      for (let j = 0; j < stalls.length; j++) {
        if (walk < stallDue[j]) continue;
        if (!quiet) {
          const l = loudness(dist(catPos, stalls[j]), CHATTER.ear);
          if (l > 0) murmur(j, stallCount[j], l);
        }
        stallCount[j]++;
        stallDue[j] += gapOf(STALL_N + j, stallCount[j], CHATTER.every);
        if (stallDue[j] <= walk) stallDue[j] = walk + gapOf(STALL_N + j, stallCount[j], CHATTER.every);
      }
      // the pigeons' coos
      const list = pigeons ?? [];
      for (let i = 0; i < list.length; i++) {
        if (pigeonDue[i] === undefined) {
          pigeonCount[i] = 0;
          pigeonDue[i] = walk + gapOf(PIGEON_N + i, 0, CALLS.pigeon.every);
        }
        if (walk < pigeonDue[i]) continue;
        const p = list[i];
        if (!quiet && !p?.flying && !p?.fleeing) {
          const at = posOf(p);
          if (at) coo(loudness(dist(catPos, at), EAR.pigeon));
        }
        pigeonCount[i]++;
        pigeonDue[i] += gapOf(PIGEON_N + i, pigeonCount[i], CALLS.pigeon.every);
        if (pigeonDue[i] <= walk) pigeonDue[i] = walk + gapOf(PIGEON_N + i, pigeonCount[i], CALLS.pigeon.every);
      }
    },
    // The bicycle's bell, twice, at once: `level` 1 (she is in its basket) or
    // her partner's loudness at her distance (0 rings nothing)
    bell(level = 1) {
      const l = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
      if (gone || l <= 0 || muted()) return;
      withBus((c, now) => {
        for (let s = 0; s < 2; s++) {
          const t0 = now + s * BELL.gap;
          tone(c, 'sine', BELL.f, BELL.f, t0, BELL.ring, 0.004, BELL.gain * l);
          tone(c, 'sine', BELL.f * BELL.over, BELL.f * BELL.over, t0, BELL.ring * 0.7, 0.004, BELL.gain * BELL.overGain * l);
        }
      });
    },
    dispose() {
      hush();
      gone = true;
    },
    // How many sounds are sounding (or queued) now.
    get playing() {
      return sounding.length;
    },
  };
}
