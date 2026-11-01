// The territory map's SVG (Clan Edition's "Where to?"). A storybook map drawn
// from her layout: soft hand-drawn land, her lake, island, river, pond, paths
// and bridge, and a name on every territory. DOM-free: it returns a string the
// dressing room inserts.
//
// Layers, bottom to top: parchment, land, water, paths, then the labels and
// tap targets. Land sits under the water so her lake and river show through
// the Woods; each built place gets an invisible copy of its outline on top,
// inside its <g data-dr-place>, so a tap anywhere in it (even on the lake)
// reaches the dressing room's existing place handler.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
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

// Land colours, one per territory: Twolegplace's rooftops, the Woods' green,
// heather on the Moor, marsh, dark pines, grey rock for the Gorge.
const LAND = { town: '#d9a57e', woods: '#8fbf74', moor: '#c9a9c6', river: '#a8cf9c', pines: '#6e9d78', gorge: '#b5a48d' };
const ICON = { town: '🏠', woods: '🌳', moor: '🌾', river: '🌿', pines: '🌲', gorge: '⛰️' };
// Where each name sits, nudged off her water and paths where they cross the centre.
const LABEL_AT = { town: [862, 572], woods: [556, 540], moor: [655, 92], river: [205, 548], pines: [290, 172], gorge: [815, 340] };

function labelHtml(r) {
  const [lx, ly] = LABEL_AT[r.id] ?? [r.x, r.y];
  const name = wrap(`${r.locked ? '🔒 ' : ''}${r.name}`, 14);
  const sub = wrap(r.line, 22);
  const nameSize = r.status === 'built' ? 44 : 38;
  const lines = [
    `<tspan class="tm-icon" x="${lx}" dy="0">${ICON[r.id] ?? ''}</tspan>`,
    ...name.map((t) => `<tspan class="tm-name" x="${lx}" dy="${nameSize}" font-size="${nameSize}">${escapeHtml(t)}</tspan>`),
    ...sub.map((t, i) => `<tspan class="tm-line" x="${lx}" dy="${i ? 30 : 36}">${escapeHtml(t)}</tspan>`),
  ];
  const tall = 34 + name.length * nameSize + 36 + (sub.length - 1) * 30;
  return `<text class="tm-label" x="${lx}" y="${n(ly - tall / 2 + 26)}" text-anchor="middle">${lines.join('')}</text>`;
}

const stateClasses = (r) => `${r.status}${r.locked ? ' locked' : ''}${r.selected ? ' sel' : ''}`;

export function renderTerritoryMapHtml(model) {
  const m = model;
  const built = m.regions.filter((r) => r.status === 'built' && r.areaId);
  const unbuilt = m.regions.filter((r) => !built.includes(r));

  const land = m.regions.map((r) => `<path class="tm-land ${stateClasses(r)}" fill="${LAND[r.id] ?? '#c8b98f'}" d="${blobPath(r.id, r.x, r.y, r.r)}"/>`).join('');
  const water = `<path class="tm-river-bank" d="${smoothPath(m.river, false)}"/><path class="tm-river" d="${smoothPath(m.river, false)}"/>`
    + `<path class="tm-lake" d="${smoothPath(m.lake, true)}"/>`
    + `<circle class="tm-pond" cx="${m.pond.x}" cy="${m.pond.y}" r="${m.pond.r}"/>`;
  const paths = Object.values(m.paths).map((p) => `<path class="tm-path" d="${smoothPath(p, false)}"/>`).join('');
  const [b0, b1] = m.bridge;
  const bridge = `<line class="tm-bridge" x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}"/>`
    + `<line class="tm-bridge-planks" x1="${b0[0]}" y1="${b0[1]}" x2="${b1[0]}" y2="${b1[1]}"/>`;
  // Once the Pines is built the island is part of its tap target: the star
  // leads to the Pines and says so. Before that it is drawn as it always was.
  const isl = m.island;
  const toPines = isl.status === 'built' && isl.areaId;
  const islandBody = `<path class="tm-island" d="${smoothPath(isl.outline, true)}"/>`
    + `<polygon class="tm-star" points="${starPoints(m.star.x, m.star.y, 13, 5.5)}"/>`
    + `<text class="tm-label tm-small" x="461" y="276" text-anchor="middle">${escapeHtml(isl.name)}</text>`;
  const island = toPines
    ? `<g class="tm-region ${stateClasses(isl)}" data-region="island" data-dr-place="${escapeHtml(isl.areaId)}">`
      + `<title>${escapeHtml(`${isl.name}, in the Pines and Swamp · ${isl.line}`)}</title>`
      + `<path class="tm-hit" d="${smoothPath(isl.outline, true)}"/>${islandBody}`
      + `<text class="tm-label tm-small" x="461" y="352" text-anchor="middle">in the Pines and Swamp</text></g>`
    : `<g class="tm-region soon" data-region="island"><title>${escapeHtml(`${isl.name} · coming soon`)}</title>${islandBody}</g>`;
  const unbuiltHtml = unbuilt.map((r) => `<g class="tm-region ${stateClasses(r)}" data-region="${escapeHtml(r.id)}">`
    + `<title>${escapeHtml(`${r.name} · ${r.line}`)}</title>${labelHtml(r)}</g>`).join('');
  const builtHtml = built.map((r) => `<g class="tm-region ${stateClasses(r)}" data-region="${escapeHtml(r.id)}" data-dr-place="${escapeHtml(r.areaId)}">`
    + `<title>${escapeHtml(`${r.name} · ${r.line}`)}</title>`
    + `<path class="tm-hit" d="${blobPath(r.id, r.x, r.y, r.r)}"/>${labelHtml(r)}</g>`).join('');

  return `<svg viewBox="0 0 1000 700" class="territory-map" role="img" aria-label="Territory map" xmlns="http://www.w3.org/2000/svg">`
    + '<rect class="tm-paper" x="4" y="4" width="992" height="692" rx="34"/>'
    + `<g class="tm-lands">${land}</g><g class="tm-water">${water}</g><g class="tm-paths">${paths}${bridge}</g>`
    + `${unbuiltHtml}${toPines ? '' : island}${builtHtml}${toPines ? island : ''}`
    + '<rect class="tm-frame" x="4" y="4" width="992" height="692" rx="34"/>'
    + '</svg>';
}
