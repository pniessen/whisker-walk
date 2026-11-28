import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { canvasStub } from './helpers/growriver.js';

vi.stubGlobal('document', canvasStub);

const A = await import('../src/world/housealive.js');
const G = await import('../src/world/houseglow.js');
const Snd = await import('../src/world/housesound.js');
const { HOUSE_LAMPS } = await import('../src/world/houseplan.js');

// The Old House beauty pass 5 (2026-11-28): the creatures (one pooled Points), the one rhythm and draught, the sound beds and the arrival.
const day = { day: 1, lamp: 0, fire: 0.8 };
const night = { day: 0, lamp: 1, fire: 1.1 };
const make = (o = {}) => { const scene = new THREE.Scene(); const c = A.createHouseCreatures({ scene, lamps: HOUSE_LAMPS, rhythm: day, ...o }); return { scene, c }; };
const full = new Set(['ground', 'upstairs', 'attic']);
const cat = { x: 6, y: 0, z: 0.9 };
const shown = (c) => { const p = c.points.geometry.attributes.position.array; let n = 0; for (let i = 1; i < p.length; i += 3) if (p[i] > -100) n++; return n; };

describe('the house\'s one rhythm and draught', () => {
  it('derives day, lamp and fire from the day part', () => {
    const noon = G.rhythm(G.dayPart(12)), late = G.rhythm(G.dayPart(23));
    expect(noon.day).toBe(1); expect(noon.lamp).toBe(0);
    expect(late.day).toBe(0); expect(late.lamp).toBe(1);
    expect(late.fire).toBeGreaterThan(noon.fire);
  });
  it('gusts on one clock between 0.2 and 1', () => {
    for (let t = 0; t < 60; t += 0.7) { expect(G.gustAt(t)).toBeGreaterThanOrEqual(0.2 - 1e-9); expect(G.gustAt(t)).toBeLessThanOrEqual(1 + 1e-9); }
  });
  it('warms only the hall lamp and follows the hearth\'s strength in the shader uniforms', () => {
    const g = G.createHouseGlow({ lamps: HOUSE_LAMPS, rooms: [{ id: 'hall', level: 'ground' }], levels: [{ id: 'ground', y: 0 }] });
    g.update(1, { x: G.HALL_LAMP.x, y: 0, z: G.HALL_LAMP.z }, { warm: 0.3, fireK: 1.1 });
    expect(g.uniforms.uFire.value.w).toBeCloseTo(1.1);
    const hall = g.uniforms.uLamp.value.find((v) => v.w > 0);
    expect(hall.w).toBeLessThan(0.4);
  });
});

describe('the creatures', () => {
  it('adds one Points, no mesh, and draws only the levels drawn', () => {
    const { scene, c } = make();
    expect(scene.children.filter((o) => o.isMesh)).toHaveLength(0);
    expect(scene.children.filter((o) => o.isPoints)).toHaveLength(1);
    c.update(1 / 30, cat, new Set(['ground']));
    const g = shown(c);
    c.update(1 / 30, cat, new Set());
    expect(shown(c)).toBe(0);
    expect(g).toBeGreaterThan(5);
  });
  it('lets dust bunnies scoot from a dashing cat and drift home again', () => {
    const b = { x: 1, z: 1, hx: 1, hz: 1, vx: 0, vz: 0, rest: 0, roll: 0, r: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } };
    A.bunnyStep(b, 0.05, 0, 0, true);
    expect(b.vx).toBeGreaterThan(0); expect(b.vz).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) A.bunnyStep(b, 0.05, 9, 9, false);
    const far = Math.hypot(b.x - 1, b.z - 1);
    for (let i = 0; i < 600; i++) A.bunnyStep(b, 0.05, 9, 9, false);
    expect(far).toBeGreaterThan(0.3);
    expect(Math.hypot(b.x - 1, b.z - 1)).toBeLessThan(far);
  });
  it('runs the mouse from its hole to under the dresser', () => {
    const a = A.mousePos(0), z = A.mousePos(1);
    expect(a.x).toBeLessThan(5); expect(z.z).toBeLessThan(-3);
  });
  it('holds every creature still under reduced motion, and LITE has fewer points', () => {
    const r1 = make({ reducedMotion: true }), r2 = make({ reducedMotion: true });
    r1.c.update(1 / 30, cat, full); r2.c.update(1 / 30, cat, full);
    const a = [...r1.c.points.geometry.attributes.position.array];
    for (let i = 0; i < 90; i++) r1.c.update(1 / 30, cat, full);
    expect([...r1.c.points.geometry.attributes.position.array]).toEqual(a);
    expect(make({ low: true }).c.count).toBeLessThan(make().c.count);
  });
  it('brings the moths out when the lamps come on, and the robin only by day', () => {
    const d = make(), n = make({ rhythm: night });
    d.c.update(1 / 30, cat, full); n.c.update(1 / 30, cat, full);
    expect(shown(n.c)).toBeGreaterThan(shown(d.c) - 3); // the night shows its moths while the robin and bluebird are put away
    expect(shown(n.c)).not.toBe(shown(d.c));
  });
});

describe('the sound beds and the arrival', () => {
  const audioStub = () => { const calls = []; return { calls, tick: (v) => calls.push(['tick', v]), creak: (v) => calls.push(['creak', v]), peep: (v) => calls.push(['peep', v]), chime: () => calls.push(['chime']), playTune: () => calls.push(['tune']) }; };
  const stairs = [{ width: 1, x0: 0, z0: 0, x1: 0, z1: 1 }];
  it('weighs a bed smoothly from its heart to its edge, on its own floor only', () => {
    const k = Snd.BEDS[0];
    expect(Snd.bedWeight(k, k.x, 0, k.z)).toBe(1);
    expect(Snd.bedWeight(k, k.x + k.r, 0, k.z)).toBe(0);
    expect(Snd.bedWeight(k, k.x + k.r / 2, 0, k.z)).toBeCloseTo(0.5);
    expect(Snd.bedWeight(k, k.x, 4.2, k.z)).toBe(0);
  });
  it('cross-fades the kitchen out as the garden comes in', () => {
    const a = audioStub();
    const s = Snd.createHouseSound(a, { clock: null, stairs, attic: null, rhythm: day, gust: () => 0.5 });
    for (let i = 0; i < 120; i++) s.update(1 / 30, i / 30, { x: 9, y: 0, z: -3 });
    expect(a.calls.filter((c) => c[0] === 'tick').length).toBeGreaterThan(2);
    const b = audioStub();
    const s2 = Snd.createHouseSound(b, { clock: null, stairs, attic: null, rhythm: day, gust: () => 0.5 });
    for (let i = 0; i < 300; i++) s2.update(1 / 30, i / 30, { x: 0, y: 0, z: 11 });
    expect(b.calls.some((c) => c[0] === 'peep')).toBe(true);
    expect(b.calls.some((c) => c[0] === 'tick')).toBe(false);
  });
  it('creaks the door, then chimes the clock twice, as she comes in', () => {
    const a = audioStub();
    const s = Snd.createHouseSound(a, { clock: null, stairs, attic: null });
    s.arrive();
    for (let i = 0; i < 90; i++) s.update(1 / 30, i / 30, { x: 0, y: 0, z: 9.5 });
    expect(a.calls.filter((c) => c[0] === 'creak')).toHaveLength(1);
    expect(a.calls.filter((c) => c[0] === 'chime')).toHaveLength(2);
  });
  it('creaks again when the door swings', () => {
    const a = audioStub();
    const s = Snd.createHouseSound(a, { clock: null, stairs, attic: null });
    s.update(1 / 30, 0, { x: 0, y: 0, z: 9.5 }, false, true);
    s.update(1 / 30, 0.03, { x: 0, y: 0, z: 9.5 }, false, false);
    expect(a.calls.filter((c) => c[0] === 'creak')).toHaveLength(1);
  });
});
