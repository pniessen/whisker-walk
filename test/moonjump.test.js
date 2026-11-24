// The Moon, milestone 7a: the Beam Hops, the hop board's lane, the pure measure and the record rules, the save's clamps and the per-cat merge.
// (The life on a walk is test/moonjumplive.test.js.) The beams use the walk's own perch rules (src/climbing.js) on the Moon's budgets and on every Earth budget.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as J from '../src/world/moonjump.js';
import { build } from '../src/world/moon.js';
import { scatterRocks } from '../src/world/moonparts.js';
import { placeBudget } from '../src/placephysics.js';
import { climbBudget, canReach, bestPerch, BASE_CLIMB_BUDGET } from '../src/climbing.js';
import { perchHops } from './helpers/findreach.js';
import { sanitizeSave } from '../src/progression.js';
import { mergeSaves, useSaveTools } from '../src/catmerge.js';
import { CATALOG } from '../src/progression.js';
import { OUTFIT_IDS, sameWear } from '../src/outfits.js';
import { mergeColony } from '../src/colony.js';
import { mergeUsage } from '../src/usage.js';
import { sanitizeMarks, MARK_AREAS } from '../src/marks.js';
import { CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX } from '../src/customcats.js';

useSaveTools({ CATALOG, sanitizeSave, mergeColony, mergeUsage, sanitizeMarks, MARK_AREAS, CUSTOM_IDS, CUSTOM_BASE, CUSTOM_MAX, OUTFIT_IDS, sameWear });

const built = () => { const scene = new THREE.Scene(); return { scene, area: build(scene) }; };
const stone = (p) => ({ ...p, kind: 'stone' });
const budgets = {
  moon: placeBudget({}, 'moon'),
  moonSpring: placeBudget({ skills: ['spring-paws'] }, 'moon'),
  moonClaws: placeBudget({ skills: ['sure-claws'] }, 'moon'),
  moonBoth: placeBudget({ skills: ['spring-paws', 'sure-claws'] }, 'moon'),
};
const earth = {
  base: BASE_CLIMB_BUDGET,
  spring: climbBudget({ skills: ['spring-paws'] }),
  claws: climbBudget({ skills: ['sure-claws'] }),
  both: climbBudget({ skills: ['spring-paws', 'sure-claws'] }),
};

describe('the Beam Hops', () => {
  const { area } = built();
  const B = P.BEAMS;
  it('are eight, rising from 0.6 m to 3.0 m and coming down, from x -12 to 12, each at most 3.2 m above the last', () => {
    expect(B).toHaveLength(8);
    expect(Math.min(...B.map((b) => b.y))).toBe(0.6);
    expect(Math.max(...B.map((b) => b.y))).toBe(3.0);
    expect(B[0].x).toBe(-12);
    expect(B[7].x).toBe(12);
    for (let i = 1; i < B.length; i++) expect(B[i].y - B[i - 1].y).toBeLessThanOrEqual(3.2);
  });
  it('are perches and colliders of the area, in the stone kind, on level dust, inside the bounds, clear of every other thing of the plan', () => {
    const inB = (p, m) => p.x - m >= P.MOON_BOUNDS.minX && p.x + m <= P.MOON_BOUNDS.maxX && p.z - m >= P.MOON_BOUNDS.minZ && p.z + m <= P.MOON_BOUNDS.maxZ;
    for (const b of B) {
      expect(area.perches.some((q) => q.x === b.x && q.z === b.z && q.y === b.y && q.kind === 'stone')).toBe(true);
      expect(area.colliders.some((c) => c.x === b.x && c.z === b.z && c.r >= b.r)).toBe(true);
      expect(inB(b, b.r + 0.5)).toBe(true);
      expect(Math.abs(P.moonY(b.x, b.z)), `ground under ${b.x}`).toBeLessThan(0.05);
      expect(P.trackDistance(b.x, b.z), 'Dot\'s track').toBeGreaterThan(b.r + 1.8);
      for (const o of P.MOON_COLLIDERS) {
        if (P.BEAM_COLLIDERS.includes(o)) continue;
        expect(Math.hypot(b.x - o.x, b.z - o.z), `${b.x},${b.z} vs ${o.x},${o.z}`).toBeGreaterThan(b.r + o.r + 0.9); // a cat (0.7 wide) can walk between
      }
      for (const j of [...P.JOB_POINTS, ...P.PEBBLES, ...P.MOON_MICE]) expect(Math.hypot(b.x - j.x, b.z - j.z)).toBeGreaterThan(b.r + 1);
    }
    for (let i = 1; i < B.length; i++) expect(Math.hypot(B[i].x - B[i - 1].x, B[i].z - B[i - 1].z)).toBeGreaterThan(2 * 1.25 + 0.7); // and between each other
  });
  it('every beam is reachable on every one of the Moon\'s budgets: from the dust (the first and the last), or from a lower beam', () => {
    for (const [k, bud] of Object.entries(budgets)) {
      for (const b of B) expect(perchHops(area.perches, b, { budget: bud }), `${k} beam y ${b.y}`).toBeLessThan(Infinity);
    }
    // the whole crossing in order, the walk's own pick (bestPerch) from a beam's middle: each next beam takes one hop
    for (const [k, bud] of Object.entries(budgets)) {
      for (let i = 0; i + 1 <= 4; i++) {
        expect(canReach(stone(B[i + 1]), B[i], B[i].y, bud), `${k} up ${i}`).toBe(true);
      }
      expect(canReach(stone(B[5]), B[4], B[4].y, bud), `${k} down 4`).toBe(true);
      expect(canReach(stone(B[6]), B[5], B[5].y, bud), `${k} down 5`).toBe(true);
    }
    const ground = area.ground;
    const next = bestPerch(area.perches, { x: B[3].x, z: B[3].z }, B[3].y, area.perches.find((q) => q.x === B[3].x), budgets.moon, { ground });
    expect(next).not.toBeNull(); // the walk finds something to hop to from the middle of a beam (a higher beam first, as it climbs)
  });
  it('are NOT a crossing on Earth: the beams above the best Earth climb are unreachable on every Earth budget, and no beam is a hop from its neighbour', () => {
    for (const [k, bud] of Object.entries(earth)) {
      for (const b of B.filter((x) => x.y > earth.both.climb)) expect(perchHops(area.perches, b, { budget: bud }), `${k} beam y ${b.y}`).toBe(Infinity);
      for (let i = 0; i + 1 < B.length; i++) {
        expect(canReach(stone(B[i + 1]), B[i], B[i].y, bud), `${k} ${i} to ${i + 1}`).toBe(false);
        expect(canReach(stone(B[i]), B[i + 1], B[i + 1].y, bud), `${k} ${i + 1} to ${i}`).toBe(false);
      }
    }
  });
  it('the gap between neighbours is more than Earth\'s very best reach (Sure Claws, 3.2 m) and less than the Moon\'s plainest (3.9 m)', () => {
    for (let i = 0; i + 1 < B.length; i++) {
      const d = Math.hypot(B[i + 1].x - B[i].x, B[i + 1].z - B[i].z);
      expect(d, `gap ${i}`).toBeGreaterThan(earth.both.reachHigh + 0.1);
      expect(d, `gap ${i}`).toBeLessThan(budgets.moon.reachHigh - 0.1);
    }
  });
  it('the three ring-free courses all have a lamp: Skip Ridge\'s two pillars, Earthrise Rock\'s three ledges and the eight beams, each over its perch', () => {
    expect(P.COURSE_LAMPS).toHaveLength(2 + 3 + 8);
    for (const l of P.COURSE_LAMPS) expect(area.perches.some((q) => q.x === l.x && q.z === l.z && q.y === l.y)).toBe(true);
  });
});

describe('the hop board\'s lane', () => {
  const { area } = built();
  const L = P.JUMP_LANE;
  it('is level dust 16 m long and 4 m wide inside the bounds, with room past its end for a long hop', () => {
    expect(L.len).toBe(16);
    expect(L.half * 2).toBe(4);
    for (let a = -2; a <= L.len + 6; a += 0.5) for (let s = -L.half - 0.6; s <= L.half + 0.6; s += 0.5) {
      expect(Math.abs(P.moonY(L.x0 + a, L.z + s)), `${a},${s}`).toBeLessThan(0.06);
    }
    expect(L.x0 + L.len + 6).toBeLessThan(P.MOON_BOUNDS.maxX);
  });
  it('has nothing on it: no collider, no rock, no pebble or find, nothing of the plan, and Dot\'s track is well away', () => {
    const near = (x, z) => x > L.x0 - 3 && x < L.x0 + L.len + 7 && Math.abs(z - L.z) < L.half + 1.5;
    for (const c of area.colliders) expect(near(c.x, c.z) && !(c.x === P.JUMP_BOARD.x), `collider ${c.x},${c.z}`).toBe(false);
    const rocks = scatterRocks(false);
    for (const list of Object.values(rocks)) for (const r of list) expect(near(r.x, r.z), `rock ${r.x},${r.z}`).toBe(false);
    for (const j of [...P.JOB_POINTS, ...P.PEBBLES, ...P.MOON_MICE, ...P.POLES]) expect(near(j.x, j.z)).toBe(false);
    for (let a = 0; a <= L.len + 6; a += 1) expect(P.trackDistance(L.x0 + a, L.z)).toBeGreaterThan(L.half + 4);
  });
  it('the board stands beside the start line, off the lane, facing it, and every lamp and perch of the park is 20 m or more from it', () => {
    const B = P.JUMP_BOARD;
    expect(Math.abs(B.z - L.z)).toBeGreaterThan(L.half + 1);
    expect(Math.abs(B.x - L.x0)).toBeLessThan(3);
    expect(B.x).toBeGreaterThan(P.MOON_BOUNDS.minX);
  });
  it('is drawn: the strip, the line, a post a metre (32 of them), two end lamps and the board\'s post are in the kit (no mesh of their own)', () => {
    const { scene } = built();
    const names = []; scene.traverse((o) => { if (o.isMesh) names.push(o.name); });
    expect(names.filter((n) => /lane|beam|hopboard|jump|lamps/i.test(n))).toEqual([]); // they live in the kit's buckets; the life makes the lamps and the screen
    const floor = scene.getObjectByName('moon:floor');
    expect(floor).toBeTruthy();
  });
});

describe('measuring a hop (pure)', () => {
  const L = P.JUMP_LANE;
  const at = (a, s = 0) => ({ x: L.x0 + a, z: L.z + s });
  it('counts the metres from the line to the paws, in whole centimetres', () => {
    expect(J.measureHop(at(-0.2), at(6.37))).toBe(637);
    expect(J.measureHop(at(0), at(3))).toBe(300);
    expect(J.measureHop(at(-1.2), at(0.5))).toBe(50);
  });
  it('a hop that takes off from a perch, far behind the line, past it, or off the lane is not measured (nothing else happens)', () => {
    expect(J.measureHop(at(-0.2), at(5), { perched: true })).toBeNull();
    expect(J.measureHop(at(-1.5), at(5))).toBeNull();
    expect(J.measureHop(at(0.4), at(5))).toBeNull();
    expect(J.measureHop(at(-0.5, 2.3), at(5))).toBeNull();
  });
  it('a landing off the lane (more than a hand\'s width), behind the line, or on a slope is not measured', () => {
    expect(J.measureHop(at(-0.5), at(5, 2.3))).toBe(500);
    expect(J.measureHop(at(-0.5), at(5, 2.6))).toBeNull();
    expect(J.measureHop(at(-0.5), at(-0.3))).toBeNull();
    expect(J.measureHop(at(-0.5), at(5), { groundFrom: 0, groundTo: 0.5 })).toBeNull();
  });
  it('a hostile number is never measured, and a long hop is capped at the save\'s 2000 cm', () => {
    for (const bad of [NaN, Infinity, undefined]) expect(J.measureHop({ x: bad, z: L.z }, at(5))).toBeNull();
    expect(J.measureHop(at(-0.5), at(5, NaN))).toBeNull();
    expect(J.measureHop(at(-0.5), { x: 1e9, z: L.z })).toBe(2000);
    expect(J.measureHop(null, at(5))).toBeNull();
  });
});

describe('the record', () => {
  const m = (jump) => ({ step: 4, cells: 3, stamp: 1, scope: 2, jump });
  it('a better hop is a record (the first is the cat\'s first), the same or a shorter one changes nothing, and nothing else of the moon record moves', () => {
    const a = J.improve(m({}), 'tabby', 420);
    expect(a).toMatchObject({ record: true, first: true, kept: true });
    expect(a.moon).toEqual(m({ tabby: 420 }));
    const b = J.improve(a.moon, 'tabby', 500);
    expect(b).toMatchObject({ record: true, first: false });
    expect(b.moon.jump.tabby).toBe(500);
    for (const cm of [500, 499, 0, -3, NaN]) { const c = J.improve(b.moon, 'tabby', cm); expect(c.record).toBe(false); expect(c.moon).toBe(b.moon); }
  });
  it('each cat has its own line: one cat\'s record never moves another\'s', () => {
    const a = J.improve(m({ tabby: 700 }), 'mine1', 300);
    expect(a.moon.jump).toEqual({ tabby: 700, mine1: 300 });
    expect(J.bestOf(a.moon, 'siamese')).toBe(0);
  });
  it('the save\'s limits hold at the door: 2000 cm, six cats, a cat id of the save\'s shape, and a hostile record reads as no record', () => {
    expect(J.improve(m({}), 'tabby', 9999).moon.jump.tabby).toBe(2000);
    const six = Object.fromEntries(['a1', 'b2', 'c3', 'd4', 'e5', 'f6'].map((k) => [k, 100]));
    expect(J.improve(m(six), 'tabby', 500)).toMatchObject({ record: false, kept: false });
    expect(J.improve(m(six), 'a1', 500).moon.jump.a1).toBe(500); // a cat already in the six can still improve
    for (const id of ['Tabby', '', 'a', '__proto__', 'x'.repeat(40), null, 5]) expect(J.improve(m({}), id, 500).kept, String(id)).toBe(false);
    for (const hostile of [null, 5, 'x', [3], { tabby: 'big' }, { tabby: -5 }, { tabby: NaN }, { tabby: 1e9 }]) {
      expect(J.bestOf({ jump: hostile }, 'tabby')).toBeLessThanOrEqual(2000);
      expect(J.bestOf({ jump: hostile }, 'tabby')).toBeGreaterThanOrEqual(0);
    }
    expect(J.bestOf(null, 'tabby')).toBe(0);
    expect(J.bestOf({ jump: { tabby: 12.9 } }, 'tabby')).toBe(12);
  });
  it('the cat is the one she wears: the custom cat if any, else the equipped one, and only a shape the save keeps', () => {
    expect(J.jumpCatId({ equipped: { cat: 'tabby', custom: null } })).toBe('tabby');
    expect(J.jumpCatId({ equipped: { cat: 'tabby', custom: 'mine2' } })).toBe('mine2');
    expect(J.jumpCatId({ equipped: { cat: 'Bad Id' } })).toBeNull();
    expect(J.jumpCatId(null)).toBeNull();
  });
  it('metres reads 640 cm as "6.4"', () => { expect(J.metres(640)).toBe('6.4'); expect(J.metres(-5)).toBe('0.0'); });
});

describe('the save: hostile records clamped, per-cat merge (the keys are milestone 0\'s; start-up code is unchanged)', () => {
  const fresh = (over = {}) => sanitizeSave({ version: 4, ...over });
  it('a hostile jump record on load keeps at most six cats, each 0 to 2000, plain ids only', () => {
    const jump = { tabby: 1e9, siamese: -4, __proto__: 5, BAD: 100, 'x y': 100, ok1: 'NaN', ok2: 55.5 };
    for (let i = 0; i < 10; i++) jump[`cat${i}`] = 1e6;
    const m = fresh({ moon: { jump } }).moon.jump;
    expect(Object.keys(m).length).toBeLessThanOrEqual(6);
    for (const [id, cm] of Object.entries(m)) { expect(id).toMatch(/^[a-z][a-z0-9]{1,15}$/); expect(cm).toBeGreaterThanOrEqual(0); expect(cm).toBeLessThanOrEqual(2000); }
  });
  it('two devices that each beat a different cat merge to both records, and a better hop on one device wins for the same cat', () => {
    const a = fresh({ moon: { jump: J.improve({ jump: {} }, 'tabby', 612).moon.jump } });
    const b = fresh({ moon: { jump: J.improve(J.improve({ jump: {} }, 'tabby', 580).moon, 'mine1', 301).moon.jump } });
    const r = mergeSaves({ local: a, cloud: b }).save.moon.jump;
    expect(r).toEqual({ tabby: 612, mine1: 301 });
    const again = mergeSaves({ local: b, cloud: a }).save.moon.jump;
    expect(again).toEqual(r);
  });
});
