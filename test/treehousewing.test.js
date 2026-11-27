// The Treehouse village, milestone T5: wing B. The pure supper (a function of one start time, finite for any input), the wing's places (inside the walk, clear of every collider, find ring
// and golden mouse, every spot within a hop of a deck perch), the story's steps 3 to 7 (the machine, the room's credit, the wire), the wing on a walk (letters two and three over the rope
// bridge, ring the bell, the firefly supper on the room clock, the pay once, the Acorn Locket), reduced motion (the end state), the lower rungs, the one light, the journal's two story
// pages, the locket and both word sets.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

stubCanvasDocument();

const { createProgression, CATALOG, sanitizeSave } = await import('../src/progression.js');
const { createDiscoveryLog, AWARDS } = await import('../src/discoveries.js');
const { bus } = await import('../src/events.js');
const { phrase } = await import('../src/clanphrases.js');
const { setTreehouse } = await import('../src/treehouseflag.js');
const { TREEHOUSE_LIVE_PAGES, TREEHOUSE_HINTS } = await import('../src/treehousepages.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { loadTreehouseStages, ST } = await import('../src/world/treehousestages.js');
await loadTreehouseStages();
const { build } = await import('../src/world/treehouse.js');
const M = await import('../src/world/treehousemission.js');
const S = await import('../src/world/treehousestory.js');
const P = await import('../src/world/treehouseplan.js');
const W = await import('../src/world/treehousewingplan.js');
const Q = await import('../src/world/treehousefindsplan.js');
const { TREEHOUSE_SPOTS } = await import('../src/foundwear/spots/treehouse.js');
const { supperAt, SUPPER, WINDOW_AT } = await import('../src/world/treeshow.js');
const { WING_LINES, HINTS } = await import('../src/world/treehousewingwords.js');
const { LINES } = await import('../src/world/treehousewords.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { buildCat } = await import('../src/cat/catmodel.js').catch(() => ({}));

const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z, y = 0) => ({ x, z, y });
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const [L0, L1, L2] = S.allLetters();
const [H0, H1, H2] = S.allHouses();

describe('the firefly supper, a pure function of one start time', () => {
  it('is finite for any input; not started before 0, over after 20 s', () => {
    for (const k of [NaN, undefined, null, -5, -0.0001, 20.0001, 1e9, Infinity, -Infinity, 'x']) {
      const p = supperAt(k);
      expect(p.active, String(k)).toBe(false);
      for (const v of [...p.bulbs, ...p.windows, p.candles, p.flyOpacity]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(supperAt(-1)).toMatchObject({ candles: 0, bulbs: Array(12).fill(0), windows: [0, 0, 0], pay: false });
    expect(supperAt(25)).toMatchObject({ candles: 1, bulbs: Array(12).fill(1), windows: [1, 1, 1], pay: true });
    for (const k of [0, 3, 7.7, 12, 19.9]) for (const f of supperAt(k).flies) expect(Number.isFinite(f.x + f.y + f.z)).toBe(true);
  });
  it('lights the candles, then the lanterns one after another, the windows in turn, and the fireflies glide in over the table', () => {
    expect(SUPPER.secs).toBe(20);
    expect(supperAt(0.5).candles).toBe(0); expect(supperAt(3).candles).toBe(1);
    const b = supperAt(6).bulbs;
    expect(b[0]).toBeGreaterThan(0.9); expect(b[11]).toBe(0);
    expect(supperAt(10).bulbs[11]).toBeGreaterThan(0.9);
    const a = supperAt(WINDOW_AT[0] + 1.5); const c = supperAt(WINDOW_AT[2] + 1.5);
    expect(a.windows[0]).toBeGreaterThan(0.7); expect(a.windows[2]).toBe(0); expect(c.windows[2]).toBeGreaterThan(0.7);
    const early = supperAt(4).flies; const late = supperAt(12).flies;
    expect(early).toHaveLength(SUPPER.flies);
    const mean = (fs) => fs.reduce((s, f) => s + Math.hypot(f.x - W.TABLE.x, f.z - W.TABLE.z), 0) / fs.length;
    expect(mean(late)).toBeLessThan(mean(early));
    expect(mean(late)).toBeLessThan(3); // settled into an orbit over the table
    for (const f of late) expect(f.y).toBeGreaterThan(W.TABLE.y);
    let prev = 0;
    for (let k = 0; k <= 12; k += 0.25) { const v = supperAt(k).bulbs.reduce((s, x) => s + x, 0); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
  });
  it('pays at one moment, after the windows are lit; the same answer every time (no clock, no random number)', () => {
    expect(supperAt(SUPPER.payAt - 0.01).pay).toBe(false); expect(supperAt(SUPPER.payAt).pay).toBe(true);
    expect(supperAt(SUPPER.payAt)).toEqual(supperAt(SUPPER.payAt));
    expect(SUPPER.payAt).toBeGreaterThan(WINDOW_AT[2]);
    for (const f of ['src/world/treeshow.js', 'src/world/treehousewingplan.js', 'src/world/treehousewinglive.js', 'src/world/treehousewingparts.js']) expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('the wing\'s places', () => {
  const area = build(new THREE.Scene());
  it('the story table has all three letters and houses, in order, with the two goal spots; the stage keeps its finds', () => {
    expect(S.allLetters().map((c) => c.id)).toEqual([0, 1, 2]);
    expect(S.allHouses().map((c) => c.id)).toEqual([0, 1, 2]);
    expect(Object.keys(ST.branches.story.spots)).toEqual(['ring', 'supper']);
    expect(ST.branches.finds.collectibles).toBeTypeOf('function'); // T3's six discoveries stay in the slot
    expect(area.collectibles).toHaveLength(6);
  });
  it('every place is inside the walk, its collider clear of the village\'s, the find rings, the golden mice and the Canopy Cap\'s spots', () => {
    const B = P.TREEHOUSE_BOUNDS;
    const base = P.treehouseColliders();
    for (const c of W.wingColliders()) {
      expect(c.x - c.r).toBeGreaterThan(B.minX + 1); expect(c.x + c.r).toBeLessThan(B.maxX - 1);
      for (const k of base) expect(near(c, k), JSON.stringify(c)).toBeGreaterThan(c.r + k.r);
      for (const id of Q.TREEHOUSE_FIND_IDS) { const z = Q.TREEHOUSE_FIND_ZONES[id][0]; if (z.y === 0) expect(near(c, z)).toBeGreaterThan(c.r + z.r); }
      for (const s of TREEHOUSE_SPOTS) expect(near(c, s), s.id).toBeGreaterThan(c.r + 1);
    }
    for (const s of TREEHOUSE_SPOTS) { expect(near(s, W.BASKET)).toBeGreaterThan(2); expect(near(s, W.BAG)).toBeGreaterThan(1.5); }
    for (const m of Q.TREEHOUSE_GOLD) { expect(near(m, W.TABLE), m.id).toBeGreaterThan(W.TABLE.r + 1.5); expect(near(m, W.BASKET)).toBeGreaterThan(1.5); }
    for (const m of GOLD_MICE.treehouse) expect(near(m, W.BAG) > 1 || m.y !== P.deckOf('books').y).toBe(true);
  });
  it('everything on a deck stands on that deck, and a perch of the plan is within one planned hop of it (no skill)', () => {
    const on = (p, d) => Math.abs(p.x - d.x) <= d.w / 2 - 0.2 && Math.abs(p.z - d.z) <= d.d / 2 - 0.2;
    const books = P.deckOf('books'); const crown = P.deckOf('crown');
    expect(on(W.BAG, books)).toBe(true);
    for (const p of [W.RING_AT, W.TABLE, ...W.STOOLS, H2]) expect(on(p, crown), JSON.stringify(p)).toBe(true);
    for (const [p, y, reach] of [[L2, books.y, L2.reach], [W.RING_AT, crown.y, W.RING_AT.reach], [W.TABLE, crown.y, W.TABLE.reach], [H1, books.y, H1.reach], [H2, crown.y, H2.reach]]) {
      const perches = P.TREEHOUSE_PERCHES.filter((q) => Math.abs(q.y - y) < 0.01);
      expect(perches.some((q) => near(q, p) < reach), JSON.stringify(p)).toBe(true);
    }
    const rr = P.reachReport();
    expect(rr.missing).toEqual([]);
    expect(rr.maxHop).toBeLessThanOrEqual(P.HOP_MAX + 1e-9);
    expect(rr.down).toEqual([]);
  });
  it('the three houses stand at three heights (the Bakery low, the Bookshop in the middle canopy, the Bell Tower at the crown); the bell hangs on the tower', () => {
    expect([H0.y, H1.y, H2.y]).toEqual([1.4, 2.8, 5.6]);
    expect(W.BELL.y).toBeGreaterThan(H2.y + 2); expect(near(W.BELL, H2)).toBeLessThan(0.5);
    for (const h of [H1, H2]) { expect(h.sill.y).toBeGreaterThan(h.y); expect(h.glow.y).toBeGreaterThan(h.y); }
  });
  it('the bridges\' strings of lights follow the rope rails; the ring of lanterns hangs over the table', () => {
    const bulbs = W.bridgeBulbs();
    expect(bulbs.length).toBeGreaterThan(14);
    for (const b of bulbs) { expect(Number.isFinite(b.x + b.y + b.z)).toBe(true); expect(b.y).toBeGreaterThan(2.8); }
    const ring = W.supperBulbs();
    expect(ring).toHaveLength(12);
    for (const b of ring) { expect(near(b, W.TABLE)).toBeLessThan(2); expect(b.y).toBeGreaterThan(W.TABLE.y + 2); expect(b.y).toBeLessThan(P.CANOPY_MIN_Y); }
  });
  it('the walk through the wing is short: the basket, the Bookshop over the bridge, the bag, the Bell Tower, the bell, the table', () => {
    const route = [L0, H0, L1, H1, L2, H2, W.RING_AT, W.TABLE];
    let len = 0;
    for (let i = 0; i + 1 < route.length; i++) len += near(route[i], route[i + 1]);
    expect(len).toBeLessThan(150);
  });
});

describe('the story\'s steps 3 to 7', () => {
  it('letters two and three, then the bell, the supper and the pay, each only in its turn; step 7 is the end', () => {
    let r = { step: 2, letters: 1 };
    const seq = [[{ kind: 'deliver', letter: 1 }, 'second', 3, 3], [{ kind: 'deliver', letter: 2 }, 'third', 4, 7], [{ kind: 'ring' }, 'ring', 5, 7], [{ kind: 'supper' }, 'supper', 6, 7], [{ kind: 'done' }, 'done', 7, 7]];
    for (const [ev, effect, step, letters] of seq) {
      expect(M.apply(r, { kind: 'done' }).changed, `${ev.kind} first`).toBe(effect === 'supper' ? false : effect === 'done' ? true : false);
      const a = M.apply(r, ev);
      expect(a).toMatchObject({ changed: true, effect, treehouse: { step, letters } });
      expect(M.apply(a.treehouse, ev).changed).toBe(false);
      r = a.treehouse;
    }
    expect(M.normalize({ ...r, step: 99 }).step).toBe(7);
    expect(M.apply({ step: 3, letters: 3 }, { kind: 'ring' }).changed).toBe(false);
    expect(M.apply({ step: 4, letters: 7 }, { kind: 'supper' }).changed).toBe(false);
  });
  it('the goal after the third letter is the bell, then the supper; a partner\'s later step takes every step before it in order', () => {
    expect(M.nextGoal({ step: 4, letters: 7 })).toMatchObject({ kind: 'ring', icon: 'bell' });
    expect(M.nextGoal({ step: 5, letters: 7 })).toMatchObject({ kind: 'supper', icon: 'spark' });
    expect(M.nextGoal({ step: 6, letters: 7 })).toMatchObject({ kind: 'supper' });
    expect(M.nextGoal({ step: 7, letters: 7 })).toMatchObject({ kind: 'rest' });
    expect(M.credit({ step: 0, letters: 0 }, { kind: 'done' })).toMatchObject({ changed: true, effect: 'done', treehouse: { step: 7, letters: 7 } });
    expect(M.credit({ step: 3, letters: 3 }, { kind: 'ring' }).treehouse.step).toBe(5);
    expect(M.toStep({ kind: 'th-ring' })).toEqual({ kind: 'ring' });
    expect(M.wire({ kind: 'ring' })).toEqual({ kind: 'th-ring' });
    expect(M.toStep({ kind: 'th-done' })).toBe(null); // the pay is each device's own, never a message
    expect(M.toStep({ kind: 'th-supper', elapsed: 3 })).toBe(null); // the supper goes through the wing
  });
});

function rig({ rec = { step: 4, letters: 7 }, reducedMotion = false, tier = null, send = null } = {}) {
  const progression = createProgression(memoryStorage());
  if (rec) { progression.state.treehouse = { ...progression.state.treehouse, ...rec }; progression.addPoints(0); }
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
const crownAt = () => at(W.RING_AT.x, W.RING_AT.z, P.deckOf('crown').y);
const tableAt = () => at(1.4, -13.2, P.deckOf('crown').y); // the perch by the table (k1)

describe('the wing on a walk', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });

  it('carries letter two from the basket over the rope bridge to the Bookshop and letter three from the bag to the Bell Tower, in order, never saved while carried', () => {
    r = rig({ rec: { step: 2, letters: 1 } });
    expect(r.life.nutmeg.goalNow().g).toMatchObject({ kind: 'letter', letter: 1 });
    expect(r.press(at(L2.x + 0.8, L2.z, L2.y - 0.6)).kind, 'letter three waits for its turn').toBe(null);
    expect(r.press(at(L1.x - 0.9, L1.z)).kind).toBe('pick');
    expect(r.progression.state.treehouse.letters).toBe(1);
    expect(r.life.nutmeg.state.carrying).toBe(1);
    expect(r.press(at(H1.x + 1, H1.z, 0)).kind, 'on the ground under the deck is not the Bookshop').toBe(null);
    expect(r.press(at(H1.x + 1, H1.z, H1.y)).kind).toBe('give');
    expect(r.progression.state.treehouse).toMatchObject({ step: 3, letters: 3 });
    expect(r.press(at(L2.x, L2.z, 0)).kind, 'the bag is on the deck, not under it').toBe(null);
    expect(r.press(at(L2.x + 0.8, L2.z, L2.y - 0.6)).kind).toBe('pick');
    expect(r.press(at(H2.x + 1, H2.z + 1.3, H2.y)).kind).toBe('give');
    expect(r.progression.state.treehouse).toMatchObject({ step: 4, letters: 7 });
    expect(r.sent).toEqual([{ kind: 'th-deliver', letter: 1 }, { kind: 'th-deliver', letter: 2 }]);
    expect(r.progression.state.journal.th7).toBe(1); // the journal's letters page
    for (const k of ['treehouse-letter-got1', 'treehouse-letter-got2', 'treehouse-bookshop-delivered', 'treehouse-belltower-delivered']) expect(r.heard.map((e) => e.key)).toContain(k);
    r.tick(3, {});
    expect(r.life.nutmeg.state.lit).toEqual([1, 1, 1]);
  });

  it('ringing the bell on the Crown deck (step 5, sent as th-ring) is one soft ring; the bridges\' strings of lights come on and stay; the meow goes to the bell, then the table', () => {
    r = rig();
    r.tick(0.2, at(-20, 20));
    expect(r.life.nutmeg.goalNow()).toMatchObject({ x: W.RING_AT.x, z: W.RING_AT.z });
    expect(r.life.wing.strings.visible).toBe(false);
    expect(r.press(at(W.RING_AT.x, W.RING_AT.z, 0)).line, 'under the deck').toBe(null);
    expect(r.press(crownAt())).toMatchObject({ line: phrase('treehouse.bell.prompt'), kind: 'ring' });
    expect(r.progression.state.treehouse.step).toBe(5);
    expect(r.sent).toEqual([{ kind: 'th-ring' }]);
    r.tick(0.3, {});
    expect(r.life.wing.bellRing.visible).toBe(true);
    r.tick(3, {});
    expect(r.life.wing.bellRing.visible).toBe(false);
    expect(r.life.wing.strings.visible).toBe(true);
    expect(r.heard.map((e) => e.key)).toContain('treehouse-bell-rung');
    expect(r.life.nutmeg.goalNow()).toMatchObject({ x: W.TABLE.x, z: W.TABLE.z });
    expect(r.press(crownAt()).kind, 'it can be rung again for fun, and nothing changes').toBe('ring');
    expect(r.progression.state.treehouse.step).toBe(5);
    expect(r.sent).toHaveLength(1);
  });

  it('the supper: begin at the table, 20 s, pays 40 paws ONCE, saves step 7, gives the locket, keeps the lanterns lit for good; a replay pays nothing', () => {
    r = rig({ rec: { step: 5, letters: 7 } });
    expect(r.press(at(-20, 20)).line).toBe(null);
    const spot = tableAt();
    expect(r.press(spot)).toMatchObject({ line: phrase('treehouse.supper.prompt'), kind: 'begin' });
    expect(r.progression.state.treehouse.step).toBe(6);
    expect(r.sent).toEqual([{ kind: 'th-supper', elapsed: 0 }]);
    expect(r.life.wing.supperOn()).toBe(true);
    expect(r.life.promptAt(r.cat), 'one supper at a time').toBe(null);
    r.tick(5, {});
    expect(r.life.wing.lamps.some((w) => w.visible)).toBe(true);
    expect(r.life.wing.flies.visible).toBe(true);
    r.tick(8, {}); // about 13 s: past the pay moment
    expect(r.progression.state.treehouse.step).toBe(7);
    expect(r.progression.state.points).toBe(AWARDS.treestory);
    expect(r.progression.state.unlocked.accessories).toContain('acornlocket');
    expect(r.progression.state.equipped.collar).toBe('acornlocket');
    expect(r.progression.state.journal.th8).toBe(1);
    r.tick(12, {});
    expect(r.life.wing.supperOn()).toBe(false);
    expect(r.life.wing.lamps.every((w) => w.visible)).toBe(true); // lit for good
    expect(r.heard.map((e) => e.key)).toContain('treehouse-locket');
    expect(r.press(spot)).toMatchObject({ line: phrase('treehouse.supper.replay'), kind: 'replay' });
    r.tick(22, {});
    expect(r.progression.state.points).toBe(AWARDS.treestory);
    expect(AWARDS.treestory).toBe(40);
  });

  it('the room clock: a partner\'s supper starts ours at the right second, takes the steps in order, and everyone pays their own save once', () => {
    r = rig({ rec: { step: 2, letters: 1 } });
    expect(r.life.credit({ kind: 'th-supper', elapsed: 6 })).toBe('supper-start');
    expect(r.progression.state.treehouse.step).toBe(6);
    expect(r.life.wing.state.supper.k).toBeCloseTo(6, 1);
    expect(r.sent, 'a partner\'s supper is not echoed').toEqual([]);
    expect(r.life.credit({ kind: 'th-supper', elapsed: 2 })).toBe(null); // already going
    r.tick(6, {});
    expect(r.progression.state.treehouse.step).toBe(7);
    expect(r.progression.state.points).toBe(40);
    for (const ev of [null, 7, {}, { kind: 'th-supper' }, { kind: 'th-supper', elapsed: 'x' }, { kind: 'th-nope' }]) expect(() => r.life.credit(ev)).not.toThrow();
    expect(r.life.credit({ kind: 'th-ring' })).toBe(null); // already past it
  });
  it('a partner who rings the bell is credited with every step before it', () => {
    r = rig({ rec: { step: 1, letters: 0 } });
    expect(r.life.credit({ kind: 'th-ring' })).toBe('ring');
    expect(r.progression.state.treehouse).toMatchObject({ step: 5, letters: 7 });
  });

  it('two devices with different frame rates agree on the supper\'s picture at the same second', () => {
    const a = rig({ rec: { step: 5, letters: 7 } });
    const b = rig({ rec: { step: 5, letters: 7 } });
    a.life.wing.start({ own: true });
    b.life.credit({ kind: 'th-supper', elapsed: 0 });
    for (let i = 0; i < 100; i++) a.life.update(0.1, i * 0.1, a.cat, null, sess()); // 10 s at 10 fps
    for (let i = 0; i < 300; i++) b.life.update(1 / 30, i / 30, b.cat, null, sess()); // 10 s at 30 fps
    expect(a.life.wing.state.supper.k).toBeCloseTo(b.life.wing.state.supper.k, 1);
    expect(a.life.wing.lamps.map((w) => w.visible)).toEqual(b.life.wing.lamps.map((w) => w.visible));
    expect(a.life.wing.candles.map((w) => w.visible)).toEqual(b.life.wing.candles.map((w) => w.visible));
    a.off(); b.off();
  });

  it('reduced motion freezes the supper to its END state: everything lit at once, no fireflies, no flicker; the pay moment is the same', () => {
    r = rig({ rec: { step: 5, letters: 7 }, reducedMotion: true });
    r.press(tableAt());
    r.tick(0.2, {});
    const w = r.life.wing;
    expect(w.lamps.every((x) => x.visible)).toBe(true);
    expect(w.candles.every((x) => x.visible)).toBe(true);
    expect(w.flies.visible).toBe(false);
    expect(w.state.bulbs.flies).toBe(0);
    const o1 = w.strings.material.opacity; r.tick(0.7, {}); expect(w.strings.material.opacity).toBe(o1);
    expect(r.progression.state.treehouse.step).toBe(6);
    r.tick(11, {});
    expect(r.progression.state.treehouse.step).toBe(7);
    expect(r.progression.state.points).toBe(40);
  });

  it('the lower rungs draw less: fewer lanterns, bridge bulbs and fireflies on LOW, no fireflies on LITE', () => {
    const hi = rig({ rec: null }); const lo = rig({ rec: null, tier: { name: 'low', shadows: true, rung: 3 } }); const lite = rig({ rec: null, tier: { name: 'low', shadows: false, rung: 4 } });
    const n = (x) => x.life.wing.state.bulbs;
    expect(n(lo).lamps).toBeLessThan(n(hi).lamps); expect(n(lo).flies).toBeLessThan(n(hi).flies); expect(n(lo).strings).toBeLessThan(n(hi).strings);
    expect(n(lite).flies).toBe(0);
    for (const x of [hi, lo, lite]) x.off();
  });

  it('one PointLight in the whole place, before and during the supper; every live piece is gone on dispose', () => {
    r = rig({ rec: { step: 5, letters: 7 } });
    const lights = () => { let n = 0; r.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; };
    expect(lights()).toBe(1);
    const light = r.scene.getObjectByName('treehouse:light');
    r.tick(0.5, {});
    const calm = light.intensity;
    r.press(tableAt());
    r.tick(3, {});
    expect(light.intensity).toBeGreaterThan(calm);
    expect(light.position.x).toBeCloseTo(W.TABLE.x, 5);
    expect(lights()).toBe(1);
    r.life.dispose();
    for (const n of ['treehouse:strings', 'treehouse:supperFlies', 'treehouse:bellRing', 'treehouse:lampGlow0', 'treehouse:candle0']) expect(r.scene.getObjectByName(n), n).toBeUndefined();
    r.life = { dispose() {} };
  });

  it('a bare walk with no stage in answers null for the wing (a slot nobody has filled)', () => {
    const was = ST.branches;
    try {
      delete ST.branches;
      const scene = new THREE.Scene();
      const placed = build(scene);
      const life = placed.life({ scene, progression: createProgression(memoryStorage()), reducedMotion: false, sendEvent: () => {} });
      expect(life.wing).toBeUndefined();
      expect(life.promptAt({ x: 0, z: 28, y: 0 })).toBe(null);
      life.dispose();
    } finally { ST.branches = was; }
  });
});

describe('the Acorn Locket and the journal\'s two story pages', () => {
  it('is a prize collar: not for sale, owned once the story is told (step 7), rebuilt from the save, never a visit prize', () => {
    expect(CATALOG.accessories.acornlocket).toMatchObject({ name: 'Acorn Locket', slot: 'collar', price: 0, prize: true, treehouse: 'story' });
    const pr = createProgression(memoryStorage());
    expect(pr.state.unlocked.accessories).not.toContain('acornlocket');
    expect(pr.canBuy('accessories', 'acornlocket')).toBe(false);
    const fresh = (treehouse) => sanitizeSave({ ...JSON.parse(JSON.stringify(pr.state)), treehouse });
    expect(fresh({ step: 6, letters: 7, album: 0 }).unlocked.accessories).not.toContain('acornlocket');
    expect(fresh({ step: 7, letters: 7, album: 0 }).unlocked.accessories).toContain('acornlocket');
  });
  it('draws on the cat as a collar charm', () => {
    if (!buildCat) return;
    const worn = buildCat('tabby', { collar: 'acornlocket' });
    const bare = buildCat('tabby', {});
    let a = 0; let b = 0;
    worn.traverse((o) => { if (o.isMesh) a++; }); bare.traverse((o) => { if (o.isMesh) b++; });
    expect(a).toBeGreaterThan(b);
  });
  it('th7 and th8 are live behind the switch, named, hinted once the chunk is in; th9 stays a placeholder', () => {
    expect(TREEHOUSE_LIVE_PAGES.map((p) => p[0])).toEqual(expect.arrayContaining(['th7', 'th8']));
    const c = (id) => CRITTER_INFO.find((x) => x.id === id);
    expect(c('th7')).toMatchObject({ name: 'The Three Letters', treehouse: true }); expect(c('th8')).toMatchObject({ name: 'The Firefly Supper', treehouse: true });
    expect(c('th7').hint).toBe(HINTS.th7); expect(c('th8').hint).toBe(HINTS.th8); expect(TREEHOUSE_HINTS.th7).toBe(HINTS.th7);
    expect(c('th9').later).toBe(true);
    setTreehouse(true);
    expect(renderJournalHtml({ th7: 1, th8: 1 }, 0, 9)).toContain('The Firefly Supper');
    setTreehouse(false);
    expect(renderJournalHtml({ th7: 1, th8: 1 }, 0, 9)).not.toContain('The Firefly Supper');
    setTreehouse(null);
  });
});

describe('the words, both sets', () => {
  const ALL = Object.keys(WING_LINES);
  const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
  it('every line is present, short, kind, and the same plain words in the everyday set (no series word)', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(12);
    for (const id of [...ALL, ...Object.keys(LINES)]) {
      expect(phrase(id).length, id).toBeLessThanOrEqual(100);
      expect(phrase(id), id).not.toMatch(scary);
      expect(withOffWords(() => bannedIn(phrase(id))), id).toBeNull();
      expect(withOffWords(() => phrase(id)), id).toBe(phrase(id));
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); expect(withOffWords(() => bannedIn(h))).toBeNull(); }
  });
  it('every phrase id the wing says is a literal, and no treehouse file spells the series word in code', () => {
    for (const f of globSync('src/world/tree*.js')) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const [, arg] of code.matchAll(/\bphrase\(\s*(`[^`]*`|[^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$|^t\.kind === .*|^id === 0/);
      expect(code, f).not.toMatch(/\bClan\b/);
    }
  });
});
