// The countryside between the world map's places: the open land her board
// and the street places sit in, as fixed data (src/ui/countryside.js draws
// it). Pure: no DOM, no THREE, nothing random; the same shapes every time.
//
// A patchwork of fields (a few soft greens and golds, some with faint furrow
// lines, hedgerows along some of their edges), open meadow with tiny flowers,
// tree clumps and bushes, two ponds and three short lanes. It is decoration
// only: nothing here is on or touches a place's land, its words, its camp, a
// gateway road or its mark, the island or the river, and the Rooftops' spot
// on the town's rim (905, 458) and the Old House's place and words stay
// clear (test/countryside.test.js checks every shape against the drawn map,
// in every save state). Fields carry on a little past the
// world's edge, as the paper does, and the map's fade (ui/countryside.js)
// softens them toward the frame.
import { TERRITORIES, CAMP_AT, RIVER, LAKE, POND } from './territories.js';
import { STREET_PLACES, TOWN_PLACES, COAST, GATEWAYS, WORLD_CAMP_AT } from './worldmap.js';

// A whole-number hash in [0, 1): the jitter and the choices, never random.
function rand(...keys) {
  let h = 2166136261;
  for (const k of keys) {
    h ^= (Math.round(k) + 0x8000) & 0xffff;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}
const r1 = (v) => Math.round(v * 10) / 10;

// ---- what the countryside keeps clear of ----

// A place's hand-drawn edge wobbles out to 1.09 r (blobPath); its rim
// (ui/territorymap.js placeRimsHtml) adds 8 more, and a strip of plain
// meadow round every place keeps it the thing to tap.
const PLACE_CLEAR = 24;
// The places on the town's rim (TOWN_PLACES) are kept clear like the others
// (the Old House's circle reaches out past the town, Old House step 4).
const PLACES = [...TERRITORIES, ...STREET_PLACES, ...TOWN_PLACES].map(({ id, x, y, r }) => ({ id, x, y, r: r * 1.09 }));
// The Rooftops (branch rooftops-2): a place on the town's rim, kept clear.
export const ROOFTOPS_SPOT = Object.freeze({ x: 905, y: 458, r: 60 });
// The room every place's words can take, in every save state (her lock
// lines are the longest): measured in a browser at the map's font, then
// widened. The test measures the drawn words again, every state, with
// wider letters than any browser draws.
const ROOM_PAD = 16;
const LABEL_ROOM = [
  [733, 495, 991, 636], [382, 412, 729, 655], [494, -36, 816, 207], [28, 398, 382, 685], [112, 22, 468, 309],
  [671, 184, 957, 403], [944, 362, 1216, 581], [925, 102, 1195, 357], [1097, 192, 1371, 447], [765, 644, 1035, 899],
  [1047, 572, 1291, 791], [377, 234, 545, 297], [301, 310, 621, 373],
  // the Old House's, south-west of its circle on the town's rim (Old House step 4)
  [664, 624, 768, 798],
];
// Points along a cubic, for the gateway roads and the coast.
function cubicPoints([p0, p1, p2, p3], steps = 16) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
const KEEP_POINTS = [
  ...GATEWAYS.flatMap((g) => cubicPoints(g.road).map(([x, y]) => [x, y, 14])),
  ...GATEWAYS.map((g) => [g.road[3][0], g.road[3][1], 20]),
  ...RIVER.map(([x, y]) => [x, y, 24]), ...LAKE.map(([x, y]) => [x, y, 16]), [POND.x, POND.y, POND.r + 14],
  ...[...Object.values(CAMP_AT), ...Object.values(WORLD_CAMP_AT)].map(([x, y]) => [x, y, 52]),
];

// The coast as a line of points (her coast, then on under the Docks as the
// sea is drawn), and where land ends at a given y.
const COAST_LINE = (() => {
  const [c0, ...cs] = COAST;
  const out = [[c0[0], -2000], c0];
  for (let i = 0; i + 2 < cs.length; i += 3) out.push(...cubicPoints([out[out.length - 1], cs[i], cs[i + 1], cs[i + 2]]).slice(1));
  out.push(...cubicPoints([out[out.length - 1], [820, 900], [760, 960], [750, 1100]]).slice(1), [750, 3000]);
  return out;
})();
export function coastX(y) {
  for (let i = 1; i < COAST_LINE.length; i++) {
    const [ax, ay] = COAST_LINE[i - 1], [bx, by] = COAST_LINE[i];
    if ((ay <= y && y <= by) || (by <= y && y <= ay)) return by === ay ? Math.min(ax, bx) : ax + ((y - ay) / (by - ay)) * (bx - ax);
  }
  return 750;
}

// How far a point is from everything the countryside keeps clear of (less
// than 0 is inside it).
function clearance(x, y, placeClear = PLACE_CLEAR) {
  let d = Infinity;
  for (const p of PLACES) d = Math.min(d, Math.hypot(x - p.x, y - p.y) - p.r - placeClear);
  d = Math.min(d, Math.hypot(x - ROOFTOPS_SPOT.x, y - ROOFTOPS_SPOT.y) - ROOFTOPS_SPOT.r - 8);
  for (const [x0, y0, x1, y1] of LABEL_ROOM) {
    const dx = Math.max(x0 - ROOM_PAD - x, 0, x - x1 - ROOM_PAD), dy = Math.max(y0 - y, 0, y - y1);
    d = Math.min(d, dx || dy ? Math.hypot(dx, dy) : -1);
  }
  for (const [kx, ky, kr] of KEEP_POINTS) d = Math.min(d, Math.hypot(x - kx, y - ky) - kr);
  return d;
}
// A shape's outline, every few units.
function along(points, closed) {
  const out = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
    for (let s = 0; s < steps; s++) out.push([ax + ((bx - ax) * s) / steps, ay + ((by - ay) * s) / steps]);
  }
  if (!closed) out.push(points[points.length - 1]);
  return out;
}
const clearOf = (points, closed, pad, placeClear) => along(points, closed).every(([x, y]) => clearance(x, y, placeClear) >= pad);
const onLand = (x, y, pad) => x < coastX(y) - pad;

// ---- the patchwork ----

// One lattice of fields over the world and a little past it. Each corner is
// nudged by its own hash, so neighbouring fields share their corners.
const COL = 118, ROW = 98, NUDGE = 20;
const X0 = -420, Y0 = -356, COLS = 17, ROWS = 18;
const corner = (i, j) => {
  const x = X0 + i * COL, y = Y0 + j * ROW;
  return [r1(x + (rand(i, j, 1) - 0.5) * 2 * NUDGE), r1(y + (rand(i, j, 2) - 0.5) * 2 * NUDGE)];
};
// The fade (ui/countryside.js) is an ellipse round the world's middle: past
// FADE_END everything is the paler meadow, so no fields are made there.
export const FADE = Object.freeze({ cx: 750, cy: 440, rx: 1500, ry: 1050, start: 0.62, end: 0.98 });
const inFade = (x, y) => Math.hypot((x - FADE.cx) / FADE.rx, (y - FADE.cy) / FADE.ry) < FADE.end;

// Field tones: 0 and 1 soft greens, 2 a pale gold, 3 a deeper meadow green.
export const FIELD_TONES = Object.freeze(['#c9dca4', '#d9e6bd', '#e9e1b2', '#bfd497']);
// A field's furrows: lines this far apart, inset from its hedges.
const FURROW_GAP = 11, FURROW_INSET = 7;

// The lines across a convex field at an angle, inset from its edge.
function furrowsOf(quad, angle) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const inner = quad.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy);
    return [x + ((cx - x) / d) * FURROW_INSET * 1.4, y + ((cy - y) / d) * FURROW_INSET * 1.4];
  });
  const ux = Math.cos(angle), uy = Math.sin(angle), nx = -uy, ny = ux;
  const offs = inner.map(([x, y]) => (x - cx) * nx + (y - cy) * ny);
  const lines = [];
  for (let o = Math.ceil(Math.min(...offs) / FURROW_GAP) * FURROW_GAP; o <= Math.max(...offs); o += FURROW_GAP) {
    // where the line (cx, cy) + o n + t u crosses the inset field
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = inner[k], [bx, by] = inner[(k + 1) % 4];
      const da = (ax - cx) * nx + (ay - cy) * ny - o, db = (bx - cx) * nx + (by - cy) * ny - o;
      if ((da <= 0 && db >= 0) || (da >= 0 && db <= 0)) {
        const s = da === db ? 0 : da / (da - db);
        const px = ax + (bx - ax) * s, py = ay + (by - ay) * s;
        const t = (px - cx) * ux + (py - cy) * uy;
        lo = Math.min(lo, t); hi = Math.max(hi, t);
      }
    }
    if (hi - lo > 8) lines.push([[r1(cx + o * nx + lo * ux), r1(cy + o * ny + lo * uy)], [r1(cx + o * nx + hi * ux), r1(cy + o * ny + hi * uy)]]);
  }
  return lines;
}

// A point of the lattice at half steps: (2i, 2j) is a field's corner, odd
// steps the middle of its edge or of the field.
function node(I, J) {
  const i = Math.floor(I / 2), j = Math.floor(J / 2), oi = I % 2, oj = J % 2;
  const a = corner(i, j), b = corner(i + oi, j), c = corner(i + oi, j + oj), d = corner(i, j + oj);
  return [r1((a[0] + b[0] + c[0] + d[0]) / 4), r1((a[1] + b[1] + c[1] + d[1]) / 4)];
}
const cellAt = (I, J, k) => [node(I, J), node(I + k, J), node(I + k, J + k), node(I, J + k)];

// The patchwork: every whole field with room for it; where a whole field
// would touch something, its four quarters that have room (small paddocks
// close to the places), so the green reaches into the gaps between them.
function makePatchwork() {
  const fields = [], meadows = [], whole = new Set(), cells = [];
  const add = (I, J, k, salt) => {
    const quad = cellAt(I, J, k);
    const cx = quad.reduce((t, p) => t + p[0], 0) / 4, cy = quad.reduce((t, p) => t + p[1], 0) / 4;
    if (!inFade(cx, cy) || !onLand(cx, cy, k === 2 ? -30 : -10) || !clearOf(quad, true, 0)) return false;
    cells.push([I, J, k]);
    const pick = rand(I, J, salt, 3);
    // about one in five stays open meadow, with flowers in it
    if (pick < 0.2) { meadows.push({ quad, cx, cy, i: I, j: J + salt }); return true; }
    const tone = pick < 0.44 ? 0 : pick < 0.66 ? 1 : pick < 0.84 ? 2 : 3;
    // golds are crops (always furrowed), the greens now and then
    const furrowed = tone === 2 || (tone !== 3 && rand(I, J, salt, 4) < 0.3);
    const angle = (Math.floor(rand(I, J, salt, 5) * 6) * Math.PI) / 6;
    fields.push(Object.freeze({ quad: Object.freeze(quad), tone, furrows: Object.freeze(furrowed ? furrowsOf(quad, angle) : []) }));
    return true;
  };
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      if (add(2 * i, 2 * j, 2, 0)) whole.add(`${i},${j}`);
      else for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) add(2 * i + a, 2 * j + b, 1, 9);
    }
  }
  // hedgerows: about one edge in two, each drawn once and bowed a little
  // by hand; a quarter leaves its outer edge to a whole field beside it
  const hedges = [], seen = new Set();
  const edge = ([I0, J0], [I1, J1]) => {
    const key = [`${I0},${J0}`, `${I1},${J1}`].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    if (rand(I0 + I1, J0 + J1, 6) > 0.55) return;
    const a = node(I0, J0), b = node(I1, J1);
    const bow = (rand(I0, J0, I1, J1, 8) - 0.5) * 10;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const mid = [r1((a[0] + b[0]) / 2 + ((b[1] - a[1]) / len) * bow), r1((a[1] + b[1]) / 2 - ((b[0] - a[0]) / len) * bow)];
    hedges.push(Object.freeze([a, mid, b]));
  };
  for (const [I, J, k] of cells) {
    const ks = [[I, J], [I + k, J], [I + k, J + k], [I, J + k]];
    for (let e = 0; e < 4; e++) {
      const p = ks[e], q = ks[(e + 1) % 4];
      if (k === 1) {
        // an outer edge of a quarter lies on its parent's edge (both ends
        // on it): leave it when the field across is whole
        const pi = Math.floor(I / 2), pj = Math.floor(J / 2);
        const across = p[0] === q[0] && (p[0] % 2 === 0) ? [p[0] === 2 * pi ? pi - 1 : pi + 1, pj]
          : p[1] === q[1] && (p[1] % 2 === 0) ? [pi, p[1] === 2 * pj ? pj - 1 : pj + 1] : null;
        if (across && whole.has(`${across[0]},${across[1]}`)) continue;
      }
      edge(p, q);
    }
  }
  return { fields, meadows, hedges };
}

// ---- hand-placed things ----

// Tree clumps (a few crowns each) and lone bushes, placed by hand in the
// open land; any that would crowd a place are left out.
const CLUMPS = [
  [62, 70, 3], [96, 248, 2], [-40, 420, 3], [12, 612, 2], [150, 742, 3], [474, 728, 2], [640, 770, 3], [738, 722, 2],
  [936, 66, 3], [1004, 42, 2], [1268, 160, 2], [1232, 552, 2], [1028, 640, 2], [300, -60, 3], [1150, -40, 2],
  [-150, 180, 2], [420, 950, 3], [60, 960, 2], [-260, 760, 3],
];
const BUSHES = [[30, 330], [200, 812], [560, 840], [702, 852], [930, 150], [1190, 70], [1300, 470], [1070, 735], [-90, 70], [250, 20]];
// The east one moved north (1266, 515 -> 1248, 128) when Lighthouse Point's circle took the coast it stood on, and again
// (1248, 128 -> 1118, 44) when the Greenhouse's circle (1215, 150, r 60) took that spot.
// (the first pond moved from (1118, 44) when the Treehouse village's circle took that corner)
const PONDS_AT = [[1010, 40, 20, 13], [-70, 690, 26, 16]];

function makeTrees() {
  const trees = [];
  CLUMPS.forEach(([x, y, n], c) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rand(c, k, 9) * 1.2;
      const d = n === 1 ? 0 : 9 + rand(c, k, 10) * 3;
      trees.push([r1(x + Math.cos(a) * d), r1(y + Math.sin(a) * d * 0.7), r1(10 + rand(c, k, 11) * 4)]);
    }
  });
  for (const [x, y] of BUSHES) trees.push([x, y, 7]);
  return trees.filter(([x, y, r]) => clearance(x, y) >= r + 6 && onLand(x, y, r + 14));
}

// Little bunches of flowers in the open meadow: white, yellow and pink dots.
function makeFlowers(meadows) {
  const dots = [[], [], []];
  for (const { quad, cx, cy, i, j } of meadows) {
    const n = 2 + Math.floor(rand(i, j, 12) * 2);
    for (let b = 0; b < n; b++) {
      const bx = cx + (rand(i, j, b, 13) - 0.5) * 60, by = cy + (rand(i, j, b, 14) - 0.5) * 50;
      for (let k = 0; k < 5; k++) {
        const x = r1(bx + (rand(i, j, b, k, 15) - 0.5) * 22), y = r1(by + (rand(i, j, b, k, 16) - 0.5) * 16);
        if (clearance(x, y) >= 6 && onLand(x, y, 14) && clearOf(quad, true, 0)) dots[Math.floor(rand(i, j, b, k, 17) * 3)].push([x, y]);
      }
    }
  }
  return dots.map((d) => Object.freeze(d.map((p) => Object.freeze(p))));
}

// Lanes: one carries on south from under her long path, between the River
// and the Woods, to the world's edge, one branches west from it, one winds down from the north
// between the Moor and the Fairground and stops short of the Gorge.
const LANES_AT = [
  [[412, 668], [404, 710], [404, 748], [384, 800], [350, 852], [340, 920], [358, 990], [340, 1060]],
  [[394, 772], [320, 790], [252, 776], [180, 800], [100, 788], [20, 812], [-70, 800], [-160, 820]],
  [[880, -330], [868, -230], [896, -140], [870, -60], [884, 20], [860, 90], [872, 150]],
];

function make() {
  const { fields, meadows, hedges } = makePatchwork();
  const lanes = LANES_AT.filter((l) => clearOf(l, false, 8, 0));
  const ponds = PONDS_AT.filter(([x, y, rx]) => clearance(x, y) >= rx + 6 && onLand(x, y, rx + 14));
  return Object.freeze({
    fields: Object.freeze(fields),
    hedges: Object.freeze(hedges),
    trees: Object.freeze(makeTrees().map((t) => Object.freeze(t))),
    flowers: Object.freeze(makeFlowers(meadows)),
    ponds: Object.freeze(ponds.map((p) => Object.freeze(p))),
    lanes: Object.freeze(lanes.map((l) => Object.freeze(l.map((p) => Object.freeze(p))))),
  });
}

// The countryside: fields ({ quad, tone, furrows }), hedges (each a bowed
// line a, bow, b), trees and bushes ([x, y, r]), flowers (three lists of
// dots: white, yellow, pink), ponds ([x, y, rx, ry]) and lanes (points).
export const COUNTRYSIDE = make();
