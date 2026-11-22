// World map step 2: the world as data. Her board (src/territories.js) kept
// exactly as she drew it, with draft 2's street places, coast and gateways
// around it (docs/superpowers/specs/img/2026-11-19-world-map-draft-2.svg).
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import {
  BOARD, TERRITORIES, LAKE, POND, RIVER, PATHS, BRIDGE, STAR, CAMP_AT, placeState, territoryMapModel, shortLockLine, opensAfterLine,
} from '../src/territories.js';
import {
  WORLD, STREET_PLACES, TOWN_PLACES, TOWN_LAND, STREET_LAND, COAST, GATEWAYS, ISLAND_HIT_R, WORLD_CAMP_AT, worldMapModel, tapTargets, focusOf,
} from '../src/worldmap.js';
import { LAND } from '../src/territories.js';
import { renderWorldMapHtml, ISLAND_WHERE } from '../src/ui/territorymap.js';
import { withOffWords } from './helpers/offwords.js';
import { withRoofs } from './helpers/withroofs.js';
import { placeCardFor } from '../src/ui/placecard.js';

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
// The Market's road (Market step 4, V19): from the town's south-east rim to
// the Market's circle, in the gap between the town, the Market and the Docks.
const MARKET_ROAD = [[898, 661], [910, 678], [926, 688], [939, 682]];
// A cubic road's point at t.
const roadAt = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};

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
    expect(m.regions.map((r) => r.areaId).sort()).toEqual(Object.keys(CATALOG.areas).sort()); // the Rooftops and the Market among them, town places (Rooftops step 4, Market step 4)
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

  it('seven gateways join the places draft 2 joins, the Rooftops and the Market, edge to edge', () => {
    expect(GATEWAYS.map((g) => [g.id, g.from, g.to])).toEqual([
      ['town-park', 'neighborhood', 'park'], ['park-fair', 'park', 'fair'], ['park-farm', 'park', 'farm'],
      ['town-docks', 'neighborhood', 'docks'], ['docks-seaside', 'docks', 'seaside'], ['town-roofs', 'neighborhood', 'roofs'],
      ['town-market', 'neighborhood', 'market']]);
    expect(GATEWAYS.map((g) => g.road)).toEqual([
      [[952, 570], [1000, 580], [1060, 590], [1080, 560]],
      [[1080, 380], [1080, 350], [1060, 340], [1060, 315]],
      [[1168, 450], [1210, 440], [1240, 430], [1235, 405]],
      [[860, 676], [870, 700], [885, 700], [892, 690]],
      [[980, 780], [1040, 790], [1110, 790], [1140, 765]],
      [[946, 520], [980, 508], [984, 468], [951, 455]],
      MARKET_ROAD,
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

  // The Rooftops sits on the town's north rim, its circle over the town's:
  // the roads are drawn under the places, so its road runs round the east
  // side in the open, starting clear of the Rooftops and ending clear of the
  // town, and nowhere near the Park.
  it("the Rooftops' road runs in the open between the town and the Rooftops", () => {
    const m = worldMapModel(fresh(), CATALOG);
    const at = (id) => m.regions.find((r) => r.areaId === id);
    const [town, roofs, park] = ['neighborhood', 'roofs', 'park'].map(at);
    const g = GATEWAYS.find((x) => x.id === 'town-roofs');
    const [p0, p1, p2, p3] = g.road;
    expect(dist(p0[0], p0[1], roofs.x, roofs.y)).toBeGreaterThan(roofs.r + 8);
    expect(dist(p3[0], p3[1], town.x, town.y)).toBeGreaterThan(town.r + 8);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      expect(dist(x, y, park.x, park.y), `road at t ${t}`).toBeGreaterThan(park.r + 8);
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
    expect(placeState(s, CATALOG, 'park')).toEqual({ owned: false, selected: false, locked: false, canOpen: false, price: 50, line: '50 🐾 — keep exploring!', mapLine: '50 🐾 — keep exploring!' });
    s.points = 50;
    expect(park(s)).toMatchObject({ canOpen: true, line: 'Open for 50 🐾' });
    s.unlocked.areas.push('park');
    expect(park(s)).toMatchObject({ owned: true, line: 'click to go here' });
    s.area = 'park';
    expect(park(s)).toMatchObject({ owned: true, selected: true, line: 'you’re going here' });

    expect(regionOf(worldMapModel(fresh(), CATALOG), 'seaside').line).toBe('opens after you explore the Old Docks 2 times · 0/2');
    s = fresh(); s.keptOffers = ['seaside']; s.walks.park = 2; s.points = 100;
    expect(regionOf(worldMapModel(s, CATALOG), 'seaside')).toMatchObject({ locked: false, canOpen: true, price: 100, line: 'Open for 100 🐾' });

    // An area the catalog does not have, as stateOf has always said.
    expect(placeState(fresh(), CATALOG, 'rooftops')).toEqual({ owned: false, selected: false, locked: false, canOpen: false, price: 0, line: 'coming soon', mapLine: 'coming soon' });
    // Her board's places carry their price too, and stay free to take.
    const woods = regionOf(worldMapModel({ ...fresh(), walks: { neighborhood: 2 } }, CATALOG), 'woods');
    expect(woods).toMatchObject({ kind: 'board', price: 0, locked: false, canOpen: true, line: 'Click to explore' });
  });

  it('a locked place says it in one short line on the map, the full line with its counter elsewhere', () => {
    const req = { area: 'neighborhood', walks: 2 };
    const place = opensAfterLine(req, 0, 'canon', CATALOG).match(/^opens after you explore (.*?) 2 times/)[1];
    expect(shortLockLine(req, 0, 'canon', CATALOG)).toBe(`explore ${place} 2 more times`);
    expect(shortLockLine(req, 1, 'canon', CATALOG)).toBe(`explore ${place} once more`);
    expect(shortLockLine({ area: 'neighborhood', walks: 5 }, 1, 'canon', CATALOG)).toBe(`explore ${place} 4 more times`);

    const s = fresh();
    expect(placeState(s, CATALOG, 'park')).toMatchObject({ locked: true, line: 'opens after you explore Twolegplace 2 times · 0/2', mapLine: 'explore Twolegplace 2 more times' });
    s.walks.neighborhood = 1;
    expect(placeState(s, CATALOG, 'park').mapLine).toBe('explore Twolegplace once more');
    s.walks.neighborhood = 2;
    for (const id of ['park', 'woods']) {
      const st = placeState(s, CATALOG, id);
      expect(st.mapLine).toBe(st.line);
    }

    const label = (html, id) => regionHtml(html, id).match(/<text class="tm-label[\s\S]*?<\/text>/)[0];
    const html = renderWorldMapHtml(worldMapModel(fresh(), CATALOG));
    expect(label(html, 'park')).toContain('explore Twolegplace');
    expect(label(html, 'park')).not.toContain('0/2');
    // (a screen reader still gets the full line)
    expect(regionHtml(html, 'park')).toContain('aria-label="City Park: opens after you explore Twolegplace 2 times · 0/2"');
  });

  it('the town is Peopleville in the everyday words', () => {
    withOffWords(() => expect(worldMapModel(fresh(), CATALOG).regions.find((r) => r.id === 'town').name).toBe('Peopleville'));
  });

  it('tap targets: every place and the island, the island the smallest at 92 across (the Rooftops and the Market as small, never smaller)', () => {
    const t = tapTargets(worldMapModel(fresh(), CATALOG));
    expect(t).toHaveLength(14);
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
    // the paper and the sea run far past the world (6000 units each way), so
    // a screen whose shape is not the world's shows more map round it, never
    // the page behind: the sea carries on up, right and down from her coast
    expect(html).toContain('<rect class="tm-paper" x="-6000" y="-6000" width="13500" height="12880"/>');
    expect(html).toContain('<path class="tm-sea" d="M1340 -6000 L1340 0 C1320 160 1360 300 1335 430 C1315 540 1350 640 1310 730 C1280 800 1180 860 1000 880'
      + ' C820 900 760 960 750 1100 L750 6880 L7500 6880 L7500 -6000 Z"/>');
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

  it('layers, bottom to top: paper, sea, lands, water, paths, roads, places, island', () => {
    const order = ['tm-paper', 'tm-sea', 'tm-lands', 'tm-water', 'tm-paths', 'wm-roads', 'data-region="town"', 'data-region="seaside"', 'data-region="island"']
      .map((c) => html.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // no frame round the world: the paper carries on past its edge
    expect(html).not.toContain('tm-frame');
  });

  it('every place is a labelled keyboard button that opens its card', () => {
    const ids = [...html.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id);
    expect(new Set(ids).size).toBe(13);
    expect(ids).toHaveLength(14); // the island is a second way into the Pines
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

  it('her paths and bridge, seven roads and seven gate marks', () => {
    expect((html.match(/class="tm-path"/g) || []).length).toBe(3);
    expect(html).toContain('class="tm-bridge"');
    for (const cls of ['tm-lake', 'tm-island', 'tm-star', 'tm-pond', 'tm-river']) expect(html).toContain(`class="${cls}`);
    expect((html.match(/class="wm-road"/g) || []).length).toBe(7);
    expect((html.match(/class="wm-gate"/g) || []).length).toBe(7);
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
    expect((html.match(/class="tm-land /g) || []).length).toBe(13);
  });

  it('camps only on her board, only in Clan Edition', () => {
    const h = draw(pick('woods'));
    expect(regionHtml(h, 'woods')).toContain('tm-camp mine');
    expect(regionHtml(h, 'woods').indexOf('tm-hit')).toBeLessThan(regionHtml(h, 'woods').indexOf('tm-camp'));
    expect(regionHtml(h, 'woods')).toMatch(/<title>[^<]+ camp<\/title>/);
    for (const id of ['park', 'fair', 'farm', 'docks', 'seaside', 'town', 'island']) expect(regionHtml(h, id), id).not.toContain('tm-camp');
    expect(draw({ ...pick('woods'), edition: 'legacy' })).not.toContain('tm-camp');
  });

  // The Moor's camp badge touched the Moor's name on the world map (and sat
  // on its lock line when the Moor is locked). On the world map only it sits
  // in the bend of her river, below every line of the Moor's words.
  it("the Moor's camp sits in the bend of her river, clear of the Moor's words; her board's spot is kept", () => {
    expect(CAMP_AT.moor).toEqual([540, 95]);
    expect(Object.keys(WORLD_CAMP_AT)).toEqual(['moor']);
    for (const s of [pick('moor'), { ...pick('moor'), walks: { ...fresh().walks, woods: 3 } }, pick('woods', 'moor')]) {
      const camp = regionOf(worldMapModel(s, CATALOG), 'moor').camp;
      expect(camp).toMatchObject({ x: 565, y: 260 });
      expect(regionOf(territoryMapModel(s, CATALOG), 'moor').camp).toMatchObject({ x: 540, y: 95 });
      // the other camps are where her board puts them
      for (const id of ['woods', 'river', 'pines', 'gorge']) {
        const c = regionOf(worldMapModel(s, CATALOG), id).camp;
        if (c) expect([c.x, c.y], id).toEqual([...CAMP_AT[id]]);
      }
      // inside the Moor, the gold ring (r 36, a 10 wide dark edge) included (a
      // browser measured it clear of her hand-drawn edge, the river and the lake)
      const moor = TERRITORIES.find((t) => t.id === 'moor');
      expect(Math.hypot(camp.x - moor.x, camp.y - moor.y) + 42).toBeLessThan(moor.r);
      // below the last line of the Moor's words (its baseline, plus room for the ring)
      const label = tagAt(regionHtml(draw(s), 'moor'), 'class="tm-label"');
      const text = regionHtml(draw(s), 'moor').match(/<text class="tm-label"[^>]*>(.*?)<\/text>/)[1];
      const top = Number(label.match(/ y="([-\d.]+)"/)[1]);
      const last = top + [...text.matchAll(/dy="([\d.]+)"/g)].reduce((sum, [, dy]) => sum + Number(dy), 0);
      expect(camp.y - 42, JSON.stringify(s.clanPick)).toBeGreaterThan(last + 10);
    }
  });

  it('every place is there in the everyday words, the camp a home base', () => {
    withOffWords(() => {
      const h = draw(pick('woods'));
      expect(new Set([...h.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id)).size).toBe(13);
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

// The Rooftops: a spot inside the town, "coming soon" until Rooftops step 4
// added its catalog row (R1, ruling T1); a place to unlock like the others now.
describe('world map: the Rooftops inside the town', () => {
  // the topmost target whose circle holds the point (later targets draw on top)
  const hit = (t, x, y) => [...t].reverse().find((q) => dist(q.x, q.y, x, y) <= q.r);
  // the topmost target whose circle holds the point (later targets draw on top)
  it('the Rooftops is on the map inside the town, and open to unlock', () => {
    expect(TOWN_PLACES[0]).toEqual({ id: 'roofs', areaId: 'roofs', x: 905, y: 458, r: 46 });
    expect(Object.isFrozen(TOWN_PLACES) && TOWN_PLACES.every((p) => Object.isFrozen(p))).toBe(true);
    const m = worldMapModel(fresh(), CATALOG);
    const town = regionOf(m, 'town');
    const roofs = regionOf(m, 'roofs');
    expect(roofs).toMatchObject({ kind: 'town', areaId: 'roofs', name: 'The Rooftops', status: 'built', x: 905, y: 458, r: 46, camp: null, locked: true, owned: false, price: 100 });
    expect(dist(roofs.x, roofs.y, town.x, town.y)).toBeLessThan(town.r + roofs.r - 20); // on the town's rim, straddling it
    expect(m.regions.at(-2).id).toBe('roofs');
    withOffWords(() => expect(regionOf(worldMapModel(fresh(), CATALOG), 'roofs').name).toBe('The Rooftops'));
    // locked on a fresh save: the lock in its label, the Rooftops' icon
    const label = regionHtml(renderWorldMapHtml(m), 'roofs');
    expect(label).toContain('🔒');
    expect(label).toContain('🕊️');
    // an owned save's card goes there
    const s = fresh();
    const mine = worldMapModel({ ...s, walks: { ...s.walks, fair: 2 }, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'fair', 'roofs'] } }, CATALOG);
    expect(placeCardFor(mine, 'roofs', 0)).toMatchObject({ action: 'go', label: 'Go here', locked: false });
    // ...and with touch its line says Tap where a street place's would
    for (const touch of [false, true]) {
      const t = worldMapModel({ ...s, walks: { ...s.walks, park: 2, fair: 2 }, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'park', 'fair', 'roofs'] } }, CATALOG, { touch });
      expect(regionOf(t, 'roofs').line, `touch ${touch}`).toBe(regionOf(t, 'park').line);
      expect(regionOf(t, 'roofs').line).toBe(touch ? 'tap to go here' : 'click to go here');
    }
  });
  it("a tap on it picks the Rooftops; a tap on the town's centre still picks the town", () => {
    const t = tapTargets(worldMapModel(fresh(), CATALOG));
    expect(hit(t, 905, 458).areaId).toBe('roofs');
    expect(hit(t, 843, 566).areaId).toBe('neighborhood');
    expect(t.at(-1).areaId).toBe('pines');
  });
  it("it leaves the town's icon, name and line clear: its circle holds none of their anchor points", () => {
    const m = worldMapModel(fresh(), CATALOG);
    const roofs = regionOf(m, 'roofs');
    const t = tapTargets(m);
    // the town's label is centred on (862, 572): icon about 70 above, name and line below
    for (const [x, y] of [[862, 572], [862, 505], [862, 540], [862, 610], [843, 566]]) {
      expect(dist(roofs.x, roofs.y, x, y), `${x},${y}`).toBeGreaterThan(roofs.r + 10);
      expect(hit(t, x, y).areaId).toBe('neighborhood');
    }
    // and it clears its neighbours' circles
    for (const id of ['woods', 'park', 'gorge']) expect(dist(roofs.x, roofs.y, regionOf(m, id).x, regionOf(m, id).y)).toBeGreaterThan(regionOf(m, id).r + roofs.r - 30);
  });
  it('its card offers it for 100 🐾 once the Fairground walks are done', () => {
    const s = fresh();
    const early = worldMapModel({ ...s, points: 500, walks: { ...s.walks, fair: 1 } }, CATALOG);
    expect(placeCardFor(early, 'roofs', 500)).toMatchObject({ id: 'roofs', name: 'The Rooftops', action: null, label: null, locked: true });
    expect(placeCardFor(early, 'roofs', 500).line).toContain('1/2');
    const open = worldMapModel({ ...s, points: 100, walks: { ...s.walks, fair: 2 } }, CATALOG);
    expect(placeCardFor(open, 'roofs', 100)).toMatchObject({ id: 'roofs', action: 'open', label: 'Open for 100 🐾', locked: false });
  });
  it('with the catalog row (withRoofs) it is a place like the others', () => {
    const m = worldMapModel(fresh(), withRoofs(CATALOG));
    expect(regionOf(m, 'roofs')).toMatchObject({ status: 'built', price: 100, locked: true });
    const open = worldMapModel({ ...fresh(), points: 100, walks: { ...fresh().walks, fair: 2 } }, withRoofs(CATALOG));
    expect(placeCardFor(open, 'roofs', 100)).toMatchObject({ action: 'open', label: 'Open for 100 🐾' });
  });
  it('its label inside the town keeps to two short rows: the lock alone, or its price alone, never the whole wait', () => {
    const s = fresh();
    const label = (save) => regionHtml(renderWorldMapHtml(worldMapModel(save, CATALOG)), 'roofs').match(/<text class="tm-label"[\s\S]*?<\/text>/)[0];
    const rows = (save) => [...label(save).matchAll(/<tspan class="tm-line[^"]*"[^>]*>([^<]*)<\/tspan>/g)].map((x) => x[1]);
    expect(rows(s)).toEqual([]);                                                            // locked: 🔒 in its name, the wait on its card
    expect(label(s)).toContain('🔒');
    expect(label(s)).not.toContain('Fairground');
    expect(rows({ ...s, points: 20, walks: { ...s.walks, fair: 2 } })).toEqual(['100 🐾']); // the paws still to find
    expect(rows({ ...s, points: 100, walks: { ...s.walks, fair: 2 } })).toEqual(['Open for', '100 🐾']);
    expect(rows({ ...s, unlocked: { ...s.unlocked, areas: ['neighborhood', 'roofs'] } })).toEqual(['click to', 'go here']);
    // today's place: its ring marks it, so the label has no line at all
    expect(rows({ ...s, area: 'roofs', unlocked: { ...s.unlocked, areas: ['neighborhood', 'roofs'] } })).toEqual([]);
    // the aria-label still reads the whole line
    expect(regionHtml(renderWorldMapHtml(worldMapModel(s, CATALOG)), 'roofs')).toContain('aria-label="The Rooftops: opens after you explore the Fairground 2 times · 0/2"');
  });
  it('the markup draws it as a button with its own land', () => {
    const h = renderWorldMapHtml(worldMapModel(fresh(), CATALOG));
    expect(regionHtml(h, 'roofs')).toContain('data-dr-map-place="roofs"');
  });
});

// The Market Square: a place on the town's south-east rim (Market step 4,
// V19), Clan Edition only (V16), open to unlock for 150 after 2 town walks.
describe('world map: the Market on the town\'s rim', () => {
  it("the Market is on the map on the town's rim, open to unlock", () => {
    expect(TOWN_PLACES).toEqual([
      { id: 'roofs', areaId: 'roofs', x: 905, y: 458, r: 46 },
      { id: 'market', areaId: 'market', x: 962, y: 642, r: 46 },
    ]);
    expect(Object.isFrozen(TOWN_PLACES) && TOWN_PLACES.every((p) => Object.isFrozen(p))).toBe(true);
    expect(TOWN_LAND).toEqual({ roofs: '#8e9bb0', market: '#d8b48a' });
    const m = worldMapModel(fresh(), CATALOG);
    const town = regionOf(m, 'town');
    const market = regionOf(m, 'market');
    expect(market).toMatchObject({ kind: 'town', areaId: 'market', name: 'The Market Square', status: 'built', x: 962, y: 642, r: 46, camp: null, locked: true, owned: false, canOpen: false, price: 150 });
    expect(market.line).toBe('opens after you explore Twolegplace 2 times · 0/2');
    expect(m.regions.at(-1).id).toBe('market');
    withOffWords(() => expect(regionOf(worldMapModel(fresh(), CATALOG), 'market').name).toBe('The Market Square'));
    // it straddles the town's rim: the rim runs through its circle
    const d = dist(market.x, market.y, town.x, town.y);
    expect(Math.abs(d - town.r)).toBeLessThan(market.r);
    // it clears the Rooftops', the Docks' and the Park's circles
    for (const id of ['roofs', 'docks', 'park']) {
      const o = regionOf(m, id);
      expect(dist(market.x, market.y, o.x, o.y), id).toBeGreaterThan(market.r + o.r);
    }
    // and every other road by 8
    for (const g of GATEWAYS.filter((x) => x.id !== 'town-market')) {
      for (let i = 0; i <= 40; i++) {
        const [x, y] = roadAt(g.road, i / 40);
        expect(dist(x, y, market.x, market.y), `${g.id} at ${i / 40}`).toBeGreaterThan(market.r + 8);
      }
    }
    // it leaves the town's icon, name and line anchors clear
    for (const [x, y] of [[862, 572], [862, 505], [862, 540], [862, 610], [843, 566]]) {
      expect(dist(market.x, market.y, x, y), `${x},${y}`).toBeGreaterThan(market.r + 10);
    }
    // locked on a fresh save: the lock in its label, the Market's icon
    const label = regionHtml(renderWorldMapHtml(m), 'market');
    expect(label).toContain('🔒');
    expect(label).toContain('🧺');
    expect(label).toContain('data-dr-map-place="market"');
    expect(renderWorldMapHtml(m)).toContain('<path class="tm-land street built locked" fill="#d8b48a" d="M');
  });

  it("an owned save's card goes there", () => {
    const s = fresh();
    const mine = worldMapModel({ ...s, walks: { ...s.walks, neighborhood: 2 }, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'market'] } }, CATALOG);
    expect(placeCardFor(mine, 'market', 0)).toMatchObject({ id: 'market', action: 'go', label: 'Go here', locked: false });
    // ...its card offers it for 150 once the town walks are done
    const early = worldMapModel({ ...s, points: 500, walks: { ...s.walks, neighborhood: 1 } }, CATALOG);
    expect(placeCardFor(early, 'market', 500)).toMatchObject({ id: 'market', name: 'The Market Square', action: null, label: null, locked: true });
    expect(placeCardFor(early, 'market', 500).line).toContain('1/2');
    const open = worldMapModel({ ...s, points: 150, walks: { ...s.walks, neighborhood: 2 } }, CATALOG);
    expect(placeCardFor(open, 'market', 150)).toMatchObject({ id: 'market', action: 'open', label: 'Open for 150 🐾', locked: false });
  });

  // Review (Task 11): its words once sat on the town's own line. Each row of
  // every label is boxed from its baseline (0.8 em up, 0.25 em down) and its
  // width in Chalkboard SE bold (the iPad's font; the advance widths measured
  // in a browser, an unlisted glyph 0.8 em, an emoji 1.1 em). A flat 0.6 em
  // per character is no bound here: it makes "you’re going here" 245 wide
  // where the font draws 198, and "and Swamp" 238 where it draws 236. The
  // Market's rows keep 4 units (the halo's half-width) from every row of the
  // town's, the Docks', the Park's and the Seaside's labels and from its road's
  // gate mark, in every state, both word sets, click and tap.
  it("its words keep off the town's own name and line, and every neighbour's, in every state", () => {
    const EM = { a: 0.56, b: 0.58, c: 0.51, d: 0.6, e: 0.55, f: 0.45, g: 0.55, h: 0.57, i: 0.27, j: 0.41, k: 0.55, l: 0.32, m: 0.76, n: 0.53, o: 0.51, p: 0.55, q: 0.54, r: 0.46, s: 0.45, t: 0.48, u: 0.55, v: 0.49, w: 0.74, x: 0.58, y: 0.56, z: 0.56,
      A: 0.67, B: 0.59, C: 0.61, D: 0.66, E: 0.57, F: 0.52, G: 0.69, H: 0.64, I: 0.47, J: 0.57, K: 0.61, L: 0.54, M: 0.85, N: 0.68, O: 0.75, P: 0.6, Q: 0.78, R: 0.65, S: 0.61, T: 0.59, U: 0.68, V: 0.67, W: 1.01, X: 0.68, Y: 0.61, Z: 0.68,
      ' ': 0.41, "'": 0.24, '’': 0.3, '.': 0.34, ',': 0.3, ':': 0.33, '!': 0.3, '—': 0.68, '-': 0.52, '·': 0.38, '/': 0.59 };
    const em = (ch) => (/\p{Extended_Pictographic}/u.test(ch) ? 1.1 : /[0-9]/.test(ch) ? 0.61 : EM[ch] ?? 0.8);
    const SIZE = { 'tm-icon': 34, 'tm-line': 28, 'tm-line tm-line-small': 24 };
    const rowsOf = (html, id) => {
      const text = regionHtml(html, id).match(/<text class="tm-label" x="[-\d.]+" y="([-\d.]+)"[^>]*>([\s\S]*?)<\/text>/);
      let y = Number(text[1]);
      const rows = [];
      for (const [, cls, x, dy, fs, words] of text[2].matchAll(/<tspan class="([^"]+)" x="([-\d.]+)" dy="([-\d.]+)"(?: font-size="(\d+)")?>([^<]*)<\/tspan>/g)) {
        y += Number(dy);
        const size = fs ? Number(fs) : SIZE[cls];
        const w = [...words.replace(/&[a-z#0-9]+;/g, 'x').replace(/\uFE0F/g, '')].reduce((sum, ch) => sum + em(ch) * size, 0);
        if (w > 0) rows.push({ words, x0: Number(x) - w / 2, x1: Number(x) + w / 2, y0: y - 0.8 * size, y1: y + 0.25 * size });
      }
      expect(rows.length, id).toBeGreaterThan(0);
      return rows;
    };
    const gap = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
    const s = fresh();
    const town2 = { ...s.walks, neighborhood: 2 };
    const saves = {
      locked: s,
      short: { ...s, walks: town2, points: 20 },
      canOpen: { ...s, walks: town2, points: 150 },
      owned: { ...s, walks: town2, unlocked: { ...s.unlocked, areas: ['neighborhood', 'market'] } },
      ownedAway: { ...s, walks: { ...town2, park: 2 }, unlocked: { ...s.unlocked, areas: ['neighborhood', 'park', 'market'] }, area: 'park' },
      today: { ...s, walks: town2, unlocked: { ...s.unlocked, areas: ['neighborhood', 'market'] }, area: 'market' },
      docksAndSeaside: { ...s, walks: { ...town2, park: 2, docks: 2 }, points: 500, unlocked: { ...s.unlocked, areas: ['neighborhood', 'park', 'docks', 'market'] } },
    };
    const GATE = { x0: 939 - 8, x1: 939 + 8, y0: 682 - 8, y1: 682 + 8 };
    let checked = 0;
    for (const sets of [(f) => f(), withOffWords]) {
      sets(() => {
        for (const [name, save] of Object.entries(saves)) {
          for (const touch of [false, true]) {
            const html = renderWorldMapHtml(worldMapModel(save, CATALOG, { touch }));
            const market = rowsOf(html, 'market');
            for (const q of market) expect(gap(GATE, q), `${name}: ${q.words} / the gate mark`).toBeGreaterThanOrEqual(4);
            for (const id of ['town', 'docks', 'park', 'seaside', 'roofs']) {
              for (const r of rowsOf(html, id)) {
                for (const q of market) { expect(gap(r, q), `${name} ${touch}: ${id} "${r.words}" / "${q.words}"`).toBeGreaterThanOrEqual(4); checked++; }
              }
            }
          }
        }
      });
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("the town-market road runs from the town's edge to the Market's", () => {
    const m = worldMapModel(fresh(), CATALOG);
    const [town, market, docks] = ['town', 'market', 'docks'].map((id) => regionOf(m, id));
    const g = GATEWAYS.find((x) => x.id === 'town-market');
    expect(g).toMatchObject({ from: 'neighborhood', to: 'market' });
    expect(g.road).toEqual(MARKET_ROAD);
    const [p0, , , p3] = g.road;
    // edge to edge, each end in the open, clear of the other circle
    expect(Math.abs(dist(p0[0], p0[1], town.x, town.y) - town.r)).toBeLessThanOrEqual(8);
    expect(Math.abs(dist(p3[0], p3[1], market.x, market.y) - market.r)).toBeLessThanOrEqual(8);
    expect(dist(p0[0], p0[1], market.x, market.y)).toBeGreaterThan(market.r + 8);
    expect(dist(p3[0], p3[1], town.x, town.y)).toBeGreaterThan(town.r + 8);
    // and nowhere inside the Docks
    for (let i = 0; i <= 20; i++) {
      const [x, y] = roadAt(g.road, i / 20);
      expect(dist(x, y, docks.x, docks.y), `at ${i / 20}`).toBeGreaterThan(docks.r + 4);
    }
    const h = renderWorldMapHtml(m);
    expect(h).toContain('<path class="wm-road" d="M898 661 C910 678 926 688 939 682"/><circle class="wm-gate" cx="939" cy="682" r="8"/>');
  });
});
