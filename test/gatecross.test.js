import { describe, it, expect, vi } from 'vitest';
import { CATALOG, createProgression } from '../src/progression.js';
import { PLACE_WORDS } from '../src/clanwords.js';
import { words } from '../src/wordset.js';
import { withOffWords } from './helpers/offwords.js';
import { endById } from '../src/gateways.js';
import {
  gateStatus, gatePrompt, gateCardHtml, gateBuyHtml, gateMomentHtml, walkOnMove, pickOnCrossing,
  nextRoomSeed, decideWalkOn, roomWalksOn, stateIsHere,
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
  it('room capability and the state filter', () => {
    expect(roomWalksOn([{ walkOn: 1 }, { walkOn: 1 }])).toBe(true);
    expect(roomWalksOn([{ walkOn: 1 }, {}])).toBe(false);
    expect(roomWalksOn([])).toBe(false);
    expect(stateIsHere({ area: 'park' }, 'park')).toBe(true);
    expect(stateIsHere({ area: 'farm' }, 'park')).toBe(false);
    expect(stateIsHere({}, 'park')).toBe(true);
  });
});
