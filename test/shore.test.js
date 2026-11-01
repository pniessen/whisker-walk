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

describe('islands are shore', () => {
  const ISLE = { x: 0, z: 0, r: 6 };
  const lake = { id: 'l', kind: 'rect', minX: -30, maxX: 30, minZ: -20, maxZ: 20, shallow: 1.2, islands: [ISLE] };
  const rim = (p) => [Math.hypot(p.ax - ISLE.x, p.az - ISLE.z), Math.hypot(p.bx - ISLE.x, p.bz - ISLE.z)];

  it("an island's rim is CIRCLE_CHORDS chords, half a chord round like a circle's", () => {
    const pieces = shorePieces([lake]);
    expect(pieces).toHaveLength(4 + 64);
    const chords = pieces.filter((p) => rim(p).every((d) => Math.abs(d - ISLE.r) < 1e-9));
    expect(chords).toHaveLength(64);
    for (const p of chords) expect(p.shallow).toBe(1.2);
    // the same phase as a circle footprint's chords: a chord's midpoint, not a
    // vertex, faces due east
    const circle = shorePieces([{ id: 'c', kind: 'circle', x: 0, z: 0, r: 6 }]);
    const key = (p) => [p.ax, p.az, p.bx, p.bz].map((v) => v.toFixed(9)).join();
    expect(new Set(chords.map(key))).toEqual(new Set(circle.map(key)));
  });

  it('depth near an island is measured to its rim', () => {
    const waters = [lake];
    // 0.5 m off the rim, due east and on a diagonal: in the band
    expect(Math.abs(shallowExcess(waters, 6.5, 0) - (0.5 - 1.2))).toBeLessThan(0.02);
    const k = Math.SQRT1_2 * 6.5;
    expect(Math.abs(shallowExcess(waters, k, k) - (0.5 - 1.2))).toBeLessThan(0.02);
    // 3 m off: deep, and only by 1.8 (the far shore is 14 m away)
    expect(Math.abs(shallowExcess(waters, 9, 0) - (3 - 1.2))).toBeLessThan(0.02);
    // the island itself is dry
    expect(shallowExcess(waters, 0, 0)).toBe(-Infinity);
    expect(shallowExcess(waters, 5.9, 0)).toBe(-Infinity);
  });

  it('a non-swimmer off the island is held in the band beside the island, not thrown to a far one', () => {
    const waters = [lake];
    const out = { x: 0, z: 0 };
    for (const a of [0, 0.3, 1.1, 2, 3.5, 5]) {
      const x = Math.cos(a) * 9, z = Math.sin(a) * 9;
      nearestShallow(waters, x, z, out);
      expect(Math.abs(shallowExcess(waters, out.x, out.z)), `angle ${a}`).toBeLessThan(1e-9);
      // back toward the island, along the radius, to 1.2 m off the rim
      expect(Math.abs(Math.hypot(out.x, out.z) - (ISLE.r + 1.2)), `angle ${a}`).toBeLessThan(0.02);
      expect(Math.abs(Math.atan2(out.z, out.x) - Math.atan2(z, x)), `angle ${a}`).toBeLessThan(0.01);
    }
  });

  it('an island over its rect edge: only the rim facing its own water is shore, and the edge across the island is not', () => {
    const w = { id: 'l', kind: 'rect', minX: -10, maxX: 10, minZ: -10, maxZ: 10, shallow: 1, islands: [{ x: 10, z: 0, r: 3 }] };
    const pieces = shorePieces([w]);
    for (const p of pieces) {
      for (const [x, z] of [[p.ax, p.az], [p.bx, p.bz], [(p.ax + p.bx) / 2, (p.az + p.bz) / 2]]) {
        // nothing east of the rect's edge, and nothing on the edge inside the island
        expect(x, `(${x}, ${z})`).toBeLessThanOrEqual(10 + 1e-5);
        if (Math.abs(x - 10) < 1e-6) expect(Math.abs(z), `(${x}, ${z})`).toBeGreaterThanOrEqual(3 - 1e-6);
      }
    }
    // the west half of the rim is there, clipped exactly at the edge
    // (the two chords that straddle the edge are cut at their middles, off the rim)
    const nearRim = (x, z) => Math.abs(Math.hypot(x - 10, z) - 3) < 0.01;
    const rimLen = pieces.filter((p) => nearRim(p.ax, p.az) && nearRim(p.bx, p.bz)).reduce((s, p) => s + len(p), 0);
    expect(Math.abs(rimLen - Math.PI * 3)).toBeLessThan(0.01);
    // the edge x 10 keeps only its two runs off the island: 7 m each
    const edge = pieces.filter((p) => Math.abs(p.ax - 10) < 1e-9 && Math.abs(p.bx - 10) < 1e-9);
    expect(Math.abs(edge.reduce((s, p) => s + len(p), 0) - 14)).toBeLessThan(1e-5);
  });

  it('two waters that share an island both see its rim', () => {
    const a = { id: 'a', kind: 'rect', minX: -20, maxX: 2, minZ: -20, maxZ: 20, shallow: 1, islands: [ISLE] };
    const b = { id: 'b', kind: 'rect', minX: -2, maxX: 20, minZ: -20, maxZ: 20, shallow: 1, islands: [ISLE] };
    const waters = [a, b];
    for (const [x, z] of [[-6.5, 0], [6.5, 0], [0, 6.5], [0, -6.5]]) {
      expect(Math.abs(shallowExcess(waters, x, z) - (0.5 - 1)), `(${x}, ${z})`).toBeLessThan(0.02);
    }
    // a's east edge and b's west edge run under each other, or across the
    // island: no shore (but for the 1e-6 stubs where each meets the other's
    // outer edge, which is real shore)
    const pieces = shorePieces(waters);
    for (const p of pieces) {
      if (len(p) > 1e-3 && Math.abs(p.ax - p.bx) < 1e-9 && (Math.abs(p.ax - 2) < 1e-9 || Math.abs(p.ax + 2) < 1e-9)) {
        throw new Error(`shore along x ${p.ax}: (${p.az}..${p.bz})`);
      }
    }
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

  // A strip deck is an oriented rectangle in its own frame, flat at both ends
  // (not a capsule), exactly as onDeck reads it.
  const strip = { x1: 0, z1: 0, x2: 6, z2: 8, halfW: 1 };
  const stripWater = [{ id: 's', kind: 'rect', minX: -20, maxX: 20, minZ: -20, maxZ: 20, decks: [strip] }];
  // Frame: along u = (0.6, 0.8), length 10; side n = (-0.8, 0.6).
  const at = (t, s) => [t * 0.6 + s * -0.8, t * 0.8 + s * 0.6];

  it('a strip deck: signed distance in its own frame', () => {
    const cases = [
      [5, 0, -1], // the middle: 1 m in from either side
      [0.4, 0, -0.4], // near end 1: the end is nearer than the sides
      [9.7, 0.5, -0.3], // near end 2
      [5, 1.5, 0.5], // off a side
      [-2, 0, 2], // past end 1: flat, not a capsule
      [12, 0, 2], // past end 2
      [-3, 5, 5], // off the corner (end 1, side +): hypot(3, 4)
      [13, -5, 5], // off the corner (end 2, side -): hypot(3, 4)
    ];
    for (const [t, s, want] of cases) {
      const [x, z] = at(t, s);
      expect(deckDistance(stripWater, x, z), `t ${t}, s ${s}`).toBeCloseTo(want, 9);
    }
  });

  it("a strip deck: deckDistance's sign agrees with onDeck everywhere, ends and corners included", () => {
    const w = stripWater[0];
    let checked = 0;
    for (let t = -2; t <= 12; t += 0.13) {
      for (let s = -2.5; s <= 2.5; s += 0.11) {
        const [x, z] = at(t, s);
        const d = deckDistance(stripWater, x, z);
        if (Math.abs(d) < 1e-6) continue;
        expect(d <= 0, `t ${t.toFixed(2)}, s ${s.toFixed(2)}`).toBe(onDeck(w, x, z));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(4000);
    // exactly on an end or a side counts as on the deck, for both
    for (const [t, s] of [[0, 0], [10, 0], [5, 1], [0, -1], [10, 1]]) {
      const [x, z] = at(t, s);
      expect(onDeck(w, x, z)).toBe(true);
      expect(deckDistance(stripWater, x, z)).toBeCloseTo(0, 9);
    }
  });

  it('a strip deck and a rect deck: the nearer one wins', () => {
    const waters = [{ ...stripWater[0], decks: [strip, { minX: 10, maxX: 12, minZ: -1, maxZ: 1 }] }];
    expect(deckDistance(waters, 9, 0)).toBeCloseTo(1, 9); // the rect's west edge
    const [x, z] = at(5, 0);
    expect(deckDistance(waters, x, z)).toBeCloseTo(-1, 9);
  });
});

// Every shipped area with water, built once.
const WATERED = ['park', 'seaside', 'docks', 'woods', 'river', 'moor', 'pines'];
const builtAreas = async () => {
  const out = {};
  for (const n of WATERED) out[n] = (await import(`../src/world/${n}.js`)).build(new THREE.Scene());
  return out;
};

describe('shallow widths', () => {
  it('every shipped water declares a shallow width', async () => {
    for (const [name, area] of Object.entries(await builtAreas())) {
      expect(area.waters.length, name).toBeGreaterThan(0);
      for (const w of area.waters) {
        expect(w.shallow, `${name}/${w.id}`).toBeGreaterThanOrEqual(0.8);
        expect(w.shallow, `${name}/${w.id}`).toBeLessThanOrEqual(1.6);
      }
    }
  });
});

describe('shape guard', () => {
  it('every shipped water uses only shapes the shore and deck code understand', async () => {
    // What the shore (outline) and the deck code (onDeck, deckDistance,
    // clampInto) understand today: rects and circles; round islands on a rect;
    // rect decks and strip decks. Anything else must be taught to outline()
    // and deckDistance first (see the comment above outline()).
    const fix = 'teach outline(w) its shore and deckDistance its deck (see the comment above outline()) before shipping it';
    const fin = (v) => Number.isFinite(v);
    const check = (waters) => {
      for (const w of waters) {
        expect(['rect', 'circle'], `${w.id}: kind ${w.kind}. ${fix}`).toContain(w.kind);
        expect(w.holes, `${w.id}: holes. ${fix}`).toBeUndefined();
        if (w.kind === 'circle') expect(w.islands, `${w.id}: islands on a circle. ${fix}`).toBeUndefined();
        for (const i of w.islands ?? []) {
          expect(Object.keys(i).sort(), `${w.id}: island shape. ${fix}`).toEqual(['r', 'x', 'z']);
          expect([i.x, i.z, i.r].every(fin) && i.r > 0, `${w.id}: island fields. ${fix}`).toBe(true);
        }
        for (const d of w.decks ?? []) {
          const keys = Object.keys(d).sort().join();
          const rect = keys === 'maxX,maxZ,minX,minZ' && [d.minX, d.maxX, d.minZ, d.maxZ].every(fin);
          const strip = keys === 'halfW,x1,x2,z1,z2' && [d.x1, d.z1, d.x2, d.z2, d.halfW].every(fin)
            && d.halfW > 0 && Math.hypot(d.x2 - d.x1, d.z2 - d.z1) > 0;
          expect(rect || strip, `${w.id}: deck {${keys}}: neither a rect deck nor a strip deck. ${fix}`).toBe(true);
        }
      }
    };
    const areas = await builtAreas();
    for (const [name, area] of Object.entries(areas)) {
      expect(area.waters.length, name).toBeGreaterThan(0);
      check(area.waters);
    }
    // the Pines really does carry both newer shapes, so the guard is reading them
    const pines = areas.pines.waters;
    expect(pines.some((w) => (w.islands ?? []).length > 0)).toBe(true);
    expect(pines.some((w) => (w.decks ?? []).some((d) => Number.isFinite(d.x1)))).toBe(true);
    // scratch proof it bites (kept: the guard must reject these shapes)
    expect(() => check([{ id: 'x', kind: 'circle', islands: [{ x: 0, z: 0, r: 1 }] }])).toThrow(/islands on a circle/);
    expect(() => check([{ id: 'x', kind: 'rect', islands: [{ x: 0, z: 0, r: 1, rise: 2 }] }])).toThrow(/island shape/);
    expect(() => check([{ id: 'x', kind: 'rect', holes: [{}] }])).toThrow(/holes/);
    expect(() => check([{ id: 'x', kind: 'polygon' }])).toThrow(/kind polygon/);
    expect(() => check([{ id: 'x', kind: 'rect', decks: [{ x: 0, z: 0, r: 1 }] }])).toThrow(/neither a rect deck nor a strip deck/);
    expect(() => check([{ id: 'x', kind: 'rect', decks: [{ x1: 0, z1: 0, x2: 1, z2: 1, halfW: 1, minX: 0 }] }]))
      .toThrow(/neither a rect deck nor a strip deck/);
  });
});
