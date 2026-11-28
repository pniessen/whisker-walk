// =============================================================================
// THE CRYSTAL CAVE: ITS SOUND (milestone C4). Soft and warm, on the walk's audio context (audio.getContext(), the shared master bus):
//   * a CAVE HUM bed: two low sines, faded in, very quiet (audio.js's 'crystal' ambience is silent on purpose: no wind, no birds, no crickets);
//   * a PLINK for each drip that falls on the pool or in the Rose hall (the same moments as the rings, crystalcritters.js), only within DRIP_EAR metres, softer with distance;
//   * a CRYSTAL NOTE when she walks up to a great crystal (the lighting's own soft note, humNote), once on arriving and again only after she has been away.
// MUTED: while audio.isMuted() is true no context is requested, no node is made and the hum is faded out. Timing is a pure function of the walk's clock.
// =============================================================================

import { DRIP_SITES, DRIP, dripIn, hash01 } from './crystalcritters.js';
import { humNote } from './crystallife.js';
import { ROSE_GREAT } from './crystalplan.js';
import { planBeauty2 } from './crystaldecor.js';
import { BLUE_GREAT, GOLD_GREAT, HEART_GREAT } from './crystalwingplan.js';

export const HUM = Object.freeze({ low: 49, high: 73.5, gain: 0.008, fade: 3 });
export const DRIP_EAR = 16;
export const PLINK_GAIN = 0.018;
// the great crystals and which of the soft notes each one sings (the Heart sings the Rose's)
export const GREATS = Object.freeze([[ROSE_GREAT, 0], [BLUE_GREAT, 1], [GOLD_GREAT, 2], [HEART_GREAT, 0]].map(([g, note]) => Object.freeze({ x: g.x, z: g.z, note, reach: g.s * 0.55 + 1.6, away: g.s * 0.55 + 4 })));
export const HUE_PITCH = Object.freeze({ rose: 1, blue: 1.122, gold: 1.335, heart: 0.841 });
// beauty round 2: the hero crystals (the cluster-sized ones, not the four greats, which have their own notes) chime softly too when she walks up to them, same soft note, same muting
export const HERO_CHIMES = Object.freeze(planBeauty2('high').hero.filter((h) => !h.great).map((h, i) => Object.freeze({ x: h.x, z: h.z, note: (i + 1) % 3, ratio: HUE_PITCH[h.hue] ?? 1, hue: h.hue, reach: h.s * 0.55 + 1.9, away: h.s * 0.55 + 4 })));
// beauty round 3: each colour tunes its crystal's chime (rose 1, blue a whole step up, gold a fourth up, violet a minor third down), and a quiet shimmer follows her past any hero crystal
export const SHIMMER = Object.freeze({ reach: 5, gain: 0.006, f: 880 });
export const NOTE_GAP = 6; // seconds before the same crystal may sing again

export const loud = (d) => { const k = Math.min(1, Math.max(0, 1 - d / DRIP_EAR)); return k * k; };

// createCrystalSound({ audio }) -> { update(dt, catPos), dispose(), plinks, notes, humming }
export function createCrystalSound({ audio }) {
  let clock = 0;
  let slot = -1;
  let hum = null;
  let plinks = 0;
  let notes = 0;
  let pending = []; // [{ at, site }] this slot
  const near = new Array(GREATS.length).fill(false);
  const lastNote = new Array(GREATS.length).fill(-1e9);
  const nearH = new Array(HERO_CHIMES.length).fill(false); const lastH = new Array(HERO_CHIMES.length).fill(-1e9);
  let shim = null; let shimK = 0;
  let broken = false; // a context that throws silences the rest of the walk
  const muted = () => !audio || typeof audio.getContext !== 'function' || !!audio.isMuted?.();

  function startHum(ac, dest) {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.gain.linearRampToValueAtTime(HUM.gain, ac.currentTime + HUM.fade);
    const oscs = [HUM.low, HUM.high].map((f) => { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(gain); o.start(); return o; });
    gain.connect(dest);
    hum = { gain, oscs, ac };
  }
  function stopShimmer() {
    if (!shim) return;
    const { gain, o, ac } = shim; shim = null;
    try { gain.gain.cancelScheduledValues(ac.currentTime); gain.gain.setTargetAtTime(0, ac.currentTime, 0.1); o.stop(ac.currentTime + 0.5); } catch { /* closed */ }
  }
  function stopHum() {
    stopShimmer();
    if (!hum) return;
    const { gain, oscs, ac } = hum;
    hum = null;
    try {
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.4);
      for (const o of oscs) o.stop(ac.currentTime + 0.5);
    } catch { /* a closed context has nothing to stop */ }
  }
  function plink(ac, dest, site, level) {
    const o = ac.createOscillator(); const g = ac.createGain();
    const f = 1100 + hash01(site * 31 + Math.floor(clock), 0x706c6e6b) * 500;
    const now = ac.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, now);
    o.frequency.exponentialRampToValueAtTime(f * 0.62, now + 0.12);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(PLINK_GAIN * level, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(g); g.connect(dest);
    o.start(now); o.stop(now + 0.18);
    plinks++;
  }

  return {
    get plinks() { return plinks; },
    get notes() { return notes; },
    get humming() { return !!hum; },
    update(dt, catPos) {
      clock += Math.max(0, Math.min(dt, 1)) || 0;
      const n = Math.floor(clock / DRIP.slot);
      if (n !== slot) { // decide this slot's drips (the clocks run on while muted: no burst on unmuting)
        slot = n;
        pending = DRIP_SITES.map((s) => ({ site: s, at: dripIn(s.id, n) })).filter((p) => p.at !== null);
      }
      if (broken) return;
      if (muted()) { stopHum(); pending = []; near.fill(false); nearH.fill(false); return; }
      const ac = audio.getContext();
      if (!ac) return;
      const dest = audio.getMaster?.() ?? ac.destination;
      try { if (!hum) startHum(ac, dest); } catch { broken = true; hum = null; return; }
      if (catPos) {
        pending = pending.filter((p) => {
          if (clock < p.at) return true;
          const l = loud(Math.hypot(catPos.x - p.site.x, catPos.z - p.site.z));
          if (l > 0.02) { try { plink(ac, dest, p.site.id, l); } catch { broken = true; } }
          return false;
        });
        GREATS.forEach((g, i) => {
          const d = Math.hypot(catPos.x - g.x, catPos.z - g.z);
          if (d < g.reach && !near[i]) { near[i] = true; if (clock - lastNote[i] >= NOTE_GAP) { lastNote[i] = clock; if (humNote(audio, g.note)) notes++; } }
          else if (d > g.away) near[i] = false;
        });
        // the shimmer: one very quiet sine whose loudness follows how near she is to a hero crystal and whose pitch is that crystal's colour; gone when far (no node until she is near)
        let best = null; let bd = SHIMMER.reach;
        for (const g of HERO_CHIMES) { const d = Math.hypot(catPos.x - g.x, catPos.z - g.z); if (d < bd) { bd = d; best = g; } }
        const want = best ? 1 - bd / SHIMMER.reach : 0;
        try {
          if (want > 0.02 && !shim) { const o = ac.createOscillator(); const gain = ac.createGain(); o.type = 'sine'; o.frequency.value = SHIMMER.f * (best.ratio ?? 1); gain.gain.value = 0; o.connect(gain); gain.connect(dest); o.start(); shim = { o, gain, ac }; }
          if (shim) { if (best) shim.o.frequency.setTargetAtTime(SHIMMER.f * (best.ratio ?? 1), ac.currentTime, 0.3); shim.gain.gain.setTargetAtTime(SHIMMER.gain * want * want, ac.currentTime, 0.25); shimK = want; if (want <= 0.02 && shimK <= 0.02) stopShimmer(); }
        } catch { broken = true; shim = null; }
        HERO_CHIMES.forEach((g, i) => {
          const d = Math.hypot(catPos.x - g.x, catPos.z - g.z);
          if (d < g.reach && !nearH[i]) { nearH[i] = true; if (clock - lastH[i] >= NOTE_GAP) { lastH[i] = clock; if (humNote(audio, g.note, g.ratio ?? 1)) notes++; } }
          else if (d > g.away) nearH[i] = false;
        });
      }
    },
    dispose() { stopHum(); },
  };
}
