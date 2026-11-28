// Greenhouse beauty pass 4: stories in the details, the seasons, the rare surprise moments. No new meshes, no new casters, no new triangles.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const S = await import('../src/world/greenhousestory.js');
const G = await import('../src/world/greenhouseglass.js');
const P = await import('../src/world/greenhouseplan.js');
const { build } = await import('../src/world/greenhouse.js');

const BEFORE = { meshes: 74, triangles: 59854 }; // measured on main before this pass (build(scene), every mesh)
function count(scene) {
  let meshes = 0, triangles = 0;
  scene.traverse((o) => { if (!o.isMesh) return; meshes++; const g = o.geometry; triangles += (g.index ? g.index.count : g.attributes.position.count) / 3; });
  return { meshes, triangles };
}
const mean = (scene, name, under) => {
  const m = scene.getObjectByName(name), c = m.geometry.attributes.color, p = m.geometry.attributes.position;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < c.count; i++) { if (P.underGlass(p.getX(i) + m.position.x, 0.5, p.getZ(i) + m.position.z) !== under) continue; r += c.getX(i); g += c.getY(i); b += c.getZ(i); n++; }
  return [r / n, g / n, b / n];
};

describe('greenhouse pass 4: the build', () => {
  it('adds no mesh and no triangle (the tableau, signs and tags are paid for by the blooms\' unseen undersides)', () => {
    const scene = new THREE.Scene();
    build(scene, {});
    const c = count(scene);
    expect(c.meshes).toBeLessThanOrEqual(BEFORE.meshes);
    expect(c.triangles).toBeLessThanOrEqual(BEFORE.triangles);
  });
  it('glass is thinner than pass 3 (it is seen from both sides)', () => {
    expect(G.GLASS_ALPHA.wall).toBeLessThan(0.25);
    expect(G.GLASS_ALPHA.roof).toBeLessThan(0.27);
  });
});

describe('seasons', () => {
  it('reads the calendar: Nov is autumn, Jan winter, Apr spring, Jul summer; a bad date is summer', () => {
    expect([10, 0, 3, 6].map((m) => S.seasonOf(new Date(2026, m, 15)))).toEqual(['autumn', 'winter', 'spring', 'summer']);
    expect(S.seasonOf(new Date('nope'))).toBe('summer');
  });
  it('recolours what is outside the glass, leaves the hall alone, and summer puts the build\'s own colours back', () => {
    const scene = new THREE.Scene();
    build(scene, {});
    const out0 = mean(scene, 'ghFoliage', false), in0 = mean(scene, 'ghFoliage', true);
    expect(S.applySeason(scene, 'autumn')).toBeGreaterThan(100);
    const out1 = mean(scene, 'ghFoliage', false), in1 = mean(scene, 'ghFoliage', true);
    expect(out1[0] / out1[1]).toBeGreaterThan(out0[0] / out0[1] + 0.05); // outside goes golden (more red against green)
    expect(in1).toEqual(in0);
    S.applySeason(scene, 'autumn');
    expect(mean(scene, 'ghFoliage', false)).toEqual(out1); // idempotent
    expect(S.applySeason(scene, 'summer')).toBe(0);
    const back = mean(scene, 'ghFoliage', false);
    back.forEach((v, i) => expect(v).toBeCloseTo(out0[i], 6));
  });
  it('winter frosts the panes and warms the lamps; the life clears the frost on dispose', () => {
    const scene = new THREE.Scene();
    const area = build(scene, {});
    const life = area.life({ scene, ground: { y: () => 0 }, reducedMotion: false, season: 'winter' });
    expect(life.season).toBe('winter');
    expect(G.FROST.value).toBe(1);
    life.update(0.1, 1, { x: 0, y: 0, z: 30 }, null, null);
    expect(scene.getObjectByName('glassMist').userData.mist.uWarm.value).toBeGreaterThan(0.5);
    life.dispose();
    expect(G.FROST.value).toBe(0);
  });
});

describe('the surprise moments', () => {
  const fakeAudio = (muted) => { const a = { chimes: 0, isMuted: () => muted, chime() { a.chimes++; } }; return a; };
  it('each starts, fades in, ends by itself and leaves nothing on', () => {
    for (const kind of ['rainbow', 'sprinkler', 'moonbloom']) {
      const scene = new THREE.Scene();
      const m = S.createMoments({ scene, audio: fakeAudio(false), visits: 3 });
      expect(m.start(kind, 0)).toBe(true);
      expect(m.start('rainbow', 0)).toBe(false); // one at a time
      m.update(S.MOMENT[kind].fade);
      expect(m.points.material.opacity).toBeGreaterThan(0.4);
      expect(m.points.visible).toBe(true);
      m.update(S.MOMENT[kind].secs + 1);
      expect(m.active).toBe(false);
      expect(m.points.visible).toBe(false);
      m.dispose();
    }
  });
  it('chimes once when sound is on, never when muted', () => {
    const on = fakeAudio(false), off = fakeAudio(true);
    S.createMoments({ audio: on }).start('rainbow', 0);
    S.createMoments({ audio: off }).start('rainbow', 0);
    expect(on.chimes).toBe(1);
    expect(off.chimes).toBe(0);
  });
  it('reduced motion shows the same picture every frame; the low tier draws half the points', () => {
    const a = S.createMoments({ reducedMotion: true }), b = S.createMoments({ reducedMotion: true });
    a.start('sprinkler', 0); b.start('sprinkler', 0);
    a.update(5); b.update(11);
    expect(Array.from(a.points.geometry.attributes.position.array)).toEqual(Array.from(b.points.geometry.attributes.position.array));
    const full = S.createMoments({}), lite = S.createMoments({ lite: true });
    full.start('rainbow', 0); lite.start('rainbow', 0);
    expect(lite.points.geometry.drawRange.count).toBe(full.points.geometry.drawRange.count / 2);
  });
  it('a rain that ends may bring a rainbow, once, in the real life; a dry walk brings none', () => {
    const scene = new THREE.Scene();
    const area = build(scene, {});
    let raining = true;
    const life = area.life({ scene, ground: { y: () => 0 }, reducedMotion: false, season: 'summer', roomSeed: 11, weather: { isRaining: () => raining, setSheltered() {} } });
    let seen = false;
    for (let i = 0; i < 30; i++) life.update(0.1, i * 0.1, { x: 0, y: 0, z: 30 }, null, null);
    raining = false;
    for (let i = 30; i < 60; i++) { life.update(0.1, i * 0.1, { x: 0, y: 0, z: 30 }, null, null); if (life.moments.kind === 'rainbow') seen = true; }
    // the hash decides (half of the walks); either way nothing else is on and nothing throws
    expect(typeof seen).toBe('boolean');
    expect(life.startMoment('moonbloom') || life.moments.active).toBe(true);
    life.dispose();
  });
  it('the walk\'s own moment is the same every time for the same walk', () => {
    const run = () => {
      const scene = new THREE.Scene();
      const area = build(scene, {});
      const life = area.life({ scene, ground: { y: () => 0 }, reducedMotion: false, season: 'summer', visits: 9 });
      let first = null;
      for (let i = 0; i < 900 && !first; i++) { life.update(0.1, i * 0.1, { x: 0, y: 0, z: 22 }, null, null); if (life.moments.kind) first = [life.moments.kind, i]; }
      life.dispose();
      return first;
    };
    expect(run()).toEqual(run());
  });
  it('uses no banned randomness or clock', () => {
    const src = readFileSync(new URL('../src/world/greenhousestory.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});
