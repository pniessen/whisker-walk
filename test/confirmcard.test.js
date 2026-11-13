import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// The home base's WebGL pieces can't run in node (as in homebase.visits.test.js).
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

const { confirmCardHtml, createConfirmCard, spendAsk } = await import('../src/ui/confirmcard.js');
const { CONFIRM_DELAY_MS } = await import('../src/ui/colonypanel.js');
const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression, BACKUP_KEYS } = await import('../src/progression.js');

const KEY = 'whisker-walk-save';
function memStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
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
function fakeDocument() {
  const doc = {};
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
let warn;
beforeEach(() => {
  vi.useFakeTimers();
  doc = fakeDocument();
  globalThis.document = doc;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  delete globalThis.document;
  warn.mockRestore();
});

// A click on one of the card's buttons ('yes' / 'no').
const answer = (el, a, detail = 1) => el.listeners.click({ target: { closest: () => ({ getAttribute: () => a }) }, detail });
const card = () => doc.body.children.find((c) => c.id === 'confirm-card');

describe('confirmCardHtml', () => {
  it('is a labelled modal dialog with Not now first, and escapes its text', () => {
    const h = confirmCardHtml({ text: 'Erase <all>?', note: 'A "copy" is kept', yes: 'Yes & go', danger: true });
    expect(h).toContain('role="alertdialog" aria-modal="true" aria-labelledby="confirm-card-line" aria-describedby="confirm-card-note"');
    expect(h).toContain('<p class="colony-notice-line" id="confirm-card-line">Erase &lt;all&gt;?</p>');
    expect(h).toContain('<p class="colony-news-sub" id="confirm-card-note">A &quot;copy&quot; is kept</p>');
    expect(h.indexOf('id="confirm-card-no"')).toBeLessThan(h.indexOf('id="confirm-card-yes"'));
    expect(h).toContain('<button type="button" class="nearby-card-later" id="confirm-card-no" data-confirm="no">Not now</button>');
    expect(h).toContain('<button type="button" class="colony-news-btn confirm-card-danger" id="confirm-card-yes" data-confirm="yes">Yes &amp; go</button>');
  });
  it('has no note line or describedby without a note', () => {
    const h = confirmCardHtml({ text: 'Sure?', yes: 'Yes' });
    expect(h).not.toContain('aria-describedby');
    expect(h).not.toContain('confirm-card-note');
    expect(h).toContain('class="colony-news-btn" id="confirm-card-yes"');
  });
});

describe('spendAsk: the "Get it?" wording', () => {
  it('names the thing, the price and what is left; Not now first, a friendly Yes', () => {
    expect(spendAsk({ name: 'Red Bow', price: 30, points: 100 })).toEqual({
      text: 'Get the Red Bow for 30 🐾?', note: 'You’ll have 70 🐾 left.', no: 'Not now', yes: 'Yes, get it',
    });
    expect(spendAsk({ kind: 'cat', name: 'Robbie', price: 45, points: 45 }).text).toBe('Get Robbie for 45 🐾?');
    expect(spendAsk({ kind: 'cat', name: 'Robbie', price: 45, points: 45 }).note).toBe('You’ll have 0 🐾 left.');
    expect(spendAsk({ kind: 'place', name: 'City Park', price: 100, points: 150 })).toMatchObject({ text: 'Open City Park for 100 🐾?', note: 'You’ll have 50 🐾 left.', yes: 'Yes, open it' });
    expect(spendAsk({ kind: 'move', name: 'Leap', price: 300, points: 900 })).toMatchObject({ text: 'Learn Leap for 300 🐾?', note: 'You’ll have 600 🐾 left.', yes: 'Yes, learn it' });
  });
  it('is total: odd numbers and kinds never show a negative or NaN', () => {
    expect(spendAsk({ name: 'X', price: 30, points: 10 }).note).toBe('You’ll have 0 🐾 left.');
    expect(spendAsk({ kind: 'nope', name: 'X', price: NaN, points: 'x' })).toMatchObject({ text: 'Get the X for 0 🐾?', note: 'You’ll have 0 🐾 left.' });
    expect(spendAsk({ name: 'X', price: 12.7, points: 20.9 })).toMatchObject({ text: 'Get the X for 12 🐾?', note: 'You’ll have 8 🐾 left.' });
  });
  it('its card is the plain (not red) Yes', () => {
    const h = confirmCardHtml(spendAsk({ name: 'Red Bow', price: 30, points: 100 }));
    expect(h).toContain('<button type="button" class="colony-news-btn" id="confirm-card-yes" data-confirm="yes">Yes, get it</button>');
    expect(h).not.toContain('confirm-card-danger');
  });
});

describe('createConfirmCard', () => {
  function make(blocked = () => false) {
    const onClosed = vi.fn();
    const c = createConfirmCard({ mount: (el) => doc.body.appendChild(el), blocked, onClosed });
    return { c, onClosed };
  }

  it('Yes runs the action once, after the card is gone, then returns focus', () => {
    const { c, onClosed } = make();
    const order = [];
    const onYes = vi.fn(() => order.push(c.isOpen() ? 'open' : 'yes'));
    expect(c.ask({ text: 'Sure?', yes: 'Yes', onYes, returnFocus: () => order.push('focus') })).toBe(true);
    expect(card().className).toBe('colony-news confirm-overlay');
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes');
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['focus', 'yes']);
    expect(c.isOpen()).toBe(false);
    expect(card()).toBeUndefined();
    expect(onClosed).toHaveBeenCalledWith('yes');
  });

  it('Not now, Escape and a backdrop tap do nothing but close (the backdrop not even that)', () => {
    const { c, onClosed } = make();
    const onYes = vi.fn();
    c.ask({ text: 'Sure?', yes: 'Yes', onYes });
    card().listeners.click({ target: { closest: () => null } }); // the backdrop
    expect(c.isOpen()).toBe(true);
    answer(card(), 'no');
    expect(c.isOpen()).toBe(false);
    c.ask({ text: 'Sure?', yes: 'Yes', onYes });
    card().listeners.keydown({ key: 'Escape' });
    expect(c.isOpen()).toBe(false);
    expect(onYes).not.toHaveBeenCalled();
    expect(onClosed.mock.calls).toEqual([['no'], ['no']]);
  });

  it('cancel() (the browser\'s Back) is Not now: closed, nothing run, onClosed told', () => {
    const { c, onClosed } = make();
    const onYes = vi.fn();
    const returnFocus = vi.fn();
    c.cancel(); // nothing up: nothing happens
    expect(onClosed).not.toHaveBeenCalled();
    c.ask({ text: 'Sure?', yes: 'Yes', onYes, returnFocus });
    c.cancel();
    expect(c.isOpen()).toBe(false);
    expect(card()).toBeUndefined();
    expect(onYes).not.toHaveBeenCalled();
    expect(returnFocus).toHaveBeenCalledTimes(1);
    expect(onClosed.mock.calls).toEqual([['no']]);
  });

  it('a Yes in the first moments, or from a double-tap, is ignored', () => {
    const { c } = make();
    const onYes = vi.fn();
    c.ask({ text: 'Sure?', yes: 'Yes', onYes });
    answer(card(), 'yes');
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes', 2);
    expect(onYes).not.toHaveBeenCalled();
    answer(card(), 'yes', 0); // the keyboard's Enter has detail 0
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it('never stacks: a second ask, or one while blocked, is refused', () => {
    let blocked = false;
    const { c } = make(() => blocked);
    expect(c.ask({ text: 'One?', yes: 'Yes', onYes() {} })).toBe(true);
    expect(c.ask({ text: 'Two?', yes: 'Yes', onYes() {} })).toBe(false);
    expect(doc.body.children.filter((x) => x.id === 'confirm-card')).toHaveLength(1);
    c.close();
    blocked = true;
    expect(c.ask({ text: 'Three?', yes: 'Yes', onYes() {} })).toBe(false);
    expect(card()).toBeUndefined();
  });

  it('close() takes it down unanswered and runs nothing', () => {
    const { c, onClosed } = make();
    const onYes = vi.fn();
    c.ask({ text: 'Sure?', yes: 'Yes', onYes });
    c.close();
    expect(c.isOpen()).toBe(false);
    expect(onYes).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('refuses an ask with no action or no text', () => {
    const { c } = make();
    expect(c.ask({ text: 'Sure?', yes: 'Yes' })).toBe(false);
    expect(c.ask({ text: '', yes: 'Yes', onYes() {} })).toBe(false);
    expect(c.ask()).toBe(false);
  });
});

describe('the home base uses it', () => {
  function setup({ storage = memStorage(), sync = null } = {}) {
    const progression = createProgression(storage);
    const album = { photos: [], clear: vi.fn() };
    const settings = { get: () => null, set() {}, all: () => ({}) };
    const hb = createHomeBase({ progression, album, onStartWalk: () => {}, rooms: null, sync, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
    hb.show();
    return { progression, album, hb };
  }
  const click = (target) => doc.root.listeners.click({ target: { closest: () => null, dataset: {}, ...target }, detail: 1 });
  const withPoints = (n) => {
    const s = memStorage();
    createProgression(s).addPoints(n);
    return s.getItem(KEY);
  };

  it('no window.confirm, alert or prompt is left in src/', () => {
    // the iOS web view answers them without asking (no panel in GameViewController.swift)
    const dir = new URL('../src/', import.meta.url);
    const files = readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.js'));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      expect(readFileSync(new URL(String(f), dir), 'utf8'), String(f)).not.toMatch(/(window|globalThis|self)\.(confirm|alert|prompt)\(|(^|[^.\w])(confirm|alert|prompt)\(['"`]/m);
    }
  });

  it('Start over asks in the page; Yes erases (keeping a copy), Not now changes nothing', async () => {
    const { progression, album } = setup({ storage: memStorage({ [KEY]: withPoints(50) }) });
    await click({ id: 'btn-reset' });
    expect(card().innerHTML).toContain('Erase all progress and start over?');
    expect(card().innerHTML).toContain('Yes, start over');
    answer(card(), 'no');
    expect(progression.state.points).toBe(50);
    expect(album.clear).not.toHaveBeenCalled();
    await click({ id: 'btn-reset' });
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes');
    expect(progression.state.points).toBe(0);
    expect(album.clear).toHaveBeenCalledTimes(1);
    expect(progression.backupInfo()).toEqual([expect.objectContaining({ kind: 'reset', points: 50 })]);
  });

  it('never stacks with the notice card, either way round', async () => {
    const { progression, hb } = setup({ storage: memStorage({ [KEY]: withPoints(5) }) });
    expect(hb.showNotice('Bye Rosa')).toBe(true);
    await click({ id: 'btn-reset' });
    expect(card()).toBeUndefined();
    doc.body.children.find((c) => c.id === 'home-notice').listeners.keydown({ key: 'Escape' });
    await click({ id: 'btn-reset' });
    expect(card()).toBeTruthy();
    expect(hb.showNotice('Later')).toBe(false);
    expect(hb.showNews('<div>news</div>', null)).toBe(false);
    hb.hide(); // a walk starting takes it down unanswered
    expect(card()).toBeUndefined();
    expect(progression.state.points).toBe(5);
  });

  it('Cloud save shows the undo only when there is a copy, and the undo puts the save back', async () => {
    const sync = { available: true, getCode: () => null };
    const storage = memStorage({ [KEY]: withPoints(120) });
    const { progression } = setup({ storage, sync });
    dressingMock.opts.onOpenSheet('sync');
    expect(doc.root.innerHTML).not.toContain('data-backup-restore');
    progression.replaceFromPayload({ version: 4, points: 3 });
    dressingMock.opts.onOpenSheet('sync');
    expect(doc.root.innerHTML).toContain('<button data-backup-restore="cloud">Undo the last cloud load <small class="sync-backup-pts">(120 🐾)</small></button>');
    const btn = { getAttribute: () => 'cloud' };
    await click({ closest: (sel) => (sel === '[data-backup-restore]' ? btn : null) });
    expect(card().innerHTML).toContain('Undo the last cloud load?');
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes');
    expect(progression.state.points).toBe(120);
    expect(doc.root.innerHTML).toContain('Done! Your earlier progress is back.');
    expect(doc.root.innerHTML).not.toContain('data-backup-restore="cloud"');
  });

  it('a kept unreadable save is named in Cloud save; one from a newer version has no button', () => {
    const sync = { available: true, getCode: () => null };
    const storage = memStorage({ [KEY]: JSON.stringify({ version: 9, points: 1 }) });
    setup({ storage, sync });
    dressingMock.opts.onOpenSheet('sync');
    expect(doc.root.innerHTML).toContain('This device has a save from a newer version of the game.');
    expect(doc.root.innerHTML).not.toContain('data-backup-restore="unreadable"');
    storage.setItem(BACKUP_KEYS.unreadable, JSON.stringify({ at: 1, raw: withPoints(4) }));
    dressingMock.opts.onOpenSheet('sync');
    expect(doc.root.innerHTML).toContain('<button data-backup-restore="unreadable">Try to restore');
  });

  it('a hostile data-backup-restore value does nothing', async () => {
    const sync = { available: true, getCode: () => null };
    setup({ sync });
    const btn = { getAttribute: () => '__proto__' };
    await click({ closest: (sel) => (sel === '[data-backup-restore]' ? btn : null) });
    expect(card()).toBeUndefined();
  });
});
