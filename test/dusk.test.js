import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { DUSK, duskLook, applyDusk, duskEnv, addCollarGlow, duskLawnColor, tintDuskLawn } from '../src/render/dusk.js';
import {
  createSun, createFill, SUN_COLOR, SUN_INTENSITY, HEMI_SKY, HEMI_INTENSITY,
} from '../src/render/rig.js';

const area = { skyDusk: { top: 0x26344f, horizon: 0x5f5a72 }, groundBounce: 0x6a8a4a };
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('duskLook', () => {
  it('defaults to DUSK and merges per-area overrides', () => {
    expect(duskLook({})).toEqual(DUSK);
    const l = duskLook({ duskLight: { sunColor: 1 } });
    expect(l.sunColor).toBe(1);
    expect(l.sunIntensity).toBe(DUSK.sunIntensity);
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(DUSK)).toBe(true);
  });
});

describe('applyDusk', () => {
  it('warms and dims the sun, cools the fill, dims the ground bounce, sets fog', () => {
    const scene = new THREE.Scene();
    const sun = createSun();
    const fill = createFill(area.groundBounce);
    applyDusk({ scene, sun, fill, areaData: area });
    expect(sun.intensity).toBe(0.8);
    expect(sun.intensity).toBeLessThan(SUN_INTENSITY);
    const day = new THREE.Color(SUN_COLOR);
    expect(sun.color.g / sun.color.r).toBeLessThan(day.g / day.r);
    expect(sun.color.b / sun.color.r).toBeLessThan(day.b / day.r);
    expect(fill.color.b).toBeGreaterThan(fill.color.r);
    expect(lum(fill.color)).toBeLessThan(lum(new THREE.Color(HEMI_SKY)));
    const g = new THREE.Color(area.groundBounce);
    expect(fill.groundColor.r).toBeCloseTo(g.r * 0.55, 6);
    expect(fill.groundColor.g).toBeCloseTo(g.g * 0.55, 6);
    expect(fill.groundColor.b).toBeCloseTo(g.b * 0.55, 6);
    expect(fill.intensity).toBe(DUSK.hemiIntensity);
    expect(scene.fog.color.getHex()).toBe(area.skyDusk.horizon);
    expect(scene.fog.near).toBe(30);
    expect(scene.fog.far).toBe(110);
    expect(scene.background).toBeTruthy();
  });

  it('leaves nothing global behind', () => {
    applyDusk({ scene: new THREE.Scene(), sun: createSun(), fill: createFill(), areaData: area });
    const sun = createSun();
    const fill = createFill();
    expect(sun.color.getHex()).toBe(SUN_COLOR);
    expect(sun.intensity).toBe(SUN_INTENSITY);
    expect(fill.color.getHex()).toBe(HEMI_SKY);
    expect(fill.intensity).toBe(HEMI_INTENSITY);
  });
});

describe('duskEnv / addCollarGlow', () => {
  it('scales image light', () => {
    expect(duskEnv(1.0, DUSK)).toBe(0.45);
  });
  it('adds a shadowless PointLight to the cat', () => {
    const group = new THREE.Group();
    const l = addCollarGlow(group, DUSK);
    expect(group.getObjectByName('collarGlow')).toBe(l);
    expect(l.isPointLight).toBe(true);
    expect(l.castShadow).toBe(false);
    expect(l.color.getHex()).toBe(0x7ef2c0);
    expect(l.position.y).toBe(0.45);
    expect(l.intensity).toBe(1.6);
    expect(l.distance).toBe(4);
    expect(l.decay).toBe(2);
  });
});

describe('dusk lawns', () => {
  const sat = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  it('duskLawnColor is darker, less saturated and cooler', () => {
    const c = new THREE.Color(0.3, 0.6, 0.2);
    const d = duskLawnColor(c, duskLook({}));
    expect(d).not.toBe(c);
    expect(d.r).toBeLessThanOrEqual(c.r);
    expect(d.g).toBeLessThanOrEqual(c.g);
    expect(sat(d)).toBeLessThan(sat(c));
    expect(d.b / d.g).toBeGreaterThan(c.b / c.g);
  });
  const mk = () => {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.6, 0.2) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    return { mat, mesh };
  };
  it('swaps in a tinted clone, tints grass in place, and restores exactly once', () => {
    const { mat, mesh } = mk();
    const before = mat.color.toArray();
    const grass = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.25, 0.55, 0.15) });
    const grassBefore = grass.color.toArray();
    const look = duskLook({});
    const h = tintDuskLawn({ ground: [mesh], grass, look });
    const clone = mesh.material;
    expect(clone).not.toBe(mat);
    expect(clone.color.toArray()).toEqual(duskLawnColor(new THREE.Color(...before), look).toArray());
    expect(mat.color.toArray()).toEqual(before);
    expect(grass.color.toArray()).not.toEqual(grassBefore);
    let n = 0;
    const orig = clone.dispose.bind(clone);
    clone.dispose = () => { n++; orig(); };
    h.dispose();
    expect(mesh.material).toBe(mat);
    expect(n).toBe(1);
    expect(grass.color.toArray()).toEqual(grassBefore);
    h.dispose();
    expect(n).toBe(1);
    expect(grass.color.toArray()).toEqual(grassBefore);
  });
  it('a vertex-coloured mesh is desaturated per vertex and its colour attribute restored', () => {
    const geo = new THREE.PlaneGeometry(1, 1);
    const n = geo.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) cols.set([0.2 + 0.1 * v, 0.7 - 0.05 * v, 0.1 + 0.03 * v], v * 3);
    const attr = new THREE.BufferAttribute(cols, 3);
    geo.setAttribute('color', attr);
    const before = Array.from(cols);
    for (const matColor of [0xffffff, 0x88cc66]) {
      const mat = new THREE.MeshStandardMaterial({ color: matColor, vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      const look = duskLook({});
      const h = tintDuskLawn({ ground: [mesh], grass: null, look });
      expect(mesh.geometry).toBe(geo);
      const tc = geo.getAttribute('color');
      expect(tc).not.toBe(attr);
      const m = mat.color; const t = mesh.material.color;
      for (let v = 0; v < n; v++) {
        const eff = new THREE.Color(m.r * attr.getX(v), m.g * attr.getY(v), m.b * attr.getZ(v));
        const want = duskLawnColor(eff, look);
        expect(Math.abs(t.r * tc.getX(v) - want.r)).toBeLessThan(1e-6);
        expect(Math.abs(t.g * tc.getY(v) - want.g)).toBeLessThan(1e-6);
        expect(Math.abs(t.b * tc.getZ(v) - want.b)).toBeLessThan(1e-6);
      }
      // really desaturated: the vertex green/red ratio drops, not just scales
      expect((t.g * tc.getY(0)) / (t.r * tc.getX(0))).toBeLessThan((m.g * attr.getY(0)) / (m.r * attr.getX(0)));
      h.dispose();
      expect(geo.getAttribute('color')).toBe(attr);
      expect(Array.from(attr.array)).toEqual(before);
      expect(mesh.material).toBe(mat);
      h.dispose();
      expect(geo.getAttribute('color')).toBe(attr);
    }
  });
  it('skips array materials and materials without a colour', () => {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), [new THREE.MeshStandardMaterial()]);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial());
    const am = a.material; const bm = b.material;
    const h = tintDuskLawn({ ground: [a, b], grass: null, look: duskLook({}) });
    expect(a.material).toBe(am);
    expect(b.material).toBe(bm);
    h.dispose();
  });
  it('an area lawnTint override reaches the tint', () => {
    const c = new THREE.Color(0.3, 0.6, 0.2);
    const look = duskLook({ duskLight: { lawnTint: { desat: 0, dark: 0.5, cool: [1, 1, 1] } } });
    expect(duskLawnColor(c, look).g).toBeCloseTo(0.3, 6);
  });
  it('a partial lawnTint override keeps the other defaults', () => {
    const look = duskLook({ duskLight: { lawnTint: { dark: 0.6 } } });
    expect(look.lawnTint.dark).toBe(0.6);
    expect(look.lawnTint.desat).toBe(DUSK.lawnTint.desat);
    expect(look.lawnTint.cool).toEqual(DUSK.lawnTint.cool);
    expect(Object.isFrozen(look.lawnTint)).toBe(true);
    const c = duskLawnColor(new THREE.Color(0.3, 0.6, 0.2), look);
    expect([c.r, c.g, c.b].every(Number.isFinite)).toBe(true);
  });
  it('walk.js wires the tint and its disposal', () => {
    const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
    expect(src).toContain('tintDuskLawn(');
    expect(src).toContain('duskLawn.dispose()');
  });
});
