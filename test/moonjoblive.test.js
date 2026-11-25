// The Moon, milestone 9 on a walk: Pip's postcard of the day through the real Moon life. After the story (and not before): today's errand from the room's seed, each of the six
// done for real without any bound (with the bound's switch on AND off), 25 paws once a walk and one postcard in the album, the board and the ring, a partner's credit, a resumed walk,
// the props (one mesh, no caster, drawn only near) and what the walk never does.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import * as P from '../src/world/moonplan.js';
import * as J from '../src/world/moonjob.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';

const gy = (x, z) => P.moonY(x, z);
const L = P.JUMP_LANE;
const HANG = 1.08;
const NOT_DEMO = () => 250;
const DONE = { step: 8, cells: 3, stamp: 0, scope: 3 };
// a solo walk count that gives each kind (the pick is pure: planMoonJob)
const visitsFor = (kind, bound = true) => { for (let v = 0; v < 500; v++) if (J.planMoonJob(undefined, v, { bound }).kind === kind) return v; throw new Error(`no walk for ${kind}`); };
const visitsForGlove = (spot) => { for (let v = 0; v < 500; v++) { const p = J.planMoonJob(undefined, v); if (p.kind === 'glove' && p.glove === spot) return v; } throw new Error('no glove walk'); };
const visitsForGuest = (g) => { for (let v = 0; v < 800; v++) { const p = J.planMoonJob(undefined, v); if (p.kind === 'guest' && p.guest === g) return v; } throw new Error('no guest walk'); };

function rig({ moon = DONE, journal = null, visits = 0, roomSeed, boundOn, reducedMotion = false, storage = mem(), log: logIn = null, restore = null } = {}) {
  const progression = createProgression(storage);
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  if (journal) progression.state.journal = { ...progression.state.journal, ...journal };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = logIn ?? createDiscoveryLog(progression);
  if (!logIn) log.startWalk();
  if (restore) log.restore(restore);
  const page = fakePage();
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: NOT_DEMO, visits, roomSeed, boundOn });
  const camera = new THREE.PerspectiveCamera();
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0, collectibleMeshes: new Map(P.PEBBLES.map((p) => [p.id, new THREE.Object3D()])) };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const where = { x: 0, y: 0, z: 45 };
  let t = 0;
  const frame = () => { t += 1 / 30; life.update(1 / 30, t, where, camera, session); if (session.pounceTime > 0) session.pounceTime -= 1 / 30; };
  const move = (p) => { Object.assign(where, p); cat.position.set(where.x, where.y, where.z); };
  const step = (secs, at) => { if (at) move(at); for (let i = 0; i < Math.round(secs * 30); i++) frame(); };
  const press = () => { const line = life.promptAt(where); life.interact(); return line; };
  const pays = () => events.filter((e) => e.type === 'moonjob');
  const lines = () => events.filter((e) => e.type === 'greenhousenote').map((e) => e.label);
  move(where);
  return { scene, area, life, job: life.job, progression, page, camera, cat, session, events, where, move, step, press, pays, lines, log, storage, frame, dispose() { off(); life.dispose(); } };
}
const named = (scene, n) => scene.getObjectByName(n);
const points = (r) => r.progression.state.points;
const mnjob = (r) => r.progression.state.journal.mnjob ?? 0;

// ---- today's errand, each one done for real --------------------------------------------------------------------------------------------
const atTray = (r) => r.step(0.1, { x: J.SAMPLE_TRAY.x + 1.2, z: J.SAMPLE_TRAY.z, y: gy(J.SAMPLE_TRAY.x, J.SAMPLE_TRAY.z) });
const DOERS = {
  pebbles(r) {
    r.step(0.2);
    for (const id of ['moon-1', 'moon-4', 'moon-7']) r.session.collectibleMeshes.delete(id);
    r.step(0.2);
    atTray(r);
    expect(r.press()).toBe('E — look at the tray');
  },
  rounds(r) {
    const s = { riding: true, seat: 0, x: 0, z: 0, yaw: 0 };
    Object.defineProperty(r.life.rover, 'state', { get: () => s });
    r.step(0.1);
    for (const p of J.ROUND_POSTS) { s.x = p.x + 1; s.z = p.z - 1; r.step(0.1); }
  },
  guest(r) {
    const O = P.OBSERVATORY;
    r.step(0.1, { x: O.x + 1.5, z: O.z, y: gy(O.x, O.z) });
    expect(r.press()).toBe('E — look through the telescope');
    const sc = r.life.star.scope;
    expect(sc.isOpen).toBe(true);
    const pic = r.job.plan.guest;
    const cs = P.OBSERVATORY && 5; // the guest is the sixth picture
    sc.place();
    for (let i = 0; i < J.GUEST_POOL[pic].pts.length; i++) {
      sc.place();
      const h = sc.hits.find((x) => x.c === cs && x.i === i);
      expect(h, `star ${i} is on the screen`).toBeTruthy();
      sc.tap(h.x, h.y);
    }
    sc.close();
  },
  bound(r) {
    // her best is 6.0 m; a 6.4 m hop is 40 cm past it
    const hop = (a, d) => {
      r.step(0.2, { x: L.x0 + a, z: L.z, y: 0 });
      r.session.pounceTime = HANG;
      const n = Math.round(HANG * 30);
      for (let i = 0; i < n; i++) { r.where.x += d / n; r.frame(); }
      r.step(0.1);
    };
    hop(-0.4, 6.8);
  },
  rocket(r) {
    r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
    expect(r.press()).toBe('E — write a postcard');
    r.page.win.fire('keydown', { code: 'Digit2' });
    expect(r.life.launch.carryingCard).toBe(1);
    r.step(0.1, { x: P.ROCKET_SLOT.x - 1.0, z: P.ROCKET_SLOT.z + 1.0, y: gy(P.ROCKET.x, P.ROCKET.z) });
    expect(r.press()).toBe('E — post the postcard in the rocket');
    expect(r.life.launch.carryingCard).toBe(-1);
    r.step(0.1, { x: P.LAUNCH_DESK.x - 1.4, z: P.LAUNCH_DESK.z, y: gy(P.LAUNCH_DESK.x, P.LAUNCH_DESK.z) });
    expect(r.press()).toBe('E — press the big red button to launch!');
    r.step(6.5);
  },
  glove(r) {
    const g = J.GLOVE_SPOTS[r.job.plan.glove];
    r.step(0.1, { x: g.x + 1, z: g.z, y: 0 });
    expect(r.press()).toBe('E — pick up the glove');
    expect(r.job.state.glove).toBe('carried');
    const pip = r.life.base.pip.position;
    r.step(0.1, { x: pip.x + 1.2, z: pip.z, y: gy(pip.x, pip.z) });
    expect(r.press()).toBe('E — give Pip the glove');
  },
};

for (const boundOn of [true, false]) {
  describe(`each errand can be done without any bound (the bound's switch ${boundOn ? 'on' : 'off'})`, () => {
    const kinds = boundOn ? J.JOB_KINDS : J.JOB_KINDS.filter((k) => k !== 'bound');
    for (const kind of kinds) {
      it(`${kind}: done for real, pays 25 once, adds one postcard to the journal and the board`, () => {
        const r = rig({ visits: visitsFor(kind, boundOn), boundOn, moon: kind === 'bound' ? { ...DONE, jump: { tabby: 600 } } : DONE });
        expect(r.job.plan.kind).toBe(kind);
        expect(r.job.state.eligible).toBe(true);
        expect(r.job.state.done).toBe(false);
        const before = points(r);
        DOERS[kind](r);
        expect(r.job.state.done, 'done').toBe(true);
        expect(r.pays()).toHaveLength(1);
        expect(r.pays()[0].points).toBe(25);
        expect(points(r) - before).toBeGreaterThanOrEqual(25);
        expect(mnjob(r)).toBe(1);
        expect(r.log.count(J.JOB_KEY)).toBe(1);
        r.dispose();
      });
    }
    it('and the rest of the story is untouched: the step, the cells and the scope bits come out as they went in', () => {
      const r = rig({ visits: visitsFor('glove', boundOn), boundOn });
      DOERS.glove(r);
      expect(r.progression.state.moon).toMatchObject({ step: 8, cells: 3, stamp: 0, scope: 3 });
      r.dispose();
    });
  });
}

describe('the offer', () => {
  it('is made from the walk after the story: before the step 8 there is no errand, no prop, no goal and no pay', () => {
    for (const step of [0, 4, 5, 6, 7]) {
      const r = rig({ moon: { ...DONE, step }, visits: visitsFor('glove') });
      r.step(3);
      expect(r.job.state.eligible).toBe(false);
      expect(r.job.goal()).toBe(null);
      expect(named(r.scene, 'moon:jobglove')).toBeUndefined();
      expect(r.job.credit({ kind: 'job', job: 'glove' })).toBe(null);
      expect(r.pays()).toHaveLength(0);
      expect(mnjob(r)).toBe(0);
      r.dispose();
    }
  });
  it('a story that ends during this walk offers nothing until the next walk', () => {
    const r = rig({ moon: { ...DONE, step: 7 }, visits: visitsFor('glove') });
    r.progression.state.moon = { ...r.progression.state.moon, step: 8 };
    r.step(3);
    expect(r.job.state.eligible).toBe(false);
    expect(r.job.credit({ kind: 'job', job: r.job.plan.kind })).toBe(null);
    r.dispose();
  });
  it('is the same for every cat in a room: the seed picks the errand, the guest picture and the glove\'s spot, whatever her own walk count', () => {
    const a = rig({ roomSeed: 424242, visits: 3 });
    const b = rig({ roomSeed: 424242, visits: 91 });
    expect(a.job.plan).toEqual(b.job.plan);
    expect(a.job.plan).toEqual(J.planMoonJob(424242, 0));
    a.dispose(); b.dispose();
  });
  it('says the errand once in words, 2.5 s in ("Earth lost a glove. Can you find it?" for the glove), and the board says it again', () => {
    const r = rig({ visits: visitsFor('glove') });
    r.step(2);
    expect(r.lines()).not.toContain('Earth lost a glove. Can you find it?');
    r.step(1);
    expect(r.lines().filter((l) => l === 'Earth lost a glove. Can you find it?')).toHaveLength(1);
    r.step(5);
    expect(r.lines().filter((l) => l === 'Earth lost a glove. Can you find it?')).toHaveLength(1);
    r.step(0.1, { x: P.BOARD.x + 1.5, z: P.BOARD.z, y: gy(P.BOARD.x, P.BOARD.z) });
    r.press();
    expect(r.lines().filter((l) => l === 'Earth lost a glove. Can you find it?')).toHaveLength(2);
    r.dispose();
  });
  it('the gold ring points at the glove\'s spot, then at Pip once the glove is in her mouth', () => {
    const r = rig({ visits: visitsForGlove(3) });
    const g = J.GLOVE_SPOTS[3];
    r.step(0.1, { x: P.BOARD.x + 1.5, z: P.BOARD.z, y: gy(P.BOARD.x, P.BOARD.z) });
    r.press();
    r.step(0.3);
    const ring = named(r.scene, 'moon:goalring');
    expect(ring.visible).toBe(true);
    expect(Math.hypot(ring.position.x - g.x, ring.position.z - g.z)).toBeLessThan(0.1);
    r.step(0.1, { x: g.x + 1, z: g.z, y: 0 });
    r.press();
    r.step(0.1, { x: P.BOARD.x + 1.5, z: P.BOARD.z, y: gy(P.BOARD.x, P.BOARD.z) });
    r.press();
    r.step(0.3);
    const pip = r.life.base.pip.position; // the light column follows the goal, which is Pip (looked at four times a second)
    expect(Math.hypot(ring.position.x - pip.x, ring.position.z - pip.z)).toBeLessThan(3);
    expect(Math.hypot(ring.position.x - g.x, ring.position.z - g.z)).toBeGreaterThan(1);
    r.dispose();
  });
  it('once it is done, the board and the ring go back to the story\'s own end (the cave while the Deep Cell is out)', () => {
    const r = rig({ visits: visitsFor('glove') });
    DOERS.glove(r);
    r.step(0.1, { x: P.BOARD.x + 1.5, z: P.BOARD.z, y: gy(P.BOARD.x, P.BOARD.z) });
    r.press();
    r.step(0.3);
    const ring = named(r.scene, 'moon:goalring');
    expect(Math.hypot(ring.position.x - P.MOUTH_FRONT.x, ring.position.z - P.MOUTH_FRONT.z)).toBeLessThan(0.1);
    r.dispose();
  });
});

describe('paid once a walk, and the album', () => {
  it('a second finish, a partner\'s credit after it and a re-press pay nothing more', () => {
    const r = rig({ visits: visitsFor('glove') });
    DOERS.glove(r);
    expect(r.pays()).toHaveLength(1);
    expect(r.job.credit({ kind: 'job', job: 'glove' })).toBe(null);
    r.step(2);
    expect(r.pays()).toHaveLength(1);
    expect(mnjob(r)).toBe(1);
    r.dispose();
  });
  it('a resumed walk (the log\'s entries put back) that already paid it offers nothing and cannot pay again; a fresh walk pays again and the album grows', () => {
    const a = rig({ visits: visitsFor('glove') });
    DOERS.glove(a);
    const entries = a.log.entries();
    const storage = a.storage;
    a.dispose();
    const b = rig({ visits: visitsFor('glove'), storage, restore: entries, moon: null });
    expect(b.job.state.done).toBe(true);
    expect(named(b.scene, 'moon:jobglove')).toBeUndefined();
    expect(b.job.credit({ kind: 'job', job: 'glove' })).toBe(null);
    expect(b.pays()).toHaveLength(0);
    expect(mnjob(b)).toBe(1);
    b.dispose();
    const c = rig({ visits: visitsFor('glove'), storage, moon: null });
    DOERS.glove(c);
    expect(c.pays()).toHaveLength(1);
    expect(mnjob(c)).toBe(2);
    c.dispose();
  });
  it('the board shows today\'s errand and the album: the count of earned postcards and the errand\'s tick once it is done', () => {
    const r = rig({ visits: visitsFor('glove'), journal: { mnjob: 4 } });
    const seen = [];
    const set = r.life.base.board.setAlbum;
    r.life.base.board.setAlbum = (a) => { seen.push(a); return set(a); };
    DOERS.glove(r);
    const last = seen.at(-1);
    expect(last).toMatchObject({ count: 5, job: '🧤', jobDone: true });
    expect(last.cards).toHaveLength(12);
    r.dispose();
  });
  it('the twelfth postcard fills the album and Pip says so; later errands still pay, the count stops at twelve on the board', () => {
    const r = rig({ visits: visitsFor('glove'), journal: { mnjob: 11 } });
    DOERS.glove(r);
    r.step(3);
    expect(r.lines()).toContain('The album is full! Pip loves every postcard.');
    expect(J.albumCount(mnjob(r))).toBe(12);
    r.dispose();
    const again = rig({ visits: visitsFor('glove'), journal: { mnjob: 12 } });
    DOERS.glove(again);
    again.step(3);
    expect(again.pays()).toHaveLength(1);
    expect(again.lines()).not.toContain('The album is full! Pip loves every postcard.');
    expect(J.albumCount(mnjob(again))).toBe(12);
    again.dispose();
  });
});

describe('a partner in the room (the credit hook: the wire event is the room milestone\'s)', () => {
  it('a partner\'s finished errand counts here too when it is today\'s own, once; any other errand, a bad shape or a prototype key is ignored', () => {
    const r = rig({ roomSeed: 555, visits: 0 });
    const kind = r.job.plan.kind;
    for (const bad of [null, undefined, 'job', 5, {}, { kind: 'job' }, { kind: 'job', job: 'nope' }, { kind: 'job', job: JSON.parse('{"__proto__":1}') }, { kind: 'wake', job: kind }]) expect(r.life.credit(bad) ?? null).toBe(null);
    const other = J.JOB_KINDS.find((k) => k !== kind);
    expect(r.life.credit({ kind: 'job', job: other }) ?? null).toBe(null);
    expect(r.pays()).toHaveLength(0);
    expect(r.life.credit({ kind: 'job', job: kind })).toBe('job');
    expect(r.pays()).toHaveLength(1);
    expect(mnjob(r)).toBe(1);
    expect(r.life.credit({ kind: 'job', job: kind }) ?? null).toBe(null);
    expect(r.pays()).toHaveLength(1);
    r.dispose();
  });
  it('the story\'s own credits still go to the base: a launch and a plug are not taken for an errand', () => {
    const r = rig({ roomSeed: 555, visits: 0 });
    expect(r.life.credit({ kind: 'launch', t0: 0, now: 0.0 }) ?? null).not.toBe('job');
    expect(r.pays()).toHaveLength(0);
    r.dispose();
  });
});

describe('the props', () => {
  it('only today\'s errand makes a prop: one mesh, never a caster, none for the errands that need none', () => {
    const names = ['moon:jobtray', 'moon:jobglove', 'moon:jobmarker'];
    const want = { pebbles: 'moon:jobtray', glove: 'moon:jobglove', rounds: 'moon:jobmarker', guest: null, bound: null, rocket: null };
    for (const kind of J.JOB_KINDS) {
      const r = rig({ visits: visitsFor(kind) });
      const have = names.filter((n) => named(r.scene, n));
      expect(have).toEqual(want[kind] ? [want[kind]] : []);
      for (const n of have) { const m = named(r.scene, n); expect(m.castShadow).toBe(false); expect(m.isMesh).toBe(true); }
      r.dispose();
      for (const n of names) expect(named(r.scene, n), `${kind} ${n} removed`).toBeUndefined();
    }
  });
  it('the glove and the tray are drawn only within 55 m of her (the draw gate), and the glove rides in her mouth when carried', () => {
    const g = J.GLOVE_SPOTS[J.planMoonJob(undefined, visitsFor('glove')).glove];
    const r = rig({ visits: visitsFor('glove') });
    const glove = named(r.scene, 'moon:jobglove');
    r.step(0.2, { x: g.x + 40, z: g.z, y: 0 });
    expect(glove.visible).toBe(true);
    r.step(0.2, { x: g.x + 56, z: g.z, y: 0 });
    expect(glove.visible).toBe(false);
    r.step(0.2, { x: g.x + 1, z: g.z, y: 0 });
    r.press();
    r.step(0.2, { x: g.x + 20, z: g.z, y: 0 });
    expect(glove.visible).toBe(true);
    expect(Math.hypot(glove.position.x - r.where.x, glove.position.z - r.where.z)).toBeLessThan(0.6);
    r.dispose();
    const t = rig({ visits: visitsFor('pebbles') });
    const tray = named(t.scene, 'moon:jobtray');
    t.step(0.2, { x: J.SAMPLE_TRAY.x + 56, z: J.SAMPLE_TRAY.z, y: 0 });
    expect(tray.visible).toBe(false);
    t.step(0.2, { x: J.SAMPLE_TRAY.x + 30, z: J.SAMPLE_TRAY.z, y: 0 });
    expect(tray.visible).toBe(true);
    t.dispose();
  });
  it('a cell in her mouth takes the glove\'s place: it goes back where it lay, never carried twice', () => {
    const r = rig({ visits: visitsFor('glove'), moon: { ...DONE, cells: 7 } });
    DOERS.glove; // (the Deep Cell is out only when bit 2 is not set; here it is plugged, so use the base's own state)
    const g = J.GLOVE_SPOTS[r.job.plan.glove];
    r.step(0.1, { x: g.x + 1, z: g.z, y: 0 });
    r.press();
    expect(r.job.state.glove).toBe('carried');
    // the base's record says a cell is in her mouth: the glove is put back
    Object.defineProperty(r.life.base, 'state', { get: () => ({ carrying: 2 }) });
    r.step(0.2);
    expect(r.job.state.glove).toBe('home');
    r.dispose();
  });
  it('the tray: fewer than three pebbles does not finish it; the pebbles she picked before the count began do not count; three do', () => {
    const r = rig({ visits: visitsFor('pebbles') });
    r.session.collectibleMeshes.delete('moon-2'); // picked before the walk's first frame
    r.step(0.2);
    for (const id of ['moon-3', 'moon-5']) r.session.collectibleMeshes.delete(id);
    r.step(0.2);
    expect(r.job.state.taken).toBe(2);
    atTray(r);
    r.press();
    expect(r.job.state.done).toBe(false);
    expect(r.lines()).toContain('Three glowing pebbles go in the tray.');
    r.session.collectibleMeshes.delete('moon-8');
    r.step(0.2);
    atTray(r);
    r.press();
    expect(r.job.state.done).toBe(true);
    r.dispose();
  });
  it('Dot\'s rounds: the ring shows the next post only, in order; passing a later post first does nothing; walking (not riding) counts nothing', () => {
    const r = rig({ visits: visitsFor('rounds') });
    const s = { riding: false, x: J.ROUND_POSTS[0].x, z: J.ROUND_POSTS[0].z };
    Object.defineProperty(r.life.rover, 'state', { get: () => s });
    r.step(0.2);
    expect(r.job.state.next).toBe(0);
    const m = named(r.scene, 'moon:jobmarker');
    expect(Math.hypot(m.position.x - J.ROUND_POSTS[0].x, m.position.z - J.ROUND_POSTS[0].z)).toBeLessThan(0.01);
    s.riding = true; s.x = J.ROUND_POSTS[3].x; s.z = J.ROUND_POSTS[3].z;
    r.step(0.2);
    expect(r.job.state.next).toBe(0);
    s.x = J.ROUND_POSTS[0].x; s.z = J.ROUND_POSTS[0].z;
    r.step(0.2);
    expect(r.job.state.next).toBe(1);
    expect(Math.hypot(m.position.x - J.ROUND_POSTS[1].x, m.position.z - J.ROUND_POSTS[1].z)).toBeLessThan(0.01);
    r.dispose();
  });
});

describe('the guest picture and the second rocket leave the story\'s pages as they were', () => {
  it('the guest picture is the telescope\'s sixth: never saved in the scope bits, the five are untouched, and the telescope opens on it', () => {
    const r = rig({ visits: visitsForGuest(5), moon: { ...DONE, scope: 7 } });
    const O = P.OBSERVATORY;
    r.step(0.1, { x: O.x + 1.5, z: O.z, y: gy(O.x, O.z) });
    r.press();
    const sc = r.life.star.scope;
    const guest = J.GUEST_POOL[5];
    expect(Math.abs(sc.view.b - guest.bearing)).toBeLessThan(0.01);
    expect(sc.view.e).toBeCloseTo(guest.elev, 5);
    sc.close();
    DOERS.guest(r);
    expect(r.progression.state.moon.scope).toBe(7);
    expect(r.life.star.guest).toBe(null);
    r.dispose();
  });
  it('a wrong guest star is a soft hmm and nothing is lost (the picture keeps its pins), and no errand means no sixth picture', () => {
    const r = rig({ visits: visitsForGuest(2) });
    const O = P.OBSERVATORY;
    r.step(0.1, { x: O.x + 1.5, z: O.z, y: gy(O.x, O.z) });
    r.press();
    const sc = r.life.star.scope;
    sc.place();
    const n = J.GUEST_POOL[2].pts.length;
    const h = (i) => sc.hits.find((x) => x.c === 5 && x.i === i);
    sc.tap(h(0).x, h(0).y);
    sc.tap(h(2).x, h(2).y); // out of order
    expect(r.job.state.done).toBe(false);
    for (let i = 1; i < n; i++) { sc.place(); sc.tap(h(i).x, h(i).y); }
    expect(r.job.state.done).toBe(true);
    expect(sc.said.text).toBe('You drew a House!');
    sc.close();
    r.dispose();
    const other = rig({ visits: visitsFor('glove') });
    other.step(0.1, { x: O.x + 1.5, z: O.z, y: gy(O.x, O.z) });
    other.press();
    other.life.star.scope.place();
    expect(other.life.star.scope.hits.some((x) => x.c === 5)).toBe(false);
    other.life.star.scope.close();
    other.dispose();
  });
  it('the second rocket: the desk, the slot and the button work again after the story, save nothing of the story, and a card in her mouth is let go when the errand is done elsewhere', () => {
    const r = rig({ visits: visitsFor('rocket') });
    DOERS.rocket(r);
    expect(r.progression.state.moon).toMatchObject({ step: 8, stamp: 0 });
    expect(r.job.state.done).toBe(true);
    expect(r.life.launch.second).toBe(null);
    // a second walk's partner finishes it while she holds the card
    const q = rig({ visits: visitsFor('rocket') });
    q.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
    q.press();
    q.page.win.fire('keydown', { code: 'Digit1' });
    expect(q.life.launch.carryingCard).toBe(0);
    q.life.credit({ kind: 'job', job: 'rocket' });
    q.step(0.2);
    expect(q.life.launch.carryingCard).toBe(-1);
    r.dispose(); q.dispose();
  });
  it('without an errand the Message Desk and the slot are the story\'s alone: nothing to write after the story (the desk only offers a postcard while the mission needs one)', () => {
    const r = rig({ visits: visitsFor('glove') });
    r.step(0.1, { x: P.MESSAGE_DESK.x + 1.4, z: P.MESSAGE_DESK.z, y: gy(P.MESSAGE_DESK.x, P.MESSAGE_DESK.z) });
    expect(r.life.promptAt(r.where) ?? '').not.toMatch(/postcard/);
    r.dispose();
  });
  it('the bound errand takes a plain hop on the board\'s lane: a hop 9 cm past her best does not count, 10 cm does', () => {
    const r = rig({ visits: visitsFor('bound'), moon: { ...DONE, jump: { tabby: 600 } } });
    const hop = (a, d) => {
      r.step(0.2, { x: L.x0 + a, z: L.z, y: 0 });
      r.session.pounceTime = HANG;
      const n = Math.round(HANG * 30);
      for (let i = 0; i < n; i++) { r.where.x += d / n; r.frame(); }
      r.step(0.1);
    };
    hop(-0.4, 6.3); // 5.9 m: not a record
    expect(r.job.state.done).toBe(false);
    hop(-0.4, 6.45); // 6.05 m: a record by 5 cm, not by 10
    expect(r.progression.state.moon.jump.tabby).toBe(605);
    expect(r.job.state.done).toBe(false);
    hop(-0.4, 6.6); // 6.2 m: 15 cm past her best
    expect(r.job.state.done).toBe(true);
    r.dispose();
  });
});

describe('the walk end', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  it('disposing removes every prop and hook; nothing but the journal count is written', () => {
    const r = rig({ visits: visitsFor('guest') });
    expect(r.life.star.guest).not.toBe(null);
    r.dispose();
    expect(r.life.star.guest).toBe(null);
    const q = rig({ visits: visitsFor('rocket') });
    expect(q.life.launch.second).not.toBe(null);
    q.dispose();
    expect(q.life.launch.second).toBe(null);
    const keys = Object.keys(q.progression.state.moon).sort();
    expect(keys).toEqual(['cells', 'jump', 'scope', 'stamp', 'step']);
  });
  it('an errand never saves a step, a cell, a stamp or a scope bit: a whole day of each errand leaves the moon record as it was', () => {
    for (const kind of J.JOB_KINDS) {
      const moon = kind === 'bound' ? { ...DONE, jump: { tabby: 600 } } : DONE;
      const r = rig({ visits: visitsFor(kind), moon });
      const before = JSON.stringify(r.progression.state.moon);
      DOERS[kind](r);
      const after = JSON.parse(JSON.stringify(r.progression.state.moon));
      const was = JSON.parse(before);
      if (kind === 'bound') { delete after.jump; delete was.jump; }
      expect(after, kind).toEqual(was);
      r.dispose();
    }
  });
});

describe('start-up: nothing outside the Moon\'s files names the errands, and the files import only what the Moon\'s chunk already holds', () => {
  const files = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
  it('no start-up file names the errands\' files; both are Moon-prefixed; the save and the awards are untouched by this milestone', () => {
    for (const f of files) {
      if (/^src\/world\/moon[a-z]*\.js$/.test(f)) continue;
      const text = readFileSync(f, 'utf8');
      for (const m of ['moonjob', 'moonjoblive']) expect(text, `${f} names ${m}`).not.toMatch(new RegExp(`\\b${m}\\.js`));
    }
    expect(files).toContain('src/world/moonjob.js');
    expect(files).toContain('src/world/moonjoblive.js');
    for (const f of ['moonjob', 'moonjoblive']) {
      const src = readFileSync(`src/world/${f}.js`, 'utf8');
      for (const m of src.matchAll(/^import .*?from '(.+?)';/gm)) expect(m[1], `${f} imports ${m[1]}`).toMatch(/^(three|three\/examples\/jsm\/utils\/BufferGeometryUtils\.js|\.\/(builder|localuuids|moon[a-z]*)\.js|\.\.\/(clanphrases|events)\.js)$/);
    }
  });
});
