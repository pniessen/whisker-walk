// The series-words snapshot, part 4: LANDMARKS. Every label a player can read
// on the five territories' maps (special places, finds, lookouts, little
// moments, the Gorge's caves), taken from the areas as the game builds them.
// The comparison with the book series flagged several of these (the great
// oak, the sun-warmed rocks, the island's meeting ring and meeting stone), so
// the switch will reword some of them; "on" must keep every one.
//
// See test/serieswords.test.js for what the snapshot is for. Re-record ONLY
// when the owner or the older playtester has asked for a wording change in
// the "on" game:  UPDATE_SERIES_SNAPSHOT=1 npx vitest run test/serieswords
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The headless canvas every world test uses (see test/park.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const builders = {
  woods: await import('../src/world/woods.js'),
  moor: await import('../src/world/moor.js'),
  river: await import('../src/world/river.js'),
  pines: await import('../src/world/pines.js'),
  gorge: await import('../src/world/gorge.js'),
};
const { GORGE_CAVES } = await import('../src/world/gorgeshape.js');
const { ISLAND_SCENICS, ISLAND_COLLECTIBLES, ISLAND_PERCHES, ISLAND_MOMENTS } = await import('../src/world/island.js');
const { HOMES } = await import('../src/clanhomes.js');
const { checkAgainstFixture, sorted } = await import('./helpers/serieswords.js');
const { withStandInWords, leaksIn, standInCount } = await import('./helpers/standinwords.js');

const FIXTURE = 'series-words-on-world.json';

const labelled = (list) => (Array.isArray(list) ? list : []).filter((x) => x && typeof x.label === 'string' && x.label)
  .map((x) => `${x.id ?? x.kind ?? 'label'}: ${x.label}`);

// Every array of an area record that holds labelled things, by its field name.
function labelsOf(area) {
  const out = {};
  for (const key of sorted(Object.keys(area))) {
    const found = labelled(area[key]);
    if (found.length) out[key] = sorted(found);
  }
  return out;
}

function snapshot() {
  const areas = {};
  for (const id of Object.keys(HOMES)) areas[id] = labelsOf(builders[id].build(new THREE.Scene()));
  return {
    about: 'Every label on the five territories\' maps. Recorded by test/serieswords.world.test.js; see test/serieswords.test.js before re-recording.',
    areas,
    island: {
      scenics: sorted(labelled(ISLAND_SCENICS)), collectibles: sorted(labelled(ISLAND_COLLECTIBLES)),
      perches: sorted(labelled(ISLAND_PERCHES)), moments: sorted(labelled(ISLAND_MOMENTS)),
    },
    gorgeCaves: GORGE_CAVES.map((c) => `${c.id}: ${c.name ?? c.label ?? ''}`),
  };
}

describe('series words on the maps, pinned', () => {
  it('every landmark label of the five territories is exactly the recorded one', () => {
    const snap = snapshot();
    checkAgainstFixture(FIXTURE, snap);
    // the labels the comparison flagged are really in it
    const all = JSON.stringify(snap);
    for (const flagged of ['the great oak', 'sun-warmed rocks', 'the meeting ring under the old ash', 'a meeting stone']) {
      expect(all).toContain(flagged);
    }
  });

  // 2026-11-17. The same maps, built with a stand-in word set in use
  // (test/helpers/standinwords.js: nonsense words, NOT the plain game's): the
  // seven labels that are in the phrase table follow it.
  it('with a stand-in word set in use, the labels from the phrase table follow it', () => {
    const snap = withStandInWords(() => snapshot());
    expect(leaksIn(snap)).toEqual([]);
    expect(standInCount(snap)).toBeGreaterThanOrEqual(7); // seven labels; two of them are on a map twice
    checkAgainstFixture(FIXTURE, snapshot());
  });
});

// ---- the everyday words ('off'), added 2026-11-18 ------------------------------
// The same snapshot, built by the same code, with the everyday word set in
// use (src/offclanwords.js), recorded in its own fixture. Those words are the
// older playtester's picks; re-record with
//   UPDATE_OFF_SNAPSHOT=1 npx vitest run test/serieswords
// when she or the owner changes one, and read the diff line by line.
const { withOffWords, bannedLeaks, offWordCount } = await import('./helpers/offwords.js');
const { UPDATING_OFF } = await import('./helpers/serieswords.js');

const OFF_FIXTURE = 'series-words-off-world.json';
const OFF_IGNORE = [];
describe('everyday words: the maps', () => {
  it('shows exactly the recorded everyday words', () => {
    checkAgainstFixture(OFF_FIXTURE, withOffWords(() => snapshot()), UPDATING_OFF);
  });

  it('shows no word of the family\'s set, and plenty of the everyday ones', () => {
    const snap = withOffWords(() => snapshot());
    // each entry is "id: label"; the id is the code's own and is never drawn
    const labels = JSON.parse(JSON.stringify(snap), (_k, v) => (typeof v === 'string' ? v.replace(/^[a-z0-9-]+: /, '') : v));
    expect(bannedLeaks(labels, OFF_IGNORE)).toEqual([]);
    expect(offWordCount(snap)).toBe(0); // no label on a map names a group or a rank
    const all = JSON.stringify(snap);
    for (const hers of ['the grandfather oak', 'heron rocks', 'the stone ring under the old ash']) expect(all).toContain(hers);
  });

  it('and the family\'s words are back afterwards', () => {
    withOffWords(() => snapshot());
    checkAgainstFixture(FIXTURE, snapshot());
  });
});
