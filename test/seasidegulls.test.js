// The Seaside's gulls (src/world/seasidegulls.js): one draw call, poses that are a pure
// function of time, the one that hops off and never chases, reduced motion, the rungs.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const { createSeasideGulls, NO_GULLS, FLY_SECONDS, HOP_REST } = await import('../src/world/seasidegulls.js');
const plan = await import('../src/world/seasideplan.js');

const posOf = (g, i) => { const a = g.mesh.geometry.attributes.position; const per = a.count / g.gulls.length; return [i * per, per, a]; };
const centre = (g, i) => { const [o, per, a] = posOf(g, i); const c = new THREE.Vector3(); for (let v = 0; v < per; v++) c.add(new THREE.Vector3(a.getX(o + v), a.getY(o + v), a.getZ(o + v))); return c.divideScalar(per); };
const stateOf = (g, id) => g.gulls.find((s) => s.g.id === id);

describe('seaside gulls', () => {
  it('is one mesh, one draw call, out of the shadow pass', () => {
    const g = createSeasideGulls();
    expect(g.mesh.isMesh).toBe(true);
    expect(g.mesh.userData.noCast).toBe(true);
    expect(g.mesh.material.vertexColors).toBe(true);
    expect(g.gulls).toHaveLength(plan.SEASIDE_GULLS.length);
    expect(g.mesh.geometry.attributes.position.count / g.gulls.length).toBeLessThan(900);
    g.dispose();
  });

  it('has the gull\'s colours: white body, grey wings with black tips, yellow beak, red spot, orange legs', () => {
    const g = createSeasideGulls();
    const col = g.mesh.geometry.attributes.color;
    const has = (hex) => { const c = new THREE.Color(hex); for (let i = 0; i < col.count; i++) if (Math.abs(col.getX(i) - c.r) < 1e-3 && Math.abs(col.getY(i) - c.g) < 1e-3 && Math.abs(col.getZ(i) - c.b) < 1e-3) return true; return false; };
    for (const hex of [0xf6f4ef, 0xa9b0b9, 0x22252a, 0xf2b522, 0xd9322b, 0xf08a24]) expect(has(hex), hex.toString(16)).toBe(true);
    g.dispose();
  });

  it('thins out by rung', () => {
    const n = (rung) => { const g = createSeasideGulls({ rung }); const k = g.gulls.length; g.dispose(); return k; };
    expect(n(3)).toBeLessThan(n(0));
    expect(n(5)).toBeLessThan(n(3));
    expect(n(5)).toBeGreaterThanOrEqual(2);
  });

  it('is a pure function of time: the same t gives the same flock, whatever came between', () => {
    const a = createSeasideGulls(); const b = createSeasideGulls();
    a.update(0.016, 3.3, { x: -30, z: 0 });
    b.update(0.016, 9, { x: -30, z: 0 }); b.update(0.016, 3.3, { x: -30, z: 0 });
    expect(Array.from(a.mesh.geometry.attributes.position.array)).toEqual(Array.from(b.mesh.geometry.attributes.position.array));
    a.dispose(); b.dispose();
  });

  it('keeps every vertex finite and on the plan: post gulls on their posts, standing gulls on the sand', () => {
    const g = createSeasideGulls();
    for (const t of [0, 1.7, 5.2, 11.9, 30]) {
      g.update(0.016, t, { x: -30, z: 0 });
      const a = g.mesh.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i++) expect(Number.isFinite(a[i])).toBe(true);
    }
    g.update(0.016, 4, { x: -30, z: 0 });
    for (const [i, s] of g.gulls.entries()) {
      if (s.g.mode !== 'post') continue;
      const p = plan.SEASIDE_POSTS[s.g.post]; const c = centre(g, i);
      expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeLessThan(0.4);
      expect(c.y).toBeGreaterThan(plan.POST_TOP);
    }
    g.dispose();
  });

  it('hops off when her cat comes near, to the spot farther from her, and never toward her', () => {
    const g = createSeasideGulls();
    const s = stateOf(g, 'hop');
    const home = s.g.home; const away = s.g.away;
    const at0 = centre(g, g.gulls.indexOf(s));
    // she is far: it stays
    for (let t = 0; t < 3; t += 0.1) g.update(0.1, t, { x: -30, z: 0 });
    expect(s.fly).toBe(-1);
    // she comes in from the east, 2 m from it: it flies west to the away spot
    const cat = { x: home.x + 2, z: home.z };
    g.update(0.1, 3.1, cat);
    expect(s.fly).toBeGreaterThanOrEqual(0);
    let closest = Infinity;
    for (let k = 0; k < 40; k++) { g.update(0.1, 3.2 + k * 0.1, cat); closest = Math.min(closest, Math.hypot(s.x - cat.x, s.z - cat.z)); }
    expect(s.fly).toBe(-1);
    expect(s.at).toBe('away');
    expect(Math.hypot(s.x - away.x, s.z - away.z)).toBeLessThan(0.01);
    expect(closest).toBeGreaterThan(1.5); // it never came nearer to her than it began
    void at0;
    // she follows to the away spot, it rests first, then goes back home: still away from her
    const cat2 = { x: away.x - 2, z: away.z };
    for (let k = 0; k < 20; k++) g.update(0.1, 8 + k * 0.1, cat2);
    expect(s.fly).toBe(-1);
    for (let k = 0; k < 60; k++) g.update(0.1, 10 + k * 0.1, cat2);
    expect(s.at).toBe('home');
    expect(HOP_REST).toBeGreaterThan(0); expect(FLY_SECONDS).toBeGreaterThan(1);
    g.dispose();
  });

  it('does not fly when the other spot is no farther from her (it never goes toward her)', () => {
    const g = createSeasideGulls();
    const s = stateOf(g, 'hop');
    // she stands between the spots, on the home side: the away spot is not farther
    const cat = { x: s.g.home.x - 1.5, z: s.g.home.z };
    for (let k = 0; k < 30; k++) g.update(0.1, k * 0.1, cat);
    expect(s.fly).toBe(-1);
    expect(s.at).toBe('home');
    g.dispose();
  });

  it('is frozen under reduced motion: no gliders drawn, nothing moves, the hopper stays', () => {
    const g = createSeasideGulls({ reducedMotion: true });
    expect(g.gulls.some((s) => s.g.mode === 'glide')).toBe(false);
    const before = Array.from(g.mesh.geometry.attributes.position.array);
    g.update(0.016, 7, { x: 15, z: 30.5 });
    g.update(0.016, 12, { x: 15, z: 30.5 });
    expect(Array.from(g.mesh.geometry.attributes.position.array)).toEqual(before);
    g.dispose();
  });

  it('draws nothing from Math.random', () => {
    const real = Math.random; let draws = 0;
    Math.random = () => { draws++; return real(); };
    try { const g = createSeasideGulls(); g.update(0.016, 2, { x: 0, z: 0 }); g.dispose(); } finally { Math.random = real; }
    expect(draws).toBe(0);
  });

  it('is nothing when the rung leaves nothing and it is all gliders under reduced motion', () => {
    expect(NO_GULLS.mesh).toBe(null);
  });
});
