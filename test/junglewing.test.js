// The Jungle lodge, milestone J5: wing B. The pure supper (a function of one start time, finite for any input), the wing's places (inside the walk, clear of every collider, find ring and
// golden mouse, reached on foot, the low branch's one hop), the story's steps 3 to 7 (the machine, the room's credit, the wire), the wing on a walk (the banana over the log bridge, the
// cacao from the branch, set the table, the Rain Supper on the room clock, the pay once, the Rain Lily Charm), reduced motion (the end state), the lower rungs, the one light, the seeded
// room rain, the journal's two story pages and both word sets.
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
const { setJungle } = await import('../src/jungleflag.js');
const { JUNGLE_LIVE_PAGES, JUNGLE_HINTS } = await import('../src/junglepages.js');
const { CRITTER_INFO, renderJournalHtml } = await import('../src/journal.js');
const { loadJungleStages, ST } = await import('../src/world/junglestages.js');
await loadJungleStages();
const { build } = await import('../src/world/jungle.js');
const M = await import('../src/world/junglemission.js');
const S = await import('../src/world/junglestory.js');
const P = await import('../src/world/jungleplan.js');
const W = await import('../src/world/junglewingplan.js');
const Q = await import('../src/world/junglefindsplan.js');
const { JUNGLE_SPOTS } = await import('../src/foundwear/spots/jungle.js');
const { supperAt, SUPPER, WINDOW_AT, RAIN_TO } = await import('../src/world/junglesupper.js');
const { WING_LINES, HINTS } = await import('../src/world/junglewingwords.js');
const { LINES } = await import('../src/world/junglewords.js');
const { GOLD_MICE } = await import('../src/goldmice.js');
const { canReach, BASE_CLIMB_BUDGET } = await import('../src/climbing.js');
const { isWalkableAt } = await import('../src/player.js');
const { buildCat } = await import('../src/cat/catmodel.js').catch(() => ({}));

const sess = () => ({ cat: { rotation: { y: 0 } } });
const at = (x, z, y = 0) => ({ x, z, y });
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const [F0, F1, F2] = S.allFruits();
const area0 = build(new THREE.Scene());
const flood = floodFrom(area0, area0.spawn, (x, z) => isWalkableAt(area0, x, z));

describe('the Rain Supper, a pure function of one start time', () => {
  it('is finite for any input; not started before 0, over after 20 s', () => {
    for (const k of [NaN, undefined, null, -5, -0.0001, 20.0001, 1e9, Infinity, -Infinity, 'x']) {
      const p = supperAt(k);
      expect(p.active, String(k)).toBe(false);
      for (const v of [...p.bulbs, ...p.windows, p.candles, p.flyOpacity, p.rain, p.rainbow, p.beat, p.glow]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(supperAt(-1)).toMatchObject({ candles: 0, bulbs: Array(10).fill(0), windows: [0, 0, 0], rain: 0, pay: false });
    expect(supperAt(25)).toMatchObject({ candles: 1, bulbs: Array(10).fill(1), windows: [1, 1, 1], rain: 0, rainbow: 0, pay: true });
    for (const k of [0, 3, 7.7, 12, 19.9]) for (const f of supperAt(k).flies) expect(Number.isFinite(f.x + f.y + f.z)).toBe(true);
  });
  it('lights the candles, then the lanterns one after another, the windows in turn; the rain comes, the frogs keep the beat, the rainbow rises as it eases', () => {
    expect(SUPPER.secs).toBe(20);
    expect(supperAt(0.5).candles).toBe(0); expect(supperAt(3).candles).toBe(1);
    const b = supperAt(6).bulbs;
    expect(b[0]).toBeGreaterThan(0.9); expect(b[9]).toBe(0);
    expect(supperAt(10).bulbs[9]).toBeGreaterThan(0.9);
    const a = supperAt(WINDOW_AT[0] + 1.5); const c = supperAt(WINDOW_AT[2] + 1.5);
    expect(a.windows[0]).toBeGreaterThan(0.7); expect(a.windows[2]).toBe(0); expect(c.windows[2]).toBeGreaterThan(0.7);
    expect(supperAt(0.5).rain).toBe(0); expect(supperAt(8).rain).toBe(1); expect(supperAt(RAIN_TO + 3).rain).toBe(0);
    expect(supperAt(8).rainbow).toBe(0); expect(supperAt(RAIN_TO + 2.5).rainbow).toBeGreaterThan(0.9); expect(supperAt(19.9).rainbow).toBeLessThan(0.1);
    const beats = [...Array(60)].map((_, i) => supperAt(6 + i * 0.05).beat);
    expect(Math.max(...beats)).toBeGreaterThan(0.9); expect(Math.min(...beats)).toBe(0); // notes on a regular beat, silence between
    expect(supperAt(0.3).beat).toBe(0);
    const early = supperAt(4).flies; const late = supperAt(12).flies;
    expect(early).toHaveLength(SUPPER.flies);
    const mean = (fs) => fs.reduce((s, f) => s + Math.hypot(f.x - W.YARD.x, f.z - W.YARD.z), 0) / fs.length;
    expect(mean(late)).toBeLessThan(mean(early));
    expect(mean(late)).toBeLessThan(3.5);
    let prev = 0;
    for (let k = 0; k <= 12; k += 0.25) { const v = supperAt(k).bulbs.reduce((s, x) => s + x, 0); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
  });
  it('pays at one moment, after the windows are lit; the same answer every time (no clock, no random number)', () => {
    expect(supperAt(SUPPER.payAt - 0.01).pay).toBe(false); expect(supperAt(SUPPER.payAt).pay).toBe(true);
    expect(supperAt(SUPPER.payAt)).toEqual(supperAt(SUPPER.payAt));
    expect(SUPPER.payAt).toBeGreaterThan(WINDOW_AT[2]);
    for (const f of ['src/world/junglesupper.js', 'src/world/junglewingplan.js', 'src/world/junglewinglive.js', 'src/world/junglewingparts.js']) expect(read(f).replace(/\/\/.*$/gm, ''), f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });
});

describe('the wing\'s places', () => {
  const area = build(new THREE.Scene());
  it('the story table has all three fruit in order, with the two goal spots; the stage keeps its finds and life', () => {
    expect(S.allFruits().map((c) => c.id)).toEqual([0, 1, 2]);
    expect(S.allFruits().map((c) => c.kind)).toEqual(['mango', 'banana', 'cacao']);
    expect(Object.keys(ST.b.story.spots)).toEqual(['set', 'supper']);
    expect(ST.b.finds.collectibles).toBeTypeOf('function'); expect(ST.story.critters).toBeTypeOf('function');
    expect(area.collectibles).toHaveLength(6);
  });
  it('every solid place is inside the walk, clear of the place\'s colliders, the find rings (except the ones it stands beside), the golden mice and the anklet\'s spots', () => {
    const B = P.JUNGLE_BOUNDS;
    const base = P.jungleColliders();
    for (const c of W.wingColliders()) {
      expect(c.x - c.r).toBeGreaterThan(B.minX + 1); expect(c.x + c.r).toBeLessThan(B.maxX - 1); expect(c.z - c.r).toBeGreaterThan(B.minZ + 1);
      for (const k of base) expect(near(c, k), JSON.stringify(c)).toBeGreaterThan(c.r + k.r);
      for (const id of Q.JUNGLE_FIND_IDS) { const z = Q.JUNGLE_FIND_ZONES[id][0]; expect(near(c, z), `${id} ring`).toBeGreaterThan(c.r + z.r); }
      for (const s of JUNGLE_SPOTS) expect(near(c, s), s.id).toBeGreaterThan(c.r + 1);
      for (const m of Q.JUNGLE_GOLD) expect(near(c, m), m.id).toBeGreaterThan(c.r + 0.5);
    }
    expect(area.colliders.length).toBeGreaterThanOrEqual(base.length + W.wingColliders().length);
  });
  it('the banana lies across the river from the table, past the log bridge, reached on foot; the table is on the veranda', () => {
    expect(F1.z).toBeLessThan(P.LOG_BRIDGE.z - P.LOG_BRIDGE.len / 2); // north of the bridge's far end
    expect(P.riverDist(F1.x, F1.z)).toBeGreaterThan(P.RIVER_W);
    expect(flood.reachesWithin(F1.x, F1.z, 0.9)).toBe(true);
    for (const f of S.allFruits()) { expect(near(f, S.TABLE)).toBeGreaterThan(S.TABLE.reach); expect(f.reach).toBeGreaterThan(1); }
    expect(S.TABLE.y).toBe(P.LODGE.deck);
  });
  it('the third golden mouse and the cacao are on the low branch: ONE hop (1.0 m) from the ground beside it, with no skill', () => {
    const m = GOLD_MICE.jungle.find((g) => g.id === 'gm-jungle-3');
    expect(m).toMatchObject({ x: W.BRANCH.x, z: W.BRANCH.z, y: W.BRANCH.h });
    expect(Q.JUNGLE_GOLD.find((g) => g.id === 'gm-jungle-3').y).toBe(1.0);
    const perch = area.perches.find((p) => p.x === W.BRANCH.x && p.z === W.BRANCH.z - 0.5);
    expect(perch.y).toBeCloseTo(P.jungleY(m.x, m.z) + m.y, 1);
    const from = { x: m.x - 1.0, z: m.z + 0.9 }; // standing on the hill beside the branch
    expect(flood.reachesWithin(from.x, from.z, 1)).toBe(true);
    expect(canReach(perch, from, P.jungleY(from.x, from.z), BASE_CLIMB_BUDGET)).toBe(true);
    expect(perch.y - P.jungleY(from.x, from.z)).toBeLessThanOrEqual(1.4);
    expect(perch.kind).toBe('tree');
    expect(near(F2, perch)).toBeLessThan(F2.reach); // the pod is within her reach from the branch
    expect(F2.minY).toBeLessThan(perch.y); expect(F2.minY).toBeGreaterThan(P.jungleY(from.x, from.z) + 0.5); // and only from up there
  });
  it('the canopy walk, the sloth and the orchid stand over the find rings J3 left bare', () => {
    const canopy = Q.JUNGLE_FIND_ZONES.canopy[0]; const sloth = Q.JUNGLE_FIND_ZONES.sloth[0]; const orchid = Q.JUNGLE_FIND_ZONES.orchid[0];
    const line = (p) => { const a = W.WALK.a; const b = W.WALK.b; const u = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / near(a, b) ** 2; return Math.hypot(p.x - (a.x + (b.x - a.x) * u), p.z - (a.z + (b.z - a.z) * u)); };
    expect(line(canopy)).toBeLessThan(2.5); // she stands under the walkway
    expect(near(W.SLOTH, sloth)).toBeLessThan(sloth.r); // the sloth hangs over the ring
    expect(near(W.ORCHID, orchid)).toBeLessThan(3); expect(near(W.ORCHID, orchid)).toBeGreaterThan(orchid.r + W.ORCHID.r);
    expect(W.WALK_HEIGHT).toBeGreaterThan(5); // high over the cat: nothing to bump into, no real ceiling
  });
  it('the supper\'s lanterns hang along the veranda\'s eave, the windows stand on the lodge\'s front, the strings follow the log bridge and the eave', () => {
    const bulbs = W.supperBulbs();
    expect(bulbs).toHaveLength(10);
    for (const b of bulbs) { expect(b.x).toBeGreaterThan(P.LODGE.x0); expect(b.x).toBeLessThan(P.LODGE.x1); expect(b.z).toBeGreaterThan(P.LODGE.z1); expect(b.y).toBeGreaterThan(P.LODGE.deck + 2); expect(b.y).toBeLessThan(P.LODGE.deck + P.LODGE.roofY); }
    for (const w of W.WINDOWS) { expect(Math.abs(w.z - P.LODGE.wallZ)).toBeLessThan(1); expect(w.y).toBeGreaterThan(P.LODGE.deck); }
    const strings = W.stringBulbs();
    expect(strings.length).toBeGreaterThan(14);
    for (const s of strings) expect(Number.isFinite(s.x + s.y + s.z)).toBe(true);
    expect(strings.some((s) => Math.abs(s.x - (P.LOG_BRIDGE.x + 0.75)) < 0.01)).toBe(true);
  });
  it('Mossy offers the supper from near her, which is clear of the table\'s prompt', () => {
    expect(near(S.MOSSY.start, S.TABLE)).toBeGreaterThan(W.BEGIN_REACH * 0.9); // the two prompts do not overlap at the spot where she stands
    expect(W.BEGIN_REACH).toBeGreaterThan(S.MOSSY.radius);
  });
});

describe('the story\'s steps 3 to 7', () => {
  it('the banana, the cacao, then the table, the supper and the pay, each only in its turn; step 7 is the end', () => {
    let r = { step: 2, fruit: 1 };
    const seq = [[{ kind: 'deliver', fruit: 1 }, 'second', 3, 3], [{ kind: 'deliver', fruit: 2 }, 'third', 4, 7], [{ kind: 'set' }, 'set', 5, 7], [{ kind: 'supper' }, 'supper', 6, 7], [{ kind: 'done' }, 'done', 7, 7]];
    for (const [ev, effect, step, fruit] of seq) {
      expect(M.apply(r, { kind: 'done' }).changed, `${ev.kind} first`).toBe(effect === 'done');
      const a = M.apply(r, ev);
      expect(a).toMatchObject({ changed: true, effect, jungle: { step, fruit } });
      expect(M.apply(a.jungle, ev).changed).toBe(false);
      r = a.jungle;
    }
    expect(M.normalize({ ...r, step: 99 }).step).toBe(7);
    expect(M.apply({ step: 3, fruit: 3 }, { kind: 'set' }).changed).toBe(false);
    expect(M.apply({ step: 4, fruit: 7 }, { kind: 'supper' }).changed).toBe(false);
  });
  it('the goal after the third fruit is the table, then the supper; a partner\'s later step takes every step before it in order', () => {
    expect(M.nextGoal({ step: 4, fruit: 7 })).toMatchObject({ kind: 'set', icon: 'table' });
    expect(M.nextGoal({ step: 5, fruit: 7 })).toMatchObject({ kind: 'supper', icon: 'spark' });
    expect(M.nextGoal({ step: 6, fruit: 7 })).toMatchObject({ kind: 'supper' });
    expect(M.nextGoal({ step: 7, fruit: 7 })).toMatchObject({ kind: 'rest' });
    expect(M.credit({ step: 0, fruit: 0 }, { kind: 'done' })).toMatchObject({ changed: true, effect: 'done', jungle: { step: 7, fruit: 7 } });
    expect(M.credit({ step: 3, fruit: 3 }, { kind: 'set' }).jungle.step).toBe(5);
    expect(M.toStep({ kind: 'jl-set' })).toEqual({ kind: 'set' });
    expect(M.wire({ kind: 'set' })).toEqual({ kind: 'jl-set' });
    expect(M.toStep({ kind: 'jl-done' })).toBe(null); // the pay is each device's own, never a message
    expect(M.toStep({ kind: 'jl-supper', elapsed: 3 })).toBe(null); // the supper goes through the wing
  });
});

function rig({ rec = { step: 4, fruit: 7 }, reducedMotion = false, tier = null, send = null, roomSeed = undefined } = {}) {
  const progression = createProgression(memoryStorage());
  if (rec) { progression.state.jungle = { ...progression.state.jungle, ...rec }; progression.addPoints(0); }
  const scene = new THREE.Scene();
  const placed = build(scene);
  const log = createDiscoveryLog(progression);
  log.startWalk();
  const sent = [];
  const life = placed.life({ scene, log, progression, reducedMotion, tier, roomSeed, audio: null, sendEvent: send ?? ((ev) => sent.push(ev)) });
  const heard = [];
  const off = bus.on('discovery', (e) => heard.push(e));
  const cat = { x: 0, y: 0, z: 28 };
  const tick = (secs, to = null) => { if (to) Object.assign(cat, to); for (let i = 0; i < Math.round(secs * 20); i++) life.update(0.05, i * 0.05, cat, null, sess()); };
  const press = (to) => { tick(0.1, to); const line = life.promptAt(cat); return { line, kind: line ? life.interact() : null }; };
  return { progression, scene, placed, log, life, sent, heard, cat, tick, press, off: () => { off(); life.dispose(); } };
}
const tableAt = () => at(S.TABLE.x + 1.2, S.TABLE.z + 0.8, S.TABLE.y);
const mossyAt = (r) => at(r.life.mossy.mossy.x, r.life.mossy.mossy.z + 1.9, S.TABLE.y); // in front of her, clear of the lodge find's ring and the first golden mouse
const tableFar = () => at(S.TABLE.x - 1.2, S.TABLE.z + 0.6, S.TABLE.y); // the table's far side, out of Mossy's reach
const branchAt = () => at(W.BRANCH.x, W.BRANCH.z, W.branchY());

describe('the wing on a walk', () => {
  let r;
  afterEach(() => { r?.off(); r = null; });

  it('carries the banana over the log bridge and the cacao down from the low branch, in order, never saved while carried', () => {
    r = rig({ rec: { step: 2, fruit: 1 } });
    expect(r.life.mossy.goalNow().g).toMatchObject({ kind: 'fruit', fruit: 1 });
    expect(r.press(at(F2.x, F2.z - 0.5, 0)).kind, 'the cacao waits for its turn, and for the branch').toBe(null);
    expect(r.press(at(F1.x - 0.9, F1.z)).kind).toBe('pick');
    expect(r.progression.state.jungle.fruit).toBe(1);
    expect(r.life.mossy.state.carrying).toBe(1);
    expect(r.press(at(S.TABLE.x + 1.2, S.TABLE.z + 0.8, 0)).kind, 'on the ground under the deck is not the table').toBe(null);
    expect(r.press(tableAt()).kind).toBe('give');
    expect(r.progression.state.jungle).toMatchObject({ step: 3, fruit: 3 });
    expect(r.life.mossy.goalNow().g).toMatchObject({ kind: 'fruit', fruit: 2 });
    expect(r.press(at(F2.x, F2.z, P.jungleY(F2.x, F2.z))).kind, 'on the ground beside the branch is not on it').toBe(null);
    expect(r.press(branchAt()).kind).toBe('pick');
    expect(r.press(tableAt()).kind).toBe('give');
    expect(r.progression.state.jungle).toMatchObject({ step: 4, fruit: 7 });
    expect(r.sent).toEqual([{ kind: 'jl-deliver', fruit: 1 }, { kind: 'jl-deliver', fruit: 2 }]);
    expect(r.progression.state.journal.jl7).toBe(1); // the journal's fruit page
    for (const k of ['jungle-fruit-got1', 'jungle-fruit-got2', 'jungle-table-delivered']) expect(r.heard.map((e) => e.key)).toContain(k);
    r.life.mossy.state; // (the carried fruit is never in the save)
    expect(JSON.stringify(r.progression.state.jungle)).not.toMatch(/carry/);
  });

  it('set the table at the kitchen table (step 5, sent as jl-set): the strings of lights come on and stay; the meow goes to the table, then to Mossy', () => {
    r = rig();
    r.tick(0.2, at(-20, 20));
    expect(r.life.mossy.goalNow()).toMatchObject({ x: S.TABLE.x, z: S.TABLE.z });
    expect(r.life.wing.strings.visible).toBe(false);
    expect(r.press(at(S.TABLE.x + 1.2, S.TABLE.z + 0.8, 0)).line, 'under the deck').toBe(null);
    expect(r.press(tableAt())).toMatchObject({ line: phrase('jungle.table.set.prompt'), kind: 'set' });
    expect(r.progression.state.jungle.step).toBe(5);
    expect(r.sent).toEqual([{ kind: 'jl-set' }]);
    r.tick(3, {});
    expect(r.life.wing.strings.visible).toBe(true);
    expect(r.heard.map((e) => e.key)).toContain('jungle-table-set');
    expect(r.life.mossy.goalNow()).toMatchObject({ x: r.life.mossy.mossy.x, z: r.life.mossy.mossy.z });
    expect(r.press(tableFar()).kind, 'the table has nothing more to offer, and Mossy is out of reach from its far side').toBe(null);
    expect(r.press(tableAt()).kind, 'but near her the supper may begin').toBe('begin');
    expect(r.sent).toHaveLength(2); // jl-set, then the supper's start
  });

  it('the supper: begin beside Mossy, 20 s, pays 40 paws ONCE, saves step 7, gives the charm, keeps the lanterns lit for good; a replay pays nothing', () => {
    r = rig({ rec: { step: 5, fruit: 7 } });
    expect(r.press(at(-20, 20)).line).toBe(null);
    const spot = mossyAt(r);
    expect(r.press(spot)).toMatchObject({ line: phrase('jungle.supper.prompt'), kind: 'begin' });
    expect(r.progression.state.jungle.step).toBe(6);
    expect(r.sent).toEqual([{ kind: 'jl-supper', elapsed: 0 }]);
    expect(r.life.wing.supperOn()).toBe(true);
    expect(r.life.promptAt(r.cat), 'one supper at a time').toBe(null);
    r.tick(5, {});
    expect(r.life.wing.lamps.some((w) => w.visible)).toBe(true);
    expect(r.life.wing.flies.visible).toBe(true);
    r.tick(8, {}); // about 13 s: past the pay moment
    expect(r.progression.state.jungle.step).toBe(7);
    expect(r.progression.state.points).toBe(AWARDS.junglestory);
    expect(r.progression.state.unlocked.accessories).toContain('rainlily');
    expect(r.progression.state.equipped.collar).toBe('rainlily');
    expect(r.progression.state.journal.jl8).toBe(1);
    r.tick(12, {});
    expect(r.life.wing.supperOn()).toBe(false);
    expect(r.life.wing.lamps.every((w) => w.visible)).toBe(true); // lit for good
    expect(r.heard.map((e) => e.key)).toContain('jungle-charm');
    expect(r.press(spot)).toMatchObject({ line: phrase('jungle.supper.replay'), kind: 'replay' });
    r.tick(22, {});
    expect(r.progression.state.points).toBe(AWARDS.junglestory);
    expect(AWARDS.junglestory).toBe(40);
  });

  it('the supper\'s rain is the light\'s: the shower comes on over the schedule, the frogs\' state sees it, the rainbow rises, and it all goes back to the schedule after', () => {
    r = rig({ rec: { step: 5, fruit: 7 } });
    const light = r.life.light;
    r.tick(0.5, at(0, 30));
    expect(light.state.strength).toBe(0); // the first shower is never in the first 45 s
    r.press(mossyAt(r));
    r.tick(8, { x: 0, z: 30, y: 0 });
    expect(light.state.strength).toBeGreaterThan(0.9);
    expect(light.rain.visible).toBe(true);
    expect(light.light.intensity).toBeGreaterThan(1.5 * 1.1); // the veranda lantern lifts
    r.tick(11.5, {});
    expect(light.state.rainbow).toBeGreaterThan(0.2);
    r.tick(3, {});
    expect(light.state.strength).toBe(0);
    expect(r.scene.getObjectsByProperty?.('isPointLight', true)?.length ?? 1).toBe(1);
  });

  it('in a room the showers are the room\'s seeded schedule: two devices with the same seed agree, a different seed differs', () => {
    const a = rig({ rec: null, roomSeed: 12345 }); const b = rig({ rec: null, roomSeed: 12345 }); const c = rig({ rec: null, roomSeed: 999 }); const solo = rig({ rec: null });
    const seen = [a, b, c, solo].map((x) => { const out = []; for (let i = 0; i < 400; i++) { x.life.update(0.5, 50 + i * 0.5, { x: 0, y: 0, z: 30 }, null, sess()); out.push(x.life.light.state.strength > 0.5 ? 1 : 0); } return out.join(''); });
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).not.toBe(seen[2]);
    for (const x of [a, b, c, solo]) x.off();
  });

  it('the room clock: a partner\'s supper starts ours at the right second, takes the steps in order, and everyone pays their own save once', () => {
    r = rig({ rec: { step: 2, fruit: 1 } });
    expect(r.life.credit({ kind: 'jl-supper', elapsed: 6 })).toBe('supper-start');
    expect(r.progression.state.jungle.step).toBe(6);
    expect(r.life.wing.state.supper.k).toBeCloseTo(6, 1);
    expect(r.sent, 'a partner\'s supper is not echoed').toEqual([]);
    expect(r.life.credit({ kind: 'jl-supper', elapsed: 2 })).toBe(null); // already going
    r.tick(6, {});
    expect(r.progression.state.jungle.step).toBe(7);
    expect(r.progression.state.points).toBe(40);
    for (const ev of [null, 7, {}, { kind: 'jl-supper' }, { kind: 'jl-supper', elapsed: 'x' }, { kind: 'jl-nope' }]) expect(() => r.life.credit(ev)).not.toThrow();
    expect(r.life.credit({ kind: 'jl-set' })).toBe(null); // already past it
  });
  it('a partner who sets the table is credited with every step before it', () => {
    r = rig({ rec: { step: 1, fruit: 0 } });
    expect(r.life.credit({ kind: 'jl-set' })).toBe('set');
    expect(r.progression.state.jungle).toMatchObject({ step: 5, fruit: 7 });
  });

  it('two devices with different frame rates agree on the supper\'s picture at the same second', () => {
    const a = rig({ rec: { step: 5, fruit: 7 } });
    const b = rig({ rec: { step: 5, fruit: 7 } });
    a.life.wing.start({ own: true });
    b.life.credit({ kind: 'jl-supper', elapsed: 0 });
    for (let i = 0; i < 100; i++) a.life.update(0.1, i * 0.1, a.cat, null, sess()); // 10 s at 10 fps
    for (let i = 0; i < 300; i++) b.life.update(1 / 30, i / 30, b.cat, null, sess()); // 10 s at 30 fps
    expect(a.life.wing.state.supper.k).toBeCloseTo(b.life.wing.state.supper.k, 1);
    expect(a.life.wing.lamps.map((w) => w.visible)).toEqual(b.life.wing.lamps.map((w) => w.visible));
    expect(a.life.wing.candles.map((w) => w.visible)).toEqual(b.life.wing.candles.map((w) => w.visible));
    expect(a.life.light.state.strength).toBeCloseTo(b.life.light.state.strength, 1);
    a.off(); b.off();
  });

  it('reduced motion freezes the supper to its END state: everything lit at once, no rain, no fireflies, no flicker, no sway; the pay moment is the same', () => {
    r = rig({ rec: { step: 5, fruit: 7 }, reducedMotion: true });
    r.press(mossyAt(r));
    r.tick(0.2, {});
    const w = r.life.wing;
    expect(w.lamps.every((x) => x.visible)).toBe(true);
    expect(w.candles.every((x) => x.visible)).toBe(true);
    expect(w.windows.every((x) => x.visible)).toBe(true);
    expect(w.flies.visible).toBe(false);
    expect(w.state.bulbs.flies).toBe(0);
    expect(r.life.light.rain.visible).toBe(false);
    const o1 = w.strings.material.opacity; r.tick(0.7, {}); expect(w.strings.material.opacity).toBe(o1);
    const rz = w.sloth.rotation.z; r.tick(1, {}); expect(w.sloth.rotation.z).toBe(rz);
    expect(r.progression.state.jungle.step).toBe(6);
    r.tick(11, {});
    expect(r.progression.state.jungle.step).toBe(7);
    expect(r.progression.state.points).toBe(40);
  });

  it('the lower rungs draw less: fewer lanterns and fireflies on LOW, no fireflies and fewer bulbs on LITE', () => {
    const hi = rig({ rec: null }); const lo = rig({ rec: null, tier: { name: 'low', shadows: true, rung: 3 } }); const lite = rig({ rec: null, tier: { name: 'low', shadows: false, rung: 4 } });
    const n = (x) => x.life.wing.state.bulbs;
    expect(n(lo).lamps).toBeLessThan(n(hi).lamps); expect(n(lo).flies).toBeLessThan(n(hi).flies);
    expect(n(lite).flies).toBe(0); expect(n(lite).strings).toBeLessThan(n(hi).strings);
    for (const x of [hi, lo, lite]) x.off();
  });

  it('one PointLight in the whole place, before and during the supper; every live piece is gone on dispose', () => {
    r = rig({ rec: { step: 5, fruit: 7 } });
    const lights = () => { let n = 0; r.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; };
    expect(lights()).toBe(1);
    r.press(mossyAt(r));
    r.tick(3, {});
    expect(lights()).toBe(1);
    r.life.dispose();
    for (const n of ['jungle:strings', 'jungle:supperFlies', 'jungle:sloth', 'jungle:lampGlow0', 'jungle:candle0', 'jungle:window0']) expect(r.scene.getObjectByName(n), n).toBeUndefined();
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
      expect(life.promptAt({ x: 0, z: 28, y: 0 })).toBe(null);
      life.dispose();
    } finally { ST.b = was; }
  });
});

describe('the Rain Lily Charm and the journal\'s two story pages', () => {
  it('is a prize collar: not for sale, owned once the story is told (step 7), rebuilt from the save, never a visit prize', () => {
    expect(CATALOG.accessories.rainlily).toMatchObject({ name: 'Rain Lily Charm', slot: 'collar', price: 0, prize: true, jungle: 'story' });
    const pr = createProgression(memoryStorage());
    expect(pr.state.unlocked.accessories).not.toContain('rainlily');
    expect(pr.canBuy('accessories', 'rainlily')).toBe(false);
    const fresh = (jungle) => sanitizeSave({ ...JSON.parse(JSON.stringify(pr.state)), jungle });
    expect(fresh({ step: 6, fruit: 7, album: 0 }).unlocked.accessories).not.toContain('rainlily');
    expect(fresh({ step: 7, fruit: 7, album: 0 }).unlocked.accessories).toContain('rainlily');
  });
  it('draws on the cat as a collar charm', () => {
    if (!buildCat) return;
    const worn = buildCat('tabby', { collar: 'rainlily' });
    const bare = buildCat('tabby', {});
    let a = 0; let b = 0;
    worn.traverse((o) => { if (o.isMesh) a++; }); bare.traverse((o) => { if (o.isMesh) b++; });
    expect(a).toBeGreaterThan(b);
  });
  it('jl7 and jl8 are live behind the switch, named, hinted once the chunk is in; jl9 stays a placeholder', () => {
    expect(JUNGLE_LIVE_PAGES.map((p) => p[0])).toEqual(expect.arrayContaining(['jl7', 'jl8']));
    const c = (id) => CRITTER_INFO.find((x) => x.id === id);
    expect(c('jl7')).toMatchObject({ name: 'The Three Fruits', jungle: true }); expect(c('jl8')).toMatchObject({ name: 'The Rain Supper', jungle: true });
    expect(c('jl7').hint).toBe(HINTS.jl7); expect(c('jl8').hint).toBe(HINTS.jl8); expect(JUNGLE_HINTS.jl7).toBe(HINTS.jl7);
    expect(c('jl9').later).toBe(true);
    setJungle(true);
    expect(renderJournalHtml({ jl7: 1, jl8: 1 }, 0, 9)).toContain('The Rain Supper');
    setJungle(false);
    expect(renderJournalHtml({ jl7: 1, jl8: 1 }, 0, 9)).not.toContain('The Rain Supper');
    setJungle(null);
  });
});

describe('the words, both sets', () => {
  const ALL = Object.keys(WING_LINES);
  const scary = /\b(dark\w*|lost forever|trapped|stuck|collapse\w*|scary|scared|afraid|danger\w*|die|dead|hurt)\b/i;
  it('every line is present, short, kind, and the same plain words in the everyday set (no series word)', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(11);
    for (const id of [...ALL, ...Object.keys(LINES)]) {
      expect(phrase(id).length, id).toBeLessThanOrEqual(100);
      expect(phrase(id), id).not.toMatch(scary);
      expect(withOffWords(() => bannedIn(phrase(id))), id).toBeNull();
      expect(withOffWords(() => phrase(id)), id).toBe(phrase(id));
    }
    for (const h of Object.values(HINTS)) { expect(h).not.toMatch(scary); expect(withOffWords(() => bannedIn(h))).toBeNull(); }
  });
  it('every phrase id the wing says is a literal, and no jungle file spells the series word in code', () => {
    for (const f of globSync('src/world/jungle*.js')) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const [, arg] of code.matchAll(/\bphrase\(\s*(`[^`]*`|[^,)]+)/g)) expect(arg.trim(), `${f}: phrase(${arg})`).toMatch(/^'[a-z][a-z0-9.]*'$/);
      expect(code, f).not.toMatch(/\bClan\b/);
    }
  });
});
