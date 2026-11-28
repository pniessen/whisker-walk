import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

const { VISTAS, vistaTargets, momentAt, createVista, VISTA_N } = await import('../src/world/marketvista.js');
const { createReact } = await import('../src/world/marketreact.js');

// Market beauty pass 7: photogenic vistas and the golden moment. No triangle, mesh or caster; the grade is uniforms.
const camFor = (v) => {
  const tx = v.look.x - v.at.x; const tz = v.look.z - v.at.z; const l = Math.hypot(tx, tz);
  const c = new THREE.PerspectiveCamera(70, 16 / 9);
  c.position.set(v.at.x - (tx / l) * 4.5, 2.2, v.at.z - (tz / l) * 4.5);
  c.lookAt(v.at.x + (tx / l) * 0.3, 0.5, v.at.z + (tz / l) * 0.3);
  c.updateMatrixWorld(true);
  return c;
};
describe('market vistas', () => {
  it('has five vistas, each on its spot facing its view and off when away or turned round', () => {
    expect(VISTAS.length).toBe(5);
    for (const v of VISTAS) {
      const tx = v.look.x - v.at.x; const tz = v.look.z - v.at.z;
      expect(vistaTargets(v.at.x, v.at.z, tx, tz)[VISTAS.indexOf(v)]).toBeGreaterThan(0.99);
      expect(vistaTargets(v.at.x, v.at.z, -tx, -tz)[VISTAS.indexOf(v)]).toBe(0);
      expect(vistaTargets(v.at.x + 30, v.at.z, tx, tz)[VISTAS.indexOf(v)]).toBe(0);
    }
  });
  it('the golden moment comes after three still seconds, once per vista, with the chime, and not under reduced motion', () => {
    const v = VISTAS[0];
    let chimes = 0;
    const sound = { vista: () => chimes++ };
    const life = createVista({});
    const cam = camFor(v);
    let t = 0;
    for (; t < 2.5; t += 0.05) life.update(0.05, t, { x: v.at.x, z: v.at.z }, cam, sound);
    expect(life.state.gold).toBe(0);
    for (; t < 6; t += 0.05) life.update(0.05, t, { x: v.at.x, z: v.at.z }, cam, sound);
    expect(life.state.gold).toBeGreaterThan(0.9);
    expect(chimes).toBe(1);
    for (; t < 40; t += 0.05) life.update(0.05, t, { x: v.at.x, z: v.at.z }, cam, sound);
    expect(chimes).toBe(1); // not again at this vista
    expect(life.state.gold).toBe(0);
    const still = createVista({ reducedMotion: true });
    for (let s = 0; s < 8; s += 0.05) still.update(0.05, s, { x: v.at.x, z: v.at.z }, cam, sound);
    expect(chimes).toBe(1);
    expect(still.state.w).toBeGreaterThan(0.99); // the grade holds, static
  });
  it('the envelope rises and falls and the pool grows only by points', () => {
    expect(momentAt(-1)).toBe(0);
    expect(momentAt(2)).toBe(1);
    expect(momentAt(9.6)).toBe(0);
    expect(VISTA_N.spark + VISTA_N.haze + VISTA_N.frame).toBeLessThan(80);
    expect(createReact().uMkVig.value).toBe(0);
  });
});
