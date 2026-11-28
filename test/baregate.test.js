import { describe, it, expect, afterAll } from 'vitest';
import * as THREE from 'three';
import { setBareGate, bareGateOn, clampFog, wantsNoAntialias } from '../src/render/baregate.js';
import { MEMORY_KEY } from '../src/render/adaptive.js';

const store = (obj = {}) => ({ getItem: (k) => (k in obj ? obj[k] : null) });
const mem = (rung) => JSON.stringify({ rung, steppedAt: 0, walks: 1, waitDays: 7, retrying: false });
const ipad = { model: 'iPad7,11', memoryGB: 2.9 };

describe('the Points gate', () => {
  afterAll(() => setBareGate(THREE.Points, false));
  it('hides every Points object made after it is on, and hands visibility back when it is off', () => {
    setBareGate(THREE.Points, true);
    expect(bareGateOn()).toBe(true);
    const p = new THREE.Points();
    expect(p.visible).toBe(false);
    const m = new THREE.Mesh();
    expect(m.visible).toBe(true); // a mesh is never gated: goals, prompts and cats are meshes
    p.visible = true;
    expect(p.visible).toBe(false); // modules that switch it on each frame cannot beat the gate
    setBareGate(THREE.Points, false);
    expect(p.visible).toBe(true);
    p.visible = false;
    expect(p.visible).toBe(false);
  });
  it('a Points object made before the gate was installed is hidden by the traverse on a live step', () => {
    const scene = new THREE.Scene();
    const early = new THREE.Points();
    scene.add(early);
    setBareGate(THREE.Points, true, scene);
    expect(early.visible).toBe(false);
  });
});

describe('clampFog', () => {
  it('pulls the far end in, and near with it, and never pushes it out', () => {
    const scene = { fog: new THREE.Fog(0xffffff, 40, 130) };
    clampFog(scene, 85);
    expect(scene.fog.far).toBe(85);
    expect(scene.fog.near).toBeCloseTo(29.75, 5);
    clampFog(scene, 200);
    expect(scene.fog.far).toBe(85);
    clampFog({ fog: null }, 85);
    clampFog(null, 85);
  });
});

describe('wantsNoAntialias: only the bottom rung builds its canvas without it', () => {
  it('?rung=7, the picker and a remembered bottom rung', () => {
    expect(wantsNoAntialias({ search: '?rung=7' })).toBe(true);
    expect(wantsNoAntialias({ search: '?rung=5', storage: store({ [MEMORY_KEY]: mem(7) }) })).toBe(false);
    expect(wantsNoAntialias({ storage: store({ 'whisker-walk-settings': '{"quality":"bare"}' }) })).toBe(true);
    expect(wantsNoAntialias({ storage: store({ 'whisker-walk-settings': '{"quality":"high"}', [MEMORY_KEY]: mem(7) }) })).toBe(false);
    expect(wantsNoAntialias({ storage: store({ [MEMORY_KEY]: mem(7) }) })).toBe(true);
    expect(wantsNoAntialias({ storage: store({ [MEMORY_KEY]: mem(6) }) })).toBe(false);
  });
  it('with no memory the device table decides; Safari and desktop keep it', () => {
    expect(wantsNoAntialias({ storage: store(), device: ipad })).toBe(true);
    expect(wantsNoAntialias({ storage: store(), device: { model: 'iPad12,2', memoryGB: 2.9 } })).toBe(false);
    expect(wantsNoAntialias({ storage: store(), device: null })).toBe(false);
    expect(wantsNoAntialias({})).toBe(false);
    expect(wantsNoAntialias({ storage: { getItem() { throw new Error('x'); } } })).toBe(false);
  });
});
