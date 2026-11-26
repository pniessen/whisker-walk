// The Reef, milestone R5 (wing B: the Coral Garden and the housewarming). The wing's plan (cave, shell three, lanterns, snail home, clumps at three heights),
// the steps 4 to 7 of the pure machine and the in-order credit, the lantern order, the parade as a pure function of one start time, the walk's carrying-out of
// all of it (shell three, the try-on, the lanterns, the parade, the pay and the pearl, once), both word sets, determinism.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import * as M from '../src/reefmission.js';
import * as W from '../src/world/reefwing.js';
import * as S from '../src/world/reefstory.js';
import * as P from '../src/world/reefplan.js';
import { paradeAt, PARADE, mantaOverStageAt } from '../src/world/reefparade.js';
import { createMarlo } from '../src/world/reefmarlo.js';
import { createHousewarming, PEARL_ID } from '../src/world/reefhouse.js';
import { build } from '../src/world/reef.js';
import { sanitizeSave, createProgression, CATALOG } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { LINES } from '../src/world/reefwords.js';
import { phrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { bus } from '../src/events.js';
import { memoryStorage } from './helpers/storage.js';

const read = (f) => readFileSync(f, 'utf8');
const B = P.REEF_BOUNDS;
const inB = (x, z, m = 1) => x >= B.minX + m && x <= B.maxX - m && z >= B.minZ + m && z <= B.maxZ - m;

describe('the wing\'s plan (reefwing.js)', () => {
  it('is pure and seeded: the same clumps twice, three heights, the counts of the plan', () => {
    expect(W.scatterWing()).toEqual(W.scatterWing());
    const by = (h) => W.scatterWing().filter((k) => k.h === h).length;
    expect([by(1), by(2), by(3)]).toEqual([W.WING_COUNT.low, W.WING_COUNT.mid, W.WING_COUNT.tall]);
    for (const k of W.scatterWing()) { expect(inB(k.x, k.z, 2), JSON.stringify(k)).toBe(true); expect(Number.isFinite(W.spireHeight(k.s))).toBe(true); }
    expect(W.wingSpires().every((k) => k.kind === 'spire')).toBe(true);
    expect(W.wingClumps().every((k) => k.kind !== 'spire')).toBe(true);
    // the three heights really are three: low under 0.7 m, middle about a metre, spires over 1.7 m
    expect(Math.max(...W.scatterWing().filter((k) => k.h === 1).map((k) => k.s * 1.2))).toBeLessThan(0.9);
    expect(Math.min(...W.wingSpires().map((k) => W.spireHeight(k.s)))).toBeGreaterThan(1.6);
  });
  it('every place is inside the bounds and clear of every solid thing; the avoid list agrees with the story\'s own numbers', () => {
    const cols = [...P.reefColliders(), ...S.storyColliders()];
    const spots = [['shell3', W.SHELL_THREE, 0.5], ['pocket', W.CAVE_POCKET, 0.8], ['snail', W.SNAIL_HOME, 0.8], ['stage', W.STAGE, 1], ['mouth', W.CAVE.mouth, 1], ...W.LANTERNS.map((l, i) => [`lantern${i}`, { x: l.x, z: l.z }, 0.2])];
    for (const [n, p, pad] of spots) {
      expect(inB(p.x, p.z, 2), n).toBe(true);
      if (n.startsWith('lantern')) continue; // a lantern is itself a collider
      for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z), `${n} / ${JSON.stringify(c)}`).toBeGreaterThan(c.r + pad);
    }
    const avoid = (x, z) => W.WING_AVOID.find((a) => a[0] === x && a[1] === z);
    expect(avoid(S.LEDGE.x, S.LEDGE.z)).toBeTruthy();
    expect(avoid(S.POCKETS[2].x, S.POCKETS[2].z)).toBeTruthy();
    for (const m of [{ x: 14, z: -4 }, { x: 20, z: 6 }]) expect(avoid(m.x, m.z)).toBeTruthy();
    for (const c of W.wingColliders()) expect(inB(c.x, c.z), JSON.stringify(c)).toBe(true);
  });
  it('no new clump grows through the old coral, a kelp blade, a find or a collectible', () => {
    for (const k of W.scatterWing()) {
      for (const o of P.scatterCoral()) expect(Math.hypot(o.x - k.x, o.z - k.z)).toBeGreaterThan(o.s + k.s);
      for (const o of P.scatterKelp()) expect(Math.hypot(o.x - k.x, o.z - k.z)).toBeGreaterThan(k.s);
      for (const [x, z, r] of W.WING_AVOID) expect(Math.hypot(x - k.x, z - k.z)).toBeGreaterThan(r);
    }
  });
  it('shell three, the cave\'s air pocket, the snail\'s home and every lantern are reachable on foot from the spawn with no skills (floatY never needed)', () => {
    const g = P.createReefGround();
    const cols = [...P.reefColliders(), ...S.storyColliders()];
    const key = (x, z) => `${Math.round(x)},${Math.round(z)}`;
    const seen = new Set([key(P.REEF_SPAWN.x, P.REEF_SPAWN.z)]);
    const q = [[P.REEF_SPAWN.x, P.REEF_SPAWN.z]];
    while (q.length) {
      const [x, z] = q.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const nz = z + dz;
        if (!inB(nx, nz) || seen.has(key(nx, nz))) continue;
        if (cols.some((c) => Math.hypot(nx - c.x, nz - c.z) < c.r + 0.35)) continue;
        if (!g.canStep(x, z, nx, nz)) continue;
        seen.add(key(nx, nz)); q.push([nx, nz]);
      }
    }
    const near = (p, r) => { for (let a = 0; a < 16; a++) if (seen.has(key(p.x + Math.cos((a / 16) * 6.283) * r, p.z + Math.sin((a / 16) * 6.283) * r))) return true; return seen.has(key(p.x, p.z)); };
    expect(S.STORY_SHELLS).toHaveLength(3);
    expect(W.SHELL_THREE.minLift).toBe(0);
    expect(near(W.SHELL_THREE, W.SHELL_THREE.reach - 0.3)).toBe(true);
    expect(near(W.CAVE_POCKET, 0.5)).toBe(true);
    expect(near(W.SNAIL_HOME, 0.5)).toBe(true);
    W.LANTERNS.forEach((l, i) => expect(near(l, l.touch - 0.4), `lantern ${i}`).toBe(true));
    expect(Math.hypot(W.SHELL_THREE.x - W.CAVE_POCKET.x, W.SHELL_THREE.z - W.CAVE_POCKET.z)).toBeLessThan(1.4); // the pocket rings the shell
    // the lanterns lead toward the cave: each is nearer to it than the one before
    const d = W.LANTERNS.map((l) => Math.hypot(l.x - W.CAVE.x, l.z - W.CAVE.z));
    expect(d[0]).toBeGreaterThan(d[1]); expect(d[1]).toBeGreaterThanOrEqual(d[2] - 0.5);
  });
});

describe('steps 4 to 7 of the pure machine', () => {
  const ev = [{ kind: 'meet' }, { kind: 'bring', shell: 0 }, { kind: 'bring', shell: 1 }, { kind: 'bring', shell: 2 }, { kind: 'tryon' }, { kind: 'lit' }, { kind: 'parade' }];
  it('goes in order to step 7 and then rests; each step\'s effect is its own', () => {
    let r = { step: 0, shells: 0, album: 3 };
    const effects = [];
    for (const e of ev) { const a = M.apply(r, e); expect(a.changed, e.kind).toBe(true); effects.push(a.effect); r = a.reef; }
    expect(effects).toEqual(['met', 'small', 'big', 'third', 'tried', 'lit', 'parade']);
    expect(r).toEqual({ step: 7, shells: 7, album: 3 });
    expect(M.housewarmingDone(r)).toBe(true);
    expect(M.nextGoal(r).kind).toBe('rest');
    for (const e of ev) expect(M.apply(r, e).changed).toBe(false);
  });
  it('a step out of order changes nothing', () => {
    for (const [s, e] of [[2, { kind: 'tryon' }], [3, { kind: 'tryon' }], [4, { kind: 'lit' }], [5, { kind: 'parade' }], [3, { kind: 'bring', shell: 0 }], [2, { kind: 'bring', shell: 2 }], [0, { kind: 'parade' }]]) {
      expect(M.apply({ step: s }, e).changed, `${s} ${e.kind}`).toBe(false);
    }
  });
  it('every step has a next goal (no stuck state) and a picture', () => {
    const kinds = [];
    for (let s = 0; s <= 7; s++) { const g = M.nextGoal({ step: s }, null, 1); kinds.push(g.kind); expect(['question', 'shell', 'heart']).toContain(g.icon); }
    expect(kinds).toEqual(['marlo', 'shell', 'shell', 'shell', 'tryon', 'lantern', 'parade', 'rest']);
    expect(M.nextGoal({ step: 3 }, 2)).toMatchObject({ kind: 'deliver', shell: 2 });
    expect(M.nextGoal({ step: 5 }, null, 2)).toMatchObject({ kind: 'lantern', lantern: 2 });
    expect(M.nextGoal({ step: 5 }, null, 9)).toMatchObject({ kind: 'lantern', lantern: 2 });
    expect(M.nextGoal({ step: 5 }, null, -3)).toMatchObject({ kind: 'lantern', lantern: 0 });
  });
  it('credit takes every step before it in order, on both devices, and a step already past changes nothing', () => {
    const c = M.credit({ step: 3, shells: 3 }, { kind: 'parade' });
    expect(c).toMatchObject({ changed: true, effect: 'parade' });
    expect(c.reef).toMatchObject({ step: 7, shells: 7 });
    expect(M.credit({ step: 0, shells: 0 }, { kind: 'lit' }).reef.step).toBe(6);
    expect(M.credit({ step: 7, shells: 7 }, { kind: 'parade' }).changed).toBe(false);
    expect(M.credit({ step: 6, shells: 7 }, { kind: 'bring', shell: 2 }).changed).toBe(false);
    // two partners finishing different steps meet in the middle: A is at 5, B credits A's 'lit' and B's own parade: both end at 7
    const a = M.credit({ step: 5, shells: 7 }, { kind: 'lit' }).reef;
    expect(M.credit(a, { kind: 'parade' }).reef.step).toBe(7);
    expect(M.credit({ step: 2 }, null).changed).toBe(false);
  });
  it('the machine, the sanitiser and the merge agree: every reachable record is kept as it is; a merge only moves on', () => {
    let r = { step: 0, shells: 0, album: 0 };
    for (const e of ev) {
      r = M.apply(r, e).reef;
      expect(sanitizeSave({ version: 4, reef: r }).reef).toEqual(r);
    }
    const L = { version: 4, reef: { step: 4, shells: 7, album: 1 } };
    const C = { version: 4, reef: { step: 6, shells: 7, album: 2 } };
    useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });
    const m = mergeSaves({ local: sanitizeSave(L), cloud: sanitizeSave(C) }).save;
    expect(m.reef).toMatchObject({ step: 6, shells: 7, album: 3 });
    for (let s = 0; s <= 7; s++) expect(M.normalize({ step: s }).shells).toBe(M.SHELLS_AT[s]);
    expect(M.normalize({ shells: 7 }).step).toBe(4);
  });
  it('the lantern corals go in order: the next one counts, any other is ignored, nothing past three', () => {
    expect(M.lanternTouch(0, 0)).toBe(1);
    expect(M.lanternTouch(0, 1)).toBe(0);
    expect(M.lanternTouch(0, 2)).toBe(0);
    expect(M.lanternTouch(1, 0)).toBe(1);
    expect(M.lanternTouch(1, 1)).toBe(2);
    expect(M.lanternTouch(2, 2)).toBe(3);
    expect(M.lanternTouch(3, 2)).toBe(3);
    for (const bad of [NaN, -1, 1.5, 'x', null, undefined, 99]) expect(Number.isInteger(M.lanternTouch(bad, 0))).toBe(true);
    let lit = 0; for (const i of [2, 1, 0, 0, 1, 1, 2, 0]) lit = M.lanternTouch(lit, i);
    expect(lit).toBe(M.LANTERN_COUNT - 0);
    expect(M.lanternsLit(3)).toBe(true); expect(M.lanternsLit(2)).toBe(false);
  });
});

describe('the parade is a pure function of one start time', () => {
  it('is 20 s, inactive before and after, and the same answer every time (no clock, no rng)', () => {
    expect(PARADE.secs).toBe(20);
    for (const k of [-5, -0.01, NaN, Infinity, 20.01, 99]) expect(paradeAt(k).active, String(k)).toBe(false);
    for (const k of [0, 0.5, 5, 10.5, 19.9, 20]) expect(paradeAt(k).active, String(k)).toBe(true);
    const a = []; const b = [];
    for (let k = 0; k <= 20; k += 0.37) a.push(paradeAt(k));
    for (let k = 20.001; k >= 0; k -= 0.37) paradeAt(k); // another order, in between
    for (let k = 0; k <= 20; k += 0.37) b.push(paradeAt(k));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(paradeAt(7)).toEqual(paradeAt(7));
  });
  it('two devices that start from the same T0 agree whatever their frame rates (the parade reads only k)', () => {
    const at = (k0, dts) => { let k = k0; for (const dt of dts) k += dt; return paradeAt(k); };
    const slow = at(0, Array(30).fill(0.2)); const fast = at(0, Array(300).fill(0.02));
    expect(slow.manta.x).toBeCloseTo(fast.manta.x, 6);
    expect(slow.turtle.z).toBeCloseTo(fast.turtle.z, 6);
    expect(slow.shoal[3].y).toBeCloseTo(fast.shoal[3].y, 6);
  });
  it('everything is finite, the manta, the turtle and the shoal all pass the stage, and the coral glows from the start', () => {
    let nearM = Infinity; let nearT = Infinity; let nearS = Infinity;
    for (let k = 0; k <= 20; k += 0.05) {
      const p = paradeAt(k);
      for (const v of [p.manta.x, p.manta.y, p.manta.z, p.turtle.x, p.turtle.y, p.turtle.z, ...p.shoal.flatMap((f) => [f.x, f.y, f.z])]) expect(Number.isFinite(v)).toBe(true);
      expect(p.shoal).toHaveLength(PARADE.fish);
      nearM = Math.min(nearM, Math.hypot(p.manta.x - W.STAGE.x, p.manta.z - W.STAGE.z));
      nearT = Math.min(nearT, Math.hypot(p.turtle.x - W.STAGE.x, p.turtle.z - W.STAGE.z));
      nearS = Math.min(nearS, Math.hypot(p.shoal[0].x - W.STAGE.x, p.shoal[0].z - W.STAGE.z));
    }
    expect(nearM).toBeLessThan(5); expect(nearT).toBeLessThan(7); expect(nearS).toBeLessThan(8);
    expect(paradeAt(0).glow).toBe(0); expect(paradeAt(3).glow).toBe(1); expect(paradeAt(15).glow).toBe(1);
  });
  it('the pay moment is when the manta is over the stage, inside the 20 s', () => {
    expect(Math.abs(mantaOverStageAt() - PARADE.payAt)).toBeLessThan(1.5);
    expect(paradeAt(PARADE.payAt - 0.01).pay).toBe(false);
    expect(paradeAt(PARADE.payAt).pay).toBe(true);
  });
  it('the manta stays well over the heads of a floating cat (2.2 m), the turtle low, nobody dips below the sand', () => {
    for (let k = 0; k <= 20; k += 0.25) {
      const p = paradeAt(k);
      expect(p.manta.y).toBeGreaterThan(2.9);
      expect(p.turtle.y).toBeLessThan(1.5); expect(p.turtle.y).toBeGreaterThan(0.5);
      for (const f of p.shoal) expect(f.y).toBeGreaterThan(0.6);
    }
  });
});

// ---- the walk: shell three, the try-on, the lanterns, the parade, the pay -----------------------------------------------------------------------
const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z, y) => ({ x, z, y: y ?? P.reefY(x, z) });
function rig(reef = null) {
  const progression = createProgression(memoryStorage());
  if (reef) { progression.state.reef = { ...progression.state.reef, ...reef }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const heard = [];
  const off = bus.on('discovery', (e) => heard.push(e));
  const awards = [];
  const log = { awardOnce: (kind, key, text) => { awards.push({ kind, key, text }); return 40; }, count: () => 0, mark() {} };
  const sent = [];
  let house = null;
  const mar = createMarlo({ scene, progression, reducedMotion: false, pocket: () => true, onParade: () => house?.start({ own: true }), paradeOn: () => !!house?.paradeOn() });
  house = createHousewarming({ scene, marlo: mar, progression, log, reducedMotion: false, send: (e) => sent.push(e) });
  return { progression, scene, mar, house, heard, awards, sent, off };
}
const tick = (r, cat, n = 1, dt = 0.05, lift = 0) => { for (let i = 0; i < n; i++) { r.mar.update(dt, i * dt, cat, null, sess(), lift); r.house.update(dt, i * dt, cat, null, sess()); } };
const press = (r, cat, lift = 0) => { tick(r, cat, 1, 0.05, lift); const line = r.mar.promptAt(cat, lift); return { line, k: line ? r.mar.interact() : null }; };
const reefOf = (r) => r.progression.state.reef;

describe('chapters two and three on a walk', () => {
  it('shell three: offered in the cave on foot once Marlo wants it (not before), carried, given: step 4; he tries it on by himself: step 5', () => {
    const r = rig({ step: 3, shells: 3 });
    const s2 = W.SHELL_THREE;
    expect(r.mar.state.shellModes).toEqual(['given', 'given', 'home']);
    expect(press(r, at(s2.x + 0.7, s2.z)).k).toBe('pick');
    expect(r.mar.state.carrying).toBe(2);
    expect(reefOf(r).step).toBe(3); // carrying is never saved
    const cat = at(-3, 31);
    tick(r, cat, 200);
    expect(press(r, cat).k).toBe('give');
    expect(reefOf(r)).toMatchObject({ step: 4, shells: 7 });
    expect(r.heard.some((e) => e.key === 'reef-shell-third')).toBe(true);
    // she waits near him: a moment later he steps into it
    tick(r, cat, 20);
    expect(reefOf(r).step).toBe(4);
    tick(r, cat, 60);
    expect(reefOf(r).step).toBe(5);
    expect(r.heard.some((e) => e.key === 'reef-marlo-tried')).toBe(true);
    const old = r.mar.group.userData.old;
    expect(old.visible).toBe(false); // the cracked shell is off his back...
    const snail = r.scene.getObjectByName('reef:snailhome');
    expect(snail.visible).toBe(true); // ...and is a sea snail's home
    expect(Math.hypot(snail.position.x - W.SNAIL_HOME.x, snail.position.z - W.SNAIL_HOME.z)).toBeLessThan(1e-6);
    r.mar.dispose(); r.house.dispose(); r.off();
  });
  it('the try-on waits for her to be near and with her mouth empty; away from him it just waits (a saved step 4 finishes on the next walk)', () => {
    const r = rig({ step: 4, shells: 7 });
    tick(r, at(0, -30), 200);
    expect(reefOf(r).step).toBe(4);
    r.mar.dispose(); r.house.dispose(); r.off();
    const r2 = rig(reefOf(r));
    tick(r2, at(-3.5, 32.5), 100);
    expect(reefOf(r2).step).toBe(5);
    r2.mar.dispose(); r2.house.dispose(); r2.off();
  });
  it('the lanterns: out of order does nothing; in order lights each, the third is step 6 and starts the parade at once', () => {
    const r = rig({ step: 5, shells: 7 });
    const [l0, l1, l2] = W.LANTERNS;
    tick(r, at(l2.x + 0.5, l2.z), 20);
    tick(r, at(l1.x + 0.5, l1.z), 20);
    expect(r.mar.lit).toBe(0);
    expect(reefOf(r).step).toBe(5);
    tick(r, at(l0.x + 0.5, l0.z), 5);
    expect(r.mar.lit).toBe(1);
    expect(r.mar.goal()).toMatchObject({ x: l1.x, z: l1.z });
    tick(r, at(l1.x + 0.5, l1.z), 5);
    expect(r.mar.lit).toBe(2);
    expect(reefOf(r).step).toBe(5);
    expect(r.house.paradeOn()).toBe(false);
    tick(r, at(l2.x + 0.5, l2.z), 5);
    expect(reefOf(r).step).toBe(6);
    expect(r.house.paradeOn()).toBe(true);
    expect(r.sent[0]).toMatchObject({ kind: 'parade', elapsed: 0 }); // told to the room
    expect(r.progression.state.journal.rflanterns).toBeGreaterThan(0);
    r.mar.dispose(); r.house.dispose(); r.off();
  });
  it('the parade pays once: reefstory (40 paws), the pearl for her collar, step 7; a replay pays nothing', () => {
    const r = rig({ step: 6, shells: 7 });
    const cat = at(-3.5, 32.5);
    tick(r, cat, 40);
    expect(r.mar.promptAt(cat, 0)).toMatch(/housewarming/i);
    expect(r.mar.interact()).toBe('parade');
    expect(r.house.paradeOn()).toBe(true);
    expect(r.house.state.parade.k).toBeLessThan(1);
    tick(r, cat, Math.round((PARADE.payAt - 0.5) / 0.05));
    expect(reefOf(r).step).toBe(6);
    expect(r.awards).toHaveLength(0);
    tick(r, cat, 30);
    expect(reefOf(r).step).toBe(7);
    expect(r.awards).toEqual([{ kind: 'reefstory', key: 'reef-story', text: phrase('reef.parade.pay') }]);
    expect(r.progression.state.unlocked.accessories).toContain(PEARL_ID);
    expect(r.progression.state.journal.rfparade).toBeGreaterThan(0);
    tick(r, cat, 240); // the end of the 20 s
    expect(r.house.paradeOn()).toBe(false);
    expect(r.heard.some((e) => e.key === 'reef-pearl')).toBe(true);
    // again for fun: no more paws
    expect(r.mar.promptAt(cat, 0)).toMatch(/again/i);
    r.mar.interact();
    tick(r, cat, 300);
    expect(r.awards).toHaveLength(1);
    expect(r.progression.state.unlocked.accessories.filter((a) => a === PEARL_ID)).toHaveLength(1);
    r.mar.dispose(); r.house.dispose(); r.off();
  });
  it('a pearl does not replace a collar she is wearing; a bare collar puts it on', () => {
    for (const [wearing, want] of [[null, PEARL_ID], ['moonbadge', 'moonbadge']]) {
      const r = rig({ step: 6, shells: 7 });
      r.progression.state.equipped.collar = wearing;
      const cat = at(-3.5, 32.5);
      tick(r, cat, 40); r.mar.promptAt(cat, 0); r.mar.interact();
      tick(r, cat, 300);
      expect(r.progression.state.equipped.collar).toBe(want);
      r.mar.dispose(); r.house.dispose(); r.off();
    }
  });
  it('co-walk: a partner\'s parade starts ours from the same second, and pays each device\'s own save, crediting the steps in order', () => {
    const a = rig({ step: 3, shells: 3 }); // behind: has not done shell three yet
    const cat = at(-3, 31);
    tick(a, cat, 10);
    expect(a.house.credit({ kind: 'parade', elapsed: 8 })).toBe('parade-start');
    expect(a.house.state.parade.k).toBeCloseTo(8, 1);
    expect(a.sent).toHaveLength(0); // a partner's start is not sent back
    tick(a, cat, 70); // 3.5 s later: over the pay moment
    expect(reefOf(a)).toMatchObject({ step: 7, shells: 7 });
    expect(a.awards).toHaveLength(1);
    // two partners' progress, same parade, lines up: both end at 7 and each is paid once
    const b = rig({ step: 6, shells: 7 });
    tick(b, cat, 10);
    b.house.credit({ kind: 'parade', elapsed: 8 });
    tick(b, cat, 70);
    expect(reefOf(b).step).toBe(7);
    expect(b.awards).toHaveLength(1);
    // a start already going cannot be started twice; a nonsense elapsed is a fresh start
    expect(b.house.credit({ kind: 'parade', elapsed: 1 })).toBe(null);
    for (const x of [a, b]) { x.mar.dispose(); x.house.dispose(); x.off(); }
    const c = rig({ step: 6, shells: 7 });
    expect(c.house.credit({ kind: 'parade', elapsed: NaN })).toBe('parade-start');
    expect(c.house.state.parade.k).toBeCloseTo(0, 5);
    expect(c.house.credit({ kind: 'lit' })).toBe(null);
    c.mar.dispose(); c.house.dispose(); c.off();
  });
  it('credit of a lantern step from a partner lights ours (step 6), and the goal ring then points at Marlo', () => {
    const r = rig({ step: 5, shells: 7 });
    expect(r.mar.credit({ kind: 'lit' })).toBe('lit');
    expect(reefOf(r).step).toBe(6);
    expect(r.mar.lit).toBe(3);
    tick(r, at(-3, 31), 2);
    expect(r.house.orbs.length).toBe(3);
    r.mar.dispose(); r.house.dispose(); r.off();
  });
  it('disposing removes every object the wing\'s life made; shell three is back in the cave on the next walk however this one ended', () => {
    const r = rig({ step: 3, shells: 3 });
    press(r, at(W.SHELL_THREE.x + 0.7, W.SHELL_THREE.z));
    expect(r.mar.state.carrying).toBe(2);
    r.mar.dispose(); r.house.dispose(); r.off();
    expect(r.scene.children).toHaveLength(0);
    const r2 = rig(reefOf(r));
    expect(r2.mar.state.shellModes[2]).toBe('home');
    expect(r2.mar.state.carrying).toBe(null);
    r2.mar.dispose(); r2.house.dispose(); r2.off();
  });
  it('the wing\'s life is small: a few draws, none a shadow caster', () => {
    const r = rig({ step: 6, shells: 7 });
    let drawn = 0;
    r.scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints) { drawn++; expect(o.castShadow).toBeFalsy(); } });
    expect(drawn).toBeLessThanOrEqual(35);
    r.mar.dispose(); r.house.dispose(); r.off();
  });
});

describe('the built wing', () => {
  it('adds the spires as ONE InstancedMesh (never merged, never a caster) and the cave and clumps to the kit\'s buckets, with the colliders in the area', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const spires = scene.children.filter((o) => o.isInstancedMesh && o.name === 'reef:spires');
    expect(spires).toHaveLength(1);
    expect(spires[0].count).toBe(W.wingSpires().length);
    expect(spires[0].userData).toMatchObject({ noCast: true, noContactShadow: true, noMerge: true });
    for (const c of W.wingColliders()) expect(area.colliders.some((a) => a.x === c.x && a.z === c.z && a.r === c.r)).toBe(true);
    expect(area.spawn).toEqual(P.REEF_SPAWN);
  });
  it('builds the same twice', () => {
    const sig = () => { const s = new THREE.Scene(); build(s); let n = 0; let v = 0; s.traverse((o) => { if (o.isMesh) { n++; v += o.geometry.attributes.position.count; } }); return [n, v]; };
    expect(sig()).toEqual(sig());
  });
});

describe('the words, in both sets, and the source rules', () => {
  const ids = Object.keys(LINES).filter((k) => /^reef\.(lantern|parade|pearl)\./.test(k) || ['reef.shell.cave', 'reef.marlo.third', 'reef.marlo.tried'].includes(k) || k === 'reef.pearl');
  it('every new line exists, is short and kind, and reads the same in both word sets with no series word', () => {
    expect(ids.length).toBeGreaterThanOrEqual(11);
    const scary = /\b(drown\w*|die|dies|dead|hurt|panic\w*|gasp\w*|choke\w*|scared|scary|afraid|danger\w*|fail\w*)\b/i;
    for (const id of ids) {
      const s = phrase(id);
      expect(s, id).toMatch(/\S/); expect(s.length, id).toBeLessThanOrEqual(90); expect(s, id).not.toMatch(scary);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(s); });
    }
  });
  it('every phrase(...) call in the wing\'s files has a literal id in the lines table', () => {
    for (const f of ['src/world/reefhouse.js', 'src/world/reefwing.js', 'src/world/reefwingparts.js', 'src/world/reefparade.js', 'src/world/reefmarlo.js']) {
      const src = read(f).replace(/\/\/.*$/gm, '');
      for (const m of src.matchAll(/\bphrase\(([^)]*)\)/g)) {
        expect(m[1], `${f}: phrase(${m[1]})`).toMatch(/^'[a-z0-9.]+'$/);
        expect(Object.keys(LINES), f).toContain(m[1].slice(1, -1));
      }
    }
  });
  it('the pure files draw no random number and read no clock; nothing in the wing names floatY', () => {
    for (const f of ['src/world/reefwing.js', 'src/world/reefparade.js', 'src/world/reefhouse.js', 'src/world/reefwingparts.js', 'src/reefmission.js']) {
      const src = read(f).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|new Date/);
      expect(src, f).not.toMatch(/\bfloatY\b/);
    }
    for (const f of ['src/world/reefwing.js', 'src/world/reefparade.js', 'src/reefmission.js']) expect(read(f), f).not.toMatch(/from 'three'/);
    expect(globSync('src/world/reef*.js').length).toBeGreaterThan(15);
  });
});
