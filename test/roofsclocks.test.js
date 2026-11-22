import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { handAngles, minutesOf, createClockTicker } from '../src/world/clockhands.js';

stubCanvasDocument({ measureText: 10, pointerLock: true });
const { build } = await import('../src/world/roofs.js');

const TAU = Math.PI * 2;
const at = (h, m) => h * 60 + m;

describe('handAngles', () => {
  it('puts the hands where a clock does', () => {
    expect(handAngles(at(3, 0)).hour).toBeCloseTo(TAU / 4);
    expect(handAngles(at(3, 0)).minute).toBeCloseTo(0);
    expect(handAngles(at(6, 30)).minute).toBeCloseTo(TAU / 2);
    expect(handAngles(at(6, 30)).hour).toBeCloseTo((6.5 / 12) * TAU);
    expect(handAngles(at(7, 10)).hour).toBeCloseTo(((7 + 10 / 60) / 12) * TAU);
  });
  it('wraps at 12 and 24 hours', () => {
    expect(handAngles(at(0, 0))).toEqual({ hour: 0, minute: 0 });
    expect(handAngles(at(12, 0)).hour).toBeCloseTo(0);
    expect(handAngles(at(15, 20)).hour).toBeCloseTo(handAngles(at(3, 20)).hour);
    expect(handAngles(1440 + at(2, 5)).minute).toBeCloseTo(handAngles(at(2, 5)).minute);
    expect(handAngles(-60).hour).toBeCloseTo(handAngles(at(23, 0)).hour);
  });
  it('goes 59 to 00 without a jump back past the top', () => {
    const a = handAngles(at(4, 59)).minute;
    const b = handAngles(at(5, 0)).minute;
    expect(a).toBeCloseTo(TAU * (59 / 60));
    expect(b).toBe(0);
    expect(handAngles(at(11, 59)).hour).toBeLessThan(TAU);
  });
  it('reads a Date', () => {
    expect(minutesOf(new Date(2026, 10, 22, 13, 47, 59))).toBe(at(13, 47));
  });
});

describe('createClockTicker', () => {
  const make = (state) => {
    const drawn = [];
    const t = createClockTicker({ now: () => state.date, visible: () => state.seen, apply: (m) => drawn.push(m) });
    return { t, drawn };
  };
  it('draws at once, then only when the minute moves', () => {
    const state = { date: new Date(2026, 0, 1, 9, 5, 0), seen: true };
    const { t, drawn } = make(state);
    t.update(0.016);
    for (let i = 0; i < 300; i++) t.update(0.1);
    expect(drawn).toEqual([at(9, 5)]);
    state.date = new Date(2026, 0, 1, 9, 6, 0);
    for (let i = 0; i < 12; i++) t.update(0.1);
    expect(drawn).toEqual([at(9, 5), at(9, 6)]);
  });
  it('costs no drawing while the faces are off-screen, and catches up when seen', () => {
    const state = { date: new Date(2026, 0, 1, 9, 5), seen: false };
    const { t, drawn } = make(state);
    for (let i = 0; i < 100; i++) t.update(0.1);
    state.date = new Date(2026, 0, 1, 9, 9);
    for (let i = 0; i < 100; i++) t.update(0.1);
    expect(drawn).toEqual([]);
    state.seen = true;
    for (let i = 0; i < 12; i++) t.update(0.1);
    expect(drawn).toEqual([at(9, 9)]);
  });
});

describe('the tower in the Rooftops', () => {
  const scene = new THREE.Scene();
  const record = build(scene);
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const paint = meshes.find((m) => m.name === 'roofsNorth:paint');

  it('redraws the hands in place: no vertex or mesh is added', () => {
    const before = { meshes: meshes.length, verts: paint.geometry.attributes.position.count };
    const snap = Float32Array.from(paint.geometry.attributes.position.array);
    record.clockTower.redraw(at(10, 10));
    const moved = Float32Array.from(paint.geometry.attributes.position.array);
    expect(moved).not.toEqual(snap);
    let n = 0;
    scene.traverse((o) => { if (o.isMesh) n++; });
    expect(n).toBe(before.meshes);
    expect(paint.geometry.attributes.position.count).toBe(before.verts);
    // the same time again changes nothing; 7:10 puts the baked hands back
    record.clockTower.redraw(at(10, 10));
    expect(Float32Array.from(paint.geometry.attributes.position.array)).toEqual(moved);
    record.clockTower.redraw(at(7, 10));
    const back = paint.geometry.attributes.position.array;
    let worst = 0;
    for (let i = 0; i < snap.length; i++) worst = Math.max(worst, Math.abs(back[i] - snap[i]));
    expect(worst).toBeLessThan(1e-4);
  });
});
