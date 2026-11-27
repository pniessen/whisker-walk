import { describe, it, expect } from 'vitest';
import { CLAN_TOTAL, EVERYDAY_TOTAL } from './helpers/goldtotals.js';
import { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } from '../src/goldmice.js';
import { CATALOG } from '../src/progression.js';
import { goldenFound, renderGoldenTallyHtml } from '../src/ui/hometabs.js';

// Polish 2, item 8: Legacy hides the Clan Edition territories (the Woods, the
// River, the Moor, the Pines and the Gorge), but the golden-mouse counter counted their
// mice too, so a Legacy player could never reach the end. The count is now of
// the mice in the places the current edition shows. Display only: the save's
// `golden` list is untouched, and a mouse found in Clan Edition still counts
// when the player switches back.

// (an area not in the catalog yet, as the Market until its step 4, is counted: goldmice.js goldForEdition)
const legacyAreas = Object.keys(GOLD_MICE).filter((id) => !Object.hasOwn(CATALOG.areas, id) || CATALOG.areas[id].edition !== 'canon');
const idsIn = (areas) => areas.flatMap((a) => (GOLD_MICE[a] ?? []).map((m) => m.id));

describe('golden mice per edition', () => {
  it('Clan Edition counts every mouse', () => {
    const set = goldForEdition('canon', CATALOG);
    expect([...set].sort()).toEqual([...KNOWN_GOLD].sort());
    expect(set.size).toBe(GOLD_TOTAL);
    expect(set.size).toBe(CLAN_TOTAL); // 54 until the Reef added its three, 48 until the Moon added its three, 42 until the Old House added its three, 39 until the Market added its three, 36 until the Rooftops added its three
  });

  it("the house's mice count in Clan Edition only", () => {
    const houseIds = GOLD_MICE.house.map((m) => m.id);
    expect(houseIds).toEqual(['gm-house-1', 'gm-house-2', 'gm-house-3', 'gm-house-5']);
    const canon = goldForEdition('canon', CATALOG);
    for (const id of houseIds) expect(canon.has(id)).toBe(true);
    const legacy = goldForEdition('legacy', CATALOG);
    for (const id of houseIds) expect(legacy.has(id)).toBe(false);
    const { house, ...rest } = CATALOG.areas; // eslint-disable-line no-unused-vars
    expect(house).toBeDefined();
    expect(legacy.size).toBe(goldForEdition('legacy', { ...CATALOG, areas: rest }).size - 4); // without a house row its four (three, and the east wing's top bunk) are counted
  });

  it('a missing edition is Clan Edition', () => {
    expect(goldForEdition(undefined, CATALOG).size).toBe(GOLD_TOTAL);
  });

  it('Legacy counts only the mice in the places Legacy shows', () => {
    const set = goldForEdition('legacy', CATALOG);
    expect([...set].sort()).toEqual(idsIn(legacyAreas).sort());
    expect(set.size).toBe(EVERYDAY_TOTAL); // 30 until the Reef added its three, 24 until the Moon added its three (it has no catalog row yet, so both editions count it). 24 while the Market had no catalog row; its Clan-only row (Market step 4) keeps its three out: 21 again. 18 until the Rooftops added its three (the four street areas, the Farm, the Fairground and the Rooftops)
    expect(set.size).toBeLessThan(GOLD_TOTAL);
    for (const a of ['woods', 'river', 'moor', 'pines', 'gorge']) {
      for (const m of GOLD_MICE[a]) expect(set.has(m.id)).toBe(false);
    }
  });

  it('a Legacy player who has found every Legacy mouse reads "N of N"', () => {
    const set = goldForEdition('legacy', CATALOG);
    const golden = [...set, 'gm-woods-1']; // plus one found in Clan Edition
    const html = renderGoldenTallyHtml(goldenFound(golden, set), set.size);
    expect(html).toContain(`${set.size} of ${set.size}`);
    // switching back to Clan Edition counts the Woods mouse again
    const all = goldForEdition('canon', CATALOG);
    expect(goldenFound(golden, all)).toBe(set.size + 1);
  });
});
