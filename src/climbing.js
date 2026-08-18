import { hasSkill } from './skills.js';

// Shared climb-reach rule for perches (fence tops, car/porch roofs, ridges…).
// Perches above y 1 sit at a prop's own collider center rather than its edge
// (car roofs, rooftops), so they get a longer reach to compensate for the
// collider pushing the cat out to `r + 0.35`. Climbing UP costs at most
// `budget.climb` of height per hop, forcing multi-perch chains up tall
// structures; dropping down to a lower (or ground-level) perch is always
// allowed, any distance.
//
// v18 "Cat Skills" makes those three numbers a BUDGET rather than three
// literals, because two abilities widen them (Spring Paws lifts the climb
// height, Sure Claws lifts both horizontal reaches and the climb height a
// little). The budget is an explicit parameter, defaulted, rather than a
// module-level "current skills" global: canReach stays a pure function of its
// arguments, so a test can assert both the no-skills and the with-skills
// geometry side by side in the same process, and any call site that has not
// been threaded yet behaves EXACTLY as it does today.
export const BASE_CLIMB_BUDGET = Object.freeze({
  climb: 1.6,     // max height gained in one hop
  reachHigh: 2.6, // horizontal reach to a perch above y 1 (collider-center perches)
  reachLow: 1.2,  // horizontal reach to a perch at or below y 1 (edge perches)
});

// Spring Paws — "pounce jump is markedly higher; climb budget in canReach
// rises 1.6 → 2.2" (spec §Traversal, verbatim). This is the one number the
// spec pins exactly, so it is used exactly.
export const SPRING_PAWS_CLIMB = 2.2;

// Sure Claws — "climb-anything: the perch height budget lifts on trees and
// fences". The shipped perch records carry no tree/fence tag (they are bare
// {x, z, y, label?, vantage?}), so this cannot be a per-prop rule inside this
// module; it is a global lift, and the "props that were scenery become
// climbable" half of the ability is world-data work that belongs to whoever
// owns src/world/*.js, not here.
//
// The height lift is deliberately SMALL — 1.6 → 1.85 — and the reaches carry
// most of the ability. That is not timidity, it is the shipped-content
// constraint: the seaside "dune ledge" perch sits at y 1.9 and is the second
// step of a two-step chain (overlook boulder 0.72 → ledge 1.9) whose top step
// holds golden mouse gm-sea-2. A Sure Claws height budget of 1.9 or more
// would let a player hop the ledge straight off the ground and skip that
// chain entirely. 1.85 leaves every shipped chain standing while still being
// a real lift for taller props (existing or future) that no current perch
// happens to occupy.
export const SURE_CLAWS_CLIMB = 1.85;
export const SURE_CLAWS_REACH_HIGH = 3.2;
export const SURE_CLAWS_REACH_LOW = 1.7;

// climbBudget(state) → the budget for one save. `state` is the raw save
// object; every read goes through hasSkill, which is total over any input
// (see src/skills.js's hostile-state preamble), so a null/garbage state
// simply yields the baseline budget rather than throwing.
//
// The two abilities compose by MAX, never by sum. Additive stacking would put
// the climb budget at 1.6 + 0.6 + 0.25 = 2.45 for a player holding both,
// which clears the y 2.0 crate top AND leaves only 0.85 to the y 3.3
// billboard lookout — the exact "one hop skips the whole chain" failure the
// spec's §Risks calls out. Max-composition means holding a second traversal
// skill can never be worse for shipped content than holding the stronger one
// alone, which makes the reachability proof a two-case check instead of a
// four-case one.
export function climbBudget(state) {
  const spring = hasSkill(state, 'spring-paws');
  const claws = hasSkill(state, 'sure-claws');
  if (!spring && !claws) return BASE_CLIMB_BUDGET;
  return Object.freeze({
    climb: Math.max(
      BASE_CLIMB_BUDGET.climb,
      spring ? SPRING_PAWS_CLIMB : 0,
      claws ? SURE_CLAWS_CLIMB : 0,
    ),
    reachHigh: claws ? SURE_CLAWS_REACH_HIGH : BASE_CLIMB_BUDGET.reachHigh,
    reachLow: claws ? SURE_CLAWS_REACH_LOW : BASE_CLIMB_BUDGET.reachLow,
  });
}

// Per-field coercion with a baseline fallback. A budget can arrive from a
// call site that built it from a partially-threaded options object, and a
// missing / NaN / negative field must degrade to today's number rather than
// silently making everything (NaN comparisons are all false) unreachable or
// (Infinity) reachable. Same defensive posture as skills.js's countOf.
function budgetField(budget, key) {
  const v = budget?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : BASE_CLIMB_BUDGET[key];
}

// canReach(perch, catPos, currentY, budget) — budget defaults to the
// no-skills baseline, so the three-argument call this function shipped with
// is byte-for-byte the old behaviour.
export function canReach(perch, catPos, currentY, budget = BASE_CLIMB_BUDGET) {
  const reach = perch.y > 1 ? budgetField(budget, 'reachHigh') : budgetField(budget, 'reachLow');
  const horizontal = Math.hypot(perch.x - catPos.x, perch.z - catPos.z);
  return horizontal < reach && perch.y - currentY <= budgetField(budget, 'climb');
}

// Picks which reachable perch a pounce/climb press should jump to. Drops
// (perch.y <= currentY) are always "reachable" per canReach, so a naive
// first-match pick among perches in declaration order can shadow a higher
// chain-mate that's also in reach (e.g. a crate stacked below a billboard
// lookout, or a porch below a rooftop ridge) with a lower one, trapping the
// climb. Preferring the HIGHEST reachable candidate makes climbs beat drops
// whenever both are available, so pressing the same key repeatedly walks a
// chain upward; only when nothing at all is reachable does the caller fall
// back to hopping down off the current perch.
//
// The budget is threaded straight through to canReach and defaults the same
// way, so an un-updated caller keeps the baseline geometry.
export function bestPerch(perches, catPos, currentY, currentPerch, budget = BASE_CLIMB_BUDGET) {
  let best = null;
  for (const pp of perches ?? []) {
    if (pp === currentPerch) continue;
    if (!canReach(pp, catPos, currentY, budget)) continue;
    if (!best || pp.y > best.y) best = pp;
  }
  return best;
}
