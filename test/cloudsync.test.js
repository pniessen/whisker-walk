// createCloudSync's handling of what the cloud says back, with a fake cloud
// (makeCloud) — no network. Pins the kid-readable answers for the v8
// refusals ('too-big', 'busy'), which work the same whether the server or
// cloud.saveToCloud's own size check said it.
import { describe, it, expect, vi } from 'vitest';
import { createCloudSync } from '../src/game/cloudsync.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function setup(answer) {
  const storage = fakeStorage();
  const toasts = [];
  const sent = [];
  const made = [];
  const makeCloud = (url, key, opts) => {
    made.push(opts);
    return { saveToCloud: async (code, secret, payload, lifetime) => { sent.push({ code, lifetime }); return answer(); } };
  };
  const sync = createCloudSync({
    MP: true, supabaseUrl: 'u', supabaseAnonKey: 'k', storage,
    progression: { state: { lifetimePoints: 12 } },
    album: { serialize: () => ({ version: 1, photos: [] }) },
    cloudToast: (t) => toasts.push(t),
    makeCloud,
  });
  return { ...sync, storage, toasts, sent, made };
}

describe('cloud sync: a save the cloud refuses', () => {
  it('Save to cloud: too-big says so kindly and links nothing', async () => {
    const s = setup(() => 'too-big');
    const res = await s.sync.saveToCloud();
    expect(res).toEqual({ ok: false, error: "This save is too big for the cloud. It's still safe on this device." });
    expect(s.sync.getCode()).toBe(null);
  });

  it('Save to cloud: busy asks to try later', async () => {
    const s = setup(() => 'busy');
    expect(await s.sync.saveToCloud()).toEqual({ ok: false, error: 'The cloud is busy right now — try again later.' });
  });

  it('Save to cloud: created links the new code (unchanged)', async () => {
    const s = setup(() => 'created');
    const res = await s.sync.saveToCloud();
    expect(res.ok).toBe(true);
    expect(s.sync.getCode()).toBe(res.code);
    expect(res.code).toMatch(/^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-\d{2}$/);
  });

  it('Sync now on a linked device: too-big and busy are messages, never toasts', async () => {
    let answer = 'created';
    const s = setup(() => answer);
    await s.sync.saveToCloud();
    answer = 'too-big';
    expect(await s.sync.syncNow()).toEqual({ ok: false, message: "This save is too big for the cloud. It's still safe on this device." });
    answer = 'busy';
    expect(await s.sync.syncNow()).toEqual({ ok: false, message: 'The cloud is busy right now — try again later.' });
    answer = 'updated';
    expect(await s.sync.syncNow()).toEqual({ ok: true, message: 'Synced ✓' });
    expect(s.toasts).toEqual([]);
  });

  it('autoSync swallows a refusal', async () => {
    let answer = 'created';
    const s = setup(() => answer);
    await s.sync.saveToCloud();
    answer = 'too-big';
    expect(() => s.sync.autoSync()).not.toThrow();
    await vi.waitFor(() => expect(s.sent.length).toBe(2));
  });

  it('hands the cloud the player secret getter, for the v8 friendships_of read', () => {
    const s = setup(() => 'created');
    s.getCloud();
    expect(typeof s.made[0].getSecret).toBe('function');
    expect(s.made[0].getSecret()).toBe(s.getPsecret());
  });
});
