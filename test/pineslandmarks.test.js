import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';

// The headless canvas stub every world test uses (test/pines.test.js).
vi.stubGlobal('document', {
  addEventListener() {},
  pointerLockElement: null,
  exitPointerLock() {},
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'measureText') return () => ({ width: 0 });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const {
  standingStoneData, lightningStumpData, frogStoneData, fillGeometry,
} = await import('../src/world/pineslandmarks.js');

const PILLAR_R = 0.9;
const PILLAR_H = 1.9;
const PILLAR_TOP = 0.75;
const TRUCE_R = 0.4;
const TRUCE_H = 1.25;

const builders = {
  'truce-0': () => standingStoneData('truce-0', TRUCE_R, TRUCE_H),
  'truce-1': () => standingStoneData('truce-1', TRUCE_R, TRUCE_H),
  stump: () => lightningStumpData(PILLAR_R, PILLAR_H, PILLAR_TOP),
  frog: () => frogStoneData(PILLAR_R, PILLAR_H),
};
const radius = { 'truce-0': TRUCE_R, 'truce-1': TRUCE_R, stump: PILLAR_R, frog: PILLAR_R };

const verts = (d) => {
  const out = [];
  for (let i = 0; i < d.position.length; i += 3) out.push([d.position[i], d.position[i + 1], d.position[i + 2]]);
  return out;
};

describe('pineslandmarks data', () => {
  it('each builder is deterministic and finite', () => {
    for (const [name, fn] of Object.entries(builders)) {
      const a = fn();
      const b = fn();
      for (const key of ['position', 'color', 'index']) {
        expect(a[key].length, `${name} ${key}`).toBeGreaterThan(0);
        expect(Array.from(a[key]), `${name} ${key}`).toEqual(Array.from(b[key]));
        expect(Array.from(a[key]).every(Number.isFinite), `${name} ${key}`).toBe(true);
      }
      expect(a.color.length).toBe(a.position.length);
      expect(Math.max(...a.index)).toBeLessThan(a.position.length / 3);
    }
  });

  it('the two truce stones differ', () => {
    expect(Array.from(builders['truce-0']().position)).not.toEqual(Array.from(builders['truce-1']().position));
  });

  it('foot rule: within the collider below 0.3 m, never more than 0.08 past it', () => {
    for (const [name, fn] of Object.entries(builders)) {
      const r = radius[name];
      for (const [x, y, z] of verts(fn())) {
        const h = Math.hypot(x, z);
        if (y < 0.3) expect(h, `${name} foot at y ${y}`).toBeLessThanOrEqual(r + 0.02);
        expect(h, `${name} at y ${y}`).toBeLessThanOrEqual(r + 0.08);
      }
    }
  });

  it('perch rule: the stump and the Frog Stones are flat at the perch within 0.4 m', () => {
    for (const name of ['stump', 'frog']) {
      const v = verts(builders[name]());
      let centre = 0;
      for (const [x, y, z] of v) {
        if (Math.hypot(x, z) <= 0.4 && y > PILLAR_H - 0.3) {
          expect(Math.abs(y - PILLAR_H), `${name} (${x}, ${y}, ${z})`).toBeLessThanOrEqual(0.03);
          centre++;
        }
      }
      expect(centre, name).toBeGreaterThan(0);
      // splinters only beyond r 0.5
      for (const [x, y, z] of v) {
        if (y > PILLAR_H + 0.03) expect(Math.hypot(x, z), name).toBeGreaterThan(0.5);
      }
    }
    const stumpTop = Math.max(...verts(builders.stump()).map((p) => p[1]));
    // jagged, but no tooth above h + 0.12 (the golden mouse stays in sight)
    expect(stumpTop).toBeGreaterThan(PILLAR_H + 0.08);
    expect(stumpTop).toBeLessThanOrEqual(PILLAR_H + 0.12 + 1e-9);
    // and some teeth snapped down below the perch
    const rimLow = verts(builders.stump())
      .filter(([x, y, z]) => Math.hypot(x, z) > 0.6 && y > PILLAR_H - 0.3 && y < PILLAR_H - 0.05);
    expect(rimLow.length).toBeGreaterThan(0);
    const frogTop = Math.max(...verts(builders.frog()).map((p) => p[1]));
    expect(frogTop).toBeLessThanOrEqual(PILLAR_H + 0.03);
  });

  it('the stump has its split on the east side and its scar on the west', () => {
    const v = verts(builders.stump());
    // the V-notch: a rim vertex on +x down at h - 0.6
    expect(v.some(([x, y, z]) => x > 0.6 && Math.abs(z) < 0.05 && Math.abs(y - (PILLAR_H - 0.6)) < 1e-6)).toBe(true);
    // pale scar colours somewhere on the west side, and only there
    const d = builders.stump();
    let pale = 0;
    for (let i = 0; i < d.position.length / 3; i++) {
      const lum = d.color[i * 3] + d.color[i * 3 + 1] + d.color[i * 3 + 2];
      if (lum > 1.0) {
        pale++;
        expect(d.position[i * 3], 'scar on -x').toBeLessThan(-0.4);
        expect(d.position[i * 3 + 1], 'scar above 0.5 m').toBeGreaterThanOrEqual(0.5);
      }
    }
    expect(pale).toBeGreaterThan(6);
  });

  it('a standing stone is about 1.25 m tall and leans only a little', () => {
    for (const name of ['truce-0', 'truce-1']) {
      const v = verts(builders[name]());
      const top = Math.max(...v.map((p) => p[1]));
      expect(top, name).toBeGreaterThanOrEqual(1.1);
      expect(top, name).toBeLessThanOrEqual(1.35);
      expect(Math.min(...v.map((p) => p[1])), name).toBeCloseTo(0, 6);
    }
  });

  it('stays low-poly: the four landmarks together are at most 2100 triangles', () => {
    const tris = Object.values(builders).reduce((n, fn) => n + fn().index.length / 3, 0);
    expect(tris).toBeLessThanOrEqual(2100);
    expect(tris).toBeGreaterThan(200);
  });

  it('fillGeometry fills an existing geometry with faceted normals', () => {
    const geo = new THREE.BufferGeometry();
    const out = fillGeometry(geo, builders.frog());
    expect(out).toBe(geo);
    expect(geo.attributes.position.count).toBe(builders.frog().position.length / 3);
    expect(geo.attributes.color.itemSize).toBe(3);
    expect(geo.attributes.normal).toBeTruthy();
    expect(geo.index.count).toBe(builders.frog().index.length);
  });
});

describe('the built Pines', () => {
  it('draws the landmarks from the data, keeps colliders and perches, and peats the mire', async () => {
    const { build } = await import('../src/world/pines.js');
    const scene = new THREE.Scene();
    const area = build(scene);
    const truce = scene.getObjectByName('truceStones');
    expect(truce.children.filter((c) => c.isMesh)).toHaveLength(2);
    for (const s of truce.children) {
      expect(s.position.y).toBe(0);
      expect(s.material.vertexColors).toBe(true);
    }
    for (const name of ['lightningStump', 'frogStone']) {
      const m = scene.getObjectByName(name);
      expect(m, name).toBeTruthy();
      expect(m.material.vertexColors, name).toBe(true);
      expect(m.geometry.type, name).toBe('BufferGeometry');
    }
    // Colliders and perches, recorded from main before polish-cosy
    // (127 colliders, 15 perches): sha256 of their JSON.
    expect(area.colliders).toHaveLength(127);
    expect(area.perches).toHaveLength(15);
    const json = JSON.stringify({ colliders: area.colliders, perches: area.perches });
    expect(createHash('sha256').update(json).digest('hex'))
      .toBe('07f7a139f01f251cb168db793f31f36a75de57b34b3af79cec8f80469ddd13ab');
    // the mire's soft glare
    expect(scene.getObjectByName('water:mire-north').material.specularIntensity).toBe(0.18);
    expect(scene.getObjectByName('water:mire-west').material.specularIntensity).toBe(0.18);
  }, 120_000);
});
