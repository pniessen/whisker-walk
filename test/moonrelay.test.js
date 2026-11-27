// The Moon, wave 2, milestone M3 (the relay arc, the Signal Tag) (docs/superpowers/plans/2026-11-27-crystal-moon-wave2.md, decisions 1, 2, 6, 7): the plan (every spot is free and reachable on foot),
// the pure rules (the gate at step 8, any order, never undone, hostile payloads), the live (offers through the arbiter's slot, the saves, the prize), the partner's 'relay-' events, the draw,
// reduced motion, the words in both sets and the page switches.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import * as P from '../src/world/moonplan.js';
import * as SS from '../src/world/moonstationplan.js';
import * as SL from '../src/world/moonsledplan.js';
import * as R from '../src/world/moonrelayplan.js';
import { build } from '../src/world/moon.js';
import { ST, HELD } from '../src/world/moonstages.js';
import { arrive, resetMoonStages } from '../src/world/moonlate.js';
import { createRelayLive } from '../src/world/moonrelaylive.js';
import { RELAY_LINES } from '../src/world/moonrelaywords.js';
import { bus } from '../src/events.js';
import { CAT_RADIUS } from '../src/player.js';
import { phrase } from '../src/clanphrases.js';
import { MOON_HINTS, MOON_PAGE_WORDS, WING_LIVE, wingPageShown } from '../src/moonpages.js';
import { JOURNAL_TYPES, createProgression, moonRelay } from '../src/progression.js';
import { AWARDS } from '../src/discoveries.js';
import { buildCat } from '../src/cat/model.js';
import { CATALOG } from '../src/progression.js';
import { withOffWords, bannedIn } from './helpers/offwords.js';

await import('../src/world/moonstagestation.js');
afterEach(() => { HELD.clear(); resetMoonStages(); P.MOON_CLEARS.length = 0; delete ST.station; });

// the walk's own collision flood (a 0.3 m grid from the spawn, as test/moonstation.test.js)
function floodFrom(colliders, from, step = 0.3) {
  const b = P.MOON_BOUNDS;
  const nx = Math.round((b.maxX - b.minX) / step) + 1;
  const nz = Math.round((b.maxZ - b.minZ) / step) + 1;
  const seen = new Uint8Array(nx * nz);
  const free = (x, z) => { for (const c of colliders) if (Math.abs(c.x - x) < c.r + 1 && Math.abs(c.z - z) < c.r + 1 && Math.hypot(x - c.x, z - c.z) < c.r + CAT_RADIUS) return false; return true; };
  const idx = (x, z) => Math.round((z - b.minZ) / step) * nx + Math.round((x - b.minX) / step);
  const q = [idx(from.x, from.z)];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const k = q[h];
    const i = k % nx; const j = (k / nx) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ii = i + di; const jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const kk = jj * nx + ii;
      if (!seen[kk] && free(b.minX + ii * step, b.minZ + jj * step)) { seen[kk] = 1; q.push(kk); }
    }
  }
  return { reaches: (x, z) => !!seen[idx(x, z)], count: q.length };
}
const at = (p, d = 0) => ({ x: p.x + d, y: 0, z: p.z });

describe('the plan', () => {
  it('three parts in the three places, the post at Earthrise Rock, all inside the bounds', () => {
    expect(R.PARTS.map((p) => p.key)).toEqual(['lane', 'station', 'rock']);
    expect(Math.hypot(R.PARTS[0].x - SL.LANE.xEast, R.PARTS[0].z - 46.7)).toBeLessThan(6); // the lane's far end
    expect(Math.hypot(R.PARTS[1].x - SS.STATION.x, R.PARTS[1].z - SS.STATION.z)).toBeLessThan(SS.STATION.ring); // inside the ring of walls
    expect(Math.hypot(R.PARTS[2].x - P.ROCK_LEDGES[0].x, R.PARTS[2].z - P.ROCK_LEDGES[0].z)).toBeLessThan(6); // the rock's foot
    expect(Math.hypot(R.POST.x - P.ROCK_LEDGES[0].x, R.POST.z - P.ROCK_LEDGES[0].z)).toBeLessThan(6);
    for (const p of [...R.PARTS, R.POST, R.WAKE]) expect(R.inBounds(p.x, p.z)).toBe(true);
  });
  it('every spot is clear of colliders, finds, mice, story points and the sled corridor, and she can walk to each (a 0.3 m flood)', () => {
    const cols = [...P.MOON_COLLIDERS, ...SS.STATION_COLLIDERS];
    const flood = floodFrom([...cols, R.POST_COLLIDER], { x: P.MOON_SPAWN.x, z: P.MOON_SPAWN.z });
    const others = [...P.PEBBLES, P.ECHO, P.CHEESE, ...P.JOB_POINTS, P.DEPOT, P.DOT_PARK, P.SHED, P.FLAG, P.PIT_ROCK, P.FAR_BEACON, P.ROVER_CELL, P.RIDGE_CELL, P.BINOCULARS, ...P.PLAIN_POSTS, ...P.MOON_MICE];
    for (const p of [...R.PARTS, R.POST]) {
      for (const c of cols) expect(Math.hypot(p.x - c.x, p.z - c.z), JSON.stringify(p)).toBeGreaterThan(c.r + 0.9);
      for (const o of others) expect(Math.hypot(p.x - o.x, p.z - o.z), JSON.stringify(p)).toBeGreaterThan(3);
      expect(SL.inLane(p.x, p.z, 0.4), JSON.stringify(p)).toBe(false);
    }
    for (const p of R.PARTS) expect(flood.reaches(p.x, p.z), p.key).toBe(true);
    // the post is solid: she can stand within its reach (a free spot on foot) and the console is reached the same way
    const near = (o, reach) => { for (let a = 0; a < 16; a++) { const x = o.x + Math.cos(a) * (reach - 0.4); const z = o.z + Math.sin(a) * (reach - 0.4); if (flood.reaches(x, z)) return true; } return false; };
    expect(near(R.POST, R.POST.reach)).toBe(true);
    expect(near(R.WAKE, R.WAKE.reach)).toBe(true);
    expect(flood.count).toBeGreaterThan(20000);
  });
  it('the parts keep their own reach (no two offers at once) and the post is out of the binocular stand\'s reach', () => {
    for (const a of R.PARTS) for (const b of R.PARTS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.reach + b.reach);
    expect(Math.hypot(R.POST.x - P.BINOCULARS.x, R.POST.z - P.BINOCULARS.z)).toBeGreaterThan(P.BINOCULARS.reach + R.POST.reach - 1);
    expect(Math.hypot(R.WAKE.x - SS.CONSOLE.x, R.WAKE.z - SS.CONSOLE.z)).toBe(0);
  });
});

describe('the rules (pure)', () => {
  const m = (step, relay = 0) => ({ step, relay });
  it('are closed before step 8, open at 8 and 9 (the saved cap), and step 7 changes nothing', () => {
    for (const step of [0, 4, 7]) {
      expect(R.isOpen(m(step))).toBe(false);
      for (const ev of [{ kind: 'part', part: 0 }, { kind: 'wake' }, { kind: 'answer' }, { kind: 'relay-part', part: 1 }, { kind: 'relay-answer' }]) {
        expect(R.apply(m(step, 7), ev).changed).toBe(false);
        expect(R.credit(m(step), ev).changed).toBe(false);
      }
    }
    expect(R.isOpen(m(8))).toBe(true);
    expect(R.isOpen(m(9))).toBe(true);
    expect(R.OPEN_STEP).toBe(8);
    expect(R.isOpen(null)).toBe(false);
    expect(R.isOpen({ step: '8' })).toBe(false);
  });
  it('three parts in any order, then the wake, then the answer; each step once; the answer is 31', () => {
    const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const o of orders) {
      let r = 0;
      expect(R.apply(m(8, r), { kind: 'wake' }).changed).toBe(false);
      o.forEach((id, i) => {
        const x = R.apply(m(8, r), { kind: 'part', part: id });
        expect(x.changed).toBe(true);
        expect(x.effect).toBe(i === 2 ? 'ready' : 'part');
        r = x.relay;
        expect(R.apply(m(8, r), { kind: 'part', part: id }).changed).toBe(false); // the same part twice: nothing
      });
      expect(r).toBe(7);
      expect(R.apply(m(8, r), { kind: 'answer' }).changed).toBe(false); // not before the station wakes
      const w = R.apply(m(8, r), { kind: 'wake' });
      expect([w.changed, w.effect, w.relay]).toEqual([true, 'wake', 15]);
      expect(R.apply(m(8, 15), { kind: 'wake' }).changed).toBe(false);
      const a = R.apply(m(8, 15), { kind: 'answer' });
      expect([a.changed, a.effect, a.relay]).toEqual([true, 'answer', 31]);
      expect(R.apply(m(8, 31), { kind: 'answer' }).changed).toBe(false);
      expect(R.hasTag(m(8, 31))).toBe(true);
    }
  });
  it('wake needs all three parts; two are not enough', () => {
    expect(R.apply(m(8, 3), { kind: 'wake' }).changed).toBe(false);
    expect(R.apply(m(8, 5), { kind: 'wake' }).changed).toBe(false);
  });
  it('the save\'s bits are read the way the sanitiser reads them (a wake implies the parts, an answer implies all)', () => {
    for (const b of [0, 1, 2, 3, 7, 8, 9, 15, 16, 17, 24, 31, 32, 63]) expect(R.bitsOf({ relay: b })).toBe(moonRelay(b & 31));
    expect(R.bitsOf({ relay: 8 })).toBe(15);
    expect(R.bitsOf({ relay: 16 })).toBe(31);
    for (const bad of [-1, 1.5, '3', null, NaN, undefined, {}, []]) expect(R.bitsOf({ relay: bad })).toBe(0);
  });
  it('hostile payloads change nothing', () => {
    const bad = [null, undefined, 7, 'relay-part', [], { kind: 'part' }, { kind: 'part', part: 3 }, { kind: 'part', part: -1 }, { kind: 'part', part: 1.5 }, { kind: 'part', part: '1' }, { kind: 'part', part: NaN },
      { kind: 'relay-part', part: 9 }, { kind: 'relay-rock' }, { kind: 'relay-' }, { kind: 'wakeup' }, { kind: { toString: () => 'wake' } }, { kind: 'answer ' }];
    for (const ev of bad) { expect(R.apply(m(8, 0), ev).changed, JSON.stringify(ev)).toBe(false); expect(R.credit(m(8, 0), ev).changed, JSON.stringify(ev)).toBe(false); }
  });
  it('a partner\'s wake or answer brings the earlier steps with it, never lowers anything, and is a no-op when already had', () => {
    expect(R.credit(m(8, 0), { kind: 'relay-wake' })).toMatchObject({ changed: true, relay: 15, effect: 'wake' });
    expect(R.credit(m(8, 1), { kind: 'relay-answer' })).toMatchObject({ changed: true, relay: 31, effect: 'answer' });
    expect(R.credit(m(8, 15), { kind: 'relay-wake' }).changed).toBe(false);
    expect(R.credit(m(8, 31), { kind: 'relay-wake' }).changed).toBe(false);
    expect(R.credit(m(8, 31), { kind: 'relay-answer' }).changed).toBe(false);
    expect(R.credit(m(8, 0), { kind: 'relay-part', part: 2 })).toMatchObject({ changed: true, relay: 4, effect: 'part' });
    expect(R.credit(m(8, 4), { kind: 'relay-part', part: 2 }).changed).toBe(false);
  });
});

// a stand-alone relay on a scene of its own
function rig({ step = 8, relay = 0, reducedMotion = false, tier = {}, log = null } = {}) {
  const scene = new THREE.Scene();
  const colliders = [...P.MOON_COLLIDERS];
  const spot = [];
  const sent = [];
  const audio = { chime: vi.fn() };
  const state = { moon: { step, cells: 7, stamp: 0, scope: 3, jump: {}, relay }, unlocked: { accessories: [] }, equipped: { collar: null } };
  const prog = { state, recordSighting: vi.fn(), addPoints: vi.fn() };
  const relayLive = createRelayLive({ scene, reducedMotion, tier, colliders, spot, audio, log, send: (e) => sent.push(e) });
  const session = { ground: { y: P.moonY } };
  const camera = new THREE.PerspectiveCamera();
  let t = 0;
  let cat = { x: 0, y: 0, z: 45 };
  const tick = (n = 1, dt = 1 / 30) => { for (let i = 0; i < n; i++) { t += dt; relayLive.frame(dt, t, cat, camera, session, prog); } };
  const go = (p, d = 0) => { cat = { x: p.x + d, y: 0, z: p.z }; tick(1); };
  const press = () => relayLive.interact();
  const notes = []; const off = bus.on('discovery', (e) => { if (e.type === 'greenhousenote') notes.push(e.label); });
  return { scene, colliders, spot, sent, audio, prog, state, relay: relayLive, tick, go, press, notes, off, cat: () => cat };
}

describe('the live: the gate', () => {
  it('step 7: nothing drawn, no offer beside any spot, no solid post, no photo subject, no beeps', () => {
    const r = rig({ step: 7 });
    r.tick(5);
    for (const p of R.PARTS) { r.go(p); expect(r.relay.promptAt(r.cat())).toBeNull(); expect(r.scene.getObjectByName(`moon:relaypart${p.id}`).visible).toBe(false); }
    r.go(R.POST); expect(r.relay.promptAt(r.cat())).toBeNull();
    r.go(R.WAKE); expect(r.relay.promptAt(r.cat())).toBeNull();
    expect(r.scene.getObjectByName('moon:relaypost').visible).toBe(false);
    expect(r.colliders.some((c) => c.x === R.POST.x && c.z === R.POST.z)).toBe(false);
    expect(r.spot).toHaveLength(0);
    expect(r.notes).toEqual([]);
    expect(r.prog.recordSighting).not.toHaveBeenCalled();
    expect(r.relay.credit({ kind: 'relay-part', part: 0 })).toBeNull();
    expect(r.state.moon.relay).toBe(0);
    r.relay.dispose(); r.off();
  });
  it('step 8: the beeps are heard once (journal page mnsignal), the parts and the post appear, the post is solid and a photo subject', () => {
    const r = rig({ step: 8 });
    r.go(R.PARTS[0]); r.tick(5);
    expect(r.notes.filter((n) => n === phrase('moon.ws.relay.beep'))).toHaveLength(1);
    expect(r.prog.recordSighting.mock.calls.filter((c) => c[0] === 'mnsignal')).toHaveLength(1);
    for (const p of R.PARTS) expect(r.scene.getObjectByName(`moon:relaypart${p.id}`).visible, p.key).toBe(p.id === 0 || p.id === 1); // (the rock's is beyond the draw distance)
    r.go(R.POST); r.tick(2);
    expect(r.scene.getObjectByName('moon:relaypost').visible).toBe(true);
    expect(r.colliders.some((c) => c.x === R.POST.x && c.z === R.POST.z)).toBe(true);
    expect(r.spot.map((s) => s.type)).toEqual(['mnrelay']);
    r.relay.dispose();
    expect(r.colliders.some((c) => c.x === R.POST.x && c.z === R.POST.z)).toBe(false);
    expect(r.spot).toHaveLength(0);
    r.off();
  });
  it('the saved step 9 is open too', () => {
    const r = rig({ step: 9 });
    r.go(R.PARTS[1]);
    expect(r.relay.promptAt(r.cat())).toBe('Pick up the relay part');
    r.relay.dispose(); r.off();
  });
});

describe('the live: the arc', () => {
  const full = (log = null) => {
    const r = rig({ log });
    // far from every spot, no offer
    r.go({ x: 0, z: 45 });
    expect(r.relay.promptAt(r.cat())).toBeNull();
    return r;
  };
  it('three parts in any order (the offer is beside each part only), each saved at once, sent to the room, and counted in the journal once a walk', () => {
    const r = full();
    for (const id of [2, 0, 1]) {
      const p = R.PARTS[id];
      r.go(p, R.PARTS[id].reach + 0.6);
      expect(r.relay.promptAt(r.cat())).toBeNull(); // out of reach
      r.go(p, 0.5);
      expect(r.relay.promptAt(r.cat())).toBe('Pick up the relay part');
      expect(r.press()).toBe('part');
      expect(r.state.moon.relay & (1 << id)).toBe(1 << id);
      r.tick(1);
      expect(r.scene.getObjectByName(`moon:relaypart${id}`).visible).toBe(false);
      expect(r.relay.promptAt(r.cat())).toBeNull(); // taken: no second offer
    }
    expect(r.state.moon.relay).toBe(7);
    expect(r.sent).toEqual([{ kind: 'relay-part', part: 2 }, { kind: 'relay-part', part: 0 }, { kind: 'relay-part', part: 1 }]);
    expect(r.prog.recordSighting.mock.calls.filter((c) => c[0] === 'mnrelay')).toHaveLength(1);
    expect(r.notes).toContain('A relay part! 1 of 3');
    expect(r.notes).toContain('A relay part! 2 of 3');
    expect(r.notes).toContain(phrase('moon.ws.relay.ready'));
    expect(r.prog.addPoints).toHaveBeenCalled();
    expect(r.state.moon).toMatchObject({ step: 8, cells: 7, stamp: 0, scope: 3 }); // (the other keys are untouched)
    r.relay.dispose(); r.off();
  });
  it('the console offers "Wake the station" only with all three, the post "Listen" only once awake; the answer pays once and gives the Signal Tag', () => {
    const award = vi.fn(() => 40);
    const r = full({ awardOnce: award });
    r.go(R.WAKE);
    expect(r.relay.promptAt(r.cat())).toBeNull();
    r.state.moon.relay = 3; r.go(R.WAKE);
    expect(r.relay.promptAt(r.cat())).toBeNull(); // two parts: not yet
    r.state.moon.relay = 7; r.go(R.WAKE);
    expect(r.relay.promptAt(r.cat())).toBe('Wake the station');
    r.go(R.POST); expect(r.relay.promptAt(r.cat())).toBeNull(); // (not awake yet)
    r.go(R.WAKE);
    r.relay.promptAt(r.cat());
    expect(r.press()).toBe('wake');
    expect(r.state.moon.relay).toBe(15);
    expect(r.sent.at(-1)).toEqual({ kind: 'relay-wake' });
    expect(r.audio.chime).toHaveBeenCalled();
    expect(r.relay.promptAt(r.cat())).toBeNull();
    r.go(R.POST, 1);
    expect(r.scene.getObjectByName('moon:relaypost').children.length).toBeGreaterThan(0);
    expect(r.relay.promptAt(r.cat())).toBe('Listen for the far station');
    expect(r.press()).toBe('answer');
    expect(r.state.moon.relay).toBe(31);
    expect(r.sent.at(-1)).toEqual({ kind: 'relay-answer' });
    expect(award).toHaveBeenCalledTimes(1);
    expect(award.mock.calls[0][0]).toBe('moonrelay');
    expect(AWARDS.moonrelay).toBe(40);
    expect(r.state.unlocked.accessories).toEqual(['signaltag']);
    expect(r.state.equipped.collar).toBe('signaltag');
    expect(r.relay.promptAt(r.cat())).toBeNull(); // done: nothing more to press
    expect(r.press()).toBeNull();
    r.relay.dispose(); r.off();
  });
  it('her own collar is kept (the tag is owned, not forced on); an answer already known pays nothing again', () => {
    const r = full();
    r.state.equipped.collar = 'moonbadge';
    r.state.moon.relay = 15;
    r.go(R.POST); r.relay.promptAt(r.cat()); r.press();
    expect(r.state.equipped.collar).toBe('moonbadge');
    expect(r.state.unlocked.accessories).toContain('signaltag');
    const n = r.sent.length;
    r.go(R.POST); r.relay.promptAt(r.cat());
    expect(r.press()).toBeNull();
    expect(r.sent.length).toBe(n);
    r.relay.dispose(); r.off();
  });
  it('a pressed offer that is no longer true (the partner did it first) does nothing and sends nothing', () => {
    const r = full();
    r.go(R.PARTS[0], 0.5);
    r.relay.promptAt(r.cat());
    r.state.moon.relay = 1; // (a partner's credit landed between the prompt and the press)
    expect(r.press()).toBeNull();
    expect(r.sent).toEqual([]);
    r.relay.dispose(); r.off();
  });
});

describe('the partner\'s events', () => {
  it('relay-part, relay-wake and relay-answer are credited on this save (after step 8); nothing is sent back', () => {
    const r = rig();
    r.tick(2);
    expect(r.relay.credit({ kind: 'relay-part', part: 1 })).toBe('part');
    expect(r.state.moon.relay).toBe(2);
    expect(r.relay.credit({ kind: 'relay-part', part: 1 })).toBeNull();
    expect(r.relay.credit({ kind: 'relay-wake' })).toBe('wake');
    expect(r.state.moon.relay).toBe(15);
    expect(r.relay.credit({ kind: 'relay-answer' })).toBe('answer');
    expect(r.state.moon.relay).toBe(31);
    expect(r.state.unlocked.accessories).toContain('signaltag');
    expect(r.sent).toEqual([]);
    for (const bad of [null, 5, { kind: 'relay-part', part: 7 }, { kind: 'rover-in' }, { kind: 'relay-zap' }]) expect(r.relay.credit(bad)).toBeNull();
    expect(r.state.moon.relay).toBe(31);
    r.relay.dispose(); r.off();
  });
  it('before step 8 the partner\'s events are dropped', () => {
    const r = rig({ step: 4 });
    for (const ev of [{ kind: 'relay-part', part: 0 }, { kind: 'relay-wake' }, { kind: 'relay-answer' }]) expect(r.relay.credit(ev)).toBeNull();
    expect(r.state.moon.relay).toBe(0);
    r.relay.dispose(); r.off();
  });
});

describe('the real life: the stage, the arbiter and the room', () => {
  const setup = ({ held = true, step = 8, relay = 0 } = {}) => {
    if (held) HELD.add('station');
    const scene = new THREE.Scene();
    const area = build(scene);
    const sent = [];
    const state = { moon: { step, cells: 7, stamp: 0, scope: 3, jump: {}, relay }, unlocked: { accessories: [] }, equipped: { collar: null } };
    const prog = { state, recordSighting: vi.fn(), addPoints: vi.fn() };
    const life = area.life({ scene, ground: area.ground, progression: prog, reducedMotion: true, tier: {}, sendEvent: (e) => sent.push(e) });
    const cam = new THREE.PerspectiveCamera();
    const cat = new THREE.Group();
    const session = { pounceTime: 0, perched: null, perchHold: null, hopLift: 0, idleTime: 0, fx: { burst() {} }, collectibleMeshes: new Map(), cat, fair: null, ground: area.ground };
    const where = { x: 0, z: 45 };
    let t = 0;
    const frame = (dt = 1 / 30) => { t += dt; life.update(dt, t, where, cam, session); };
    return { scene, area, life, frame, where, state, sent, prog };
  };
  it('absent: no slot and the partner\'s relay events are dropped (never handed to the base); in: the offer is the arbiter\'s and the press is sent to the room', () => {
    const { life, frame, where, state, sent, area } = setup();
    for (let i = 0; i < 10; i++) frame();
    expect(ST.station?.relay).toBeUndefined();
    where.x = R.PARTS[1].x; where.z = R.PARTS[1].z;
    expect(life.promptAt(where)).not.toBe('Pick up the relay part');
    expect(life.credit({ kind: 'relay-part', part: 0 })).toBeNull();
    expect(state.moon.relay).toBe(0);
    HELD.delete('station'); arrive('station'); frame(); frame();
    expect(typeof ST.station.relay.promptAt).toBe('function');
    expect(life.promptAt(where)).toBe('Pick up the relay part');
    expect(life.interact()).toBe('part');
    expect(state.moon.relay).toBe(2);
    expect(sent).toEqual([{ kind: 'relay-part', part: 1 }]);
    expect(life.credit({ kind: 'relay-part', part: 2 })).toBe('part'); // a 'relay-' event goes to the station, not the base
    expect(state.moon.relay).toBe(6);
    expect(area.colliders.some((c) => c.x === R.POST.x && c.z === R.POST.z)).toBe(true);
    life.dispose();
    expect(ST.station?.relay).toBeUndefined();
    expect(area.colliders.some((c) => c.x === R.POST.x && c.z === R.POST.z)).toBe(false);
    expect(life.spottable.filter((e) => e.type === 'mnrelay')).toHaveLength(0);
  });
  it('before step 8 the whole arc is quiet even with the stage in', () => {
    const { life, frame, where, state, scene } = setup({ held: false, step: 7 });
    for (let i = 0; i < 6; i++) frame();
    expect(scene.getObjectByName('moon:relayarc')).toBeTruthy();
    where.x = R.PARTS[1].x; where.z = R.PARTS[1].z;
    expect(life.promptAt(where)).not.toBe('Pick up the relay part');
    expect(life.credit({ kind: 'relay-wake' })).toBeNull();
    expect(state.moon.relay).toBe(0);
    life.dispose();
  });
});

describe('the draw and reduced motion', () => {
  it('the parts bob and turn, and hold still in reduced motion; each is one mesh and the post two (the lamp unlit)', () => {
    const y = (reduced) => { const r = rig({ reducedMotion: reduced }); r.go(R.PARTS[1], 3); const a = r.scene.getObjectByName('moon:relaypart1'); const ys = new Set(); const rot = new Set(); for (let i = 0; i < 40; i++) { r.tick(1); ys.add(a.position.y.toFixed(4)); rot.add(a.rotation.y.toFixed(4)); } const n = [ys.size, rot.size]; r.relay.dispose(); r.off(); return n; };
    expect(y(true)).toEqual([1, 1]);
    expect(y(false)[0]).toBeGreaterThan(5);
    expect(y(false)[1]).toBeGreaterThan(5);
    const r = rig();
    r.go(R.POST, 1);
    expect(r.scene.getObjectByName('moon:relaypart0').children).toHaveLength(1);
    expect(r.scene.getObjectByName('moon:relaypost').children).toHaveLength(2);
    r.state.moon.relay = 15; r.go(R.POST, 1);
    expect(r.scene.getObjectByName('moon:relaypost').children.find((m) => m.name.endsWith(':glow')).visible).toBe(true);
    r.relay.dispose(); r.off();
  });
  it('far from her the parts are not drawn; the lite rung casts no shadow', () => {
    const r = rig({ tier: { shadows: false } });
    r.go(R.PARTS[2], 0.4);
    expect(r.scene.getObjectByName('moon:relaypart0').visible).toBe(false); // (the lane's end is ~110 m away)
    expect(r.scene.getObjectByName('moon:relaypart2').visible).toBe(true);
    r.scene.getObjectByName('moon:relaypart2').traverse((o) => { if (o.isMesh) expect(o.castShadow).toBe(false); });
    r.relay.dispose(); r.off();
  });
});

describe('the save', () => {
  it('a relay value is clamped, the prize follows bit 4, and the key survives a round trip', () => {
    const store = {};
    const pr = createProgression({ getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } });
    pr.state.moon = { ...pr.state.moon, step: 8, relay: 31 };
    pr.addPoints(0);
    const pr2 = createProgression({ getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } });
    expect(pr2.state.moon.relay).toBe(31);
    expect(pr2.state.unlocked.accessories).toContain('signaltag');
  });
});

describe('the Signal Tag', () => {
  it('is a free collar prize owned from relay bit 4 (never bought, never before) and builds as a charmed collar with its own piece', () => {
    expect(CATALOG.accessories.signaltag).toMatchObject({ name: 'Signal Tag', slot: 'collar', price: 0, prize: true });
    const mem = (init = {}) => { const o = { ...init }; return { getItem: (k) => o[k] ?? null, setItem: (k, v) => { o[k] = v; }, removeItem: (k) => { delete o[k]; } }; };
    const pr = createProgression(mem());
    expect(pr.state.unlocked.accessories).not.toContain('signaltag');
    expect(pr.canBuy('accessories', 'signaltag')).toBe(false);
    const bare = buildCat('tabby', { collar: null });
    const worn = buildCat('tabby', { collar: 'signaltag' });
    const count = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(count(worn)).toBeGreaterThan(count(bare));
  });
});

describe('the words and the pages', () => {
  const ids = () => Object.keys(RELAY_LINES);
  const text = (id) => phrase(id, 2);
  it('every line reads the same in both word sets, with no banned or series word', () => {
    expect(ids().length).toBe(11);
    for (const id of ids()) {
      const on = text(id);
      expect(on).toMatch(/\S/);
      expect(bannedIn(on), id).toBeNull();
      withOffWords(() => { expect(text(id), id).toBe(on); expect(bannedIn(text(id)), id).toBeNull(); });
      for (const w of ['dark', 'trapped', 'stuck', 'scary', 'lost forever', 'collapse', 'timer', 'fail', 'clan']) expect(on.toLowerCase(), id).not.toContain(w);
    }
    expect(phrase('moon.ws.relay.got', 3)).toBe('A relay part! 3 of 3');
  });
  it('the signal and relay pages are live, named, hinted in both sets and in the save\'s list; mnstation, mnsled and mnlap stay live', async () => {
    await import('../src/world/moonstationwords.js');
    for (const id of ['mnstation', 'mnsignal', 'mnrelay', 'mnsled', 'mnlap']) {
      expect(WING_LIVE[id], id).toBe(true);
      expect(wingPageShown(id)).toBe(true);
      expect(JOURNAL_TYPES).toContain(id);
      expect(MOON_PAGE_WORDS[id].name()).toMatch(/\S/);
      expect(MOON_HINTS[id]).toMatch(/\S/);
      withOffWords(() => { expect(bannedIn(MOON_PAGE_WORDS[id].name())).toBeNull(); expect(bannedIn(MOON_HINTS[id])).toBeNull(); });
    }
  });
});
