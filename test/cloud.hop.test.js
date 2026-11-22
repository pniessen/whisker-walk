import { describe, it, expect } from 'vitest';
import { createCloud } from '../src/cloud.js';
import { createFakeHopServer } from './helpers/fakehop.js';

// Cat login M4: the four hop calls on the cloud object. Fail soft, feature-detected, never throw.
const CAT = 'PLUM-OTTER-CROW-MAPLE';
const mk = (opts) => { const s = createFakeHopServer({ cats: { [CAT]: 's'.repeat(24) }, ...opts }); return { s, cloud: createCloud({ rpc: s.rpc, select: async () => [] }) }; };

describe('hop calls on the cloud object', () => {
  it('map to the four functions with the right argument names', async () => {
    const { s, cloud } = mk();
    const o = await cloud.hopOpen(CAT, 's'.repeat(24));
    expect(o.status).toBe('ok');
    const j = await cloud.hopJoin(o.hop);
    expect(j.status).toBe('ok');
    expect(await cloud.hopAnswer(CAT, 's'.repeat(24), true)).toBe('ok');
    expect((await cloud.hopPoll(j.ticket)).status).toBe('ok');
    expect(s.calls.map((c) => c.name)).toEqual(['hop_open', 'hop_join', 'hop_answer', 'hop_poll']);
    expect(Object.keys(s.calls[0].args)).toEqual(['p_code', 'p_secret']);
    expect(Object.keys(s.calls[1].args)).toEqual(['p_hop']);
    expect(Object.keys(s.calls[2].args)).toEqual(['p_code', 'p_secret', 'p_accept']);
    expect(Object.keys(s.calls[3].args)).toEqual(['p_ticket']);
  });
  it('a server without them answers unavailable, once', async () => {
    const { s, cloud } = mk({ missing: true });
    expect((await cloud.hopOpen(CAT, 'x')).status).toBe('unavailable');
    expect((await cloud.hopOpen(CAT, 'x')).status).toBe('unavailable');
    expect(s.calls).toHaveLength(1);
    expect(await cloud.hopAnswer(CAT, 'x', true)).toBe('unavailable');
    expect(await cloud.hopAnswer(CAT, 'x', false)).toBe('unavailable');
  });
  it('a failed call answers offline and never throws', async () => {
    const { cloud } = mk({ offline: true });
    expect((await cloud.hopOpen(CAT, 'x')).status).toBe('offline');
    expect((await cloud.hopJoin('ABCDEF')).status).toBe('offline');
    expect((await cloud.hopPoll('t')).status).toBe('offline');
    expect(await cloud.hopAnswer(CAT, 'x', true)).toBe('offline');
  });
  it('an answer that is not one of the known words is bad', async () => {
    const cloud = createCloud({ rpc: async () => ({ status: 'whatever' }), select: async () => [] });
    expect((await cloud.hopJoin('ABCDEF')).status).toBe('bad');
    const c2 = createCloud({ rpc: async () => 42, select: async () => [] });
    expect(await c2.hopAnswer(CAT, 'x', true)).toBe('bad');
  });
});
