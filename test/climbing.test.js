import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  canReach,
  bestPerch,
  climbBudget,
  BASE_CLIMB_BUDGET,
  SPRING_PAWS_CLIMB,
  SURE_CLAWS_CLIMB,
  SURE_CLAWS_REACH_HIGH,
  SURE_CLAWS_REACH_LOW,
} from '../src/climbing.js';

// The area builders run headless here (no jsdom dep): the only DOM they
// touch is document.createElement('canvas') for the billboard texture, so a
// Proxy that swallows arbitrary 2D-context calls is enough. Same stub
// spots.test.js uses. Must be installed before the world modules import.
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }),
  }),
});

const { build: buildNeighborhood } = await import('../src/world/neighborhood.js');
const { build: buildPark } = await import('../src/world/park.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');
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
    expect(climbBudget({})).toEqual({ climb: 1.6, reachHigh: 2.6, reachLow: 1.2 });
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

  it('lifts both reaches and the climb height for Sure Claws', () => {
    const b = climbBudget({ skills: ['sure-claws'] });
    expect(b.climb).toBe(SURE_CLAWS_CLIMB);
    expect(b.reachHigh).toBe(SURE_CLAWS_REACH_HIGH);
    expect(b.reachLow).toBe(SURE_CLAWS_REACH_LOW);
  });

  it('keeps the Sure Claws climb lift under the y 1.9 seaside dune ledge', () => {
    // Load-bearing: gm-sea-2 sits on the dune ledge at y 1.9, the second step
    // of the overlook-boulder chain. A Sure Claws climb budget of 1.9+ would
    // let a player take it straight off the ground, deleting the chain.
    expect(SURE_CLAWS_CLIMB).toBeLessThan(1.9);
  });

  it('composes the two abilities by MAX, never by sum', () => {
    // 1.6 + 0.6 + 0.25 = 2.45 would clear the y 2.0 crate top and leave only
    // 0.85 to the y 3.3 billboard lookout — the one-hop-skips-the-chain
    // failure the spec's Risks section calls out.
    const b = climbBudget({ skills: ['spring-paws', 'sure-claws'] });
    expect(b.climb).toBe(SPRING_PAWS_CLIMB);
    expect(b.reachHigh).toBe(SURE_CLAWS_REACH_HIGH);
    expect(b.reachLow).toBe(SURE_CLAWS_REACH_LOW);
  });

  it('honours a persisted skill id and a satisfied feat predicate alike', () => {
    // hasSkill is (persisted OR predicate) — Sure Claws' feat is 25 tip-overs.
    expect(climbBudget({ feats: { mischief: 24 } })).toBe(BASE_CLIMB_BUDGET);
    expect(climbBudget({ feats: { mischief: 25 } }).climb).toBe(SURE_CLAWS_CLIMB);
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

// minHops(target, perches, budget) -> hops needed to stand within the golden
// mouse pickup window (checkFind's 1.0 horizontal / 0.9 vertical, goldmice.js)
// of `target`. 0 for a ground-level target, Infinity if no chain gets there.
function minHops(target, perches, budget) {
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
      if (canReach(p, { x: cur.x, z: cur.z }, cur.y, budget)) {
        dist.set(p, dist.get(cur) + 1);
        queue.push(p);
      }
    }
  }
  if (target.y === 0) return 0; // ground mice need no perch at all
  const stand = perches.find(
    (p) => Math.hypot(p.x - target.x, p.z - target.z) < 1.0 && Math.abs(p.y - target.y) < 0.9,
  );
  return stand ? dist.get(stand) ?? Infinity : Infinity;
}

const AREAS = {
  neighborhood: buildNeighborhood(new THREE.Scene()),
  park: buildPark(new THREE.Scene()),
  seaside: buildSeaside(new THREE.Scene()),
};
const YARN_ROOF = AREAS.neighborhood.collectibles.find((c) => c.id === 'yarn-roof');

function hopTable(budget) {
  const out = {};
  for (const [area, mice] of Object.entries(GOLD_MICE)) {
    for (const m of mice) out[m.id] = minHops(m, AREAS[area].perches, budget);
  }
  out['yarn-roof'] = minHops(
    { x: YARN_ROOF.x, z: YARN_ROOF.z, y: YARN_ROOF.y },
    AREAS.neighborhood.perches,
    budget,
  );
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
  'yarn-roof': 3,  // the legendary silver yarn ball, on the ridge with gm-neigh-1
};

describe('shipped golden mice and rooftop collectible — no skills', () => {
  it('every one is still reachable, at exactly the hop count it takes today', () => {
    expect(hopTable(climbBudget({}))).toEqual(SHIPPED_HOPS);
  });

  it('no mouse is reachable without a perch except the three deliberately-hidden ground ones', () => {
    const table = hopTable(climbBudget({}));
    const ground = Object.entries(table).filter(([, hops]) => hops === 0).map(([id]) => id);
    expect(ground.sort()).toEqual(['gm-neigh-3', 'gm-park-3', 'gm-sea-3']);
    for (const hops of Object.values(table)) expect(hops).toBeLessThan(Infinity);
  });
});

describe('shipped golden mice and rooftop collectible — with the v18 traversal skills', () => {
  const SPRING = climbBudget({ skills: ['spring-paws'] });
  const CLAWS = climbBudget({ skills: ['sure-claws'] });
  const BOTH = climbBudget({ skills: ['spring-paws', 'sure-claws'] });

  it('Sure Claws changes NOTHING about the shipped placements', () => {
    // The 1.85 climb ceiling sits under every shipped chain's next step, and
    // the wider reaches only let the cat grab a perch from further away —
    // they can never make a hop the height gate already refused.
    expect(hopTable(CLAWS)).toEqual(SHIPPED_HOPS);
  });

  it('nothing becomes UNREACHABLE under any skill combination', () => {
    for (const budget of [SPRING, CLAWS, BOTH]) {
      for (const hops of Object.values(hopTable(budget))) expect(hops).toBeLessThan(Infinity);
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
    expect(hopTable(SPRING)).toEqual({
      ...SHIPPED_HOPS,
      'gm-neigh-2': 2,
      'gm-park-2': 1,
      'gm-sea-2': 1,
    });
    expect(hopTable(BOTH)).toEqual(hopTable(SPRING));
  });

  it('never collapses the two TALL chains — the ridge and the billboard stay multi-hop', () => {
    for (const budget of [SPRING, CLAWS, BOTH]) {
      const table = hopTable(budget);
      expect(table['gm-neigh-1']).toBe(3); // y 4.1 ridge — unchanged, 3 hops
      expect(table['yarn-roof']).toBe(3);  // same ridge, the rooftop collectible
      expect(table['gm-neigh-2']).toBeGreaterThan(1); // y 3.3 lookout — never one hop
    }
  });

  it('leaves the y 2.9 rooftop and the y 4.1 ridge out of one-hop ground range', () => {
    const roof = { x: -9.5, z: 15.5, y: 2.9 };
    const ridge = { x: -11.5, z: 15.5, y: 4.1 };
    for (const budget of [SPRING, CLAWS, BOTH]) {
      expect(canReach(roof, { x: roof.x, z: roof.z }, 0, budget)).toBe(false);
      expect(canReach(ridge, { x: ridge.x, z: ridge.z }, 0, budget)).toBe(false);
    }
  });
});
