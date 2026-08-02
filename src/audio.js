export function createAudio() {
  let ctx = null;
  let muted = false;
  // Master volume factor (0..1), driven live by settings.volume — see
  // setVolume() below. Multiplies every tone's gain; default 1 so a caller
  // that never wires up settings (e.g. a stray future test) still hears
  // full volume rather than silence.
  let volume = 1;
  let ambient = null;

  function ensure() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    g.gain.setValueAtTime(gain * volume, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const api = {
    // settings.muted is the single source of truth (main.js's M key and the
    // homebase mute checkbox both write settings then call this) — audio
    // itself no longer owns a toggle, it just applies what it's told.
    setMuted(v) {
      muted = !!v;
      if (muted) api.stopAmbient();
    },
    getMuted() {
      return muted;
    },
    // 0..1 master factor multiplied into every tone() gain, and (at
    // creation time) into the seaside ambient noise's gain nodes below.
    setVolume(v) {
      volume = typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : volume;
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
    meow(volume = 1, pitch = 1) {
      tone(520 * pitch, 0.22, { type: 'square', gain: 0.05 * volume, slideTo: 780 * pitch });
      tone(760 * pitch, 0.25, { type: 'square', gain: 0.04 * volume, slideTo: 430 * pitch, delay: 0.2 });
    },
    purr() {
      for (let i = 0; i < 8; i++) tone(72, 0.06, { type: 'sawtooth', gain: 0.07, delay: i * 0.08 });
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
        // scaled by the volume factor at creation time — this long-lived
        // node isn't re-touched by a later setVolume() call, same tradeoff
        // as any other already-playing ambient sound.
        g.gain.value = 0.05 * volume;
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        lfo.frequency.value = 0.14;
        lfoGain.gain.value = 0.035 * volume;
        lfo.connect(lfoGain).connect(g.gain);
        src.connect(filter).connect(g).connect(ac.destination);
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
