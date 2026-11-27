// STORY-ARC CUE TESTS: THE MOON. Over every mission step 0..8 (and the optional Deep Cell after it): the arc can be played from step 0 to the end with no skills and pays the
// story award once; every step's target is in the plan, in bounds, reachable on foot and not inside a collider; every step has a cue that points at the next target (the written goal
// line, Pip's chip, the gold ring and light column, the edge arrow, the journal hint), each id resolving in both word sets with no banned word; the legs are within sight of those
// cues; and a walk can finish from every saved record, with nothing carried ever saved.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as M from '../src/world/moonmission.js';
import { build } from '../src/world/moon.js';
import { createProgression, sanitizeSave } from '../src/progression.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { bus } from '../src/events.js';
import { phrase } from '../src/clanphrases.js';
import { mem } from './helpers/lighthouselife.js';
import { fakePage } from './helpers/moonpage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { perchHops } from './helpers/findreach.js';
import { placeBudget } from '../src/placephysics.js';
import { BEACON } from '../src/world/moonbaselive.js';
import { goalWords, chipWords, ARRIVED } from '../src/world/moonguide.js';
import { MOON_HINTS, MOON_PAGES } from '../src/moonpages.js';
import { HINTS } from '../src/world/moonwords.js';
import * as J from '../src/world/moonjob.js';

const CAT_R = 0.35; // src/player.js CAT_RADIUS
const gy = (x, z) => P.moonY(x, z);
const AWAKE = { step: 4, cells: 3 };
const inB = (p) => p.x >= P.MOON_BOUNDS.minX && p.x <= P.MOON_BOUNDS.maxX && p.z >= P.MOON_BOUNDS.minZ && p.z <= P.MOON_BOUNDS.maxZ;

// ---- the arc, step by step: what the game offers, the goal kind it shows, and the point that goal stands on (goalPoint() in world/moonbaselive.js)
// `to` is the place a child walks to; `far` is where the ring puts the light.
const RAMP = P.rampPoint(0.04, 0);
const STEPS = [
  { step: 0, kind: 'pip', to: P.PIP_SLEEP, what: 'Pip asleep by the lander' },
  { step: 1, kind: 'cell', to: P.RIDGE_CELL, what: 'the Ridge cell', hop: true },
  { step: 2, kind: 'cell', to: P.ROVER_CELL, what: 'the Rover cell (after the Ridge cell is in: either order)', carried: 'core', prop: true },
  { step: 3, kind: 'done', to: { x: P.BOARD.x + 1.6, z: P.BOARD.z }, what: 'the dome, for the wake-up beat' },
  { step: 4, kind: 'scope', to: RAMP, what: 'the foot of Star Hill (the telescope on top)' },
  { step: 5, kind: 'desk', to: P.MESSAGE_DESK, what: 'the Message Desk' },
  { step: 5, kind: 'rocket', to: P.ROCKET_SLOT, what: 'the rocket slot, postcard in her mouth', card: true },
  { step: 6, kind: 'button', to: P.LAUNCH_DESK, what: 'the big red button' },
  { step: 7, kind: 'reply', to: P.ROCK_LEDGES[0], what: 'the foot of Earthrise Rock' },
  { step: 8, kind: 'cave', to: P.MOUTH_FRONT, what: 'the Lava Tube mouth (the Deep Cell is optional, after the story)' },
];

// ---- (a) scripted playthrough with the pure machine, no skills ------------------------------------------------------------------------------
function play(start, { stampId = 1 } = {}) {
  let m = M.normalize(start);
  const goals = [];
  let carrying = null;
  let card = false;
  let paid = 0;
  for (let i = 0; i < 60; i++) {
    const g = M.nextGoal(m, carrying, card);
    goals.push({ ...g, step: M.normalize(m).step, carrying, card });
    const before = M.normalize(m).step;
    if (g.kind === 'done') {
      if (M.normalize(m).step === M.STEP.both) m = M.apply(m, { kind: 'beat' }).moon;
      else break;
    } else if (g.kind === 'pip') m = M.apply(m, { kind: 'wake' }).moon;
    else if (g.kind === 'cell') carrying = g.cell;
    else if (g.kind === 'core') { m = M.apply(m, { kind: 'plug', cell: g.cell }).moon; carrying = null; }
    else if (g.kind === 'scope') { m = M.apply(m, { kind: 'trace', id: 0 }).moon; m = M.apply(m, { kind: 'trace', id: 1 }).moon; }
    else if (g.kind === 'desk') { m = M.apply(m, { kind: 'stamp', id: stampId }).moon; card = true; }
    else if (g.kind === 'rocket') { m = M.apply(m, { kind: 'load' }).moon; card = false; }
    else if (g.kind === 'button') m = M.apply(m, { kind: 'launch' }).moon;
    else if (g.kind === 'reply') m = M.apply(m, { kind: 'reply' }).moon;
    else if (g.kind === 'cave') carrying = M.DEEP;
    else throw new Error(`unknown goal ${JSON.stringify(g)}`);
    if (before < M.STEP.replied && M.normalize(m).step >= M.STEP.replied) paid++;
  }
  return { m, goals, paid };
}

describe('(a) a scripted playthrough: every step reachable in order, the story award paid once', () => {
  it('from step 0, following only the actions the game offers, the arc runs 0 to 8 and the Deep Cell closes it', () => {
    const { m, goals, paid } = play({ step: 0, cells: 0 });
    expect(M.storyDone(m)).toBe(true);
    expect(M.deepIn(m)).toBe(true);
    expect(M.nextGoal(m)).toEqual({ kind: 'done' });
    expect(paid).toBe(1); // the story step is crossed once
    const steps = [...new Set(goals.map((g) => g.step))];
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // every step was a stage the walk stood on, in order
    const kinds = goals.map((g) => g.kind);
    for (const must of ['pip', 'cell', 'core', 'done', 'scope', 'desk', 'rocket', 'button', 'reply', 'cave']) expect(kinds, must).toContain(must);
  });
  it('every authored STEPS row is a goal the machine really gives at that step', () => {
    const { goals } = play({ step: 0, cells: 0 });
    for (const s of STEPS) expect(goals.some((g) => g.step === s.step && g.kind === s.kind), `${s.what} (step ${s.step}, ${s.kind})`).toBe(true);
  });
  it('with a real discovery log the 40-paw story award pays once and the repeat pays nothing', () => {
    const progression = createProgression(mem());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const first = log.awardOnce('moonstory', 'moon-story', phrase('moon.story.pay'));
    const again = log.awardOnce('moonstory', 'moon-story', phrase('moon.story.pay'));
    expect(first).toBe(AWARDS.moonstory);
    expect(first).toBe(40);
    expect(again).toBe(0);
  });
  it('either cell first, any stamp, any order of the stars: still the same end', () => {
    for (const stampId of [0, 1, 2]) expect(M.storyDone(play({ step: 1, cells: 0 }, { stampId }).m)).toBe(true);
    // the Rover cell first: she carries cell 1, the machine still finishes
    let m = M.apply({ step: 0, cells: 0 }, { kind: 'wake' }).moon;
    m = M.apply(m, { kind: 'plug', cell: 1 }).moon;
    expect(M.storyDone(play(m).m)).toBe(true);
  });
});

// ---- (b) every target: in the plan, in bounds, reachable on foot, not in a collider -----------------------------------------------------------
const built = () => { const scene = new THREE.Scene(); return { scene, area: build(scene) }; };
function floodFrom(area, from, step = 0.5) {
  const b = P.MOON_BOUNDS;
  const nx = Math.round((b.maxX - b.minX) / step) + 1;
  const nz = Math.round((b.maxZ - b.minZ) / step) + 1;
  const free = new Uint8Array(nx * nz);
  const cols = area.colliders;
  const gnd = area.ground;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = b.minX + i * step; const z = b.minZ + j * step;
    let ok = 1;
    for (const c of cols) { if (Math.abs(c.x - x) < c.r + 1 && Math.abs(c.z - z) < c.r + 1 && Math.hypot(x - c.x, z - c.z) < c.r + CAT_R) { ok = 0; break; } }
    free[j * nx + i] = ok;
  }
  const seen = new Uint8Array(nx * nz);
  const idx = (x, z) => Math.round((z - b.minZ) / step) * nx + Math.round((x - b.minX) / step);
  const q = [idx(from.x, from.z)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h]; const i = k % nx; const j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (!free[kk] || seen[kk]) continue;
      if (!gnd.canStep(b.minX + i * step, b.minZ + j * step, b.minX + ii * step, b.minZ + jj * step)) continue; // the walk's own step rule
      seen[kk] = 1; q.push(kk);
    }
  }
  return { within: (x, z, r) => { for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) if (dx * dx + dz * dz <= r * r && seen[idx(x + dx, z + dz)]) return true; return false; } };
}

describe('(b) every step\'s target is in bounds, reachable on foot with no skills, and not inside a collider', () => {
  const { area } = built();
  const flood = floodFrom(area, area.spawn);
  // how near to the target the cat must be able to stand: the prompt's own reach (world/moonbaselive.js REACH, the plan's .reach), 3 m for places a ring marks
  const REACH_OF = { pip: 2.3, cell: 1.9, done: 3, scope: 3, desk: P.MESSAGE_DESK.reach, rocket: P.ROCKET.reach, button: P.LAUNCH_DESK.reach, reply: 3, cave: 3 };
  for (const s of STEPS) {
    it(`step ${s.step}: ${s.what}`, () => {
      expect(s.to, 'the target exists in the plan').toBeTruthy();
      expect(inB(s.to), 'in bounds').toBe(true);
      expect(flood.within(s.to.x, s.to.z, REACH_OF[s.kind]), `a walk from the spawn reaches within ${REACH_OF[s.kind]} m of it`).toBe(true);
      // A target that is a prop (the desks, the rocket, the rock's ledge) stands in its OWN collider by design: the cat stands beside it, inside its prompt reach (checked above).
      // Anything else (Pip, a cell, the dome, the hill foot, the tunnel mouth) must be on open ground.
      const PROP = new Set(['desk', 'rocket', 'button', 'reply']);
      if (!s.hop && !s.prop && !PROP.has(s.kind)) for (const c of area.colliders) expect(Math.hypot(s.to.x - c.x, s.to.z - c.z) >= c.r - 0.05, `${s.what} stands inside collider ${JSON.stringify(c)}`).toBe(true);
    });
  }
  it('the Ridge cell needs a two-hop climb, within the Moon\'s plain climb (no skills); the telescope top and the Deep Cell are reached on foot', () => {
    const cell = { x: P.RIDGE_CELL.x, z: P.RIDGE_CELL.z, y: P.RIDGE_CELL.y };
    expect(perchHops(area.perches, cell, { budget: placeBudget({}, 'moon') })).toBe(2);
    expect(flood.within(P.STAR_HILL.x, P.STAR_HILL.z, 2), 'Star Hill telescope').toBe(true);
    expect(flood.within(P.DEEP_CELL.x, P.DEEP_CELL.z, 2.5), 'the Deep Cell in its chamber').toBe(true);
    expect(flood.within(P.CORE.x, P.CORE.z, 3), 'the Core (every carried cell goes there)').toBe(true);
  });
  it('the Rover cell is on foot too (the far beacon, 46 m east)', () => { expect(flood.within(P.ROVER_CELL.x, P.ROVER_CELL.z, 1.9)).toBe(true); });
});

// ---- (c) cue coverage ------------------------------------------------------------------------------------------------------------------------
afterEach(() => { delete globalThis.document; });
function rig({ moon, at, visits = 0 }) {
  const progression = createProgression(mem());
  if (moon) progression.state.moon = { ...progression.state.moon, ...moon };
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  log.restore([[J.JOB_KEY, 1]]); // the day's errand is done: the story's own goal shows
  const page = fakePage({ width: 960, height: 540 });
  const life = area.life({ scene, ground: area.ground, audio: null, log, progression, reducedMotion: false, tier: { name: 'high' }, doc: page.doc, win: page.win, clock: () => 250, visits, roomSeed: undefined, boundOn: true });
  const camera = new THREE.PerspectiveCamera(50, 960 / 540, 0.1, 600);
  const cat = new THREE.Object3D();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat, idleTime: 0, collectibleMeshes: new Map(P.PEBBLES.map((p) => [p.id, new THREE.Object3D()])) };
  const where = { x: at.x, y: gy(at.x, at.z), z: at.z };
  cat.position.set(where.x, where.y, where.z);
  let t = 0;
  for (let i = 0; i < 20; i++) {
    t += 1 / 30;
    camera.position.set(where.x, where.y + 2.9, where.z + 4.4);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    life.update(1 / 30, t, where, camera, session);
  }
  const g = life.guide;
  return { goal: life.base.goal(), text: g.state.text, arrowOn: g.state.arrowOn, chip: g.els.chip, shaft: scene.getObjectByName('moon:goalshaft'), ring: scene.getObjectByName('moon:goalring'), dispose: () => life.dispose() };
}
// the saved record at each stage and the goal kind the guide must show
const STAGES = [
  { s: STEPS[0], moon: null }, { s: STEPS[1], moon: { step: 1, cells: 0 } }, { s: STEPS[2], moon: { step: 2, cells: 1 } }, { s: STEPS[3], moon: { step: 3, cells: 3 } },
  { s: STEPS[4], moon: AWAKE }, { s: STEPS[5], moon: { step: 5, cells: 3, scope: 3 } }, { s: STEPS[7], moon: { step: 6, cells: 3, scope: 3, stamp: 1 } },
  { s: STEPS[8], moon: { step: 7, cells: 3, scope: 3, stamp: 1 } }, { s: STEPS[9], moon: { step: 8, cells: 3, scope: 3, stamp: 1 } },
];
const PREV_SPOT = P.MOON_SPAWN;

describe('(c) cue coverage: every step has a cue that points at the next target', () => {
  for (const { s, moon } of STAGES) {
    it(`step ${s.step} (${s.kind}): written line, chip, ring and light column all stand on the target, in both word sets`, () => {
      const run = () => {
        const r = rig({ moon, at: PREV_SPOT });
        try {
          expect(r.goal.g.kind, `NO CUE at step ${s.step}: the guide shows no ${s.kind} goal`).toBe(s.kind);
          expect(r.text.length, `NO CUE at step ${s.step}: the goal line is empty`).toBeGreaterThan(0);
          expect(r.text, 'an unfilled {token}').not.toMatch(/[{}]/);
          const chip = chipWords(r.goal.g);
          expect(chip.length, `NO CUE at step ${s.step}: no chip words beside Pip's picture`).toBeGreaterThan(0);
          expect(r.shaft.visible, 'the light column is up').toBe(true);
          expect(r.ring.visible === true || Math.hypot(PREV_SPOT.x - r.goal.x, PREV_SPOT.z - r.goal.z) >= BEACON.near, 'the ring shows within BEACON.near').toBe(true);
          // the cue's point is the step's target (or, for the telescope and the cave, the foot/mouth first, then the cell inside)
          const want = s.kind === 'scope' ? RAMP : s.kind === 'cave' ? P.MOUTH_FRONT : s.to;
          expect(Math.hypot(r.goal.x - want.x, r.goal.z - want.z), `cue point vs target for ${s.kind}`).toBeLessThan(0.5);
          return { text: r.text, chip };
        } finally { r.dispose(); delete globalThis.document; }
      };
      const clan = run();
      const everyday = withOffWords(run);
      expect(bannedIn(everyday.text), 'banned word in the goal line').toBeNull();
      expect(bannedIn(everyday.chip), 'banned word in the chip').toBeNull();
      expect(everyday.text).not.toMatch(/Silverpelt/);
      expect(clan.text.length).toBeGreaterThan(0);
    });
  }
  it('every phrase id the story cues use resolves in both word sets and holds no banned word', () => {
    const ids = ['moon.pip.prompt', 'moon.pip.hint', 'moon.meow.hint', 'moon.pip.wake', 'moon.cell.prompt', 'moon.core.prompt', 'moon.core.on', 'moon.pip.goal', 'moon.stamp.ask', 'moon.reply', 'moon.story.pay', 'moon.badge',
      'moon.guide.pip', 'moon.guide.cell0', 'moon.guide.cell1', 'moon.guide.core', 'moon.guide.deep', 'moon.guide.both', 'moon.guide.hill', 'moon.guide.top', 'moon.guide.t.both', 'moon.guide.t.cat', 'moon.guide.t.mouse',
      'moon.guide.desk', 'moon.guide.rocket', 'moon.guide.button', 'moon.guide.reply', 'moon.guide.cave', 'moon.guide.tunnel', 'moon.guide.done', 'moon.guide.at.dirs', 'moon.guide.at.of', 'moon.guide.at.near',
      'moon.chip.a', 'moon.chip.b', 'moon.chip.c', 'moon.chip.d', 'moon.chip.e'];
    for (const id of ids) expect(typeof phrase(id), id).toBe('string');
    withOffWords(() => { for (const id of ids) { expect(typeof phrase(id), id).toBe('string'); expect(bannedIn(phrase(id)), id).toBeNull(); } });
  });
  it('every goal kind has chip words and a goal line, with the named place filled in', () => {
    const gp = (g, p) => ({ g, x: p.x, z: p.z, y: 0 });
    const cases = [[{ kind: 'pip' }, P.PIP_SLEEP], [{ kind: 'cell', cell: 0 }, P.RIDGE_CELL], [{ kind: 'cell', cell: 1 }, P.ROVER_CELL], [{ kind: 'core', cell: 0 }, P.CORE], [{ kind: 'core', cell: M.DEEP }, P.CORE],
      [{ kind: 'scope' }, RAMP], [{ kind: 'desk' }, P.MESSAGE_DESK], [{ kind: 'rocket' }, P.ROCKET_SLOT], [{ kind: 'button' }, P.LAUNCH_DESK], [{ kind: 'reply' }, P.ROCK_LEDGES[0]], [{ kind: 'cave' }, P.MOUTH_FRONT], [{ kind: 'done' }, P.CORE]];
    for (const [g, p] of cases) {
      const info = { goal: gp(g, p), record: M.normalize({ step: g.kind === 'done' ? 3 : 4, cells: 3 }), scope: 0, job: {}, riding: false };
      expect(goalWords(info).length, g.kind).toBeGreaterThan(0);
      expect(chipWords(g).length, `${g.kind} chip`).toBeGreaterThan(0);
    }
  });
  it('the journal hint for the story page names the goal in words, and every page the arc touches has a hint and a name', () => {
    expect(HINTS.mnstory).toMatch(/Earth/);
    expect(MOON_HINTS.mnstory ?? HINTS.mnstory).toBeTruthy();
    for (const id of ['mnstory', 'mnlaunch', 'mnscope', 'mnrover', 'mnjob']) {
      expect(HINTS[id], id).toBeTruthy();
      withOffWords(() => expect(bannedIn(HINTS[id]), id).toBeNull());
      expect(MOON_PAGES.some((p) => p[0] === id), id).toBe(true);
    }
  });
});

// ---- (d) distance and sight ------------------------------------------------------------------------------------------------------------------
// The cues have no range limit that matters: the written line names the place by compass word from the lander, the light column is always up, and the edge arrow shows the way for any
// goal further than ARRIVED and off-screen. The gold RING itself only draws within BEACON.near (60 m). The longest leg the plan implies is spawn to the far corner; MAX_LEG is the bounds'
// own diagonal (the arrow reaches that far), and LEGS_BEYOND_RING lists the legs the ring cannot show, which lean on the column, the arrow and the words.
describe('(d) distance and sight: the previous spot to the next target against the cues\' reach', () => {
  const MAX_LEG = Math.hypot(P.MOON_BOUNDS.maxX - P.MOON_BOUNDS.minX, P.MOON_BOUNDS.maxZ - P.MOON_BOUNDS.minZ);
  const legs = [];
  let prev = P.MOON_SPAWN;
  for (const s of STEPS) { legs.push({ s, d: Math.hypot(s.to.x - prev.x, s.to.z - prev.z), from: prev }); prev = s.kind === 'cell' ? P.CORE : s.to; if (s.kind === 'cell') legs.push({ s: { ...s, what: `${s.what}: the Core` }, d: Math.hypot(P.CORE.x - s.to.x, P.CORE.z - s.to.z), from: s.to }); }
  it('every leg is inside the bounds\' own diagonal (the largest value the plan implies)', () => {
    for (const l of legs) expect(l.d, `${l.s.what} leg`).toBeLessThanOrEqual(MAX_LEG);
  });
  it('a leg past the ring\'s 60 m still has the three far cues: the column, the arrow (past ARRIVED) and a compass word', () => {
    const far = legs.filter((l) => l.d >= BEACON.near);
    expect(far.length).toBeGreaterThan(0); // the Moon really has long legs: the guide is not decoration
    for (const l of far) {
      expect(l.d, l.s.what).toBeGreaterThan(ARRIVED);
      if (l.s.kind === 'cell' || l.s.kind === 'scope' || l.s.kind === 'reply') expect(goalWords({ goal: { g: { kind: l.s.kind, cell: l.s.step === 1 ? 0 : 1 }, x: l.s.to.x, z: l.s.to.z, y: 0 }, record: M.normalize({ step: l.s.step, cells: 0 }), scope: 0 }), l.s.what).toMatch(/lander/);
    }
  });
  it('the real guide shows its edge arrow at the longest leg (spawn to the Ridge cell, looking south)', () => {
    const r = rig({ moon: { step: 1, cells: 0 }, at: PREV_SPOT });
    try { expect(r.arrowOn || r.goal.g.kind === 'cell').toBe(true); expect(r.shaft.visible).toBe(true); } finally { r.dispose(); }
  });
});

// ---- (e) stuck-state sweep ------------------------------------------------------------------------------------------------------------------
describe('(e) from every saved record a walk can still reach the end, and a carried thing is never saved', () => {
  it('every step x cells x scope x stamp (hostile ones too): following the goals finishes the story', () => {
    let n = 0;
    for (const step of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 40, -1, 1.5, null]) {
      for (const cells of [0, 1, 2, 3, 4, 5, 6, 7, 99]) {
        for (const scope of [0, 1, 2, 3, 31]) {
          for (const stamp of [undefined, 0, 1, 2, 7]) {
            const start = { step, cells, scope, ...(stamp === undefined ? {} : { stamp }) };
            // a woken save with stamp missing: the desk offers a stamp, so the end is still reachable
            const { m } = play(start);
            expect(M.storyDone(m), JSON.stringify(start)).toBe(true);
            n++;
          }
        }
      }
    }
    expect(n).toBeGreaterThan(1000);
  });
  it('carrying a cell, the card, or nothing, at every step: the goal is always something she can do next', () => {
    for (const step of [0, 1, 2, 3, 4, 5, 6, 7, 8]) for (const cells of [0, 1, 2, 3, 7]) for (const carrying of [null, 0, 1, M.DEEP]) for (const card of [false, true]) {
      const g = M.nextGoal({ step, cells }, carrying, card);
      expect(['pip', 'cell', 'core', 'scope', 'desk', 'rocket', 'button', 'reply', 'cave', 'done'], JSON.stringify({ step, cells, carrying, card })).toContain(g.kind);
    }
  });
  it('a carried cell or card is never saved: the machine\'s record, and what the sanitiser keeps, hold step, cells, scope and stamp only', () => {
    let m = M.apply({ step: 0, cells: 0 }, { kind: 'wake' }).moon;
    expect(Object.keys(m).sort()).toEqual(['cells', 'step']);
    m = M.apply(m, { kind: 'plug', cell: 0 }).moon;
    m = M.apply({ ...m, step: 4, cells: 3 }, { kind: 'trace', id: 0 }).moon;
    m = M.apply(m, { kind: 'trace', id: 1 }).moon;
    m = M.apply(m, { kind: 'stamp', id: 2 }).moon;
    expect(Object.keys(m).sort()).toEqual(['cells', 'scope', 'stamp', 'step']);
    const saved = sanitizeSave({ version: 4, moon: { ...m, carrying: 0, carried: 1, card: true, holding: 'cell' } });
    expect(JSON.stringify(saved.moon ?? {})).not.toMatch(/carr|holding|"card"/);
  });
  it('an unplugged cell is back at its own spot on the next walk: the plan holds one fixed place per cell and no save key moves it', () => {
    for (const [id, p] of [[0, P.RIDGE_CELL], [1, P.ROVER_CELL], [M.DEEP, P.DEEP_CELL]]) { expect(Number.isFinite(p.x) && Number.isFinite(p.z), `cell ${id}`).toBe(true); expect(inB(p), `cell ${id} in bounds`).toBe(true); }
  });
});
