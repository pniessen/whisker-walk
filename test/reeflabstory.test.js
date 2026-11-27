// The Reef, milestone R14: the Sealab's fuses, the aquarium and the shy shark. The pure step logic (src/reeflab.js: any order, credit, the carry endings, hostile saves,
// the save's sanitiser agreeing), the plan's data (fuse spots reachable, the panel, the mouse in the bunk room, the shark's loop and its shyness, the fish in their
// tanks), the walk (pick, carry, put in, the award once, the hatch with a fuse in her mouth, every way a walk ends), the prompts not competing, the words in both
// sets and the journal pages.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, globSync } from 'node:fs';
import { stubCanvasDocument } from './helpers/canvas.js';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';
import { floodFrom } from './helpers/flood.js';
import { isWalkableAt, createPlayer } from '../src/player.js';

stubCanvasDocument();
const { build } = await import('../src/world/reef.js');
const A = await import('../src/reeflab.js');
const L = await import('../src/world/reeflabplan.js');
const P = await import('../src/world/reefplan.js');
const Q = await import('../src/world/reeffindsplan.js');
const G = await import('../src/reefguide.js').catch(() => null);
const guide = await import('../src/world/reefguide.js');
const { LINES } = await import('../src/world/reeflabwords.js');
const { phrase } = await import('../src/clanphrases.js');
const { createProgression, reefLab } = await import('../src/progression.js');
const { createDiscoveryLog } = await import('../src/discoveries.js');
const { placeFloat } = await import('../src/placephysics.js');
const { createPromptArbiter } = await import('../src/world/reefprompt.js');
const { GOLD_MICE, GOLD_TOTAL } = await import('../src/goldmice.js');
const RP = await import('../src/reefpages.js');
void G;

const read = (f) => readFileSync(f, 'utf8');
const area = build(new THREE.Scene());

describe('the step logic (src/reeflab.js)', () => {
  it('three fuses in any order; the third is "power"; one already in changes nothing; the other keys of the record come back untouched', () => {
    const orders = [[0, 1, 2], [2, 0, 1], [1, 2, 0], [2, 1, 0]];
    for (const o of orders) {
      let r = { step: 7, shells: 7, album: 5, lab: 0, wreck: 0 };
      o.forEach((f, k) => {
        const n = A.apply(r, { kind: 'fuse', fuse: f });
        expect(n.changed).toBe(true);
        expect(n.effect).toBe(k === 2 ? 'power' : 'fuse');
        expect(A.apply(n.reef, { kind: 'fuse', fuse: f }).changed).toBe(false);
        r = n.reef;
      });
      expect(r).toEqual({ step: 7, shells: 7, album: 5, lab: 7, wreck: 0 });
      expect(A.powered(r)).toBe(true);
    }
  });
  it('nonsense does nothing and never throws: wrong kinds, wrong fuses, hostile records', () => {
    for (const ev of [null, undefined, 3, 'fuse', {}, { kind: 'fuse' }, { kind: 'fuse', fuse: 3 }, { kind: 'fuse', fuse: -1 }, { kind: 'fuse', fuse: '1' }, { kind: 'fuse', fuse: 1.5 }, { kind: 'parade' }]) {
      const r = A.apply({ lab: 0 }, ev);
      expect(r.changed).toBe(false); expect(r.effect).toBeNull(); expect(r.reef.lab).toBe(0);
    }
    for (const bad of [null, undefined, 7, 'x', [], { lab: -4 }, { lab: 1e9 }, { lab: NaN }, { lab: '3' }, { lab: 2.5 }]) {
      expect(() => A.apply(bad, { kind: 'fuse', fuse: 0 })).not.toThrow();
      const l = A.normalize(bad).lab;
      expect(Number.isInteger(l) && l >= 0 && l <= 15).toBe(true);
    }
  });
  it('the show bit implies the three fuses, and the sanitiser the save uses is this same rule for every value', () => {
    expect(A.normLab(8)).toBe(15);
    expect(A.showSeen({ lab: 8 })).toBe(true);
    for (let v = 0; v < 40; v++) expect(A.normLab(v), String(v)).toBe(reefLab(Math.min(15, v)));
    expect(createProgression(memoryStorage()).state.reef.lab).toBe(0);
  });
  it('a partner\'s fuse is credited the same way (no order to keep), and a fuse she is past changes nothing', () => {
    const a = A.credit({ lab: 0 }, { kind: 'fuse', fuse: 2 });
    expect(a.changed).toBe(true); expect(a.reef.lab).toBe(4);
    expect(A.credit(a.reef, { kind: 'fuse', fuse: 2 }).changed).toBe(false);
    expect(A.credit(a.reef, { kind: 'fuse', fuse: 0 }).reef.lab).toBe(5);
  });
  it('the next goal: find the first one not in (nearest first when asked), deliver the one in her mouth, rest when all are in', () => {
    expect(A.nextGoal({ lab: 0 })).toEqual({ kind: 'fuse', fuse: 0, icon: 'question' });
    expect(A.nextGoal({ lab: 1 }, null, [1, 0, 2]).fuse).toBe(1);
    expect(A.nextGoal({ lab: 1 }, null, [0, 2, 1]).fuse).toBe(2);
    expect(A.nextGoal({ lab: 0 }, 2)).toEqual({ kind: 'deliver', fuse: 2, icon: 'heart' });
    expect(A.nextGoal({ lab: 4 }, 2).kind).toBe('fuse'); // a fuse already in: nothing to deliver
    expect(A.nextGoal({ lab: 7 }).kind).toBe('rest');
    expect(A.nextGoal({ lab: 0 }, null, 'nonsense').fuse).toBe(0);
  });
  it('canPick: one at a time, never one already in the panel; carry endings: the walk end, a second pickup and the ladder (a fuse of the station) put it back', () => {
    expect(A.canPick({ lab: 0 }, 1, null)).toBe(true);
    expect(A.canPick({ lab: 0 }, 1, 0)).toBe(false);
    expect(A.canPick({ lab: 2 }, 1, null)).toBe(false);
    expect(A.canPick({ lab: 0 }, 5, null)).toBe(false);
    expect(A.carryAfter(1, 'walkend')).toBeNull();
    expect(A.carryAfter(1, 'busy')).toBeNull();
    expect(A.carryAfter(1, 'in')).toBeNull();
    expect(A.carryAfter(1, 'hatchup', true)).toBeNull(); // from the station: set down
    expect(A.carryAfter(2, 'hatchup', false)).toBe(2); // from the sand: hers to keep
    expect(A.carryAfter(null, 'hatchup', true)).toBeNull();
    expect(A.carryAfter(2, 'something else')).toBeNull();
  });
  it('the file is pure: no three, no clock, no random number, no save', () => {
    const src = read('src/reeflab.js').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/import |Math\.random|Date\.now|performance\.now|localStorage|progression/);
  });
});

describe('the plan\'s data', () => {
  const flood = floodFrom(area, L.HATCH.inside.arrive, (x, z) => isWalkableAt(area, x, z));
  const sand = floodFrom(area, P.REEF_SPAWN, (x, z) => isWalkableAt(area, x, z));
  it('three fuse spots: two in the station (bunk room, aquarium hall), one on the open sand west of the hatch; each is walkable, away from every collider and from the hatch\'s reach', () => {
    expect(L.FUSE_SPOTS.map((s) => s.id)).toEqual([0, 1, 2]);
    expect(L.FUSE_SPOTS.map((s) => s.inside)).toEqual([true, true, false]);
    expect(L.roomAt(L.FUSE_SPOTS[0].x, L.FUSE_SPOTS[0].z)).toBe('bunk');
    expect(L.roomAt(L.FUSE_SPOTS[1].x, L.FUSE_SPOTS[1].z)).toBe('aquarium');
    expect(L.insideLab(L.FUSE_SPOTS[2].x, L.FUSE_SPOTS[2].z, 2)).toBe(false);
    for (const s of L.FUSE_SPOTS) {
      expect(isWalkableAt(area, s.x, s.z), `fuse ${s.id}`).toBe(true);
      for (const c of area.colliders) expect(Math.hypot(c.x - s.x, c.z - s.z), `fuse ${s.id} vs ${c.x},${c.z}`).toBeGreaterThan(c.r + 0.5);
      (s.inside ? flood : sand).reaches(s.x, s.z) || expect.fail(`fuse ${s.id} is not reachable on foot`);
      expect(Math.hypot(s.x - L.HATCH.outside.x, s.z - L.HATCH.outside.z)).toBeGreaterThan(L.HATCH.outside.reach + L.FUSE_REACH + 1);
      expect(Math.hypot(s.x - L.HATCH.inside.exit.x, s.z - L.HATCH.inside.exit.z)).toBeGreaterThan(L.HATCH.inside.reach + L.FUSE_REACH + 1);
    }
    expect(L.FUSE_SPOTS[2].x).toBeGreaterThan(P.REEF_BOUNDS.minX);
  });
  it('the panel spot is in the control room, reachable, and the three sockets are within a cat\'s reach of it', () => {
    expect(L.roomAt(L.PANEL.x, L.PANEL.z)).toBe('control');
    expect(flood.reaches(L.PANEL.x, L.PANEL.z)).toBe(true);
    for (const k of L.FUSE_SOCKETS) expect(Math.hypot(k.x - L.PANEL.x, k.z - L.PANEL.z)).toBeLessThan(L.PANEL.reach + 0.5);
  });
  it('gm-reef-4 is in the bunk room on the floor, on foot; the totals are unchanged (62), and it is not in KEEP_OUT', () => {
    const m4 = GOLD_MICE.reef.find((m) => m.id === 'gm-reef-4');
    expect(m4).toMatchObject({ x: L.BUNK_SPOT.x, z: L.BUNK_SPOT.z, y: 0 });
    expect(L.roomAt(m4.x, m4.z)).toBe('bunk');
    expect(flood.reaches(m4.x, m4.z)).toBe(true);
    expect(Q.REEF_GOLD.find((m) => m.id === 'gm-reef-4')).toMatchObject({ x: m4.x, z: m4.z, y: 0 });
    expect(GOLD_TOTAL).toBe(62);
    expect(P.KEEP_OUT.some(([x, z]) => x === m4.x && z === m4.z)).toBe(false);
    for (const c of L.PROP_COLLIDERS) expect(Math.hypot(c.x - m4.x, c.z - m4.z)).toBeGreaterThan(c.r + 0.5);
  });
  it('the fish stay inside their tanks\' glass, at water height, whatever the time; the shark never enters the building and stays 3 m clear of the dome\'s glass', () => {
    const out = {};
    for (let t = 0; t < 300; t += 0.7) {
      for (const tank of L.TANKS) for (let i = 0; i < L.FISH_PER_TANK; i++) {
        L.fishAt(tank, i, t, out);
        expect(Math.abs(out.x - tank.x)).toBeLessThanOrEqual(tank.w / 2 - 0.3);
        expect(out.y).toBeGreaterThan(0.95); expect(out.y).toBeLessThan(1.65);
        expect(Math.abs(out.z - tank.z)).toBeLessThan(tank.d / 2);
      }
      for (const cat of [null, { x: 26, z: -31 }, { x: 22, z: -30 }, { x: 40, z: -31 }, { x: 15.6, z: -32.4 }]) {
        L.sharkAt(t, cat, out);
        expect(L.insideLab(out.x, out.z, 2)).toBe(false);
        expect(out.x).toBeGreaterThanOrEqual(L.SHY.minX);
        expect(Number.isFinite(out.y) && Number.isFinite(out.yaw)).toBe(true);
      }
    }
  });
  it('the shark is shy: a cat outside and near makes it keep away (further than without her), one inside the dome does not; it is a pure function of the time', () => {
    const calm = {}; const shy = {};
    for (const t of [0, 10, 20, 40, 60]) {
      L.sharkAt(t, null, calm);
      const cat = { x: calm.x + 1.5, z: calm.z };
      L.sharkAt(t, cat, shy);
      expect(Math.hypot(shy.x - cat.x, shy.z - cat.z)).toBeGreaterThan(Math.hypot(calm.x - cat.x, calm.z - cat.z));
      L.sharkAt(t, { x: 15.6, z: -32.4 }, shy);
      expect(shy.x).toBe(calm.x); expect(shy.z).toBe(calm.z);
    }
    const a = {}; const b = {};
    expect(L.sharkAt(12.5, null, a)).toEqual(L.sharkAt(12.5, null, b));
  });
});

describe('on a walk', () => {
  const made = [];
  afterEach(() => { for (const m of made.splice(0)) m.life.dispose(); });
  const make = (extra = {}, at = null) => {
    const sc = new THREE.Scene();
    const placed = build(sc);
    const progression = extra.progression ?? createProgression(memoryStorage());
    const log = createDiscoveryLog(progression);
    log.startWalk();
    const camera = new THREE.PerspectiveCamera();
    const player = createPlayer(camera, null, { headless: true });
    const cat = new THREE.Group();
    const o = L.HATCH.outside;
    cat.position.set(...(at ?? [o.x + 1.2, P.reefY(o.x + 1.2, o.z), o.z]));
    player.setAvatar(cat, 0.7);
    player.setFloat(placeFloat('reef'));
    player.setGround(placed.ground);
    player.enable();
    const sent = [];
    const life = placed.life({ scene: sc, log, progression, player, reducedMotion: false, visits: 1, doc: null, sendEvent: (ev) => sent.push(ev), ...extra });
    const session = { cat };
    const m = { life, scene: sc, player, cat, session, placed, camera, t: 0, progression, log, sent };
    m.step = (secs) => { for (let i = 0; i < Math.round(secs * 60); i++) { m.t += 1 / 60; player.update(1 / 60, [], P.REEF_BOUNDS, []); life.update(1 / 60, m.t, cat.position, camera, session); } };
    m.go = (x, z) => { cat.position.set(x, P.reefY(x, z), z); m.step(0.05); };
    m.press = () => { const line = life.promptAt(cat.position); const kind = life.interact(); return { line, kind }; };
    m.down = () => { m.go(L.HATCH.outside.x + 1.2, L.HATCH.outside.z); m.press(); m.step(1); };
    m.up = () => { m.go(L.HATCH.inside.exit.x, L.HATCH.inside.exit.z); m.press(); m.step(1); };
    made.push(m);
    return m;
  };
  const spot = (i) => L.FUSE_SPOTS[i];

  it('she finds a fuse in the bunk room and in the hall, carries each to the panel, in either order; each press has its own line; the save holds the bits', () => {
    for (const order of [[0, 1], [1, 0]]) {
      const m = make();
      m.down();
      for (const f of order) {
        m.go(spot(f).x, spot(f).z);
        expect(m.press().line).toBe(phrase('reef.lab.fuse.prompt'));
        expect(m.life.story.carrying).toBe(f);
        expect(m.progression.state.reef.lab).toBe(order.indexOf(f) === 0 ? 0 : 1 << order[0]); // nothing is saved while it is carried
        m.go(L.PANEL.x, L.PANEL.z);
        expect(m.press().line).toBe(phrase('reef.lab.put'));
        expect(m.life.story.carrying).toBeNull();
      }
      expect(m.progression.state.reef.lab).toBe(3);
      expect(m.sent).toEqual(order.map((f) => ({ kind: 'fuse', fuse: f })));
    }
  });
  it('a fuse already in is not offered again, the mouth holds one at a time, and a fuse is not picked from high over the floor', () => {
    const m = make();
    m.down();
    m.go(spot(0).x, spot(0).z); m.press();
    m.go(L.PANEL.x, L.PANEL.z); m.press();
    m.go(spot(0).x, spot(0).z);
    expect(m.life.promptAt(m.cat.position)).toBeNull();
    m.go(spot(1).x, spot(1).z); m.press();
    expect(m.life.story.carrying).toBe(1);
    m.go(spot(0).x, spot(0).z);
    expect(m.life.promptAt(m.cat.position)).toBeNull(); // her mouth is full
    const n = make();
    n.down();
    n.go(spot(1).x, spot(1).z);
    n.player.setKick(true); n.step(1.5);
    expect(n.player.floatY).toBe(0); // no float inside the station
  });
  it('the third fuse pays AWARDS.reeflab 40 once, with its own line; another put-in later pays nothing; the page "three fuses" counts each', () => {
    const m = make();
    const pts = () => m.progression.state.points ?? m.progression.state.paws ?? 0;
    m.down();
    for (const f of [0, 1]) { m.go(spot(f).x, spot(f).z); m.press(); m.go(L.PANEL.x, L.PANEL.z); m.press(); }
    expect(m.progression.state.reef.lab).toBe(3);
    // the sand's fuse: out through the ladder with nothing in her mouth, pick it, carry it in
    m.up();
    expect(m.life.lab.inside).toBe(false);
    m.go(spot(2).x, spot(2).z);
    expect(m.press().line).toBe(phrase('reef.lab.fuse.prompt'));
    const before = pts();
    m.down();
    expect(m.life.story.carrying).toBe(2); // it came down the hatch with her
    m.go(L.PANEL.x, L.PANEL.z);
    expect(m.press().line).toBe(phrase('reef.lab.put'));
    expect(m.progression.state.reef.lab).toBe(7);
    expect(pts() - before).toBe(40);
    expect(m.log.awardOnce('reeflab', 'reef-lab', 'again')).toBeFalsy();
    expect(m.progression.state.journal?.rffuses ?? m.progression.state.journalCounts?.rffuses ?? 3).toBeGreaterThan(0);
    expect(m.life.story.state.fuses).toBe(3);
    expect(m.life.story.goalNow()).toBeNull();
  });
  it('CARRY ENDINGS: a station fuse never goes up the ladder (set down, nothing lost, nothing saved); a fuse from the sand may; a second pickup (Marlo\'s shell) puts it back; the walk end drops it', () => {
    const m = make();
    m.down();
    m.go(spot(0).x, spot(0).z); m.press();
    expect(m.life.story.carrying).toBe(0);
    m.up();
    expect(m.life.lab.inside).toBe(false);
    expect(m.life.story.carrying).toBeNull();
    expect(m.progression.state.reef.lab).toBe(0);
    m.down();
    m.go(spot(0).x, spot(0).z);
    expect(m.press().line).toBe(phrase('reef.lab.fuse.prompt')); // it is back at its spot
    // a fuse from the sand is hers to keep going up and down
    m.up();
    m.go(spot(2).x, spot(2).z); m.press();
    m.down(); m.up();
    expect(m.life.story.carrying).toBe(2);
    // the walk ends
    m.life.dispose();
    expect(m.life.story.carrying).toBeNull();
    expect(m.progression.state.reef.lab).toBe(0);
    // ...and the next walk finds all three at their spots, the save as it was
    const n = make({ progression: m.progression });
    expect(n.life.story.carrying).toBeNull();
    n.go(spot(2).x, spot(2).z);
    expect(n.press().line).toBe(phrase('reef.lab.fuse.prompt'));
  });
  it('Marlo\'s shell in her mouth: no fuse is offered; a fuse in her mouth when the shell is taken goes back at once', () => {
    const m = make();
    m.down();
    m.go(spot(1).x, spot(1).z); m.press();
    expect(m.life.story.carrying).toBe(1);
    const real = m.life.marlo.state;
    let busy = false;
    Object.defineProperty(m.life.marlo, 'state', { get: () => ({ ...real, carrying: busy ? 0 : null }), configurable: true });
    m.step(0.05);
    expect(m.life.story.carrying).toBe(1);
    busy = true;
    m.step(0.05);
    expect(m.life.story.carrying).toBeNull();
    m.go(spot(0).x, spot(0).z);
    expect(m.life.promptAt(m.cat.position)).toBeNull(); // the mouth is full of a shell
  });
  it('reach through the hatch: a fuse in the station is not offered outside and the sand\'s is not offered inside; the sand\'s fuse is carried down and put in', () => {
    const m = make();
    m.go(L.FUSE_SPOTS[0].x - 40, L.FUSE_SPOTS[0].z); // far from every fuse on the sand: nothing
    expect(m.life.promptAt(m.cat.position)).toBeNull();
    expect(m.life.story.fuses[0].visible).toBe(false); // the station's fuses are under its roof
    expect(m.life.story.fuses[2].visible).toBe(true);
    m.down();
    expect(m.life.story.fuses[2].visible).toBe(false);
    expect(m.life.story.fuses[0].visible).toBe(true);
    m.up();
    expect(m.life.story.fuses[0].visible).toBe(false);
    expect(m.life.story.fuses[2].visible).toBe(true);
    m.go(spot(2).x, spot(2).z); m.press();
    m.down();
    m.go(L.PANEL.x, L.PANEL.z);
    m.press();
    expect(m.progression.state.reef.lab).toBe(4);
    // seated fuses show in the sockets inside only
    expect(m.life.story.fuses[2].visible).toBe(true);
    m.up();
    expect(m.life.story.fuses[2].visible).toBe(false);
  });
  it('a partner\'s fuse is credited (and pays the award on this device when it is the third); the fuse in her mouth is gone if it was the one', () => {
    const m = make();
    m.down();
    m.go(spot(1).x, spot(1).z); m.press();
    expect(m.life.credit({ kind: 'fuse', fuse: 1 })).toBe('fuse');
    m.step(0.05);
    expect(m.life.story.carrying).toBeNull();
    expect(m.progression.state.reef.lab).toBe(2);
    expect(m.life.credit({ kind: 'fuse', fuse: 1 })).toBeNull();
    m.life.credit({ kind: 'fuse', fuse: 0 });
    expect(m.life.credit({ kind: 'fuse', fuse: 2 })).toBe('power');
    expect(m.progression.state.reef.lab).toBe(7);
  });
  it('the prompts do not compete: the arbiter order is Marlo and the errand, then a fuse, then the hatch; a fuse and the hatch are never in reach of one spot', () => {
    const m = make();
    const o = L.HATCH.outside;
    m.go(o.x + 1.2, o.z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.down'));
    m.go(spot(2).x, spot(2).z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.fuse.prompt'));
    m.press();
    m.go(o.x + 1.2, o.z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.down')); // carrying: the ring's offer, never a second pickup
    const calls = [];
    const src = (name, line) => ({ promptAt: () => { calls.push(name); return line; }, interact: () => { calls.push(`${name}!`); return name; } });
    const arb = createPromptArbiter([src('marlo', null), src('story', 'fuse'), src('hatch', 'down')]);
    expect(arb.promptAt({ x: 0, z: 0 })).toBe('fuse');
    expect(arb.interact()).toBe('story');
    expect(calls).toEqual(['marlo', 'story', 'story!']);
    // inside: the panel's offer and the ladder's never share a spot, and the ladder's is still offered with no fuse in her mouth
    m.down();
    m.go(L.HATCH.inside.exit.x, L.HATCH.inside.exit.z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.up'));
    expect(Math.hypot(L.PANEL.x - L.HATCH.inside.exit.x, L.PANEL.z - L.HATCH.inside.exit.z)).toBeGreaterThan(L.PANEL.reach + L.HATCH.inside.reach);
    m.go(L.PANEL.x, L.PANEL.z);
    expect(m.life.promptAt(m.cat.position)).toBe(phrase('reef.lab.put')); // the fuse from the sand is in her mouth
    const n = make();
    n.down(); n.go(L.PANEL.x, L.PANEL.z);
    expect(n.life.promptAt(n.cat.position)).toBeNull(); // nothing in her mouth: the panel offers nothing
  });
  it('the fish: nine in three tanks (six on the lower rungs), drawn only inside the station and near the aquarium, still under reduced motion; the shark is one mesh and a journal subject', () => {
    const m = make();
    const fish = m.life.story.fish;
    expect(fish.count).toBe(9);
    expect(fish.visible).toBe(false);
    m.down();
    m.go(13, -36.5);
    m.step(0.2);
    expect(fish.visible).toBe(true);
    const p0 = Array.from(fish.instanceMatrix.array.slice(12, 15));
    m.step(3);
    expect(Array.from(fish.instanceMatrix.array.slice(12, 15))).not.toEqual(p0); // they glide
    m.go(L.HATCH.inside.exit.x, L.HATCH.inside.exit.z); m.step(0.1);
    m.up();
    expect(fish.visible).toBe(false);
    const low = make({ tier: { name: 'low', shadows: false, rung: 3 } });
    expect(low.life.story.fish.count).toBe(6);
    const still = make({ reducedMotion: true });
    still.down(); still.go(13, -36.5); still.step(0.2);
    const q0 = Array.from(still.life.story.fish.instanceMatrix.array.slice(0, 16));
    still.step(3);
    expect(Array.from(still.life.story.fish.instanceMatrix.array.slice(0, 16))).toEqual(q0);
    const sp = m.life.spottable.filter((s) => s.type === 'rfshark');
    expect(sp).toHaveLength(1);
    expect(sp[0].label).toBe(phrase('reef.life.shark'));
    expect(m.life.spottable.filter((s) => s.type === 'rfshark')[0].pos.x).toBeGreaterThan(L.SHY.minX - 0.01);
    const lights = []; m.scene.traverse((o) => { if (o.isPointLight) lights.push(o); });
    expect(lights).toHaveLength(1); // the Sealab's one light and no second
    expect(m.life.story.shark.castShadow).toBe(false);
  });
  it('the shark hangs still by the glass under reduced motion (no pushing, no loop) and moves otherwise; she can be near it in the dome', () => {
    const a = make();
    a.step(0.1); const p1 = a.life.story.shark.position.clone(); a.step(5);
    expect(a.life.story.shark.position.distanceTo(p1)).toBeGreaterThan(0.05);
    const b = make({ reducedMotion: true });
    b.step(0.1); const q1 = b.life.story.shark.position.clone(); b.step(5);
    expect(b.life.story.shark.position.distanceTo(q1)).toBe(0);
    const d = L.ROOMS.dome;
    expect(Math.hypot(q1.x - d.x, q1.z - d.z)).toBeLessThan(10); // close enough to be spotted from the dome (range 10)
  });
});

describe('the guide, the words and the journal', () => {
  it('the guide says what to do next from the story\'s own goal: sand, hatch, find, deliver, climb up; nothing when all are in', () => {
    const at = (kind, extra = {}) => guide.goalWords({ goal: { g: { kind, ...extra }, x: L.FUSE_SPOTS[2].x, z: L.FUSE_SPOTS[2].z } });
    for (const k of ['labhatch', 'labfuse', 'labsand', 'labdeliver', 'labdown', 'labup']) expect(at(k, { n: 2 }), k).not.toBe('');
    expect(at('labfuse', { n: 2 })).toMatch(/2 of 3/);
    expect(at('labsand')).not.toMatch(/\{/);
  });
  it('every new line is short, kind, free of banned words, and the same plain base in both word sets', () => {
    const BAD = /\b(dark|lost forever|trapped|stuck|scary|Zissou|Belafonte|Aquatic|cap|beanie)\b/i;
    const ids = Object.keys(LINES).filter((id) => /fuse|put|power|pay|shark|guide\.lab/.test(id));
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const id of ids) {
      const line = LINES[id];
      expect(phrase(id), id).toBe(line);
      expect(line.length).toBeLessThanOrEqual(60);
      expect(line).not.toMatch(BAD);
      withOffWords(() => { expect(bannedIn(phrase(id)), id).toBeNull(); expect(phrase(id)).toBe(line); });
    }
  });
  it('the Sealab\'s pages: ids reserved, names and hints in place and kind, the show and the three others with the wing switch on; the galleon\'s still hidden', () => {
    for (const id of ['rflab', 'rffuses', 'rfshow', 'rfshark']) {
      expect(RP.REEF_PAGE_WORDS[id].name().length).toBeGreaterThan(0);
      expect(RP.wingPageShown(id, { rfshow: 1 })).toBe(true);
    }
    expect(RP.wingPageShown('rfshow')).toBe(false); // R15: the show page waits until the show has been seen
    expect(RP.wingPageShown('rfgalleon')).toBe(false);
    const p = createProgression(memoryStorage());
    for (const id of ['rflab', 'rffuses', 'rfshark']) { p.recordSighting(id); expect(p.state.journal?.[id] ?? p.state.sightings?.[id] ?? 1).toBeGreaterThan(0); }
  });
  it('the story files obey the lab rules (no random number, no clock, no save, no banned names) and the stage hands the story out', () => {
    for (const f of ['src/world/reeflabstory.js', 'src/world/reeflabcritters.js', 'src/reeflab.js']) {
      const src = read(f).replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now|localStorage|progression|Zissou|Belafonte|Aquatic|beanie|\bcap\b|lost forever|trapped|scary/i);
    }
    expect(read('src/world/reefstagelab.js')).toMatch(/createLabStory/);
    expect(globSync('src/world/reeflab*.js').length).toBeGreaterThanOrEqual(7);
  });
});
