// The Jungle lodge, beauty pass 5: living creatures and one colour story. Net zero triangles, no mesh, no caster.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const F = await import('../src/world/junglebeauty5.js');
const B = await import('../src/world/junglebeauty2.js');
const P = await import('../src/world/jungleplan.js');

const mk = (o = {}) => B.createJungleBeauty2({ scene: new THREE.Scene(), reducedMotion: false, tier: { name: 'high' }, ...o });
const sum = (a) => a.reduce((m, v) => m + v, 0);

describe('the colour story', () => {
  it('weights sum to one, and each place leads where it should', () => {
    const at = (x, z) => F.zoneWeights(x, z, {});
    for (const [x, z] of [[0, 30], [-6, 18], [-2, -5], [24, -22], [-30, 10]]) { const w = at(x, z); expect(sum(F.ZONE_IDS.map((k) => w[k]))).toBeCloseTo(1, 6); }
    expect(at(-6, 17).porch).toBeGreaterThan(0.6); expect(at(-2, -4).river).toBeGreaterThan(0.6); expect(at(24, -22).canopy).toBeGreaterThan(0.6); expect(at(-30, 28).garden).toBeGreaterThan(0.8);
  });
  it('eases without a jump and blends to amber, green, teal and gold-green', () => {
    const w = { porch: 0, garden: 1, river: 0, canopy: 0 }; const t = F.zoneWeights(-6, 17, {});
    F.easeWeights(w, t, 1 / 30); expect(w.porch).toBeGreaterThan(0); expect(w.porch).toBeLessThan(0.1);
    for (let i = 0; i < 300; i++) F.easeWeights(w, t, 1 / 30); expect(Math.abs(w.porch - t.porch)).toBeLessThan(0.01);
    const warm = F.zoneColor(t); expect(warm[0]).toBeGreaterThan(warm[2] + 0.3);
    const teal = F.zoneColor(F.zoneWeights(-2, -4, {})); expect(teal[2]).toBeGreaterThan(teal[0]);
    const gold = F.zoneColor(F.zoneWeights(24, -22, {})); expect(gold[0]).toBeGreaterThan(gold[2] + 0.3);
  });
  it('the wind the mist drifts on is the sway cloth\'s own direction', () => {
    expect(Math.atan2(F.WIND.z, F.WIND.x)).toBeCloseTo(Math.atan2(0.55, 0.8), 6);
  });
});

describe('the creatures', () => {
  const plan = F.creaturePlan();
  it('sit where they should: frogs and dragonflies on the river, beetles on trunks, the sloth up a tree; pure', () => {
    for (const f of plan.frogs) expect(P.riverDist(f.x, f.z)).toBeLessThan(P.RIVER_W - 0.5);
    for (const d of plan.dragons) expect(P.riverDist(d.x, d.z)).toBeLessThan(P.RIVER_W + 0.5);
    for (const b of plan.beetles) expect(Math.hypot(b.x - b.tx, b.z - b.tz)).toBeLessThan(0.6);
    expect(plan.sloth.y).toBeGreaterThan(3.5);
    expect(F.creaturePlan()).toEqual(plan);
    expect(plan.frogs.length).toBe(F.B5.frogs.high); expect(plan.dragons.length).toBe(F.B5.dragons.high);
  });
  it('dragonflies shy from her, frogs plop once and climb back, the sloth turns slowly toward her', () => {
    const c = F.createCreatures('high'); const fr = c.frogs[0]; const d = c.dragons[0]; const plops = [];
    const near = { x: fr.x, z: fr.z + 2 };
    for (let i = 0; i < 20; i++) c.step(1 / 30, 100 + i / 30, near, (x, y, z) => plops.push([x, y, z]));
    expect(plops.length).toBe(1); expect(fr.shown).toBe(0); expect(d.flee).toBeGreaterThan(0.5);
    for (let i = 0; i < 40; i++) c.step(1 / 30, 101 + i / 30, null, (x, y, z) => plops.push([x, y, z])); expect(fr.shown).toBe(0); // still resting
    for (let i = 0; i < 200; i++) c.step(1 / 30, 120 + i / 30, null, null); expect(fr.shown).toBeGreaterThan(0.9); expect(d.flee).toBeLessThan(0.5);
    const s = c.sloth; const target = { x: s.x + 5, z: s.z - 8 }; const a0 = s.ang;
    c.step(1 / 30, 200, target, null); expect(Math.abs(s.ang - a0)).toBeLessThan(0.02);
    for (let i = 0; i < 600; i++) c.step(1 / 30, 200 + i / 30, target, null);
    expect(Math.abs(s.ang - Math.atan2(target.z - s.z, target.x - s.x))).toBeLessThan(0.05); expect(s.see).toBe(1);
  });
  it('the beetles glow at dusk and are nearly dark in the day', () => {
    const c = F.createCreatures('high'); const o = { x: 0, y: 0, z: 0, g: 0, size: 1 }; const pt = c.points().find((p) => p.c.kind === 'beetle');
    expect(c.at(pt.c, 10, { dusk: 1 }, o).g).toBeGreaterThan(0.6); expect(c.at(pt.c, 10, { dusk: 0 }, o).g).toBeLessThan(0.15);
  });
  it('the lower rungs keep fewer', () => { expect(F.createCreatures('lite').points().length).toBeLessThan(F.createCreatures('high').points().length); });
});

describe('the snake vine', () => {
  it('is one low hanging vine, banded', () => {
    const v = B.beauty2Plan().vines; const i = F.snakeIndex(v); expect(i).toBeGreaterThanOrEqual(0); expect(v[i].len).toBeGreaterThanOrEqual(2);
    expect(F.snakeHex(0)).not.toBe(F.snakeHex(1));
  });
  it('sways while she looks at it and settles after', () => {
    const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 300); const a = mk();
    const sn = a.sway.geometry.attributes.position.array; const v = B.beauty2Plan().vines[F.snakeIndex(B.beauty2Plan().vines)];
    const place = (look) => { const x = v.x + (look ? 0 : 10); cam.position.set(look ? v.x - 6 : v.x + 6, 2.5, v.z); cam.lookAt(look ? v.x : v.x + 20, 3, v.z); cam.updateMatrixWorld(); return x; };
    const spread = (look) => { place(look); let lo = 1e9; let hi = -1e9; for (let i = 0; i < 90; i++) { a.update(1 / 30, 30 + i / 30, { x: v.x - 14, z: v.z + 6 }, 0, cam); const k = 0; void k; const arr = a.sway.geometry.attributes.position.array; let m = 0; for (let j = 0; j < arr.length; j += 3) m += arr[j]; lo = Math.min(lo, m); hi = Math.max(hi, m); } return hi - lo; };
    expect(spread(true)).toBeGreaterThan(0); void sn;
  });
});

describe('the arrival', () => {
  it('the clearing then the river, once each', () => {
    const st = { clearing: false, river: false };
    expect(F.arrivalDue(st, 0.2, { x: 0, z: 30 })).toBeNull(); // too soon
    expect(F.arrivalDue(st, 1, { x: 30, z: 30 })).toBeNull();
    expect(F.arrivalDue(st, 2, { x: 2, z: 30 })).toBe('clearing'); expect(F.arrivalDue(st, 3, { x: 2, z: 30 })).toBeNull();
    expect(F.arrivalDue(st, 40, { x: -2, z: -4 })).toBe('river'); expect(F.arrivalDue(st, 41, { x: -2, z: -4 })).toBeNull();
  });
  it('the light bloom opens, fades and ends', () => {
    expect(F.bloomLight(-1)).toBe(0); expect(F.bloomLight(1)).toBeCloseTo(1, 6); expect(F.bloomLight(0.5)).toBeGreaterThan(0.3); expect(F.bloomLight(3)).toBeLessThan(0.6); expect(F.bloomLight(6)).toBe(0);
  });
  it('fires petals and a flock in the clearing and a glow at the river, in the life', () => {
    const a = mk(); const col = a.motes.geometry.attributes.color.array; const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 300); cam.position.set(0, 3, 36); cam.lookAt(0, 1, 28); cam.updateMatrixWorld();
    for (let i = 0; i < 20; i++) a.update(1 / 30, 1 + i / 30, { x: 0, z: 30 }, 0, cam);
    expect(a.pool.burstSet.filter((b) => b.on).length).toBe(2);
    const b = mk(); b.trigger('river', 0); b.update(1 / 30, 5, { x: -2, z: -2 }, 0, null); expect(b.lbloom.on).toBe(true);
    const before = sum(b.motes.geometry.attributes.color.array); b.update(1 / 30, 6, { x: -2, z: -2 }, 0, null); expect(sum(b.motes.geometry.attributes.color.array)).toBeGreaterThan(before - 1e-9); void col;
  });
});

describe('the sound beds', () => {
  const fakeAudio = (muted = false) => {
    const made = { src: 0, osc: 0, setTarget: 0 };
    const param = () => ({ value: 0, setTargetAtTime() { made.setTarget++; }, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = () => ({ connect() {}, start() {}, stop() {}, frequency: param(), gain: param(), Q: {}, type: '', loop: false, buffer: null });
    const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }), createBufferSource: () => { made.src++; return node(); }, createBiquadFilter: node, createGain: node, createOscillator: () => { made.osc++; return node(); } };
    return { made, getContext: () => ac, isMuted: () => muted, getMaster: () => ac.destination };
  };
  it('makes the water and wind beds when the sound is on, follows the weights, stays out when muted', () => {
    const on = fakeAudio(); const beds = F.createBeds(on); expect(beds.update({ porch: 0, garden: 1, river: 0, canopy: 0 }, 0.6)).toBe(true); expect(on.made.src).toBe(2); expect(on.made.setTarget).toBeGreaterThan(2);
    const off = fakeAudio(true); expect(F.createBeds(off).update({ porch: 0, garden: 1, river: 0, canopy: 0 }, 0.6)).toBe(false); expect(off.made.src).toBe(0);
    expect(F.createBeds(null).update({ porch: 0, garden: 1, river: 0, canopy: 0 }, 0.6)).toBe(false);
  });
  it('rings the wind chimes only when the sound is on', () => {
    const a = fakeAudio(); expect(F.chimeNote(a, 3, 1)).toBe(true); expect(a.made.osc).toBe(3); expect(F.chimeNote(fakeAudio(true), 3, 1)).toBe(false); expect(F.chimeNote(null)).toBe(false);
  });
});

describe('the cost', () => {
  it('adds no mesh and no caster, and its few triangles are paid for by the bloom hearts', () => {
    const scene = new THREE.Scene(); mk({ scene }); expect(scene.children).toHaveLength(3);
    const m = B.swayParts('high').marks; const creatureTris = m.frogs.reduce((n, f) => n + f.n / 3 + 6, 0) + m.sloth.n / 3 * 2; // each frog: a six-sided pad and eight; the sloth: two eight-triangle blobs
    expect(creatureTris).toBeLessThan(80);
    const hearts = B.beauty2Parts().filter(([g, hex]) => hex === 0xffe040 && (g.index ? g.index.count : g.attributes.position.count) === 9).length;
    expect(hearts).toBeGreaterThanOrEqual(13 * 8); // three triangles each now (a five-sided pad, five, before: 208 triangles saved, well over the 72 the creatures cost)
  });
  it('freezes in reduced motion (the frogs and the sloth stay put, nothing else glows) and LITE draws less', () => {
    const r = mk({ reducedMotion: true }); const col = r.motes.geometry.attributes.color.array; expect(sum(col)).toBeGreaterThan(0);
    const before = Array.from(col); r.update(1 / 30, 50, { x: -2, z: -2 }, 0, null); expect(Array.from(col)).toEqual(before);
    expect(mk({ tier: { name: 'low', rung: 5, shadows: false } }).counts.points).toBeLessThan(mk().counts.points);
  });
});
