// The Gorge's rock, drawn from its own ground record: rock terrain and its
// dressing, scree, and the caves' crystals and gold flecks. builder.js's
// materials and hashes are imported back from builder.js: the cycle is safe
// because nothing here calls into builder.js while the modules load. Every
// name exported here is re-exported by builder.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { litMaterial, surfaceProps } from '../render/materials.js';
import { conformTriangles } from './meshconform.js';
import { createRockRelief, strataBand, noise3, CREST_BAND, RELIEF_DEPTH, ROCK_ROW, ROW_MIN } from './rockrelief.js';
import { smoothNormals } from './rocknormals.js';
import { patchRockMaterial, ROCK_SHADE, TALUS_TINT } from './rockshade.js';
import { surfNoMap, clamp01, smoothstep, hash01, mergedNoCast } from './builder.js';

// =============================================================================
// THE GORGE'S ROCK, drawn from its own ground record (G4).
// =============================================================================
// rockTerrain takes the same shape records the ground is built from (walkable
// shapes, rock masses and cave/den ceilings; see world/gorgeshape.js) and
// draws them, so a rim the cat stops at and the rock she sees can never
// disagree. Nothing here imports the Gorge: the shapes are passed in.
//
// A shape is { minX, maxX, minZ, maxZ, y0, y1, along: 'z'|null, kind }, flat
// at y0 or a ramp along z from y0 at minZ to y1 at maxZ. Each one is a solid
// column over its rectangle:
//   * a mass, a walkable shape or a lip: from 0 up to its top;
//   * a ceiling cap: from the ceiling up to the top of the rock it was cut
//     from, which is the highest mass that shares an edge with it.
// Only EXPOSED faces are drawn. A side face is drawn over the heights where
// the column just outside it is empty: above its ground and below its own
// ceiling, or above its cap. So a wall runs down to the lower ground beside
// it (or to 0), two masses of one height share no face, a lip is a column from
// its lower neighbour's ground up to its top, and faces on the outermost
// edges of the map's shapes (the +-62 frame) are not drawn. Tops are always
// drawn: the highest camera sees over the rims (G6).
//
// How finely it is cut (the cuts are there so the relief has vertices to
// move):
//   * every side face, in every mesh, is cut into steps along its edge (at
//     each boundary of a shape touching the edge's line, where what lies
//     outside can change, then into cells about ROCK_CELL across) and each
//     step into rows at whole multiples of ROCK_ROW, clipped to the face's
//     band (a ramp's sloped edge cuts through the rows; a row line within
//     ROW_MIN of a face's foot or top is left out), so the rows of faces
//     meeting at a vertical line up;
//   * a rock top (a mass or a ceiling cap) has a band of cells CREST_BAND
//     deep along each side that is a crest (some face rises to its edge),
//     cut at that edge's step breakpoints, round the inner rectangle as one
//     quad (the whole top gridded when it is too narrow for both). A side
//     with no face up to it (a seam with rock as high, or the frame) has no
//     crest to break and no band. Walkable and lip tops are one quad.
// Then the three meshes are made CONFORMING together (world/meshconform.js):
// positions quantised to 1e-6, and every triangle with another's vertex
// inside one of its edges (a T-junction: a top's edge against the wall
// steps below it, a ramp's sloped edge against the rows beside it) fanned
// through that vertex. So moving each vertex by a pure function of its
// position cannot open a crack.
//
// The relief (world/rockrelief.js; `relief: false` draws the shell unmoved).
// One field per call moves every vertex by createRockRelief's at(), asked
// once per distinct quantised position, so every copy of a vertex moves
// alike and the shell stays closed; normals are then recomputed (flat). Its
// bounds, which the gameplay relies on:
//   * walkable tops (every walk, cave and den floor, the camp den) and the
//     wall feet on them don't move, so every seam with them stays closed;
//   * a wall over walkable ground stands at most ROCK_PROUD (0.15 m) proud of
//     its line, and inside a cave or den at most CAVE_PROUD (0.02 m) proud;
//     it may be recessed up to RELIEF_DEPTH plus a corner cut, but never more
//     than half the rock's thickness, so the two faces of thin rock never
//     cross;
//   * a ceiling's underside never comes down (dy is 0 on it);
//   * a rock top within CREST_BAND of a drop (a crest) is jagged up or down
//     (at most about 1 m up on the 20 m rims), except in the `keep` discs,
//     where things stand on the rock and its top stays still.
//
// Three merged meshes:
//   rockFaces  masses and ceiling caps; vertex colours from ROCK_LOW (a muted
//              cool brown) at y 0 to ROCK_HIGH (pale sandstone) at the
//              highest top, by each vertex's y BEFORE the relief, in the
//              relief's own 1.1 m strata bands (so colour and shelves line
//              up): each band +-ROCK_STRATA, alternately tinted warm or cream,
//              and a little darker in a recess (RECESS_DARK at RELIEF_DEPTH).
//              The undercut band over each wall's foot is darker (UNDERCUT_DARK)
//              and faces looking up (ledges, rims) lighter (LEDGE_LIGHT). The
//              crisp strata lines are per pixel (rockshade.js), not here: a
//              vertex colour can only blur across its 1 m row (polish-gorgewall).
//              Casts.
//   ledgeTops  raised walkable shapes: their tops (ramps sloped) and exposed
//              sides, warm sand-grey, one plain material. Casts.
//   lips       the low rock bands at the edges (G3), coloured as the rock.
//              noCast: they are thin, and the sweep would cast anything wide.
// `tint(x, y, z, rgb, recess, foot) => [r, g, b]` (optional) recolours every rock
// colour after rockColour (faces, lips, their dressing; not ledgeTops); give a `tintKey` for the cache.
// The damp foot (rockshade.js TALUS_TINT) and the undercut go on after it.
// All three materials wear rockshade.js's shader patch.
// The dressing (rockDressing, below) is appended to rockFaces and lips after
// their shells: lip stones along every lip, boulders at the wall feet.
// userData.shellTris counts the shells alone; userData.dressing counts
// { lipStones, footBoulders }.
// G4 names a 'stone' surface; materials.js has no such preset (it would warn
// and fall back), so the rock takes 'cobble's light response, as tor() does.
export const ROCK_LOW = 0x7f7062; // a muted brown, warmer than the old cool grey 0x6f6a66 (polish-gorgewall)
export const ROCK_HIGH = 0xc8b496;
export const LEDGE_COLOR = 0xbca682;
// Folds sharper than this keep their edge in the rock's shading (a walk top
// against its wall, a step's corner); gentler ones shade smooth.
export const ROCK_CREASE = 60;
const ROCK_CELL = 1.2; // side faces (and a top's ring) are cut into steps about this wide (was 1.6; finer for polish-gorgerock2)
// ROCK_ROW: walls are cut into rows at whole multiples of this height
// (rockrelief.js's, so the rounded rims' row bound can't drift from it).
// (CREST_BAND, how deep the cut ring round a rock top is, is the relief's own.)
// ROW_MIN: a row line this close to a face's foot or top is left out (no
// slivers); also rockrelief.js's.
const ROCK_STRATA = 0.06; // each strata band is +-6% lighter or darker
const STRATA_WARM = [1.03, 0.99, 0.95]; // alternate bands tinted warm
const STRATA_CREAM = [1.01, 1.01, 1.00]; // and cream
// The deepest recess is this much darker. Was 0.25: the gullies' recess
// changes every 1.2 m along a wall, and a vertex colour that dark smeared into
// soft vertical streaks (survey 8 #1). The relief's own shading shows them.
const RECESS_DARK = 0.1;
const UNDERCUT_DARK = 0.1; // the undercut band over a wall's foot (rockrelief's undercutAt)
const LEDGE_LIGHT = 0.14; // a face looking straight up is this much lighter
const SIDE_EPS = 1e-4; // how far outside a face its neighbour is looked up
const FLAT_EPS = 1e-7; // a face thinner than this is not drawn

// A shape's height at (x, z): flat, or a ramp along z.
function shapeY(s, x, z) {
  if (s.along !== 'z' || s.maxZ === s.minZ) return s.y0;
  const f = Math.min(1, Math.max(0, (z - s.minZ) / (s.maxZ - s.minZ)));
  return s.y0 + f * (s.y1 - s.y0);
}

const strictlyIn = (s, x, z) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ;

// The highest mass touching r along an edge, or overlapping it: how high a
// cave or den ceiling's cap is drawn (exported for test/gorge.test.js).
export function capTopFor(r, masses) {
  let top = -Infinity;
  for (const m of masses) {
    const ox = Math.min(r.maxX, m.maxX) - Math.max(r.minX, m.minX);
    const oz = Math.min(r.maxZ, m.maxZ) - Math.max(r.minZ, m.minZ);
    if ((ox >= 0 && oz > 0) || (ox > 0 && oz >= 0)) top = Math.max(top, m.y0, m.y1);
  }
  return top;
}

// The breakpoints along [t0, t1]: its ends, every cut strictly inside, and
// then cells of about ROCK_CELL between those.
function stepPoints(t0, t1, cuts) {
  const ts = [t0, ...cuts.filter((c) => c > t0 && c < t1), t1].sort((a, c) => a - c);
  const out = [t0];
  for (let i = 0; i + 1 < ts.length; i++) {
    const len = ts[i + 1] - ts[i];
    const n = Math.max(1, Math.round(len / ROCK_CELL));
    for (let k = 1; k < n; k++) out.push(ts[i] + (len * k) / n);
    out.push(ts[i + 1]);
  }
  return out;
}

// A polygon of (t, y) points clipped to y >= c (sign 1) or y <= c (sign -1).
function clipY(poly, c, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = sign * (a[1] - c);
    const db = sign * (b[1] - c);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push([a[0] + ((b[0] - a[0]) * da) / (da - db), c]);
  }
  return out;
}

// Where a linear f(u) (f0 at u0, f1 at u1) crosses zero strictly inside, or null.
function crossing(u0, u1, f0, f1) {
  if (!(f0 * f1 < 0) || !Number.isFinite(f0) || !Number.isFinite(f1)) return null;
  return u0 + ((u1 - u0) * f0) / (f0 - f1);
}

// The finished arrays, cached: the Gorge's rock is the same every walk (its
// records are frozen module constants), and building it (conforming most of
// all) takes tens of milliseconds at the start of every Gorge walk. Keyed on
// the identity of the walks, masses and ceilings arrays (nested WeakMaps, so
// a dropped record set frees its entry) and a string of everything else.
// A hit builds fresh BufferGeometry from copies, so a walk disposing (or
// changing) its geometry never touches the cache; materials are made fresh
// every call (walk.js disposes them).
const ROCK_CACHE = new WeakMap();
const rockCacheSlot = (walks, masses, ceilings) => {
  let byMasses = ROCK_CACHE.get(walks);
  if (!byMasses) ROCK_CACHE.set(walks, (byMasses = new WeakMap()));
  let byCeilings = byMasses.get(masses);
  if (!byCeilings) byMasses.set(masses, (byCeilings = new WeakMap()));
  let byKey = byCeilings.get(ceilings);
  if (!byKey) byCeilings.set(ceilings, (byKey = new Map()));
  return byKey;
};

export function rockTerrain({
  walks, masses, ceilings, seed = 0, relief = true, keep = [], dressing = true, mouths = [], tint = null, tintKey = '',
}) {
  const slot = rockCacheSlot(walks, masses, ceilings);
  const key = JSON.stringify([seed, relief, dressing, keep, mouths, tintKey]);
  let built = slot.get(key);
  if (!built) {
    built = rockArrays({ walks, masses, ceilings, seed, relief, keep, dressing, mouths, tint });
    slot.set(key, built);
  }
  const geoOf = ({ pos, col, nor }) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col.slice(), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.slice(), 3));
    return geo;
  };
  // Every rock material wears the rock shader patch (rockshade.js): bedding,
  // flutes, grain and darker overhangs, one shared program.
  const rockMat = () => patchRockMaterial(litMaterial(0xffffff, { ...surfaceProps('cobble'), vertexColors: true }));
  const group = new THREE.Group();
  group.name = 'rockTerrain';
  const rockFaces = new THREE.Mesh(geoOf(built.rockFaces), rockMat());
  rockFaces.name = 'rockFaces';
  rockFaces.castShadow = true;
  const ledgeTops = new THREE.Mesh(geoOf(built.ledgeTops), patchRockMaterial(surfNoMap(LEDGE_COLOR, 'cobble'), { flutes: true }));
  ledgeTops.name = 'ledgeTops';
  ledgeTops.castShadow = true;
  const lips = new THREE.Mesh(geoOf(built.lips), rockMat());
  lips.name = 'lips';
  lips.castShadow = false;
  lips.userData.noCast = true;
  group.add(rockFaces, ledgeTops, lips);
  // The shell's triangles per mesh, before any dressing (appended after them).
  group.userData.shellTris = { ...built.shellTris };
  group.userData.dressing = { ...built.dressing };
  // How many passes conformTriangles took (it stops at MAX_PASSES).
  group.userData.conformPasses = built.conformPasses;
  return group;
}

// rockTerrain's arrays: per mesh, positions, colours (rockFaces and lips)
// and normals (smooth, creased), and the counts its userData carries.
function rockArrays({ walks, masses, ceilings, seed, relief, keep, dressing, mouths, tint: recolour }) {
  const groundShapes = [...walks, ...masses];
  const caps = ceilings
    .map((c) => ({ ...c, top: capTopFor(c, masses) }))
    .filter((c) => c.top > c.y0);

  // Every solid column, and the mesh its faces go into.
  const solids = [
    ...masses.map((s) => ({ s, out: 'rock', lo: () => 0, hi: (x, z) => shapeY(s, x, z), bottom: false })),
    ...walks.filter((s) => Math.max(s.y0, s.y1) > 0).map((s) => ({
      s, out: s.kind === 'lip' ? 'lip' : 'ledge', lo: () => 0, hi: (x, z) => shapeY(s, x, z), bottom: false,
    })),
    ...caps.map((c) => ({ s: c, out: 'rock', lo: () => c.y0, hi: () => c.top, bottom: true })),
  ];

  // The frame: faces on the outermost edges are not drawn.
  const frame = {
    minX: Math.min(...groundShapes.map((s) => s.minX)),
    maxX: Math.max(...groundShapes.map((s) => s.maxX)),
    minZ: Math.min(...groundShapes.map((s) => s.minZ)),
    maxZ: Math.max(...groundShapes.map((s) => s.maxZ)),
  };
  // The breakpoints along an edge (at x = `at` running along z for axis 'x',
  // at z = `at` along x for 'z'): the boundaries of every shape that touches
  // its line (only those can change what lies just outside it), then cells.
  const cutters = [...groundShapes, ...caps];
  const edgePoints = (axis, at, t0, t1) => {
    const cuts = [];
    for (const c of cutters) {
      if (axis === 'x' ? c.minX <= at && at <= c.maxX : c.minZ <= at && at <= c.maxZ) {
        if (axis === 'x') cuts.push(c.minZ, c.maxZ);
        else cuts.push(c.minX, c.maxX);
      }
    }
    return stepPoints(t0, t1, cuts);
  };
  let topY = 0;
  for (const s of groundShapes) topY = Math.max(topY, s.y0, s.y1);
  for (const c of caps) topY = Math.max(topY, c.top);

  const low = new THREE.Color(ROCK_LOW);
  const high = new THREE.Color(ROCK_HIGH);
  const tint = new THREE.Color();
  // A vertex's colour, from where it was before the relief moved it (so a
  // stratum's colour stays with its shelf) and how deep it was recessed.
  const plainColour = (x, y, z, recess) => {
    tint.copy(low).lerp(high, topY > 0 ? clamp01(y / topY) : 0);
    const band = strataBand(x, y, z, seed);
    const shade = (1 + ROCK_STRATA * (2 * noise3(band, 0, 0, seed + 5) - 1))
      * (1 - RECESS_DARK * clamp01(recess / RELIEF_DEPTH));
    const hue = band % 2 === 0 ? STRATA_WARM : STRATA_CREAM;
    return [tint.r * shade * hue[0], tint.g * shade * hue[1], tint.b * shade * hue[2]];
  };
  // Then the talus: the wall feet lean towards TALUS_TINT, patchily, fading
  // out by talusHi metres over the walk. Applied last, after any `tint`, so
  // the Narrows' feet carry it too. `foot` (rockrelief's at()) defaults to
  // Infinity: the dressing's colours take none.
  // The foot is damp and dark (TALUS_TINT), not a pale band: the floor's
  // pale sand meets a darker wall, so the wall's foot reads (polish-gorgewall).
  const talus = new THREE.Color(TALUS_TINT);
  const tinted = recolour
    ? (x, y, z, recess, foot) => recolour(x, y, z, plainColour(x, y, z, recess), recess, foot)
    : plainColour;
  const rockColour = (x, y, z, recess, foot = Infinity) => {
    let rgb = tinted(x, y, z, recess, foot);
    // the undercut: 0 at the foot, full from 1.0 to 1.8 m up, gone by 3.2
    const u = UNDERCUT_DARK * smoothstep(0.3, 1.0, foot) * (1 - smoothstep(1.8, 3.2, foot));
    if (u > 0) rgb = [rgb[0] * (1 - u), rgb[1] * (1 - u), rgb[2] * (1 - u)];
    const k = (1 - smoothstep(ROCK_SHADE.talusLo, ROCK_SHADE.talusHi, foot))
      * (0.75 + 0.25 * noise3(x / 1.5, 0, z / 1.5, seed + 9));
    if (!(k > 0)) return rgb;
    return [rgb[0] + (talus.r - rgb[0]) * k, rgb[1] + (talus.g - rgb[1]) * k, rgb[2] + (talus.b - rgb[2]) * k];
  };

  const bins = { rock: [], ledge: [], lip: [] };
  const tri = (out, a, c, d, nx, ny, nz) => {
    const ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const dot = cx * nx + cy * ny + cz * nz;
    if (Math.abs(dot) < 1e-9) return; // no area
    if (dot > 0) bins[out].push(a, c, d);
    else bins[out].push(a, d, c);
  };
  const quad = (out, a, c, d, e, n) => {
    tri(out, a, c, d, ...n);
    tri(out, a, d, e, ...n);
  };

  // One side face from (u0, l0..h0) to (u1, l1..h1), cut into rows at whole
  // multiples of ROCK_ROW (each row the face clipped to its slab).
  const wall = (out, at, u0, l0, h0, u1, l1, h1) => {
    const tall = Math.max(h0 - l0, h1 - l1);
    if (tall < FLAT_EPS) return;
    const poly = [[u0, l0], [u1, l1], [u1, h1], [u0, h0]];
    const lo = Math.min(l0, l1);
    const hi = Math.max(h0, h1);
    const levels = [lo];
    for (let k = Math.floor(lo / ROCK_ROW) + 1; k * ROCK_ROW < hi - ROW_MIN; k++) {
      if (k * ROCK_ROW > lo + ROW_MIN) levels.push(k * ROCK_ROW);
    }
    levels.push(hi);
    for (let r = 0; r + 1 < levels.length; r++) {
      const piece = clipY(clipY(poly, levels[r], 1), levels[r + 1], -1);
      for (let i = 1; i + 1 < piece.length; i++) {
        tri(out, at(...piece[0]), at(...piece[i]), at(...piece[i + 1]), ...at.normal);
      }
    }
  };

  for (const solid of solids) {
    const { s, out } = solid;
    const edges = [
      { axis: 'x', at: s.minX, dir: -1, t0: s.minZ, t1: s.maxZ, onFrame: s.minX <= frame.minX },
      { axis: 'x', at: s.maxX, dir: 1, t0: s.minZ, t1: s.maxZ, onFrame: s.maxX >= frame.maxX },
      { axis: 'z', at: s.minZ, dir: -1, t0: s.minX, t1: s.maxX, onFrame: s.minZ <= frame.minZ },
      { axis: 'z', at: s.maxZ, dir: 1, t0: s.minX, t1: s.maxX, onFrame: s.maxZ >= frame.maxZ },
    ];
    for (const e of edges) e.ts = e.onFrame ? [e.t0, e.t1] : edgePoints(e.axis, e.at, e.t0, e.t1);
    for (const e of edges) {
      if (e.onFrame) continue;
      // (x, z) of the point t along this edge, `off` outward of it
      const xz = (t, off = 0) => (e.axis === 'x' ? [e.at + e.dir * off, t] : [t, e.at + e.dir * off]);
      const at = (t, y) => {
        const [x, z] = xz(t);
        return [x, y, z];
      };
      at.normal = e.axis === 'x' ? [e.dir, 0, 0] : [0, 0, e.dir];
      // breakpoints: every shape boundary on this edge, then cells
      const ts = e.ts;
      const steps = ts.slice(1).map((t, i) => [ts[i], t]);
      for (const [u0, u1] of steps) {
        if (u1 - u0 < FLAT_EPS) continue;
        const [mx, mz] = xz((u0 + u1) / 2, SIDE_EPS);
        // the column just outside: its ground, its ceiling and its cap's top
        let nb = null;
        for (const g of groundShapes) {
          if (strictlyIn(g, mx, mz) && (!nb || shapeY(g, mx, mz) > shapeY(nb, mx, mz))) nb = g;
        }
        const cap = caps.find((c) => strictlyIn(c, mx, mz));
        const g = (t) => (nb ? shapeY(nb, ...xz(t)) : 0);
        const ceil = cap ? cap.y0 : Infinity;
        const capTop = cap ? cap.top : Infinity;
        const a = (t) => solid.lo(...xz(t));
        const b = (t) => solid.hi(...xz(t));
        const bands = [[(t) => Math.max(a(t), g(t)), (t) => Math.min(b(t), ceil), [(t) => a(t) - g(t), (t) => b(t) - ceil]]];
        if (Number.isFinite(capTop)) bands.push([(t) => Math.max(a(t), capTop), b, [(t) => a(t) - capTop]]);
        for (const [L, U, kinks] of bands) {
          // split where L or U changes branch, then where the band closes
          let us = [u0, u1];
          for (const f of [...kinks, (t) => U(t) - L(t)]) {
            const next = [us[0]];
            for (let i = 0; i + 1 < us.length; i++) {
              const c = crossing(us[i], us[i + 1], f(us[i]), f(us[i + 1]));
              if (c !== null) next.push(c);
              next.push(us[i + 1]);
            }
            us = next;
          }
          for (let i = 0; i + 1 < us.length; i++) {
            const p = us[i];
            const q = us[i + 1];
            const l0 = L(p);
            const l1 = L(q);
            const h0 = Math.max(l0, U(p));
            const h1 = Math.max(l1, U(q));
            if (h0 - l0 < FLAT_EPS && h1 - l1 < FLAT_EPS) continue;
            wall(out, at, p, l0, h0, q, l1, h1);
            // a face up to the top's own edge: a crest, so the top gets its band here
            if (Math.abs(h0 - b(p)) < FLAT_EPS || Math.abs(h1 - b(q)) < FLAT_EPS) e.crest = true;
          }
        }
      }
    }
    // the top (sloped on a ramp) and, for a cap, its underside
    const corner = (x, z, y) => [x, y, z];
    const { minX, maxX, minZ, maxZ } = s;
    const hi = solid.hi;
    const topQuad = (x0, x1, z0, z1) => quad(out,
      corner(x0, z0, hi(x0, z0)), corner(x0, z1, hi(x0, z1)),
      corner(x1, z1, hi(x1, z1)), corner(x1, z0, hi(x1, z0)), [0, 1, 0]);
    if (out === 'rock') {
      // a band CREST_BAND deep along each side that is a crest (a face rises
      // to it), cut at that edge's own breakpoints (the ones its wall is cut
      // at), round one inner quad; a side with no face up to it (a seam with
      // rock as high, or the frame) has no crest and no band
      const [W, E, S, N] = edges;
      const merge = (...lists) => {
        const all = lists.flat().sort((m, n) => m - n);
        return all.filter((v, i) => i === 0 || v - all[i - 1] > FLAT_EPS);
      };
      const ix0 = W.crest ? minX + CREST_BAND : minX;
      const ix1 = E.crest ? maxX - CREST_BAND : maxX;
      const iz0 = S.crest ? minZ + CREST_BAND : minZ;
      const iz1 = N.crest ? maxZ - CREST_BAND : maxZ;
      if (ix1 - ix0 > FLAT_EPS && iz1 - iz0 > FLAT_EPS) {
        const corners = [...(W.crest ? [ix0] : []), ...(E.crest ? [ix1] : [])];
        if (S.crest) {
          const xs = merge(S.ts, corners);
          for (let i = 0; i + 1 < xs.length; i++) topQuad(xs[i], xs[i + 1], minZ, iz0);
        }
        if (N.crest) {
          const xs = merge(N.ts, corners);
          for (let i = 0; i + 1 < xs.length; i++) topQuad(xs[i], xs[i + 1], iz1, maxZ);
        }
        const along = (list) => merge(list.filter((v) => v > iz0 && v < iz1), [iz0, iz1]);
        if (W.crest) {
          const zs = along(W.ts);
          for (let j = 0; j + 1 < zs.length; j++) topQuad(minX, ix0, zs[j], zs[j + 1]);
        }
        if (E.crest) {
          const zs = along(E.ts);
          for (let j = 0; j + 1 < zs.length; j++) topQuad(ix1, maxX, zs[j], zs[j + 1]);
        }
        topQuad(ix0, ix1, iz0, iz1);
      } else {
        // too narrow for a band and an inner quad: the whole top gridded at
        // its crests' breakpoints
        const X = merge(S.crest ? S.ts : [minX, maxX], N.crest ? N.ts : []);
        const Z = merge(W.crest ? W.ts : [minZ, maxZ], E.crest ? E.ts : []);
        for (let i = 0; i + 1 < X.length; i++) {
          for (let j = 0; j + 1 < Z.length; j++) topQuad(X[i], X[i + 1], Z[j], Z[j + 1]);
        }
      }
    } else {
      topQuad(minX, maxX, minZ, maxZ);
    }
    if (solid.bottom) {
      const y = solid.lo();
      quad(out, corner(minX, minZ, y), corner(maxX, minZ, y), corner(maxX, maxZ, y), corner(minX, maxZ, y), [0, -1, 0]);
    }
  }

  const conformStats = {};
  const conf = conformTriangles(bins, { stats: conformStats });

  // The relief: one field for the call, asked once per distinct (quantised)
  // position, so every copy of a vertex moves the same and the conforming
  // shell stays closed.
  const field = relief ? createRockRelief({ walks, masses, ceilings, seed, keep }) : null;
  const moves = new Map();
  const moveOf = (v) => {
    const key = `${v[0]},${v[1]},${v[2]}`;
    let m = moves.get(key);
    if (!m) {
      m = field ? field.at(v[0], v[1], v[2]) : { dx: 0, dy: 0, dz: 0, recess: 0, foot: Infinity };
      moves.set(key, m);
    }
    return m;
  };

  // The dressing, appended after the shells (see rockDressing below).
  const dress = dressing
    ? rockDressing({ walks, masses, ceilings, seed, mouths, field: field ?? createRockRelief({ walks, masses, ceilings, seed, keep }), rockColour })
    : { rock: { pos: [], col: [], nor: [] }, lip: { pos: [], col: [], nor: [] }, lipStones: 0, footBoulders: 0 };

  // Normals: the shell smooth-shaded, welded by its pre-relief positions and
  // creased at ROCK_CREASE (so a walk top stays flat against its walls); the
  // dressing brings its own rounded normals.
  const arraysOf = (verts, coloured, extra = { pos: [], col: [], nor: [] }) => {
    const n = verts.length * 3;
    const pos = new Float32Array(n + extra.pos.length);
    const col = coloured ? new Float32Array(n + extra.col.length) : null;
    verts.forEach((v, i) => {
      const m = moveOf(v);
      pos[3 * i] = v[0] + m.dx;
      pos[3 * i + 1] = v[1] + m.dy;
      pos[3 * i + 2] = v[2] + m.dz;
      if (col) col.set(rockColour(v[0], v[1], v[2], m.recess, m.foot), 3 * i);
    });
    pos.set(extra.pos, n);
    if (col) col.set(extra.col, n);
    const nor = new Float32Array(pos.length);
    nor.set(smoothNormals(pos.subarray(0, n), verts, ROCK_CREASE));
    nor.set(extra.nor, n);
    // Faces looking up (shelves, ledges, the rims) lighter, as if sunlit
    // and dusty: the shell only, by its smooth normal.
    if (col) {
      for (let i = 0; i < verts.length; i++) {
        const lift = 1 + LEDGE_LIGHT * smoothstep(0.45, 0.95, nor[3 * i + 1]);
        col[3 * i] *= lift;
        col[3 * i + 1] *= lift;
        col[3 * i + 2] *= lift;
      }
    }
    // The flat normals came from a scratch BufferGeometry, whose uuid drew 4
    // Math.random numbers; the area builds are pinned to their draw count
    // (test/waterlooks.test.js BUILD_DRAWS), so the same uuid is still drawn.
    THREE.MathUtils.generateUUID();
    return { pos, col, nor };
  };
  return {
    rockFaces: arraysOf(conf.rock, true, dress.rock),
    ledgeTops: arraysOf(conf.ledge, false),
    lips: arraysOf(conf.lip, true, dress.lip),
    shellTris: { rockFaces: conf.rock.length / 3, ledgeTops: conf.ledge.length / 3, lips: conf.lip.length / 3 },
    dressing: { lipStones: dress.lipStones, footBoulders: dress.footBoulders },
    conformPasses: conformStats.passes,
  };
}

// The rock's dressing (`dressing: false` leaves it out). Written as raw
// triangles, already where they stand (after the shell's conforming and
// relief: nothing here moves), appended to the merged meshes after their
// shells, so no new mesh and no new draw call. Every choice is from the
// integer hash (noise3 on whole lattice points), no trig, no random.
//
//   Lip stones (into `lips`): each lip is laid along its long axis with
//   stones LIP_STONE_LEN long, LIP_JOINT apart (the last ones fitted to its
//   end). A stone is a box of 12 triangles across the lip's 0.4 m plus 0.04
//   to 0.10 each side, from 0.18 under the lip's top to 0.04..0.12 over it,
//   following its ramp; its eight corners pulled toward the box's centre by
//   0..0.05 per axis (never pushed out). Coloured as the rock at that
//   height, x 0.9..1.05 a stone.
//
//   Foot boulders (into `rockFaces`): candidates every FOOT_STEP (+-1 m) along
//   each mass and lip wall whose outward foot is walkable ground (a walk, or
//   the floor) with no ceiling over it, where the rock rises 1 m or more
//   over it. A boulder is the 12 icosahedron vertices (golden-ratio
//   constants), each scaled 0.8..1.1, flattened x0.7 in y, re-centred on
//   their mean, of radius 0.45..0.9; set so its farthest vertex stands
//   FOOT_PROUD outward of the true wall plane, 30% of its height sunk below
//   the ground. It is kept only where rock is at its centre 0.3 m up, it is
//   a metre or more from every cave and den mouth, and every vertex is
//   either in rock (and 0.3 m inside it along the wall and inward, so
//   another face's relief can't bare it) or on its wall's open side, within
//   FOOT_PROUD of the plane, over no cave or den, and with the wall still
//   rock behind it at its height and a metre over its own ground. So none
//   pokes through a lip onto the walk behind it, into a void, or out of
//   thin rock's far side. At most FOOT_MAX, evenly picked.
const LIP_STONE_LEN = [0.35, 0.75];
const LIP_JOINT = [0.03, 0.08];
const FOOT_STEP = 3.2;
const FOOT_PROUD = 0.1195; // under 0.12 m, with room for the float32 positions
const FOOT_MAX = 90;
const PHI = (1 + Math.sqrt(5)) / 2;
// The 12 icosahedron vertices (THREE's order) on the unit sphere, and its 20 faces.
const ICO = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map((v) => v.map((c) => c / Math.sqrt(1 + PHI * PHI)));
const ICO_FACES = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];
// A box's 12 triangles over its corners, corner index iu + 2 iv + 4 iw.
const STONE_FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]];

function rockDressing({ walks, masses, ceilings, seed, mouths, field, rockColour }) {
  const out = { rock: { pos: [], col: [], nor: [] }, lip: { pos: [], col: [], nor: [] }, lipStones: 0, footBoulders: 0 };
  // A hash in [0, 1) at a whole lattice point.
  const H = (i, j, k, salt) => noise3(i, j, k, seed + salt);
  // One triangle wound outward of c, coloured as the rock at each vertex's
  // height x shade, each corner's normal from round(face normal, corner, c).
  const put = (bin, a, p, q, c, shade, round) => {
    const ux = p[0] - a[0], uy = p[1] - a[1], uz = p[2] - a[2];
    const vx = q[0] - a[0], vy = q[1] - a[1], vz = q[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (a[0] + p[0] + q[0]) / 3 - c[0];
    const my = (a[1] + p[1] + q[1]) / 3 - c[1];
    const mz = (a[2] + p[2] + q[2]) / 3 - c[2];
    const outward = nx * mx + ny * my + nz * mz >= 0;
    const tri = outward ? [a, p, q] : [a, q, p];
    const fl = Math.hypot(nx, ny, nz) * (outward ? 1 : -1) || 1;
    const f = [nx / fl, ny / fl, nz / fl];
    for (const v of tri) {
      out[bin].pos.push(v[0], v[1], v[2]);
      out[bin].nor.push(...round(f, v, c));
      const k = rockColour(v[0], v[1], v[2], 0);
      out[bin].col.push(k[0] * shade, k[1] * shade, k[2] * shade);
    }
  };

  const unit = (x, y, z) => {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  // A lip stone: its face normal leaned 0.6 toward the corner's way out of
  // the stone, so the box's edges shade round.
  const stoneNormal = (f, v, c) => {
    const d = unit(v[0] - c[0], v[1] - c[1], v[2] - c[2]);
    return unit(f[0] + 0.6 * d[0], f[1] + 0.6 * d[1], f[2] + 0.6 * d[2]);
  };
  // A foot boulder: the normal of the (1, 0.7, 1) ellipsoid it stands for,
  // 70/30 with its face normal.
  const boulderNormal = (f, v, c) => {
    const e = unit(v[0] - c[0], (v[1] - c[1]) / 0.49, v[2] - c[2]);
    return unit(0.7 * e[0] + 0.3 * f[0], 0.7 * e[1] + 0.3 * f[1], 0.7 * e[2] + 0.3 * f[2]);
  };

  // ---- lip stones ----
  walks.filter((w) => w.kind === 'lip').forEach((l, li) => {
    const alongZ = l.maxZ - l.minZ >= l.maxX - l.minX;
    const u1 = alongZ ? l.maxZ : l.maxX;
    const v0 = alongZ ? l.minX : l.minZ;
    const v1 = alongZ ? l.maxX : l.maxZ;
    // (along, across, height over the lip's top) to the world
    const world = (u, v, w) => {
      const x = alongZ ? v : u;
      const z = alongZ ? u : v;
      return [x, shapeY(l, x, z) + w, z];
    };
    const [LMIN, LMAX] = LIP_STONE_LEN;
    let u = alongZ ? l.minZ : l.minX;
    for (let k = 0; u1 - u > 1e-6; k++) {
      const r = u1 - u;
      let len = LMIN + (LMAX - LMIN) * H(li, k, 0, 101);
      let joint = LIP_JOINT[0] + (LIP_JOINT[1] - LIP_JOINT[0]) * H(li, k, 1, 101);
      if (r <= LMAX) {
        len = r; // the last stone takes the rest (never under LMIN: see below)
        joint = 0;
      } else {
        // leave at least LMIN for the stones after this one
        joint = Math.min(joint, r - 2 * LMIN);
        len = Math.min(len, r - joint - LMIN);
      }
      const a0 = [u, v0 - (0.04 + 0.06 * H(li, k, 2, 101)), -0.18];
      const a1 = [u + len, v1 + (0.04 + 0.06 * H(li, k, 3, 101)), 0.04 + 0.08 * H(li, k, 4, 101)];
      const mid = [0, 1, 2].map((d) => (a0[d] + a1[d]) / 2);
      const corners = [];
      for (let i = 0; i < 8; i++) {
        const p = [i & 1 ? a1[0] : a0[0], i & 2 ? a1[1] : a0[1], i & 4 ? a1[2] : a0[2]];
        for (let d = 0; d < 3; d++) p[d] += Math.sign(mid[d] - p[d]) * 0.05 * H(li, k, 10 + 3 * i + d, 101);
        corners.push(world(...p));
      }
      const c = world(...mid);
      const shade = 0.9 + 0.15 * H(li, k, 5, 101);
      for (const [p, q, s, t] of STONE_FACES) {
        put('lip', corners[p], corners[q], corners[s], c, shade, stoneNormal);
        put('lip', corners[p], corners[s], corners[t], c, shade, stoneNormal);
      }
      out.lipStones++;
      u += len + joint;
    }
  });

  // ---- foot boulders ----
  const groundShapes = [...walks, ...masses];
  const walkable = (s) => s.kind === 'walk' || s.kind === 'cave' || s.kind === 'den';
  const inside = (s, x, z) => x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ;
  const inClosed = (s, x, z) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
  const covered = (x, z) => ceilings.some((c) => inClosed(c, x, z));
  // the highest walkable top under (x, z) at or below y, else the floor
  const walkTop = (x, y, z) => {
    let g = 0;
    for (const s of walks) {
      if (s.kind === 'lip' || !inClosed(s, x, z)) continue;
      const t = shapeY(s, x, z);
      if (t <= y + 1e-6 && t > g) g = t;
    }
    return g;
  };
  const frame = {
    minX: Math.min(...groundShapes.map((s) => s.minX)),
    maxX: Math.max(...groundShapes.map((s) => s.maxX)),
    minZ: Math.min(...groundShapes.map((s) => s.minZ)),
    maxZ: Math.max(...groundShapes.map((s) => s.maxZ)),
  };
  const kept = [];
  const walls = [...masses, ...walks.filter((w) => w.kind === 'lip')];
  walls.forEach((s, si) => {
    const edges = [
      { axis: 'x', at: s.minX, dir: -1, t0: s.minZ, t1: s.maxZ, onFrame: s.minX <= frame.minX },
      { axis: 'x', at: s.maxX, dir: 1, t0: s.minZ, t1: s.maxZ, onFrame: s.maxX >= frame.maxX },
      { axis: 'z', at: s.minZ, dir: -1, t0: s.minX, t1: s.maxX, onFrame: s.minZ <= frame.minZ },
      { axis: 'z', at: s.maxZ, dir: 1, t0: s.minX, t1: s.maxX, onFrame: s.maxZ >= frame.maxZ },
    ];
    edges.forEach((e, ei) => {
      if (e.onFrame) return;
      // world (x, z) of t along the edge, `off` outward of it
      const xz = (t, off) => (e.axis === 'x' ? [e.at + e.dir * off, t] : [t, e.at + e.dir * off]);
      for (let k = 0; ; k++) {
        const t = e.t0 + FOOT_STEP / 2 + FOOT_STEP * k + (2 * H(si, ei, k, 202) - 1);
        if (t >= e.t1) break;
        if (t <= e.t0) continue;
        // the foot: walkable ground just outside, no ceiling over it
        const [fx, fz] = xz(t, 0.05);
        let top = 0;
        let ok = true;
        for (const g of groundShapes) {
          if (!inside(g, fx, fz)) continue;
          const y = shapeY(g, fx, fz);
          if (y > top + 1e-9) { top = y; ok = walkable(g); } else if (y > top - 1e-9 && !walkable(g)) ok = false;
        }
        if (!ok || covered(fx, fz)) continue;
        const [wx, wz] = xz(t, -0.05);
        if (shapeY(s, wx, wz) - top < 1.0) continue;
        // the shape, about its own mean
        const R = 0.45 + 0.45 * H(si, ei, k, 203);
        let local = ICO.map((v, i) => {
          const sc = R * (0.8 + 0.3 * H(si * 16 + ei, k, i, 204));
          return [v[0] * sc, v[1] * sc * 0.7, v[2] * sc];
        });
        const mean = [0, 1, 2].map((d) => local.reduce((a, v) => a + v[d], 0) / local.length);
        local = local.map((v) => [v[0] - mean[0], v[1] - mean[1], v[2] - mean[2]]);
        const ai = e.axis === 'x' ? 0 : 2; // the outward axis
        let maxOut = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const v of local) {
          maxOut = Math.max(maxOut, v[ai] * e.dir);
          minY = Math.min(minY, v[1]);
          maxY = Math.max(maxY, v[1]);
        }
        const [cx, cz] = xz(t, FOOT_PROUD - maxOut);
        const cy = top - minY - 0.3 * (maxY - minY);
        if (!field.rockAt(cx, top + 0.3, cz)) continue;
        if (mouths.some((m) => (cx - m.x) ** 2 + (cz - m.z) ** 2 < 1.01 * 1.01)) continue;
        const verts = local.map((v) => [cx + v[0], cy + v[1], cz + v[2]]);
        const safe = verts.every((v) => {
          const [x, y, z] = v.map(Math.fround); // as drawn
          const d = ((ai === 0 ? x : z) - e.at) * e.dir; // outward of the plane
          const inward = (dd) => (ai === 0 ? [x - e.dir * dd, z] : [x, z - e.dir * dd]);
          if (field.rockAt(x, y, z)) {
            // buried: 0.3 m inside along the wall both ways and inward
            const side = ai === 0 ? [[x, z + 0.3], [x, z - 0.3]] : [[x + 0.3, z], [x - 0.3, z]];
            const [ix, iz] = inward(Math.max(0, d) + 0.3);
            return field.rockAt(ix, y, iz) && side.every(([sx, sz]) => field.rockAt(sx, y, sz));
          }
          if (d < 0 || d > FOOT_PROUD + 1e-6 || covered(x, z)) return false;
          const [px, pz] = inward(d + 0.01); // just behind the plane, at its height
          return field.rockAt(px, y, pz) && field.rockAt(px, walkTop(x, y, z) + 1.0, pz);
        });
        if (!safe) continue;
        kept.push({ verts, c: [cx, cy, cz], shade: 0.9 + 0.15 * H(si, ei, k, 205) });
      }
    });
  });
  // at most FOOT_MAX, evenly picked from the list
  const n = Math.min(FOOT_MAX, kept.length);
  for (let i = 0; i < n; i++) {
    const { verts, c, shade } = kept[Math.floor((i * kept.length) / n)];
    for (const [a, p, q] of ICO_FACES) put('rock', verts[a], verts[p], verts[q], c, shade, boulderNormal);
    out.footBoulders++;
  }
  return out;
}

// Scree: loose stones at the foot of the rock. Each spot is a cluster of three
// to six small flattened icosahedra within half a metre of it, turned about y,
// resting on y 0 (a caller seats them on raised ground). One merged mesh,
// never taller than 0.25 m, out of the caster sweep like the other low beds.
export const SCREE_COLOR = 0x857f76;
//
// { chunky: true } (opt-in; the Gorge, polish-gorge7) makes each stone a 3D
// sandstone chunk: mostly an angular block (a box whose corners are jittered
// by a hash of the corner, so its faces stay closed, 12 triangles) and, one in
// five, a cobble (an icosahedron jittered radially, 20 triangles). Half a
// width of 0.09 to 0.22 m, as tall as 0.5 to 0.85 of its width, but never
// above SCREE_TOP. A spot that carries its wall's outward normal (nx, nz) heaps
// its stones against the wall, the biggest closest to it, spread 0.6 m each
// way along it so spots 1.5 m apart read as one bed; stones from the fourth on
// sit up to 3 cm higher, settled into the heap. A spot with no normal scatters as before.
// Each stone takes a warm sandstone shade, darker at its foot, in vertex
// colours, flat-shaded. Every number comes from hash01: no draws.
export const SCREE_SANDSTONE = [0x9a8670, 0x8a7560, 0xa89478, 0x857f76, 0x7a6a58];
const SCREE_TOP = 0.25;
const SCREE_FOOT_SHADE = 0.72;

// One chunky stone at unit size (about -1..1 on each axis), non-indexed.
function screeChunk(id, seed, cobble) {
  let geo;
  if (cobble) {
    geo = new THREE.IcosahedronGeometry(1, 0); // non-indexed already
    const p = geo.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v);
      // a hash of the vertex itself, so the copies of one corner agree
      const f = 1 + 0.3 * (hash01(x * 7.13 + z * 3.31, y * 5.77 + id, seed + 11) - 0.5);
      p.setXYZ(v, x * f, y * f, z * f);
    }
  } else {
    const box = new THREE.BoxGeometry(2, 2, 2);
    const p = box.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const sx = Math.sign(p.getX(v)), sy = Math.sign(p.getY(v)), sz = Math.sign(p.getZ(v));
      const key = (sx + 1) * 9 + (sy + 1) * 3 + (sz + 1);
      const j = (salt) => 0.36 * (hash01(key, id, seed + salt) - 0.5);
      p.setXYZ(v, sx * (1 + j(12)), sy * (1 + j(13)), sz * (1 + j(14)));
    }
    geo = box.toNonIndexed();
    box.dispose();
  }
  return geo;
}

function chunkyScree(spots, seed) {
  const stones = [];
  const col = new THREE.Color();
  spots.forEach((sp, i) => {
    const n = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 4);
    const wall = Number.isFinite(sp.nx) && Number.isFinite(sp.nz) && Math.hypot(sp.nx, sp.nz) > 0.5;
    for (let k = 0; k < n; k++) {
      const id = i * 8 + k;
      const cobble = hash01(i, k, seed + 7) < 0.2;
      let x, z, near;
      if (wall) {
        const l = Math.hypot(sp.nx, sp.nz);
        const nx = sp.nx / l, nz = sp.nz / l;
        // out from the wall: 0 at the wall's side, 1 at the floor's; skewed
        // toward the wall so the bed heaps against it
        const t = hash01(k, i, seed + 5) ** 1.5;
        const out = -0.45 + 0.7 * t;
        const along = 0.6 * (2 * hash01(i + k, k, seed + 8) - 1);
        x = sp.x + nx * out - nz * along;
        z = sp.z + nz * out + nx * along;
        near = 1 - t;
      } else {
        const a = hash01(k, i, seed + 4) * Math.PI * 2;
        const d = 0.5 * hash01(i + k, k, seed + 5);
        x = sp.x + Math.cos(a) * d;
        z = sp.z + Math.sin(a) * d;
        near = hash01(i, k, seed + 9);
      }
      const r = 0.09 + 0.13 * Math.min(1, 0.6 * near + 0.4 * hash01(k, i, seed + 2));
      const ratio = 0.5 + 0.35 * hash01(i, k, seed + 3);
      const lift = k >= 3 ? 0.03 * hash01(k, i, seed + 10) : 0;
      const geo = screeChunk(id, seed, cobble);
      geo.rotateY(hash01(i, k, seed + 6) * Math.PI * 2);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const height = Math.min(r * 2 * ratio, SCREE_TOP - lift);
      geo.scale((2 * r) / w, height / (bb.max.y - bb.min.y), (2 * r) / w);
      geo.computeBoundingBox();
      const y0 = geo.boundingBox.min.y;
      geo.translate(x, lift - y0, z);
      // a sandstone shade per stone, darker at its foot
      col.setHex(SCREE_SANDSTONE[Math.floor(hash01(id, k, seed + 15) * SCREE_SANDSTONE.length)]);
      const tint = 1 + 0.12 * (hash01(k, id, seed + 16) - 0.5);
      const p = geo.attributes.position;
      const c = new Float32Array(p.count * 3);
      for (let v = 0; v < p.count; v++) {
        const s = tint * (p.getY(v) - lift < 0.4 * height ? SCREE_FOOT_SHADE : 1);
        c[v * 3] = col.r * s; c[v * 3 + 1] = col.g * s; c[v * 3 + 2] = col.b * s;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geo.deleteAttribute('uv');
      geo.computeVertexNormals(); // non-indexed: flat facets
      stones.push(geo);
    }
  });
  const geo = stones.length === 0 ? new THREE.BufferGeometry()
    : stones.length === 1 ? stones[0] : mergeGeometries(stones, false);
  if (stones.length > 1) for (const p of stones) p.dispose();
  const mat = surfNoMap(0xffffff, 'cobble');
  mat.vertexColors = true;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

export function scree(spots, seed, { chunky = false } = {}) {
  if (chunky) {
    const m = chunkyScree(spots, seed);
    m.name = 'scree';
    const g = new THREE.Group();
    g.add(m);
    return g;
  }
  const stones = [];
  spots.forEach((sp, i) => {
    const n = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 4);
    for (let k = 0; k < n; k++) {
      const r = 0.08 + 0.1 * hash01(i, k, seed + 2);
      const flat = 0.4 + 0.2 * hash01(k, i, seed + 3);
      const a = hash01(k, i, seed + 4) * Math.PI * 2;
      const d = 0.5 * hash01(i + k, k, seed + 5);
      const geo = new THREE.IcosahedronGeometry(r, 0);
      geo.scale(1, flat, 1);
      geo.rotateY(hash01(i, k, seed + 6) * Math.PI * 2);
      geo.computeBoundingBox();
      geo.translate(sp.x + Math.cos(a) * d, -geo.boundingBox.min.y, sp.z + Math.sin(a) * d);
      stones.push(geo);
    }
  });
  const g = new THREE.Group();
  const m = mergedNoCast(stones, SCREE_COLOR, 'cobble');
  m.name = 'scree';
  g.add(m);
  return g;
}

// =============================================================================
// THE CAVES' SOFT GLOW (the Gorge, part 3): crystals at the foot of a cave's
// walls and gold flecks on them. Both are emissive at a gentle 0.6, so they
// read in the dark of a chamber without lighting anything, and nothing on
// them moves or flickers.
// =============================================================================
const CAVE_GLOW = 0.6;
const caveGlowMaterial = (color) => litMaterial(color, { emissive: color, emissiveIntensity: CAVE_GLOW });

// One merged, emissive, out-of-the-shadow-pass mesh.
function glowMesh(geoms, color, name) {
  const geo = geoms.length === 0 ? new THREE.BufferGeometry()
    : geoms.length === 1 ? geoms[0] : mergeGeometries(geoms, false);
  if (geoms.length > 1) for (const p of geoms) p.dispose();
  const m = new THREE.Mesh(geo, caveGlowMaterial(color));
  m.name = name;
  m.castShadow = false;
  m.userData.noCast = true;
  return m;
}

// Crystals. Each spot { x, z, y, nx, nz } is at the foot of a wall, with
// (nx, nz) the unit normal pointing off the wall into the cave. A spot is a
// cluster of three to five small octahedra, 0.06-0.18 m across and 1.6 times
// as tall (so never taller than 0.3 m), spread 0.2 m either way along the
// wall and up to 0.05 m further out, each leaning gently away from the wall
// and resting on y. Every vertex stays within 0.1 m of its crystal's centre
// across the ground, so a spot 0.1 m or more off its wall keeps every crystal
// off the wall's face. One merged noCast mesh, the same every time for one
// seed.
export const CRYSTAL_SIZE = Object.freeze([0.06, 0.18]);
export const CRYSTAL_SPREAD = 0.2;
const CRYSTAL_OUT = 0.05;
const CRYSTAL_STRETCH = 1.6;
const CRYSTAL_LEAN = Object.freeze([0.1, 0.35]);
export function caveCrystals(spots, seed, { color = 0x9fc7d8 } = {}) {
  const geoms = [];
  const axis = new THREE.Vector3();
  const lean = new THREE.Matrix4();
  spots.forEach((sp, i) => {
    const nx = sp.nx ?? 0;
    const nz = sp.nz ?? 0;
    const n = 3 + Math.floor(hash01(sp.x, sp.z, seed + 1) * 3);
    for (let k = 0; k < n; k++) {
      const s = CRYSTAL_SIZE[0] + (CRYSTAL_SIZE[1] - CRYSTAL_SIZE[0]) * hash01(i, k, seed + 2);
      const u = (hash01(k, i, seed + 3) * 2 - 1) * CRYSTAL_SPREAD;
      const v = CRYSTAL_OUT * hash01(i + k, k, seed + 4);
      const tilt = CRYSTAL_LEAN[0] + (CRYSTAL_LEAN[1] - CRYSTAL_LEAN[0]) * hash01(k, i, seed + 5);
      const geo = new THREE.OctahedronGeometry(s / 2, 0);
      geo.scale(1, CRYSTAL_STRETCH, 1);
      geo.rotateY(hash01(i, k, seed + 6) * Math.PI * 2);
      // Tip the top toward the cave: about up x n.
      if (nx !== 0 || nz !== 0) geo.applyMatrix4(lean.makeRotationAxis(axis.set(nz, 0, -nx).normalize(), tilt));
      geo.computeBoundingBox();
      // The wall runs along (-nz, nx).
      const x = sp.x - nz * u + nx * v;
      const z = sp.z + nx * u + nz * v;
      geo.translate(x, (sp.y ?? 0) - geo.boundingBox.min.y, z);
      geoms.push(geo);
    }
  });
  const g = new THREE.Group();
  g.add(glowMesh(geoms, color, 'caveCrystals'));
  return g;
}

// Gold flecks on a wall: each spot { x, y, z, nx, nz } is a point on the
// wall's face with (nx, nz) its normal into the cave, and gets one tiny flat
// diamond 0.04-0.09 m long, turned in the wall's plane and set 0.015 m off
// the face, facing out. One merged noCast mesh.
export const FLECK_SIZE = Object.freeze([0.04, 0.09]);
export const FLECK_OFF = 0.015;
export function caveFlecks(spots, seed, { color = 0xe8b84a } = {}) {
  const geoms = [];
  spots.forEach((sp, i) => {
    const s = FLECK_SIZE[0] + (FLECK_SIZE[1] - FLECK_SIZE[0]) * hash01(sp.x + sp.y, sp.z, seed + 1);
    const geo = new THREE.PlaneGeometry(s, s * 0.6);
    geo.rotateZ(Math.PI / 4 + hash01(i, sp.y, seed + 2) * Math.PI);
    geo.rotateY(Math.atan2(sp.nx, sp.nz));
    geo.translate(sp.x + sp.nx * FLECK_OFF, sp.y, sp.z + sp.nz * FLECK_OFF);
    geoms.push(geo);
  });
  const g = new THREE.Group();
  g.add(glowMesh(geoms, color, 'caveFlecks'));
  return g;
}
