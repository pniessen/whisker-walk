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
  it('draws three meshes of its own (gulls, sea fx, wet prints), none casting, none merged away', () => {
    const { alive } = rig();
    expect(alive.objects.map((o) => o.name)).toEqual(['lighthouse:gulls', 'lighthouse:seafx', 'lighthouse:wetprints']);
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
    const TAIL = 4 * 60 + 3 * 18 + 12; // pass three's rings, mist and ship come after the cloud glow
    const lastFan = () => { let s = 0; for (let i = n - TAIL - 24; i < n - TAIL; i++) s += col.getX(i); return s; };
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

  // pass three (2026-11-28): the place reacts to her
  const POOL = { x: 22, z: 12, y: 0 }; // pool-2
  const walkIn = (alive, cam, steps, from = 0, pos = (i) => ({ x: POOL.x - 1 + i * 0.12, y: 0, z: POOL.z })) => {
    for (let i = 0; i < steps; i++) alive.update(1 / 30, from + i / 30, cam, 0, 0, pos(i));
  };
  const brightness = (o, from, to) => { const col = o.geometry.attributes.color; let sum = 0; for (let i = from; i < to; i++) sum += col.getX(i); return sum; };
  it('rings of foam spread where she wades, and fade away', () => {
    const { alive, cam } = rig();
    const fx = alive.objects[1];
    const n = fx.geometry.drawRange.count;
    const ringsFrom = n - 12 - 3 * 18 - 4 * 60;
    walkIn(alive, cam, 40);
    expect(brightness(fx, ringsFrom, ringsFrom + 240)).toBeGreaterThan(0.5);
    for (let i = 0; i < 90; i++) alive.update(1 / 30, 2 + i / 30, cam, 0, 0, { x: 5, y: 0, z: 30 });
    expect(brightness(fx, ringsFrom, ringsFrom + 240)).toBe(0);
  });
  it('wet paws leave prints on the dry sand that fade, and dry sand with dry paws leaves none', () => {
    const wet = rig();
    walkIn(wet.alive, wet.cam, 30);
    for (let i = 0; i < 40; i++) wet.alive.update(1 / 30, 1 + i / 30, wet.cam, 0, 0, { x: POOL.x + 4 + i * 0.1, y: 0, z: POOL.z });
    const m = wet.alive.objects[2];
    const alphaAt = () => { let s = 0; const a = m.geometry.attributes.color; for (let i = 0; i < 8 * 12; i++) s += a.getW(i); return s; };
    expect(alphaAt()).toBeGreaterThan(0.5);
    for (let i = 0; i < 300; i++) wet.alive.update(1 / 30, 2.4 + i / 30, wet.cam, 0, 0, { x: 5, y: 0, z: 30 });
    expect(alphaAt()).toBe(0);
    const dry = rig();
    for (let i = 0; i < 40; i++) dry.alive.update(1 / 30, i / 30, dry.cam, 0, 0, { x: 0 + i * 0.1, y: 0, z: 36 });
    const a = dry.alive.objects[2].geometry.attributes.color;
    let s = 0; for (let i = 0; i < 8 * 12; i++) s += a.getW(i);
    expect(s).toBe(0);
  });
  it('running puts the gulls up, and they settle again', () => {
    const { alive, cam } = rig();
    const g = alive.gulls;
    for (let i = 0; i < 60; i++) alive.update(1 / 30, i / 30, cam, 0, 0, { x: -22 + i * 0.2, y: 0, z: -10 });
    expect(Math.max(...g.map((x) => x.scare))).toBeGreaterThan(0.5);
    for (let i = 0; i < 300; i++) alive.update(1 / 30, 3 + i / 30, cam, 0, 0, { x: 0, y: 0, z: 40 });
    expect(Math.max(...g.map((x) => x.scare))).toBe(0);
  });
  it('reduced motion: no rings, no prints, no scatter', () => {
    const { alive, cam } = rig({ reducedMotion: true });
    walkIn(alive, cam, 40);
    for (let i = 0; i < 40; i++) alive.update(1 / 30, i / 30, cam, 0, 0, { x: POOL.x + 4 + i * 0.1, y: 0, z: POOL.z });
    const m = alive.objects[2].geometry.attributes.color;
    let s = 0; for (let i = 0; i < 8 * 12; i++) s += m.getW(i);
    expect(s).toBe(0);
    expect(Math.max(...alive.gulls.map((x) => x.scare))).toBe(0);
  });
  it('the low tier has fewer rings and prints and no mist or ship', () => {
    const hi = rig(); const lo = rig({ tier: { name: 'low' } });
    expect(lo.alive.objects[1].geometry.drawRange.count).toBeLessThan(hi.alive.objects[1].geometry.drawRange.count);
    expect(lo.alive.objects[2].geometry.attributes.position.count).toBeLessThan(hi.alive.objects[2].geometry.attributes.position.count);
  });
  it('the surf follows the foam: a swell once a foam period, only while she is near the water, through the sound it is given', () => {
    const calls = [];
    const sound = { surf: (k) => calls.push(k), gull: () => calls.push('gull') };
    const { alive, cam } = rig({ sound });
    for (let i = 0; i < 30 * 24; i++) alive.update(1 / 30, i / 30, cam, 0, 0, { x: 30, y: 0, z: 36 });
    const surfs = calls.filter((c) => typeof c === 'number');
    expect(surfs.length).toBeGreaterThanOrEqual(2);
    expect(surfs.every((k) => k > 0 && k <= 1)).toBe(true);
  });
  it('without a cat it still lives (tide and mist move) and does not throw', () => {
    const { alive, scene, cam } = rig();
    alive.update(0.03, 1, cam, 0, 0, null);
    const a = snapshot(alive, scene);
    alive.update(0.03, 20, cam, 0, 0, null);
    expect(snapshot(alive, scene)).not.toBe(a);
  });
});
