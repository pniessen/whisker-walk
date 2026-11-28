import { describe, it, expect } from 'vitest';
import { splitPlan, splitWanted, createSplit } from '../src/coop/splitview.js';
import { coop } from '../src/coopseam.js';
import * as THREE from 'three';

describe('split view maths (S0)', () => {
  it('flag parses only ?split=1', () => {
    expect(splitWanted('?split=1')).toBe(true);
    expect(splitWanted('?coop=1&split=1')).toBe(true);
    expect(splitWanted('?split=10')).toBe(false);
    expect(splitWanted('')).toBe(false);
  });
  it('1920x1080: two exact halves, aspect 8:9', () => {
    const p = splitPlan(1920, 1080, 1);
    expect(p.dev).toEqual([{ x: 0, y: 0, w: 960, h: 1080 }, { x: 960, y: 0, w: 960, h: 1080 }]);
    expect(p.aspects[0]).toBeCloseTo(960 / 1080, 12);
    expect(p.css).toEqual(p.dev);
  });
  it('odd widths tile the buffer with no gap and no overlap', () => {
    for (const w of [1281, 1919, 3, 777]) for (const dpr of [1, 1.5, 2, 3, 1.25]) {
      const p = splitPlan(w, 721, dpr);
      const bw = Math.round(w * dpr);
      expect(p.dev[0].x).toBe(0);
      expect(p.dev[0].x + p.dev[0].w).toBe(p.dev[1].x);
      expect(p.dev[1].x + p.dev[1].w).toBe(bw);
      expect(p.dev[1].w - p.dev[0].w).toBeLessThanOrEqual(1);
      // three multiplies the css rectangle by the pixel ratio and rounds: the same device pixels
      p.css.forEach((r, i) => {
        expect(Math.round(r.x * dpr)).toBe(p.dev[i].x);
        expect(Math.round(r.w * dpr)).toBe(p.dev[i].w);
      });
    }
  });
  it('retina: css rectangles are logical px, device rectangles double', () => {
    const p = splitPlan(1280, 720, 2);
    expect(p.css[1]).toEqual({ x: 640, y: 0, w: 640, h: 720 });
    expect(p.dev[1]).toEqual({ x: 1280, y: 0, w: 1280, h: 1440 });
  });
});

function fakeRenderer(w = 1280, h = 720, pr = 2) {
  const calls = [];
  const info = { autoReset: true, render: { calls: 0, triangles: 0 }, reset() { calls.push('reset'); } };
  return {
    calls, info,
    getSize(v) { return v.set(w, h); }, getPixelRatio: () => pr,
    setScissorTest: (b) => calls.push(['test', b]),
    setViewport: (...a) => calls.push(['vp', ...a]), setScissor: (...a) => calls.push(['sc', ...a]),
    render: (s, c) => { calls.push(['render', c.name]); info.render.calls += 10; info.render.triangles += 500; },
  };
}
const cam = (name, aspect = 16 / 9) => ({ name, aspect, position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: 70, near: 0.1, far: 300, updateProjectionMatrix() {}, updateMatrixWorld() {} });

describe('createSplit.draw', () => {
  it('is a no-op (false, nothing drawn) while cat two is not out', () => {
    const r = fakeRenderer(); delete coop.second;
    const s = createSplit({ renderer: r, camera: cam('one'), doc: null });
    expect(s.draw({ scene: {} })).toBe(false);
    expect(r.calls).toEqual([]);
  });
  it('draws two scissored views, then restores the full viewport, aspect and autoReset', () => {
    const r = fakeRenderer(); const one = cam('one'); const two = cam('two');
    coop.second = () => two; coop.splitInfo = { gap: 40, maxSep: 40, top: true, sameLevel: true };
    try {
      const s = createSplit({ renderer: r, camera: one, doc: null });
      expect(s.draw({ scene: {}, reducedMotion: true })).toBe(true);
      const names = r.calls.filter((c) => c[0] === 'render').map((c) => c[1]);
      expect(names).toEqual(['one', 'two']);
      expect(r.calls.filter((c) => c[0] === 'vp').slice(0, 2)).toEqual([['vp', 0, 0, 640, 720], ['vp', 640, 0, 640, 720]]);
      expect(r.calls.filter((c) => c[0] === 'sc').slice(0, 2)).toEqual([['sc', 0, 0, 640, 720], ['sc', 640, 0, 640, 720]]);
      expect(r.calls.filter((c) => c[0] === 'test').map((c) => c[1])).toEqual([true, false]);
      expect(r.calls.at(-1)).toEqual(['sc', 0, 0, 1280, 720]);
      expect(one.aspect).toBeCloseTo(16 / 9, 12); // restored
      expect(two.aspect).toBeCloseTo(640 / 720, 12);
      expect(r.info.autoReset).toBe(true);
      expect(s.stats()).toMatchObject({ calls: 20, tris: 1000 });
    } finally { delete coop.second; delete coop.splitInfo; }
  });
  it('shared: stays on the normal path and draws nothing; mid-slide draws two clipped views; the divider is a DOM strip', () => {
    const els = [];
    const doc = { createElement: () => { const e = { style: {}, remove() {} }; els.push(e); return e; }, body: { appendChild() {} } };
    const r = fakeRenderer(1000, 500, 1); const one = cam('one'); const two = cam('two');
    coop.second = () => two; coop.splitInfo = { gap: 5, maxSep: 40, top: true, sameLevel: true };
    let t = 0; const s = createSplit({ renderer: r, camera: one, doc, now: () => t });
    try {
      expect(s.draw({ scene: {} })).toBe(false);
      expect(r.calls).toEqual([]);
      expect(s.active()).toBe(false);
      coop.splitInfo = { gap: 35, maxSep: 40, top: true, sameLevel: true };
      t = 16; expect(s.draw({ scene: {} })).toBe(true); // first frame of the slide (dt 16 ms)
      const vps = r.calls.filter((c) => c[0] === 'vp').slice(0, 2);
      expect(vps).toHaveLength(2);
      expect(vps[0][3] + vps[1][3]).toBe(1000);
      expect(vps[0][3]).toBeGreaterThan(500);
      expect(s.active()).toBe(true);
      expect(els[0].style.display).toBe('block');
    } finally { delete coop.second; delete coop.splitInfo; }
  });
});

describe('S4: the first slide eases cat one\'s camera in from the shared pose', () => {
  it('draws from the shared pose at the start, restores its own pose after, and publishes the rule\'s answer', () => {
    const r = fakeRenderer();
    const one = cam('one'); one.position.set(10, 0, 0);
    const drawn = [];
    r.render = (sc, c) => { if (c.name === 'one') drawn.push(c.position.x); };
    coop.second = () => cam('two'); coop.splitInfo = { gap: 30, maxSep: 10, top: true, sameLevel: true };
    let t = 0; const s = createSplit({ renderer: r, camera: one, doc: null, now: () => t });
    one.position.set(0, 0, 0); // the last shared frame's pose
    s.draw({ scene: {} }); // first active frame: pose kept as the 'from'
    one.position.set(10, 0, 0); t = 100; // the cat's own camera now
    s.draw({ scene: {} });
    expect(drawn[1]).toBeLessThan(10); expect(drawn[1]).toBeGreaterThanOrEqual(0); // eased, not popped
    expect(one.position.x).toBe(10); // own pose put back
    expect(coop.splitRes.active).toBe(true);
    delete coop.second; delete coop.splitInfo; delete coop.splitRes;
  });
});
