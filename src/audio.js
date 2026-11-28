import { isIndoor } from './indoor.js';

// Swimming (Task 6): waterSplash(kind)'s three sounds. dur in seconds; the
// bandpass sweeps from → to; flutter steps the gain on and off that many times.
const WATER_SPLASHES = Object.freeze({
  wade: Object.freeze({ dur: 0.12, from: 1400, to: 700, gain: 0.03 }),
  paddle: Object.freeze({ dur: 0.16, from: 600, to: 350, gain: 0.025 }),
  shake: Object.freeze({ dur: 0.5, from: 1800, to: 1800, gain: 0.035, flutter: 8 }),
});

// The meow's shape, pure (so it is testable and never needs a context). kind:
// 'meow' (the standard), 'call' (long), 'chirp' (short), 'mew' (soft).
// pitch/rate/gain are the cat's voice (a kitten is higher and quicker, an
// older cat lower and slower); a smaller throat also lifts the vowel peaks
// (formants follow pitch at the 0.6 power, so a kitten is smaller, not just
// shifted). f is the pitch contour Hz [start, peak, end], peakAt where in the
// note the peak falls, f1/f2 the two vowel bands' sweeps ('ee' high to 'ow'
// low), breath the share of the amplitude in the noise puff.
const MEOW_KINDS = Object.freeze({
  meow: { dur: 0.5, f: [300, 520, 240], peakAt: 0.35, f1: [420, 700], f2: [2300, 1000], vib: 6.5, vd: 0.03, breath: 0.12, amp: 1 },
  call: { dur: 0.85, f: [280, 470, 210], peakAt: 0.3, f1: [380, 640], f2: [2200, 900], vib: 5.5, vd: 0.04, breath: 0.1, amp: 1 },
  chirp: { dur: 0.2, f: [420, 640, 560], peakAt: 0.55, f1: [420, 520], f2: [2500, 2100], vib: 12, vd: 0.015, breath: 0.06, amp: 0.8 },
  mew: { dur: 0.45, f: [520, 650, 450], peakAt: 0.4, f1: [400, 560], f2: [2400, 1500], vib: 7.5, vd: 0.02, breath: 0.22, amp: 0.6 },
});
// The crow's notes: [f0, f1, f2, filter0, dur, delay, gain]. Pure data, so a
// test can bound the whole call (the last note ends by delay + dur).
export const CROW_NOTES = [
  [520, 640, 600, 1500, 0.14, 0, 0.06],
  [560, 700, 640, 1600, 0.14, 0.17, 0.06],
  [600, 800, 760, 1700, 0.2, 0.34, 0.07],
  [760, 900, 520, 1500, 0.55, 0.58, 0.08],
];
export function meowParams(kind = 'meow', { volume = 1, pitch = 1, rate = 1, gain = 1 } = {}) {
  const k = MEOW_KINDS[kind] ?? MEOW_KINDS.meow;
  const sf = (x) => (Number.isFinite(x) && x > 0 ? x : 1);
  const p = sf(pitch), r = sf(rate), formant = Math.pow(p, 0.6);
  return {
    dur: k.dur / r,
    f: k.f.map((x) => x * p),
    peakAt: k.peakAt,
    f1: k.f1.map((x) => x * formant),
    f2: k.f2.map((x) => x * formant),
    vib: k.vib, vd: k.vd, breath: k.breath,
    amp: Math.max(0.0001, 0.16 * (Number.isFinite(volume) ? volume : 1) * sf(gain) * k.amp),
  };
}

export function createAudio({ contextFactory = () => new (window.AudioContext || window.webkitAudioContext)() } = {}) {
  let ctx = null;
  let muted = false;
  // Master volume factor (0..1), driven live by settings.volume — see
  // setVolume() below. Applied once at the master gain node (built by
  // ensure()) rather than multiplied into every individual sound's gain, so
  // a live setVolume() call takes effect immediately even on long-lived
  // nodes like the seaside ambient loop. Default 1 so a caller that never
  // wires up settings (e.g. a stray future test) still hears full volume
  // rather than silence.
  let volume = 1;
  let ambient = null;
  let voiceHook = null; // music.duck(): a meow takes the music down a little
  let breathBuffer = null;
  // The last setAmbientMix(m), applied to every ambience started after it, so
  // a restarted ambience (a mute toggle) keeps the mix she is standing in.
  let ambientMix = null;

  // Master bus, built once on first sound: every node's audio ultimately
  // reaches `master`, then splits into a dry path (comp → destination) and a
  // wet reverb send (wet → reverb → comp), so all sounds share one
  // compressor (glues levels together, avoids clipping) and one generated
  // impulse-response reverb (a little shared space instead of dead-dry
  // beeps).
  let master = null;
  let comp = null;
  let reverb = null;
  let wet = null;

  // One burst of white noise as long as the longest splash, built on the first
  // splash and shared by every one after it (Polish 3): each splash plays the start
  // of it and stops at its own length, so no splash allocates a buffer.
  let splashBuffer = null;
  function splashNoise(ac) {
    if (splashBuffer) return splashBuffer;
    let longest = 0;
    for (const k of Object.keys(WATER_SPLASHES)) longest = Math.max(longest, WATER_SPLASHES[k].dur);
    const size = Math.ceil(ac.sampleRate * longest);
    splashBuffer = ac.createBuffer(1, size, ac.sampleRate);
    const data = splashBuffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return splashBuffer;
  }

  function buildImpulse(ac) {
    const len = Math.floor(ac.sampleRate * 1.2);
    const buffer = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    return buffer;
  }

  function ensure() {
    if (!ctx) ctx = contextFactory();
    if (!master) {
      // Created FIRST so it's unambiguously the "first gain node" — tests
      // and any future debugging rely on that ordering to find the master.
      master = ctx.createGain();
      master.gain.value = volume;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 20;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.2;
      reverb = ctx.createConvolver();
      reverb.buffer = buildImpulse(ctx);
      wet = ctx.createGain();
      wet.gain.value = 0.16;
      master.connect(comp).connect(ctx.destination);
      master.connect(wet).connect(reverb).connect(comp);
    }
    return ctx;
  }

  // `attack` (seconds) ramps the gain up from silence instead of starting at
  // full gain; 0 (every caller but the cave drips) is the old hard start.
  function tone(freq, dur, { type = 'sine', gain = 0.12, slideTo = null, delay = 0, attack = 0 } = {}) {
    if (muted) return;
    const ac = ensure();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    const t0 = ac.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
    if (attack > 0) {
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + attack);
    } else {
      g.gain.setValueAtTime(gain, t0);
    }
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // A "vocal" note: sawtooth source → swept bandpass (the vowel) → gain
  // envelope, with a gentle vibrato LFO on the source pitch. This is what
  // makes it read as an animal instead of a slide whistle.
  function vocal({ f0, f1, f2, filt0, filt1, dur, gain, delay = 0, vibrato = 6.5 }) {
    if (muted) return;
    const ac = ensure();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.35); // rise: "mee"
    osc.frequency.linearRampToValueAtTime(f2, t0 + dur);        // fall: "ow"
    const vib = ac.createOscillator();
    const vibGain = ac.createGain();
    vib.frequency.value = vibrato;
    vibGain.gain.value = f0 * 0.035;
    vib.connect(vibGain).connect(osc.frequency);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(filt0, t0);
    bp.frequency.linearRampToValueAtTime(filt1, t0 + dur);
    const g = ac.createGain();
    // exponentialRampToValueAtTime throws a synchronous RangeError on a
    // non-positive target — clamp away from zero since `gain` here is
    // caller/data-driven (volume * voice.gain), unlike tone()'s constants.
    const amp = Math.max(gain, 0.0001);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(bp).connect(g).connect(master);
    osc.start(t0); vib.start(t0);
    osc.stop(t0 + dur + 0.05); vib.stop(t0 + dur + 0.05);
  }

  // The layered meow: a sawtooth with an octave and a twelfth over it, all on
  // one pitch contour and vibrato, through two vowel bands (F1 + F2) that sweep
  // from 'ee' to 'ow', plus a short breath of filtered noise.
  function meowVoice(P) {
    if (muted) return;
    const ac = ensure();
    const t0 = ac.currentTime;
    const { dur } = P;
    const [a, b, c] = P.f;
    const mix = ac.createGain();
    const amp = P.amp;
    mix.gain.setValueAtTime(0.0001, t0);
    mix.gain.exponentialRampToValueAtTime(amp, t0 + 0.035);
    mix.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    mix.connect(master);
    const vib = ac.createOscillator();
    vib.frequency.value = P.vib;
    const stops = [vib];
    // two vowel bands in parallel; F2 quieter
    const bands = [[P.f1, 4, 1], [P.f2, 5, 0.45]].map(([sw, q, lvl]) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(sw[0], t0);
      bp.frequency.linearRampToValueAtTime(sw[1], t0 + dur);
      const bg = ac.createGain();
      bg.gain.value = lvl;
      bp.connect(bg).connect(mix);
      return bp;
    });
    [['sawtooth', 1, 1], ['sawtooth', 2, 0.3], ['sine', 3, 0.12]].forEach(([type, mul, lvl]) => {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(a * mul, t0);
      o.frequency.linearRampToValueAtTime(b * mul, t0 + dur * P.peakAt);
      o.frequency.linearRampToValueAtTime(c * mul, t0 + dur);
      const vg = ac.createGain();
      vg.gain.value = a * mul * P.vd;
      vib.connect(vg).connect(o.frequency);
      const lg = ac.createGain();
      lg.gain.value = lvl * 0.8;
      o.connect(lg);
      for (const bp of bands) lg.connect(bp);
      o.start(t0); o.stop(t0 + dur + 0.05);
    });
    vib.start(t0); vib.stop(t0 + dur + 0.05);
    // the breath: a short puff of high noise at the start and a little at the tail
    if (!breathBuffer) {
      const n = Math.floor(ac.sampleRate * 0.5);
      breathBuffer = ac.createBuffer(1, n, ac.sampleRate);
      const d = breathBuffer.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    const ns = ac.createBufferSource();
    ns.buffer = breathBuffer;
    const nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.max(1500, P.f2[0]);
    nf.Q.value = 0.8;
    const ng = ac.createGain();
    const bl = amp * P.breath;
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(bl, t0 + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0005, t0 + Math.min(dur, 0.18));
    ns.connect(nf).connect(ng).connect(mix);
    ns.start(t0); ns.stop(t0 + Math.min(dur, 0.5));
  }

  // --- Ambient layers -------------------------------------------------
  // Each builder below returns { stop() } and connects its own audio graph
  // to `master` (never straight to ac.destination), same as tone()/vocal().
  // startAmbient() composes a set of these per area/weather/dusk and keeps
  // them in `ambient` (an array) so stopAmbient() can tear every one down —
  // no leaked intervals or dangling buffer sources across walks.
  // A layer may also return mix(m): setAmbientMix(m) hands it the area's live
  // mix (the Gorge's { high, cave }: high 0 on the floor to 1 on the
  // clifftop, cave 0 outside to 1 at a cave's far end). A layer
  // without one ignores it, so every other area sounds as it always has.

  function loopedNoiseSource(durationSec) {
    const ac = ensure();
    const size = Math.floor(ac.sampleRate * durationSec);
    const buffer = ac.createBuffer(1, size, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  // filtered looping noise swelled by a slow LFO = waves. Seaside only.
  function wavesLayer() {
    const ac = ensure();
    const src = loopedNoiseSource(2);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const g = ac.createGain();
    // Routed through the master bus, so this long-lived node stays in sync
    // with any later setVolume() call instead of freezing at the volume
    // factor present when it started.
    g.gain.value = 0.05;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.14;
    lfoGain.gain.value = 0.035;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(master);
    src.start();
    lfo.start();
    return { stop: () => { src.stop(); lfo.stop(); } };
  }

  // Same technique as wavesLayer, but lower-passed and much quieter — a
  // soft backdrop for neighborhood/park walks.
  // gain and cutoff default to the generic wind, so every existing area sounds
  // the same; the Moor passes a stronger, brighter one. `scale(m)`, when given,
  // multiplies the gain by the live mix (the Gorge's wind rises up high).
  function windLayer({ gain = 0.03, cutoff = 300, scale = null } = {}) {
    const ac = ensure();
    const src = loopedNoiseSource(2);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = gain;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.07;
    const swell = 0.012;
    lfoGain.gain.value = swell;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(master);
    src.start();
    lfo.start();
    return withMix({ stop: () => { src.stop(); lfo.stop(); } }, [[g.gain, gain], [lfoGain.gain, swell]], scale);
  }

  // A mix(m) for a layer whose level follows the live mix; none without a
  // scale. `params` is [[AudioParam, base], ...]: the gain AND the LFO's
  // depth, so the swell scales with the level and never swings through zero.
  function withMix(layer, params, scale) {
    if (scale) layer.mix = (m) => { const k = scale(m); for (const [p, base] of params) p.value = base * k; };
    return layer;
  }

  // Looping noise band-passed to a hiss = rain wash.
  function rainLayer() {
    const ac = ensure();
    const src = loopedNoiseSource(2);
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 400;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    const g = ac.createGain();
    g.gain.value = 0.045;
    src.connect(hp).connect(lp).connect(g).connect(master);
    src.start();
    return { stop: () => src.stop() };
  }

  // Bog frogs: now and then two low square-wave croaks, well under the 1500 Hz
  // where birdsong starts, so a swamp never sounds like a hedge.
  function frogLayer() {
    const id = setInterval(() => {
      if (!muted && Math.random() < 0.4) {
        tone(180 + Math.random() * 60, 0.09, { type: 'square', gain: 0.016, slideTo: 140 });
        tone(180 + Math.random() * 60, 0.09, { type: 'square', gain: 0.016, slideTo: 140, delay: 0.13 });
      }
    }, 3200);
    return { stop: () => clearInterval(id) };
  }

  // Occasional distant birdsong. Seaside doesn't use this (gulls instead);
  // callers also skip it during rain/dusk (birds go quiet).
  function birdsongLayer() {
    const id = setInterval(() => {
      if (!muted && Math.random() < 0.45) {
        tone(1500 + Math.random() * 700, 0.1, { gain: 0.025, slideTo: 1900 });
        tone(1700 + Math.random() * 500, 0.08, { gain: 0.02, delay: 0.14 });
      }
    }, 2600);
    return { stop: () => clearInterval(id) };
  }

  // Occasional gull cries: two descending sawtooth "calls" 0.3s apart, on a
  // randomized 6–14s cadence. Seaside only.
  function gullLayer() {
    let id = null;
    const schedule = () => {
      const wait = 6000 + Math.random() * 8000;
      id = setTimeout(() => {
        if (!muted && Math.random() < 0.45) {
          tone(1400, 0.25, { type: 'sawtooth', gain: 0.02, slideTo: 900 });
          tone(1400, 0.25, { type: 'sawtooth', gain: 0.02, slideTo: 900, delay: 0.3 });
        }
        schedule();
      }, wait);
    };
    schedule();
    return { stop: () => clearTimeout(id) };
  }

  // Water slapping against pilings — the Docks' base layer (Task 4.0). Same
  // noise → lowpass → LFO'd gain shape as wavesLayer, retuned for a canal
  // rather than an open shore: the cutoff sits lower (260Hz vs 420) so there
  // is no surf hiss, and the LFO runs faster with a deeper swing (0.26Hz /
  // 0.03 on a 0.038 floor) so it reads as short chop slapping woodwork
  // instead of long rollers arriving. Quieter than the seaside too — the
  // canal is a narrow strip of water, not the sea. `scale(m)` as windLayer's
  // (the Gorge's stream fades as she climbs away from it).
  function waterLapLayer({ scale = null } = {}) {
    const ac = ensure();
    const src = loopedNoiseSource(2);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    const g = ac.createGain();
    // Through the master bus like every other long-lived layer, so a later
    // setVolume() moves it instead of leaving it frozen at start volume.
    const gain = 0.038;
    g.gain.value = gain;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.26;
    const swell = 0.03;
    lfoGain.gain.value = swell;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(master);
    src.start();
    lfo.start();
    return withMix({ stop: () => { src.stop(); lfo.stop(); } }, [[g.gain, gain], [lfoGain.gain, swell]], scale);
  }

  // The Gorge's far cries, from up high only (mix.high over 0.5): about every
  // 9 s a hawk's falling two-tone cry far off, or 1 time in 4 a short nasal
  // bleat from a goat on the crags. Both quiet: they are across the gorge.
  function cryLayer() {
    let high = 0;
    const id = setInterval(() => {
      if (muted || high <= 0.5) return;
      if (Math.random() < 0.25) {
        vocal({ f0: 520, f1: 560, f2: 470, filt0: 1100, filt1: 900, dur: 0.35, gain: 0.03, vibrato: 14 });
      } else {
        tone(2500, 0.45, { type: 'sawtooth', gain: 0.012, slideTo: 1700 });
        tone(2100, 0.5, { type: 'sawtooth', gain: 0.01, slideTo: 1400, delay: 0.5 });
      }
    }, 9000);
    return { stop: () => clearInterval(id), mix: (m) => { high = m.high ?? 0; } };
  }

  // Gorge part 3 (C7): soft drips in a cave. A high plink at random gaps of
  // 0.8-2.2 s, never a beat, at gain 0.02 x mix.cave: silent while cave is 0
  // (everywhere outside a cave), and never louder than 0.02, each fading in
  // over DRIP_ATTACK (review M1). Math.random is right here: audio is
  // per-device and never on the wire.
  const DRIP_ATTACK = 0.008; // seconds: a soft start, never a click
  function dripLayer() {
    let cave = 0;
    let id = null;
    let stopped = false;
    const schedule = () => {
      id = setTimeout(() => {
        if (stopped) return;
        if (!muted && cave > 0) tone(1800 + 600 * Math.random(), 0.05, { gain: 0.02 * cave, attack: DRIP_ATTACK });
        schedule();
      }, 800 + Math.random() * 1400);
    };
    schedule();
    return {
      stop: () => { stopped = true; clearTimeout(id); },
      mix: (m) => { cave = Math.min(1, Math.max(0, m.cave ?? 0)); },
    };
  }

  // A distant ship's horn — the Docks' signature (Task 4.0). Two long low
  // triangle tones a fifth apart, the upper one quieter, both sagging in
  // pitch as they fade: that beat between the two is what makes a horn read
  // as a horn rather than as a bass note. Deliberately RARE (24–52s, and
  // only a 55% chance when the timer fires) and very quiet — it is a sound
  // from across the water, and a foghorn on a short loop would be
  // unbearable on a long walk. Same self-rescheduling setTimeout shape as
  // gullLayer, so the cadence never locks into a metronome.
  function hornLayer() {
    let id = null;
    const schedule = () => {
      const wait = 24000 + Math.random() * 28000;
      id = setTimeout(() => {
        if (!muted && Math.random() < 0.55) {
          tone(108, 1.6, { type: 'triangle', gain: 0.03, slideTo: 96 });
          tone(162, 1.5, { type: 'triangle', gain: 0.014, slideTo: 146, delay: 0.05 });
        }
        schedule();
      }, wait);
    };
    schedule();
    return { stop: () => clearTimeout(id) };
  }

  // Fireplace crackle — the den's only ambience (Task 7.2): looped noise
  // narrowed to a warm low-mid band, with a slow randomized LFO on the gain
  // so it swells and settles like an actual fire instead of a flat hiss.
  function crackleLayer() {
    const ac = ensure();
    const src = loopedNoiseSource(2);
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const g = ac.createGain();
    g.gain.value = 0.03;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    // "slow random-ish": a low, non-round frequency so the swell doesn't
    // read as a metronomic pulse the way a clean 0.1Hz LFO would.
    lfo.frequency.value = 0.37;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(bp).connect(g).connect(master);
    src.start();
    lfo.start();
    return { stop: () => { src.stop(); lfo.stop(); } };
  }

  // Rapid triple-tick crickets on a fixed 700ms cadence. Dusk only, any
  // area — layered on top of whichever base layers are already playing.
  function cricketLayer() {
    const id = setInterval(() => {
      if (!muted && Math.random() < 0.7) {
        for (let i = 0; i < 3; i++) {
          tone(4200, 0.02, { gain: 0.012, delay: i * 0.045 });
        }
      }
    }, 700);
    return { stop: () => clearInterval(id) };
  }

  const api = {
    // Exposes the (lazily-built) AudioContext for src/samples.js's decode
    // hook: `audio.getContext().decodeAudioData(arrayBuffer)`. Calling this
    // builds the master bus via ensure() if it hasn't been already, same as
    // every other sound-producing call here — decoding doesn't need the bus,
    // but there's no separate "just the context" path and this keeps the one
    // ctx/master pair consistent no matter what triggers its creation first.
    getContext() {
      return ensure();
    },
    // Exposes the master gain node itself (built by ensure(), same lazy
    // trigger as getContext()) so a separate subsystem — src/music.js's
    // createMusic() — can connect its own gain node straight into the
    // shared bus. setVolume() writes master.gain.value directly, so it
    // automatically scales music along with every other sound routed through
    // here — no extra wiring needed for volume. setMuted() does NOT reach
    // music for free, though: it never touches master.gain, it only gates
    // this module's own tone()/vocal()/purr() calls (see setMuted() below).
    // main.js's applySettings() covers the gap by also calling
    // music.setMuted() directly.
    getMaster() {
      ensure();
      return master;
    },
    // Plays a pre-decoded sample buffer (a real recorded pet voice) through
    // the same master bus as every synth sound — so recorded and synth
    // voices share the compressor + reverb send and respond to the same
    // setVolume()/setMuted() controls. rate drives BufferSource.playbackRate
    // (main.js randomizes this slightly per-call so repeats don't sound
    // identical); volume is a 0..1 multiplier on top of a fixed ~0.5 "voice"
    // level, matched roughly to meow()'s amp so samples and synth don't jump
    // in loudness when a family recording is added later.
    playBuffer(audioBuffer, { rate = 1, volume = 1 } = {}) {
      if (muted || !audioBuffer) return;
      const ac = ensure();
      const src = ac.createBufferSource();
      src.buffer = audioBuffer;
      src.playbackRate.value = rate;
      const g = ac.createGain();
      g.gain.value = 0.5 * volume;
      src.connect(g).connect(master);
      src.start();
    },
    // settings.muted is the single source of truth (main.js's M key and the
    // homebase mute checkbox both write settings then call this) — audio
    // itself no longer owns a toggle, it just applies what it's told. This
    // only gates THIS module's own tone()/vocal()/purr() calls and ambient
    // loops — it never touches master.gain, so it does nothing for
    // src/music.js's generative music. That has its own setMuted(), called
    // separately by main.js's applySettings().
    setMuted(v) {
      muted = !!v;
      if (muted) api.stopAmbient();
    },
    isMuted: () => muted,
    // 0..1 master factor applied live at the master gain node — affects
    // every currently-playing and future sound immediately, including
    // long-lived ambient loops.
    setVolume(v) {
      volume = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : volume;
      if (master) master.gain.value = volume;
    },
    // volume: 0..1 multiplier applied to every tone's gain (default 1 = full
    // volume, used for the local cat's own voice); co-walk remote meows scale
    // this down by distance so far-off pets sound farther away.
    // pitch: multiplier applied to every tone frequency (default 1 = normal
    // pitch); co-walk duets layer a second voice at pitch 1.26 (+4 semitones)
    // on top of the normal-pitch voice to sound harmonized rather than just louder.
    cluck(volume = 1, pitch = 1) {
      tone(700 * pitch, 0.08, { type: 'square', gain: 0.07 * volume, slideTo: 500 * pitch });
      tone(650 * pitch, 0.1, { type: 'square', gain: 0.06 * volume, slideTo: 420 * pitch, delay: 0.12 });
      tone(760 * pitch, 0.07, { type: 'square', gain: 0.05 * volume, slideTo: 520 * pitch, delay: 0.26 });
    },
    // A rooster's crow, Hagrid's other call: "cuh-cuh-CUH-doooo", four notes
    // in about 1.1 s. Same square/vocal synth family as cluck; always bounded.
    crow(volume = 1, pitch = 1) {
      if (muted) return;
      for (const [f0, f1, f2, filt, dur, delay, g] of CROW_NOTES) {
        vocal({ f0: f0 * pitch, f1: f1 * pitch, f2: f2 * pitch, filt0: filt * pitch, filt1: filt * 1.3 * pitch, dur, gain: g * volume, delay, vibrato: 8 });
      }
    },
    // kind (optional): 'meow' (default), 'call', 'chirp' or 'mew'; see meowParams().
    meow(volume = 1, pitch = 1, voice = {}, kind = 'meow') {
      if (muted) return;
      meowVoice(meowParams(kind, { volume, pitch: pitch * (voice?.pitch ?? 1), rate: voice?.rate ?? 1, gain: voice?.gain ?? 1 }));
      try { voiceHook?.(); } catch { /* music is optional */ }
    },
    setVoiceHook(fn) { voiceHook = typeof fn === 'function' ? fn : null; },
    trill(volume = 1, pitch = 1) {
      // "brrrup?" — short rising note with a fast pitch wobble
      vocal({ f0: 340 * pitch, f1: 560 * pitch, f2: 620 * pitch, filt0: 900 * pitch, filt1: 1400 * pitch, dur: 0.28, gain: 0.1 * volume, vibrato: 26 });
    },
    purr(duration = 1.2) {
      if (muted) return;
      const ac = ensure();
      const t0 = ac.currentTime;
      // low rumble: filtered noise + a low sine, both amplitude-wobbled at ~25Hz
      const size = Math.floor(ac.sampleRate * duration);
      const buffer = ac.createBuffer(1, size, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 220;
      const rumble = ac.createOscillator();
      rumble.type = 'sine'; rumble.frequency.value = 52;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.11, t0 + 0.15);
      g.gain.setValueAtTime(0.11, t0 + duration - 0.25);
      g.gain.linearRampToValueAtTime(0.0001, t0 + duration);
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 25;
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(g.gain);
      src.connect(lp).connect(g).connect(master);
      rumble.connect(g);
      src.start(t0); rumble.start(t0); lfo.start(t0);
      src.stop(t0 + duration); rumble.stop(t0 + duration); lfo.stop(t0 + duration);
    },
    bell() {
      tone(1800, 0.14, { gain: 0.045 });
      tone(2400, 0.1, { gain: 0.03, delay: 0.02 });
    },
    chime() {
      tone(880, 0.12, { gain: 0.07 });
      tone(1320, 0.18, { gain: 0.07, delay: 0.1 });
    },
    // Appletree Farm (farmanimals.js). A cow's moo: one long low voice that
    // rises a little and sags, soft at both ends. Friendly, never sudden.
    moo(volume = 1) {
      vocal({ f0: 118, f1: 152, f2: 104, filt0: 420, filt1: 300, dur: 1.15, gain: 0.13 * volume, vibrato: 4 });
    },
    // A goat's short nasal "meh".
    bleat(volume = 1) {
      vocal({ f0: 430, f1: 470, f2: 390, filt0: 1300, filt1: 1000, dur: 0.38, gain: 0.07 * volume, vibrato: 16 });
    },
    // A chick's or a duckling's peep: two tiny rising notes.
    peep(volume = 1) {
      tone(2600, 0.06, { gain: 0.03 * volume, slideTo: 3300 });
      tone(2800, 0.06, { gain: 0.025 * volume, slideTo: 3500, delay: 0.11 });
    },
    // The Old House's quiet ambience (housesound.js): a clock's click, a stair's creak.
    tick(volume = 1) {
      const v = Math.max(0, Math.min(1, volume));
      if (v > 0) tone(2200, 0.03, { gain: 0.012 * v });
    },
    creak(volume = 1) {
      const v = Math.max(0, Math.min(1, volume));
      if (v > 0) tone(170, 0.35, { type: 'sawtooth', gain: 0.018 * v, slideTo: 130 });
    },
    // The Fairground's music box (fairlive.js): one small bright note, with a
    // softer octave above it. Quiet: it plays for as long as she is near.
    musicBoxNote(freq, volume = 1) {
      const v = Math.max(0, Math.min(1, volume));
      if (v <= 0) return;
      tone(freq, 0.5, { type: 'triangle', gain: 0.028 * v, attack: 0.004 });
      tone(freq * 2, 0.22, { gain: 0.008 * v, attack: 0.004 });
    },
    // The Fairground's calliope (fairlive.js MIDWAY): an oom-pah-pah for one
    // bar of three beats. A low note, then the two notes of its chord twice
    // (`beat` seconds apart): bright, reedy, quiet, and none at volume 0.
    calliope(freq, chord = [], volume = 1, beat = 0.26) {
      const v = Math.max(0, Math.min(1, Number(volume) || 0));
      if (v <= 0 || muted) return;
      tone(freq, 0.3, { type: 'sawtooth', gain: 0.014 * v, attack: 0.01 });
      for (let b = 1; b <= 2; b++) {
        for (const f of chord) tone(f, 0.18, { type: 'square', gain: 0.0045 * v, attack: 0.01, delay: b * beat });
      }
    },
    // A crowd's murmur: a swell of band-passed noise, low and short.
    crowdMurmur(volume = 1) {
      const v = Math.max(0, Math.min(1, Number(volume) || 0));
      if (v <= 0 || muted) return;
      const ac = ensure();
      const src = ac.createBufferSource();
      src.buffer = splashNoise(ac);
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 520 + Math.random() * 260;
      f.Q.value = 0.9;
      const g = ac.createGain();
      const t0 = ac.currentTime;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.014 * v, t0 + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.6);
      src.connect(f).connect(g).connect(master);
      src.start(t0); src.stop(t0 + 1.7);
    },
    // A ride's bell: two small bright rings.
    rideBell(volume = 1) {
      const v = Math.max(0, Math.min(1, Number(volume) || 0));
      if (v <= 0 || muted) return;
      for (const d of [0, 0.16]) {
        tone(1900, 0.5, { gain: 0.02 * v, attack: 0.002, delay: d });
        tone(2850, 0.3, { gain: 0.008 * v, attack: 0.002, delay: d });
      }
    },
    // A short tune on the music box (the birthday song, src/birthdaysong.js):
    // notes [{ at, freq, dur }], `at` seconds from now. Each is musicBoxNote's
    // shape, a touch louder because it is the thing to hear. Muted, or at
    // volume 0, nothing is made. Called from a tap: a context the browser
    // still holds (suspended, or iOS's interrupted) is asked to start, and
    // the notes are laid down once it runs, never queued to burst out later.
    // Returns how many notes it plays.
    playTune(notes, volume = 1) {
      const v = Math.max(0, Math.min(1, Number(volume) || 0));
      if (muted || v <= 0 || !Array.isArray(notes)) return 0;
      const good = notes.filter((n) => n && Number.isFinite(n.freq) && Number.isFinite(n.at));
      const ac = ensure();
      const lay = () => {
        if (muted) return;
        for (const note of good) {
          const dur = Number.isFinite(note.dur) ? note.dur : 0.5;
          tone(note.freq, dur, { type: 'triangle', gain: 0.06 * v, attack: 0.004, delay: note.at });
          tone(note.freq * 2, Math.min(0.25, dur), { gain: 0.016 * v, attack: 0.004, delay: note.at });
        }
      };
      if (ac.state === undefined || ac.state === 'running') { lay(); return good.length; }
      try {
        const p = ac.resume?.();
        if (!p || typeof p.then !== 'function') return 0;
        p.then(() => { if (ac.state === 'running') lay(); }, () => {});
      } catch { return 0; }
      return good.length;
    },
    bark() {
      tone(230, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 140 });
      tone(210, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 120, delay: 0.18 });
    },
    // v20 "Ruffled Fur" — a cross cat's hiss.
    //
    // Pure noise, no oscillator. A hiss is turbulent air, not a pitched
    // voice: bark() and meow() both start from an oscillator and would give
    // this a note, which is exactly what makes a cartoon "grrr" instead of a
    // cat. So it reuses loopedNoiseSource (the module's one noise generator,
    // already the source of the rain wash's hiss) and shapes it with filters,
    // the same way rainLayer does — band-limited white noise IS the sound.
    // `loop` is switched off because this is a one-shot; the source is stopped
    // at `dur` regardless, but leaving loop on would be a lie about intent.
    //
    // WHY IT IS NOT FRIGHTENING — this is a cosy game for ten-to-twelve-year-
    // olds, and a cross cat has to land as "back off" rather than as a jump
    // scare. Four deliberate choices, all of them costing tension on purpose:
    //
    //   * NO LOW END. The highpass at 1.6kHz strips everything a growl lives
    //     in. Low frequencies are what make an animal sound big and close;
    //     without them this reads as air, not as threat. It is the single
    //     most important number here.
    //   * SOFT ATTACK. 60ms of ramp-in rather than an instant transient. A
    //     sharp onset is what makes a sound startle; a swell cannot.
    //   * SHORT. 0.36s, in the same range as pounceWhoosh (0.18) and zoomWind
    //     (0.25) — over before it can build dread, and short enough to be
    //     retriggered by the scuffle without turning into a drone.
    //   * QUIET. The gain reads 0.11, but loopedNoiseSource pre-scales its
    //     buffer to +/-0.3, so the effective peak is ~0.033 — between
    //     zoomWind (0.02) and pounceWhoosh (0.04), and a third of bark()'s
    //     0.09. The dog stays the loud hostile sound in this game.
    //
    // The bandpass falls 3.4kHz → 2.3kHz across the sound, which is simply
    // what breath running out does; a rising sweep would read as a kettle.
    //
    // `volume` matches the cluck/meow signature (0..1, default 1 = full) so
    // a caller can scale a distant cat's hiss down. Muted and setVolume are
    // both honoured for free: the early return covers mute, and the whole
    // graph terminates at the shared master bus like every other sound.
    hiss(volume = 1) {
      if (muted) return;
      const ac = ensure();
      const dur = 0.36;
      const src = loopedNoiseSource(dur);
      src.loop = false;
      const hp = ac.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1600;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      // A broad Q: a narrow one whistles, and a whistling cat is a kettle.
      bp.Q.value = 0.8;
      const t0 = ac.currentTime;
      bp.frequency.setValueAtTime(3400, t0);
      bp.frequency.linearRampToValueAtTime(2300, t0 + dur);
      const g = ac.createGain();
      // Linear ramps throughout (not exponential): the gentle swell in and
      // the fade out are the whole point, and exponential curves would put
      // the energy at the edges where a startle lives.
      const amp = 0.11 * Math.min(1, Math.max(0, volume));
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.06);
      g.gain.setValueAtTime(amp, t0 + dur * 0.45);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      src.connect(hp).connect(bp).connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + dur);
    },
    shutter() {
      tone(1300, 0.03, { type: 'square', gain: 0.09 });
      tone(700, 0.04, { type: 'square', gain: 0.07, delay: 0.05 });
    },
    collectArp() {
      tone(660, 0.09, { type: 'triangle', gain: 0.07 });
      tone(880, 0.09, { type: 'triangle', gain: 0.07, delay: 0.07 });
      tone(1320, 0.16, { type: 'triangle', gain: 0.08, delay: 0.14 });
    },
    // Soft wind whoosh fired once on the transition into zoomies: a short
    // noise burst narrowed to a mid-band "shhh" by the bandpass, quiet enough
    // to sit under everything else (gain 0.02, vs. e.g. bell's 0.045).
    zoomWind() {
      if (muted) return;
      const ac = ensure();
      const dur = 0.25;
      const size = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, size, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 1;
      const g = ac.createGain();
      g.gain.value = 0.02;
      src.connect(bp).connect(g).connect(master);
      const t0 = ac.currentTime;
      src.start(t0);
      src.stop(t0 + dur);
    },
    // Short noise burst swept through a narrowing bandpass (700→300Hz) —
    // the "whoosh" of a pounce launch. Quiet (gain 0.04) so it sits under
    // the meow/trill that often follows.
    pounceWhoosh() {
      if (muted) return;
      const ac = ensure();
      const dur = 0.18;
      const size = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, size, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      const t0 = ac.currentTime;
      bp.frequency.setValueAtTime(700, t0);
      bp.frequency.linearRampToValueAtTime(300, t0 + dur);
      const g = ac.createGain();
      g.gain.value = 0.04;
      src.connect(bp).connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + dur);
    },
    // Swimming (Task 6): soft water sounds, each a short noise burst through
    // a bandpass into the master bus. 'wade' is a stride in the shallows,
    // 'paddle' a deep-water stroke (lower, slower), and 'shake' the shake-dry
    // on climbing out: a brighter hiss fluttered on and off 8 times (16 Hz),
    // so it reads as droplets flung off rather than one long splash. An
    // unknown kind does nothing.
    waterSplash(kind) {
      const spec = Object.hasOwn(WATER_SPLASHES, kind) ? WATER_SPLASHES[kind] : null;
      if (!spec || muted) return;
      const ac = ensure();
      const { dur } = spec;
      const src = ac.createBufferSource();
      src.buffer = splashNoise(ac);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      const t0 = ac.currentTime;
      bp.frequency.setValueAtTime(spec.from, t0);
      if (spec.to !== spec.from) bp.frequency.linearRampToValueAtTime(spec.to, t0 + dur);
      const g = ac.createGain();
      if (spec.flutter) {
        const step = dur / spec.flutter;
        g.gain.setValueAtTime(0, t0);
        for (let i = 0; i < spec.flutter; i++) {
          g.gain.setValueAtTime(spec.gain, t0 + i * step);
          g.gain.setValueAtTime(0, t0 + (i + 0.5) * step);
        }
      } else {
        g.gain.value = spec.gain;
      }
      src.connect(bp).connect(g).connect(master);
      src.start(t0);
      src.stop(t0 + dur);
    },
    // Her birthday fireworks (world/birthdaygathering.js): a soft, far-off
    // boom and a little crackle. Through the master, so the sound switch
    // and the volume hold it like every other sound.
    firework() {
      tone(70, 0.45, { type: 'sine', gain: 0.07, slideTo: 38 });
      tone(1800, 0.05, { gain: 0.012, delay: 0.12 });
      tone(2300, 0.04, { gain: 0.01, delay: 0.2 });
      tone(1500, 0.05, { gain: 0.01, delay: 0.29 });
    },
    // Low thud on landing after a pounce.
    landThump() {
      tone(90, 0.1, { type: 'sine', gain: 0.08, slideTo: 55 });
    },
    // Near-subliminal footstep tick while walking/running.
    step() {
      tone(1900, 0.012, { gain: 0.006 });
    },
    fanfare() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, i === 3 ? 0.35 : 0.12, { type: 'triangle', gain: 0.09, delay: i * 0.11 }));
    },
    // v18 Task 2.7 — the in-walk skill-unlock celebration.
    //
    // Deliberately fanfare()'s shape rather than a new sound: the jackpot
    // fanfare is already the game's "you did the big thing" noise, and
    // earning an ability should land in the same emotional register a player
    // has learnt. Same C-major triangle arpeggio, same 0.09 gain, extended
    // one scale step to E6 and held longer on the top note, then a two-note
    // sine sparkle over the tail so it is recognisably the fanfare's bigger
    // sibling rather than a second, unrelated jingle.
    unlockFanfare() {
      const notes = [523, 659, 784, 1047, 1319];
      const last = notes.length - 1;
      notes.forEach((f, i) => tone(f, i === last ? 0.5 : 0.12, { type: 'triangle', gain: 0.09, delay: i * 0.1 }));
      tone(2093, 0.3, { type: 'sine', gain: 0.05, delay: 0.52 });
      tone(1568, 0.32, { type: 'sine', gain: 0.04, delay: 0.6 });
    },
    // v18 Whisker Sense ('whisker-sense') — the "ping" half of the ability's
    // shimmer/ping. Two short high sines, quiet enough (0.035 / 0.028) to sit
    // under ambience the way bell() does, because this repeats on a timer
    // while a golden mouse is near rather than firing once on an action.
    //
    // `closeness` runs 0 (at the edge of Whisker Sense's range) to 1 (right
    // on top of the mouse) and lifts the pitch by up to a fifth, so the
    // player can hear themselves getting warmer without reading a number.
    whiskerPing(closeness = 0) {
      const k = 1 + Math.max(0, Math.min(1, closeness)) * 0.5;
      tone(1500 * k, 0.06, { type: 'sine', gain: 0.035 });
      tone(2200 * k, 0.09, { type: 'sine', gain: 0.028, delay: 0.06 });
    },
    // Found outfits: "a soft chime when she is within about 6 m" of the walk's
    // find (src/foundwear/live.js). Three rising sines (G6, B6, D7), each
    // 0.16 s and 0.09 s apart, at 0.03: under chime()'s 0.07, a hint, never
    // an alarm. It rings once on coming near and again only after she has
    // walked well away (rules.js createChime).
    findChime() {
      [1568, 1976, 2349].forEach((f, i) => tone(f, 0.16, { type: 'sine', gain: 0.03, delay: i * 0.09 }));
    },
    startAmbient(areaKey, { dusk = false, rain = false } = {}) {
      api.stopAmbient();
      if (muted) return;
      const layers = [];
      if (isIndoor(areaKey)) {
        // Indoor (the den, the Old House; indoor.js): just the fireplace,
        // never crickets. Dusk doesn't apply to the den (it never surfaces the
        // dusk toggle), and a house dusk walk lights its lamps but stays
        // indoors, so this stays explicit rather than relying on the caller
        // never passing dusk: true.
        layers.push(crackleLayer());
      } else if (areaKey === 'seaside' || areaKey === 'lighthouse') {
        // Lighthouse Point has the Seaside's surf and gulls (its own bell, horn and echo are the place's, lighthousesound.js).
        layers.push(wavesLayer());
        layers.push(gullLayer());
        // The Lighthouse's headland is windy (beauty pass 2, 2026-11-28): a low sea wind under the surf, its own layer (still muted when muted)
        if (areaKey === 'lighthouse') layers.push(windLayer({ gain: 0.026, cutoff: 360 }));
      } else if (areaKey === 'docks') {
        // v18 Task 4.0. Without this branch the Docks fell through to the
        // generic case below and a NIGHT DOCK PLAYED BIRDSONG. Harbour, not
        // hedgerow: chop against the pilings, the same gulls the seaside
        // uses (they are harbour gulls either side of the headland), and a
        // rare horn from out on the water. Birdsong is never added here at
        // any hour, so unlike the generic branch there is nothing for dusk
        // to have to suppress; crickets still layer on below, as they do
        // for every outdoor area.
        //
        // Rain DOES get its wash here, which the seaside branch above does
        // not do. That is a deliberate divergence rather than a copy slip:
        // adding it to the seaside would change a shipped area's sound,
        // while the Docks has never had ambience at all, so there is no
        // behaviour to preserve — and a rainy dock that sounds identical to
        // a dry one is the same kind of gap as the birdsong this branch
        // exists to fix.
        layers.push(waterLapLayer());
        layers.push(gullLayer());
        layers.push(hornLayer());
        if (rain) layers.push(rainLayer());
      } else if (areaKey === 'river') {
        // The River and Marshes: wind, a quiet water lap under the usual
        // birdsong (owner's decision), and never gulls. Same rain/dusk rule
        // as the generic branch; crickets come from the shared line below.
        layers.push(windLayer());
        layers.push(waterLapLayer());
        if (rain) layers.push(rainLayer());
        else if (!dusk) layers.push(birdsongLayer());
      } else if (areaKey === 'moor') {
        // The Moor: open ground, so a stronger wind (owner's decision), then
        // birdsong or rain by the generic rule. No water, so no lap.
        layers.push(windLayer({ gain: 0.06, cutoff: 480 }));
        if (rain) layers.push(rainLayer());
        else if (!dusk) layers.push(birdsongLayer());
      } else if (areaKey === 'gorge') {
        // The Gorge: wind that rises as she climbs (x2.2 on the clifftop), the
        // stream's lap that fades away above it (x0.2 up there), and the far
        // cries, heard only from up high; gorgelife.js sets the mix from her
        // height. Rain and dusk as the generic branch, but never birdsong.
        // Soft drips by how deep into a cave she is (mix.cave, part 3).
        layers.push(windLayer({ gain: 0.03, cutoff: 300, scale: (m) => 1 + 1.2 * (m.high ?? 0) }));
        layers.push(waterLapLayer({ scale: (m) => 1 - 0.8 * (m.high ?? 0) }));
        layers.push(cryLayer());
        layers.push(dripLayer());
        if (rain) layers.push(rainLayer());
      } else if (areaKey === 'roofs') {
        // The Rooftops: a far town hum (a low wind layer, the quietest of
        // them), and never birdsong at any hour. Rain gets its wash; crickets
        // at dusk come from the shared line below.
        layers.push(windLayer({ gain: 0.022, cutoff: 160 }));
        if (rain) layers.push(rainLayer());
      } else if (areaKey === 'market') {
        // The Market Square: the town's hum (a low wind layer) and the
        // fountain's running water, and never birdsong at any hour. Rain gets
        // its wash; crickets at dusk come from the shared line below.
        layers.push(windLayer({ gain: 0.022, cutoff: 160 }));
        layers.push(waterLapLayer());
        if (rain) layers.push(rainLayer());
      } else if (areaKey === 'greenhouse') {
        // The Greenhouse: the fountain's trickle and a hush of wind; birdsong by day, rain's wash in rain (greenhousesound.js,
        // milestone G5, adds the drips, the sparrow bath and the rain patter on the glass).
        layers.push(windLayer({ gain: 0.03, cutoff: 260 }));
        layers.push(waterLapLayer());
        if (rain) layers.push(rainLayer());
        else if (!dusk) layers.push(birdsongLayer());
      } else if (areaKey === 'crystal') {
        // The Crystal Cave: no wind, birds or crickets; its hum and drips are crystalsound.js's.
      } else if (areaKey === 'snowville') {
        // Snowville: a very soft low hush of snow-wind, never birdsong or crickets (its bells and crunch come with a later milestone).
        layers.push(windLayer({ gain: 0.016, cutoff: 180 }));
      } else if (areaKey === 'moon') {
        // The Moon has no air: nothing here (moonbaselive.js also stops the ambience, but never let wind or crickets start first).
      } else if (areaKey === 'reef') {
        // The Reef, under the sea: a very soft low water hush, never birdsong or crickets (its own sounds are reefsound.js's).
        layers.push(windLayer({ gain: 0.014, cutoff: 120 }));
        layers.push(waterLapLayer());
      } else if (areaKey === 'pines') {
        // The Pines and Swamp: a low hush of wind and the bog frogs, never
        // birdsong at any hour. Crickets at dusk come from the shared line.
        layers.push(windLayer({ gain: 0.035, cutoff: 220 }));
        layers.push(frogLayer());
        if (rain) layers.push(rainLayer());
      } else {
        layers.push(windLayer());
        // Birdsong is suppressed when it's raining (rainLayer takes its
        // place) or at dusk (birds have gone quiet, crickets take over).
        if (rain) layers.push(rainLayer());
        else if (!dusk) layers.push(birdsongLayer());
      }
      if (dusk && !isIndoor(areaKey) && areaKey !== 'crystal' && areaKey !== 'reef' && areaKey !== 'moon' && areaKey !== 'snowville') layers.push(cricketLayer());
      if (ambientMix) for (const layer of layers) layer.mix?.(ambientMix);
      ambient = layers;
    },
    // The live mix for the ambience now playing (the Gorge's { high, cave }): each
    // layer that has a mix(m) follows it; the rest ignore it.
    setAmbientMix(m) {
      ambientMix = m;
      for (const layer of ambient ?? []) layer.mix?.(m);
    },
    stopAmbient() {
      if (ambient) {
        for (const layer of ambient) layer.stop();
        ambient = null;
      }
    },
  };
  return api;
}
