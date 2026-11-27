// Per-area music themes (pure data + one pure composer). Every walk's music
// is generated; an area id picks a theme here and music.js's composePhrase /
// createMusic read it. No theme (neighborhood, any unknown id) means the
// original lofi sound exactly, via the untouched code path in music.js.
// Fields: scale (semitone degrees), root (semitones from the mood's root; or
// rootHz fixed, so the crystal cave's music is in the crystals' own key),
// beat (seconds per step), len (steps per phrase), n [min,max] notes per
// phrase, up (chance of an octave lift), reg (register shift, +12 = up an
// octave), style (rand | arp | fifths | notes), pulse (accent every n steps),
// swing (odd steps late, fraction of a beat), must/slots (steps that always /
// may sound), alt + altVoice (a share of notes in a second voice), voice,
// pad {g gain, swell, chords}, drone (low held semitones instead of the bass).
const PENT = [0, 2, 4, 7, 9], MINP = [0, 3, 5, 7, 10], MAJ = [0, 2, 4, 5, 7, 9, 11], LYD = [0, 2, 4, 6, 7, 9, 11];
const FIFTH = [[0, 7, 12]];
const t = (o) => Object.freeze({ scale: PENT, root: 0, beat: 0.4, len: 8, n: [4, 6], up: 0.2, reg: 0, style: 'rand', pulse: 2, swing: 0, voice: 'pluck', pad: { g: 0.02, chords: FIFTH }, ...o });

const park = t({ voice: 'lite', root: 3, beat: 0.36, n: [4, 6], up: 0.35, pad: { g: 0.012, chords: FIFTH } });
const docks = t({ voice: 'uke', beat: 0.46, swing: 0.28, n: [4, 6], pad: { g: 0.016, chords: FIFTH } });
const seaside = t({ voice: 'uke', root: 2, beat: 0.5, swing: 0.3, n: [3, 5], pad: { g: 0.018, chords: FIFTH } });
const farm = t({ voice: 'soft', style: 'fifths', root: -2, beat: 0.5, n: [3, 5], pad: { g: 0.012, chords: FIFTH } });
const woods = t({ voice: 'soft', style: 'fifths', root: -5, beat: 0.56, n: [2, 4], pad: { g: 0.012, chords: FIFTH } });
const house = t({ voice: 'soft', root: -2, beat: 0.5, swing: 0.12, n: [4, 6], pad: { g: 0.02, chords: [[0, 4, 12], [0, 7, 12]] } });
const moor = t({ voice: 'air', scale: MINP, root: -3, beat: 0.6, len: 16, n: [2, 3], drone: [-12, -5], pad: { g: 0.01, chords: FIFTH } });

export const THEMES = Object.freeze({
  neighborhood: null, // today's lofi stays the base: the original code path
  park, docks, seaside, farm, woods, house, den: house, moor, pines: woods,
  gorge: t({ ...moor, root: -5, beat: 0.62, n: [2, 3], voice: 'air' }),
  fair: t({ voice: 'calliope', scale: MAJ, root: 5, beat: 0.3, len: 6, n: [4, 5], pulse: 3, must: [0, 3], up: 0.3, pad: { g: 0.014, chords: [[0, 4, 7]] } }),
  market: t({ voice: 'lite', alt: 0.25, altVoice: 'bell', beat: 0.34, swing: 0.22, n: [5, 7], pad: { g: 0.012, chords: FIFTH } }),
  river: t({ voice: 'harp', style: 'arp', beat: 0.32, n: [6, 8], pad: { g: 0.016, chords: FIFTH } }),
  roofs: t({ voice: 'harp', root: 2, beat: 0.55, len: 16, n: [3, 5], pad: { g: 0.016, chords: FIFTH } }),
  lighthouse: t({ voice: 'air', root: -2, beat: 0.6, len: 16, n: [3, 4], drone: [-12], pad: { g: 0.014, chords: FIFTH } }),
  greenhouse: t({ voice: 'mar', alt: 0.2, altVoice: 'chime', root: 2, beat: 0.42, n: [4, 6], pad: { g: 0.01, chords: FIFTH } }),
  moon: t({ voice: 'bell', scale: LYD, reg: 12, beat: 0.8, len: 16, n: [2, 3], up: 0.1, pad: { g: 0.03, swell: 1, chords: [[0, 7, 12], [0, 6, 14]] } }),
  reef: t({ voice: 'harp', style: 'arp', reg: 0, beat: 0.36, n: [6, 8], up: 0.3, pad: { g: 0.026, swell: 1, chords: FIFTH } }),
  snowville: t({ voice: 'bell', reg: 12, beat: 0.7, len: 16, n: [2, 4], up: 0.1, pad: { g: 0.014, swell: 1, chords: FIFTH } }), // slow bells and a soft pad (Snowville V4)
  // C major pentatonic, rooted on the crystals' own C: rose = G4 + D5, sky = A4 + E5, gold = C5 + G5 (crystallife.js NOTES)
  crystal: t({ voice: 'chime', style: 'notes', notes: [7, 9, 12, 14, 16, 19], rootHz: 261.63, beat: 0.75, len: 16, n: [3, 5], pad: { g: 0.012, swell: 1, chords: [[7, 12, 16], [9, 12, 16], [7, 14, 19]] } }),
});

// Instrument voices: t carrier type, lp lowpass Hz, dec seconds, atk seconds,
// g gain, det chorus cents, fm [ratio, index] bell, p [ratio, gain] extra partial.
export const VOICES = Object.freeze({
  pluck: { t: 'triangle', lp: 1800, dec: 0.35, atk: 0.005, g: 0.16 },
  lite: { t: 'triangle', lp: 3200, dec: 0.3, atk: 0.004, g: 0.14 },
  soft: { t: 'triangle', lp: 1300, dec: 0.5, atk: 0.01, g: 0.15 },
  uke: { t: 'triangle', lp: 2600, dec: 0.3, atk: 0.003, g: 0.16, p: [2, 0.25] },
  harp: { t: 'triangle', lp: 3000, dec: 1, atk: 0.003, g: 0.13, p: [3, 0.1] },
  mar: { t: 'sine', lp: 4000, dec: 0.28, atk: 0.002, g: 0.2, p: [4, 0.3] },
  calliope: { t: 'sawtooth', lp: 1700, dec: 0.22, atk: 0.01, g: 0.07, det: 7 },
  air: { t: 'sine', lp: 1400, dec: 1.4, atk: 0.12, g: 0.13, det: 4 },
  bell: { t: 'sine', lp: 5000, dec: 2, atk: 0.004, g: 0.1, fm: [3.5, 90] },
  chime: { t: 'sine', lp: 6000, dec: 2.4, atk: 0.003, g: 0.09, fm: [2.76, 60], p: [2, 0.2] },
});

// The dusk variant: slower, sparser, softer, lower (a longer beat, fewer notes,
// quieter, and a lower filter and register on top of the mood's own lower root).
export function themeFor(area, mood = 'day') {
  const th = THEMES[area];
  if (!th) return null;
  if (mood !== 'dusk') return th;
  return Object.freeze({ ...th, beat: th.beat * 1.22, n: [Math.max(1, Math.round(th.n[0] * 0.7)), Math.max(1, Math.round(th.n[1] * 0.7))], root: th.root - 2, soft: 0.8, swing: th.swing * 0.6 });
}

const rint = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

// The pure composer behind composePhrase for a themed area. Same seed gives the
// same phrase. rootBase is the mood's root in Hz.
export function composeThemed(rng, th, mood, rootBase) {
  const len = th.len;
  let count = rint(rng, th.n[0], th.n[1]);
  if (mood === 'rain') count = Math.max(1, Math.round(count * 0.4));
  const must = th.must || [];
  const pool = [];
  for (let i = 0; i < len; i++) if (!must.includes(i)) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const beats = [...must, ...pool.slice(0, Math.max(0, count - must.length))].sort((a, b) => a - b);
  const sc = th.scale;
  let idx = rint(rng, 0, sc.length - 1), dir = rng() < 0.5 ? 1 : -1;
  const steps = beats.map((beat, k) => {
    let note;
    if (th.style === 'arp') {
      note = sc[idx % sc.length] + 12 * Math.floor(idx / sc.length);
      idx += dir;
      if (idx >= sc.length * 2 - 1 || idx <= 0) { dir = -dir; idx = Math.min(sc.length * 2 - 1, Math.max(0, idx)); }
    } else if (th.style === 'fifths') {
      const pick = [0, 7, 12, 7, sc[rint(rng, 0, sc.length - 1)]];
      note = pick[rint(rng, 0, pick.length - 1)];
    } else if (th.style === 'notes') {
      note = th.notes[rint(rng, 0, th.notes.length - 1)];
    } else {
      note = sc[rint(rng, 0, sc.length - 1)] + (rng() < th.up ? 12 : 0);
    }
    note += th.reg;
    const long = rng() < 0.25 ? 2 : 1;
    const alt = th.alt ? rng() < th.alt : false;
    const vel = (beat % th.pulse === 0 ? 1 : 0.78) * (th.soft ?? 1);
    return { beat, note, len: long, vel, alt };
  });
  const chords = th.pad.chords;
  const chord = chords[rint(rng, 0, chords.length - 1)];
  return { steps, root: th.rootHz ?? rootBase * Math.pow(2, th.root / 12), chord, len };
}

// One note of a themed voice: carrier (+ chorus twin, FM modulator or one extra
// partial) -> lowpass -> decay envelope, into `dest`.
export function playVoice(ctx, dest, freq, when, len, vel, name) {
  const v = VOICES[name] || VOICES.pluck;
  const dur = v.dec * Math.max(1, len);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, v.g * vel), when + v.atk);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = v.lp;
  filt.connect(g).connect(dest);
  const oscs = [];
  const add = (type, f, detune = 0, gain = 1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    if (detune && o.detune) o.detune.value = detune;
    if (gain !== 1) { const pg = ctx.createGain(); pg.gain.value = gain; o.connect(pg).connect(filt); } else o.connect(filt);
    oscs.push(o);
    return o;
  };
  const car = add(v.t, freq, v.det ? -v.det : 0);
  if (v.det) add(v.t, freq, v.det);
  if (v.p) add('sine', freq * v.p[0], 0, v.p[1]);
  if (v.fm) {
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * v.fm[0];
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(v.fm[1] * (freq / 440) * 3, when);
    mg.gain.exponentialRampToValueAtTime(0.01, when + dur * 0.5);
    mod.connect(mg).connect(car.frequency);
    mod.start(when); mod.stop(when + dur + 0.05);
  }
  for (const o of oscs) { o.start(when); o.stop(when + dur + 0.05); }
}
