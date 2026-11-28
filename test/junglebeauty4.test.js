// The Jungle lodge, beauty pass 4: stories in the details, the seasons and a rare surprise. Net zero triangles, no mesh, no caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const F = await import('../src/world/junglebeauty4.js');
const B = await import('../src/world/junglebeauty2.js');
const S = await import('../src/world/junglesparkle.js');
const P = await import('../src/world/jungleplan.js');
const R = await import('../src/world/junglereact.js');

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
const sum = (a) => a.reduce((m, v) => m + v, 0);

describe('the stories', () => {
  it('stand clear of the solid things and the river, and are pure', () => {
    const solid = P.jungleColliders();
    const spots = [...F.SIGNS.map((s) => [s.x, s.z]), ...F.STORY_SPOTS.prints];
    for (const [x, z] of spots) {
      expect(P.riverDist(x, z)).toBeGreaterThan(P.RIVER_W + 0.3);
      for (const o of solid) expect(Math.hypot(o.x - x, o.z - z)).toBeGreaterThan(o.r + 0.3);
    }
    expect(P.riverDist(...F.STORY_SPOTS.bank)).toBeGreaterThan(P.RIVER_W - 0.1); // the bank's own edge, not in the water
    expect(F.beauty4Parts().length).toBe(F.beauty4Parts().length);
    expect(F.beauty4Parts().length).toBeGreaterThan(60);
  });
  it('cost under 320 triangles; a trimmed solid keeps half its faces', () => {
    expect(F.beauty4Parts().reduce((n, [g]) => n + tris(g), 0)).toBeLessThan(320);
    expect(tris(F.topHalf(new THREE.OctahedronGeometry(1, 0)))).toBe(4);
  });
});

describe('the seasons', () => {
  it('reads wet from November to April and dry from May to October', () => {
    expect(F.seasonOf(new Date(2026, 10, 28))).toBe('wet'); expect(F.seasonOf(new Date(2026, 0, 5))).toBe('wet');
    expect(F.seasonOf(new Date(2026, 6, 4))).toBe('dry'); expect(F.seasonOf(new Date(2026, 4, 1))).toBe('dry');
  });
  it('wet is closer, mistier and brighter on the water; dry is far, golden and sparse', () => {
    const w = F.SEASON.wet; const d = F.SEASON.dry;
    expect(w.mist).toBeGreaterThan(d.mist); expect(w.glint).toBeGreaterThan(d.glint); expect(w.far).toBeLessThan(d.far); expect(d.gold).toBeGreaterThan(w.gold); expect(d.petals).toBeLessThan(w.petals);
  });
  it('sets the haze and the cloth tint at once, and puts the haze back on dispose', () => {
    const run = (season) => {
      const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x88aa88, 20, 100);
      const a = B.createJungleBeauty2({ scene, tier: { name: 'high' }, reducedMotion: false, season });
      const r = { far: scene.fog.far, tint: a.sway.material.color.b }; a.dispose(); return { ...r, back: scene.fog.far };
    };
    const w = run('wet'); const d = run('dry');
    expect(w.far).toBeLessThan(d.far); expect(w.tint).toBeGreaterThan(d.tint); expect(w.back).toBe(100); expect(d.back).toBe(100);
  });
});

describe('the rare surprise', () => {
  it('happens about half the slots and is pure', () => {
    let n = 0; let spiral = 0; let monkeys = 0; const slots = 200;
    for (let k = 0; k < slots; k++) { let hit = null; for (let t = k * 210; t < k * 210 + 210 && !hit; t += 1) hit = F.surpriseAt(t); if (hit) { n++; if (hit.kind === 'spiral') spiral++; else monkeys++; } }
    expect(n / slots).toBeGreaterThan(0.35); expect(n / slots).toBeLessThan(0.65); expect(spiral).toBeGreaterThan(20); expect(monkeys).toBeGreaterThan(20);
    expect(F.surpriseAt(1234.5)).toEqual(F.surpriseAt(1234.5));
  });
  it('opens the night-blooms for a minute at some dusks only', () => {
    let opened = 0;
    for (let n = 0; n < 60; n++) { let peak = 0; for (let t = n * R.DAY; t < (n + 1) * R.DAY; t += 2) peak = Math.max(peak, F.bloomAt(t)); if (peak === 1) opened++; }
    expect(opened / 60).toBeGreaterThan(0.3); expect(opened / 60).toBeLessThan(0.7);
    for (let n = 0; n < 10; n++) { let secs = 0; for (let t = n * R.DAY; t < (n + 1) * R.DAY; t += 1) if (F.bloomAt(t) > 0) secs++; expect(secs === 0 || (secs >= 58 && secs <= 61)).toBe(true); }
  });
  it('the night-blooms glow when asked for, and are dark otherwise', () => {
    const a = mk(); const col = a.motes.geometry.attributes.color.array;
    a.update(1 / 30, 100, { x: 0, z: 30 }, 0, null); const dark = sum(col);
    a.trigger('bloom', 100); a.update(1 / 30, 135, { x: 0, z: 30 }, 0, null); expect(sum(col)).toBeGreaterThan(dark + 3);
    a.update(1 / 30, 170, { x: 0, z: 30 }, 0, null); expect(sum(col)).toBeLessThan(dark + 1);
  });
  it('spirals the parrots in the sky when asked for (the same bird vertices), and never on LITE', () => {
    const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 300); cam.position.set(0, 3, 40); cam.lookAt(0, 3, 30); cam.updateMatrixWorld();
    const a = B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' } }); const n = a.counts.birds;
    const pos = a.sway.geometry.attributes.position.array; const o = pos.length - n * 45;
    a.update(1 / 30, 1, { x: 0, z: 36 }, 0, cam); expect(pos.slice(o).every((v) => v === 0)).toBe(true);
    a.trigger('spiral', 20); a.update(1 / 30, 26, { x: 0, z: 36 }, 0, cam);
    expect(pos.slice(o).some((v) => v !== 0)).toBe(true);
    for (let b = 0; b < n; b++) expect(pos[o + b * 45 + 1]).toBeGreaterThan(P.jungleY(0, 30) + 2);
    expect(mk({ tier: { name: 'low', shadows: false, rung: 5 } }).counts.birds).toBe(0);
  });
  it('lays a spiral round a centre, rising and widening', () => {
    const p0 = F.spiralAt(0, 8, 0, 0, 0, 5); const p1 = F.spiralAt(0, 8, 10, 0, 0, 5);
    expect(p1.y).toBeGreaterThan(p0.y + 2.5); expect(Math.hypot(p1.x, p1.z)).toBeGreaterThan(Math.hypot(p0.x, p0.z));
  });
  it('the monkeys call back and forth (the walk\'s own audio notes) only while they are on', () => {
    let notes = 0; const audio = { isMuted: () => false, getContext: () => { notes++; return null; }, getMaster: () => null };
    const a = mk({ audio }); a.trigger('monkeys', 50);
    for (let t = 50; t < 61; t += 0.1) a.update(0.1, t, { x: 0, z: 30 }, 0, null);
    const during = notes; expect(during).toBeGreaterThan(8);
    notes = 0; for (let t = 100; t < 111; t += 0.1) a.update(0.1, t, { x: 0, z: 30 }, 0, null); expect(notes).toBeLessThan(during);
  });
});

describe('the cost', () => {
  it('adds no mesh to the life', () => {
    const scene = new THREE.Scene(); B.createJungleBeauty2({ scene, tier: { name: 'high' } }); expect(scene.children.filter((c) => c.isMesh)).toHaveLength(2); // sway and shafts
  });
  it('the night-blooms ride on pass 1\'s clusters, fewer on the lower rungs', () => {
    const an = S.sparklePlan().anchors; expect(F.bloomSpots(an, 14)).toHaveLength(14); expect(F.bloomSpots(an, 3)).toHaveLength(3);
  });
});
