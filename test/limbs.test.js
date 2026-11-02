import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildCat } from '../src/cat/model.js';
import { coatColourAt, coatFromStyle } from '../src/cat/coat.js';
import { LEGS } from '../src/cat/torso.js';
import { LEG_SHAPE, LIMB_SEG, LEG_BLEND, tubeGeometry, limbGeometry, paintLimb, legTopDir } from '../src/cat/limbs.js';
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
