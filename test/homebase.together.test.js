import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryStorage as memStorage } from './helpers/storage.js';
import { tvHooks, setTv, resetTv } from '../src/tvseam.js';
import { padLine } from '../src/tv/padwords.js';

// Menu review #8 (2026-11-20): Play together opens on two big choices, Start a
// room and Join a room (Play now); the name box sits under Friends and only
// until a name is saved, then it is one row with a pencil; and the public name
// is called "friend name". Driven through createHomeBase over the same no-DOM
// stand-in as homebase.grownups.test.js.
vi.mock('../src/thumbnails.js', () => ({ fillFoundThumbs: () => {}, menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null, ui: { builder: null } }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    dressingMock.ui = { builder: null };
    return {
      html: ({ headerHtml, startHtml, extrasHtml }) => `<header>${headerHtml}</header>${extrasHtml ?? ''}${startHtml}`,
      placesHtml: () => '<div class="dr-where"></div>',
      closeWardrobe() {},
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      get ui() { return dressingMock.ui; },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');

function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, removed: false, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() { el.removed = true; if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
    querySelector() { return null; },
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
beforeEach(() => {
  doc = fakeDocument();
  globalThis.document = doc;
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  });
});
afterEach(() => {
  delete globalThis.document;
  delete globalThis.localStorage;
});

const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
function fakeRooms() {
  let state = null;
  const handlers = [];
  return {
    available: true,
    getState: () => state,
    onChange: (fn) => handlers.push(fn),
    set(next) { state = next; for (const fn of handlers) fn(); },
    join: vi.fn(async () => ({ ok: true })), host: vi.fn(async () => ({ ok: true })), leave: vi.fn(async () => {}),
  };
}
const cloudStub = () => ({
  available: true, myId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  fetchFriendships: vi.fn(() => Promise.resolve([])), fetchProfiles: vi.fn(() => Promise.resolve([])),
});
function setup({ name = null, cloud = null, getIsTouch } = {}) {
  const progression = createProgression(memStorage());
  if (name) progression.state.petName = name;
  const rooms = fakeRooms();
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync: null, cloud, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, getIsTouch });
  hb.show();
  return { progression, hb, rooms };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const tap = (target) => doc.root.listeners.click({ target: Object.assign(target, { id: target.id ?? '', dataset: target.dataset ?? {}, closest: () => null }) });
const sheet = () => html().slice(html().indexOf('<section class="walk-together">'));
const text = (h) => h.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
// the stand-in page: these boxes answer querySelector, and a focus is noted
function boxes(values) {
  const focused = [];
  doc.root.querySelector = (sel) => (sel in values ? { value: values[sel], focus: () => focused.push(sel) } : null);
  return focused;
}

describe('Play now: two big choices first', () => {
  it('the first controls are Start a room and Join a room, side by side in one row, before any name box', () => {
    setup();
    openSheet('together');
    const s = sheet();
    expect(s).toContain('<h3 class="wt-heading">Play now</h3>');
    expect(s).toMatch(/<div class="wt-choices">\s*<button[^>]*id="wt-host"[^>]*>Start a room<\/button>\s*<button[^>]*id="wt-join-open"[^>]*>Join a room<\/button>\s*<\/div>/);
    const firstControl = s.match(/<(button|input)\b[^>]*>/)[0];
    expect(firstControl).toContain('id="wt-host"');
    expect(s.indexOf('class="wt-choices"')).toBeLessThan(s.indexOf('id="wt-petname-input"'));
  });
  it('neither choice is pink: no .primary on either', () => {
    setup();
    openSheet('together');
    const choices = sheet().match(/<div class="wt-choices">[\s\S]*?<\/div>/)[0];
    expect(choices).not.toContain('primary');
  });
  it('the room-code box and Join are hidden until Join a room is tapped, then she is put in the box', async () => {
    setup({ name: 'Mittens' });
    openSheet('together');
    expect(html()).not.toContain('id="wt-join-code"');
    expect(html()).not.toContain('id="wt-join"');
    const focused = boxes({ '#wt-join-code': '' });
    await tap({ id: 'wt-join-open' });
    expect(html()).toContain('<label class="code-label" for="wt-join-code">Room code</label>');
    expect(html()).toContain('id="wt-join-code"');
    expect(html()).toContain('<button id="wt-join">Join</button>');
    expect(focused).toEqual(['#wt-join-code']);
    // under the two choices, above the Friends
    expect(html().indexOf('class="wt-choices"')).toBeLessThan(html().indexOf('id="wt-join-code"'));
    expect(html().indexOf('id="wt-join-code"')).toBeLessThan(html().indexOf('>Friends</h3>'));
  });
  it('the box goes away again when the sheet closes', async () => {
    setup({ name: 'Mittens' });
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    expect(html()).toContain('id="wt-join-code"');
    openSheet('menu');
    openSheet('together');
    expect(html()).not.toContain('id="wt-join-code"');
  });
  it('a second tap on Join a room closes the box, aria-expanded follows, and what she typed is kept', async () => {
    setup({ name: 'Mittens' });
    openSheet('together');
    const expanded = () => html().match(/id="wt-join-open"[^>]*aria-expanded="(\w+)"/)[1];
    expect(expanded()).toBe('false');
    await tap({ id: 'wt-join-open' });
    expect(expanded()).toBe('true');
    doc.root.listeners.input({ target: { id: 'wt-join-code', value: 'QR' } });
    boxes({ '#wt-join-code': 'QRS' });
    await tap({ id: 'wt-join-open' });
    expect(expanded()).toBe('false');
    expect(html()).not.toContain('id="wt-join-code"');
    expect(html()).not.toContain('id="wt-join"');
    await tap({ id: 'wt-join-open' });
    expect(expanded()).toBe('true');
    expect(html()).toMatch(/id="wt-join-code"[^>]*value="QRS"/);
    // a new visit to the sheet starts empty
    openSheet('menu');
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    expect(html()).toMatch(/id="wt-join-code"[^>]*value=""/);
  });
  it('a join that fails still says so under the box', async () => {
    const { rooms } = setup({ name: 'Mittens' });
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    boxes({ '#wt-join-code': 'AB' });
    await tap({ id: 'wt-join' });
    expect(rooms.join).not.toHaveBeenCalled();
    expect(html()).toContain('Enter the 4-character room code.');
    expect(html()).toContain('id="wt-join-code"');
  });
});

describe('Friends: the name box only until a name is saved', () => {
  it('with no name: a Friends section with the box, named "Your friend name"', () => {
    setup();
    openSheet('together');
    const s = sheet();
    expect(s).toContain('<h3 class="wt-heading">Friends</h3>');
    expect(s.indexOf('>Play now</h3>')).toBeLessThan(s.indexOf('>Friends</h3>'));
    expect(s.indexOf('>Friends</h3>')).toBeLessThan(s.indexOf('id="wt-petname-input"'));
    expect(s).toContain('<p class="wt-first">First, pick your friend name:</p>');
    expect(s).toContain('aria-label="Your friend name"');
    expect(s).not.toContain('id="wt-name-edit"');
  });
  it('with a name saved: no box, one row with her name and a pencil', () => {
    setup({ name: 'Leafpaw' });
    openSheet('together');
    const s = sheet();
    expect(s).not.toContain('id="wt-petname-input"');
    expect(s).not.toContain('id="wt-petname-save"');
    expect(text(s)).toContain('Your friend name: Leafpaw');
    expect(s).toMatch(/<button[^>]*id="wt-name-edit"[^>]*>✏️<\/button>/);
    expect(s.indexOf('>Friends</h3>')).toBeLessThan(s.indexOf('id="wt-name-edit"'));
  });
  it('the pencil opens the box with her name filled in; Save closes it again', async () => {
    const { progression } = setup({ name: 'Leafpaw' });
    openSheet('together');
    const focused = boxes({ '#wt-petname-input': 'Leafpaw' });
    await tap({ id: 'wt-name-edit' });
    expect(html()).toContain('<label class="wt-name-label" for="wt-petname-input">Your friend name</label>');
    expect(html()).toContain('value="Leafpaw"');
    expect(html()).not.toContain('id="wt-name-edit"');
    expect(focused).toEqual(['#wt-petname-input']);
    boxes({ '#wt-petname-input': 'Sootfur' });
    await tap({ id: 'wt-petname-save' });
    expect(progression.state.petName).toBe('Sootfur');
    expect(html()).not.toContain('id="wt-petname-input"');
    expect(text(sheet())).toContain('Your friend name: Sootfur');
  });
  it('a name turned down keeps the box open, with the rule in friend-name words', async () => {
    const { progression } = setup({ name: 'Leafpaw' });
    openSheet('together');
    await tap({ id: 'wt-name-edit' });
    boxes({ '#wt-petname-input': 'R2D2' });
    await tap({ id: 'wt-petname-save' });
    expect(progression.state.petName).toBe('Leafpaw');
    expect(html()).toContain('id="wt-petname-input"');
    expect(html()).toContain('A friend name is 2–16 letters, spaces, or hyphens.');
  });
  it('the open box closes with the sheet', async () => {
    setup({ name: 'Leafpaw' });
    openSheet('together');
    await tap({ id: 'wt-name-edit' });
    expect(html()).toContain('id="wt-petname-input"');
    openSheet('menu');
    openSheet('together');
    expect(html()).not.toContain('id="wt-petname-input"');
  });
  it('then the star names (Clan Edition), then the friend code', () => {
    setup({ name: 'Leafpaw', cloud: cloudStub() });
    openSheet('together');
    const s = sheet();
    const order = ['>Friends</h3>', 'id="wt-name-edit"', 'star-name-picker', 'Your friend code:', 'id="friend-code-add"'].map((x) => s.indexOf(x));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('with no name, the friend code points up at the box in friend-name words', () => {
    setup({ cloud: cloudStub() });
    openSheet('together');
    expect(html()).toContain('Pick your friend name above to add friends by code.');
  });
});

describe('Start a room or Join with no name: still the name box', () => {
  it('Start a room: the box, focused, with the reason in friend-name words', async () => {
    const { rooms } = setup();
    openSheet('together');
    const focused = boxes({ '#wt-petname-input': '' });
    await tap({ id: 'wt-host' });
    expect(html()).toContain('<p class="wt-first wt-name-needed">You need a friend name before you can play together. Type one here and click Save:</p>');
    expect(focused).toEqual(['#wt-petname-input']);
    expect(rooms.host).not.toHaveBeenCalled();
  });
  it('on a touch screen the reason says tap Save', async () => {
    setup({ getIsTouch: () => true });
    openSheet('together');
    boxes({ '#wt-petname-input': '' });
    await tap({ id: 'wt-host' });
    expect(html()).toContain('You need a friend name before you can play together. Type one here and tap Save:');
  });
  it('Join a room, then Join: the same', async () => {
    const { rooms } = setup();
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    const focused = boxes({ '#wt-petname-input': '', '#wt-join-code': 'ABCD' });
    await tap({ id: 'wt-join' });
    expect(html()).toContain('You need a friend name before you can play together. Type one here and click Save:');
    expect(focused).toEqual(['#wt-petname-input']);
    expect(rooms.join).not.toHaveBeenCalled();
  });
});

describe('sent to the name box from a typed room code', () => {
  it('the code she typed is still in the box after she saves a name', async () => {
    setup();
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    doc.root.listeners.input({ target: { id: 'wt-join-code', value: 'qrst' } });
    boxes({ '#wt-join-code': 'qrst', '#wt-petname-input': '' });
    await tap({ id: 'wt-join' });
    expect(html()).toContain('You need a friend name before you can play together.');
    expect(html()).toMatch(/id="wt-join-code"[^>]*value="qrst"/);
    boxes({ '#wt-petname-input': 'Leafpaw' });
    await tap({ id: 'wt-petname-save' });
    expect(html()).toMatch(/id="wt-join-code"[^>]*value="qrst"/);
  });
  it('the typed code goes when the sheet closes', async () => {
    setup({ name: 'Leafpaw' });
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    doc.root.listeners.input({ target: { id: 'wt-join-code', value: 'qrst' } });
    openSheet('menu');
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    expect(html()).toMatch(/id="wt-join-code"[^>]*value=""/);
  });
  it('a typed code is drawn escaped', async () => {
    setup({ name: 'Leafpaw' });
    openSheet('together');
    await tap({ id: 'wt-join-open' });
    doc.root.listeners.input({ target: { id: 'wt-join-code', value: '"><b' } });
    await tap({ id: 'wt-name-edit' }); // any re-render
    expect(html()).toContain('value="&quot;&gt;&lt;b"');
  });
  it('the reason line and the box are scrolled into view, then she is put in the box', async () => {
    setup();
    openSheet('together');
    const calls = [];
    doc.root.querySelector = (sel) => ({
      value: '',
      scrollIntoView: (o) => calls.push(['scroll', sel, o.block]),
      focus: () => calls.push(['focus', sel]),
    });
    await tap({ id: 'wt-host' });
    expect(calls).toEqual([
      ['scroll', '.wt-name-needed', 'nearest'],
      ['scroll', '#wt-petname-input', 'nearest'],
      ['focus', '#wt-petname-input'],
    ]);
  });
});

describe('no "walking name" anywhere she reads', () => {
  it('Play together, with and without a name, and with the box open again', async () => {
    setup({ cloud: cloudStub() });
    openSheet('together');
    expect(html()).not.toMatch(/walking name/i);
    await tap({ id: 'wt-host' });
    expect(html()).not.toMatch(/walking name/i);
    doc = fakeDocument(); globalThis.document = doc;
    setup({ name: 'Leafpaw', cloud: cloudStub() });
    openSheet('together');
    await tap({ id: 'wt-name-edit' });
    expect(html()).not.toMatch(/walking name/i);
  });
});

describe('in a room', () => {
  it('the roster view is as it was: no choices, no Friends heading', () => {
    const { rooms } = setup({ name: 'Leafpaw' });
    openSheet('together');
    rooms.set({ code: 'ABCD', roster: [{ playerId: 'p2', petName: 'Robin' }], isHost: true, pair: false, starting: false, hosted: true });
    const s = sheet();
    expect(s).toContain('class="wt-room"');
    expect(s).toContain('<span class="wt-roster-chip">🟢 Robin</span>');
    expect(s).toContain('<button id="wt-leave">Leave room</button>');
    expect(s).not.toContain('wt-choices');
    expect(s).not.toContain('>Play now</h3>');
    expect(s).not.toContain('>Friends</h3>');
  });
});

// TV mode: the walking name is typed with the letter picker, same rule as Save.
describe('the friend name with the letter picker (TV mode)', () => {
  afterEach(() => resetTv());
  const tvOn = () => { setTv({ on: true, input: 'pad', padLine }); };
  const stub = () => { const calls = []; tvHooks.picker = vi.fn((o) => new Promise((resolve) => { calls.push({ o, resolve }); })); return calls; };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('with TV mode off there is no open button (the box is as it was)', () => {
    setup();
    openSheet('together');
    expect(html()).not.toContain('wt-petname-open');
    expect(html()).toContain('id="wt-petname-input"');
  });
  it('with TV mode on and the picker loaded: a button beside the box, with the words from the table', () => {
    tvOn(); stub();
    setup();
    openSheet('together');
    expect(html()).toContain(`id="wt-petname-open" class="wt-name-open">${padLine('pad.picker.empty')} ✏️</button>`);
    expect(html()).toContain('id="wt-petname-input"');
  });
  it('pressing it opens the picker with the walker title; OK saves the name through the same rule', async () => {
    tvOn(); const calls = stub();
    const { progression } = setup();
    openSheet('together');
    boxes({ '#wt-petname-input': '' });
    await tap({ id: 'wt-petname-open' });
    expect(calls[0].o.titleId).toBe('pad.picker.title.walker');
    calls[0].resolve('Leafpaw');
    await tick();
    expect(progression.state.petName).toBe('Leafpaw');
    expect(text(sheet())).toContain('Your friend name: Leafpaw');
  });
  it('Cancel saves nothing; a name the rule refuses is not saved either', async () => {
    tvOn(); const calls = stub();
    const { progression } = setup();
    openSheet('together');
    boxes({ '#wt-petname-input': '' });
    await tap({ id: 'wt-petname-open' });
    calls[0].resolve(null);
    await tick();
    expect(progression.state.petName).toBe(null);
    await tap({ id: 'wt-petname-open' });
    calls[1].resolve('Discord');
    await tick();
    expect(progression.state.petName).toBe(null);
  });
});
