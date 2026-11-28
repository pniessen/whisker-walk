// The Treehouse, beauty pass 9 (2026-11-28): night life. Pooled Points and numbers only: no new triangle, mesh or caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { measureWithLife } = await import('./helpers/lifebudget.js');
const { loadTreehouseStages } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const Nt = await import('../src/world/treehousenight.js');
const { rhythm } = await import('../src/world/treehouseliving.js');

const dot = () => new THREE.Texture();
describe('treehouse beauty pass 9', () => {
  it('adds no triangle, mesh or caster', () => {
    const r = measureWithLife(build);
    expect(r.whole.meshes).toBe(23);
    expect(r.whole.casters).toBe(1);
    expect(r.whole.triangles).toBe(60413);
  });

  it('the night fills exactly its slots on every rung, and hides the big ones by day', () => {
    for (const rung of ['high', 'low', 'lite']) for (const still of [false, true]) {
      const scene = new THREE.Scene(); const nt = Nt.createNight({ scene }, { rung, reducedMotion: still, dotTexture: dot });
      let puts = 0; let aways = 0;
      nt.draw(3, 1, () => { puts++; }, () => { aways++; }, null);
      expect(puts + aways).toBe(nt.big); expect(aways).toBeLessThanOrEqual(2); // (the squirrel's two slots wait while it is not gliding)
      puts = 0; aways = 0; nt.draw(3, 0, () => { puts++; }, () => { aways++; }, null);
      expect(puts).toBe(0); expect(aways).toBe(nt.big);
      expect(scene.children[0].geometry.attributes.position.count).toBe(nt.small);
      nt.dispose(); expect(scene.children.length).toBe(0);
    }
  });

  it('lite has fewer slots than low, low fewer than high; reduced motion has no glide', () => {
    const s = (r, st = false) => Nt.nightSlots(r, st);
    expect(s('lite').small).toBeLessThan(s('low').small); expect(s('low').small).toBeLessThan(s('high').small);
    expect(s('lite').big).toBeLessThan(s('high').big); expect(s('high', true).big).toBeLessThan(s('high').big);
  });

  it('owls turn their heads and blink; the friend peeks then vanishes; the squirrel glides between the trees', () => {
    const seen = new Set(); let shut = 0;
    for (let t = 0; t < 120; t += 0.05) { const e = Nt.eyesAt(0, t, false); seen.add(Math.round(e.turn * 4)); if (e.open === 0) shut++; }
    expect(seen.size).toBeGreaterThan(4); expect(shut).toBeGreaterThan(0); expect(Nt.eyesAt(0, 50, true).turn).toBe(0);
    expect(Nt.peekAt(23 * 0.13, false).k).toBe(1); expect(Nt.peekAt(23 * 0.6, false).k).toBe(0); expect(Nt.peekAt(5, true).k).toBe(1);
    const g = {}; Nt.glideAt(6, g); const a = { x: g.x };
    Nt.glideAt(8.1, g); expect(g.on).toBe(true); expect(g.spread).toBeGreaterThan(0.9);
    Nt.glideAt(10.2, g); expect(Math.abs(g.x - a.x)).toBeGreaterThan(15);
    Nt.glideAt(20, g); expect(g.on).toBe(false);
  });

  it('sound: a hoot and a far bell only at night, never under reduced motion or by day', () => {
    const mk = (still) => Nt.createNight({ scene: new THREE.Scene() }, { rung: 'high', reducedMotion: still, dotTexture: dot });
    const run = (nt, night) => { const heard = []; for (let t = 0; t < 140; t += 0.5) nt.sound(t, night, { x: 0, y: 1, z: 0 }, (f) => heard.push(f)); return heard; };
    const night = run(mk(false), 1); expect(night.length).toBeGreaterThan(6); expect(night).toContain(262);
    expect(run(mk(false), 0.2)).toEqual([]); expect(run(mk(true), 1)).toEqual([]);
  });

  it('the rhythm gives night 0 at noon and 1 at 22:00', () => {
    expect(rhythm(12.5).night).toBe(0); expect(rhythm(22).night).toBe(1);
  });
});
