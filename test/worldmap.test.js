// World map step 2: the world as data. Her board (src/territories.js) kept
// exactly as she drew it, with draft 2's street places, coast and gateways
// around it (docs/superpowers/specs/img/2026-11-19-world-map-draft-2.svg).
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import {
  BOARD, TERRITORIES, LAKE, POND, RIVER, PATHS, BRIDGE, STAR, placeState,
} from '../src/territories.js';
import {
  WORLD, STREET_PLACES, STREET_LAND, COAST, GATEWAYS, ISLAND_HIT_R, worldMapModel, tapTargets, focusOf,
} from '../src/worldmap.js';
import { LAND } from '../src/territories.js';
import { renderWorldMapHtml, ISLAND_WHERE } from '../src/ui/territorymap.js';
import { withOffWords } from './helpers/offwords.js';

// A plain canon save, as clanState() in test/territories.test.js.
function fresh() {
  return {
    edition: 'canon',
    points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby' },
    area: 'neighborhood',
  };
}
const regionOf = (m, id) => m.regions.find((r) => r.id === id);
// The markup of one region: from its <g ... data-region="id"> to the next
// region (as test/territories.test.js).
function regionHtml(html, id) {
  const start = html.indexOf(`data-region="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-region="', start + 1);
  return html.slice(html.lastIndexOf('<g', start), next === -1 ? undefined : html.lastIndexOf('<g', next));
}
// The opening tag of an element, from the first match of `marker`.
const tagAt = (html, marker) => {
  const i = html.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
};
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

describe('world map: the world as data', () => {
  it('her board is untouched: every place, path, the river, the lake and the bridge as she drew them', () => {
    const m = worldMapModel(fresh(), CATALOG);
    expect(BOARD).toEqual({ w: 1000, h: 700 });
    expect(m.regions.filter((r) => r.kind === 'board').map(({ id, x, y, r }) => ({ id, x, y, r })))
      .toEqual(TERRITORIES.map(({ id, x, y, r }) => ({ id, x, y, r })));
    expect([m.lake, m.river, m.paths, m.bridge, m.pond, m.star]).toEqual([LAKE, RIVER, PATHS, BRIDGE, POND, STAR]);
  });

  it("draft 2's street places, world and coast", () => {
    expect(WORLD).toEqual({ w: 1500, h: 880 });
    expect(STREET_PLACES.map(({ id, x, y, r }) => [id, x, y, r])).toEqual([
      ['park', 1080, 470, 90], ['fair', 1060, 230, 85], ['farm', 1235, 320, 85], ['docks', 900, 770, 80], ['seaside', 1185, 680, 90]]);
    expect(STREET_PLACES.every((p) => p.areaId === p.id)).toBe(true);
    expect(Object.isFrozen(STREET_PLACES) && STREET_PLACES.every((p) => Object.isFrozen(p))).toBe(true);
    expect(STREET_LAND).toEqual({ park: '#b9dc8f', fair: '#e9b7c9', farm: '#e3cf7e', docks: '#b7b9bf', seaside: '#ecdca8' });
    expect(COAST).toEqual([[1340, 0], [1320, 160], [1360, 300], [1335, 430], [1315, 540], [1350, 640], [1310, 730], [1280, 800], [1180, 860], [1000, 880]]);
    expect(Object.isFrozen(COAST) && COAST.every((p) => Object.isFrozen(p))).toBe(true);
    expect(ISLAND_HIT_R).toBe(46);
  });

  it('every place in the catalog is on the map exactly once, inside the world', () => {
    const m = worldMapModel(fresh(), CATALOG);
    expect(m.regions.map((r) => r.areaId).sort()).toEqual(Object.keys(CATALOG.areas).sort());
    // Her Moor (620, 161, r 165) reaches 4 units above the top edge, on her
    // board and in draft 2 alike; her board is not moved, so that one overhang
    // is allowed, and pinned so no other place gets one.
    const top = (r) => (r.id === 'moor' ? -4 : 0);
    expect(regionOf(m, 'moor').y - regionOf(m, 'moor').r).toBe(-4);
    for (const r of m.regions) expect(r.x - r.r >= 0 && r.y - r.r >= top(r) && r.x + r.r <= 1500 && r.y + r.r <= 880, r.id).toBe(true);
    expect(m.world).toEqual(WORLD);
  });

  it('no street place overlaps another place, and the sea is east of every place', () => {
    const m = worldMapModel(fresh(), CATALOG);
    for (const s of m.regions.filter((r) => r.kind === 'street')) {
      for (const o of m.regions) {
        if (o === s) continue;
        expect(dist(s.x, s.y, o.x, o.y) >= s.r + o.r, `${s.id} / ${o.id}`).toBe(true);
      }
    }
    for (const r of m.regions) {
      for (const [px, py] of COAST) {
        if (Math.abs(py - r.y) <= r.r) expect(px > r.x + r.r, `${r.id} / coast ${px},${py}`).toBe(true);
      }
    }
  });

  it('five gateways join the places draft 2 joins, edge to edge', () => {
    expect(GATEWAYS.map((g) => [g.id, g.from, g.to])).toEqual([
      ['town-park', 'neighborhood', 'park'], ['park-fair', 'park', 'fair'], ['park-farm', 'park', 'farm'],
      ['town-docks', 'neighborhood', 'docks'], ['docks-seaside', 'docks', 'seaside']]);
    expect(GATEWAYS.map((g) => g.road)).toEqual([
      [[952, 570], [1000, 580], [1060, 590], [1080, 560]],
      [[1080, 380], [1080, 350], [1060, 340], [1060, 315]],
      [[1168, 450], [1210, 440], [1240, 430], [1235, 405]],
      [[860, 676], [870, 700], [885, 700], [892, 690]],
      [[980, 780], [1040, 790], [1110, 790], [1140, 765]],
    ]);
    expect(Object.isFrozen(GATEWAYS) && GATEWAYS.every((g) => Object.isFrozen(g) && Object.isFrozen(g.road))).toBe(true);
    const m = worldMapModel(fresh(), CATALOG);
    expect(m.gateways).toBe(GATEWAYS);
    const byArea = (id) => m.regions.find((r) => r.areaId === id);
    for (const g of GATEWAYS) {
      const a = byArea(g.from); const b = byArea(g.to);
      const [fx, fy] = g.road[0]; const [tx, ty] = g.road.at(-1);
      expect(Math.abs(dist(fx, fy, a.x, a.y) - a.r) <= 8, `${g.id} from`).toBe(true);
      expect(Math.abs(dist(tx, ty, b.x, b.y) - b.r) <= 8, `${g.id} to`).toBe(true);
    }
  });

  it('the Park, Fairground, Farm and Seaside are entered from their south side, as their walks are', () => {
    const m = worldMapModel(fresh(), CATALOG);
    for (const id of ['park', 'fair', 'farm', 'seaside']) {
      const g = GATEWAYS.find((x) => x.to === id);
      const place = m.regions.find((r) => r.areaId === id);
      expect(g.road.at(-1)[1] > place.y, id).toBe(true);
    }
  });

  it('a street place shows its state in the words of its card', () => {
    const park = (s) => regionOf(worldMapModel(s, CATALOG), 'park');
    let s = fresh();
    expect(park(s)).toMatchObject({ kind: 'street', status: 'built', camp: null, name: 'City Park', locked: true, canOpen: false, owned: false });
    expect(park(s).line).toBe('opens after you explore Twolegplace 2 times · 0/2');
    s.walks.neighborhood = 2; s.points = 10;
    expect(park(s)).toMatchObject({ locked: false, canOpen: false, price: 50, line: '50 🐾 — keep exploring!' });
    expect(placeState(s, CATALOG, 'park')).toEqual({ owned: false, selected: false, locked: false, canOpen: false, price: 50, line: '50 🐾 — keep exploring!' });
    s.points = 50;
    expect(park(s)).toMatchObject({ canOpen: true, line: 'Open for 50 🐾' });
    s.unlocked.areas.push('park');
    expect(park(s)).toMatchObject({ owned: true, line: 'tap to go here' });
    s.area = 'park';
    expect(park(s)).toMatchObject({ owned: true, selected: true, line: 'you’re going here' });

    expect(regionOf(worldMapModel(fresh(), CATALOG), 'seaside').line).toBe('opens after you explore The Old Docks 2 times · 0/2');
    s = fresh(); s.keptOffers = ['seaside']; s.walks.park = 2; s.points = 100;
    expect(regionOf(worldMapModel(s, CATALOG), 'seaside')).toMatchObject({ locked: false, canOpen: true, price: 100, line: 'Open for 100 🐾' });

    // An area the catalog does not have, as stateOf has always said.
    expect(placeState(fresh(), CATALOG, 'rooftops')).toEqual({ owned: false, selected: false, locked: false, canOpen: false, price: 0, line: 'coming soon' });
    // Her board's places carry their price too, and stay free to take.
    const woods = regionOf(worldMapModel({ ...fresh(), walks: { neighborhood: 2 } }, CATALOG), 'woods');
    expect(woods).toMatchObject({ kind: 'board', price: 0, locked: false, canOpen: true, line: 'Tap to explore' });
  });

  it('the town is Peopleville in the everyday words', () => {
    withOffWords(() => expect(worldMapModel(fresh(), CATALOG).regions.find((r) => r.id === 'town').name).toBe('Peopleville'));
  });

  it('tap targets: every place and the island, the island the smallest at 92 across', () => {
    const t = tapTargets(worldMapModel(fresh(), CATALOG));
    expect(t).toHaveLength(12);
    expect(t.at(-1)).toEqual({ areaId: 'pines', x: 455, y: 314, r: 46 });
    expect(Math.min(...t.map((x) => 2 * x.r))).toBe(92);
  });

  it("focusOf is today's place, else the town", () => {
    expect(focusOf(worldMapModel({ ...fresh(), unlocked: { areas: ['neighborhood', 'docks'] }, area: 'docks' }, CATALOG))).toEqual([900, 770]);
    expect(focusOf(worldMapModel(fresh(), CATALOG))).toEqual([843, 566]);
  });
});

describe('drawing the world', () => {
  const draw = (s, catalog = CATALOG) => renderWorldMapHtml(worldMapModel(s, catalog));
  const html = draw(fresh());
  const pick = (mine, partner = null) => ({ ...fresh(), clanPick: { mine, partner, partnerId: partner ? 'p1' : null }, colony: { partner: partner ? { playerId: 'p1' } : null } });

  it('one SVG, labelled, the whole world', () => {
    expect(html.startsWith('<svg viewBox="0 -20 1500 900" class="territory-map world-map" role="group" aria-label="Map of the world"')).toBe(true);
    expect(html).toContain('<rect class="tm-paper" x="0" y="0" width="1500" height="880"/>');
    expect(html).toContain('<path class="tm-sea" d="M1340 0 C1320 160 1360 300 1335 430 C1315 540 1350 640 1310 730 C1280 800 1180 860 1000 880 L1500 880 L1500 0 Z"/>');
    expect(html.endsWith('</svg>')).toBe(true);
    expect(html).not.toContain('role="img"');
  });

  it("the drawn view starts above the Moor's top edge, so her Moor is never clipped", () => {
    const [, y] = html.match(/^<svg viewBox="([-\d.]+) ([-\d.]+)/).slice(1).map(Number);
    expect(y).toBeLessThanOrEqual(-12);
    // every point of the Moor's land, its selected ring (9) and focus outline (10) included
    const d = tagAt(regionHtml(html, 'moor'), 'class="tm-hit"').match(/d="([^"]+)"/)[1];
    const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(([, , py]) => Number(py));
    expect(Math.min(...ys) - 10 / 2).toBeGreaterThan(y);
  });

  it('layers, bottom to top: paper, sea, lands, water, paths, roads, places, island, frame', () => {
    const order = ['tm-paper', 'tm-sea', 'tm-lands', 'tm-water', 'tm-paths', 'wm-roads', 'data-region="town"', 'data-region="seaside"', 'data-region="island"', 'tm-frame']
      .map((c) => html.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('every place is a labelled keyboard button that opens its card', () => {
    const ids = [...html.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id);
    expect(new Set(ids).size).toBe(11);
    expect(ids).toHaveLength(12); // the island is a second way into the Pines
    expect(new Set(ids)).toEqual(new Set(Object.keys(CATALOG.areas)));
    expect(html).not.toContain('data-dr-place=');
    expect(regionHtml(html, 'park')).toMatch(/role="button" tabindex="0" aria-label="City Park: opens after you explore Twolegplace 2 times · 0\/2"/);
    expect(regionHtml(html, 'park')).toContain('data-x="1080" data-y="470"');
    expect(regionHtml(html, 'town')).toContain('data-dr-map-place="neighborhood" data-x="843" data-y="566" role="button" tabindex="0" aria-label="Twolegplace: ');
    expect(regionHtml(html, 'island')).toContain('<circle class="tm-hit" cx="455" cy="314" r="46"/>');
    expect(regionHtml(html, 'island')).toContain(`data-dr-map-place="pines" data-x="455" data-y="314" role="button" tabindex="0" aria-label="The island, ${ISLAND_WHERE}: `);
    for (const id of ['town', 'woods', 'moor', 'river', 'pines', 'gorge', 'park', 'fair', 'farm', 'docks', 'seaside', 'island']) {
      const g = tagAt(html, `data-region="${id}"`);
      expect(g, id).toMatch(/ role="button" tabindex="0" aria-label="[^"]+"/);
      expect(regionHtml(html, id), id).toContain('class="tm-hit"');
    }
    // no <title> on a place: the label is its aria-label
    expect(html.match(/<g class="tm-region[^>]*>(?=<title>)/)).toBeNull();
  });

  it('her paths and bridge, five roads and five gate marks', () => {
    expect((html.match(/class="tm-path"/g) || []).length).toBe(3);
    expect(html).toContain('class="tm-bridge"');
    for (const cls of ['tm-lake', 'tm-island', 'tm-star', 'tm-pond', 'tm-river']) expect(html).toContain(`class="${cls}`);
    expect((html.match(/class="wm-road"/g) || []).length).toBe(5);
    expect((html.match(/class="wm-gate"/g) || []).length).toBe(5);
    expect(html).toContain('<path class="wm-road" d="M952 570 C1000 580 1060 590 1080 560"/>');
    expect(html).toContain('<circle class="wm-gate" cx="1080" cy="560" r="8"/>');
    expect(html).toContain('<path class="wm-road" d="M980 780 C1040 790 1110 790 1140 765"/><circle class="wm-gate" cx="1140" cy="765" r="8"/>');
  });

  it('locked, today and owned look different; street places carry their lock and price', () => {
    expect(tagAt(html, 'data-region="park"')).toMatch(/class="tm-region [^"]*\blocked\b/);
    expect(regionHtml(html, 'park')).toContain('>🔒 City Park</tspan>');
    let s = fresh(); s.walks.neighborhood = 2; s.points = 50;
    expect(regionHtml(draw(s), 'park')).toContain('>Open for 50 🐾</tspan>');
    expect(regionHtml(draw(s), 'park')).not.toContain('🔒');
    s = fresh(); s.unlocked.areas.push('park'); s.area = 'park';
    const park = tagAt(draw(s), 'data-region="park"');
    expect(park).toMatch(/class="tm-region [^"]*\bsel\b/);
    expect(park).not.toMatch(/\blocked\b/);
    // her board's places are drawn as they were
    expect(tagAt(html, 'data-region="woods"')).toMatch(/class="tm-region built locked"/);
    expect(tagAt(html, 'data-region="town"')).toMatch(/class="tm-region built sel"/);
    // the lands: hers in her colours, the street ones in theirs, marked street
    for (const [id, fill] of Object.entries(STREET_LAND)) {
      expect(html, id).toMatch(new RegExp(`<path class="tm-land street built locked" fill="${fill}" d="M`));
    }
    expect(html).toContain(`<path class="tm-land built locked" fill="${LAND.woods}" d="M`);
    expect((html.match(/class="tm-land /g) || []).length).toBe(11);
  });

  it('camps only on her board, only in Clan Edition', () => {
    const h = draw(pick('woods'));
    expect(regionHtml(h, 'woods')).toContain('tm-camp mine');
    expect(regionHtml(h, 'woods').indexOf('tm-hit')).toBeLessThan(regionHtml(h, 'woods').indexOf('tm-camp'));
    expect(regionHtml(h, 'woods')).toMatch(/<title>[^<]+ camp<\/title>/);
    for (const id of ['park', 'fair', 'farm', 'docks', 'seaside', 'town', 'island']) expect(regionHtml(h, id), id).not.toContain('tm-camp');
    expect(draw({ ...pick('woods'), edition: 'legacy' })).not.toContain('tm-camp');
  });

  it('every place is there in the everyday words, the camp a home base', () => {
    withOffWords(() => {
      const h = draw(pick('woods'));
      expect(new Set([...h.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id)).size).toBe(11);
      expect(regionHtml(h, 'town')).toContain('aria-label="Peopleville: ');
      expect(regionHtml(h, 'woods')).toMatch(/<title>[^<]* home base<\/title>/);
    });
  });

  it('small places get smaller words', () => {
    // r < 140: the street places, the Gorge (80) and the town (110)
    for (const id of ['park', 'fair', 'farm', 'docks', 'seaside', 'gorge', 'town']) {
      expect(regionHtml(html, id), id).toContain('font-size="36"');
      expect(regionHtml(html, id), id).toContain('class="tm-line tm-line-small"');
    }
    for (const id of ['woods', 'moor', 'river', 'pines']) {
      expect(regionHtml(html, id), id).toContain('font-size="44"');
      expect(regionHtml(html, id), id).not.toContain('tm-line-small');
    }
  });

  it('icons and label anchors for the street places', () => {
    const at = { park: ['⛲', 1080], fair: ['🎡', 1060], farm: ['🚜', 1235], docks: ['⚓', 900], seaside: ['🏖️', 1170] };
    for (const [id, [icon, x]] of Object.entries(at)) {
      expect(regionHtml(html, id), id).toContain(`<tspan class="tm-icon" x="${x}" dy="0">${icon}</tspan>`);
    }
    expect(regionHtml(html, 'woods')).toContain('<tspan class="tm-icon" x="556" dy="0">🌳</tspan>');
  });

  it('names are escaped', () => {
    const catalog = { ...CATALOG, areas: { ...CATALOG.areas, park: { ...CATALOG.areas.park, name: '<b>' }, woods: { ...CATALOG.areas.woods, name: '"x"' } } };
    const h = draw(fresh(), catalog);
    expect(h).toContain('&lt;b&gt;');
    expect(h).not.toContain('<b>');
    expect(regionHtml(h, 'park')).toContain('aria-label="&lt;b&gt;: ');
    expect(regionHtml(h, 'woods')).toContain('aria-label="&quot;x&quot;: ');
  });
});
