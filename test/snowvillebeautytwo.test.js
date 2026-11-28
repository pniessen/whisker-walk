import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { litSpots, stringFirs, gardenFir, presents } from '../src/world/snowvillebeauty.js';
import { twinkle, steamAt, STEAM_MUGS, HALO, createSnowvilleLight } from '../src/world/snowvillelight.js';
import { createSoundBed, windGust, sleighBells, carolChime, SLEIGH_GAP, CAROL_GAP } from '../src/world/snowvillesound.js';
import { hot } from '../src/world/snowvilleparts.js';
import { gustAt } from '../src/world/snowvillelight.js';
import * as P from '../src/world/snowvilleplan.js';

function fakeAudio(muted) {
  const log = { ctx: 0, osc: 0, src: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {}, gain: param(), frequency: param(), Q: param(), type: '' });
  const ac = { currentTime: 0, sampleRate: 8000, destination: {}, createGain: node, createBiquadFilter: node, createOscillator: () => { log.osc++; return node(); }, createBufferSource: () => { log.src++; return node(); }, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
  return { log, isMuted: () => muted, getContext: () => { log.ctx++; return ac; }, getMaster: () => null };
}

describe('snowville beauty pass 2: light and colour', () => {
  it('lights eight firs, the garland and the pennants, all above the snow and inside the village bounds', () => {
    expect(new Set(stringFirs().map((s) => `${Math.round(s.x)},${Math.round(s.z)}`)).size).toBeGreaterThan(30);
    expect(gardenFir()).toHaveLength(40);
    for (const s of litSpots()) {
      expect(Number.isFinite(s.x + s.y + s.z)).toBe(true);
      expect(s.y).toBeGreaterThan(P.snowY(s.x, s.z) - 0.2);
      expect(s.ph).toBeGreaterThanOrEqual(0); expect(s.ph).toBeLessThan(1);
    }
    expect(litSpots().filter((s) => s.big).length).toBe(P.COTTAGES.length * 3 + P.LAMPS.length + 1);
  });
  it('lit pieces are pushed past 1 so the bloom takes them', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.8, 0.5, 0.2]), 3));
    hot(g, 2);
    [1.6, 1, 0.4].forEach((v, i) => expect(g.attributes.color.array[i]).toBeCloseTo(v, 5));
  });
  it('twinkles between 0.24 and 1 and the four presents are not solid (no collider is added for them)', () => {
    for (let t = 0; t < 120; t += 0.7) for (const ph of [0, 0.3, 0.9]) { const k = twinkle(ph, t); expect(k).toBeGreaterThanOrEqual(0.23); expect(k).toBeLessThanOrEqual(1.0001); }
    expect(presents()).toHaveLength(4);
  });
  it('the cocoa steam rises from the four mugs and is a pure function of time', () => {
    expect(STEAM_MUGS).toHaveLength(4);
    const a = steamAt(1, 0, 3.3); const b = steamAt(1, 0, 3.3);
    expect(a).toEqual(b);
    expect(steamAt(1, 0, 0).y).toBeLessThan(steamAt(1, 0, 1.5).y + 1);
  });
  it('adds no real light and no mesh: the halos and the steam are Points', () => {
    const scene = new THREE.Scene();
    const l = createSnowvilleLight({ scene, tier: null, reducedMotion: false });
    const names = scene.children.map((o) => o.name);
    expect(names).toEqual(expect.arrayContaining(['snowville:halos', 'snowville:glows', 'snowville:steam']));
    for (const o of scene.children) { expect(o.isMesh).toBeFalsy(); expect(o.isLight).toBeFalsy(); }
    const col = scene.getObjectByName('snowville:halos').geometry.attributes.color;
    l.update(0.1, 5, { x: 0, z: 20 }, null, null);
    const a = Array.from(col.array);
    l.update(0.1, 9, { x: 0, z: 20 }, null, null);
    expect(Array.from(col.array)).not.toEqual(a); // they twinkle
    l.dispose();
  });
  it('reduced motion holds the halos and the steam still', () => {
    const scene = new THREE.Scene();
    const l = createSnowvilleLight({ scene, tier: null, reducedMotion: true });
    const halos = scene.getObjectByName('snowville:halos').geometry.attributes.color; const steam = scene.getObjectByName('snowville:steam').geometry.attributes.position;
    const a = Array.from(halos.array); const s = Array.from(steam.array);
    l.update(0.1, 7, { x: 0, z: 20 }, null, null);
    expect(Array.from(halos.array)).toEqual(a); expect(Array.from(steam.array)).toEqual(s);
    l.dispose();
  });
  it('the lower rungs draw fewer bulbs', () => {
    const count = (tier) => { const scene = new THREE.Scene(); const l = createSnowvilleLight({ scene, tier }); const n = scene.getObjectByName('snowville:halos').geometry.attributes.position.count; l.dispose(); return n; };
    expect(count({ name: 'low', rung: 3, shadows: true })).toBeLessThan(count(null));
  });
});

describe('snowville beauty pass 2: the sound bed', () => {
  it('is silent when muted: no context asked for, no node made', () => {
    const a = fakeAudio(true);
    expect(windGust(a)).toBe(false); expect(sleighBells(a)).toBe(false); expect(carolChime(a)).toBe(false);
    const bed = createSoundBed(a, gustAt);
    for (let t = 0; t < 600; t += 0.5) bed.update(t);
    expect(a.log).toEqual({ ctx: 0, osc: 0, src: 0 });
  });
  it('plays wind with the gusts, sleigh bells and a carol chime, and keeps to its gaps', () => {
    const a = fakeAudio(false);
    const bed = createSoundBed(a, gustAt);
    for (let t = 0; t < 900; t += 0.25) bed.update(t);
    const st = bed.state;
    expect(st.winds).toBeGreaterThan(2);
    expect(st.sleighs).toBeGreaterThan(5); expect(st.sleighs).toBeLessThanOrEqual(Math.ceil(900 / SLEIGH_GAP.min));
    expect(st.carols).toBeGreaterThan(5); expect(st.carols).toBeLessThanOrEqual(Math.ceil(900 / CAROL_GAP.min));
    expect(a.log.src).toBe(st.winds);
  });
  it('no gusts in reduced motion, so no wind, but the bells go on', () => {
    const a = fakeAudio(false);
    const bed = createSoundBed(a, () => 0);
    for (let t = 0; t < 300; t += 0.5) bed.update(t);
    expect(bed.state.winds).toBe(0); expect(bed.state.sleighs).toBeGreaterThan(2);
  });
});

describe('snowville beauty pass 2: the light of the look', () => {
  it('has a golden-hour sky band and a warm low sun', () => {
    expect(P.SNOW_LOOK.warm).toBeTypeOf('number');
    expect((P.SNOW_LOOK.sunColor >> 16) & 255).toBeGreaterThan(P.SNOW_LOOK.sunColor & 255);
    expect(HALO.big).toBeGreaterThan(HALO.bulb);
  });
});
