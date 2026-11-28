import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { build } = await import('../src/world/lighthouse.js');
const { createLighthouseAlive, GULLS_HIGH, GULLS_LOW } = await import('../src/world/lighthousealive.js');

// Lighthouse Point, beauty pass 2 (2026-11-28): the circling gulls, the sea's foam and twinkle, the rocking boats.
function rig(opts = {}) {
  const scene = new THREE.Scene();
  build(scene);
  const alive = createLighthouseAlive({ scene, ...opts });
  const cam = new THREE.PerspectiveCamera();
  return { scene, alive, cam };
}
const snapshot = (alive, scene) => [
  ...alive.objects.map((o) => Array.from(o.geometry.attributes.position.array).join(',')),
  Array.from(scene.getObjectByName('lighthouse:boats').geometry.attributes.position.array).join(','),
].join('|');

describe('the lighthouse alive layer', () => {
  it('draws two meshes of its own (gulls and sea fx), neither casting, neither merged away', () => {
    const { alive } = rig();
    expect(alive.objects.map((o) => o.name)).toEqual(['lighthouse:gulls', 'lighthouse:seafx']);
    for (const o of alive.objects) { expect(o.castShadow).toBe(false); expect(o.userData.noMerge).toBe(true); expect(o.userData.noCast).toBe(true); }
  });
  it('has eight gulls, four on the low tier (four triangles each)', () => {
    expect(rig().alive.gulls.length).toBe(GULLS_HIGH);
    const low = rig({ tier: { name: 'low' } });
    expect(low.alive.gulls.length).toBe(GULLS_LOW);
    expect(low.alive.objects[0].geometry.attributes.position.count / 3).toBe(GULLS_LOW * 4);
  });
  it('moves: the gulls, the foam and the boats change from one second to the next', () => {
    const { alive, scene, cam } = rig();
    alive.update(0.03, 1, cam, 0, 0);
    const a = snapshot(alive, scene);
    alive.update(0.03, 2.3, cam, 0, 0);
    expect(snapshot(alive, scene)).not.toBe(a);
  });
  it('reduced motion freezes all of it', () => {
    const { alive, scene, cam } = rig({ reducedMotion: true });
    alive.update(0.03, 1, cam, 0, 0);
    const a = snapshot(alive, scene);
    alive.update(0.03, 7.7, cam, 0, 0);
    expect(snapshot(alive, scene)).toBe(a);
  });
  it('the beam\'s glow on the clouds is dark until the lamp is lit', () => {
    const { alive, cam } = rig();
    const col = alive.objects[1].geometry.attributes.color;
    alive.update(0.03, 1, cam, 0.5, 0);
    const n = alive.objects[1].geometry.drawRange.count;
    const lastFan = () => { let s = 0; for (let i = n - 24; i < n; i++) s += col.getX(i); return s; };
    expect(lastFan()).toBe(0);
    alive.update(0.03, 1, cam, 0.5, 1);
    expect(lastFan()).toBeGreaterThan(0);
  });
  it('dispose puts the boats level again and removes its meshes', () => {
    const { alive, scene, cam } = rig();
    const boats = scene.getObjectByName('lighthouse:boats');
    const base = Array.from(boats.userData.base);
    alive.update(0.03, 3.1, cam, 0, 0);
    alive.dispose();
    expect(Array.from(boats.geometry.attributes.position.array)).toEqual(base);
    expect(scene.getObjectByName('lighthouse:gulls')).toBeUndefined();
  });
});
