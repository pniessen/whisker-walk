// Interconnectivity I1: map circles for the Reef and the Crystal Cave, drawn only once she has walked them.
// The Moon has no catalog row yet, so it has no circle (a later milestone).
import { describe, it, expect, afterEach } from 'vitest';
import { setTele } from '../src/teleflag.js';
import { setJungle } from '../src/jungleflag.js';
import { CATALOG } from '../src/progression.js';
import { WORLD, GATE_PLACES, GATE_LAND, COAST, GATEWAYS, ISLAND_HIT_R, worldMapModel, tapTargets } from '../src/worldmap.js';
import { renderWorldMapHtml } from '../src/ui/territorymap.js';
import { minScaleFor, MIN_TARGET_PX } from '../src/ui/mappan.js';
import { placeCardFor } from '../src/ui/placecard.js';
import { withOffWords } from './helpers/offwords.js';
import { pickNext } from '../src/gamepadnavcore.js';

const save = (walks = {}, edition = 'canon') => ({
  edition, points: 0,
  walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0, reef: 0, crystal: 0, moon: 0, ...walks },
  unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'park', 'docks', 'seaside', 'reef', 'crystal', 'moon'] },
  equipped: { cat: 'tabby' }, area: 'neighborhood',
});
const find = (m, id) => m.regions.find((r) => r.id === id);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
afterEach(() => { setTele(null); setJungle(null); });

// Each row of a place's label boxed from its baseline, as test/worldmap.test.js (Chalkboard SE widths, an unlisted glyph 0.8 em).
const EM = { a: 0.56, b: 0.58, c: 0.51, d: 0.6, e: 0.55, f: 0.45, g: 0.55, h: 0.57, i: 0.27, j: 0.41, k: 0.55, l: 0.32, m: 0.76, n: 0.53, o: 0.51, p: 0.55, q: 0.54, r: 0.46, s: 0.45, t: 0.48, u: 0.55, v: 0.49, w: 0.74, x: 0.58, y: 0.56, z: 0.56,
  A: 0.67, B: 0.59, C: 0.61, D: 0.66, E: 0.57, F: 0.52, G: 0.69, H: 0.64, I: 0.47, J: 0.57, K: 0.61, L: 0.54, M: 0.85, N: 0.68, O: 0.75, P: 0.6, Q: 0.78, R: 0.65, S: 0.61, T: 0.59, U: 0.68, V: 0.67, W: 1.01, X: 0.68, Y: 0.61, Z: 0.68,
  ' ': 0.41, "'": 0.24, '’': 0.3, '.': 0.34, ',': 0.3, ':': 0.33, '!': 0.3, '—': 0.68, '-': 0.52, '·': 0.38, '/': 0.59 };
const em = (ch) => (/\p{Extended_Pictographic}/u.test(ch) ? 1.1 : /[0-9]/.test(ch) ? 0.61 : EM[ch] ?? 0.8);
const SIZE = { 'tm-icon': 34, 'tm-line': 28, 'tm-line tm-line-small': 24 };
function rowsOf(html, id) {
  const start = html.indexOf(`data-region="${id}"`);
  const next = html.indexOf('data-region="', start + 1);
  const g = html.slice(html.lastIndexOf('<g', start), next === -1 ? undefined : html.lastIndexOf('<g', next));
  const text = g.match(/<text class="tm-label" x="[-\d.]+" y="([-\d.]+)"[^>]*>([\s\S]*?)<\/text>/);
  let y = Number(text[1]);
  const rows = [];
  for (const [, cls, x, dy, fs, words] of text[2].matchAll(/<tspan class="([^"]+)" x="([-\d.]+)" dy="([-\d.]+)"(?: font-size="(\d+)")?>([^<]*)<\/tspan>/g)) {
    y += Number(dy);
    const size = fs ? Number(fs) : SIZE[cls];
    const w = [...words.replace(/&[a-z#0-9]+;/g, 'x').replace(/️/g, '')].reduce((sum, ch) => sum + em(ch) * size, 0);
    if (w > 0) rows.push({ words, x0: Number(x) - w / 2, x1: Number(x) + w / 2, y0: y - 0.8 * size, y1: y + 0.25 * size });
  }
  return rows;
}
const gap = (a, b) => Math.max(b.x0 - a.x1, a.x0 - b.x1, b.y0 - a.y1, a.y0 - b.y1);

describe('world map: gate place circles (I1)', () => {
  it('a circle shows only once she has walked the place', () => {
    setTele(true);
    for (const id of ['reef', 'crystal', 'moon']) {
      expect(find(worldMapModel(save(), CATALOG), id), `${id} unwalked`).toBeUndefined();
      expect(find(worldMapModel(save({ [id]: 1 }), CATALOG), id), `${id} walked`).toMatchObject({ kind: 'gate', areaId: id, owned: true });
      expect(find(worldMapModel(save({ [id]: 5 }), CATALOG), id)).toBeTruthy();
    }
    // one does not give the other away
    const m = worldMapModel(save({ reef: 1 }), CATALOG);
    expect(find(m, 'reef') && !find(m, 'crystal')).toBeTruthy();
    // a save with no walks table at all draws neither
    const bare = save(); delete bare.walks;
    expect(worldMapModel(bare, CATALOG).regions.some((r) => r.kind === 'gate')).toBe(false);
  });

  it('nothing is drawn or tappable for an unwalked place, nor while the gates switch is off', () => {
    setTele(true);
    const m = worldMapModel(save(), CATALOG);
    expect(tapTargets(m).some((t) => t.areaId === 'reef' || t.areaId === 'crystal')).toBe(false);
    expect(renderWorldMapHtml(m)).not.toMatch(/reef|crystal|moon/i);
    setTele(false);
    const off = worldMapModel(save({ reef: 3, crystal: 3, moon: 3 }), CATALOG);
    expect(off.regions.some((r) => r.kind === 'gate')).toBe(false);
  });

  it('both editions, both word sets', () => {
    setTele(true);
    for (const edition of ['canon', 'legacy']) {
      const m = worldMapModel(save({ reef: 1, crystal: 1, moon: 1 }, edition), CATALOG);
      expect(find(m, 'reef').name, edition).toBe('The Reef');
      expect(find(m, 'crystal').name, edition).toBe('The Crystal Cave');
      expect(find(m, 'moon').name, edition).toBe('The Moon');
    }
    withOffWords(() => {
      const html = renderWorldMapHtml(worldMapModel(save({ reef: 1, crystal: 1, moon: 1 }), CATALOG));
      expect(html).toContain('The Reef');
      expect(html).toContain('The Crystal Cave');
      expect(html).toContain('The Moon');
    });
  });

  it('placement: inside the world, every circle at least 46 (92 across), clear of every other circle, the star and the roads (the Jungle lodge\'s too, with its switch on)', () => {
    setTele(true); setJungle(true);
    const m = worldMapModel(save({ reef: 1, crystal: 1, moon: 1, jungle: 1 }), CATALOG);
    for (const p of GATE_PLACES) {
      const me = find(m, p.id);
      expect(me.r).toBeGreaterThanOrEqual(46);
      expect(me.x - me.r >= 0 && me.y - me.r >= 0 && me.x + me.r <= WORLD.w && me.y + me.r <= WORLD.h, p.id).toBe(true);
      for (const o of m.regions) if (o !== me) expect(dist(me.x, me.y, o.x, o.y), `${p.id} / ${o.id}`).toBeGreaterThan(me.r + o.r + 20);
      expect(dist(me.x, me.y, m.star.x, m.star.y)).toBeGreaterThan(me.r + ISLAND_HIT_R);
      expect(GATEWAYS.some((g) => g.from === p.id || g.to === p.id)).toBe(false);
      for (const g of GATEWAYS) for (const [rx, ry] of g.road) expect(dist(me.x, me.y, rx, ry), `${p.id} / road ${g.id}`).toBeGreaterThan(me.r + 10);
    }
  });

  it('the Jungle lodge: no circle until its switch is on AND she has walked it; then one, east of the Greenhouse, with its own land and the palm icon', () => {
    setTele(true);
    expect(find(worldMapModel(save({ jungle: 3 }), CATALOG), 'jungle')).toBeUndefined(); // (the switch is off)
    setJungle(true);
    expect(find(worldMapModel(save({ jungle: 0 }), CATALOG), 'jungle')).toBeUndefined(); // (never walked)
    const j = find(worldMapModel(save({ jungle: 1 }), CATALOG), 'jungle');
    expect(j).toMatchObject({ x: 1395, y: 150, r: 46, areaId: 'jungle' });
    expect(GATE_LAND.jungle).toBeTruthy();
    const html = renderWorldMapHtml(worldMapModel(save({ jungle: 1 }), CATALOG));
    expect(html).toContain('data-dr-map-place="jungle" data-x="1395" data-y="150"');
    expect(html).toContain('🌴');
    setTele(false);
    expect(find(worldMapModel(save({ jungle: 1 }), CATALOG), 'jungle')).toBeUndefined(); // (the gates switch is off)
  });

  it('the Reef is out in the sea, east of the whole coast; the Crystal Cave is by the Docks', () => {
    const [reef, crystal, moon] = GATE_PLACES;
    expect(moon.y - moon.r).toBeLessThan(40); // the Moon is in the top margin
    for (const [px] of COAST) expect(px, 'coast').toBeLessThan(reef.x - reef.r);
    const docks = { x: 900, y: 770 };
    expect(dist(crystal.x, crystal.y, docks.x, docks.y)).toBeLessThan(220);
  });

  it('hit targets: never under 44 px at the zoom-out floor, and the floor does not move', () => {
    setTele(true);
    const t = tapTargets(worldMapModel(save({ reef: 1, crystal: 1, moon: 1 }), CATALOG));
    expect(t).toHaveLength(tapTargets(worldMapModel(save(), CATALOG)).length + 3);
    expect(Math.min(...t.map((x) => 2 * x.r))).toBe(92);
    const floor = minScaleFor(t);
    for (const x of t) expect(2 * x.r * floor).toBeGreaterThanOrEqual(MIN_TARGET_PX - 1e-9);
    expect(GATE_LAND.reef && GATE_LAND.crystal).toBeTruthy();
  });

  it('markup: a labelled button with its own land, icon and anchor', () => {
    setTele(true);
    const html = renderWorldMapHtml(worldMapModel(save({ reef: 1, crystal: 1, moon: 1 }), CATALOG));
    expect(html).toContain('data-dr-map-place="reef" data-x="1415" data-y="690"');
    expect(html).toContain('data-dr-map-place="crystal" data-x="710" data-y="810"');
    expect(html).toContain('fill="#9fd6dc"');
    expect(html).toContain('fill="#d9c4ec"');
  });

  it('a tap gives the normal place card, and "Go" starts the place (no purchase for a free place)', () => {
    setTele(true);
    const s = save({ reef: 1, crystal: 1, moon: 1 });
    const m = worldMapModel(s, CATALOG);
    for (const id of ['reef', 'crystal', 'moon']) {
      const card = placeCardFor(m, id);
      expect(card, id).toBeTruthy();
      expect(JSON.stringify(card)).not.toMatch(/Get it\?/);
      expect(JSON.stringify(card)).toMatch(/go|Go/);
    }
  });

  it('pad hops reach both circles from the town and back', () => {
    setTele(true);
    const m = worldMapModel(save({ reef: 1, crystal: 1, moon: 1 }), CATALOG);
    const boxes = [
      ...m.regions.map((r) => ({ id: r.id, rect: { x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r } })),
      { id: 'island', rect: { x: m.star.x - ISLAND_HIT_R, y: m.star.y - ISLAND_HIT_R, w: 2 * ISLAND_HIT_R, h: 2 * ISLAND_HIT_R } },
    ];
    const reach = (from) => {
      const seen = new Set([from]); const q = [from];
      while (q.length) {
        const id = q.shift();
        for (const d of ['up', 'down', 'left', 'right']) {
          const n = pickNext(boxes.find((b) => b.id === id).rect, boxes.filter((b) => b.id !== id).map((b) => ({ ...b })), d);
          if (n && !seen.has(n)) { seen.add(n); q.push(n); }
        }
      }
      return seen;
    };
    for (const b of boxes) expect(reach(b.id).size, b.id).toBe(boxes.length);
  });

  it('the words of each circle stay in the world and clear every other place\'s words and circle, in both word sets and both states', () => {
    setTele(true);
    const check = () => {
      for (const walks of [{ reef: 1, crystal: 1, moon: 1 }, { reef: 1, crystal: 1, moon: 1, seaside: 2, docks: 2 }]) {
        const s = save(walks);
        s.area = 'reef';
        const m = worldMapModel(s, CATALOG);
        const html = renderWorldMapHtml(m);
        for (const id of ['reef', 'crystal', 'moon']) {
          const me = find(m, id);
          for (const a of rowsOf(html, id)) {
            expect(a.x0, `${id} ${a.words}`).toBeGreaterThanOrEqual(0);
            expect(a.x1, `${id} ${a.words}`).toBeLessThanOrEqual(WORLD.w);
            expect(a.y1, `${id} ${a.words}`).toBeLessThanOrEqual(WORLD.h + 20);
            for (const o of m.regions) {
              if (o === me) continue;
              if (o.id !== 'house') for (const b of rowsOf(html, o.id)) expect(gap(a, b), `${id} ${a.words} / ${o.id} ${b.words}`).toBeGreaterThan(4);
              if (o.kind !== 'board') expect(dist(Math.max(a.x0, Math.min(o.x, a.x1)), Math.max(a.y0, Math.min(o.y, a.y1)), o.x, o.y), `${id} ${a.words} / ${o.id} circle`).toBeGreaterThan(o.r);
            }
          }
        }
      }
    };
    check();
    withOffWords(check);
  });
});
