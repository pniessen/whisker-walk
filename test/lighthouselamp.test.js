import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';

stubCanvasDocument();

const L = await import('../src/world/lighthouseplan.js');
const { build } = await import('../src/world/lighthouse.js');
const { createLighthouseLife, JOB_KEY, HORN_AFTER, LIGHT_UP, FADE_ROOF, BEAM } = await import('../src/world/lighthouselife.js');
const { createTippables } = await import('../src/tippables.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { phrase, hasPhrase } = await import('../src/clanphrases.js');
const { bus } = await import('../src/events.js');
const { withOffWords, bannedIn } = await import('./helpers/offwords.js');
const { HORN, createLighthouseSound } = await import('../src/world/lighthousesound.js');

// Lighthouse Point, milestone 2: the lamp job on the real lever tippable, the real discovery log and the real life.

const area = L.lighthouseArea();
const leverIndex = area.tippables.findIndex((t) => t.kind === 'lever');
const LEVER_ID = `tip-${leverIndex}`;
// beside the lever, 2.65 m from the tower's middle: in reach of it (the job pays here) but outside the lamp room's find (2.0 m) and the gallery's (from 2.7 m)
const CAT_AT = { x: L.TOWER.x + 2.65 * Math.cos((201 * Math.PI) / 180), y: 13.5, z: L.TOWER.z + 2.65 * Math.sin((201 * Math.PI) / 180) };

function rig({ restore = null, audio = null, roomSeed } = {}) {
  const record = build(new THREE.Scene()); // (for the tippables' own looks and the record's life)
  void record;
  const scene = new THREE.Scene();
  const placed = build(scene);
  const tippables = createTippables(scene, placed.tippables, { ground: placed.ground });
  const points = { n: 0 };
  const progression = { addPoints: (n) => { points.n += n; }, recordFeat: vi.fn(), recordSighting: vi.fn() };
  const log = createDiscoveryLog(progression);
  log.startWalk();
  if (restore) log.restore(restore);
  const life = placed.life({ scene, ground: placed.ground, audio, log, progression, reducedMotion: false, tier: { name: 'high' }, roomSeed });
  const session = { tippables };
  const camera = new THREE.PerspectiveCamera();
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const lever = tippables.list.find((e) => e.kind === 'lever');
  const step = (seconds, cat = CAT_AT) => { for (let i = 0; i < seconds * 30; i++) life.update(1 / 30, 0, cat, camera, session); };
  return { scene, tippables, life, log, points, events, lever, step, off, placed, progression };
}
const objects = (scene) => ['lighthouse:glass', 'lighthouse:lamproof'].map((n) => scene.getObjectByName(n));

let r;
beforeEach(() => { r = null; });
afterEach(() => { r?.off?.(); r?.life.dispose(); });

describe('the lever', () => {
  it('is one tippable in the lamp room, drawn as an arm, with its own prompt line', () => {
    expect(area.tippables.filter((t) => t.kind === 'lever')).toHaveLength(1);
    r = rig();
    expect(r.lever.id).toBe(LEVER_ID);
    expect(r.lever.group.getObjectByName('lever-arm')).toBeTruthy();
    expect(r.lever.prompt).toBe('E — pull the lamp lever');
    // every other tippable has none (the game's own "paw it over" stands)
    expect(r.tippables.list.filter((e) => e.kind !== 'lever' && e.kind !== 'bell').every((e) => e.prompt === null)).toBe(true);
    expect(r.tippables.list.find((e) => e.kind === 'bell').prompt).toBe('E — ring the fog bell'); // (milestone 3: the fog bell's rope has its own line too)
  });
});

describe('the lamp job', () => {
  it('is unlit on arrival: no beam, no halo, no glow, no pool of light, nothing paid', () => {
    r = rig();
    r.step(3);
    expect(r.life.lit).toBe(false);
    const meshes = r.scene.children.filter((o) => o.isMesh && o.userData.noMerge && !['lighthouse:glass', 'lighthouse:lamproof'].includes(o.name));
    expect(meshes.length).toBeGreaterThanOrEqual(4);
    for (const m of meshes) expect(m.visible, 'a lamp piece is hidden').toBe(false);
    expect(r.points.n).toBe(0);
    expect(r.events).toEqual([]);
  });

  it('her paw on the lever lights it: the beam, the halo, the glow and the pool come on, the arm swings, and 25 paws are paid once', () => {
    r = rig();
    r.step(1);
    expect(r.tippables.tip(r.lever)).toBe(true); // her paw (interactions.js)
    r.step(0.1);
    expect(r.life.lit).toBe(true);
    expect(r.points.n).toBe(AWARDS.lighthousejob);
    expect(AWARDS.lighthousejob).toBe(25);
    expect(r.events[0]).toMatchObject({ type: 'lighthousejob', key: JOB_KEY, label: phrase('lighthouse.lamp.lit'), points: 25, repeat: false });
    r.step(LIGHT_UP + 0.5);
    const shown = r.scene.children.filter((o) => o.isMesh && o.userData.noMerge && !['lighthouse:glass', 'lighthouse:lamproof'].includes(o.name));
    expect(shown.length).toBeGreaterThanOrEqual(4);
    expect(shown.filter((m) => m.visible).length).toBeGreaterThanOrEqual(3);
    expect(r.lever.group.getObjectByName('lever-arm').rotation.z).toBeLessThan(-1);
    expect(r.lever.group.rotation.z).toBe(0); // the arm swings, the lever does not fall over
    // many more frames, and tipping again does nothing: still 25, still one line
    r.step(30);
    expect(r.points.n).toBe(25);
    expect(r.events.filter((e) => e.type === 'lighthousejob')).toHaveLength(1);
  });

  it('a partner\'s tip, by the lever\'s id, lights the lamp on this device too (and pays this walk\'s job once, here)', () => {
    r = rig();
    r.step(1);
    expect(r.tippables.tipById(LEVER_ID)).toBe(true); // netevents.js: the `tip` event
    r.step(0.1);
    expect(r.life.lit).toBe(true);
    expect(r.points.n).toBe(25);
  });

  it('the far ship answers HORN_AFTER seconds later: its line once, its horn once, 0 paws', () => {
    const calls = [];
    const audio = { isMuted: () => false, getContext: () => ({ state: 'running', currentTime: 0, createOscillator: () => { calls.push('osc'); return { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (g) => g, start() {}, stop() {}, disconnect() {} }; }, createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }) }), getMaster: () => ({}) };
    r = rig({ audio });
    r.step(1);
    r.tippables.tipById(LEVER_ID);
    r.step(HORN_AFTER - 0.5);
    expect(r.events.filter((e) => e.type === 'lighthouseship')).toHaveLength(0);
    expect(calls).toHaveLength(0);
    r.step(1);
    const ship = r.events.filter((e) => e.type === 'lighthouseship');
    expect(ship).toHaveLength(1);
    expect(ship[0]).toMatchObject({ label: phrase('lighthouse.lamp.ship'), points: 0 });
    expect(calls).toHaveLength(HORN.toots.length * 2);
    r.step(60);
    expect(r.events.filter((e) => e.type === 'lighthouseship')).toHaveLength(1);
    expect(calls).toHaveLength(HORN.toots.length * 2);
    expect(r.points.n).toBe(25);
  });

  it('a walk picked up again finds the lamp lit, the lever pulled, nothing paid twice and no horn', () => {
    const calls = [];
    const audio = { isMuted: () => false, getContext: () => { calls.push('ctx'); return { state: 'running', currentTime: 0 }; }, getMaster: () => ({}) };
    r = rig({ restore: [[JOB_KEY, 1]], audio });
    r.step(0.2);
    expect(r.life.lit).toBe(true);
    expect(r.lever.tipped).toBe(true);
    r.step(LIGHT_UP + HORN_AFTER + 3);
    expect(r.points.n).toBe(0);
    expect(r.events).toEqual([]);
    expect(calls).toEqual([]);
    expect(r.lever.group.getObjectByName('lever-arm').rotation.z).toBeLessThan(-1);
    // and it cannot be pulled a second time: it is down
    expect(r.tippables.nearest(new THREE.Vector3(L.LEVER.x, 13.5, L.LEVER.z), 2)).toBeNull();
  });

  it('a partner\'s pull pays only the cat who is up in the lamp room: far away she sees the lamp and is paid nothing, and is paid when she gets there', () => {
    r = rig();
    const far = { x: 14, y: 0, z: 36 };
    r.step(1, far);
    expect(r.tippables.tipById(LEVER_ID)).toBe(true);
    r.step(2, far);
    expect(r.life.lit).toBe(true);
    expect(r.points.n).toBe(0);
    expect(r.events.filter((e) => e.type === 'lighthousejob')).toHaveLength(0);
    r.step(HORN_AFTER, far); // the ship answers on this screen too, for nothing
    expect(r.events.filter((e) => e.type === 'lighthouseship')).toHaveLength(1);
    // on the plateau under the lamp room (the gallery's level is 7.5 m up): not there yet
    r.step(1, { x: L.LEVER.x, y: 6, z: L.LEVER.z });
    expect(r.points.n).toBe(0);
    r.step(1, CAT_AT);
    expect(r.points.n).toBe(25);
    expect(r.events.filter((e) => e.type === 'lighthousejob')).toHaveLength(1);
    expect(r.progression.recordSighting).toHaveBeenCalledWith('lhjoblamp');
    r.step(30);
    expect(r.points.n).toBe(25);
  });

  it('her own pull counts on the lamp\'s journal page, once a walk', () => {
    r = rig();
    r.step(1);
    r.tippables.tip(r.lever);
    r.step(1);
    expect(r.progression.recordSighting).toHaveBeenCalledTimes(1);
    expect(r.progression.recordSighting).toHaveBeenCalledWith('lhjoblamp');
  });

  it('a tip on a later walk pays again (once a walk): a fresh log is a fresh walk', () => {
    r = rig();
    r.step(1);
    r.tippables.tipById(LEVER_ID);
    r.step(1);
    expect(r.points.n).toBe(25);
    r.off(); r.life.dispose();
    r = rig();
    r.step(1);
    r.tippables.tipById(LEVER_ID);
    r.step(1);
    expect(r.points.n).toBe(25);
  });
});

describe('the roof and the glass of the lamp room', () => {
  it('fade while she is inside and come back when she leaves', () => {
    r = rig();
    const [glass, roof] = objects(r.scene);
    expect(roof.material.opacity).toBe(1);
    r.step(2, { x: L.TOWER.x + 1.3, y: 13.5, z: L.TOWER.z });
    expect(roof.material.opacity).toBeLessThan(FADE_ROOF + 0.05);
    expect(glass.material.opacity).toBeLessThan(0.12);
    r.step(2, { x: L.TOWER.x + 3.8, y: 13.5, z: L.TOWER.z }); // on the gallery, outside the glass
    expect(roof.material.opacity).toBeGreaterThan(0.99);
    expect(glass.material.opacity).toBeGreaterThan(0.21);
    // on the plateau below, under the same x and z: not inside
    r.step(2, { x: L.TOWER.x + 1.3, y: 6, z: L.TOWER.z });
    expect(roof.material.opacity).toBeGreaterThan(0.99);
  });
});

describe('the words, in both sets', () => {
  const IDS = ['lighthouse.lever.prompt', 'lighthouse.lamp.lit', 'lighthouse.lamp.ship'];
  it('each is in the table and reads the same in both sets, with no series word', () => {
    const clan = IDS.map((id) => { expect(hasPhrase(id), id).toBe(true); return phrase(id); });
    let everyday;
    withOffWords(() => { everyday = IDS.map((id) => phrase(id)); });
    expect(everyday).toEqual(clan);
    for (const line of clan) expect(bannedIn(line), line).toBeNull();
    expect(clan[1]).toBe('The lamp is lit! The beam sweeps over the sea. 🔦');
  });
});

describe('the horn is silent while muted, and never asks for the context', () => {
  it('muted, an audio without isMuted, a suspended context', () => {
    const ctx = vi.fn();
    for (const audio of [{ isMuted: () => true, getContext: ctx }, { getContext: ctx }, { isMuted: () => false, getContext: () => ({ state: 'suspended' }), getMaster: () => ({}) }]) {
      const s = createLighthouseSound(audio);
      expect(s.horn()).toBe(false);
      s.dispose();
    }
    expect(ctx).not.toHaveBeenCalled();
    expect(BEAM.period).toBe(18);
  });
});
