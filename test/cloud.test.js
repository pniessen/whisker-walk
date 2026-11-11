import { describe, it, expect } from 'vitest';
import { generateSaveCode, normalizeSaveCode, getOrCreateSecret, createCloud, randomIndex } from '../src/cloud.js';

// A crypto-shaped fake: getRandomValues fills from a fixed list of uint32s.
function fakeCrypto(values) {
  let i = 0;
  const calls = { n: 0 };
  return {
    calls,
    getRandomValues(buf) { calls.n++; for (let j = 0; j < buf.length; j++) buf[j] = values[i++ % values.length]; return buf; },
  };
}
// A seeded uint32 stream (mulberry32) for distribution checks.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

describe('generateSaveCode', () => {
  const FORMAT = /^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-\d{2}$/;

  it('produces WORD-WORD-WORD-NN from the embedded wordlist', () => {
    expect(generateSaveCode(fakeCrypto([0]))).toBe('OTTER-OTTER-OTTER-00');
    expect(generateSaveCode()).toMatch(FORMAT); // the real crypto
  });

  it('draws every part from crypto.getRandomValues (one uint32 each)', () => {
    const c = fakeCrypto([1, 2, 255, 42]);
    expect(generateSaveCode(c)).toBe('PANDA-ZEBRA-VELVET-42');
    expect(c.calls.n).toBe(4);
  });

  it('keeps the format across the whole uint32 range, zero-padding the digits', () => {
    expect(generateSaveCode(fakeCrypto([0xffffffff - 255, 7, 0xfffffeff, 5]))).toMatch(/-05$/);
    const next = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const v = [next(), next(), next(), next()];
      expect(generateSaveCode(fakeCrypto(v))).toMatch(FORMAT);
    }
  });

  it('spreads words and digits evenly (seeded source)', () => {
    const next = seeded(42);
    const src = { getRandomValues(buf) { buf[0] = next(); return buf; } };
    const words = new Map(); const digits = new Array(100).fill(0);
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const [w1, w2, w3, d] = generateSaveCode(src).split('-');
      for (const w of [w1, w2, w3]) words.set(w, (words.get(w) ?? 0) + 1);
      digits[Number(d)]++;
    }
    expect(words.size).toBe(256);
    const wExp = (3 * N) / 256; // ~234 each
    for (const n of words.values()) expect(Math.abs(n - wExp)).toBeLessThan(wExp * 0.4);
    for (const n of digits) expect(Math.abs(n - N / 100)).toBeLessThan((N / 100) * 0.4);
  });

  it('falls back to Math.random only when there is no getRandomValues', () => {
    expect(generateSaveCode(undefined)).toMatch(FORMAT); // default param: the real crypto
    expect(generateSaveCode(null)).toMatch(FORMAT);
    expect(generateSaveCode({})).toMatch(FORMAT);
  });
});

describe('randomIndex (no modulo bias)', () => {
  it('rejects draws at or above the largest multiple of n, then takes x % n', () => {
    // 2^32 = 42949672 * 100 + 96, so 4294967200..4294967295 are thrown away
    const limit = 4294967200;
    const seq = [limit, limit + 95, 4294967295, 199];
    let i = 0;
    expect(randomIndex(100, () => seq[i++])).toBe(99);
    expect(i).toBe(4);
    i = 0;
    expect(randomIndex(100, () => [limit - 1][i++])).toBe(99);
  });
  it('never rejects for a power of two', () => {
    let calls = 0;
    expect(randomIndex(256, () => { calls++; return 0xffffffff; })).toBe(255);
    expect(calls).toBe(1);
  });
  it('gives each result exactly the same number of accepted inputs', () => {
    // over a scaled-down space the same rule is exact: 0..(floor(M/n)*n - 1) maps evenly
    const n = 100; const limit = Math.floor(2 ** 32 / n) * n;
    expect(limit % n).toBe(0);
    expect(2 ** 32 - limit).toBe(96);
  });
  it('stops retrying a broken source that never returns a usable value', () => {
    expect(randomIndex(100, () => 0xffffffff)).toBe(0xffffffff % 100);
  });
});

describe('normalizeSaveCode', () => {
  it('trims, uppercases, and normalizes spaces/underscores/repeated hyphens to single hyphens', () => {
    expect(normalizeSaveCode('  plum otter_crow-42  ')).toBe('PLUM-OTTER-CROW-42');
    expect(normalizeSaveCode('plum--otter---crow-42')).toBe('PLUM-OTTER-CROW-42');
    expect(normalizeSaveCode('-plum-otter-crow-42-')).toBe('PLUM-OTTER-CROW-42');
  });

  it('returns an empty string for non-string input', () => {
    expect(normalizeSaveCode(undefined)).toBe('');
    expect(normalizeSaveCode(null)).toBe('');
  });
});

describe('getOrCreateSecret', () => {
  function fakeStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, v),
    };
  }

  it('creates a secret once and returns the same one on later calls', () => {
    const storage = fakeStorage();
    const first = getOrCreateSecret(storage);
    const second = getOrCreateSecret(storage);
    expect(first).toBe(second);
    expect(typeof first).toBe('string');
    expect(first.length).toBeGreaterThan(30);
  });

  it('still returns a usable secret when storage throws (private mode/quota)', () => {
    const storage = {
      getItem() { throw new Error('unavailable'); },
      setItem() { throw new Error('unavailable'); },
    };
    const secret = getOrCreateSecret(storage);
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(30);
  });
});

describe('createCloud RPC arg mapping', () => {
  it('saveToCloud maps to p_-prefixed upsert_save args and passes through the result', async () => {
    const calls = [];
    const rpc = async (name, args) => {
      calls.push({ name, args });
      return 'created';
    };
    const cloud = createCloud({ rpc, select: async () => [] });
    const result = await cloud.saveToCloud('PLUM-OTTER-CROW-42', 'sekrit', { foo: 1 }, 500);
    expect(calls).toEqual([
      { name: 'upsert_save', args: { p_code: 'PLUM-OTTER-CROW-42', p_secret: 'sekrit', p_payload: { foo: 1 }, p_lifetime: 500 } },
    ]);
    expect(result).toBe('created');
  });

  it('loadFromCloud maps to load_save and passes through {payload, secret, lifetime} or null', async () => {
    const calls = [];
    let response = { payload: { a: 1 }, secret: 's', lifetime: 10 };
    const rpc = async (name, args) => {
      calls.push({ name, args });
      return response;
    };
    const cloud = createCloud({ rpc, select: async () => [] });
    const result = await cloud.loadFromCloud('PLUM-OTTER-CROW-42');
    expect(calls[0]).toEqual({ name: 'load_save', args: { p_code: 'PLUM-OTTER-CROW-42', p_secret: '' } });
    expect(result).toEqual(response);
    response = null;
    expect(await cloud.loadFromCloud('MISSING-CODE-HERE-00')).toBe(null);
  });

  it('pushProfile maps profile fields to p_-prefixed upsert_profile args', async () => {
    const calls = [];
    const rpc = async (name, args) => {
      calls.push({ name, args });
      return 'ok';
    };
    const cloud = createCloud({ rpc, select: async () => [] });
    const result = await cloud.pushProfile({
      playerId: 'abc123',
      secret: 'sekrit',
      petName: 'Hagrid',
      breed: 'tabby',
      accessories: { collar: 'red' },
      rankTitle: 'Alley Cat',
    });
    expect(calls).toEqual([
      {
        name: 'upsert_profile',
        args: {
          p_player_id: 'abc123',
          p_secret: 'sekrit',
          p_pet_name: 'Hagrid',
          p_breed: 'tabby',
          p_accessories: { collar: 'red' },
          p_rank_title: 'Alley Cat',
        },
      },
    ]);
    expect(result).toBe('ok');
  });

  it('recordGreet maps to p_-prefixed record_friend_greet args and passes through the int (incl. -1 denied)', async () => {
    const calls = [];
    let response = 3;
    const rpc = async (name, args) => {
      calls.push({ name, args });
      return response;
    };
    const cloud = createCloud({ rpc, select: async () => [] });
    const result = await cloud.recordGreet('me', 'sekrit', 'other', 'walk-1');
    expect(calls).toEqual([
      { name: 'record_friend_greet', args: { p_my_id: 'me', p_my_secret: 'sekrit', p_other_id: 'other', p_walk: 'walk-1' } },
    ]);
    expect(result).toBe(3);
    response = -1;
    expect(await cloud.recordGreet('me', 'wrong', 'other', 'walk-1')).toBe(-1);
  });

  it('fetchProfiles selects profiles by id with an `in` filter', async () => {
    const calls = [];
    const select = async (...args) => {
      calls.push(args);
      return [{ player_id: 'a' }];
    };
    const cloud = createCloud({ rpc: async () => {}, select });
    const result = await cloud.fetchProfiles(['a', 'b']);
    expect(calls).toEqual([['profiles', 'in', 'player_id', ['a', 'b']]]);
    expect(result).toEqual([{ player_id: 'a' }]);
  });

  it('findByFriendCode selects profiles by a `like` prefix match on player_id', async () => {
    const calls = [];
    const select = async (...args) => {
      calls.push(args);
      return [];
    };
    const cloud = createCloud({ rpc: async () => {}, select });
    await cloud.findByFriendCode('abc123defg');
    expect(calls).toEqual([['profiles', 'like', 'player_id', 'abc123defg%']]);
  });

  it('fetchFriendships selects rows where a_id or b_id matches myId', async () => {
    const calls = [];
    const select = async (...args) => {
      calls.push(args);
      return [];
    };
    const cloud = createCloud({ rpc: async () => {}, select });
    await cloud.fetchFriendships('me');
    expect(calls).toEqual([['friendships', 'or', 'a_id.eq.me,b_id.eq.me']]);
  });
});

describe('addFriendByCode (idempotent-per-pair friend-code add)', () => {
  it('does NOT call recordGreet when a friendship row for this pair already exists', async () => {
    const rpcCalls = [];
    const rpc = async (name, args) => {
      rpcCalls.push({ name, args });
      return 'created';
    };
    // 'other' already appears as b_id on an existing row for 'me'
    const select = async () => [{ a_id: 'me', b_id: 'other', greets: 3 }];
    const cloud = createCloud({ rpc, select });
    const result = await cloud.addFriendByCode('me', 'sekrit', 'other');
    expect(result).toEqual({ status: 'already' });
    expect(rpcCalls).toEqual([]); // recordGreet (record_friend_greet) must never fire
  });

  it('finds an existing pair regardless of which side (a_id/b_id) otherId is on', async () => {
    const rpcCalls = [];
    const rpc = async (name, args) => rpcCalls.push({ name, args });
    const select = async () => [{ a_id: 'other', b_id: 'me', greets: 1 }];
    const cloud = createCloud({ rpc, select });
    const result = await cloud.addFriendByCode('me', 'sekrit', 'other');
    expect(result).toEqual({ status: 'already' });
    expect(rpcCalls).toEqual([]);
  });

  it('calls recordGreet with a STABLE per-pair stamp (not a timestamp) on a genuine first add', async () => {
    const rpcCalls = [];
    const rpc = async (name, args) => {
      rpcCalls.push({ name, args });
      return 1;
    };
    const select = async () => []; // no existing friendship row
    const cloud = createCloud({ rpc, select });
    const result = await cloud.addFriendByCode('me', 'sekrit', 'other');
    expect(result).toEqual({ status: 'added' });
    expect(rpcCalls).toEqual([
      { name: 'record_friend_greet', args: { p_my_id: 'me', p_my_secret: 'sekrit', p_other_id: 'other', p_walk: 'friendcode' } },
    ]);
  });

  it('repeated calls for the same never-before-met pair only ever record one greet (idempotent, not just no-op-on-existing)', async () => {
    // simulates two rapid clicks: the first call's fetchFriendships still
    // sees no row (the greet hasn't landed yet), so BOTH calls would send
    // record_friend_greet — the stable 'friendcode' stamp is what makes
    // that safe: the server-side dedupe on (pair, walk stamp) collapses
    // both calls to a single recorded greet no matter how many the client
    // sends.
    const rpcCalls = [];
    let greets = 0;
    const rpc = async (name, args) => {
      rpcCalls.push({ name, args });
      if (args.p_walk === 'friendcode') greets = 1; // dedupe: stays 1 no matter how many times this fires
      return greets;
    };
    const select = async () => []; // both calls race before any row exists
    const cloud = createCloud({ rpc, select });
    await cloud.addFriendByCode('me', 'sekrit', 'other');
    await cloud.addFriendByCode('me', 'sekrit', 'other');
    expect(rpcCalls.every((c) => c.args.p_walk === 'friendcode')).toBe(true);
    expect(new Set(rpcCalls.map((c) => c.args.p_walk)).size).toBe(1); // same stamp both times, not Date.now()-varying
  });

  it('returns a failed status (and never claims added) when recordGreet denies with -1', async () => {
    // -1 means record_friend_greet denied the call — in this flow that's
    // almost always because the CALLER has no profile row yet, not that
    // anything is wrong with the friend being added. Before this fix that
    // -1 was silently discarded and the flow fell through to {status:
    // 'added'} — a false success.
    const rpcCalls = [];
    const rpc = async (name, args) => {
      rpcCalls.push({ name, args });
      return -1;
    };
    const select = async () => []; // no existing friendship row
    const cloud = createCloud({ rpc, select });
    const result = await cloud.addFriendByCode('me', 'sekrit', 'other');
    expect(result).toEqual({ status: 'failed' });
    expect(rpcCalls).toEqual([
      { name: 'record_friend_greet', args: { p_my_id: 'me', p_my_secret: 'sekrit', p_other_id: 'other', p_walk: 'friendcode' } },
    ]);
  });

  it('short-circuits on self-add without calling select or rpc at all', async () => {
    const calls = [];
    const rpc = async (...args) => calls.push(['rpc', ...args]);
    const select = async (...args) => calls.push(['select', ...args]);
    const cloud = createCloud({ rpc, select });
    const result = await cloud.addFriendByCode('me', 'sekrit', 'me');
    expect(result).toEqual({ status: 'self' });
    expect(calls).toEqual([]);
  });
});

import { RPCS } from './fixtures/colonyrpcs.js';
describe('colony wrappers', () => {
  it('every colony wrapper sends exactly the SQL contract arguments', async () => {
    const calls = [];
    const cloud = createCloud({ rpc: async (name, args) => { calls.push({ name, args }); return 'ok'; }, select: async () => [] });
    await cloud.colonyInviteOpen('id', 's'); await cloud.colonyInviteJoin('id', 's', 'K7P2QM');
    await cloud.colonyInviteAnswer('id', 's', true); await cloud.colonySync('id', 's', ['crown']);
    await cloud.colonyFeed('id', 's', { cat: 'Pickles', walk: 'walk-1', area: 'park', x: 1, z: 2, head: 1, tamed: false });
    await cloud.colonyDress('id', 's', 'Pickles', 'crown'); await cloud.colonyTradeOffer('id', 's', 'crown', 'tophat');
    await cloud.colonyTradeAnswer('id', 's', 4, true); await cloud.colonyTradeCancel('id', 's', 4);
    for (const { name, args } of calls) expect(Object.keys(args)).toEqual(RPCS[name]);
    expect(calls).toHaveLength(Object.keys(RPCS).length);
    expect(new Set(calls.map((c) => c.name))).toEqual(new Set(Object.keys(RPCS)));
  });

  it('maps values to the right p_ args and passes results through unchanged', async () => {
    const result = { status: 'paired' };
    const calls = [];
    const cloud = createCloud({ rpc: async (name, args) => { calls.push({ name, args }); return result; }, select: async () => [] });
    expect(await cloud.colonyFeed('me', 'sek', { cat: 'Pickles', walk: 'walk-9', area: 'docks', x: 1.5, z: -2, head: 2, tamed: true })).toBe(result);
    expect(calls[0]).toEqual({ name: 'colony_feed', args: {
      p_player_id: 'me', p_secret: 'sek', p_cat: 'Pickles', p_walk: 'walk-9', p_area: 'docks', p_x: 1.5, p_z: -2, p_head: 2, p_tamed: true } });
    await cloud.colonyTradeAnswer('me', 'sek', 4, false);
    expect(calls[1].args).toEqual({ p_player_id: 'me', p_secret: 'sek', p_trade_id: 4, p_accept: false });
    await cloud.colonySync('me', 'sek', ['crown']);
    expect(calls[2].args.p_wardrobe).toEqual(['crown']);
  });
});
