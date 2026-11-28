import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryStorage as memStorage } from './helpers/storage.js';

// New player (in the My cat sheet) and Switch player (in Game settings) (src/players.js). Same no-DOM stand-in as homebase.grownups.test.js.
// Six kid tiles (the
// last is My den, which says "go now"), then Sound & controls as a slim row,
// then one quiet For grown-ups door. For grown-ups holds Game settings, Cloud
// save, Gift code and Do the first lesson again; Back from one of its sheets
// goes to it, then the Menu, then the cat. Driven through createHomeBase over
// the same no-DOM stand-in as homebase.launch.test.js.
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
const { SHEET_NAME, SHEET_ICON, GROWNUP_SHEETS, HOME_SHEETS, resolveSheet } = await import('../src/ui/dressingroom.js');
const { line: tutorialLine } = await import('../src/tutorialwords.js');

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
  vi.useFakeTimers();
  doc = fakeDocument();
  globalThis.document = doc;
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true,
    value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.document;
  delete globalThis.localStorage;
});

const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
const { addPlayer, readIndex } = await import('../src/players.js');
const { SAVE_KEY } = await import('../src/progression.js');
await import('../src/ui/catlogin.js'); // the sheet's chunk, cached first
const { sheetDrawn } = await import('./helpers/catsheet.js');

async function setup({ withPlayers = true } = {}) {
  const raw = memStorage({ [SAVE_KEY]: JSON.stringify({ version: 4, points: 21 }) }, { removeItem: true, expose: 'map' });
  const progression = createProgression(raw);
  const reload = vi.fn();
  const hb = createHomeBase({ players: withPlayers ? { raw, saveKey: SAVE_KEY } : null, reload, progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync: { available: true, getCode: () => null, catStatus: () => null }, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
  hb.show();
  dressingMock.opts.onOpenSheet('sync'); // My cat: where New player lives
  await sheetDrawn(html);
  return { raw, hb, reload };
}
const html = () => doc.root.innerHTML;
const click = async (target) => doc.root.listeners.click({ target: { id: '', dataset: {}, closest: () => null, ...target }, detail: 1 });
const card = () => doc.body.children.find((c) => c.id === 'confirm-card' && !c.removed);

describe('New player and Switch player', () => {
  it('shows a New player button with its one-line note in the My cat sheet, not in Game settings', async () => {
    await setup();
    expect(html()).toContain('id="catlogin-new-player"');
    expect(html()).toContain('Saves this player exactly as is and starts a fresh player with a new cat.');
    expect(html()).not.toContain('data-switch-player');
    dressingMock.opts.onOpenSheet('settings');
    expect(html()).not.toContain('catlogin-new-player');
    expect(html()).not.toContain('New player');
  });
  it('says the device is full instead of offering the button when there is no room', async () => {
    const { raw } = await setup();
    for (let i = 0; i < 8; i++) addPlayer(raw, { saveKey: SAVE_KEY });
    dressingMock.opts.onOpenSheet('menu');
    dressingMock.opts.onOpenSheet('sync');
    await sheetDrawn(html);
    expect(html()).not.toContain('catlogin-new-player');
    expect(html()).toContain('This device has all the players it can hold.');
  });
  it('is absent when the page could not set up per-player storage', async () => {
    await setup({ withPlayers: false });
    expect(html()).not.toContain('catlogin-new-player');
  });
  it('New player asks first, in kind words, with the safe answer first; Not now changes nothing', async () => {
    const { raw, reload } = await setup();
    await click({ id: 'catlogin-new-player' });
    const c = card();
    expect(c).toBeTruthy();
    expect(c.innerHTML).toContain('Start a new player?');
    expect(c.innerHTML).toContain('Your current player is saved and you can switch back.');
    expect(c.innerHTML.indexOf('confirm-card-no')).toBeLessThan(c.innerHTML.indexOf('confirm-card-yes'));
    c.listeners.click({ target: { closest: () => ({ getAttribute: () => 'no' }) }, detail: 1 });
    expect(reload).not.toHaveBeenCalled();
    expect(raw.map.has('whisker-walk-players')).toBe(false);
  });
  it('Yes keeps the old save as it is, makes a new player, and reloads; then the list offers the old player', async () => {
    const { raw, reload } = await setup();
    const save = raw.map.get(SAVE_KEY);
    await click({ id: 'catlogin-new-player' });
    vi.advanceTimersByTime(5000);
    card().listeners.click({ target: { closest: () => ({ getAttribute: () => 'yes' }) }, detail: 1 });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(raw.map.get(SAVE_KEY)).toBe(save);
    expect(raw.map.get(`${SAVE_KEY}.before-new-player`)).toBe(save);
    expect(readIndex(raw)).toEqual({ active: 'p2', players: [{ id: 'p1' }, { id: 'p2' }] });
  });
  it('lists the players and a tap on another one switches the pointer and reloads', async () => {
    const { raw, hb, reload } = await setup();
    addPlayer(raw, { saveKey: SAVE_KEY });
    dressingMock.opts.onOpenSheet('menu');
    dressingMock.opts.onOpenSheet('settings');
    expect(html()).toContain('Players on this device');
    expect(html()).toContain('data-switch-player="p1"');
    expect(html()).toContain('data-switch-player="p2"');
    expect(html()).toContain('Player 2');
    expect(html()).toMatch(/data-switch-player="p2"[^>]*aria-current="true" disabled/);
    // tapping the player who is playing does nothing; the other one switches
    click({ closest: (s) => (s === '[data-switch-player]' ? { disabled: true, getAttribute: () => 'p2' } : null) });
    expect(reload).not.toHaveBeenCalled();
    click({ closest: (s) => (s === '[data-switch-player]' ? { disabled: false, getAttribute: () => 'p1' } : null) });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(readIndex(raw).active).toBe('p1');
    expect(hb).toBeTruthy();
  });
});
