// createCloudSync's handling of what the cloud says back, with a fake cloud
// (makeCloud) — no network. Pins the kid-readable answers for the v8
// refusals ('too-big', 'busy'), which work the same whether the server or
// cloud.saveToCloud's own size check said it.
import { describe, it, expect, vi } from 'vitest';
import { createCloudSync, createCloudToast, CLOUD_TOAST_FADE_MS } from '../src/game/cloudsync.js';
import { toastLifeMs } from '../src/ui/toastlife.js';
import { memoryStorage } from './helpers/storage.js';

const fakeStorage = () => memoryStorage({}, { removeItem: true });

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
    // a new code is four words of the list (cat login M3); the old shape is only for a server that refuses it
    expect(res.code).toMatch(/^[A-Z]{3,6}(-[A-Z]{3,6}){3}$/);
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
    // 2026-11-16: getCloud() is now null for a device not yet put online
    // (test/offlinefirst.test.js); openCloud() is the same factory, ungated.
    s.openCloud();
    expect(typeof s.made[0].getSecret).toBe('function');
    expect(s.made[0].getSecret()).toBe(s.getPsecret());
  });
});

describe('the home base cloud toast', () => {
  function setupToast() {
    vi.useFakeTimers();
    const kids = [];
    globalThis.document = {
      createElement: () => {
        const el = { className: '', textContent: '', ls: {}, cls: new Set(), removed: false };
        el.classList = { add: (c) => el.cls.add(c) };
        el.addEventListener = (t, f) => { el.ls[t] = f; };
        el.remove = () => { el.removed = true; };
        return el;
      },
    };
    const toast = createCloudToast({ appendChild: (el) => kids.push(el) });
    return { toast, kids };
  }
  const done = () => { vi.useRealTimers(); delete globalThis.document; };

  it('stays as long as its words need, then fades and goes', () => {
    const { toast, kids } = setupToast();
    try {
      const text = 'The cloud has newer progress. Open Cloud save.';
      toast(text);
      const life = toastLifeMs(text);
      expect(life).toBeGreaterThanOrEqual(3000);
      vi.advanceTimersByTime(life - 1);
      expect(kids[0].cls.has('fade')).toBe(false);
      vi.advanceTimersByTime(1);
      expect(kids[0].cls.has('fade')).toBe(true);
      vi.advanceTimersByTime(CLOUD_TOAST_FADE_MS);
      expect(kids[0].removed).toBe(true);
    } finally { done(); }
  });
  it('a tap holds it for a fresh spell; a second tap lets it go', () => {
    const { toast, kids } = setupToast();
    try {
      toast('Hi there');
      vi.advanceTimersByTime(2500);
      kids[0].ls.click();
      vi.advanceTimersByTime(2999);
      expect(kids[0].cls.has('fade')).toBe(false);
      kids[0].ls.click();
      expect(kids[0].cls.has('fade')).toBe(true);
    } finally { done(); }
  });
  it('the same words shown twice while the first is up make one copy; other words and a later repeat still show', () => {
    const { toast, kids } = setupToast();
    try {
      toast('Same line');
      toast('Same line');
      expect(kids.length).toBe(1);
      toast('Another line');
      expect(kids.length).toBe(2);
      vi.advanceTimersByTime(toastLifeMs('Same line') + CLOUD_TOAST_FADE_MS);
      expect(kids[0].removed).toBe(true);
      toast('Same line');
      expect(kids.length).toBe(3);
    } finally { done(); }
  });
});
