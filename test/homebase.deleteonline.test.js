import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// "Delete my online data" on the Cloud save sheet: the button in the linked
// and unlinked sheet, the confirm card (the same one Start over uses), each
// answer's line, the busy state, and the times it waits. Same no-DOM
// stand-in as test/confirmcard.test.js; the delete itself is a fake (its own
// tests are test/onlinedelete.test.js).
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
  const sync = { available: true, getCode: () => linked, unlink: () => { linked = null; } };
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

describe('the button on the Cloud save sheet', () => {
  it('is there when the device is not linked, after the kept copies, as a danger button', () => {
    setup();
    expect(html()).toContain('<div class="sync-unlinked">');
    expect(html()).toContain(BUTTON);
    expect(html().indexOf('sync-delete')).toBeGreaterThan(html().indexOf('sync-unlinked'));
  });
  it('is there when the device is linked', () => {
    setup({ code: CODE });
    expect(html()).toContain('<div class="sync-linked">');
    expect(html()).toContain(BUTTON);
  });
  it('is not drawn when the delete is not available', () => {
    setup({ onlineDelete: { available: false, run: vi.fn() } });
    expect(html()).not.toContain('sync-delete-online');
  });
  it('waits, and says why, while a walk room is open or the colony is mid-pairing', async () => {
    const inRoom = setup({ rooms: { available: true, getState: () => ({ code: 'ABCD', roster: [] }), onChange() {} } });
    expect(html()).toContain('<button id="sync-delete-online" class="danger" disabled>Delete my online data</button>');
    expect(html()).toContain('Leave the walk room first, then you can delete.');
    await click({ id: 'sync-delete-online' });
    expect(card()).toBeUndefined();
    expect(inRoom.od.run).not.toHaveBeenCalled();

    const future = new Date(Date.now() + 60_000).toISOString();
    for (const st of [{ mode: 'unpaired', invite: { code: 'ABCDEF', expiresAt: future }, joining: null }, { mode: 'unpaired', invite: null, joining: { inviterPetName: 'Biscuit' } }]) {
      setup({ colonySync: { available: true, status: () => st, pull: () => Promise.resolve({}) } });
      expect(html()).toContain('Colony sharing is in the middle of pairing. Try again once that’s finished.');
      expect(html()).toContain('id="sync-delete-online" class="danger" disabled');
    }
    // an invite that has run out doesn't hold it up
    setup({ colonySync: { available: true, status: () => ({ mode: 'unpaired', invite: { code: 'ABCDEF', expiresAt: new Date(Date.now() - 1000).toISOString() }, joining: null }), pull: () => Promise.resolve({}) } });
    expect(html()).toContain(BUTTON);
  });
});

describe('the confirm card', () => {
  it('linked: says what goes, what stays, that it is final, and about the other device; Not now first', async () => {
    setup({ code: CODE });
    await click({ id: 'sync-delete-online' });
    const h = card().innerHTML;
    expect(h).toContain('Delete this device’s online data?');
    expect(h).toContain(`Deletes the cloud save and photo album under the code ${CODE}, and this device’s cat profile, friends and colony sharing.`);
    expect(h).toContain('The game on this device stays as it is, except that its cat name for playing together is cleared. This can’t be undone.');
    expect(h).toContain('Another device linked to the same save code will upload the save again, unless you unlink it or delete there too.');
    expect(h.indexOf('id="confirm-card-no"')).toBeLessThan(h.indexOf('id="confirm-card-yes"'));
    expect(h).toContain('data-confirm="no">Not now</button>');
    expect(h).toContain('class="colony-news-btn confirm-card-danger" id="confirm-card-yes" data-confirm="yes">Yes, delete it</button>');
  });
  it('unlinked: no save, no other-device line', async () => {
    setup();
    await click({ id: 'sync-delete-online' });
    const h = card().innerHTML;
    expect(h).toContain('Deletes this device’s cat profile, friends and colony sharing. The game on this device stays as it is');
    expect(h).not.toContain('cloud save');
    expect(h).not.toContain('Another device');
  });
  it('Not now and Escape change nothing and call nothing', async () => {
    const s = setup({ code: CODE });
    await click({ id: 'sync-delete-online' });
    answer(card(), 'no');
    await click({ id: 'sync-delete-online' });
    card().listeners.keydown({ key: 'Escape' });
    expect(card()).toBeUndefined();
    expect(s.od.run).not.toHaveBeenCalled();
    expect(s.sync.getCode()).toBe(CODE);
    expect(s.progression.state.petName).toBe('Mittens');
  });
  it('Yes calls the delete once, disables the sheet while it runs, then says it is done', async () => {
    const s = setup({ code: CODE });
    await confirmYes();
    expect(s.od.run).toHaveBeenCalledTimes(1);
    expect(html()).toContain('<button id="sync-delete-online" class="danger" disabled>Deleting…</button>');
    expect(html()).toContain('<button id="sync-now" disabled>');
    await click({ id: 'sync-delete-online' }); // a tap while it runs does nothing
    expect(card()).toBeUndefined();
    s.release();
    await vi.waitFor(() => expect(html()).toContain('Done. Your online data is deleted. To play together again, give your cat a name in Play together.'));
    expect(html()).toContain('<div class="sync-unlinked">');
    expect(html()).toContain(BUTTON);
  });
});

describe('the line after each answer', () => {
  const LINES = [
    [{ outcome: 'unavailable', player: 'unavailable', save: null }, 'Deleting isn’t switched on yet. Nothing was deleted.'],
    [{ outcome: 'offline', player: 'offline', save: 'offline' }, 'Could not reach the cloud — check your connection and try again. Nothing was deleted.'],
    [{ outcome: 'denied', player: 'denied', save: 'ok' }, 'The cloud wouldn’t let this device delete it. Nothing was deleted.'],
    [{ outcome: 'busy', player: 'busy', save: 'busy' }, 'The cloud is busy right now — try again later. Nothing was deleted.'],
    [{ outcome: 'partial', player: 'ok', save: 'offline' }, 'The cat profile, friends and colony sharing are deleted, but the cloud save isn’t yet. Tap Delete my online data again to finish.'],
    [{ outcome: 'partial', player: 'offline', save: 'ok' }, 'The cloud save is deleted and this device is unlinked, but the cat profile, friends and colony sharing aren’t yet. Tap Delete my online data again to finish.'],
  ];
  for (const [result, line] of LINES) {
    it(`${result.outcome} (${result.player}/${result.save})`, async () => {
      const s = setup({ code: CODE, result });
      await confirmYes();
      s.release();
      await vi.waitFor(() => expect(html()).toContain(line));
      expect(html()).toContain(BUTTON); // and it can be tried again
    });
  }
});
