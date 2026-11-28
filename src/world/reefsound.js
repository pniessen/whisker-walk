// =============================================================================
// THE REEF: ITS SOUND (milestone R4). Soft and underwater: a distant hum (two low sines, faded in) and now and then a small bubble's "blip".
// It makes its sound on the walk's audio context (audio.getContext(), connected to the shared master bus) and it asks for nothing when muted:
// while audio.isMuted() is true no context is requested, no node made and the hum is faded out. The blips' timing is hashed (a slot of
// SLOT seconds, one blip in a slot with a chance, at a hashed moment of it), a pure function of the walk's clock; it reads no rng and no clock.
// =============================================================================

import { hash01 } from './reefcritters.js';

export const SOUND_SALTS = Object.freeze({ when: 0x626c6970, pitch: 0x70697463, chance: 0x63686e63, ping: 0x70696e67, whale: 0x7768616c, burble: 0x62726272 });
// Beauty pass 2: the water's bed. A slot lattice of its own for each: a far SONAR PING (the Sealab's, with a fainter echo) every ~9 s, a far WHALE SONG (a low
// glide with a slow vibrato) every ~38 s and now and then a BURBLE (four blips tumbling up). All quiet, all through the one master bus, all nothing while muted.
export const PING = Object.freeze({ slot: 9, chance: 0.75, hz: 1180, gain: 0.014 });
export const WHALE = Object.freeze({ slot: 38, chance: 0.85, gain: 0.02, seconds: 7 });
export const pingIn = (n) => (hash01(n, SOUND_SALTS.ping) < PING.chance ? n * PING.slot + hash01(n + 9, SOUND_SALTS.ping) * (PING.slot - 2) : null);
export const whaleIn = (n) => (hash01(n, SOUND_SALTS.whale) < WHALE.chance ? n * WHALE.slot + hash01(n + 9, SOUND_SALTS.whale) * (WHALE.slot - WHALE.seconds - 1) : null);
export const burbleIn = (n) => (hash01(n, SOUND_SALTS.burble) < 0.3 ? n * SLOT + hash01(n + 5, SOUND_SALTS.burble) * (SLOT - 1.2) : null);
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
  let pings = 0; let songs = 0;
  let nextPing = 0; let nextWhale = 0; let nextBurble = 0; // the lattice slot each is waiting on (the moment is pingIn(n) and so on)
  let burbleAt = null; let pingAt = null; let whaleAt = null;
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
  function blip(ac, dest, n, delay = 0, quiet = 1) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    const f = blipPitch(n);
    const now = ac.currentTime + delay;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(f * 1.7, now + 0.09);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.022 * quiet, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    o.connect(g); g.connect(dest);
    o.start(now);
    o.stop(now + 0.16);
    blips++;
  }

  // a far sonar ping (a sine that rings out) and its fainter echo; a whale song (a slow low glide with a vibrato)
  function ping(ac, dest) {
    const now = ac.currentTime;
    [[0, PING.gain], [0.55, PING.gain * 0.35]].forEach(([d, v]) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = PING.hz;
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(v, now + d + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 1.1);
      o.connect(g); g.connect(dest); o.start(now + d); o.stop(now + d + 1.2);
    });
    pings++;
  }
  function whale(ac, dest) {
    const now = ac.currentTime; const T = WHALE.seconds;
    const o = ac.createOscillator(); const g = ac.createGain(); const lfo = ac.createOscillator(); const depth = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, now);
    o.frequency.linearRampToValueAtTime(190, now + T * 0.35);
    o.frequency.linearRampToValueAtTime(140, now + T * 0.65);
    o.frequency.linearRampToValueAtTime(80, now + T);
    lfo.frequency.value = 4.5; depth.gain.value = 5; lfo.connect(depth); depth.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(WHALE.gain, now + T * 0.3);
    g.gain.linearRampToValueAtTime(WHALE.gain * 0.7, now + T * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, now + T);
    o.connect(g); g.connect(dest); o.start(now); lfo.start(now); o.stop(now + T + 0.1); lfo.stop(now + T + 0.1);
    songs++;
  }

  return {
    get pings() { return pings; },
    get songs() { return songs; },
    get blips() { return blips; },
    get humming() { return !!hum; },
    update(dt) {
      clock += Math.max(0, Math.min(dt, 1)) || 0;
      if (muted()) { stopHum(); pending = null; slot = Math.floor(clock / SLOT); pingAt = whaleAt = burbleAt = null; nextPing = Math.floor(clock / PING.slot); nextWhale = Math.floor(clock / WHALE.slot); nextBurble = Math.floor(clock / SLOT); return; } // nothing asked of the context
      const ac = audio.getContext();
      if (!ac) return;
      const dest = audio.getMaster?.() ?? ac.destination;
      if (!hum) startHum(ac, dest);
      const n = Math.floor(clock / SLOT);
      if (n !== slot) { slot = n; pending = blipIn(n); pendingSlot = n; }
      if (pending !== null && clock >= pending) { blip(ac, dest, pendingSlot); pending = null; }
      if (pingAt === null || clock >= pingAt) { if (pingAt !== null) ping(ac, dest); pingAt = null; while (pingAt === null || pingAt < clock) pingAt = pingIn(++nextPing) ?? null; }
      if (whaleAt === null || clock >= whaleAt) { if (whaleAt !== null) whale(ac, dest); whaleAt = null; while (whaleAt === null || whaleAt < clock) whaleAt = whaleIn(++nextWhale) ?? null; }
      if (burbleAt === null || clock >= burbleAt) { if (burbleAt !== null) for (let k = 0; k < 4; k++) blip(ac, dest, nextBurble * 7 + k, k * 0.11, 0.8); burbleAt = null; while (burbleAt === null || burbleAt < clock) burbleAt = burbleIn(++nextBurble) ?? null; }
    },
    dispose() { stopHum(); },
  };
}
