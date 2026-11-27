// Milestone C1 of the Crystal Cave second story: the pure rules (mission and unlock, prism puzzle, wall phrase, Tink follower, errand plan). No THREE, no clock.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as M from '../src/world/crystaldeepmission.js';
import * as PR from '../src/world/crystaldeepprism.js';
import * as W from '../src/world/crystaldeepwall.js';
import * as T from '../src/world/crystaldeeptink.js';
import * as E from '../src/world/crystaldeeperrand.js';
import * as P from '../src/world/crystalplan.js';
import * as S from '../src/world/crystalstory.js';
import { CRYSTAL_COLLECTIBLES, CRYSTAL_GOLD, CRYSTAL_FIND_ZONES } from '../src/world/crystalfindsplan.js';
import { PADS, newRun, advance, TIMING, PAD_COUNT } from '../src/world/crystalsongplan.js';

const OPEN = { step: 7, songs: 7, album: 3, deep: 0 };

describe('mission rules', () => {
  it('unlock needs the story, all tunes and two rubbings', () => {
    expect(M.isOpen(OPEN)).toBe(true);
    expect(M.isOpen({ ...OPEN, step: 6 })).toBe(false);
    expect(M.isOpen({ ...OPEN, songs: 3 })).toBe(false);
    expect(M.isOpen({ ...OPEN, album: 1 })).toBe(false);
    expect(M.isOpen({ ...OPEN, album: 0b101 })).toBe(true);
    for (const junk of [null, undefined, 5, 'x', [], { step: 'x' }, { step: NaN, songs: Infinity, album: -1 }]) expect(M.isOpen(junk)).toBe(false);
  });
  it('steps go in order, once, and need the unlock', () => {
    let r = { ...OPEN };
    expect(M.apply(r, { kind: 'prism' }).changed).toBe(false); // out of order
    expect(M.apply({ ...r, album: 1 }, { kind: 'wall' }).changed).toBe(false); // not open
    for (const [i, k] of M.KINDS.entries()) {
      const a = M.apply(r, { kind: k });
      expect(a).toMatchObject({ changed: true, effect: k });
      expect(a.crystal.deep).toBe((1 << (i + 1)) - 1);
      expect(M.apply(a.crystal, { kind: k }).changed).toBe(false);
      r = a.crystal;
    }
    expect(M.told(r)).toBe(true);
    expect(M.apply(r, { kind: 'bogus' }).changed).toBe(false);
    expect(M.apply(r, null).changed).toBe(false);
  });
  it('keeps the other keys and never touches its input', () => {
    const r = Object.freeze({ ...OPEN, forge: 9, sparks: 7 });
    const a = M.apply(r, { kind: 'wall' });
    expect(a.crystal).toMatchObject({ forge: 9, sparks: 7, deep: 1 });
    expect(r.deep).toBe(0);
  });
  it('hostile bits are repaired (each implies the ones before)', () => {
    for (const junk of [-5, 1.5, 1e12, 'x', null, NaN, Infinity, [], {}]) { const b = M.deepBits({ deep: junk }); expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(15); expect(Number.isInteger(b)).toBe(true); }
    expect([8, 4, 2, 1, 0].map((deep) => M.deepBits({ deep }))).toEqual([15, 7, 3, 1, 0]);
    expect(M.deepBits(null)).toBe(0);
  });
  it('credit takes every step before the one a partner did, in any order of arrival', () => {
    expect(M.credit(OPEN, { kind: 'found' }).crystal.deep).toBe(7);
    expect(M.credit(OPEN, { kind: 'home' }).crystal.deep).toBe(15);
    let r = OPEN;
    for (const k of ['found', 'wall', 'home', 'prism']) r = M.credit(r, { kind: k }).crystal;
    expect(r.deep).toBe(15);
    expect(M.credit({ ...OPEN, album: 0 }, { kind: 'home' }).changed).toBe(false);
    expect(M.credit(OPEN, { kind: 'zz' }).changed).toBe(false);
  });
  it('a begun save stays unlocked, and the wire form round trips', () => {
    expect(M.unlocked({ deep: 1 })).toBe(true);
    for (const k of M.KINDS) expect(M.toStep(M.wire({ kind: k }))).toEqual({ kind: k });
    for (const bad of [null, {}, { kind: 'wc-forge' }, { kind: 'wd-errand' }, { kind: 'wd-x' }, 4]) expect(M.toStep(bad)).toBe(null);
  });
  it('the guide goal follows the bits', () => {
    expect(M.nextGoal({ ...OPEN, album: 0 }).kind).toBe('rest');
    expect([0, 1, 3, 7].map((deep) => M.nextGoal({ ...OPEN, deep }).kind)).toEqual(['hum', 'prisms', 'find', 'find']);
    expect(M.nextGoal({ ...OPEN, deep: 7 }, true).kind).toBe('walk');
    expect(M.nextGoal({ ...OPEN, deep: 15 }).kind).toBe('rest');
  });
});

describe('prism puzzle', () => {
  it('every start state reaches solved by turns alone, never fails', () => {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) {
      let f = [a, b, c];
      let n = 0;
      while (!PR.solved(f) && n < 20) { const i = PR.nextStand(f); const before = PR.turnsLeft(f); f = PR.turn(f, i); expect(PR.turnsLeft(f)).toBeLessThan(before); n++; }
      expect(PR.solved(f)).toBe(true);
      expect(n).toBeLessThanOrEqual(6);
    }
  });
  it('a stand cycles in three turns, a wrong turn only turns again, and a solved set holds', () => {
    let f = PR.START;
    for (let k = 0; k < 3; k++) f = PR.turn(f, 0, [9, 9, 9]);
    expect(f).toEqual(PR.START);
    expect(PR.solved(PR.TARGET)).toBe(true);
    expect(PR.turn(PR.TARGET, 1)).toEqual([...PR.TARGET]);
    expect(PR.solved(PR.START)).toBe(false);
    expect(PR.matches(PR.START).some(Boolean)).toBe(false);
    expect(PR.turn(PR.START, 7)).toEqual([...PR.START]);
  });
  it('hostile faces are cleaned, and colour and shape share the index', () => {
    for (const junk of [[-1, 1.5, 'x'], null, 'abc', [99, NaN, Infinity]]) for (const v of PR.clean(junk)) expect([0, 1, 2]).toContain(v);
    expect(PR.FACE_NAMES.length).toBe(PR.FACES); expect(PR.FACE_SHAPES.length).toBe(PR.FACES); expect(PR.COLOURS.length).toBe(PR.FACES);
    expect(new Set(PR.FACE_SHAPES).size).toBe(3);
  });
});

describe('wall phrase', () => {
  const run = (script) => { const w = W.newWall(); const out = []; for (const s of script) out.push(...(s.dt ? W.tick(w, s.dt) : W.step(w, s.pad))); return { w, out }; };
  it('five notes, no pad twice in a row, all real pads', () => {
    expect(W.WELCOME.length).toBe(5);
    W.WELCOME.forEach((p, i) => { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(PADS.length); if (i) expect(p).not.toBe(W.WELCOME[i - 1]); });
  });
  it('echoing the phrase opens the wall', () => {
    const w = W.newWall();
    const heard = [];
    for (let i = 0; i < 100 && w.run.phase !== 'echo'; i++) heard.push(...W.tick(w, 0.1).filter((e) => e.k === 'phrase').map((e) => e.pad));
    expect(heard).toEqual([...W.WELCOME]);
    let last = [];
    for (const p of W.WELCOME) last = W.step(w, p);
    expect(last.at(-1)).toEqual({ k: 'open', by: 'steps' });
    expect(w.open).toBe(true);
  });
  it('a wrong step only fades and replays; there is no fail event; waiting opens it by itself', () => {
    const w = W.newWall();
    const all = [];
    for (let i = 0; i < 4000 && !w.open; i++) {
      all.push(...W.tick(w, 0.1));
      if (w.run.phase === 'echo') all.push(...W.step(w, 0)); // always the wrong first pad
    }
    expect(w.open).toBe(true);
    expect(all.some((e) => e.k === 'open' && e.by === 'wait')).toBe(true);
    for (const e of all) expect(['phrase', 'listen', 'timeout', 'replay', 'miss', 'open', 'ok']).toContain(e.k);
    expect(W.tick(w, 1)).toEqual([]);
    expect(W.step(w, 1)).toEqual([]);
  });
  it('plays exactly like the singing chamber matcher (same timing, same events)', () => {
    const w = W.newWall(); const ref = newRun(W.WELCOME);
    expect(PAD_COUNT).toBe(7); expect(TIMING.wait).toBe(14);
    for (let i = 0; i < 300; i++) { const a = advance(ref, 0.1); const b = W.tick({ run: w.run, replays: 0, open: false }, 0.1).filter((e) => e.k !== 'open'); expect(b).toEqual(a); }
  });
  it('ignores junk pads and steps while the wall plays', () => {
    const w = W.newWall();
    expect(W.step(w, 1)).toEqual([]);
    for (const j of [-1, 7, 1.5, NaN, 'a', null]) expect(W.step(w, j)).toEqual([]);
    expect(W.tick(w, NaN)).toEqual([]);
  });
});

const flood = () => {
  const B = P.CRYSTAL_BOUNDS;
  const cols = S.storyColliders();
  const W2 = B.maxX - B.minX + 1;
  const seen = new Uint8Array(W2 * (B.maxZ - B.minZ + 1));
  const idx = (x, z) => (z - B.minZ) * W2 + (x - B.minX);
  const blocked = (x, z) => cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.4);
  const q = [[P.CRYSTAL_SPAWN.x, P.CRYSTAL_SPAWN.z]];
  seen[idx(...q[0])] = 1;
  while (q.length) {
    const [x, z] = q.pop();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const nz = z + dz;
      if (nx < B.minX || nx > B.maxX || nz < B.minZ || nz > B.maxZ || seen[idx(nx, nz)] || blocked(nx, nz)) continue;
      seen[idx(nx, nz)] = 1; q.push([nx, nz]);
    }
  }
  return { cols, reach: (s) => seen[idx(Math.round(s.x), Math.round(s.z))] === 1, B };
};

describe('Tink', () => {
  it('starts at the nest until home, then at the nook', () => {
    expect(T.startSpot(0)).toBe(T.NEST); expect(T.startSpot(7)).toBe(T.NEST); expect(T.startSpot(15)).toBe(T.NOOK);
    expect(T.atNook(T.NOOK)).toBe(true); expect(T.atNook(T.NEST)).toBe(false);
  });
  it('follows shyly: closes a gap, backs off when crowded, waits when not following', () => {
    const m = { x: 0, z: 0, yaw: 0 };
    for (let i = 0; i < 200; i++) T.tinkStep(m, { x: 6, z: 28 }, 0.05, { colliders: [] });
    expect(Math.hypot(m.x - 6, m.z - 28)).toBeLessThan(T.TINK.near + 0.5);
    const crowd = { x: 1, z: 1, yaw: 0 };
    T.tinkStep(crowd, { x: 1.2, z: 1 }, 0.1, { colliders: [] });
    expect(crowd.x).toBeLessThan(1);
    const still = { x: 3, z: 3 };
    T.tinkStep(still, { x: 30, z: 3 }, 0.1, { follow: false });
    expect(still).toMatchObject({ x: 3, z: 3, moving: false });
    for (const dt of [0, -1, NaN, Infinity]) { const s = { x: 3, z: 3 }; T.tinkStep(s, { x: 30, z: 3 }, dt); expect(Number.isFinite(s.x)).toBe(true); }
  });
  it('never leaves the floor or enters a collider, whatever the cat does', () => {
    const { cols, B } = flood();
    const m = { x: T.NEST.x, z: T.NEST.z, yaw: 0 };
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let cat = { x: m.x, z: m.z };
    for (let i = 0; i < 6000; i++) {
      if (i % 90 === 0) cat = { x: B.minX + rnd() * 72, z: B.minZ + rnd() * 64 };
      T.tinkStep(m, cat, 0.05, { colliders: cols });
      expect(m.x).toBeGreaterThanOrEqual(B.minX); expect(m.x).toBeLessThanOrEqual(B.maxX);
      expect(m.z).toBeGreaterThanOrEqual(B.minZ); expect(m.z).toBeLessThanOrEqual(B.maxZ);
      for (const c of cols) expect(Math.hypot(m.x - c.x, m.z - c.z)).toBeGreaterThanOrEqual(c.r - 1e-6);
    }
  });
  it('holds the cave bounds', () => { expect(T.BOUNDS).toEqual(P.CRYSTAL_BOUNDS); });
  it('a bob exists and is still under reduced motion', () => {
    expect(T.bob(0, true)).toBe(T.bob(9, true));
    expect(T.bob(1.3)).not.toBe(T.bob(0));
  });
});

describe('errand plan', () => {
  it('is deterministic, identical in a room, covers all four kinds and every spot', () => {
    for (const seed of [1, 77, 123456, 987654321]) expect(E.planDeepErrand(seed, 3)).toEqual(E.planDeepErrand(seed, 99));
    const kinds = new Set(); const spots = new Set();
    for (let s = 1; s < 600; s++) {
      const p = E.planDeepErrand(s * 7919, 0);
      kinds.add(p.kind); spots.add(p.spot);
      expect(p.spot).toBeLessThan(6);
      expect(p.tune.length).toBe(3);
      p.tune.forEach((b, i) => { expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(E.BARS); if (i) expect(b).not.toBe(p.tune[i - 1]); });
      expect(p.faces).not.toEqual([...PR.START]);
      for (const f of p.faces) expect([0, 1, 2]).toContain(f);
    }
    expect([...kinds].sort()).toEqual([...E.ERRAND_KINDS].sort());
    expect(spots.size).toBe(6);
    const solo = new Set();
    for (let v = 0; v < 40; v++) { const a = E.planDeepErrand(undefined, v); expect(a).toEqual(E.planDeepErrand(undefined, v)); solo.add(a.kind); }
    expect(solo.size).toBeGreaterThan(2);
    for (const j of [NaN, -1, Infinity]) expect(E.planDeepErrand(j, j).kind).toBeTruthy();
  });
  it('replay across two walks gives different errands (not all the same)', () => {
    const days = new Set();
    for (let v = 0; v < 30; v++) { const p = E.planDeepErrand(undefined, v); days.add(`${p.kind}${p.spot}`); }
    expect(days.size).toBeGreaterThan(4);
  });
  it('every spot, Tink nest and nook are in bounds, 2.5 m clear of every collider and the finds and mice, and reachable on foot from the spawn', () => {
    const { cols, reach, B } = flood();
    const avoid = [...Object.values(CRYSTAL_FIND_ZONES).flat(), ...CRYSTAL_GOLD, ...S.STONES, S.HEART, P.CRYSTAL_SPAWN, S.LUMI.start, ...PADS];
    for (const s of [...E.SPOTS, T.NOOK]) {
      expect(s.x > B.minX + 2 && s.x < B.maxX - 2 && s.z > B.minZ + 2 && s.z < B.maxZ - 2, JSON.stringify(s)).toBe(true);
      for (const c of cols) expect(Math.hypot(s.x - c.x, s.z - c.z) - c.r, JSON.stringify(s)).toBeGreaterThan(2.5);
      expect(reach(s), JSON.stringify(s)).toBe(true);
      for (const a of avoid) expect(Math.hypot(s.x - a.x, s.z - a.z), `${JSON.stringify(s)} vs ${JSON.stringify(a)}`).toBeGreaterThan(2.4);
      for (const c of CRYSTAL_COLLECTIBLES) expect(Math.hypot(s.x - c.x, s.z - c.z), JSON.stringify(s)).toBeGreaterThan(2.4);
    }
    // the nest is inside the bounds (C2 builds the hall round it; the floor under it is the cave floor)
    expect(T.NEST.z).toBeGreaterThan(B.minZ + 1);
    expect(E.SPOTS.length).toBe(6);
  });
  it('the tune matcher never fails: a wrong bar only starts over', () => {
    const tune = [0, 2, 4];
    let g = 0;
    for (const bar of [0, 2, 4]) { const r = E.tuneStep(tune, g, bar); g = r.got; }
    expect(g).toBe(3);
    expect(E.tuneStep(tune, 0, 0)).toEqual({ got: 1, event: 'ok' });
    expect(E.tuneStep(tune, 1, 2).event).toBe('ok');
    expect(E.tuneStep(tune, 2, 4).event).toBe('done');
    expect(E.tuneStep(tune, 1, 3)).toEqual({ got: 0, event: 'restart' });
    expect(E.tuneStep(tune, 1, 0)).toEqual({ got: 1, event: 'restart' });
    for (const bad of [NaN, -3, 99, 'x', undefined]) for (const g2 of [NaN, -1, 9, 'x']) expect(['ok', 'done', 'restart']).toContain(E.tuneStep(tune, g2, bad).event);
    // any bar sequence ends in done eventually when the right ones are played
    let s = 0; for (const bar of [3, 3, 1, 0, 1, 0, 2, 4]) s = E.tuneStep(tune, s, bar).got;
    expect(s).toBe(3);
  });
  it('the album fills the lowest bit and merges by union', () => {
    expect(E.nextChime(0)).toBe(0); expect(E.nextChime(0b1011)).toBe(2); expect(E.nextChime(4095)).toBe(-1);
    expect(E.withChime(0b1011, 2)).toBe(0b1111); expect(E.withChime(5, -1)).toBe(5); expect(E.withChime(5, 12)).toBe(5);
    expect(E.albumCount(0b1011)).toBe(3);
    expect(E.ALBUM.length).toBe(12);
    for (const j of [NaN, -3, 1.5, 1e12, 'x']) { expect(E.nextChime(j)).toBeGreaterThanOrEqual(-1); expect(E.albumCount(j)).toBeLessThanOrEqual(12); }
    let bits = 0; for (let i = 0; i < 12; i++) { const n = E.nextChime(bits); expect(n).toBe(i); bits = E.withChime(bits, n); }
    expect(bits).toBe(4095);
  });
  it('the wire event is only the errand', () => {
    expect(E.isJobEvent(E.JOB_WIRE)).toBe(true);
    for (const bad of [null, {}, { kind: 'wd-wall' }, 3]) expect(E.isJobEvent(bad)).toBe(false);
  });
});

describe('hygiene', () => {
  const files = ['crystaldeepmission', 'crystaldeepprism', 'crystaldeepwall', 'crystaldeeptink', 'crystaldeeperrand'];
  it('are pure: no THREE, no clock, no random number, no storage', () => {
    for (const f of files) {
      const src = readFileSync(new URL(`../src/world/${f}.js`, import.meta.url), 'utf8');
      expect(src, f).not.toMatch(/from 'three'|Math\.random|Date\.now|performance\.now|localStorage|document\./);
    }
  });
  it('have no apostrophe in a comment', () => {
    for (const f of files) {
      for (const line of readFileSync(new URL(`../src/world/${f}.js`, import.meta.url), 'utf8').split('\n')) {
        const c = line.match(/\/\/(.*)$/);
        if (c) expect(c[1], `${f}: ${line}`).not.toMatch(/'/);
      }
    }
  });
  it('are not imported by start-up (stage code only)', () => {
    for (const f of ['main', 'areas', 'progression', 'walk']) {
      let src = ''; try { src = readFileSync(new URL(`../src/${f}.js`, import.meta.url), 'utf8'); } catch { continue; }
      expect(src, f).not.toMatch(/crystaldeep(mission|prism|wall|tink|errand)/);
    }
  });
});
