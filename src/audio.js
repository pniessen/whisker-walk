export function createAudio() {
  let ctx = null;
  let muted = false;
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
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  const api = {
    toggleMute() {
      muted = !muted;
      if (muted) api.stopAmbient();
      return muted;
    },
    meow() {
      tone(520, 0.22, { type: 'square', gain: 0.05, slideTo: 780 });
      tone(760, 0.25, { type: 'square', gain: 0.04, slideTo: 430, delay: 0.2 });
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
        g.gain.value = 0.05;
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        lfo.frequency.value = 0.14;
        lfoGain.gain.value = 0.035;
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
