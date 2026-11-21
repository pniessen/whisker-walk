import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HOP_MARKS, DRAWN_MARKS, ROOFS_TRAVERSAL } from '../src/world/roofsplan.js';
import {
  createWindowAtlas, windowCell, addWindowQuads, roofsMaterials, PARTS, markMesh,
  WINDOW_CELLS, WINDOW_FRAMES, MARK_GLOW,
} from '../src/world/roofsparts.js';

// windowCell's split of the 2,000-window sample below into warm / TV / dark (Task C)
const WINDOW_SHARE_PIN = [1435, 186, 379];

// ---------------------------------------------------------------------------
// Beauty pass, Task C (critique finding 4): windows with something in them.
// The atlas's pixels, read back: each cell's pane (every pixel that is not its
// frame's exact colour), its light and what stands in it.
// ---------------------------------------------------------------------------
const atlas = createWindowAtlas();
const PX = atlas.size / 4;
const rgbAt = (cell, x, y) => {
  const i = ((Math.floor(cell / 4) * PX + y) * atlas.size + (cell % 4) * PX + x) * 4;
  const d = atlas.texture.image.data;
  return [d[i], d[i + 1], d[i + 2]];
};
const lumOf = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const isFrame = (cell, rgb) => {
  const f = hexRGB(WINDOW_FRAMES[WINDOW_CELLS[cell].frame]);
  return rgb[0] === f[0] && rgb[1] === f[1] && rgb[2] === f[2];
};
// the pane's pixels of a cell, [x, y, rgb] (y up: row 0 is the sill)
const paneOf = (cell) => {
  const out = [];
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) { const c = rgbAt(cell, x, y); if (!isFrame(cell, c)) out.push([x, y, c]); }
  return out;
};
const meanOf = (px) => [0, 1, 2].map((k) => px.reduce((s, p) => s + p[2][k], 0) / px.length);
const cellsOf = (pred) => WINDOW_CELLS.map((c, i) => [c, i]).filter(([c]) => pred(c)).map(([, i]) => i);
// a sample of windows, the same every run
const SAMPLE = Array.from({ length: 2000 }, (_, i) => windowCell(i * 3.7 - 40, (i % 17) * 2.3 + i * 0.11, i));

describe('roofsparts', () => {
  it('the atlas is the same twice, 128 px of 32 px cells, magnified smoothly', () => {
    const b = createWindowAtlas();
    expect(atlas.size).toBe(128);
    expect(atlas.cells).toBe(16);
    expect(WINDOW_CELLS).toHaveLength(16);
    expect(atlas.texture.isDataTexture).toBe(true);
    expect(Array.from(atlas.texture.image.data)).toEqual(Array.from(b.texture.image.data));
    // close up a window is a soft picture, not nested squares
    expect(atlas.texture.magFilter).toBe(THREE.LinearFilter);
    expect(windowCell(3, 4, 5)).toBe(windowCell(3, 4, 5));
  });

  it('seven windows in ten are lit warm, one in ten is a TV, two in ten are dark', () => {
    for (const c of SAMPLE) { expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThanOrEqual(15); }
    const share = (light) => SAMPLE.filter((c) => WINDOW_CELLS[c].light === light).length;
    // pinned on the sample (2,000 windows), and near the aim
    expect([share('warm'), share('tv'), share('dark')]).toEqual(WINDOW_SHARE_PIN);
    expect(share('warm') / 2000).toBeGreaterThan(0.64);
    expect(share('warm') / 2000).toBeLessThan(0.76);
    expect(share('tv') / 2000).toBeGreaterThan(0.07);
    expect(share('tv') / 2000).toBeLessThan(0.13);
    expect(share('dark') / 2000).toBeGreaterThan(0.15);
    expect(share('dark') / 2000).toBeLessThan(0.25);
    // a cat in a window is a find, not the rule: one lit window in ten or so
    const warm = SAMPLE.filter((c) => WINDOW_CELLS[c].light === 'warm');
    const cats = warm.filter((c) => WINDOW_CELLS[c].kind === 'cat').length / warm.length;
    expect(cats).toBeGreaterThan(0.05);
    expect(cats).toBeLessThan(0.15);
    // every kind turns up
    for (const kind of ['plain', 'curtains', 'blind', 'cat', 'plant', 'tv', 'closed']) expect(SAMPLE.some((c) => WINDOW_CELLS[c].kind === kind), kind).toBe(true);
  });

  it('a lit window is warm with a soft glow; the TV is a dim blue-violet, never daylight', () => {
    const warm = cellsOf((c) => c.light === 'warm');
    const tv = cellsOf((c) => c.light === 'tv');
    expect(warm.length).toBeGreaterThanOrEqual(10);
    expect(tv).toHaveLength(1);
    let dimmestWarm = Infinity;
    for (const c of warm) {
      const m = meanOf(paneOf(c));
      expect([c, m[2] <= m[0]]).toEqual([c, true]); // never bluer than red
      dimmestWarm = Math.min(dimmestWarm, lumOf(m));
    }
    const t = meanOf(paneOf(tv[0]));
    expect(t[2]).toBeGreaterThan(t[0]);
    expect(Math.max(...t)).toBeLessThanOrEqual(0.72 * 255);
    expect(lumOf(t)).toBeLessThan(0.75 * dimmestWarm);
    // the plain lit panes glow smoothly: no step of more than 9 levels between neighbours
    for (const c of cellsOf((q) => q.light === 'warm' && q.kind === 'plain')) {
      let worst = 0;
      for (let y = 0; y < PX; y++) {
        for (let x = 0; x < PX; x++) {
          const p = rgbAt(c, x, y);
          if (isFrame(c, p)) continue;
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (x + dx >= PX || y + dy >= PX) continue;
            const q = rgbAt(c, x + dx, y + dy);
            if (isFrame(c, q)) continue;
            worst = Math.max(worst, ...[0, 1, 2].map((k) => Math.abs(p[k] - q[k])));
          }
        }
      }
      expect(worst, `cell ${c}`).toBeLessThanOrEqual(9);
      // ...brighter in the middle than at the frame
      const pane = paneOf(c);
      const mid = pane.filter(([x, y]) => Math.abs(x - PX / 2 + 0.5) > 2 && Math.abs(x - PX / 2 + 0.5) < 6 && Math.abs(y - PX / 2 + 0.5) > 2 && Math.abs(y - PX / 2 + 0.5) < 6);
      const rim = pane.filter(([x, y]) => Math.min(x, y, PX - 1 - x, PX - 1 - y) <= 4);
      expect(lumOf(meanOf(mid))).toBeGreaterThan(lumOf(meanOf(rim)) * 1.08);
    }
  });

  it('frames come white or dark green-black', () => {
    expect(lumOf(hexRGB(WINDOW_FRAMES.white))).toBeGreaterThan(0.45);
    expect(lumOf(hexRGB(WINDOW_FRAMES.dark))).toBeLessThan(0.15);
    const warm = cellsOf((c) => c.light === 'warm');
    for (const f of ['white', 'dark']) expect(warm.some((c) => WINDOW_CELLS[c].frame === f), f).toBe(true);
    // the frame is drawn: the cell's border is its frame colour all round
    for (let c = 0; c < 16; c++) {
      for (let i = 0; i < PX; i++) for (const [x, y] of [[i, 0], [i, PX - 1], [0, i], [PX - 1, i]]) expect(isFrame(c, rgbAt(c, x, y)), `cell ${c} ${x},${y}`).toBe(true);
    }
  });

  it('cats and a plant stand on the sill as dark shapes; curtains hang at both sides; a blind is half down', () => {
    // the dark shape's pixels: much darker than the pane round it
    const shapeOf = (c) => {
      const pane = paneOf(c);
      const bright = lumOf(meanOf(pane.filter(([, , p]) => lumOf(p) > 0.3)));
      return { pane, dark: pane.filter(([, , p]) => lumOf(p) < 0.3 * bright) };
    };
    const cats = cellsOf((c) => c.kind === 'cat' && c.light === 'warm');
    expect(cats).toHaveLength(2);
    for (const c of [...cats, ...cellsOf((q) => q.kind === 'plant')]) {
      const { pane, dark } = shapeOf(c);
      const sill = Math.min(...pane.map(([, y]) => y));
      expect(dark.length / pane.length, `cell ${c}`).toBeGreaterThan(0.04);
      expect(dark.length / pane.length, `cell ${c}`).toBeLessThan(0.3);
      expect(dark.some(([, y]) => y === sill), `cell ${c} on the sill`).toBe(true);
      const top = Math.max(...dark.map(([, y]) => y));
      expect(top - sill, `cell ${c} height`).toBeGreaterThanOrEqual(7);
      // one shape, standing on the sill: every dark row from the sill up to its top
      const rows = new Set(dark.map(([, y]) => y));
      for (let y = sill; y <= top; y++) expect(rows.has(y), `cell ${c} row ${y}`).toBe(true);
    }
    // a cat has two ears: near the top of its shape a row with two separate dark runs
    for (const c of cats) {
      const { dark } = shapeOf(c);
      const top = Math.max(...dark.map(([, y]) => y));
      const twoRuns = (y) => {
        const xs = dark.filter(([, yy]) => yy === y).map(([x]) => x).sort((p, q) => p - q);
        return xs.some((x, i) => i > 0 && x - xs[i - 1] > 1);
      };
      expect([top, top - 1, top - 2, top - 3].some(twoRuns), `cell ${c} ears`).toBe(true);
    }
    // curtains: the pane's two sides are cloth, its middle the warm light
    for (const c of cellsOf((q) => q.kind === 'curtains')) {
      const cloth = hexRGB(WINDOW_CELLS[c].cloth);
      const near = (p) => Math.max(...[0, 1, 2].map((k) => Math.abs(p[k] - cloth[k]))) < 70;
      const y = Math.round(PX * 0.75);
      const row = paneOf(c).filter(([, yy]) => yy === y);
      const xs = row.map(([x]) => x);
      const left = row.find(([x]) => x === Math.min(...xs));
      const right = row.find(([x]) => x === Math.max(...xs));
      expect([c, near(left[2]), near(right[2])]).toEqual([c, true, true]);
      const middle = row.filter(([x]) => Math.abs(x - PX / 2) <= 4 && x !== PX / 2 - 1 && x !== PX / 2);
      expect(middle.some(([, , p]) => near(p)), `cell ${c} middle`).toBe(false);
    }
    // a half blind: the upper part of the pane is the blind's cloth, the lower part the light
    for (const c of cellsOf((q) => q.kind === 'blind')) {
      const pane = paneOf(c);
      const upper = meanOf(pane.filter(([, y]) => y > PX * 0.75));
      const lower = meanOf(pane.filter(([, y]) => y < PX * 0.35));
      expect(Math.max(...[0, 1, 2].map((k) => Math.abs(upper[k] - lower[k]))), `cell ${c}`).toBeGreaterThan(20);
    }
  });

  // Beauty pass round two, Task E (critique finding 1): the pot plant was a fan
  // of long thin leaves, a black hand at the glass. Now a round bushy crown.
  it('the pot plant is a round bushy crown, not a fan of fingers', () => {
    const [cell] = cellsOf((c) => c.kind === 'plant');
    const pane = paneOf(cell);
    const bright = lumOf(meanOf(pane.filter(([, , p]) => lumOf(p) > 0.3)));
    // its shape: the dark leaves and pot and the red flower heads on them, all well under the light
    const dark = pane.filter(([, , p]) => lumOf(p) < 0.45 * bright).map(([x, y]) => [x, y]);
    // its silhouette is a blob: its area at least 0.7 of its convex hull's
    const pts = dark.flatMap(([x, y]) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]);
    pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (list) => { const h = []; for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
    const hull = [...half(pts), ...half([...pts].reverse())];
    let area = 0;
    for (let i = 0; i < hull.length; i++) { const [a, b] = [hull[i], hull[(i + 1) % hull.length]]; area += a[0] * b[1] - b[0] * a[1]; }
    area = Math.abs(area) / 2;
    expect(dark.length / area).toBeGreaterThanOrEqual(0.7);
    // and no row of it has more than two separate dark runs (the fingers gave four to six)
    const rows = new Map();
    for (const [x, y] of dark) rows.set(y, [...(rows.get(y) ?? []), x]);
    for (const [y, xs] of rows) {
      xs.sort((p, q) => p - q);
      const runs = 1 + xs.filter((x, i) => i > 0 && x - xs[i - 1] > 1).length;
      expect(runs, `row ${y}`).toBeLessThanOrEqual(2);
    }
  });

  // Beauty pass round two, Task E (critique finding 3): the take-off glow's ring
  // made every spot a puddle or a target. No ring now: a small bright core
  // fading to nothing, in a deeper amber that stays orange on dark felt.
  it('the take-off glow has no ring: its alpha falls from the middle all the way to its rim', () => {
    const disc = markMesh('lip', { x0: 0, z0: 0, x1: 1, z1: 0, prop: 'tank' }).children.find((m) => m.userData.markGlow);
    const { data, width, height } = disc.material.map.image;
    const texels = [];
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) texels.push([Math.hypot((i + 0.5) / width - 0.5, (j + 0.5) / height - 0.5), data[(j * width + i) * 4 + 3]]);
    }
    texels.sort((p, q) => p[0] - q[0]);
    // monotone along every radius: farther out is never brighter
    for (let k = 1; k < texels.length; k++) expect(texels[k][1], `at ${texels[k][0].toFixed(3)}`).toBeLessThanOrEqual(texels[k - 1][1]);
    expect(texels[0][1]).toBeGreaterThanOrEqual(240);
    // nothing to see at the disc's rim (the uv's 0.45..0.5 from the middle)
    for (const [d, a] of texels) if (d >= 0.45) expect(a, `at ${d.toFixed(3)}`).toBeLessThan(0.03 * 255);
    // a tight core: at half the radius it is under a third of its middle
    const at = (r) => texels.find(([d]) => d >= r)[1];
    expect(at(0.25)).toBeLessThan(at(0) / 3);
    // a deep amber: red over green over blue, the blue well under the green
    const [r, g, b] = [MARK_GLOW.color >> 16, (MARK_GLOW.color >> 8) & 255, MARK_GLOW.color & 255];
    expect(r > g && g > b).toBe(true);
    expect(g).toBeLessThanOrEqual(0.62 * r);
    expect(b).toBeLessThan(0.45 * g);
  });

  it('every window quad uses the one windows material and stays inside its cell', () => {
    const mats = roofsMaterials();
    expect(mats.windows.emissiveMap).toBeTruthy();
    expect(mats.windows.emissiveMap.isDataTexture).toBe(true);
    const list = [
      { x: 2, y: 3, z: 5, nx: 0, nz: 1, w: 1, h: 1.4, cell: 0 },
      { x: 4, y: 3, z: 5, nx: 1, nz: 0, w: 1, h: 1.4, cell: 9 },
      { x: 6, y: 3, z: 5, nx: -1, nz: 0, w: 1, h: 1.4, cell: 15 },
    ];
    const g = addWindowQuads(list, null).geometry;
    expect(g.index).toBeTruthy();
    for (const k of ['position', 'normal', 'uv', 'color']) expect(g.attributes[k]).toBeTruthy();
    list.forEach((q, i) => {
      const col = q.cell % 4;
      const row = Math.floor(q.cell / 4);
      for (let v = 0; v < 4; v++) {
        const u = g.attributes.uv.getX(i * 4 + v);
        const w = g.attributes.uv.getY(i * 4 + v);
        expect(u).toBeGreaterThanOrEqual(col / 4);
        expect(u).toBeLessThanOrEqual((col + 1) / 4);
        expect(w).toBeGreaterThanOrEqual(row / 4);
        expect(w).toBeLessThanOrEqual((row + 1) / 4);
        const px = g.attributes.position.getX(i * 4 + v) - q.x;
        const pz = g.attributes.position.getZ(i * 4 + v) - q.z;
        expect(Math.abs(px * q.nx + pz * q.nz)).toBeCloseTo(0.02, 6);
      }
    });
    const mesh = new THREE.Mesh(g, mats.windows);
    expect(mesh.material).toBe(mats.windows);
  });

  it('a drawn mark kind has small flush pieces and a glow; a hop with a real prop has its glow only', () => {
    expect(PARTS.box && PARTS.pot && PARTS.ridge && PARTS.gutter && PARTS.coping && PARTS.plank && PARTS.line).toBeTruthy();
    const hop = { kind: 'leap', mark: 'lip', from: { x: 1, z: 2, y: 3 }, to: { x: 3, z: 2, y: 3 } };
    const glows = new Set();
    const look = (o) => {
      const out = { pieces: [], glow: [] };
      o.updateMatrixWorld(true);
      o.traverse((m) => {
        if (!m.isMesh) return;
        if (m.userData.markGlow) {
          out.glow.push(m);
          glows.add(m.material);
          expect(m.castShadow).toBe(false);
          expect(m.userData.noCast).toBe(true);
        } else out.pieces.push(m);
      });
      return out;
    };
    for (const kind of Object.keys(HOP_MARKS)) {
      for (const mark of HOP_MARKS[kind]) {
        // with a real prop: the glow alone, whatever the kind
        const p = look(markMesh(mark, { ...hop, kind, mark, prop: 'bin-1' }));
        expect([mark, p.pieces.length, p.glow.length]).toEqual([mark, 0, 1]);
        if (!DRAWN_MARKS.includes(mark)) {
          // no object of its own: a hop of this kind must name its real thing
          expect(() => markMesh(mark, { ...hop, kind, mark })).toThrow(/prop/);
          continue;
        }
        const o = look(markMesh(mark, { ...hop, kind, mark, edge: 0.4 }));
        expect(o.glow).toHaveLength(1);
        expect(o.pieces.length).toBeGreaterThan(0);
        // small and flush: within 0.15 m of the take-off's height, short of the edge 0.4 m ahead
        const box = new THREE.Box3();
        for (const m of o.pieces) box.expandByObject(m);
        expect([mark, box.min.y >= 3 - 1e-6, box.max.y <= 3.15]).toEqual([mark, true, true]);
        expect([mark, box.max.x <= 1 + 0.4 + 1e-6, box.max.x >= 1 + 0.25]).toEqual([mark, true, true]);
        expect([mark, box.max.z - box.min.z <= 1.0]).toEqual([mark, true]);
      }
    }
    expect(glows.size).toBe(1);
    // every real hop in the plan gets its mark: pieces where it has no prop
    const t = ROOFS_TRAVERSAL;
    for (const h of [...t.gaps, ...t.drops, ...t.climbs]) expect(markMesh(h.mark, h).isObject3D).toBe(true);
  });
});
