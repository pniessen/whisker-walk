import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createReact, addSquareLife, dayPart, toneAt, DAY_PERIOD } from '../src/world/marketreact.js';
import { createMarketLife } from '../src/world/marketlife.js';
import { createMarketSound, CHIME } from '../src/world/marketsound.js';

const GEO = { fx: 0, fz: 5.6, c0: 2.6, c1: 2.9 };

describe('marketreact (beauty pass 3)', () => {
  it('is neutral at build and adds no mesh', () => {
    const r = createReact([[1, 2, 1, 1]]);
    expect(r.uMkTone.value.toArray()).toEqual([1, 1, 1]);
    expect(r.uMkCloud.value + r.uMkRip.value + r.uMkSpark.value + r.uMkSway.value).toBe(0);
    expect(r.uMkPud.value).toHaveLength(5);
  });

  it('patches a material for each kind and chains an earlier hook', () => {
    for (const kind of ['ground', 'paint', 'water']) {
      const m = new THREE.MeshStandardMaterial();
      let hooked = 0;
      m.onBeforeCompile = () => { hooked++; };
      addSquareLife(m, kind, createReact(), GEO);
      const shader = {
        uniforms: {},
        vertexShader: '#include <common>\n#include <begin_vertex>',
        fragmentShader: '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>',
      };
      m.onBeforeCompile(shader);
      expect(hooked).toBe(1);
      expect(shader.vertexShader).toContain('vMkW');
      expect(shader.fragmentShader).toContain('uMkTone');
      expect(shader.uniforms.uMkCat).toBeTruthy();
    }
  });

  it('the day goes morning cool, midday bright, evening warm, and comes round', () => {
    expect(dayPart(0)).toBe(0);
    expect(dayPart(DAY_PERIOD / 2)).toBe(1);
    expect(dayPart(DAY_PERIOD)).toBeCloseTo(0);
    const cool = toneAt(0, new THREE.Vector3());
    const warm = toneAt(1, new THREE.Vector3());
    expect(cool.z).toBeGreaterThan(cool.x);
    expect(warm.x).toBeGreaterThan(warm.z);
  });

  it('the life drives the uniforms, and reduced motion or the lite rung holds them still', () => {
    const run = (ctx) => {
      const react = createReact();
      const life = createMarketLife({ react, flutter: [] }, ctx);
      life.update(0.1, 100, { x: 0, y: 0, z: 0 });
      life.update(0.1, 100.1, { x: 1, y: 0, z: 0 });
      return react;
    };
    const live = run({});
    expect(live.uMkCloud.value).toBe(1);
    expect(live.uMkRip.value).toBeGreaterThan(0);
    expect(live.uMkR.value).toBeCloseTo(100.1);
    const calm = run({ reducedMotion: true });
    expect(calm.uMkCloud.value + calm.uMkRip.value + calm.uMkSway.value + calm.uMkR.value).toBe(0);
    const lite = run({ tier: { shadows: false } });
    expect(lite.uMkCloud.value + lite.uMkRip.value + lite.uMkSpark.value).toBe(0);
  });

  it('a stall chimes once as she passes, and not while muted', () => {
    const made = [];
    const ac = { state: 'running', currentTime: 0, sampleRate: 8000,
      createOscillator: () => { made.push('osc'); return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (n) => n, start() {}, stop() {}, disconnect() {} }; },
      createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }) };
    let muted = false;
    const audio = { getContext: () => ac, getMaster: () => ({}), isMuted: () => muted };
    const s = createMarketSound(audio, { chimes: [{ x: 0, z: 0 }] });
    s.update(0.1, { x: 20, y: 0, z: 20 });
    const before = made.length;
    s.update(0.1, { x: 0.5, y: 0, z: 0 });
    expect(made.length - before).toBe(CHIME.f.length);
    s.update(0.1, { x: 0.6, y: 0, z: 0 });
    expect(made.length - before).toBe(CHIME.f.length);
    muted = true;
    s.update(0.1, { x: 20, y: 0, z: 20 });
    s.update(20, { x: 0.5, y: 0, z: 0 });
    expect(made.length - before).toBe(CHIME.f.length);
  });
});
