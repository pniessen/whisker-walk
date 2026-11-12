import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The linked Cloud save sheet: Unlink asks first (the confirm card Start
// over uses), sits apart from Sync now, and Load from cloud is there while
// linked, going through the same compare-first preview. Same no-DOM stand-in
// as test/homebase.deleteonline.test.js.
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
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

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
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

const CODE = 'PLUM-OTTER-CROW-42';
const BUTTON = '<button id="sync-delete-online" class="danger" >Delete my online data</button>';
const answer = (el, a, detail = 1) => el.listeners.click({ target: { closest: () => ({ getAttribute: () => a }) }, detail });
const card = () => doc.body.children.find((c) => c.id === 'confirm-card');
const click = (target) => doc.root.listeners.click({ target: { closest: () => null, dataset: {}, ...target }, detail: 1 });
const html = () => doc.root.innerHTML;

function setup({ code = null, result = { outcome: 'done', player: 'ok', save: 'ok' }, rooms = null, colonySync = null, onlineDelete } = {}) {
  let linked = code;
  const sync = { available: true, getCode: () => linked, unlink: vi.fn(() => { linked = null; }), previewLoad: vi.fn(async (c) => ({ ok: true, preview: { code: c, secret: 's', payload: { save: {} }, local: { rank: 'Kitten', points: 1, lifetimePoints: 1, bestWalk: 1 }, cloud: { rank: 'Kitten', points: 2, lifetimePoints: 2, bestWalk: 2 } } })) };
  let release;
  const od = onlineDelete ?? {
    available: true,
    run: vi.fn(() => new Promise((r) => { release = () => { if (result.outcome === 'done') linked = null; r(result); }; })),
  };
  const progression = createProgression(memStorage());
  progression.setPetName('Mittens');
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync, onlineDelete: od, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync, myId: 'me', toast: () => {} });
  hb.show();
  dressingMock.opts.onOpenSheet('sync');
  return { od, sync, progression, hb, release: () => release() };
}
async function confirmYes() {
  await click({ id: 'sync-delete-online' });
  vi.advanceTimersByTime(CONFIRM_DELAY_MS);
  answer(card(), 'yes');
}


describe('Unlink on the linked Cloud save sheet', () => {
  it('sits on its own row, apart from Sync now, and keeps its id', () => {
    setup({ code: CODE });
    const h = html();
    expect(h).toContain('<div class="sync-unlink-row">');
    expect(h).toContain('<button id="sync-unlink" class="danger" >Unlink</button>');
    const actions = h.slice(h.indexOf('<div class="sync-actions">'), h.indexOf('<div class="sync-unlink-row">'));
    expect(actions).toContain('id="sync-now"');
    expect(actions).not.toContain('sync-unlink');
  });
  it('asks first: the code in the note, Keep saving first, nothing unlinked yet', async () => {
    const s = setup({ code: CODE });
    await click({ id: 'sync-unlink' });
    const h = card().innerHTML;
    expect(h).toContain('Stop saving to the cloud?');
    expect(h).toContain(`Your save code is ${CODE}. Write it down. It’s the only way to get this save back.`);
    expect(h).toContain('id="confirm-card-no" data-confirm="no">Keep saving</button>');
    expect(h).toContain('>Yes, stop</button>');
    expect(h.indexOf('confirm-card-no')).toBeLessThan(h.indexOf('confirm-card-yes'));
    expect(s.sync.unlink).not.toHaveBeenCalled();
  });
  it('Keep saving and Escape leave it linked', async () => {
    const s = setup({ code: CODE });
    await click({ id: 'sync-unlink' });
    answer(card(), 'no');
    await click({ id: 'sync-unlink' });
    card().listeners.keydown({ key: 'Escape' });
    expect(card()).toBeUndefined();
    expect(s.sync.unlink).not.toHaveBeenCalled();
    expect(s.sync.getCode()).toBe(CODE);
  });
  it('Yes, stop unlinks', async () => {
    const s = setup({ code: CODE });
    await click({ id: 'sync-unlink' });
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes');
    expect(s.sync.unlink).toHaveBeenCalledTimes(1);
    expect(html()).toContain('<div class="sync-unlinked">');
  });
});

describe('the save code box', () => {
  it('has a visible label', () => {
    setup();
    expect(html()).toContain('<label class="code-label" for="sync-load-code">Save code from another device</label>');
  });
});

describe('Load from cloud while linked', () => {
  it('is drawn beside Sync now', () => {
    setup({ code: CODE });
    expect(html()).toContain('<button id="sync-load-linked" >Load from cloud</button>');
  });
  it('previews the linked code through the same compare-first card', async () => {
    const s = setup({ code: CODE });
    await click({ id: 'sync-load-linked' });
    expect(s.sync.previewLoad).toHaveBeenCalledWith(CODE);
    await vi.waitFor(() => expect(html()).toContain('Confirm — overwrite this device'));
    expect(html()).toContain(`Cloud save ${CODE}`);
  });
});
