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
// height everywhere; Sure Claws lifts both horizontal reaches, and lifts the
// climb height on trees and fences only — a fourth budget field,
// `climbKinds`, added by CF-9b). The budget is an explicit parameter,
// defaulted, rather than a module-level "current skills" global: canReach
// stays a pure function of its arguments, so a test can assert both the
// no-skills and the with-skills geometry side by side in the same process,
// and any call site that has not been threaded yet behaves EXACTLY as it
// does today.

// The empty per-kind climb table, shared by the baseline budget and by every
// budget whose holder has no kind-lifting ability. One frozen instance so
// `climbBudget({}) === BASE_CLIMB_BUDGET` stays true by identity.
const NO_CLIMB_KINDS = Object.freeze({});

export const BASE_CLIMB_BUDGET = Object.freeze({
  climb: 1.6,     // max height gained in one hop
  reachHigh: 2.6, // horizontal reach to a perch above y 1 (collider-center perches)
  reachLow: 1.2,  // horizontal reach to a perch at or below y 1 (edge perches)
  // Per-prop-kind climb ceilings (v18 CF-9b). Empty at the baseline: with no
  // ability held, every prop in the game is climbed by the same 1.6 rule.
  climbKinds: NO_CLIMB_KINDS,
});

// Spring Paws — "pounce jump is markedly higher; climb budget in canReach
// rises 1.6 → 2.2" (spec §Traversal, verbatim). This is the one number the
// spec pins exactly, so it is used exactly.
export const SPRING_PAWS_CLIMB = 2.2;

// ---------------------------------------------------------------------------
// PERCH KINDS (v18 CF-9b) — what prop a perch record sits on.
//
// Every shipped perch record now carries `kind`. The vocabulary is small and
// CLOSED because it exists to answer exactly one question — "does the Sure
// Claws height lift apply here?" — and a vocabulary that grows per prop model
// would answer it differently for the crate and the shipping container, which
// a cat's claws cannot tell apart:
//
//   'tree'      living trees. The trunk is bark, so the claws bite: LIFTED.
//   'fence'     fence runs, rails and palings. Same: LIFTED.
//   'roof'      the top of a built structure — house ridges, porch roofs,
//               warehouse parapets and decks, fire-escape landings, roof
//               tanks, billboard catwalks, the crane deck and cab, a market
//               stall's awning. Sheer and smooth; no lift.
//   'crate'     crates, stacked platforms, shipping containers.
//   'car'       parked vehicles.
//   'stone'     boulders, dune ledges, the park fountain's rim.
//   'furniture' free-standing things a cat steps onto that are not part of a
//               structure: benches, quayside bollards, the den's cat tree.
//   'prop'      THE DEFAULT, and the reason an untagged perch is safe. A
//               record with no `kind` (a test fixture, a future area, a
//               hand-written perch) reads as 'prop', which appears in no
//               kind table and therefore climbs by exactly today's rule.
//
// An UNRECOGNISED kind string also normalises to 'prop' rather than being
// trusted: world data is authored by hand, and a typo ('trees') must fall
// back to the baseline rather than silently miss a lift it looks like it asked
// for — or, worse, index something it shouldn't.
// ---------------------------------------------------------------------------
export const PERCH_KIND_DEFAULT = 'prop';
export const PERCH_KINDS = Object.freeze([
  'tree', 'fence', 'roof', 'crate', 'car', 'stone', 'furniture', PERCH_KIND_DEFAULT,
]);

export function perchKind(perch) {
  const k = perch?.kind;
  return typeof k === 'string' && PERCH_KINDS.includes(k) ? k : PERCH_KIND_DEFAULT;
}

// Sure Claws — "climb-anything: the perch height budget lifts on trees and
// fences" (spec §Mischief), plus "props that were scenery become climbable".
//
// v18 shipped this as a GLOBAL 1.6 → 1.85 lift with a comment saying the
// per-prop rule was impossible because perch records carried no tree/fence
// tag. CF-9b added the tag (see PERCH_KINDS above), so the lift is now what
// the spec actually says: a ceiling that applies to 'tree' and 'fence' perches
// and to nothing else. The blanket lift is GONE — a Sure Claws cat climbs a
// crate, a car and a parapet by the same 1.6 every other cat does.
//
// THE NUMBER, 2.0. The binding content constraint is no longer the seaside
// dune ledge (y 1.9, kind 'stone' — outside this table entirely now) but the
// park's "oak branch lookout" at y 2.1: the top step of ground → bench 0.58 →
// branch 2.1, and the stand-on point for BOTH golden mouse gm-park-2 and the
// collectible feather-5. A tree ceiling of 2.1 would let a Sure Claws cat take
// that branch straight off the grass and delete the only tree chain that
// ships. 2.0 is the largest tenth under it.
//
// It is a REAL lift and not a decorative one: every tree opened by CF-9b forks
// at up to TREE_FORK_MAX (1.9), which is above the 1.6 baseline, so the number
// fires on shipped content the first time a Sure Claws cat walks up to a tree.
//
// 'fence' shares the ceiling and cannot fire today — the tallest fence in the
// game is builder.js's 1m fenceRun, whose tops perch at 0.85, well inside the
// baseline. It is declared anyway because the spec names fences alongside
// trees and because the next tall fence someone authors must be climbable
// without a second edit here. That is the opposite of the CF-10 failure: the
// tree half of this table is live, and the fence half is a rule, not wiring.
export const SURE_CLAWS_KIND_CLIMB = 2.0;
export const SURE_CLAWS_CLIMB_KINDS = Object.freeze({
  tree: SURE_CLAWS_KIND_CLIMB,
  fence: SURE_CLAWS_KIND_CLIMB,
});
export const SURE_CLAWS_REACH_HIGH = 3.2;
export const SURE_CLAWS_REACH_LOW = 1.7;

// The skill id a CF-9b gated perch names in its `requires` field. Exported so
// the world files spell it once, from here, rather than four times as a
// string literal that a rename would leave behind.
export const SURE_CLAWS_ID = 'sure-claws';

// A tree perch sits a hand's width below the trunk top, capped at
// TREE_FORK_MAX. Both halves are content constraints, not taste:
//
//   * builder.js's tree() is a 2-unit trunk scaled by `scale`, so the trunk
//     top is 2 * scale. The shipped park oak (scale 1.1, trunk top 2.2) puts
//     its branch perch at 2.1 — trunk top minus 0.1 — and every tree opened
//     here reproduces that convention rather than inventing a second one.
//   * 1.9 is one clear tenth under the 2.0 'tree' ceiling, so an opened tree
//     is always reachable off the ground, and two tenths under the shipped
//     oak's 2.1, so the oak stays the tallest tree perch in the game. It
//     holds a golden mouse and a collectible; an opened scenery tree standing
//     over it would make the one authored tree chain look arbitrary.
//
// Rounded to two decimals because the scale factors in the world files are
// expressions (`0.9 + ((x * z) % 5) * 0.08`) whose float tails would otherwise
// end up in shipped data and in every test that reads it back.
export const TREE_FORK_MAX = 1.9;

export function sureClawsTreePerch(x, z, scale = 1) {
  const trunkTop = 2 * (Number.isFinite(scale) && scale > 0 ? scale : 1);
  const y = Math.min(Math.round((trunkTop - 0.1) * 100) / 100, TREE_FORK_MAX);
  return { x, z, y, kind: 'tree', requires: SURE_CLAWS_ID };
}

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
//
// v18 CF-9b: Sure Claws no longer contributes to the flat `climb` at all — it
// contributes a `climbKinds` table instead (see SURE_CLAWS_CLIMB_KINDS). The
// max rule is unchanged and now applies per kind, in canReach: a 'tree' perch
// is measured against max(climb, climbKinds.tree), so a player holding both
// abilities climbs trees on Spring Paws' 2.2 rather than dropping to the 2.0
// tree ceiling. Holding a second skill still can never be worse.
export function climbBudget(state) {
  const spring = hasSkill(state, 'spring-paws');
  const claws = hasSkill(state, SURE_CLAWS_ID);
  if (!spring && !claws) return BASE_CLIMB_BUDGET;
  return Object.freeze({
    climb: Math.max(
      BASE_CLIMB_BUDGET.climb,
      spring ? SPRING_PAWS_CLIMB : 0,
    ),
    reachHigh: claws ? SURE_CLAWS_REACH_HIGH : BASE_CLIMB_BUDGET.reachHigh,
    reachLow: claws ? SURE_CLAWS_REACH_LOW : BASE_CLIMB_BUDGET.reachLow,
    climbKinds: claws ? SURE_CLAWS_CLIMB_KINDS : NO_CLIMB_KINDS,
  });
}

// ---------------------------------------------------------------------------
// GATED PERCHES (v18 CF-9b) — the second half of "props that were scenery
// become climbable".
//
// A perch record may name a skill in `requires`. Until the save holds that
// skill the perch DOES NOT EXIST for that player: it is filtered out before
// any geometry is considered, rather than being placed out of height reach.
// That distinction is the whole design:
//
//   * Out-of-reach is not invisible. bestPerch prefers the HIGHEST reachable
//     candidate, so a merely-tall gated perch that happened to come into
//     reach from a chain step could shadow the chain's next rung and trap the
//     climb. Filtering first means a player without the ability walks the
//     exact graph that shipped.
//   * Gated perches carry no `label` and no `vantage`, so they also never
//     reach the discovery log, the perch feat tally, or any prompt — see the
//     note on the world files' `requires` blocks.
//
// FAIL CLOSED: an unknown or malformed `requires` (a renamed skill, a typo, a
// hostile save) leaves hasSkill returning false, so the perch stays hidden
// rather than opening up for everyone.
// ---------------------------------------------------------------------------
export function perchRequirement(perch) {
  const need = perch?.requires;
  return typeof need === 'string' && need ? need : null;
}

// perchAllowed(perch, state) — `state` is the raw save, and is optional: with
// it absent (an un-threaded call site, a test fixture) every ungated perch is
// allowed and every gated one is hidden, which is byte-for-byte the world as
// it shipped before CF-9b, since no perch carried `requires` then.
export function perchAllowed(perch, state) {
  const need = perchRequirement(perch);
  return !need || hasSkill(state, need);
}

// visiblePerches(perches, state) — the array a given save may actually see.
// Exported so that anything which grows a second reader of `areaData.perches`
// (a hint arrow, a minimap, a "somewhere up there" nudge) filters by the same
// one rule instead of re-deriving it and leaking a gated perch into a prompt.
export function visiblePerches(perches, state) {
  return (perches ?? []).filter((p) => perchAllowed(p, state));
}

// ---------------------------------------------------------------------------
// Fence Runner — v18 Task 3.1
//
// "Wall-run: chain perch-to-perch along a fence line without dropping to
// ground between hops" (spec §Traversal).
//
// WHY THIS IS NOT PART OF climbBudget. The budget above is the CLIMB rule:
// three numbers consumed by canReach, composed by max, and applied to every
// reachability test including the ones that start on the ground. Fence
// Runner is a horizontal rule with two properties the budget cannot express:
//
//   1. It only exists WHILE ALREADY PERCHED. "Without dropping to ground
//      between hops" is the whole ability; a cat standing on the pavement
//      gets nothing from it. climbBudget has no notion of where the cat is.
//   2. It never lifts the climb ceiling. A fence-run hop is level by
//      definition (|Δy| <= FENCE_RUN_LEVEL = 0.35, deep inside the 1.6
//      baseline climb), so it can never make a hop the height gate already
//      refused — it only makes a LEVEL hop reach further.
//
// Widening reachLow/reachHigh in the budget instead would have applied from
// the ground too, which is Sure Claws' job and which does move the shipped
// reachability graph. So this is a SEPARATE reachability path, OR'd with
// canReach inside bestPerch, and canReach itself is untouched.
//
// THE SAFETY ARGUMENT, in one line: a fence-run edge joins two perches whose
// heights differ by at most 0.35, and every step of every shipped golden-mouse
// chain is a climb of 0.9 or more (the Docks crane's rungs are 1.3-1.4 by
// deliberate design). No fence-run edge can therefore be a chain step, and
// test/climbing.test.js BFSes the real shipped perch arrays with the edge
// switched on to prove that every hop count is byte-identical.
//
// THE REACH NUMBER. 6.0 is large next to the 1.2/2.6 climb reaches, and it
// is that large for a content reason rather than a feel one: the only true
// fence LINES in the shipped world are neighborhood's dog-yard fence tops
// (22,-28) -> (18,-24) and its garden-fence pair (28,28) -> (32,24), both
// exactly 5.66 apart. A reach of 3 or 4 would have made this ability
// literally inert on every perch array that ships — built, tested, merged
// and doing nothing, which is this wave's characteristic failure. 6.0 clears
// 5.66 with a little room and stops well short of joining anything else:
// the next-nearest level pair in the game is 13.9 apart.
export const FENCE_RUN_REACH = 6.0;
// How far off level a hop may be and still count as "along the line". Small
// on purpose — see the safety argument above. It is also under every
// baseline reach's own height allowance, so enabling Fence Runner can never
// unlock a hop that a plain canReach at the SAME horizontal distance would
// have refused on height.
export const FENCE_RUN_LEVEL = 0.35;

// canFenceRun(perch, catPos, currentY) — is `perch` a level dash away?
//
// Measured from the cat's ACTUAL position rather than the perch it is
// standing on: a perched cat can walk along its perch (player.js skips the
// collider push while perchY > 0), so the cat may be a metre or two from the
// coordinates it landed on, and running from where the paws are is both more
// forgiving and more honest than running from where the hop started.
//
// The caller is responsible for the "must already be perched" half of the
// rule — see bestPerch, which only consults this when currentPerch is set.
export function canFenceRun(perch, catPos, currentY) {
  const horizontal = Math.hypot(perch.x - catPos.x, perch.z - catPos.z);
  return horizontal < FENCE_RUN_REACH && Math.abs(perch.y - currentY) <= FENCE_RUN_LEVEL;
}

// fenceRunning(state) — does this save's cat wall-run? Lives here beside the
// rule (and beside climbBudget) so the one call site in game/interactions.js
// imports its traversal answers from one module. Total over any input, like
// climbBudget, because hasSkill is.
export function fenceRunning(state) {
  return hasSkill(state, 'fence-runner');
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

// climbFor(budget, perch) — the height ceiling for ONE hop onto ONE prop:
// the flat `climb` field, raised by this perch's kind entry if the budget
// carries one. Composed by MAX for the same reason climbBudget composes the
// two abilities that way (see its comment), and never downward: a kind entry
// that is missing, mistyped, NaN or smaller than the flat budget leaves the
// flat budget standing, so a malformed climbKinds table can only ever fail to
// help — it can never make a hop the game already allowed illegal.
//
// The own-property check is the same discipline skills.js's featTally uses:
// budgets can be rebuilt by a partially-threaded call site from an object
// whose PROTOTYPE carries a 'tree' or 'constructor' key, and an inherited
// entry must not lift anything.
function climbFor(budget, perch) {
  const base = budgetField(budget, 'climb');
  const kinds = budget?.climbKinds;
  if (!kinds || typeof kinds !== 'object') return base;
  const kind = perchKind(perch);
  if (!Object.prototype.hasOwnProperty.call(kinds, kind)) return base;
  const lift = kinds[kind];
  return typeof lift === 'number' && Number.isFinite(lift) && lift > base ? lift : base;
}

// canReach(perch, catPos, currentY, budget) — budget defaults to the
// no-skills baseline, so the three-argument call this function shipped with
// is byte-for-byte the old behaviour.
//
// Still a PURE function of its arguments, deliberately (see the header): the
// per-kind lift arrives inside the budget and the kind on the perch, so a
// test can assert the no-skills and with-skills geometry side by side in one
// process. Nothing here reads a save.
export function canReach(perch, catPos, currentY, budget = BASE_CLIMB_BUDGET) {
  const reach = perch.y > 1 ? budgetField(budget, 'reachHigh') : budgetField(budget, 'reachLow');
  const horizontal = Math.hypot(perch.x - catPos.x, perch.z - catPos.z);
  return horizontal < reach && perch.y - currentY <= climbFor(budget, perch);
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
//
// v18 Fence Runner: `opts.fenceRun` adds the level-dash edge described above
// as a SECOND way for a candidate to qualify, and only while the cat is
// already on a perch (currentPerch set). Two consequences worth stating:
//
//   * The "prefer the highest" rule is untouched, so a climb always beats a
//     level dash when both are in reach — the ability can never shadow a
//     chain step with a sideways hop and trap the player on a fence.
//   * With the option off (the default) this function is byte-for-byte the
//     one that shipped, which is what keeps the no-skills path exact.
//
// v18 CF-9b Sure Claws: `opts.state` is the raw save, and it decides which
// perches EXIST for this cat (see perchAllowed). It is checked first, before
// any geometry: a gated perch a player has not earned is not a candidate at
// all, so it cannot be picked, cannot shadow a chain step under the
// prefer-the-highest rule, and cannot be reported anywhere. With the option
// absent — an un-threaded call site, or any save at all before CF-9b, since
// no perch carried `requires` then — every perch is allowed and this is
// again byte-for-byte the function that shipped.
//
// WIRING, and read CF-10 before skipping this paragraph. The game's ONE
// caller is game/interactions.js's doPounceOrClimb, and it must pass
// `state: progression.state` in the same opts object it already builds for
// `fenceRun`. Until it does, every `requires` perch in src/world/*.js is
// invisible to every player — the ability's second half ships dead, exactly
// the way the two traversal abilities did before CF-10a. The kind lift needs
// no wiring (the budget was threaded by CF-10a), but on its own it moves
// nothing a player can see: no SHIPPED perch is a tree or fence between the
// 1.6 baseline and the 2.0 ceiling. The gated perches are the feature.
export function bestPerch(perches, catPos, currentY, currentPerch, budget = BASE_CLIMB_BUDGET, opts = {}) {
  const fenceRun = !!opts?.fenceRun && !!currentPerch;
  const state = opts?.state;
  let best = null;
  for (const pp of perches ?? []) {
    if (pp === currentPerch) continue;
    if (!perchAllowed(pp, state)) continue;
    if (!canReach(pp, catPos, currentY, budget) &&
        !(fenceRun && canFenceRun(pp, catPos, currentY))) continue;
    if (!best || pp.y > best.y) best = pp;
  }
  return best;
}
