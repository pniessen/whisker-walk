// The Crystal Cave, milestone C2: the pure step machine, Lumi's moves and plan, the words, and the reach of the rose stone from the spawn with no skills.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import * as M from '../src/crystalmission.js';
import * as S from '../src/world/crystalstory.js';
import * as P from '../src/world/crystalplan.js';
import { LINES as LINES_A } from '../src/world/crystalwords.js';
import { CRYSTAL_FIND_LINES } from '../src/world/crystalfindwords.js';
import { CRYSTAL_WING_LINES } from '../src/world/crystalwingwords.js';
const LINES = { ...LINES_A, ...CRYSTAL_FIND_LINES, ...CRYSTAL_WING_LINES };
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { build } from '../src/world/crystal.js';
import * as THREE from 'three';

const rec = (step = 0, sparks = 0) => ({ step, sparks, album: 5 });

describe('the step machine', () => {
  it('meet, then the rose stone, in order; the other keys come back untouched', () => {
    let r = M.apply(rec(), { kind: 'bring', stone: 0 });
    expect(r.changed).toBe(false); // not met yet
    r = M.apply(rec(), { kind: 'meet' });
    expect(r).toMatchObject({ changed: true, effect: 'met' });
    expect(r.crystal).toEqual({ step: 1, sparks: 0, album: 5 });
    expect(M.apply(r.crystal, { kind: 'bring', stone: 1 }).changed).toBe(false); // out of order
    const b = M.apply(r.crystal, { kind: 'bring', stone: 0 });
    expect(b).toMatchObject({ changed: true, effect: 'rose' });
    expect(b.crystal).toEqual({ step: 2, sparks: 1, album: 5 });
    expect(M.apply(b.crystal, { kind: 'bring', stone: 0 }).changed).toBe(false);
    expect(M.apply(b.crystal, { kind: 'meet' }).changed).toBe(false);
  });
  it('there is no failure event: anything unknown changes nothing, and no step ever goes down', () => {
    for (const ev of [null, undefined, 3, {}, { kind: 'fail' }, { kind: 'bring', stone: 9 }, { kind: 'bring' }, { kind: 'drop' }]) {
      for (let s = 0; s <= 7; s++) {
        const r = M.apply(rec(s, M.SPARKS_AT[s]), ev);
        expect(r.crystal.step).toBeGreaterThanOrEqual(s);
      }
    }
    expect(Object.keys(M).filter((k) => /fail|lose|drop|reset/i.test(k))).toEqual([]);
  });
  it('normalize repairs hostile input and is idempotent', () => {
    for (const v of [null, 'x', 7, [], { step: -4, sparks: NaN }, { step: 99, sparks: 99 }, { step: 0, sparks: 1 }, { step: 1, sparks: 3 }, { step: 0, sparks: 7 }]) {
      const n = M.normalize(v);
      expect(M.normalize(n)).toEqual(n);
      expect(n.step).toBeGreaterThanOrEqual(0); expect(n.step).toBeLessThanOrEqual(7);
    }
    expect(M.normalize({ step: 0, sparks: 1 })).toEqual({ step: 2, sparks: 1 });
  });
  it('credit takes every step before it, in order, and is a no-op for a step she is past', () => {
    const c = M.credit(rec(), { kind: 'bring', stone: 0 });
    expect(c.crystal.step).toBe(2); expect(c.crystal.sparks).toBe(1);
    expect(M.credit(c.crystal, { kind: 'bring', stone: 0 }).changed).toBe(false);
    expect(M.credit(rec(), { kind: 'nonsense' }).changed).toBe(false);
  });
  it('the sparks table is the same one the save\'s sanitiser holds', () => {
    const src = readFileSync('src/progression.js', 'utf8');
    expect(src).toContain(`CRYSTAL_SPARKS_AT = [${M.SPARKS_AT.join(', ')}]`);
  });
  it('the next goal is always one of four pictures, never nothing', () => {
    expect(M.nextGoal(rec(0))).toMatchObject({ kind: 'lumi', icon: 'heart' });
    expect(M.nextGoal(rec(1))).toMatchObject({ kind: 'stone', stone: 0, icon: 'spark' });
    expect(M.nextGoal(rec(1), 0)).toMatchObject({ kind: 'deliver', stone: 0, icon: 'heart' });
    expect(M.nextGoal(rec(2))).toMatchObject({ kind: 'stone', stone: 1 });
    expect(M.nextGoal(rec(5, 7))).toMatchObject({ kind: 'heart', icon: 'spark' }); // (milestone C5: the Heart is next)
    expect(M.nextGoal(rec(7, 7))).toMatchObject({ kind: 'rest' });
    expect(M.canPick(rec(1), 0, null)).toBe(true);
    expect(M.canPick(rec(1), 0, 0)).toBe(false);
    expect(M.canPick(rec(0), 0, null)).toBe(false);
    expect(M.canPick(rec(2, 1), 0, null)).toBe(false);
  });
});

describe('Lumi\'s moves', () => {
  const cat = (x, z) => ({ x, z });
  it('waits until she is told to follow, then follows shyly and never lands in a crystal', () => {
    const m = { x: S.LUMI.start.x, z: S.LUMI.start.z, yaw: 0, moving: false };
    S.lumiStep(m, cat(0, 28), 0.05, { follow: false });
    expect(m.x).toBe(S.LUMI.start.x);
    for (let i = 0; i < 400; i++) S.lumiStep(m, cat(-18, 12), 0.05);
    expect(Math.hypot(m.x + 18, m.z - 12)).toBeLessThan(S.LUMI.near + 0.6);
    for (const c of P.crystalColliders()) expect(Math.hypot(m.x - c.x, m.z - c.z)).toBeGreaterThanOrEqual(c.r + S.LUMI.radius - 1e-6);
  });
  it('is deterministic and survives silly time steps', () => {
    const run = () => { const m = { x: 3, z: 21, yaw: 0 }; for (const dt of [0.016, NaN, -1, 5, 0, 0.1, Infinity]) S.lumiStep(m, cat(9, 20), dt); return m; };
    const a = run();
    expect(a).toEqual(run());
    expect(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.yaw)).toBe(true);
  });
});

describe('the rose stone is findable on foot with no skills', () => {
  const area = build(new THREE.Scene());
  const B = P.CRYSTAL_BOUNDS;
  const g = area.ground;
  const step = 0.5;
  const nx = Math.round((B.maxX - B.minX) / step) + 1;
  const nz = Math.round((B.maxZ - B.minZ) / step) + 1;
  const key = (i, j) => j * nx + i;
  const free = (i, j) => { const x = B.minX + i * step; const z = B.minZ + j * step; return !area.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3); };
  const seen = new Set();
  const start = [Math.round((P.CRYSTAL_SPAWN.x - B.minX) / step), Math.round((P.CRYSTAL_SPAWN.z - B.minZ) / step)];
  seen.add(key(...start));
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di; const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen.has(key(a, b)) || !free(a, b)) continue;
      if (!g.canStep(B.minX + i * step, B.minZ + j * step, B.minX + a * step, B.minZ + b * step)) continue;
      seen.add(key(a, b)); queue.push([a, b]);
    }
  }
  // is there a reachable floor cell within `r` of the point (the cat picks up from a little way off)
  const within = (x, z, r) => {
    for (let dx = -r; dx <= r; dx += step) for (let dz = -r; dz <= r; dz += step) {
      if (Math.hypot(dx, dz) > r) continue;
      if (seen.has(key(Math.round((x + dx - B.minX) / step), Math.round((z + dz - B.minZ) / step)))) return true;
    }
    return false;
  };
  it('Lumi, the stone and the Rose crystal are each within reach of a floor cell she can walk to from the spawn', () => {
    expect(within(S.LUMI.start.x, S.LUMI.start.z, 0.5)).toBe(true);
    for (const s of S.STONES) { expect(within(s.x, s.z, s.reach - 0.3), `stone ${s.id}`).toBe(true); }
    for (const c of S.CRYSTALS) expect(within(c.x, c.z, c.reach - 0.3), c.id).toBe(true);
  });
  it('the stone is hidden behind a cluster from the spawn, in bounds, clear of every solid thing, and in the Rose hall', () => {
    const s = S.STONES[0];
    expect(P.zoneAt(s.x, s.z)).toBe('rose');
    for (const c of P.crystalColliders()) expect(Math.hypot(s.x - c.x, s.z - c.z), JSON.stringify(c)).toBeGreaterThan(c.r + 0.6);
    // the cluster it hides behind is a real solid one
    const cl = P.crystalColliders().find((c) => Math.hypot(c.x - s.hideBehind.x, c.z - s.hideBehind.z) < 0.2);
    expect(cl).toBeTruthy();
    // and it is on the far side: the cluster is nearer the spawn than the stone is
    expect(Math.hypot(cl.x - 0, cl.z - 28)).toBeLessThan(Math.hypot(s.x, s.z - 28));
    expect(s.x).toBeGreaterThan(B.minX + 2);
    expect(P.crystalY(s.x, s.z)).toBeLessThan(1.1);
  });
  it('Lumi\'s start is clear of crystals, and the Rose crystal is the plan\'s great one', () => {
    for (const c of P.crystalColliders()) expect(Math.hypot(S.LUMI.start.x - c.x, S.LUMI.start.z - c.z)).toBeGreaterThan(c.r + 0.8);
    expect([S.CRYSTALS[0].x, S.CRYSTALS[0].z]).toEqual([P.ROSE_GREAT.x, P.ROSE_GREAT.z]);
  });
});

describe('the words', () => {
  const ids = Object.keys(LINES).filter((k) => k.startsWith('crystal.lumi.') || k.startsWith('crystal.stone.') || k.startsWith('crystal.rose.') || /^crystal\.(sky|gold|heart|show|passages)\./.test(k) || k === 'crystal.gem');
  it('Lumi\'s and the stones\' lines exist, are short and kind, and read the same in both word sets (no series word, no banned word)', () => {
    expect(ids.length).toBeGreaterThanOrEqual(8);
    const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|cave-in|scary|scared|afraid|danger\w*|drown\w*|die|dies|dead|hurt)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(s); });
    }
  });
  it('every phrase(...) call in the cave\'s files has a literal id that exists', () => {
    const files = globSync('src/world/crystal*.js').concat(['src/crystalmission.js']);
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
        expect(m[1], `${f}: phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
        expect(Object.keys(LINES), f).toContain(m[1].slice(1, -1));
      }
    }
  });
});
