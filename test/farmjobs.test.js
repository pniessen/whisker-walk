// Appletree Farm, step 3: the four jobs and the six finds (src/farmjobs.js),
// what they pay (src/game/farmplay.js), their words (src/farmwords.js) and
// their place in the save. The design's anti-goals are each held here: no job
// has a timer or can be failed, nothing is caught, nothing frightens the cat,
// and the goat with the hat never leaves the farm or goes near the water.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';

vi.stubGlobal('document', {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => new Proxy({}, {
      get: (_target, key) => {
        if (key === 'getImageData') return (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => {} });
        return () => {};
      },
      set: () => true,
    }),
  }),
});

const { build } = await import('../src/world/farm.js');
const { createFarmSim, clearance, inRect, CAT_WALK, COW, CHICK } = await import('../src/farmsim.js');
const {
  createFarmJobs, FARM_JOB_IDS, FARM_FIND_IDS, FARM_JOURNAL_TYPES, JOB_STATES, JOB, CHICK_SPOT_SETS, goatRoute, mouseRuns,
  FARM_HAT_ID, FARM_HAT_KIND, jobJournalId, findJournalId,
} = await import('../src/farmjobs.js');
const { createFarmAnimals } = await import('../src/farmanimals.js');
const {
  payFarmJob, noteFarmFind, farmPromptText, farmObjective, handleFarmEvent, restoreFarmJobs, addFarmHat, hatAtDoor, jobKey, findKey,
} = await import('../src/game/farmplay.js');
const { JOB_WORDS, FIND_WORDS, PAGE_WORDS, ANIMAL_TOASTS, jobGoalLine } = await import('../src/farmwords.js');
const { phrase, hasPhrase, LATER_PHRASE_IDS, PHRASE_IDS } = await import('../src/clanphrases.js');
const { createProgression, JOURNAL_TYPES } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { discoveryText } = await import('../src/ui/hud.js');
const { isWalkableAt } = await import('../src/player.js');
const { createCarryables } = await import('../src/carryables.js');
const { createMouth, pick, drop, walkEndMarks } = await import('../src/carry.js');
const { snapshotWalk } = await import('../src/game/walkresume.js');
const { setSeriesMode, addWordSet, removeWordSet, seriesModes, SERIES_ON } = await import('../src/wordset.js');
const { offWords, withOffWords, bannedIn } = await import('./helpers/offwords.js');
const { createInteractions } = await import('../src/game/interactions.js');

const DT = 1 / 30;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const code = (p) => read(p).split('\n').filter((l) => !l.trim().startsWith('//')).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const mem = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
};
const inWater = (area, x, z, margin = 0) => area.waters.some((w) => Math.hypot(x - w.x, z - w.z) < w.r + margin);

const AREA = build(new THREE.Scene());
const A = AREA.anchors;

// The Farm's animals and jobs, and a cat that is only numbers: she walks in
// straight lines at `speed` (the slowest trot unless told otherwise).
function world(seed = 'test') {
  const sim = createFarmSim(AREA, { seed });
  const jobs = createFarmJobs(AREA, sim, { seed: `${seed}-jobs` });
  const cat = { x: 0, z: 46, y: 0, speed: 0, running: false, inWater: false, perched: false, jumping: false, riding: null, fx: 0, fz: -1, hat: false };
  const events = [];
  const w = { sim, jobs, cat, events, t: 0 };
  w.tick = (dt = DT) => {
    sim.step(dt, cat);
    jobs.step(dt, cat);
    for (const e of jobs.takeEvents()) events.push(e);
    w.t += dt;
  };
  w.run = (seconds) => { for (let s = 0; s < seconds; s += DT) w.tick(); };
  // Walks toward (x, z), stopping `stop` short. Returns the seconds it took.
  w.walk = (x, z, { speed = CAT_WALK, stop = 0.05, until = () => false, max = 600 } = {}) => {
    const t0 = w.t;
    while (w.t - t0 < max && !until()) {
      const d = Math.hypot(x - cat.x, z - cat.z);
      if (d <= stop) break;
      const step = Math.min(speed * DT, d - stop);
      cat.fx = (x - cat.x) / d; cat.fz = (z - cat.z) / d;
      cat.x += cat.fx * step; cat.z += cat.fz * step;
      cat.speed = speed;
      w.tick();
    }
    cat.speed = 0;
    return w.t - t0;
  };
  w.put = (x, z) => { cat.x = x; cat.z = z; };
  w.of = (type) => events.filter((e) => e.type === type);
  return w;
}

afterEach(() => {
  setSeriesMode(SERIES_ON);
  for (const id of seriesModes()) removeWordSet(id);
});

// =============================================================================
describe('the table of jobs: no clock, no way to fail, only ever forwards', () => {
  it('names four jobs and six finds, each with a journal page', () => {
    expect(FARM_JOB_IDS).toEqual(['chicks', 'cow', 'goat', 'mice']);
    expect(FARM_FIND_IDS).toEqual(['loftcats', 'eggs', 'owl', 'scarecrow', 'apples', 'ducklings']);
    expect(FARM_JOURNAL_TYPES).toEqual([...FARM_JOB_IDS.map(jobJournalId), ...FARM_FIND_IDS.map(findJournalId)]);
    // the save's journal vocabulary is this list, appended after the animals
    expect(JOURNAL_TYPES.slice(-10)).toEqual([...FARM_JOURNAL_TYPES]);
    for (const id of FARM_JOURNAL_TYPES) {
      const page = CRITTER_INFO.find((c) => c.id === id);
      expect(page, id).toBeTruthy();
      expect(page.name.length, id).toBeGreaterThan(3);
      expect(page.hint.length, id).toBeGreaterThan(8);
      expect(page.emoji, id).toBeTruthy();
    }
  });

  it('every job starts offered and ends done, and no state is a failure or a countdown', () => {
    expect(Object.keys(JOB_STATES)).toEqual([...FARM_JOB_IDS]);
    for (const id of FARM_JOB_IDS) {
      const row = JOB_STATES[id];
      expect(row[0]).toBe('offer');
      expect(row[row.length - 1]).toBe('done');
      for (const s of row) expect(s).not.toMatch(/fail|lost|late|time|expire|missed/i);
    }
    expect(createFarmJobs(AREA, createFarmSim(AREA)).state).toEqual({ chicks: 'offer', cow: 'offer', goat: 'offer', mice: 'offer' });
  });

  it('the module keeps no clock for a job: nothing in it counts down but an owl\'s open eye', () => {
    const src = code('farmjobs.js');
    expect(src).not.toMatch(/Date\.now|performance\.now|setTimeout|setInterval|Math\.random/);
    // the only things that run down with the seconds: the owl's open eye and the goat's skip on the spot
    const downs = [...src.matchAll(/(\w+(?:\.\w+)*) = Math\.max\(0, [\w.]+ - dt/g)].map((m) => m[1]);
    expect(downs.sort()).toEqual(['goat.skip', 'owl.peek']);
    expect(src).not.toMatch(/deadline|timeLeft|countdown|timeout/i);
  });

  it('left alone for an hour in every state, a job is exactly where it was', () => {
    // each job taken as far as each of its states, then the cat sits at the gate for an hour
    const setups = {
      chicks: [(w) => {}, (w) => w.jobs.accept('chicks')],
      cow: [(w) => {}, (w) => w.jobs.accept('cow'), (w) => { w.jobs.accept('cow'); leadCow(w); }],
      goat: [(w) => {}, (w) => w.jobs.accept('goat'), (w) => { w.jobs.accept('goat'); chase(w); }],
      mice: [(w) => {}, (w) => w.jobs.accept('mice')],
    };
    for (const id of FARM_JOB_IDS) {
      setups[id].forEach((setup, i) => {
        const w = world(`idle-${id}-${i}`);
        setup(w);
        expect(w.jobs.state[id], `${id} ${i}`).toBe(JOB_STATES[id][i]);
        w.put(0, 46);
        w.cat.hat = false;
        for (let s = 0; s < 3600; s += 0.1) w.tick(0.1);
        expect(w.jobs.state[id], `${id} after an hour in '${JOB_STATES[id][i]}'`).toBe(JOB_STATES[id][i]);
      });
    }
  });

  it('a cat that wanders anywhere for ten minutes only ever moves a job forwards', () => {
    for (const seed of ['a', 'b', 'c']) {
      const w = world(`wander-${seed}`);
      for (const id of FARM_JOB_IDS) w.jobs.accept(id);
      let r = 12345 + seed.charCodeAt(0);
      const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
      const seen = Object.fromEntries(FARM_JOB_IDS.map((id) => [id, [w.jobs.state[id]]]));
      const b = AREA.bounds;
      for (let leg = 0; leg < 40; leg++) {
        const x = b.minX + 2 + rnd() * (b.maxX - b.minX - 4);
        const z = b.minZ + 2 + rnd() * (b.maxZ - b.minZ - 4);
        w.cat.running = rnd() < 0.3;
        w.walk(x, z, { speed: w.cat.running ? 7 : CAT_WALK, max: 15 });
        for (const id of FARM_JOB_IDS) if (seen[id][seen[id].length - 1] !== w.jobs.state[id]) seen[id].push(w.jobs.state[id]);
      }
      for (const id of FARM_JOB_IDS) {
        const idx = seen[id].map((s) => JOB_STATES[id].indexOf(s));
        expect(idx.every((v) => v >= 0), `${id}: ${seen[id]}`).toBe(true);
        expect([...idx].sort((p, q) => p - q), `${id}: ${seen[id]}`).toEqual(idx);
      }
    }
  });
});

// ---- helpers the jobs' tests share -------------------------------------------------------
function leadCow(w) {
  const cow = w.sim.jobCow;
  const pts = cow.follow.line.points;
  w.put(pts[0].x, pts[0].z);
  for (let i = 1; i < pts.length; i++) {
    // ahead of her along the line, waiting whenever she falls more than a few steps behind
    const guard = w.t;
    while (dist(w.cat, pts[i]) > 0.1 && w.t - guard < 600) {
      if (cow.follow.line.project(w.cat.x, w.cat.z) - cow.follow.s > 6) { w.tick(); continue; }
      w.walk(pts[i].x, pts[i].z, { max: 0.5 });
    }
  }
  const guard = w.t;
  while (w.jobs.state.cow === 'active' && w.t - guard < 300) w.tick();
}
// Straight at the goat at `speed`, until it drops the hat. Returns the seconds.
function chase(w, { speed = CAT_WALK, max = 600 } = {}) {
  const g = w.jobs.hatGoat;
  const t0 = w.t;
  while (w.jobs.state.goat === 'active' && w.t - t0 < max) {
    const before = w.t;
    w.walk(g.x, g.z, { speed, stop: 0.3, max: DT });
    if (w.t === before) w.tick(); // standing beside it: time still passes
  }
  return w.t - t0;
}

// =============================================================================
describe('job 1: round up the chicks', () => {
  it('each set of four spots is open ground a cat can walk to, out of the water and inside the farm', () => {
    expect(CHICK_SPOT_SETS).toHaveLength(3);
    for (const set of CHICK_SPOT_SETS) {
      expect(set).toHaveLength(JOB.CHICKS);
      for (const p of set) {
        expect(isWalkableAt(AREA, p.x, p.z), JSON.stringify(p)).toBe(true);
        expect(clearance(AREA.colliders, p.x, p.z), JSON.stringify(p)).toBeGreaterThan(1);
        expect(inRect(AREA.bounds, p.x, p.z, 3)).toBe(true);
        expect(inWater(AREA, p.x, p.z, 2)).toBe(false);
        expect(dist(p, A.coopDoor)).toBeGreaterThan(6);   // somewhere to be found, not beside the coop
        expect(dist(p, A.coopDoor)).toBeLessThan(40);     // and one walk away
        for (const q of set) if (q !== p) expect(dist(p, q)).toBeGreaterThan(4);
      }
    }
    // a walk's seed picks one of the sets
    const picked = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => CHICK_SPOT_SETS.indexOf(world(s).jobs.chickSpots)));
    expect(picked.size).toBeGreaterThan(1);
    expect([...picked].every((i) => i >= 0)).toBe(true);
  });

  it('is offered at the coop and by the mother hen, and nowhere else', () => {
    const w = world();
    w.put(A.coopDoor.x + 1.5, A.coopDoor.z + 1);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'offer', job: 'chicks' });
    w.put(w.sim.hens[0].x + 1, w.sim.hens[0].z);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'offer', job: 'chicks' });
    w.put(0, 30);
    expect(w.jobs.actionFor(w.cat)).toBe(null);
    // not from up on something, or from the water
    w.put(A.coopDoor.x + 1.5, A.coopDoor.z + 1);
    expect(w.jobs.actionFor({ ...w.cat, perched: true })).toBe(null);
    expect(w.jobs.actionFor({ ...w.cat, inWater: true })).toBe(null);
  });

  it('a calm walker finds all four, walks them to the coop, and each hops in', () => {
    for (const seed of ['one', 'two', 'three', 'four']) {
      const w = world(seed);
      w.put(A.coopDoor.x + 1.5, A.coopDoor.z);
      expect(w.jobs.act({ kind: 'offer', job: 'chicks' }, w.cat)).toBe(true);
      expect(w.jobs.state.chicks).toBe('active');
      w.tick();
      // they are out at the spots, waiting
      w.sim.chicks.forEach((c, i) => expect(dist(c, w.jobs.chickSpots[i])).toBeLessThan(0.5));
      for (const p of w.jobs.chickSpots) { w.walk(p.x, p.z, { stop: 1 }); w.run(1); }
      expect(w.sim.chicks.filter((c) => c.following)).toHaveLength(4);
      expect(w.of('chick-found')).toHaveLength(1);
      w.walk(A.coopDoor.x, A.coopDoor.z);
      w.run(6);
      expect(w.of('chick-home').map((e) => e.n)).toEqual([1, 2, 3, 4]);
      expect(w.jobs.state.chicks, seed).toBe('done');
      expect(w.of('job-done').map((e) => e.job)).toEqual(['chicks']);
      // out of the coop again and back with their mother
      w.run(20);
      for (const c of w.sim.chicks) {
        expect(c.hidden).toBe(false);
        expect(c.placed).toBe(null);
        expect(dist(c, w.sim.hens[0])).toBeLessThan(3);
      }
      expect(w.jobs.actionFor({ ...w.cat, x: A.coopDoor.x + 1, z: A.coopDoor.z })).toBe(null); // not offered twice on a walk
    }
  });

  it('a chick at the coop hops up the ramp and is out of sight; the line behind the cat closes up', () => {
    const w = world();
    w.jobs.accept('chicks');
    for (const p of w.jobs.chickSpots.slice(0, 3)) { w.walk(p.x, p.z, { stop: 1 }); w.run(1); }
    const line = w.sim.chicks.filter((c) => c.following).sort((p, q) => p.order - q.order);
    expect(line.map((c) => c.order)).toEqual([0, 1, 2]);
    expect(w.sim.coopChick(line[0].id)).toBe(true);
    expect(line[0].following).toBe(false);
    expect(line.slice(1).map((c) => c.order)).toEqual([0, 1]);
    w.run(CHICK.COOP_HOP + 0.2);
    expect(line[0].hidden).toBe(true);
    expect(dist(line[0], w.sim.coopIn)).toBeLessThan(0.05);
    expect(w.sim.coopChick(line[0].id)).toBe(false); // once
  });

  it('a cat that wanders off loses nothing: the chicks she found wait where she left them', () => {
    const w = world('wander');
    w.jobs.accept('chicks');
    const [p0, p1] = w.jobs.chickSpots;
    w.walk(p0.x, p0.z, { stop: 1 }); w.run(1);
    w.walk(p1.x, p1.z, { stop: 1 }); w.run(1);
    // half way to the coop, then she runs off to the far corner for ten minutes
    const half = { x: (p1.x + A.coopDoor.x) / 2, z: (p1.z + A.coopDoor.z) / 2 };
    w.walk(half.x, half.z);
    const found = w.sim.chicks.filter((c) => c.following);
    expect(found).toHaveLength(2);
    w.cat.running = true;
    w.walk(38, 44, { speed: 7 });
    w.cat.running = false;
    w.run(600);
    expect(w.jobs.state.chicks).toBe('active');
    expect(w.jobs.chicks.home).toBe(0);
    for (const c of found) {
      expect(c.hidden).toBe(false);
      expect(dist(c, half), 'near where she left it').toBeLessThan(6);
      expect(dist(c, p0) > 3 || dist(c, p1) > 3).toBe(true);
    }
    // back for them, and on with the job
    w.walk(half.x, half.z, { stop: 0.5 }); w.run(2);
    for (const c of found) expect(dist(c, w.cat)).toBeLessThan(3);
    for (const p of w.jobs.chickSpots.slice(2)) { w.walk(p.x, p.z, { stop: 1 }); w.run(1); }
    for (const c of found) if (!c.following) { w.walk(c.x, c.z, { stop: 0.8 }); w.run(1); }
    w.walk(A.coopDoor.x, A.coopDoor.z);
    w.run(8);
    for (const c of w.sim.chicks) if (!w.jobs.chicks.in.has(c.id)) { w.walk(c.x, c.z, { stop: 0.8 }); w.run(1); w.walk(A.coopDoor.x, A.coopDoor.z); w.run(4); }
    expect(w.jobs.state.chicks).toBe('done');
  });

  it('nothing happens to a chick the hen still has before the job is taken on', () => {
    const w = world();
    w.put(A.coopDoor.x, A.coopDoor.z);
    w.run(10);
    expect(w.jobs.state.chicks).toBe('offer');
    expect(w.sim.chicks.every((c) => !c.hidden && !c.coop)).toBe(true);
    expect(w.of('chick-home')).toEqual([]);
  });
});

// =============================================================================
describe('job 2: bring the cow in', () => {
  it('is offered at the gate, the trough and beside the job cow, but not to a cat on her back', () => {
    const w = world();
    for (const p of [A.pastureGate, A.trough, w.sim.jobCow]) {
      w.put(p.x - 1, p.z + 1);
      expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'offer', job: 'cow' });
    }
    expect(w.jobs.actionFor({ ...w.cat, riding: 'cow-1' })).toBe(null);
  });

  it('a calm walker leads her to the milking shed, laps the milk, and she walks home', () => {
    const w = world();
    w.put(A.pastureGate.x - 1, A.pastureGate.z);
    expect(w.jobs.act({ kind: 'offer', job: 'cow' }, w.cat)).toBe(true);
    const cow = w.sim.jobCow;
    expect(cow.follow).toBeTruthy();
    expect(cow.follow.see).toBe(JOB.COW_SEE);
    expect(JOB.COW_SEE).toBeGreaterThan(COW.FOLLOW_SEE);
    leadCow(w);
    expect(w.jobs.state.cow).toBe('milk');
    expect(w.of('cow-milk')).toHaveLength(1);
    expect(dist(cow, A.milkingShedDoor)).toBeLessThan(4);
    // the saucer: on free ground by the shed door, within reach of where she stands
    const s = w.jobs.saucer;
    expect(isWalkableAt(AREA, s.x, s.z)).toBe(true);
    expect(dist(s, A.milkingShedDoor)).toBeLessThan(2);
    w.put(0, 30);
    expect(w.jobs.actionFor(w.cat)).toBe(null);
    w.put(s.x - 0.8, s.z);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'milk' });
    expect(w.jobs.act({ kind: 'milk' }, w.cat)).toBe(true);
    expect(w.jobs.state.cow).toBe('done');
    w.tick();
    expect(w.of('job-done').map((e) => e.job)).toEqual(['cow']);
    // released: back the way she came, and grazing in her field again
    expect(cow.follow.back).toBe(true);
    w.run(120);
    expect(cow.follow).toBe(null);
    expect(inRect(A.pasture, cow.x, cow.z)).toBe(true);
    expect(w.jobs.act({ kind: 'milk' }, w.cat)).toBe(false);
  });

  it('she waits for a cat that wanders off, for as long as it takes, and comes on when the cat is back', () => {
    const w = world('cow-wander');
    w.put(A.pastureGate.x - 1, A.pastureGate.z);
    w.jobs.accept('cow');
    const cow = w.sim.jobCow;
    w.walk(A.pastureGate.x - 6, A.pastureGate.z);
    w.run(40);
    const s0 = cow.follow.s;
    expect(s0).toBeGreaterThan(1);
    w.put(-30, 40);           // off to the pond
    w.run(1800);
    expect(w.jobs.state.cow).toBe('active');
    expect(cow.follow.s).toBeCloseTo(s0, 5);
    leadCow(w);
    expect(w.jobs.state.cow).toBe('milk');
  });
});

// =============================================================================
describe('job 3: catch the goat', () => {
  const R = goatRoute(A);

  it('its route is inside the farm, clear of everything solid, out of the water, and ends in a corner', () => {
    const w = world();
    const route = w.jobs.route;
    expect(route.length).toBeGreaterThan(60);
    for (let s = 0; s <= route.length; s += 0.1) {
      const p = route.at(s);
      expect(inRect(AREA.bounds, p.x, p.z, 4), `s ${s.toFixed(1)}`).toBe(true);
      expect(inWater(AREA, p.x, p.z, 8), `s ${s.toFixed(1)}`).toBe(false);
      // on the ground it keeps clear; over the bale it is in the air
      if (route.yAt(s) < 0.05) expect(clearance(AREA.colliders, p.x, p.z), `s ${s.toFixed(1)} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBeGreaterThan(0.4);
    }
    // the hop is onto the first hay bale, and back down
    expect(R.filter((p) => p.y)).toEqual([{ x: A.baleRoute[0].x, z: A.baleRoute[0].z, y: A.baleRoute[0].y }]);
    // it starts in the paddock and its last stop is the nook behind the bales
    expect(inRect(A.goatPaddock, R[0].x, R[0].z)).toBe(true);
    expect(R[R.length - 1].stop).toBe(true);
    expect(w.jobs.stops).toHaveLength(JOB.GOAT_SPEEDS.length);
    // slower on every leg, and by the end slower than the slowest cat
    for (let i = 1; i < JOB.GOAT_SPEEDS.length; i++) expect(JOB.GOAT_SPEEDS[i]).toBeLessThan(JOB.GOAT_SPEEDS[i - 1]);
    expect(JOB.GOAT_SPEEDS[JOB.GOAT_SPEEDS.length - 1]).toBeLessThan(CAT_WALK - 0.5);
    expect(JOB.GOAT_SPEEDS.filter((v) => v < CAT_WALK).length).toBeGreaterThanOrEqual(3);
  });

  it('until the job is taken on it is an ordinary paddock goat with a hat in its mouth', () => {
    const w = world();
    const g = w.jobs.hatGoat;
    expect(g).toBe(w.sim.goats[0]);
    expect(g.carry).toBe('hat');
    expect(g.script).toBe(null);
    expect(w.jobs.goat.mode).toBe('play');
    w.put(g.x + 8, g.z);
    w.run(120);
    expect(g.script).toBe(null);
    expect(inRect(A.goatPaddock, g.x, g.z)).toBe(true);
    expect(w.jobs.state.goat).toBe('offer');
    // the other goat never has anything to do with it
    expect(w.sim.goats[1].carry).toBe(null);
    // offered beside it, and at the farmhouse door
    w.put(g.x + 2, g.z);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'offer', job: 'goat' });
    w.put(A.farmhouseDoor.x + 1.5, A.farmhouseDoor.z);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'offer', job: 'goat' });
  });

  it('taken on from anywhere, even up on its stand, it comes down and trots to the gate', () => {
    for (const seed of ['g1', 'g2', 'g3', 'g4', 'g5']) {
      const w = world(seed);
      const g = w.jobs.hatGoat;
      w.put(0, 46);
      w.run(20 + seed.charCodeAt(1)); // wherever it has got to
      w.jobs.accept('goat');
      let n = 0;
      while (w.jobs.goat.mode !== 'wait' && n++ < 30 * 60) {
        w.tick();
        expect(inRect(A.goatPaddock, g.x, g.z, -0.6), `${seed} at ${g.x.toFixed(1)},${g.z.toFixed(1)}`).toBe(true);
      }
      expect(w.jobs.goat.mode, seed).toBe('wait');
      expect(dist(g, R[0])).toBeLessThan(0.05);
      expect(g.y).toBe(0);
    }
  });

  it('a cat at the slowest trot always catches it, inside two minutes, wherever she starts', () => {
    const starts = [[-20, -20], [0, 46], [30, 30], [-30, 30], [9, -3], [-9.6, -7.9], [7.7, -8.6], [0, 0]];
    const times = [];
    starts.forEach(([x, z], i) => {
      const w = world(`chase-${i}`);
      w.put(x, z);
      w.jobs.accept('goat');
      const t = chase(w);
      times.push(t);
      expect(w.jobs.state.goat, `from ${x},${z}`).toBe('hat');
      expect(t, `from ${x},${z}`).toBeLessThan(120);
      const drop = w.of('goat-drop');
      expect(drop).toHaveLength(1);
      // the hat lies on free ground, inside the farm, out of the water
      expect(isWalkableAt(AREA, drop[0].x, drop[0].z)).toBe(true);
      expect(inRect(AREA.bounds, drop[0].x, drop[0].z, 3)).toBe(true);
      expect(inWater(AREA, drop[0].x, drop[0].z, 5)).toBe(false);
      expect(w.jobs.hat.at).toBe('ground');
      expect(w.jobs.hatGoat.carry).toBe(null);
    });
    expect(Math.max(...times)).toBeLessThan(120);
  });

  it('a slower cat still gets it: at its last stop the goat simply waits to be caught', () => {
    for (const speed of [1.2, 2.0, 2.6]) {
      const w = world(`slow-${speed}`);
      w.put(-20, -20);
      w.jobs.accept('goat');
      const t = chase(w, { speed, max: 900 });
      expect(w.jobs.state.goat, `at ${speed} m/s`).toBe('hat');
      expect(t).toBeLessThan(79 / speed + 120); // the route is 79 m: one walk along it
    }
    // cornered, it never runs again
    const w = world('corner');
    w.jobs.accept('goat');
    w.jobs.goat.mode = 'wait'; w.jobs.goat.leg = w.jobs.stops.length; w.jobs.goat.s = w.jobs.route.length;
    w.jobs.hatGoat.script = null;
    w.put(0, 46);
    w.tick();
    expect(w.jobs.goat.leg).toBe(w.jobs.stops.length);
  });

  it('is a chase and not a tap: a cat standing beside it at the start does not have the hat at once', () => {
    const w = world('tap');
    const g = w.jobs.hatGoat;
    w.put(R[0].x + 0.5, R[0].z);
    w.jobs.accept('goat');
    const t = chase(w);
    expect(w.jobs.state.goat).toBe('hat');
    expect(w.jobs.goat.s, 'how far it ran first').toBeGreaterThan(25);
    expect(t).toBeGreaterThan(8);
    expect(w.of('goat-skip').length).toBeGreaterThanOrEqual(2);
    expect(g.y).toBeLessThan(0.2); // caught on the ground, never in the air
  });

  it('it only runs while the cat is near, and waits for a cat that gives up, for as long as it takes', () => {
    const w = world('giveup');
    const g = w.jobs.hatGoat;
    w.put(-20, -20);
    w.jobs.accept('goat');
    const guard = w.t;
    while (w.jobs.goat.leg < 1 && w.t - guard < 120) {
      const before = w.t;
      w.walk(g.x, g.z, { stop: 0.3, max: DT });
      if (w.t === before) w.tick();
    }
    expect(w.jobs.goat.leg).toBe(1);
    // she walks away to the gate: the goat stays where it is
    w.put(0, 46);
    w.tick();
    const at = { x: g.x, z: g.z };
    w.run(1800);
    expect(w.jobs.state.goat).toBe('active');
    expect(dist(g, at)).toBeLessThan(0.01);
    expect(g.carry).toBe('hat');
    // and never comes after her: nothing here chases the cat
    expect(dist(g, w.cat)).toBeGreaterThan(30);
    chase(w);
    expect(w.jobs.state.goat).toBe('hat');
  });

  it('the goat is never anywhere but on its route while it has the job, whatever the cat does', () => {
    const w = world('route');
    const g = w.jobs.hatGoat;
    w.put(-20, -20);
    w.jobs.accept('goat');
    let r = 99;
    const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    let checked = 0;
    for (let i = 0; i < 30 * 240; i++) {
      // a cat that runs about near the goat, in and out of reach
      if (i % 45 === 0) { w.cat.x = g.x + (rnd() - 0.5) * 12; w.cat.z = g.z + (rnd() - 0.5) * 12; w.cat.running = rnd() < 0.5; }
      w.tick();
      if (g.script && w.jobs.goat.mode !== 'gather') {
        const p = w.jobs.route.at(w.jobs.goat.s);
        expect(Math.hypot(p.x - g.x, p.z - g.z)).toBeLessThan(1e-6);
        checked++;
      }
      expect(inRect(AREA.bounds, g.x, g.z, 3)).toBe(true);
      expect(inWater(AREA, g.x, g.z, 5)).toBe(false);
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('the hat dropped, it trots home to the paddock and is an ordinary goat again', () => {
    const w = world('home');
    const g = w.jobs.hatGoat;
    w.put(-20, -20);
    w.jobs.accept('goat');
    chase(w);
    expect(w.jobs.goat.mode).toBe('home');
    w.put(0, 46);
    w.run(90);
    expect(w.jobs.goat.mode).toBe('free');
    expect(g.script).toBe(null);
    expect(g.carry).toBe(null);
    expect(inRect(A.goatPaddock, g.x, g.z)).toBe(true);
    w.run(120);
    expect(inRect(A.goatPaddock, g.x, g.z)).toBe(true); // and stays a paddock goat
  });

  it('the hat is carried like anything else, and the job ends at the farmhouse door', () => {
    const w = world('hat');
    w.put(-20, -20);
    w.jobs.accept('goat');
    chase(w);
    const hat = w.jobs.hat;
    expect(w.jobs.objective().step).toBe('pickup');
    expect(w.jobs.objective().target).toBe(hat);
    // not handed in without the hat, however near the door
    w.put(A.farmhouseDoor.x + 1, A.farmhouseDoor.z);
    expect(w.jobs.actionFor(w.cat)).toBe(null);
    // picked up
    w.put(hat.x, hat.z);
    w.cat.hat = true;
    w.tick();
    expect(hat.at).toBe('cat');
    expect(w.jobs.objective().step).toBe('carry');
    expect(w.jobs.objective().target).toBe(A.farmhouseDoor);
    // put down half way: it lies there, the job is where it was, an hour later too
    w.walk(-5, 0);
    w.cat.hat = false;
    w.tick();
    expect(hat.at).toBe('ground');
    expect(dist(hat, w.cat)).toBeLessThan(0.2);
    w.put(30, 30);
    w.run(3600);
    expect(w.jobs.state.goat).toBe('hat');
    expect(hat.at).toBe('ground');
    // picked up again and carried to the door
    w.put(hat.x, hat.z);
    w.cat.hat = true;
    w.walk(A.farmhouseDoor.x + 1.2, A.farmhouseDoor.z);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'deliver' });
    expect(w.jobs.act({ kind: 'deliver' }, w.cat)).toBe(true);
    expect(w.jobs.state.goat).toBe('done');
    expect(hat.at).toBe('door');
    w.tick();
    expect(w.of('job-done').map((e) => e.job)).toEqual(['goat']);
    expect(w.jobs.objective()).toBe(null);
  });
});

// =============================================================================
describe('job 4: barn mouser', () => {
  it('each mouse has a way home along free ground that ends at the hole in the wall', () => {
    const runs = mouseRuns(A);
    expect(runs).toHaveLength(5);
    for (const run of runs) {
      expect(isWalkableAt(AREA, run[0].x, run[0].z)).toBe(true);
      expect(run[run.length - 1]).toEqual({ x: A.grainStoreHole.x, z: A.grainStoreHole.z });
      expect(dist(run[0], A.grainStoreDoor)).toBeLessThan(9);
      for (let i = 1; i < run.length - 1; i++) {
        const a = run[i - 1];
        const b = run[i];
        for (let k = 0; k <= 10; k++) expect(clearance(AREA.colliders, a.x + ((b.x - a.x) * k) / 10, a.z + ((b.z - a.z) * k) / 10)).toBeGreaterThan(0.2);
      }
      for (const p of run) expect(inRect(AREA.bounds, p.x, p.z, 3)).toBe(true);
    }
  });

  it('nobody is about until the job is taken on; then a calm walker sends each one home', () => {
    const w = world();
    expect(w.jobs.mice.every((m) => m.mode === 'hidden')).toBe(true);
    w.put(A.grainStoreDoor.x, A.grainStoreDoor.z);
    w.run(5);
    expect(w.jobs.mice.every((m) => m.mode === 'hidden')).toBe(true);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'offer', job: 'mice' });
    expect(w.jobs.act({ kind: 'offer', job: 'mice' }, w.cat)).toBe(true);
    for (const m of w.jobs.mice) {
      const start = m.line.points[0];
      w.walk(start.x - 0.6, start.z, { stop: 0.2 });
      w.run(3);
    }
    expect(w.jobs.mice.map((m) => m.mode)).toEqual(['gone', 'gone', 'gone', 'gone', 'gone']);
    for (const m of w.jobs.mice) expect(dist(m, A.grainStoreHole)).toBeLessThan(0.01);
    expect(w.of('mouse-run')).toHaveLength(5);
    expect(w.of('mouse-out').map((e) => e.n)).toEqual([1, 2, 3, 4, 5]);
    expect(w.jobs.state.mice).toBe('done');
    expect(w.jobs.miceOut).toBe(5);
  });

  it('a mouse left alone stays; the count is kept while the cat is away', () => {
    const w = world('mice-away');
    w.put(A.grainStoreDoor.x, A.grainStoreDoor.z);
    w.jobs.accept('mice');
    w.run(3);
    const out = w.jobs.miceOut;
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThan(5);
    w.put(0, 46);
    w.run(1800);
    expect(w.jobs.miceOut).toBe(out);
    expect(w.jobs.state.mice).toBe('active');
    expect(w.jobs.mice.filter((m) => m.mode === 'idle')).toHaveLength(5 - out);
  });

  it('a pounce cannot catch one: however the cat arrives, a mouse only ever runs home', () => {
    const w = world('pounce');
    w.put(0, 46);
    w.jobs.accept('mice');
    const modes = new Set();
    for (const m of w.jobs.mice) {
      // a pounce that lands right on it, mid-air and at a run
      Object.assign(w.cat, { x: m.x, z: m.z, running: true, jumping: true });
      w.tick();
      modes.add(m.mode);
      for (let i = 0; i < 90; i++) { w.cat.x = m.x; w.cat.z = m.z; w.tick(); modes.add(m.mode); } // and stays on top of it
      expect(m.mode).toBe('gone');
    }
    expect([...modes].sort()).toEqual(['gone', 'run']);
    expect(w.events.map((e) => e.type).filter((t) => /catch|caught|pounce|hurt|eat/.test(t))).toEqual([]);
    expect(w.jobs.state.mice).toBe('done');
    // they are not creatures of critters.js at all: no stalk, chase prompt or pounce-tag can aim at one
    expect(code('critters.js')).not.toMatch(/barn-mouse|barnmouse|farmjobs/);
    expect(code('farmjobs.js')).not.toMatch(/critters|pounceCatch|catchAt/);
    expect(Object.keys(w.jobs).filter((k) => /catch|pounce/i.test(k))).toEqual([]);
    for (const m of w.jobs.mice) expect(m.type).toBe('barnmouse');
  });
});

// =============================================================================
describe('the six finds', () => {
  const loftCat = (w) => Object.assign(w.cat, { x: A.hayloft.x, z: A.hayloft.z, y: A.hayloft.y, perched: true, fx: 0, fz: 1 });

  it('the hayloft family: found from up in the loft, once for each time she comes up', () => {
    const w = world();
    // from the yard below, nothing
    w.put(A.hayloftNest.x, A.hayloftNest.z + 6);
    w.run(1);
    expect(w.of('find')).toEqual([]);
    loftCat(w);
    w.run(2);
    expect(w.of('find').map((e) => e.id)).toEqual(['loftcats']); // (she has her back to the owl)
    expect(w.jobs.loft.visitor).toBe(true);
    Object.assign(w.cat, { x: 0, z: 30, y: 0, perched: false });
    w.run(1);
    expect(w.jobs.loft.visitor).toBe(false);
    loftCat(w);
    w.run(1);
    expect(w.of('find').filter((e) => e.id === 'loftcats')).toHaveLength(2);
  });

  it('the owl: found by looking at it from the loft, or by a meow it hears; it opens one eye and sleeps on', () => {
    const w = world();
    loftCat(w);
    w.run(1);
    expect(w.of('find').some((e) => e.id === 'owl')).toBe(false);
    const d = dist(w.cat, A.rafters);
    w.cat.fx = (A.rafters.x - w.cat.x) / d; w.cat.fz = (A.rafters.z - w.cat.z) / d;
    w.run(1);
    expect(w.of('find').filter((e) => e.id === 'owl')).toHaveLength(1);
    expect(w.jobs.owl.peek).toBe(0);
    expect(w.jobs.meow(w.cat, w.cat.y)).toBe(true);
    expect(w.jobs.owl.peek).toBe(JOB.OWL_PEEK);
    w.run(JOB.OWL_PEEK + 0.5);
    expect(w.jobs.owl.peek).toBe(0);
    expect(w.of('owl-peek')).toHaveLength(1);
    // a meow down in the yard is not heard
    expect(w.jobs.meow({ x: A.rafters.x, z: A.rafters.z + 8 }, 0)).toBe(false);
    expect(w.jobs.meow({ x: A.rafters.x, z: A.rafters.z }, 0)).toBe(false);
  });

  it('the eggs: found by walking up to the nest behind the tractor', () => {
    const w = world();
    expect(isWalkableAt(AREA, A.tractorNest.x - 0.9, A.tractorNest.z)).toBe(true);
    w.put(A.tractorNest.x - 6, A.tractorNest.z);
    w.run(1);
    expect(w.of('find')).toEqual([]);
    w.put(A.tractorNest.x - 0.9, A.tractorNest.z);
    w.run(3);
    expect(w.of('find').map((e) => e.id)).toEqual(['eggs']); // once, not once a frame
  });

  it('the scarecrow: his hat can be tried on and given back, as often as she likes', () => {
    const w = world();
    w.put(A.scarecrowFront.x, A.scarecrowFront.z);
    expect(isWalkableAt(AREA, w.cat.x, w.cat.z)).toBe(true);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'tryhat' });
    expect(w.jobs.act({ kind: 'tryhat' }, w.cat)).toBe(true);
    expect(w.jobs.scarecrow.worn).toBe(true);
    expect(w.jobs.actionFor(w.cat)).toEqual({ kind: 'hatback' });
    w.tick();
    expect(w.of('find').map((e) => e.id)).toEqual(['scarecrow']);
    expect(w.of('hat-on')).toHaveLength(1);
    // worn all over the farm
    w.put(0, 30);
    w.run(60);
    expect(w.jobs.scarecrow.worn).toBe(true);
    expect(w.jobs.actionFor(w.cat)).toBe(null);
    w.put(A.scarecrowFront.x, A.scarecrowFront.z);
    expect(w.jobs.act({ kind: 'hatback' }, w.cat)).toBe(true);
    expect(w.jobs.scarecrow.worn).toBe(false);
    w.tick();
    expect(w.of('hat-off')).toHaveLength(1);
    // a stale prompt does nothing
    expect(w.jobs.act({ kind: 'hatback' }, w.cat)).toBe(false);
  });

  it('the apples: one or two drop with a thud when she climbs an orchard tree, and never more than two lie about', () => {
    const w = world('apples');
    const up = (tree) => { Object.assign(w.cat, { x: tree.x, z: tree.z, y: 1.6, perched: true }); w.run(2); };
    const down = () => { Object.assign(w.cat, { y: 0, perched: false, x: w.cat.x + 3 }); w.run(0.5); };
    let drops = 0;
    for (const tree of A.appleTrees) {
      up(tree);
      const got = w.of('apple-drop');
      expect(got).toHaveLength(++drops);
      expect([1, 2]).toContain(got[drops - 1].n);
      expect(w.jobs.apples.length).toBeLessThanOrEqual(JOB.APPLES_MAX);
      for (const a of w.jobs.apples) {
        expect(a.down).toBe(true);
        expect(a.y).toBe(JOB.APPLE_R);
        expect(clearance(AREA.colliders, a.x, a.z)).toBeGreaterThan(0.25);
        expect(inRect(A.orchard, a.x, a.z, -3)).toBe(true);
      }
      down();
    }
    expect(w.of('find').filter((e) => e.id === 'apples')).toHaveLength(A.appleTrees.length);
    expect(w.of('apple-thud').length).toBe(w.of('apple-drop').reduce((n, e) => n + e.n, 0));
    expect(new Set(w.of('apple-drop').map((e) => e.n)).size).toBe(2); // sometimes one, sometimes two
    // sitting in the tree drops nothing more
    up(A.appleTrees[0]);
    const n = w.of('apple-drop').length;
    w.run(30);
    expect(w.of('apple-drop')).toHaveLength(n);
  });

  it('a windfall can be batted along: it rolls away from her, slows and stops, inside the farm and out of the water', () => {
    const w = world('bat');
    Object.assign(w.cat, { x: A.appleTrees[0].x, z: A.appleTrees[0].z, y: 1.6, perched: true });
    w.run(2);
    Object.assign(w.cat, { y: 0, perched: false });
    const a = w.jobs.apples[0];
    const from = { x: a.x, z: a.z };
    w.put(a.x - 3, a.z);
    w.walk(a.x - 0.2, a.z);
    expect(w.of('apple-bat')).toHaveLength(1);
    w.run(5);
    expect(a.x - from.x).toBeGreaterThan(0.8); // away from her
    expect(Math.hypot(a.vx, a.vz)).toBe(0);
    // rolled at the pond or the edge of the farm, it stops short
    const pond = A.pond;
    Object.assign(a, { x: pond.x + pond.r + 1, z: pond.z, vx: 0, vz: 0 });
    w.put(a.x + 0.3, a.z);
    w.run(5);
    expect(Math.hypot(a.x - pond.x, a.z - pond.z)).toBeGreaterThan(pond.r);
    Object.assign(a, { x: AREA.bounds.maxX - 1, z: 0, vx: 0, vz: 0 });
    w.put(a.x - 0.3, a.z);
    w.run(5);
    expect(a.x).toBeLessThan(AREA.bounds.maxX);
  });

  it('the ducklings: found when they swim after her', () => {
    const w = world();
    const k = w.sim.ducklings[0];
    Object.assign(w.cat, { x: k.x + 1, z: k.z, inWater: true });
    w.run(2);
    expect(w.sim.ducklingsWithCat).toBe(true);
    expect(w.of('find').map((e) => e.id)).toEqual(['ducklings']);
  });

  it('no find is a job: none has a prompt that points at it but the scarecrow\'s hat, where the cat stands at it', () => {
    const w = world();
    for (const spot of [A.hayloftNest, A.rafters, A.tractorNest, A.appleTrees[0], A.pond]) {
      w.put(spot.x + 0.9, spot.z);
      const action = w.jobs.actionFor(w.cat);
      expect(action === null || action.kind === 'offer').toBe(true);
      if (action) expect(FARM_JOB_IDS).toContain(action.job);
    }
    expect(w.jobs.objective()).toBe(null);
  });
});

// =============================================================================
describe('what they pay, and what the save keeps', () => {
  const fresh = (initial) => {
    const storage = mem(initial);
    const progression = createProgression(storage);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    return { storage, progression, log };
  };

  it('a job pays what a neighbour\'s quest pays, once a walk, and again on a later walk', () => {
    expect(AWARDS.farmjob).toBe(AWARDS.quest);
    const { progression, log } = fresh();
    for (const id of FARM_JOB_IDS) {
      expect(payFarmJob(id, { log, progression })).toBe(AWARDS.farmjob);
      expect(payFarmJob(id, { log, progression })).toBe(0);
      expect(progression.state.journal[jobJournalId(id)]).toBe(1);
    }
    expect(progression.state.points).toBe(4 * AWARDS.farmjob);
    expect(progression.state.feats.farmjob).toBe(4);
    expect(payFarmJob('nope', { log, progression })).toBe(0);
    log.startWalk(); // the next walk
    expect(payFarmJob('cow', { log, progression })).toBe(AWARDS.farmjob);
    expect(progression.state.journal.jobcow).toBe(2);
    expect(progression.state.feats.farmjob).toBe(5);
  });

  it('a find pays the first time ever and never again; every walk it is found on counts once', () => {
    const { progression, log } = fresh();
    for (const id of FARM_FIND_IDS) {
      expect(noteFarmFind(id, { log, progression })).toEqual({ fresh: true, first: true, points: AWARDS.farmfind });
      // again on the same walk: nothing at all
      expect(noteFarmFind(id, { log, progression })).toEqual({ fresh: false, first: false, points: 0 });
      expect(progression.state.journal[findJournalId(id)]).toBe(1);
    }
    expect(progression.state.points).toBe(6 * AWARDS.farmfind);
    expect(progression.state.feats.farmfind).toBe(6);
    for (let walk = 2; walk <= 4; walk++) {
      log.startWalk();
      for (const id of FARM_FIND_IDS) {
        expect(noteFarmFind(id, { log, progression })).toEqual({ fresh: true, first: false, points: 0 });
        expect(noteFarmFind(id, { log, progression })).toEqual({ fresh: false, first: false, points: 0 });
        expect(progression.state.journal[findJournalId(id)]).toBe(walk);
      }
    }
    expect(progression.state.points).toBe(6 * AWARDS.farmfind);
    expect(progression.state.feats.farmfind).toBe(6);
    expect(noteFarmFind('nope', { log, progression })).toEqual({ fresh: false, first: false, points: 0 });
  });

  it('a walk picked up again neither pays nor says anything twice (the note carries the log\'s keys)', () => {
    const { progression, log } = fresh();
    payFarmJob('mice', { log, progression });
    noteFarmFind('eggs', { log, progression });
    log.startWalk();
    noteFarmFind('eggs', { log, progression }); // a later walk: seen, not paid
    payFarmJob('goat', { log, progression });
    const paid = log.entries();
    expect(paid.map(([k]) => k).sort()).toEqual([findKey('eggs'), jobKey('goat')].sort());
    // the game closes and opens again
    const again = createDiscoveryLog(progression);
    again.startWalk();
    again.restore(JSON.parse(JSON.stringify(paid)));
    const points = progression.state.points;
    expect(payFarmJob('goat', { log: again, progression })).toBe(0);
    expect(noteFarmFind('eggs', { log: again, progression }).fresh).toBe(false);
    expect(progression.state.points).toBe(points);
    expect(progression.state.journal.findeggs).toBe(2);
    // ...and its finished job is finished: nothing offered, the hat at the door
    const w = world('resume');
    const scene = new THREE.Scene();
    const carry = { mouth: createMouth(), items: createCarryables(scene, []) };
    addFarmHat(carry, AREA);
    restoreFarmJobs({ jobs: w.jobs }, { log: again, carry, area: AREA });
    expect(w.jobs.state).toEqual({ chicks: 'offer', cow: 'offer', goat: 'done', mice: 'offer' });
    expect(w.jobs.hatGoat.carry).toBe(null);
    expect(w.jobs.hatGoat.script).toBe(null);
    const hat = carry.items.list.find((it) => it.id === FARM_HAT_ID);
    expect(hat.mesh.visible).toBe(true);
    expect(hat.onGround).toBe(false);
    expect(Math.hypot(hat.mesh.position.x - A.farmhouseDoor.x, hat.mesh.position.z - A.farmhouseDoor.z)).toBeLessThan(1);
    w.put(w.jobs.hatGoat.x + 1, w.jobs.hatGoat.z);
    expect(w.jobs.actionFor(w.cat)).toBe(null);
    // a job in the middle starts over, harmlessly: the note says nothing about it
    expect(Object.keys(snapshotWalk({
      areaId: 'farm', soloSeed: 1, cat: { position: { x: 0, z: 0 } }, walk: { carried: 0 }, areaData: { collectibles: [] }, collectibleMeshes: new Map(),
    }, { yaw: 0, now: 1, paid })).join(' ')).not.toMatch(/farm|job/i);
    restoreFarmJobs(null, { log: again, carry, area: AREA }); // anywhere but the Farm: nothing
  });

  it('an old save has none of this and reads as zero everywhere; nothing shows as NaN or undefined', () => {
    // a save written before the Farm had jobs: no such journal keys, no such feats
    const old = createProgression(mem()).state;
    const raw = JSON.parse(JSON.stringify(old));
    for (const id of FARM_JOURNAL_TYPES) delete raw.journal[id];
    delete raw.feats.farmjob; delete raw.feats.farmfind;
    raw.journal.mouse = 3;
    const p = createProgression(mem({ 'whisker-walk-save': JSON.stringify(raw) }));
    for (const id of FARM_JOURNAL_TYPES) expect(p.state.journal[id]).toBe(undefined);
    const html = renderJournalHtml(p.state.journal, 0, 33);
    expect(html).not.toMatch(/NaN|undefined|null/);
    expect(html.match(/journal-card unspotted/g).length).toBeGreaterThanOrEqual(FARM_JOURNAL_TYPES.length);
    for (const id of FARM_JOURNAL_TYPES) expect(html).toContain(PAGE_WORDS[id].hint());
    // and the first find on that save is the first ever
    const log = createDiscoveryLog(p);
    log.startWalk();
    expect(noteFarmFind('owl', { log, progression: p })).toEqual({ fresh: true, first: true, points: AWARDS.farmfind });
    expect(payFarmJob('chicks', { log, progression: p })).toBe(AWARDS.farmjob);
    const after = renderJournalHtml(p.state.journal, 0, 33);
    expect(after).toContain(PAGE_WORDS.findowl.name());
    expect(after).toContain(PAGE_WORDS.jobchicks.name());
    expect(after).not.toMatch(/NaN|undefined/);
  });

  it('rubbish in those fields is dropped on load, never shown and never counted', () => {
    const raw = JSON.parse(JSON.stringify(createProgression(mem()).state));
    Object.assign(raw.journal, { jobchicks: 'lots', jobcow: -4, jobgoat: NaN, jobmice: null, findowl: 2.5, findeggs: '<b>', findapples: 3, jobnope: 9 });
    Object.assign(raw.feats, { farmjob: 'many', farmfind: -1 });
    const p = createProgression(mem({ 'whisker-walk-save': JSON.stringify(raw) }));
    const j = p.state.journal;
    for (const [key, value] of Object.entries(j)) expect(Number.isInteger(value) && value >= 0, `${key}: ${value}`).toBe(true);
    expect(j.findapples).toBe(3);
    expect(j.jobnope).toBe(undefined);
    for (const key of ['jobchicks', 'jobcow', 'jobgoat', 'jobmice', 'findeggs']) expect(j[key] ?? 0, key).toBe(0);
    for (const key of ['farmjob', 'farmfind']) expect(Number.isInteger(p.state.feats[key] ?? 0) && (p.state.feats[key] ?? 0) >= 0, key).toBe(true);
    expect(renderJournalHtml(j, 0, 33)).not.toMatch(/NaN|undefined|<b>/);
    // a find whose page holds rubbish is still a first find
    const log = createDiscoveryLog(p);
    log.startWalk();
    expect(noteFarmFind('eggs', { log, progression: p }).first).toBe(true);
    expect(noteFarmFind('apples', { log, progression: p }).first).toBe(false);
  });

  it('the counts survive saving, a reload, and the trip to the cloud and back as plain JSON', () => {
    const { storage, progression, log } = fresh();
    payFarmJob('chicks', { log, progression });
    payFarmJob('mice', { log, progression });
    for (const id of FARM_FIND_IDS) noteFarmFind(id, { log, progression });
    const saved = JSON.parse(storage.getItem('whisker-walk-save'));
    // a reload on this device
    const reloaded = createProgression(storage).state;
    // another device given the same payload (what a cloud save is: this JSON)
    const elsewhere = createProgression(mem({ 'whisker-walk-save': JSON.stringify(JSON.parse(JSON.stringify(saved))) })).state;
    for (const state of [reloaded, elsewhere]) {
      expect(state.journal.jobchicks).toBe(1);
      expect(state.journal.jobmice).toBe(1);
      expect(state.journal.jobcow).toBe(undefined);
      for (const id of FARM_FIND_IDS) expect(state.journal[findJournalId(id)]).toBe(1);
      expect(state.feats.farmjob).toBe(2);
      expect(state.feats.farmfind).toBe(6);
      expect(state.points).toBe(2 * AWARDS.farmjob + 6 * AWARDS.farmfind);
      expect(JSON.parse(JSON.stringify(state))).toEqual(state); // nothing in it that JSON cannot carry
    }
    // the save's shape did not change: the same top-level keys as a save without any of it
    expect(Object.keys(reloaded).sort()).toEqual(Object.keys(createProgression(mem()).state).sort());
    expect(read('progression.js')).toMatch(/const SAVE_VERSION = 4;/);
  });

  it('the farmer\'s hat leaves no mark: not in the den if the walk ends with it, not where it was put down', () => {
    const scene = new THREE.Scene();
    const carry = { mouth: createMouth(), items: createCarryables(scene, [{ id: 'farm-glove-1', kind: 'glove', x: 1, z: 1 }]) };
    const hat = addFarmHat(carry, AREA);
    expect(hat.kind).toBe(FARM_HAT_KIND);
    expect(hat.job).toBe(true);
    expect(hat.mesh.visible).toBe(false);
    expect(carry.items.nearest({ x: hat.mesh.position.x, z: hat.mesh.position.z }, 5)).not.toBe(hat); // not there to be picked up yet
    expect(addFarmHat(carry, AREA)).toBe(hat); // made once
    carry.items.placeAt(FARM_HAT_ID, 5, 5);
    expect(carry.items.nearest({ x: 5, z: 5 }, 1)).toBe(hat);
    expect(pick(carry.mouth, hat)).toBe(true);
    expect(carry.mouth.held).toEqual({ id: FARM_HAT_ID, kind: FARM_HAT_KIND, job: true });
    expect(walkEndMarks(carry.mouth, 'farm', 1)).toEqual([]);
    expect(drop(carry.mouth, 30, 30, { x: 5, z: 5 })).toEqual({ id: FARM_HAT_ID, kind: FARM_HAT_KIND, job: true });
    expect(walkEndMarks(carry.mouth, 'farm', 1)).toEqual([]);
    // an ordinary thing still does both
    const glove = carry.items.list[0];
    pick(carry.mouth, glove);
    expect(walkEndMarks(carry.mouth, 'farm', 1).map((m) => m.mark.kind)).toEqual(['den']);
    drop(carry.mouth, 30, 30, { x: 1, z: 1 });
    expect(walkEndMarks(carry.mouth, 'farm', 1).map((m) => m.mark.kind)).toEqual(['drop']);
    // handed in: on the porch for the rest of the walk, and out of her mouth
    pick(carry.mouth, hat);
    hatAtDoor(carry, AREA);
    expect(carry.mouth.held).toBe(null);
    expect(hat.onGround).toBe(false);
    expect(hat.mesh.visible).toBe(true);
    expect(isWalkableAt(AREA, hat.mesh.position.x, hat.mesh.position.z) || clearance(AREA.colliders, hat.mesh.position.x, hat.mesh.position.z) > -0.5).toBe(true);
  });
});

// =============================================================================
describe('the words', () => {
  const FARM_IDS = LATER_PHRASE_IDS.filter((id) => id.startsWith('farm.'));
  const lines = () => FARM_IDS.map((id) => phrase(id, 2, 4));

  it('every line of the jobs, the finds and their pages is in the phrase table, in the later table', () => {
    expect(FARM_IDS.length).toBeGreaterThan(60);
    expect(PHRASE_IDS.filter((id) => id.startsWith('farm.'))).toEqual([]); // the first table's record is not touched
    for (const id of FARM_IDS) {
      expect(hasPhrase(id)).toBe(true);
      expect(id).toMatch(/^[a-z]+(\.[A-Za-z]+)+$/);
      expect(typeof phrase(id, 2, 4)).toBe('string');
      expect(phrase(id, 2, 4).length).toBeGreaterThan(5);
      expect(phrase(id, 2, 4)).not.toMatch(/undefined|NaN/);
    }
    // each job and find has all its lines
    for (const id of FARM_JOB_IDS) for (const key of ['prompt', 'start', 'done']) expect(JOB_WORDS[id][key]().length, `${id}.${key}`).toBeGreaterThan(8);
    for (const id of FARM_FIND_IDS) expect(FIND_WORDS[id].first().length, id).toBeGreaterThan(8);
    for (const id of FARM_FIND_IDS.filter((f) => f !== 'scarecrow')) expect(FIND_WORDS[id].again().length, id).toBeGreaterThan(8);
    for (const id of FARM_JOURNAL_TYPES) { expect(PAGE_WORDS[id].name()).toBeTruthy(); expect(PAGE_WORDS[id].hint()).toBeTruthy(); }
    // a prompt is a prompt
    for (const id of FARM_IDS.filter((i) => /[pP]rompt$/.test(i))) expect(phrase(id)).toMatch(/^E — /);
  });

  it('says the same in both sets of words, and borrows no word from the book series in either', () => {
    const on = lines();
    expect(bannedIn(on.join('\n'))).toBe(null);
    withOffWords(() => {
      expect(lines()).toEqual(on);
      for (const id of FARM_IDS) expect(hasPhrase(id)).toBe(true);
      expect(Object.keys(offWords.PHRASES ?? {}).filter((id) => id.startsWith('farm.'))).toEqual([]);
      expect(renderJournalHtml({ jobcow: 2, findowl: 1 }, 0, 15)).toContain(PAGE_WORDS.jobcow.name());
    });
    // written for a nine-year-old: short sentences, no long words
    for (const text of on) {
      for (const sentence of text.split(/[.!?…]+/)) expect(sentence.trim().split(/\s+/).length, sentence).toBeLessThanOrEqual(17);
      for (const word of text.split(/[^A-Za-z’']+/)) expect(word.length, word).toBeLessThanOrEqual(11);
    }
  });

  it('the animals\' six one-time lines moved into the table word for word, and are no longer spelled in the walk', () => {
    expect(phrase('farm.toast.ride')).toBe('You are riding a cow! 🐄');
    expect(phrase('farm.toast.goatPlay')).toBe('The goat wants to play! 🐐');
    expect(phrase('farm.toast.goatCopy')).toBe('The goat jumps when you jump! 🐐');
    expect(phrase('farm.toast.dogWalk')).toBe('The sheepdog wants to walk with you 🐶');
    expect(phrase('farm.toast.chicksFollow')).toBe('The chicks follow you when you walk 🐤');
    expect(phrase('farm.toast.ducklingsFollow')).toBe('The ducklings swim after you! 🐥');
    expect(ANIMAL_TOASTS.ride()).toBe('You are riding a cow! 🐄');
    expect(ANIMAL_TOASTS['goat-butt']()).toBe('The goat wants to play! 🐐');
    expect(ANIMAL_TOASTS['goat-copy']()).toBe('The goat jumps when you jump! 🐐');
    expect(ANIMAL_TOASTS['dog-hello']()).toBe('The sheepdog wants to walk with you 🐶');
    expect(ANIMAL_TOASTS['chick-follow']()).toBe('The chicks follow you when you walk 🐤');
    expect(FIND_WORDS.ducklings.again()).toBe('The ducklings swim after you! 🐥');
    for (const file of ['game/walk.js', 'game/farmplay.js', 'game/interactions.js', 'farmjobs.js', 'farmanimals.js']) {
      expect(code(file), file).not.toMatch(/riding a cow|wants to play|jumps when you jump|wants to walk with you|follow you when you walk|swim after you/);
      // and no other line of the Farm's is typed outside the table
      expect(code(file), file).not.toMatch(/straw hat|milking shed|the hen has|grain store'|🥛|👒/i);
    }
  });

  it('the HUD\'s lines: what a finished job and a first find say, and the one line for a job under way', () => {
    expect(discoveryText({ type: 'farmjob', label: JOB_WORDS.cow.done() })).toBe('You brought the cow in. Fresh milk, yum! 🥛');
    expect(discoveryText({ type: 'farmfind', label: FIND_WORDS.owl.first() })).toBe('You found an owl asleep on the barn beam! 🦉');
    expect(jobGoalLine(null)).toBe(null);
    expect(jobGoalLine({ job: 'chicks', n: 1, total: 4 })).toBe('Walk the chicks home: 1 of 4 🐤');
    expect(jobGoalLine({ job: 'mice', n: 3, total: 5 })).toBe('Send the mice home: 3 of 5 🐭');
    expect(jobGoalLine({ job: 'cow', step: 'active' })).toBe('Lead the cow to the milking shed 🐄');
    expect(jobGoalLine({ job: 'cow', step: 'milk' })).toBe('Lap up your saucer of milk 🥛');
    expect(jobGoalLine({ job: 'goat', step: 'active' })).toBe('Catch the goat with the hat 🐐');
    expect(jobGoalLine({ job: 'goat', step: 'pickup' })).toBe('Pick up the straw hat 👒');
    expect(jobGoalLine({ job: 'goat', step: 'carry' })).toBe('Carry the hat to the farmhouse door 👒');
    expect(farmPromptText(null)).toBe(null);
    expect(farmPromptText({ kind: 'offer', job: 'mice' })).toBe('E — chase the mice out of the grain store');
    expect(farmPromptText({ kind: 'milk' })).toBe('E — lap up the milk');
    expect(farmPromptText({ kind: 'deliver' })).toBe('E — leave the hat at the farmhouse door');
    expect(farmPromptText({ kind: 'tryhat' })).toBe('E — try on the scarecrow’s hat');
    expect(farmPromptText({ kind: 'hatback' })).toBe('E — give the scarecrow his hat back');
    expect(farmPromptText({ kind: 'offer', job: 'nope' })).toBe(null);
  });
});

// =============================================================================
describe('in the walk: the real animals, the real prompt and E, a real save', () => {
  // The Farm as game/walk.js builds it, driven through game/interactions.js.
  function game() {
    const scene = new THREE.Scene();
    const area = build(scene);
    const storage = mem();
    const progression = createProgression(storage);
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const toasts = [];
    const hud = { toast: (t) => toasts.push(t), setPrompt: (t) => { hud.prompt = t; }, setPoints() {}, setObjective: (t, m) => { hud.objective = t; hud.meters = m; }, prompt: null, objective: null };
    const audio = new Proxy({}, { get: () => () => {} });
    const cat = new THREE.Object3D();
    const head = new THREE.Object3D();
    const ownHat = new THREE.Mesh();
    ownHat.userData.hat = 'crown';
    head.add(ownHat);
    cat.add(head);
    cat.userData = { breed: 'tabby', parts: { head } };
    scene.add(cat);
    const carry = { mouth: createMouth(), items: createCarryables(scene, []), onDeck: () => false };
    const session = {
      areaId: 'farm', walkStamp: 'walk-0', scene, cat, carry,
      areaData: { ...area, collectibles: [], scenics: [] },
      collectibleMeshes: new Map(),
      critters: { list: [], dismayNear() {}, reactToMeow() {} },
      strayCats: { strays: [], nearest: () => null, reactToMeow: () => 0 },
      ghosts: { list: [], nearest: () => null },
      remotes: { nearest: () => null },
      secrets: { list: [] },
      tippables: { nearest: () => null, list: [] },
      scent: { nearestMound: () => null },
      goldMice: null, race: { promptAt: () => null }, kittenEnc: null,
      quest: null, questGiver: null, questObject: null, gifts: null,
      perched: null, pounceTime: 0, freezeTime: 0, catsGreeted: 0, walk: { carried: 0, carryCap: 2 },
      fx: { burst() {} }, prompt: null, lastPromptKind: null,
    };
    const seen = new Set();
    const once = (key, text) => { if (!seen.has(key)) { seen.add(key); hud.toast(text); } };
    const events = [];
    const farm = createFarmAnimals(scene, area, {
      onEvent: (e) => { events.push(e); handleFarmEvent(e, { hud, audio, log, progression, session, once }); },
      isFree: (x, z) => isWalkableAt(area, x, z),
    });
    session.farm = farm;
    addFarmHat(carry, area);
    const player = { speed: 0, zooming: false, inWater: false, swimming: false, perchY: 0, forward: () => new THREE.Vector3(0, 0, -1), halt() {} };
    const api = createInteractions({
      MP: 1, pid: 'me', getCloud: () => null, getPsecret: () => null,
      getSession: () => session, getIsTouch: () => false,
      player, progression, log, hud, audio,
      catVoice() {}, snapPhoto() {}, petNameFor: () => 'x', completeBoop() {},
    });
    let t = 0;
    const g = { scene, area, storage, progression, log, hud, toasts, cat, session, farm, player, api, events, carry };
    g.frame = () => { t += DT; farm.update(DT, t, { cat, player, session }); carry.items.update(); api.updateInteractions(session); };
    g.run = (seconds) => { for (let s = 0; s < seconds; s += DT) g.frame(); };
    g.put = (x, z) => { cat.position.set(x, 0, z); g.frame(); };
    g.walk = (x, z, { stop = 0.1, max = 300, until = () => false } = {}) => {
      const t0 = t;
      while (t - t0 < max && !until()) {
        const d = Math.hypot(x - cat.position.x, z - cat.position.z);
        if (d <= stop) break;
        const step = Math.min(CAT_WALK * DT, d - stop);
        cat.rotation.y = Math.atan2(-(x - cat.position.x), -(z - cat.position.z));
        cat.position.x += ((x - cat.position.x) / d) * step;
        cat.position.z += ((z - cat.position.z) / d) * step;
        player.speed = CAT_WALK;
        g.frame();
      }
      player.speed = 0;
    };
    g.E = () => { api.handleInteract(session); g.frame(); };
    return g;
  }

  it('all four jobs, start to finish, by prompt and E: each pays once, fills its page and clears its line', () => {
    const g = game();
    const A2 = g.area.anchors;
    const J = g.farm.jobs;
    // ---- the mice ----
    g.put(A2.grainStoreDoor.x - 0.5, A2.grainStoreDoor.z);
    expect(g.session.prompt).toEqual({ kind: 'farm', data: { kind: 'offer', job: 'mice' } });
    expect(g.hud.prompt).toBe('E — chase the mice out of the grain store');
    g.E();
    expect(g.toasts).toContain(JOB_WORDS.mice.start());
    expect(g.hud.objective).toMatch(/^Send the mice home: \d of 5 🐭$/);
    expect(g.hud.meters).toBe(undefined);
    for (const m of J.mice) { const p = m.line.points[0]; g.walk(p.x - 0.6, p.z, { stop: 0.2 }); g.run(3); }
    expect(J.state.mice).toBe('done');
    expect(g.progression.state.journal.jobmice).toBe(1);
    expect(g.progression.state.points).toBe(AWARDS.farmjob);
    expect(g.hud.objective).toBe(null);
    // ---- the cow ----
    g.put(A2.pastureGate.x - 1, A2.pastureGate.z);
    expect(g.hud.prompt).toBe('E — bring the cow in for milking');
    g.E();
    const cow = g.farm.sim.jobCow;
    const pts = cow.follow.line.points;
    g.put(pts[0].x, pts[0].z);
    for (let i = 1; i < pts.length; i++) {
      let guard = 0;
      while (Math.hypot(g.cat.position.x - pts[i].x, g.cat.position.z - pts[i].z) > 0.1 && guard++ < 20000) {
        if (dist(g.cat.position, cow) > 6) { g.frame(); continue; }
        g.walk(pts[i].x, pts[i].z, { max: 0.5 });
      }
    }
    g.run(20);
    expect(J.state.cow).toBe('milk');
    expect(g.toasts).toContain(JOB_WORDS.cow.milk());
    expect(g.hud.objective).toBe('Lap up your saucer of milk 🥛');
    g.put(J.saucer.x - 0.8, J.saucer.z);
    expect(g.hud.prompt).toBe('E — lap up the milk');
    g.E();
    expect(J.state.cow).toBe('done');
    expect(g.session.rest).toEqual({ kind: 'drink', t: 0 }); // head down to the saucer, as at any bowl
    expect(Math.sin(g.cat.rotation.y)).toBeLessThan(-0.9);  // and facing it
    expect(g.progression.state.journal.jobcow).toBe(1);
    g.session.rest = null;
    // ---- the chicks ----
    g.put(A2.coopDoor.x + 1.5, A2.coopDoor.z);
    expect(g.hud.prompt).toBe('E — help the hen find her chicks');
    g.E();
    expect(g.hud.objective).toBe('Walk the chicks home: 0 of 4 🐤');
    expect(g.hud.meters).toBe(undefined); // nothing to walk to until one is found
    for (const p of J.chickSpots) { g.walk(p.x, p.z, { stop: 1 }); g.run(1); }
    expect(g.hud.meters).toBeGreaterThan(5); // now: the way to the coop
    g.walk(A2.coopDoor.x, A2.coopDoor.z);
    g.run(8);
    expect(J.state.chicks).toBe('done');
    expect(g.toasts).toContain(JOB_WORDS.chicks.found());
    expect(g.toasts).toContain(JOB_WORDS.chicks.home(1, 4));
    expect(g.toasts).not.toContain(phrase('farm.toast.chicksFollow')); // the job's own line said it
    expect(g.progression.state.journal.jobchicks).toBe(1);
    // ---- the goat ----
    const goat = J.hatGoat;
    g.put(goat.x + 2, goat.z);
    expect(g.hud.prompt).toBe('E — get the farmer’s hat back from the goat');
    g.E();
    expect(J.state.goat).toBe('active');
    let guard = 0;
    while (J.state.goat === 'active' && guard++ < 30 * 200) { g.walk(goat.x, goat.z, { stop: 0.3, max: DT }); g.frame(); }
    expect(J.state.goat).toBe('hat');
    expect(g.toasts).toContain(JOB_WORDS.goat.drop());
    const hat = g.carry.items.list.find((it) => it.id === FARM_HAT_ID);
    expect(hat.onGround).toBe(true);
    expect(hat.mesh.visible).toBe(true);
    g.walk(hat.mesh.position.x, hat.mesh.position.z, { stop: 0.4 });
    expect(g.session.prompt.kind).toBe('carry');
    expect(g.hud.prompt).toBe('E — pick up the straw hat');
    g.E();
    expect(g.carry.mouth.held).toEqual({ id: FARM_HAT_ID, kind: FARM_HAT_KIND, job: true });
    expect(g.hud.prompt).toBe('E — put the straw hat down');
    expect(g.hud.objective).toBe('Carry the hat to the farmhouse door 👒');
    g.walk(A2.farmhouseDoor.x + 1.2, A2.farmhouseDoor.z);
    expect(g.hud.prompt).toBe('E — leave the hat at the farmhouse door');
    g.E();
    expect(J.state.goat).toBe('done');
    expect(g.carry.mouth.held).toBe(null);
    expect(hat.onGround).toBe(false);
    expect(hat.mesh.visible).toBe(true);
    expect(walkEndMarks(g.carry.mouth, 'farm', 1)).toEqual([]);
    // ---- all four ----
    const s = g.progression.state;
    expect(FARM_JOB_IDS.map((id) => s.journal[jobJournalId(id)])).toEqual([1, 1, 1, 1]);
    expect(s.feats.farmjob).toBe(4);
    // (the animals she walked past on the way were met too: a critter award for each kind)
    expect(s.points - (s.feats.critter ?? 0) * AWARDS.critter).toBe(4 * AWARDS.farmjob);
    expect(g.hud.objective).toBe(null);
    for (const spot of [A2.grainStoreDoor, A2.pastureGate, A2.coopDoor, A2.farmhouseDoor]) {
      g.put(spot.x + 1.2, spot.z);
      expect(g.session.prompt?.kind === 'farm' ? g.session.prompt.data : null).toBe(null); // none offered again this walk
    }
    for (const id of FARM_JOB_IDS) expect(g.toasts.filter((t) => t === JOB_WORDS[id].start())).toHaveLength(1);
  });

  it('the scarecrow\'s hat goes onto her head and back; her own hat is put by meanwhile', () => {
    const g = game();
    const A2 = g.area.anchors;
    const head = g.cat.userData.parts.head;
    const own = head.children[0];
    const his = g.scene.getObjectByName('scarecrowHat');
    expect(his.visible).toBe(true);
    g.put(A2.scarecrowFront.x, A2.scarecrowFront.z);
    expect(g.hud.prompt).toBe('E — try on the scarecrow’s hat');
    g.E();
    g.frame();
    expect(his.visible).toBe(false);
    expect(head.children.map((c) => c.name)).toContain('farm-scarecrow-hat');
    expect(own.visible).toBe(false);
    expect(g.toasts).toContain(FIND_WORDS.scarecrow.on());
    expect(g.progression.state.journal.findscarecrow).toBe(1);
    expect(g.progression.state.points).toBe(AWARDS.farmfind);
    // nothing of it is in the save but the page and the award: it is not hers to keep
    expect(JSON.stringify(g.progression.state.equipped)).not.toMatch(/straw|scarecrow/);
    expect(JSON.stringify(g.progression.state.unlocked)).not.toMatch(/straw|scarecrow/);
    expect(g.hud.prompt).toBe('E — give the scarecrow his hat back');
    g.E();
    g.frame();
    expect(his.visible).toBe(true);
    expect(head.children.map((c) => c.name)).not.toContain('farm-scarecrow-hat');
    expect(own.visible).toBe(true);
    // on again, and the walk ends with it on: it comes off with the walk
    g.E();
    g.frame();
    expect(g.progression.state.points).toBe(AWARDS.farmfind); // paid once
    g.farm.dispose();
    expect(head.children.map((c) => c.name)).not.toContain('farm-scarecrow-hat');
  });

  it('the finds up in the hayloft, behind the tractor and in the pond are met by being there', () => {
    const g = game();
    const A2 = g.area.anchors;
    const loft = g.area.perches.find((p) => p.label === 'the hayloft');
    g.session.perched = loft;
    g.cat.position.set(loft.x, loft.y, loft.z);
    g.cat.rotation.y = 0; // facing north: the owl's beam
    g.run(1);
    expect(g.progression.state.journal.findloftcats).toBe(1);
    expect(g.progression.state.journal.findowl).toBe(1);
    expect(g.farm.jobs.loft.visitor).toBe(true);
    // a meow up here: one eye opens
    g.farm.reactToMeow(g.cat.position);
    g.frame();
    expect(g.farm.jobs.owl.peek).toBeGreaterThan(0);
    expect(g.toasts).toContain(FIND_WORDS.owl.peek());
    // a meow from someone down in the yard does not wake it
    g.run(JOB.OWL_PEEK + 1);
    g.farm.reactToMeow({ x: 0, z: 0 });
    g.frame();
    expect(g.farm.jobs.owl.peek).toBe(0);
    g.session.perched = null;
    g.put(A2.tractorNest.x - 0.9, A2.tractorNest.z);
    g.run(0.5);
    expect(g.progression.state.journal.findeggs).toBe(1);
    const k = g.farm.sim.ducklings[0];
    g.player.inWater = true;
    g.put(k.x + 1, k.z);
    g.run(1);
    expect(g.progression.state.journal.findducklings).toBe(1);
    g.player.inWater = false;
    const tree = g.area.perches.find((p) => p.kind === 'tree' && Math.hypot(p.x - A2.appleTrees[0].x, p.z - A2.appleTrees[0].z) < 0.1);
    g.session.perched = tree;
    g.cat.position.set(tree.x, tree.y, tree.z);
    g.run(2);
    expect(g.progression.state.journal.findapples).toBe(1);
    expect(g.progression.state.feats.farmfind).toBe(5);
    const met = () => (g.progression.state.feats.critter ?? 0) * AWARDS.critter; // the ducklings and the hens she passed
    expect(g.progression.state.points - met()).toBe(5 * AWARDS.farmfind);
    expect(g.toasts.filter((t) => t === FIND_WORDS.loftcats.first())).toEqual([]); // the award's own toast says it (hud.js), once
    // the next walk: each says its quiet line once and pays nothing
    g.log.startWalk();
    g.session.perched = loft;
    g.cat.position.set(loft.x, loft.y, loft.z);
    g.cat.rotation.y = 0;
    g.run(1);
    g.session.perched = null;
    g.put(0, 30);
    g.session.perched = loft;
    g.cat.position.set(loft.x, loft.y, loft.z);
    g.run(1);
    expect(g.toasts.filter((t) => t === FIND_WORDS.loftcats.again())).toHaveLength(1);
    expect(g.toasts.filter((t) => t === FIND_WORDS.owl.again())).toHaveLength(1);
    expect(g.progression.state.journal.findloftcats).toBe(2);
    expect(g.progression.state.points - met()).toBe(5 * AWARDS.farmfind);
  });

  it('none of the jobs\' things can be spotted, stalked or met as an animal, and none is sent to a co-walker', () => {
    const g = game();
    expect(g.farm.spottable.map((s) => s.type).filter((t) => /mouse|owl|kitten|barn|egg/.test(t))).toEqual([]);
    for (const file of ['farmjobs.js', 'farmwords.js']) expect(code(file), file).not.toMatch(/sendEvent|net\.|localStorage|cloud|Math\.random/);
    expect(code('game/farmplay.js')).not.toMatch(/sendEvent|\bnet\b|localStorage|cloud|Math\.random/);
    // the hat is the one thing carried, and a carried job item is never sent
    const src = code('game/interactions.js');
    expect(src).toMatch(/if \(s\.net && !item\.job\) s\.net\.sendEvent\(\{ v: 1, id: s\.playerId, type: 'carry-pick'/);
    expect(src).toMatch(/if \(s\.net && !released\.job\) s\.net\.sendEvent\(\{ v: 1, id: s\.playerId, type: 'carry-drop'/);
  });

  it('is wired into the walk: the events, the hat, a walk picked up again, and the objective line', () => {
    const walk = read('game/walk.js');
    expect(walk).toMatch(/handleFarmEvent\(e, \{ hud, audio, log, progression, session, once \}\)/);
    expect(walk).toMatch(/if \(farm\.jobs\) addFarmHat\(carry, areaData\)/);
    expect(walk).toMatch(/if \(resume\) restoreFarmJobs\(farm, \{ log, carry, area: areaData \}\)/);
    expect(walk.indexOf('restoreFarmJobs(farm')).toBeGreaterThan(walk.indexOf('log.restore(resume.paid)'));
    const inter = read('game/interactions.js');
    expect(inter.indexOf("s.prompt = { kind: 'farm', data: action }")).toBeGreaterThan(inter.indexOf("s.prompt = { kind: 'quest-complete' }"));
    expect(inter.indexOf("s.prompt = { kind: 'farm', data: action }")).toBeLessThan(inter.indexOf("s.prompt = { kind: 'stray-gift', data: stray }"));
    // the objective line: a quest's comes first, and a race is left alone
    const g = game();
    expect(farmObjective(g.farm, g.cat.position)).toBe(null);
    expect(farmObjective(null, g.cat.position)).toBe(null);
    g.farm.jobs.accept('cow');
    expect(farmObjective(g.farm, { x: A.milkingShedDoor.x, z: A.milkingShedDoor.z + 3 })).toEqual({ text: 'Lead the cow to the milking shed 🐄', meters: 3 });
    g.session.race = { state: 'running', promptAt: () => null };
    g.frame();
    expect(g.hud.objective).toBe(null);
    g.session.race = { state: 'idle', promptAt: () => null };
    g.frame();
    expect(g.hud.objective).toBe('Lead the cow to the milking shed 🐄');
  });
});
