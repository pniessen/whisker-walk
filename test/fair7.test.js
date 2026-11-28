// The Fairground's beauty pass 7 (src/fairvista.js): the five photogenic spots, who is in the picture, the golden moment and the warm light.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { VISTAS, VISTA, vistaWeight, bestVista, vistaCounts, createVistas } from '../src/fairvista.js';

const pool = (n) => ({ pos: new Float32Array(n * 3).fill(-999), col: new Float32Array(n * 3), siz: new Float32Array(n).fill(1), at: 0 });
const yawToward = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

describe('the spots', () => {
  it('are five, each with a focal point', () => {
    expect(VISTAS.map((v) => v.id)).toEqual(['gate', 'carousel', 'boat', 'booths', 'hay']);
    for (const v of VISTAS) expect(Number.isFinite(v.fx + v.fz + v.fy + v.glow)).toBe(true);
  });
  it('weigh 1 on the spot facing the focal point, less looking away, 0 far off', () => {
    for (const v of VISTAS) {
      expect(vistaWeight(v, v.x, v.z, yawToward(v.x, v.z, v.ax, v.az))).toBeCloseTo(1, 5);
      expect(vistaWeight(v, v.x, v.z, yawToward(v.x, v.z, v.ax, v.az) + Math.PI)).toBe(0);
      expect(vistaWeight(v, v.x + 30, v.z, null)).toBe(0);
    }
    expect(bestVista(0, 0, null).w).toBe(0);
    expect(bestVista(1.5, 10.5, null).v.id).toBe('carousel');
  });
  it('take no slots with reduced motion and fewer when lite', () => {
    expect(vistaCounts(1, true)).toBe(0);
    expect(vistaCounts(0.25, false)).toBeLessThan(vistaCounts(1, false));
  });
});

describe('the golden moment', () => {
  const rig = (reducedMotion = false) => {
    const scene = new THREE.Scene(); const sun = new THREE.DirectionalLight(0xffeedd, 1); const fill = new THREE.HemisphereLight(0xaabbcc, 0x556644, 0.5); scene.add(sun, fill);
    const events = []; const glow = pool(vistaCounts(1, false) || 1);
    const vs = createVistas({ scene, glow, k: 1, reducedMotion, onEvent: (e) => events.push(e) });
    return { scene, sun, fill, events, glow, vs };
  };
  it('chimes once per spot after 3 s standing still, and not while walking', () => {
    const { events, vs } = rig(); const v = VISTAS[0]; const yaw = yawToward(v.x, v.z, v.ax, v.az); const me = { x: v.x, z: v.z };
    let T = 1000;
    for (let i = 0; i < 100; i++) { T += 1 / 30; me.x = v.x + (i % 2) * 0.1; vs.update(1 / 30, T, me, yaw, 0.5, 3); } // pacing about
    expect(events.length).toBe(0);
    me.x = v.x;
    for (let i = 0; i < 150; i++) { T += 1 / 30; vs.update(1 / 30, T, me, yaw, 0.5, 0); }
    expect(events.map((e) => e.id)).toEqual(['gate']);
    for (let i = 0; i < 600; i++) { T += 1 / 30; vs.update(1 / 30, T, me, yaw, 0.5, 0); }
    expect(events.length).toBe(1); // once per visit
    expect(VISTA.still).toBe(3);
  });
  it('does not chime when she faces away', () => {
    const { events, vs } = rig(); const v = VISTAS[1]; const me = { x: v.x, z: v.z }; let T = 5;
    for (let i = 0; i < 300; i++) { T += 1 / 30; vs.update(1 / 30, T, me, yawToward(v.x, v.z, v.ax, v.az) + Math.PI, 0.5, 0); }
    expect(events.length).toBe(0);
  });
  it('warms the light at a spot and gives it back, drawing nothing with reduced motion', () => {
    const { sun, fill, vs, glow } = rig(true); const v = VISTAS[2]; const yaw = yawToward(v.x, v.z, v.ax, v.az);
    const f0 = fill.color.r; const r0 = sun.color.r; const b0 = sun.color.b; let T = 0;
    for (let i = 0; i < 90; i++) { T += 1 / 30; vs.update(1 / 30, T, { x: v.x, z: v.z }, yaw, 0.5, 0); }
    expect(sun.color.r).toBeGreaterThan(r0); expect(sun.color.b).toBeLessThan(b0);
    expect(glow.col.every((c) => c === 0)).toBe(true);
    for (let i = 0; i < 300; i++) { T += 1 / 30; vs.update(1 / 30, T, { x: 0, z: 0 }, 0, 0.5, 0); }
    expect(sun.color.r).toBeCloseTo(r0, 3); expect(sun.color.b).toBeCloseTo(b0, 3); expect(fill.color.r).toBeCloseTo(f0, 3);
  });
});
