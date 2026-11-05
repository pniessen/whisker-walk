import { describe, test, expect } from 'vitest';
import * as THREE from 'three';
import { rivalFor, isTrespassing } from '../src/rivalclans.js';
import { patrolAt, createRivalPatrol, BORDER_VISIT, HOLD_MAX, NOTICE_DIST } from '../src/rivalcats.js';
import { borderWarriorFor } from '../src/clancast.js';

// The border patrol fight (2026-11-04): the patrol as a warrior who can be fought.
const AREA = 'moor';
const member = borderWarriorFor('moor', 1);
const DT = 1 / 30;

function mk({ intercept = () => true, foe = { member, scars: [] }, area = AREA } = {}) {
  const clock = { t: 1000 };
  const events = [];
  const scene = new THREE.Scene();
  const api = createRivalPatrol(scene, area, {
    now: () => clock.t, foe, intercept: () => intercept(),
    onChase: (who) => events.push(['chase', who]), onSettled: () => events.push(['settled']),
  });
  const { cx, cz } = rivalFor(area);
  // A cat inside the border, a metre in from the patrol toward the centre.
  const cat = () => {
    const p = patrolAt(area, clock.t);
    const d = Math.hypot(cx - p.x, cz - p.z);
    return new THREE.Vector3(p.x + ((cx - p.x) / d) * 1.5, 0, p.z + ((cz - p.z) / d) * 1.5);
  };
  const step = (pos, n = 1) => { for (let i = 0; i < n; i++) { clock.t += DT; api.update(DT, pos); } };
  return { clock, events, scene, api, cat, step };
}

describe('the border patrol foe', () => {
  test('no foe, or a foe on an old area, is today\'s patrol', () => {
    const plain = createRivalPatrol(new THREE.Scene(), AREA, { now: () => 1000 });
    expect(plain.foe).toBeNull();
    const old = createRivalPatrol(new THREE.Scene(), 'park', { now: () => 1000, foe: { member } });
    expect(old.foe).toBeNull();
    const wrongClan = createRivalPatrol(new THREE.Scene(), 'woods', { now: () => 1000, foe: { member } });
    expect(wrongClan.foe).toBeNull();
  });

  test('it is the warrior: its mesh is built for it, and it names itself in the chase', () => {
    const h = mk({ intercept: () => false });
    expect(h.scene.children[0].userData.borderFoe).toBe(true);
    const c = h.cat();
    h.step(c);
    expect(h.events[0]).toEqual(['chase', member.name]);
    expect(h.api.foe.current()).toMatchObject({ visit: BORDER_VISIT, clan: 'moor', member, state: 'resting' });
  });

  test('when the fight intercepts, it squares up: no chase, it stands still and falls behind its clock', () => {
    const h = mk();
    const c = h.cat();
    h.step(c);
    expect(h.events).toEqual([]);
    expect(h.api.state).toBe('standoff');
    expect(h.api.foe.current().state).toBe('walking');
    const at = h.api.pos;
    h.step(c, 60);
    expect(h.api.pos).toEqual(at);
    expect(h.api.lag).toBeCloseTo(60 * DT, 6);
  });

  test('when the pill goes, it glides back to its ring and catches up with its clock', () => {
    let up = true;
    const h = mk({ intercept: () => up });
    const c = h.cat();
    h.step(c, 90);
    up = false;
    const away = new THREE.Vector3(60, 0, 60);
    h.step(away);
    expect(h.api.state).toBe('return');
    h.step(away, 30 * 20);
    expect(h.api.state).toBe('patrol');
    expect(h.api.lag).toBe(0);
    const p = patrolAt(AREA, h.clock.t);
    expect(h.api.pos.x).toBeCloseTo(p.x, 9);
    expect(h.api.pos.z).toBeCloseTo(p.z, 9);
    expect(h.events).toEqual([]);
  });

  test('chaseNow runs today\'s chase from where it stands, once', () => {
    const h = mk();
    const c = h.cat();
    h.step(c, 10);
    h.api.chaseNow();
    h.step(c);
    expect(h.events).toEqual([['chase', member.name]]);
    h.step(c, 40);
    expect(isTrespassing(AREA, c.x, c.z)).toBe(false);
    expect(h.events.filter((e) => e[0] === 'chase')).toHaveLength(1);
  });

  test('held: it stays and faces its holder, my staging places it, release sends it home', () => {
    const h = mk();
    const c = h.cat();
    h.step(c);
    const f = h.api.foe;
    f.hold(BORDER_VISIT, 'me', { x: c.x, z: c.z }, { local: true });
    expect(f.current().state).toBe('held');
    expect(f.holders(BORDER_VISIT)).toEqual(['me']);
    f.stage(BORDER_VISIT, { pose: 'swipe', x: 3, z: -40, y: 0.1, pitch: 0.2, roll: 0 });
    h.step(c);
    const g = h.scene.children[0];
    expect([g.position.x, g.position.y, g.position.z]).toEqual([3, 0.1, -40]);
    expect(g.rotation.x).toBe(0.2);
    f.release(BORDER_VISIT, 'me');
    expect(h.api.state).toBe('return');
    h.step(c);
    expect(g.rotation.x).toBe(0);
    expect(h.events).toEqual([]);
    // the wrong visit is ignored
    f.hold(7, 'me', null, { local: true });
    expect(h.api.state).toBe('return');
    expect(f.measure(7)).toBeNull();
    expect(f.measure(BORDER_VISIT).top).toBeGreaterThan(0);
  });

  test('a win: it stands down and never pills or chases again this walk', () => {
    const h = mk();
    const c = h.cat();
    h.step(c);
    const f = h.api.foe;
    f.hold(BORDER_VISIT, 'me', c, { local: true });
    f.flee(BORDER_VISIT);
    expect(f.isFled(BORDER_VISIT)).toBe(true);
    expect(f.current().state).toBe('passed');
    h.api.chaseNow();
    for (let i = 0; i < 30 * 60; i++) h.step(h.cat());
    expect(h.events).toEqual([]);
  });

  test("a co-walker's hold keeps it standing after my win, and expires after HOLD_MAX", () => {
    const h = mk();
    const c = h.cat();
    const f = h.api.foe;
    f.hold(BORDER_VISIT, 'sis', { x: 0, z: 0 });
    f.hold(BORDER_VISIT, 'me', c, { local: true });
    f.flee(BORDER_VISIT);
    expect(h.api.state).toBe('held');
    expect(f.holders(BORDER_VISIT)).toEqual(['sis']);
    h.step(c, Math.ceil(HOLD_MAX / DT) + 2);
    expect(h.api.state).not.toBe('held');
  });

  test('dropHolder lets go of a co-walker who left', () => {
    const h = mk();
    const f = h.api.foe;
    f.hold(BORDER_VISIT, 'sis', { x: 0, z: 0 });
    f.dropHolder('sis');
    expect(h.api.state).toBe('return');
  });

  test('a cat further than NOTICE_DIST is never squared up to', () => {
    const asked = [];
    const h = mk({ intercept: () => { asked.push(1); return true; } });
    const p = patrolAt(AREA, h.clock.t);
    const { cx, cz } = rivalFor(AREA);
    const d = Math.hypot(cx - p.x, cz - p.z);
    const far = new THREE.Vector3(p.x + ((cx - p.x) / d) * (NOTICE_DIST + 1.2), 0, p.z + ((cz - p.z) / d) * (NOTICE_DIST + 1.2));
    h.step(far);
    expect(asked).toEqual([]);
    expect(h.api.state).toBe('patrol');
  });
});
