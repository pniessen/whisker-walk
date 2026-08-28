import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  canReach,
  canFenceRun,
  fenceRunning,
  bestPerch,
  climbBudget,
  FENCE_RUN_REACH,
  FENCE_RUN_LEVEL,
  BASE_CLIMB_BUDGET,
  SPRING_PAWS_CLIMB,
  SURE_CLAWS_KIND_CLIMB,
  SURE_CLAWS_CLIMB_KINDS,
  SURE_CLAWS_REACH_HIGH,
  SURE_CLAWS_REACH_LOW,
  SURE_CLAWS_ID,
  TREE_FORK_MAX,
  PERCH_KINDS,
  PERCH_KIND_DEFAULT,
  perchKind,
  perchAllowed,
  perchRequirement,
  visiblePerches,
  sureClawsTreePerch,
} from '../src/climbing.js';

// The area builders run headless here (no jsdom dep): the only DOM they
// touch is document.createElement('canvas') for the billboard texture, so a
// Proxy that swallows arbitrary 2D-context calls is enough. Same stub
// spots.test.js uses. Must be installed before the world modules import.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    // A blanket no-op Proxy is enough for the billboard's canvas, but not for
    // render/textures.js's surface tiles, which the world builders now ask
    // for. Two of their calls need a real answer rather than undefined:
    //   * createLinear/RadialGradient — the painters add colour stops to
    //     whatever comes back;
    //   * getImageData — every tile ends with a getImageData/putImageData
    //     readback (clampToFloor, the pass that GUARANTEES no texel falls
    //     below the luminance floor). clampToFloor does guard the headless
    //     path, but it guards it by asking whether getImageData is a
    //     function, which a blanket Proxy always answers yes to.
    // A zeroed buffer is the truthful answer here: nothing was ever actually
    // rasterised into this canvas.
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
const { build: buildDocks } = await import('../src/world/docks.js');
const { GOLD_MICE } = await import('../src/goldmice.js');

// Real coordinates from src/world/neighborhood.js's rooftop chain: a porch
// perch at y 1.3 leads to a rooftop perch at y 2.9 (a 1.6 climb), which leads
// to the ridge at y 4.1 (a 1.2 climb). See task-4.2-report.md for the full
// per-area chain tables.
describe('canReach', () => {
  it('reaches a ground-level fence-top perch (y 0.85) from standing height 0', () => {
    const fence = { x: 22, z: -28, y: 0.85 };
    expect(canReach(fence, { x: 22, z: -28 }, 0)).toBe(true);
  });

  it('does not reach a rooftop perch (y 2.9) directly from the ground — height gate blocks it even standing right under it', () => {
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    expect(canReach(roof, { x: -9.5, z: 15.5 }, 0)).toBe(false);
  });

  it('reaches the rooftop perch from the porch perch 1.6 below it (2.9 - 1.3 = 1.6)', () => {
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    const porch = { x: -9, z: 17.5, y: 1.3 };
    expect(canReach(roof, { x: porch.x, z: porch.z }, porch.y)).toBe(true);
  });

  it('reaches the ridge from the rooftop perch (2.9 -> 4.1, a 1.2 climb)', () => {
    const ridge = { x: -11.5, z: 15.5, y: 4.1 };
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    expect(canReach(ridge, { x: roof.x, z: roof.z }, roof.y)).toBe(true);
  });

  it('rejects a climb bigger than 1.6, even at close horizontal range', () => {
    const tooHigh = { x: 0, z: 0, y: 2.0 };
    expect(canReach(tooHigh, { x: 0, z: 0 }, 0)).toBe(false);
  });

  it('allows dropping down to a nearby lower perch, any distance below', () => {
    const lowPerch = { x: -11.5, z: 15.5, y: 0.85 }; // 8x farther down than the 1.6 climb-up budget
    expect(canReach(lowPerch, { x: -11.5, z: 15.5 }, 4.1)).toBe(true);
  });

  it('rejects a perch that is horizontally out of reach even though the height gate would pass', () => {
    const nearPerch = { x: 0, z: 0, y: 1.35 };
    expect(canReach(nearPerch, { x: 10, z: 10 }, 0)).toBe(false);
  });

  it('uses the longer 2.6 reach for perches above y 1 (collider-center perches), and 1.2 for low perches', () => {
    const high = { x: 2.5, z: 0, y: 1.35 }; // 2.5 < 2.6
    const low = { x: 1.0, z: 0, y: 0.85 };  // 1.0 < 1.2
    expect(canReach(high, { x: 0, z: 0 }, 0)).toBe(true);
    expect(canReach(low, { x: 0, z: 0 }, 0)).toBe(true);
    const lowTooFar = { x: 1.3, z: 0, y: 0.85 }; // 1.3 >= 1.2
    expect(canReach(lowTooFar, { x: 0, z: 0 }, 0)).toBe(false);
  });
});

// Real coordinates from src/world/neighborhood.js's billboard crate-stack
// chain: crate1 at (9.4,-14,y1.1) sits below the crate top (9.4,-14,y2.0),
// which is below the billboard lookout (7,-14,y3.3). From the crate top,
// both crate1 (a drop, always "reachable") and the lookout (a climb) are in
// range — bestPerch must prefer the higher one so repeated presses climb
// the chain instead of getting stuck bouncing to the lower perch.
describe('bestPerch', () => {
  const crate1 = { x: 9.4, z: -14, y: 1.1, label: 'crate' };
  const crateTop = { x: 9.4, z: -14, y: 2.0, label: 'crate top' };
  const lookout = { x: 7, z: -14, y: 3.3, label: 'billboard lookout', vantage: true };
  const perches = [crate1, crateTop, lookout];

  it('from the crate top, prefers the higher billboard lookout over the lower crate1, even though crate1 (a drop) is also reachable', () => {
    const catPos = { x: crateTop.x, z: crateTop.z };
    expect(bestPerch(perches, catPos, crateTop.y, crateTop)).toBe(lookout);
  });

  it('falls back to the only reachable perch when it is lower than the current position (no higher candidate in range)', () => {
    // Standing near crate1 with nothing else close enough horizontally except
    // crate1 itself (excluded as current) — simulate by putting the cat where
    // only crate1 is in reach: far from the lookout's tighter horizontal window.
    const farFromLookout = [crate1, lookout];
    const catPos = { x: crate1.x, z: crate1.z };
    // From ground level near crate1, the lookout (y 3.3) is too high a climb
    // (3.3 > 1.6) and too far horizontally, so only crate1 is reachable.
    expect(bestPerch(farFromLookout, catPos, 0, null)).toBe(crate1);
  });

  it('returns null when no perch is reachable', () => {
    expect(bestPerch([lookout], { x: 0, z: 0 }, 0, null)).toBeNull();
  });

  it('skips the current perch by reference even if it would otherwise be the highest candidate', () => {
    const only = [crateTop];
    expect(bestPerch(only, { x: crateTop.x, z: crateTop.z }, crateTop.y, crateTop)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// v18 "Cat Skills" — Spring Paws / Sure Claws budget threading
// ---------------------------------------------------------------------------

describe('canReach budget parameter', () => {
  it('defaults to the no-skills baseline, so a three-argument call is unchanged', () => {
    const perch = { x: 0, z: 0, y: 2.0 };
    expect(canReach(perch, { x: 0, z: 0 }, 0)).toBe(false);
    expect(canReach(perch, { x: 0, z: 0 }, 0, BASE_CLIMB_BUDGET)).toBe(false);
    expect(canReach(perch, { x: 0, z: 0 }, 0, { ...BASE_CLIMB_BUDGET, climb: 2.2 })).toBe(true);
  });

  it('honours reachHigh and reachLow independently', () => {
    const wide = { ...BASE_CLIMB_BUDGET, reachHigh: 3.2, reachLow: 1.7 };
    const high = { x: 3.0, z: 0, y: 1.35 }; // 3.0 is past the 2.6 baseline, inside 3.2
    const low = { x: 1.5, z: 0, y: 0.85 };  // 1.5 is past the 1.2 baseline, inside 1.7
    expect(canReach(high, { x: 0, z: 0 }, 0)).toBe(false);
    expect(canReach(low, { x: 0, z: 0 }, 0)).toBe(false);
    expect(canReach(high, { x: 0, z: 0 }, 0, wide)).toBe(true);
    expect(canReach(low, { x: 0, z: 0 }, 0, wide)).toBe(true);
  });

  it('falls back per-field to the baseline for a missing, NaN or negative budget field', () => {
    // A NaN climb budget would make `perch.y - currentY <= NaN` false forever
    // — every climb silently deleted. A NaN reach would do the same to every
    // horizontal test. Both must degrade to today's number, not to "nothing
    // is reachable".
    const perch = { x: 1.0, z: 0, y: 0.85 }; // inside the 1.2 baseline reachLow
    for (const bad of [undefined, null, {}, { climb: NaN, reachLow: NaN }, { climb: -1, reachLow: -1 }, 'nope', 7]) {
      expect(canReach(perch, { x: 0, z: 0 }, 0, bad)).toBe(true);
    }
    const tooHigh = { x: 0, z: 0, y: 2.0 };
    for (const bad of [{ climb: Infinity }, { climb: '9e99' }]) {
      expect(canReach(tooHigh, { x: 0, z: 0 }, 0, bad)).toBe(false);
    }
  });

  it('bestPerch threads the budget through and defaults the same way', () => {
    const crateTop = { x: 0, z: 0, y: 2.0 };
    const crate1 = { x: 0, z: 0, y: 1.1 };
    const perches = [crate1, crateTop];
    // Baseline: the 2.0 crate top is a 2.0 climb from the ground — over the
    // 1.6 budget — so the lower crate wins.
    expect(bestPerch(perches, { x: 0, z: 0 }, 0, null)).toBe(crate1);
    expect(bestPerch(perches, { x: 0, z: 0 }, 0, null, climbBudget({ skills: ['spring-paws'] }))).toBe(crateTop);
  });
});

describe('climbBudget', () => {
  it('returns the exact shipped baseline for a save with no skills', () => {
    expect(climbBudget({})).toEqual({ climb: 1.6, reachHigh: 2.6, reachLow: 1.2, climbKinds: {} });
    expect(climbBudget({})).toBe(BASE_CLIMB_BUDGET);
  });

  it('never throws on a hostile or absent save, and yields the baseline for one', () => {
    // Same contract as skills.js's predicates: state may be any type at all
    // (the cloud stores the payload as opaque jsonb).
    for (const s of [undefined, null, 0, 'x', [], { skills: 'spring-paws' }, { skills: [1, 2] }, { feats: null }]) {
      expect(climbBudget(s)).toEqual(BASE_CLIMB_BUDGET);
    }
  });

  it('lifts only the climb height for Spring Paws, to the spec-pinned 2.2', () => {
    const b = climbBudget({ skills: ['spring-paws'] });
    expect(b.climb).toBe(SPRING_PAWS_CLIMB);
    expect(b.climb).toBe(2.2);
    expect(b.reachHigh).toBe(BASE_CLIMB_BUDGET.reachHigh);
    expect(b.reachLow).toBe(BASE_CLIMB_BUDGET.reachLow);
  });

  it('lifts both reaches for Sure Claws, and the climb height ONLY per kind', () => {
    // v18 CF-9b: the blanket 1.6 -> 1.85 lift is gone. A Sure Claws cat
    // climbs a crate, a car, a parapet and a bollard on exactly the baseline
    // 1.6 every other cat uses; what it gets instead is the kind table.
    const b = climbBudget({ skills: ['sure-claws'] });
    expect(b.climb).toBe(BASE_CLIMB_BUDGET.climb);
    expect(b.reachHigh).toBe(SURE_CLAWS_REACH_HIGH);
    expect(b.reachLow).toBe(SURE_CLAWS_REACH_LOW);
    expect(b.climbKinds).toBe(SURE_CLAWS_CLIMB_KINDS);
    expect(b.climbKinds).toEqual({ tree: 2.0, fence: 2.0 });
  });

  it('lifts the climb height on trees and fences and on nothing else', () => {
    const b = climbBudget({ skills: ['sure-claws'] });
    const lifted = PERCH_KINDS.filter((k) => canReach({ x: 0, z: 0, y: 1.9, kind: k }, { x: 0, z: 0 }, 0, b));
    expect(lifted.sort()).toEqual(['fence', 'tree']);
    // ...and an untagged perch is one of the ones that is NOT lifted, which
    // is what makes the tag optional and its absence safe.
    expect(canReach({ x: 0, z: 0, y: 1.9 }, { x: 0, z: 0 }, 0, b)).toBe(false);
  });

  it('keeps the Sure Claws tree ceiling under the y 2.1 park oak branch', () => {
    // Load-bearing, and the direct successor to the old dune-ledge bound:
    // gm-park-2 AND feather-5 both sit on the oak branch at y 2.1, the top
    // step of the ground -> bench 0.58 -> branch chain and the only tree
    // chain in the game. A tree ceiling of 2.1 would let a Sure Claws cat
    // take it straight off the grass, deleting the chain.
    expect(SURE_CLAWS_KIND_CLIMB).toBeLessThan(2.1);
    // The seaside dune ledge is safe for a different and stronger reason
    // now: it is 'stone', so it is not in the kind table at all.
    expect(SURE_CLAWS_CLIMB_KINDS).not.toHaveProperty('stone');
  });

  it('is not a decorative table — every opened tree fork needs the lift to be reachable', () => {
    // The counter-test to the bound above. TREE_FORK_MAX sits ABOVE the 1.6
    // baseline, so the tree ceiling fires the first time a Sure Claws cat
    // walks up to an opened tree; a ceiling that only ever equalled the
    // baseline would be a number that could never do anything.
    expect(TREE_FORK_MAX).toBeGreaterThan(BASE_CLIMB_BUDGET.climb);
    expect(TREE_FORK_MAX).toBeLessThan(SURE_CLAWS_KIND_CLIMB);
    const fork = { x: 0, z: 0, y: TREE_FORK_MAX, kind: 'tree' };
    expect(canReach(fork, { x: 0, z: 0 }, 0, BASE_CLIMB_BUDGET)).toBe(false);
    expect(canReach(fork, { x: 0, z: 0 }, 0, climbBudget({ skills: [SURE_CLAWS_ID] }))).toBe(true);
  });

  it('composes the two abilities by MAX, never by sum', () => {
    // 1.6 + 0.6 + 0.25 = 2.45 would clear the y 2.0 crate top and leave only
    // 0.85 to the y 3.3 billboard lookout — the one-hop-skips-the-chain
    // failure the spec's Risks section calls out.
    const b = climbBudget({ skills: ['spring-paws', 'sure-claws'] });
    expect(b.climb).toBe(SPRING_PAWS_CLIMB);
    expect(b.reachHigh).toBe(SURE_CLAWS_REACH_HIGH);
    expect(b.reachLow).toBe(SURE_CLAWS_REACH_LOW);
    // The per-kind table composes by max with the flat budget too, in
    // canReach: a player holding both climbs a tree on Spring Paws' 2.2, not
    // down at the 2.0 tree ceiling. Holding a second skill is never worse.
    const tallTree = { x: 0, z: 0, y: 2.15, kind: 'tree' };
    expect(canReach(tallTree, { x: 0, z: 0 }, 0, climbBudget({ skills: ['sure-claws'] }))).toBe(false);
    expect(canReach(tallTree, { x: 0, z: 0 }, 0, b)).toBe(true);
  });

  it('honours a persisted skill id and a satisfied feat predicate alike', () => {
    // hasSkill is (persisted OR predicate) — Sure Claws' feat is 25 tip-overs.
    expect(climbBudget({ feats: { mischief: 24 } })).toBe(BASE_CLIMB_BUDGET);
    expect(climbBudget({ feats: { mischief: 25 } }).climbKinds).toBe(SURE_CLAWS_CLIMB_KINDS);
  });
});

// ---------------------------------------------------------------------------
// v18 CF-9b — perch kinds and the per-prop climb ceiling.
// ---------------------------------------------------------------------------

describe('perchKind', () => {
  it('reads the tag when it is one of the closed vocabulary', () => {
    for (const k of PERCH_KINDS) expect(perchKind({ kind: k })).toBe(k);
  });

  it('falls back to the neutral default for an absent, unknown or hostile tag', () => {
    // THE property that makes the tag optional: an untagged perch — a test
    // fixture, a future area, a hand-written record — must behave exactly as
    // it did before kinds existed, and 'prop' is in no kind table.
    for (const p of [{}, undefined, null, 0, 'tree', [], { kind: 'trees' }, { kind: 'TREE' },
      { kind: 42 }, { kind: null }, { kind: 'constructor' }, { kind: '__proto__' }]) {
      expect(perchKind(p)).toBe(PERCH_KIND_DEFAULT);
    }
  });
});

describe('canReach — the per-kind climb ceiling', () => {
  const CLAWS = climbBudget({ skills: [SURE_CLAWS_ID] });

  it('never LOWERS the flat budget, whatever the kind table says', () => {
    // A malformed or hostile climbKinds may fail to help; it may never make
    // a hop the game already allowed illegal. Same posture as budgetField.
    const perch = { x: 0, z: 0, y: 1.5, kind: 'tree' };
    for (const kinds of [{ tree: 0 }, { tree: -5 }, { tree: NaN }, { tree: '9e99' },
      { tree: null }, 'nope', 7, null, undefined]) {
      expect(canReach(perch, { x: 0, z: 0 }, 0, { ...BASE_CLIMB_BUDGET, climbKinds: kinds })).toBe(true);
    }
  });

  it('ignores an INHERITED kind entry', () => {
    // skills.js's own-property discipline, for the same reason: a budget can
    // be rebuilt by a partially-threaded call site from an object whose
    // prototype carries a 'tree' key, and an inherited entry must not lift.
    const kinds = Object.create({ tree: 99 });
    const perch = { x: 0, z: 0, y: 1.9, kind: 'tree' };
    expect(canReach(perch, { x: 0, z: 0 }, 0, { ...BASE_CLIMB_BUDGET, climbKinds: kinds })).toBe(false);
  });

  it('lifts the ceiling without touching either horizontal reach', () => {
    // The lift is a HEIGHT rule. A tree fork 3.5 out is still out of reach
    // with Sure Claws' widened 3.2 reachHigh, tag or no tag.
    expect(canReach({ x: 3.5, z: 0, y: 1.9, kind: 'tree' }, { x: 0, z: 0 }, 0, CLAWS)).toBe(false);
    expect(canReach({ x: 3.0, z: 0, y: 1.9, kind: 'tree' }, { x: 0, z: 0 }, 0, CLAWS)).toBe(true);
  });
});

describe('sureClawsTreePerch', () => {
  it('reproduces the shipped oak convention — trunk top (2 * scale) less 0.1', () => {
    expect(sureClawsTreePerch(1, 2, 0.9).y).toBe(1.7);
    expect(sureClawsTreePerch(1, 2, 0.58).y).toBe(1.06); // no float tail in shipped data
  });

  it('caps at TREE_FORK_MAX, so a big tree gets a LOW fork rather than an unreachable one', () => {
    // Every park tree is scale 1.2+ (trunk top 2.4+). Uncapped, its fork
    // would sit above the 2.0 tree ceiling and the perch would be dead
    // content: gated, visible to the ability, and unreachable by it.
    for (const scale of [1.05, 1.1, 1.2, 1.5, 3]) {
      expect(sureClawsTreePerch(0, 0, scale).y).toBe(TREE_FORK_MAX);
    }
    expect(sureClawsTreePerch(0, 0, 1.1).y).toBeLessThan(2.1); // under the shipped oak branch
  });

  it('tags and gates every perch it makes', () => {
    const p = sureClawsTreePerch(4, -5, 1);
    expect(p).toEqual({ x: 4, z: -5, y: 1.9, kind: 'tree', requires: SURE_CLAWS_ID });
  });

  it('degrades a garbage scale to 1 rather than producing a NaN perch', () => {
    for (const bad of [undefined, null, NaN, -1, 0, 'big', {}]) {
      expect(sureClawsTreePerch(0, 0, bad).y).toBe(TREE_FORK_MAX);
    }
  });
});

describe('perchAllowed / visiblePerches', () => {
  const open = { x: 0, z: 0, y: 1 };
  const gated = { x: 1, z: 0, y: 1, requires: SURE_CLAWS_ID };

  it('shows an ungated perch to everyone, including a save that is not an object', () => {
    for (const s of [undefined, null, 0, 'x', [], {}, { skills: [SURE_CLAWS_ID] }]) {
      expect(perchAllowed(open, s)).toBe(true);
    }
  });

  it('hides a gated perch until the save holds the named skill', () => {
    expect(perchAllowed(gated, {})).toBe(false);
    expect(perchAllowed(gated, { skills: [SURE_CLAWS_ID] })).toBe(true);
    expect(perchAllowed(gated, { feats: { mischief: 24 } })).toBe(false);
    expect(perchAllowed(gated, { feats: { mischief: 25 } })).toBe(true); // the feat route
  });

  it('FAILS CLOSED on an unknown or malformed requirement', () => {
    // A renamed skill or a typo must hide the perch from everyone, not open
    // it for everyone: an unreachable prop is a missing feature, an
    // accidentally-open one is a broken chain.
    for (const bad of ['no-such-skill', '', 0, 42, [], {}, null]) {
      const p = { x: 0, z: 0, y: 1, requires: bad };
      const allowed = perchAllowed(p, { skills: [SURE_CLAWS_ID] });
      expect(allowed).toBe(perchRequirement(p) === null); // only a non-string is "ungated"
      if (typeof bad === 'string' && bad) expect(allowed).toBe(false);
    }
  });

  it('filters an array without mutating it, and tolerates a missing one', () => {
    const perches = [open, gated];
    expect(visiblePerches(perches, {})).toEqual([open]);
    expect(visiblePerches(perches, { skills: [SURE_CLAWS_ID] })).toEqual([open, gated]);
    expect(perches).toHaveLength(2);
    expect(visiblePerches(undefined, {})).toEqual([]);
    expect(visiblePerches(null, { skills: [SURE_CLAWS_ID] })).toEqual([]);
  });
});

describe('bestPerch — gated perches are invisible, not merely out of reach', () => {
  const chainStep = { x: 0, z: 0, y: 1.3, label: 'porch roof' };
  const gatedHigher = { x: 0.5, z: 0, y: 1.5, kind: 'tree', requires: SURE_CLAWS_ID };
  const perches = [chainStep, gatedHigher];

  it('does not pick — or even consider — a gated perch without the skill', () => {
    // The failure this prevents: bestPerch prefers the HIGHEST reachable
    // candidate, so a gated perch left in the array and merely made tall
    // would shadow the chain step below it the moment it came into reach.
    expect(bestPerch(perches, { x: 0, z: 0 }, 0, null)).toBe(chainStep);                       // un-threaded
    expect(bestPerch(perches, { x: 0, z: 0 }, 0, null, BASE_CLIMB_BUDGET, {})).toBe(chainStep); // no state
    expect(bestPerch(perches, { x: 0, z: 0 }, 0, null, BASE_CLIMB_BUDGET, { state: {} })).toBe(chainStep);
  });

  it('picks it once the save holds the skill', () => {
    const state = { skills: [SURE_CLAWS_ID] };
    expect(bestPerch(perches, { x: 0, z: 0 }, 0, null, climbBudget(state), { state })).toBe(gatedHigher);
  });

  it('hides gated perches from the fence-run path too, not just the climb path', () => {
    // Fence Runner is a SECOND reachability path (canFenceRun). The gate is
    // applied before either, so an unearned perch cannot be dashed to.
    const fenceA = { x: 22, z: -28, y: 0.85, kind: 'fence' };
    const gatedB = { x: 26, z: -24, y: 0.85, kind: 'fence', requires: SURE_CLAWS_ID };
    const opts = { fenceRun: true };
    expect(bestPerch([fenceA, gatedB], { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA, BASE_CLIMB_BUDGET, opts))
      .toBeNull();
    expect(bestPerch([fenceA, gatedB], { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA, BASE_CLIMB_BUDGET,
      { ...opts, state: { skills: [SURE_CLAWS_ID] } })).toBe(gatedB);
  });

  it('tolerates a garbage state in opts, hiding gated perches rather than throwing', () => {
    for (const bad of [null, 0, 'yes', [], NaN]) {
      expect(bestPerch(perches, { x: 0, z: 0 }, 0, null, BASE_CLIMB_BUDGET, { state: bad })).toBe(chainStep);
    }
  });
});

// ---------------------------------------------------------------------------
// THE shipped-content pin (spec §Risks, plan Task 2.2).
//
// Both directions, against the perch arrays that actually ship out of
// src/world/*.js — not hand-copied coordinates, which is how a placement
// regression hides:
//
//   1. WITHOUT skills, every one of the nine golden mice and the rooftop
//      collectible stays reachable at exactly the hop count it takes today.
//   2. WITH the skills, none of them becomes unreachable, and the tall chains
//      are not collapsed into one hop off the ground.
//
// Movement model, matching game/interactions.js's doPounceOrClimb:
//   - On the ground the cat can walk to any (x, z), so a ground -> perch hop
//     is measured with the cat standing directly under the perch.
//   - While perched the cat is snapped to the perch's own coordinates
//     (session.cat.position.set(next.x, next.y, next.z)), so a perch -> perch
//     hop is measured between the two perch coordinates. This is what makes
//     the chains chains.
// ---------------------------------------------------------------------------

// minHops(target, perches, budget, fenceRun) -> hops needed to stand within
// the golden mouse pickup window (checkFind's 1.0 horizontal / 0.9 vertical,
// goldmice.js) of `target`. 0 for a ground-level target, Infinity if no chain
// gets there.
//
// `fenceRun` (v18 Task 3.1) adds the wall-run edge to the PERCH-TO-PERCH pass
// only, never to the ground pass — which is exactly the rule bestPerch
// enforces via `currentPerch`, and the reason the ability can never turn
// anything into a walk-up.
// hopsFromGround(perches, budget, fenceRun) -> Map<perch, hops>. Extracted
// from minHops by CF-9b because the gated-perch proofs below need the whole
// map, not one lookup out of it: "is every perch this ability opens actually
// reachable BY it" is a question about every node in the graph.
function hopsFromGround(perches, budget, fenceRun = false) {
  const dist = new Map();
  const queue = [];
  for (const p of perches) {
    if (canReach(p, { x: p.x, z: p.z }, 0, budget)) {
      dist.set(p, 1);
      queue.push(p);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const p of perches) {
      if (p === cur || dist.has(p)) continue;
      if (canReach(p, { x: cur.x, z: cur.z }, cur.y, budget) ||
          (fenceRun && canFenceRun(p, { x: cur.x, z: cur.z }, cur.y))) {
        dist.set(p, dist.get(cur) + 1);
        queue.push(p);
      }
    }
  }
  return dist;
}

function minHops(target, perches, budget, fenceRun = false) {
  const dist = hopsFromGround(perches, budget, fenceRun);
  if (target.y === 0) return 0; // ground mice need no perch at all
  // The MINIMUM over every perch inside the pickup window, not the first one
  // in declaration order. Before CF-9b there was exactly one perch per window
  // so the two were the same; now that world files append gated records, a
  // first-match lookup would silently depend on gated perches being declared
  // last — a proof resting on array order is not a proof.
  let best = Infinity;
  for (const p of perches) {
    if (Math.hypot(p.x - target.x, p.z - target.z) < 1.0 && Math.abs(p.y - target.y) < 0.9) {
      best = Math.min(best, dist.get(p) ?? Infinity);
    }
  }
  return best;
}

const AREAS = {
  neighborhood: buildNeighborhood(new THREE.Scene()),
  park: buildPark(new THREE.Scene()),
  seaside: buildSeaside(new THREE.Scene()),
  docks: buildDocks(new THREE.Scene()),
};
// Every ELEVATED collectible in the game (y > 0), each named explicitly.
//
// The last two are here because of a review finding, not because they are
// interesting: `feather-5` sits on the exact coordinates of `gm-park-2` and
// `fish-5` on those of `gm-sea-2`, so before this they were "covered" only by
// the golden mice happening to stand in the same spot. Nudge either
// collectible by a metre and the coverage would have vanished silently while
// this file stayed green. Explicit entries, the way `tin-5` already had, mean
// a moved collectible fails HERE instead of shipping unreachable.
const ELEVATED = [
  ['yarn-roof', 'neighborhood'], // the legendary silver yarn ball, on the ridge
  ['tin-5', 'docks'],            // the legendary ship's bell, on W1's parapet (v18 Task 2.6)
  ['feather-5', 'park'],
  ['fish-5', 'seaside'],
].map(([id, area]) => {
  const c = AREAS[area].collectibles.find((x) => x.id === id);
  if (!c) throw new Error(`no collectible ${id} in ${area}`); // renamed or removed
  return { id, area, x: c.x, z: c.z, y: c.y };
});

// The four traversal saves — as SAVES, not as budgets.
//
// v18 CF-9b changed what this proof has to model. Before it, a save affected
// only the three budget numbers, so a table computed from a budget was a
// complete description of a player. Now the save ALSO decides which perches
// exist (gated `requires` records), so a budget-keyed table would describe a
// player who has Sure Claws' geometry but none of its props — a state no real
// player is ever in, and precisely the state in which a placement bug would
// hide. Everything below is keyed on a save and derives both halves from it.
const STATES = {
  none: {},
  spring: { skills: ['spring-paws'] },
  claws: { skills: [SURE_CLAWS_ID] },
  both: { skills: ['spring-paws', SURE_CLAWS_ID] },
};

function hopTable(state, fenceRun = false) {
  const budget = climbBudget(state);
  const out = {};
  const seen = (area) => visiblePerches(AREAS[area].perches, state);
  for (const [area, mice] of Object.entries(GOLD_MICE)) {
    for (const m of mice) out[m.id] = minHops(m, seen(area), budget, fenceRun);
  }
  for (const c of ELEVATED) {
    out[c.id] = minHops({ x: c.x, z: c.z, y: c.y }, seen(c.area), budget, fenceRun);
  }
  return out;
}

// The shipped chain lengths, as tuned against the 1.6 budget. If a future
// change to canReach, to a world perch array, or to GOLD_MICE moves any of
// these, THIS is the test that must be looked at before the number is edited.
const SHIPPED_HOPS = {
  'gm-neigh-1': 3, // king-of-the-roof ridge: ground -> porch 1.3 -> roof 2.9 -> ridge 4.1
  'gm-neigh-2': 3, // billboard lookout: ground -> crate 1.1 -> crate top 2.0 -> lookout 3.3
  'gm-neigh-3': 0, // hidden at ground level
  'gm-park-1': 1,  // bench 0.58
  'gm-park-2': 2,  // oak branch: ground -> bench 0.58 -> branch 2.1
  'gm-park-3': 0,
  'gm-sea-1': 1,   // overlook boulder 0.72
  'gm-sea-2': 2,   // dune ledge: ground -> boulder 0.72 -> ledge 1.9
  'gm-sea-3': 0,
  // v18 Task 2.6, The Old Docks. The longest chain in the game.
  'gm-docks-1': 5, // roof tank y 6.2: ground -> crate 1.15 -> crate top 2.4 -> fire-escape landing 3.9 -> parapet 5.3 -> tank 6.2
  'gm-docks-2': 4, // crane cab y 5.4: ground -> crate 1.3 -> container 2.6 -> crane deck 4.0 -> cab 5.4
  'gm-docks-3': 0, // hidden at ground level in the alley between the west warehouses
  'yarn-roof': 3,  // the legendary silver yarn ball, on the ridge with gm-neigh-1
  'tin-5': 4,      // the legendary ship's bell, on the docks warehouse parapet
  'feather-5': 2,  // shares the oak branch with gm-park-2 — same chain, same count
  'fish-5': 2,     // shares the dune ledge with gm-sea-2 — same chain, same count
};

describe('shipped golden mice and rooftop collectible — no skills', () => {
  it('covers EVERY elevated collectible in the game, not just the ones we listed', () => {
    // The guard on the guard. ELEVATED is hand-written, so a fifth rooftop
    // collectible added to any area would otherwise get no reachability
    // coverage at all and nobody would notice. Derived from the shipped world
    // data so it cannot be satisfied by editing the list alone.
    const shipped = Object.entries(AREAS)
      .flatMap(([area, a]) => a.collectibles.filter((c) => (c.y ?? 0) > 0).map((c) => `${area}:${c.id}`));
    expect(shipped.sort()).toEqual(ELEVATED.map((c) => `${c.area}:${c.id}`).sort());
  });

  it('every one is still reachable, at exactly the hop count it takes today', () => {
    expect(hopTable(STATES.none)).toEqual(SHIPPED_HOPS);
  });

  it('no mouse is reachable without a perch except the three deliberately-hidden ground ones', () => {
    const table = hopTable(STATES.none);
    const ground = Object.entries(table).filter(([, hops]) => hops === 0).map(([id]) => id);
    expect(ground.sort()).toEqual(['gm-docks-3', 'gm-neigh-3', 'gm-park-3', 'gm-sea-3']);
    for (const hops of Object.values(table)) expect(hops).toBeLessThan(Infinity);
  });
});

describe('shipped golden mice and rooftop collectible — with the v18 traversal skills', () => {
  const { spring: SPRING, claws: CLAWS, both: BOTH } = STATES;

  it('Sure Claws changes NOTHING about the shipped placements', () => {
    // The 1.85 climb ceiling sits under every shipped chain's next step, and
    // the wider reaches only let the cat grab a perch from further away —
    // they can never make a hop the height gate already refused.
    expect(hopTable(CLAWS)).toEqual(SHIPPED_HOPS);
  });

  it('nothing becomes UNREACHABLE under any skill combination', () => {
    for (const state of [SPRING, CLAWS, BOTH]) {
      for (const hops of Object.values(hopTable(state))) expect(hops).toBeLessThan(Infinity);
    }
  });

  it('Spring Paws shortens chains exactly where the spec says it should, and nowhere else', () => {
    // The spec's traversal table pins the climb budget at 1.6 -> 2.2 and says
    // "perch chains need fewer intermediate steps". These three are the
    // ENTIRE effect of that on shipped content:
    //   gm-neigh-2  3 -> 2  (ground reaches the y 2.0 crate top, skipping the y 1.1 crate)
    //   gm-park-2   2 -> 1  (ground reaches the y 2.1 oak branch, skipping the bench)
    //   gm-sea-2    2 -> 1  (ground reaches the y 1.9 dune ledge, skipping the boulder)
    // and everything else is untouched.
    //
    // NOTE FOR REVIEW: the park and seaside two-step chains DO collapse to a
    // single hop. That is unavoidable at 2.2 — their top steps sit at y 2.1
    // and y 1.9, both under the budget — and it is in tension with the spec's
    // own Risks note that placements "must not become trivially skippable".
    // It is pinned here rather than left silent: dropping SPRING_PAWS_CLIMB
    // below 1.9 would restore both chains, at the cost of the spec's number.
    // Both mice still require a climb press from the ground; neither becomes
    // a walk-up, and neither becomes unreachable.
    //   gm-docks-1  5 -> 4  (the y 1.9 fire-escape landing comes into ground
    //                         reach, and 1.9 -> 3.9 becomes one 2.0 hop)
    //   tin-5       4 -> 3  (the same saving, one step lower on the chain)
    // The Docks' crane chain (gm-docks-2) is deliberately built out of
    // 1.3-1.4 rungs, so no budget under 2.6 can skip one of its steps — it
    // stays four hops in every skill state.
    // feather-5 and fish-5 stand on gm-park-2 / gm-sea-2 exactly, so they
    // shorten with them — listed rather than folded in, so a future
    // divergence between a mouse and its co-located collectible shows up.
    expect(hopTable(SPRING)).toEqual({
      ...SHIPPED_HOPS,
      'gm-neigh-2': 2,
      'gm-park-2': 1,
      'gm-sea-2': 1,
      'gm-docks-1': 4,
      'tin-5': 3,
      'feather-5': 1,
      'fish-5': 1,
    });
    expect(hopTable(BOTH)).toEqual(hopTable(SPRING));
  });

  it('never collapses the two TALL chains — the ridge and the billboard stay multi-hop', () => {
    for (const state of [SPRING, CLAWS, BOTH]) {
      const table = hopTable(state);
      expect(table['gm-neigh-1']).toBe(3); // y 4.1 ridge — unchanged, 3 hops
      expect(table['yarn-roof']).toBe(3);  // same ridge, the rooftop collectible
      expect(table['gm-neigh-2']).toBeGreaterThan(1); // y 3.3 lookout — never one hop
      // The Docks' two tall chains are the whole point of the area: neither
      // may ever become a walk-up, under any budget.
      expect(table['gm-docks-1']).toBeGreaterThanOrEqual(4);
      expect(table['gm-docks-2']).toBe(4);
    }
  });

  it('leaves the y 2.9 rooftop and the y 4.1 ridge out of one-hop ground range', () => {
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    const ridge = { x: -11.5, z: 15.5, y: 4.1 };
    for (const state of [SPRING, CLAWS, BOTH]) {
      const budget = climbBudget(state);
      expect(canReach(roof, { x: roof.x, z: roof.z }, 0, budget)).toBe(false);
      expect(canReach(ridge, { x: ridge.x, z: ridge.z }, 0, budget)).toBe(false);
    }
  });
});

// ===========================================================================
// v18 Task 3.1 — Fence Runner.
//
// The ability is a SECOND reachability path, not a wider climb budget. These
// tests hold both halves of that claim: it does something real on the perch
// arrays that actually ship, and it moves NOTHING about the shipped
// golden-mouse / rooftop-collectible reachability, in any skill state.
// ===========================================================================

describe('canFenceRun', () => {
  it('dashes to a level perch well past the ordinary horizontal reach', () => {
    // The dog-yard fence tops, verbatim from src/world/neighborhood.js:
    // 5.657 apart, both y 0.85. Out of reach by the climb rule (5.657 >= the
    // 1.2 reachLow those low perches get), in reach by the wall-run.
    const a = { x: 22, z: -28, y: 0.85 };
    const b = { x: 18, z: -24, y: 0.85 };
    expect(canReach(b, { x: a.x, z: a.z }, a.y)).toBe(false);
    expect(canFenceRun(b, { x: a.x, z: a.z }, a.y)).toBe(true);
  });

  it('refuses a dash longer than the reach', () => {
    const far = { x: FENCE_RUN_REACH, z: 0, y: 0.85 };
    expect(canFenceRun(far, { x: 0, z: 0 }, 0.85)).toBe(false);
    const justInside = { x: FENCE_RUN_REACH - 0.01, z: 0, y: 0.85 };
    expect(canFenceRun(justInside, { x: 0, z: 0 }, 0.85)).toBe(true);
  });

  it('refuses anything that is not level, in either direction', () => {
    // THE safety property: a wall-run can never gain (or shed) real height,
    // so it can never be a chain step. Every shipped chain rung is a climb of
    // 0.9 or more.
    const up = { x: 1, z: 0, y: 0.85 + FENCE_RUN_LEVEL + 0.001 };
    const down = { x: 1, z: 0, y: 0.85 - FENCE_RUN_LEVEL - 0.001 };
    expect(canFenceRun(up, { x: 0, z: 0 }, 0.85)).toBe(false);
    expect(canFenceRun(down, { x: 0, z: 0 }, 0.85)).toBe(false);
    expect(canFenceRun({ x: 1, z: 0, y: 0.85 + FENCE_RUN_LEVEL }, { x: 0, z: 0 }, 0.85)).toBe(true);
  });

  it('stays well under every shipped chain rung, so it can never be a step', () => {
    // Smallest climb on any shipped chain step: the fish-market shed roof
    // (2.1 - 1.1 = 1.0) and the Docks crane's deliberate 1.3-1.4 rungs.
    expect(FENCE_RUN_LEVEL).toBeLessThan(0.9);
  });
});

describe('fenceRunning', () => {
  it('is off for a fresh save and on for the persisted skill', () => {
    expect(fenceRunning({})).toBe(false);
    expect(fenceRunning({ skills: ['fence-runner'] })).toBe(true);
  });

  it('honours the feat predicate at its boundary (25 vantage perches)', () => {
    expect(fenceRunning({ feats: { perch: 24 } })).toBe(false);
    expect(fenceRunning({ feats: { perch: 25 } })).toBe(true);
  });

  it('never throws on a hostile or absent save', () => {
    for (const s of [undefined, null, 0, 'x', [], { skills: 'fence-runner' }, { feats: { perch: '9e99' } }]) {
      expect(fenceRunning(s)).toBe(false);
    }
  });
});

describe('bestPerch — the Fence Runner option', () => {
  const fenceA = { x: 22, z: -28, y: 0.85 };
  const fenceB = { x: 18, z: -24, y: 0.85 };
  const perches = [fenceA, fenceB];

  it('changes nothing when the option is absent — the shipped call is exact', () => {
    // Standing on fence top A, nothing is in reach today, which is what makes
    // doPounceOrClimb hop down to the ground.
    expect(bestPerch(perches, { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA)).toBeNull();
    expect(bestPerch(perches, { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA, BASE_CLIMB_BUDGET, {}))
      .toBeNull();
    expect(bestPerch(perches, { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA, BASE_CLIMB_BUDGET, { fenceRun: false }))
      .toBeNull();
  });

  it('chains along the fence line with the option on', () => {
    expect(bestPerch(perches, { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA, BASE_CLIMB_BUDGET, { fenceRun: true }))
      .toBe(fenceB);
    // ...and back again, so the line is walkable in both directions.
    expect(bestPerch(perches, { x: fenceB.x, z: fenceB.z }, fenceB.y, fenceB, BASE_CLIMB_BUDGET, { fenceRun: true }))
      .toBe(fenceA);
  });

  it('does NOTHING from the ground — the ability is "without dropping to ground"', () => {
    // currentPerch null means the cat is standing on the pavement. A fence
    // top 5.66m away must stay a walk-over-and-climb, never a standing leap.
    expect(bestPerch(perches, { x: fenceA.x, z: fenceA.z }, 0, null, BASE_CLIMB_BUDGET, { fenceRun: true }))
      .toBe(fenceA); // the one under the cat's paws, by the ordinary rule
    expect(bestPerch([fenceB], { x: fenceA.x, z: fenceA.z }, 0, null, BASE_CLIMB_BUDGET, { fenceRun: true }))
      .toBeNull();
  });

  it('still prefers a climb over a level dash, so a chain is never shadowed', () => {
    // A step UP is always the better press: it is what walking a chain means.
    const up = { x: fenceA.x + 1, z: fenceA.z, y: 2.0 };
    const chosen = bestPerch(
      [fenceB, up], { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA,
      climbBudget({ skills: ['spring-paws'] }), { fenceRun: true },
    );
    expect(chosen).toBe(up);
  });

  it('tolerates a garbage opts argument', () => {
    for (const bad of [null, undefined, 0, 'yes', []]) {
      expect(bestPerch(perches, { x: fenceA.x, z: fenceA.z }, fenceA.y, fenceA, BASE_CLIMB_BUDGET, bad))
        .toBeNull();
    }
  });
});

describe('Fence Runner — the shipped-content pin', () => {


  it('leaves every golden mouse and rooftop collectible at EXACTLY its shipped hop count', () => {
    // The whole reachability BFS, re-run over the real perch arrays with the
    // wall-run edge switched on, in every traversal-skill state. Not one
    // number may move: the fence-run edge is level-only, and every chain step
    // in the game is a climb of 0.9 or more.
    for (const state of Object.values(STATES)) {
      expect(hopTable(state, true)).toEqual(hopTable(state, false));
    }
    expect(hopTable(STATES.none, true)).toEqual(SHIPPED_HOPS);
  });

  it('keeps the Docks crane chain (chain C) at four hops with the wall-run on', () => {
    // The chain built out of deliberate 1.3-1.4 rungs so no skill can skip a
    // step. Fence Runner must not be the exception.
    for (const state of Object.values(STATES)) {
      expect(hopTable(state, true)['gm-docks-2']).toBe(4);
    }
  });

  it('never makes anything a walk-up or unreachable', () => {
    for (const state of Object.values(STATES)) {
      const table = hopTable(state, true);
      const ground = Object.entries(table).filter(([, h]) => h === 0).map(([id]) => id);
      expect(ground.sort()).toEqual(['gm-docks-3', 'gm-neigh-3', 'gm-park-3', 'gm-sea-3']);
      for (const hops of Object.values(table)) expect(hops).toBeLessThan(Infinity);
    }
  });

  it('is NOT inert on shipped content — it joins the fence lines that exist', () => {
    // The counter-test to the pin above: proving nothing moved is only half
    // the job, since an ability that does nothing at all would also pass.
    // These are the pairs the ability was sized for.
    const pairs = [
      [{ x: 22, z: -28, y: 0.85 }, { x: 18, z: -24, y: 0.85 }],   // dog-yard fence tops
      [{ x: 28, z: 28, y: 0.58 }, { x: 32, z: 24, y: 0.58 }],     // garden fence tops
      [{ x: -4, z: 20, y: 1.35 }, { x: -9, z: 17.5, y: 1.3 }],    // wall top -> porch roof
    ];
    for (const [a, b] of pairs) {
      const perches = AREAS.neighborhood.perches;
      const pa = perches.find((p) => p.x === a.x && p.z === a.z && p.y === a.y);
      const pb = perches.find((p) => p.x === b.x && p.z === b.z && p.y === b.y);
      expect(pa && pb).toBeTruthy(); // the coordinates still ship
      expect(canReach(pb, { x: pa.x, z: pa.z }, pa.y)).toBe(false);
      expect(canFenceRun(pb, { x: pa.x, z: pa.z }, pa.y)).toBe(true);
    }
  });
});

// ===========================================================================
// v18 CF-9b — Sure Claws' "props that were scenery become climbable".
//
// Two halves, both proved against the perch arrays that actually ship:
//
//   1. TAGS. Every shipped perch names the prop it sits on, out of a closed
//      vocabulary, so the height lift can be per-prop instead of global.
//   2. GATED PERCHES. New records on props that carried none, visible only to
//      a save holding the ability.
//
// The safety argument is the same shape as Fence Runner's, and is checked the
// same way: with no skills the reachability graph must be byte-identical to
// the one that shipped, and WITH the ability no golden-mouse chain may get
// shorter. The tests above already re-run the whole BFS in all four traversal
// states with the gated records present in the arrays; what follows is the
// world-data side of it.
// ===========================================================================

const GATED = Object.fromEntries(
  Object.entries(AREAS).map(([id, a]) => [id, a.perches.filter((p) => p.requires)]),
);
const UNGATED = Object.fromEntries(
  Object.entries(AREAS).map(([id, a]) => [id, a.perches.filter((p) => !p.requires)]),
);

describe('CF-9b — perch kind tags on shipped world data', () => {
  it('tags EVERY perch in every area, out of the closed vocabulary', () => {
    for (const [id, a] of Object.entries(AREAS)) {
      for (const p of a.perches) {
        expect(PERCH_KINDS, `${id} perch ${p.x},${p.z},${p.y}`).toContain(p.kind);
        expect(perchKind(p)).toBe(p.kind); // i.e. no typo silently reading as 'prop'
      }
    }
  });

  it('keeps the vocabulary small and closed, and keeps the default out of world data', () => {
    // A vocabulary that grows per prop model would answer the only question
    // it exists to answer — "does the claw lift apply?" — differently for the
    // crate and the shipping container.
    expect(PERCH_KINDS).toHaveLength(8);
    const used = new Set(Object.values(AREAS).flatMap((a) => a.perches.map((p) => p.kind)));
    expect([...used].sort()).toEqual(['car', 'crate', 'fence', 'furniture', 'roof', 'stone', 'tree']);
    // 'prop' is the fallback for an UNTAGGED record, not a tag to write down.
    expect(used.has(PERCH_KIND_DEFAULT)).toBe(false);
  });

  it('tags the two perches the budget numbers are pinned against', () => {
    // The park oak branch is the perch that caps SURE_CLAWS_KIND_CLIMB, and
    // the seaside dune ledge is the one that used to cap the old global lift.
    // If either is ever re-tagged, the ceiling argument in climbing.js stops
    // holding, so the tags are pinned here rather than left to inspection.
    const oak = AREAS.park.perches.find((p) => p.label === 'oak branch lookout');
    expect(oak).toMatchObject({ y: 2.1, kind: 'tree' });
    expect(oak.y).toBeGreaterThan(SURE_CLAWS_KIND_CLIMB);
    const ledge = AREAS.seaside.perches.find((p) => p.label === 'dune ledge');
    expect(ledge).toMatchObject({ y: 1.9, kind: 'stone' });
    expect(SURE_CLAWS_CLIMB_KINDS[ledge.kind]).toBeUndefined();
  });
});

describe('CF-9b — the gated perches themselves', () => {
  it('opens real props in every walkable area', () => {
    // Counts, so that deleting a block of world data fails here rather than
    // quietly making the ability thinner. Neighborhood: 12 tree forks + 3
    // fence tops. Park: 16 tree forks + the meadow bench. Seaside: 5 boulders
    // (no tree or fence exists in the area). Docks: 8 market awnings + 2 quay
    // benches.
    expect(GATED.neighborhood).toHaveLength(15);
    expect(GATED.park).toHaveLength(17);
    expect(GATED.seaside).toHaveLength(5);
    expect(GATED.docks).toHaveLength(10);
  });

  it('gates every one of them on Sure Claws and nothing else', () => {
    for (const [id, list] of Object.entries(GATED)) {
      for (const p of list) expect(p.requires, `${id} ${p.x},${p.z}`).toBe(SURE_CLAWS_ID);
    }
  });

  it('leaves every SHIPPED perch ungated — the pre-CF-9b world is intact', () => {
    // The counts the four areas shipped with. A gate accidentally added to a
    // chain step would make that chain vanish for every player without the
    // ability, which is the worst thing this change could do.
    expect(UNGATED.neighborhood).toHaveLength(12);
    expect(UNGATED.park).toHaveLength(5);
    expect(UNGATED.seaside).toHaveLength(5);
    expect(UNGATED.docks).toHaveLength(16);
    for (const [area, mice] of Object.entries(GOLD_MICE)) {
      for (const m of mice.filter((x) => x.y > 0)) {
        const stand = UNGATED[area].find(
          (p) => Math.hypot(p.x - m.x, p.z - m.z) < 1.0 && Math.abs(p.y - m.y) < 0.9,
        );
        expect(stand, `${m.id} lost its ungated stand-on perch`).toBeTruthy();
      }
    }
  });

  it('gives no gated perch a label or a vantage flag', () => {
    // Three consequences at once, all of them wanted: no discovery-log line,
    // no feats.perch tally (so a Mischief ability cannot buy the two
    // Traversal ones), and no effect on the "the Docks has the most vantage
    // perches" invariant test/docks.test.js pins.
    for (const list of Object.values(GATED)) {
      for (const p of list) {
        expect(p.label).toBeUndefined();
        expect(p.vantage).toBeUndefined();
      }
    }
  });

  it('is invisible to a player without the skill, in every area', () => {
    for (const [id, a] of Object.entries(AREAS)) {
      expect(visiblePerches(a.perches, STATES.none)).toEqual(UNGATED[id]);
      expect(visiblePerches(a.perches, STATES.spring)).toEqual(UNGATED[id]);
      expect(visiblePerches(a.perches, STATES.claws)).toEqual(a.perches);
      expect(visiblePerches(a.perches, STATES.both)).toEqual(a.perches);
      // ...and bestPerch never picks one, standing right on top of it.
      for (const g of GATED[id]) {
        const chosen = bestPerch(a.perches, { x: g.x, z: g.z }, 0, null,
          climbBudget(STATES.spring), { state: STATES.spring, fenceRun: true });
        expect(chosen === g, `${id} gated perch at ${g.x},${g.z} was picked without the skill`).toBe(false);
      }
    }
  });

  it('is not dead content — Sure Claws can actually reach every perch it opens', () => {
    // The other half of "gated". A perch nobody can climb to is worse than no
    // perch at all: it is a promise in the ability's copy with nothing behind
    // it. Every gated record must be in the reachability graph of a cat that
    // holds the ability, off the ground and with no other skill.
    const budget = climbBudget(STATES.claws);
    for (const [id, a] of Object.entries(AREAS)) {
      const dist = hopsFromGround(visiblePerches(a.perches, STATES.claws), budget);
      for (const g of GATED[id]) {
        expect(dist.get(g), `${id} gated perch at ${g.x},${g.z},${g.y} is unreachable`).toBeLessThan(Infinity);
      }
    }
  });

  it('can be taken from a spot the cat can physically stand on', () => {
    // The BFS above measures a ground hop from directly UNDER the perch,
    // which is not where a cat can stand: player.update pushes a grounded cat
    // out to collider.r + 0.35, and a tree perch sits at the trunk centre
    // inside a 0.6-0.7 collider. So a fork could pass the reachability proof
    // and still be untakeable in the running game. Same check
    // test/docks.test.js applies to that area's chains, run here over every
    // gated perch in every area. (The tightest margin in the set is the
    // neighborhood's front-fence tops: the house collider holds the cat 0.75
    // away, against the 1.2 baseline reachLow.)
    const CAT_RADIUS = 0.35;
    for (const [id, a] of Object.entries(AREAS)) {
      const standable = (x, z) => x >= a.bounds.minX && x <= a.bounds.maxX
        && z >= a.bounds.minZ && z <= a.bounds.maxZ
        && a.colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + CAT_RADIUS);
      for (const g of GATED[id]) {
        const reach = (g.y > 1 ? SURE_CLAWS_REACH_HIGH : SURE_CLAWS_REACH_LOW) - 0.05;
        let found = false;
        for (let r = 0; r <= reach && !found; r += 0.05) {
          for (let t = 0; t < 64 && !found; t++) {
            const th = (t / 64) * Math.PI * 2;
            if (standable(g.x + Math.cos(th) * r, g.z + Math.sin(th) * r)) found = true;
          }
        }
        expect(found, `${id} gated perch at ${g.x},${g.z} has nowhere to jump from`).toBe(true);
      }
    }
  });

  it('opens the props the ability names — trees and fences — using the height lift', () => {
    // The lift is live, not declarative: these forks are above the 1.6
    // baseline and are reached off the ground only because their kind is
    // 'tree'. Checked on the shipped coordinates, not on a fixture.
    const forks = GATED.neighborhood.concat(GATED.park).filter((p) => p.kind === 'tree' && p.y > 1.6);
    expect(forks.length).toBeGreaterThan(20);
    for (const f of forks) {
      expect(canReach(f, { x: f.x, z: f.z }, 0, BASE_CLIMB_BUDGET)).toBe(false);
      expect(canReach(f, { x: f.x, z: f.z }, 0, climbBudget(STATES.claws))).toBe(true);
      expect(f.y).toBeLessThanOrEqual(TREE_FORK_MAX);
    }
    const fences = GATED.neighborhood.filter((p) => p.kind === 'fence');
    expect(fences).toHaveLength(3);
    for (const f of fences) expect(f.y).toBe(0.85); // the shipped fence-top height
  });

  it('completes the dog-yard fence line for a Sure Claws + Fence Runner cat', () => {
    // The single best sentence in this feature, pinned: the east run's new
    // top is 5.66 from the shipped south-east top — inside Fence Runner's 6.0
    // level dash and outside every climb reach — so the yard's whole fence
    // becomes one walkable line, over the dog's head.
    const shipped = AREAS.neighborhood.perches.find((p) => p.x === 22 && p.z === -28);
    const opened = GATED.neighborhood.find((p) => p.x === 26 && p.z === -24);
    expect(opened).toBeTruthy();
    expect(canReach(opened, { x: shipped.x, z: shipped.z }, shipped.y)).toBe(false);
    expect(canFenceRun(opened, { x: shipped.x, z: shipped.z }, shipped.y)).toBe(true);
  });

  it('keeps every gated Docks perch out of the canal', () => {
    // test/docks.test.js owns this invariant and checks the whole array; it
    // is restated here because THIS file is where new perches get authored,
    // and a water-collider wave is what depends on it.
    for (const p of GATED.docks) expect(Math.abs(p.z)).toBeGreaterThan(3.5);
  });
});

describe('CF-9b — the gated perches short-circuit nothing', () => {
  it('leaves every golden mouse and rooftop collectible at its shipped hop count, gated or not', () => {
    // THE proof. For every traversal state, and with the wall-run edge on and
    // off, the hop table computed over the FULL array (gated records included
    // when the state can see them) equals the one computed with every gated
    // record stripped out. A new perch that shortened any chain — by being a
    // step, or by being a fence-run launch point next to one — moves a number
    // here and fails.
    const stripped = (state, fenceRun) => {
      const budget = climbBudget(state);
      const out = {};
      for (const [area, mice] of Object.entries(GOLD_MICE)) {
        for (const m of mice) out[m.id] = minHops(m, UNGATED[area], budget, fenceRun);
      }
      for (const c of ELEVATED) {
        out[c.id] = minHops({ x: c.x, z: c.z, y: c.y }, UNGATED[c.area], budget, fenceRun);
      }
      return out;
    };
    for (const state of Object.values(STATES)) {
      for (const fenceRun of [false, true]) {
        expect(hopTable(state, fenceRun)).toEqual(stripped(state, fenceRun));
      }
    }
    // ...and the no-skills table is still the one that shipped.
    expect(hopTable(STATES.none)).toEqual(SHIPPED_HOPS);
    expect(hopTable(STATES.claws)).toEqual(SHIPPED_HOPS);
  });

  it('never puts a gated perch inside a golden mouse or collectible pickup window', () => {
    // Belt and braces on the hop table: a gated perch standing where a chain
    // top stands would not change the hop COUNT, but it would let the ability
    // hand the player a mouse that the chain is supposed to be the price of.
    const targets = Object.entries(GOLD_MICE).flatMap(([area, mice]) =>
      mice.filter((m) => m.y > 0).map((m) => ({ area, ...m })))
      .concat(ELEVATED.map((c) => ({ area: c.area, id: c.id, x: c.x, z: c.z, y: c.y })));
    for (const t of targets) {
      for (const g of GATED[t.area]) {
        const inWindow = Math.hypot(g.x - t.x, g.z - t.z) < 1.0 && Math.abs(g.y - t.y) < 0.9;
        expect(inWindow, `gated perch at ${g.x},${g.z},${g.y} sits on ${t.id}`).toBe(false);
      }
    }
  });

  it('never makes anything a walk-up, in any state', () => {
    for (const state of Object.values(STATES)) {
      for (const fenceRun of [false, true]) {
        const table = hopTable(state, fenceRun);
        const ground = Object.entries(table).filter(([, h]) => h === 0).map(([id]) => id);
        expect(ground.sort()).toEqual(['gm-docks-3', 'gm-neigh-3', 'gm-park-3', 'gm-sea-3']);
        for (const hops of Object.values(table)) expect(hops).toBeLessThan(Infinity);
      }
    }
  });
});
