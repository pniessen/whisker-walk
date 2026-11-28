// The Jungle lodge, beauty pass 10: coherence. Three shared rules, no mesh, no triangle, no caster: ONE glow budget for the pooled motes (and the shafts), AT MOST TWO EVENT effects at once, and
// at most four sound voices at a time. Pure helpers (time arrives as arguments).
export const CAP = Object.freeze({ load: 7, near: 9, ease: 0.6, voices: 4, ambient: 3, span: 1.1 });

/** The additive load near her: sum of brightness x (size, at most 4)^2 x nearness over the pooled points. Fills the colour array's scale in place when over budget; returns the scale 0..1. */
export function glowLoad(col, pos, size, n, cx, cz) {
  let load = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(pos[i * 3] - cx, pos[i * 3 + 2] - cz); if (d >= CAP.near) continue;
    const s = Math.min(4, size[i]); load += (col[i * 3] + col[i * 3 + 1] + col[i * 3 + 2]) / 3 * s * s * (1 - d / CAP.near);
  }
  return load;
}
/** The scale that holds a load at the budget (1 when under it). */
export const glowScale = (load) => (load > CAP.load ? CAP.load / load : 1);
/** Eases the live scale (down fast, up slowly, so a pile-up never pops). */
export const easeScale = (cur, tgt, dt) => cur + (tgt - cur) * Math.min(1, dt / (tgt < cur ? 0.15 : CAP.ease));

/** Which event effects may run: act = { voice, golden, weather, surprise } (booleans, now running). Priority: her own voice, her golden moment, the weather's gust/thunder, then the surprise.
 *  At most two run; out gets booleans for who may. Pure. */
export function eventSlots(act, out = {}) {
  let n = 0;
  for (const k of ['voice', 'golden', 'weather', 'surprise']) { out[k] = !!act[k] && n < 2; if (out[k]) n++; }
  return out;
}

/** A voice gate: play(prio, t, fn) runs fn when fewer than 4 (3 for ambient, prio 0) voices began within the last 1.1 s. Returns whether it played. */
export function createVoiceCap() {
  const at = [];
  return {
    play(prio, t, fn) {
      while (at.length && t - at[0] > CAP.span) at.shift();
      if (at.length >= (prio ? CAP.voices : CAP.ambient)) return false;
      at.push(t); fn(); return true;
    },
    count: () => at.length,
  };
}
