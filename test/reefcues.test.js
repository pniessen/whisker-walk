// The Reef's story-arc cues: every mission step (0 to 7) can be played from the start to the end with no skills, every target is in a place she can walk to, every step
// has a cue that points at the next target (the meow's ring and picture, a glint, a line, a journal hint) in both word sets, the legs are not longer than the plan
// implies, and a save at any step (or a hostile one) still walks to the end. No WebGL: the real Marlo and housewarming run on a bare THREE.Scene.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as M from '../src/reefmission.js';
import * as S from '../src/world/reefstory.js';
import * as P from '../src/world/reefplan.js';
import * as W from '../src/world/reefwing.js';
import { createMarlo } from '../src/world/reefmarlo.js';
import { createHousewarming, PEARL_ID } from '../src/world/reefhouse.js';
import { PARADE } from '../src/world/reefparade.js';
import { HINTS } from '../src/world/reefwords.js';
import { REEF_HINTS } from '../src/reefpages.js';
import { AWARDS } from '../src/discoveries.js';
import { createProgression, SAVE_KEY } from '../src/progression.js';
import { phrase, hasPhrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

// ---- the rig: the real Marlo and the real housewarming, a stand-in log that counts the pay ----------------------------------------------------
const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z) => ({ x, z, y: P.reefY(x, z) });
function rig(reef = null) {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (reef) { progression.state.reef = { ...progression.state.reef, ...reef }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const awards = [];
  const log = { awardOnce: (kind, key, text) => { awards.push({ kind, key, text }); return AWARDS[kind] ?? 0; }, count: () => 0, mark() {} };
  let house = null;
  const mar = createMarlo({ scene, progression, reducedMotion: false, pocket: () => true, onParade: () => house?.start({ own: true }), paradeOn: () => !!house?.paradeOn() });
  house = createHousewarming({ scene, marlo: mar, progression, log, reducedMotion: false, send: () => {} });
  return { storage, progression, scene, mar, house, awards };
}
const reefOf = (r) => r.progression.state.reef;
const tick = (r, cat, n = 1, dt = 0.05, lift = 0) => { for (let i = 0; i < n; i++) { r.mar.update(dt, i * dt, cat, null, sess(), lift); r.house.update(dt, i * dt, cat, null, sess()); } };
const press = (r, cat, lift = 0) => { tick(r, cat, 1, 0.05, lift); const line = r.mar.promptAt(cat, lift); return { line, k: line ? r.mar.interact() : null }; };
const nearMarlo = (r) => at(r.mar.marlo.x + 1.5, r.mar.marlo.z);

// The actions the game offers for one step, with the cat's feet only (no skills; the float is the base kick, 1.1 m is under what it gives: AIR.lift 2.4).
function bringShell(r, i) {
  const s = S.STORY_SHELLS[i];
  const spot = i === 1 ? at(s.x - 1.8, s.z) : at(s.x + 0.7, s.z);
  const lift = i === 1 ? 1.1 : 0;
  expect(press(r, spot, lift).k, `pick shell ${i}`).toBe('pick');
  expect(reefOf(r).shells & (1 << i), `a carried shell ${i} is never saved`).toBe(0);
  expect(JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}').reef?.carrying, 'no carrying key in the save').toBeUndefined();
  const trail = r.mar.goalNow();
  expect(trail.g.kind, 'with the shell in her mouth the goal is to deliver').toBe('deliver');
  expect([trail.x, trail.z], 'the deliver ring is over Marlo').toEqual([r.mar.marlo.x, r.mar.marlo.z]);
  tick(r, nearMarlo(r), 5);
  expect(press(r, nearMarlo(r)).k, `give shell ${i}`).toBe('give');
}
const lanternsAll = (r) => { for (let i = 0; i < W.LANTERNS.length; i++) { const l = W.LANTERNS[i]; tick(r, at(l.x + 1.2, l.z), 2); } };

// Plays from whatever step the save holds to the end, recording what the cues said before each action: [{ step, goal, glint }].
function play(r) {
  const trail = [];
  const snap = (cat) => {
    tick(r, cat ?? nearMarlo(r), 1);
    const goal = r.mar.goalNow();
    const gl = goal.g.kind === 'shell' ? r.scene.getObjectByName(`reef:glint${goal.g.shell}`) : null;
    trail.push({ step: M.normalize(reefOf(r)).step, goal, glint: gl ? gl.visible : null, marlo: { x: r.mar.marlo.x, z: r.mar.marlo.z } });
  };
  for (let guard = 0; guard < 30; guard++) {
    const step = M.normalize(reefOf(r)).step;
    if (step >= M.STEP.done) break;
    if (step === 0) { snap(at(P.REEF_SPAWN.x, P.REEF_SPAWN.z)); const m = r.mar.marlo; expect(press(r, at(m.x + 1.2, m.z)).k, 'meet Marlo').toBe('meet'); }
    else if (step <= M.STEP.big) { snap(); bringShell(r, step - 1); }
    else if (step === M.STEP.third) { snap(); tick(r, nearMarlo(r), 60); }
    else if (step === M.STEP.tried) {
      for (let i = 0; i < W.LANTERNS.length && M.normalize(reefOf(r)).step === M.STEP.tried; i++) {
        snap(); const l = W.LANTERNS[i]; tick(r, at(l.x + 1.2, l.z), 2);
      }
    } else if (step === M.STEP.lit) {
      snap();
      if (!r.house.paradeOn()) expect(press(r, nearMarlo(r)).k, 'start the housewarming').toBe('parade');
      tick(r, nearMarlo(r), Math.ceil((PARADE.secs + 2) / 0.05));
    }
  }
  snap();
  return trail;
}
const ALL_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const save = (step) => ({ step, shells: M.SHELLS_AT[step] });

// ---- (a) the scripted playthrough --------------------------------------------------------------------------------------------------------
describe('(a) the scripted playthrough from step 0 to the end, with no skills', () => {
  it('every mission step is reached in order and the story award is paid once (and the pearl is given)', () => {
    const r = rig();
    const seen = [];
    const trail = play(r);
    for (const t of trail) if (!seen.includes(t.step)) seen.push(t.step);
    // (step 4 is the moment between the third shell and Marlo's own try-on; the walk passes through it without stopping, so it is checked in the cues below)
    for (const s of [0, 1, 2, 3, 5, 6, 7]) expect(seen, `step ${s}`).toContain(s);
    expect(reefOf(r)).toMatchObject({ step: 7, shells: 7 });
    expect(r.awards.map((a) => a.kind), 'reefstory paid exactly once').toEqual(['reefstory']);
    expect(AWARDS.reefstory).toBe(40);
    expect(r.progression.state.unlocked.accessories).toContain(PEARL_ID);
    r.mar.dispose();
  });
  it('the shells were never saved while carried, and the lantern count is not saved', () => {
    const r = rig();
    play(r);
    const stored = JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}').reef ?? {};
    expect(Object.keys(stored).sort()).not.toContain('carrying');
    expect(Object.keys(stored).sort()).not.toContain('lit');
    expect(Object.keys(stored).sort()).not.toContain('lanterns');
  });
  it('after the story, the housewarming can be shown again for fun and pays nothing', () => {
    const r = rig(save(7));
    expect(press(r, nearMarlo(r)).line).toBe(phrase('reef.parade.replay'));
    tick(r, nearMarlo(r), Math.ceil((PARADE.secs + 2) / 0.05));
    expect(r.awards).toEqual([]);
    expect(reefOf(r).step).toBe(7);
  });
});

// ---- the places ----------------------------------------------------------------------------------------------------------------------------
const B = P.REEF_BOUNDS;
const inB = (p, m = 1) => p.x >= B.minX + m && p.x <= B.maxX - m && p.z >= B.minZ + m && p.z <= B.maxZ - m;
// Every target the story asks her to stand at. `reach` is how near she must stand; `solid` names the one collider the target is allowed to sit on (it is its own prop).
const TARGETS = [
  { step: 0, name: 'Marlo (hello)', p: S.MARLO.start, reach: S.MARLO.reach },
  { step: 1, name: 'shell one (Kelp Garden)', p: S.STORY_SHELLS[0], reach: S.STORY_SHELLS[0].reach },
  { step: 2, name: 'shell two (coral ledge, floating)', p: S.STORY_SHELLS[1], reach: S.STORY_SHELLS[1].reach, solid: S.LEDGE },
  { step: 3, name: 'shell three (cave behind the coral)', p: S.STORY_SHELLS[2], reach: S.STORY_SHELLS[2].reach },
  { step: 4, name: 'the snail\'s home (Marlo\'s try-on place)', p: W.SNAIL_HOME, reach: 4.5 },
  ...W.LANTERNS.map((l) => ({ step: 5, name: `lantern ${l.id}`, p: l, reach: l.touch, solid: l })),
  { step: 6, name: 'the stage (parade)', p: W.STAGE, reach: S.MARLO.reach },
];
// Marlo follows her and the try-on and parade are his, so step 4 and 6 only need open floor where he can come; the checks below still cover their places.
const cols = S.marloColliders();
const ground = P.createReefGround();
const cell = 0.5;
const nx = Math.round((B.maxX - B.minX) / cell) + 1;
const nz = Math.round((B.maxZ - B.minZ) / cell) + 1;
const keyOf = (i, j) => j * nx + i;
const seen = new Set();
{
  const free = (x, z) => !cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.35);
  const start = [Math.round((P.REEF_SPAWN.x - B.minX) / cell), Math.round((P.REEF_SPAWN.z - B.minZ) / cell)];
  seen.add(keyOf(...start));
  const q = [start];
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di; const b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz || seen.has(keyOf(a, b))) continue;
      if (!free(B.minX + a * cell, B.minZ + b * cell)) continue;
      if (!ground.canStep(B.minX + i * cell, B.minZ + j * cell, B.minX + a * cell, B.minZ + b * cell)) continue;
      seen.add(keyOf(a, b)); q.push([a, b]);
    }
  }
}
const walkableNear = (p, r) => {
  for (let dx = -r; dx <= r; dx += cell) for (let dz = -r; dz <= r; dz += cell) {
    if (Math.hypot(dx, dz) > r) continue;
    if (seen.has(keyOf(Math.round((p.x + dx - B.minX) / cell), Math.round((p.z + dz - B.minZ) / cell)))) return true;
  }
  return false;
};

describe('(b) every step\'s target exists, is in bounds, can be walked to with no skills, and is not inside a collider', () => {
  it('the plan holds every target', () => {
    expect(S.STORY_SHELLS).toHaveLength(M.SHELL_COUNT);
    expect(W.LANTERNS).toHaveLength(M.LANTERN_COUNT);
    expect(S.SHELL_STEP ?? M.SHELL_STEP).toHaveLength(3);
    for (const t of TARGETS) expect(t.p && Number.isFinite(t.p.x) && Number.isFinite(t.p.z), t.name).toBe(true);
  });
  it('each is inside the bounds', () => {
    for (const t of TARGETS) expect(inB(t.p), `step ${t.step}: ${t.name}`).toBe(true);
  });
  it('each is within reach of a floor cell she can walk to from the spawn (shells by their reach, the float only for the last metre of shell two)', () => {
    for (const t of TARGETS) expect(walkableNear(t.p, t.reach - 0.3), `step ${t.step}: ${t.name} is not reachable on foot`).toBe(true);
    expect(S.STORY_SHELLS[1].minLift, 'shell two needs a float the base kick gives').toBeLessThan(P.AIR.lift);
    expect(S.STORY_SHELLS[0].minLift).toBe(0);
    expect(S.STORY_SHELLS[2].minLift).toBe(0);
  });
  it('none sits inside a collider (the ledge and the lanterns are the props the shell and the touch belong to)', () => {
    for (const t of TARGETS) {
      for (const c of cols) {
        if (t.solid && Math.hypot(c.x - t.solid.x, c.z - t.solid.z) < 0.01) continue;
        expect(Math.hypot(t.p.x - c.x, t.p.z - c.z), `step ${t.step}: ${t.name} inside ${JSON.stringify(c)}`).toBeGreaterThan(c.r + 0.2);
      }
    }
  });
  it('the spawn and the ladder\'s foot are open floor', () => {
    for (const p of [P.REEF_SPAWN, P.LADDER_FOOT]) {
      expect(inB(p)).toBe(true);
      for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeGreaterThan(c.r + 0.35);
    }
  });
});

// ---- (c) cue coverage -------------------------------------------------------------------------------------------------------------------
// For each step: the thing the ring should point at, the lines that tell her (each must be wired in the live code), the journal hint page, and whether a glint hangs there.
const lantern = (i) => W.LANTERNS[i];
const CUES = [
  { step: 0, goal: 'marlo', icon: 'question', target: (t) => t.marlo, lines: ['reef.marlo.hello', 'reef.marlo.prompt', 'reef.guide.hello'], journal: 'rfshells' },
  { step: 1, goal: 'shell', icon: 'shell', target: () => S.STORY_SHELLS[0], lines: ['reef.marlo.met', 'reef.shell.find', 'reef.shell.prompt', 'reef.shell.got', 'reef.guide.shell0'], journal: 'rfshells', glint: true },
  { step: 2, goal: 'shell', icon: 'shell', target: () => S.STORY_SHELLS[1], lines: ['reef.marlo.small', 'reef.shell.float', 'reef.guide.shell1'], journal: 'rfshells', glint: true },
  { step: 3, goal: 'shell', icon: 'shell', target: () => S.STORY_SHELLS[2], lines: ['reef.marlo.big', 'reef.shell.cave', 'reef.guide.shell2'], journal: 'rfshells', glint: true },
  { step: 4, goal: 'tryon', icon: 'heart', target: (t) => t.marlo, lines: ['reef.marlo.third', 'reef.marlo.tried', 'reef.guide.tryon'], journal: 'rfshells' },
  { step: 5, goal: 'lantern', icon: 'question', target: (t) => lantern(t.goal.g.lantern), lines: ['reef.lantern.hint', 'reef.lantern.lit', 'reef.guide.lantern'], journal: 'rflanterns' },
  { step: 6, goal: 'parade', icon: 'heart', target: (t) => t.marlo, lines: ['reef.lantern.all', 'reef.parade.prompt', 'reef.parade.start', 'reef.guide.parade'], journal: 'rfparade' },
  { step: 7, goal: 'rest', icon: 'heart', target: null, lines: ['reef.parade.pay', 'reef.pearl', 'reef.parade.replay', 'reef.guide.errand'], journal: 'rferrand' },
];
const LIVE_SRC = ['reefmarlo.js', 'reefhouse.js', 'reefstorylife.js', 'reefguide.js'].map((f) => readFileSync(new URL(`../src/world/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')).join('\n');

describe('(c) every step has a cue that points at the next target, and every cue resolves in both word sets with no banned word', () => {
  const trail = play(rig());
  it('there is a cue entry for every step 0..7, and the walk stood in each of them', () => {
    expect(CUES.map((c) => c.step)).toEqual(ALL_STEPS);
    for (const c of CUES) expect(trail.some((t) => t.step === c.step) || c.step === 4, `step ${c.step} was never seen on the walk`).toBe(true);
  });
  for (const c of CUES) {
    it(`step ${c.step} (${c.goal}): the ring points at the target, shows a picture, has lines, and a journal hint`, () => {
      expect(c.lines.length + (c.target ? 1 : 0) + (c.journal ? 1 : 0), `step ${c.step} has NO cue`).toBeGreaterThan(0);
      // the ring and the bubble: the meow's goal point, from the pure goal and the walk's goalNow
      const hits = trail.filter((t) => t.step === c.step && t.goal.g.kind === c.goal);
      if (c.step === 4) {
        // step 4 passes in a moment (Marlo tries the shell on by himself): the pure goal is still pinned
        expect(M.nextGoal(save(4))).toMatchObject({ kind: 'tryon', icon: c.icon });
      } else {
        expect(hits.length, `no goal of kind ${c.goal} at step ${c.step}`).toBeGreaterThan(0);
        for (const h of hits) {
          expect(h.goal.g.icon, 'the picture').toBe(c.icon);
          expect(Object.keys(S.BUBBLE_ICON), 'the picture exists').toContain(h.goal.g.icon);
          if (c.target) {
            const want = c.target(h);
            expect(Math.hypot(h.goal.x - want.x, h.goal.z - want.z), `step ${c.step}: the ring is not over the next target`).toBeLessThan(0.01);
          }
        }
      }
      if (c.glint) for (const h of hits) expect(h.glint, `step ${c.step}: no glint over the shell`).toBe(true);
      // the journal hint card
      expect(typeof HINTS[c.journal], `journal hint ${c.journal}`).toBe('string');
      expect(REEF_HINTS[c.journal], `journal hint ${c.journal} joined the page table`).toBe(HINTS[c.journal]);
      withOffWords(() => expect(bannedIn(HINTS[c.journal]), c.journal).toBeNull());
    });
    it(`step ${c.step}: every line resolves in the Clan and the everyday word sets, has no banned word, and is said by the live code`, () => {
      for (const id of c.lines) {
        expect(hasPhrase(id), `${id} is not in the phrase table`).toBe(true);
        const clan = phrase(id);
        expect(clan, id).toMatch(/\S/);
        expect(clan, `${id} reads as its own id`).not.toBe(id);
        withOffWords(() => {
          expect(hasPhrase(id), `${id} missing in the everyday set`).toBe(true);
          const every = phrase(id);
          expect(every, id).toMatch(/\S/);
          expect(bannedIn(every), `${id}: ${every}`).toBeNull();
        });
        expect(LIVE_SRC, `${id} is defined but no live file says it`).toContain(`phrase('${id}')`);
      }
    });
  }
});

// ---- (d) distance and sight -------------------------------------------------------------------------------------------------------------
// The longest leg the plan implies is shell one to shell two (about 42 m, see the numbers printed on failure). The constant chosen is 60 m, a bit more than the water's fog
// (40 m): a target farther than the fog is not seen from where she stands, so those steps must be reachable by the meow's ring alone (no range limit in the code: the ring
// rises over the goal wherever it is) and have a "find" line. If a later change makes a leg longer than 60 m, this test says which one.
const MAX_LEG = 60;
const FOG = P.WATER_LOOK.fogFar;
describe('(d) the distance from where she was to the next target', () => {
  const m0 = S.MARLO.start;
  // Marlo follows her, so a delivery happens where she is; the next leg starts at the last target she stood at.
  const legs = [
    ['spawn -> Marlo', P.REEF_SPAWN, m0, 0],
    ['Marlo -> shell one', m0, S.STORY_SHELLS[0], 1],
    ['shell one -> shell two', S.STORY_SHELLS[0], S.STORY_SHELLS[1], 2],
    ['shell two -> shell three', S.STORY_SHELLS[1], S.STORY_SHELLS[2], 3],
    ['shell three -> lantern 0', S.STORY_SHELLS[2], W.LANTERNS[0], 5],
    ['lantern 0 -> lantern 1', W.LANTERNS[0], W.LANTERNS[1], 5],
    ['lantern 1 -> lantern 2', W.LANTERNS[1], W.LANTERNS[2], 5],
    ['lantern 2 -> the parade (Marlo)', W.LANTERNS[2], W.STAGE, 6],
  ];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  it(`no leg is longer than ${MAX_LEG} m`, () => {
    for (const [name, a, b] of legs) expect(dist(a, b), `${name}: ${dist(a, b).toFixed(1)} m`).toBeLessThanOrEqual(MAX_LEG);
  });
  it(`a leg longer than the fog (${FOG} m) has a find line that the meow says, and the ring has no range limit`, () => {
    for (const [name, a, b, step] of legs) {
      if (dist(a, b) <= FOG) continue;
      const cue = CUES.find((c) => c.step === step);
      expect(cue.lines.some((id) => /\.(find|float|cave|hint)$/.test(id)), `${name} is beyond the fog and has no find line`).toBe(true);
    }
    // the ring is drawn over the goal wherever it is: goalPoint has no distance test (see reefmarlo.js), so a goal far away still gets its column of bubbles
    expect(readFileSync(new URL('../src/world/reefmarlo.js', import.meta.url), 'utf8')).not.toMatch(/ring\.visible\s*=\s*[^;]*dist\(/);
  });
});

// ---- (e) the stuck-state sweep ------------------------------------------------------------------------------------------------------------
describe('(e) from every saved step, a walk can still reach the end', () => {
  for (const s of ALL_STEPS) {
    it(`a save at step ${s} (shells ${M.SHELLS_AT[s]}) plays to step 7, pays once if it was not yet paid, and saves no carried shell`, () => {
      const r = rig(save(s));
      expect(M.nextGoal(reefOf(r)).kind).toMatch(/marlo|shell|deliver|tryon|lantern|parade|rest/);
      play(r);
      expect(reefOf(r)).toMatchObject({ step: 7, shells: 7 });
      expect(r.awards.length, 'paid once, or not at all when the story was already done').toBe(s === 7 ? 0 : 1);
      expect(JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}').reef ?? {}).not.toHaveProperty('carrying');
      r.mar.dispose();
    });
  }
  for (const [name, hostile] of [['shells without a step', { step: 0, shells: 1 }], ['a step without its shells', { step: 3, shells: 0 }], ['shells all three, step 2', { step: 2, shells: 7 }], ['nonsense', { step: 'x', shells: -3 }], ['too big', { step: 99, shells: 99 }]]) {
    it(`a hostile save (${name}) is repaired and still reaches the end`, () => {
      const r = rig(hostile);
      play(r);
      expect(M.normalize(reefOf(r)).step).toBe(7);
      expect(r.awards.length).toBeLessThanOrEqual(1);
      r.mar.dispose();
    });
  }
  it('a walk that ends with a shell in her mouth leaves it home on the next walk, whatever the step', () => {
    for (const i of [0, 1, 2]) {
      const r = rig(save(i + 1));
      const s = S.STORY_SHELLS[i];
      expect(press(r, i === 1 ? at(s.x - 1.8, s.z) : at(s.x + 0.7, s.z), i === 1 ? 1.1 : 0).k).toBe('pick');
      expect(r.mar.state.carrying).toBe(i);
      r.mar.dispose();
      const again = createMarlo({ scene: new THREE.Scene(), progression: r.progression, reducedMotion: false });
      expect(again.state.carrying, 'a new walk starts with an empty mouth').toBe(null);
      expect(again.state.shellModes[i]).toBe('home');
      again.dispose();
    }
  });
});
