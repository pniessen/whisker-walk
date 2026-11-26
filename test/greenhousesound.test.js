import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as S from '../src/world/greenhousesound.js';
import * as L from '../src/world/greenhouselife.js';
import * as B from '../src/world/greenhousebutterflies.js';
import * as PL from '../src/world/greenhouseplants.js';
import * as PA from '../src/world/greenhouseparts.js';
import * as RP from '../src/world/greenhouseroomparts.js';

function param() { return { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
function fakeAudio({ muted = false, state = 'running' } = {}) {
  const a = { asked: 0, oscs: 0 };
  const node = () => ({ connect(t) { return t; }, disconnect() {}, start() {}, stop() {}, frequency: param(), gain: param() });
  const ctx = { currentTime: 0, state, createOscillator() { a.oscs++; return node(); }, createGain: node };
  a.getContext = () => { a.asked++; return ctx; };
  a.getMaster = () => { a.asked++; return node(); };
  a.isMuted = () => muted;
  return a;
}
const cat = { x: 0, y: 0, z: 14 };
const run = (snd, secs, pos = cat, under = false) => { for (let i = 0; i < secs * 10; i++) snd.update(0.1, pos, under); };

describe('greenhouse sound', () => {
  it('asks for nothing and plays nothing while muted', () => {
    for (const a of [fakeAudio({ muted: true }), { isMuted: undefined, getContext() { throw new Error('asked'); } }]) {
      const snd = S.createGreenhouseSound(a);
      run(snd, 60); run(snd, 60, { x: -11, y: 0, z: -9 }, true);
      expect(a.oscs ?? 0).toBe(0);
      expect(a.asked ?? 0).toBe(0);
    }
  });
  it('sounds by the fountain, in a house and in the garden when not muted', () => {
    const a = fakeAudio();
    run(S.createGreenhouseSound(a), 10);
    expect(a.oscs).toBeGreaterThan(5);
    const b = fakeAudio();
    run(S.createGreenhouseSound(b), 30, { x: 0, y: 0, z: -9 }, true);
    expect(b.oscs).toBeGreaterThan(3);
  });
  it('patters in rain under glass and drips otherwise', () => {
    const rain = fakeAudio(); const dry = fakeAudio();
    run(S.createGreenhouseSound(rain, { weather: { isRaining: () => true } }), 10, cat, true);
    run(S.createGreenhouseSound(dry, { weather: { isRaining: () => false } }), 10, cat, true);
    expect(rain.oscs).toBeGreaterThan(dry.oscs);
  });
  it('stays silent on a suspended context and never throws on a broken one', () => {
    const s = fakeAudio({ state: 'suspended' });
    run(S.createGreenhouseSound(s), 10);
    expect(s.oscs).toBe(0);
    const snd = S.createGreenhouseSound({ isMuted: () => false, getContext() { throw new Error('no audio'); } });
    expect(() => run(snd, 10)).not.toThrow();
  });
  it('is the same walk every time', () => {
    const a = fakeAudio(); const b = fakeAudio();
    run(S.createGreenhouseSound(a), 20); run(S.createGreenhouseSound(b), 20);
    expect(a.oscs).toBe(b.oscs);
  });
  it('uses no banned randomness or clock', () => {
    const src = readFileSync(new URL('../src/world/greenhousesound.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
  });
  it('has salts distinct from every other greenhouse salt', () => {
    const mine = Object.values(S.STREAM).map((o) => S.GH_SOUND_SALT + o);
    const others = [L.GH_SEED_SALT, L.GH_WATER_SALT, L.GH_ROOM_SALT, B.GH_BUTTERFLY_SALT, PL.GH_LOOK_SALT, PL.GH_KOI_SALT, PA.GH_TREE_SALT];
    const all = [...mine, ...others];
    expect(new Set(all).size).toBe(all.length);
    for (const m of mine) for (let k = 0; k < 64; k++) { expect(m).not.toBe(RP.GH_ROOM_LOOK_SALT + k); expect(m).not.toBe(PL.GH_LOOK_SALT + k); }
  });
});
