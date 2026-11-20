import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same harness as homebase.edition.test.js. The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
// stage and the dressing-room controller. The controller stub keeps the
// onOpenSheet callback so a test can open the Settings sheet.
let openSheet = null;
vi.mock('../src/thumbnails.js', () => ({ menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
vi.mock('../src/ui/catstage.js', () => ({ createCatStage: () => ({ setVisible() {} }) }));
vi.mock('../src/ui/dressingroomview.js', () => ({
  createDressingRoom: (opts) => {
    openSheet = opts.onOpenSheet;
    return {
      html: ({ headerHtml }) => `<header>${headerHtml}</header>`,
      afterRender() {}, handleClick() { return false; }, clearPreview() {},
    handleInput() { return false; }, captureFocus() { return null; }, restoreFocus() {}, startAllowed() { return true; },
    };
  },
}));

const { createHomeBase, showEditionTitle } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

// No jsdom here: a tiny element stand-in, enough for the home base.
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() {},
    querySelector() { return null; },
    focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = {
    add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c),
  };
  return el;
}
function fakeDocument() {
  const doc = { defaultView: { innerWidth: 375, innerHeight: 812 } };
  doc.createElement = () => fakeEl(doc);
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
});
afterEach(() => {
  delete globalThis.document;
});



// A storage whose setItem can be made to throw, as a full device does.
function flakyStorage() {
  const map = new Map();
  const s = {
    full: false,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (s.full) throw new Error('QuotaExceededError'); map.set(k, String(v)); },
  };
  return s;
}

const SAVE_FAILED = 'This device could not save. Free up space, then play again.';

describe('saveWriteFailed', () => {
  let warn;
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('starts false, goes true when a write throws, and back to false after a write that works', () => {
    const storage = flakyStorage();
    const progression = createProgression(storage);
    expect(progression.saveWriteFailed).toBe(false);
    storage.full = true;
    progression.addPoints(1);
    expect(progression.saveWriteFailed).toBe(true);
    storage.full = false;
    progression.addPoints(1);
    expect(progression.saveWriteFailed).toBe(false);
  });

  it('is read-only', () => {
    const progression = createProgression(flakyStorage());
    expect(() => { progression.saveWriteFailed = true; }).toThrow();
    expect(progression.saveWriteFailed).toBe(false);
  });
});

describe('Settings: the save-failed line', () => {
  function setupWith(storage) {
    const progression = createProgression(storage);
    const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
    const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: { available: true, getState: () => null, onChange() {} }, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {} });
    hb.show();
    return progression;
  }
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });

  it('is absent while saves work', () => {
    setupWith(flakyStorage());
    openSheet('settings');
    expect(doc.root.innerHTML).not.toContain('id="set-save-note"');
    expect(doc.root.innerHTML).not.toContain(SAVE_FAILED);
  });

  it('appears, as a status note, once a write has failed', () => {
    const storage = flakyStorage();
    const progression = setupWith(storage);
    storage.full = true;
    progression.addPoints(1);
    openSheet('settings');
    expect(doc.root.innerHTML).toContain(`<p class="settings-note" id="set-save-note" role="status">${SAVE_FAILED}</p>`);
  });

  it('goes away again after a write that works', () => {
    const storage = flakyStorage();
    const progression = setupWith(storage);
    storage.full = true;
    progression.addPoints(1);
    storage.full = false;
    progression.addPoints(1);
    openSheet('settings');
    expect(doc.root.innerHTML).not.toContain('id="set-save-note"');
  });
});
