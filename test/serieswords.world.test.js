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
});
