// The Treehouse, polish pass 10 (2026-11-28): the shared limits that keep the layers of passes 3-9 from piling up. Pure numbers, no three.js, no audio of its own.
//   * GLOW: capGlow(sum, cap) soft-limits any combined additive swell (fireflies' size, golden-moment halo): up to `cap` it is the sum itself, past it only a quarter of the excess counts.
//   * EVENTS: at most TWO event effects at once among weather (rain, storm), voice reaction (her calls' flare), the vista's golden moment, and the night's visitors (the shy friend, the squirrel). Priority, high to low: weather, voice, golden, visitor.
//     `gate` is read by the effects (1 = may show, 0 = held); the walk sets it each frame with setEvents.
//   * VOICES: at most MAX_VOICES transient sounds (a chime pair, a hoot, a toll, a chirp run) sounding at once, counted by the sound clock; the beds (wind, rain, crickets) are not counted.
export const MAX_VOICES = 4;
export const GLOW_CAP = 1.7;
export const gate = { voice: 1, gold: 1, visitor: 1 };
const ORDER = ['wx', 'voice', 'gold', 'visitor'];
export function capGlow(sum, cap = GLOW_CAP) { return sum <= cap ? sum : cap + (sum - cap) * 0.25; }
/** setEvents({ wx, voice, gold, visitor }) -> the number allowed (0..2); sets `gate`. Anything already past its first instants keeps its place by priority only. */
export function setEvents(on) {
  let n = 0;
  gate.voice = gate.gold = gate.visitor = 1;
  for (const k of ORDER) { if (!on[k]) continue; if (n >= 2) { if (k !== 'wx') gate[k] = 0; continue; } n++; }
  return n;
}
const live = [];
/** takeVoice(now, dur) -> true if a transient sound may start at sound-clock time `now` (and counts it for `dur` seconds). */
export function takeVoice(now, dur = 1) {
  for (let i = live.length - 1; i >= 0; i--) if (live[i] <= now) live.splice(i, 1);
  if (live.length >= MAX_VOICES) return false;
  live.push(now + dur); return true;
}
export function resetVoices() { live.length = 0; }
