import { describe, it, expect, vi } from 'vitest';

// Cat login M4: the same cat on two devices in one room. The presence key carries a short device
// tag, so two devices that hold one cat do not share a key; the roster still shows one cat.
const channels = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    channel: (name, opts) => {
      const ch = { name, opts, on() { return ch; }, subscribe(cb) { cb?.('SUBSCRIBED'); return ch; }, track: async () => 'ok', untrack: async () => 'ok', presenceState: () => ({}), send() {} };
      channels.push(ch);
      return ch;
    },
    removeChannel: async () => {},
  }),
}));

const { createNet, createFakeHub, createSupabaseTransport, presenceKey } = await import('../src/net.js');

const profile = (id, name = 'Mittens') => ({ playerId: id, petName: name, breed: 'tabby', accessories: {} });

describe('the presence key', () => {
  it('is the cat id and a short device tag, and the id the roster uses is still the cat id', () => {
    expect(presenceKey('abc', 'K7M2')).toBe('abc:K7M2');
  });
  it('two transports for the same cat in the same room get different presence keys', async () => {
    channels.length = 0;
    const a = createSupabaseTransport('https://x.test', 'k');
    const b = createSupabaseTransport('https://x.test', 'k');
    const noop = { onRoster() {}, onBroadcast() {} };
    await a.join('AB23', profile('cat-1'), noop).catch(() => {});
    await b.join('AB23', profile('cat-1'), noop).catch(() => {});
    const keys = channels.map((c) => c.opts.config.presence.key);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    for (const k of keys) expect(k).toMatch(/^cat-1:[A-Z0-9]{4}$/);
    // one transport keeps its tag if it joins again (a reconnect keeps its key)
    await a.join('CD45', profile('cat-1'), noop).catch(() => {});
    expect(channels[2].opts.config.presence.key).toBe(keys[0]);
  });
});

describe('one cat on two devices in one room', () => {
  it('shows one cat in the roster, and each device is told once that its cat is already here', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    const told = [];
    a.onSameCat(() => told.push('a'));
    b.onSameCat(() => told.push('b'));
    const rosters = [];
    await a.join('AB23', profile('cat-1'));
    a.onRoster((r) => rosters.push(r));
    expect(told).toEqual([]);
    await b.join('AB23', profile('cat-1'));
    expect(rosters.at(-1).map((p) => p.playerId)).toEqual(['cat-1']);
    expect(told.sort()).toEqual(['a', 'b']);
    // later roster changes do not repeat it while the same two stay
    await b.updateProfile(profile('cat-1', 'Mittens'));
    expect(told).toHaveLength(2);
  });
  it('another cat joining does not count as the same cat', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    const told = vi.fn();
    a.onSameCat(told);
    await a.join('AB23', profile('cat-1'));
    await b.join('AB23', profile('cat-2', 'Pickle'));
    expect(told).not.toHaveBeenCalled();
  });
  it('the other device\'s own messages are ignored (they carry this cat\'s id), so nothing is shown twice', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    await a.join('AB23', profile('cat-1'));
    await b.join('AB23', profile('cat-1'));
    const seen = [];
    a.onState((s) => seen.push(s));
    a.onChat((c) => seen.push(c));
    b.sendState({ v: 1, id: 'cat-1', pos: [1, 2], yaw: 0, pose: 'follow', speed: 1 });
    expect(seen).toEqual([]);
  });
  it('told again when the other device leaves and comes back', async () => {
    const hub = createFakeHub();
    const a = createNet(hub.transport());
    const b = createNet(hub.transport());
    const told = vi.fn();
    a.onSameCat(told);
    await a.join('AB23', profile('cat-1'));
    await b.join('AB23', profile('cat-1'));
    await b.leave();
    await b.join('AB23', profile('cat-1'));
    expect(told).toHaveBeenCalledTimes(2);
  });
});
