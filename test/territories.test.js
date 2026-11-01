// The territory map (Clan Edition's "Where to?"): her drawing as data, the
// model that says what each place shows, and the SVG that renders it.
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import {
  BOARD, TERRITORIES, LAKE, ISLAND, STAR, POND, RIVER, PATHS, BRIDGE, territoryMapModel,
} from '../src/territories.js';
import { renderTerritoryMapHtml } from '../src/ui/territorymap.js';

function clanState() {
  return {
    edition: 'canon',
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby' },
    area: 'neighborhood',
  };
}
const region = (m, id) => m.regions.find((r) => r.id === id);
// The markup of one region: from its <g ... data-region="id"> to the next region.
function regionHtml(html, id) {
  const start = html.indexOf(`data-region="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-region="', start + 1);
  return html.slice(html.lastIndexOf('<g', start), next === -1 ? undefined : html.lastIndexOf('<g', next));
}

// Ray-casting point-in-polygon.
function inside([px, py], poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('territories', () => {
  it('the layout is her drawing', () => {
    expect(BOARD).toEqual({ w: 1000, h: 700 });
    expect(Object.isFrozen(TERRITORIES)).toBe(true);
    expect(TERRITORIES.map(({ id, areaId, x, y, r, status }) => ({ id, areaId, x, y, r, status }))).toEqual([
      { id: 'town', areaId: 'neighborhood', x: 843, y: 566, r: 110, status: 'built' },
      { id: 'woods', areaId: 'woods', x: 565, y: 500, r: 170, status: 'built' },
      { id: 'moor', areaId: 'moor', x: 620, y: 161, r: 165, status: 'built' },
      { id: 'river', areaId: 'river', x: 232, y: 488, r: 160, status: 'built' },
      { id: 'pines', areaId: 'pines', x: 308, y: 199, r: 150, status: 'built' },
      { id: 'gorge', areaId: null, x: 815, y: 353, r: 80, status: 'later' },
    ]);
    expect(TERRITORIES.map((t) => t.name)).toEqual([
      PLACE_WORDS.town, 'The Woods', 'The Moor', 'The River and Marshes', 'The Pines and Swamp', 'The Gorge',
    ]);
    expect(inside([STAR.x, STAR.y], ISLAND.outline)).toBe(true);
    expect(inside([STAR.x, STAR.y], LAKE)).toBe(true);
  });

  it('Twolegplace is the Neighborhood and is always open', () => {
    const s = clanState();
    const town = region(territoryMapModel(s, CATALOG), 'town');
    expect(town).toMatchObject({ name: PLACE_WORDS.town, areaId: 'neighborhood', owned: true, locked: false, selected: true });
    // Even a save that somehow lost the Neighborhood can open it: it's free and ungated.
    s.unlocked.areas = []; s.area = 'park';
    const lost = region(territoryMapModel(s, CATALOG), 'town');
    expect(lost).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
    expect(renderTerritoryMapHtml(territoryMapModel(s, CATALOG))).toContain('data-dr-place="neighborhood"');
  });

  it('the Woods is locked until 2 Twolegplace walks, then "Tap to explore", then "tap to walk here" once opened', () => {
    const s = clanState();
    s.walks.neighborhood = 1;
    let woods = region(territoryMapModel(s, CATALOG), 'woods');
    expect(woods).toMatchObject({ name: 'The Woods', locked: true, canOpen: false, owned: false });
    expect(woods.line).toBe('opens after 2 walks in Twolegplace · 1/2 so far');
    let html = regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'woods');
    expect(html).toContain('data-dr-place="woods"');
    expect(html).toMatch(/class="tm-region[^"]*\blocked\b/);

    s.walks.neighborhood = 2;
    woods = region(territoryMapModel(s, CATALOG), 'woods');
    expect(woods).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });

    s.unlocked.areas.push('woods');
    woods = region(territoryMapModel(s, CATALOG), 'woods');
    expect(woods).toMatchObject({ owned: true, canOpen: false, line: 'tap to walk here' });
    html = regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'woods');
    expect(html).toContain('tap to walk here');
    expect(html).not.toMatch(/\blocked\b/);
  });

  it('the River is locked until 2 Woods walks, then "Tap to explore", then "tap to walk here" once opened', () => {
    const s = clanState();
    s.walks.woods = 1; s.unlocked.areas.push('woods');
    let river = region(territoryMapModel(s, CATALOG), 'river');
    expect(river).toMatchObject({ name: 'The River and Marshes', areaId: 'river', locked: true, canOpen: false, owned: false });
    expect(river.line).toBe('opens after 2 walks in The Woods · 1/2 so far');
    expect(regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'river')).toContain('data-dr-place="river"');
    s.walks.woods = 2;
    river = region(territoryMapModel(s, CATALOG), 'river');
    expect(river).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
    s.unlocked.areas.push('river');
    expect(region(territoryMapModel(s, CATALOG), 'river')).toMatchObject({ owned: true, line: 'tap to walk here' });
  });

  it("the selected place says today's walk", () => {
    const s = clanState();
    expect(region(territoryMapModel(s, CATALOG), 'town').line).toBe('today’s walk');
    s.unlocked.areas.push('woods'); s.area = 'woods';
    const m = territoryMapModel(s, CATALOG);
    expect(region(m, 'woods')).toMatchObject({ selected: true, line: 'today’s walk' });
    expect(region(m, 'town')).toMatchObject({ selected: false, line: 'tap to walk here' });
    expect(regionHtml(renderTerritoryMapHtml(m), 'woods')).toMatch(/class="tm-region[^"]*\bsel\b/);
  });

  it('the Moor is locked until 2 Woods walks, then "Tap to explore", then "tap to walk here" once opened', () => {
    const s = clanState();
    s.walks.woods = 1; s.unlocked.areas.push('woods');
    let moor = region(territoryMapModel(s, CATALOG), 'moor');
    expect(moor).toMatchObject({ name: 'The Moor', areaId: 'moor', locked: true, canOpen: false, owned: false });
    expect(moor.line).toBe('opens after 2 walks in The Woods · 1/2 so far');
    expect(regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'moor')).toContain('data-dr-place="moor"');
    s.walks.woods = 2;
    moor = region(territoryMapModel(s, CATALOG), 'moor');
    expect(moor).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
    s.unlocked.areas.push('moor');
    expect(region(territoryMapModel(s, CATALOG), 'moor')).toMatchObject({ owned: true, line: 'tap to walk here' });
  });

  it('the Pines is locked until 2 River walks, then "Tap to explore", then "tap to walk here" once opened', () => {
    const s = clanState();
    s.unlocked.areas.push('woods', 'river'); s.walks.river = 1;
    let pines = region(territoryMapModel(s, CATALOG), 'pines');
    expect(pines).toMatchObject({ name: 'The Pines and Swamp', areaId: 'pines', locked: true, canOpen: false, owned: false });
    expect(pines.line).toBe('opens after 2 walks in The River and Marshes · 1/2 so far');
    s.walks.river = 2;
    pines = region(territoryMapModel(s, CATALOG), 'pines');
    expect(pines).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
    s.unlocked.areas.push('pines');
    expect(region(territoryMapModel(s, CATALOG), 'pines')).toMatchObject({ owned: true, line: 'tap to walk here' });
  });

  it("every clan territory of the first release is built; the Gorge and the island can't be tapped", () => {
    const m = territoryMapModel(clanState(), CATALOG);
    expect(m.regions.filter((r) => r.status === 'soon')).toEqual([]);
    expect(region(m, 'gorge')).toMatchObject({ status: 'later', line: 'unexplored', canOpen: false });
    expect(m.island).toMatchObject({ status: 'soon' });
    const html = renderTerritoryMapHtml(m);
    for (const id of ['gorge', 'island']) expect(regionHtml(html, id)).not.toContain('data-dr-place');
    // Twolegplace, the Woods, the River, the Moor and the Pines
    expect((html.match(/data-dr-place=/g) || []).length).toBe(5);
  });

  it('the map has the lake, the island, the pond, the river, three paths and the bridge', () => {
    const m = territoryMapModel(clanState(), CATALOG);
    expect(m.lake).toEqual(LAKE);
    expect(m.island).toMatchObject({ name: 'The island', status: 'soon', outline: ISLAND.outline });
    expect(m.star).toEqual(STAR);
    expect(m.pond).toEqual(POND);
    expect(m.river).toEqual(RIVER);
    expect(Object.keys(m.paths)).toEqual(['short', 'north', 'long']);
    expect(m.paths).toEqual(PATHS);
    expect(m.bridge).toEqual(BRIDGE);
    const html = renderTerritoryMapHtml(m);
    expect(html.startsWith('<svg viewBox="0 0 1000 700" class="territory-map" role="img" aria-label="Territory map"')).toBe(true);
    for (const cls of ['tm-lake', 'tm-island', 'tm-star', 'tm-pond', 'tm-river', 'tm-bridge']) expect(html).toContain(`class="${cls}`);
    expect((html.match(/class="tm-path"/g) || []).length).toBe(3);
  });

  it('names are escaped', () => {
    const catalog = { ...CATALOG, areas: { ...CATALOG.areas, woods: { ...CATALOG.areas.woods, name: '<b>' } } };
    const html = renderTerritoryMapHtml(territoryMapModel(clanState(), catalog));
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toContain('<b>');
  });
});
