// "Log in to my cat", milestone 1: the cat key travels with a cloud load.
// Fake storage and a fake cloud; nothing here can reach a network.
import { describe, it, expect } from 'vitest';
import { createCloudSync } from '../src/game/cloudsync.js';
import { createProgression } from '../src/progression.js';
import { createMetPlayers } from '../src/metplayers.js';
import { createBlockList } from '../src/blocklist.js';
import { getOrCreateSecret } from '../src/cloud.js';
import { readCatKey, catKeyFromPayload, KEY_BACKUP_KEY } from '../src/catkey.js';
import { memoryStorage } from './helpers/storage.js';

const ID_A = 'aaaaaaaa-0000-4000-8000-00000000000a'; // the cat that is brought
const ID_B = 'bbbbbbbb-0000-4000-8000-00000000000b'; // the device's own cat
const SECRET_A = 'row-secret-of-cat-a';
const SECRET_B = 'secret-of-device-b';
const CODE = 'PLUM-OTTER-CROW-42';
const CODE_B = 'MAPLE-RIVER-STONE-17';
const uuid = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;

// A storage that throws on writes to the keys in `fail.keys` (set after setup).
function flaky(storage, fail) {
  const bad = (k) => fail.keys.includes(k);
  return {
    getItem: (k) => storage.getItem(k),
    removeItem: (k) => { if (bad(k)) throw new Error('quota'); storage.removeItem(k); },
    setItem: (k, v) => { if (bad(k)) throw new Error('quota'); storage.setItem(k, v); },
  };
}

// One device. `own` is its own cat (id, secret, optional cloud link).
function device({ own = { id: ID_B, secret: SECRET_B }, link = null, met = [], blocked = [], petName = 'Pickle', loadAnswer = null } = {}) {
  const raw = memoryStorage({}, { removeItem: true });
  raw.setItem('whisker-walk-player', own.id);
  raw.setItem('whisker-walk-secret', own.secret);
  if (link) { raw.setItem('whisker-walk-cloudcode', link.code); raw.setItem('whisker-walk-cloudsecret', link.secret); }
  const fail = { keys: [] };
  const storage = flaky(raw, fail);
  const progression = createProgression(storage);
  progression.setPetName(petName);
  for (const id of met) createMetPlayers(raw).add(id);
  for (const id of blocked) createBlockList(raw).add(id);
  const albumLoaded = [];
  const album = { serialize: () => ({ version: 1, photos: [] }), replaceFromPayload: (p) => albumLoaded.push(p) };
  const sent = [];
  const metList = createMetPlayers(storage);
  const blockList = createBlockList(storage);
  const sync = createCloudSync({
    MP: true, supabaseUrl: 'u', supabaseAnonKey: 'k', storage, progression, album,
    cloudToast: () => {}, pid: own.id, met: metList, blocked: blockList,
    makeCloud: () => ({
      saveToCloud: async (code, secret, payload) => { sent.push({ code, secret, payload }); return 'created'; },
      loadFromCloud: async () => loadAnswer,
    }),
  });
  return { ...sync, raw, storage, fail, progression, album, albumLoaded, sent, metList, blockList };
}

// What a first device uploads: a cat with a name, some paws, a colony link.
function cloudAnswer({ id = ID_A, secret = SECRET_A, name = 'Mittens', points = 40, met = [], blocked = [], withCat = true, withSocial = true } = {}) {
  const src = createProgression(memoryStorage({}, { removeItem: true }));
  src.setPetName(name);
  src.state.points = points;
  src.state.lifetimePoints = points;
  const payload = { save: JSON.parse(JSON.stringify(src.state)), album: { version: 1, photos: [] } };
  if (withCat) payload.cat = { id };
  if (withSocial) payload.social = { met, blocked };
  return { payload, secret };
}

async function load(d) {
  const res = await d.sync.previewLoad(CODE);
  expect(res.ok).toBe(true);
  return d.sync.confirmLoad(res.preview);
}
function deviceFor(answer, opts = {}) {
  return device({ ...opts, loadAnswer: answer });
}

describe('the cloud payload names the cat', () => {
  it('composeCloudPayload carries the cat id, and no secret', async () => {
    const d = device();
    await d.sync.saveToCloud();
    expect(d.sent[0].payload.cat).toEqual({ id: ID_B });
    expect(JSON.stringify(d.sent[0].payload)).not.toContain(SECRET_B);
  });

  it('carries met and blocked ids, capped at 500, ids only', async () => {
    const met = Array.from({ length: 520 }, (_, i) => uuid(i));
    const d = device({ met, blocked: [uuid(9001), uuid(9002)] });
    await d.sync.saveToCloud();
    const social = d.sent[0].payload.social;
    expect(social.met.length).toBe(500);
    expect(social.met.every((x) => typeof x === 'string')).toBe(true);
    expect(social.blocked).toEqual([uuid(9001), uuid(9002)]);
    expect(Object.keys(social).sort()).toEqual(['blocked', 'met']);
  });

  it('a device built without the new parts sends the payload as before', async () => {
    const storage = memoryStorage({}, { removeItem: true });
    const sent = [];
    const sync = createCloudSync({
      MP: true, supabaseUrl: 'u', supabaseAnonKey: 'k', storage,
      progression: { state: { lifetimePoints: 1 } },
      album: { serialize: () => ({ version: 1, photos: [] }) },
      cloudToast: () => {},
      makeCloud: () => ({ saveToCloud: async (c, s, p) => { sent.push(p); return 'created'; } }),
    });
    await sync.sync.saveToCloud();
    expect(Object.keys(sent[0]).sort()).toEqual(['album', 'save']);
  });

  it('a payload from an old build has neither and loads as before', async () => {
    const d = deviceFor(cloudAnswer({ withCat: false, withSocial: false }), { link: { code: CODE_B, secret: 'old-link' } });
    const res = await d.sync.previewLoad(CODE);
    expect(res.ok).toBe(true);
    const out = await d.sync.confirmLoad(res.preview);
    expect(out).toEqual({ ok: true, keptKey: true });
    expect(readCatKey(d.raw).id).toBe(ID_B);
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(CODE);
    expect(d.progression.state.petName).toBe('Mittens');
  });
});

describe('catKeyFromPayload', () => {
  it('reads a real id and the row secret', () => {
    expect(catKeyFromPayload({ cat: { id: ID_A } }, SECRET_A)).toEqual({ id: ID_A, secret: SECRET_A });
  });
  it('ignores an id that is not a player id, a missing id and a missing secret', () => {
    expect(catKeyFromPayload({ cat: { id: 'x' } }, SECRET_A)).toBe(null);
    expect(catKeyFromPayload({ cat: { id: '<script>alert(1)</script>-----' } }, SECRET_A)).toBe(null);
    expect(catKeyFromPayload({ cat: { id: 42 } }, SECRET_A)).toBe(null);
    expect(catKeyFromPayload({}, SECRET_A)).toBe(null);
    expect(catKeyFromPayload(null, SECRET_A)).toBe(null);
    expect(catKeyFromPayload({ cat: { id: ID_A } }, '')).toBe(null);
  });
});

describe('Load from cloud brings the key', () => {
  it('adopts the payload cat id and the row secret as the device key', async () => {
    const d = deviceFor(cloudAnswer());
    const res = await load(d);
    expect(res).toEqual({ ok: true, reload: true });
    expect(d.raw.getItem('whisker-walk-player')).toBe(ID_A);
    expect(d.raw.getItem('whisker-walk-secret')).toBe(SECRET_A);
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(CODE);
    expect(d.raw.getItem('whisker-walk-cloudsecret')).toBe(SECRET_A);
    expect(d.progression.state.petName).toBe('Mittens');
    // a fresh boot of this device now speaks as that cat
    expect(readCatKey(d.raw).id).toBe(ID_A);
    expect(getOrCreateSecret(d.raw)).toBe(SECRET_A);
  });

  it('the same key again asks for no reload', async () => {
    const d = deviceFor(cloudAnswer({ id: ID_B, secret: SECRET_B }));
    const res = await load(d);
    expect(res).toEqual({ ok: true });
  });

  it('keeps the old key with the before-cloud copy', async () => {
    const d = deviceFor(cloudAnswer(), { link: { code: CODE_B, secret: 'old-link' } });
    await load(d);
    const kept = JSON.parse(d.raw.getItem(KEY_BACKUP_KEY));
    expect(kept.key).toEqual({ id: ID_B, secret: SECRET_B, code: CODE_B, linkSecret: 'old-link' });
    expect(d.raw.getItem('whisker-walk-save.before-cloud')).toBeTruthy();
  });

  it('Undo restores the old save, the old key and the old cloud link together', async () => {
    const d = deviceFor(cloudAnswer({ name: 'Mittens', points: 40 }), { link: { code: CODE_B, secret: 'old-link' } });
    d.progression.state.points = 7;
    d.progression.setPetName('Pickle');
    await load(d);
    expect(d.progression.state.petName).toBe('Mittens');
    expect(d.progression.restoreBackup('cloud')).toBe(true);
    expect(d.progression.state.petName).toBe('Pickle');
    expect(d.raw.getItem('whisker-walk-player')).toBe(ID_B);
    expect(d.raw.getItem('whisker-walk-secret')).toBe(SECRET_B);
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(CODE_B);
    expect(d.raw.getItem('whisker-walk-cloudsecret')).toBe('old-link');
    expect(d.raw.getItem(KEY_BACKUP_KEY)).toBe(null);
    expect(d.progression.takeKeyChanged()).toBe(true);
    expect(d.progression.takeKeyChanged()).toBe(false);
  });

  it('Undo after a load that kept the key brings the old link back and asks for no reload', async () => {
    const d = deviceFor(cloudAnswer({ withCat: false }), { link: { code: CODE_B, secret: 'old-link' } });
    await load(d);
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(CODE);
    expect(d.progression.restoreBackup('cloud')).toBe(true);
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(CODE_B);
    expect(d.progression.takeKeyChanged()).toBe(false);
  });

  it('Undo of a device that had no link removes the new link', async () => {
    const d = deviceFor(cloudAnswer());
    await load(d);
    d.progression.restoreBackup('cloud');
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(null);
    expect(d.raw.getItem('whisker-walk-cloudsecret')).toBe(null);
  });

  it('a cat.id that is not a player id is ignored and the key kept', async () => {
    const answer = cloudAnswer();
    answer.payload.cat = { id: 'not an id!' };
    const d = deviceFor(answer);
    const res = await load(d);
    expect(res).toEqual({ ok: true, keptKey: true });
    expect(d.raw.getItem('whisker-walk-player')).toBe(ID_B);
    expect(d.raw.getItem('whisker-walk-secret')).toBe(SECRET_B);
  });

  const KEYS = ['whisker-walk-player', 'whisker-walk-secret', 'whisker-walk-cloudcode', 'whisker-walk-cloudsecret', 'whisker-walk-save'];
  const snap = (d) => KEYS.map((k) => d.raw.getItem(k));

  it.each([
    ['the secret', ['whisker-walk-secret']],
    ['the cloud link', ['whisker-walk-cloudcode']],
    ['the cloud row secret', ['whisker-walk-cloudsecret']],
    ['the save', ['whisker-walk-save']],
  ])('a storage that throws on %s half way leaves all four values and the save as they were', async (_n, keys) => {
    const d = deviceFor(cloudAnswer(), { link: { code: CODE_B, secret: 'old-link' } });
    const res = await d.sync.previewLoad(CODE);
    const before = snap(d);
    const stateBefore = JSON.stringify(d.progression.state);
    d.fail.keys = keys;
    const out = await d.sync.confirmLoad(res.preview);
    d.fail.keys = [];
    expect(out.ok).toBe(false);
    expect(snap(d)).toEqual(before);
    expect(JSON.stringify(d.progression.state)).toBe(stateBefore);
  });
});

describe('the friends come too, and the colony stays paired', () => {
  it('a fresh boot after the load pulls the colony as the loaded cat', async () => {
    const d = deviceFor(cloudAnswer());
    await load(d);
    // main.js on the next boot: the id from readCatKey, the secret from getOrCreateSecret
    const boot = { id: readCatKey(d.raw).id, secret: getOrCreateSecret(d.raw) };
    expect(boot).toEqual({ id: ID_A, secret: SECRET_A });
  });

  it('the loaded cat\'s met ids are added to this device\'s, never fewer', async () => {
    const mine = [uuid(1), uuid(2)];
    const theirs = [uuid(2), uuid(3), 'bad id', 7];
    const d = deviceFor(cloudAnswer({ met: theirs }), { met: mine });
    await load(d);
    expect(d.metList.all().sort()).toEqual([uuid(1), uuid(2), uuid(3)].sort());
  });

  it('blocked ids are a union too', async () => {
    const d = deviceFor(cloudAnswer({ blocked: [uuid(7), uuid(8)] }), { blocked: [uuid(5)] });
    await load(d);
    expect(d.blockList.all().sort()).toEqual([uuid(5), uuid(7), uuid(8)].sort());
  });

  it('each side is capped at 500 and only player ids come in', async () => {
    const theirs = Array.from({ length: 700 }, (_, i) => uuid(i + 1));
    const d = deviceFor(cloudAnswer({ met: theirs, blocked: theirs }));
    await load(d);
    expect(d.metList.all().length).toBe(500);
    expect(d.blockList.all().length).toBe(500);
  });

  it('a payload with no social leaves both lists alone', async () => {
    const d = deviceFor(cloudAnswer({ withSocial: false }), { met: [uuid(1)], blocked: [uuid(2)] });
    await load(d);
    expect(d.metList.all()).toEqual([uuid(1)]);
    expect(d.blockList.all()).toEqual([uuid(2)]);
  });
});
