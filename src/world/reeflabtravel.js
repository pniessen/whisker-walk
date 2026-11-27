// The hatch's travel, pure: a short fade out, the cat is placed on the frame it is fully covered, a short fade back. No THREE, no DOM, no clock (the walk's dt).
// Under reduced motion there is no fade: she is placed at once. A press while a trip is on does nothing, so a trip always ends.
export const FADE = 0.32;
export const createTravel = () => ({ phase: 'idle', dir: null, t: 0 });
export const travelling = (s) => s.phase !== 'idle';
export function startTravel(s, dir) {
  if (s.phase !== 'idle' || (dir !== 'down' && dir !== 'up')) return false;
  s.phase = 'out'; s.dir = dir; s.t = 0;
  return true;
}
// Advances by dt; returns { alpha (the cover, 0 to 1), place (true on the one frame to move her), dir }.
export function stepTravel(s, dtRaw, reduced = false) {
  if (s.phase === 'idle') return { alpha: 0, place: false, dir: null };
  const dt = Number.isFinite(dtRaw) && dtRaw > 0 ? Math.min(dtRaw, 0.1) : 0;
  s.t += dt;
  const dir = s.dir;
  if (s.phase === 'out') {
    if (reduced || s.t >= FADE) { s.phase = 'in'; s.t = 0; return { alpha: reduced ? 0 : 1, place: true, dir }; }
    return { alpha: s.t / FADE, place: false, dir };
  }
  if (reduced || s.t >= FADE) { s.phase = 'idle'; s.dir = null; s.t = 0; return { alpha: 0, place: false, dir }; }
  return { alpha: 1 - s.t / FADE, place: false, dir };
}
