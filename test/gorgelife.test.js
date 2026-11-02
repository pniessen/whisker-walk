import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The same headless canvas stub every world test uses (see test/skylife.test.js);
// litMaterial may reach for a canvas.
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

const { SHADE_FLOOR, shadeFor, composeIntensity, createGorgeLife } = await import('../src/gorgelife.js');

// A ground whose height is the cat's x: the tests walk her up by moving x.
const RAMP = { flat: false, y: (x) => x };

function make({ reducedMotion = false, sunIntensity = 3, fillIntensity = 1 } = {}) {
  const scene = new THREE.Scene();
  const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
  const fill = new THREE.HemisphereLight(0xffffff, 0x5f5d52, fillIntensity);
  const audio = { setAmbientMix: vi.fn() };
  const life = createGorgeLife({ scene, sun, fill, ground: RAMP, reducedMotion, audio });
  return { scene, sun, fill, audio, life };
}

const at = (y) => new THREE.Vector3(y, y, 0);
const birdMeshes = (scene) => scene.children.filter((c) => c.isInstancedMesh);

function birdPositions(scene) {
  const mesh = birdMeshes(scene)[0];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    out.push(p.setFromMatrixPosition(m).toArray());
  }
  return out;
}

describe('gorge life: shade by height', () => {
  it('shade is 0.6 on the floor, 1 on the clifftop, eased', () => {
    expect(SHADE_FLOOR).toBe(0.6);
    expect(shadeFor(0)).toBe(0.6);
    expect(shadeFor(2)).toBe(0.6);
    expect(shadeFor(6)).toBeCloseTo(0.8, 10);
    expect(shadeFor(10)).toBe(1);
    expect(shadeFor(12)).toBe(1);

    const { sun, fill, life } = make();
    // The walk starts where she stands: no fade-in on the first frame.
    life.update(1 / 60, 0, at(0));
    expect(life.shade).toBeCloseTo(0.6, 10);
    expect(sun.intensity).toBeCloseTo(3 * 0.6, 10);
    expect(fill.intensity).toBeCloseTo(0.85 + 0.15 * 0.6, 10);
    // Up on the clifftop it eases at 1.5 a second, not in one jump.
    life.update(0.1, 0.1, at(12));
    expect(life.shade).toBeCloseTo(0.75, 10);
    for (let i = 0; i < 20; i++) life.update(0.05, 0.2 + i * 0.05, at(12));
    expect(life.shade).toBe(1);
    expect(sun.intensity).toBeCloseTo(3, 10);
    expect(fill.intensity).toBeCloseTo(1, 10);
  });

  it('composeIntensity keeps an outside write as the new base', () => {
    const light = { intensity: 3 };
    const state = { base: 3, written: 3 };
    composeIntensity(state, light, 0.6);
    expect(light.intensity).toBeCloseTo(1.8, 10);
    expect(state.written).toBe(light.intensity);
    // the same factor again changes nothing: our own write is not a new base
    composeIntensity(state, light, 0.6);
    expect(light.intensity).toBeCloseTo(1.8, 10);
    // the rainbow writes the sun
    light.intensity = 2.2;
    composeIntensity(state, light, 0.6);
    expect(state.base).toBe(2.2);
    expect(light.intensity).toBeCloseTo(1.32, 10);
  });

  it('the life never leaves the sun dimmed after dispose', () => {
    const { sun, fill, life } = make();
    life.update(1 / 60, 0, at(0));
    expect(sun.intensity).toBeCloseTo(1.8, 10);
    life.dispose();
    expect(sun.intensity).toBe(3);
    expect(fill.intensity).toBe(1);

    // a weather write since the last frame is kept, not undone
    const b = make();
    b.life.update(1 / 60, 0, at(0));
    b.sun.intensity = 2.2;
    b.life.dispose();
    expect(b.sun.intensity).toBe(2.2);
  });

  it('dusk and weather values set before the walk are the base it shades', () => {
    const { sun, life } = make({ sunIntensity: 0.7 });
    life.update(1 / 60, 0, at(0));
    expect(sun.intensity).toBeCloseTo(0.7 * 0.6, 10);
  });

  it('mixes the ambience by height, at most 4 times a second', () => {
    const { audio, life } = make();
    for (let i = 0; i < 60; i++) life.update(1 / 60, i / 60, at(0));
    expect(audio.setAmbientMix.mock.calls.length).toBeGreaterThan(0);
    expect(audio.setAmbientMix.mock.calls.length).toBeLessThanOrEqual(4);
    expect(audio.setAmbientMix).toHaveBeenLastCalledWith({ high: 0 });
    for (let i = 0; i < 60; i++) life.update(1 / 60, 1 + i / 60, at(12));
    expect(audio.setAmbientMix).toHaveBeenLastCalledWith({ high: 1 });
    for (let i = 0; i < 60; i++) life.update(1 / 60, 2 + i / 60, at(6));
    expect(audio.setAmbientMix).toHaveBeenLastCalledWith({ high: 0.5 });
  });
});

describe('gorge life: wheeling birds', () => {
  it('birds wheel above every rim and are time-driven', () => {
    const a = make();
    const b = make();
    const meshes = birdMeshes(a.scene);
    expect(meshes).toHaveLength(1);
    expect(meshes[0].count).toBe(3);
    expect(meshes[0].userData.noCast).toBe(true);
    expect(meshes[0].castShadow).toBe(false);
    const seen = new Set();
    for (let t = 0; t <= 60; t += 0.25) {
      a.life.update(0.25, t, at(0));
      // b runs at a different frame rate and from a different spot: only t counts
      b.life.update(0.1, t, at(t % 12));
      const pa = birdPositions(a.scene);
      expect(birdPositions(b.scene)).toEqual(pa);
      for (const [x, y, z] of pa) {
        expect(y).toBeGreaterThanOrEqual(32);
        expect(y).toBeLessThanOrEqual(36);
        seen.add(`${x.toFixed(1)},${z.toFixed(1)}`);
      }
    }
    expect(seen.size).toBeGreaterThan(100); // they move
  });

  it('with reducedMotion there are none', () => {
    const { scene, life } = make({ reducedMotion: true });
    for (let t = 0; t < 10; t += 0.5) life.update(0.5, t, at(0));
    expect(birdMeshes(scene)).toHaveLength(0);
    expect(() => life.dispose()).not.toThrow();
  });

  it('dispose takes the birds out and frees them', () => {
    const { scene, life } = make();
    const mesh = birdMeshes(scene)[0];
    const spies = [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material, 'dispose'), vi.spyOn(mesh, 'dispose')];
    life.dispose();
    expect(birdMeshes(scene)).toHaveLength(0);
    for (const s of spies) expect(s).toHaveBeenCalled();
  });
});
