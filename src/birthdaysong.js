// "Happy Birthday to You" (the traditional melody, public domain) as a
// music box plays it: one bright note at a time, in C, an octave above
// where it is sung (octave 1). Pure data and one pure function; audio.js
// playTune plays the notes through the game's own bus, so the mute and the
// volume apply, and the caller scales it by the music volume.

// [semitones from middle C, beats]. Four lines in 3/4, each with its little
// dotted pickup ("hap-py").
// G A B below middle C, then C D E F G above it.
const G3 = -5, A3 = -3, B3 = -1, C4 = 0, D4 = 2, E4 = 4, F4 = 5, G4 = 7;
export const HAPPY_BIRTHDAY = Object.freeze([
  [G3, 0.75], [G3, 0.25], [A3, 1], [G3, 1], [C4, 1], [B3, 2],
  [G3, 0.75], [G3, 0.25], [A3, 1], [G3, 1], [D4, 1], [C4, 2],
  [G3, 0.75], [G3, 0.25], [G4, 1], [E4, 1], [C4, 1], [B3, 1], [A3, 2],
  [F4, 0.75], [F4, 0.25], [E4, 1], [C4, 1], [D4, 1], [C4, 3],
].map((n) => Object.freeze(n)));

const MIDDLE_C = 261.6256;

// birthdayTune({ beat, octave }) -> [{ at, freq, dur }]: when each note starts
// (seconds from now), its pitch (Hz) and how long it rings. beat is one
// quarter note; 0.44 s puts the whole song at about 11.5 s.
export function birthdayTune({ beat = 0.44, octave = 1 } = {}) {
  const out = [];
  let t = 0;
  for (const [semi, beats] of HAPPY_BIRTHDAY) {
    out.push({ at: t, freq: MIDDLE_C * 2 ** ((semi + 12 * octave) / 12), dur: Math.max(0.5, beats * beat * 1.1) });
    t += beats * beat;
  }
  return out;
}
