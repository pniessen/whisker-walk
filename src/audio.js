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

  const api = {
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
    fanfare() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, i === 3 ? 0.35 : 0.12, { type: 'triangle', gain: 0.09, delay: i * 0.11 }));
    },
    startAmbient(areaKey) {
      if (muted) return;
      const ac = ensure();
      api.stopAmbient();
      if (areaKey === 'seaside') {
        // filtered looping noise swelled by an LFO = waves
        const size = ac.sampleRate * 2;
        const buffer = ac.createBuffer(1, size, ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        const src = ac.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        const filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const g = ac.createGain();
        // Routed through the master bus, so this long-lived node stays in
        // sync with any later setVolume() call instead of freezing at the
        // volume factor present when it started.
        g.gain.value = 0.05;
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        lfo.frequency.value = 0.14;
        lfoGain.gain.value = 0.035;
        lfo.connect(lfoGain).connect(g.gain);
        src.connect(filter).connect(g).connect(master);
        src.start();
        lfo.start();
        ambient = { stop: () => { src.stop(); lfo.stop(); } };
      } else {
        // occasional distant birdsong
        const id = setInterval(() => {
          if (!muted && Math.random() < 0.45) {
            tone(1500 + Math.random() * 700, 0.1, { gain: 0.025, slideTo: 1900 });
            tone(1700 + Math.random() * 500, 0.08, { gain: 0.02, delay: 0.14 });
          }
        }, 2600);
        ambient = { stop: () => clearInterval(id) };
      }
    },
    stopAmbient() {
      if (ambient) {
        ambient.stop();
        ambient = null;
      }
    },
  };
  return api;
}
