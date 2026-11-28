// Per-breed voice parameters for the synthesized cat voice (audio.js meow/
// trill). pitch scales every frequency, rate divides durations (faster > 1),
// gain scales loudness. Values are tuned to the PERSONALITIES flavor text.
export const VOICES = {
  tabby:     { pitch: 1.0,  rate: 1.0,  gain: 1.0 },
  siamese:   { pitch: 1.18, rate: 1.35, gain: 1.25 }, // hyper: loud, fast, high
  persian:   { pitch: 0.8,  rate: 0.7,  gain: 0.8 },  // lazy: low, slow, soft
  black:     { pitch: 0.92, rate: 1.0,  gain: 1.0 },
  calico:    { pitch: 1.1,  rate: 1.15, gain: 1.0 },
  ribbonkit: { pitch: 1.35, rate: 1.3,  gain: 0.85 }, // the birthday kitten: a tiny mew
  mainecoon: { pitch: 0.72, rate: 0.85, gain: 1.1 },  // big cat, big voice
  zeetoo:    { pitch: 1.05, rate: 1.2,  gain: 1.0 },
  robbie:    { pitch: 0.85, rate: 1.05, gain: 1.05 },
  d2:        { pitch: 0.78, rate: 0.85, gain: 1.05 }, // gentle giant: low, unhurried
  digit:     { pitch: 1.3,  rate: 1.3,  gain: 0.9 },  // kitten: high, quick, small
  hagrid:    { pitch: 1.0,  rate: 1.0,  gain: 1.0 },  // clucks — pitch/rate still honored
};
export function voiceFor(breed) {
  return VOICES[breed] ?? VOICES.tabby;
}

// Every call and reply goes through here, so the breed's own voice is the only
// one that sounds: a chicken (hagrid) clucks and now and then crows, and never
// meows. `turn` alternates cluck and crow across calls.
export const isChicken = (breed) => breed === 'hagrid';
let callTurn = 0;
export function callVoice(audio, breed, { volume = 1, pitch = 1 } = {}) {
  if (isChicken(breed)) {
    const p = pitch * voiceFor(breed).pitch;
    callTurn += 1;
    if (callTurn % 2 === 0 && typeof audio.crow === 'function') { audio.crow(volume, p); return 'crow'; }
    audio.cluck(volume, p);
    return 'cluck';
  }
  audio.meow(volume, pitch, voiceFor(breed));
  return 'meow';
}
