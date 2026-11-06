import * as THREE from 'three';

// =============================================================================
// polish-docks2: warehouses with character.
// =============================================================================
//
// The Docks' five warehouse() buildings were pastel boxes. This file bakes
// their masonry (plinth, corner piers, brick bands, string course, cornice),
// their window trim (frames, glazing bars, stone sills and heads) and their
// downpipes into the geometry of meshes warehouse() ALREADY makes, so nothing
// a world build is measured by moves:
//
//   * no new mesh (silhouette's per-area mesh pins, the caster count);
//   * no Math.random draw on the real stream: warehouse() calls bakeWarehouse
//     inside withLocalUuids, and nothing here calls roundedBox/box/surfBox/mat/
//     litMaterial — those fill caches whose FIRST entry draws a uuid, so one
//     made here would shift the next area's draws (waterlooks BUILD_DRAWS);
//   * no new merge class: every baked geometry carries the same four
//     attributes (position, normal, uv, color) and is indexed, so the four
//     parapet lips still merge into one draw.
//
// Colours in the `color` attribute are LINEAR (THREE.Color(hex) components,
// already converted from sRGB). Two conventions, per mesh:
//   * MULTIPLIER — the body and deck keep their material colour (and its
//     brick/siding/shingle map) and the vertex colour scales it around 1;
//   * ABSOLUTE — the lips, door and lintel trim get material colour white and
//     carry their real colours per vertex.
//
// Placement variation is a pure hash of the building's (x, z), never
// Math.random: two co-walkers must see the same frame colour on the same wall.

// builder.js's private hash01, copied (as docksdressing.js does): a pure
// function of its arguments.
export function hash01(x, z, salt) {
  const h = Math.sin(x * 12.9898 + z * 78.233 + salt * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const scale = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
const grey = (k) => [k, k, k];

// Painted window-frame colours, per building: cream, dark green, oxblood,
// off-white. Stone for sills and heads.
const FRAME_HEX = [0xd8cdb4, 0x3f5a4a, 0x6a3530, 0xe2e0d8];
const STONE_HEX = 0xb3a68e;
// Door paint for Task 2's loading doors (the shipped door stays 0x53433a).
const DOOR_HEX = [0x53433a, 0x2f4a5a, 0x5a3a2e, 0x3e4a36];

// A face: its outward normal, the "right" direction seen from outside, and
// "up", with right x up = normal so (bl, br, tr) is counter-clockwise from
// outside.
const FACES = {
  '+x': { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
  '-x': { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0] },
  '+y': { n: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
  '-y': { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  '+z': { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  '-z': { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * pieceBuffer() — accumulates axis-aligned boxes and quads into one indexed
 * BufferGeometry with position, normal, uv and color.
 *
 * UVs are planar per face in METRES, scaled by `uvScale` [su, sv]: u is the
 * face's right-hand coordinate, v its up coordinate, both measured in the
 * buffer's own frame. warehouse()'s body passes [1/w, 1/h], which is the
 * basis its material's repeat was derived for, so brick courses keep one size
 * on every face of the building.
 */
export function pieceBuffer() {
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const idx = [];

  // Four corners in (bl, br, tr, tl) order, one colour per corner.
  function quad(corners, n, colors, uvScale = [1, 1], face = null) {
    const f = face ?? Object.values(FACES).find((q) => dot(q.n, n) > 0.999);
    const base = pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const p = corners[i];
      pos.push(p[0], p[1], p[2]);
      nrm.push(n[0], n[1], n[2]);
      uv.push(dot(p, f.r) * uvScale[0], dot(p, f.u) * uvScale[1]);
      const c = colors[i] ?? colors;
      col.push(c[0], c[1], c[2]);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  // A face of an axis-aligned box. `rgb` is one colour or {bottom, top} (a
  // vertical gradient on the side faces).
  function face(key, c, half, rgb, uvScale) {
    const f = FACES[key];
    const hr = Math.abs(dot(half, f.r));
    const hu = Math.abs(dot(half, f.u));
    const hn = Math.abs(dot(half, f.n));
    const at = (sr, su) => [0, 1, 2].map((k) => c[k] + f.n[k] * hn + f.r[k] * hr * sr + f.u[k] * hu * su);
    const lo = rgb.bottom ?? rgb, hi = rgb.top ?? rgb;
    const colors = f.u[1] !== 0 ? [lo, lo, hi, hi] : [lo, lo, lo, lo];
    quad([at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)], f.n, colors, uvScale, f);
  }

  /**
   * box(cx, cy, cz, sx, sy, sz, rgb, { skip, uvScale, top }) — an axis-aligned
   * box. `skip` lists faces ('+x', '-y', ...) to leave out: the one against a
   * wall, a bottom on the ground, ends that butt into a neighbour. `top`
   * overrides the +y face's colour.
   */
  function box(cx, cy, cz, sx, sy, sz, rgb, { skip = [], uvScale, top } = {}) {
    const c = [cx, cy, cz];
    const half = [sx / 2, sy / 2, sz / 2];
    for (const key of Object.keys(FACES)) {
      if (skip.includes(key)) continue;
      face(key, c, half, key === '+y' && top ? top : rgb, uvScale);
    }
  }

  function toGeometry() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }

  return { box, quad, toGeometry, get vertexCount() { return pos.length / 3; } };
}

/**
 * lookFor(x, z, w, d, h, clear) — the per-building picks, a pure function of
 * the building's footprint and the perch points on or near its roof.
 *   roofline: 'flat' when any `clear` point is within 1.5 m of the footprint
 *             (a cat stands there), else 'stepped' or 'sawtooth' by hash.
 *   frame, stone, door: linear RGB.
 *   bay: which gap between window columns on the canal (-z) face takes the
 *        loading bay (0 .. cols-2), for Task 2.
 *   drift: four per-face wall multipliers (+z, -z, +x, -x) near 1.
 */
export function lookFor(x, z, w, d, h, clear = []) {
  const near = clear.some((p) => Math.max(Math.abs(p.x - x) - w / 2, Math.abs(p.z - z) - d / 2, 0) <= 1.5);
  const roofline = near ? 'flat' : hash01(x, z, 1) < 0.5 ? 'stepped' : 'sawtooth';
  const pick = (arr, salt) => arr[Math.min(arr.length - 1, Math.floor(hash01(x, z, salt) * arr.length))];
  const cols = Math.max(2, Math.floor(w / 2.6));
  return {
    roofline,
    frame: lin(pick(FRAME_HEX, 2)),
    stone: lin(STONE_HEX),
    door: lin(pick(DOOR_HEX, 3)),
    bay: Math.min(cols - 2, Math.floor(hash01(x, z, 4) * (cols - 1))),
    drift: [5, 6, 7, 8].map((s) => 0.97 + 0.06 * hash01(x, z, s)),
  };
}

// --- the masonry -------------------------------------------------------------

const PLINTH_H = 0.55;
const PLINTH_OUT = 0.08;
const PIER_W = 0.34;
const PIER_OUT = 0.06;
const CORNICE_OUT = 0.09;
const SILL_OUT = 0.11;

// The wall's horizontal bands, bottom to top: [y0, y1, bottom k, top k].
function wallBands(h, rows) {
  const out = [[PLINTH_H, PLINTH_H + 0.35, 0.8, 1]];
  let y = PLINTH_H + 0.35;
  for (const wy of rows) {
    const y0 = wy + 0.42, y1 = wy + 0.57;
    if (y1 > h - 0.24) continue; // no room under the cornice (the low shed)
    out.push([y, y0, 1, 1], [y0, y1, 0.82, 0.82]);
    y = y1;
  }
  out.push([y, h, 1, 1]);
  return out;
}

function bakeBody(w, d, h, rows, look) {
  const pb = pieceBuffer();
  const uvScale = [1 / w, 1 / h];
  const [dz1, dz0, dx1, dx0] = look.drift;
  // The four walls in crisp horizontal bands (separate vertices per band). No
  // top or bottom: the deck covers the one, the ground the other, and the
  // plinth ring covers the wall below PLINTH_H.
  const walls = [
    ['+z', [0, 0, d / 2], w, dz1], ['-z', [0, 0, -d / 2], w, dz0],
    ['+x', [w / 2, 0, 0], d, dx1], ['-x', [-w / 2, 0, 0], d, dx0],
  ];
  for (const [key, c, span, k] of walls) {
    const f = FACES[key];
    for (const [y0, y1, k0, k1] of wallBands(h, rows)) {
      const at = (s, y) => [0, 1, 2].map((i) => c[i] + f.r[i] * span / 2 * s + (i === 1 ? y : 0));
      pb.quad([at(-1, y0), at(1, y0), at(1, y1), at(-1, y1)], f.n,
        [grey(k * k0), grey(k * k0), grey(k * k1), grey(k * k1)], uvScale, f);
    }
  }
  // Proud plinth ring, darker, its cap a touch lighter. The long-face runs
  // cover the corners; the gable runs fit between them.
  const plinth = { bottom: grey(0.6), top: grey(0.66) };
  const cap = grey(0.74);
  for (const s of [1, -1]) {
    pb.box(0, PLINTH_H / 2, s * (d / 2 + PLINTH_OUT / 2), w + 2 * PLINTH_OUT, PLINTH_H, PLINTH_OUT, plinth,
      { skip: [s > 0 ? '-z' : '+z', '-y'], uvScale, top: cap });
    pb.box(s * (w / 2 + PLINTH_OUT / 2), PLINTH_H / 2, 0, PLINTH_OUT, PLINTH_H, d, plinth,
      { skip: [s > 0 ? '-x' : '+x', '-y', '+z', '-z'], uvScale, top: cap });
  }
  // Corner piers, standing on the plinth, up to the deck.
  const pierH = h - PLINTH_H;
  const ps = PIER_W + PIER_OUT;
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      pb.box(sx * (w / 2 + PIER_OUT - ps / 2), PLINTH_H + pierH / 2, sz * (d / 2 + PIER_OUT - ps / 2), ps, pierH, ps,
        { bottom: grey(1.04), top: grey(1.08) },
        { skip: [sx > 0 ? '-x' : '+x', sz > 0 ? '-z' : '+z', '-y'], uvScale });
    }
  }
  // A string course between the window rows, between the piers.
  if (rows.length > 1) {
    const y = (rows[0] + 0.57 + rows[1] - 0.42) / 2;
    const run = 0.1, out = 0.04;
    for (const s of [1, -1]) {
      pb.box(0, y, s * (d / 2 + out / 2), w - 2 * PIER_W, run, out, grey(0.88),
        { skip: [s > 0 ? '-z' : '+z', '+x', '-x'], uvScale, top: grey(0.95) });
      pb.box(s * (w / 2 + out / 2), y, 0, out, run, d - 2 * PIER_W, grey(0.88),
        { skip: [s > 0 ? '-x' : '+x', '+z', '-z'], uvScale, top: grey(0.95) });
    }
  }
  // The cornice band just under the parapet, proud of the piers.
  const cy = h - 0.14, ch = 0.16;
  for (const s of [1, -1]) {
    pb.box(0, cy, s * (d / 2 + CORNICE_OUT / 2), w + 2 * CORNICE_OUT, ch, CORNICE_OUT, { bottom: grey(0.7), top: grey(0.86) },
      { skip: [s > 0 ? '-z' : '+z'], uvScale });
    pb.box(s * (w / 2 + CORNICE_OUT / 2), cy, 0, CORNICE_OUT, ch, d, { bottom: grey(0.7), top: grey(0.86) },
      { skip: [s > 0 ? '-x' : '+x', '+z', '-z'], uvScale });
  }
  const geo = pb.toGeometry();
  // Authored from the ground up; the body mesh sits at y = h / 2.
  geo.translate(0, -h / 2, 0);
  // viewclear2 reads the footprint off children[0].geometry.parameters.
  geo.parameters = { width: w, height: h, depth: d };
  return geo;
}

// --- the window trim ----------------------------------------------------------

// One pane's frame ring, glazing-bar cross, sill and head, in the GROUP's
// frame. `axis` is the face's normal axis ('x' or 'z'), `s` its sign, `wall`
// the wall plane's coordinate, `a` the pane centre along the face, `y` its
// centre height.
function trimPane(pb, axis, s, wall, a, y, look) {
  const W = 0.8, H = 0.7, F = 0.07;
  // place(along, up, out, sAlong, sUp, sOut, rgb, skipLocal): local face
  // names are 'back' (into the wall), 'front', 'l', 'r', 'top', 'bottom'.
  const place = (al, up, out, sa, su, so, rgb, skipLocal = [], opts = {}) => {
    const skip = skipLocal.map((k) => {
      if (k === 'back') return axis === 'z' ? (s > 0 ? '-z' : '+z') : (s > 0 ? '-x' : '+x');
      if (k === 'front') return axis === 'z' ? (s > 0 ? '+z' : '-z') : (s > 0 ? '+x' : '-x');
      if (k === 'top') return '+y';
      if (k === 'bottom') return '-y';
      return axis === 'z' ? (k === 'l' ? '-x' : '+x') : (k === 'l' ? '-z' : '+z');
    });
    const o = wall + s * out;
    if (axis === 'z') pb.box(a + al, y + up, o, sa, su, so, rgb, { skip, ...opts });
    else pb.box(o, y + up, a + al, so, su, sa, rgb, { skip, ...opts });
  };
  const frame = look.frame;
  const fo = 0.075; // just past the pane's front (wall + 0.06)
  // Frame ring around the pane's outline: full-height sides, top and bottom
  // rails between them.
  for (const side of [-1, 1]) place(side * (W / 2 + F / 2), 0, fo / 2, F, H + 2 * F, fo, frame, ['back']);
  for (const side of [-1, 1]) place(0, side * (H / 2 + F / 2), fo / 2, W, F, fo, frame, ['back', 'l', 'r']);
  // Glazing bars: a cross just in front of the glass.
  const bt = 0.035, b0 = 0.06, bd = fo - b0;
  place(0, 0, b0 + bd / 2, bt, H, bd, frame, ['back', 'top', 'bottom']);
  place(0, 0, b0 + bd / 2, W, bt, bd, frame, ['back', 'l', 'r']);
  // Stone sill under the frame, stone head over it.
  const stone = look.stone;
  const sh = 0.07;
  place(0, -(H / 2 + F + sh / 2), SILL_OUT / 2, 1.0, sh, SILL_OUT, scale(stone, 0.86), ['back'], { top: stone });
  const hh = 0.1, ho = 0.05;
  place(0, H / 2 + F + hh / 2, ho / 2, W + 2 * F + 0.06, hh, ho, scale(stone, 0.92), ['back'], { top: stone });
}

function bakeLintel(lintel, panes, w, d, look) {
  const pb = pieceBuffer();
  // The shipped lintel piece, at its own origin.
  pb.box(0, 0, 0, 2.0, 0.16, 0.2, lin(0x5e5450));
  // The trim is authored in the group's frame; shift it into the lintel's.
  const lp = lintel.position;
  const trim = pieceBuffer();
  for (const p of panes) {
    const gable = p.geometry.parameters.width < p.geometry.parameters.depth;
    if (gable) {
      const s = Math.sign(p.position.x);
      trimPane(trim, 'x', s, s * w / 2, p.position.z, p.position.y, look);
    } else {
      const s = Math.sign(p.position.z);
      trimPane(trim, 'z', s, s * d / 2, p.position.x, p.position.y, look);
    }
  }
  return mergeInto(pb, trim, [-lp.x, -lp.y, -lp.z]);
}

// --- the parapet lips and downpipes ---------------------------------------------

function bakeLip(lip, lw, ld, roofRgb, extra) {
  const pb = pieceBuffer();
  pb.box(0, 0, 0, lw, lip.geometry.parameters.height, ld, roofRgb, { skip: ['-y'] });
  if (!extra) return pb.toGeometry();
  const lp = lip.position;
  return mergeInto(pb, extra, [-lp.x, -lp.y, -lp.z]);
}

// Two downpipes with hopper heads, one on each long face near opposite
// corners, inside the corner piers. Group frame.
function downpipes(w, d, h, roofRgb) {
  const pb = pieceBuffer();
  const pipe = scale(roofRgb, 0.8);
  const px = w / 2 - PIER_W - 0.16;
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    const z = sz * (d / 2 + 0.07);
    const top = h - 0.46; // the hopper sits under the cornice, not through it
    // the pipe, down to just above the ground, and a shoe kicking out at its foot
    pb.box(sx * px, (0.12 + top) / 2, z, 0.09, top - 0.12, 0.09, pipe, { skip: ['+y'] });
    pb.box(sx * px, 0.08, sz * (d / 2 + 0.09), 0.09, 0.08, 0.06, pipe, { skip: ['-y', sz > 0 ? '-z' : '+z'] });
    // the hopper head, wider, tucked under the cornice
    pb.box(sx * px, top + 0.1, sz * (d / 2 + 0.06), 0.2, 0.2, 0.12, scale(roofRgb, 0.72),
      { skip: [sz > 0 ? '-z' : '+z'], top: scale(roofRgb, 0.5) });
  }
  return pb;
}

// Appends `src`'s pieces into `dst`, offset by `t`, and returns dst's geometry.
function mergeInto(dst, src, t) {
  const a = dst.toGeometry();
  const b = src.toGeometry();
  const n = a.attributes.position.count;
  const join = (name, size, offset) => {
    const x = a.attributes[name].array, y = b.attributes[name].array;
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    for (let i = 0; i < y.length; i++) out[x.length + i] = y[i] + (offset ? offset[i % size] : 0);
    return new THREE.Float32BufferAttribute(out, size);
  };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', join('position', 3, t));
  geo.setAttribute('normal', join('normal', 3));
  geo.setAttribute('uv', join('uv', 2));
  geo.setAttribute('color', join('color', 3));
  const ia = Array.from(a.index.array), ib = Array.from(b.index.array, (i) => i + n);
  geo.setIndex(ia.concat(ib));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * bakeWarehouse(g, { x, z, w, d, h, roofColor, look }) — swaps the geometry of
 * warehouse()'s own meshes for baked, vertex-coloured ones. MUST run inside
 * withLocalUuids (each new BufferGeometry draws a uuid). Children are read in
 * warehouse()'s fixed order: body, deck, four lips, panes..., door, lintel.
 * The cached roundedBox geometries are only dereferenced, never touched.
 */
export function bakeWarehouse(g, { x, z, w, d, h, roofColor, look: opts = {} }) {
  const look = lookFor(x, z, w, d, h, opts.clear ?? []);
  const kids = g.children;
  const body = kids[0], deck = kids[1], lips = kids.slice(2, 6);
  const lintel = kids[kids.length - 1], door = kids[kids.length - 2];
  const panes = kids.filter((m) => m.userData.window);
  const rows = h > 3.4 ? [1.1, 2.7] : [1.1];
  const roofRgb = lin(roofColor);

  body.geometry = bakeBody(w, d, h, rows, look);
  body.material.vertexColors = true;

  // The deck: the same slab, its top in the shingle map's w x d basis.
  const dp = pieceBuffer();
  dp.box(0, 0, 0, w, 0.12, d, grey(1), { skip: ['-y'], uvScale: [1 / w, 1 / d] });
  deck.geometry = dp.toGeometry();
  deck.material.vertexColors = true;

  // Lips: [w, 0.16 deep, on +z], [w, on -z], [on +x], [on -x]; lip 0 carries
  // the downpipes.
  const dims = [[w, 0.16], [w, 0.16], [0.16, d], [0.16, d]];
  lips.forEach((lip, i) => {
    lip.geometry = bakeLip(lip, dims[i][0], dims[i][1], roofRgb, i === 0 ? downpipes(w, d, h, roofRgb) : null);
    lip.material.color.set(0xffffff);
    lip.material.vertexColors = true;
  });

  // The door: the shipped slab in its shipped colour, its face in the wood
  // map's 1.6 x 2.2 basis.
  const doorRgb = [door.material.color.r, door.material.color.g, door.material.color.b];
  const db = pieceBuffer();
  db.box(0, 0, 0, 1.6, 2.2, 0.12, doorRgb, { skip: ['-z', '-y'], uvScale: [1 / 1.6, 1 / 2.2] });
  door.geometry = db.toGeometry();
  door.material.color.set(0xffffff);
  door.material.vertexColors = true;

  lintel.geometry = bakeLintel(lintel, panes, w, d, look);
  lintel.material.color.set(0xffffff);
  lintel.material.vertexColors = true;
  return look;
}
