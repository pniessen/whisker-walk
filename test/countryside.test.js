// The world map's countryside: the green between the places (src/countryside.js,
// drawn by src/ui/countryside.js). Decoration only: it must never sit on or
// touch a place, its words, its camp, a gateway, the island or the river,
// whatever the save, and it must never take a tap or a tab stop.
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { worldMapModel, tapTargets } from '../src/worldmap.js';
import { COUNTRYSIDE, FIELD_TONES, ROOFTOPS_SPOT } from '../src/countryside.js';
import { renderWorldMapHtml } from '../src/ui/territorymap.js';
import { buildDressingModel, renderPlacesSheetHtml } from '../src/ui/dressingroom.js';
import { withOffWords } from './helpers/offwords.js';

function base(extra = {}) {
  return {
    edition: 'canon', points: 0,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0, woods: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby' }, area: 'neighborhood', ...extra,
  };
}
const ALL = ['neighborhood', 'park', 'woods', 'farm', 'fair', 'docks', 'seaside', 'river', 'moor', 'pines', 'gorge'];
const pick = (mine, partner = null) => ({ clanPick: { mine, partner, partnerId: partner ? 'p1' : null }, colony: { partner: partner ? { playerId: 'p1' } : null } });
// Every kind of save the map draws: everything locked (the longest lock
// lines), part way, everything open, each clan's camp with an ally, and
// every place today's.
const SAVES = [
  base(),
  base({ walks: { neighborhood: 2 }, points: 60 }),
  base({ walks: { neighborhood: 4, woods: 3, park: 1 }, points: 30, unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood', 'woods', 'park'] }, ...pick('woods', 'river') }),
  ...['woods', 'river', 'moor', 'pines', 'gorge'].map((c, i) => base({ points: 5000, unlocked: { cats: ['tabby'], accessories: [], areas: ALL }, area: ALL[(i * 3) % ALL.length], ...pick(c, i % 2 ? 'woods' : 'moor') })),
  ...ALL.map((area) => base({ points: 120, area, unlocked: { cats: ['tabby'], accessories: [], areas: ALL } })),
];
const draw = (s) => renderWorldMapHtml(worldMapModel(s, CATALOG));

// ---- geometry ----
const nums = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map(([v]) => Number(v));
const pairs = (d) => { const v = nums(d); const out = []; for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i], v[i + 1]]); return out; };
const segDist = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const inside = ([x, y], poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
// how far a point is from a keep-out (negative: inside it)
function distTo(p, k) {
  if (k.kind === 'circle') return Math.hypot(p[0] - k.x, p[1] - k.y) - k.r;
  if (k.kind === 'box') {
    const dx = Math.max(k.x0 - p[0], 0, p[0] - k.x1), dy = Math.max(k.y0 - p[1], 0, p[1] - k.y1);
    return dx || dy ? Math.hypot(dx, dy) : -1;
  }
  // a line (half width w) or a closed shape
  let d = Infinity;
  const n = k.closed ? k.pts.length : k.pts.length - 1;
  for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, k.pts[i], k.pts[(i + 1) % k.pts.length]));
  if (k.closed && inside(p, k.pts)) return -1;
  return d - (k.w ?? 0);
}
// a box round a keep-out, for skipping the far ones quickly
function boundsOf(k) {
  if (k.kind === 'circle') return [k.x - k.r, k.y - k.r, k.x + k.r, k.y + k.r];
  if (k.kind === 'box') return [k.x0, k.y0, k.x1, k.y1];
  const xs = k.pts.map((p) => p[0]), ys = k.pts.map((p) => p[1]), w = k.w ?? 0;
  return [Math.min(...xs) - w, Math.min(...ys) - w, Math.max(...xs) + w, Math.max(...ys) + w];
}
const anchorsOf = (k) => (k.kind === 'circle' ? [[k.x, k.y]] : k.kind === 'box' ? [[k.x0, k.y0], [k.x1, k.y1], [k.x0, k.y1], [k.x1, k.y0]] : k.pts);
const along = (pts, closed) => {
  const out = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
    for (let s = 0; s < steps; s++) out.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  if (!closed) out.push(pts[pts.length - 1]);
  return out;
};
const cubic = ([p0, p1, p2, p3]) => Array.from({ length: 25 }, (_, i) => {
  const t = i / 24, u = 1 - t;
  return [0, 1].map((a) => u * u * u * p0[a] + 3 * u * u * t * p1[a] + 3 * u * t * t * p2[a] + t * t * t * p3[a]);
});

// A label's box from its markup, with letters wider than any browser draws
// (0.62 em; Chalkboard measures about 0.5) and its 8 wide halo.
const FONT = { 'tm-icon': 34, 'tm-line': 28, 'tm-line tm-line-small': 24 };
function labelBoxes(html) {
  const boxes = [];
  for (const [, attrs, body] of html.matchAll(/<text class="tm-label[^"]*"([^>]*)>(.*?)<\/text>/g)) {
    const x = Number(attrs.match(/ x="([-\d.]+)"/)[1]);
    let y = Number(attrs.match(/ y="([-\d.]+)"/)[1]);
    const spans = [...body.matchAll(/<tspan class="([^"]+)"[^>]*?dy="([\d.]+)"(?: font-size="([\d.]+)")?>(.*?)<\/tspan>/g)];
    const lines = spans.length ? spans.map(([, cls, dy, size, t]) => ({ dy: Number(dy), size: Number(size ?? FONT[cls]), t }))
      : [{ dy: 0, size: 24, t: body }];
    for (const { dy, size, t } of lines) {
      y += dy;
      const chars = [...t.replace(/&[a-z#0-9]+;/g, 'x')];
      const wide = chars.reduce((s, ch) => s + (ch.codePointAt(0) > 0x2000 ? 1.15 : 0.62), 0) * size;
      boxes.push({ kind: 'box', x0: x - wide / 2 - 4, x1: x + wide / 2 + 4, y0: y - 0.85 * size - 4, y1: y + 0.3 * size + 4 });
    }
  }
  return boxes;
}

// Everything the countryside keeps clear of, read from the drawn map.
function keepOuts(html) {
  const k = [];
  // every place's land, its outline (3) and gold ring (9 wide) included
  for (const [, d] of html.matchAll(/<path class="tm-hit" d="([^"]+)"/g)) k.push({ kind: 'shape', closed: true, pts: pairs(d), w: 5 });
  k.push(...labelBoxes(html));
  // camps: the badge and the rings round it
  for (const [, cx, cy, r] of html.matchAll(/<circle class="tm-camp[^"]*" cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)) k.push({ kind: 'circle', x: +cx, y: +cy, r: +r + 5 });
  // the gateway roads and their marks
  for (const [, d] of html.matchAll(/<path class="wm-road" d="([^"]+)"/g)) k.push({ kind: 'shape', closed: false, pts: cubic(pairs(d)), w: 2 });
  for (const [, cx, cy, r] of html.matchAll(/<circle class="wm-gate" cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)) k.push({ kind: 'circle', x: +cx, y: +cy, r: +r });
  // the river (its bank 22 wide), the lake, her pond, the island and its star
  k.push({ kind: 'shape', closed: false, pts: pairs(html.match(/<path class="tm-river-bank" d="([^"]+)"/)[1]), w: 11 });
  k.push({ kind: 'shape', closed: true, pts: pairs(html.match(/<path class="tm-lake" d="([^"]+)"/)[1]), w: 2 });
  const [, px, py, pr] = html.match(/<circle class="tm-pond" cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/);
  k.push({ kind: 'circle', x: +px, y: +py, r: +pr + 2 });
  k.push({ kind: 'shape', closed: true, pts: pairs(html.match(/<path class="tm-island" d="([^"]+)"/)[1]), w: 2 });
  for (const [, cx, cy, r] of html.matchAll(/<circle class="tm-hit" cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)) k.push({ kind: 'circle', x: +cx, y: +cy, r: +r });
  // the Rooftops' spot on the town's rim (branch rooftops-2)
  k.push({ kind: 'circle', x: 905, y: 458, r: 60 });
  return k;
}

// Every piece of the countryside as the points it covers and how far its
// paint reaches past them.
function pieces(c = COUNTRYSIDE) {
  const out = [];
  c.fields.forEach((f, i) => out.push({ what: `field ${i}`, pts: along(f.quad, true), area: f.quad, pad: 0 }));
  c.hedges.forEach((h, i) => out.push({ what: `hedge ${i}`, pts: along(h, false), pad: 3 }));
  c.lanes.forEach((l, i) => out.push({ what: `lane ${i}`, pts: along(l, false), pad: 5.5 }));
  c.trees.forEach(([x, y, r], i) => {
    out.push({ what: `tree ${i}`, pts: [[x, y]], pad: r + 1 });
    out.push({ what: `tree ${i} shade`, pts: [[x + 3, y + 5]], pad: r });
  });
  c.ponds.forEach(([x, y, rx], i) => out.push({ what: `pond ${i}`, pts: [[x, y]], pad: rx + 1.5 }));
  c.flowers.flat().forEach(([x, y], i) => out.push({ what: `flower ${i}`, pts: [[x, y]], pad: 2.75 }));
  return out;
}
const GAP = 4;
function clashes(html, c = COUNTRYSIDE) {
  const ks = keepOuts(html).map((k) => ({ ...k, b: boundsOf(k) }));
  const bad = [];
  for (const p of pieces(c)) {
    const reach = p.pad + GAP + 1;
    const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
    const [x0, y0, x1, y1] = [Math.min(...xs) - reach, Math.min(...ys) - reach, Math.max(...xs) + reach, Math.max(...ys) + reach];
    for (const k of ks) {
      if (k.b[0] > x1 || k.b[2] < x0 || k.b[1] > y1 || k.b[3] < y0) continue;
      const d = Math.min(...p.pts.map((q) => distTo(q, k)));
      const swallowed = p.area && anchorsOf(k).some((a) => inside(a, p.area));
      if (d < p.pad + GAP || swallowed) { bad.push(`${p.what} ${k.kind} ${d.toFixed(1)}`); break; }
    }
  }
  return bad;
}
// Her coast, from the drawn sea: where the land ends at a given y.
function coastXFrom(html) {
  const d = html.match(/<path class="tm-sea" d="([^"]+)"/)[1];
  const v = pairs(d);
  const line = [v[0], v[1]];
  for (let i = 2; i + 2 < v.length && v[i + 2][1] < 3000; i += 3) line.push(...cubic([line[line.length - 1], v[i], v[i + 1], v[i + 2]]).slice(1));
  return (y) => {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i];
      if ((ay - y) * (by - y) <= 0 && ay !== by) return ax + ((y - ay) / (by - ay)) * (bx - ax);
    }
    return 750;
  };
}

describe('the countryside between the places', () => {
  it('has a patchwork in every tone, furrows, hedgerows, open meadow with flowers, trees, two ponds and three lanes', () => {
    const c = COUNTRYSIDE;
    expect(new Set(c.fields.map((f) => f.tone))).toEqual(new Set(FIELD_TONES.map((_, i) => i)));
    expect(c.fields.length).toBeGreaterThan(60);
    expect(c.fields.some((f) => f.furrows.length) && c.fields.some((f) => !f.furrows.length)).toBe(true);
    expect(c.hedges.length).toBeGreaterThan(60);
    expect(c.flowers.every((f) => f.length > 10)).toBe(true);
    expect(c.trees.length).toBeGreaterThan(20);
    expect(c.ponds).toHaveLength(2);
    expect(c.lanes).toHaveLength(3);
    // there is green in the world's own gaps, not only past its edge
    const mid = (q) => [0, 1].map((a) => q.reduce((t, p) => t + p[a], 0) / 4);
    expect(c.fields.filter((f) => { const [x, y] = mid(f.quad); return x > 0 && x < 1340 && y > -20 && y < 880; }).length).toBeGreaterThan(15);
  });

  it('is fixed data: frozen, made without Math.random, the same on every render', () => {
    expect(Object.isFrozen(COUNTRYSIDE) && Object.isFrozen(COUNTRYSIDE.fields) && Object.isFrozen(COUNTRYSIDE.fields[0])).toBe(true);
    for (const f of ['src/countryside.js', 'src/ui/countryside.js']) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/Math\.random/);
    expect(draw(base())).toBe(draw(base()));
  });

  it('never sits on or touches a place, its words, its camp, a gateway, the island or the river, in any save', () => {
    for (const s of SAVES) expect(clashes(draw(s)).join('; '), JSON.stringify([s.area, s.clanPick?.mine, s.points])).toBe('');
    withOffWords(() => {
      for (const s of [SAVES[0], SAVES[2], SAVES[4]]) expect(clashes(draw(s)), 'everyday words').toEqual([]);
    });
  });

  it("keeps the Rooftops' spot on the town's rim clear", () => {
    expect(ROOFTOPS_SPOT).toEqual({ x: 905, y: 458, r: 60 });
    const near = pieces().filter((p) => p.pts.some(([x, y]) => Math.hypot(x - 905, y - 458) < 60 + p.pad));
    expect(near.map((p) => p.what)).toEqual([]);
  });

  it('the check catches a tree on a place, a field over a label, a lane across a road', () => {
    const html = draw(base());
    const one = (extra) => clashes(html, { ...COUNTRYSIDE, fields: [], hedges: [], lanes: [], trees: [], ponds: [], flowers: [[], [], []], ...extra });
    expect(one({})).toEqual([]);
    expect(one({ trees: [[565, 500, 12]] }).length).toBeGreaterThan(0); // the Woods (the tree and its shade)
    expect(one({ trees: [[1060, 240, 8]] }).length).toBeGreaterThan(0); // on the Fairground's name
    expect(one({ fields: [{ quad: [[1000, 560], [1100, 560], [1100, 660], [1000, 660]], tone: 0, furrows: [] }] })).toHaveLength(1);
    expect(one({ lanes: [[[1000, 520], [1000, 640]]] })).toHaveLength(1); // across the town-park road
    expect(one({ flowers: [[[455, 314]], [], []] })).toHaveLength(1); // the island's star
    expect(one({ ponds: [[440, 240, 10, 6]] })).toHaveLength(1); // the river and lake
  });

  it('trees, bushes, ponds, flowers and hedgerows stand on land, never in the sea', () => {
    const coastX = coastXFrom(draw(base()));
    const c = COUNTRYSIDE;
    for (const [x, y, r] of c.trees) expect(x + r, `tree ${x},${y}`).toBeLessThan(coastX(y) - 10);
    for (const [x, y, rx] of c.ponds) expect(x + rx, `pond ${x},${y}`).toBeLessThan(coastX(y) - 10);
    for (const [x, y] of c.flowers.flat()) expect(x, `flower ${x},${y}`).toBeLessThan(coastX(y) - 10);
  });
});

describe('drawing the countryside', () => {
  const html = draw(base());
  const group = html.match(/<g class="wm-country"[^>]*>.*?<\/g>/)[0];
  const rims = html.match(/<g class="wm-rims"[^>]*>.*?<\/g>/)[0];

  it('is decoration: hidden from screen readers, no tab stop, no button, no place, no words', () => {
    for (const g of [group, rims]) {
      expect(g).toMatch(/^<g class="wm-[a-z]+" aria-hidden="true">/);
      expect(g).not.toMatch(/tabindex|role=|data-dr-map-place|data-region|<title|<text|<a /);
    }
    // it takes no taps (a tap on the meadow reaches no place; a drag still pans)
    const css = fs.readFileSync('src/style.css', 'utf8');
    expect(css).toMatch(/\.world-map \.wm-country, \.world-map \.wm-rims \{ pointer-events: none; \}/);
    // the tap targets are the places and the island's star, as before (thirteen
    // places with the Rooftops and the Market inside the town)
    expect(tapTargets(worldMapModel(base(), CATALOG))).toHaveLength(14);
  });

  it('a handful of paths drawn once: fields by tone, furrows, lanes, hedgerows, ponds, flowers, trees and the fade', () => {
    const tags = [...group.matchAll(/<(path|rect|circle|use)\b/g)].length;
    expect(tags).toBeLessThanOrEqual(16);
    expect(rims.match(/<path/g)).toHaveLength(2);
    // small enough to redraw with each render (pan and zoom change only the viewBox)
    expect(group.length).toBeLessThan(40000);
  });

  it('layers: paper, countryside, sea, the places\' rims, lands, places', () => {
    const order = ['tm-paper', 'wm-country', 'tm-sea', 'wm-rims', 'tm-lands', 'data-region="town"'].map((c) => html.indexOf(c));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // the fade toward the frame is defined once and used by the countryside
    expect(html.match(/<radialGradient id="wm-fade"/g)).toHaveLength(1);
    expect(group).toContain('fill="url(#wm-fade)"');
  });

  it('every place gets a rim and a shadow', () => {
    const [shadow, rim] = [...rims.matchAll(/d="([^"]+)"/g)].map(([, d]) => d);
    expect(shadow).toBe(rim);
    // one per place: eleven, and the Rooftops and the Market inside the town
    const regions = worldMapModel(base(), CATALOG).regions;
    expect(regions).toHaveLength(13);
    expect(rim.match(/M/g)).toHaveLength(13);
    // the Rooftops' own: one of the rim's shapes is drawn round its spot
    const roofs = regions.find((r) => r.id === 'roofs');
    const centres = rim.split('M').filter(Boolean).map((part) => {
      const ps = pairs(part);
      return [0, 1].map((a) => ps.reduce((t, p) => t + p[a], 0) / ps.length);
    });
    expect(centres.some(([x, y]) => Math.hypot(x - roofs.x, y - roofs.y) < roofs.r / 4)).toBe(true);
  });

  it("Legacy's picture cards are untouched", () => {
    const s = { ...base({ walks: { neighborhood: 2 }, points: 60 }), edition: 'legacy' };
    expect(renderPlacesSheetHtml(buildDressingModel(s, CATALOG))).not.toMatch(/wm-country|wm-rims|wm-fade/);
  });
});
