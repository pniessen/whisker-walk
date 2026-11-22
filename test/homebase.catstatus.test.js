import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords } from './helpers/offwords.js';

// Cat login M2: the Cloud save sheet's catch-up line, in both word sets. Same no-DOM
// stand-in as test/homebase.catkey.test.js.
vi.mock('../src/thumbnails.js', () => ({ fillFoundThumbs: () => {}, menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    return {
      html: () => '<header></header>',
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      ui: { builder: null },
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');

const memStorage = () => memoryStorage({}, { removeItem: true });
function fakeEl(doc) {
  const el = {
    className: '', innerHTML: '', textContent: '', id: '', children: [], listeners: {}, attrs: {}, style: {}, removed: false,
    classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() { el.removed = true; if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el); },
    querySelector() { return null; },
    focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200 }; },
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
  return el;
}
let doc;
let warn;
beforeEach(() => {
  vi.useFakeTimers();
  doc = {};
  doc.createElement = () => fakeEl(doc);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.body = fakeEl(doc);
  doc.root = fakeEl(doc);
  doc.root.classList.add('hidden');
  doc.getElementById = (id) => (id === 'homebase' ? doc.root : null);
  globalThis.document = doc;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.document;
  warn.mockRestore();
});

const answer = (el, a, detail = 1) => el.listeners.click({ target: { closest: () => ({ getAttribute: () => a }) }, detail });
const card = () => doc.body.children.find((c) => c.id === 'confirm-card');
const click = (target) => doc.root.listeners.click({ target: { closest: () => null, dataset: {}, ...target }, detail: 1 });
const html = () => doc.root.innerHTML;


function setup(state = null) {
  const sync = {
    available: true, getCode: () => 'PLUM-OTTER-CROW-42',
    catStatus: vi.fn(() => (state ? { state, name: 'Mittens' } : null)),
  };
  const progression = createProgression(memStorage());
  progression.setPetName('Mittens');
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const starts = [];
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: (o) => starts.push(o), rooms: null, sync, onlineDelete: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, reload: () => {} });
  hb.show();
  dressingMock.opts.onOpenSheet('sync');
  return { sync, hb, starts, set: (s) => { state = s; hb.refreshSync(); } };
}
const line = () => html().match(/<div class="tag catlogin-status"[^>]*>([^<]*)<\/div>/)?.[1] ?? null;

const CLAN = {
  saved: 'Mittens is safe',
  offline: 'No internet. Mittens is safe on this device. It will catch up later.',
  catching: 'Catching up…',
  caught: 'Mittens caught up. Paws, finds and outfits from both devices are in camp.',
  signedout: 'This cat moved to a new cat code. Type the new one to bring Mittens back.',
};
const EVERYDAY = { ...CLAN, caught: 'Mittens caught up. Paws, finds and outfits from both devices are here.' };

describe('the catch-up line on the Cloud save sheet', () => {
  for (const [state, words] of Object.entries(CLAN)) {
    it(`${state}: says "${words.slice(0, 28)}…" in the family's words`, () => {
      setup(state);
      expect(line()).toBe(words);
    });
    it(`${state}: and the everyday words`, () => {
      withOffWords(() => {
        setup(state);
        expect(line()).toBe(EVERYDAY[state]);
      });
    });
  }
  it('says nothing before the first catch-up, and nothing for a state it does not know', () => {
    setup(null);
    expect(line()).toBe(null);
    setup('who knows');
    expect(line()).toBe(null);
  });
  it('is drawn when the state changes while the sheet is open, and only then', () => {
    const s = setup('catching');
    expect(line()).toBe('Catching up…');
    s.set('saved');
    expect(line()).toBe('Mittens is safe');
    s.hb.hide(); // a walk starts: nothing is redrawn under it
    const before = html();
    s.set('caught');
    expect(html()).toBe(before);
  });
  it('no spinner blocks the Start button: catching up disables nothing, and Start still starts a walk', async () => {
    const s = setup('catching');
    expect(html()).not.toMatch(/spinner|disabled/i);
    await click({ id: 'btn-start' });
    expect(s.starts).toHaveLength(1);
  });
  it('a hostile name cannot break the line', () => {
    const sync = { available: true, getCode: () => 'X', catStatus: () => ({ state: 'saved', name: '<img src=x onerror=1>' }) };
    const progression = createProgression(memStorage());
    const settings = { get: () => null, set() {}, all: () => ({}) };
    const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync, onlineDelete: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, reload: () => {} });
    hb.show();
    dressingMock.opts.onOpenSheet('sync');
    expect(html()).not.toContain('<img');
  });
});
