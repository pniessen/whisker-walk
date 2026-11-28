// Cat two on the places' own rides (src/coop/seats.js): Dot's passenger seat (Moon) and a swimming seal (Reef), through the per-cat prompt arbiter. No claim of cat one's is touched,
// one cat per seal, the household's first-ride award is paid once, and every release path (hop off, timer, leaving the walk, cat one getting out) sets cat two down.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { mem } from './helpers/lighthouselife.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { NO_FAIR } from '../src/fairnone.js';
import { phrase } from '../src/clanphrases.js';

stubCanvasDocument();
const { loadSeat, SEATS } = await import('../src/coop/seats.js');
const MoonP = await import('../src/world/moonplan.js');
const { build: buildMoon } = await import('../src/world/moon.js');
const { build: buildReef } = await import('../src/world/reef.js');
const ReefP = await import('../src/world/reefplan.js');
const { SEAL_RIDE } = await import('../src/world/reefsealride.js');
const { DOT_SEATS } = await import('../src/world/moonroverparts.js');
const DT = 1 / 30;
const fakePlayer = () => ({ inputActive: false, perchY: 0, floatY: 0, halts: 0, dir: { x: 0, z: 0 }, inputDirection() { return this.dir; }, halt() { this.halts++; }, clearFloat() {}, viewYaw: () => 0, setViewYaw() {}, setInputYaw() {} });

describe('the registry', () => {
  it('the Reef seat\'s own copy of the seal ride numbers equals the ride\'s', async () => {
    const { SEAL } = await import('../src/coop/seatreef.js');
    expect(SEAL).toEqual({ reach: SEAL_RIDE.reach, seconds: SEAL_RIDE.seconds, seatUp: SEAL_RIDE.seatUp, journalKey: SEAL_RIDE.journalKey, journalPage: SEAL_RIDE.journalPage });
  });
  it('the Moon seat\'s own copies of Dot\'s numbers equal the plan\'s (it imports no Moon file)', async () => {
    const m = await import('../src/coop/seatmoon.js');
    expect(m.DOT_REACH).toBe(MoonP.DOT_REACH);
    expect(m.DOT_SEATS).toEqual(DOT_SEATS);
  });
  it('has rows for the places with a seat for cat two only; a place with no row has none', async () => {
    expect(Object.keys(SEATS).sort()).toEqual(['crystal', 'greenhouse', 'jungle', 'lighthouse', 'moon', 'reef', 'snowville', 'treehouse']);
    expect(await loadSeat('farm', {})).toBeNull();
  });
});

describe('Dot\'s passenger seat', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); vi.restoreAllMocks(); });
  const rig = async () => {
    const progression = createProgression(mem());
    progression.state.moon = { ...progression.state.moon, step: 1, cells: 0 };
    const scene = new THREE.Scene();
    const area = buildMoon(scene);
    const log = createDiscoveryLog(progression); log.startWalk();
    const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high', shadows: true } });
    const cat = new THREE.Group(); const player = fakePlayer();
    const session = { goals: null, pounceTime: 0, perched: null, perchHold: null, idleTime: 0, fx: { burst: vi.fn() }, cat, fair: NO_FAIR, ground: area.ground, areaData: { colliders: area.colliders } };
    const body = new THREE.Group(); const p2 = fakePlayer();
    const camera = new THREE.PerspectiveCamera();
    const m = { life, cat, player, session, body, p2, progression, t: 0 };
    m.frame = () => { m.t += DT; life.update(DT, m.t, cat.position, camera, session); session.fair.update(DT, m.t, { cat, player, session }); session.fair.late(DT, m.t, { cat, player, session }); m.carried = m.seat.carry(DT, body, p2); };
    m.run = (n) => { for (let i = 0; i < n; i++) m.frame(); };
    m.seat = await loadSeat('moon', { life, session: () => session, log, progression });
    cat.position.set(MoonP.DOT_PARK.x - 1.9, MoonP.moonY(MoonP.DOT_PARK.x - 1.9, MoonP.DOT_PARK.z + 0.4), MoonP.DOT_PARK.z + 0.4);
    body.position.set(MoonP.DOT_PARK.x + 1.9, MoonP.moonY(MoonP.DOT_PARK.x + 1.9, MoonP.DOT_PARK.z + 0.4), MoonP.DOT_PARK.z + 0.4);
    m.run(2);
    m.driveIn = () => { life.promptAt(cat.position); life.interact(); m.run(3); };
    made.push(m);
    return m;
  };

  it('no offer while Dot is parked; once cat one drives, cat two is offered the other seat and rides along', async () => {
    const m = await rig();
    expect(m.seat.promptAt(m.body.position)).toBeNull();
    m.driveIn();
    expect(m.life.rover.riding).toBe(true);
    expect(m.seat.promptAt(m.body.position)).toBe(phrase('coop.seat.rover.in'));
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('moon.rover.out')); // cat one's own slot is not disturbed
    expect(m.seat.interact()).toBe('in');
    m.run(2);
    expect(m.carried).toBe(true);
    expect(m.seat.riding).toBe(true);
    expect(m.p2.perchY).toBe(DOT_SEATS[1].y);
    const sim = m.life.rover.sim;
    expect(Math.hypot(m.body.position.x - sim.x, m.body.position.z - sim.z)).toBeLessThan(0.8);
    expect(m.seat.promptAt(m.body.position)).toBe(phrase('coop.seat.rover.out'));
    expect(m.life.rover.state.occupant).toEqual(['me', null]); // the rover's own claims are untouched
  });

  it('cat two hops out on its own press; cat one getting out sets it down too; leaving the walk releases it', async () => {
    const m = await rig();
    m.driveIn();
    m.seat.promptAt(m.body.position); m.seat.interact(); m.run(2);
    m.seat.promptAt(m.body.position); expect(m.seat.interact()).toBe('out'); m.run(2);
    expect(m.seat.riding).toBe(false);
    expect(m.p2.perchY).toBe(0);
    m.seat.promptAt(m.body.position); m.seat.interact(); m.run(2);
    expect(m.seat.riding).toBe(true);
    m.life.promptAt(m.cat.position); expect(m.life.interact()).toBe('out'); m.run(3); // cat one hops out
    expect(m.seat.riding).toBe(false);
    m.driveIn();
    m.seat.promptAt(m.body.position); m.seat.interact(); m.run(2);
    expect(m.seat.riding).toBe(true);
    m.seat.release(m.body, m.p2); // cat two steps out of the walk
    expect(m.seat.riding).toBe(false);
    expect(m.p2.perchY).toBe(0);
  });

  it('the household\'s journal sighting is recorded for the ride (once-ever by the save itself)', async () => {
    const m = await rig();
    const spy = vi.spyOn(m.progression, 'recordSighting');
    m.driveIn();
    m.seat.promptAt(m.body.position); m.seat.interact(); m.run(2);
    expect(spy.mock.calls.some((c) => c[0] === 'mnrover')).toBe(true);
  });
});

describe('a swimming seal', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); });
  const rig = async () => {
    const sc = new THREE.Scene();
    const placed = buildReef(sc);
    const awards = [];
    const log = { awardOnce(kind, key, text) { const first = !awards.some((a) => a.key === key); if (first) awards.push({ kind, key, text }); return first ? 12 : 0; }, count() { return 0; }, mark() {} };
    const progression = createProgression(memoryStorage());
    const cat = new THREE.Group(); cat.position.set(0, ReefP.reefY(0, 36), 36);
    const body = new THREE.Group(); body.position.set(0, ReefP.reefY(0, 40), 40);
    const player = fakePlayer(); const p2 = fakePlayer();
    const life = placed.life({ scene: sc, progression, player, log, reducedMotion: false, visits: 1, doc: null, sendEvent: () => {} });
    const session = { cat, perched: null, perchHold: null, idleTime: 0, fair: { riding: null, update() {}, late() {}, jump() { return false; }, pawKind() { return null; } }, ground: { y: ReefP.reefY } };
    const seals = life.spottable.filter((s) => s.type === 'rfseal').slice(0, 2);
    const camera = new THREE.PerspectiveCamera();
    const m = { life, cat, body, player, p2, session, seals, awards, said: [], t: 0 };
    m.seat = await loadSeat('reef', { life, session: () => session, log, progression, say: (t) => m.said.push(t) });
    m.tick = (n = 1) => { for (let i = 0; i < n; i++) { m.t += DT; life.update(DT, m.t, cat.position, camera, session); session.fair.update(DT, m.t, { cat, player, session }); m.carried = m.seat.carry(DT, body, p2); } };
    m.beside = (who, i) => { const s = seals[i].pos; (who ? body : cat).position.set(s.x + 2.8, s.y, s.z); };
    m.twoBoards = (i) => { m.beside(1, i); expect(m.seat.promptAt(body.position)).toBe('ride the seal'); m.seat.interact(); m.tick(2); };
    m.tick(2);
    made.push(m);
    return m;
  };

  it('cat two is offered the seal through its own slot and rides it; cat one\'s slot stays its own', async () => {
    const m = await rig();
    m.beside(0, 0);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
    m.twoBoards(1);
    expect(m.carried).toBe(true);
    expect(m.seat.riding).toBe(true);
    expect(m.life.sealRide.riding).toBe(false);
    expect(m.p2.perchY).toBeGreaterThan(0.05);
    expect(m.session.perched).toBeNull(); // cat one's seat record is not used
    expect(m.seat.promptAt(m.body.position)).toBe('hop off the seal');
    expect(m.life.promptAt(m.cat.position)).not.toBe('Hop off the seal'); // that line is cat two's, not cat one's
  });

  it('one cat per seal across both cats, and one award for the household', async () => {
    const m = await rig();
    m.twoBoards(0);
    m.beside(0, 0);
    expect(m.life.promptAt(m.cat.position)).not.toBe('Ride the seal'); // cat two has seal 0
    m.beside(0, 1);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal');
    m.life.interact(); m.tick(2);
    expect(m.life.sealRide.state.seal).toBe(1);
    m.beside(1, 1);
    expect(m.seat.promptAt(m.body.position)).toBe('hop off the seal'); // still on its own seal; cat one's seal is not offered
    m.seat.interact(); m.tick(2); // hops off seal 0
    expect(m.life.sealRide.credit({ kind: 'seal-in', seal: 1 })).toBeNull(); // cat one's seal cannot be claimed by anyone else
    m.beside(1, 0);
    expect(m.seat.promptAt(m.body.position)).toBe('ride the seal'); // seal 0 is free again
    expect(m.awards.filter((a) => a.key === SEAL_RIDE.journalKey)).toHaveLength(1);
  });

  it('hop off, the timer and leaving the walk all give the seal back', async () => {
    const m = await rig();
    m.twoBoards(0);
    m.seat.promptAt(m.body.position); expect(m.seat.interact()).toBe('off'); m.tick(2);
    expect(m.seat.riding).toBe(false);
    expect(m.p2.perchY).toBe(0);
    m.twoBoards(0);
    m.tick(Math.ceil((SEAL_RIDE.seconds + 2) / DT));
    expect(m.seat.riding).toBe(false);
    expect(m.said).toContain(phrase('coop.seat.seal.end'));
    m.twoBoards(0);
    m.seat.release(m.body, m.p2);
    expect(m.seat.riding).toBe(false);
    m.beside(0, 0);
    expect(m.life.promptAt(m.cat.position)).toBe('Ride the seal'); // free for cat one again
  });
});
