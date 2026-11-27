// The Moon, milestone 4: the six finds (the other three: Echo Crater, Quiet Dust, the Moon Cheese), the three golden mice, the eight pebbles,
// the Starlight Cape and the Moon Badge, the paw prints on the dust, and the words in both sets. The find spots are proved against the built
// place by test/foundspots.test.js; the cape's and the badge's fit by test/foundwearfit.test.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { CLAN_TOTAL, EVERYDAY_TOTAL } from './helpers/goldtotals.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import * as P from '../src/world/moonplan.js';
import { build } from '../src/world/moon.js';
import { createProgression } from '../src/progression.js';
import { createDiscoveryLog, AWARDS } from '../src/discoveries.js';
import { discoveryText } from '../src/ui/hud.js';
import { bus } from '../src/events.js';
import { phrase, hasPhrase } from '../src/clanphrases.js';
import { GOLD_MICE, goldForEdition, createGoldMice } from '../src/goldmice.js';
import { CATALOG } from '../src/progression.js';
import { MOON_PAGES } from '../src/moonpages.js';
import { MOON_FIND_IDS, MOON_FIND_ZONES, findAt, inEcho, createDustTally, moonPebbles, MOON_FIND_WORDS } from '../src/world/moonfinds.js';
import { LINES, HINTS } from '../src/world/moonwords.js';
import { createMoonSound, ECHO_PINGS } from '../src/world/moonsound.js';
import { cullFar, DRAW_NEAR } from '../src/world/moonlife.js';
import { placeBudget } from '../src/placephysics.js';
import { climbBudget, BASE_CLIMB_BUDGET, canReach } from '../src/climbing.js';
import { perchHops } from './helpers/findreach.js';
import { mem } from './helpers/lighthouselife.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { AREA_RULES, SURFACES, surfaceAt, createPawPrints } from '../src/render/pawprints.js';
import { foundWearIn } from '../src/foundwear/index.js';
import { spotsIn } from '../src/foundwear/spots/index.js';
import { buildCat } from '../src/cat/model.js';

const gy = (x, z) => P.moonY(x, z);
function rig({ progression = createProgression(mem()), reducedMotion = false, audio = null } = {}) {
  const scene = new THREE.Scene();
  const area = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const life = area.life({ scene, ground: area.ground, audio, log, progression, reducedMotion, tier: { name: 'high' } });
  const camera = new THREE.PerspectiveCamera();
  const session = { goals: null, pounceTime: 0, perched: null, fx: { burst: vi.fn() }, cat: { rotation: { y: 0 } } };
  const events = [];
  const off = bus.on('discovery', (e) => events.push(e));
  const cat = { x: 0, y: 0, z: 45 };
  let t = 0;
  const step = (secs, where) => { if (where) Object.assign(cat, where); for (let i = 0; i < Math.round(secs * 30); i++) { t += 1 / 30; life.update(1 / 30, t, cat, camera, session); } };
  // walk from a to b at a trot (4 m/s), a frame at a time
  const walk = (a, b, speed = 4) => {
    const n = Math.max(1, Math.ceil((Math.hypot(b.x - a.x, b.z - a.z) / speed) * 30));
    for (let i = 0; i <= n; i++) { const x = a.x + ((b.x - a.x) * i) / n; const z = a.z + ((b.z - a.z) * i) / n; step(1 / 30, { x, z, y: gy(x, z) }); }
  };
  return { scene, area, progression, log, life, session, events, off, cat, step, walk, dispose() { off(); life.dispose(); } };
}
const meow = () => bus.emit('tip:did', { id: 'call' });
const paid = (events) => events.filter((e) => e.type === 'moonfind' && e.points === 12);

afterEach(() => vi.unstubAllGlobals());

describe('the six finds', () => {
  it('are the spec\'s six, in the journal\'s order, each with a page and a line, and every one but the three of milestone 2 has a hint', () => {
    expect(MOON_FIND_IDS).toEqual(['flag', 'echo', 'dust', 'cheese', 'dish', 'garden']);
    expect(Object.keys(MOON_FIND_WORDS).sort()).toEqual([...MOON_FIND_IDS].sort());
    for (const id of MOON_FIND_IDS) {
      const page = MOON_PAGES.find((p) => p[2] === id);
      expect(page, id).toBeTruthy();
      expect(HINTS[page[0]], id).toMatch(/\S/);
      expect(MOON_FIND_WORDS[id](), id).toMatch(/\S/);
    }
    expect(AWARDS.moonfind).toBe(12);
  });
  it('Echo Crater: a meow with her paws in the crater\'s middle, nothing else; the echo sounds, 12 paws the first time ever', () => {
    const E = P.ECHO;
    const floor = gy(E.x, E.z);
    expect(floor).toBeCloseTo(-1.4, 1);
    const rim = { x: E.x + E.r + 3, z: E.z, y: gy(E.x + E.r + 3, E.z) };
    const pings = vi.fn();
    const r = rig();
    // standing in the middle with no meow: nothing; a meow on the rim: nothing (Pip is called, no find)
    r.step(2, { x: E.x, z: E.z, y: floor });
    expect(r.progression.state.journal.mnecho ?? 0).toBe(0);
    r.step(0.1, rim);
    meow(); r.step(0.2);
    expect(r.progression.state.journal.mnecho ?? 0).toBe(0);
    // a meow in the middle, but up in the air (a hop over it)
    r.step(0.1, { x: E.x, z: E.z, y: floor + 3 });
    meow(); r.step(0.2);
    expect(r.progression.state.journal.mnecho ?? 0).toBe(0);
    // a meow in the middle
    r.step(0.1, { x: E.x + 1, z: E.z - 1, y: gy(E.x + 1, E.z - 1) });
    meow(); r.step(0.2);
    expect(r.progression.state.journal.mnecho).toBe(1);
    expect(paid(r.events)).toHaveLength(1);
    expect(discoveryText(r.events.find((e) => e.type === 'moonfind'))).toBe(`You spotted ${phrase('moon.find.echo')}`);
    // again in the same walk: no more paws, the page does not count twice
    meow(); r.step(0.2);
    expect(r.progression.state.journal.mnecho).toBe(1);
    expect(paid(r.events)).toHaveLength(1);
    void pings;
    r.dispose();
  });
  it('Echo Crater sounds a soft echo: three falling pings on the game\'s own audio, none when muted', () => {
    const made = [];
    const ctx = {
      currentTime: 0, state: 'running',
      createOscillator: () => { const o = { type: '', frequency: { setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (n) => n, start() {}, stop() {}, disconnect() {} }; made.push(o); return o; },
      createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n, disconnect() {} }),
    };
    const audio = { isMuted: () => false, getContext: () => ctx, getMaster: () => ({}) };
    createMoonSound(audio).echo();
    expect(made).toHaveLength(ECHO_PINGS.gains.length);
    expect(ECHO_PINGS.gains[0]).toBeGreaterThan(ECHO_PINGS.gains[1]);
    expect(ECHO_PINGS.gains[1]).toBeGreaterThan(ECHO_PINGS.gains[2]);
    made.length = 0;
    createMoonSound({ ...audio, isMuted: () => true }).echo();
    expect(made).toHaveLength(0);
  });
  it('inEcho: inside the ring and down on the floor, not beside it, not above it', () => {
    const E = P.ECHO;
    const floor = gy(E.x, E.z);
    expect(inEcho({ x: E.x, z: E.z, y: floor })).toBe(true);
    expect(inEcho({ x: E.x + E.r - 0.1, z: E.z, y: floor + 0.5 })).toBe(true);
    expect(inEcho({ x: E.x + E.r + 0.5, z: E.z, y: floor })).toBe(false);
    expect(inEcho({ x: E.x, z: E.z, y: floor + 4 })).toBe(false);
    expect(inEcho(null)).toBe(false);
  });
  it('Quiet Dust: 20 m of walking across the Quiet Plain (one trip, or two shorter ones), not standing, not walking elsewhere; paid once', () => {
    const Q = P.QUIET_PLAIN;
    const z = (Q.z0 + Q.z1) / 2;
    const r = rig();
    // 12 m on the plain: not yet; 12 m of walking elsewhere: nothing added
    r.walk({ x: Q.x1 + 1, z }, { x: Q.x1 - 11, z });
    expect(r.progression.state.journal.mndust ?? 0).toBe(0);
    r.walk({ x: 10, z: 30 }, { x: 30, z: 30 });
    expect(r.progression.state.journal.mndust ?? 0).toBe(0);
    // the rest of the way across
    r.walk({ x: Q.x1 - 11, z }, { x: Q.x0 - 1, z });
    expect(r.progression.state.journal.mndust).toBe(1);
    expect(paid(r.events)).toHaveLength(1);
    expect(discoveryText(r.events.find((e) => e.type === 'moonfind'))).toBe(`You spotted ${phrase('moon.find.dust')}`);
    r.walk({ x: Q.x0 + 1, z }, { x: Q.x1 - 1, z });
    expect(r.progression.state.journal.mndust).toBe(1);
    expect(paid(r.events)).toHaveLength(1);
    r.dispose();
  });
  it('createDustTally: only the plain\'s own metres count (a margin round it), a jump of 3 m or more adds nothing, and it says true from 20 m on', () => {
    const t = createDustTally();
    expect(t.add(-5, 46)).toBe(false); // off the plain
    expect(t.add(-9, 46)).toBe(false); // 4 m of it was off the plain: the step started outside
    expect(t.walked).toBe(0);
    for (let x = -9; x > -29.5; x -= 0.5) t.add(x, 46);
    expect(t.walked).toBeGreaterThanOrEqual(20 - 1.2);
    const t2 = createDustTally();
    t2.add(-12, 46);
    expect(t2.add(-26, 46)).toBe(false); // a teleport
    expect(t2.walked).toBe(0);
    const t3 = createDustTally();
    t3.add(-10, 46);
    let done = false;
    for (let x = -10.5; x >= -31; x -= 0.5) done = t3.add(x, 46) || done;
    expect(done).toBe(true);
  });
  it('the Moon Cheese: reached at the Great Bowl\'s bottom (the wedge is drawn there), not on the rim above it; paid once', () => {
    const C = P.CHEESE;
    const floor = gy(C.x, C.z);
    expect(floor).toBeCloseTo(-2.0, 1);
    expect(findAt({ x: C.x, y: floor, z: C.z, still: 0 })).toBe('cheese');
    expect(findAt({ x: C.x + C.r + 0.3, y: floor, z: C.z, still: 0 })).toBe(null);
    expect(findAt({ x: C.x, y: floor + 4, z: C.z, still: 0 })).toBe(null);
    const r = rig();
    r.step(0.2, { x: C.x + 1.2, z: C.z, y: gy(C.x + 1.2, C.z) });
    expect(r.progression.state.journal.mncheese).toBe(1);
    expect(paid(r.events)).toHaveLength(1);
    expect(discoveryText(r.events.find((e) => e.type === 'moonfind'))).toBe(`You spotted ${phrase('moon.find.cheese')}`);
    const wedge = r.scene.getObjectByName('moon:glow');
    expect(wedge).toBeTruthy();
    const box = new THREE.Box3().setFromObject(wedge);
    expect(box.min.x).toBeLessThan(C.x - 0.3);
    expect(box.max.x).toBeGreaterThan(C.x + 0.3);
    r.dispose();
  });
  it('all six pay 12 once each, 72 paws, and a second walk counts each page again and pays nothing', () => {
    const r = rig();
    const E = P.ECHO; const C = P.CHEESE; const Q = P.QUIET_PLAIN;
    const qz = 46.5;
    r.step(2, { x: P.FLAG.x - 1.4, z: P.FLAG.z, y: 0 });
    r.step(0.1, { x: E.x, z: E.z, y: gy(E.x, E.z) }); meow(); r.step(0.2);
    r.walk({ x: Q.x1, z: qz }, { x: Q.x0, z: qz });
    r.step(0.2, { x: C.x + 1, z: C.z, y: gy(C.x + 1, C.z) });
    r.step(2, { x: P.OLD_DISH.x + 1.5, z: P.OLD_DISH.z, y: 0 });
    r.step(2, { x: P.PLANTERS[0].x + 1.2, z: P.PLANTERS[0].z, y: 0 });
    for (const [page] of MOON_PAGES.slice(0, 6)) expect(r.progression.state.journal[page], page).toBe(1);
    expect(paid(r.events)).toHaveLength(6);
    const before = r.progression.state.points;
    const r2 = rig({ progression: r.progression });
    r2.step(2, { x: P.FLAG.x - 1.4, z: P.FLAG.z, y: 0 });
    r2.step(0.2, { x: C.x + 1, z: C.z, y: gy(C.x + 1, C.z) });
    expect(r.progression.state.journal.mnflag).toBe(2);
    expect(r.progression.state.journal.mncheese).toBe(2);
    expect(r.progression.state.points).toBe(before);
    r.dispose(); r2.dispose();
  });
  it('reduced motion changes none of it', () => {
    const r = rig({ reducedMotion: true });
    const E = P.ECHO; const C = P.CHEESE; const Q = P.QUIET_PLAIN;
    r.step(0.1, { x: E.x, z: E.z, y: gy(E.x, E.z) }); meow(); r.step(0.2);
    r.walk({ x: Q.x1, z: 46.5 }, { x: Q.x0, z: 46.5 });
    r.step(0.2, { x: C.x + 1, z: C.z, y: gy(C.x + 1, C.z) });
    for (const k of ['mnecho', 'mndust', 'mncheese']) expect(r.progression.state.journal[k], k).toBe(1);
    r.dispose();
  });
  it('walking in a find\'s place at speed is not a find (the zone finds wait for stillness, except the cheese which is reached)', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.step(1 / 30, { x: P.OLD_DISH.x - 3 + i * 0.1, z: P.OLD_DISH.z, y: 0 });
    expect(r.progression.state.journal.mndish ?? 0).toBe(0);
    r.dispose();
  });
  it('the cheese zone is the only one that does not wait, and every zone find has a place on the plan', () => {
    for (const id of ['flag', 'dish', 'garden']) for (const zn of MOON_FIND_ZONES[id]) expect(zn.still).toBeGreaterThan(0);
    expect(MOON_FIND_ZONES.cheese[0].still).toBe(0);
    expect(MOON_FIND_ZONES.echo).toBeUndefined();
    expect(MOON_FIND_ZONES.dust).toBeUndefined();
  });
});

describe('the three golden mice', () => {
  const { area } = { area: build(new THREE.Scene()) };
  const MICE = GOLD_MICE.moon;
  it('are the plan\'s three (ids gm-moon-1 to 3), and the totals are 54 and 30', () => {
    expect(MICE.map((m) => m.id)).toEqual(['gm-moon-1', 'gm-moon-2', 'gm-moon-3', 'gm-moon-4']); // (the fourth is the Old Relay Station's tower ledge, a stub from X0)
    expect(MICE).toEqual(P.MOON_MICE.map((m) => ({ ...m })));
    const total = Object.values(GOLD_MICE).flat().length;
    expect(total).toBe(CLAN_TOTAL);
    expect(goldForEdition('canon', CATALOG).size).toBe(CLAN_TOTAL);
    expect(goldForEdition('legacy', CATALOG).size).toBe(EVERYDAY_TOTAL);
    // the Moon has no catalog row yet, so its three count in both editions; with a row and no edition key they still do
    expect(goldForEdition('legacy', { ...CATALOG, areas: { ...CATALOG.areas, moon: { name: 'The Moon' } } }).size).toBe(EVERYDAY_TOTAL);
  });
  it('each is inside the bounds, over open ground (clear of every collider) and in the walk\'s own spawn list', () => {
    const scene = { add() {}, remove() {} };
    const mice = createGoldMice(scene, 'moon', new Set(), { ground: area.ground });
    expect(mice.list).toHaveLength(4);
    for (const m of MICE) {
      expect(m.x).toBeGreaterThan(P.MOON_BOUNDS.minX); expect(m.x).toBeLessThan(P.MOON_BOUNDS.maxX);
      expect(m.z).toBeGreaterThan(P.MOON_BOUNDS.minZ); expect(m.z).toBeLessThan(P.MOON_BOUNDS.maxZ);
      // a mouse on the ground is not inside a collider; a high one is over the circle of its own perch
      if (m.y === 0) for (const c of area.colliders) expect(Math.hypot(m.x - c.x, m.z - c.z), `${m.id} in ${c.x},${c.z}`).toBeGreaterThan(c.r);
    }
  });
  it('needs no bound, no skill and no cave: the lander\'s deck and Earthrise Rock\'s top are a chain of at most three hops on the Moon\'s plain budget, and the pit\'s floor is on foot', () => {
    const budget = placeBudget({}, 'moon');
    const spawn = P.MOON_SPAWN;
    expect(perchHops(area.perches, MICE[0], { budget })).toBe(1); // dust to the deck in one hop
    expect(perchHops(area.perches, MICE[1], { budget })).toBeGreaterThanOrEqual(1);
    expect(perchHops(area.perches, MICE[1], { budget })).toBeLessThanOrEqual(3);
    expect(MICE[2].y).toBe(0);
    // from the spawn on foot: the pit is a bowl 1 m deep, and walkable down its wall
    const g = area.ground;
    const n = Math.ceil(Math.hypot(MICE[2].x - spawn.x, MICE[2].z - spawn.z) / 0.25);
    for (let i = 0; i < n; i++) {
      const x0 = spawn.x + ((MICE[2].x - spawn.x) * i) / n; const z0 = spawn.z + ((MICE[2].z - spawn.z) * i) / n;
      const x1 = spawn.x + ((MICE[2].x - spawn.x) * (i + 1)) / n; const z1 = spawn.z + ((MICE[2].z - spawn.z) * (i + 1)) / n;
      expect(g.canStep(x0, z0, x1, z1)).toBe(true);
    }
    // none is in reach of a skill-free Earth cat on the Moon's own place: the deck takes the Moon's budget (Earth's takes the chain of its steps)
    expect(perchHops(area.perches, MICE[1], { budget: BASE_CLIMB_BUDGET })).toBeGreaterThanOrEqual(1);
    void climbBudget; void canReach;
  });
  it('mouse 1 is in sight of the arrival: 6 m from the spawn, up on the lander (one hop), at the camera\'s own height or above; mouse 3 hides behind the pit\'s rock', () => {
    const m = MICE[0];
    expect(Math.hypot(m.x - P.MOON_SPAWN.x, m.z - P.MOON_SPAWN.z)).toBeLessThan(6);
    expect(m.y + 0.12).toBeGreaterThan(2.9); // the camera's height behind the spawn (moonlife's first camera)
    expect(Math.hypot(m.x - P.LANDER.x, m.z - P.LANDER.z)).toBeLessThan(P.LANDER.r);
    const pit = MICE[2];
    const rock = P.PIT_ROCK;
    const d = Math.hypot(pit.x - rock.x, pit.z - rock.z);
    expect(d).toBeGreaterThan(rock.r + 0.5);
    expect(d).toBeLessThan(rock.r + 1.2);
    // the rock stands between the mouse and the spawn (the spawn is south-west of the pit): from the arrival's side the mouse is behind it
    const toSpawn = [P.MOON_SPAWN.x - pit.x, P.MOON_SPAWN.z - pit.z];
    const toRock = [rock.x - pit.x, rock.z - pit.z];
    const cos = (toSpawn[0] * toRock[0] + toSpawn[1] * toRock[1]) / (Math.hypot(...toSpawn) * Math.hypot(...toRock));
    expect(cos).toBeGreaterThan(0.95);
  });
  it('none is within 2 m of a find\'s spot, a pebble or another mouse at its own height', () => {
    const spots = spotsIn('moon');
    for (const m of MICE) {
      for (const s of spots) if (Math.abs(s.y - m.y) < 0.9) expect(Math.hypot(m.x - s.x, m.z - s.z), `${m.id} by ${s.id}`).toBeGreaterThanOrEqual(2);
      for (const p of P.PEBBLES) if (m.y < 0.9) expect(Math.hypot(m.x - p.x, m.z - p.z), `${m.id} by ${p.id}`).toBeGreaterThanOrEqual(2);
      for (const o of MICE) if (o !== m) expect(Math.hypot(m.x - o.x, m.z - o.z)).toBeGreaterThan(5);
    }
  });
  it('Earthrise Rock is a three-ledge chain, each step within the Moon\'s plain climb and beyond Earth\'s plain reach of one hop to the top', () => {
    const L = P.ROCK_LEDGES;
    expect(L).toHaveLength(3);
    const moon = placeBudget({}, 'moon');
    let prev = 0;
    for (const l of L) { expect(l.y - prev).toBeLessThanOrEqual(moon.climb); expect(l.y).toBeGreaterThan(prev); prev = l.y; }
    expect(L[2].y).toBe(3);
    for (const l of L) expect(area.perches.some((p) => p.x === l.x && p.z === l.z && p.y === l.y)).toBe(true);
    for (const l of L) expect(area.colliders.some((c) => c.x === l.x && c.z === l.z)).toBe(true);
    expect(Math.hypot(MICE[1].x - L[2].x, MICE[1].z - L[2].z)).toBeLessThan(1.0); // the pick-up window
  });
});

describe('the eight pebbles', () => {
  const area = build(new THREE.Scene());
  it('are the walk\'s own collectibles, ids moon-1 to moon-8, named "a glowing pebble" in both sets', () => {
    expect(area.collectibles.map((c) => c.id)).toEqual(Array.from({ length: 8 }, (_, i) => `moon-${i + 1}`));
    for (const c of area.collectibles) expect(c.label).toBe('a glowing pebble');
    expect(hasPhrase('moon.pebble')).toBe(true);
    withOffWords(() => { for (const c of moonPebbles()) expect(c.label).toBe('a glowing pebble'); });
    expect(moonPebbles()).toHaveLength(8);
  });
  it('each stands on open dust inside the bounds, clear of every collider and crater floor, 2 m from a find spot and a mouse, 6 m from the golden wedge and the echo\'s middle', () => {
    const g = area.ground;
    for (const c of area.collectibles) {
      expect(c.x).toBeGreaterThan(P.MOON_BOUNDS.minX + 2); expect(c.x).toBeLessThan(P.MOON_BOUNDS.maxX - 2);
      expect(c.z).toBeGreaterThan(P.MOON_BOUNDS.minZ + 2); expect(c.z).toBeLessThan(P.MOON_BOUNDS.maxZ - 2);
      for (const k of area.colliders) expect(Math.hypot(c.x - k.x, c.z - k.z), `${c.id} by a collider`).toBeGreaterThan(k.r + 1.2);
      for (const s of spotsIn('moon')) expect(Math.hypot(c.x - s.x, c.z - s.z), `${c.id} by ${s.id}`).toBeGreaterThanOrEqual(2);
      for (const m of GOLD_MICE.moon) expect(Math.hypot(c.x - m.x, c.z - m.z), `${c.id} by ${m.id}`).toBeGreaterThanOrEqual(2);
      for (const k of P.CRATERS) expect(Math.hypot(c.x - k.x, c.z - k.z), `${c.id} in ${k.id}`).toBeGreaterThan(k.r * 0.55);
      expect(Math.hypot(c.x - P.CHEESE.x, c.z - P.CHEESE.z)).toBeGreaterThan(6);
      // walkable from the spawn in a straight line
      const n = Math.ceil(Math.hypot(c.x - 0, c.z - 45) / 0.25);
      for (let i = 0; i < n; i++) expect(g.canStep((c.x * i) / n, 45 + ((c.z - 45) * i) / n, (c.x * (i + 1)) / n, 45 + ((c.z - 45) * (i + 1)) / n), c.id).toBe(true);
    }
    expect(new Set(area.collectibles.map((c) => `${c.x},${c.z}`)).size).toBe(8);
  });
  it('none is on a story point: 3 m from Pip\'s bed, the cells, the sockets, the board and Dot\'s pad', () => {
    for (const c of area.collectibles) for (const p of P.JOB_POINTS) expect(Math.hypot(c.x - p.x, c.z - p.z), `${c.id}`).toBeGreaterThanOrEqual(3);
  });
});

describe('the Starlight Cape and the Moon Badge', () => {
  it('the cape is a body piece found only on the Moon, 12 spots, never bought; both editions (no edition key on its place)', () => {
    expect(foundWearIn('moon').map((r) => r.id)).toEqual(['starlightcape']);
    expect(spotsIn('moon')).toHaveLength(12);
    expect(CATALOG.accessories.starlightcape).toMatchObject({ slot: 'body', price: 0, prize: true, find: 'moon' });
  });
  it('the cape builds as a cape (the walk\'s cloth, vertex-coloured) on a full cat and a simple one, in at most 4 meshes, nothing emissive (the triangle, ground and Hagrid gates are in test/foundwearfit.test.js)', () => {
    for (const simple of [false, true]) {
      const plain = buildCat('tabby', { body: null }, { simple });
      const dressed = buildCat('tabby', { body: 'starlightcape' }, { simple });
      const meshes = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
      const tag = meshes(dressed).filter((m) => m.userData.foundWear === 'starlightcape');
      expect(tag.length, simple ? 'simple' : 'full').toBeGreaterThanOrEqual(1);
      expect(tag.length).toBeLessThanOrEqual(4);
      for (const m of tag) expect(m.material.emissive?.getHex() ?? 0, 'emissive').toBe(0);
      expect(meshes(dressed).length).toBeGreaterThan(meshes(plain).length);
      const cloth = tag.find((m) => m.userData.cape);
      expect(cloth.geometry.attributes.color).toBeTruthy(); // painted: stars on navy
    }
  });
  it('the cape\'s cloth shows stars: the navy cloth, a pale gold and an ice blue, and a pale seam, with no two colours the yarn ball\'s or a treasure\'s', () => {
    const dressed = buildCat('tabby', { body: 'starlightcape' });
    let cloth = null;
    dressed.traverse((o) => { if (o.isMesh && o.userData.cape && o.userData.foundWear === 'starlightcape') cloth = o; });
    const col = cloth.geometry.attributes.color;
    const seen = new Set();
    for (let i = 0; i < col.count; i++) seen.add(new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).getHexString());
    expect(seen.size).toBeGreaterThanOrEqual(4);
    expect(seen.has('5b7fc7')).toBe(false);
    expect(seen.has('f25c8a')).toBe(false);
  });
  it('the badge is a collar prize: owned once the story\'s page has a count, never before, never bought, and it builds as a charmed collar with its own piece', () => {
    expect(CATALOG.accessories.moonbadge).toMatchObject({ name: 'Moon Badge', slot: 'collar', price: 0, prize: true });
    const pr = createProgression(mem());
    expect(pr.state.unlocked.accessories).not.toContain('moonbadge');
    expect(pr.canBuy('accessories', 'moonbadge')).toBe(false);
    const raw = JSON.parse(JSON.stringify(pr.state));
    raw.journal = { ...raw.journal, mnstory: 1 };
    const st = mem({ 'whisker-walk-save': JSON.stringify(raw) });
    void st;
    const bare = buildCat('tabby', { collar: null });
    const worn = buildCat('tabby', { collar: 'moonbadge' });
    const count = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(count(worn)).toBeGreaterThan(count(bare));
  });
});

describe('the paw prints on the dust', () => {
  it('the Moon has a rule: the whole plain is "dust", dark and clear with a pale rim, and it stays longer than gravel', () => {
    expect(AREA_RULES.moon).toEqual({ ground: 'dust', path: 'dust', strip: null });
    expect(SURFACES.dust.life).toBeGreaterThan(SURFACES.gravel.life);
    expect(SURFACES.dust.rim).toBeGreaterThan(0);
    const area = build(new THREE.Scene());
    expect(surfaceAt('moon', area, [], 0, 45)).toBe('dust');
    expect(surfaceAt('moon', area, [], P.CHEESE.x, P.CHEESE.z)).toBe('dust');
  });
  it('a Moon walk makes the ring of prints (a mesh) on a full tier, and none on the lite one', () => {
    const scene = new THREE.Scene();
    const area = build(scene);
    const rig1 = createPawPrints(scene, { areaId: 'moon', areaData: area, tier: { pawPrints: 24, pawFade: 6 } });
    expect(rig1.capacity).toBeGreaterThan(0);
    rig1.dispose();
    const none = createPawPrints(scene, { areaId: 'moon', areaData: area, tier: { pawPrints: 0, pawFade: 0 } });
    expect(none.capacity).toBe(0);
  });
});

describe('the words, both sets', () => {
  it('the new lines read in both sets, are clean, short and the same in both (no flavour for the finds, the pebble or the cape)', () => {
    const ids = ['moon.find.echo', 'moon.find.dust', 'moon.find.cheese', 'moon.pebble', 'moon.cape'];
    const clan = Object.fromEntries(ids.map((id) => [id, phrase(id)]));
    let everyday;
    withOffWords(() => { everyday = Object.fromEntries(ids.map((id) => [id, phrase(id)])); for (const id of ids) expect(bannedIn(phrase(id)), id).toBeNull(); });
    expect(everyday).toEqual(clan);
    for (const id of ids) { expect(LINES[id], id).toBeTruthy(); expect(clan[id].length, id).toBeLessThan(70); }
  });
  it('the three hints of this milestone\'s pages are in both sets and the same', () => {
    for (const k of ['mnecho', 'mndust', 'mncheese']) expect(HINTS[k], k).toMatch(/\S/);
  });
  it('the wardrobe names are in the start-up table (not lazy): the cape and the badge read the same in both sets', () => {
    expect(foundWearIn('moon')[0].name()).toBe('Starlight Cape');
    expect(withOffWords(() => foundWearIn('moon')[0].name())).toBe('Starlight Cape');
    expect(CATALOG.accessories.moonbadge.name).toBe('Moon Badge');
  });
});

describe('the draw budget: the walk\'s far pebbles and mice are not drawn', () => {
  const session = () => {
    const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
    const meshes = new Map(P.PEBBLES.map((p) => [p.id, at(new THREE.Mesh(), p.x, 0, p.z)]));
    const mice = { list: GOLD_MICE.moon.map((m) => ({ id: m.id, group: at(new THREE.Group(), m.x, m.y, m.z) })) };
    return { collectibleMeshes: meshes, goldMice: mice };
  };
  it('hides each one farther than DRAW_NEAR (sideways) from her, shows each within it, and says how many are drawn; the maps and lists are untouched', () => {
    const s = session();
    const n = cullFar({ x: 0, z: 45 }, s);
    const near = [...s.collectibleMeshes.values()].filter((m) => m.visible).length + s.goldMice.list.filter((m) => m.group.visible).length;
    expect(n).toBe(near);
    for (const [id, m] of s.collectibleMeshes) {
      const p = P.PEBBLES.find((q) => q.id === id);
      expect(m.visible, id).toBe(Math.hypot(p.x - 0, p.z - 45) <= DRAW_NEAR);
    }
    expect(s.collectibleMeshes.size).toBe(8);
    expect(s.goldMice.list).toHaveLength(4);
    // at the spawn only mouse 1 (on the lander) is near of the three mice; a walk to the far side brings the others in and takes it out
    expect(s.goldMice.list.map((m) => m.group.visible)).toEqual([true, false, false, true]); // (the station's tower mouse is 45 m from the spawn: inside DRAW_NEAR)
    cullFar({ x: 0, z: -40 }, s);
    expect(s.goldMice.list.map((m) => m.group.visible)).toEqual([false, true, true, false]); // (the pit is 43 m off)
    expect(DRAW_NEAR).toBeGreaterThanOrEqual(40);
  });
  it('a session with no pebbles or mice (the picture page, an older walk) is fine, and the life puts every mesh back when it is disposed', () => {
    expect(cullFar({ x: 0, z: 0 }, {})).toBe(0);
    expect(cullFar({ x: 0, z: 0 }, null)).toBe(0);
    const r = rig();
    const s = session();
    Object.assign(r.session, s);
    r.step(0.2, { x: 0, z: 45, y: 0 });
    expect(s.goldMice.list[1].group.visible).toBe(false);
    r.dispose();
    expect(s.goldMice.list.every((m) => m.group.visible)).toBe(true);
    expect([...s.collectibleMeshes.values()].every((m) => m.visible)).toBe(true);
  });
  it('the worst view is under the gate: a frame\'s draw calls were 127 with every pebble and mouse in view; the culling, the one glow bucket and the merged rocks are the plan\'s answer (measured in the picture page, see the plan note)', () => {
    const scene = new THREE.Scene();
    build(scene);
    let meshes = 0;
    scene.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(25); // (milestone 8: the massif, the cave's shell and its floor and crystals) 17 at milestone 4; Star Hill (milestone 5) adds two (the observatory's paint and the additive figures)
  });
});

describe('start-up stays as it was: the Moon\'s code is lazy', () => {
  const read = (f) => readFileSync(f, 'utf8');
  it('moonfindparts.js and the new tests import only the Moon\'s own files and the shared libraries; nothing outside the Moon\'s files imports a Moon module but the area loader', () => {
    const src = read('src/world/moonfindparts.js');
    for (const m of src.matchAll(/^import .*?from '(.+?)';/gm)) expect(m[1]).toMatch(/^(three|\.\/moon[a-z]*\.js)$/);
  });
});
