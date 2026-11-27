import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub, buildRiver as buildArea } from './helpers/growriver.js';

// Beauty PIN-1: the Pines' needle-litter ground (forestfloor.js, vertex colour only)
// and one merged non-casting mesh of sun shafts (pinesshafts.js), strips only.
vi.stubGlobal('document', canvasStub);
const pines = await import('../src/world/pines.js');
const { setGrow } = await import('../src/grow.js');
const { pinesShaftPlan, SHAFT_RULE, SHAFT_OPACITY } = await import('../src/world/pinesshafts.js');
const { pinesFloorTint } = await import('../src/world/forestfloor.js');
const build = (on) => buildArea(pines, setGrow, on);
build(false);

describe('the Pines sun shafts', () => {
  const ON = build(true);
  const OFF = build(false);
  const mesh = ON.scene.children.find((c) => c.name === 'pines:shafts');

  it('is one non-casting additive mesh, with the switch on only', () => {
    expect(mesh).toBeTruthy();
    expect(OFF.scene.children.some((c) => c.name === 'pines:shafts')).toBe(false);
    expect(mesh.material.blending).toBe(THREE.AdditiveBlending);
    expect(mesh.userData.noCast).toBe(true);
    expect(mesh.userData.strip).toBe('strips');
    expect(ON.scene.children.filter((c) => c.name === 'pines:shafts').length).toBe(1);
  });

  it('is a handful of tubes, a few dozen triangles', () => {
    const tris = mesh.geometry.attributes.position.count / 3;
    expect(tris).toBeGreaterThanOrEqual(40);
    expect(tris).toBeLessThanOrEqual(SHAFT_RULE.cap * 20);
  });

  it('is seeded: the same plan every time', () => {
    const fits = (x, z) => Math.hypot(x, z) > 5;
    expect(pinesShaftPlan(fits)).toEqual(pinesShaftPlan(fits));
    expect(pinesShaftPlan(fits).length).toBeLessThanOrEqual(SHAFT_RULE.cap);
  });

  it('hides on LOW and LITE, holds still under reduced motion, breathes otherwise', () => {
    const life = ON.area.life;
    const lo = life({ tier: { name: 'low' }, reducedMotion: false });
    expect(mesh.visible).toBe(false);
    lo.dispose();
    const rm = life({ tier: { name: 'high' }, reducedMotion: true });
    expect(mesh.visible).toBe(true);
    rm.update(0.016, 7);
    expect(mesh.material.opacity).toBe(SHAFT_OPACITY);
    const live = life({ tier: { name: 'high' }, reducedMotion: false });
    live.update(0.016, 7);
    expect(mesh.material.opacity).not.toBe(SHAFT_OPACITY);
  });
});

describe('the needle litter', () => {
  it('drifts a lighter litter out past the canopy, with the plain floor kept at the edge', () => {
    const tint = pinesFloorTint([{ x: 0, z: 0, scale: 1 }], { edge: 60 });
    const seen = new Set();
    for (let x = 4; x < 9; x += 0.7) seen.add(tint(x, 0.3).map((v) => v.toFixed(2)).join());
    expect(seen.size).toBeGreaterThan(2);
    expect(tint(60, 0)).toEqual([1, 1, 1]);
  });
});
