// =============================================================================
// THE CRYSTAL CAVE'S WING C, MILESTONE C5: THE SINGING CHAMBER. THE PLAN (`songplan`): pure data and pure functions (no THREE, no clock, no random number). The chamber
// stands at about (-27, -16), radius 5: a ring of seven flat floor pads, each with its own soft pentatonic note on the root humNote plays (G, 392 Hz). Three gentle echo
// tunes of 3 to 5 notes: the chamber plays one with its pads lighting in order, she steps the pads to echo it. There is NO fail sound: a wrong step, or a long wait, just lets
// the pads fade and the phrase plays again. Finishing a tune sets its bit in state.crystal.songs once (any order). North is -z. docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md
// decisions 1, 5, 7 and 8.
// =============================================================================

const f = Object.freeze;
const r2 = (v) => Math.round(v * 100) / 100;

export const CHAMBER = f({ x: -27, z: -16, r: 5 });
export const ROOT = 392; // humNote's first crystal note (G4), src/world/crystallife.js NOTES[0][0]
export const SEMIS = f([0, 2, 4, 7, 9, 12, 14]); // the major pentatonic, G A B D E G A: seven pads
export const NOTES = f(SEMIS.map((s) => r2(ROOT * 2 ** (s / 12))));
export const PAD_COUNT = 7;
export const RING_R = 2.9; // the pads stand on a ring this far from the chamber's middle
export const PAD_R = 0.62; // a pad's drawn radius
export const PAD_TRIGGER = 0.72; // she is "on" a pad within this many metres of its middle (and on the floor)
export const PAD_LIFT = 0.05; // the pads' height over the floor (never over 0.08)
export const MAX_LIFT = 0.08;
export const HALO_R = 1.3;
// The ring starts a little east of north so a gap (not a pad) faces the errand's glove spot at (-30, -14).
const START = -1.485;
export const PADS = f(Array.from({ length: PAD_COUNT }, (_, i) => {
  const a = START + (i * Math.PI * 2) / PAD_COUNT;
  return f({ i, x: r2(CHAMBER.x + Math.cos(a) * RING_R), z: r2(CHAMBER.z + Math.sin(a) * RING_R), note: NOTES[i] });
}));

// The pad colours (soft, pastel): pink, peach, butter, mint, sky, periwinkle, lilac.
export const PAD_COLOURS = f([0xff9ec4, 0xffc27a, 0xffe27a, 0x8ff0b0, 0x7fe0ff, 0x9fa8ff, 0xd79cff]);

// ---- the rim rocks and pebbles are taken out of this rectangle AFTER the scatter (CRYSTAL_CLEARS; never KEEP_OUT) ------------------------------------------------
export const CLEAR = f({ minX: -32.5, maxX: -21.5, minZ: -21.5, maxZ: -10.5 });

// Every drawn piece's footprint as [x, z, r]: what the tests keep clear of the finds, the mice, the stones, Lumi, the arch, the pool and the wander points.
export const SOLID_R = r2(PAD_R + 0.16); // a pad with its rim (the halo is only a soft glow, 1.3 m wide)
export const footprint = () => PADS.map((p) => [p.x, p.z, SOLID_R]);

// ---- the three tunes: pad numbers, 3 to 5 notes, no pad twice in a row (a note is never "one more step on the same stone") ---------------------------------------------
export const TUNES = f([f([0, 2, 4]), f([4, 2, 3, 1]), f([0, 2, 4, 6, 5])]);
export const TUNE_COUNT = TUNES.length;

// ---- the matcher: one tune, played and echoed -----------------------------------------------------------------------------------------------------------------
export const TIMING = f({ lead: 0.9, gap: 0.8, tail: 0.9, wait: 14, fade: 1.4 }); // seconds: before the first note, between notes, after the last, the echo's patience, the fade
// phases: 'phrase' (the chamber plays), 'echo' (she steps), 'fade' (the pads dim, then the phrase plays again), 'done'
export function newRun(tune) {
  return { tune, phase: 'phrase', t: 0, shown: 0, got: 0, idle: 0 };
}
/** Time moves on by dt seconds; returns the events it caused: { k: 'phrase', pad } (a note of the chamber's), { k: 'listen' }, { k: 'timeout' }, { k: 'replay' }. */
export function advance(run, dt) {
  const out = [];
  if (!(dt > 0) || run.phase === 'done') return out;
  const T = TIMING;
  const n = run.tune.length;
  if (run.phase === 'phrase') {
    run.t += dt;
    while (run.shown < n && run.t >= T.lead + run.shown * T.gap) out.push({ k: 'phrase', pad: run.tune[run.shown++] });
    if (run.shown === n && run.t >= T.lead + (n - 1) * T.gap + T.tail) { run.phase = 'echo'; run.got = 0; run.idle = 0; out.push({ k: 'listen' }); }
  } else if (run.phase === 'echo') {
    run.idle += dt;
    if (run.idle >= T.wait) { run.phase = 'fade'; run.t = 0; run.got = 0; out.push({ k: 'timeout' }); }
  } else if (run.phase === 'fade') {
    run.t += dt;
    if (run.t >= T.fade) { run.phase = 'phrase'; run.t = 0; run.shown = 0; run.got = 0; out.push({ k: 'replay' }); }
  }
  return out;
}
/** She steps onto pad `pad`; returns the events: { k: 'ok', pad, n } (the echo is right so far), { k: 'miss' } (the pads fade), { k: 'done' }. Steps while the chamber plays or fades are ignored. */
export function stepPad(run, pad) {
  if (run.phase !== 'echo') return [];
  if (pad === run.tune[run.got]) {
    run.got++;
    run.idle = 0;
    if (run.got === run.tune.length) { run.phase = 'done'; return [{ k: 'ok', pad, n: run.got }, { k: 'done' }]; }
    return [{ k: 'ok', pad, n: run.got }];
  }
  run.phase = 'fade'; run.t = 0; run.got = 0;
  return [{ k: 'miss' }];
}

// ---- the save: three bits, any order ---------------------------------------------------------------------------------------------------------------------------
export const learned = (songs, i) => ((songs | 0) & (1 << i)) !== 0;
export const learn = (songs, i) => ((songs | 0) | (i >= 0 && i < TUNE_COUNT ? 1 << i : 0)) & 7;
export const allLearned = (songs) => ((songs | 0) & 7) === 7;
/** The tune the chamber plays next: the first not yet learned, else a replay for fun (cycling, `plays` counts the replays). */
export const nextTune = (songs, plays = 0) => { for (let i = 0; i < TUNE_COUNT; i++) if (!learned(songs, i)) return i; return ((plays % TUNE_COUNT) + TUNE_COUNT) % TUNE_COUNT; };

// ---- where she is --------------------------------------------------------------------------------------------------------------------------------------------------
export const ACTIVE_R = 4.8; // the offer stands within this of the middle
export const LEAVE_R = 8; // a tune in the middle of being played is let go beyond this
export const inChamber = (x, z, r = ACTIVE_R) => Math.hypot(x - CHAMBER.x, z - CHAMBER.z) <= r;
/** The pad she stands on (the nearest within PAD_TRIGGER), or -1. */
export function padAt(x, z) {
  let best = -1;
  let bd = PAD_TRIGGER;
  for (const p of PADS) { const d = Math.hypot(x - p.x, z - p.z); if (d <= bd) { bd = d; best = p.i; } }
  return best;
}
/** The glow a pad shows when nothing lights it (a soft level, with a slow breath; reduced motion holds it still). */
export const BASE_GLOW = 0.5;
export const breath = (t, i, still = false) => (still ? BASE_GLOW : BASE_GLOW + 0.07 * Math.sin(t * 1.1 + i * 0.9));
