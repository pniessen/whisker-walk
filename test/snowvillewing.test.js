// Snowville, milestone V5: wing B. The pure show (a function of one start time, finite for any input), the wing's places (clear of every collider and find ring, the hill rock's one hop),
// the story's steps 3 to 7 (the machine, the room's credit, the wire), the wing on a walk (carry candles two and three, warm up at the hearth, Lantern Night with its room clock, the pay
// once, the Snowflake Clasp), reduced motion (the end state), the lower rungs, the one light, the journal's two story pages, the clasp and both word sets.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';

stubCanvasDocument();

const { createProgression, CATALOG, sanitizeSave } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { phrase } = await import('../src/clanphrases.js');
const { setSnowville } = await import('../src/snowvilleflag.js');
const { SNOWVILLE_LIVE_PAGES } = await import('../src/snowvillepages.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { loadSnowvilleStages, ST } = await import('../src/world/snowvillestages.js');
await loadSnowvilleStages();
const { build } = await import('../src/world/snowville.js');
const M = await import('../src/world/snowvillemission.js');
const S = await import('../src/world/snowvillestory.js');
const P = await import('../src/world/snowvilleplan.js');
const W = await import('../src/world/snowvillewingplan.js');
const Q = await import('../src/world/snowvillefindsplan.js');
const { showAt, SHOW, LANTERN_AT } = await import('../src/world/snowshow.js');
const { WING_LINES, HINTS } = await import('../src/world/snowvillewingwords.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { isWalkableAt } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/catmodel.js').catch(() => ({}));

const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z) => ({ x, z, y: P.snowY(x, z) });
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('Lantern Night, a pure function of one start time', () => {
  it('is finite for any input; not started before 0, over after 20 s', () => {
    for (const k of [NaN, undefined, null, -5, -0.0001, 20.0001, 1e9, Infinity, -Infinity, 'x']) {
      const p = showAt(k);
      expect(p.active, String(k)).toBe(false);
      for (const v of [...p.lanterns, ...p.windows, p.fir, p.star, p.moteOpacity]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(showAt(-1)).toMatchObject({ fir: 0, star: 0, lanterns: [0, 0, 0], pay: false });
    expect(showAt(25)).toMatchObject({ fir: 1, star: 1, lanterns: [1, 1, 1], pay: true });
  });
  it('lights the lanterns in turn, then the windows one after another, then the fir bulb by bulb to its star', () => {
    expect(SHOW.secs).toBe(20);
    const a = showAt(LANTERN_AT[0] + 1.5); const b = showAt(LANTERN_AT[1] + 1.5); const c = showAt(LANTERN_AT[2] + 1.5);
    expect(a.lanterns[0]).toBeGreaterThan(0.7); expect(a.lanterns[1]).toBe(0);
    expect(b.lanterns[1]).toBeGreaterThan(0.7); expect(c.lanterns[2]).toBeGreaterThan(0.7);
    const w = (k) => showAt(k).windows;
    expect(w(3.6)[0]).toBeGreaterThan(0); expect(w(3.6)[6]).toBe(0);
    expect(w(10)[6]).toBeGreaterThan(0.9);
    expect(showAt(10).fir).toBe(0);
    expect(showAt(13).fir).toBeGreaterThan(0.1); expect(showAt(13).fir).toBeLessThan(0.9);
    expect(showAt(18).fir).toBe(1); expect(showAt(18).star).toBe(1);
    let prev = 0;
    for (let k = 0; k <= 20; k += 0.25) { const f = showAt(k).fir; expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
  });
  it('pays at one moment, after the windows are lit; the same answer every time (no clock, no random number)', () => {
    expect(showAt(SHOW.payAt - 0.01).pay).toBe(false); expect(showAt(SHOW.payAt).pay).toBe(true);
    expect(showAt(SHOW.payAt)).toEqual(showAt(SHOW.payAt));
    expect(showAt(7).motes).toHaveLength(SHOW.motes);
    for (const f of ['src/world/snowshow.js', 'src/world/snowvillewingplan.js', 'src/world/snowvillewinglive.js', 'src/world/snowvillewingparts.js']) expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('the wing\'s places', () => {
  const area = build(new THREE.Scene());
  const flood = floodFrom(area, area.spawn, (x, z) => isWalkableAt(area, x, z));
  const hill = (id) => GOLD_MICE.snowville.find((m) => m.id === id);
  it('the story table has all three candles and lanterns, in order, with the two goal spots', () => {
    expect(S.allCandles().map((c) => c.id)).toEqual([0, 1, 2]);
    expect(S.allLanterns().map((c) => c.id)).toEqual([0, 1, 2]);
    expect(Object.keys(ST.b.story.spots)).toEqual(['warm', 'glow']);
    expect(W.CANDLES_B[1].up).toBe(W.SUMMIT.h);
  });
  it('every place is inside the bounds, its collider clear of every find ring and of the golden mice, and on bare snow it can be reached on foot', () => {
    const B = P.SNOWVILLE_BOUNDS;
    for (const c of W.wingColliders()) {
      expect(c.x - c.r).toBeGreaterThan(B.minX + 1); expect(c.x + c.r).toBeLessThan(B.maxX - 1);
      expect(c.z - c.r).toBeGreaterThan(B.minZ + 1); expect(c.z + c.r).toBeLessThan(B.maxZ - 1);
      for (const id of Q.SNOWVILLE_FIND_IDS) { const z = Q.SNOWVILLE_FIND_ZONES[id][0]; expect(near(c, z), `${JSON.stringify(c)} by ${id}`).toBeGreaterThan(c.r + 0.3); }
      for (const m of Q.SNOWVILLE_GOLD) if (m.y === 0) expect(near(c, m), m.id).toBeGreaterThan(c.r + 0.5);
    }
    for (const c of [...S.allCandles(), ...S.allLanterns()]) expect(flood.reachesWithin(c.x, c.z, (c.reach ?? 2) + 1), JSON.stringify(c)).toBe(true);
    expect(flood.reachesWithin(W.HEARTH.x, W.HEARTH.z, W.HEARTH_WARM)).toBe(true);
    expect(flood.reachesWithin(P.SQUARE_FIR.x, P.SQUARE_FIR.z, W.FIR_PROMPT)).toBe(true);
  });
  it('no collider of the wing overlaps another solid thing of the place (cottages, lamps, the stall) by more than a brush', () => {
    const base = P.snowvilleColliders();
    for (const c of W.wingColliders()) for (const k of base) expect(near(c, k), `${JSON.stringify(c)} / ${JSON.stringify(k)}`).toBeGreaterThan(Math.min(c.r, k.r));
  });
  it('the third golden mouse is on the hill rock: ONE hop (1.0 m) from the snow beside it, with no skill', () => {
    const m = hill('gm-snowville-3');
    expect(m).toMatchObject({ x: W.HILL_ROCK.x, z: W.HILL_ROCK.z, y: W.HILL_ROCK.h });
    const perch = area.perches.find((p) => p.x === W.HILL_ROCK.x && p.z === W.HILL_ROCK.z);
    expect(perch.y).toBeCloseTo(P.snowY(m.x, m.z) + m.y, 1);
    const from = { x: m.x - 1.7, z: m.z + 0.9 }; // standing on the snow beside the rock
    expect(flood.reachesWithin(from.x, from.z, 1)).toBe(true);
    expect(canReach(perch, from, P.snowY(from.x, from.z), BASE_CLIMB_BUDGET)).toBe(true);
    expect(perch.y - P.snowY(from.x, from.z)).toBeLessThanOrEqual(1.1);
    for (const p of area.perches) expect(p.kind).toBe('stone');
  });
  it('the sled path runs from the summit to the Hill Lantern\'s foot; the summit rock\'s perch is one short hop too', () => {
    expect(near(W.SLED_PATH[0], W.SUMMIT)).toBeLessThan(2);
    expect(near(W.SLED_PATH.at(-1), W.HILL_LANTERN)).toBeLessThan(2);
    const top = area.perches.find((p) => p.x === W.SUMMIT.x);
    expect(top.y - P.snowY(W.SUMMIT.x + 1.6, W.SUMMIT.z)).toBeLessThan(1.3);
  });
  it('the walk through the wing is short: the pond stump, the hill, the hearth and the village fir', () => {
    const route = [S.CANDLES[0], S.LANTERNS[0], W.CANDLES_B[0], W.POND_LANTERN, W.CANDLES_B[1], W.HILL_LANTERN, W.HEARTH, P.SQUARE_FIR];
    let len = 0;
    for (let i = 0; i + 1 < route.length; i++) len += near(route[i], route[i + 1]);
    expect(len).toBeLessThan(260);
  });
  it('the great fir is the tallest tree; its bulbs lie on it from the lowest branch to the star', () => {
    const bulbs = W.firBulbs(40);
    expect(bulbs).toHaveLength(40);
    expect(W.GREAT_FIR.h).toBeGreaterThan(P.SQUARE_FIR.h);
    expect(bulbs[0].y).toBeLessThan(bulbs[39].y); expect(bulbs[39].y).toBeLessThan(W.FIR_STAR.y);
    for (const b of bulbs) expect(Number.isFinite(b.x + b.y + b.z)).toBe(true);
    const strings = W.lightStrings();
    expect(strings.length).toBeGreaterThan(30);
    for (const s of strings) expect(s.y).toBeGreaterThan(P.snowY(s.x, s.z) + 2);
  });
});

describe('the story\'s steps 3 to 7', () => {
  it('candle two then three, then warm, glow and done, each only in its turn; step 7 is the end', () => {
    let r = { step: 2, candles: 1 };
    const seq = [[{ kind: 'light', candle: 1 }, 'second', 3, 3], [{ kind: 'light', candle: 2 }, 'third', 4, 7], [{ kind: 'warm' }, 'warm', 5, 7], [{ kind: 'glow' }, 'glow', 6, 7], [{ kind: 'done' }, 'done', 7, 7]];
    for (const [ev, effect, step, candles] of seq) {
      const bad = M.apply(r, ev.kind === 'warm' ? { kind: 'done' } : { kind: 'warm' });
      if (ev.kind !== 'warm') expect(bad.changed).toBe(false);
      const a = M.apply(r, ev);
      expect(a).toMatchObject({ changed: true, effect, snowville: { step, candles } });
      expect(M.apply(a.snowville, ev).changed).toBe(false);
      r = a.snowville;
    }
    expect(M.normalize({ ...r, step: 99 }).step).toBe(7);
  });
  it('the goal after the third candle is the hearth, then the village fir; a partner\'s later step takes every step before it in order', () => {
    expect(M.nextGoal({ step: 4, candles: 7 })).toMatchObject({ kind: 'warm', icon: 'fire' });
    expect(M.nextGoal({ step: 5, candles: 7 })).toMatchObject({ kind: 'glow', icon: 'star' });
    expect(M.nextGoal({ step: 6, candles: 7 })).toMatchObject({ kind: 'glow' });
    expect(M.nextGoal({ step: 7, candles: 7 })).toMatchObject({ kind: 'rest' });
    expect(M.credit({ step: 0, candles: 0 }, { kind: 'done' })).toMatchObject({ changed: true, effect: 'done', snowville: { step: 7, candles: 7 } });
    expect(M.credit({ step: 3, candles: 3 }, { kind: 'warm' }).snowville.step).toBe(5);
    expect(M.toStep({ kind: 'sv-warm' })).toEqual({ kind: 'warm' });
    expect(M.wire({ kind: 'warm' })).toEqual({ kind: 'sv-warm' });
    expect(M.toStep({ kind: 'sv-done' })).toBe(null); // the pay is each device's own, never a message
  });
});

function rig({ rec = { step: 4, candles: 7 }, reducedMotion = false, tier = null, send = null } = {}) {
  const progression = createProgression(memoryStorage());
  if (rec) { progression.state.snowville = { ...progression.state.snowville, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const placed = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const sent = [];
  const life = placed.life({ scene, log, progression, reducedMotion, tier, audio: null, sendEvent: send ?? ((ev) => sent.push(ev)) });
  const heard = [];
  const off = bus.on('discovery', (e) => heard.push(e));
  const cat = { x: 0, y: 0, z: 28 };
  const tick = (secs, to = null) => { if (to) Object.assign(cat, to); for (let i = 0; i < Math.round(secs * 20); i++) life.update(0.05, i * 0.05, cat, null, sess()); };
  const press = (to) => { tick(0.1, to); const line = life.promptAt(cat); return { line, kind: line ? life.interact() : null }; };
  return { progression, scene, placed, log, life, sent, heard, cat, tick, press, off: () => { off(); life.dispose(); } };
}

describe('the wing on a walk', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });

  it('carries candle two to the Pond lantern and candle three to the Hill lantern, in order, never saved while carried', () => {
    r = rig({ rec: { step: 2, candles: 1 } });
    const c1 = W.CANDLES_B[0]; const c2 = W.CANDLES_B[1];
    expect(r.life.tilly.goalNow().g).toMatchObject({ kind: 'candle', candle: 1 });
    expect(r.press(at(c2.x + 0.8, c2.z)).kind, 'candle three waits for its turn').toBe(null);
    expect(r.press(at(c1.x + 0.9, c1.z))).toMatchObject({ kind: 'pick' });
    expect(r.progression.state.snowville.candles).toBe(1);
    expect(r.life.tilly.state.carrying).toBe(1);
    expect(r.press(at(W.POND_LANTERN.x + 2, W.POND_LANTERN.z)).kind).toBe('give');
    expect(r.progression.state.snowville).toMatchObject({ step: 3, candles: 3 });
    expect(r.press(at(c2.x + 1, c2.z)).kind).toBe('pick');
    expect(r.press(at(W.HILL_LANTERN.x - 2, W.HILL_LANTERN.z)).kind).toBe('give');
    expect(r.progression.state.snowville).toMatchObject({ step: 4, candles: 7 });
    expect(r.sent).toEqual([{ kind: 'sv-light', candle: 1 }, { kind: 'sv-light', candle: 2 }]);
    expect(r.progression.state.journal.sv7).toBe(1); // the journal's candles page
    for (const k of ['snowville-candle-got1', 'snowville-candle-got2']) expect(r.heard.map((e) => e.key)).toContain(k);
    expect(r.life.tilly.state.lit).toEqual([1, 0, 0].map((_, i) => r.life.tilly.state.lit[i])); // (the lanterns rise over the next seconds)
    r.tick(3);
    expect(r.life.tilly.state.lit).toEqual([1, 1, 1]);
  });

  it('standing by the hearth for a second warms her up (step 5, sent as sv-warm); the strings of lights come on; the meow goes to the hearth first', () => {
    r = rig();
    r.tick(0.2, at(-20, 20));
    expect(r.life.tilly.goalNow()).toMatchObject({ x: W.HEARTH.x, z: W.HEARTH.z });
    expect(r.life.wing.strings.visible).toBe(false);
    r.tick(0.6, at(W.HEARTH.x + 1.5, W.HEARTH.z));
    expect(r.progression.state.snowville.step).toBe(4);
    r.tick(1, {});
    expect(r.progression.state.snowville.step).toBe(5);
    expect(r.sent).toEqual([{ kind: 'sv-warm' }]);
    r.tick(3, {});
    expect(r.life.wing.strings.visible).toBe(true);
    expect(r.heard.map((e) => e.key)).toContain('snowville-hearth-warm');
    expect(r.life.tilly.goalNow()).toMatchObject({ x: W.SPOTS.glow.x, z: W.SPOTS.glow.z });
  });

  it('walking past the hearth without stopping does nothing; and the cheeks warm there too', () => {
    r = rig();
    for (let i = 0; i < 8; i++) r.tick(0.1, at(W.HEARTH.x - 6 + i * 1.6, W.HEARTH.z + 4 - i));
    expect(r.progression.state.snowville.step).toBe(4);
    expect(P.WARM_SPOTS.some(([x, z]) => x === W.HEARTH.x && z === W.HEARTH.z)).toBe(true);
  });

  it('Lantern Night: begin by the village fir, the show runs 20 s, pays 40 paws ONCE, saves step 7, gives the clasp, lights the fir for good; a replay pays nothing', () => {
    r = rig({ rec: { step: 5, candles: 7 } });
    expect(r.press(at(-40 + 3, 30)).line).toBe(null);
    const near = at(P.SQUARE_FIR.x + 2.5, P.SQUARE_FIR.z + 2);
    expect(r.press(near)).toMatchObject({ line: phrase('snowville.show.prompt'), kind: 'begin' });
    expect(r.progression.state.snowville.step).toBe(6);
    expect(r.sent).toEqual([{ kind: 'sv-show', elapsed: 0 }]);
    expect(r.life.wing.showOn()).toBe(true);
    expect(r.life.promptAt(r.cat), 'one show at a time').toBe(null);
    r.tick(4, {});
    expect(r.life.wing.windows.some((w) => w.visible)).toBe(true);
    expect(r.life.wing.fir.visible).toBe(false);
    r.tick(8, {}); // about 12 s: past the pay moment, the fir climbing
    expect(r.progression.state.snowville.step).toBe(7);
    expect(r.progression.state.points).toBe(AWARDS.snowstory);
    expect(r.progression.state.unlocked.accessories).toContain('snowclasp');
    expect(r.progression.state.equipped.collar).toBe('snowclasp');
    expect(r.progression.state.journal.sv8).toBe(1);
    expect(r.life.wing.fir.visible).toBe(true);
    r.tick(12, {});
    expect(r.life.wing.showOn()).toBe(false);
    expect(r.life.wing.fir.geometry.drawRange.count).toBe(r.life.wing.state.bulbs.fir); // lit for good
    expect(r.heard.map((e) => e.key)).toContain('snowville-clasp');
    expect(r.press(near)).toMatchObject({ line: phrase('snowville.show.replay'), kind: 'replay' });
    r.tick(22, {});
    expect(r.progression.state.points).toBe(AWARDS.snowstory);
    expect(AWARDS.snowstory).toBe(40);
  });

  it('the room clock: a partner\'s show starts ours at the right second, takes the steps in order, and everyone pays their own save once', () => {
    r = rig({ rec: { step: 2, candles: 1 } });
    expect(r.life.credit({ kind: 'sv-show', elapsed: 6 })).toBe('show-start');
    expect(r.progression.state.snowville.step).toBe(6);
    expect(r.life.wing.state.show.k).toBeCloseTo(6, 1);
    expect(r.sent, 'a partner\'s show is not echoed').toEqual([]);
    expect(r.life.credit({ kind: 'sv-show', elapsed: 2 })).toBe(null); // already going
    r.tick(6, {});
    expect(r.progression.state.snowville.step).toBe(7);
    expect(r.progression.state.points).toBe(40);
    // hostile events are nothing
    for (const ev of [null, 7, {}, { kind: 'sv-show' }, { kind: 'sv-show', elapsed: 'x' }, { kind: 'sv-nope' }]) expect(() => r.life.credit(ev)).not.toThrow();
    expect(r.life.credit({ kind: 'sv-warm' })).toBe(null); // already past it
  });

  it('two devices with different frame rates agree on the show\'s picture at the same second', () => {
    const a = rig({ rec: { step: 5, candles: 7 } });
    const b = rig({ rec: { step: 5, candles: 7 } });
    a.life.wing.start({ own: true });
    b.life.credit({ kind: 'sv-show', elapsed: 0 });
    for (let i = 0; i < 100; i++) a.life.update(0.1, i * 0.1, a.cat, null, sess()); // 10 s at 10 fps
    for (let i = 0; i < 300; i++) b.life.update(1 / 30, i / 30, b.cat, null, sess()); // 10 s at 30 fps
    expect(a.life.wing.state.show.k).toBeCloseTo(b.life.wing.state.show.k, 1);
    expect(a.life.wing.fir.geometry.drawRange.count).toBe(b.life.wing.fir.geometry.drawRange.count);
    expect(a.life.wing.windows.map((w) => w.visible)).toEqual(b.life.wing.windows.map((w) => w.visible));
    a.off(); b.off();
  });

  it('reduced motion freezes the show to its END state: everything lit at once, no sparks, no flicker; the pay moment is the same', () => {
    r = rig({ rec: { step: 5, candles: 7 }, reducedMotion: true });
    r.press(at(P.SQUARE_FIR.x + 2.5, P.SQUARE_FIR.z + 2));
    r.tick(0.2, {});
    const w = r.life.wing;
    expect(w.fir.geometry.drawRange.count).toBe(w.state.bulbs.fir);
    expect(w.windows.every((x) => x.visible)).toBe(true);
    expect(w.star.visible).toBe(true);
    expect(w.motes.visible).toBe(false);
    expect(w.state.bulbs.motes).toBe(0);
    const o1 = w.strings.material.opacity; r.tick(0.7, {}); expect(w.strings.material.opacity).toBe(o1);
    expect(r.progression.state.snowville.step).toBe(6);
    r.tick(11, {});
    expect(r.progression.state.snowville.step).toBe(7);
    expect(r.progression.state.points).toBe(40);
  });

  it('the lower rungs draw less: fewer fir bulbs and sparks on LOW, no sparks and half the window glows on LITE', () => {
    const hi = rig({ rec: null }); const lo = rig({ rec: null, tier: { name: 'low', shadows: true, rung: 3 } }); const lite = rig({ rec: null, tier: { name: 'low', shadows: false, rung: 4 } });
    const n = (x) => x.life.wing.state.bulbs;
    expect(n(lo).fir).toBeLessThan(n(hi).fir); expect(n(lo).motes).toBeLessThan(n(hi).motes); expect(n(lo).strings).toBeLessThan(n(hi).strings);
    expect(n(lite).motes).toBe(0);
    expect(lite.life.wing.windows.length).toBeLessThan(hi.life.wing.windows.length);
    for (const x of [hi, lo, lite]) x.off();
  });

  it('one PointLight in the whole place, before and during the show; every live piece is gone on dispose', () => {
    r = rig({ rec: { step: 5, candles: 7 } });
    const lights = () => { let n = 0; r.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; };
    expect(lights()).toBe(1);
    const light = r.scene.getObjectByName('snowville:light');
    r.tick(0.5, {});
    const calm = light.intensity;
    r.press(at(P.SQUARE_FIR.x + 2.5, P.SQUARE_FIR.z + 2));
    r.tick(3, {});
    expect(light.intensity).toBeGreaterThan(1.6 * 1.2); // (the brazier's steady 1.6, lifted for the show)
    expect(calm).toBeLessThan(1.6 * 1.2);
    expect(lights()).toBe(1);
    r.life.dispose();
    for (const n of ['snowville:strings', 'snowville:firBulbs', 'snowville:motes', 'snowville:firStar', 'snowville:hearthGlow']) expect(r.scene.getObjectByName(n), n).toBeUndefined();
    r.life = { dispose() {} };
  });

  it('a bare walk with no stage in answers null for the wing (a slot nobody has filled)', () => {
    const was = ST.b;
    try {
      delete ST.b;
      const scene = new THREE.Scene();
      const placed = build(scene);
      const life = placed.life({ scene, progression: createProgression(memoryStorage()), reducedMotion: false, sendEvent: () => {} });
      expect(life.wing).toBeUndefined();
      expect(life.promptAt({ x: 0, z: 28 })).toBe(null);
      life.dispose();
    } finally { ST.b = was; }
  });
});

describe('the Snowflake Clasp and the journal\'s two story pages', () => {
  it('is a prize collar: not for sale, owned once the story is told (step 7), rebuilt from the save', () => {
    expect(CATALOG.accessories.snowclasp).toMatchObject({ name: 'Snowflake Clasp', slot: 'collar', price: 0, prize: true });
    const pr = createProgression(memoryStorage());
    expect(pr.state.unlocked.accessories).not.toContain('snowclasp');
    expect(pr.canBuy('accessories', 'snowclasp')).toBe(false);
    const fresh = (snowville) => sanitizeSave({ ...JSON.parse(JSON.stringify(pr.state)), snowville });
    expect(fresh({ step: 6, candles: 7, album: 0 }).unlocked.accessories).not.toContain('snowclasp');
    expect(fresh({ step: 7, candles: 7, album: 0 }).unlocked.accessories).toContain('snowclasp');
  });
  it('draws on the cat as a collar charm', () => {
    if (!buildCat) return;
    const worn = buildCat('tabby', { collar: 'snowclasp' });
    const bare = buildCat('tabby', {});
    let a = 0; let b = 0;
    worn.traverse((o) => { if (o.isMesh) a++; }); bare.traverse((o) => { if (o.isMesh) b++; });
    expect(a).toBeGreaterThan(b);
  });
  it('sv7 and sv8 are live behind the switch, named, hinted once the chunk is in; sv9 stays a placeholder', () => {
    expect(SNOWVILLE_LIVE_PAGES.map((p) => p[0])).toEqual(expect.arrayContaining(['sv7', 'sv8']));
    const c = (id) => CRITTER_INFO.find((x) => x.id === id);
    expect(c('sv7')).toMatchObject({ name: 'The Three Candles', snowville: true }); expect(c('sv8')).toMatchObject({ name: 'Lantern Night', snowville: true });
    expect(c('sv7').hint).toBe(HINTS.sv7); expect(c('sv8').hint).toBe(HINTS.sv8);
    expect(c('sv9').later).toBe(true);
    setSnowville(true);
    expect(renderJournalHtml({ sv7: 1, sv8: 1 }, 0, 9)).toContain('Lantern Night');
    setSnowville(false);
    expect(renderJournalHtml({ sv7: 1, sv8: 1 }, 0, 9)).not.toContain('Lantern Night');
    setSnowville(null);
  });
});

describe('the words, both sets', () => {
  const IDS = Object.keys(WING_LINES);
  const ALL = [...IDS, 'snowville.pond.got', 'snowville.hill.got', 'snowville.pond.find', 'snowville.hill.find'];
  const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
  it('every line is present, short, kind, and the same plain words in the everyday set (no series word)', () => {
    for (const id of ALL) {
      expect(phrase(id).length, id).toBeLessThanOrEqual(90);
      expect(phrase(id), id).not.toMatch(scary);
      expect(withOffWords(() => bannedIn(phrase(id))), id).toBeNull();
      expect(withOffWords(() => phrase(id)), id).toBe(phrase(id));
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); expect(withOffWords(() => bannedIn(h))).toBeNull(); }
  });
  it('every phrase id the wing says is a literal, and no wing file spells the series word in code', () => {
    for (const f of globSync('src/world/snow*.js')) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const [, arg] of code.matchAll(/\bphrase\(\s*(`[^`]*`|[^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
      expect(code, f).not.toMatch(/\bClan\b/);
    }
  });
});
