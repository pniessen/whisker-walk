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
import { STREET_LAND, TOWN_LAND, GATE_LAND, ISLAND_HIT_R } from '../worldmap.js';
import { escapeHtml } from '../escapehtml.js';
import { phrase } from '../clanphrases.js';
import { countrysideHtml, countryFadeDefs } from './countryside.js';

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

const ICON = { town: '🏠', woods: '🌳', moor: '🌾', river: '🌿', pines: '🌲', gorge: '⛰️' };
// Where each name sits, nudged off her water and paths where they cross the centre.
const LABEL_AT = { town: [862, 572], woods: [556, 540], moor: [655, 92], river: [205, 548], pines: [290, 172], gorge: [815, 300] };
// The world map's street places: their icons, and where draft 2 puts their names.
const STREET_ICON = { park: '⛲', fair: '🎡', farm: '🚜', docks: '⚓', seaside: '🏖️', roofs: '🕊️', market: '🧺', house: '🕰️', lighthouse: '🗼', greenhouse: '🌿', reef: '🐠', crystal: '💎' };
const STREET_LABEL_AT = { park: [1080, 478], fair: [1060, 236], farm: [1235, 326], docks: [900, 778], seaside: [1170, 688], lighthouse: [1268, 531], greenhouse: [1255, 150], reef: [1390, 690], crystal: [700, 812] };
// Places inside the town whose names sit off their centre: the Market's, just
// east of its circle, in the one gap that keeps its icon, name and line off
// the town's own name and line, the Docks', the Park's and the Seaside's
// words in every state (Market step 4; measured in Chalkboard SE, the iPad's
// font, about 9 units clear of each; test/worldmap.test.js). The Old House's,
// south-west of its circle, the one gap that keeps its words off the town's
// name and line, the Woods, her path, the Docks and every gate mark (Old
// House step 4; about 14 units clear of each).
const TOWN_LABEL_AT = { market: [1019, 634], house: [716, 712] };

// A place's name: its icon, the lock, its name and its line, centred on its
// anchor. A small place (the world map's street places and the Gorge) gets
// smaller words, wrapped narrower, so they stay nearer its land.
function labelHtml(r, { small = false } = {}) {
  const [lx, ly] = LABEL_AT[r.id] ?? STREET_LABEL_AT[r.id] ?? TOWN_LABEL_AT[r.id] ?? [r.x, r.y];
  // a place drawn inside the town (the Rooftops) is smaller still, so its
  // name and line stay clear of the town's own label
  const tiny = r.kind === 'town';
  const name = wrap(`${r.locked ? '🔒 ' : ''}${r.name}`, tiny ? 8 : small ? 12 : 14);
  // ...and has room for a short line only (two short rows clear the town's
  // icon): a locked one shows its lock alone, one she is still finding the
  // paws for its price alone, today's place (its ring marks it) none; its card has the whole line
  const tinyLine = r.locked || r.selected ? null : !r.owned && !r.selected && !r.canOpen && r.price > 0 ? `${r.price} 🐾` : r.mapLine ?? r.line;
  const sub = tiny ? (tinyLine ? wrap(tinyLine, 8) : []) : wrap(r.mapLine ?? r.line, small ? 20 : 22);
  const nameSize = tiny ? 28 : small ? 36 : r.status === 'built' ? 44 : 38;
  const [lineFirst, lineNext] = tiny ? [26, 22] : small ? [32, 26] : [36, 30];
  const lineClass = small ? 'tm-line tm-line-small' : 'tm-line';
  const lines = [
    `<tspan class="tm-icon" x="${lx}" dy="0">${ICON[r.id] ?? STREET_ICON[r.id] ?? ''}</tspan>`,
    ...name.map((t) => `<tspan class="tm-name" x="${lx}" dy="${nameSize}" font-size="${nameSize}">${escapeHtml(t)}</tspan>`),
    ...sub.map((t, i) => `<tspan class="${lineClass}" x="${lx}" dy="${i ? lineNext : lineFirst}">${escapeHtml(t)}</tspan>`),
  ];
  const tall = 34 + name.length * nameSize + (sub.length ? lineFirst + (sub.length - 1) * lineNext : 0);
  return `<text class="tm-label" x="${lx}" y="${n(ly - tall / 2 + 26)}" text-anchor="middle">${lines.join('')}</text>`;
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
  const c = r.camp;
  if (!c) return '';
  const k = c.mine ? 1.35 : 1;
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

const stateClasses = (r) => `${r.status}${r.locked ? ' locked' : ''}${r.selected ? ' sel' : ''}`;

// The world map's drawn box: the 1500 x 880 world, with a margin above it so
// her Moor, whose rough edge reaches about 7 units above the world's top (its
// circle 4), is never clipped, its selected ring and focus outline included.
export const WORLD_VIEW = Object.freeze({ x: 0, y: -20, w: 1500, h: 900 });

const pt = ([x, y]) => `${n(x)} ${n(y)}`;
const SMALL_R = 140;
// How far the paper and the sea run past the world on every side. The pan
// fits the whole world in its box (contain), so a box whose shape is not the
// world's shows more map round it: plain paper, and the sea carrying on along
// its side. 6000 units outruns the widest box the sheet can have (a 1200 px
// map 260 px tall shows about 4200 units across).
const BEYOND = 6000;

// Under every place on the world map: a soft shadow and a paper rim, all
// places in one path each, so a place stands off the green countryside round
// it (her Woods, River and the Park are green too) and its own fill reads as
// it does on the paper. Decoration: aria-hidden, no taps (style.css).
function placeRimsHtml(regions) {
  const d = regions.map((r) => blobPath(r.id, r.x, r.y, r.r)).join('');
  return `<g class="wm-rims" aria-hidden="true"><path class="wm-shadow" transform="translate(4 7)" d="${d}"/><path class="wm-rim" d="${d}"/></g>`;
}

// The world map (Change place): her board exactly as the territory map draws
// it, with draft 2's street places, coast, sea and gateway roads around it,
// in one SVG drawn once per render (panning and zooming change only its
// viewBox). Every place is a keyboard button with a screen-reader label
// (data-dr-map-place), so the map is a group, never role="img", which would
// hide each label. The island's star is a second way into the Pines.
//
// Layers, bottom to top: paper, the countryside (ui/countryside.js), sea,
// the places' rims, lands, water, her paths and bridge, the
// gateway roads and a mark at each road's end, one group per place, then the
// island's group. No frame: the paper and the sea run on past the world's
// edge (BEYOND), so the map never ends in a line or the page behind it.
export function renderWorldMapHtml(model) {
  const m = model;
  const { w, h } = m.world;
  const [c0, ...cs] = m.coast;
  // her coast, from straight up off the top of the world, curving on under
  // the Docks below its bottom edge and then straight down
  let coast = `M${n(c0[0])} ${-BEYOND} L${pt(c0)}`;
  for (let i = 0; i + 2 < cs.length; i += 3) coast += ` C${pt(cs[i])} ${pt(cs[i + 1])} ${pt(cs[i + 2])}`;
  const sea = `<path class="tm-sea" d="${coast} C820 900 760 960 750 1100 L750 ${h + BEYOND} L${w + BEYOND} ${h + BEYOND} L${w + BEYOND} ${-BEYOND} Z"/>`;

  const landClass = (r) => `tm-land ${r.kind === 'street' || r.kind === 'town' || r.kind === 'gate' ? 'street ' : ''}${stateClasses(r)}`;
  const fillOf = (r) => (r.kind === 'town' ? TOWN_LAND[r.id] : r.kind === 'street' ? STREET_LAND[r.id] : r.kind === 'gate' ? GATE_LAND[r.id] : LAND[r.id]) ?? '#c8b98f';
  const land = m.regions.map((r) => `<path class="${landClass(r)}" fill="${fillOf(r)}" d="${blobPath(r.id, r.x, r.y, r.r)}"/>`).join('');
  const water = `<path class="tm-river-bank" d="${smoothPath(m.river, false)}"/><path class="tm-river" d="${smoothPath(m.river, false)}"/>`
    + `<path class="tm-lake" d="${smoothPath(m.lake, true)}"/>`
    + `<circle class="tm-pond" cx="${m.pond.x}" cy="${m.pond.y}" r="${m.pond.r}"/>`;
  const paths = Object.values(m.paths).map((p) => `<path class="tm-path" d="${smoothPath(p, false)}"/>`).join('');
  const [b0, b1] = m.bridge;
  const bridge = `<line class="tm-bridge" x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}"/>`
    + `<line class="tm-bridge-planks" x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}"/>`;
  // Small marks only: step 3 gives the gateways their gates and states.
  const roads = m.gateways.map(({ road: [p0, p1, p2, p3] }) => `<path class="wm-road" d="M${pt(p0)} C${pt(p1)} ${pt(p2)} ${pt(p3)}"/>`
    + `<circle class="wm-gate" cx="${n(p3[0])}" cy="${n(p3[1])}" r="8"/>`).join('');

  const button = (r, id, x, y, label) => `<g class="tm-region ${stateClasses(r)}" data-region="${escapeHtml(id)}" data-dr-map-place="${escapeHtml(r.areaId)}"`
    + ` data-x="${n(x)}" data-y="${n(y)}" role="button" tabindex="0" aria-label="${escapeHtml(label)}">`;
  const places = m.regions.map((r) => button(r, r.id, r.x, r.y, `${r.name}: ${r.line}`)
    + `<path class="tm-hit" d="${blobPath(r.id, r.x, r.y, r.r)}"/>${labelHtml(r, { small: r.r < SMALL_R })}${campHtml(r)}</g>`).join('');

  const isl = m.island;
  const island = button(isl, 'island', m.star.x, m.star.y, `${isl.name}, ${ISLAND_WHERE}: ${isl.line}`)
    + `<path class="tm-island" d="${smoothPath(isl.outline, true)}"/>`
    + `<polygon class="tm-star" points="${starPoints(m.star.x, m.star.y, 13, 5.5)}"/>`
    + `<text class="tm-label tm-small" x="461" y="276" text-anchor="middle">${escapeHtml(isl.name)}</text>`
    + `<text class="tm-label tm-small" x="461" y="352" text-anchor="middle">${escapeHtml(ISLAND_WHERE)}</text>`
    + `<circle class="tm-hit" cx="${m.star.x}" cy="${m.star.y}" r="${ISLAND_HIT_R}"/></g>`;

  const v = WORLD_VIEW;
  return `<svg viewBox="${v.x} ${v.y} ${v.w} ${v.h}" class="territory-map world-map" role="group" aria-label="Map of the world" xmlns="http://www.w3.org/2000/svg">`
    + `<defs>${countryFadeDefs()}</defs>`
    + `<rect class="tm-paper" x="${-BEYOND}" y="${-BEYOND}" width="${w + 2 * BEYOND}" height="${h + 2 * BEYOND}"/>${countrysideHtml(undefined, BEYOND)}${sea}`
    + `${placeRimsHtml(m.regions)}<g class="tm-lands">${land}</g><g class="tm-water">${water}</g><g class="tm-paths">${paths}${bridge}</g>`
    + `<g class="wm-roads">${roads}</g>${places}${island}`
    + '</svg>';
}
