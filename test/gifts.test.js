import { describe, it, expect } from 'vitest';
import {
  resolveGifts,
  openScenics,
  createGifts,
  pickFoundGift,
  NO_GIFTS,
  GIFT_LEAVE_RANGE,
} from '../src/gifts.js';

// The real scenic array of src/world/park.js, verbatim — the join these
// functions do is between the save's spot ids and coordinates that ship in
// the world builders, so the test uses the shipped ids rather than invented
// ones.
const PARK_SCENICS = [
  { id: 'fountain', x: 3, z: 23, label: 'the old fountain' },
  { id: 'pond-shore', x: -14, z: 10, label: 'the duck pond' },
  { id: 'meadow', x: 12, z: -30, label: 'the quiet meadow' },
];

// createGifts only ever calls scene.add / scene.remove.
function fakeScene() {
  const added = [];
  return {
    added,
    add: (g) => added.push(g),
    remove: (g) => {
      const i = added.indexOf(g);
      if (i >= 0) added.splice(i, 1);
    },
  };
}

describe('resolveGifts', () => {
  it('joins saved gifts onto the coordinates the area actually ships', () => {
    const out = resolveGifts([{ area: 'park', spot: 'meadow' }], PARK_SCENICS);
    expect(out).toEqual([
      { area: 'park', spot: 'meadow', label: 'the quiet meadow', x: 12, z: -30 },
    ]);
  });

  it('SKIPS a spot id the area no longer has, rather than defaulting to the origin', () => {
    // The failure this prevents is a wrapped present sitting in the middle
    // of a road because a scenic was renamed between releases.
    expect(resolveGifts([{ area: 'park', spot: 'bandstand' }], PARK_SCENICS)).toEqual([]);
  });

  it('is inert for hostile shapes on either side of the join', () => {
    for (const saved of [null, undefined, 'fountain', 7, {}, [null], [{ spot: 5 }], [{ spot: '__proto__' }]]) {
      expect(resolveGifts(saved, PARK_SCENICS)).toEqual([]);
    }
    for (const scenics of [null, undefined, 'nope', 3, [null], [{ x: 1, z: 1 }]]) {
      expect(resolveGifts([{ area: 'park', spot: 'fountain' }], scenics)).toEqual([]);
    }
  });

  it('collapses a duplicated spot to one present', () => {
    const out = resolveGifts(
      [{ area: 'park', spot: 'fountain' }, { area: 'park', spot: 'fountain' }],
      PARK_SCENICS,
    );
    expect(out).toHaveLength(1);
  });

  it('falls back to the id when a scenic carries no label', () => {
    const out = resolveGifts([{ area: 'x', spot: 'a' }], [{ id: 'a', x: 0, z: 0 }]);
    expect(out[0].label).toBe('a');
  });
});

describe('openScenics', () => {
  it('offers every spot when nothing is stashed yet', () => {
    expect(openScenics(PARK_SCENICS, []).map((s) => s.id))
      .toEqual(['fountain', 'pond-shore', 'meadow']);
  });

  it('drops a spot that already holds a gift — one per spot', () => {
    expect(openScenics(PARK_SCENICS, [{ area: 'park', spot: 'fountain' }]).map((s) => s.id))
      .toEqual(['pond-shore', 'meadow']);
  });

  it('tolerates hostile inputs on both sides', () => {
    expect(openScenics(null, null)).toEqual([]);
    expect(openScenics(PARK_SCENICS, 'nope')).toHaveLength(3);
    expect(openScenics(PARK_SCENICS, [null, 5, { spot: 7 }])).toHaveLength(3);
  });
});

describe('createGifts', () => {
  it('renders one present per resolved gift, at the scenic spot', () => {
    const scene = fakeScene();
    const gifts = createGifts(scene, PARK_SCENICS, [
      { area: 'park', spot: 'fountain' },
      { area: 'park', spot: 'meadow' },
    ]);
    expect(gifts.list).toHaveLength(2);
    expect(scene.added).toHaveLength(2);
    const fountain = gifts.list.find((g) => g.spot === 'fountain');
    expect(fountain.group.position.x).toBe(3);
    expect(fountain.group.position.z).toBe(23);
  });

  it('renders nothing for an empty or unresolvable save', () => {
    const scene = fakeScene();
    expect(createGifts(scene, PARK_SCENICS, []).list).toHaveLength(0);
    expect(createGifts(scene, PARK_SCENICS, [{ area: 'park', spot: 'nowhere' }]).list).toHaveLength(0);
    expect(scene.added).toHaveLength(0);
  });

  it('add() shows a gift left mid-walk immediately, and never twice at one spot', () => {
    const scene = fakeScene();
    const gifts = createGifts(scene, PARK_SCENICS, []);
    expect(gifts.add('park', PARK_SCENICS[0])).toBeTruthy();
    expect(gifts.list).toHaveLength(1);
    expect(gifts.add('park', PARK_SCENICS[0])).toBeNull();
    expect(gifts.list).toHaveLength(1);
    expect(gifts.add('park', null)).toBeNull();
    expect(gifts.add('park', { x: 1, z: 1 })).toBeNull(); // no id
  });

  it('remove() takes the present out of the scene, and is a no-op for a stranger', () => {
    const scene = fakeScene();
    const gifts = createGifts(scene, PARK_SCENICS, [{ area: 'park', spot: 'fountain' }]);
    const entry = gifts.list[0];
    expect(gifts.remove(entry)).toBe(true);
    expect(gifts.list).toHaveLength(0);
    expect(scene.added).toHaveLength(0);
    expect(gifts.remove(entry)).toBe(false);
    expect(gifts.remove(null)).toBe(false);
  });

  it('dispose() clears every present out of the scene', () => {
    const scene = fakeScene();
    const gifts = createGifts(scene, PARK_SCENICS, [
      { area: 'park', spot: 'fountain' }, { area: 'park', spot: 'meadow' },
    ]);
    gifts.dispose();
    expect(gifts.list).toHaveLength(0);
    expect(scene.added).toHaveLength(0);
  });
});

describe('NO_GIFTS', () => {
  it('answers every call the walk makes, inertly (the den has no scenics)', () => {
    expect(NO_GIFTS.list).toEqual([]);
    expect(NO_GIFTS.add('den', { id: 'x' })).toBeNull();
    expect(NO_GIFTS.remove({})).toBe(false);
    expect(() => NO_GIFTS.dispose()).not.toThrow();
  });
});

describe('pickFoundGift', () => {
  const gifts = [{ spot: 'a' }, { spot: 'b' }, { spot: 'c' }];

  it('picks at most one gift per walk, from the injected rng', () => {
    expect(pickFoundGift(() => 0, gifts).spot).toBe('a');
    expect(pickFoundGift(() => 0.5, gifts).spot).toBe('b');
    expect(pickFoundGift(() => 0.99, gifts).spot).toBe('c');
  });

  it('returns null when nothing is stashed', () => {
    expect(pickFoundGift(() => 0.5, [])).toBeNull();
    expect(pickFoundGift(() => 0.5, null)).toBeNull();
    expect(pickFoundGift(() => 0.5, 'nope')).toBeNull();
  });

  it('never indexes past the end for a broken rng', () => {
    for (const rng of [() => 1, () => 1.5, () => NaN, () => -1, () => 'x', null, 5]) {
      const picked = pickFoundGift(rng, gifts);
      expect(gifts).toContain(picked);
    }
  });
});

describe('GIFT_LEAVE_RANGE', () => {
  it('sits inside the 4m radius that already awards the scenic visit', () => {
    // So the "you found the overlook" award has always fired by the time the
    // prompt offers to leave something there — the two never race.
    expect(GIFT_LEAVE_RANGE).toBeLessThan(4);
  });
});
