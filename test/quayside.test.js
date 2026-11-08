import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { duskLook, tintDuskLawn } from '../src/render/dusk.js';

// The headless canvas stub every world test uses (see test/seaside.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

// polish-quayside (Pass 8, 8-6): the car, the barges, the fish shed's door,
// the skyline's detail and the Seaside edge's dusk tint.
const B = await import('../src/world/builder.js');
const dressing = await import('../src/world/docksdressing.js');
const seaside = await import('../src/world/seaside.js');

const trisOf = (o) => {
  let t = 0;
  o.traverse((m) => { if (m.isMesh) t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return t;
};
const boxOf = (o) => { o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(o); };
const near = (a, b) => a.toArray().every((v, i) => Math.abs(v - b[i]) < 1e-3);

describe('the car (polish-quayside)', () => {
  it('keeps the two-box car\'s bounding box, so its contact shadow and caster class hold', () => {
    const bb = boxOf(B.car(0, 0));
    expect(near(bb.min, [-1.025, 0, -2])).toBe(true);
    expect(near(bb.max, [1.025, 1.425, 2])).toBe(true);
  });

  it('is a car shape, not two boxes: wheel arches, a waist and a lower bonnet than roof', () => {
    const car = B.car(0, 0);
    const paint = car.children[0].geometry.attributes.position;
    let inArch = 0, bonnetTop = 0;
    for (let i = 0; i < paint.count; i++) {
      const x = paint.getX(i), y = paint.getY(i), z = paint.getZ(i);
      // nothing painted low over a tyre: the arch is cut round it
      if (Math.abs(Math.abs(z) - 1.3) < 0.15 && y < 0.7 && Math.abs(x) < 0.85) inArch++;
      if (z > 1.2) bonnetTop = Math.max(bonnetTop, y);
    }
    expect(inArch).toBe(0);
    expect(bonnetTop).toBeLessThan(1.0);
    expect(trisOf(car)).toBeLessThanOrEqual(344 + 1500);
  });
});

describe('the barge (polish-quayside)', () => {
  it('keeps the box barge\'s bounding box', () => {
    const bb = boxOf(B.barge(0, 0));
    expect(near(bb.min, [-1.65, -0.05, -4.55])).toBe(true);
    expect(near(bb.max, [1.65, 2.75, 4.55])).toBe(true);
  });

  it('has a wheelhouse and its dressing in one vertex-coloured mesh, under 2,000 triangles', () => {
    const g = B.barge(0, 0);
    const dress = g.getObjectByName('bargeDressing');
    expect(dress).toBeTruthy();
    expect(dress.material.vertexColors).toBe(true);
    const pos = dress.geometry.attributes.position;
    let top = 0;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
    expect(top).toBeGreaterThan(2.4); // the wheelhouse roof over the cabin
    expect(trisOf(g)).toBeLessThanOrEqual(2000);
  });
});

describe('the fish shed\'s door (polish-quayside)', () => {
  it('stops 0.4 m under a low roof, its lintel under the roof too', () => {
    const shed = B.warehouse(6.5, -23.5, 6, 5, 1.8, 0x7a6a5a, 0x44404a, 'siding');
    shed.updateMatrixWorld(true);
    const squashed = shed.children.filter((c) => c.isMesh && c.scale.y !== 1);
    expect(squashed.length).toBe(1); // the door
    expect(new THREE.Box3().setFromObject(squashed[0]).max.y).toBeCloseTo(1.4, 5);
    const front = shed.children.filter((c) => c.isMesh && c.position.z > 2.5 && Math.abs(c.position.x) < 1e-6);
    expect(front.length).toBeGreaterThanOrEqual(2); // the door and its lintel
    for (const c of front) expect(new THREE.Box3().setFromObject(c).max.y).toBeLessThan(1.8 - 0.1);
  });

  it('a tall warehouse keeps its 2.2 m door', () => {
    const w = B.warehouse(20, 16, 10, 8, 5, 0x8a6a5a, 0x44404a, 'brick');
    expect(w.children.filter((c) => c.isMesh && c.scale.y !== 1)).toEqual([]);
  });
});

describe('the skyline\'s detail (polish-quayside)', () => {
  it('gives every warehouse piece many more parts than a body, a roof and holes', () => {
    for (const p of dressing.SKYLINE.filter((q) => ['shed', 'gable', 'sawtooth'].includes(q.kind))) {
      const parts = dressing.skylinePartsOf(p);
      // body, plinth (3), a cornice, a gutter, a downpipe, roof, frames ...
      expect(parts.length, `${p.kind} at ${p.x},${p.z}`).toBeGreaterThanOrEqual(9);
      // the walls in courses: more than one tone up the body
      const body = parts[0].attributes.color;
      const tones = new Set();
      for (let v = 0; v < body.count; v += 3) tones.add(body.getX(v).toFixed(4));
      expect(tones.size, `${p.kind} at ${p.x},${p.z}`).toBeGreaterThan(3);
    }
  });
});

describe('the Seaside edge at dusk (polish-quayside)', () => {
  it('tags the band\'s edge dressing with the huts\' stronger dusk tint', () => {
    const scene = new THREE.Scene();
    seaside.build(scene, {});
    const edge = scene.getObjectByName('horizonEdge');
    expect(edge.userData.duskLawnTint).toBe(seaside.HUT_DUSK_TINT);
    expect(seaside.HUT_DUSK_TINT.dark).toBeLessThan(duskLook({}).lawnTint.dark);
  }, 120_000);

  it('tintDuskLawn honours a mesh\'s own duskLawnTint, and puts it all back', () => {
    const make = () => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xf2a7b5 }));
    const plain = make(), hut = make();
    hut.userData.duskTint = true;
    hut.userData.duskLawnTint = seaside.HUT_DUSK_TINT;
    const origHut = hut.material;
    const h = tintDuskLawn({ ground: [plain, hut], grass: null, look: duskLook({}) });
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    expect(lum(hut.material.color)).toBeLessThan(lum(plain.material.color) * 0.75);
    h.dispose();
    expect(hut.material).toBe(origHut);
  });
});
