import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { withLocalUuids } from '../src/world/localuuids.js';
import {
  createMarketAtlas, atlasCell, marketMaterials, createMarketParts, buildTreatMesh, createBubbleTexture, buildBroom, TREAT_KINDS,
} from '../src/world/marketparts.js';

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
  it('the atlas is the same twice and paints no canvas', () => {
    let a; let b;
    const spy = withDocumentSpy(() => { a = createMarketAtlas(); b = createMarketAtlas(); marketMaterials(); });
    expect(spy).not.toHaveBeenCalled();
    expect(a.size).toBe(128);
    expect(a.cells).toBe(16);
    expect(a.texture.isDataTexture).toBe(true);
    expect(a.texture.magFilter).toBe(THREE.LinearFilter);
    expect(Array.from(a.texture.image.data)).toEqual(Array.from(b.texture.image.data));
    // every cell is opaque and painted (not one flat colour)
    const d = a.texture.image.data;
    for (let c = 0; c < 16; c++) {
      const seen = new Set();
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const i = ((Math.floor(c / 4) * 32 + y) * 128 + (c % 4) * 32 + x) * 4;
        expect(d[i + 3]).toBe(255);
        seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      }
      expect(seen.size, `cell ${c}`).toBeGreaterThan(2);
    }
  });

  it('atlasCell gives each cell its own quarter-row box', () => {
    expect(atlasCell(0)).toEqual({ u0: 0, v0: 0, u1: 0.25, v1: 0.25 });
    expect(atlasCell(5)).toEqual({ u0: 0.25, v0: 0.25, u1: 0.5, v1: 0.5 });
    expect(atlasCell(15)).toEqual({ u0: 0.75, v0: 0.75, u1: 1, v1: 1 });
  });

  it('the materials are one set: awning and stall carry the atlas, the lantern is dark until dusk', () => {
    const m = marketMaterials();
    for (const k of ['stall', 'awning', 'cobble', 'stone', 'metal', 'glass', 'lantern', 'cloth']) expect(m[k], k).toBeTruthy();
    expect(m.awning.map).toBeTruthy();
    expect(m.stall.map).toBe(m.awning.map);
    expect(m.lantern.emissiveIntensity).toBe(0);
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
    for (const k of ['box', 'post', 'counter', 'crate', 'basket', 'trestle', 'cafeTable', 'cafeChair', 'bulb', 'pennant']) {
      const g = PARTS[k];
      expect(g, k).toBeTruthy();
      expect(g.attributes.position.count, k).toBeGreaterThan(0);
      expect(g).toBe(PARTS[k]);
    }
    expect(PARTS.crate.index.count / 3).toBe(12);
  });

  it('there is a treat mesh for every treat kind, small and casting nothing', () => {
    expect(TREAT_KINDS).toEqual(['fishhead', 'sausageroll', 'cheddar', 'cream', 'crumbs']);
    for (const kind of TREAT_KINDS) {
      const g = buildTreatMesh(kind);
      expect(g.isGroup, kind).toBe(true);
      const box = new THREE.Box3().setFromObject(g);
      const s = box.getSize(new THREE.Vector3());
      expect(Math.max(s.x, s.y, s.z), kind).toBeLessThan(0.25);
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
