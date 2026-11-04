import * as THREE from 'three';
import { litMaterial, tileMetres } from '../render/materials.js';
import { path } from './builder.js';
import { withLocalUuids } from './localuuids.js';

// SOFT, JOINED TRAILS (polish-paths, survey-4 pass 4A-1).
//
// A wild map's paths used to be one flat rectangle per segment: hard cut-out
// edges, a notch at every bend, square ends. Here the whole network is ONE
// alpha-blended mesh whose fragment shader evaluates a signed-distance union of
// capsules (one per segment), so joins are round, ends are round, the edge
// wobbles gently and feathers into whatever ground is under it (macro patches,
// the Moor's crest tint — a true blend is the only edge that matches them all).
//
// Each segment draws one quad that covers its own capsule plus the wobble and
// the feather. Quads overlap at joins, so every fragment works out which
// segment OWNS it (the nearest capsule surface) and is discarded unless that
// is its own quad, so every pixel is blended once (with a soft hand-over in a
// 5 mm strip on the tie line — see the ownership comment in the fragment).
//
// The old 'path' meshes stay, hidden (builder.js path({ footprint: true })):
// grass.js, pawprints.js, walk.js and several tests read them as data.
//
// trailField() is the CPU twin of the shader's coverage math, used by tests.
// It follows the same formulas; bit-equality with the GPU is not a goal.

// Every number the trail's look is made of, in ONE place, read by both the CPU
// field and the GLSL (the shader text is generated from it). Lengths are in
// metres; the `*A*` wobble amplitudes are fractions of the half-width h.
// Edit and reload to tune: the shader is rebuilt from these on load.
export const TRAIL_LOOK = {
  // Width wobble: a gentle long swell plus a short ragged edge.
  wobbleA1: 0.14, wobbleL1: 6.0,
  wobbleA2: 0.05, wobbleL2: 0.9,
  // Feather, in signed distance from the wobbled edge: fully opaque at
  // featherIn (inside), alpha 0 at featherOut (outside).
  featherIn: -0.22, featherOut: 0.18,
  // The darker, slightly damp/greener band just inside the edge.
  edgeBand: 0.45, edgeTint: [0.80, 0.85, 0.74],
  // The worn centre line, a touch lighter (fraction, peaks on the centreline).
  centreLift: 0.08,
  // Low-frequency blotches, +/- fraction, at this wavelength.
  blotch: 0.06, blotchL: 1.6,
  // Sparse pebbles: one chance per square cell; lighter grey-tan multiplier
  // with a faint dark rim; only where the trail is mostly opaque.
  pebbleCell: 0.45, pebbleChance: 0.12, pebbleRMin: 0.035, pebbleRMax: 0.075,
  pebbleTint: [1.30, 1.26, 1.16], pebbleRim: 0.72, pebbleMinAlpha: 0.6,
};

const JOIN_SLACK = 0.05;
// Width of the soft ownership hand-over (see the fragment body). The quads'
// QUAD_PAD must stay well above it.
export const OWNER_BAND = 0.005;
const EDGE_EXTEND = 2;
const MIN_LEN = 0.1;
const QUAD_PAD = 0.05;

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-12 ? ((px - x1) * dx + (pz - z1) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - x1 - dx * t, pz - z1 - dz * t);
}

function flatten(groups) {
  const out = [];
  for (const g of groups) for (const s of g.segs) out.push({ s, h: g.w / 2 });
  return out;
}

// Each segment's two ends, classed 'joined' | 'edge' | 'free' (see
// trailSegments). Returned as [[kindOfEnd1, kindOfEnd2], ...] in input order.
export function endKinds(groups, { edge = 50 } = {}) {
  const all = flatten(groups);
  const kindOf = (i, x, z) => {
    for (let j = 0; j < all.length; j++) {
      if (j === i) continue;
      if (segDist(x, z, ...all[j].s) <= all[j].h + JOIN_SLACK) return 'joined';
    }
    if (Math.abs(x) >= edge - 0.01 || Math.abs(z) >= edge - 0.01) return 'edge';
    return 'free';
  };
  return all.map(({ s }, i) => [kindOf(i, s[0], s[1]), kindOf(i, s[2], s[3])]);
}

// The segments the trail is drawn from: [{ x1, z1, x2, z2, h }], flat, in
// input order. Ends that meet another segment stay put (the capsule union
// rounds the join); ends on the map edge run 2 m further out so the trail
// leaves the map instead of stopping at it; free ends (dead ends, and the gaps
// left for a bridge or stepping stones) are pulled back by h so the rounded
// cap's tip lands on the authored end, never shortening a segment below 0.1 m.
export function trailSegments(groups, opts = {}) {
  const all = flatten(groups);
  const kinds = endKinds(groups, opts);
  return all.map(({ s, h }, i) => {
    const [x1, z1, x2, z2] = s;
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 1e-9) return { x1, z1, x2, z2, h };
    const ux = (x2 - x1) / len;
    const uz = (z2 - z1) / len;
    // Positive = pull this end in, negative = push it out.
    const move = kinds[i].map((k) => (k === 'edge' ? -EDGE_EXTEND : k === 'free' ? h : 0));
    const pull = move.reduce((a, m) => a + (m > 0 ? m : 0), 0);
    const avail = len - move.reduce((a, m) => a + (m < 0 ? m : 0), 0) - MIN_LEN;
    if (pull > avail) {
      const k = Math.max(0, avail) / pull;
      for (let e = 0; e < 2; e++) if (move[e] > 0) move[e] *= k;
    }
    return {
      x1: x1 + ux * move[0], z1: z1 + uz * move[0],
      x2: x2 - ux * move[1], z2: z2 - uz * move[1],
      h,
    };
  });
}

// ---- the shared field ------------------------------------------------------
// Integer-lattice value noise over the same sin-hash builder.js's hash01 uses.
// The GLSL below is the same formula, line for line.

function fract(v) { return v - Math.floor(v); }
function hash(ix, iz, salt) {
  return fract(Math.sin(ix * 12.9898 + iz * 78.233 + salt * 37.719) * 43758.5453);
}
function vnoise(x, z, salt) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz, salt);
  const b = hash(ix + 1, iz, salt);
  const c = hash(ix, iz + 1, salt);
  const d = hash(ix + 1, iz + 1, salt);
  return (a + (b - a) * ux) + ((c + (d - c) * ux) - (a + (b - a) * ux)) * uz;
}
function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const L = TRAIL_LOOK;
function wobble(x, z, h) {
  return h * (L.wobbleA1 * (2 * vnoise(x / L.wobbleL1, z / L.wobbleL1, 1) - 1)
    + L.wobbleA2 * (2 * vnoise(x / L.wobbleL2, z / L.wobbleL2, 2) - 1));
}
const maxWobble = (h) => h * (L.wobbleA1 + L.wobbleA2);

// CPU twin of the fragment shader's coverage: which segment owns (x, z), the
// wobbled signed distance from the trail edge (negative inside), and the
// feathered alpha. `d` is the distance to the owner's centreline.
export function trailField(segs, x, z) {
  let owner = -1;
  let best = Infinity;
  let d = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const di = segDist(x, z, s.x1, s.z1, s.x2, s.z2);
    if (di - s.h < best) { best = di - s.h; owner = i; d = di; }
  }
  if (owner < 0) return { owner, sd: Infinity, alpha: 0, d };
  const sd = best - wobble(x, z, segs[owner].h);
  const alpha = 1 - smoothstep(L.featherIn, L.featherOut, sd);
  return { owner, sd, alpha, d };
}

// Half-size of a segment's quad across (and past each end): the capsule
// radius, grown by the most the wobble can widen it, the outer feather and a
// little slack.
export const quadRadius = (h) => h + maxWobble(h) + L.featherOut + QUAD_PAD;

// One quad (two triangles, non-indexed) per segment, in world coordinates at
// y = 0.01 (the mesh stays at the identity transform). uv = world (x, z) over
// the surface's tile size, so the map tiles continuously across every quad.
export function trailGeometry(segs, { surface } = {}) {
  const tile = tileMetres(surface) ?? 1;
  const n = segs.length;
  const pos = new Float32Array(n * 18);
  const nor = new Float32Array(n * 18);
  const uv = new Float32Array(n * 12);
  const id = new Float32Array(n * 6);
  let v = 0;
  segs.forEach((s, i) => {
    const R = quadRadius(s.h);
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const ux = len > 1e-9 ? (s.x2 - s.x1) / len : 1;
    const uz = len > 1e-9 ? (s.z2 - s.z1) / len : 0;
    const nx = -uz;
    const nz = ux;
    const ax = s.x1 - ux * R;
    const az = s.z1 - uz * R;
    const bx = s.x2 + ux * R;
    const bz = s.z2 + uz * R;
    const c = [
      [ax + nx * R, az + nz * R], [ax - nx * R, az - nz * R],
      [bx - nx * R, bz - nz * R], [bx + nx * R, bz + nz * R],
    ];
    for (let [p, q, r] of [[0, 1, 2], [0, 2, 3]]) {
      // Face +y: (q - p) x (r - p) has y = dz1*dx2 - dx1*dz2.
      const cy = (c[q][1] - c[p][1]) * (c[r][0] - c[p][0]) - (c[q][0] - c[p][0]) * (c[r][1] - c[p][1]);
      if (cy < 0) [q, r] = [r, q];
      for (const k of [p, q, r]) {
        pos[v * 3] = c[k][0]; pos[v * 3 + 1] = 0.01; pos[v * 3 + 2] = c[k][1];
        nor[v * 3 + 1] = 1;
        uv[v * 2] = c[k][0] / tile; uv[v * 2 + 1] = c[k][1] / tile;
        id[v] = i;
        v++;
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('trailSeg', new THREE.BufferAttribute(id, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ---- the shader ------------------------------------------------------------

const f = (x) => {
  const s = String(x);
  return /[.eE]/.test(s) ? s : s + '.0';
};
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;

const VERT_DECL = `
attribute float trailSeg;
varying vec2 vTrailXZ;
varying float vTrailSegId;
`;
const VERT_BODY = `
vTrailXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
vTrailSegId = trailSeg;
`;

function fragDecl(n) {
  return `
#define TRAIL_N ${n}
uniform vec4 trailSegs[TRAIL_N];
uniform float trailHalf[TRAIL_N];
varying vec2 vTrailXZ;
varying float vTrailSegId;
float trailHash(vec2 i, float salt) {
  return fract(sin(i.x * 12.9898 + i.y * 78.233 + salt * 37.719) * 43758.5453);
}
float trailNoise(vec2 p, float salt) {
  vec2 i = floor(p);
  vec2 fr = p - i;
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  float a = trailHash(i, salt);
  float b = trailHash(i + vec2(1.0, 0.0), salt);
  float c = trailHash(i + vec2(0.0, 1.0), salt);
  float d = trailHash(i + vec2(1.0, 1.0), salt);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float trailSegDist(vec2 p, vec4 s) {
  vec2 ab = s.zw - s.xy;
  float l2 = dot(ab, ab);
  float t = l2 > 1e-12 ? clamp(dot(p - s.xy, ab) / l2, 0.0, 1.0) : 0.0;
  return length(p - s.xy - ab * t);
}
`;
}

function fragBody() {
  return `
{
  vec2 tp = vTrailXZ;
  // Ownership. Quads overlap at joins, and blending one pixel twice would
  // darken the feather there. A hard "am I the nearest?" test does not work:
  // two quads interpolate the same pixel's world (x, z) differently by
  // ~1e-4 m, so on the tie line each quad handed the pixel to the other and
  // both discarded it — a dotted seam through every join (seen in a render).
  // So ownership is a soft partition: this quad's weight runs 0..1 across an
  // OWNER_BAND-wide strip around the tie with its nearest rival, the two
  // weights sum to 1, and each quad blends alpha 1 - (1 - a)^w, which
  // composes to exactly a. Off the strip it is the plain nearest-capsule test.
  float tOther = 1e9;
  float tBest = 1e9;
  float tD = 0.0;
  float tH = 1.0;
  for (int i = 0; i < TRAIL_N; i++) {
    float di = trailSegDist(tp, trailSegs[i]);
    float e = di - trailHalf[i];
    if (abs(float(i) - vTrailSegId) < 0.5) { tBest = e; tD = di; tH = trailHalf[i]; }
    else tOther = min(tOther, e);
  }
  float tW = clamp(0.5 + (tOther - tBest) / ${f(2 * OWNER_BAND)}, 0.0, 1.0);
  if (tW <= 0.0) discard;
  float tWob = tH * (${f(L.wobbleA1)} * (2.0 * trailNoise(tp / ${f(L.wobbleL1)}, 1.0) - 1.0)
    + ${f(L.wobbleA2)} * (2.0 * trailNoise(tp / ${f(L.wobbleL2)}, 2.0) - 1.0));
  float tSd = tBest - tWob;
  float tAlpha = 1.0 - smoothstep(${f(L.featherIn)}, ${f(L.featherOut)}, tSd);
  if (tAlpha < 0.002) discard;
  vec3 look = vec3(1.0);
  float tC = clamp(1.0 - tD / tH, 0.0, 1.0);
  look *= 1.0 + ${f(L.centreLift)} * tC * tC;
  float tBand = 1.0 - smoothstep(0.0, ${f(L.edgeBand)}, -tSd);
  look *= mix(vec3(1.0), ${v3(L.edgeTint)}, tBand);
  look *= 1.0 + ${f(L.blotch)} * (2.0 * trailNoise(tp / ${f(L.blotchL)}, 7.0) - 1.0);
  vec2 tCell = floor(tp / ${f(L.pebbleCell)});
  if (trailHash(tCell, 3.0) < ${f(L.pebbleChance)}) {
    float span = ${f(L.pebbleCell)} - 2.0 * ${f(L.pebbleRMax)};
    vec2 pc = tCell * ${f(L.pebbleCell)} + ${f(L.pebbleRMax)}
      + span * vec2(trailHash(tCell, 4.0), trailHash(tCell, 5.0));
    float pr = mix(${f(L.pebbleRMin)}, ${f(L.pebbleRMax)}, trailHash(tCell, 6.0));
    float q = length(tp - pc);
    float disk = (1.0 - smoothstep(pr - 0.01, pr, q))
      * smoothstep(${f(L.pebbleMinAlpha)}, ${f(L.pebbleMinAlpha + 0.1)}, tAlpha);
    vec3 pebble = ${v3(L.pebbleTint)} * mix(1.0, ${f(L.pebbleRim)}, smoothstep(0.55 * pr, pr, q));
    look = mix(look, pebble, disk);
  }
  diffuseColor.rgb *= look;
  diffuseColor.a *= tW >= 1.0 ? tAlpha : 1.0 - pow(max(1.0 - tAlpha, 1e-6), tW);
}
`;
}

const ANCHOR_COMMON = '#include <common>';
const ANCHOR_VERT = '#include <begin_vertex>';
const ANCHOR_FRAG = '#include <color_fragment>';

function makeUniforms(segs) {
  return {
    trailSegs: { value: segs.map((s) => new THREE.Vector4(s.x1, s.z1, s.x2, s.z2)) },
    trailHalf: { value: segs.map((s) => s.h) },
  };
}

// Installs the trail field on a MeshStandardMaterial. The uniforms are made
// once and shared by every clone (weather.js's rain swap and dusk.js's lawn
// tint both clone a ground material, and Material.copy() does not carry
// onBeforeCompile, customProgramCacheKey or an overridden clone()).
export function installTrailShader(material, segs, uniforms = makeUniforms(segs)) {
  const n = segs.length;
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(ANCHOR_COMMON, `${ANCHOR_COMMON}\n${VERT_DECL}`)
      .replace(ANCHOR_VERT, `${ANCHOR_VERT}\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(ANCHOR_COMMON, `${ANCHOR_COMMON}\n${fragDecl(n)}`)
      .replace(ANCHOR_FRAG, `${ANCHOR_FRAG}\n${fragBody()}`);
  };
  material.customProgramCacheKey = () => 'trail' + n;
  const baseClone = Object.getPrototypeOf(material).clone;
  material.clone = function clone() {
    return installTrailShader(baseClone.call(this), segs, uniforms);
  };
  return material;
}

export function trailMaterial(color, surface, segs) {
  return installTrailShader(litMaterial(color, { surface, repeat: [1, 1] }), segs);
}

// Adds an area's paths: the hidden 1x1 'path' data strips (one per segment,
// in order — exactly the objects path() always made, so the build's
// Math.random draws do not move), then the one visible trail mesh, built
// under withLocalUuids so it draws nothing from the real Math.random.
// `groups` = [{ segs, w }], `style` = path()'s { surface, color }, `key`
// names the uuid stream (the area id).
export function addTrails(scene, groups, style = {}, key = 'trail') {
  for (const g of groups) {
    for (const s of g.segs) scene.add(path(...s, g.w, { ...style, footprint: true }));
  }
  const segs = trailSegments(groups);
  if (segs.length === 0) return { mesh: null, segs };
  const mesh = withLocalUuids('trail-uuids-' + key, () => {
    const m = new THREE.Mesh(
      trailGeometry(segs, { surface: style.surface }),
      trailMaterial(style.color ?? 0xcbb8a0, style.surface, segs),
    );
    m.name = 'pathTrail';
    // Joins walk.js's wet and dusk ground lists (they filter scene.children
    // by userData.ground || name === 'path').
    m.userData.ground = true;
    m.userData.trail = segs;
    // First in the transparent pass, so prints, puddles and decals draw over.
    m.renderOrder = -1;
    m.castShadow = false;
    m.receiveShadow = true;
    return m;
  });
  scene.add(mesh);
  return { mesh, segs };
}
