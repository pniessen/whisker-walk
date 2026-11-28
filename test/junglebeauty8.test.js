// The Jungle lodge, beauty pass 8: the jungle answers her voice and moves. Net zero triangles, no mesh, no caster, no gameplay.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const R = await import('../src/world/junglebeauty8.js');
const B = await import('../src/world/junglebeauty2.js');
const { bus } = await import('../src/events.js');
const V7 = await import('../src/world/junglebeauty7.js');

const mkRx = (o = {}) => { const said = []; const rx = R.createReactions({ rung: 'high', voice: { call: (k) => said.push(['call', k]), croak: (k) => said.push(['croak', k]), chime: (k) => said.push(['chime', k]) }, targets: [{ x: 4, z: -6, y: 0.3 }, { x: 0, z: 9, y: 0.3 }], ...o }); return { rx, said }; };
const cat = { x: 0, y: 0, z: 0 }; const fwd = { x: 0, z: -1 };
const live = (rx, t) => { const o = {}; let n = 0; for (let i = 0; i < rx.ps.length; i++) { rx.at(i, t, o); if (o.g > 0) n++; } return n; };
const quiet = () => ({ pounceTime: 0, sniffTime: 0, idleTime: 0, wasZooming: false, perched: null });

describe('the pool', () => {
  it('has fewer points on the lower rungs and none to begin with', () => {
    expect(R.rxPoints('lite').length).toBeLessThan(R.rxPoints('low').length); expect(R.rxPoints('low').length).toBeLessThan(R.rxPoints('high').length);
    const { rx } = mkRx(); expect(live(rx, 5)).toBe(0);
  });
});

describe('the meow', () => {
  it('sets birds, fireflies and a frogs glow going, and a call, croaks and an echo follow on the walk audio', () => {
    const { rx, said } = mkRx(); rx.step(1 / 30, 10, cat, quiet(), 0, fwd); rx.meow(); rx.step(1 / 30, 10, cat, quiet(), 0, fwd);
    expect(live(rx, 11.5)).toBeGreaterThan(8);
    for (let t = 10; t < 14; t += 1 / 30) rx.step(1 / 30, t, cat, quiet(), 0, fwd);
    expect(said.filter((s) => s[0] === 'call').length).toBe(2); expect(said.filter((s) => s[0] === 'croak').length).toBe(3);
  });
  it('waits 1.5 s before it answers again, and the sloth is told to listen', () => {
    const sloth = { hear: -1 }; const { rx } = mkRx({ sloth });
    rx.meow(); rx.step(1 / 30, 10, cat, quiet(), 0, fwd); expect(sloth.hear).toBeGreaterThan(10);
    rx.meow(); rx.step(1 / 30, 10.5, cat, quiet(), 0, fwd); expect(rx.state.counts.meow).toBe(1);
    rx.meow(); rx.step(1 / 30, 11.6, cat, quiet(), 0, fwd); expect(rx.state.counts.meow).toBe(2);
  });
  it('is only the sounds under reduced motion', () => {
    const { rx, said } = mkRx({ motion: false }); rx.meow(); for (let t = 10; t < 13; t += 1 / 30) rx.step(1 / 30, t, cat, quiet(), 0, fwd);
    expect(live(rx, 11.5)).toBe(0); expect(said.length).toBeGreaterThan(3);
  });
  it('survives a walk with no audio at all', () => {
    const rx = R.createReactions({ rung: 'low', voice: null }); rx.meow(); expect(() => { for (let t = 10; t < 13; t += 1 / 30) rx.step(1 / 30, t, cat, quiet(), 0, fwd); }).not.toThrow();
  });
});

describe('pounce, land, sniff, sit, zoom', () => {
  it('a landing throws leaves and shakes petals, and splashes only in the wet', () => {
    const a = mkRx().rx; a.land(); a.step(1 / 30, 10, cat, quiet(), 0, fwd); const dry = live(a, 10.4);
    const b = mkRx().rx; b.land(); b.step(1 / 30, 10, cat, quiet(), 1, fwd); expect(live(b, 10.4)).toBeGreaterThan(dry); expect(dry).toBeGreaterThan(5);
  });
  it('a pounce kicks up a little litter once, then waits', () => {
    const { rx } = mkRx(); const s = quiet(); s.pounceTime = 0.5; rx.step(1 / 30, 10, cat, s, 0, fwd); expect(rx.state.counts.pounce).toBe(1); s.pounceTime = 0.4; rx.step(1 / 30, 10.03, cat, s, 0, fwd); expect(rx.state.counts.pounce).toBe(1);
  });
  it('a sniff sends sparkles to the nearest target in front of her, with a chime', () => {
    const { rx, said } = mkRx(); const s = quiet(); s.sniffTime = 1; rx.step(1 / 30, 10, cat, s, 0, fwd);
    expect(said.length).toBe(0); rx.step(1 / 30, 10.4, cat, s, 0, fwd); expect(said[0][0]).toBe('chime');
    const o = {}; let near = false; for (let i = 0; i < rx.ps.length; i++) { rx.at(i, 10 + 2.2 + 0.7, o); if (o.g > 0 && Math.hypot(o.x - 4, o.z + 6) < 2.5) near = true; } expect(near).toBe(true); // the target at (4, -6), not (0, 9) behind her
  });
  it('a still stand brings butterflies and dragonflies once, and again only after she has moved', () => {
    const { rx } = mkRx(); const s = quiet(); s.idleTime = 2.5; rx.step(1 / 30, 10, cat, s, 0, fwd); expect(rx.state.counts.sit).toBe(1);
    rx.step(1 / 30, 14, cat, s, 0, fwd); expect(rx.state.counts.sit).toBe(1); expect(live(rx, 13)).toBeGreaterThan(3);
    s.idleTime = 0.2; rx.step(1 / 30, 15, cat, s, 0, fwd); s.idleTime = 2.6; rx.step(1 / 30, 16, cat, s, 0, fwd); expect(rx.state.counts.sit).toBe(2);
    const p = mkRx().rx; const s2 = quiet(); s2.idleTime = 3; s2.perched = {}; p.step(1 / 30, 10, cat, s2, 0, fwd); expect(p.state.counts.sit).toBe(0); // not on a perch
  });
  it('zoomies leave a wake of leaves and fireflies while they last, and stop with them', () => {
    const { rx } = mkRx(); const s = quiet(); s.wasZooming = true; for (let t = 10; t < 11; t += 1 / 30) rx.step(1 / 30, t, cat, s, 0, fwd);
    expect(live(rx, 11)).toBeGreaterThan(5); s.wasZooming = false; for (let t = 11; t < 13; t += 1 / 30) rx.step(1 / 30, t, cat, s, 0, fwd); expect(live(rx, 13.1)).toBe(0);
  });
  it('lite keeps fewer and has no dragonflies', () => {
    const hi = mkRx().rx; const li = mkRx({ rung: 'lite' }).rx; const s = quiet(); s.idleTime = 3;
    hi.step(1 / 30, 10, cat, s, 0, fwd); li.step(1 / 30, 10, cat, s, 0, fwd); expect(live(li, 12)).toBeLessThan(live(hi, 12));
  });
});

describe('no big lime leaf at a vista', () => {
  it('knows the lens and the stand of a vista', () => {
    const V = V7.VISTAS[4]; expect(R.inCamZone(V.x, V.z, V)).toBe(true); expect(R.inCamZone(5.6, 28.8, V)).toBe(true); expect(R.inCamZone(-30, -30, V)).toBe(false);
    const plan = B.beauty2Plan(); const lime = plan.leaves.filter((l) => (l.tone === 0 || l.tone === 3) && V7.VISTAS.some((q) => R.inCamZone(l.x, l.z, q)));
    expect(lime.length).toBe(0);
  });
});

describe('in the place', () => {
  it('adds points only: the same cloth, no new mesh, and the walk bus sets it off (the sounds only on a muted walk)', () => {
    const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
    const a = mk(); const bare = mk(); expect(a.counts.swayTriangles).toBe(bare.counts.swayTriangles);
    const kids = a.motes.parent.children.length;
    const c = new THREE.Vector3(0, 0, 31.5); const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 3, 36); cam.lookAt(0, 1, 26); cam.updateMatrixWorld();
    for (let i = 0; i < 30; i++) a.update(1 / 30, 100 + i / 30, c, 0, cam, quiet());
    bus.emit('tip:did', { id: 'call' }); bus.emit('pounce:land', { water: false });
    for (let i = 0; i < 30; i++) a.update(1 / 30, 105 + i / 30, c, 0, cam, quiet());
    expect(a.motes.parent.children.length).toBe(kids);
    a.dispose(); bus.emit('tip:did', { id: 'call' }); expect(() => a.update(1 / 30, 120, c, 0, cam, quiet())).not.toThrow();
  });
});
