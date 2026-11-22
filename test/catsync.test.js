// "Log in to my cat", milestone 2: a linked device catches up by itself.
// A fake cloud with revisions (and one without), real progressions over fake
// storage, a fake clock where time matters. Nothing here can reach a network.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCloudSync } from '../src/game/cloudsync.js';
import { SYNCBASE_KEY, readBase } from '../src/game/catsync.js';
import { createProgression, sanitizeSave } from '../src/progression.js';
import { memoryStorage } from './helpers/storage.js';

const CODE = 'PLUM-OTTER-CROW-42';
const SECRET = 'row-secret-of-the-cat';
const PID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const priced = Object.entries((await import('../src/progression.js')).CATALOG.accessories)
  .filter(([id, a]) => a.price > 0 && !a.prize && !sanitizeSave({}).unlocked.accessories.includes(id)).map(([id]) => id);
const TOO_BIG = "This save is too big for the cloud. It's still safe on this device.";

// The cloud: one row. v11 true answers peek_save and sync_save; false is a server
// that has not had the v11 SQL run (both answer 'missing' through cloud.js).
function server({ v11 = true } = {}) {
  const s = { v11, rev: 0, payload: null, secret: SECRET, calls: [], legacyStale: 0 };
  s.seed = (save, extra = {}) => { s.payload = { save: JSON.parse(JSON.stringify(sanitizeSave(save))), album: { version: 1, photos: [{ key: 'x' }] }, savedAt: 1000, ...extra }; };
  s.cloudFor = (dev) => {
    const gate = async () => { if (dev.offline) throw new Error('Failed to fetch'); await Promise.resolve(); };
    return {
      peekSave: async (code, secret) => {
        await gate(); s.calls.push('peek');
        if (!s.v11) return { status: 'missing' };
        if (secret !== s.secret) return { status: 'denied' };
        return { status: 'ok', rev: s.rev, lifetime: s.payload?.save?.lifetimePoints ?? 0 };
      },
      syncSave: async (code, secret, baseRev, payload) => {
        await gate(); s.calls.push({ fn: 'sync', baseRev, album: 'album' in payload });
        if (!s.v11) return { status: 'missing' };
        if (secret !== s.secret) return { status: 'denied' };
        if (s.payload && baseRev !== s.rev) { const { album: _a, ...rest } = s.payload; return { status: 'merge', rev: s.rev, payload: rest }; }
        s.payload = { album: s.payload?.album ?? { version: 1, photos: [] }, ...JSON.parse(JSON.stringify(payload)) };
        s.rev += 1;
        return { status: 'ok', rev: s.rev };
      },
      saveToCloud: async (code, secret, payload) => {
        await gate(); s.calls.push('upsert');
        if (secret !== s.secret) return 'denied';
        if (s.legacyStale > 0) { s.legacyStale -= 1; return 'stale'; }
        s.payload = JSON.parse(JSON.stringify(payload));
        return 'updated';
      },
      loadFromCloud: async () => {
        await gate(); s.calls.push('load');
        return s.payload ? { payload: JSON.parse(JSON.stringify(s.payload)), secret: s.secret, lifetime: s.payload.save?.lifetimePoints ?? 0 } : null;
      },
    };
  };
  return s;
}

function device(srv, { petName = 'Pickle', linked = true, atHome = true, base = null } = {}) {
  const raw = memoryStorage({}, { removeItem: true, expose: 'm' });
  if (linked) { raw.setItem('whisker-walk-cloudcode', CODE); raw.setItem('whisker-walk-cloudsecret', SECRET); }
  if (base) raw.setItem(SYNCBASE_KEY, typeof base === 'string' ? base : JSON.stringify(base));
  const progression = createProgression(raw);
  if (petName) progression.setPetName(petName);
  const dev = { offline: false, home: atHome, toasts: [], statuses: [], applied: 0, raw, progression };
  dev.sync = createCloudSync({
    MP: true, supabaseUrl: 'u', supabaseAnonKey: 'k', storage: raw, progression, pid: PID,
    album: { serialize: () => ({ version: 1, photos: [] }), replaceFromPayload() {} },
    cloudToast: (t) => dev.toasts.push(t), makeCloud: () => srv.cloudFor(dev),
    atHome: () => dev.home, onCatStatus: (s) => dev.statuses.push(s), onApplied: () => { dev.applied += 1; },
  }).sync;
  dev.base = () => readBase(raw);
  return dev;
}
const lifetime = (dev) => dev.progression.state.lifetimePoints;
const own = (dev, ...ids) => { for (const id of ids) dev.progression.state.unlocked.accessories.push(id); };
afterEach(() => { vi.useRealTimers(); });

describe('the first question', () => {
  it('a device that never linked makes no request', async () => {
    const srv = server();
    const d = device(srv, { linked: false });
    expect(await d.sync.catchUp()).toBe('none');
    d.sync.autoSync();
    await new Promise((r) => setTimeout(r, 5));
    expect(srv.calls).toEqual([]);
    expect(d.sync.catStatus()).toBe(null);
  });
  it('a linked device asks after the home screen is up, not before', async () => {
    const srv = server();
    srv.seed({});
    const d = device(srv, { base: { rev: 0, pending: false } });
    expect(srv.calls).toEqual([]); // building the sync asks nothing
    await d.sync.catchUp();
    expect(srv.calls).toEqual(['peek']);
  });
  it('same revision: no download, no write', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 5 }); srv.rev = 4;
    const d = device(srv, { base: { rev: 4, pending: false } });
    expect(await d.sync.catchUp()).toBe('saved');
    expect(srv.calls).toEqual(['peek']);
    expect(d.sync.catStatus().state).toBe('saved');
  });
  it('a newer cloud: downloads the save, merges, applies at home, says it once, and sends the merged save back', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 300, unlocked: { cats: [], accessories: [priced[0]], areas: [] } }); srv.rev = 3;
    const d = device(srv, { base: { rev: 2, pending: false } });
    d.progression.state.lifetimePoints = 120; own(d, priced[1]);
    expect(await d.sync.catchUp()).toBe('caught');
    expect(lifetime(d)).toBe(300);
    expect(d.progression.state.unlocked.accessories).toEqual(expect.arrayContaining([priced[0], priced[1]]));
    expect(d.toasts).toEqual(['Pickle caught up. Paws, finds and outfits from both devices are in camp.']);
    expect(d.applied).toBe(1);
    // the cloud now holds the union, at the next revision, and the device is in step
    expect(srv.payload.save.unlocked.accessories).toEqual(expect.arrayContaining([priced[0], priced[1]]));
    expect(srv.rev).toBe(4);
    expect(d.base()).toMatchObject({ rev: 4, pending: false });
    expect(srv.calls.filter((c) => c.fn === 'sync').map((c) => c.baseRev)).toEqual([2, 3]);
  });
  it('during a walk nothing is applied, and nothing is said', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 300 }); srv.rev = 3;
    const d = device(srv, { base: { rev: 2, pending: false }, atHome: false });
    d.progression.state.lifetimePoints = 120;
    expect(await d.sync.catchUp()).toBe('deferred');
    expect(lifetime(d)).toBe(120);
    expect(d.toasts).toEqual([]);
    expect(d.applied).toBe(0);
    expect(srv.rev).toBe(3); // and nothing was written over the cloud's save either
    d.home = true; // back at home, the next open merges it
    expect(await d.sync.catchUp()).toBe('caught');
    expect(lifetime(d)).toBe(300);
  });
  it('offline: nothing shown but the quiet line, the save is untouched, the push is remembered', async () => {
    const srv = server();
    srv.seed({}); srv.rev = 1;
    const d = device(srv, { base: { rev: 1, pending: false } });
    d.offline = true;
    d.progression.state.lifetimePoints = 77;
    const r = await d.sync.syncNow();
    expect(r.ok).toBe(false);
    expect(d.toasts).toEqual([]);
    expect(lifetime(d)).toBe(77);
    expect(d.base().pending).toBe(true);
    expect(d.sync.catStatus().state).toBe('offline');
    d.offline = false;
    expect(await d.sync.catchUp()).toBe('saved'); // pending: it goes up at the next open
    expect(srv.payload.save.lifetimePoints).toBe(77);
    expect(d.base().pending).toBe(false);
  });
  it('a missing or broken base falls back to the larger of each counter', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 300, walks: { park: 4 } }); srv.rev = 5;
    const d = device(srv, { base: '{not json' });
    d.progression.state.lifetimePoints = 120; d.progression.state.walks.park = 6;
    await d.sync.catchUp();
    expect(lifetime(d)).toBe(300);
    expect(d.progression.state.walks.park).toBe(6);
  });
  it('the album is never downloaded, and never sent in a catch-up', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 300 }); srv.rev = 3;
    const d = device(srv, { base: { rev: 2, pending: false } });
    await d.sync.catchUp();
    expect(srv.calls).not.toContain('load');
    expect(srv.calls.filter((c) => c.fn === 'sync').every((c) => c.album === false)).toBe(true);
    expect(srv.payload.album.photos).toHaveLength(1); // the server keeps the one it has
  });
  it('a 5 second timeout leaves the local save alone', async () => {
    vi.useFakeTimers();
    const srv = server();
    srv.seed({}); srv.rev = 1;
    const d = device(srv, { base: { rev: 0, pending: false } });
    srv.cloudFor = () => ({ peekSave: () => new Promise(() => {}), syncSave: () => new Promise(() => {}) });
    d.progression.state.lifetimePoints = 9;
    const p = d.sync.catchUp();
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toBe('offline');
    expect(lifetime(d)).toBe(9);
    expect(d.toasts).toEqual([]);
  });
});

describe('a push carries its revision', () => {
  it('a push sends the base revision it was built on, and keeps the new one', async () => {
    const srv = server();
    srv.seed({}); srv.rev = 6;
    const d = device(srv, { base: { rev: 6, pending: false } });
    d.progression.state.lifetimePoints = 15;
    expect(await d.sync.syncNow()).toEqual({ ok: true, message: 'Synced ✓' });
    expect(srv.calls).toEqual([{ fn: 'sync', baseRev: 6, album: false }]);
    expect(d.base()).toMatchObject({ rev: 7, pending: false });
    expect(srv.payload.savedAt).toBeGreaterThan(0);
  });
  it('a device that has never synced sends -1 and so always merges first', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 50 });
    const d = device(srv);
    d.progression.state.lifetimePoints = 20;
    await d.sync.syncNow();
    expect(srv.calls.map((c) => c.baseRev)).toEqual([-1, 0]);
    expect(srv.payload.save.lifetimePoints).toBe(50);
  });
  it('a merge answer is merged and pushed again, at most three times', async () => {
    const srv = server();
    srv.seed({ lifetimePoints: 10 }); srv.rev = 1;
    const d = device(srv, { base: { rev: 1, pending: false } });
    d.progression.state.lifetimePoints = 20;
    // another device wins every race: the revision moves under each push
    const real = srv.cloudFor(d);
    srv.cloudFor = () => ({ ...real, syncSave: async (...a) => { srv.rev += 1; srv.payload.save.lifetimePoints += 1; return real.syncSave(...a); } });
    await d.sync.syncNow();
    expect(srv.calls.filter((c) => c.fn === 'sync')).toHaveLength(3);
  });
  it('a denied answer shows the signed-out line once', async () => {
    const srv = server();
    srv.seed({}); srv.rev = 1;
    const d = device(srv, { base: { rev: 1, pending: false } });
    srv.secret = 'a-new-secret';
    expect(await d.sync.catchUp()).toBe('signedout');
    await d.sync.catchUp();
    await d.sync.syncNow();
    expect(d.toasts).toEqual(['This cat moved to a new cat code. Type the new one to bring Pickle back.']);
    expect(d.sync.catStatus().state).toBe('signedout');
    expect(lifetime(d)).toBe(0); // and it keeps playing locally
  });
  it('a too-big answer keeps the existing message', async () => {
    const srv = server();
    srv.seed({}); srv.rev = 1;
    const d = device(srv, { base: { rev: 1, pending: false } });
    const real = srv.cloudFor(d);
    srv.cloudFor = () => ({ ...real, syncSave: async () => ({ status: 'too-big' }) });
    expect(await d.sync.syncNow()).toEqual({ ok: false, message: TOO_BIG });
  });
  it('autoSync after a walk takes the same path, and never throws', async () => {
    const srv = server();
    srv.seed({}); srv.rev = 2;
    const d = device(srv, { base: { rev: 2, pending: false } });
    d.progression.state.lifetimePoints = 8;
    expect(() => d.sync.autoSync()).not.toThrow();
    await vi.waitFor(() => expect(srv.payload.save.lifetimePoints).toBe(8));
  });
});

describe('a server that has not had the v11 SQL run behaves as today', () => {
  it('a push falls back to the old upsert, with no revision', async () => {
    const srv = server({ v11: false });
    srv.seed({});
    const d = device(srv);
    d.progression.state.lifetimePoints = 31;
    expect(await d.sync.syncNow()).toEqual({ ok: true, message: 'Synced ✓' });
    expect(srv.calls).toEqual([{ fn: 'sync', baseRev: -1, album: false }, 'upsert']);
    expect(srv.payload.save.lifetimePoints).toBe(31);
    expect(srv.payload.album).toBeTruthy(); // the old path sends the photos as it always did
  });
  it('at open it pulls through load_save, merges and sends the union, at most every six hours', async () => {
    const srv = server({ v11: false });
    srv.seed({ lifetimePoints: 200 }, { savedAt: 5000 });
    const d = device(srv);
    d.progression.state.lifetimePoints = 90; own(d, priced[0]);
    expect(await d.sync.catchUp()).toBe('saved');
    expect(srv.calls).toEqual(['peek', 'load', 'upsert']);
    expect(lifetime(d)).toBe(200);
    expect(srv.payload.save.unlocked.accessories).toContain(priced[0]);
    srv.calls.length = 0;
    await d.sync.catchUp();
    expect(srv.calls).toEqual(['peek']); // (the real cloud remembers a missing function and does not even ask); the pull waits
  });
  it('stale from an old-build race is handled as a merge, not just a message', async () => {
    const srv = server({ v11: false });
    srv.seed({ lifetimePoints: 400, unlocked: { cats: [], accessories: [priced[0]], areas: [] } });
    const d = device(srv);
    d.progression.state.lifetimePoints = 100; own(d, priced[1]);
    srv.legacyStale = 1;
    expect(await d.sync.syncNow()).toEqual({ ok: true, message: 'Synced ✓' });
    expect(d.toasts).not.toContain('The cloud has newer progress. Open Cloud save.');
    expect(lifetime(d)).toBe(400);
    expect(srv.payload.save.unlocked.accessories).toEqual(expect.arrayContaining([priced[0], priced[1]]));
  });
  it('when nothing can pull, stale still says today\'s line', async () => {
    const srv = server({ v11: false });
    srv.seed({});
    const d = device(srv);
    srv.legacyStale = 5;
    await d.sync.syncNow();
    expect(d.toasts).toContain('The cloud has newer progress. Open Cloud save.');
  });
});

describe('two devices over one cloud', () => {
  it('one is offline for three walks, then both open: both end with the union', async () => {
    const srv = server();
    const mac = device(srv, { petName: 'Mittens' });
    const ipad = device(srv, { petName: 'Mittens' });
    // the Mac saves the first time; the iPad brings the cat (it has the same starting save)
    await mac.sync.syncNow();
    await ipad.sync.catchUp();
    expect(srv.rev).toBeGreaterThanOrEqual(1);
    // three walks on the iPad while it is offline; three on the Mac while it is online
    ipad.offline = true;
    for (let i = 0; i < 3; i++) {
      ipad.progression.state.lifetimePoints += 10; ipad.progression.state.points += 10; ipad.progression.state.walks.park += 1;
      await ipad.sync.syncNow();
      mac.progression.state.lifetimePoints += 7; mac.progression.state.points += 7; mac.progression.state.walks.park += 1;
      await mac.sync.syncNow();
    }
    own(ipad, priced[0]); own(mac, priced[1]);
    ipad.offline = false;
    await ipad.sync.catchUp();
    await mac.sync.catchUp();
    for (const d of [mac, ipad]) {
      expect(d.progression.state.lifetimePoints).toBe(51);
      expect(d.progression.state.walks.park).toBe(6);
      expect(d.progression.state.unlocked.accessories).toEqual(expect.arrayContaining([priced[0]]));
    }
    expect(srv.payload.save.lifetimePoints).toBe(51);
    expect(srv.payload.save.walks.park).toBe(6);
  });
  it('merging twice in a row changes nothing the second time', async () => {
    const srv = server();
    const a = device(srv); const b = device(srv);
    await a.sync.syncNow(); await b.sync.catchUp();
    a.progression.state.lifetimePoints = 12; b.progression.state.lifetimePoints = 30;
    await a.sync.syncNow(); await b.sync.syncNow(); await a.sync.catchUp();
    const rev = srv.rev;
    await a.sync.catchUp(); await b.sync.catchUp();
    expect(srv.rev).toBe(rev);
    expect(lifetime(a)).toBe(lifetime(b));
  });
});
