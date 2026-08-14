// Per-breed voice parameters for the synthesized cat voice (audio.js meow/
// trill). pitch scales every frequency, rate divides durations (faster > 1),
// gain scales loudness. Values are tuned to the PERSONALITIES flavor text.
export const VOICES = {
  tabby:     { pitch: 1.0,  rate: 1.0,  gain: 1.0 },
  siamese:   { pitch: 1.18, rate: 1.35, gain: 1.25 }, // hyper: loud, fast, high
  persian:   { pitch: 0.8,  rate: 0.7,  gain: 0.8 },  // lazy: low, slow, soft
  black:     { pitch: 0.92, rate: 1.0,  gain: 1.0 },
  calico:    { pitch: 1.1,  rate: 1.15, gain: 1.0 },
  mainecoon: { pitch: 0.72, rate: 0.85, gain: 1.1 },  // big cat, big voice
  zeetoo:    { pitch: 1.05, rate: 1.2,  gain: 1.0 },
  rosa:      { pitch: 1.22, rate: 0.9,  gain: 0.9 },
  robbie:    { pitch: 0.85, rate: 1.05, gain: 1.05 },
  hagrid:    { pitch: 1.0,  rate: 1.0,  gain: 1.0 },  // clucks — pitch/rate still honored
};
export function voiceFor(breed) {
  return VOICES[breed] ?? VOICES.tabby;
}
