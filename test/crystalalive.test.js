// The Crystal Cave beauty round 3 (it reacts and lives): the cat's glow uniform, footstep sparkles, pool rings, creatures, meteor, reduced motion, tiers, the chime's echo and pitch.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();
const D = await import('../src/world/crystaldecor.js');
const { createCrystalDecor } = await import('../src/world/crystaldecorparts.js');
const { createCrystalAlive, ALIVE } = await import('../src/world/crystalalive.js');
const { humNote } = await import('../src/world/crystallife.js');
const S = await import('../src/world/crystalsound.js');
const W = await import('../src/world/crystalwingplan.js');

const make = (tier = null, reducedMotion = false) => {
  const scene = new THREE.Scene();
  const decor = createCrystalDecor({ scene, tier, reducedMotion });
  const alive = createCrystalAlive({ scene, decor, tier, reducedMotion });
  return { scene, decor, alive };
};
const walk = (alive, from, to, n = 30) => { for (let i = 0; i <= n; i++) { const k = i / n; alive.update(1 / 30, i / 30, { x: from[0] + (to[0] - from[0]) * k, y: 0, z: from[1] + (to[1] - from[1]) * k }, null); } };
const live = (alive) => { const p = alive.points.geometry.attributes.position; let c = 0; for (let i = 0; i < p.count; i++) if (p.getY(i) > -900) c++; return c; };

describe('mist and creatures plans', () => {
  it('are deterministic, in bounds and tied to the chambers', () => {
    expect(D.planMist()).toEqual(D.planMist());
    expect(D.planMist()).toHaveLength(6);
    expect(new Set(D.planCreatures(14).map((c) => c.hue))).toEqual(new Set(['rose', 'blue', 'gold', 'heart']));
    expect(Object.values(D.BEAUTY3_SALTS).every((s) => !Object.values(D.BEAUTY2_SALTS).includes(s))).toBe(true);
  });
  it('the blue zone colour is tamer than before', () => { expect(D.ZONE_RGB.blue[2]).toBeLessThan(1); });
});

describe('the cave reacts', () => {
  it('sets the cat glow uniform and eases it in', () => {
    const { decor, alive } = make();
    alive.update(1 / 30, 0, { x: 3, y: 0, z: 4 }, null);
    expect(decor.uniforms.cat.value.x).toBe(3); expect(decor.uniforms.cat.value.w).toBeGreaterThan(0); expect(decor.uniforms.cat.value.w).toBeLessThan(1);
    for (let i = 0; i < 200; i++) alive.update(1 / 30, i / 30, { x: 3, y: 0, z: 4 }, null);
    expect(decor.uniforms.cat.value.w).toBe(1);
    expect(decor.uniforms.catL.value.w).toBeLessThan(decor.uniforms.cat.value.w);
  });
  it('walking leaves footstep sparkles that fade; standing still leaves none', () => {
    const { alive } = make();
    alive.update(1 / 30, 0, { x: -10, y: 0, z: 10 }, null);
    for (let i = 1; i < 60; i++) alive.update(1 / 30, i / 30, { x: -10, y: 0, z: 10 }, null); // (the arrival sparks of the first step into the Rose Hall have faded by now)
    const still = live(alive);
    walk(alive, [-10, 10], [-4, 10], 40);
    expect(live(alive)).toBeGreaterThan(still);
    for (let i = 0; i < 120; i++) alive.update(1 / 30, 3 + i / 30, { x: -4, y: 0, z: 10 }, null);
    expect(live(alive)).toBe(still);
  });
  it('walking through the Blue Pool starts a ring', () => {
    const { decor, alive } = make();
    walk(alive, [W.POOL.x - 3, W.POOL.z], [W.POOL.x + 2, W.POOL.z], 40);
    expect(decor.uniforms.rip.value.some((v) => v.z > 0 && v.z < 1 && Math.hypot(v.x - W.POOL.x, v.y - W.POOL.z) < W.POOL.r + 1)).toBe(true);
  });
  it('reduced motion: no sparks, creatures, rings or meteor; the glow stays at full', () => {
    const { decor, alive } = make(null, true);
    walk(alive, [W.POOL.x - 3, W.POOL.z], [W.POOL.x + 2, W.POOL.z], 40);
    expect(alive.points.visible).toBe(false);
    expect(decor.uniforms.rip.value.every((v) => v.z >= 1)).toBe(true);
    expect(decor.uniforms.cat.value.w).toBe(1);
    expect(alive.counts.trail).toBe(0);
  });
  it('LOW and LITE draw fewer sparks and creatures and have no meteor', () => {
    const hi = make().alive.counts; const lo = make({ name: 'low', rung: 3, shadows: false }).alive.counts;
    expect(lo.sparks).toBeLessThan(hi.sparks); expect(lo.creatures).toBeLessThan(hi.creatures); expect(lo.trail).toBe(0); expect(hi.trail).toBeGreaterThan(0);
  });
  it('the shooting sparkle streaks for a moment, then is gone', () => {
    const { scene, alive } = make();
    const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 3, 10); cam.lookAt(0, 3, 0); cam.updateMatrixWorld();
    const m = scene.getObjectByName('crystal:meteor');
    alive.update(1 / 30, ALIVE.meteorAt + 0.7, { x: 0, y: 0, z: 10 }, cam);
    expect(m.visible).toBe(true);
    alive.update(1 / 30, ALIVE.meteorAt + 5, { x: 0, y: 0, z: 10 }, cam);
    expect(m.visible).toBe(false);
  });
  it('disposes everything it added', () => {
    const { scene, alive, decor } = make(); const before = scene.children.length;
    alive.dispose(); decor.dispose();
    expect(scene.children.length).toBeLessThan(before);
  });
});

describe('the chime', () => {
  const fakeCtx = (withDelay) => { const made = { osc: [], delay: 0 }; const node = () => ({ connect() {}, gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }); const ac = { currentTime: 0, destination: {}, createGain: node, createOscillator: () => { const o = { frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; made.osc.push(o); return o; } }; if (withDelay) ac.createDelay = () => { made.delay++; return { delayTime: { value: 0 }, connect() {} }; }; return { ac, made, audio: { getContext: () => ac, isMuted: () => false } }; };
  it('has an echo where there is a delay node, and still sings without one', () => {
    const a = fakeCtx(true); expect(humNote(a.audio, 0)).toBe(true); expect(a.made.delay).toBe(1);
    const b = fakeCtx(false); expect(humNote(b.audio, 0)).toBe(true); expect(b.made.delay).toBe(0);
  });
  it('is tuned by the crystal colour, and silent (no node) when muted', () => {
    const a = fakeCtx(true); humNote(a.audio, 1, S.HUE_PITCH.gold);
    const c = fakeCtx(true); humNote(c.audio, 1, 1);
    expect(a.made.osc[0].frequency.value).toBeGreaterThan(c.made.osc[0].frequency.value);
    const m = fakeCtx(true); expect(humNote({ ...m.audio, isMuted: () => true }, 0)).toBe(false); expect(m.made.osc).toHaveLength(0);
    expect(new Set(S.HERO_CHIMES.map((h) => h.ratio)).size).toBeGreaterThan(1);
  });
});
