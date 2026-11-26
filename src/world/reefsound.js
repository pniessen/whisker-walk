// =============================================================================
// THE REEF: ITS SOUND (milestone R4). Soft and underwater: a distant hum (two low sines, faded in) and now and then a small bubble's "blip".
// It makes its sound on the walk's audio context (audio.getContext(), connected to the shared master bus) and it asks for nothing when muted:
// while audio.isMuted() is true no context is requested, no node made and the hum is faded out. The blips' timing is hashed (a slot of
// SLOT seconds, one blip in a slot with a chance, at a hashed moment of it), a pure function of the walk's clock; it reads no rng and no clock.
// =============================================================================

import { hash01 } from './reefcritters.js';

export const SOUND_SALTS = Object.freeze({ when: 0x626c6970, pitch: 0x70697463, chance: 0x63686e63 });
export const SLOT = 2.6; // seconds in a slot
export const CHANCE = 0.62;
export const HUM = Object.freeze({ low: 55, high: 82.5, gain: 0.011, fade: 3 });

// The moment (seconds) in slot n a blip starts, or null when the slot is quiet.
export function blipIn(n) {
  if (hash01(n, SOUND_SALTS.chance) >= CHANCE) return null;
  return n * SLOT + hash01(n, SOUND_SALTS.when) * (SLOT - 0.4);
}
export const blipPitch = (n) => 420 + hash01(n, SOUND_SALTS.pitch) * 520;

// createReefSound({ audio }) -> { update(dt), dispose(), blips }
export function createReefSound({ audio }) {
  let clock = 0;
  let slot = -1; // the last slot whose blip has been decided
  let hum = null; // { gain, oscs }
  let blips = 0;
  let pending = null; // the moment of the slot's blip, until it is played
  let pendingSlot = -1;

  const muted = () => !audio || typeof audio.getContext !== 'function' || !!audio.isMuted?.();

  function startHum(ac, dest) {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(HUM.gain, ac.currentTime + HUM.fade);
    const oscs = [HUM.low, HUM.high].map((f) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    gain.connect(dest);
    hum = { gain, oscs, ac };
  }
  function stopHum() {
    if (!hum) return;
    const { gain, oscs, ac } = hum;
    hum = null;
    try {
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
      for (const o of oscs) o.stop(ac.currentTime + 0.5);
    } catch { /* a context that is already closed has nothing to stop */ }
  }
  function blip(ac, dest, n) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = blipPitch(n);
    const now = ac.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(f * 1.7, now + 0.09);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.022, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    o.connect(g); g.connect(dest);
    o.start(now);
    o.stop(now + 0.16);
    blips++;
  }

  return {
    get blips() { return blips; },
    get humming() { return !!hum; },
    update(dt) {
      clock += Math.max(0, Math.min(dt, 1)) || 0;
      if (muted()) { stopHum(); pending = null; slot = Math.floor(clock / SLOT); return; } // nothing asked of the context
      const ac = audio.getContext();
      if (!ac) return;
      const dest = audio.getMaster?.() ?? ac.destination;
      if (!hum) startHum(ac, dest);
      const n = Math.floor(clock / SLOT);
      if (n !== slot) { slot = n; pending = blipIn(n); pendingSlot = n; }
      if (pending !== null && clock >= pending) { blip(ac, dest, pendingSlot); pending = null; }
    },
    dispose() { stopHum(); },
  };
}
