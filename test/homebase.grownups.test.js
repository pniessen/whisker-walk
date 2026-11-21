import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Menu review #6 and #14 (2026-11-20): the Menu's doors. Six kid tiles (the
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

// a cloud save set up but not linked yet (Cloud save's sheet asks getCode())
const SYNC = { available: true, getCode: () => null };
function setup({ rooms = OPEN_ROOMS, sync = SYNC, state } = {}) {
  const progression = createProgression(memStorage());
  if (state) state(progression.state);
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
  hb.show();
  return { progression, hb };
}
const openSheet = (id) => dressingMock.opts.onOpenSheet(id);
const html = () => doc.root.innerHTML;
const clickRoot = (sels) => doc.root.listeners.click({ target: { id: '', dataset: {}, closest: (sel) => (sels[sel] ?? null) } });
const count = (h, s) => h.split(s).length - 1;
// The Menu's tile grid, and the Menu with the grid taken out.
const tilesOf = (h) => (h.match(/<div class="hb-tiles">([\s\S]*?)<\/div>/) ?? [null, null])[1];
const outsideTiles = (h) => h.replace(/<div class="hb-tiles">[\s\S]*?<\/div>/, '');
const tileOrder = (h) => [...tilesOf(h).matchAll(/<button class="hb-tile[^"]*"(?: data-dr-sheet="([^"]+)")?(?: id="([^"]+)")?/g)]
  .map((m) => m[1] ?? `#${m[2]}`);

describe('the For grown-ups sheet id', () => {
  it('is a home sheet named For grown-ups with the gear; it opens Game settings, Cloud save and Gift code', () => {
    expect(HOME_SHEETS).toContain('grownups');
    expect(resolveSheet('grownups')).toBe('grownups');
    expect(SHEET_NAME.grownups).toBe('For grown-ups');
    expect(SHEET_ICON.grownups).toBe('⚙️');
    expect(GROWNUP_SHEETS).toEqual(['settings', 'sync', 'code']);
  });
});

describe('the Menu\'s doors', () => {
  it('menu has six tiles then a Sound & controls row then one For grown-ups door', () => {
    setup();
    openSheet('menu');
    const h = html();
    expect(tileOrder(h)).toEqual(['together', 'colony', 'journal', 'album', 'skills', '#btn-visit-den']);
    expect(tilesOf(h)).not.toContain('data-dr-sheet="controls"');
    expect(outsideTiles(h)).toContain('<button class="hb-row" data-dr-sheet="controls">');
    expect(count(h, 'data-dr-sheet="controls"')).toBe(1);
    expect(h).toMatch(/<button class="hb-row" data-dr-sheet="controls"><span[^>]*aria-hidden="true">🔊<\/span><span[^>]*>Sound &amp; controls<\/span>/);
    expect(count(h, 'data-dr-sheet="grownups"')).toBe(1);
    expect(h).toContain('<button class="hb-grownups-door" data-dr-sheet="grownups">');
    expect(h).toMatch(/data-dr-sheet="grownups">[\s\S]*?For grown-ups[\s\S]*?<\/button>/);
    for (const id of ['settings', 'sync', 'code']) expect(h).not.toContain(`data-dr-sheet="${id}"`);
    // in that order: the tiles, the row, the door
    expect(h.indexOf('class="hb-tiles"')).toBeLessThan(h.indexOf('data-dr-sheet="controls"'));
    expect(h.indexOf('data-dr-sheet="controls"')).toBeLessThan(h.indexOf('data-dr-sheet="grownups"'));
    // the door is quiet: nothing pink on the Menu
    expect(h).not.toContain('primary');
  });
  it('den tile says go now', () => {
    setup();
    openSheet('menu');
    expect(html()).toMatch(/id="btn-visit-den"[^>]*>[\s\S]*?<small>go now<\/small><\/button>/);
  });
  it('Legacy Edition Menu renders the same doors', () => {
    setup({ state: (st) => { st.edition = 'legacy'; } });
    openSheet('menu');
    const h = html();
    expect(tileOrder(h)).toEqual(['together', 'colony', 'journal', 'album', 'skills', '#btn-visit-den']);
    expect(outsideTiles(h)).toContain('<button class="hb-row" data-dr-sheet="controls">');
    expect(count(h, 'data-dr-sheet="grownups"')).toBe(1);
    for (const id of ['settings', 'sync', 'code']) expect(h).not.toContain(`data-dr-sheet="${id}"`);
  });
  it('offline (no rooms, no cloud): five tiles and the den, no Play together, and nothing throws', () => {
    expect(() => setup({ rooms: null, sync: null })).not.toThrow();
    expect(() => openSheet('menu')).not.toThrow();
    const h = html();
    expect(tileOrder(h)).toEqual(['colony', 'journal', 'album', 'skills', '#btn-visit-den']);
    expect(h).not.toContain('data-dr-sheet="together"');
    expect(count(h, 'data-dr-sheet="grownups"')).toBe(1);
    expect(() => openSheet('grownups')).not.toThrow();
    expect(html()).toContain('data-sheet="grownups"');
  });
});

describe('the For grown-ups sheet', () => {
  it('For grown-ups lists Game settings, Cloud save, Gift code and Do the first lesson again', () => {
    setup();
    openSheet('menu');
    openSheet('grownups');
    const h = html();
    expect(h).toContain('data-sheet="grownups"');
    expect(h).toContain('<h2>For grown-ups ⚙️</h2>');
    const at = ['data-dr-sheet="settings"', 'data-dr-sheet="sync"', 'data-dr-sheet="code"', 'id="set-replay-first"'].map((s) => h.indexOf(s));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(h).toContain('Game settings');
    expect(h).toContain('Cloud save');
    expect(h).toContain('Gift code');
    // the same row as the three above it: an icon, the words, the ›
    expect(h).toContain(`<button type="button" id="set-replay-first" class="hb-row"><span class="hb-row-icon" aria-hidden="true">🎓</span>`
      + `<span class="hb-row-name">${tutorialLine('guide.replay')}</span><span class="hb-row-go" aria-hidden="true">›</span></button>`);
    // quiet rows, not pink
    expect(h).not.toContain('primary');
  });
  it('with sync unavailable there is no Cloud save button', () => {
    setup({ sync: null });
    openSheet('menu');
    openSheet('grownups');
    const h = html();
    expect(h).not.toContain('data-dr-sheet="sync"');
    expect(h).toContain('data-dr-sheet="settings"');
    expect(h).toContain('data-dr-sheet="code"');
    expect(h).toContain('id="set-replay-first"');
  });
  it('the replay button keeps its wiring: the next street walk is the lesson, and its line shows', () => {
    const { progression } = setup();
    const replay = vi.spyOn(progression, 'setTutorialFirst');
    openSheet('menu');
    openSheet('grownups');
    doc.root.listeners.click({ target: { id: 'set-replay-first', dataset: {}, closest: () => null } });
    expect(replay).toHaveBeenCalledWith(null);
    // a tap on its words (the span inside the row) does the same
    replay.mockClear();
    doc.root.listeners.click({ target: { id: '', dataset: {}, closest: (sel) => (sel === '#set-replay-first' ? {} : null) } });
    expect(replay).toHaveBeenCalledWith(null);
    expect(html()).toContain('data-sheet="grownups"');
    expect(html()).toContain(tutorialLine('guide.replay-set'));
  });
  it('Sound & controls no longer has the replay button', () => {
    setup();
    openSheet('menu');
    openSheet('controls');
    expect(html()).toContain('data-sheet="controls"');
    expect(html()).not.toContain('set-replay-first');
  });
  it('has no Start dock', () => {
    setup();
    openSheet('menu');
    openSheet('grownups');
    const h = html();
    expect(h).not.toContain('hb-sheet-dock');
    expect(h).not.toContain('id="btn-start"');
  });
});

describe('Back through For grown-ups', () => {
  it('back from Game settings goes to For grown-ups, then the Menu', () => {
    const { hb } = setup();
    openSheet('menu');
    expect(hb.depth()).toBe(1);
    openSheet('grownups');
    expect(hb.depth()).toBe(2);
    expect(html()).toContain('← Back to the menu');
    openSheet('settings');
    expect(hb.depth()).toBe(3);
    let h = html();
    expect(h).toContain('<button id="hb-back" class="hb-back">← Back</button>');
    expect(h).toContain('id="hb-home"'); // home is three Backs away: the cat face goes straight there
    expect(hb.back()).toBe(true);
    expect(html()).toContain('data-sheet="grownups"');
    expect(html()).toContain('← Back to the menu');
    expect(hb.depth()).toBe(2);
    expect(hb.back()).toBe(true);
    expect(html()).toContain('data-sheet="menu"');
    expect(hb.depth()).toBe(1);
    expect(hb.back()).toBe(true);
    expect(html()).not.toContain('data-sheet=');
    expect(hb.depth()).toBe(0);
    // the same chain by the sheet's own Back button, from Cloud save and Gift code
    for (const id of ['sync', 'code']) {
      openSheet('menu');
      openSheet('grownups');
      openSheet(id);
      expect(hb.depth()).toBe(3);
      h = html();
      expect(h).toContain(`data-sheet="${id}"`);
      expect(h).toContain('← Back</button>');
      clickRoot({ '#hb-back': {} });
      expect(html()).toContain('data-sheet="grownups"');
      expect(hb.depth()).toBe(2);
      clickRoot({ '#hb-back': {} });
      expect(html()).toContain('data-sheet="menu"');
      expect(hb.depth()).toBe(1);
      clickRoot({ '#hb-back': {} });
      expect(hb.depth()).toBe(0);
    }
  });
  it('the cat face from Game settings goes home in one tap', () => {
    const { hb } = setup();
    openSheet('menu');
    openSheet('grownups');
    openSheet('settings');
    clickRoot({ '#hb-home': {} });
    expect(html()).not.toContain('data-sheet=');
    expect(hb.depth()).toBe(0);
  });
  it('a question over Game settings is one more layer, and Not now leaves Game settings', () => {
    const { hb, progression } = setup();
    progression.addPoints(40);
    openSheet('menu');
    openSheet('grownups');
    openSheet('settings');
    doc.root.listeners.click({ target: { id: 'btn-reset', dataset: {}, closest: () => null }, detail: 1 });
    expect(hb.depth()).toBe(4);
    expect(hb.back()).toBe(true);
    expect(progression.state.points).toBe(40);
    expect(html()).toContain('data-sheet="settings"');
    expect(hb.depth()).toBe(3);
  });
  it('For grown-ups opened straight from home goes back to the cat, and its sheets back to it', () => {
    const { hb } = setup();
    openSheet('grownups');
    expect(hb.depth()).toBe(1);
    expect(html()).toContain('← Back to my cat');
    openSheet('settings');
    expect(hb.depth()).toBe(2);
    expect(hb.back()).toBe(true);
    expect(html()).toContain('data-sheet="grownups"');
    expect(hb.depth()).toBe(1);
    expect(hb.back()).toBe(true);
    expect(hb.depth()).toBe(0);
  });
});
