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

// Per-frame decision: lay a quest trail toward the active objective?
// `since` is seconds since the last lay (owned by the caller). The trail gets
// denser and bolder as the cat closes in (that gradient is the warmer/colder
// signal). Reduced motion halves the prints but never removes the trail.
// `scent` is passed in, not imported, to keep this module a leaf.
export function questTrailStep({ quest, scent, catPos, since, reducedMotion = false } = {}) {
  const none = { laid: false, endpoint: null };
  if (!quest || quest.state !== 'active' || typeof scent?.trailTo !== 'function') return none;
  if (!quest.target || !catPos) return none;
  const dist = Math.hypot(quest.target.x - catPos.x, quest.target.z - catPos.z);
  if (!Number.isFinite(dist) || dist < 0.5) return none;
  if (!(since >= trailCadence(dist))) return none;
  const w = scentWarmth(dist);
  let steps = Math.round(2 + 5 * w);
  if (reducedMotion) steps = Math.max(1, Math.ceil(steps / 2));
  const peak = 0.35 + 0.4 * w;
  const endpoint = scent.trailTo(catPos, quest.target, {
    maxDist: 6, steps, peak, color: QUEST_TRAIL_COLOR,
  });
  return { laid: !!endpoint, endpoint: endpoint ?? null };
}
