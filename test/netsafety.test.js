import { describe, it, expect } from 'vitest';
import {
  createNet, createFakeHub, safeRemoteName, safeRemoteBreed, REMOTE_NAME_FALLBACK,
  createTokenBucket, capRoster, MAX_ROOM_CATS, RATE_LIMITS,
} from '../src/net.js';

// Child-safety pass on the room layer (net.js): what a stranger with the public
// key and a room code can put in front of a child. Names from other devices go
// through safeRemoteName; room messages are believed only from the capped
// roster and only at a sane rate.

// Things a stranger might put where a cat name goes.
const HOSTILE_NAMES = [
  '<img src=x onerror=alert(1)>',
  '<b>Robin</b>',
  'x'.repeat(500),
  'Kitty 😺',
  '‮niboR', // an RTL override
  'https://example.com',
  'www example com',
  '555-123-4567',
  'Call 5551234567',
  'shit head',
  'Penis Cat', // the wider list (goodNewPetName)
  '',
  null,
  undefined,
  42,
  { toString: () => 'Robin' },
];

describe('safeRemoteName', () => {
  it('shows an ordinary cat name as it is', () => {
    for (const n of ['Robin', 'Tiger Lily', 'Sir Pounce-a-lot', 'Mossstar']) expect(safeRemoteName(n)).toBe(n);
  });
  it('shows every hostile name as the fallback', () => {
    for (const n of HOSTILE_NAMES) expect(safeRemoteName(n)).toBe(REMOTE_NAME_FALLBACK);
    expect(REMOTE_NAME_FALLBACK).toBe('Mystery Cat');
  });
  it('takes its own fallback', () => {
    expect(safeRemoteName('<b>', 'Your friend')).toBe('Your friend');
  });
});

describe('safeRemoteBreed', () => {
  it('passes the game\'s own breeds and nothing else', () => {
    for (const b of ['tabby', 'siamese', 'mainecoon', 'hagrid', 'd2']) expect(safeRemoteBreed(b)).toBe(b);
    for (const b of ['<b>x</b>', 'toString', '__proto__', 'x'.repeat(500), 'https://x.y', null, 7]) {
      expect(safeRemoteBreed(b)).toBe('cat');
    }
  });
});

describe('createTokenBucket', () => {
  it('lets a burst through, then refills at its rate, per key', () => {
    let t = 0;
    const b = createTokenBucket({ burst: 3, perSec: 2 }, () => t);
    expect([b.take('a'), b.take('a'), b.take('a'), b.take('a')]).toEqual([true, true, true, false]);
    expect(b.take('b')).toBe(true); // another sender has her own bucket
    t = 0.5; // one token back
    expect([b.take('a'), b.take('a')]).toEqual([true, false]);
    t = 100; // never more than the burst
    expect([b.take('a'), b.take('a'), b.take('a'), b.take('a')]).toEqual([true, true, true, false]);
  });
  it('forget drops a key back to a full bucket', () => {
    const b = createTokenBucket({ burst: 1, perSec: 0 }, () => 0);
    expect(b.take('a')).toBe(true);
    expect(b.take('a')).toBe(false);
    b.forget('a');
    expect(b.take('a')).toBe(true);
  });
  it('the limits sit well above what the game sends', () => {
    expect(RATE_LIMITS.state.perSec).toBeGreaterThanOrEqual(2 * 8); // states are 8 Hz
    expect(RATE_LIMITS.event.burst).toBeGreaterThanOrEqual(20);
  });
});

describe('capRoster', () => {
  const p = (id) => ({ playerId: id, petName: 'Cat' });
  const ids = (list) => list.map((x) => x.playerId);
  it('keeps the MAX_ROOM_CATS smallest ids, whatever order presence came in', () => {
    const all = ['f', 'b', 'd', 'a', 'e', 'c'].map(p);
    const want = ['a', 'b', 'c', 'd'];
    expect(MAX_ROOM_CATS).toBe(4);
    for (let k = 0; k < 20; k++) {
      const shuffled = [...all].sort(() => Math.sin(k * 7 + all.length) - 0.3);
      expect(ids(capRoster(shuffled, 'a'))).toEqual(want);
      expect(ids(capRoster([...shuffled].reverse(), 'b'))).toEqual(want);
    }
  });
  it('my own cat is listed for me even outside the cap (nobody else counts it)', () => {
    expect(ids(capRoster(['a', 'b', 'c', 'd', 'e'].map(p), 'e'))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('drops entries with no usable id and repeat ids', () => {
    const out = capRoster([p('b'), null, { playerId: 5 }, { playerId: '' }, p('a'), { ...p('a'), petName: 'Other' }, 'x'], 'a');
    expect(ids(out)).toEqual(['a', 'b']);
  });
  it('two siblings: exactly what they had', () => {
    expect(ids(capRoster([p('bbb'), p('aaa')], 'bbb'))).toEqual(['aaa', 'bbb']);
  });
});

async function room(n, { now } = {}) {
  const hub = createFakeHub();
  const nets = [];
  for (let i = 0; i < n; i++) {
    const net = createNet(hub.transport(), now ? { now } : {});
    await net.join('AB23', { playerId: `p${i}`, petName: `Cat${'abcdefgh'[i]}`, breed: 'tabby', accessories: {} });
    nets.push(net);
  }
  return { hub, nets };
}
const state = (id) => ({ v: 1, id, pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });

describe('createNet: only the roster is believed', () => {
  it('a state, event or chat claiming an id not in the room is dropped', async () => {
    const { nets: [a, b] } = await room(2);
    const seen = [];
    b.onState((m) => seen.push(['state', m.id]));
    b.onEvent((m) => seen.push(['event', m.id]));
    b.onChat((m) => seen.push(['chat', m.id]));
    a.sendState(state('ghost-id'));
    a.sendEvent({ v: 1, id: 'ghost-id', type: 'collect', collectibleId: 'c1' });
    a.sendChat({ v: 1, id: 'ghost-id', phraseId: 'hi' });
    expect(seen).toEqual([]);
    a.sendState(state('p0'));
    a.sendEvent({ v: 1, id: 'p0', type: 'collect', collectibleId: 'c1' });
    expect(seen).toEqual([['state', 'p0'], ['event', 'p0']]);
  });
  it('a fifth cat and beyond is not in anyone\'s roster, and its messages are dropped by all', async () => {
    const { nets } = await room(6);
    for (const net of nets.slice(0, 4)) {
      let roster = null;
      net.onRoster((r) => { roster = r; });
      expect(roster.map((x) => x.playerId)).toEqual(['p0', 'p1', 'p2', 'p3']);
    }
    const heard = nets.slice(0, 4).map(() => []);
    nets.slice(0, 4).forEach((net, i) => net.onEvent((m) => heard[i].push(m.id)));
    nets[5].sendEvent({ v: 1, id: 'p5', type: 'collect', collectibleId: 'c1' });
    expect(heard).toEqual([[], [], [], []]);
    nets[3].sendEvent({ v: 1, id: 'p3', type: 'collect', collectibleId: 'c1' });
    expect(heard).toEqual([['p3'], ['p3'], ['p3'], []]);
  });
});

describe('createNet: per-sender rate limits', () => {
  it('a meow flood is cut at the meow bucket; other events still get through', async () => {
    let t = 0;
    const { nets: [a, b] } = await room(2, { now: () => t });
    const got = [];
    b.onEvent((m) => got.push(m.type));
    for (let i = 0; i < 200; i++) a.sendEvent({ v: 1, id: 'p0', type: 'meow' });
    expect(got.filter((x) => x === 'meow')).toHaveLength(RATE_LIMITS.meow.burst);
    a.sendEvent({ v: 1, id: 'p0', type: 'collect', collectibleId: 'c1' });
    expect(got.at(-1)).toBe('collect');
    t = 1; // a second later, the meow bucket has refilled a little
    for (let i = 0; i < 50; i++) a.sendEvent({ v: 1, id: 'p0', type: 'meow' });
    expect(got.filter((x) => x === 'meow')).toHaveLength(RATE_LIMITS.meow.burst + RATE_LIMITS.meow.perSec);
  });
  it('a legitimate co-walker never trips them: 8 Hz state, a meow a second and an event a second, for ten minutes', async () => {
    let t = 0;
    const { nets: [a, b] } = await room(2, { now: () => t });
    let states = 0;
    let events = 0;
    b.onState(() => { states += 1; });
    b.onEvent(() => { events += 1; });
    let sentStates = 0;
    let sentEvents = 0;
    for (let tick = 0; tick < 8 * 600; tick++) {
      t = tick / 8;
      a.sendState(state('p0')); sentStates += 1;
      if (tick % 8 === 0) {
        a.sendEvent({ v: 1, id: 'p0', type: 'meow' });
        a.sendEvent({ v: 1, id: 'p0', type: 'dig', treatId: 't' });
        sentEvents += 2;
      }
    }
    expect(states).toBe(sentStates);
    expect(events).toBe(sentEvents);
  });
  it('a child mashing Meow (6 a second for 3 s) keeps every meow', async () => {
    let t = 0;
    const { nets: [a, b] } = await room(2, { now: () => t });
    let meows = 0;
    b.onEvent(() => { meows += 1; });
    for (let i = 0; i < 18; i++) { t = i / 6; a.sendEvent({ v: 1, id: 'p0', type: 'meow' }); }
    expect(meows).toBe(18);
  });
  it('one sender\'s flood does not use up another sender\'s bucket', async () => {
    const { nets: [a, b, c] } = await room(3, { now: () => 0 });
    const from = [];
    c.onEvent((m) => from.push(m.id));
    for (let i = 0; i < 100; i++) a.sendEvent({ v: 1, id: 'p0', type: 'meow' });
    b.sendEvent({ v: 1, id: 'p1', type: 'meow' });
    expect(from.at(-1)).toBe('p1');
  });
});
