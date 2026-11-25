// Start a fresh cat, end to end over a real save and the real cloud wiring with a FAKE cloud (no network):
// linked and not-linked cats, the final push, the new cat key and no cloud link, the old cat's cloud copy untouched,
// the rollback slot, and Bring back my old cat.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgression, SAVE_KEY } from '../src/progression.js';
import { createCloudSync } from '../src/game/cloudsync.js';
import { readCatKey, PLAYER_KEY, SECRET_KEY, LINK_CODE_KEY, LINK_SECRET_KEY } from '../src/catkey.js';
import { freshReset, freshRestore, worthKeeping, snapshot, readSlot, writeSlot, FRESH_BACKUP_KEY, open, openBack, PUSH_MS } from '../src/ui/freshcat.js';
import { LINES } from '../src/ui/freshcatwords.js';
import { phrase, addPhrases } from '../src/clanphrases.js';
import { memoryStorage } from './helpers/storage.js';
import { fakeConfirm, fakeNav } from './helpers/fakecard.js';

addPhrases(LINES);
const store = (init = {}) => memoryStorage(init, { removeItem: true, expose: 'm' });
// a storage that can be listed, as a browser's is
const listable = (init = {}) => {
  const s = store(init);
  Object.defineProperty(s, 'length', { get: () => s.m.size });
  s.key = (i) => [...s.m.keys()][i] ?? null;
  return s;
};

// The whole device: storage, progression, the cloud wiring and a fake cloud that remembers every call.
function device({ storage = listable(), id } = {}) {
  const calls = { save: [], del: [], other: [] };
  const rows = new Map(); // code -> payload
  const cloud = {
    saveToCloud: vi.fn(async (code, secret, payload) => { calls.save.push({ code, secret, payload }); rows.set(code, payload); return rows.has(code) && calls.save.filter((c) => c.code === code).length > 1 ? 'updated' : 'created'; }),
    deleteSave: vi.fn(async (...a) => { calls.del.push(a); return 'ok'; }),
  };
  const progression = createProgression(storage);
  const album = { serialize: () => ({ version: 1, photos: [] }), clear: vi.fn(), replaceFromPayload: vi.fn() };
  const pid = readCatKey(storage).id;
  const cs = createCloudSync({ MP: true, supabaseUrl: 'u', supabaseAnonKey: 'k', storage, progression, album, cloudToast: () => {}, makeCloud: () => cloud, pid });
  return { storage, progression, album, cloud, calls, rows, cs, sync: cs.sync, pid };
}
const earn = (d, n = 40) => { d.progression.state.points = n; d.progression.state.lifetimePoints = n; d.progression.state.petName = 'Mochi'; };
const persist = (d) => d.storage.setItem(SAVE_KEY, JSON.stringify(d.progression.state));
const saveRaw = (d) => d.storage.getItem(SAVE_KEY);

describe('a linked cat, started fresh', () => {
  it('pushes once more, keeps a slot, gives a NEW cat key and no link; the old cloud copy is untouched and never pushed to again', async () => {
    const d = device();
    earn(d);
    persist(d);
    const made = await d.sync.saveToCloud();
    expect(made.ok).toBe(true);
    const oldCode = made.code;
    const oldId = d.storage.getItem(PLAYER_KEY);
    d.progression.recordWalkScore?.(5);
    // the final push (the same Sync now the My cat sheet uses)
    const before = d.calls.save.length;
    const r = await d.sync.syncNow();
    expect(r.ok).toBe(true);
    expect(d.calls.save.length).toBeGreaterThan(before);
    const oldPayload = JSON.stringify(d.rows.get(oldCode));

    const res = freshReset({ storage: d.storage, progression: d.progression, album: d.album, saved: true, code: oldCode });
    expect(res.ok).toBe(true);

    // the device is a first launch: no save, no cat key, no link, empty progression
    expect(d.storage.getItem(SAVE_KEY)).toBe(null);
    for (const k of [PLAYER_KEY, SECRET_KEY, LINK_CODE_KEY, LINK_SECRET_KEY]) expect(d.storage.getItem(k), k).toBe(null);
    expect(d.progression.state.lifetimePoints).toBe(0);
    expect(d.progression.state.petName).toBe(null);
    expect(d.album.clear).toHaveBeenCalled();
    expect(d.sync.getCode()).toBe(null);

    // an auto-save now, in the same session: nothing is sent anywhere
    const sent = d.calls.save.length;
    d.sync.autoSync();
    await new Promise((r2) => setTimeout(r2, 20));
    expect(d.calls.save.length).toBe(sent);

    // a reload: the same storage, a new boot: a NEW id, and still no link; an auto-save sends nothing
    const d2 = device({ storage: d.storage });
    expect(d2.pid).not.toBe(oldId);
    expect(d2.sync.getCode()).toBe(null);
    d2.sync.autoSync();
    await new Promise((r2) => setTimeout(r2, 20));
    expect(d2.calls.save.length).toBe(0);
    // and if the fresh cat saves to the cloud on its own, it gets its OWN code
    const mine = await d2.sync.saveToCloud();
    expect(mine.ok).toBe(true);
    expect(mine.code).not.toBe(oldCode);
    expect(d2.calls.save.every((c) => c.code !== oldCode)).toBe(true);

    // nothing in the cloud was deleted, and the old cat's row is as it was
    expect(d.calls.del).toEqual([]);
    expect(d2.calls.del).toEqual([]);
    expect(d.cloud.deleteSave).not.toHaveBeenCalled();
    expect(JSON.stringify(d.rows.get(oldCode))).toBe(oldPayload);

    // the old cat is in the slot, with its code
    const slot = readSlot(d.storage);
    expect(slot.code).toBe(oldCode);
    expect(slot.role).toBe('old');
    expect(JSON.parse(slot.items[SAVE_KEY]).lifetimePoints).toBe(40);
    expect(slot.items[PLAYER_KEY]).toBe(oldId);
    expect(slot.items[LINK_CODE_KEY]).toBe(oldCode);
  });
});

describe('a cat that is only on this device', () => {
  it('is kept in the slot; with no copy possible and no cloud copy, nothing changes', () => {
    const d = device();
    earn(d);
    persist(d);
    d.storage.setItem('whisker-walk-album', '{"version":1,"photos":[]}');
    // a full device: the slot cannot be written
    const real = d.storage.setItem;
    d.storage.setItem = (k, v) => { if (k === FRESH_BACKUP_KEY) throw new Error('quota'); real(k, v); };
    const res = freshReset({ storage: d.storage, progression: d.progression, album: d.album, saved: false });
    expect(res).toEqual({ ok: false, error: 'nocopy' });
    expect(d.storage.getItem(SAVE_KEY)).not.toBe(null);
    expect(d.progression.state.lifetimePoints).toBe(40);
    expect(d.storage.getItem(PLAYER_KEY)).not.toBe(null);
    expect(d.album.clear).not.toHaveBeenCalled();
  });

  it('a slot too big with photos is written without them; the rest of the cat is kept', () => {
    const d = device();
    earn(d);
    persist(d);
    d.storage.setItem('whisker-walk-album', 'P'.repeat(500));
    const real = d.storage.setItem;
    d.storage.setItem = (k, v) => { if (k === FRESH_BACKUP_KEY && v.includes('PPPP')) throw new Error('quota'); real(k, v); };
    expect(freshReset({ storage: d.storage, progression: d.progression, album: d.album }).ok).toBe(true);
    const slot = readSlot(d.storage);
    expect(slot.items['whisker-walk-album']).toBeUndefined();
    expect(JSON.parse(slot.items[SAVE_KEY]).lifetimePoints).toBe(40);
  });

  it('keeps what belongs to the device: settings, graphics, TV mode, nearby, the rest of the code box, diagnostics', () => {
    const d = device();
    earn(d);
    persist(d);
    const kept = { 'whisker-walk-settings': '{"tvMode":true,"muted":true}', 'whisker-walk-adapt': '{"a":1}', 'whisker-walk-gl-reload': '5', 'whisker-walk-nearby-opted': '1', 'whisker-walk-redeem-rest': '{"misses":2}', 'whisker-walk-den-tab': 'shop', 'whisker-walk-builder-pose': 'sit' };
    const reset = { 'whisker-walk-met': '["x"]', 'whisker-walk-blocked': '["y"]', 'whisker-walk-resume': '{}', 'whisker-walk-syncbase': '{}', 'whisker-walk-bday-candles': '2026-11-21', 'whisker-walk-gale-moment-seen': '1', 'whisker-walk-buttons': '{}', 'whisker-walk-roofs-guide': '1', 'whisker-walk-den-day': '2026-11-21', 'whisker-walk-bday-song': '2026-11-21', 'whisker-walk-save.before-merge': '{}' };
    for (const [k, v] of Object.entries({ ...kept, ...reset })) d.storage.setItem(k, v);
    expect(freshReset({ storage: d.storage, progression: d.progression, album: d.album }).ok).toBe(true);
    for (const [k, v] of Object.entries(kept)) expect(d.storage.getItem(k), k).toBe(v);
    for (const k of Object.keys(reset)) expect(d.storage.getItem(k), k).toBe(null);
    expect(d.storage.getItem(FRESH_BACKUP_KEY)).not.toBe(null);
  });

  it('a second fresh cat replaces the slot: one slot only', () => {
    const d = device();
    earn(d, 40);
    persist(d);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album });
    const d2 = device({ storage: d.storage });
    earn(d2, 7);
    persist(d2);
    freshReset({ storage: d2.storage, progression: d2.progression, album: d2.album });
    const slot = readSlot(d.storage);
    expect(JSON.parse(slot.items[SAVE_KEY]).lifetimePoints).toBe(7);
  });
});

describe('an empty cat never pushes a real old cat out of the slot', () => {
  it('worthKeeping: no save, a save that earned nothing, and one that did', () => {
    expect(worthKeeping({})).toBe(false);
    expect(worthKeeping({ [SAVE_KEY]: JSON.stringify(createProgression(memoryStorage()).state) })).toBe(false);
    expect(worthKeeping({ [SAVE_KEY]: 'junk' })).toBe(false);
    expect(worthKeeping({ [SAVE_KEY]: JSON.stringify({ points: 3 }) })).toBe(true);
    expect(worthKeeping({ [SAVE_KEY]: JSON.stringify({ walks: { park: 1 } }) })).toBe(true);
  });
  it('starting fresh twice in a row keeps the first old cat; bringing it back from an empty cat uses the slot up', () => {
    const d = device();
    earn(d, 40);
    persist(d);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album });
    const d2 = device({ storage: d.storage });
    // the fresh cat has not done anything yet: a second reset must keep the first old cat
    expect(freshReset({ storage: d2.storage, progression: d2.progression, album: d2.album }).ok).toBe(true);
    expect(JSON.parse(readSlot(d.storage).items[SAVE_KEY]).lifetimePoints).toBe(40);
    const d3 = device({ storage: d.storage });
    expect(freshRestore({ storage: d3.storage, progression: d3.progression, album: d3.album }).ok).toBe(true);
    expect(JSON.parse(saveRaw(d3)).lifetimePoints).toBe(40);
    expect(d3.storage.getItem(FRESH_BACKUP_KEY)).toBe(null); // nothing worth swapping back to
  });
});

describe('Bring back my old cat', () => {
  it('puts the old cat back whole (key, link, save), keeps the fresh cat in the slot, and a second tap swaps back', async () => {
    const d = device();
    earn(d, 40);
    persist(d);
    const { code } = await d.sync.saveToCloud();
    const oldId = d.storage.getItem(PLAYER_KEY);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album, saved: true, code });

    const d2 = device({ storage: d.storage });
    earn(d2, 7);
    persist(d2);
    const freshId = d2.storage.getItem(PLAYER_KEY);
    expect(freshId).not.toBe(oldId);

    const back = freshRestore({ storage: d2.storage, progression: d2.progression, album: d2.album, code: d2.sync.getCode() });
    expect(back.ok).toBe(true);
    expect(d2.storage.getItem(PLAYER_KEY)).toBe(oldId);
    expect(d2.storage.getItem(LINK_CODE_KEY)).toBe(code);
    expect(JSON.parse(saveRaw(d2)).lifetimePoints).toBe(40);
    expect(d2.progression.state.lifetimePoints).toBe(40);
    // the fresh cat did not leak into the old one: it is in the slot, whole
    const slot = readSlot(d2.storage);
    expect(slot.role).toBe('swap');
    expect(slot.items[PLAYER_KEY]).toBe(freshId);
    expect(JSON.parse(slot.items[SAVE_KEY]).lifetimePoints).toBe(7);
    // after the reload the linked old cat auto-saves to ITS code, the fresh cat's id is nowhere in the link
    const d3 = device({ storage: d.storage });
    expect(d3.pid).toBe(oldId);
    expect(d3.sync.getCode()).toBe(code);
    // swap back
    const again = freshRestore({ storage: d3.storage, progression: d3.progression, album: d3.album, code: d3.sync.getCode() });
    expect(again.ok).toBe(true);
    expect(d3.storage.getItem(PLAYER_KEY)).toBe(freshId);
    expect(d3.storage.getItem(LINK_CODE_KEY)).toBe(null);
    expect(JSON.parse(saveRaw(d3)).lifetimePoints).toBe(7);
    expect(d.calls.del).toEqual([]);
  });

  it('nothing is merged from the cat that was there: found outfits and usage of the fresh cat do not appear on the old one', () => {
    const d = device();
    earn(d, 40);
    persist(d);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album });
    const d2 = device({ storage: d.storage });
    earn(d2, 7);
    d2.progression.state.visits = 99;
    persist(d2);
    expect(JSON.parse(saveRaw(d2)).visits).toBe(99);
    freshRestore({ storage: d2.storage, progression: d2.progression, album: d2.album });
    expect(JSON.parse(saveRaw(d2)).visits ?? 0).not.toBe(99);
    expect(d2.progression.state.visits).not.toBe(99);
  });

  it('with nothing in the slot, or a slot that is not a cat, it says no and changes nothing', () => {
    const d = device();
    earn(d, 40);
    persist(d);
    expect(freshRestore({ storage: d.storage, progression: d.progression })).toEqual({ ok: false, error: 'none' });
    d.storage.setItem(FRESH_BACKUP_KEY, '{"v":1,"items":{"whisker-walk-save":"not json"}}');
    expect(readSlot(d.storage)).toBe(null);
    d.storage.setItem(FRESH_BACKUP_KEY, '{"v":1,"items":{"whisker-walk-settings":"{}","other":"1"}}');
    expect(readSlot(d.storage)).toBe(null);
    d.storage.setItem(FRESH_BACKUP_KEY, 'junk');
    expect(readSlot(d.storage)).toBe(null);
    expect(JSON.parse(saveRaw(d)).lifetimePoints).toBe(40);
  });

  it('a slot only ever restores cat keys: a tampered slot cannot write the device settings', () => {
    const d = device();
    earn(d, 40);
    persist(d);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album });
    const w = JSON.parse(d.storage.getItem(FRESH_BACKUP_KEY));
    w.items['whisker-walk-settings'] = '{"muted":true}';
    w.items['evil'] = 'x';
    d.storage.setItem(FRESH_BACKUP_KEY, JSON.stringify(w));
    const slot = readSlot(d.storage);
    expect(Object.keys(slot.items)).not.toContain('whisker-walk-settings');
    expect(Object.keys(slot.items)).not.toContain('evil');
  });

  it('a restore that fails is put back as it was', () => {
    const d = device();
    earn(d, 40);
    persist(d);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album });
    const d2 = device({ storage: d.storage });
    earn(d2, 7);
    persist(d2);
    const slotBefore = d2.storage.getItem(FRESH_BACKUP_KEY);
    const bad = { ...d2.progression, reset: d2.progression.reset, replaceFromPayload: () => false };
    const res = freshRestore({ storage: d2.storage, progression: bad, album: d2.album });
    expect(res).toEqual({ ok: false, error: 'failed' });
    expect(JSON.parse(saveRaw(d2)).lifetimePoints).toBe(7);
    expect(readSlot(d2.storage).role).toBe('old');
    expect(JSON.parse(readSlot(d2.storage).items[SAVE_KEY]).lifetimePoints).toBe(40);
    expect(slotBefore).not.toBe(null);
  });
});

describe('the buttons: the question card', () => {
  let ui; let d; let calls;
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  function setup({ code = null, syncNow = null, saveToCloud = null, rooms = null, available = true } = {}) {
    d = device();
    earn(d, 40);
    persist(d);
    ui = fakeConfirm();
    calls = { notice: [], reload: 0 };
    let linked = code;
    const sync = {
      available, getCode: () => linked,
      syncNow: syncNow ?? vi.fn(async () => ({ ok: true })),
      saveToCloud: saveToCloud ?? vi.fn(async () => { linked = 'PLUM-OTTER-CROW-MAPLE'; return { ok: true, code: linked }; }),
      deleteCloudSave: vi.fn(), deleteSave: vi.fn(),
    };
    const nav = fakeNav();
    return {
      sync, nav, d,
      a: {
        sync, confirmCard: ui.confirmCard, doc: ui.doc, root: { querySelector: () => null }, escapeHtml: (s) => s, phrase, addPhrases, tvState: { input: 'keys' },
        progression: d.progression, album: d.album, storage: () => d.storage, rooms: () => rooms, notice: (t) => calls.notice.push(t), reload: () => { calls.reload += 1; },
        nav: nav.nav, reduced: () => false,
      },
    };
  }
  const holdDone = async (nav) => { nav.hold(2); await vi.advanceTimersByTimeAsync(2300); nav.hold(2, false); };
  const lines = () => ui.state.card.querySelector('.fresh-extra').innerHTML;

  it('a linked cat: the card checks the cloud first, then shows the cat code and says nothing is deleted', async () => {
    const x = setup({ code: 'PLUM-OTTER-CROW-MAPLE' });
    let release;
    x.sync.syncNow = vi.fn(() => new Promise((r) => { release = r; }));
    const p = open(x.a);
    await vi.advanceTimersByTimeAsync(0);
    expect(ui.state.opts.text).toBe('Start a fresh cat?');
    expect(lines()).toContain('Saving your cat to the cloud first');
    // holding does nothing while the cloud is being asked
    await holdDone(x.nav);
    expect(calls.reload).toBe(0);
    release({ ok: true });
    await p;
    expect(x.sync.syncNow).toHaveBeenCalledTimes(1);
    expect(lines()).toContain('PLUM · OTTER · CROW · MAPLE');
    expect(lines()).toContain('Load cat');
    expect(lines()).toContain('Nothing in the cloud is deleted');
    expect(ui.state.card.querySelector('#fresh-save')).toBe(null);
    expect(ui.state.card.querySelector('#confirm-card-yes').innerHTML).toContain('Hold to start fresh');
    // nothing was erased by opening the card
    expect(d.storage.getItem(SAVE_KEY)).not.toBe(null);
    await holdDone(x.nav);
    expect(calls.reload).toBe(1);
    expect(d.storage.getItem(SAVE_KEY)).toBe(null);
    expect(readSlot(d.storage).code).toBe('PLUM-OTTER-CROW-MAPLE');
    expect(d.calls.del).toEqual([]);
  });

  it('a linked cat whose push fails or times out gets the warning and the Save this cat first button', async () => {
    for (const how of ['fail', 'hang']) {
      const x = setup({ code: 'PLUM-OTTER-CROW-MAPLE', syncNow: how === 'fail' ? vi.fn(async () => ({ ok: false })) : vi.fn(() => new Promise(() => {})) });
      const p = open(x.a);
      await vi.advanceTimersByTimeAsync(PUSH_MS + 100);
      await p;
      expect(lines(), how).toContain('could not reach the cloud');
      expect(lines(), how).toContain('PLUM · OTTER · CROW · MAPLE');
      expect(ui.state.card.querySelector('#fresh-save'), how).not.toBe(null);
      expect(ui.state.card.querySelector('#confirm-card-yes').innerHTML, how).toContain('Hold to start fresh anyway');
      // still works offline: start fresh anyway, after the hold
      await holdDone(x.nav);
      expect(calls.reload, how).toBe(1);
      expect(d.storage.getItem(SAVE_KEY), how).toBe(null);
      expect(readSlot(d.storage), how).not.toBe(null);
    }
  });

  it('a cat only on this device: the plain warning, no cloud call, a copy kept; Save this cat first makes the code and then the card says so', async () => {
    const x = setup();
    await open(x.a);
    expect(x.sync.syncNow).not.toHaveBeenCalled();
    expect(lines()).toContain('This cat is only on this device.');
    expect(lines()).toContain('gone for good');
    const save = ui.state.card.querySelector('#fresh-save');
    expect(save).not.toBe(null);
    save.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(x.sync.saveToCloud).toHaveBeenCalledTimes(1);
    expect(lines()).toContain('PLUM · OTTER · CROW · MAPLE');
    expect(ui.state.card.querySelector('#fresh-save')).toBe(null);
    expect(ui.state.card.querySelector('#confirm-card-yes').innerHTML).toContain('Hold to start fresh');
    expect(d.storage.getItem(SAVE_KEY)).not.toBe(null);
  });

  it('Save this cat first failing says so and changes nothing', async () => {
    const x = setup({ saveToCloud: vi.fn(async () => ({ ok: false, error: 'offline' })) });
    await open(x.a);
    ui.state.card.querySelector('#fresh-save').click();
    await vi.advanceTimersByTimeAsync(10);
    expect(ui.state.card.querySelector('#fresh-hold-status').textContent).toBe(phrase('fresh.err.save'));
    expect(lines()).toContain('only on this device');
    expect(d.storage.getItem(SAVE_KEY)).not.toBe(null);
  });

  it('with no cloud on this build there is no Save button, only the warning', async () => {
    const x = setup({ available: false });
    await open(x.a);
    expect(ui.state.card.querySelector('#fresh-save')).toBe(null);
    expect(lines()).not.toContain('Save this cat first');
  });

  it('Cancel answers nothing: nothing is erased, and a hold after the card is gone does nothing', async () => {
    const x = setup();
    await open(x.a);
    ui.state.card.querySelector('#confirm-card-no').click();
    await holdDone(x.nav);
    expect(calls.reload).toBe(0);
    expect(d.storage.getItem(SAVE_KEY)).not.toBe(null);
    expect(readSlot(d.storage)).toBe(null);
  });

  it('in a room it refuses politely and asks nothing', async () => {
    const x = setup({ rooms: { code: 'ABCD' } });
    expect(await open(x.a)).toBe(false);
    expect(ui.state.asks).toBe(0);
    expect(calls.notice).toEqual([phrase('fresh.room')]);
  });

  it('a device that cannot keep a copy and has no cloud copy refuses and says why', async () => {
    const x = setup();
    const real = d.storage.setItem;
    d.storage.setItem = (k, v) => { if (k === FRESH_BACKUP_KEY) throw new Error('quota'); real(k, v); };
    await open(x.a);
    await holdDone(x.nav);
    expect(calls.reload).toBe(0);
    expect(calls.notice).toEqual([phrase('fresh.err.nocopy')]);
    expect(d.storage.getItem(SAVE_KEY)).not.toBe(null);
  });

  it('Bring back my old cat asks, then brings it back and reloads; with nothing in the slot it says so', async () => {
    const x = setup();
    expect(await openBack(x.a)).toBe(false);
    expect(calls.notice).toEqual([phrase('fresh.back.none')]);
    freshReset({ storage: d.storage, progression: d.progression, album: d.album, code: 'PLUM-OTTER-CROW-MAPLE' });
    const x2 = setup();
    d.storage = x2.d.storage; // (a new device object per setup: put the slot on it)
    writeSlot(d.storage, { role: 'old', code: 'PLUM-OTTER-CROW-MAPLE', items: snapshot(listable({ [SAVE_KEY]: JSON.stringify(createProgression(memoryStorage()).state) })) });
    expect(await openBack(x2.a)).toBe(true);
    expect(ui.state.opts.text).toBe('Bring back your old cat?');
    expect(lines()).toContain('PLUM · OTTER · CROW · MAPLE');
    ui.state.card.querySelector('#confirm-card-yes').click();
    expect(calls.reload).toBe(1);
  });
});
