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

  function tone(freq, dur, { type = 'sine', gain = 0.12, slideTo = null, delay = 0 } = {}) {
    if (muted) return;
    const ac = ensure();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    const t0 = ac.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
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

  // --- Ambient layers -------------------------------------------------
  // Each builder below returns { stop() } and connects its own audio graph
  // to `master` (never straight to ac.destination), same as tone()/vocal().
  // startAmbient() composes a set of these per area/weather/dusk and keeps
  // them in `ambient` (an array) so stopAmbient() can tear every one down —
  // no leaked intervals or dangling buffer sources across walks.

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
  function windLayer() {
    const ac = ensure();
    const src = loopedNoiseSource(2);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const g = ac.createGain();
    g.gain.value = 0.03;
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(filter).connect(g).connect(master);
    src.start();
    lfo.start();
    return { stop: () => { src.stop(); lfo.stop(); } };
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
    // shared bus. That keeps generative music behind the same
    // volume/mute/compressor/reverb chain as every other sound here with no
    // extra wiring: setMuted()/setVolume() already reach it via `master`.
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
    // itself no longer owns a toggle, it just applies what it's told.
    setMuted(v) {
      muted = !!v;
      if (muted) api.stopAmbient();
    },
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
    meow(volume = 1, pitch = 1, voice = {}) {
      const p = pitch * (voice.pitch ?? 1);
      const dur = 0.5 / (voice.rate ?? 1);
      const amp = 0.16 * volume * (voice.gain ?? 1);
      vocal({ f0: 300 * p, f1: 520 * p, f2: 240 * p, filt0: 1150 * p, filt1: 620 * p, dur, gain: amp });
    },
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
    bark() {
      tone(230, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 140 });
      tone(210, 0.12, { type: 'sawtooth', gain: 0.09, slideTo: 120, delay: 0.18 });
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
    startAmbient(areaKey, { dusk = false, rain = false } = {}) {
      api.stopAmbient();
      if (muted) return;
      const layers = [];
      if (areaKey === 'den') {
        // Indoor: just the fireplace, never crickets (dusk doesn't apply to
        // the den — it never surfaces the dusk toggle — but this stays
        // explicit rather than relying on the caller never passing dusk: true).
        layers.push(crackleLayer());
      } else if (areaKey === 'seaside') {
        layers.push(wavesLayer());
        layers.push(gullLayer());
      } else {
        layers.push(windLayer());
        // Birdsong is suppressed when it's raining (rainLayer takes its
        // place) or at dusk (birds have gone quiet, crickets take over).
        if (rain) layers.push(rainLayer());
        else if (!dusk) layers.push(birdsongLayer());
      }
      if (dusk && areaKey !== 'den') layers.push(cricketLayer());
      ambient = layers;
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
