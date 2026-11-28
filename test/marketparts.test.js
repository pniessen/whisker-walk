import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { withLocalUuids } from '../src/world/localuuids.js';
import {
  createMarketAtlas, atlasCell, marketMaterials, createMarketParts, buildTreatMesh, createBubbleTexture, buildBroom, TREAT_KINDS,
  createCobbleTexture, painted, bloomGeometry, BLOOMS,
} from '../src/world/marketparts.js';
import OLD_CELLS from './fixtures/market-atlas-cells.json';

const px = (tex, x, y) => { const i = (y * tex.image.width + x) * 4; return Array.from(tex.image.data.slice(i, i + 4)); };

// a stubbed document whose createElement must never be called (node has none otherwise)
function withDocumentSpy(fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const old = globalThis.document;
  const createElement = vi.fn();
  globalThis.document = { createElement };
  try { fn(); } finally { if (had) globalThis.document = old; else delete globalThis.document; }
  return createElement;
}

describe('marketparts', () => {
  const PARTS = createMarketParts();
  // a cell's 32 x 32 pixels, read where atlasCell says it is
  const cellPixels = (atlas, c) => {
    const { width: W, height: H, data } = atlas.texture.image;
    const { u0, v0 } = atlasCell(c);
    const ox = Math.round(u0 * W);
    const oy = Math.round(v0 * H);
    const out = [];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = ((oy + y) * W + ox + x) * 4;
      out.push([data[i], data[i + 1], data[i + 2], data[i + 3]]);
    }
    return out;
  };
  const lumOf = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  it('the atlas is the same twice and paints no canvas', () => {
    let a; let b;
    const spy = withDocumentSpy(() => { a = createMarketAtlas(); b = createMarketAtlas(); marketMaterials(); });
    expect(spy).not.toHaveBeenCalled();
    // Step 3 (V11): 8 x 4 cells of 32 px; the beauty pass (2026-11-22) grew it to 8 x 8 (cells 32-43 are the new stalls')
    expect([a.w, a.h, a.cells]).toEqual([256, 256, 64]);
    expect([a.texture.image.width, a.texture.image.height]).toEqual([256, 256]);
    expect(a.texture.isDataTexture).toBe(true);
    expect(a.texture.magFilter).toBe(THREE.LinearFilter);
    expect(Array.from(a.texture.image.data)).toEqual(Array.from(b.texture.image.data));
    // every pixel is opaque, and every cell in use is painted (not one flat colour)
    const d = a.texture.image.data;
    for (let i = 3; i < d.length; i += 4) expect(d[i]).toBe(255);
    for (let c = 0; c < 18; c++) {
      const seen = new Set(cellPixels(a, c).map((p) => p.slice(0, 3).join(',')));
      expect(seen.size, `cell ${c}`).toBeGreaterThan(2);
    }
  });

  it('every old cell keeps its picture', () => {
    // the sums of cells 0-15's pixels, recorded from the 128 px atlas before it grew
    const a = createMarketAtlas();
    expect(OLD_CELLS.cells).toHaveLength(16);
    for (let c = 0; c < 16; c++) {
      const sum = [0, 0, 0];
      for (const p of cellPixels(a, c)) for (let k = 0; k < 3; k++) sum[k] += p[k];
      expect(sum, `cell ${c}`).toEqual(OLD_CELLS.cells[c]);
    }
  });

  it('the two new cells: a chalkboard of pictures on slate, and a painted window board', () => {
    const a = createMarketAtlas();
    // 16, the chalkboard: mostly dark slate, with chalk pictures in several colours on it
    const board = cellPixels(a, 16);
    const dark = board.filter((p) => lumOf(p) < 0.3).length;
    const chalk = board.filter((p) => lumOf(p) > 0.55);
    expect(dark / board.length).toBeGreaterThan(0.45);
    expect(chalk.length / board.length).toBeGreaterThan(0.12);
    // white chalk (the cup), pink (the cake's icing) and yellow (the croissant)
    const hsl = (p) => new THREE.Color(p[0] / 255, p[1] / 255, p[2] / 255).getHSL({});
    expect(chalk.some((p) => hsl(p).s < 0.2)).toBe(true);
    expect(chalk.some((p) => { const h = hsl(p); return h.s > 0.35 && (h.h > 0.85 || h.h < 0.03); })).toBe(true);
    expect(chalk.some((p) => { const h = hsl(p); return h.s > 0.35 && h.h > 0.08 && h.h < 0.18; })).toBe(true);
    // the three pictures stand apart: the top half holds the cup, the bottom half two more
    const lit = (y0, y1, x0, x1) => board.filter((p, i) => {
      const x = i % 32;
      const y = Math.floor(i / 32);
      return y >= y0 && y < y1 && x >= x0 && x < x1 && lumOf(p) > 0.55;
    }).length;
    expect(lit(17, 30, 8, 24)).toBeGreaterThan(20);
    expect(lit(3, 15, 3, 15)).toBeGreaterThan(20);
    expect(lit(3, 15, 17, 29)).toBeGreaterThan(20);
    // 17, the window board: a painted panel in light and dark paint, more than three colours
    const wb = cellPixels(a, 17);
    expect(new Set(wb.map((p) => p.slice(0, 3).join(','))).size).toBeGreaterThan(3);
    expect(wb.some((p) => lumOf(p) > 0.6)).toBe(true);
    expect(wb.some((p) => lumOf(p) < 0.3)).toBe(true);
  });

  it('atlasCell gives each cell its own eighth-column, eighth-row box', () => {
    expect(atlasCell(0)).toEqual({ u0: 0, v0: 0, u1: 0.125, v1: 0.125 });
    expect(atlasCell(5)).toEqual({ u0: 0.625, v0: 0, u1: 0.75, v1: 0.125 });
    expect(atlasCell(15)).toEqual({ u0: 0.875, v0: 0.125, u1: 1, v1: 0.25 });
    expect(atlasCell(16)).toEqual({ u0: 0, v0: 0.25, u1: 0.125, v1: 0.375 });
    expect(atlasCell(31)).toEqual({ u0: 0.875, v0: 0.375, u1: 1, v1: 0.5 });
    expect(atlasCell(63)).toEqual({ u0: 0.875, v0: 0.875, u1: 1, v1: 1 });
  });

  it('the cobble texture: rows offset, stones varied, the same twice, no canvas', () => {
    let a; let b;
    const spy = withDocumentSpy(() => { a = createCobbleTexture(); b = createCobbleTexture(); });
    expect(spy).not.toHaveBeenCalled();
    expect(a.isDataTexture).toBe(true);
    expect(a).not.toBe(b);
    expect([a.image.width, a.image.height]).toEqual([128, 128]);
    expect([a.wrapS, a.wrapT]).toEqual([THREE.RepeatWrapping, THREE.RepeatWrapping]);
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data));
    const L = (x, y) => lumOf(px(a, ((x % 128) + 128) % 128, ((y % 128) + 128) % 128));
    // four rows of setts, 32 px each: along each row's middle line, dark joints between light stones
    const rows = [];
    for (let r = 0; r < 4; r++) {
      const y = r * 32 + 16;
      const line = Array.from({ length: 128 }, (_, x) => L(x, y));
      const joints = [];
      // a joint starts where two dark pixels follow a light one (a stone's shaded edge is not one)
      const dark = (x) => line[(x + 128) % 128] < 0.7;
      for (let x = 0; x < 128; x++) if (dark(x) && dark(x + 1) && !dark(x - 1)) joints.push(x);
      expect(joints.length, `row ${r}`).toBeGreaterThanOrEqual(3);
      expect(joints.length, `row ${r}`).toBeLessThanOrEqual(5);
      // the stones between: each one's tone from the middle of its run
      const stones = joints.map((j, k) => {
        const next = k + 1 < joints.length ? joints[k + 1] : joints[0] + 128;
        const mid = Math.round((j + next) / 2);
        let s = 0; let n = 0;
        for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) { s += L(mid + dx, y + dy); n++; }
        return { w: next - j, tone: s / n };
      });
      rows.push({ joints, stones });
    }
    // in no two neighbouring rows (the last and the next tile's first too) do the joints line up
    const gap = (p, q) => { const d = Math.abs(p - q) % 128; return Math.min(d, 128 - d); };
    for (let r = 0; r < 4; r++) {
      const A = rows[r].joints;
      const B = rows[(r + 1) % 4].joints;
      for (const p of A) for (const q of B) expect(gap(p, q), `rows ${r} and ${(r + 1) % 4}: joints at ${p} and ${q}`).toBeGreaterThanOrEqual(5);
    }
    // the stones differ: in width (by more than a few px, within a fifth or so of 32) and in tone
    const stones = rows.flatMap((r) => r.stones);
    const widths = stones.map((s) => s.w);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(4);
    for (const w of widths) { expect(w).toBeGreaterThan(32 * 0.75); expect(w).toBeLessThan(32 * 1.25); }
    const tones = stones.map((s) => s.tone);
    expect(Math.max(...tones) - Math.min(...tones)).toBeGreaterThan(0.04);
    // light stones, darker joints, never near black (the ground's colour multiplies it)
    let lo = 1; let mean = 0;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const v = L(x, y); lo = Math.min(lo, v); mean += v / (128 * 128); }
    expect(lo).toBeGreaterThan(0.3);
    expect(mean).toBeGreaterThan(0.8);
    expect(mean).toBeLessThan(0.97);
  });

  it('the materials are one set: awning and stall carry the atlas, the lantern glows warm by day, full at dusk', () => {
    const m = marketMaterials();
    // only what the square draws with (the ground and the fountain have their own)
    expect(Object.keys(m).sort()).toEqual(['awning', 'cloth', 'front', 'lantern', 'metal', 'stall']);
    for (const k of Object.keys(m)) expect(m[k], k).toBeTruthy();
    expect(m.awning.map).toBeTruthy();
    expect(m.stall.map).toBe(m.awning.map);
    expect(m.lantern.emissiveIntensity).toBe(0.6); // beauty pass 2: a warm daytime glow (market.js LANTERN_DAY), full at dusk
    expect(m.awning.userData.flutter.uMkAmp.value).toBe(0); // the breeze is the life's to start
  });

  it('every awning sheet\'s UVs stay inside its own cell', () => {
    for (let c = 0; c < 6; c++) {
      const g = PARTS.awningSheet(c);
      const uv = g.attributes.uv;
      const { u0, v0, u1, v1 } = atlasCell(c);
      expect(uv.count).toBeGreaterThan(0);
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBeGreaterThanOrEqual(u0);
        expect(uv.getX(i)).toBeLessThanOrEqual(u1);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(v0);
        expect(uv.getY(i)).toBeLessThanOrEqual(v1);
      }
      expect(g.index.count / 3).toBeLessThan(60);
    }
    expect(PARTS.awningSheet(2)).toBe(PARTS.awningSheet(2));
  });

  it('the shared parts are few and small', () => {
    for (const k of ['box', 'post', 'counter', 'crate', 'basket', 'trestle', 'cafeTable', 'cafeChair', 'bulb', 'pennant', 'dome', 'stem']) {
      const g = PARTS[k];
      expect(g, k).toBeTruthy();
      expect(g.attributes.position.count, k).toBeGreaterThan(0);
      expect(g).toBe(PARTS[k]);
    }
    expect(PARTS.crate.index.count / 3).toBe(12);
    // the flower tubs' (step 3): a clump of leaves, and a thin three-sided stem
    const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
    expect(tris(PARTS.dome)).toBeLessThanOrEqual(40);
    expect(tris(PARTS.stem)).toBe(6);
  });

  it('there is a treat mesh for every treat kind, small and casting nothing', () => {
    expect(TREAT_KINDS).toEqual(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs', 'wool', 'sausages', 'catnip', 'sardines']);
    for (const kind of TREAT_KINDS) {
      const g = buildTreatMesh(kind);
      expect(g.isGroup, kind).toBe(true);
      const box = new THREE.Box3().setFromObject(g);
      const s = box.getSize(new THREE.Vector3());
      expect(Math.max(s.x, s.y, s.z), kind).toBeLessThan(kind === 'sausages' ? 0.55 : 0.25); // (a string of three links)
      expect(Math.max(s.x, s.y, s.z), kind).toBeGreaterThan(0.04);
      const c = box.getCenter(new THREE.Vector3());
      expect(Math.hypot(c.x, c.y, c.z), kind).toBeLessThan(0.05);
      expect(g.userData.noCast).toBe(true);
      let meshes = 0;
      g.traverse((o) => { if (o.isMesh) { meshes++; expect(o.userData.noCast).toBe(true); expect(o.castShadow).toBe(false); } });
      expect(meshes).toBeGreaterThan(0);
    }
    expect(() => buildTreatMesh('nope')).toThrow();
  });

  it('the bubble and the broom are made without a canvas or a random number', () => {
    let t; let t2; let broom;
    const doc = withDocumentSpy(() => { t = createBubbleTexture(); t2 = createBubbleTexture(); broom = buildBroom(); });
    expect(doc).not.toHaveBeenCalled();
    expect(t.isDataTexture).toBe(true);
    expect(t.image.width).toBe(32);
    expect(t.image.height).toBe(32);
    expect(Array.from(t.image.data)).toEqual(Array.from(t2.image.data));
    // white inside, dark outline, three dark dots in a row, clear corners
    expect(px(t, 0, 0)[3]).toBe(0);
    expect(px(t, 31, 31)[3]).toBe(0);
    let dark = 0; let white = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const p = px(t, x, y);
      if (p[3] > 200 && p[0] < 90) dark++;
      if (p[3] > 200 && p[0] > 240) white++;
    }
    expect(white).toBeGreaterThan(300);
    expect(dark).toBeGreaterThan(120);
    // three separate dark runs along the middle row of dots
    let runs = 0; let inRun = false;
    for (let x = 6; x < 26; x++) {
      const p = px(t, x, 14);
      const d = p[3] > 200 && p[0] < 90;
      if (d && !inRun) runs++;
      inRun = d;
    }
    expect(runs).toBe(3);
    // the broom: a 1.1 m handle and bristles, origin at the grip, casting nothing
    expect(broom.userData.noCast).toBe(true);
    const box = new THREE.Box3().setFromObject(broom);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.1);
    expect(size.y).toBeLessThan(1.6);
    expect(box.max.y).toBeGreaterThanOrEqual(-0.001);
    expect(box.max.y).toBeLessThan(0.12);
    broom.traverse((o) => { if (o.isMesh) expect(o.castShadow).toBe(false); });
  });

  it('every factory draws its uuids from the local stream and leaves the real Math.random alone', () => {
    const real = Math.random;
    const spy = vi.spyOn(Math, 'random');
    const calls = () => spy.mock.calls.length;
    // inside withLocalUuids Math.random is swapped, so the spy on the real one sees nothing
    const first = withLocalUuids('x', () => {
      const parts = createMarketParts();
      parts.awningSheet(0);
      createMarketAtlas(); marketMaterials(); createBubbleTexture(); buildBroom();
      for (const k of TREAT_KINDS) buildTreatMesh(k);
      return parts.box.uuid + parts.awningSheet(0).uuid;
    });
    expect(calls()).toBe(0);
    expect(Math.random).toBe(spy); // restored to the spy we installed
    // the same local stream gives the same uuids on every build
    const second = withLocalUuids('x', () => { const parts = createMarketParts(); parts.awningSheet(0); return parts.box.uuid + parts.awningSheet(0).uuid; });
    expect(second).toBe(first);
    spy.mockRestore();
    expect(Math.random).toBe(real);
  });

  it('each build gets its own geometries, and dispose frees them', () => {
    const a = createMarketParts();
    const b = createMarketParts();
    expect(a.box).not.toBe(b.box);
    expect(a.awningSheet(1)).not.toBe(b.awningSheet(1));
    const onDispose = vi.fn();
    a.crate.addEventListener('dispose', onDispose);
    a.awningSheet(1).addEventListener('dispose', onDispose);
    a.dispose();
    expect(onDispose).toHaveBeenCalledTimes(2);
  });
});

describe("marketparts' shared drawing helpers (the final review's dedupe)", () => {
  it('painted(geo, hex): one colour on every vertex, unindexed, the indexed original freed', () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const freed = vi.fn();
    box.addEventListener('dispose', freed);
    const g = painted(box, 0x336699);
    expect(g).not.toBe(box);
    expect(g.index).toBeNull();
    expect(freed).toHaveBeenCalledTimes(1);
    const c = new THREE.Color(0x336699);
    const col = g.attributes.color;
    expect(col.count).toBe(g.attributes.position.count);
    for (let i = 0; i < col.count; i++) {
      expect(col.getX(i)).toBeCloseTo(c.r, 6);
      expect(col.getY(i)).toBeCloseTo(c.g, 6);
      expect(col.getZ(i)).toBeCloseTo(c.b, 6);
    }
    // an unindexed geometry is painted in place
    const flat = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    expect(painted(flat, 0xffffff)).toBe(flat);
  });

  it("bloomGeometry: one flower facing up, 20 triangles, in its own colours", () => {
    expect(BLOOMS.length).toBeGreaterThanOrEqual(5);
    const [petal, middle] = BLOOMS[0];
    const g = bloomGeometry(petal, middle);
    expect(g.attributes.position.count / 3).toBe(20);
    g.computeBoundingBox();
    expect(g.boundingBox.max.x).toBeCloseTo(0.5, 6);
    expect(g.attributes.color).toBeTruthy();
    expect(g.attributes.normal).toBeTruthy();
  });
});
