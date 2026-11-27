// The world map as data and as a drawing (map rework, 2026-11-28; docs/superpowers/specs/2026-11-28-map-rework-design.md).
// One continent: her six places and the street places are patches of it, all the same size; the Moon is up in the sky and
// the Reef is the one place at sea. Ids, unlock order and roads are as before.
import { describe, it, expect, afterEach } from 'vitest';
import { setTele } from '../src/teleflag.js';
import { setTreehouse } from '../src/treehouseflag.js';
import { setJungle } from '../src/jungleflag.js';
import { CATALOG } from '../src/progression.js';
import {
  BOARD, TERRITORIES, LAKE, POND, RIVER, PATHS, BRIDGE, STAR, LAND, placeState, shortLockLine, opensAfterLine,
} from '../src/territories.js';
import {
  WORLD, PLACE_R, LAYOUT, STREET_PLACES, TOWN_PLACES, GATE_PLACES, TOWN_LAND, STREET_LAND, GATE_LAND, COAST, GATEWAYS, MOON_BEAM, ISLAND_HIT_R,
  worldMapModel, tapTargets, focusOf,
} from '../src/worldmap.js';
import { renderWorldMapHtml, ISLAND_WHERE, ISLAND_WORDS_AT, WORLD_VIEW, landPatches } from '../src/ui/territorymap.js';
import { withOffWords } from './helpers/offwords.js';
import { placeCardFor } from '../src/ui/placecard.js';

function fresh() {
  return {
    edition: 'canon', points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby' }, area: 'neighborhood',
  };
}
const GATE_IDS = ['moon', 'reef', 'crystal', 'snowville', 'jungle'];
// every switch on and every gate place walked, so every place is drawn
function everything(extra = {}) {
  setTele(true); setTreehouse(true); setJungle(true);
  const s = fresh();
  for (const id of GATE_IDS) s.walks[id] = 1;
  return { ...s, ...extra };
}
afterEach(() => { setTele(null); setTreehouse(null); setJungle(null); });

const regionOf = (m, id) => m.regions.find((r) => r.id === id);
function regionHtml(html, id) {
  const start = html.indexOf(`data-region="${id}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-region="', start + 1);
  return html.slice(html.lastIndexOf('<g', start), next === -1 ? undefined : html.lastIndexOf('<g', next));
}
const tagAt = (html, marker) => {
  const i = html.indexOf(marker);
  expect(i).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
};
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const roadAt = ([p0, p1, p2, p3], t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};
// the coast's x at a given y (the chain is flattened)
function coastX(y) {
  const line = [COAST[0]];
  for (let i = 0; i + 3 < COAST.length; i += 3) {
    for (let k = 1; k <= 24; k++) line.push(roadAt([COAST[i], COAST[i + 1], COAST[i + 2], COAST[i + 3]], k / 24));
  }
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1], [bx, by] = line[i];
    if ((ay <= y && y <= by) || (by <= y && y <= ay)) return by === ay ? Math.min(ax, bx) : ax + ((y - ay) / (by - ay)) * (bx - ax);
  }
  return Infinity;
}

// Each row of a place's label boxed from its baseline (0.8 em up, 0.25 em down) and its width in Chalkboard SE bold
// (the iPad's font; advance widths measured in a browser, an unlisted glyph 0.8 em, an emoji 1.1 em).
const EM = { a: 0.56, b: 0.58, c: 0.51, d: 0.6, e: 0.55, f: 0.45, g: 0.55, h: 0.57, i: 0.27, j: 0.41, k: 0.55, l: 0.32, m: 0.76, n: 0.53, o: 0.51, p: 0.55, q: 0.54, r: 0.46, s: 0.45, t: 0.48, u: 0.55, v: 0.49, w: 0.74, x: 0.58, y: 0.56, z: 0.56,
  A: 0.67, B: 0.59, C: 0.61, D: 0.66, E: 0.57, F: 0.52, G: 0.69, H: 0.64, I: 0.47, J: 0.57, K: 0.61, L: 0.54, M: 0.85, N: 0.68, O: 0.75, P: 0.6, Q: 0.78, R: 0.65, S: 0.61, T: 0.59, U: 0.68, V: 0.67, W: 1.01, X: 0.68, Y: 0.61, Z: 0.68,
  ' ': 0.41, "'": 0.24, '’': 0.3, '.': 0.34, ',': 0.3, ':': 0.33, '!': 0.3, '—': 0.68, '-': 0.52, '·': 0.38, '/': 0.59 };
const em = (ch) => (/\p{Extended_Pictographic}/u.test(ch) ? 1.1 : /[0-9]/.test(ch) ? 0.61 : EM[ch] ?? 0.8);
const SIZE = { 'tm-icon': 34, 'tm-line tm-line-small': 24 };
function rowsOf(html, id) {
  const text = regionHtml(html, id).match(/<text class="tm-label" x="[-\d.]+" y="([-\d.]+)"[^>]*>([\s\S]*?)<\/text>/);
  let y = Number(text[1]);
  const rows = [];
  for (const [, cls, x, dy, fs, words] of text[2].matchAll(/<tspan class="([^"]+)" x="([-\d.]+)" dy="([-\d.]+)"(?: font-size="(\d+)")?>([^<]*)<\/tspan>/g)) {
    y += Number(dy);
    const size = fs ? Number(fs) : SIZE[cls];
    const w = [...words.replace(/&[a-z#0-9]+;/g, 'x').replace(/️/g, '')].reduce((sum, ch) => sum + em(ch) * size, 0);
    if (w > 0) rows.push({ words, x0: Number(x) - w / 2, x1: Number(x) + w / 2, y0: y - 0.8 * size, y1: y + 0.25 * size });
  }
  expect(rows.length, id).toBeGreaterThan(0);
  return rows;
}
const gap = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);
const near = (q, x, y) => dist(Math.max(q.x0, Math.min(x, q.x1)), Math.max(q.y0, Math.min(y, q.y1)), x, y);

describe('world map: the world as data', () => {
  it('her board is kept as she drew it: her river, lake, island, paths and bridge, her six places in her order', () => {
    const m = worldMapModel(fresh(), CATALOG);
    expect(BOARD).toEqual({ w: 1000, h: 700 });
    expect(m.regions.filter((r) => r.kind === 'board').map((r) => r.id)).toEqual(TERRITORIES.map((t) => t.id));
    expect([m.lake, m.river, m.paths, m.bridge, m.pond, m.star]).toEqual([LAKE, RIVER, PATHS, BRIDGE, POND, STAR]);
    // her six stand where she put them, give or take one grid step (the island stays in its lake)
    for (const t of TERRITORIES) expect(dist(t.x, t.y, ...LAYOUT[t.id]), t.id).toBeLessThan(80);
  });

  it('the world, the layout, the places and the coast are fixed data', () => {
    expect(WORLD).toEqual({ w: 1840, h: 920 });
    expect(PLACE_R).toBe(84);
    for (const list of [STREET_PLACES, TOWN_PLACES, GATE_PLACES, COAST, GATEWAYS, MOON_BEAM, LAYOUT]) expect(Object.isFrozen(list)).toBe(true);
    expect(STREET_PLACES.map((p) => p.id)).toEqual(['park', 'fair', 'farm', 'docks', 'seaside', 'lighthouse', 'greenhouse', 'treehouse']);
    expect(TOWN_PLACES.map((p) => p.id)).toEqual(['roofs', 'market', 'house']);
    expect(GATE_PLACES.map((p) => p.id)).toEqual(['reef', 'crystal', 'moon', 'jungle', 'snowville']);
    expect(STREET_PLACES.every((p) => p.areaId === p.id) && TOWN_PLACES.every((p) => p.areaId === p.id) && GATE_PLACES.every((p) => p.areaId === p.id)).toBe(true);
    for (const p of [...STREET_PLACES, ...TOWN_PLACES, ...GATE_PLACES]) expect([p.x, p.y, p.r], p.id).toEqual([...LAYOUT[p.id], PLACE_R]);
    expect(STREET_LAND).toEqual({ park: '#b9dc8f', fair: '#e9b7c9', farm: '#e3cf7e', docks: '#b7b9bf', seaside: '#ecdca8', lighthouse: '#cfdad2', greenhouse: '#bfe3b5', treehouse: '#a6cf86' });
    expect(TOWN_LAND).toEqual({ roofs: '#8e9bb0', market: '#d8b48a', house: '#a3876a' });
    expect(Object.keys(GATE_LAND).sort()).toEqual([...GATE_IDS, 'moon'].filter((v, i, a) => a.indexOf(v) === i).sort());
    expect(ISLAND_HIT_R).toBe(46);
  });

  it('every place in the catalog is on the map exactly once; the gate places only when their switch is on and walked', () => {
    const plain = worldMapModel(fresh(), CATALOG);
    expect(plain.regions.map((r) => r.areaId).sort()).toEqual(Object.keys(CATALOG.areas).filter((id) => !['greenhouse', 'treehouse', 'snowville', 'jungle', 'reef', 'crystal', 'moon'].includes(id)).sort());
    const all = worldMapModel(everything(), CATALOG);
    expect(all.regions.map((r) => r.areaId).sort()).toEqual(Object.keys(CATALOG.areas).filter((id) => id !== 'den').sort());
    expect(all.world).toEqual(WORLD);
  });

  it('every place is the same size (within 25%), and the whole world is on the page', () => {
    const m = worldMapModel(everything(), CATALOG);
    const rs = m.regions.map((r) => r.r);
    expect(Math.max(...rs) / Math.min(...rs)).toBeLessThanOrEqual(1.25);
    for (const r of m.regions) {
      expect(r.x - r.r >= 0 && r.x + r.r <= WORLD.w && r.y + r.r <= WORLD.h, r.id).toBe(true);
      // only the Moon stands above the land: up in the sky
      expect(r.y - r.r >= 0 || r.id === 'moon', r.id).toBe(true);
    }
    const view = WORLD_VIEW;
    expect(view.x).toBe(0);
    expect(view.x + view.w).toBeGreaterThanOrEqual(WORLD.w);
    expect(view.y + view.h).toBeGreaterThanOrEqual(WORLD.h);
    expect(view.y).toBeLessThanOrEqual(regionOf(m, 'moon').y - regionOf(m, 'moon').r - 4);
  });

  it('geography: Snowville is in the cold north on the mainland, the Jungle in the warm east on the mainland, the Moon in the sky, the Reef the only place at sea', () => {
    const m = worldMapModel(everything(), CATALOG);
    const at = (id) => regionOf(m, id);
    // everything but the Moon and the Reef stands on land, west of the coast, in clear of it
    for (const r of m.regions) {
      if (r.id === 'moon' || r.id === 'reef') continue;
      expect(r.x + r.r, r.id).toBeLessThan(coastX(r.y) + 20);
    }
    expect(at('reef').x - at('reef').r).toBeGreaterThan(coastX(at('reef').y));
    expect(at('moon').y).toBeLessThan(0);
    expect(at('moon').y + at('moon').r).toBeLessThan(0); // wholly above the land
    // Snowville: the north row, beside the Moor and over the Gorge
    expect(at('snowville').y).toBeLessThan(at('gorge').y);
    expect(at('snowville').y).toBeLessThan(200);
    expect(Math.abs(at('snowville').x - at('moor').x)).toBeLessThan(300);
    // the Jungle lodge: the north-east, with the Greenhouse and the Treehouse village
    expect(at('jungle').x).toBeGreaterThan(at('greenhouse').x);
    expect(Math.abs(at('jungle').y - at('greenhouse').y)).toBeLessThan(120);
    // the Crystal Cave is by the Docks, and the Reef is at sea east of the Seaside
    expect(Math.abs(at('crystal').y - at('docks').y)).toBeLessThan(60);
    expect(at('reef').x).toBeGreaterThan(at('seaside').x);
  });

  it('no two circles overlap, none holds another place, and the Moon beam rises from the Park to the Moon', () => {
    const m = worldMapModel(everything(), CATALOG);
    for (const a of m.regions) for (const b of m.regions) if (a.id < b.id) expect(dist(a.x, a.y, b.x, b.y), `${a.id} / ${b.id}`).toBeGreaterThan(a.r + b.r + 20);
    for (const r of m.regions) expect(dist(r.x, r.y, m.star.x, m.star.y), r.id).toBeGreaterThan(r.r + ISLAND_HIT_R + 4);
    const park = regionOf(m, 'park'), moon = regionOf(m, 'moon');
    expect(dist(MOON_BEAM[0][0], MOON_BEAM[0][1], park.x, park.y)).toBeLessThan(park.r + 40);
    expect(dist(MOON_BEAM[3][0], MOON_BEAM[3][1], moon.x, moon.y)).toBeLessThan(moon.r + 100);
    expect(renderWorldMapHtml(m)).toContain('class="wm-beam"');
    expect(renderWorldMapHtml(worldMapModel(fresh(), CATALOG))).not.toContain('wm-beam');
  });

  it('ten gateways join the places they always joined, each road from the edge of one place to the edge of the other, in the open', () => {
    expect(GATEWAYS.map((g) => [g.id, g.from, g.to])).toEqual([
      ['town-park', 'neighborhood', 'park'], ['park-fair', 'park', 'fair'], ['park-farm', 'park', 'farm'], ['town-docks', 'neighborhood', 'docks'],
      ['docks-seaside', 'docks', 'seaside'], ['town-roofs', 'neighborhood', 'roofs'], ['town-market', 'neighborhood', 'market'],
      ['seaside-lighthouse', 'seaside', 'lighthouse'], ['town-house', 'neighborhood', 'house'], ['farm-treehouse', 'farm', 'treehouse']]);
    const m = worldMapModel(everything(), CATALOG);
    const html = renderWorldMapHtml(m);
    const at = (areaId) => m.regions.find((r) => r.areaId === areaId);
    const rows = Object.fromEntries(m.regions.map((r) => [r.id, rowsOf(html, r.id)]));
    for (const g of GATEWAYS) {
      const [a, b] = [at(g.from), at(g.to)];
      const [p0, , , p3] = g.road;
      // each end is at its place: on or just outside its circle, no further than its words reach
      expect(dist(p0[0], p0[1], a.x, a.y), `${g.id} start`).toBeLessThan(a.r + 70);
      expect(dist(p3[0], p3[1], b.x, b.y), `${g.id} end`).toBeLessThan(b.r + 70);
      expect(dist(p0[0], p0[1], b.x, b.y), `${g.id} start is nearer its own`).toBeGreaterThan(dist(p0[0], p0[1], a.x, a.y));
      // the road touches no other place's words, nor the island's star, and stays on land
      for (let i = 0; i <= 24; i++) {
        const [x, y] = roadAt(g.road, i / 24);
        expect(x, `${g.id} on land`).toBeLessThan(coastX(y) - 8);
        for (const o of m.regions) {
          if (o === a || o === b) continue;
          for (const q of rows[o.id]) expect(near(q, x, y), `${g.id} / ${o.id} "${q.words}" at ${i}`).toBeGreaterThan(4);
        }
      }
    }
    expect((html.match(/class="wm-road"/g) || []).length).toBe(10);
    expect((html.match(/class="wm-gate"/g) || []).length).toBe(10);
    // the Park, Fairground, Farm and Seaside are entered from their south side, as their walks are
    for (const id of ['park-fair', 'park-farm', 'docks-seaside', 'seaside-lighthouse']) {
      const g = GATEWAYS.find((x) => x.id === id), to = at(g.to), p3 = g.road[3];
      expect(p3[1], id).toBeGreaterThan(to.y); // the end is on the south half of the place it enters
    }
  });

  it('a street place shows its state in the words of its card', () => {
    const park = (s) => regionOf(worldMapModel(s, CATALOG), 'park');
    let s = fresh();
    expect(park(s)).toMatchObject({ kind: 'street', status: 'built', camp: null, name: 'City Park', locked: true, canOpen: false, owned: false });
    expect(park(s).line).toBe('opens after you explore Twolegplace 2 times · 0/2');
    s.walks.neighborhood = 2; s.points = 10;
    expect(park(s)).toMatchObject({ locked: false, canOpen: false, price: 50, line: '50 🐾 — keep exploring!' });
    s.points = 50;
    expect(park(s)).toMatchObject({ canOpen: true, line: 'Open for 50 🐾' });
    s.unlocked.areas.push('park');
    expect(park(s)).toMatchObject({ owned: true, line: 'click to go here' });
    s.area = 'park';
    expect(park(s)).toMatchObject({ owned: true, selected: true, line: 'you’re going here' });
    expect(regionOf(worldMapModel(fresh(), CATALOG), 'seaside').line).toBe('opens after you explore the Old Docks 2 times · 0/2');
    expect(placeState(fresh(), CATALOG, 'rooftops')).toEqual({ owned: false, selected: false, locked: false, canOpen: false, price: 0, line: 'coming soon', mapLine: 'coming soon' });
    const woods = regionOf(worldMapModel({ ...fresh(), walks: { neighborhood: 2 } }, CATALOG), 'woods');
    expect(woods).toMatchObject({ kind: 'board', price: 0, locked: false, canOpen: true, line: 'Click to explore' });
  });

  it('a locked place says it in one short line on the map, the full line with its counter elsewhere', () => {
    const req = { area: 'neighborhood', walks: 2 };
    const place = opensAfterLine(req, 0, 'canon', CATALOG).match(/^opens after you explore (.*?) 2 times/)[1];
    expect(shortLockLine(req, 0, 'canon', CATALOG)).toBe(`explore ${place} 2 more times`);
    expect(shortLockLine(req, 1, 'canon', CATALOG)).toBe(`explore ${place} once more`);
    const html = renderWorldMapHtml(worldMapModel(fresh(), CATALOG));
    const label = regionHtml(html, 'park').match(/<text class="tm-label[\s\S]*?<\/text>/)[0];
    expect(label).toContain('explore Twolegplace');
    expect(label).not.toContain('0/2');
    expect(regionHtml(html, 'park')).toContain('aria-label="City Park: opens after you explore Twolegplace 2 times · 0/2"');
  });

  it('the town is Peopleville in the everyday words', () => {
    withOffWords(() => expect(worldMapModel(fresh(), CATALOG).regions.find((r) => r.id === 'town').name).toBe('Peopleville'));
  });

  it('tap targets: every place and the island, the island the smallest at 92 across', () => {
    const t = tapTargets(worldMapModel(fresh(), CATALOG));
    expect(t).toHaveLength(16);
    expect(t.at(-1)).toEqual({ areaId: 'pines', x: 455, y: 314, r: 46 });
    expect(Math.min(...t.map((x) => 2 * x.r))).toBe(92);
    expect(t.slice(0, -1).every((x) => x.r === PLACE_R)).toBe(true);
  });

  it("focusOf is today's place, else the town", () => {
    expect(focusOf(worldMapModel({ ...fresh(), unlocked: { areas: ['neighborhood', 'docks'] }, area: 'docks' }, CATALOG))).toEqual(LAYOUT.docks);
    expect(focusOf(worldMapModel(fresh(), CATALOG))).toEqual(LAYOUT.town);
  });
});

describe('the continent: a patch of land for every place', () => {
  const sites = (m) => m.regions.filter((r) => r.id !== 'reef' && r.id !== 'moon');
  it('every land place has its own patch, and each place stands inside its own', () => {
    const m = worldMapModel(everything(), CATALOG);
    const patches = landPatches(sites(m));
    expect(Object.keys(patches).sort()).toEqual(sites(m).map((r) => r.id).sort());
    for (const d of Object.values(patches)) expect(d).toMatch(/^M[-\d. ]+( L[-\d. ]+)+ Z$/);
  });
  it('a border is the same line from either side, so neighbours leave no gap', () => {
    const a = landPatches([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 300, y: 80 }]);
    const edge = (d) => d.slice(1, -2).split(' L').map((p) => p.split(' ').map(Number));
    const [pa, pb] = [edge(a.a), edge(a.b)];
    const shared = pa.filter((p) => pb.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.11));
    expect(shared.length).toBeGreaterThan(4); // the whole border, bent a little by hand, drawn by both
  });
  it('with one place, it is the whole mainland', () => {
    expect(Object.keys(landPatches([{ id: 'only', x: 100, y: 100 }]))).toEqual(['only']);
  });
});

describe('drawing the world', () => {
  const draw = (s, catalog = CATALOG) => renderWorldMapHtml(worldMapModel(s, catalog));
  const html = draw(fresh());
  const pick = (mine, partner = null) => ({ ...fresh(), clanPick: { mine, partner, partnerId: partner ? 'p1' : null }, colony: { partner: partner ? { playerId: 'p1' } : null } });

  it('one SVG, labelled, the whole world and the sky above it', () => {
    expect(html.startsWith(`<svg viewBox="${WORLD_VIEW.x} ${WORLD_VIEW.y} ${WORLD_VIEW.w} ${WORLD_VIEW.h}" class="territory-map world-map" role="group" aria-label="Map of the world"`)).toBe(true);
    expect(html).toContain('<rect class="tm-paper" x="-6000" y="-6000"');
    expect(html).toContain('<path class="tm-sea" d="M1850 -6000 L1850 -60 C');
    expect(html).toContain('class="wm-sky"');
    expect(html.endsWith('</svg>')).toBe(true);
    expect(html).not.toContain('role="img"');
    expect(html).not.toContain('wm-country'); // (the old patchwork of fields is gone: the places are the ground)
  });

  it('layers, bottom to top: paper, sea, continent, sky, water, paths, roads, places, island', () => {
    const order = ['tm-paper', 'tm-sea', 'wm-continent', 'wm-sky', 'tm-water', 'tm-paths', 'wm-roads', 'data-region="town"', 'data-region="seaside"', 'data-region="island"']
      .map((c) => html.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain('tm-frame');
  });

  it('every place is a labelled keyboard button that opens its card, and its patch is what a tap lands on', () => {
    const ids = [...html.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id);
    expect(new Set(ids).size).toBe(15);
    expect(ids).toHaveLength(16);
    expect(html).not.toContain('data-dr-place=');
    expect(regionHtml(html, 'park')).toMatch(/role="button" tabindex="0" aria-label="City Park: opens after you explore Twolegplace 2 times · 0\/2"/);
    expect(regionHtml(html, 'park')).toContain(`data-x="${LAYOUT.park[0]}" data-y="${LAYOUT.park[1]}"`);
    expect(regionHtml(html, 'town')).toContain(`data-dr-map-place="neighborhood" data-x="${LAYOUT.town[0]}" data-y="${LAYOUT.town[1]}" role="button" tabindex="0" aria-label="Twolegplace: `);
    expect(regionHtml(html, 'island')).toContain('<circle class="tm-hit" cx="455" cy="314" r="46"/>');
    expect(regionHtml(html, 'island')).toContain(`data-dr-map-place="pines" data-x="455" data-y="314" role="button" tabindex="0" aria-label="The island, ${ISLAND_WHERE}: `);
    for (const id of ['town', 'woods', 'moor', 'river', 'pines', 'gorge', 'park', 'fair', 'farm', 'docks', 'seaside', 'island']) {
      expect(tagAt(html, `data-region="${id}"`), id).toMatch(/ role="button" tabindex="0" aria-label="[^"]+"/);
      expect(regionHtml(html, id), id).toContain('class="tm-hit"');
    }
    // a land place's tap area is its patch, held to the coast; the Reef's and the Moon's are their own shapes
    expect(tagAt(regionHtml(html, 'park'), 'class="tm-hit"')).toContain('clip-path="url(#wm-land)"');
    const all = renderWorldMapHtml(worldMapModel(everything(), CATALOG));
    expect(tagAt(regionHtml(all, 'reef'), 'class="tm-hit"')).not.toContain('clip-path');
    expect(tagAt(regionHtml(all, 'moon'), 'class="tm-hit"')).not.toContain('clip-path');
    expect(html.match(/<g class="tm-region[^>]*>(?=<title>)/)).toBeNull();
  });

  it('her paths and bridge are drawn over the land, ten roads and ten gate marks', () => {
    expect((html.match(/class="tm-path"/g) || []).length).toBe(3);
    expect(html).toContain('class="tm-bridge"');
    for (const cls of ['tm-lake', 'tm-island', 'tm-star', 'tm-pond', 'tm-river']) expect(html).toContain(`class="${cls}`);
    const [p0, p1, p2, p3] = GATEWAYS[0].road;
    expect(html).toContain(`<path class="wm-road" d="M${p0.join(' ')} C${p1.join(' ')} ${p2.join(' ')} ${p3.join(' ')}"/><circle class="wm-gate" cx="${p3[0]}" cy="${p3[1]}" r="8"/>`);
  });

  it('locked, today and owned look different; places carry their lock and price', () => {
    expect(tagAt(html, 'data-region="park"')).toMatch(/class="tm-region [^"]*\blocked\b/);
    expect(regionHtml(html, 'park')).toContain('>🔒 City Park</tspan>');
    let s = fresh(); s.walks.neighborhood = 2; s.points = 50;
    expect(regionHtml(draw(s), 'park')).toContain('>Open for 50 🐾</tspan>');
    expect(regionHtml(draw(s), 'park')).not.toContain('🔒');
    s = fresh(); s.unlocked.areas.push('park'); s.area = 'park';
    const park = tagAt(draw(s), 'data-region="park"');
    expect(park).toMatch(/class="tm-region [^"]*\bsel\b/);
    expect(park).not.toMatch(/\blocked\b/);
    expect(tagAt(html, 'data-region="woods"')).toMatch(/class="tm-region built locked"/);
    expect(tagAt(html, 'data-region="town"')).toMatch(/class="tm-region built sel"/);
    for (const [id, fill] of Object.entries(STREET_LAND).filter(([id]) => id !== 'greenhouse' && id !== 'treehouse')) {
      expect(html, id).toMatch(new RegExp(`<path class="tm-land street wm-cell built locked" fill="${fill}" d="M`));
    }
    expect(html).toContain(`<path class="tm-land wm-cell built locked" fill="${LAND.woods}" d="M`);
    expect((html.match(/class="tm-land /g) || []).length).toBe(15);
  });

  it('the Reef reads as underwater (a scalloped patch of deep water with bubbles), the Moon as a rock in the sky', () => {
    const all = renderWorldMapHtml(worldMapModel(everything(), CATALOG));
    expect(all).toContain(`class="tm-land street wm-afar built locked" fill="${GATE_LAND.reef}"`);
    expect(all).toContain('class="wm-bubbles"');
    expect(all).toContain(`class="tm-land street wm-afar built locked" fill="${GATE_LAND.moon}"`);
    expect(all).toContain('🐠');
    expect(all).toContain('🌙');
    // no other place is drawn apart from the mainland: only those two are 'afar'
    expect((all.match(/wm-afar/g) || []).length).toBe(2);
    expect(html).not.toContain('wm-bubbles');
  });

  it('camps only on her board, only in Clan Edition, at the corner of their place beside the icon', () => {
    const h = draw(pick('woods'));
    expect(regionHtml(h, 'woods')).toContain('tm-camp mine');
    expect(regionHtml(h, 'woods').indexOf('tm-hit')).toBeLessThan(regionHtml(h, 'woods').indexOf('tm-camp'));
    expect(regionHtml(h, 'woods')).toMatch(/<title>[^<]+ camp<\/title>/);
    for (const id of ['park', 'fair', 'farm', 'docks', 'seaside', 'town', 'island']) expect(regionHtml(h, id), id).not.toContain('tm-camp');
    expect(draw({ ...pick('woods'), edition: 'legacy' })).not.toContain('tm-camp');
  });

  it("a camp's mark clears every place's words but its own icon's row, and every other camp, in every pick", () => {
    for (const s of [pick('woods', 'moor'), pick('moor', 'river'), pick('pines', 'gorge'), pick('river', 'woods')]) {
      const m = worldMapModel(s, CATALOG);
      const h = renderWorldMapHtml(m);
      const camps = m.regions.filter((r) => r.camp).map((r) => ({ id: r.id, ...(() => {
        const g = regionHtml(h, r.id).match(/class="tm-camp-badge" cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/);
        return { x: Number(g[1]), y: Number(g[2]), r: Number(g[3]) };
      })() }));
      expect(camps.length).toBeGreaterThan(0);
      for (const c of camps) {
        for (const o of m.regions) for (const q of rowsOf(h, o.id)) {
          if (o.id === c.id && q.words.length <= 3) continue; // (its own icon, in the same row)
          expect(near(q, c.x, c.y), `camp of ${c.id} / ${o.id} "${q.words}"`).toBeGreaterThan(c.r + 1);
        }
        for (const o of camps) if (o !== c) expect(dist(c.x, c.y, o.x, o.y)).toBeGreaterThan(80);
        const owner = regionOf(m, c.id);
        expect(dist(c.x, c.y, owner.x, owner.y), c.id).toBeLessThan(owner.r + 40);
        // the icon and the camp share the row, side by side
        const icon = regionHtml(h, c.id).match(/class="tm-icon" x="([-\d.]+)"/)[1];
        expect(Number(icon)).toBeLessThan(c.x - 40);
      }
    }
  });

  it('every place is there in the everyday words, the camp a home base', () => {
    withOffWords(() => {
      const h = draw(pick('woods'));
      expect(new Set([...h.matchAll(/data-dr-map-place="([a-z]+)"/g)].map(([, id]) => id)).size).toBe(15);
      expect(regionHtml(h, 'town')).toContain('aria-label="Peopleville: ');
      expect(regionHtml(h, 'woods')).toMatch(/<title>[^<]* home base<\/title>/);
    });
  });

  it('every place gets the same words: the same sizes for her old places and the street places alike', () => {
    for (const id of ['town', 'woods', 'moor', 'river', 'pines', 'gorge', 'park', 'fair', 'farm', 'docks', 'seaside', 'roofs', 'market', 'house']) {
      expect(regionHtml(html, id), id).toContain('font-size="36"');
      expect(regionHtml(html, id), id).toContain('class="tm-line tm-line-small"');
      expect(regionHtml(html, id), id).not.toMatch(/font-size="(44|28|26)"/);
    }
    expect(regionHtml(html, 'woods')).toContain(`<tspan class="tm-icon" x="${LAYOUT.woods[0] - 32}" dy="0">🌳</tspan>`);
    expect(regionHtml(html, 'docks')).toContain(`<tspan class="tm-icon" x="${LAYOUT.docks[0]}" dy="0">⚓</tspan>`);
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

describe('names never overlap, in every state, both word sets', () => {
  const states = () => {
    const base = everything();
    const open = { ...base, points: 9999, walks: Object.fromEntries(Object.keys(CATALOG.areas).map((k) => [k, 5])), unlocked: { ...base.unlocked, areas: Object.keys(CATALOG.areas) } };
    const priced = { ...base, points: 120, walks: Object.fromEntries(Object.keys(CATALOG.areas).map((k) => [k, 2])) };
    return [['locked', base], ['open and owned', open], ['priced', priced], ['today', { ...open, area: 'docks' }], ['clan', { ...open, clanPick: { mine: 'woods', partner: 'moor', partnerId: 'p1' }, colony: { partner: { playerId: 'p1' } } }]];
  };
  for (const touch of [false, true]) {
    it(`no row of one place's words touches another's, or another place's circle, touch ${touch}`, () => {
      for (const [name, s] of states()) {
        for (const off of [false, true]) {
          const run = () => {
            const m = worldMapModel(s, CATALOG, { touch });
            const html = renderWorldMapHtml(m);
            const rows = Object.fromEntries(m.regions.map((r) => [r.id, rowsOf(html, r.id)]));
            const ids = m.regions.map((r) => r.id);
            for (const a of ids) {
              for (const o of m.regions) {
                if (o.id === a) continue;
                for (const q of rows[a]) {
                  expect(near(q, o.x, o.y), `${name} ${a} "${q.words}" / circle ${o.id}`).toBeGreaterThan(o.r - 30);
                  if (o.id > a) for (const p of rows[o.id]) expect(gap(q, p), `${name} ${a} "${q.words}" / ${o.id} "${p.words}"`).toBeGreaterThan(4);
                }
              }
              // the island's words sit clear of every place's too
              for (const q of rows[a]) {
                expect(near(q, ISLAND_WORDS_AT[0], ISLAND_WORDS_AT[1]), `${a} "${q.words}" / island name`).toBeGreaterThan(40);
                expect(near(q, ISLAND_WORDS_AT[0], ISLAND_WORDS_AT[1] + 36), `${a} "${q.words}" / island line`).toBeGreaterThan(40);
              }
            }
          };
          if (off) withOffWords(run); else run();
        }
      }
    });
  }
});

// Their places and the unlock facts, as they always were.
describe('world map: places whose card, price and unlock are unchanged', () => {
  const has = (areas, extra = {}) => ({ ...fresh(), ...extra, unlocked: { ...fresh().unlocked, areas: ['neighborhood', ...areas] } });
  it('the Rooftops: 100 paws after 2 Fairground walks', () => {
    const roofs = regionOf(worldMapModel(fresh(), CATALOG), 'roofs');
    expect(roofs).toMatchObject({ kind: 'town', areaId: 'roofs', name: 'The Rooftops', status: 'built', camp: null, locked: true, owned: false, price: 100 });
    const early = worldMapModel({ ...fresh(), points: 500, walks: { ...fresh().walks, fair: 1 } }, CATALOG);
    expect(placeCardFor(early, 'roofs', 500)).toMatchObject({ id: 'roofs', action: null, locked: true });
    expect(placeCardFor(early, 'roofs', 500).line).toContain('1/2');
    const open = worldMapModel({ ...fresh(), points: 100, walks: { ...fresh().walks, fair: 2 } }, CATALOG);
    expect(placeCardFor(open, 'roofs', 100)).toMatchObject({ action: 'open', label: 'Open for 100 🐾', locked: false });
    expect(placeCardFor(worldMapModel(has(['fair', 'roofs']), CATALOG), 'roofs', 0)).toMatchObject({ action: 'go', label: 'Go here' });
    expect(regionHtml(renderWorldMapHtml(worldMapModel(fresh(), CATALOG)), 'roofs')).toContain('🕊️');
  });
  it('the Market: 150 paws after 2 town walks; the Old House: 150 paws after 2 Market walks', () => {
    const open = worldMapModel({ ...fresh(), points: 150, walks: { ...fresh().walks, neighborhood: 2 } }, CATALOG);
    expect(placeCardFor(open, 'market', 150)).toMatchObject({ name: 'The Market Square', action: 'open', label: 'Open for 150 🐾' });
    const early = worldMapModel({ ...fresh(), points: 500, walks: { ...fresh().walks, neighborhood: 1 } }, CATALOG);
    expect(placeCardFor(early, 'market', 500)).toMatchObject({ action: null, locked: true });
    const inMarket = (n, extra) => ({ ...fresh(), ...extra, walks: { ...fresh().walks, market: n }, unlocked: { ...fresh().unlocked, areas: ['neighborhood', 'market'] } });
    expect(placeCardFor(worldMapModel(inMarket(1, { points: 500 }), CATALOG), 'house', 500)).toMatchObject({ id: 'house', name: 'The Old Twoleg Nest', action: null, locked: true });
    expect(placeCardFor(worldMapModel(inMarket(2, { points: 150 }), CATALOG), 'house', 150)).toMatchObject({ action: 'open', label: 'Open for 150 🐾' });
    withOffWords(() => expect(placeCardFor(worldMapModel(inMarket(1), CATALOG), 'house', 0).name).toBe('The Old House'));
    expect(regionOf(worldMapModel({ ...fresh(), edition: 'legacy' }, CATALOG), 'house')).toBeUndefined();
  });
  it('Lighthouse Point: 150 paws after 2 Seaside walks, in either edition', () => {
    const s = fresh();
    const base = { ...s, points: 150, unlocked: { ...s.unlocked, areas: [...s.unlocked.areas, 'seaside'] } };
    expect(regionOf(worldMapModel(fresh(), CATALOG), 'lighthouse')).toMatchObject({ kind: 'street', name: 'Lighthouse Point', price: 150, locked: true });
    expect(placeCardFor(worldMapModel({ ...base, walks: { ...s.walks, seaside: 1 } }, CATALOG), 'lighthouse', 150)).toMatchObject({ action: null, locked: true });
    expect(placeCardFor(worldMapModel({ ...base, walks: { ...s.walks, seaside: 2 } }, CATALOG), 'lighthouse', 150)).toMatchObject({ action: 'open', label: 'Open for 150 🐾' });
    for (const edition of ['canon', 'legacy']) expect(regionOf(worldMapModel({ ...base, edition }, CATALOG), 'lighthouse'), edition).toBeTruthy();
  });
  it('the Greenhouse shows only while the gates switch is on, is free after 2 Park walks, and is in both editions', () => {
    setTele(false);
    const off = worldMapModel(fresh(), CATALOG);
    expect(regionOf(off, 'greenhouse')).toBeUndefined();
    expect(tapTargets(off).some((t) => t.areaId === 'greenhouse')).toBe(false);
    expect(renderWorldMapHtml(off)).not.toContain('greenhouse');
    setTele(true);
    expect(regionOf(worldMapModel(fresh(), CATALOG), 'greenhouse')).toMatchObject({ kind: 'street', name: 'The Greenhouse', status: 'built' });
    for (const edition of ['canon', 'legacy']) expect(regionOf(worldMapModel({ ...fresh(), edition }, CATALOG), 'greenhouse'), edition).toBeTruthy();
    const walked = (n) => ({ ...fresh(), walks: { ...fresh().walks, park: n }, unlocked: { ...fresh().unlocked, areas: ['neighborhood', 'park'] } });
    expect(regionOf(worldMapModel(walked(1), CATALOG), 'greenhouse')).toMatchObject({ locked: true, price: 0 });
    expect(regionOf(worldMapModel(walked(2), CATALOG), 'greenhouse')).toMatchObject({ locked: false, price: 0 });
  });
  it('the Treehouse village shows only while its switch is on, and is free after 2 Farm walks', () => {
    setTreehouse(false);
    const off = worldMapModel(fresh(), CATALOG);
    expect(regionOf(off, 'treehouse')).toBeUndefined();
    expect(renderWorldMapHtml(off)).not.toContain('treehouse');
    setTreehouse(true);
    expect(regionOf(worldMapModel(fresh(), CATALOG), 'treehouse')).toMatchObject({ kind: 'street', name: 'Treehouse Village', status: 'built' });
    const walked = (n) => ({ ...fresh(), walks: { ...fresh().walks, farm: n }, unlocked: { ...fresh().unlocked, areas: ['neighborhood', 'farm'] } });
    expect(regionOf(worldMapModel(walked(1), CATALOG), 'treehouse')).toMatchObject({ locked: true, price: 0 });
    expect(regionOf(worldMapModel(walked(2), CATALOG), 'treehouse')).toMatchObject({ locked: false, price: 0 });
  });
  it('a tap on a place picks it: every circle is the topmost under its own centre', () => {
    const t = tapTargets(worldMapModel(everything(), CATALOG));
    const hit = (x, y) => [...t].reverse().find((q) => dist(q.x, q.y, x, y) <= q.r);
    for (const q of t) expect(hit(q.x, q.y).areaId).toBe(q.areaId);
  });
});
