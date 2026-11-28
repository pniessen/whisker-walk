// =============================================================================
// SNOWVILLE: THE SOUND BED (beauty pass 2). Three soft sounds on top of the soft bells and the crunch of snowvillecritters.js, all made from oscillators and filtered noise (no assets): the WIND swelling with
// each gust the flakes feel (gustAt in snowvillelight.js, so the ear and the eye agree), a cluster of SLEIGH BELLS jingling now and then, and a distant CAROL-like chime phrase (a few pentatonic notes, very quiet).
// Silent when muted: no audio context is asked for (the caller's audio.isMuted()). Every schedule runs on the walk's own time and hashed gaps (no random number, no clock); nothing is made per frame.
// =============================================================================

const hash01 = (n, s) => { let h = (Math.imul(n | 0, 0x9e3779b1) ^ Math.imul((s | 0) + 0x7f4a7c15, 0x85ebca6b)) | 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };

export const WIND = Object.freeze({ trigger: 0.25, gap: 6 }); // a gust above this starts a swell of wind; at least this many seconds apart
export const SLEIGH_GAP = Object.freeze({ first: 31, min: 48, span: 40 });
export const CAROL_GAP = Object.freeze({ first: 53, min: 70, span: 50 });
// a few little phrases in a pentatonic (so any of them sits well on the soft bells): note indices into CAROL_SCALE and their gaps in seconds
export const CAROL_SCALE = Object.freeze([392, 440, 523.3, 587.3, 659.3, 784]);
export const CAROL_PHRASES = Object.freeze([[2, 3, 4, 3, 2, 1], [4, 3, 2, 3, 4, 4, 4], [0, 2, 3, 4, 3, 2], [5, 4, 3, 2, 3]].map((p) => Object.freeze(p)));

function soundCtx(audio) {
  if (!audio || typeof audio.getContext !== 'function' || audio.isMuted?.()) return null;
  return audio.getContext() ?? null;
}
const noiseOf = new WeakMap();
function noiseBuffer(ac) {
  let buf = noiseOf.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, Math.max(8, Math.floor(ac.sampleRate * 2)), ac.sampleRate);
    const d = buf.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) { lp += 0.08 * ((hash01(i, 77) * 2 - 1) - lp); d[i] = lp * 3; } // low-passed noise: a hush, not a hiss
    noiseOf.set(ac, buf);
  }
  return buf;
}

// A gust of wind: a hush of filtered noise that swells over about a second and a half and falls away over two more, its pitch rising a little with the swell. `k` (0..1) is the gust's strength.
export function windGust(audio, k = 0.5) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime; const dur = 3.6;
  const src = ac.createBufferSource(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
  src.buffer = noiseBuffer(ac); src.loop = true;
  flt.type = 'bandpass'; flt.Q.value = 0.6;
  flt.frequency.setValueAtTime(380, now); flt.frequency.linearRampToValueAtTime(620 + 300 * k, now + 1.6); flt.frequency.linearRampToValueAtTime(420, now + dur);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.012 + 0.018 * k, now + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
  src.start(now); src.stop(now + dur + 0.1);
  return true;
}

// Sleigh bells: a dozen tiny high tinkles in quick, uneven succession, drifting off. `k` varies the pitch of the cluster.
export function sleighBells(audio, k = 0, gain = 1) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const out = audio.getMaster?.() ?? ac.destination;
  const base = 2600 + 500 * hash01(k, 61);
  let at = 0;
  for (let i = 0; i < 12; i++) {
    at += 0.05 + 0.09 * hash01(k * 16 + i, 62);
    const f = base * (1 + 0.38 * hash01(k * 16 + i, 63));
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f;
    const peak = 0.007 * gain * (1 - i / 16);
    g.gain.setValueAtTime(0.0001, now + at); g.gain.exponentialRampToValueAtTime(peak, now + at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);
    o.connect(g); g.connect(out); o.start(now + at); o.stop(now + at + 0.4);
  }
  return true;
}

// Snow slipping off a bough (beauty pass 3): a short soft hush of filtered noise, falling in pitch, as she brushes a fir.
export function snowWhump(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const src = ac.createBufferSource(); const flt = ac.createBiquadFilter(); const g = ac.createGain();
  src.buffer = noiseBuffer(ac); src.loop = true;
  flt.type = 'lowpass'; flt.Q.value = 0.5;
  flt.frequency.setValueAtTime(900 + 200 * hash01(k, 67), now); flt.frequency.exponentialRampToValueAtTime(260, now + 0.6);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.03, now + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
  src.connect(flt); flt.connect(g); g.connect(audio.getMaster?.() ?? ac.destination);
  src.start(now); src.stop(now + 0.8);
  return true;
}

// A distant carol-like chime phrase: bell-like notes (a sine and a soft partial) a third of a second apart, very quiet.
export function carolChime(audio, k = 0) {
  const ac = soundCtx(audio);
  if (!ac) return false;
  const now = ac.currentTime;
  const out = audio.getMaster?.() ?? ac.destination;
  const phrase = CAROL_PHRASES[Math.floor(hash01(k, 64) * CAROL_PHRASES.length)];
  phrase.forEach((n, i) => {
    const at = now + i * 0.46 + (i === phrase.length - 1 ? 0.2 : 0);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.011, at + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, at + 1.9);
    g.connect(out);
    for (const [m, v] of [[1, 1], [2, 0.18], [3.01, 0.06]]) {
      const o = ac.createOscillator(); const og = ac.createGain();
      o.type = 'sine'; o.frequency.value = CAROL_SCALE[n] * m; og.gain.value = v;
      o.connect(og); og.connect(g); o.start(at); o.stop(at + 2);
    }
  });
  return true;
}

// The schedule: asked once a frame with the walk's time; plays at most one thing per call, on hashed gaps. Returns a small state object so a test can walk it.
export function createSoundBed(audio, gust) {
  const st = { nextSleigh: SLEIGH_GAP.first, nextCarol: CAROL_GAP.first, sleighs: 0, carols: 0, winds: 0, lastWind: -99, up: false };
  return {
    state: st,
    update(t) {
      const g = gust(t);
      if (g > WIND.trigger && !st.up && t - st.lastWind > WIND.gap) { st.up = true; st.lastWind = t; st.winds++; windGust(audio, g); }
      else if (g <= WIND.trigger) st.up = false;
      if (t >= st.nextSleigh) { sleighBells(audio, st.sleighs); st.sleighs++; st.nextSleigh = t + SLEIGH_GAP.min + SLEIGH_GAP.span * hash01(st.sleighs, 65); } // (the schedule runs on while muted: no catching up)
      if (t >= st.nextCarol) { carolChime(audio, st.carols); st.carols++; st.nextCarol = t + CAROL_GAP.min + CAROL_GAP.span * hash01(st.carols, 66); }
    },
  };
}
