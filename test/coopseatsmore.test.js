// Split-screen S5b: cat two on more of the places' own prompts and rides, through the lazy coop-side seats (src/coop/seatlend.js, seatpillion.js) and the Fairground's household credit.
// No file of a place is edited by this: the lend is a second asking of the place's own life, the pillion rides on cat one's seat record.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { phrase } from '../src/clanphrases.js';

stubCanvasDocument();
const { loadSeat } = await import('../src/coop/seats.js');
const { PILLION_RIDES, PILLION } = await import('../src/coop/seatpillion.js');
const { build: buildGreenhouse } = await import('../src/world/greenhouse.js');
const GP = await import('../src/world/greenhouseplan.js');
const { lightRig } = await import('./helpers/lighthouselife.js');
const { createRides } = await import('../src/coop/rides.js');

const fakePlayer = () => ({ inputActive: false, perchY: 0, halts: 0, halt() { this.halts++; }, inputDirection() { return { x: 0, z: 0 }; } });
const at = (x, z, y = 0) => ({ x, y, z });

describe('the lend: cat two asks a place\'s own life, one asking at a time', () => {
  const lives = [];
  afterEach(() => { for (const l of lives.splice(0)) l.dispose?.(); });
  const greenhouse = async (fair = { riding: null }) => {
    const scene = new THREE.Scene();
    const area = buildGreenhouse(scene);
    const life = area.life({ reducedMotion: false, visits: 0 });
    lives.push(life);
    const cat = new THREE.Group();
    const session = { cat, fair, perched: null };
    cat.position.set(GP.POTTING.tray.x + 20, 0, GP.POTTING.tray.z + 20);
    const seat = await loadSeat('greenhouse', { life, session: () => session });
    return { life, cat, session, seat };
  };
  const canAt = (life) => { const m = life.meshes.can; return at(m.position.x + 0.3, m.position.z, m.position.y); };

  it('cat two takes the watering can; cat one\'s own button slot is not disturbed; the can is then taken for both', async () => {
    const m = await greenhouse();
    const can = canAt(m.life);
    expect(m.seat.promptAt(can)).toBe(phrase('greenhouse.can.prompt'));
    expect(m.seat.interact()).toBe('can');
    expect(m.life.state.held).toBe(true);
    m.cat.position.set(can.x, can.y, can.z);
    expect(m.life.promptAt(m.cat.position)).toBeNull(); // the one can is held: no second offer to cat one
    expect(m.seat.promptAt(can)).toBeNull(); // nor to cat two again
    expect(m.seat.interact()).toBeNull();
  });

  it('asking for cat two puts cat one\'s offer back: her press still does what her own line said', async () => {
    const m = await greenhouse();
    const can = canAt(m.life);
    m.cat.position.set(can.x, can.y, can.z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('greenhouse.can.prompt')); // cat one's frame
    expect(m.seat.promptAt(at(0, 0))).toBeNull(); // cat two, far from anything: would have emptied the shared slot
    expect(m.life.interact()).toBe('can'); // cat one's press, same frame
  });

  it('no offer to cat two while cat one rides, and release leaves nothing held', async () => {
    const m = await greenhouse({ riding: { id: 'snow-sled' } });
    expect(m.seat.promptAt(canAt(m.life))).toBeNull();
    expect(m.seat.interact()).toBeNull();
    expect(m.life.state.held).toBe(false);
    m.seat.release(null, null);
    expect(m.seat.riding).toBe(false);
  });

  it('the Lighthouse kitten: found once, by whichever cat gets there; the second press finds nothing', async () => {
    const r = lightRig({ visits: 0 });
    lives.push(r);
    const cat = new THREE.Group();
    const session = { cat, fair: { riding: null } };
    const seat = await loadSeat('lighthouse', { life: r.life, session: () => session });
    const s = r.life.cats.spot;
    cat.position.set(s.x + 40, 0, s.z);
    r.step(0.5, { x: s.x + 1.5, y: 0, z: s.z });
    expect(seat.promptAt(at(s.x + 1.5, s.z))).toBe(phrase('lighthouse.kitten.prompt'));
    expect(seat.interact()).toBe('found');
    expect(r.life.cats.state).toBe('following');
    expect(r.events.filter((e) => e.key === 'lighthouse-kitten-found')).toHaveLength(1);
    cat.position.set(s.x + 1.5, 0, s.z);
    expect(r.life.promptAt(cat.position)).toBeNull(); // cat one cannot find the same kitten again
    expect(seat.interact()).toBeNull();
    expect(r.events.filter((e) => e.key === 'lighthouse-kitten-found')).toHaveLength(1);
  });
});

describe('the pillion: cat two on the back of cat one\'s ride', () => {
  const rig = async (areaId = 'snowville', id = 'snow-sled') => {
    const cat = new THREE.Group();
    const rec = { x: 10, z: 4, y: 0.6, yaw: 0.5, pose: 'requestPet' };
    const session = { cat, perched: rec, fair: { riding: { id } }, ground: { y: () => 0 } };
    cat.position.set(10, 0.6, 4); cat.rotation.y = 0.5;
    const body = new THREE.Group(); body.position.set(11, 0, 5);
    const player = fakePlayer();
    const said = [];
    const seat = await loadSeat(areaId, { life: { promptAt: () => null, interact: () => null }, session: () => session, say: (t) => said.push(t) });
    return { cat, rec, session, body, player, seat, said };
  };

  it('every id is one a ride really sets (read from the ride files, so a renamed id cannot slip past)', () => {
    const src = ['crystalriverlive', 'crystalcartlive', 'snowvillesledlive', 'snowvilleskislive', 'snowvillemobilelive', 'moonsledlive'].map((f) => readFileSync(new URL(`../src/world/${f}.js`, import.meta.url), 'utf8')).join('\n');
    for (const id of PILLION_RIDES) expect(src, id).toContain(`'${id}'`);
  });

  it('is offered while cat one rides within reach; carried at her seat; set down beside her when her ride ends', async () => {
    const m = await rig();
    expect(m.seat.promptAt(at(40, 40))).toBeNull(); // too far
    expect(m.seat.promptAt(m.body.position)).toBe(phrase('coop.seat.pillion.on'));
    expect(m.seat.interact()).toBe('on');
    expect(m.seat.carry(1 / 30, m.body, m.player)).toBe(true);
    expect(m.seat.riding).toBe(true);
    expect(Math.hypot(m.body.position.x - 10, m.body.position.z - 4)).toBeCloseTo(PILLION.side, 5);
    expect(m.player.perchY).toBeCloseTo(0.6, 5);
    m.rec.x = 14; m.cat.position.x = 14; // the ride moves on
    expect(m.seat.carry(1 / 30, m.body, m.player)).toBe(true);
    expect(m.body.position.x).toBeGreaterThan(13);
    m.session.perched = null; m.session.fair.riding = null; // cat one hops off
    expect(m.seat.carry(1 / 30, m.body, m.player)).toBe(false);
    expect(m.seat.riding).toBe(false);
    expect(m.player.perchY).toBe(0);
    expect(Math.hypot(m.body.position.x - 14, m.body.position.z - 4)).toBeCloseTo(PILLION.setDown, 5);
    expect(m.said).toContain(phrase('coop.seat.pillion.end'));
  });

  it('cat two hops off on its own press; leaving the walk sets it down; a parked ride offers nothing', async () => {
    const m = await rig('crystal', 'crystal-boat');
    m.seat.promptAt(m.body.position); m.seat.interact(); m.seat.carry(1 / 30, m.body, m.player);
    expect(m.seat.promptAt(m.body.position)).toBe(phrase('coop.seat.pillion.off'));
    expect(m.seat.interact()).toBe('off');
    m.seat.carry(1 / 30, m.body, m.player);
    expect(m.seat.riding).toBe(false);
    m.seat.promptAt(m.body.position); m.seat.interact(); m.seat.carry(1 / 30, m.body, m.player);
    expect(m.seat.riding).toBe(true);
    m.seat.release(m.body, m.player);
    expect(m.seat.riding).toBe(false);
    expect(m.player.perchY).toBe(0);
    m.session.perched = null; m.session.fair.riding = null;
    expect(m.seat.promptAt(m.body.position)).toBeNull();
  });

  it('a different ride taking cat one\'s seat record does not keep cat two seated on the old one', async () => {
    const m = await rig();
    m.seat.promptAt(m.body.position); m.seat.interact(); m.seat.carry(1 / 30, m.body, m.player);
    m.session.perched = { ...m.rec }; m.session.fair.riding = { id: 'snow-skis' };
    expect(m.seat.carry(1 / 30, m.body, m.player)).toBe(false);
    expect(m.seat.riding).toBe(false);
  });
});

describe('the Fairground rides credit the household once', () => {
  const rigRides = (cat1Boat = false) => {
    const calls = [];
    const seat = { rideId: 'boat', seatKind: 'boat', x: 0, y: 1, z: 0, yaw: 0 };
    const boat = { calm: true };
    const sim = { boat, slide: { chute: {}, mat: {}, done: false }, jumpTarget: () => ({ type: 'board', seat }) };
    const s = { fair: { sim, riding: cat1Boat ? { rideId: 'boat' } : null }, ground: { flat: true } };
    const r = createRides();
    r.attach(s, { ride: (id) => calls.push(['ride', id]), lap: () => calls.push(['lap']) });
    const mover = { body: new THREE.Group(), player: fakePlayer() };
    return { r, s, boat, mover, calls };
  };
  it('the first frame on a ride credits it once; a whole swing alone pays one lap', () => {
    const m = rigRides();
    expect(m.r.jump(m.s, m.mover)).toBe(true);
    for (let i = 0; i < 5; i++) m.r.frame(0.05, m.s, m.mover);
    expect(m.calls).toEqual([['ride', 'boat']]);
    m.boat.calm = false; m.r.frame(0.05, m.s, m.mover); m.r.frame(0.05, m.s, m.mover);
    m.boat.calm = true; m.r.frame(0.05, m.s, m.mover); m.r.frame(0.05, m.s, m.mover);
    expect(m.calls).toEqual([['ride', 'boat'], ['lap']]);
  });
  it('with cat one on the boat too, cat one\'s own event pays the swing: cat two adds none', () => {
    const m = rigRides(true);
    m.r.jump(m.s, m.mover);
    m.boat.calm = false; m.r.frame(0.05, m.s, m.mover);
    m.boat.calm = true; m.r.frame(0.05, m.s, m.mover);
    expect(m.calls.filter((c) => c[0] === 'lap')).toHaveLength(0);
  });
  it('with no credit (a walk without a save) nothing is called; detach clears it', () => {
    const m = rigRides();
    m.r.attach(m.s, null);
    m.r.jump(m.s, m.mover); m.r.frame(0.05, m.s, m.mover);
    expect(m.calls).toEqual([]);
  });
});
