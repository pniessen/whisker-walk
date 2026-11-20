import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Menu review #7 (2026-11-20): Colony becomes "My clan" ("My cats" in the
// everyday words), and the cat friends live there: her stray friends (from the
// Journal) and the player pets (from Play together). Driven through
// createHomeBase over the same no-DOM stand-in as homebase.grownups.test.js.
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
const { SHEET_NAME, SHEET_LABEL } = await import('../src/ui/dressingroom.js');
const { phrase } = await import('../src/clanphrases.js');
const { words } = await import('../src/wordset.js');
const { withOffWords } = await import('./helpers/offwords.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
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
const OPEN_ROOMS = { available: true, getState: () => null, onChange() {} };
const cloudStub = () => ({
  available: true, myId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  fetchFriendships: vi.fn(() => Promise.resolve([])), fetchProfiles: vi.fn(() => Promise.resolve([])),
});
function setup({ cloud = null, state } = {}) {
  const progression = createProgression(memStorage());
  if (state) state(progression.state);
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: OPEN_ROOMS, sync: null, cloud, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
  hb.show();
  return { progression, hb };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const tileName = (h) => (h.match(/data-dr-sheet="colony"[^>]*>[\s\S]*?<span class="hb-tile-name">([^<]*)<\/span>/) ?? [])[1];

describe('the phrase', () => {
  it('is built from the word set\'s group word in the family words, and plain in the everyday words', () => {
    expect(phrase('menu.myCats')).toBe(`My ${words().CLAN_SUFFIX.toLowerCase()}`);
    expect(phrase('menu.myCats')).toBe('My clan');
    withOffWords(() => expect(phrase('menu.myCats')).toBe('My cats'));
  });
  it('names the sheet wherever a label is read', () => {
    expect(SHEET_NAME.colony).toBe('My clan');
    expect(SHEET_LABEL.colony).toBe('🐈 My clan');
    withOffWords(() => expect(SHEET_LABEL.colony).toBe('🐈 My cats'));
  });
});

describe('My clan on the Menu and as a sheet', () => {
  it('the Menu tile and the sheet heading say My clan', () => {
    setup();
    openSheet('menu');
    expect(tileName(html())).toBe('My clan');
    openSheet('colony');
    expect(html()).toContain('<h2>My clan 🐈</h2>');
  });
  it('says My cats in the everyday words', () => {
    withOffWords(() => {
      setup();
      openSheet('menu');
      expect(tileName(html())).toBe('My cats');
      openSheet('colony');
      expect(html()).toContain('<h2>My cats 🐈</h2>');
    });
  });
});

describe('the cat friends live in My clan', () => {
  it('colony cards, then Stray cats, then Player pets; the pets load when the sheet opens', () => {
    const cloud = cloudStub();
    const { progression } = setup({ cloud });
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    openSheet('colony');
    const h = html();
    expect(h).toContain('class="friends-section"');
    expect(h).toContain('<h3>Stray cats</h3>');
    expect(h).toContain('Smudge');
    expect(h).toContain('<h3>Player pets</h3>');
    expect(h.indexOf('colony-section')).toBeLessThan(h.indexOf('<h3>Stray cats</h3>'));
    expect(h.indexOf('<h3>Stray cats</h3>')).toBeLessThan(h.indexOf('<h3>Player pets</h3>'));
    expect(cloud.fetchFriendships).toHaveBeenCalled();
  });
  it('the Journal has no Stray cats; Play together has no Player pets but keeps the friend code', () => {
    const cloud = cloudStub();
    setup({ cloud, state: (st) => { st.petName = 'Mittens'; } });
    openSheet('journal');
    expect(html()).not.toContain('Stray cats');
    openSheet('together');
    const h = html();
    expect(h).not.toContain('Player pets');
    expect(h).toContain('id="friend-code-input"');
    expect(h).toContain('id="friend-code-add"');
    expect(cloud.fetchFriendships).not.toHaveBeenCalled();
  });
  it('offline: Stray cats stay, there is no Player pets, nothing throws', () => {
    const { progression } = setup({ cloud: null });
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    expect(() => openSheet('colony')).not.toThrow();
    const h = html();
    expect(h).toContain('<h3>Stray cats</h3>');
    expect(h).not.toContain('Player pets');
  });
});
