import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCloud } from '../src/cloud.js';
import { CODE_ALPHABET } from '../src/codealphabet.js';
import { createFakeHopServer } from './helpers/fakehop.js';

// Cat login M4: the hop client (src/game/hop.js) against a fake cloud that answers like the v11
// step 3 functions. Nothing here reaches a network.
const { createHost, createJoiner, normalizeHop, POLL_MS, HOP_LIFE_MS, JOIN_WAIT_MS } = await import('../src/game/hop.js');

const CAT = 'PLUM-OTTER-CROW-MAPLE';
const SECRET = 's'.repeat(32);
let server;
let cloud;
const flush = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };
const views = () => { const seen = []; return { seen, on: (v) => seen.push(v), last: () => seen[seen.length - 1] }; };

function host(over = {}) {
  const v = views();
  const h = createHost({ cloud, code: CAT, secret: SECRET, isOpen: () => true, onChange: v.on, ...over });
  return { h, v };
}
function joiner(over = {}) {
  const v = views();
  const j = createJoiner({ cloud, isOpen: () => true, onChange: v.on, ...over });
  return { j, v };
}

beforeEach(() => {
  vi.useFakeTimers();
  server = createFakeHopServer({ cats: { [CAT]: SECRET } });
  cloud = createCloud({ rpc: server.rpc, select: async () => [] });
});
afterEach(() => vi.useRealTimers());

describe('the hop code', () => {
  it('open returns six characters from the code alphabet', async () => {
    const { h, v } = host();
    await h.start();
    expect(v.last().phase).toBe('code');
    expect(v.last().hop).toMatch(new RegExp(`^[${CODE_ALPHABET}]{6}$`));
    h.cancel();
  });
  it('normalizes what is typed: case, spaces, dashes', () => {
    expect(normalizeHop(' k7m-2qx ')).toBe('K7M2QX');
    expect(normalizeHop('k7m2qx')).toBe('K7M2QX');
  });
  it('the whole way: join, the first device sees the question within one poll, Allow hands the cat over', async () => {
    const a = host();
    await a.h.start();
    const hop = a.v.last().hop;
    const b = joiner();
    await b.j.join(hop.toLowerCase());
    expect(b.v.last().phase).toBe('waiting');
    await flush(POLL_MS);
    expect(a.v.last().phase).toBe('asked');
    await a.h.allow();
    expect(a.v.last().phase).toBe('allowed');
    await flush(POLL_MS);
    expect(b.v.last()).toMatchObject({ phase: 'arrived', code: CAT });
    // the secret is not kept by the view
    expect(JSON.stringify(b.v.seen)).not.toContain(SECRET);
  });
  it('the cat code and secret are handed over exactly once: a second poll answers none', async () => {
    const a = host();
    await a.h.start();
    const b = joiner();
    await b.j.join(a.v.last().hop);
    await flush(POLL_MS);
    await a.h.allow();
    const ticket = server.calls.find((c) => c.name === 'hop_join') && [...server.hops.values()][0].ticket;
    const first = await cloud.hopPoll(ticket);
    expect(first).toMatchObject({ status: 'ok', code: CAT });
    expect(await cloud.hopPoll(ticket)).toMatchObject({ status: 'none' });
  });
  it('No clears it: the second device is told no and nothing is handed over', async () => {
    const a = host();
    await a.h.start();
    const b = joiner();
    await b.j.join(a.v.last().hop);
    await flush(POLL_MS);
    await a.h.deny();
    expect(a.v.last().phase).toBe('closed');
    await flush(POLL_MS);
    expect(b.v.last().phase).toBe('refused');
    expect(JSON.stringify(b.v.seen)).not.toContain(CAT);
  });
  it('a hop runs out after ten minutes', async () => {
    const a = host();
    await a.h.start();
    await flush(HOP_LIFE_MS + POLL_MS);
    expect(a.v.last().phase).toBe('expired');
    const hopCalls = server.calls.length;
    await flush(POLL_MS * 5);
    expect(server.calls.length).toBe(hopCalls); // and it stopped asking
    const b = joiner();
    await b.j.join('ABCDEF');
    expect(b.v.last().phase).toBe('wrong');
  });
  it('a wrong code says "That code didn\'t work" and is counted; a code of the wrong shape sends nothing', async () => {
    const b = joiner();
    await b.j.join('QQQQQQ');
    expect(b.v.last().phase).toBe('wrong');
    expect(server.calls.filter((c) => c.name === 'hop_join')).toHaveLength(1);
    await b.j.join('ab1');
    expect(b.v.last().phase).toBe('wrong');
    await b.j.join('');
    expect(server.calls.filter((c) => c.name === 'hop_join')).toHaveLength(1);
  });
  it('too many wrong tries answer busy', async () => {
    const b = joiner();
    for (let i = 0; i < 11; i++) await b.j.join('QQQQQQ');
    expect(b.v.last().phase).toBe('busy');
  });
  it('the joiner gives up after a minute of nobody saying OK', async () => {
    const a = host();
    await a.h.start();
    const b = joiner();
    await b.j.join(a.v.last().hop);
    await flush(JOIN_WAIT_MS + POLL_MS);
    expect(b.v.last().phase).toBe('timeout');
    const n = server.calls.filter((c) => c.name === 'hop_poll').length;
    await flush(POLL_MS * 4);
    expect(server.calls.filter((c) => c.name === 'hop_poll')).toHaveLength(n);
    a.h.cancel();
  });
  it('Cancel on the first device closes the hop on the server', async () => {
    const a = host();
    await a.h.start();
    const hop = a.v.last().hop;
    await a.h.cancel();
    expect(a.v.last().phase).toBe('cancelled');
    const b = joiner();
    await b.j.join(hop);
    expect(b.v.last().phase).toBe('wrong');
  });
});

describe('polling and requests', () => {
  it('no request is made until a tap: creating the host or joiner asks nothing', async () => {
    host(); joiner();
    await flush(POLL_MS * 5);
    expect(server.calls).toHaveLength(0);
  });
  it('the first device polls every three seconds, and stops when the sheet closes', async () => {
    let open = true;
    const a = host({ isOpen: () => open });
    await a.h.start();
    const base = server.calls.length;
    await flush(POLL_MS * 3);
    expect(server.calls.length).toBe(base + 3);
    open = false;
    await flush(POLL_MS * 3);
    expect(server.calls.length).toBe(base + 3);
    expect(a.v.last().phase).toBe('left');
  });
  it('the joiner stops polling when the sheet closes', async () => {
    let open = true;
    const a = host();
    await a.h.start();
    const b = joiner({ isOpen: () => open });
    await b.j.join(a.v.last().hop);
    open = false;
    await flush(POLL_MS * 4);
    expect(server.calls.filter((c) => c.name === 'hop_poll')).toHaveLength(0);
    expect(b.v.last().phase).toBe('left');
    a.h.cancel();
  });
});

describe('an unchanged server (v11 step 3 not run) and no network', () => {
  it('missing functions answer unavailable, asked once, and nothing throws', async () => {
    server = createFakeHopServer({ cats: { [CAT]: SECRET }, missing: true });
    cloud = createCloud({ rpc: server.rpc, select: async () => [] });
    const a = host();
    await a.h.start();
    expect(a.v.last()).toMatchObject({ phase: 'error', error: 'unavailable' });
    const b = joiner();
    await b.j.join('ABCDEF');
    expect(b.v.last()).toMatchObject({ phase: 'error', error: 'unavailable' });
    await b.j.join('ABCDEF');
    expect(server.calls.filter((c) => c.name === 'hop_join')).toHaveLength(1); // asked once, then not again
  });
  it('no network answers offline, and nothing throws', async () => {
    server = createFakeHopServer({ cats: { [CAT]: SECRET }, offline: true });
    cloud = createCloud({ rpc: server.rpc, select: async () => [] });
    const a = host();
    await a.h.start();
    expect(a.v.last()).toMatchObject({ phase: 'error', error: 'offline' });
    const b = joiner();
    await b.j.join('ABCDEF');
    expect(b.v.last()).toMatchObject({ phase: 'error', error: 'offline' });
  });
  it('a wrong secret is denied', async () => {
    const a = host({ secret: 'x'.repeat(32) });
    await a.h.start();
    expect(a.v.last()).toMatchObject({ phase: 'error', error: 'denied' });
  });
  it('rubbish from the server is "bad", never trusted', async () => {
    const odd = createCloud({ rpc: async () => ({ status: 'ok', hop: '<img onerror=x>', waiting: 1 }), select: async () => [] });
    const a = host({ cloud: odd });
    await a.h.start();
    expect(a.v.last()).toMatchObject({ phase: 'error', error: 'bad' });
    const odd2 = createCloud({ rpc: async () => ({ status: 'ok', code: '<b>x</b>', secret: 'z' }), select: async () => [] });
    const b = joiner({ cloud: { ...odd2, hopJoin: async () => ({ status: 'ok', ticket: 'T' }) } });
    await b.j.join('ABCDEF');
    await flush(POLL_MS);
    expect(b.v.last().phase).not.toBe('arrived');
  });
});
