import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createMarkContest, contestToast, CONTEST_EVERY } from '../src/markcontest.js';
import { createPlayerMarks } from '../src/render/playermarks.js';
import { markKey } from '../src/marks.js';
import { propsFor } from '../src/propsets.js';
import { rivalFor } from '../src/rivalclans.js';
import { createProgression } from '../src/progression.js';

// v21 3b Task 12 — the rival clan scents over your marks near its border.

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

const POST = propsFor('park').markables.find((m) => m.nearBorder);
const { cx, cz, r } = rivalFor('park');
const NAME = rivalFor('park').name;
const SCRATCH_TOAST = `${NAME} scented over your mark! Scratch it again to take it back. 🐾`;
const PLAIN_TOAST = `${NAME} scented over your mark! 🐾`;
const FAR = { x: cx - r, z: cz }; // the far side of the ring from the post

// `mine` defaults to: near the border, my scratch on the contest-band post, a
// drop just outside the ring, a border paw of mine beside the post; far away,
// a dig in the middle of the park and a drop by the gate.
function contestHarness({ payload = {}, mine } = {}) {
  const progression = createProgression(fakeStorage());
  progression.replaceFromPayload({ version: 4, ...payload });
  const now = 1_000_000;
  const marks = mine ?? [
    { kind: 'scratch', id: POST.id, x: POST.x, z: POST.z, at: now + 1, contested: false, item: null },
    { kind: 'drop', id: 'park-stick-1', x: cx + r + 0.5, z: cz, at: now + 2, contested: false, item: 'stick' },
    { kind: 'border', id: 'park-border-2', x: POST.x + 0.2, z: POST.z, at: now + 3, contested: false, item: null },
    { kind: 'dig', id: null, x: 0, z: 0, at: now + 4, contested: false, item: null },
    { kind: 'drop', id: 'park-sock-1', x: 0, z: 40, at: now + 5, contested: false, item: 'sock' },
  ];
  for (const m of marks) progression.addMark('park', m);
  const playerMarks = createPlayerMarks(new THREE.Scene(), 'park', progression.marksIn('park'));
  const toasts = [];
  let pos = FAR;
  let chasing = false;
  const contest = createMarkContest({
    areaId: 'park', progression, playerMarks,
    patrolPos: () => pos, isChasing: () => chasing, toast: (t) => toasts.push(t),
  });
  return {
    progression, playerMarks, toasts, contest,
    moveTo: (p) => { pos = p; },
    setChasing: (v) => { chasing = v; },
    // a re-scratch, as interactions.js's leaveMark does it
    rescratch: (at) => {
      progression.addMark('park', { kind: 'scratch', id: POST.id, x: POST.x, z: POST.z, at, contested: false, item: null });
      playerMarks.sync(progression.marksIn('park'));
    },
  };
}
const shape = (list) => list.map(({ contested, ...rest }) => rest);
const allButMarks = (p) => JSON.stringify({ ...p.state, marks: undefined });

describe('createMarkContest: the rival scents over your marks', () => {
  it('a contested mark survives: same count before and after, only contested flips', () => {
    const h = contestHarness();
    const before = h.progression.marksIn('park');
    expect(before).toHaveLength(5);
    h.contest.tick(1);
    expect(h.progression.marksIn('park')).toEqual(before); // patrol far away: nothing
    h.moveTo({ x: POST.x + 0.4, z: POST.z - 0.3 });
    h.contest.tick(CONTEST_EVERY);
    const after = h.progression.marksIn('park');
    expect(after).toHaveLength(before.length);
    expect(shape(after)).toEqual(shape(before));
    expect(after.map((m) => m.contested)).toEqual([true, false, false, false, false]);
    // drawn pale at once, and still drawn
    expect(h.playerMarks.list.find((e) => e.key === markKey(before[0])).contested).toBe(true);
    expect(h.playerMarks.list).toHaveLength(5);
    // one toast, in the rival's own name: a scratch can be taken back
    expect(h.toasts).toEqual([SCRATCH_TOAST]);
    // the patrol walks on to the drop by the ring: contested too, no second toast this walk
    h.moveTo({ x: cx + r, z: cz });
    h.contest.tick(CONTEST_EVERY);
    expect(h.progression.marksIn('park').map((m) => m.contested)).toEqual([true, true, false, false, false]);
    expect(h.toasts).toHaveLength(1);
    // the border paw beside the post is never contested back, however long the patrol stays
    h.moveTo({ x: POST.x + 0.2, z: POST.z });
    for (let i = 0; i < 20; i++) h.contest.tick(CONTEST_EVERY);
    expect(h.progression.marksIn('park')[2]).toMatchObject({ kind: 'border', contested: false });
    expect(h.progression.marksIn('park')).toHaveLength(5);
  });

  // R24: a dig or a drop cannot be scratched again, so its toast does not say to.
  it('the toast fits the first mark scented over: only a scratch says to scratch it again', () => {
    expect(contestToast(NAME, 'scratch')).toBe(SCRATCH_TOAST);
    expect(contestToast(NAME, 'dig')).toBe(PLAIN_TOAST);
    expect(contestToast(NAME, 'drop')).toBe(PLAIN_TOAST);
    for (const kind of ['drop', 'dig']) {
      const m = kind === 'drop'
        ? { kind: 'drop', id: 'park-stick-1', x: cx + r + 0.5, z: cz, at: 5, contested: false, item: 'stick' }
        : { kind: 'dig', id: null, x: cx + r + 0.5, z: cz, at: 5, contested: false, item: null };
      const h = contestHarness({ mine: [m] });
      h.moveTo({ x: m.x, z: m.z });
      h.contest.tick(CONTEST_EVERY);
      expect(h.progression.marksIn('park')[0].contested).toBe(true);
      expect(h.toasts).toEqual([PLAIN_TOAST]);
    }
    // the first one decides, and there is still only one a walk: a drop then a scratch
    const h = contestHarness();
    h.moveTo({ x: cx + r, z: cz });
    h.contest.tick(CONTEST_EVERY);
    h.moveTo({ x: POST.x, z: POST.z });
    h.contest.tick(CONTEST_EVERY);
    expect(h.progression.marksIn('park').slice(0, 2).map((m) => m.contested)).toEqual([true, true]);
    expect(h.toasts).toEqual([PLAIN_TOAST]);
  });

  // R25: an E press must never look like it did nothing.
  it('a re-scratch with the patrol still in reach is not taken straight back; the next pass can', () => {
    const h = contestHarness();
    const key = markKey({ kind: 'scratch', id: POST.id });
    const scratchNow = () => h.progression.marksIn('park').find((m) => markKey(m) === key);
    h.moveTo({ x: POST.x + 0.3, z: POST.z });
    h.contest.tick(CONTEST_EVERY);
    expect(scratchNow().contested).toBe(true);
    // the child scratches it again while the patrol cat is still right there
    h.rescratch(2_000_000);
    expect(scratchNow().contested).toBe(false);
    for (let i = 0; i < 12; i++) h.contest.tick(CONTEST_EVERY); // three seconds of it standing there
    expect(scratchNow().contested).toBe(false);
    expect(h.playerMarks.list.find((e) => e.key === key).contested).toBe(false);
    // still in reach as it walks on: still left alone
    h.moveTo({ x: POST.x + 1.4, z: POST.z });
    h.contest.tick(CONTEST_EVERY);
    expect(scratchNow().contested).toBe(false);
    // it walks out of reach, and comes round again on its next lap
    h.moveTo({ x: POST.x + 1.6, z: POST.z });
    h.contest.tick(CONTEST_EVERY);
    h.moveTo(FAR);
    h.contest.tick(CONTEST_EVERY);
    h.moveTo({ x: POST.x, z: POST.z + 0.5 });
    h.contest.tick(CONTEST_EVERY);
    expect(scratchNow().contested).toBe(true);
    expect(h.toasts).toHaveLength(1);
  });

  it('a first scratch made with the patrol right there is left alone too; one already there at walk start is not', () => {
    const h = contestHarness({ mine: [] });
    h.moveTo({ x: POST.x, z: POST.z });
    h.contest.tick(CONTEST_EVERY); // first check: nothing to see
    h.rescratch(3_000_000);
    for (let i = 0; i < 4; i++) h.contest.tick(CONTEST_EVERY);
    expect(h.progression.marksIn('park')[0].contested).toBe(false);
    // a mark from an earlier walk, with the patrol on it at the first check, is scented over
    const g = contestHarness();
    g.moveTo({ x: POST.x, z: POST.z });
    g.contest.tick(CONTEST_EVERY);
    expect(g.progression.marksIn('park')[0].contested).toBe(true);
  });

  // R26: the contest toast never lands on top of the chase toast.
  it('while a chase is on the toast waits, and shows once it settles, once', () => {
    const h = contestHarness();
    h.setChasing(true);
    h.moveTo({ x: POST.x, z: POST.z });
    h.contest.tick(CONTEST_EVERY);
    expect(h.progression.marksIn('park')[0].contested).toBe(true); // the mark still goes pale
    for (let i = 0; i < 10; i++) h.contest.tick(1 / 60);
    expect(h.toasts).toEqual([]);
    h.setChasing(false);
    h.contest.tick(1 / 60); // the very next frame, not the next check
    expect(h.toasts).toEqual([SCRATCH_TOAST]);
    // a later contest and a later chase change nothing: one a walk
    h.moveTo({ x: cx + r, z: cz });
    h.setChasing(true);
    h.contest.tick(CONTEST_EVERY);
    h.setChasing(false);
    for (let i = 0; i < 8; i++) h.contest.tick(CONTEST_EVERY);
    expect(h.toasts).toHaveLength(1);
  });

  it('contesting touches nothing but marks', () => {
    const h = contestHarness({
      payload: {
        points: 345,
        golden: ['gm-park-1'],
        friends: { Pickles: { greets: 3 } },
        grudges: ['Mochi'],
      },
    });
    const before = allButMarks(h.progression);
    const { points, colony, friends, grudges, golden } = JSON.parse(before);
    // the save really has something to lose
    expect(points).toBe(345);
    expect(golden).toEqual(['gm-park-1']);
    expect(Object.keys(friends)).toEqual(['Pickles']);
    expect(grudges).toEqual(['Mochi']);
    h.moveTo({ x: POST.x, z: POST.z });
    for (let i = 0; i < 8; i++) h.contest.tick(CONTEST_EVERY);
    expect(h.progression.marksIn('park')[0].contested).toBe(true);
    expect(allButMarks(h.progression)).toBe(before);
    const now = h.progression.state;
    expect(now.points).toEqual(points);
    expect(JSON.parse(JSON.stringify({ colony: now.colony, friends: now.friends, grudges: now.grudges, golden: now.golden })))
      .toEqual(JSON.parse(JSON.stringify({ colony, friends, grudges, golden })));
  });

  it('checks at most 4 times a second, with no per-frame copy of the save', () => {
    const h = contestHarness();
    let reads = 0;
    const marksIn = h.progression.marksIn;
    h.progression.marksIn = (a) => { reads += 1; return marksIn(a); };
    const clone = globalThis.structuredClone;
    let clones = 0;
    globalThis.structuredClone = (v) => { clones += 1; return clone(v); };
    try {
      for (let i = 0; i < 60; i++) h.contest.tick(1 / 60);
    } finally {
      globalThis.structuredClone = clone;
    }
    expect(CONTEST_EVERY).toBe(0.25);
    expect(reads).toBeLessThanOrEqual(4);
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(clones).toBe(0);
  });

  it('no rival, no patrol position, or a bad tick: nothing happens', () => {
    const progression = createProgression(fakeStorage());
    progression.addMark('den', { kind: 'den', id: 'den-sock-1', x: 0, z: 0, at: 1, contested: false, item: 'sock' });
    const toasts = [];
    const den = createMarkContest({ areaId: 'den', progression, playerMarks: null, patrolPos: () => ({ x: 0, z: 0 }), toast: (t) => toasts.push(t) });
    expect(() => den.tick(1)).not.toThrow();
    const h = contestHarness();
    const before = h.progression.marksIn('park');
    const none = createMarkContest({ areaId: 'park', progression: h.progression, playerMarks: h.playerMarks, patrolPos: () => null, toast: (t) => toasts.push(t) });
    none.tick(1);
    h.moveTo({ x: POST.x, z: POST.z });
    for (const bad of [NaN, -1, undefined, Infinity, '1']) h.contest.tick(bad);
    expect(h.progression.marksIn('park')).toEqual(before);
    expect(toasts).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it('is a leaf: no THREE, no DOM, nothing that stores or sends but what it is handed', () => {
    const src = readFileSync(new URL('../src/markcontest.js', import.meta.url), 'utf8');
    const specs = [...src.matchAll(/^import .* from '([^']+)';/gm)].map((m) => m[1]).sort();
    expect(specs).toEqual(['./marks.js', './rivalclans.js']);
  });
});

// The walk wires both halves around the 3a chase slice, which stays clean
// (rivalcats.test.js scans it for banned words).
it('walk.js reads my saved border marks before the rival slice and contests after it, holding the toast through a chase', () => {
  const src = readFileSync(new URL('../src/game/walk.js', import.meta.url), 'utf8');
  const a = src.indexOf("The rival's border and its patrol");
  const b = src.indexOf('session.rival = {', a);
  const saved = src.indexOf('const myBorderIds');
  const contest = src.indexOf('createMarkContest(');
  expect(saved).toBeGreaterThan(0);
  expect(saved).toBeLessThan(a);
  expect(contest).toBeGreaterThan(b);
  expect(src).toContain('const NO_RIVAL = { update() {}, dispose() {}, patrolPos: () => null, borderMarks: null };');
  expect(src.slice(b, contest)).toContain('patrolPos: () => patrol.pos');
  expect(src.slice(b, contest)).toContain('borderMarks: marks');
  expect(src.slice(contest, contest + 400)).toContain('isChasing: () => session.chasing === true');
  // its own module now: walk.js does not reach into interactions.js for it
  expect(src).toContain("import { createMarkContest } from '../markcontest.js';");
  expect(src).not.toMatch(/from '\.\/interactions\.js'/);
});
