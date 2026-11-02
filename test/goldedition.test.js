import { describe, it, expect } from 'vitest';
import { GOLD_MICE, KNOWN_GOLD, GOLD_TOTAL, goldForEdition } from '../src/goldmice.js';
import { CATALOG } from '../src/progression.js';
import { goldenFound, renderGoldenTallyHtml } from '../src/ui/hometabs.js';

// Polish 2, item 8: Legacy hides the Clan Edition territories (the Woods, the
// River, the Moor and the Pines), but the golden-mouse counter counted their
// mice too, so a Legacy player could never reach the end. The count is now of
// the mice in the places the current edition shows. Display only: the save's
// `golden` list is untouched, and a mouse found in Clan Edition still counts
// when the player switches back.

const legacyAreas = Object.keys(CATALOG.areas).filter((id) => CATALOG.areas[id].edition !== 'canon');
const idsIn = (areas) => areas.flatMap((a) => (GOLD_MICE[a] ?? []).map((m) => m.id));

describe('golden mice per edition', () => {
  it('Clan Edition counts every mouse', () => {
    const set = goldForEdition('canon', CATALOG);
    expect([...set].sort()).toEqual([...KNOWN_GOLD].sort());
    expect(set.size).toBe(GOLD_TOTAL);
    expect(set.size).toBe(30);
  });

  it('a missing edition is Clan Edition', () => {
    expect(goldForEdition(undefined, CATALOG).size).toBe(GOLD_TOTAL);
  });

  it('Legacy counts only the mice in the places Legacy shows', () => {
    const set = goldForEdition('legacy', CATALOG);
    // The Gorge isn't in the catalog yet, and an area missing from the
    // catalog is counted, so Legacy counts its three for now: 15. Task 11's
    // catalog record (edition 'canon') brings it back to 12.
    expect(CATALOG.areas.gorge).toBeUndefined();
    expect([...set].sort()).toEqual(idsIn([...legacyAreas, 'gorge']).sort());
    expect(set.size).toBe(15);
    expect(set.size).toBeLessThan(GOLD_TOTAL);
    for (const a of ['woods', 'river', 'moor', 'pines']) {
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
