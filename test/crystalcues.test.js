// The Crystal Cave's story-arc cues: every mission step (0 to 7) can be played from the start to the end with no skills, every target is in a place she can walk to, every
// step has a cue that points at the next target (the meow's ring and picture, a glint, a line, a journal hint) in both word sets, the legs are not longer than the plan
// implies, and a save at any step (or a hostile one) still walks to the end. No WebGL: the real Lumi and light show run on a bare THREE.Scene.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as M from '../src/crystalmission.js';
import * as S from '../src/world/crystalstory.js';
import * as P from '../src/world/crystalplan.js';
import { createLumi } from '../src/world/crystallife.js';
import { createWing, GEM_ID } from '../src/world/crystalwing.js';
import { SHOW } from '../src/world/crystalshow.js';
import { HINTS } from '../src/world/crystalwords.js';
import '../src/world/crystalwingwords.js'; // (the wing's lines join the phrase table when the cave's chunk arrives)
import { CRYSTAL_HINTS } from '../src/crystalpages.js';
import { AWARDS } from '../src/discoveries.js';
import { createProgression, SAVE_KEY } from '../src/progression.js';
import { phrase, hasPhrase } from '../src/clanphrases.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { memoryStorage } from './helpers/storage.js';

// ---- the rig: the real Lumi and the real wing, a stand-in log that counts the pay ----------------------------------------------------------------
const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z) => ({ x, z, y: P.crystalY(x, z) });
function rig(rec = null) {
  const storage = memoryStorage();
  const progression = createProgression(storage);
  if (rec) { progression.state.crystal = { ...progression.state.crystal, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const awards = [];
  const log = { awardOnce: (kind, key, text) => { awards.push({ kind, key, text }); return AWARDS[kind] ?? 0; }, count: () => 0, mark() {} };
  const lum = createLumi({ scene, progression, reducedMotion: false });
  const wing = createWing({ scene, lumi: lum, progression, log, reducedMotion: false, send: () => {} });
  return { storage, progression, scene, lum, wing, awards };
}
const recOf = (r) => r.progression.state.crystal;
const tick = (r, cat, n = 1, dt = 0.05) => { for (let i = 0; i < n; i++) { r.lum.update(dt, i * dt, cat, null, sess()); r.wing.update(dt, i * dt, cat, null, sess()); } };
const press = (r, cat) => {
  tick(r, cat, 1);
  const line = r.wing.promptAt(cat) ?? r.lum.promptAt(cat);
  if (!line) return { line: null, k: null };
  return { line, k: r.wing.promptAt(cat) ? r.wing.interact() : (r.lum.promptAt(cat), r.lum.interact()) };
};
const nearLumi = (r) => at(r.lum.lumi.x + 1.5, r.lum.lumi.z);
const heartSpot = at(S.HEART.x - 2.5, S.HEART.z + 1);

// The actions the game offers for one step, with the cat's feet only (no skill is ever needed: the stones are picked and set by standing near).
function bringStone(r, i) {
  const s = S.STONES[i];
  const c = S.CRYSTALS[i];
  expect(press(r, at(s.x + 0.8, s.z)).k, `pick stone ${i}`).toBe('pick');
  expect(recOf(r).sparks & (1 << i), `a carried stone ${i} is never saved`).toBe(0);
  expect(JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}').crystal?.carrying, 'no carrying key in the save').toBeUndefined();
  const g = r.lum.goalNow();
  expect(g.g.kind, 'with the stone in her mouth the goal is to deliver').toBe('deliver');
  expect([g.x, g.z], 'the deliver ring is over its crystal').toEqual([c.x, c.z]);
  expect(press(r, at(c.x + 2, c.z + 1.5)).k, `set stone ${i}`).toBe('give');
}

// Plays from whatever step the save holds to the end, recording what the cues said before each action: [{ step, goal, glint }].
function play(r) {
  const trail = [];
  const snap = (cat) => {
    tick(r, cat ?? nearLumi(r), 1);
    const goal = r.lum.goalNow();
    const gl = goal.g.kind === 'stone' ? r.scene.getObjectByName(`crystal:glint${goal.g.stone}`) : null;
    trail.push({ step: M.normalize(recOf(r)).step, goal, glint: gl ? gl.visible : null, lumi: { x: r.lum.lumi.x, z: r.lum.lumi.z } });
  };
  for (let guard = 0; guard < 30; guard++) {
    const step = M.normalize(recOf(r)).step;
    if (step >= M.STEP.done) break;
    if (step === 0) { snap(at(P.CRYSTAL_SPAWN.x, P.CRYSTAL_SPAWN.z)); const l = r.lum.lumi; expect(press(r, at(l.x + 1.2, l.z)).k, 'meet Lumi').toBe('meet'); }
    else if (step <= M.STEP.sky) { snap(); bringStone(r, step - 1); }
    else if (step === M.STEP.gold) { snap(); tick(r, nearLumi(r), 60); } // the passages light by themselves
    else if (step === M.STEP.lit) { snap(); expect(press(r, heartSpot).k, 'wake the Heart Crystal').toBe('wake'); }
    else if (step === M.STEP.show) {
      snap(heartSpot);
      if (!r.wing.showOn()) expect(press(r, heartSpot).k, 'wake the Heart Crystal again').toBe('wake');
      tick(r, heartSpot, Math.ceil((SHOW.secs + 2) / 0.05));
    }
  }
  snap();
  return trail;
}
const ALL_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
const save = (step) => ({ step, sparks: M.SPARKS_AT[step] });

// ---- (a) the scripted playthrough --------------------------------------------------------------------------------------------------------
describe('(a) the scripted playthrough from step 0 to the end, with no skills', () => {
  it('every mission step is reached in order and the story award is paid once (and the gem is given)', () => {
    const r = rig();
    const trail = play(r);
    const seen = [...new Set(trail.map((t) => t.step))];
    for (const s of ALL_STEPS) expect(seen, `step ${s}`).toContain(s);
    expect(recOf(r)).toMatchObject({ step: 7, sparks: 7 });
    expect(r.awards.map((a) => a.kind), 'crystalstory paid exactly once').toEqual(['crystalstory']);
    expect(AWARDS.crystalstory).toBe(40);
    expect(r.progression.state.unlocked.accessories).toContain(GEM_ID);
    r.lum.dispose();
  });
  it('no stone was saved while carried, and no extra key is saved', () => {
    const r = rig();
    play(r);
    expect(Object.keys(JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}').crystal ?? {})).not.toContain('carrying');
  });
  it('after the story the light show can be shown again for fun and pays nothing', () => {
    const r = rig(save(7));
    const p = press(r, heartSpot);
    expect(p).toEqual({ line: phrase('crystal.heart.replay'), k: 'replay' });
    expect(r.wing.showOn()).toBe(true);
    tick(r, heartSpot, Math.ceil((SHOW.secs + 2) / 0.05));
    expect(r.awards).toEqual([]);
    expect(recOf(r).step).toBe(7);
  });
});

// ---- the places ----------------------------------------------------------------------------------------------------------------------------
const B = P.CRYSTAL_BOUNDS;
const inB = (p, m = 1) => p.x >= B.minX + m && p.x <= B.maxX - m && p.z >= B.minZ + m && p.z <= B.maxZ - m;
// Every target the story asks her to stand at; `solid` names the collider the target is allowed to sit on or inside (the prop itself).
const TARGETS = [
  { step: 0, name: 'Lumi (hello)', p: S.LUMI.start, reach: S.LUMI.reach },
  { step: 1, name: 'rose stone (Rose hall)', p: S.STONES[0], reach: S.STONES[0].reach },
  { step: 1, name: 'Rose crystal (to set the stone)', p: S.CRYSTALS[0], reach: S.CRYSTALS[0].reach, solid: S.CRYSTALS[0] },
  { step: 2, name: 'sky stone (across the Blue Pool)', p: S.STONES[1], reach: S.STONES[1].reach },
  { step: 2, name: 'Blue crystal', p: S.CRYSTALS[1], reach: S.CRYSTALS[1].reach, solid: S.CRYSTALS[1] },
  { step: 3, name: 'gold stone (nook)', p: S.STONES[2], reach: S.STONES[2].reach },
  { step: 3, name: 'Gold crystal', p: S.CRYSTALS[2], reach: S.CRYSTALS[2].reach, solid: S.CRYSTALS[2] },
  { step: 5, name: 'Heart Crystal', p: S.HEART, reach: S.HEART.reach, solid: S.HEART },
];
const cols = P.crystalColliders();
const ground = P.createCrystalGround();
const cell = 0.5;
const nx = Math.round((B.maxX - B.minX) / cell) + 1;
const nz = Math.round((B.maxZ - B.minZ) / cell) + 1;
const keyOf = (i, j) => j * nx + i;
const seen = new Set();
{
  const free = (x, z) => !cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.3);
  const start = [Math.round((P.CRYSTAL_SPAWN.x - B.minX) / cell), Math.round((P.CRYSTAL_SPAWN.z - B.minZ) / cell)];
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
    expect(S.STONES).toHaveLength(M.STONE_COUNT);
    expect(S.CRYSTALS).toHaveLength(M.STONE_COUNT);
    expect(M.STONE_STEP).toHaveLength(3);
    for (const t of TARGETS) expect(t.p && Number.isFinite(t.p.x) && Number.isFinite(t.p.z), t.name).toBe(true);
  });
  it('each is inside the bounds', () => {
    for (const t of TARGETS) expect(inB(t.p), `step ${t.step}: ${t.name}`).toBe(true);
  });
  it('each is within reach of a floor cell she can walk to from the spawn', () => {
    for (const t of TARGETS) expect(walkableNear(t.p, t.reach - 0.3), `step ${t.step}: ${t.name} is not reachable on foot`).toBe(true);
  });
  it('none sits inside a collider (a great crystal is the prop the stone is set on)', () => {
    for (const t of TARGETS) {
      for (const c of cols) {
        if (t.solid && Math.hypot(c.x - t.solid.x, c.z - t.solid.z) < 0.01) continue;
        expect(Math.hypot(t.p.x - c.x, t.p.z - c.z), `step ${t.step}: ${t.name} inside ${JSON.stringify(c)}`).toBeGreaterThan(c.r + 0.2);
      }
    }
  });
  it('the spawn is open floor', () => {
    expect(inB(P.CRYSTAL_SPAWN)).toBe(true);
    for (const c of cols) expect(Math.hypot(P.CRYSTAL_SPAWN.x - c.x, P.CRYSTAL_SPAWN.z - c.z)).toBeGreaterThan(c.r + 0.3);
  });
});

// ---- (c) cue coverage -------------------------------------------------------------------------------------------------------------------
const CUES = [
  { step: 0, goal: 'lumi', icon: 'heart', target: (t) => t.lumi, lines: ['crystal.lumi.hello', 'crystal.lumi.prompt'], journal: 'ccstonerose' },
  { step: 1, goal: 'stone', icon: 'spark', target: () => S.STONES[0], lines: ['crystal.lumi.met', 'crystal.stone.find', 'crystal.stone.prompt', 'crystal.stone.got', 'crystal.stone.give'], journal: 'ccstonerose', glint: true },
  { step: 2, goal: 'stone', icon: 'spark', target: () => S.STONES[1], lines: ['crystal.rose.lit', 'crystal.sky.find', 'crystal.sky.got'], journal: 'ccstonesky', glint: true },
  { step: 3, goal: 'stone', icon: 'spark', target: () => S.STONES[2], lines: ['crystal.sky.lit', 'crystal.gold.find', 'crystal.gold.got'], journal: 'ccstonegold', glint: true },
  { step: 4, goal: 'heart', icon: 'spark', target: () => S.HEART, lines: ['crystal.gold.lit', 'crystal.passages.lit'], journal: 'ccheart' },
  { step: 5, goal: 'heart', icon: 'spark', target: () => S.HEART, lines: ['crystal.heart.prompt'], journal: 'ccshow' },
  { step: 6, goal: 'heart', icon: 'spark', target: () => S.HEART, lines: ['crystal.heart.prompt', 'crystal.show.start'], journal: 'ccshow' },
  { step: 7, goal: 'rest', icon: 'heart', target: null, lines: ['crystal.show.pay', 'crystal.gem', 'crystal.heart.replay'], journal: 'ccerrand' },
];
const LIVE_SRC = ['crystallife.js', 'crystalwing.js', 'crystal.js'].map((f) => readFileSync(new URL(`../src/world/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')).join('\n');

describe('(c) every step has a cue that points at the next target, and every cue resolves in both word sets with no banned word', () => {
  const trail = play(rig());
  it('there is a cue entry for every step 0..7, and the walk stood in each of them', () => {
    expect(CUES.map((c) => c.step)).toEqual(ALL_STEPS);
    for (const c of CUES) expect(trail.some((t) => t.step === c.step), `step ${c.step} was never seen on the walk`).toBe(true);
  });
  for (const c of CUES) {
    it(`step ${c.step} (${c.goal}): the ring points at the target, shows a picture, has lines, and a journal hint`, () => {
      expect(c.lines.length + (c.target ? 1 : 0) + (c.journal ? 1 : 0), `step ${c.step} has NO cue`).toBeGreaterThan(0);
      const hits = trail.filter((t) => t.step === c.step && t.goal.g.kind === c.goal);
      expect(hits.length, `no goal of kind ${c.goal} at step ${c.step}`).toBeGreaterThan(0);
      for (const h of hits) {
        expect(h.goal.g.icon, 'the picture').toBe(c.icon);
        expect(Object.keys(S.BUBBLE_ICON), 'the picture exists').toContain(h.goal.g.icon);
        if (c.target) {
          const want = c.target(h);
          expect(Math.hypot(h.goal.x - want.x, h.goal.z - want.z), `step ${c.step}: the ring is not over the next target`).toBeLessThan(0.01);
        }
        if (c.glint) expect(h.glint, `step ${c.step}: no glint over the stone`).toBe(true);
      }
      expect(typeof HINTS[c.journal], `journal hint ${c.journal}`).toBe('string');
      expect(CRYSTAL_HINTS[c.journal], `journal hint ${c.journal} joined the page table`).toBe(HINTS[c.journal]);
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
// The longest leg the plan implies is the Rose crystal to the sky stone across the pool (about 40 m). The constant chosen is 60 m, a bit more than the cave's fog (38 m):
// a target farther than the fog is not seen from where she stands, so those steps must be reachable by the meow's ring alone (no range limit in the code: the ring rises
// over the goal wherever it is) and have a "find" line. If a later change makes a leg longer than 60 m, this test says which one.
const MAX_LEG = 60;
const FOG = P.CAVE_LOOK.fogFar;
describe('(d) the distance from where she was to the next target', () => {
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // Lumi follows her, so the next leg starts where she delivered.
  const legs = [
    ['spawn -> Lumi', P.CRYSTAL_SPAWN, S.LUMI.start, 0],
    ['Lumi -> rose stone', S.LUMI.start, S.STONES[0], 1],
    ['rose stone -> Rose crystal', S.STONES[0], S.CRYSTALS[0], 1],
    ['Rose crystal -> sky stone', S.CRYSTALS[0], S.STONES[1], 2],
    ['sky stone -> Blue crystal', S.STONES[1], S.CRYSTALS[1], 2],
    ['Blue crystal -> gold stone', S.CRYSTALS[1], S.STONES[2], 3],
    ['gold stone -> Gold crystal', S.STONES[2], S.CRYSTALS[2], 3],
    ['Gold crystal -> Heart Crystal', S.CRYSTALS[2], S.HEART, 5],
  ];
  it(`no leg is longer than ${MAX_LEG} m`, () => {
    for (const [name, a, b] of legs) expect(dist(a, b), `${name}: ${dist(a, b).toFixed(1)} m`).toBeLessThanOrEqual(MAX_LEG);
  });
  it(`a leg longer than the fog (${FOG} m) has a find line that the meow says, and the ring has no range limit`, () => {
    for (const [name, a, b, step] of legs) {
      if (dist(a, b) <= FOG) continue;
      const cue = CUES.find((c) => c.step === step);
      expect(cue.lines.some((id) => /\.(find|hint)$/.test(id) || /find/.test(id)), `${name} is beyond the fog and has no find line`).toBe(true);
    }
    expect(readFileSync(new URL('../src/world/crystallife.js', import.meta.url), 'utf8')).not.toMatch(/ring\.visible\s*=\s*[^;]*dist\(/);
  });
  it('the sky stone is the one leg the plan says is long, and the cave\'s own glint hangs over it', () => {
    expect(S.STONES[1].hideBehind).toBeTruthy();
    expect(trailGlints()).toBe(true);
  });
  function trailGlints() { const r = rig(save(2)); tick(r, nearLumi(r), 2); return r.scene.getObjectByName('crystal:glint1').visible; }
});

// ---- (e) the stuck-state sweep ------------------------------------------------------------------------------------------------------------
describe('(e) from every saved step, a walk can still reach the end', () => {
  for (const s of ALL_STEPS) {
    it(`a save at step ${s} (sparks ${M.SPARKS_AT[s]}) plays to step 7, pays once if it was not yet paid, and saves no carried stone`, () => {
      const r = rig(save(s));
      expect(M.nextGoal(recOf(r)).kind).toMatch(/lumi|stone|deliver|heart|rest/);
      play(r);
      expect(recOf(r)).toMatchObject({ step: 7, sparks: 7 });
      expect(r.awards.length, 'paid once, or not at all when the story was already done').toBe(s === 7 ? 0 : 1);
      expect(JSON.parse(r.storage.getItem(SAVE_KEY) ?? '{}').crystal ?? {}).not.toHaveProperty('carrying');
      r.lum.dispose();
    });
  }
  for (const [name, hostile] of [['sparks without a step', { step: 0, sparks: 1 }], ['a step without its sparks', { step: 3, sparks: 0 }], ['all sparks, step 2', { step: 2, sparks: 7 }], ['nonsense', { step: 'x', sparks: -3 }], ['too big', { step: 99, sparks: 99 }]]) {
    it(`a hostile save (${name}) is repaired and still reaches the end`, () => {
      const r = rig(hostile);
      play(r);
      expect(M.normalize(recOf(r)).step).toBe(7);
      expect(r.awards.length).toBeLessThanOrEqual(1);
      r.lum.dispose();
    });
  }
  it('a walk that ends with a stone in her mouth leaves it home on the next walk, whatever the step', () => {
    for (const i of [0, 1, 2]) {
      const r = rig(save(i + 1));
      const s = S.STONES[i];
      expect(press(r, at(s.x + 0.8, s.z)).k).toBe('pick');
      expect(r.lum.state.carrying).toBe(i);
      r.lum.dispose();
      const again = createLumi({ scene: new THREE.Scene(), progression: r.progression, reducedMotion: false });
      expect(again.state.carrying, 'a new walk starts with an empty mouth').toBe(null);
      expect(again.state.stoneModes[i]).toBe('home');
      again.dispose();
    }
  });
});
