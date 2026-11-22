import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';

// Offline first (2026-11-16): a device that has not been put online makes no
// request and creates no Supabase client; a device that has behaves as before.
//
// "Put online" is cloudsync.js's onlineAllowed(): a walking name is saved, or
// the device is linked to a cloud save.
//
// 2026-11-17, two things on top of that:
//   * the app's nearby search (game/nearby.js, the local network) waits for
//     the same gate, so a fresh device neither looks nor is findable;
//   * everything about other players (friends, profiles, greets, friend
//     codes, the colony, rooms) needs a walking name: togetherAllowed(). A
//     device that is only linked to a cloud save asks the database about its
//     save and about nothing else.
//
// What is real here: the progression, createCloudSync with its LIVE cloud
// (createLiveCloud -> net.js's getSupabaseClient), createRooms with its LIVE
// transport, createColonySync, createOnlineDelete, the home base's cloud
// adapter and the home base itself (over the no-DOM stand-in the other
// homebase tests use). What is fake: '@supabase/supabase-js' (a spy that
// counts every client, rpc, table read and channel), fetch and WebSocket.
// Nothing here can reach a network.
//
// startWalk needs a renderer, so the walk's own start and end are replayed as
// the calls they make (the list is pinned against walk.js and main.js at the
// bottom of this file).

const spy = vi.hoisted(() => ({ imported: 0, clients: [], rpc: [], selects: [], channels: [], answers: {} }));
vi.mock('@supabase/supabase-js', () => {
  spy.imported += 1;
  return {
    createClient: (url, key) => {
      const client = {
        rpc: async (name, args) => {
          spy.rpc.push({ name, args });
          // A server that has not had docs/supabase-v11-cat-login.sql run on it: PostgREST says the function is not there.
          if (/^(peek_save|sync_save)$/.test(name) && !(name in spy.answers)) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name } };
          const a = spy.answers[name];
          return { data: typeof a === 'function' ? a(args) : (a ?? null), error: null };
        },
        from: (table) => {
          spy.selects.push(table);
          const q = { select: () => q, in: () => q, like: () => q, or: () => q, then: (ok) => ok({ data: [], error: null }) };
          return q;
        },
        channel: (name) => {
          spy.channels.push(name);
          const ch = {
            on: () => ch,
            subscribe: (cb) => { queueMicrotask(() => cb('SUBSCRIBED')); return ch; },
            track: async () => {}, untrack: async () => {}, send() {},
            presenceState: () => ({}),
          };
          return ch;
        },
        removeChannel: async () => {},
      };
      spy.clients.push({ url, key });
      return client;
    },
  };
});
vi.mock('../src/thumbnails.js', () => ({ fillFoundThumbs: () => {}, menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    return {
      html: ({ headerHtml, startHtml, extrasHtml }) => `<header>${headerHtml}</header>${extrasHtml ?? ''}${startHtml}`,
      placesHtml: () => '', closeWardrobe() {}, afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      ui: { builder: null },
    };
  },
}));

await import('../src/game/catsync.js'); // the catch-up's lazy chunk, already loaded: these tests count requests, not file fetches
const { createCloudSync, onlineOptedIn, walkingNameSaved } = await import('../src/game/cloudsync.js');
const { createNearby, NEARBY_OPTED_KEY } = await import('../src/game/nearby.js');
const { createRooms } = await import('../src/game/rooms.js');
const { createColonySync } = await import('../src/game/colonysync.js');
const { createOnlineDelete } = await import('../src/game/onlinedelete.js');
const { createHomebaseCloud } = await import('../src/game/homebasecloud.js');
const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { createBlockList } = await import('../src/blocklist.js');
const { createMetPlayers } = await import('../src/metplayers.js');

const PID = 'aaaaaaaa-1111-4000-8000-000000000001';
const SECRET_KEY = 'whisker-walk-secret';
const CODE_KEY = 'whisker-walk-cloudcode';
const CODE_SECRET_KEY = 'whisker-walk-cloudsecret';

const memStorage = () => memoryStorage({}, { removeItem: true, expose: 'm' });
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
  return el;
}
function fakeDocument() {
  const doc = { defaultView: { innerWidth: 375, innerHeight: 812 } };
  doc.createElement = () => fakeEl(doc);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  return doc;
}

let doc;
let fetchSpy;
let sockets;
let seq = 0;
beforeEach(() => {
  spy.clients.length = 0; spy.rpc.length = 0; spy.selects.length = 0; spy.channels.length = 0;
  spy.answers = {};
  doc = fakeDocument();
  globalThis.document = doc;
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  });
  fetchSpy = vi.fn(() => Promise.reject(new Error('no network in tests')));
  vi.stubGlobal('fetch', fetchSpy);
  sockets = [];
  vi.stubGlobal('WebSocket', class { constructor(url) { sockets.push(url); } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete globalThis.document;
  delete globalThis.localStorage;
});

const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };

// main.js's wiring of the online side, with the same factories in the same
// order. `petName` and `linked` are the two things that put a device online.
// The nearby search is the real module over a bridge that only records what
// the app would have been told (g.nearbySent); `nearbyOpted` is the flag an
// earlier visit to Play together leaves on the device.
function boot({ petName = null, linked = false, MP = true, nearbyOpted = false } = {}) {
  const storage = memStorage();
  if (linked) { storage.setItem(CODE_KEY, 'PLUM-OTTER-CROW-42'); storage.setItem(CODE_SECRET_KEY, 'row-secret-1'); }
  const progression = createProgression(memStorage());
  if (petName) progression.setPetName(petName);
  // a url of its own, so net.js's per-url client cache never hides a create
  const url = `https://test-${++seq}.invalid`;
  const blockList = createBlockList(memStorage());
  const { getPsecret, getCloud, openCloud, onlineAllowed, togetherAllowed, sync } = createCloudSync({
    MP, supabaseUrl: url, supabaseAnonKey: 'anon', storage, progression,
    pid: PID, met: createMetPlayers(memStorage()), blocked: blockList, // cat login M1: the cat's id and its two lists, as main.js passes them
    album: { serialize: () => ({ version: 1, photos: [] }), replaceFromPayload() {}, photos: [] }, cloudToast: () => {},
  });
  let pushProfileNow = () => Promise.resolve();
  const colonySync = createColonySync({
    MP, pid: PID, getCloud, getPsecret, progression,
    pushProfileNow: () => pushProfileNow(), onChange: () => {}, onTradesApplied: () => {},
  });
  let session = null;
  const made = createRooms({
    MP, pid: PID, supabaseUrl: url, supabaseAnonKey: 'anon',
    progression, getCloud, getPsecret, colonySync, onlineAllowed: togetherAllowed,
    getSession: () => session, startWalk: () => { session = {}; }, toast: () => {},
  });
  pushProfileNow = made.pushProfileNow;
  const nearbySent = [];
  const nearbyStorage = memStorage();
  if (nearbyOpted) nearbyStorage.setItem(NEARBY_OPTED_KEY, '1');
  const nearby = createNearby({
    bridge: { postMessage: (m) => nearbySent.push(m) }, storage: nearbyStorage, rooms: made.rooms,
    getName: () => progression.state.petName,
    onlineAllowed,
  });
  const homebaseCloud = createHomebaseCloud({ MP, pid: PID, getCloud, getPsecret, onlineAllowed: togetherAllowed, pushProfileNow, blockList });
  const onlineDelete = createOnlineDelete({ MP, pid: PID, getCloud: openCloud, getPsecret, sync, progression });
  const homebase = createHomeBase({
    progression, album: { photos: [] }, onStartWalk: () => {}, rooms: made.rooms, sync, onlineDelete, cloud: homebaseCloud,
    settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync, myId: PID, toast: () => {}, nearby,
  });
  return { nearby, nearbySent, togetherAllowed, storage, progression, getPsecret, getCloud, openCloud, onlineAllowed, sync, colonySync, rooms: made.rooms, pushProfileNow, homebaseCloud, onlineDelete, homebase, made };
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const rpcNames = () => spy.rpc.map((c) => c.name);
function expectSilent(g) {
  expect(spy.clients).toEqual([]);
  expect(spy.rpc).toEqual([]);
  expect(spy.selects).toEqual([]);
  expect(spy.channels).toEqual([]);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(sockets).toEqual([]);
  // and nothing went on the local network: the app was told nothing
  if (g) expect(g.nearbySent).toEqual([]);
  // no secret was made up for a device that never went online
  if (g) expect(g.storage.getItem(SECRET_KEY)).toBe(null);
}

// The walk's own network calls, in the order startWalk and endWalk make them
// (pinned at the bottom): the friends lookup for ghost visits, then at the end
// the profile refresh, the cloud auto-save and the colony catch-up.
async function walkOnce(g) {
  const cloud = g.getCloud();          // walk.js spawnGhosts
  if (cloud) {
    const rows = await cloud.fetchFriendships(PID);
    if (rows.length) await cloud.fetchProfiles(rows.map((r) => r.b_id));
  }
  g.colonySync.pushFeed({ cat: 'Biscuit', walk: 'w1' }); // feeding a stray mid-walk
  await g.pushProfileNow();            // walk.js endWalk
  g.sync.autoSync();                   // main.js, after the summary
  await g.colonySync.pull();           // main.js pullThenNews
  await settle();
}

describe('the rule: what counts as put online', () => {
  it('a saved walking name, or a linked cloud save; nothing else', () => {
    expect(onlineOptedIn()).toBe(false);
    expect(onlineOptedIn({ petName: null, cloudLinked: false })).toBe(false);
    expect(onlineOptedIn({ petName: '', cloudLinked: false })).toBe(false);
    expect(onlineOptedIn({ petName: 42, cloudLinked: 'yes' })).toBe(false);
    expect(onlineOptedIn({ petName: 'Mittens', cloudLinked: false })).toBe(true);
    expect(onlineOptedIn({ petName: null, cloudLinked: true })).toBe(true);
  });
  it('the narrower rule, for everything about other players: a saved walking name and nothing else', () => {
    expect(walkingNameSaved()).toBe(false);
    expect(walkingNameSaved({ petName: null })).toBe(false);
    expect(walkingNameSaved({ petName: '' })).toBe(false);
    expect(walkingNameSaved({ petName: 42 })).toBe(false);
    expect(walkingNameSaved({ petName: 'Mittens' })).toBe(true);
    expect(walkingNameSaved({ petName: null, cloudLinked: true })).toBe(false); // a linked save is not a name
    expect(boot().togetherAllowed()).toBe(false);
    expect(boot({ linked: true }).togetherAllowed()).toBe(false);
    expect(boot({ petName: 'Mittens' }).togetherAllowed()).toBe(true);
    expect(boot({ petName: 'Mittens', linked: true }).togetherAllowed()).toBe(true);
  });
  it('a build without the database is never online, whatever the save says', () => {
    const g = boot({ petName: 'Mittens', linked: true, MP: false });
    expect(g.togetherAllowed()).toBe(false);
    expect(g.onlineAllowed()).toBe(false);
    expect(g.getCloud()).toBe(null);
    expect(g.openCloud()).toBe(null);
  });
});

describe('a fresh device: launch, home, a walk, home again', () => {
  it('makes no request, opens no connection and creates no client', async () => {
    const g = boot({ nearbyOpted: true }); // even with Play together opened on an earlier day
    expect(g.onlineAllowed()).toBe(false);
    await g.colonySync.pull();           // main.js at launch
    g.homebase.show();
    await settle();
    // every screen a child can open from the Menu
    for (const id of ['menu', 'together', 'colony', 'sync', 'settings', 'friends', 'journal', 'album', 'menu']) {
      openSheet(id);
      await settle();
    }
    await walkOnce(g);
    g.homebase.show();
    openSheet('together');
    await settle();
    await walkOnce(g);
    expectSilent(g);
    expect(spy.imported).toBe(0); // the Supabase library was never even loaded
  });
  it('Play together still shows the empty friends list, without asking for it', async () => {
    const g = boot();
    await expect(g.homebaseCloud.fetchFriendships(PID)).resolves.toEqual([]);
    expectSilent(g);
  });
  it('no room is hosted or joined, whatever calls it', async () => {
    const g = boot();
    expect(await g.rooms.host()).toEqual({ ok: false });
    expect(await g.rooms.join('ABCD')).toEqual({ ok: false });
    expect(await g.rooms.walkWithPartner()).toEqual({ ok: false });
    expect(g.rooms.getState()).toBe(null);
    expectSilent(g);
  });
  it('the gated handle is null and friend codes are refused', async () => {
    const g = boot();
    expect(g.getCloud()).toBe(null);
    await expect(g.homebaseCloud.findByFriendCode('3fa85f64')).rejects.toThrow('cloud unavailable');
    await expect(g.homebaseCloud.addFriendByCode('bbbbbbbb-2222-4000-8000-000000000002')).rejects.toThrow('cloud unavailable');
    expectSilent(g);
  });
});

describe('cat login M1: bringing a cat here asks for nothing extra', () => {
  it('a device that never linked sends no payload, even with the cat id and lists wired in', async () => {
    const g = boot();
    g.sync.autoSync();
    await settle();
    expectSilent(g);
  });
  it('Load from cloud with a named cat makes the one load_save call, and adopting its key makes no other', async () => {
    const g = boot();
    const CAT = 'dddddddd-4444-4000-8000-000000000004';
    spy.answers.load_save = { secret: 'row-secret-9', payload: { save: g.progression.state, album: { version: 1, photos: [] }, cat: { id: CAT }, social: { met: [], blocked: [] } } };
    const res = await g.sync.previewLoad('plum-otter-crow-42');
    const out = await g.sync.confirmLoad(res.preview);
    await settle();
    expect(out).toEqual({ ok: true, reload: true });
    expect(rpcNames()).toEqual(['load_save']);
    expect(g.storage.getItem('whisker-walk-player')).toBe(CAT);
    expect(g.storage.getItem(SECRET_KEY)).toBe('row-secret-9');
  });
});

describe('going online is a tap, and the tap still works', () => {
  it('Save to cloud uploads, links the device, and from then on the device is online', async () => {
    const g = boot();
    spy.answers.upsert_save = 'created';
    const res = await g.sync.saveToCloud();
    expect(res.ok).toBe(true);
    expect(rpcNames()).toEqual(['upsert_save']);
    expect(g.onlineAllowed()).toBe(true);
    // 2026-11-17: online for its save only. With no walking name the handle
    // for everything about other players stays shut.
    expect(g.togetherAllowed()).toBe(false);
    expect(g.getCloud()).toBe(null);
    g.progression.setPetName('Mittens');
    expect(g.getCloud()).not.toBe(null);
  });
  it('a refused Save to cloud leaves the device offline', async () => {
    const g = boot();
    spy.answers.upsert_save = 'busy';
    expect((await g.sync.saveToCloud()).ok).toBe(false);
    expect(g.onlineAllowed()).toBe(false);
  });
  it('Load from cloud asks with the typed code; the device is online once the load is confirmed', async () => {
    const g = boot();
    spy.answers.load_save = { secret: 'row-secret-9', payload: { save: g.progression.state, album: { version: 1, photos: [] } } };
    const res = await g.sync.previewLoad('plum-otter-crow-42');
    expect(res.ok).toBe(true);
    expect(rpcNames()).toEqual(['load_save']);
    expect(g.onlineAllowed()).toBe(false); // looked, not linked
    await g.sync.confirmLoad(res.preview);
    expect(g.onlineAllowed()).toBe(true);
  });
  it('saving a walking name puts the device online at once', async () => {
    const g = boot();
    g.progression.setPetName('Mittens');
    expect(g.onlineAllowed()).toBe(true);
    expect(g.togetherAllowed()).toBe(true);
    await g.pushProfileNow();
    expect(rpcNames()).toEqual(['upsert_profile']);
  });
  it('Delete my online data still reaches the database from a device that is not online', async () => {
    const g = boot();
    spy.answers.delete_player = 'none';
    const res = await g.onlineDelete.run();
    expect(res.outcome).toBe('done');
    expect(rpcNames()).toEqual(['delete_player']);
    expect(g.onlineAllowed()).toBe(false);
  });
  it('after Delete my online data the device is offline again', async () => {
    const g = boot({ petName: 'Mittens', linked: true });
    spy.answers.delete_player = 'ok';
    spy.answers.delete_save = 'ok';
    expect(g.onlineAllowed()).toBe(true);
    expect((await g.onlineDelete.run()).outcome).toBe('done');
    expect(g.onlineAllowed()).toBe(false);
    spy.rpc.length = 0;
    await walkOnce(g);
    g.homebase.show();
    openSheet('together');
    await settle();
    expect(spy.rpc).toEqual([]);
    expect(spy.channels).toEqual([]);
  });
});

describe('a device already online behaves as before', () => {
  it('with a walking name: the walk looks up friends, refreshes the profile and checks the colony', async () => {
    const g = boot({ petName: 'Mittens' });
    spy.answers.friendships_of = [];
    spy.answers.colony_sync = { status: 'unpaired' };
    await walkOnce(g);
    expect(spy.clients).toHaveLength(1); // one shared client
    expect(rpcNames()).toContain('friendships_of');
    expect(rpcNames()).toContain('upsert_profile');
    expect(rpcNames()).toContain('colony_sync');
    expect(rpcNames()).not.toContain('upsert_save'); // not linked: no auto-save
    const f = spy.rpc.find((c) => c.name === 'friendships_of');
    expect(f.args).toEqual({ p_player_id: PID, p_secret: g.getPsecret() });
  });
  it('with a walking name: My clan fills the friends list from the database', async () => {
    const g = boot({ petName: 'Mittens' });
    spy.answers.friendships_of = [];
    spy.answers.colony_sync = { status: 'unpaired' };
    g.homebase.show();
    openSheet('colony');
    await settle();
    expect(rpcNames()).toContain('friendships_of');
  });
  it('with a walking name: hosting opens a live room and publishes the profile', async () => {
    const g = boot({ petName: 'Mittens' });
    const res = await g.rooms.host();
    expect(res.ok).toBe(true);
    expect(spy.channels).toEqual(['room:' + res.code]);
    await settle();
    expect(rpcNames()).toContain('upsert_profile');
    await g.rooms.leave();
  });
  it('with only a linked cloud save: the walk auto-saves, and that is all (no friends lookup, no profile, no colony)', async () => {
    const g = boot({ linked: true });
    spy.answers.friendships_of = [];
    spy.answers.upsert_save = 'updated';
    await walkOnce(g);
    expect(rpcNames()).toEqual(['sync_save', 'upsert_save']);
    expect(spy.selects).toEqual([]);
    expect(spy.channels).toEqual([]);
  });
});

// 2026-11-17: the friends lookup, and everything else about other players,
// needs a walking name. Each call below is made the way its screen or the
// walk makes it, on a device whose only step online is a linked cloud save.
// Cat login, milestone 2: the catch-up. It asks nothing of a device that has not
// linked, and a linked device asks only after the caller says the home screen is
// up. A server without docs/supabase-v11-cat-login.sql answers 'function not
// found' once (remembered), and the old requests follow.
describe('the catch-up (cat login, milestone 2)', () => {
  it('a device that never linked makes no request and creates no client, named or not', async () => {
    const a = boot();
    const b = boot({ petName: 'Mittens' });
    expect(await a.sync.catchUp()).toBe('none');
    expect(await b.sync.catchUp()).toBe('none');
    a.sync.autoSync(); b.sync.autoSync();
    await settle();
    expect(spy.rpc).toEqual([]);
    expect(spy.clients).toEqual([]);
  });
  it('a linked device on an unchanged server: the v11 question once, then the old pull (at most every six hours)', async () => {
    const g = boot({ linked: true });
    expect(spy.rpc).toEqual([]); // launching asks nothing: the caller asks once the home screen is up
    await g.sync.catchUp();
    expect(rpcNames()).toEqual(['peek_save', 'load_save']);
    await g.sync.catchUp();
    expect(rpcNames()).toEqual(['peek_save', 'load_save']); // the missing function is not asked again, and the pull waits
    expect(spy.selects).toEqual([]);
    expect(spy.channels).toEqual([]);
  });
  it('a linked device on a server with v11: one cheap question when nothing changed', async () => {
    const g = boot({ linked: true });
    spy.answers.peek_save = { status: 'ok', rev: 0, lifetime: 0 };
    g.storage.setItem('whisker-walk-syncbase', JSON.stringify({ rev: 0, pending: false }));
    await g.sync.catchUp();
    expect(rpcNames()).toEqual(['peek_save']);
  });
  it('catching up without the home screen up merges nothing (the caller decides when)', async () => {
    const g = boot({ linked: true, MP: false });
    expect(await g.sync.catchUp()).toBe('none');
    expect(spy.rpc).toEqual([]);
  });
});

describe('a device with a linked cloud save and no walking name: its save, and nothing else', () => {
  const OTHER = 'bbbbbbbb-2222-4000-8000-000000000002';
  const linkedOnly = () => {
    const g = boot({ linked: true, nearbyOpted: true });
    expect(g.onlineAllowed()).toBe(true);
    expect(g.togetherAllowed()).toBe(false);
    return g;
  };
  it('launch, every screen, two walks: the only request is the save going up after each walk', async () => {
    const g = linkedOnly();
    spy.answers.upsert_save = 'updated';
    await g.colonySync.pull();           // main.js at launch
    g.homebase.show();
    await settle();
    for (const id of ['menu', 'together', 'colony', 'sync', 'settings', 'friends', 'journal', 'album', 'menu']) {
      openSheet(id);
      await settle();
    }
    await walkOnce(g);
    g.homebase.show();
    openSheet('together');
    await settle();
    await walkOnce(g);
    expect(rpcNames()).toEqual(['sync_save', 'upsert_save', 'upsert_save']);
    expect(spy.selects).toEqual([]);     // no profile was read
    expect(spy.channels).toEqual([]);    // no room, no live connection
    expect(g.storage.getItem(SECRET_KEY)).toBe(null); // and no player secret was made up
  });
  it('the walk-start friends lookup does not run', async () => {
    const g = linkedOnly();
    expect(g.getCloud()).toBe(null);     // walk.js spawnGhosts stops here
    expectSilent(g);
  });
  it('the Player pets list is empty without asking, and profiles and friend codes are refused', async () => {
    const g = linkedOnly();
    await expect(g.homebaseCloud.fetchFriendships(PID)).resolves.toEqual([]);
    await expect(g.homebaseCloud.fetchProfiles([OTHER])).rejects.toThrow('cloud unavailable');
    await expect(g.homebaseCloud.findByFriendCode('3fa85f64')).rejects.toThrow('cloud unavailable');
    await expect(g.homebaseCloud.addFriendByCode(OTHER)).rejects.toThrow('cloud unavailable');
    expectSilent(g);
  });
  it('no profile is published', async () => {
    const g = linkedOnly();
    await g.pushProfileNow();
    expectSilent(g);
  });
  it('the colony is not asked: no catch-up, no feeding, no pairing', async () => {
    const g = linkedOnly();
    await g.colonySync.pull();
    g.colonySync.pushFeed({ cat: 'Biscuit', walk: 'w1' });
    await g.colonySync.pairing.open();
    await g.colonySync.pairing.join('ABCDEF');
    await settle();
    expectSilent(g);
  });
  it('no room is hosted or joined, whatever calls it', async () => {
    const g = linkedOnly();
    expect(await g.rooms.host()).toEqual({ ok: false });
    expect(await g.rooms.join('ABCD')).toEqual({ ok: false });
    expect(await g.rooms.walkWithPartner()).toEqual({ ok: false });
    expectSilent(g);
  });
  it('its own save still works both ways: Sync now, and deleting the linked save', async () => {
    const g = linkedOnly();
    spy.answers.upsert_save = 'updated';
    spy.answers.delete_save = 'ok';
    expect(await g.sync.syncNow()).toEqual({ ok: true, message: 'Synced ✓' });
    await g.sync.deleteCloudSave();
    expect(rpcNames()).toEqual(['sync_save', 'upsert_save', 'delete_save']);
  });
  it('saving a walking name opens the rest at once: the next walk looks up friends', async () => {
    const g = linkedOnly();
    spy.answers.friendships_of = [];
    spy.answers.upsert_save = 'updated';
    spy.answers.colony_sync = { status: 'unpaired' };
    g.progression.setPetName('Mittens');
    await walkOnce(g);
    expect(rpcNames()).toContain('friendships_of');
    expect(rpcNames()).toContain('upsert_profile');
    expect(rpcNames()).toContain('upsert_save');
  });
});

// 2026-11-17: the iPhone and iPad app's nearby search waits for the gate.
describe('the nearby search (the app, the local network) waits for the gate', () => {
  it('a fresh device that opens Play together tells the app nothing', async () => {
    const g = boot();
    g.homebase.show();
    openSheet('together');
    await settle();
    openSheet(null);
    await settle();
    expect(g.nearbySent).toEqual([]);
    expectSilent(g);
  });
  it('saving a walking name there starts the search', async () => {
    const g = boot();
    spy.answers.friendships_of = [];
    g.homebase.show();
    openSheet('together');
    expect(g.nearbySent).toEqual([]);
    g.progression.setPetName('Mittens');
    openSheet('together');                // the home base draws again, as it does after Save
    expect(g.nearbySent).toEqual([{ op: 'browse' }]);
  });
  it('a device online from an earlier day looks from the cat\'s screen, as before', () => {
    const g = boot({ petName: 'Mittens', nearbyOpted: true });
    g.homebase.show();
    expect(g.nearbySent).toEqual([{ op: 'browse' }]);
  });
  it('after Delete my online data the search stops and does not start again', async () => {
    const g = boot({ petName: 'Mittens', linked: true, nearbyOpted: true });
    spy.answers.delete_player = 'ok';
    spy.answers.delete_save = 'ok';
    g.homebase.show();
    expect(g.nearbySent).toEqual([{ op: 'browse' }]);
    expect((await g.onlineDelete.run()).outcome).toBe('done');
    openSheet('sync');                    // the sheet draws again once the delete is done
    expect(g.nearbySent).toEqual([{ op: 'browse' }, { op: 'stopBrowsing' }]);
    openSheet('together');
    openSheet(null);
    expect(g.nearbySent).toHaveLength(2);
  });
});

// The places a request could start, pinned as source: a new one has to be
// looked at against the gate before these pass again.
describe('where the network can start', () => {
  const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  it('the walk reaches the database only through the gated handle', () => {
    const walk = read('game/walk.js');
    const a = walk.indexOf('async function spawnGhosts(mySession) {');
    expect(a).toBeGreaterThan(-1);
    expect(walk.slice(a, a + 120)).toContain('const cloud = getCloud();\n    if (!cloud) return;');
    expect(walk).toContain('pushProfileNow(); // refresh the public profile');
    expect(walk).not.toContain('openCloud');
    expect(walk).not.toMatch(/from '\.\.\/cloud\.js'|createSupabaseTransport|getSupabaseClient|fetch\(/);
  });
  it('main.js hands the ungated handle to Delete my online data and to nothing else', () => {
    const main = read('main.js');
    expect(main.match(/openCloud/g)).toHaveLength(3); // a comment, the destructure, and onlineDelete
    expect(main).toContain('const { getPsecret, getCloud, openCloud, onlineAllowed, togetherAllowed, sync } = createCloudSync({');
    expect(main).toContain('createOnlineDelete({ MP, pid, getCloud: openCloud, getPsecret, sync, progression })');
    // 2026-11-17: rooms and the Player pets list get the walking-name gate
    expect(main).toContain('progression, getCloud, getPsecret, colonySync, onlineAllowed: togetherAllowed,'); // createRooms
    expect(main).toContain('createHomebaseCloud({ MP, pid, getCloud, getPsecret, onlineAllowed: togetherAllowed, pushProfileNow, blockList })');
    // the wide gate (a name or a linked save) goes to the nearby search and nowhere else
    expect(main.match(/\bonlineAllowed\b/g)).toHaveLength(5); // a comment, the destructure, rooms, the nearby search, the pets list
    expect(main).toContain("getName: () => progression.state.petName,\n    onlineAllowed,\n  });");
    expect(main).toContain('sync.autoSync(); // fire-and-forget; no-op when unlinked/offline');
    // (main.js calling fetch() itself is test/frameorder.test.js's: it boots
    // main.js headless with fetch stubbed, and the frame runs without it. Its
    // text now holds areas.prefetch(), the area loader's, which this pin read
    // as a fetch.)
    expect(main).not.toMatch(/createClient|getSupabaseClient|new WebSocket/);
  });
  it('the My cat sheet and the code words make no request of their own: no fetch, no socket, no cloud of their own, and nothing runs at import', () => {
    for (const f of ['ui/catlogin.js', 'ui/catloginwords.js', 'catcodes.js', 'randomindex.js', 'game/hop.js']) {
      expect(read(f), f).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|createCloud|createLiveCloud|supabase|from '\.\.?\/(cloud|net)\.js'/);
    }
    // the one place a tap on the sheet reaches the cloud is the sync object it is handed
    expect([...new Set([...read('ui/catlogin.js').matchAll(/\bsync\.(\w+)\(/g)].map((m) => m[1]))].sort())
      .toEqual(['changeCode', 'confirmLoad', 'getCode', 'previewLoad', 'saveToCloud', 'syncNow', 'unlink']);
  });
  it('the hop client (cat login M4) has no import and makes no request: it asks only through the cloud it is handed, and only after start() or join()', () => {
    const hop = read('game/hop.js');
    expect(hop).not.toMatch(/^import /m);
    // its only calls on the cloud are the four hop calls, and each sits inside start/allow/deny/cancel/join/poll
    expect([...new Set([...hop.matchAll(/\bcloud\.(\w+)\(/g)].map((m) => m[1]))].sort()).toEqual(['hopAnswer', 'hopJoin', 'hopOpen', 'hopPoll']);
    // the sheet reaches the cloud for a hop only on a tap, through the two hand-over calls of the sync
    const sheet = read('ui/catlogin.js');
    expect([...new Set([...sheet.matchAll(/sync\.(hop\w+)\??\./g)].map((m) => m[1]))].sort()).toEqual(['hopCloud', 'hopHost']);
  });
  it('only cloudsync.js and rooms.js can make a cloud or a transport, and only net.js a client', () => {
    const files = ['main.js', 'game/walk.js', 'game/netevents.js', 'game/interactions.js', 'game/colonysync.js',
      'game/onlinedelete.js', 'game/homebasecloud.js', 'ui/homebase.js', 'game/nearby.js', 'game/session.js',
      'ui/catlogin.js', 'ui/catloginwords.js', 'catcodes.js', 'randomindex.js', 'savecode.js', 'game/hop.js']; // (cat login M3: the sheet and the code words reach the cloud only through the sync handed to them)
    for (const f of files) {
      expect(read(f), f).not.toMatch(/createLiveCloud|createSupabaseTransport|getSupabaseClient|@supabase\/supabase-js/);
    }
    expect(read('cloud.js')).not.toContain("import('@supabase/supabase-js')");
    expect(read('net.js').match(/import\('@supabase\/supabase-js'\)/g)).toHaveLength(1);
  });
  it('outside cloudsync.js the gated handle needs a walking name; the save has a handle of its own', () => {
    const cs = read('game/cloudsync.js');
    expect(cs).toContain('function getCloud() {\n    return togetherAllowed() ? openCloud() : null;\n  }');
    expect(cs).toContain('function saveCloud() {\n    return onlineAllowed() ? openCloud() : null;\n  }');
    // inside the file: getCloud is defined and returned and never called;
    // the save's handle is called three times (Sync, deleting the linked save,
    // Change my cat code), each straight after the link is read
    expect(cs.match(/getCloud\(\)/g)).toHaveLength(1 + (cs.match(/\/\/.*getCloud\(\)/g) ?? []).length);
    expect(cs.match(/= saveCloud\(\);/g)).toHaveLength(3);
    expect(cs).toContain('const link = readCloudLink();\n      const cloud = saveCloud();\n      if (!link || !cloud) return');
    expect(cs).toContain("if (!link) return { ok: false, message: 'Not linked to a cloud save.' };\n    const cloud = saveCloud();");
    expect(cs).toContain("if (!link) return 'not-linked';\n      const cloud = saveCloud();");
    expect(cs).toContain('return { getPsecret, getCloud, openCloud, onlineAllowed, togetherAllowed, sync };');
    expect(cs.match(/openCloud\(\); \/\/ /g)).toHaveLength(2); // Save to cloud and Load from cloud, the two taps
  });
  it('the nearby search asks the gate before it tells the app anything', () => {
    const mod = read('game/nearby.js');
    expect(mod).toContain('if (!available || !visible || !opted() || !online()) return { advertise: null, browse: false };');
    expect(mod).toContain('onlineAllowed = () => false,'); // forgotten, the answer is no
    // every message to the app goes through post(), and post() is called only from refresh()
    expect(mod.match(/bridge\.postMessage\(/g)).toHaveLength(1);
    const refresh = mod.slice(mod.indexOf('  function refresh() {'), mod.indexOf('  // A room made, joined, started or left'));
    expect(mod.match(/\bpost\(/g)).toHaveLength(1 + refresh.match(/\bpost\(/g).length); // its own definition, and refresh's
    expect(refresh.match(/\bpost\(/g)).toHaveLength(3);
    expect(refresh).toContain('const want = wants();');
  });
  it('the app starts nothing on the local network by itself: only the page\'s messages do', () => {
    const ios = (f) => readFileSync(new URL(`../ios/WhiskerWalk/${f}`, import.meta.url), 'utf8');
    const swift = ios('Nearby.swift');
    // one place starts a search and one starts being findable; each is reached only from the plan
    expect(swift.match(/startBrowsingForPeers\(\)/g)).toHaveLength(1);
    expect(swift.match(/startAdvertisingPeer\(\)/g)).toHaveLength(1);
    expect(swift).toContain('private lazy var peer = MCPeerID(displayName: Self.peerName)'); // not made until first used
    expect(swift.match(/radio\.(advertise|browse)\(/g)).toHaveLength(2); // both in sync()
    expect(swift).toContain('private func sync() {\n        radio.advertise(plan.advertising)\n        radio.browse(plan.browsing)');
    // a plan starts empty, so sync() with no message from the page starts nothing
    expect(swift).toContain('private(set) var room: NearbyRoom?\n    private(set) var wantsBrowsing = false');
    // the view controller only registers the handler and resets it
    const vc = ios('GameViewController.swift');
    expect(vc.match(/\bnearby\b\.[a-zA-Z]+/g)).toEqual(['nearby.reset']);
    expect(vc).toContain('config.userContentController.add(nearby, name: NearbyBridge.handlerName)');
    // nothing else in the app uses the local network or the internet by itself
    for (const f of ['AppDelegate.swift', 'SceneDelegate.swift', 'GameViewController.swift', 'Haptics.swift', 'CrashRecovery.swift', 'ExpiryWarning.swift', 'DeviceProfile.swift', 'WebRoot.swift', 'AppScheme.swift', 'BundleSchemeHandler.swift', 'NavigationRule.swift']) {
      expect(ios(f), f).not.toMatch(/MultipeerConnectivity|MCNearby|NWBrowser|NWListener|NetService|URLSession|import Network/);
    }
  });
  it('every room is opened behind the gate', () => {
    const rooms = read('game/rooms.js');
    expect(rooms.match(/createNet\(createTransport\(\)\)/g)).toHaveLength(2); // host, joinRoom
    expect(rooms.match(/if \(!MP \|\| !onlineAllowed\(\) \|\| pendingRoom \|\| roomOpInFlight\) return \{ ok: false \};/g)).toHaveLength(3);
  });
});
