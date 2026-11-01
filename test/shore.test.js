import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  shorePieces, shallowExcess, nearestShallow, deckDistance, onDeck, waterClearance,
} from '../src/world/builder.js';

// Same headless stub every world test uses (see test/water.test.js).
vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') {
          return () => ({ addColorStop: () => {} });
        }
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { MOOR_WATERS } = await import('../src/world/moor.js');
const { WOODS_WATERS } = await import('../src/world/woods.js');
const { build: buildSeaside } = await import('../src/world/seaside.js');

const S = (ws, s) => ws.map((w) => ({ ...w, shallow: s }));
const len = (p) => Math.hypot(p.bx - p.ax, p.bz - p.az);

// Distance from (x, z) to the nearest piece.
function distToPieces(pieces, x, z) {
  let min = Infinity;
  for (const p of pieces) {
    const dx = p.bx - p.ax, dz = p.bz - p.az;
    const t = Math.max(0, Math.min(1, ((x - p.ax) * dx + (z - p.az) * dz) / (dx * dx + dz * dz)));
    min = Math.min(min, Math.hypot(x - (p.ax + dx * t), z - (p.az + dz * t)));
  }
  return min;
}

describe('the real shore', () => {
  it("a lone rect's shore is its four edges", () => {
    const pieces = shorePieces([{ id: 'r', kind: 'rect', minX: -5, maxX: 5, minZ: -2, maxZ: 2 }]);
    expect(pieces).toHaveLength(4);
    expect(pieces.reduce((s, p) => s + len(p), 0)).toBeCloseTo(28, 9);
  });

  it("a lone circle's shore is 64 chords, within 1 cm of the circle", () => {
    const pieces = shorePieces([{ id: 'c', kind: 'circle', x: 0, z: 0, r: 7 }]);
    expect(pieces).toHaveLength(64);
    for (const p of pieces) {
      expect(Math.hypot(p.ax, p.az)).toBeCloseTo(7, 9);
      expect(Math.hypot(p.bx, p.bz)).toBeCloseTo(7, 9);
      expect(Math.hypot((p.ax + p.bx) / 2, (p.az + p.bz) / 2)).toBeGreaterThanOrEqual(6.99);
    }
  });

  it('an edge that runs under another water is not shore', () => {
    const pieces = shorePieces(MOOR_WATERS);
    for (let x = -40; x <= -35; x += 0.1) {
      // clamp the ends in by 1e-6: the clip points themselves are shore
      const xx = Math.min(-35 - 1e-5, Math.max(-40 + 1e-5, x));
      for (const z of [10, 8]) {
        const near = pieces.filter((p) => Math.abs(p.az - z) < 1e-6 && Math.abs(p.bz - z) < 1e-6);
        expect(distToPieces(near, xx, z)).toBeGreaterThan(1e-6);
      }
    }
  });

  it('clip points are exact', () => {
    const pieces = shorePieces(MOOR_WATERS);
    const piece = pieces.find((p) => p.id === 'lake' && Math.abs(p.az - 8) < 1e-9 && Math.abs(p.bz - 8) < 1e-9
      && Math.abs(Math.max(p.ax, p.bx) + 40) < 0.01);
    expect(piece).toBeTruthy();
    expect(Math.abs(Math.max(piece.ax, piece.bx) - -40)).toBeLessThan(1e-6);
  });

  it('is cached per waters array', () => {
    expect(shorePieces(MOOR_WATERS)).toBe(shorePieces(MOOR_WATERS));
  });
});

describe('shallow excess', () => {
  it('the Moor ford is deep', () => {
    const waters = S(MOOR_WATERS, 1.2);
    expect(shallowExcess(waters, -37.5, 9)).toBeCloseTo(Math.hypot(2.5, 1) - 1.2, 3);
    // Today's waterClearance sees only the nearest edge of either water: the
    // bug this measure fixes.
    expect(waterClearance(waters, -37.5, 9)).toBeCloseTo(-1, 9);
  });

  it('shallow near a real shore, deep in the middle', () => {
    const waters = S(WOODS_WATERS, 1.2);
    expect(shallowExcess(waters, 0, -9.5)).toBeCloseTo(-0.7, 9);
    expect(shallowExcess(waters, 0, -11.5)).toBeCloseTo(1.3, 9);
    expect(shallowExcess(waters, -44, -11.5)).toBeCloseTo(2.5 - 1.2, 9);
  });

  it('dry ground and decks are never deep', () => {
    const waters = S(WOODS_WATERS, 1.2);
    expect(shallowExcess(waters, 0, 20)).toBe(-Infinity);
    const bridge = WOODS_WATERS.find((w) => w.id === 'river-west').decks[0];
    const cx = (bridge.minX + bridge.maxX) / 2, cz = (bridge.minZ + bridge.maxZ) / 2;
    expect(onDeck(WOODS_WATERS.find((w) => w.id === 'river-west'), cx, cz)).toBe(true);
    expect(shallowExcess(waters, cx, cz)).toBe(-Infinity);
  });

  it('a missing shallow is 0', () => {
    const waters = [{ id: 'c', kind: 'circle', x: 0, z: 0, r: 5 }];
    // chords sit up to 6 mm inside an r 5 circle
    expect(Math.abs(shallowExcess(waters, 4.5, 0) - 0.5)).toBeLessThan(0.01);
  });
});

describe('nearestShallow', () => {
  it('lands on the band', () => {
    const waters = [{ id: 'c', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 }];
    const out = { x: 0, z: 0 };
    expect(nearestShallow(waters, 1, 0, out)).toBe(out);
    expect(shallowExcess(waters, out.x, out.z)).toBeCloseTo(0, 9);
    expect(Math.hypot(out.x - 3.8, out.z)).toBeLessThan(0.01);
  });

  it('prefers a nearer deck, and lands on its edge', () => {
    const { area } = { area: buildSeaside(new THREE.Scene()) };
    const waters = area.waters.map((w) => ({ ...w, shallow: w.shallow ?? 1.5 }));
    const sea = waters.find((w) => w.id === 'sea');
    const out = { x: 0, z: 0 };
    nearestShallow([sea], 34, -8.2, out);
    expect(onDeck(sea, out.x, out.z)).toBe(true);
    expect(out.x).toBeCloseTo(34, 9);
    expect(out.z).toBeCloseTo(-8.5, 9);
  });

  it('leaves a point already in the band, or dry, where it is', () => {
    const waters = [{ id: 'c', kind: 'circle', x: 0, z: 0, r: 5, shallow: 1.2 }];
    const out = { x: 0, z: 0 };
    nearestShallow(waters, 4.5, 0, out);
    expect(out).toEqual({ x: 4.5, z: 0 });
    nearestShallow(waters, 9, 9, out);
    expect(out).toEqual({ x: 9, z: 9 });
  });
});

describe('deckDistance', () => {
  it('is signed: negative inside, positive outside, Infinity with no decks', () => {
    const area = buildSeaside(new THREE.Scene());
    expect(deckDistance(area.waters, 30, -10)).toBeCloseTo(-1.5, 9);
    expect(deckDistance(area.waters, 30, -8.2)).toBeCloseTo(0.3, 9);
    expect(deckDistance([{ id: 'c', kind: 'circle', x: 0, z: 0, r: 5 }], 0, 0)).toBe(Infinity);
    expect(deckDistance(undefined, 0, 0)).toBe(Infinity);
  });
});

describe('shallow widths', () => {
  it('every shipped water declares a shallow width', async () => {
    const builds = [
      await import('../src/world/park.js'), await import('../src/world/seaside.js'),
      await import('../src/world/docks.js'), await import('../src/world/woods.js'),
      await import('../src/world/river.js'), await import('../src/world/moor.js'),
    ];
    for (const m of builds) {
      const area = m.build(new THREE.Scene());
      expect(area.waters.length).toBeGreaterThan(0);
      for (const w of area.waters) {
        expect(w.shallow, w.id).toBeGreaterThanOrEqual(0.8);
        expect(w.shallow, w.id).toBeLessThanOrEqual(1.6);
      }
    }
  });
});

describe('shape guard', () => {
  it('every shipped water uses only shapes the shore and deck code understand', async () => {
    const builds = [
      await import('../src/world/park.js'), await import('../src/world/seaside.js'),
      await import('../src/world/docks.js'), await import('../src/world/woods.js'),
      await import('../src/world/river.js'), await import('../src/world/moor.js'),
    ];
    const fix = 'deckDistance must learn strip decks (as onDeck/onOneDeck does) and outline(w) must add CIRCLE_CHORDS chords per island disc — see the comment above outline()';
    const check = (waters) => {
      for (const w of waters) {
        expect(['rect', 'circle'], `${w.id}: kind ${w.kind}. ${fix}`).toContain(w.kind);
        expect(w.islands, `${w.id}: islands. ${fix}`).toBeUndefined();
        expect(w.holes, `${w.id}: holes. ${fix}`).toBeUndefined();
        for (const d of w.decks ?? []) {
          for (const k of ['minX', 'maxX', 'minZ', 'maxZ']) {
            expect(Number.isFinite(d[k]), `${w.id}: deck ${k}. ${fix}`).toBe(true);
          }
          for (const k of ['x1', 'z1', 'x2', 'z2', 'halfW']) {
            expect(d[k], `${w.id}: strip deck field ${k}. ${fix}`).toBeUndefined();
          }
        }
      }
    };
    for (const m of builds) {
      const waters = m.build(new THREE.Scene()).waters;
      expect(waters.length).toBeGreaterThan(0);
      check(waters);
    }
    // scratch proof it bites (kept: the guard must reject these shapes)
    expect(() => check([{ id: 'x', kind: 'circle', islands: [{}] }])).toThrow(/CIRCLE_CHORDS/);
    expect(() => check([{ id: 'x', kind: 'rect', decks: [{ x1: 0, z1: 0, x2: 1, z2: 1, halfW: 1 }] }])).toThrow(/strip deck/);
  });
});
