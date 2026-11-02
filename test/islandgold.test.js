import { describe, it, expect } from 'vitest';
import { GOLD_MICE } from '../src/goldmice.js';
import { ISLAND_GOLD, ISLAND_LAND } from '../src/world/island.js';

// Polish 3: the island's golden mice are the Pines' mice that stand on the
// island's ground, worked out from the list rather than typed in by id, so a
// mouse moved on or off the island cannot leave the reeds' keep-clear behind.
describe("the island's golden mice", () => {
  it('are the same three as before: gm-pines-4, 5 and 6', () => {
    expect(ISLAND_GOLD.map((m) => m.id)).toEqual(['gm-pines-4', 'gm-pines-5', 'gm-pines-6']);
    for (const m of ISLAND_GOLD) expect(GOLD_MICE.pines).toContain(m);
  });

  it('are exactly the Pines mice on the island ground', () => {
    const on = (m) => Math.hypot(m.x - ISLAND_LAND.x, m.z - ISLAND_LAND.z) <= ISLAND_LAND.r;
    expect(ISLAND_GOLD).toEqual(GOLD_MICE.pines.filter(on));
    expect(GOLD_MICE.pines.filter((m) => !on(m)).map((m) => m.id)).toEqual(['gm-pines-1', 'gm-pines-2', 'gm-pines-3']);
  });
});
