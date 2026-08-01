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
