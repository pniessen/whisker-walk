import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCat } from '../src/cat/model.js';
import { coatColourAt, coatFromStyle } from '../src/cat/coat.js';
import { LEGS, PAW_Y, PAW_HALF } from '../src/cat/torso.js';
import { LEG_SHAPE, LIMB_SEG, LEG_BLEND, tubeGeometry, limbGeometry, paintLimb, legTopDir, CLAW_HEX, FOOT, footGeometry, plainPawGeometry } from '../src/cat/limbs.js';
import { lookToStyle, DEFAULT_LOOK, PATTERNS, FURS } from '../src/customcats.js';
import { PRESETS, meshCount, triangles, lum } from './helpers/catfingerprint.js';

// The smooth limb (body refinement Task 3): each leg is one tube along a
// curve, a shoulder on the front leg and one thigh bulge on the hind, tapering
// to a slim ankle, vertex-coloured, replacing the old cylinder (+ thigh sphere).

const LOOKS = [
  { ...DEFAULT_LOOK, pattern: 'patches', fur: 'fluffy' },
  { ...DEFAULT_LOOK, pattern: 'points', fur: 'long', coat: 'cream', marks: 'seal' },
];
const ALL_LOOKS = () => PATTERNS.flatMap(([pattern]) => FURS.map(([fur]) => ({ ...DEFAULT_LOOK, pattern, fur, size: 1.15 })));
const KINDS = [[false, false], [false, true], [true, false], [true, true]]; // [hind, simple]
const f32 = (c) => [Math.fround(c.r), Math.fround(c.g), Math.fround(c.b)];

// The tube's rings, read back off the geometry: tube vertex ring*sides + j,
// the dome after them.
function rings(geo) {
  const { sides, rings: n, t } = geo.userData;
  const p = geo.attributes.position;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const c = new THREE.Vector3();
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    for (let j = 0; j < sides; j++) { v.fromBufferAttribute(p, i * sides + j); c.add(v); box.expandByPoint(v); }
    c.divideScalar(sides);
    let r = 0;
    for (let j = 0; j < sides; j++) r += v.fromBufferAttribute(p, i * sides + j).distanceTo(c);
    out.push({ t: t[i * sides], centre: c, box, r: r / sides });
  }
  return out;
}
const radiusAt = (rs, t) => {
  for (let i = 0; i < rs.length - 1; i++) {
    if (t >= rs[i].t && t <= rs[i + 1].t) return rs[i].r + (rs[i + 1].r - rs[i].r) * (t - rs[i].t) / (rs[i + 1].t - rs[i].t);
  }
  return rs[rs.length - 1].r;
};

describe('the smooth limb', () => {
  it('coatColourAt is what paintCoat paints', () => {
    const cats = [
      ...['tabby', 'calico', 'robbie', 'd2'].map((b) => buildCat(b)),
      ...LOOKS.map((look) => buildCat('tabby', undefined, { look })),
    ];
    const builtCoats = [
      ...['tabby', 'calico', 'robbie', 'd2'].map((b, i) => cats[i].userData.parts.body.userData.coat),
      ...LOOKS.map((look) => coatFromStyle(lookToStyle(look))),
    ];
    cats.forEach((cat, k) => {
      const coat = builtCoats[k];
      expect(coat).toBeTruthy();
      const geo = cat.userData.parts.body.geometry;
      const unit = geo.userData.unit;
      const col = geo.attributes.color;
      const c = new THREE.Color();
      for (let i = 0; i < col.count; i++) {
        coatColourAt(coat, [unit[i * 3], unit[i * 3 + 1], unit[i * 3 + 2]], c);
        expect([col.getX(i), col.getY(i), col.getZ(i)]).toEqual(f32(c));
      }
    });
  });

  it('a limb is one welded, smooth piece', () => {
    for (const [hind, simple] of KINDS) {
      const geo = limbGeometry(LEGS.LEN, hind, simple);
      const { sides, rings: n } = geo.userData;
      expect(sides).toBe(LIMB_SEG[simple ? 'simple' : 'full'].sides);
      expect(n).toBe(LIMB_SEG[simple ? 'simple' : 'full'].rings);
      // Welded: no two vertices share a position.
      const bare = new THREE.BufferGeometry();
      bare.setAttribute('position', geo.attributes.position.clone());
      bare.setIndex(geo.index.clone());
      expect(mergeVertices(bare).attributes.position.count).toBe(geo.attributes.position.count);
      // One connected component.
      const count = geo.attributes.position.count;
      const parent = Array.from({ length: count }, (_, i) => i);
      const find = (a) => { while (parent[a] !== a) a = parent[a] = parent[parent[a]]; return a; };
      const idx = geo.index.array;
      for (let i = 0; i < idx.length; i += 3) { parent[find(idx[i])] = find(idx[i + 1]); parent[find(idx[i + 1])] = find(idx[i + 2]); }
      expect(new Set(Array.from({ length: count }, (_, i) => find(i))).size).toBe(1);
      // The only open edges are the bottom ring's.
      const edges = new Map();
      for (let i = 0; i < idx.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const a = idx[i + k], b = idx[i + (k + 1) % 3];
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      const open = [...edges].filter(([, c]) => c === 1).map(([k]) => k.split(',').map(Number));
      expect(open.length).toBe(sides);
      const bottom = new Set(Array.from({ length: sides }, (_, j) => n * sides + j));
      for (const [a, b] of open) { expect(bottom.has(a)).toBe(true); expect(bottom.has(b)).toBe(true); }
      expect([...edges.values()].every((c) => c <= 2)).toBe(true);
      // Faces point outward: each tube vertex's normal leaves its ring's centre.
      const rs = rings(geo);
      const nor = geo.attributes.normal;
      const v = new THREE.Vector3(), m = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < sides; j++) {
          v.fromBufferAttribute(geo.attributes.position, i * sides + j).sub(rs[i].centre);
          m.fromBufferAttribute(nor, i * sides + j);
          expect(v.dot(m)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the front leg has a shoulder and the hind leg a thigh, both tapering to a slim ankle', () => {
    for (const [hind, simple] of KINDS) {
      const rs = rings(limbGeometry(LEGS.LEN, hind, simple));
      expect(radiusAt(rs, 0.05)).toBeGreaterThanOrEqual(hind ? 0.095 : 0.08);
      expect(radiusAt(rs, 0.95)).toBeLessThanOrEqual(0.04);
      if (!hind) continue;
      let w = 0;
      rs.forEach((r, i) => { if (r.r > rs[w].r) w = i; });
      expect(rs[w].t).toBeLessThanOrEqual(1 / 3);
      for (let i = w; i < rs.length - 1; i++) expect(rs[i + 1].r).toBeLessThanOrEqual(rs[i].r + 0.002);
    }
  });

  it('the top is a dome inside the body: no higher than hip + 0.10', () => {
    for (const [hind, simple] of KINDS) {
      for (const len of [LEGS.LEN, LEGS.LEN * 1.35]) {
        const geo = limbGeometry(len, hind, simple);
        geo.computeBoundingBox();
        expect(geo.boundingBox.max.y).toBeLessThanOrEqual(0.10 + 1e-9);
        const { sides, rings: n, t } = geo.userData;
        for (let i = (n + 1) * sides; i < t.length; i++) expect(t[i]).toBe(0);
      }
    }
  });

  it('simple has fewer sides, never a different shape', () => {
    for (const hind of [false, true]) {
      const full = limbGeometry(LEGS.LEN, hind, false);
      const simple = limbGeometry(LEGS.LEN, hind, true);
      expect(full.userData.sides).toBeGreaterThan(simple.userData.sides);
      const distinct = (g) => new Set(Array.from(g.userData.t)).size;
      expect(distinct(simple)).toBe(distinct(full));
      const a = rings(full), b = rings(simple);
      expect(b.length).toBe(a.length);
      a.forEach((ra, i) => {
        const rb = b[i];
        expect(rb.t).toBe(ra.t);
        expect(rb.centre.distanceTo(ra.centre)).toBeLessThan(1e-6);
        for (const k of ['x', 'y', 'z']) {
          expect(Math.abs(rb.box.min[k] - ra.box.min[k])).toBeLessThanOrEqual(0.005);
          expect(Math.abs(rb.box.max[k] - ra.box.max[k])).toBeLessThanOrEqual(0.005);
        }
      });
    }
  });

  it('a leg is one limb mesh and one paw mesh, and the limb is within budget', () => {
    const cats = [];
    for (const simple of [false, true]) {
      for (const b of PRESETS) cats.push([buildCat(b, undefined, { simple }), simple]);
      for (const look of ALL_LOOKS()) cats.push([buildCat('tabby', undefined, { look, simple }), simple]);
    }
    for (const [cat, simple] of cats) {
      for (const leg of cat.userData.parts.legs) {
        expect(meshCount(leg)).toBe(2);
        const limb = leg.children[0];
        expect(limb.isMesh).toBe(true);
        expect(limb.geometry.userData.t).toBeInstanceOf(Float32Array);
        expect(limb.material.vertexColors).toBe(true);
        expect(limb).not.toBe(leg.userData.paw);
        expect(triangles(limb)).toBeLessThanOrEqual(simple ? 180 : 220);
      }
    }
  });

  it("leg colours keep each cat's scheme", () => {
    const cases = [
      [buildCat('robbie'), 0xf5f5f5],
      [buildCat('d2'), 0xf5f5f2],
      [buildCat('siamese'), 0x4a3b32],
      [buildCat('tabby'), 0x9c7a4f],
      [buildCat('tabby', undefined, { look: LOOKS[1] }), lookToStyle(LOOKS[1]).accent],
    ];
    for (const [cat, legHex] of cases) {
      const { body, legs } = cat.userData.parts;
      const coat = body.userData.coat;
      for (const leg of legs) {
        const geo = leg.children[0].geometry;
        const { t } = geo.userData;
        const col = geo.attributes.color;
        const top = coatColourAt(coat, legTopDir(leg.position.x, leg.position.z, coat.frame));
        const want = f32(new THREE.Color(legHex));
        for (let i = 0; i < t.length; i++) {
          const got = [col.getX(i), col.getY(i), col.getZ(i)];
          if (t[i] >= LEG_BLEND) expect(got).toEqual(want);
          if (t[i] === 0) expect(got).toEqual(f32(top));
        }
      }
    }
    // Robbie's white legs: pale everywhere below the blend.
    for (const leg of buildCat('robbie').userData.parts.legs) {
      const geo = leg.children[0].geometry;
      const col = geo.attributes.color;
      geo.userData.t.forEach((t, i) => {
        if (t >= LEG_BLEND) expect(lum(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)))).toBeGreaterThan(0.8);
      });
    }
  });

  it('paintLimb blends top to leg colour by smoothstep over LEG_BLEND', () => {
    const geo = paintLimb(tubeGeometry(LEG_SHAPE.front.points, LEG_SHAPE.front.radii, LIMB_SEG.full), 0xffffff, 0x000000);
    const col = geo.attributes.color;
    geo.userData.t.forEach((t, i) => {
      const k = Math.min(1, t / LEG_BLEND);
      const s = k * k * (3 - 2 * k);
      expect(col.getX(i)).toBeCloseTo(s, 5);
    });
  });

  it('built from a length', () => {
    const cat = buildCat('digit');
    for (const leg of cat.userData.parts.legs) {
      const limb = leg.children[0];
      const rs = rings(limb.geometry);
      const bottom = rs[rs.length - 1];
      expect(Math.abs(bottom.centre.y - -0.335 * 1.35)).toBeLessThanOrEqual(0.005);
      const paw = leg.userData.paw;
      paw.updateMatrix();
      paw.geometry.computeBoundingBox();
      const pawBox = paw.geometry.boundingBox.clone().applyMatrix4(paw.matrix).expandByScalar(1e-9);
      expect(pawBox.containsBox(bottom.box)).toBe(true);
    }
    // The top point and the radii stay; the lower points stretch in y.
    for (const hind of [false, true]) {
      const shape = LEG_SHAPE[hind ? 'hind' : 'front'];
      const a = rings(limbGeometry(LEGS.LEN, hind)), b = rings(limbGeometry(LEGS.LEN * 1.35, hind));
      expect(b[0].r).toBeCloseTo(a[0].r, 6);
      expect(b[b.length - 1].r).toBeCloseTo(a[a.length - 1].r, 6);
      expect(b[b.length - 1].centre.y).toBeCloseTo(shape.points[shape.points.length - 1][1] * 1.35, 3);
    }
  });

  it('no randomness', () => {
    const src = fs.readFileSync(new URL('../src/cat/limbs.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/rng/i);
  });
});

// ---------------------------------------------------------------------------
// The foot (body refinement Task 4): a soft oval with a flat sole and a low
// rounded top, four toes scalloped into its front edge, claw tips just
// showing (R6). Feet items swap back to today's plain paw (R8).

const CLAW_F32 = f32(new THREE.Color(CLAW_HEX));
const isClaw = (geo, i) => {
  const col = geo.attributes.color;
  if (!col) return false;
  return col.getX(i) === CLAW_F32[0] && col.getY(i) === CLAW_F32[1] && col.getZ(i) === CLAW_F32[2];
};
const geoBox = (geo) => { geo.computeBoundingBox(); return geo.boundingBox.clone(); };

// The front edge, seen from above, of the foot's lower 60% (claws left out):
// x binned into 24 bins across the foot's width, each bin's front-most point
// (forward is -z). The points are the vertices plus points along every edge
// between them, so a coarse oval reads as the convex outline it is rather
// than as dips between its sparse vertices (a plain 12-sided ball's vertices
// alone show dips of several cm between its longitudes).
function frontProfile(geo) {
  const p = geo.attributes.position;
  const box = geoBox(geo);
  const lower = box.min.y + 0.6 * (box.max.y - box.min.y);
  const width = box.max.x - box.min.x;
  const bins = new Array(24).fill(-Infinity);
  const put = (x, y, z) => {
    if (y > lower + 1e-9) return;
    const b = Math.min(23, Math.max(0, Math.floor(((x - box.min.x) / width) * 24)));
    bins[b] = Math.max(bins[b], -z);
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const idx = geo.index ? geo.index.array : Array.from({ length: p.count }, (_, i) => i);
  for (let i = 0; i < idx.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const i0 = idx[i + k], i1 = idx[i + (k + 1) % 3];
      if (isClaw(geo, i0) || isClaw(geo, i1)) continue;
      a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1);
      for (let s = 0; s <= 8; s++) {
        const u = s / 8;
        put(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u);
      }
    }
  }
  const profile = [];
  bins.forEach((f, i) => { if (f > -Infinity) profile.push({ x: box.min.x + ((i + 0.5) / 24) * width, f }); });
  return { profile, width, box, lower };
}
// The toes: local forward maxima of the front profile, each with >= 0.004 of
// prominence over the scallop between it and its neighbouring maximum (the
// shallower scallop when it has two). A maximum with no neighbour has no
// scallop, so a plain oval has none. Maxima below the prominence are dropped
// one at a time, weakest first, so a sampling ripple can't split a scallop.
function toeMaxima(geo, minProm = 0.004) {
  const { profile: p, width } = frontProfile(geo);
  let peaks = [];
  for (let i = 1; i < p.length - 1; i++) if (p[i].f > p[i - 1].f && p[i].f >= p[i + 1].f) peaks.push(i);
  for (;;) {
    const prom = peaks.map((i, k) => {
      const dips = [];
      if (k > 0) dips.push(Math.min(...p.slice(peaks[k - 1], i + 1).map((q) => q.f)));
      if (k < peaks.length - 1) dips.push(Math.min(...p.slice(i, peaks[k + 1] + 1).map((q) => q.f)));
      return dips.length ? p[i].f - Math.max(...dips) : 0;
    });
    let w = -1;
    prom.forEach((v, k) => { if (v < minProm && (w < 0 || v < prom[w])) w = k; });
    if (w < 0) return { peaks: peaks.map((i) => p[i]), prom, width };
    peaks.splice(w, 1);
  }
}

const bareCats = () => {
  const out = [];
  for (const simple of [false, true]) {
    for (const b of PRESETS) out.push([buildCat(b, undefined, { simple }), simple, b]);
    for (const look of ALL_LOOKS()) out.push([buildCat('tabby', undefined, { look, simple }), simple, look.pattern]);
  }
  return out;
};

describe('the foot', () => {
  it('four toes scalloped into the front edge', () => {
    for (const simple of [false, true]) {
      const geo = footGeometry(0xd8c39a, simple);
      const { peaks, width } = toeMaxima(geo);
      expect(peaks.length, simple ? 'simple' : 'full').toBe(4);
      peaks.forEach((q, i) => expect(Math.abs(q.x - FOOT.TOES[i] * width / 2)).toBeLessThanOrEqual(0.012));
    }
    // The same foot on bare cats, full and simple, presets and custom looks.
    const spread = bareCats().filter((c, i) => i % 5 === 0);
    expect(spread.some(([, simple]) => simple)).toBe(true);
    expect(spread.some(([, simple]) => !simple)).toBe(true);
    for (const [cat, simple] of spread) {
      for (const leg of cat.userData.parts.legs) expect(toeMaxima(leg.userData.paw.geometry).peaks.length, `${simple}`).toBe(4);
    }
  });

  it('claws just showing at the toe tips', () => {
    for (const simple of [false, true]) {
      const geo = footGeometry(0xd8c39a, simple);
      const p = geo.attributes.position;
      const claws = [];
      for (let i = 0; i < p.count; i++) if (isClaw(geo, i)) claws.push(new THREE.Vector3().fromBufferAttribute(p, i));
      expect(claws.length).toBeGreaterThan(0);
      // Clusters: claw vertices left to right, a new claw wherever there is a
      // gap of more than 0.006 across.
      claws.sort((a, b) => a.x - b.x);
      const clusters = [];
      for (const v of claws) {
        const last = clusters[clusters.length - 1];
        if (last && v.x - last[last.length - 1].x <= 0.006) last.push(v); else clusters.push([v]);
      }
      expect(clusters.length).toBe(4);
      const { width, lower } = frontProfile(geo);
      clusters.forEach((cl, k) => {
        // The toe's front-most point: the front-most non-claw vertex of the
        // foot's lower part near that toe's centre.
        const tx = FOOT.TOES[k] * width / 2;
        let tip = null;
        for (let i = 0; i < p.count; i++) {
          if (isClaw(geo, i)) continue;
          const v = new THREE.Vector3().fromBufferAttribute(p, i);
          if (v.y > lower || Math.abs(v.x - tx) > 0.008) continue;
          if (!tip || v.z < tip.z) tip = v;
        }
        expect(tip).toBeTruthy();
        const centre = cl.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(cl.length);
        expect(centre.distanceTo(tip)).toBeLessThanOrEqual(0.015);
        const reach = Math.max(...cl.map((v) => tip.z - v.z));
        expect(reach).toBeGreaterThan(0);          // showing
        expect(reach).toBeLessThanOrEqual(0.012);  // just
      });
    }
  });

  it('a flat sole at PAW_HALF and the heel where it was', () => {
    for (const simple of [false, true]) {
      const geo = footGeometry(0xd8c39a, simple);
      const box = geoBox(geo);
      expect(Math.abs(box.min.y + PAW_HALF)).toBeLessThanOrEqual(1e-6);
      const p = geo.attributes.position;
      let flat = 0;
      for (let i = 0; i < p.count; i++) if (p.getY(i) - box.min.y <= 0.002) flat++;
      expect(flat).toBeGreaterThanOrEqual(8);
      expect(Math.abs(box.max.z - 0.012 - 0.0747)).toBeLessThanOrEqual(0.01);
      expect(box.max.x - box.min.x).toBeLessThanOrEqual(0.13); // no clogs
    }
    for (const leg of buildCat('tabby').userData.parts.legs) {
      expect(leg.userData.paw.position.toArray()).toEqual([0, PAW_Y, -0.012]);
    }
  });

  it('feet items get the plain paw', () => {
    const plain = plainPawGeometry().attributes.position.array;
    const want = {
      booties: () => 0xf2c14e,
      goldbooties: () => 0xf5c518,
      sneakers: () => 0xf2f2f2,
      rainboots: () => 0x3a6ea5,
      socks: (i) => [0xf27ab0, 0x7ec9b8, 0xf2c14e, 0xf5f5f5][i],
    };
    expect(plainPawGeometry().attributes.color).toBeUndefined();
    for (const breed of ['tabby', 'digit']) {
      for (const [feet, hex] of Object.entries(want)) {
        buildCat(breed, { feet }).userData.parts.legs.forEach((leg, i) => {
          const paw = leg.userData.paw;
          expect(paw.geometry.attributes.color, feet).toBeUndefined();
          expect(paw.material.vertexColors).toBeFalsy();
          expect(toeMaxima(paw.geometry).peaks.length, feet).toBe(0);
          expect(paw.material.color.getHex(), feet).toBe(new THREE.Color(hex(i)).getHex());
          expect(Array.from(paw.geometry.attributes.position.array)).toEqual(Array.from(plain));
        });
      }
    }
  });

  it("paw colours keep each cat's scheme, no ready-made cat gains socks", () => {
    // Today's paw colours, read off the built paws before the foot.
    const today = {
      tabby: 0xd8c39a, siamese: 0x4a3b32, persian: 0xe8e8ec, black: 0x3a3a42, calico: 0xf8f4e8,
      mainecoon: 0xb99a72, zeetoo: 0xe0cca0, robbie: 0xf5f5f5, d2: 0xf5f5f2, digit: 0xf5f5f5,
    };
    const cases = PRESETS.map((b) => [buildCat(b), today[b], b]);
    for (const pattern of ['socks', 'points']) {
      const look = { ...DEFAULT_LOOK, pattern };
      const s = lookToStyle(look);
      cases.push([buildCat('tabby', undefined, { look }), pattern === 'socks' ? 0xf5f5f5 : s.accent, pattern]);
    }
    for (const [cat, hex, name] of cases) {
      const want = f32(new THREE.Color(hex));
      for (const leg of cat.userData.parts.legs) {
        const geo = leg.userData.paw.geometry;
        const col = geo.attributes.color;
        expect(col, name).toBeTruthy();
        expect(leg.userData.paw.material.vertexColors).toBe(true);
        for (let i = 0; i < col.count; i++) {
          if (isClaw(geo, i)) continue;
          expect([col.getX(i), col.getY(i), col.getZ(i)], name).toEqual(want);
        }
      }
    }
  });

  it('a smooth ankle', () => {
    for (const [cat, simple, name] of bareCats().filter((c, i) => i % 3 === 0)) {
      for (const leg of cat.userData.parts.legs) {
        const rs = rings(leg.children[0].geometry);
        const bottom = rs[rs.length - 1];
        expect(bottom.r, name).toBeGreaterThanOrEqual(0.03);
        const paw = leg.userData.paw;
        paw.updateMatrix();
        const pawBox = geoBox(paw.geometry).applyMatrix4(paw.matrix).expandByScalar(1e-9);
        expect(pawBox.containsBox(bottom.box), `${name} ${simple}`).toBe(true);
      }
    }
  });

  it('a whole leg is within budget', () => {
    for (const [cat, simple, name] of bareCats()) {
      for (const leg of cat.userData.parts.legs) {
        expect(triangles(leg.userData.paw), name).toBeLessThanOrEqual(simple ? 160 : 180);
        expect(triangles(leg), name).toBeLessThanOrEqual(simple ? 340 : 400);
      }
    }
  });

  it('no randomness in the foot', () => {
    const src = fs.readFileSync(new URL('../src/cat/limbs.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
  });
});
