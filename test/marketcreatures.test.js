import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

const { createCreatures, CREATURE_COUNT, CELLS } = await import('../src/world/marketcreatures.js');
const { openAt, closeAt, STALL_HUES, createReact } = await import('../src/world/marketreact.js');

// Market beauty pass 5: the square's small creatures are one Points, no triangle, and everything stills under reduced motion.
describe('market creatures', () => {
  it('is one Points and adds no mesh, no caster', () => {
    const scene = new THREE.Scene();
    const c = createCreatures(scene, {});
    expect(scene.children.length).toBe(1);
    expect(c.points.isPoints).toBe(true);
    expect(c.count).toBe(CREATURE_COUNT);
    expect(c.points.userData.noCast).toBe(true);
    c.dispose();
    expect(scene.children.length).toBe(0);
  });
  it('arrives once; sparrows fly up when she comes near', () => {
    const scene = new THREE.Scene();
    const c = createCreatures(scene, {});
    const cat = { x: 30, y: 0, z: 30 };
    c.update(0.03, 1, cat);
    const pos = c.points.geometry.attributes.position;
    const sp = [pos.getX(2), pos.getZ(2)];
    c.arrive(1);
    expect(c.arrived).toBe(true);
    c.update(0.03, 1.5, { x: sp[0], y: 0, z: sp[1] });
    for (let i = 0; i < 20; i++) c.update(0.05, 2 + i * 0.05, { x: sp[0], y: 0, z: sp[1] });
    expect(pos.getY(2)).toBeGreaterThan(0.5); // up in the air, not sitting at 0.12
    c.dispose();
  });
  it('reduced motion keeps everything where it sits, the lite rung draws only the cat and the dog', () => {
    const scene = new THREE.Scene();
    const c = createCreatures(scene, { reducedMotion: true });
    const pos = c.points.geometry.attributes.position;
    const a = Array.from(pos.array);
    c.arrive(0);
    c.update(1, 50, { x: -3.3, y: 0, z: 10 });
    c.update(1, 90, { x: -3.3, y: 0, z: 10 });
    expect(Array.from(pos.array)).toEqual(a);
    c.dispose();
    const l = createCreatures(scene, { tier: { shadows: false } });
    const p2 = l.points.geometry.attributes.position;
    for (let i = 2; i < 8; i++) expect(p2.getY(i)).toBe(-50); // sparrows not drawn
    expect(l.points.geometry.attributes.aCell.getX(0)).toBe(CELLS.cat);
    l.dispose();
  });
  it('the day opens stalls in the morning and shuts them at dusk', () => {
    expect(openAt(0)).toBe(1);
    expect(openAt(0.5)).toBe(0);
    expect(closeAt(0.3)).toBe(0);
    expect(closeAt(0.95)).toBeCloseTo(1, 5);
    expect(closeAt(0.8)).toBeGreaterThan(0.3);
  });
  it('the react record carries ten stall hues, neutral day', () => {
    const r = createReact();
    expect(r.uMkDay.value.toArray()).toEqual([0, 0]);
    expect(r.uMkSt.value.length).toBe(10);
    expect(Object.keys(STALL_HUES).length).toBe(10);
  });
});
