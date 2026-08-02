import { describe, it, expect } from 'vitest';
import { generateSaveCode, normalizeSaveCode, getOrCreateSecret, createCloud } from '../src/cloud.js';

describe('generateSaveCode', () => {
  it('produces WORD-WORD-WORD-NN from the embedded wordlist', () => {
    const code = generateSaveCode(() => 0);
    expect(/^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-\d{2}$/.test(code)).toBe(true);
  });

  it('varies with the rng and stays two-digit zero-padded at the low end', () => {
    const low = generateSaveCode(() => 0);
    const high = generateSaveCode(() => 0.999999);
    expect(low).not.toBe(high);
    expect(low.slice(-2)).toBe('00');
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
