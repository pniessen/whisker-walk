import { describe, it, expect, vi } from 'vitest';
import { CATALOG, createProgression } from '../src/progression.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import { words } from '../src/wordset.js';
import { withOffWords } from './helpers/offwords.js';
import { phrase } from '../src/clanphrases.js';
import { endById } from '../src/gateways.js';
import {
  gateStatus, gatePrompt, gateCardHtml, gateBuyHtml, gateMomentHtml, walkOnMove, pickOnCrossing,
  nextRoomSeed, decideWalkOn, decideWalkOnAsk, decideWalkOnHave, decideGateCross, decideHostThere, roomWalksOn, stateIsHere,
  viaPlan,
} from '../src/gatecross.js';

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
const farm = endById('park-farm').end;
const save = (o = {}) => ({ edition: 'canon', area: 'park', points: 40, walks: { neighborhood: 4, park: 1 }, unlocked: { areas: ['neighborhood', 'park'] }, keptOffers: [], ...o });

describe('gateStatus and gatePrompt', () => {
  it('shut: says how many walks are left', () => {
    expect(gateStatus(farm, save(), CATALOG)).toMatchObject({ kind: 'shut', to: 'farm', line: 'Opens after 2 walks in City Park. 1 to go!' });
    expect(gateStatus(endById('docks-seaside').end, save({ area: 'docks', walks: { docks: 0 } }), CATALOG).line).toBe('Opens after 2 walks in the Old Docks. 2 to go!');
  });
  it('short of paws, then open to buy, then owned', () => {
    expect(gateStatus(farm, save({ walks: { park: 2 } }), CATALOG)).toMatchObject({ kind: 'short', need: 35, line: 'You need 35 more 🐾. Keep exploring!' });
    const buy = gateStatus(farm, save({ walks: { park: 2 }, points: 100 }), CATALOG);
    expect(buy).toMatchObject({ kind: 'buy', price: 75, name: 'Appletree Farm' });
    expect(gatePrompt(buy)).toEqual({ text: 'E — Open Appletree Farm for 75 🐾?', kind: 'gate-buy' });
    const go = gateStatus(farm, save({ unlocked: { areas: ['neighborhood', 'park', 'farm'] } }), CATALOG);
    expect(gatePrompt(go)).toEqual({ text: 'E — Head to Appletree Farm?', kind: 'gate' });
    expect(gatePrompt(go, { inRoom: true, isHost: false })).toEqual({ text: 'Appletree Farm is this way 🧭', kind: 'gate-info' });
    expect(gatePrompt(buy, { inRoom: true, isHost: false }).kind).toBe('gate-info');
    expect(gatePrompt(buy, { inRoom: true, isHost: true }).kind).toBe('gate-buy');
  });
  // Fix 7 (ruling R19): a guest's line at an open gate is the word tables'
  // ('gate.thisWay'), in both word sets.
  it("a guest's line at an open gate comes from the word tables, in both sets", () => {
    const st = save({ walks: { park: 2 }, points: 100 });
    const lines = () => {
      const buy = gateStatus(farm, st, CATALOG);
      const go = gateStatus(farm, { ...st, unlocked: { areas: ['neighborhood', 'park', 'farm'] } }, CATALOG);
      const town = gateStatus(endById('park-town').end, st, CATALOG);
      return [buy, go, town].map((status) => [gatePrompt(status, { inRoom: true, isHost: false }).text, phrase('gate.thisWay', status.name)]);
    };
    for (const [shown, table] of [...lines(), ...withOffWords(lines)]) expect(shown).toBe(table);
    expect(phrase('gate.thisWay', 'Appletree Farm')).toBe('Appletree Farm is this way 🧭');
  });
  // Rooftops step 4: the town's north signpost and the Rooftops' alley door.
  it("the town's Rooftops gate: shut, short, open to buy, owned; the alley door is always open", () => {
    const town = endById('town-roofs').end;
    const at = (o) => save({ area: 'neighborhood', points: 0, ...o });
    expect(gateStatus(town, at({ walks: { neighborhood: 4, fair: 1 } }), CATALOG))
      .toMatchObject({ kind: 'shut', to: 'roofs', line: 'Opens after 2 walks in the Fairground. 1 to go!' });
    expect(gateStatus(town, at({ walks: { fair: 2 }, points: 100 }), CATALOG)).toMatchObject({ kind: 'buy', to: 'roofs', price: 100, name: 'The Rooftops' });
    expect(gateStatus(town, at({ walks: { fair: 2 }, points: 60 }), CATALOG))
      .toMatchObject({ kind: 'short', need: 40, line: 'You need 40 more 🐾. Keep exploring!' });
    expect(gateStatus(town, at({ walks: { fair: 2 }, unlocked: { areas: ['neighborhood', 'park', 'fair', 'roofs'] } }), CATALOG))
      .toMatchObject({ kind: 'go', to: 'roofs', name: 'The Rooftops' });
    const door = endById('roofs-town').end;
    for (const st of [at({ area: 'roofs' }), at({ area: 'roofs', walks: {}, unlocked: { areas: ['neighborhood'] } }), at({ area: 'roofs', edition: 'legacy' })]) {
      expect(gateStatus(door, st, CATALOG)).toMatchObject({ kind: 'go', to: 'neighborhood' });
    }
  });
  it('the town gate names the town in the word set in use', () => {
    const back = gateStatus(endById('park-town').end, save(), CATALOG);
    expect(back).toMatchObject({ kind: 'go', name: PLACE_WORDS.town });
    withOffWords(() => expect(gateStatus(endById('park-town').end, save(), CATALOG).name).toBe(words().PLACE_WORDS.town));
  });
});

describe('the cards', () => {
  it('the card, the Get it? card and the moment', () => {
    const card = gateCardHtml({ name: 'Appletree Farm', extras: ['Pip comes too.'] });
    for (const s of ['Head to Appletree Farm?', 'You keep everything you found.', 'Pip comes too.', 'id="btn-cross-yes"', 'Yes, let\'s go!', 'Keep exploring']) expect(card).toContain(s);
    expect(card).not.toContain('Your trip ends here');
    const ask = gateBuyHtml({ name: 'Appletree Farm', price: 75, points: 100 });
    for (const s of ['Open Appletree Farm for 75 🐾?', 'You’ll have 25 🐾 left.', 'Yes, open it', 'Not now']) expect(ask).toContain(s);
    expect(ask.indexOf('confirm-card-no')).toBeLessThan(ask.indexOf('confirm-card-yes'));
    expect(gateMomentHtml({ name: 'The Fairground' })).toContain('<h1>Off to the Fairground!</h1>');
    expect(gateMomentHtml({ name: 'The Rooftops' })).toContain('<h1>Off to the Rooftops!</h1>');
    // Fix 9: "The" mid-sentence is lower case, as in every other gate line.
    // The shared Get it? card (spendAsk) keeps the name as given, as the
    // map's own card does; the gate's two lines lower it.
    const docks = gateBuyHtml({ name: 'The Old Docks', price: 40, points: 100 });
    expect(docks).toContain('Open the Old Docks for 40 🐾?');
    expect(docks).not.toContain('Open The');
    expect(gatePrompt({ kind: 'buy', to: 'fair', name: 'The Fairground', price: 60 }).text).toBe('E — Open the Fairground for 60 🐾?');
    expect(gatePrompt({ kind: 'buy', to: 'farm', name: 'Appletree Farm', price: 75 }).text).toBe('E — Open Appletree Farm for 75 🐾?');
    // a guest's line starts the sentence: "The" stays
    expect(gatePrompt({ kind: 'buy', to: 'fair', name: 'The Fairground', price: 60 }, { inRoom: true }).text).toBe('The Fairground is this way 🧭');
    expect(gateMomentHtml({ name: 'Appletree Farm', ledBy: 'Pip' })).toContain('Pip is leading the way to Appletree Farm! 🧭');
    expect(gateMomentHtml({ name: 'Appletree Farm', ledBy: '<b>' })).not.toContain('<b>');
  });
});

describe('a crossing never buys', () => {
  it('leaves a priced place alone and takes a free one only for a solo cat', () => {
    const p = createProgression(fakeStorage());
    p.replaceFromPayload({ version: 4, points: 100, walks: { neighborhood: 4, park: 2 }, unlocked: { areas: ['neighborhood', 'park'] } });
    expect(pickOnCrossing(p, CATALOG, 'farm')).toBe(false);
    expect(p.state.points).toBe(100);
    expect(p.state.unlocked.areas).not.toContain('farm');
    expect(walkOnMove(p.state, CATALOG, 'farm')).toBe('override');
    expect(walkOnMove(p.state, CATALOG, 'park')).toBe('set');
    p.replaceFromPayload({ version: 4, points: 100, walks: { neighborhood: 4 }, unlocked: { areas: ['neighborhood'] } });
    expect(walkOnMove(p.state, CATALOG, 'woods', { guest: true })).toBe('override');
    expect(pickOnCrossing(p, CATALOG, 'woods')).toBe('take');
    expect([p.state.points, p.state.area]).toEqual([100, 'woods']);
  });
});

describe('the room', () => {
  it('the next room seed is the same on every device and draws nothing', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = nextRoomSeed(12345, 'park-farm');
    expect(nextRoomSeed(12345, 'park-farm')).toBe(a);
    expect(nextRoomSeed(12345, 'park-fair')).not.toBe(a);
    expect(nextRoomSeed(12346, 'park-farm')).not.toBe(a);
    expect(Number.isInteger(a) && a >= 0 && a < 2 ** 32).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it('a guest follows only a well-formed walk-on from the host', () => {
    const ev = { v: 1, id: 'a', type: 'walk-on', from: 'park', via: 'park-farm', seed: nextRoomSeed(7, 'park-farm') };
    const ctx = { areaId: 'park', selfId: 'b', remoteIds: ['a'], catalog: CATALOG, roomSeed: 7 };
    expect(decideWalkOn(ev, ctx)).toEqual({ via: 'park-farm', to: 'farm', seed: ev.seed });
    for (const bad of [{ from: 'fair' }, { via: 'fair-park' }, { via: 'nope' }, { via: 7 }, { seed: 1 }, { type: 'border-cross' }, { id: 'z' }]) {
      expect(decideWalkOn({ ...ev, ...bad }, ctx), JSON.stringify(bad)).toBeNull();
    }
    expect(decideWalkOn(ev, { ...ctx, selfId: '0' })).toBeNull();
  });
  // Task 9: in a room, every device has the place before anyone moves.
  it("a guest answers only a well-formed ask from the host: the walk-on's checks, without the seed", () => {
    const ev = { v: 1, id: 'a', type: 'walk-on-ask', from: 'park', via: 'park-farm' };
    const ctx = { areaId: 'park', selfId: 'b', remoteIds: ['a'], catalog: CATALOG };
    expect(decideWalkOnAsk(ev, ctx)).toEqual({ via: 'park-farm', to: 'farm' });
    expect(decideWalkOnAsk({ ...ev, seed: 99 }, ctx)).toEqual({ via: 'park-farm', to: 'farm' }); // a seed is not read
    // Fix 6: a way this build does not know (a newer build's gate), or one to
    // a place it has no row for, is answered "no" at once: { to: null }
    expect(decideWalkOnAsk({ ...ev, via: 'nope' }, ctx)).toEqual({ via: 'nope', to: null });
    expect(decideWalkOnAsk({ ...ev, via: 'town-house' }, ctx)).toEqual({ via: 'town-house', to: null });
    const { farm: _farm, ...noFarm } = CATALOG.areas;
    expect(decideWalkOnAsk(ev, { ...ctx, catalog: { ...CATALOG, areas: noFarm } })).toEqual({ via: 'park-farm', to: null });
    // a way this build knows, but of another place, is stale: no answer
    for (const bad of [{ v: 2 }, { from: 'fair' }, { via: 'fair-park' }, { via: 'woods-moor-path' }, { via: 'town-roofs' }, { via: 7 }, { via: 'x'.repeat(65) }, { type: 'walk-on' }, { type: 'walk-on-have' }, { id: 'z' }]) {
      expect(decideWalkOnAsk({ ...ev, ...bad }, ctx), JSON.stringify(bad)).toBeNull();
    }
    expect(decideWalkOnAsk(ev, { ...ctx, selfId: '0' })).toBeNull(); // not from the host
    expect(decideWalkOnAsk(ev, { ...ctx, remoteIds: ['a', null] })).toBeNull(); // a member with no id
    expect(decideWalkOnAsk(null, ctx)).toBeNull();
    expect(decideWalkOnAsk(ev, { ...ctx, areaId: 'roofs' })).toBeNull(); // not this walk's place
    // the town's Rooftops gate and the alley door, each from its own place
    expect(decideWalkOnAsk({ ...ev, from: 'neighborhood', via: 'town-roofs' }, { ...ctx, areaId: 'neighborhood' })).toEqual({ via: 'town-roofs', to: 'roofs' });
    expect(decideWalkOnAsk({ ...ev, from: 'roofs', via: 'roofs-town' }, { ...ctx, areaId: 'roofs' })).toEqual({ via: 'roofs-town', to: 'neighborhood' });
  });
  it("the host goes only when it has the place and every friend still in the room said yes", () => {
    const have = (id, ok = true, o = {}) => ({ v: 1, id, type: 'walk-on-have', via: 'park-farm', ok, ...o });
    const ctx = { areaId: 'park', via: 'park-farm', selfId: 'a', remoteIds: ['b', 'c'], catalog: CATALOG, ready: true };
    expect(decideWalkOnHave([], ctx)).toEqual({ kind: 'wait', waiting: ['b', 'c'] });
    expect(decideWalkOnHave([have('b')], ctx)).toEqual({ kind: 'wait', waiting: ['c'] });
    expect(decideWalkOnHave([have('b'), have('c'), have('b')], ctx)).toEqual({ kind: 'go' });
    // its own place not here yet: everyone else's yes waits for it
    expect(decideWalkOnHave([have('b'), have('c')], { ...ctx, ready: false })).toEqual({ kind: 'wait', waiting: [] });
    // one friend who cannot: no, at once, whatever else came
    expect(decideWalkOnHave([have('b'), have('c', false)], ctx)).toEqual({ kind: 'no', id: 'c' });
    expect(decideWalkOnHave([have('c', false)], { ...ctx, ready: false })).toEqual({ kind: 'no', id: 'c' });
    // a friend who left is not waited for; nobody left at all: go
    expect(decideWalkOnHave([have('b')], { ...ctx, remoteIds: ['b'] })).toEqual({ kind: 'go' });
    expect(decideWalkOnHave([], { ...ctx, remoteIds: [] })).toEqual({ kind: 'go' });
    // what does not count: another gate, not a yes or no, not an answer, not v1, a stranger
    for (const bad of [{ via: 'park-fair' }, { ok: 'yes' }, { ok: 1 }, { type: 'walk-on-ask' }, { v: 2 }]) {
      expect(decideWalkOnHave([have('b', true, bad), have('c')], ctx), JSON.stringify(bad)).toEqual({ kind: 'wait', waiting: ['b'] });
      expect(decideWalkOnHave([have('b', false, bad), have('c')], ctx), JSON.stringify(bad)).toEqual({ kind: 'wait', waiting: ['b'] });
    }
    expect(decideWalkOnHave([have('z', false), have('b'), have('c')], ctx)).toEqual({ kind: 'go' });
    expect(decideWalkOnHave([null, 7, have('b'), have('c')], ctx)).toEqual({ kind: 'go' });
    // a device that is not the room's host counts nothing
    expect(decideWalkOnHave([have('0'), have('c')], { ...ctx, remoteIds: ['0', 'c'] })).toEqual({ kind: 'wait', waiting: ['0', 'c'] });
    // a gate this place does not have counts nothing
    expect(decideWalkOnHave([have('b', true, { via: 'fair-park' }), have('c', true, { via: 'fair-park' })], { ...ctx, via: 'fair-park' })).toEqual({ kind: 'wait', waiting: ['b', 'c'] });
  });
  it("a border-cross through a gate, from the host, is followed the way a post's is (a room with an older build)", () => {
    const ev = { v: 1, id: 'a', type: 'border-cross', from: 'park', to: 'farm' };
    const ctx = { areaId: 'park', selfId: 'b', remoteIds: ['a'], catalog: CATALOG };
    expect(decideGateCross(ev, ctx)).toEqual({ to: 'farm' });
    for (const bad of [{ from: 'fair' }, { to: 'woods' }, { to: 7 }, { type: 'walk-on' }, { id: 'z' }]) {
      expect(decideGateCross({ ...ev, ...bad }, ctx), JSON.stringify(bad)).toBeNull();
    }
    expect(decideGateCross(ev, { ...ctx, selfId: '0' })).toBeNull();
  });
  it("R15: the host's own state, tagged with the place, from the room's host", () => {
    const st = { v: 1, id: 'a', area: 'farm' };
    const ctx = { hostId: 'a', to: 'farm', selfId: 'b', remoteIds: ['a'] };
    expect(decideHostThere(st, ctx)).toEqual({ to: 'farm' });
    for (const bad of [{ area: 'park' }, { area: undefined }, { id: 'z' }]) {
      expect(decideHostThere({ ...st, ...bad }, ctx), JSON.stringify(bad)).toBeNull();
    }
    expect(decideHostThere(st, { ...ctx, remoteIds: [] })).toBeNull(); // left the room
    expect(decideHostThere(st, { ...ctx, remoteIds: ['0', 'a'] })).toBeNull(); // no longer the host
    expect(decideHostThere(st, { ...ctx, to: undefined })).toBeNull();
    expect(decideHostThere(null, ctx)).toBeNull();
  });
  it('room capability and the state filter', () => {
    expect(roomWalksOn([{ walkOn: 1 }, { walkOn: 1 }])).toBe(true);
    expect(roomWalksOn([{ walkOn: 1 }, {}])).toBe(false);
    expect(roomWalksOn([])).toBe(false);
    expect(stateIsHere({ area: 'park' }, 'park')).toBe(true);
    expect(stateIsHere({ area: 'farm' }, 'park')).toBe(false);
    expect(stateIsHere({}, 'park')).toBe(true);
  });
});

// Task 10: a border post walks straight on too, through the same plan and
// the same room checks as a gate.
describe('border posts walk on', () => {
  it("a post's plan: its two places, and she arrives ARRIVE_IN m inside the twin post, facing in", () => {
    const plan = viaPlan('woods-moor-path');
    expect(plan).toEqual({ via: 'woods-moor-path', from: 'woods', to: 'moor', arrive: { x: 43.4, z: expect.any(Number), yaw: 0 } });
    // moor-woods-path stands on the Moor's south edge at (43.4, 47.5)
    expect(plan.arrive.z).toBeCloseTo(43.9, 9);
    expect(viaPlan('moor-woods-path').arrive).toMatchObject({ x: 43.4, yaw: Math.PI });
    expect(viaPlan('moor-woods-path').arrive.z).toBeCloseTo(-43.9, 9);
    expect(viaPlan('woods-town-short').arrive).toMatchObject({ z: 3.6, yaw: -Math.PI / 2 });
    expect(viaPlan('woods-town-short').arrive.x).toBeCloseTo(-48.4, 9);
  });
  it('a one-way post, or one with no post back, arrives at the spawn', () => {
    expect(viaPlan('town-moor')).toEqual({ via: 'town-moor', from: 'neighborhood', to: 'moor', arrive: null });
    expect(viaPlan('gorge-town')).toEqual({ via: 'gorge-town', from: 'gorge', to: 'neighborhood', arrive: null });
    expect(viaPlan('nope')).toBeNull();
    expect(viaPlan('__proto__')).toBeNull();
    expect(viaPlan(7)).toBeNull();
  });
  it("a guest follows a host's walk-on through a post of this place, and answers its ask", () => {
    const ev = { v: 1, id: 'a', type: 'walk-on', from: 'woods', via: 'woods-moor-path', seed: nextRoomSeed(7, 'woods-moor-path') };
    const ctx = { areaId: 'woods', selfId: 'b', remoteIds: ['a'], catalog: CATALOG, roomSeed: 7 };
    expect(decideWalkOn(ev, ctx)).toEqual({ via: 'woods-moor-path', to: 'moor', seed: ev.seed });
    for (const bad of [{ from: 'moor' }, { via: 'moor-woods-path' }, { seed: nextRoomSeed(7, 'woods-moor-river') }, { id: 'z' }]) {
      expect(decideWalkOn({ ...ev, ...bad }, ctx), JSON.stringify(bad)).toBeNull();
    }
    // a post to a place this build has no catalog row for is not a way
    const noMoor = { ...CATALOG, areas: Object.fromEntries(Object.entries(CATALOG.areas).filter(([k]) => k !== 'moor')) };
    expect(decideWalkOn(ev, { ...ctx, catalog: noMoor })).toBeNull();
    const ask = { v: 1, id: 'a', type: 'walk-on-ask', from: 'woods', via: 'woods-moor-path' };
    expect(decideWalkOnAsk(ask, ctx)).toEqual({ via: 'woods-moor-path', to: 'moor' });
    expect(decideWalkOnAsk({ ...ask, via: 'moor-woods-path' }, ctx)).toBeNull();
    const have = (id) => ({ v: 1, id, type: 'walk-on-have', via: 'woods-moor-path', ok: true });
    const hctx = { areaId: 'woods', via: 'woods-moor-path', selfId: 'a', remoteIds: ['b'], catalog: CATALOG, ready: true };
    expect(decideWalkOnHave([have('b')], hctx)).toEqual({ kind: 'go' });
    expect(decideWalkOnHave([have('b')], { ...hctx, areaId: 'moor' })).toEqual({ kind: 'wait', waiting: ['b'] });
  });
});
