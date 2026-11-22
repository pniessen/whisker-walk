import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryStorage } from './helpers/storage.js';
import { withOffWords } from './helpers/offwords.js';

// Cat login M1: after a load that changed the cat key the sheet says it is
// bringing the cat and asks the page to reload once; Undo of such a load does
// the same. Same no-DOM stand-in as test/homebase.unlink.test.js.
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

const { CONFIRM_DELAY_MS } = await import('../src/ui/colonypanel.js');
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

function setup({ confirmResult = { ok: true, reload: true }, linked = null } = {}) {
  const reload = vi.fn();
  const sync = {
    available: true, getCode: () => linked,
    previewLoad: vi.fn(async (c) => ({ ok: true, preview: { code: c, secret: 's', payload: { save: {} }, local: { rank: 'Kitten', points: 1, lifetimePoints: 1, bestWalk: 1 }, cloud: { rank: 'Kitten', points: 2, lifetimePoints: 2, bestWalk: 2 } } })),
    confirmLoad: vi.fn(async () => { progression.setPetName('Mittens'); return confirmResult; }),
  };
  const progression = createProgression(memStorage());
  progression.setPetName('Pickle');
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const starts = [];
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: (o) => starts.push(o), rooms: null, sync, onlineDelete: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, reload });
  hb.show();
  dressingMock.opts.onOpenSheet('sync');
  return { sync, progression, hb, reload, starts };
}
async function loadAndConfirm() {
  await click({ id: 'sync-load' });
  await vi.waitFor(() => expect(html()).toContain('sync-confirm-load'));
  await click({ id: 'sync-confirm-load' });
}

describe('a load that changed the cat key', () => {
  it('shows "Bringing Mittens here…" and reloads once', async () => {
    const s = setup();
    await loadAndConfirm();
    expect(html()).toContain('Bringing Mittens here…');
    expect(s.reload).not.toHaveBeenCalled(); // the words are up first
    vi.advanceTimersByTime(1000);
    expect(s.reload).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('says the same under the everyday words', async () => {
    await withOffWords(async () => {
      const s = setup();
      await loadAndConfirm();
      expect(html()).toContain('Bringing Mittens here…');
      vi.advanceTimersByTime(1000);
      expect(s.reload).toHaveBeenCalledTimes(1);
    });
  });

  it('no reload when the key did not change', async () => {
    const s = setup({ confirmResult: { ok: true } });
    await loadAndConfirm();
    vi.advanceTimersByTime(5000);
    expect(s.reload).not.toHaveBeenCalled();
    expect(html()).not.toContain('Bringing');
  });

  it('no reload when the load failed', async () => {
    const s = setup({ confirmResult: { ok: false, error: 'That didn’t work, so nothing was changed.' } });
    await loadAndConfirm();
    vi.advanceTimersByTime(5000);
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('a walk starting closes the home screen, so the load card cannot be confirmed in a walk', async () => {
    const s = setup();
    await click({ id: 'sync-load' });
    await vi.waitFor(() => expect(html()).toContain('sync-confirm-load'));
    s.hb.hide();
    expect(doc.root.classes.has('hidden')).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(s.reload).not.toHaveBeenCalled();
  });
});

describe('Undo of a cloud load that changed the key', () => {
  it('reloads once, with the same words', async () => {
    const s = setup({ linked: 'PLUM-OTTER-CROW-42' });
    vi.spyOn(s.progression, 'backupInfo').mockReturnValue([{ kind: 'cloud', at: 1, newer: false, restorable: true, points: 3, lifetimePoints: 3 }]);
    vi.spyOn(s.progression, 'restoreBackup').mockReturnValue(true);
    vi.spyOn(s.progression, 'takeKeyChanged').mockReturnValue(true);
    s.hb.show();
    dressingMock.opts.onOpenSheet('sync');
    await click({ id: 'x', closest: (sel) => (sel === '[data-backup-restore]' ? { getAttribute: () => 'cloud' } : null) });
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes');
    expect(html()).toContain('Bringing Pickle here…');
    vi.advanceTimersByTime(1000);
    expect(s.reload).toHaveBeenCalledTimes(1);
  });
});
