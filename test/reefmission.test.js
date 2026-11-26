// The Reef, milestone R2: the mission's pure step machine (src/reefmission.js), Marlo's plan and moves (world/reefstory.js), the saved
// record agreeing with the sanitiser and the merge, and every Reef string staying kind.
import { describe, it, expect } from 'vitest';
import * as M from '../src/reefmission.js';
import * as S from '../src/world/reefstory.js';
import * as P from '../src/world/reefplan.js';
import { sanitizeSave, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { LINES as STORY_LINES } from '../src/world/reefwords.js';
import { FIND_LINES } from '../src/world/reeffindwords.js';
const LINES = { ...STORY_LINES, ...FIND_LINES };
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { readFileSync, globSync } from 'node:fs';

const fresh = (reef) => sanitizeSave({ version: 4, reef }).reef;

describe('the step machine', () => {
  it('goes in order: hello, shell one (too small), shell two (too big); chapter one is then done', () => {
    let r = { step: 0, shells: 0, album: 0 };
    expect(M.nextGoal(r)).toEqual({ kind: 'marlo', icon: 'question' });
    let a = M.apply(r, { kind: 'meet' });
    expect(a).toMatchObject({ changed: true, effect: 'met' }); r = a.reef;
    expect(M.nextGoal(r)).toEqual({ kind: 'shell', shell: 0, icon: 'shell' });
    expect(M.nextGoal(r, 0)).toEqual({ kind: 'deliver', shell: 0, icon: 'heart' });
    a = M.apply(r, { kind: 'bring', shell: 0 });
    expect(a).toMatchObject({ changed: true, effect: 'small' }); r = a.reef;
    expect(r).toMatchObject({ step: 2, shells: 1, album: 0 });
    expect(M.nextGoal(r).shell).toBe(1);
    a = M.apply(r, { kind: 'bring', shell: 1 });
    expect(a).toMatchObject({ changed: true, effect: 'big' }); r = a.reef;
    expect(r).toMatchObject({ step: 3, shells: 3 });
    expect(M.chapterOneDone(r)).toBe(true);
    expect(M.nextGoal(r)).toEqual({ kind: 'shell', shell: 2, icon: 'shell' }); // chapter two (milestone R5): the just-right shell
    for (const ev of [{ kind: 'meet' }, { kind: 'bring', shell: 0 }, { kind: 'bring', shell: 1 }]) expect(M.apply(r, ev).changed).toBe(false);
  });
  it('refuses a shell out of order, before the meeting, a third shell (R5) and nonsense, and changes nothing', () => {
    const r = { step: 1, shells: 0, album: 5 };
    for (const ev of [{ kind: 'bring', shell: 1 }, { kind: 'bring', shell: 2 }, { kind: 'bring', shell: -1 }, { kind: 'bring', shell: '0' }, { kind: 'x' }, null, undefined, 7, {}]) {
      const a = M.apply(r, ev);
      expect(a.changed).toBe(false); expect(a.effect).toBe(null);
    }
    expect(M.apply({ step: 0, shells: 0 }, { kind: 'bring', shell: 0 }).changed).toBe(false);
    expect(r).toEqual({ step: 1, shells: 0, album: 5 }); // never touched
    expect(M.apply({ step: 1, album: 9, errand: 3 }, { kind: 'bring', shell: 0 }).reef).toMatchObject({ album: 9, errand: 3 });
  });
  it('never lowers a step, never passes the end of chapter one', () => {
    for (let s = 0; s <= 7; s++) {
      for (const ev of [{ kind: 'meet' }, { kind: 'bring', shell: 0 }, { kind: 'bring', shell: 1 }]) {
        const a = M.apply({ step: s, shells: 0 }, ev);
        expect(a.reef.step).toBeGreaterThanOrEqual(M.normalize({ step: s }).step);
        if (s < 4) expect(a.reef.step).toBeLessThanOrEqual(3);
      }
    }
  });
  it('normalize repairs hostile input, is idempotent, and a shell bit implies the steps before it', () => {
    for (const v of [null, undefined, 3, 'x', [], { step: -4 }, { step: 99, shells: 99 }, { step: 1.5 }, { step: NaN, shells: Infinity }, { shells: 1 }, { shells: 3 }, { shells: 2 }]) {
      const n = M.normalize(v);
      expect(Number.isInteger(n.step) && n.step >= 0 && n.step <= 7).toBe(true);
      expect(n.shells >= 0 && n.shells <= 7).toBe(true);
      expect(M.normalize(n)).toEqual(n);
    }
    expect(M.normalize({ shells: 1 }).step).toBe(2);
    expect(M.normalize({ shells: 3 }).step).toBe(3);
    expect(M.normalize({ step: 6 }).shells).toBe(7);
  });
  it('a step done by anyone in the room is credited in order; one already past changes nothing', () => {
    expect(M.credit({ step: 0, shells: 0 }, { kind: 'bring', shell: 1 }).reef).toMatchObject({ step: 3, shells: 3 });
    expect(M.credit({ step: 1, shells: 0 }, { kind: 'bring', shell: 0 }).reef).toMatchObject({ step: 2, shells: 1 });
    expect(M.credit({ step: 3, shells: 3 }, { kind: 'bring', shell: 0 }).changed).toBe(false);
    expect(M.credit({ step: 2, shells: 1 }, { kind: 'meet' }).changed).toBe(false);
  });
  it('only the shell Marlo wants can be picked, one at a time; there is always a next goal (no stuck state)', () => {
    expect(M.canPick({ step: 1 }, 0)).toBe(true);
    expect(M.canPick({ step: 1 }, 1)).toBe(false);
    expect(M.canPick({ step: 1 }, 0, 1)).toBe(false);
    expect(M.canPick({ step: 0 }, 0)).toBe(false);
    for (let s = 0; s <= 7; s++) for (const c of [null, 0, 1]) expect(['marlo', 'shell', 'deliver', 'tryon', 'lantern', 'parade', 'rest']).toContain(M.nextGoal({ step: s }, c).kind);
    expect(M.reachable({ minLift: 0.95 }, 0)).toBe(false);
    expect(M.reachable({ minLift: 0.95 }, 1.1)).toBe(true);
    expect(M.reachable({ minLift: 0 }, NaN)).toBe(true);
    expect(M.reachable({ minLift: 0.95 }, NaN)).toBe(false);
  });
});

describe('the saved record', () => {
  it('the machine and the sanitiser agree on the shells a step implies, for every step', () => {
    for (let step = 0; step <= 7; step++) {
      expect(M.SHELLS_AT[step]).toBe(fresh({ step }).shells);
      expect(M.normalize({ step })).toEqual({ step, shells: fresh({ step }).shells });
    }
  });
  it('every state the machine reaches is a state the sanitiser keeps as it is', () => {
    let r = { step: 0, shells: 0, album: 0 };
    for (const ev of [{ kind: 'meet' }, { kind: 'bring', shell: 0 }, { kind: 'bring', shell: 1 }]) {
      r = M.apply(r, ev).reef;
      expect(fresh(r)).toEqual({ step: r.step, shells: r.shells, album: 0 });
    }
  });
  it('two devices merge to the furthest step and the union of the shells', () => {
    useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
    const a = sanitizeSave({ version: 4, reef: { step: 2, shells: 1 } });
    const b = sanitizeSave({ version: 4, reef: { step: 3, shells: 3 } });
    const m = mergeSaves({ local: a, cloud: b }).save;
    expect(m.reef).toMatchObject({ step: 3, shells: 3 });
  });
});

describe('the places (reefstory.js)', () => {
  const B = P.REEF_BOUNDS;
  const inB = (x, z) => x >= B.minX + 1 && x <= B.maxX - 1 && z >= B.minZ + 1 && z <= B.maxZ - 1;
  it('Marlo, both shells, the ledge and the pockets are inside the bounds and clear of every solid thing', () => {
    const cols = P.reefColliders();
    expect(inB(S.MARLO.start.x, S.MARLO.start.z)).toBe(true);
    for (const c of cols) expect(Math.hypot(S.MARLO.start.x - c.x, S.MARLO.start.z - c.z)).toBeGreaterThan(c.r + S.MARLO.radius + 1);
    expect(S.SHELLS).toHaveLength(2);
    for (const s of S.SHELLS) {
      expect(inB(s.x, s.z)).toBe(true);
      for (const c of cols) expect(Math.hypot(s.x - c.x, s.z - c.z), `shell ${s.id}`).toBeGreaterThan(c.r + 0.5);
    }
    for (const p of S.POCKETS) {
      expect(inB(p.x, p.z)).toBe(true);
      for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r + 0.8);
    }
    expect(inB(S.LEDGE.x, S.LEDGE.z)).toBe(true);
    for (const c of cols) expect(Math.hypot(S.LEDGE.x - c.x, S.LEDGE.z - c.z)).toBeGreaterThan(c.r + S.LEDGE.r + 0.5);
  });
  it('shell one is on the sand in the Kelp Garden; shell two is on a ledge 1.4 m up in the Coral Garden, reached only by floating', () => {
    expect(P.zoneAt(S.SHELLS[0].x, S.SHELLS[0].z)).toBe('kelp');
    expect(S.SHELLS[0].y).toBe(0);
    expect(S.SHELLS[0].minLift).toBe(0);
    expect(P.zoneAt(S.SHELLS[1].x, S.SHELLS[1].z)).toBe('coral');
    expect(S.SHELLS[1].y).toBe(1.4);
    expect(S.LEDGE.h).toBe(1.4);
    expect(S.SHELLS[1].minLift).toBeGreaterThan(0.3); // not reachable walking the sand (she walks below 0.3 m)
    expect(S.SHELLS[1].minLift).toBeLessThan(2.2); // inside the float row's reach
  });
  it('every spot is reachable on foot from the spawn with no skills, and the ledge shell is within reach of open sand beside the ledge', () => {
    const g = P.createReefGround();
    const cols = [...P.reefColliders(), ...S.storyColliders()];
    const cell = 1;
    const key = (x, z) => `${Math.round(x / cell)},${Math.round(z / cell)}`;
    const seen = new Set([key(P.REEF_SPAWN.x, P.REEF_SPAWN.z)]);
    const q = [[P.REEF_SPAWN.x, P.REEF_SPAWN.z]];
    while (q.length) {
      const [x, z] = q.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx * cell; const nz = z + dz * cell;
        if (!inB(nx, nz) || seen.has(key(nx, nz))) continue;
        if (cols.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + 0.35)) continue;
        if (!g.canStep(x, z, nx, nz)) continue;
        seen.add(key(nx, nz)); q.push([nx, nz]);
      }
    }
    const near = (p, r) => { for (let a = 0; a < 16; a++) { const x = p.x + Math.cos(a / 16 * 6.283) * r; const z = p.z + Math.sin(a / 16 * 6.283) * r; if (seen.has(key(x, z))) return true; } return seen.has(key(p.x, p.z)); };
    expect(near(S.MARLO.start, 0.5)).toBe(true);
    for (const s of S.SHELLS) expect(near(s, s.reach - 0.3), `shell ${s.id}`).toBe(true);
    for (const p of S.POCKETS) expect(near(p, 0.5)).toBe(true);
  });
});

describe('the story\'s places stay clear of the scattered coral and kelp (nothing grows through a shell, the ledge or Marlo)', () => {
  it('no coral clump or kelp blade stands on them', () => {
    const spots = [['ledge', S.LEDGE.x, S.LEDGE.z, S.LEDGE.r + 0.6], ['marlo', S.MARLO.start.x, S.MARLO.start.z, 0.8], ...S.SHELLS.map((s) => ['shell' + s.id, s.x, s.z, 0.6]), ...S.POCKETS.map((p, i) => ['pocket' + i, p.x, p.z, 0.5])];
    for (const [n, x, z, r] of spots) {
      expect(P.scatterCoral().filter((k) => Math.hypot(k.x - x, k.z - z) < k.s + r).map((k) => `${k.kind}@${k.x.toFixed(1)},${k.z.toFixed(1)}`), `coral at ${n}`).toEqual([]);
      expect(P.scatterKelp().filter((k) => Math.hypot(k.x - x, k.z - z) < r + 0.3).length, `kelp at ${n}`).toBe(0);
    }
  });
});

describe('Marlo\'s moves', () => {
  const cat = (x, z) => ({ x, z });
  it('waits where he is until he is met; then follows when left behind, stops near, backs off when crowded', () => {
    const m = { x: 0, z: 30, yaw: 0, moving: false };
    S.marloStep(m, cat(0, 36), 0.1, { follow: false });
    expect(m).toMatchObject({ x: 0, z: 30, moving: false });
    for (let i = 0; i < 300; i++) S.marloStep(m, cat(0, 36), 0.05);
    const d = Math.hypot(m.x, m.z - 36);
    expect(d).toBeLessThanOrEqual(S.MARLO.near + 0.3);
    expect(d).toBeGreaterThanOrEqual(S.MARLO.shy);
    const c = { x: m.x, z: m.z + 0.5 };
    for (let i = 0; i < 100; i++) S.marloStep(m, c, 0.05);
    expect(Math.hypot(m.x - c.x, m.z - c.z)).toBeGreaterThanOrEqual(S.MARLO.shy - 0.1);
  });
  it('a shell in her mouth brings him close; he never leaves the bounds or walks into coral', () => {
    const m = { x: 0, z: 30, yaw: 0, moving: false };
    for (let i = 0; i < 300; i++) S.marloStep(m, cat(2, 36), 0.05, { eager: true });
    expect(Math.hypot(m.x - 2, m.z - 36)).toBeLessThan(S.MARLO.give);
    const cols = S.marloColliders();
    const w = { x: 10, z: 0, yaw: 0 };
    for (let i = 0; i < 2000; i++) {
      S.marloStep(w, cat(Math.sin(i / 90) * 60, Math.cos(i / 70) * 60), 0.05);
      expect(w.x).toBeGreaterThanOrEqual(P.REEF_BOUNDS.minX); expect(w.x).toBeLessThanOrEqual(P.REEF_BOUNDS.maxX);
      expect(w.z).toBeGreaterThanOrEqual(P.REEF_BOUNDS.minZ); expect(w.z).toBeLessThanOrEqual(P.REEF_BOUNDS.maxZ);
      for (const c of cols) expect(Math.hypot(w.x - c.x, w.z - c.z)).toBeGreaterThanOrEqual(c.r + S.MARLO.radius - 1e-6);
    }
  });
  it('is deterministic and survives silly time steps', () => {
    const run = () => { const m = { x: 0, z: 30, yaw: 0 }; for (const dt of [0.016, NaN, -1, 5, 0, 0.1, Infinity]) S.marloStep(m, cat(9, 20), dt); return m; };
    const a = run();
    expect(a).toEqual(run());
    expect(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.yaw)).toBe(true);
  });
});

describe('the words', () => {
  const ids = Object.keys(LINES).filter((k) => k.startsWith('reef.marlo.') || k.startsWith('reef.shell.'));
  it('Marlo\'s and the shells\' lines exist, are short, kind, and read the same in both word sets (no series word)', () => {
    expect(ids.length).toBeGreaterThanOrEqual(10);
    const scary = /\b(drown\w*|die|dies|dead|hurt|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(s); });
    }
  });
  it('every phrase(...) call in the Reef\'s files has a literal id that exists (the clanphrases test cannot read variables)', () => {
    const files = globSync('src/world/reef*.js').concat(['src/reefmission.js']);
    for (const f of files) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
      for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
        expect(m[1], `${f}: phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
        expect(Object.keys(LINES), f).toContain(m[1].slice(1, -1));
      }
    }
  });
});
