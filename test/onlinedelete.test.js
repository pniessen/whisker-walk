// "Delete my online data" (src/game/onlinedelete.js): every outcome, what it
// changes on the device (only what the server confirmed), retries, and that
// afterwards nothing goes back up. A REAL progression and cloud sync over an
// in-memory storage; the cloud is a fake that answers from a script.
import { describe, it, expect, vi } from 'vitest';
import { createOnlineDelete } from '../src/game/onlinedelete.js';
import { createCloudSync } from '../src/game/cloudsync.js';
import { createColonySync } from '../src/game/colonysync.js';
import { createProgression } from '../src/progression.js';

const PID = 'aaaaaaaa-1111-4000-8000-000000000001';
const PSECRET = 'psecret-1';
const CODE = 'PLUM-OTTER-CROW-42';
const ROW_SECRET = 'row-secret-1';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

// answers.player / answers.save: a word, a list of words (one per call), or a function.
function setup({ linked = true, petName = 'Mittens', paired = true, answers = {}, MP = true } = {}) {
  const storage = fakeStorage();
  if (linked) { storage.setItem('whisker-walk-cloudcode', CODE); storage.setItem('whisker-walk-cloudsecret', ROW_SECRET); }
  const progression = createProgression(fakeStorage());
  if (petName) progression.setPetName(petName);
  if (paired) progression.setColonyLink({ id: 'c0ffee00c0ffee00', partner: { playerId: 'bbbbbbbb-2222-4000-8000-000000000002', petName: 'Biscuit', wardrobe: [] } });
  progression.state.points = 77;
  const answer = (a, i) => (typeof a === 'function' ? a() : Array.isArray(a) ? a[Math.min(i, a.length - 1)] : a);
  let pi = 0; let si = 0;
  const cloud = {
    deletePlayer: vi.fn(async () => answer(answers.player ?? 'ok', pi++)),
    deleteSave: vi.fn(async () => answer(answers.save ?? 'ok', si++)),
    saveToCloud: vi.fn(async () => 'updated'),
  };
  const { getCloud, getPsecret, sync } = createCloudSync({
    MP, supabaseUrl: 'u', supabaseAnonKey: 'k', storage, progression,
    album: { serialize: () => ({ version: 1, photos: [] }) }, cloudToast: () => {},
    makeCloud: () => cloud,
  });
  storage.setItem('whisker-walk-secret', PSECRET);
  const od = createOnlineDelete({ MP, pid: PID, getCloud, getPsecret, sync, progression });
  return { od, cloud, sync, storage, progression, getCloud, getPsecret };
}
const unchanged = (s, { linked = true, petName = 'Mittens' } = {}) => {
  expect(s.sync.getCode()).toBe(linked ? CODE : null);
  expect(s.progression.state.petName).toBe(petName);
};

describe('deleteOnlineData: what it asks the server', () => {
  it('deletes the profile with the device id + secret, and the save with the code + its own row secret', async () => {
    const s = setup({ answers: { player: ['ok', 'none'] } });
    await s.od.run();
    expect(s.cloud.deletePlayer).toHaveBeenCalledWith(PID, PSECRET);
    expect(s.cloud.deleteSave).toHaveBeenCalledWith(CODE, ROW_SECRET);
  });
  it('asks for the profile once more after an ok (a push already on its way could have made it again)', async () => {
    const s = setup({ answers: { player: ['ok', 'none'] } });
    await s.od.run();
    expect(s.cloud.deletePlayer).toHaveBeenCalledTimes(2);
    const t = setup({ answers: { player: 'none' } });
    await t.od.run();
    expect(t.cloud.deletePlayer).toHaveBeenCalledTimes(1);
  });
  it('does not ask about a save when the device is not linked', async () => {
    const s = setup({ linked: false });
    expect((await s.od.run()).outcome).toBe('done');
    expect(s.cloud.deleteSave).not.toHaveBeenCalled();
  });
});

describe('deleteOnlineData: outcomes', () => {
  it("done: unlinks, clears the cat name and the colony link, and keeps everything else", async () => {
    const s = setup();
    const before = s.progression.state.colony.cats;
    expect(await s.od.run()).toEqual({ outcome: 'done', player: 'ok', save: 'ok' });
    expect(s.sync.getCode()).toBe(null);
    expect(s.progression.state.petName).toBe(null);
    expect(s.progression.state.colony.id).toBe(null);
    expect(s.progression.state.colony.partner).toBe(null);
    expect(s.progression.state.colony.cats).toEqual(before);
    expect(s.progression.state.points).toBe(77);
    expect(s.storage.getItem('whisker-walk-secret')).toBe(PSECRET);
  });
  it("'none' counts as done (nothing was there): a device that never saved a name or a save", async () => {
    const s = setup({ petName: null, paired: false, answers: { player: 'none', save: 'none' } });
    expect((await s.od.run()).outcome).toBe('done');
    expect(s.sync.getCode()).toBe(null);
  });
  it('unavailable: the server lacks the functions, nothing changes and the save is not asked', async () => {
    const s = setup({ answers: { player: 'unavailable' } });
    expect((await s.od.run()).outcome).toBe('unavailable');
    unchanged(s);
    expect(s.progression.state.colony.id).toBe('c0ffee00c0ffee00');
    expect(s.cloud.deleteSave).not.toHaveBeenCalled();
  });
  it('offline (or a garbled answer): nothing changes', async () => {
    for (const w of ['offline', 'bad']) {
      const s = setup({ answers: { player: w, save: w } });
      expect((await s.od.run()).outcome).toBe('offline');
      unchanged(s);
    }
  });
  it('denied and busy: nothing changes', async () => {
    for (const w of ['denied', 'busy']) {
      const s = setup({ answers: { player: w, save: w } });
      expect((await s.od.run()).outcome).toBe(w);
      unchanged(s);
    }
    const s = setup({ linked: false, answers: { player: 'denied' } });
    expect((await s.od.run()).outcome).toBe('denied');
  });
  it('partial, profile gone but not the save: the name is cleared, the link is kept', async () => {
    const s = setup({ answers: { player: ['ok', 'none'], save: 'offline' } });
    expect(await s.od.run()).toEqual({ outcome: 'partial', player: 'ok', save: 'offline' });
    expect(s.progression.state.petName).toBe(null);
    expect(s.sync.getCode()).toBe(CODE);
  });
  it('partial, save gone but not the profile: unlinked, the name is kept', async () => {
    const s = setup({ answers: { player: 'offline', save: 'ok' } });
    expect(await s.od.run()).toEqual({ outcome: 'partial', player: 'offline', save: 'ok' });
    expect(s.progression.state.petName).toBe('Mittens');
    expect(s.sync.getCode()).toBe(null);
  });
  it('a retry after a partial delete finishes it (the done part answers none)', async () => {
    const s = setup({ answers: { player: ['ok', 'none', 'none'], save: ['offline', 'ok'] } });
    expect((await s.od.run()).outcome).toBe('partial');
    expect(await s.od.run()).toEqual({ outcome: 'done', player: 'none', save: 'ok' });
    expect(s.sync.getCode()).toBe(null);
    const t = setup({ answers: { player: ['offline', 'ok', 'none'], save: 'ok' } });
    expect((await t.od.run()).outcome).toBe('partial');
    expect(await t.od.run()).toEqual({ outcome: 'done', player: 'ok', save: 'not-linked' });
    expect(t.cloud.deleteSave).toHaveBeenCalledTimes(1);
  });
  it('a thrown save delete reads as offline, never success', async () => {
    const s = setup({ answers: { player: ['ok', 'none'], save: () => { throw new Error('boom'); } } });
    expect((await s.od.run()).outcome).toBe('partial');
    expect(s.sync.getCode()).toBe(CODE);
  });
  it('without multiplayer it is unavailable and asks nothing', async () => {
    const s = setup({ MP: false });
    expect((await s.od.run()).outcome).toBe('unavailable');
    expect(s.cloud.deletePlayer).not.toHaveBeenCalled();
    expect(s.od.available).toBe(false);
  });
  it('two taps share one run', async () => {
    const s = setup({ answers: { player: ['ok', 'none'] } });
    const [a, b] = await Promise.all([s.od.run(), s.od.run()]);
    expect(a).toBe(b);
    expect(s.cloud.deleteSave).toHaveBeenCalledTimes(1);
  });
});

describe('after a delete nothing goes back up', () => {
  it('the colony sync reports needs-name and makes no network call; the profile push is skipped; no auto-sync', async () => {
    const s = setup();
    await s.od.run();
    const colonyCloud = { colonySync: vi.fn(), colonyFeed: vi.fn(), fetchProfiles: vi.fn() };
    const pushProfileNow = vi.fn();
    const cs = createColonySync({ MP: true, pid: PID, getCloud: () => colonyCloud, getPsecret: () => PSECRET, pushProfileNow, progression: s.progression, onChange: () => {} });
    expect(cs.status().mode).toBe('needs-name');
    await cs.pull();
    expect(cs.status().mode).toBe('needs-name');
    expect(colonyCloud.colonySync).not.toHaveBeenCalled();
    expect(pushProfileNow).not.toHaveBeenCalled();
    s.sync.autoSync();
    await Promise.resolve();
    expect(s.cloud.saveToCloud).not.toHaveBeenCalled();
  });
  it('the cleared name is the brand-new state, and survives a reload', async () => {
    const storage = fakeStorage();
    const p = createProgression(storage);
    p.setPetName('Mittens');
    p.setPetName(null);
    expect(createProgression(storage).state.petName).toBe(createProgression(fakeStorage()).state.petName);
    expect(createProgression(storage).state.petName).toBe(null);
  });
  it('never puts the code, a secret, the id or the cat name in a note', async () => {
    const { diagnostics } = await import('../src/diagnostics.js');
    const s = setup({ answers: { player: 'denied', save: 'offline' } });
    await s.od.run();
    const notes = diagnostics.entries().filter((e) => e.kind === 'cloud');
    expect(notes.map((e) => e.message)).toContain('online delete denied (profile denied, save offline)');
    const text = JSON.stringify(notes);
    for (const secretish of [CODE, ROW_SECRET, PSECRET, PID, 'Mittens']) expect(text).not.toContain(secretish);
  });
});
