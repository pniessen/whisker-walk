import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { bus } from '../src/events.js';

stubCanvasDocument();

const L = await import('../src/world/greenhouselife.js');
const P = await import('../src/world/greenhouseplan.js');
const Parts = await import('../src/world/greenhouseparts.js');
const { build } = await import('../src/world/greenhouse.js');
const { phrase } = await import('../src/clanphrases.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');

// Greenhouse milestone 1: the seed job and the watering job. No clock, no failing state, per device, nothing sent.

let heard;
let off;
beforeEach(() => { heard = []; off = bus.on?.('discovery', (e) => heard.push(e)); });
afterEach(() => { if (typeof off === 'function') off(); });

const make = (o = {}) => {
  const scene = new THREE.Scene();
  const area = build(scene);
  const life = area.life({ reducedMotion: false, visits: 0, ...o });
  return { scene, area, life };
};
const catAt = (x, z) => ({ x, y: 0, z });
const tick = (life, pos, dt = 0.05, n = 1, t0 = 0) => { for (let i = 0; i < n; i++) life.update(dt, t0 + i * dt, pos, null, { cat: { rotation: { y: 0 } } }); };

describe('which seeds and which pots: a function of the seed or the walk count, never random', () => {
  it('the set and the four pots are stable for a seed, and every set and every pot is used by some seed', () => {
    const sets = new Set(); const pots = new Set();
    for (let v = 0; v < 60; v++) {
      expect(L.seedSetIndex(null, v)).toBe(L.seedSetIndex(null, v));
      expect(L.thirstyPots(null, v)).toEqual(L.thirstyPots(null, v));
      sets.add(L.seedSetIndex(null, v));
      for (const p of L.thirstyPots(null, v)) pots.add(p);
      const t = L.thirstyPots(null, v);
      expect(t).toHaveLength(4);
      expect(new Set(t).size).toBe(4);
      expect(t.filter((i) => i < 4)).toHaveLength(2); // two in the hall, two in the garden
    }
    expect(sets.size).toBe(3);
    expect(pots.size).toBe(8);
    expect(L.seedSetIndex(8123, 0)).toBe(L.seedSetIndex(8123, 99)); // a room's seed ignores the walk count, so two screens agree
    expect(L.seedSetIndex(undefined, 2)).toBe(L.seedSetIndex(null, 2));
  });
  it('the salts are their own: no other place uses them', () => {
    expect(L.GH_SEED_SALT).not.toBe(L.GH_WATER_SALT);
  });
});

describe('the seed job', () => {
  it('five packets lie in the chosen set; walking to one picks it, with a count', () => {
    const { life } = make();
    const st = life.state;
    expect(life.meshes.packets).toHaveLength(5);
    st.set.forEach((s, i) => expect(life.meshes.packets[i].position.x).toBe(s.x));
    tick(life, catAt(st.set[0].x + 0.4, st.set[0].z));
    expect(life.state.seeds).toBe(1);
    expect(life.meshes.packets[0].visible).toBe(false);
    expect(heard.some((e) => e.type === 'greenhousenote' && /1 of 5/.test(e.label))).toBe(true);
    tick(life, catAt(st.set[0].x, st.set[0].z)); // the same spot again counts nothing twice
    expect(life.state.seeds).toBe(1);
  });
  it('with all five the seed tray offers E, sowing pops the shoots up; with fewer it offers nothing; nothing leads back', () => {
    const { life } = make();
    const set = life.state.set;
    expect(life.promptAt(catAt(P.POTTING.tray.x, P.POTTING.tray.z + 1.5))).toBe(null);
    for (const s of set) tick(life, catAt(s.x, s.z));
    expect(life.state.seeds).toBe(5);
    expect(heard.some((e) => /all five|That is all/.test(e.label))).toBe(true);
    expect(life.promptAt(catAt(0, 30))).toBe(null);
    expect(life.promptAt(catAt(P.POTTING.tray.x, P.POTTING.tray.z + 1.5))).toBe(phrase('greenhouse.seed.prompt'));
    expect(life.interact()).toBe('sow');
    expect(life.state.seedState).toBe('sown');
    expect(life.meshes.sprouts.visible).toBe(true);
    tick(life, catAt(P.POTTING.tray.x, P.POTTING.tray.z + 1.5), 0.1, 20);
    expect(life.meshes.sprouts.scale.x).toBeCloseTo(1, 1);
    expect(life.promptAt(catAt(P.POTTING.tray.x, P.POTTING.tray.z + 1.5))).toBe(null); // sown for good
    expect(heard.some((e) => /shoots pop up/.test(e.label))).toBe(true);
  });
  it('every set\'s five spots are far enough apart that no walk picks two at once', () => {
    for (const set of P.SEED_SPOT_SETS) for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) expect(Math.hypot(set[i].x - set[j].x, set[i].z - set[j].z)).toBeGreaterThan(2 * L.PICK_R);
  });
});

describe('the watering job', () => {
  const near = (life, p) => catAt(p.x, p.z + 0.7);
  it('four pots droop with a cloud over each; the can is picked up at the bench, never anywhere else', () => {
    const { life } = make();
    expect(life.state.thirsty).toHaveLength(4);
    life.meshes.clouds.forEach((c) => expect(c.visible).toBe(true));
    life.meshes.pots.forEach((m) => expect(m.scale.y).toBeLessThan(0.7));
    expect(life.promptAt(catAt(0, 30))).toBe(null);
    expect(life.promptAt(catAt(P.POTTING.canHome.x, P.POTTING.canHome.z + 0.5))).toBe(phrase('greenhouse.can.prompt'));
    expect(life.interact()).toBe('can');
    expect(life.state.held).toBe(true);
    tick(life, catAt(5, 5));
    expect(life.meshes.can.position.y).toBeGreaterThan(0.2); // carried in front of her
    expect(Math.hypot(life.meshes.can.position.x - 5, life.meshes.can.position.z - 5)).toBeLessThan(0.6);
  });
  it('water all four and the can goes back to its hook; each pot perks up; there is no way to fail', () => {
    const { life } = make();
    tick(life, catAt(P.POTTING.canHome.x, P.POTTING.canHome.z + 0.5)); life.promptAt(catAt(P.POTTING.canHome.x, P.POTTING.canHome.z + 0.5)); life.interact();
    const pots = life.state.thirsty.map((i) => P.WATER_POT_SPOTS[i]);
    // walking about away from every pot, and standing by a pot without pressing, loses nothing
    tick(life, catAt(-30, -30), 0.1, 50);
    pots.forEach((p, k) => {
      expect(life.promptAt(near(life, p))).toBe(phrase('greenhouse.water.prompt'));
      expect(life.interact()).toBe('water');
      expect(life.state.watered).toBe(k + 1);
    });
    tick(life, catAt(0, 30), 0.1, 20);
    expect(life.state.allWatered).toBe(true);
    expect(life.state.held).toBe(false);
    expect(life.meshes.can.position.x).toBe(P.POTTING.canHome.x);
    life.meshes.pots.forEach((m) => expect(m.scale.y).toBeCloseTo(1, 1));
    life.meshes.clouds.forEach((c) => expect(c.visible).toBe(false));
    expect(life.promptAt(catAt(P.POTTING.canHome.x, P.POTTING.canHome.z + 0.5))).toBe(null); // the can stays on its hook
    expect(heard.filter((e) => e.type === 'greenhousenote' && /thirsty|perks|watered/i.test(e.label)).length).toBeGreaterThanOrEqual(4);
  });
  it('a pot that is not thirsty is never offered water, and a watered pot is not offered twice', () => {
    const { life } = make();
    life.promptAt(catAt(P.POTTING.canHome.x, P.POTTING.canHome.z + 0.5)); life.interact();
    const healthy = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !life.state.thirsty.includes(i));
    expect(life.promptAt(near(life, P.WATER_POT_SPOTS[healthy]))).toBe(null);
    const first = P.WATER_POT_SPOTS[life.state.thirsty[0]];
    expect(life.promptAt(near(life, first))).not.toBe(null);
    life.interact();
    expect(life.promptAt(near(life, first))).toBe(null);
  });
  it('the can has a model of its own, small and unmerged', () => {
    const can = Parts.canMesh();
    expect(can.userData.noMerge).toBe(true);
    expect((can.geometry.index ? can.geometry.index.count : can.geometry.attributes.position.count) / 3).toBeLessThan(200);
  });
});

describe('both jobs are quiet and local', () => {
  it('nothing is sent anywhere: the life touches no network and reads no clock, and a dispose leaves the scene as it was', () => {
    const d = vi.spyOn(Date, 'now'); const p = vi.spyOn(performance, 'now');
    const scene = new THREE.Scene();
    const area = build(scene);
    const before = scene.children.length;
    const life = area.life({ reducedMotion: false, visits: 1 });
    tick(life, catAt(0, 30), 0.05, 10);
    life.dispose();
    expect(scene.children.length).toBe(before);
    expect(d).not.toHaveBeenCalled();
    expect(p).not.toHaveBeenCalled();
    d.mockRestore(); p.mockRestore();
  });
  it('the lines read the same in the everyday set and never show a series word', () => {
    const ids = ['greenhouse.seed.offer', 'greenhouse.seed.all', 'greenhouse.seed.prompt', 'greenhouse.seed.sown', 'greenhouse.can.offer', 'greenhouse.can.prompt', 'greenhouse.water.prompt', 'greenhouse.water.done', 'greenhouse.water.all'];
    const clan = ids.map((i) => phrase(i)).concat(phrase('greenhouse.seed.found', 3));
    let everyday;
    withOffWords(() => { everyday = ids.map((i) => phrase(i)).concat(phrase('greenhouse.seed.found', 3)); });
    expect(everyday).toEqual(clan);
    for (const t of everyday) expect(bannedIn(t)).toBeNull();
  });
});
