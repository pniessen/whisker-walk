import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Offline first (2026-11-16): a device that has not been put online makes no
// request and creates no Supabase client; a device that has behaves as before.
//
// "Put online" is cloudsync.js's onlineAllowed(): a walking name is saved, or
// the device is linked to a cloud save.
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
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
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

const { createCloudSync, onlineOptedIn } = await import('../src/game/cloudsync.js');
const { createRooms } = await import('../src/game/rooms.js');
const { createColonySync } = await import('../src/game/colonysync.js');
const { createOnlineDelete } = await import('../src/game/onlinedelete.js');
const { createHomebaseCloud } = await import('../src/game/homebasecloud.js');
const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');
const { createBlockList } = await import('../src/blocklist.js');

const PID = 'aaaaaaaa-1111-4000-8000-000000000001';
const SECRET_KEY = 'whisker-walk-secret';
const CODE_KEY = 'whisker-walk-cloudcode';
const CODE_SECRET_KEY = 'whisker-walk-cloudsecret';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}
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
function boot({ petName = null, linked = false, MP = true } = {}) {
  const storage = memStorage();
  if (linked) { storage.setItem(CODE_KEY, 'PLUM-OTTER-CROW-42'); storage.setItem(CODE_SECRET_KEY, 'row-secret-1'); }
  const progression = createProgression(memStorage());
  if (petName) progression.setPetName(petName);
  // a url of its own, so net.js's per-url client cache never hides a create
  const url = `https://test-${++seq}.invalid`;
  const { getPsecret, getCloud, openCloud, onlineAllowed, sync } = createCloudSync({
    MP, supabaseUrl: url, supabaseAnonKey: 'anon', storage, progression,
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
    progression, getCloud, getPsecret, colonySync, onlineAllowed,
    getSession: () => session, startWalk: () => { session = {}; }, toast: () => {},
  });
  pushProfileNow = made.pushProfileNow;
  const blockList = createBlockList(memStorage());
  const homebaseCloud = createHomebaseCloud({ MP, pid: PID, getCloud, getPsecret, onlineAllowed, pushProfileNow, blockList });
  const onlineDelete = createOnlineDelete({ MP, pid: PID, getCloud: openCloud, getPsecret, sync, progression });
  const homebase = createHomeBase({
    progression, album: { photos: [] }, onStartWalk: () => {}, rooms: made.rooms, sync, onlineDelete, cloud: homebaseCloud,
    settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync, myId: PID, toast: () => {},
  });
  return { storage, progression, getPsecret, getCloud, openCloud, onlineAllowed, sync, colonySync, rooms: made.rooms, pushProfileNow, homebaseCloud, onlineDelete, homebase, made };
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
  it('a build without the database is never online, whatever the save says', () => {
    const g = boot({ petName: 'Mittens', linked: true, MP: false });
    expect(g.onlineAllowed()).toBe(false);
    expect(g.getCloud()).toBe(null);
    expect(g.openCloud()).toBe(null);
  });
});

describe('a fresh device: launch, home, a walk, home again', () => {
  it('makes no request, opens no connection and creates no client', async () => {
    const g = boot();
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

describe('going online is a tap, and the tap still works', () => {
  it('Save to cloud uploads, links the device, and from then on the device is online', async () => {
    const g = boot();
    spy.answers.upsert_save = 'created';
    const res = await g.sync.saveToCloud();
    expect(res.ok).toBe(true);
    expect(rpcNames()).toEqual(['upsert_save']);
    expect(g.onlineAllowed()).toBe(true);
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
  it('with a walking name: Play together fills the friends list from the database', async () => {
    const g = boot({ petName: 'Mittens' });
    spy.answers.friendships_of = [];
    spy.answers.colony_sync = { status: 'unpaired' };
    g.homebase.show();
    openSheet('together');
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
  it('with only a linked cloud save: the walk still looks up friends and auto-saves, and publishes no profile', async () => {
    const g = boot({ linked: true });
    spy.answers.friendships_of = [];
    spy.answers.upsert_save = 'updated';
    await walkOnce(g);
    expect(rpcNames()).toContain('friendships_of');
    expect(rpcNames()).toContain('upsert_save');
    expect(rpcNames()).not.toContain('upsert_profile');
    expect(rpcNames()).not.toContain('colony_sync');
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
    expect(main).toContain('createOnlineDelete({ MP, pid, getCloud: openCloud, getPsecret, sync, progression })');
    expect(main).toContain('progression, getCloud, getPsecret, colonySync, onlineAllowed,'); // createRooms
    expect(main).toContain('createHomebaseCloud({ MP, pid, getCloud, getPsecret, onlineAllowed, pushProfileNow, blockList })');
    expect(main).toContain('sync.autoSync(); // fire-and-forget; no-op when unlinked/offline');
    expect(main).not.toMatch(/fetch\(|createClient|getSupabaseClient|new WebSocket/);
  });
  it('only cloudsync.js and rooms.js can make a cloud or a transport, and only net.js a client', () => {
    const files = ['main.js', 'game/walk.js', 'game/netevents.js', 'game/interactions.js', 'game/colonysync.js',
      'game/onlinedelete.js', 'game/homebasecloud.js', 'ui/homebase.js', 'game/nearby.js', 'game/session.js'];
    for (const f of files) {
      expect(read(f), f).not.toMatch(/createLiveCloud|createSupabaseTransport|getSupabaseClient|@supabase\/supabase-js/);
    }
    expect(read('cloud.js')).not.toContain("import('@supabase/supabase-js')");
    expect(read('net.js').match(/import\('@supabase\/supabase-js'\)/g)).toHaveLength(1);
  });
  it('every room is opened behind the gate', () => {
    const rooms = read('game/rooms.js');
    expect(rooms.match(/createNet\(createTransport\(\)\)/g)).toHaveLength(2); // host, joinRoom
    expect(rooms.match(/if \(!MP \|\| !onlineAllowed\(\) \|\| pendingRoom \|\| roomOpInFlight\) return \{ ok: false \};/g)).toHaveLength(3);
  });
});
