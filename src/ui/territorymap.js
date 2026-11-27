// The world map's SVG (Clan Edition's Change place). A storybook map: her
// territory board drawn from her layout (soft hand-drawn land, her lake,
// island, river, pond, paths and bridge), the town's street places, the coast
// and the sea around it, and a name on every place. DOM-free: it returns a
// string the dressing room inserts.
//
// Layers, bottom to top: paper, sea, land, water, paths, roads, then one
// group per place with its name and its tap target. Land sits under the water
// so her lake and river show through the Woods; each place gets an invisible
// copy of its outline on top, inside its <g data-dr-map-place>, so a tap
// anywhere in it (even on the lake) reaches that place.

import { clanName } from '../clanhomes.js';
import { LAND } from '../territories.js';
import { STREET_LAND, TOWN_LAND, GATE_LAND, ISLAND_HIT_R, MOON_BEAM } from '../worldmap.js';
import { escapeHtml } from '../escapehtml.js';
import { phrase } from '../clanphrases.js';

const n = (v) => Math.round(v * 10) / 10;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

// A smooth line through points: straight to the first midpoint, then a curve
// through each point to the next midpoint. Closed shapes curve all the way round.
function smoothPath(points, closed) {
  const p = points;
  if (p.length < 3) return `M${p.map(([x, y]) => `${n(x)} ${n(y)}`).join(' L')}`;
  if (closed) {
    const start = mid(p[p.length - 1], p[0]);
    let d = `M${n(start[0])} ${n(start[1])}`;
    for (let i = 0; i < p.length; i++) {
      const m = mid(p[i], p[(i + 1) % p.length]);
      d += ` Q${n(p[i][0])} ${n(p[i][1])} ${n(m[0])} ${n(m[1])}`;
    }
    return `${d} Z`;
  }
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const m = mid(p[i], p[i + 1]);
    d += ` Q${n(p[i][0])} ${n(p[i][1])} ${n(m[0])} ${n(m[1])}`;
  }
  const last = p[p.length - 1];
  return `${d} L${n(last[0])} ${n(last[1])}`;
}

// A circle with a gentle hand-drawn wobble, the same every time for a given id.
function blobPath(id, x, y, r) {
  let seed = 0;
  for (const ch of String(id)) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
  const s = seed / 97;
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const k = 1 + 0.045 * Math.sin(3 * a + s) + 0.03 * Math.sin(5 * a + 2 * s) + 0.015 * Math.sin(8 * a + 3 * s);
    pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
  }
  return smoothPath(pts, true);
}

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    pts.push(`${n(cx + Math.cos(a) * r)},${n(cy + Math.sin(a) * r)}`);
  }
  return pts.join(' ');
}

// Greedy word wrap, so a long name or the lock line stays inside its land.
function wrap(text, max) {
  const lines = [];
  for (const part of String(text).split(' · ')) {
    let cur = '';
    for (const word of part.split(' ')) {
      if (cur && (cur.length + 1 + word.length) > max) { lines.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

export const ICON = { town: '🏠', woods: '🌳', moor: '🌾', river: '🌿', pines: '🌲', gorge: '⛰️' };
// The world map's icons for the places that are not her board's.
export const STREET_ICON = { park: '⛲', fair: '🎡', farm: '🚜', docks: '⚓', seaside: '🏖️', roofs: '🕊️', market: '🧺', house: '🕰️', lighthouse: '🗼', greenhouse: '🌿', treehouse: '🌳', reef: '🐠', crystal: '💎', moon: '🌙', snowville: '❄️', jungle: '🌴' };

// A place's name: its icon, the lock, its name and its line, centred on its
// anchor. A small place (the world map's street places and the Gorge) gets
// smaller words, wrapped narrower, so they stay nearer its land.
function labelParts(r) {
  // every place has the same words: name 36, line 24, wrapped alike, centred on the place
  const name = wrap(`${r.locked ? '🔒 ' : ''}${r.name}`, 12);
  const sub = wrap(r.mapLine ?? r.line, 20);
  const tall = 34 + name.length * 36 + (sub.length ? 32 + (sub.length - 1) * 26 : 0);
  return { name, sub, tall, y: r.y - tall / 2 + 26 };
}
function labelHtml(r) {
  const { name, sub, y } = labelParts(r);
  // a place with a camp has the camp's mark in the icon's row, on its right
  const iconX = r.camp ? r.x - 32 : r.x;
  const lines = [
    `<tspan class="tm-icon" x="${iconX}" dy="0">${ICON[r.id] ?? STREET_ICON[r.id] ?? ''}</tspan>`,
    ...name.map((t) => `<tspan class="tm-name" x="${r.x}" dy="36" font-size="36">${escapeHtml(t)}</tspan>`),
    ...sub.map((t, i) => `<tspan class="tm-line tm-line-small" x="${r.x}" dy="${i ? 26 : 32}">${escapeHtml(t)}</tspan>`),
  ];
  return `<text class="tm-label" x="${r.x}" y="${n(y)}" text-anchor="middle">${lines.join('')}</text>`;
}

// The camp mark's own colours (test/campmarks.test.js checks each against
// every clan colour and every land). The dome stands on a light badge with a
// dark edge, because a clan colour alone can sit too close to its own land:
// DuskClan's #35584a on the Pines' green all but vanished. The rings get a
// dark edge under them for the same reason on the pale lands.
export const CAMP_MARK = Object.freeze({
  badge: '#fbf3dc', edge: '#4a3522', ringEdge: '#3a2a1a', mine: '#f2c14e', ally: '#ffffff',
});

// The clan's camp: a small dome with a dark door in the clan's colour, on a
// light badge. Mine gets a gold ring and a larger icon, the sibling's a thin
// white ring. It never takes a tap: the place under it stays tappable.
function campHtml(r) {
  if (!r.camp) return '';
  // in the icon's row, right of the icon (the one row of the words that is empty at its sides)
  const c = { ...r.camp, x: r.x + 36, y: n(labelParts(r).y - 18) };
  const k = c.mine ? 1 : 0.85;
  const rr = n(27 * k);
  const ringColour = c.mine ? CAMP_MARK.mine : CAMP_MARK.ally;
  const ring = c.mine || c.ally
    ? `<circle class="tm-camp-ring-edge" cx="${c.x}" cy="${c.y}" r="${rr}" stroke="${CAMP_MARK.ringEdge}"/>`
      + `<circle class="tm-camp-ring" cx="${c.x}" cy="${c.y}" r="${rr}" stroke="${ringColour}"/>`
    : '';
  const badge = `<circle class="tm-camp-badge" cx="${c.x}" cy="${n(c.y + 1 * k)}" r="${n(21 * k)}" fill="${CAMP_MARK.badge}" stroke="${CAMP_MARK.edge}"/>`;
  const w = 15 * k;
  const dome = `<path class="tm-camp-dome" fill="${escapeHtml(c.color)}" d="M${n(c.x - w)} ${n(c.y + 8 * k)} A${n(w)} ${n(w)} 0 0 1 ${n(c.x + w)} ${n(c.y + 8 * k)} Z"/>`
    + `<path class="tm-camp-door" d="M${n(c.x - 5 * k)} ${n(c.y + 8 * k)} A${n(5 * k)} ${n(5 * k)} 0 0 1 ${n(c.x + 5 * k)} ${n(c.y + 8 * k)} Z"/>`;
  const cls = `tm-camp${c.mine ? ' mine' : ''}${c.ally ? ' ally' : ''}`;
  return `<g class="${cls}"><title>${escapeHtml(phrase('map.camp', clanName(r.id)))}</title>${ring}${badge}${dome}</g>`;
}

// Where the island is, said under its name and in its screen-reader label.
export const ISLAND_WHERE = 'in the Pines and Swamp';
// The island's words sit west of the lake, on the open ground between the Pines and the River.
export const ISLAND_WORDS_AT = Object.freeze([322, 318]);

const stateClasses = (r) => `${r.status}${r.locked ? ' locked' : ''}${r.selected ? ' sel' : ''}`;

// The world map's drawn box: the 1840 x 920 world, with the sky above it (the Moon's place, 240 units of it) so the Moon's
// rock, the clouds and the stars are never clipped.
export const WORLD_VIEW = Object.freeze({ x: 0, y: -240, w: 1840, h: 1160 });

const pt = ([x, y]) => `${n(x)} ${n(y)}`;
// How far the paper, the sea and the sky run past the world on every side. The pan fits the whole world in its box
// (contain), so a box whose shape is not the world's shows more map round it. 6000 units outruns the widest box the sheet can have.
const BEYOND = 6000;
// The mainland lies inside this box (the sea and the sky cover what is outside it); the land's edge in the west is paper.
const LAND_BOX = [-120, -60, 1900, 925];
const SKY_Y = -45; // the sky's lower edge (the clouds hang a little below it)

// A whole-number hash in [0, 1): the same every time.
function hash(...keys) {
  let h = 2166136261;
  for (const k of keys) { h ^= Math.round(k) + 0x8000; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
}

// ---- the continent: each place is a patch of one landmass ----

// A convex polygon cut to the half-plane nearer (ax, ay) than (bx, by).
function cut(poly, [ax, ay], [bx, by]) {
  const nx = bx - ax, ny = by - ay, c = (nx * (ax + bx) + ny * (ay + by)) / 2;
  const side = ([x, y]) => c - (nx * x + ny * y);
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}

// One border between two corners, bent a little by hand: the same line whichever patch draws it.
function wobbled(a, b) {
  const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const [p, q] = flip ? [b, a] : [a, b];
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const steps = Math.max(1, Math.round(len / 36));
  const amp = Math.min(9, len * 0.06), seed = hash(p[0], p[1], q[0], q[1]) * 6.28;
  const line = [p];
  for (let i = 1; i < steps; i++) {
    const t = i / steps, w = amp * (Math.sin(t * 9 + seed) * 0.7 + Math.sin(t * 17 + seed * 2) * 0.3);
    line.push([p[0] + (q[0] - p[0]) * t - ((q[1] - p[1]) / len) * w, p[1] + (q[1] - p[1]) * t + ((q[0] - p[0]) / len) * w]);
  }
  return flip ? line.reverse() : line;
}

// The patch of the continent that belongs to each place: the ground nearer to it than to any other place, as far as the
// mainland box. Returns { id: path d }; the coast cuts the patches to the shore (clip-path) when they are drawn.
export function landPatches(sites) {
  const [x0, y0, x1, y1] = LAND_BOX;
  const out = {};
  for (const s of sites) {
    let poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    for (const o of sites) if (o !== s) poly = cut(poly, [s.x, s.y], [o.x, o.y]);
    if (poly.length < 3) continue;
    const ring = poly.flatMap((p, i) => wobbled(p, poly[(i + 1) % poly.length]));
    out[s.id] = `M${ring.map(pt).join(' L')} Z`;
  }
  return out;
}

// A scalloped circle: the Reef's patch of deep water.
function wavyPath(x, y, r) {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2, k = 1 + 0.07 * Math.sin(a * 14);
    pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]);
  }
  return smoothPath(pts, true);
}

// Bubbles rising over the Reef's patch (decoration).
function bubblesHtml(r) {
  const out = [];
  for (let i = 0; i < 9; i++) {
    const a = hash(i, 1) * 6.28, d = r.r * (0.75 + hash(i, 2) * 0.55);
    out.push(`<circle cx="${n(r.x + Math.cos(a) * d)}" cy="${n(r.y + Math.sin(a) * d - 8)}" r="${n(4 + hash(i, 3) * 6)}"/>`);
  }
  return `<g class="wm-bubbles" aria-hidden="true">${out.join('')}</g>`;
}

// The sky over the north: stars, and a hem of clouds where it meets the land.
function skyHtml() {
  const stars = [];
  for (let i = 0; i < 60; i++) stars.push(`<circle cx="${n(-200 + hash(i, 4) * 2300)}" cy="${n(-230 + hash(i, 5) * 170)}" r="${n(1.5 + hash(i, 6) * 2.5)}"/>`);
  const clouds = [];
  for (let i = 0; i < 70; i++) {
    const x = -260 + i * 34 + hash(i, 7) * 16, r = 16 + hash(i, 8) * 16;
    clouds.push(`<circle cx="${n(x)}" cy="${n(SKY_Y + 6 + (i % 2) * 10 + hash(i, 9) * 8)}" r="${n(r)}"/>`);
  }
  return `<g class="wm-sky" aria-hidden="true"><rect x="${-BEYOND}" y="${-BEYOND}" width="${3 * BEYOND}" height="${BEYOND + SKY_Y}"/>`
    + `<g class="wm-stars">${stars.join('')}</g><g class="wm-clouds">${clouds.join('')}</g></g>`;
}

// The world map (Change place): her board's river, lake, island, paths and
// bridge, drawn over one continent whose patches are the places, with the
// coast and the sea, the sky and the Moon above, the Reef's deep water at sea
// and the gateway roads, in one SVG drawn once per render (panning and
// zooming change only its viewBox). Every place is a keyboard button with a
// screen-reader label (data-dr-map-place), so the map is a group, never
// role="img", which would hide each label. The island's star is a second way
// into the Pines.
//
// Layers, bottom to top: paper, sea, the continent (patches and their
// borders), the sky, water, her paths and bridge, the gateway roads and a
// mark at each road's end, one group per place, then the island's group. No
// frame: the paper, the sea and the sky run on past the world's edge (BEYOND).
export function renderWorldMapHtml(model) {
  const m = model;
  const { w, h } = m.world;
  const [c0, ...cs] = m.coast;
  const chain = (() => {
    let d = '';
    for (let i = 0; i + 2 < cs.length; i += 3) d += ` C${pt(cs[i])} ${pt(cs[i + 1])} ${pt(cs[i + 2])}`;
    return d;
  })();
  const south = cs[cs.length - 1];
  // the sea: east of the coast, and below the south shore all the way west
  const sea = `<path class="tm-sea" d="M${n(c0[0])} ${-BEYOND} L${pt(c0)}${chain} L${-BEYOND} ${n(south[1])} L${-BEYOND} ${h + BEYOND} L${w + BEYOND} ${h + BEYOND} L${w + BEYOND} ${-BEYOND} Z"/>`;
  // the mainland, west of the coast
  const mainland = `M${LAND_BOX[0]} ${LAND_BOX[1]} L${pt(c0)}${chain} L${LAND_BOX[0]} ${n(south[1])} Z`;

  const onLand = (r) => !r.afar;
  const patches = landPatches(m.regions.filter(onLand));
  const landClass = (r) => `tm-land ${(r.kind === 'street' || r.kind === 'town' || r.kind === 'gate' ? 'street ' : '') + (onLand(r) ? 'wm-cell ' : 'wm-afar ')}${stateClasses(r)}`;
  const fillOf = (r) => (r.kind === 'town' ? TOWN_LAND[r.id] : r.kind === 'street' ? STREET_LAND[r.id] : r.kind === 'gate' ? GATE_LAND[r.id] : LAND[r.id]) ?? '#c8b98f';
  const shapeOf = (r) => (onLand(r) ? patches[r.id] ?? '' : r.id === 'reef' ? wavyPath(r.x, r.y, r.r * 1.3) : blobPath(r.id, r.x, r.y, r.r * 1.05));
  const land = m.regions.filter(onLand).map((r) => `<path class="${landClass(r)}" fill="${fillOf(r)}" d="${shapeOf(r)}"/>`).join('');
  const borders = `<path class="wm-border" d="${m.regions.filter(onLand).map((r) => patches[r.id] ?? '').join('')}"/>`;
  const afar = m.regions.filter((r) => !onLand(r)).map((r) => `<path class="${landClass(r)}" fill="${fillOf(r)}" d="${shapeOf(r)}"/>${r.id === 'reef' ? bubblesHtml(r) : ''}`).join('');
  const beam = m.regions.some((r) => r.id === 'moon') ? `<path class="wm-beam" d="M${pt(MOON_BEAM[0])} C${pt(MOON_BEAM[1])} ${pt(MOON_BEAM[2])} ${pt(MOON_BEAM[3])}"/>` : '';
  const water = `<path class="tm-river-bank" d="${smoothPath(m.river, false)}"/><path class="tm-river" d="${smoothPath(m.river, false)}"/>`
    + `<path class="tm-lake" d="${smoothPath(m.lake, true)}"/>`
    + `<circle class="tm-pond" cx="${m.pond.x}" cy="${m.pond.y}" r="${m.pond.r}"/>`;
  const paths = Object.values(m.paths).map((p) => `<path class="tm-path" d="${smoothPath(p, false)}"/>`).join('');
  const [b0, b1] = m.bridge;
  const bridge = `<line class="tm-bridge" x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}"/>`
    + `<line class="tm-bridge-planks" x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}"/>`;
  const roads = m.gateways.map(({ road: [p0, p1, p2, p3] }) => `<path class="wm-road" d="M${pt(p0)} C${pt(p1)} ${pt(p2)} ${pt(p3)}"/>`
    + `<circle class="wm-gate" cx="${n(p3[0])}" cy="${n(p3[1])}" r="8"/>`).join('');

  const button = (r, id, x, y, label) => `<g class="tm-region ${stateClasses(r)}" data-region="${escapeHtml(id)}" data-dr-map-place="${escapeHtml(r.areaId)}"`
    + ` data-x="${n(x)}" data-y="${n(y)}" role="button" tabindex="0" aria-label="${escapeHtml(label)}">`;
  const places = m.regions.map((r) => button(r, r.id, r.x, r.y, `${r.name}: ${r.line}`)
    + `<path class="tm-hit"${onLand(r) ? ' clip-path="url(#wm-land)"' : ''} d="${shapeOf(r)}"/>${labelHtml(r)}${campHtml(r)}</g>`).join('');

  const isl = m.island;
  const island = button(isl, 'island', m.star.x, m.star.y, `${isl.name}, ${ISLAND_WHERE}: ${isl.line}`)
    + `<path class="tm-island" d="${smoothPath(isl.outline, true)}"/>`
    + `<polygon class="tm-star" points="${starPoints(m.star.x, m.star.y, 13, 5.5)}"/>`
    + `<text class="tm-label tm-small" x="${ISLAND_WORDS_AT[0]}" y="${ISLAND_WORDS_AT[1]}" text-anchor="middle">${escapeHtml(isl.name)}</text>`
    + `<text class="tm-label tm-small" x="${ISLAND_WORDS_AT[0]}" y="${ISLAND_WORDS_AT[1] + 36}" text-anchor="middle">${escapeHtml(ISLAND_WHERE)}</text>`
    + `<circle class="tm-hit" cx="${m.star.x}" cy="${m.star.y}" r="${ISLAND_HIT_R}"/></g>`;

  const v = WORLD_VIEW;
  return `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" class="territory-map world-map" role="group" aria-label="Map of the world" xmlns="http://www.w3.org/2000/svg">`
    + `<defs><clipPath id="wm-land"><path d="${mainland}"/></clipPath></defs>`
    + `<rect class="tm-paper" x="${-BEYOND}" y="${-BEYOND}" width="${w + 2 * BEYOND}" height="${h + 2 * BEYOND}"/>${sea}`
    + `<g class="wm-continent" clip-path="url(#wm-land)"><path class="wm-ground" d="${mainland}"/><g class="tm-lands">${land}</g>${borders}</g>`
    + `${skyHtml()}${afar}${beam}<g class="tm-water">${water}</g><g class="tm-paths">${paths}${bridge}</g>`
    + `<g class="wm-roads">${roads}</g>${places}${island}`
    + '</svg>';
}
