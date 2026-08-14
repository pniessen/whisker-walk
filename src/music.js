import { mulberry32 } from './rng.js';

// Seeded generative lofi music (Task 7.3). Two pure/impure halves, same
// split as goldmice.js/kitten.js elsewhere in this codebase:
//   composePhrase(rng, opts) — pure, deterministic, fully unit-testable.
//   createMusic(getCtx, getMaster) — the live Web Audio scheduler that
//     drives composePhrase off ctx.currentTime and plays the result.
//
// M-mute note: music is scheduled onto a `musicGain` node that connects
// straight into the shared master bus — see ensureGain() below. That bus
// covers *volume* for free (audio.js's setVolume() writes master.gain.value,
// which scales everything downstream including music), but NOT mute:
// audio.js's setMuted() only gates its own tone()/vocal()/purr() calls, it
// never touches master.gain, so it does nothing to musicGain's oscillators.
// createMusic's own setMuted() below covers that gap — main.js's
// applySettings() calls it alongside music.setVolume().

const SCALE = [0, 3, 5, 7, 10]; // major pentatonic degrees, +12 (octave up) allowed per note

const ROOTS = {
  day: 220,
  sunset: 246.94, // +2 semitones above day's 220
  dusk: 174.61,   // -4 semitones below day's 220 ("slower feel" is applied in createMusic's beat duration)
  rain: 220,      // same root as day — rain distinguishes itself via lower note density, not pitch
};

// Fisher-Yates using the supplied rng, so beat placement stays deterministic
// for a given seed (never Math.random).
function shuffled(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Pure phrase generator: an 8-beat (eighth-note) loop over the pentatonic
// scale. `rng` is caller-owned (mulberry32 in practice) so the same seed
// always yields the same phrase — createMusic derives a fresh rng per
// phrase from mulberry32(seed + phraseIndex).
export function composePhrase(rng, { mood = 'day' } = {}) {
  const root = ROOTS[mood] ?? ROOTS.day;

  // Note count is drawn FIRST, before anything mood-specific, so day and
  // rain (given the same rng seed) start from the identical 4-7 base count —
  // rain then thins it by 0.4x, guaranteeing fewer notes than day for the
  // same seed rather than merely "usually fewer".
  const baseCount = 4 + Math.floor(rng() * 4); // 4..7 inclusive
  const count = mood === 'rain' ? Math.max(1, Math.round(baseCount * 0.4)) : baseCount;

  const beats = shuffled(rng, [0, 1, 2, 3, 4, 5, 6, 7]).slice(0, count).sort((a, b) => a - b);

  const steps = beats.map((beat) => {
    const degree = SCALE[Math.floor(rng() * SCALE.length)];
    const octaveUp = rng() < 0.2; // occasional +12 lift, per the brief
    const note = degree + (octaveUp ? 12 : 0);
    const len = rng() < 0.25 ? 2 : 1;
    return { beat, note, len };
  });

  // Chord for the pad: root + an octave + one more pentatonic degree picked
  // by the same rng stream, e.g. [0, 7, 12] when that degree lands on 7.
  const midDegree = SCALE[1 + Math.floor(rng() * (SCALE.length - 1))]; // any non-zero scale degree
  const chord = [0, midDegree, 12];

  return { steps, root, chord };
}

const BEATS_PER_PHRASE = 8;
const BASE_BEAT_DUR = 60 / 70 / 2; // 70bpm, eighth notes
const LOOKAHEAD = 0.25; // seconds scheduled ahead of ctx.currentTime
const SCHEDULER_INTERVAL_MS = 120;

export function createMusic(getCtx, getMaster) {
  let intervalId = null;
  let musicGain = null;
  let volume = 1; // matches audio.js's default-to-full-volume-if-unwired convention
  let muted = false; // settings.muted, pushed by main.js's applySettings — see setMuted() below
  let playingFlag = false;

  // Last { seed, mood } passed to start(), remembered regardless of whether
  // that call actually started playback — setVolume() below uses it to
  // begin/resume music without a fresh start() call when the slider is
  // raised mid-walk (see setVolume()'s comment).
  let pendingStart = null;

  let seed = 0;
  let mood = 'day';
  let beatDur = BASE_BEAT_DUR;
  let beatCursor = 0;
  let nextNoteTime = 0;

  let phraseIndex = -1;
  let phrase = null;

  let padVoices = null; // { oscs, gain } for the currently-sustaining pad, so stop() can kill it

  function ensureGain() {
    const ctx = getCtx();
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = muted ? 0 : volume;
      musicGain.connect(getMaster());
    }
    return { ctx, gain: musicGain };
  }

  // Effective audible gain: 0 whenever muted, else the live volume slider.
  // Both setMuted() and setVolume() route through this so neither call can
  // clobber what the other one set.
  function applyGain() {
    if (musicGain) musicGain.gain.value = muted ? 0 : volume;
  }

  function killPad() {
    if (!padVoices) return;
    for (const osc of padVoices.oscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { padVoices.gain.disconnect(); } catch { /* no-op if already disconnected */ }
    padVoices = null;
  }

  // pluck: triangle osc → lowpass 1800 → exponential-decay envelope (0.35s).
  function schedulePluck(ctx, freq, when, len) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1800;
    const g = ctx.createGain();
    const dur = 0.35 * Math.max(1, len);
    g.gain.setValueAtTime(0.16, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(filt).connect(g).connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  // bass: plain sine at root/2, once per bar (phrase).
  function scheduleBass(ctx, rootFreq, when) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = rootFreq / 2;
    const g = ctx.createGain();
    const dur = beatDur * BEATS_PER_PHRASE * 0.9;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.12, when + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(g).connect(musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  // pad: the chord, doubled per-tone by two triangles detuned ±4 cents
  // (classic unison-detune pad thickening), 1.2s attack, gain 0.02, held
  // until the next pad (every 2 bars) or stop() kills it.
  function schedulePad(ctx, rootFreq, chord, when) {
    killPad();
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.02, when + 1.2);
    g.connect(musicGain);
    const oscs = [];
    for (const semi of chord) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = rootFreq * Math.pow(2, semi / 12);
        if (osc.detune) osc.detune.value = detune;
        osc.connect(g);
        osc.start(when);
        oscs.push(osc);
      }
    }
    padVoices = { oscs, gain: g };
  }

  function scheduleLoop() {
    const { ctx } = ensureGain();
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      const idx = Math.floor(beatCursor / BEATS_PER_PHRASE);
      const beatInPhrase = beatCursor % BEATS_PER_PHRASE;
      if (idx !== phraseIndex) {
        phraseIndex = idx;
        phrase = composePhrase(mulberry32((seed + phraseIndex) >>> 0), { mood });
      }
      const when = nextNoteTime;
      if (beatInPhrase === 0) {
        scheduleBass(ctx, phrase.root, when);
        if (phraseIndex % 2 === 0) schedulePad(ctx, phrase.root, phrase.chord, when);
      }
      for (const step of phrase.steps) {
        if (step.beat === beatInPhrase) {
          const freq = phrase.root * Math.pow(2, step.note / 12);
          schedulePluck(ctx, freq, when, step.len);
        }
      }
      nextNoteTime += beatDur;
      beatCursor += 1;
    }
  }

  const api = {
    get playing() { return playingFlag; },
    // seed/mood per the brief: room walks share roomSeed so co-walkers hear
    // the same song; mood picks the root + (for dusk) a slower beat feel.
    start(newSeed, newMood = 'day') {
      // Remembered regardless of whether this call actually starts playing —
      // see the `pendingStart` declaration above and setVolume() below.
      pendingStart = { seed: (newSeed ?? 0) >>> 0, mood: newMood };
      if (volume <= 0) return; // cheap opt-out — no nodes, no interval, nothing to tear down later
      if (intervalId) api.stop({ keepPending: true }); // restart cleanly rather than stacking a second scheduler
      const { ctx } = ensureGain();
      seed = pendingStart.seed;
      mood = pendingStart.mood;
      beatDur = BASE_BEAT_DUR * (mood === 'dusk' ? 1.15 : 1); // dusk: same 70bpm grid, slightly longer beats = slower feel
      beatCursor = 0;
      phraseIndex = -1;
      nextNoteTime = ctx.currentTime;
      playingFlag = true;
      scheduleLoop();
      intervalId = setInterval(scheduleLoop, SCHEDULER_INTERVAL_MS);
    },
    // keepPending: true is used by internal callers (start()'s
    // restart-cleanly path, setVolume()'s volume-drops-to-0 path) that need
    // `pendingStart` preserved. External callers (main.js at walk end)
    // default to clearing it, so a later volume tweak made outside a walk
    // (e.g. at homebase) doesn't resurrect a finished walk's song.
    stop({ keepPending = false } = {}) {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      killPad();
      playingFlag = false;
      if (!keepPending) pendingStart = null;
    },
    // Live volume control (0..1) on musicGain, same pattern as audio.js's
    // master setVolume — takes effect immediately on whatever's scheduled.
    // Dropping to 0 while playing stops the scheduler (cheap "volume 0 ==
    // off" opt-out, matching start()'s decline) but KEEPS pendingStart, so
    // raising the slider back above 0 — even mid-walk, with no fresh start()
    // call — resumes the same seed/mood instead of staying silent until the
    // next walk.
    setVolume(v) {
      volume = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : volume;
      applyGain();
      if (volume === 0 && playingFlag) {
        api.stop({ keepPending: true });
      } else if (volume > 0 && !playingFlag && pendingStart) {
        api.start(pendingStart.seed, pendingStart.mood);
      }
    },
    // M-mute / settings.muted, pushed by main.js's applySettings. Zeroes
    // musicGain.gain directly via applyGain() WITHOUT touching the
    // scheduler/intervalId — unmuting mid-walk resumes seamlessly right
    // where the generated phrase already is, instead of restarting the song.
    setMuted(m) {
      muted = !!m;
      applyGain();
    },
  };
  return api;
}
