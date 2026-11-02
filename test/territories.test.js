// The territory map (Clan Edition's "Where to?"): her drawing as data, the
// model that says what each place shows, and the SVG that renders it.
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import {
  BOARD, TERRITORIES, LAKE, ISLAND, STAR, POND, RIVER, PATHS, BRIDGE, CAMP_AT, territoryMapModel,
} from '../src/territories.js';
import { renderTerritoryMapHtml, ISLAND_WHERE } from '../src/ui/territorymap.js';

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
const clanOf = (s, id) => region(territoryMapModel(s, CATALOG), id).camp;
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
      { id: 'gorge', areaId: 'gorge', x: 815, y: 353, r: 80, status: 'built' },
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

  it('the Gorge is locked until 2 Moor walks, then "Tap to explore", then "tap to walk here"', () => {
    const s = clanState();
    s.unlocked.areas.push('woods', 'moor'); s.walks.moor = 1;
    let gorge = region(territoryMapModel(s, CATALOG), 'gorge');
    expect(gorge).toMatchObject({ name: 'The Gorge', areaId: 'gorge', locked: true, canOpen: false, owned: false });
    expect(gorge.line).toBe('opens after 2 walks in The Moor · 1/2 so far');
    expect(regionHtml(renderTerritoryMapHtml(territoryMapModel(s, CATALOG)), 'gorge')).toContain('data-dr-place="gorge"');
    s.walks.moor = 2;
    gorge = region(territoryMapModel(s, CATALOG), 'gorge');
    expect(gorge).toMatchObject({ locked: false, canOpen: true, line: 'Tap to explore' });
    s.unlocked.areas.push('gorge');
    expect(region(territoryMapModel(s, CATALOG), 'gorge')).toMatchObject({ owned: true, line: 'tap to walk here' });
    // No camp is drawn there yet: CliffClan's camp is part 4.
    expect(CAMP_AT).not.toHaveProperty('gorge');
    expect(region(territoryMapModel(s, CATALOG), 'gorge').camp).toBeNull();
  });

  it('every clan territory is built, and every place on the map can be tapped', () => {
    const m = territoryMapModel(clanState(), CATALOG);
    expect(m.regions.filter((r) => r.status !== 'built')).toEqual([]);
    expect(m.regions.some((r) => r.status === 'later' || r.line === 'unexplored')).toBe(false);
    expect(m.island).toMatchObject({ status: 'built', areaId: 'pines' });
    const html = renderTerritoryMapHtml(m);
    for (const r of m.regions) expect(regionHtml(html, r.id), r.id).toContain(`data-dr-place="${r.areaId}"`);
    // Six places: Twolegplace, the Woods, the River, the Moor, the Pines and
    // the Gorge; the island is a seventh way into the Pines.
    const places = [...html.matchAll(/data-dr-place="([a-z]+)"/g)].map(([, id]) => id);
    expect(new Set(places).size).toBe(6);
    expect(places).toHaveLength(7);
  });

  it("the island's star is the Pines' way in, locked and opened with it", () => {
    const s = clanState();
    s.unlocked.areas.push('woods', 'river'); s.walks.river = 1;
    let m = territoryMapModel(s, CATALOG);
    expect(m.island).toMatchObject({ name: 'The island', areaId: 'pines', locked: true, canOpen: false });
    expect(m.island.line).toBe(region(m, 'pines').line);
    s.walks.river = 2; s.unlocked.areas.push('pines'); s.area = 'pines';
    m = territoryMapModel(s, CATALOG);
    expect(m.island).toMatchObject({ owned: true, selected: true, line: 'today’s walk' });
    const html = renderTerritoryMapHtml(m);
    expect(regionHtml(html, 'island')).toContain('data-dr-place="pines"');
    expect(regionHtml(html, 'island')).toContain('in the Pines and Swamp');
    expect(regionHtml(html, 'island')).toContain('tm-hit');
    expect(html.lastIndexOf('data-region="island"')).toBeGreaterThan(html.lastIndexOf('data-region="pines"'));
    // Twolegplace, the Woods, the River, the Moor, the Pines, the Gorge, and the island leading to the Pines
    expect((html.match(/data-dr-place=/g) || []).length).toBe(7);
  });

  it('the island is always built and says where it is, in its title and under its name, from one string (Polish 3)', () => {
    expect(ISLAND).toMatchObject({ status: 'built', areaId: 'pines' });
    expect(Object.isFrozen(ISLAND)).toBe(true);
    const html = renderTerritoryMapHtml(territoryMapModel(clanState(), CATALOG));
    const isl = regionHtml(html, 'island');
    expect(isl).toContain(`<title>The island, ${ISLAND_WHERE} · `);
    expect(isl).toContain(`>${ISLAND_WHERE}</text>`);
    expect(html).not.toContain('coming soon');
  });

  it('the map has the lake, the island, the pond, the river, three paths and the bridge', () => {
    const m = territoryMapModel(clanState(), CATALOG);
    expect(m.lake).toEqual(LAKE);
    expect(m.island).toMatchObject({ name: 'The island', status: 'built', outline: ISLAND.outline });
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

describe('camps on the territory map', () => {
  const pick = (mine, partner = null) => ({ ...clanState(), clanPick: { mine, partner, partnerId: partner ? 'p1' : null }, colony: { partner: partner ? { playerId: 'p1' } : null } });
  it('Clan Edition marks your clan\'s camp as mine and the others as not', () => {
    const s = pick('woods');
    expect(clanOf(s, 'woods')).toMatchObject({ mine: true, ally: false, color: '#3f7d3a' });
    expect(clanOf(s, 'river').mine).toBe(false);
  });
  it('the sibling\'s pick is the ally', () => {
    const s = pick('woods', 'river');
    expect(clanOf(s, 'river')).toMatchObject({ mine: false, ally: true });
    expect(clanOf(s, 'moor').ally).toBe(false);
  });
  it('a partner-only pick makes the sibling\'s camp the ally, never mine', () => {
    const s = pick(null, 'river');
    expect(clanOf(s, 'river')).toMatchObject({ mine: false, ally: true });
    for (const id of ['woods', 'moor', 'pines']) expect(clanOf(s, id).mine).toBe(false);
  });
  it('Legacy gives every region no camp', () => {
    const m = territoryMapModel({ ...pick('woods'), edition: 'legacy' }, CATALOG);
    for (const r of m.regions) expect(r.camp).toBeNull();
  });
  it('the pines region has a camp, the island region and the town do not', () => {
    const s = clanState();
    expect(clanOf(s, 'pines')).not.toBeNull();
    expect(territoryMapModel(s, CATALOG).island.camp ?? null).toBeNull();
    expect(clanOf(s, 'town')).toBeNull();
    expect(clanOf(s, 'gorge')).toBeNull();
  });
  it('every camp sits inside its own region', () => {
    const m = territoryMapModel(clanState(), CATALOG);
    for (const r of m.regions.filter((x) => x.camp)) {
      expect(Math.hypot(r.camp.x - r.x, r.camp.y - r.y)).toBeLessThan(r.r);
    }
  });
  it('draws a camp group per camp, after the tap target, with a name title', () => {
    const html = renderTerritoryMapHtml(territoryMapModel(pick('woods', 'river'), CATALOG));
    const w = regionHtml(html, 'woods');
    expect(w).toContain('class="tm-camp mine"');
    expect(w.indexOf('tm-hit')).toBeLessThan(w.indexOf('tm-camp'));
    expect(regionHtml(html, 'river')).toContain('class="tm-camp ally"');
    expect(regionHtml(html, 'moor')).toContain('class="tm-camp"');
    expect(regionHtml(html, 'town')).not.toContain('tm-camp');
  });
});
