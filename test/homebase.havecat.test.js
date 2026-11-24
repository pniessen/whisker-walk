import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';
import { withOffWordsAsync } from './helpers/offwords.js';
import { setTv, resetTv } from '../src/tvseam.js';

// Cat login M5.2: the "I already have a cat" link on the home screen of a brand-new device. Same no-DOM
// stand-in as test/homebase.catkey.test.js.
vi.mock('../src/thumbnails.js', () => ({ fillFoundThumbs: () => {}, menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
const dressingMock = vi.hoisted(() => ({ opts: null }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    dressingMock.opts = opts;
    return {
      html: (a) => `<header></header>${a?.startHtml ?? ''}`,
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
      handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
      ui: { builder: null },
    };
  },
}));

await import('../src/ui/catlogin.js'); // the sheet's chunk, cached before the first test
const { sheetDrawn } = await import('./helpers/catsheet.js');
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
  resetTv();
  delete globalThis.document;
  warn.mockRestore();
});

const answer = (el, a, detail = 1) => el.listeners.click({ target: { closest: () => ({ getAttribute: () => a }) }, detail });
const card = () => doc.body.children.find((c) => c.id === 'confirm-card');
const click = (target) => doc.root.listeners.click({ target: { closest: () => null, dataset: {}, ...target }, detail: 1 });
const type = (id, value) => doc.root.listeners.input({ target: { id, value } });
const html = () => doc.root.innerHTML;
const tick = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };


const LINK = 'I already have a cat';
const BANNED_IN_LINK = /clan|warrior|kit\b|twoleg/i;

async function setup({ code = null, available = true, mutate = null } = {}) {
  const sync = {
    available, getCode: () => code, catStatus: () => null,
    saveToCloud: vi.fn(async () => ({ ok: true })), previewLoad: vi.fn(async () => ({ ok: false, error: 'x' })),
    catchUp: vi.fn(async () => 'ok'), syncNow: vi.fn(async () => ({ ok: true, message: '' })), unlink: vi.fn(),
  };
  const progression = createProgression(memStorage());
  mutate?.(progression);
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const focused = [];
  doc.root.querySelector = (sel) => (sel === '#sync-load-code' && html().includes('id="sync-load-code"') ? { focus: () => focused.push(sel) } : null);
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync, onlineDelete: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, reload: () => {} });
  hb.show();
  return { sync, hb, progression, focused };
}

describe('"I already have a cat" on the home screen', () => {
  it('shows on a brand-new device with nothing linked, after Start, and makes no request', async () => {
    const s = await setup();
    const h = html();
    expect(h).toContain(`<button id="btn-have-cat" class="hb-have-cat" type="button">${LINK}</button>`);
    expect(h.indexOf('btn-have-cat')).toBeGreaterThan(h.indexOf('id="btn-start"'));
    // the pad's entry control is Start (class primary), never the link
    expect(h.match(/<button id="btn-have-cat"[^>]*>/)[0]).not.toMatch(/primary|data-pad-default/);
    expect(h).toContain('id="btn-start" class="primary"');
    for (const f of [s.sync.saveToCloud, s.sync.previewLoad, s.sync.catchUp, s.sync.syncNow]) expect(f).not.toHaveBeenCalled();
  });

  it('is not shown on a device linked to a cloud save', async () => {
    await setup({ code: 'PLUM-OTTER-CROW-MAPLE' });
    expect(html()).not.toContain('btn-have-cat');
  });

  it('is not shown when cloud saves are not set up', async () => {
    await setup({ available: false });
    expect(html()).not.toContain('btn-have-cat');
  });

  it('is not shown once there is any progress: points, a finished walk, or a guided walk begun or finished', async () => {
    await setup({ mutate: (p) => p.addPoints(5) });
    expect(html()).not.toContain('btn-have-cat');
    await setup({ mutate: (p) => { p.completeWalk('neighborhood'); } });
    expect(html()).not.toContain('btn-have-cat');
    for (const first of ['part', 'done', 'skipped', 'old']) {
      await setup({ mutate: (p) => p.setTutorialFirst(first) });
      expect(html(), first).not.toContain('btn-have-cat');
    }
  });

  it('a tap opens the My cat sheet on the Load cat box and focuses it, still sending nothing', async () => {
    const s = await setup();
    await click({ id: 'btn-have-cat', closest: (sel) => (sel === '#btn-have-cat' ? {} : null) });
    await tick();
    const h = html();
    expect(h).toContain('id="sync-load-code"');
    expect(h).toContain('aria-expanded="true"'); // Load cat is open
    expect(s.focused.length).toBeGreaterThan(0);
    for (const f of [s.sync.saveToCloud, s.sync.previewLoad, s.sync.syncNow]) expect(f).not.toHaveBeenCalled();
  });

  it('everyday words: the same plain sentence, none of the family\'s words', async () => {
    await withOffWordsAsync(async () => {
      await setup();
      const m = html().match(/id="btn-have-cat"[^>]*>([^<]*)</);
      expect(m[1]).toBe(LINK);
      expect(m[1]).not.toMatch(BANNED_IN_LINK);
    });
  });
});
