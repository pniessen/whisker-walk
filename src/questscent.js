// Quest-scent policy: how warm the objective trail is, how often it re-lays,
// and what the HUD prints. Pure and leaf-level (imports nothing) so it is
// unit-testable headless, like skills.js and ui/hometabs.js.

// Quest trail tint — deliberately not scent.js's 0xf2e04e nose yellow.
export const QUEST_TRAIL_COLOR = 0x7fd4ff;

// One guard for every incoming number. Non-numbers (even numeric strings)
// are rejected, not coerced. Returns null when unusable.
function finiteNonNeg(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

// 1 at or inside `near`, 0 at or beyond `far`, linear between.
export function scentWarmth(dist, opts = {}) {
  const d = finiteNonNeg(dist);
  if (d === null) return 0;
  const { near = 4, far = 60 } = opts;
  if (d <= near) return 1;
  if (d >= far) return 0;
  return (far - d) / (far - near);
}

// Seconds until the next trail is laid: `hot` when warm, `cold` when cold.
export function trailCadence(dist, opts = {}) {
  const { hot = 1.2, cold = 4 } = opts;
  const w = scentWarmth(dist);
  return cold + (hot - cold) * w;
}

// HUD readout: null when unusable, "here" under 2 m, else whole metres.
export function objectiveDistance(dist) {
  const d = finiteNonNeg(dist);
  if (d === null) return null;
  if (d < 2) return 'here';
  return `${Math.round(d)} m`;
}
