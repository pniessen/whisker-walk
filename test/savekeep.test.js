import { describe, it, expect, vi, beforeEach } from 'vitest';

// askToKeepSaves asks the browser once per page load to keep the save from
// being cleared under storage pressure. It is optional hardening: it must
// never throw, never log, and never prompt where a browser would show a prompt.
// The once-flag is module state, so each test loads a fresh copy.
async function load() {
  vi.resetModules();
  return (await import('../src/savekeep.js')).askToKeepSaves;
}

function fakeNav({ persisted, persist, query } = {}) {
  const nav = { storage: {} };
  if (persist) nav.storage.persist = persist;
  if (persisted) nav.storage.persisted = persisted;
  if (query) nav.permissions = { query };
  return nav;
}

describe('askToKeepSaves', () => {
  let errors;
  beforeEach(() => {
    errors = [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {}), vi.spyOn(console, 'log').mockImplementation(() => {})];
  });

  it('resolves null and calls nothing when the API is absent', async () => {
    const ask = await load();
    expect(await ask(undefined)).toBeNull();
    const ask2 = await load();
    expect(await ask2({})).toBeNull();
    const ask3 = await load();
    expect(await ask3({ storage: {} })).toBeNull();
    const ask4 = await load();
    expect(await ask4({ storage: { persist: 'nope' } })).toBeNull();
  });

  it('returns true without asking when storage is already persisted', async () => {
    const ask = await load();
    const persist = vi.fn(async () => true);
    const nav = fakeNav({ persisted: async () => true, persist });
    expect(await ask(nav)).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('does not call persist when the permission would prompt or is denied', async () => {
    for (const state of ['prompt', 'denied']) {
      const ask = await load();
      const persist = vi.fn(async () => true);
      const query = vi.fn(async () => ({ state }));
      expect(await ask(fakeNav({ persist, query }))).toBeNull();
      expect(query).toHaveBeenCalledWith({ name: 'persistent-storage' });
      expect(persist).not.toHaveBeenCalled();
    }
  });

  it('calls persist when the permission is granted, or the query throws or rejects', async () => {
    const cases = [
      async () => ({ state: 'granted' }),
      () => { throw new TypeError('unknown permission name'); },
      async () => { throw new TypeError('unknown permission name'); },
    ];
    for (const query of cases) {
      const ask = await load();
      const persist = vi.fn(async () => true);
      expect(await ask(fakeNav({ persist, query }))).toBe(true);
      expect(persist).toHaveBeenCalledTimes(1);
    }
  });

  it('passes on a false answer from persist', async () => {
    const ask = await load();
    expect(await ask(fakeNav({ persist: async () => false }))).toBe(false);
  });

  it('resolves null, silently, when persist rejects or throws', async () => {
    for (const persist of [async () => { throw new Error('no'); }, () => { throw new Error('no'); }]) {
      const ask = await load();
      expect(await ask(fakeNav({ persist }))).toBeNull();
    }
    for (const spy of errors) expect(spy).not.toHaveBeenCalled();
  });

  it('asks at most once per page load', async () => {
    const ask = await load();
    const persist = vi.fn(async () => true);
    const nav = fakeNav({ persist });
    const first = ask(nav);
    const second = ask(nav);
    expect(second).toBe(first);
    expect(await first).toBe(true);
    expect(await ask(nav)).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
