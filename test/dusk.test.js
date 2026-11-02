import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DUSK, duskLook, applyDusk, duskEnv, addCollarGlow } from '../src/render/dusk.js';
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
