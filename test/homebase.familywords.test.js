import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Copied from homebase.map.test.js. The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
// stage and the dressing-room controller. The controller stub keeps the
// onOpenSheet callback so a test can open the Settings sheet.
let openSheet = null;
vi.mock('../src/thumbnails.js', () => ({ fillFoundThumbs: () => {}, menuThumbnails: () => ({ cats: {}, accessories: {} }) }));
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

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');

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

import { memoryStorage as memStorage } from './helpers/storage.js';
import { scanText } from '../scripts/bundlewords.mjs';
import { seriesAvailable, seriesMode, setSeriesMode, removeWordSet, SERIES_ON } from '../src/wordset.js';
import { withOffWords } from './helpers/offwords.js';

const rooms = { available: true, getState: () => null, onChange() {} };

function setup(state = {}, extra = {}) {
  const progression = createProgression(memStorage());
  if (state.wordSet) progression.setWordSet(state.wordSet);
  const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
  const changes = [];
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms, sync: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, onWordsChange: () => changes.push(seriesMode()), ...extra });
  hb.show();
  return { progression, changes };
}
const toggle = (checked) => doc.root.listeners.change({ target: { id: 'set-family-words', checked, dataset: {} } });
const settingsHtml = () => { openSheet('settings'); return doc.root.innerHTML; };

// The family set is in the test setup; a device that is locked has it taken out for the test.
function locked(fn) {
  setSeriesMode('off');
  removeWordSet(SERIES_ON);
  try { return fn(); } finally { /* the next test file starts again from the setup */ }
}

describe('Game settings: the family words', () => {
  it('a device that can show them has a Family words switch, on, with its note', () => {
    expect(seriesAvailable()).toBe(true);
    setup();
    const html = settingsHtml();
    expect(html).toContain('id="set-family-words"');
    expect(html).toContain('Family words');
    expect(html).toContain('id="set-family-note"');
    expect(html).toContain('Your family code turned these on. Switching changes only the words. Nothing is lost.');
    expect(html).not.toContain('id="set-family-locked"');
    expect(seriesMode()).toBe('on');
  });

  it('flipping it sets the save, tells the game, and the everyday words follow', () => {
    const { progression, changes } = setup();
    openSheet('settings');
    const spy = vi.spyOn(progression, 'setWordSet');
    toggle(false);
    expect(spy).toHaveBeenCalledWith('off');
    expect(progression.state.wordSet).toBe('off');
    expect(changes.length).toBe(1);
    toggle(true);
    expect(progression.state.wordSet).toBe('on');
    expect(changes.length).toBe(2);
  });

  it('with the everyday words in use the switch is off, and still there', () => {
    setup();
    withOffWords(() => {
      const html = settingsHtml();
      expect(html).toMatch(/id="set-family-words"/);
      expect(html).not.toMatch(/id="set-family-words"[^>]*checked/);
    });
  });

  it('a locked device with no choice made shows no row and no hint', () => {
    locked(() => {
      setup();
      const html = settingsHtml();
      expect(html).not.toMatch(/set-family-/);
      expect(html).not.toContain('family');
    });
  });

  it('a locked device with a family save shows only the one quiet note', () => {
    locked(() => {
      const { progression } = setup({ wordSet: 'on' });
      const html = settingsHtml();
      expect(html).toContain('id="set-family-locked"');
      expect(html).toContain('This save was made with the family words. Type the family code in Gift code to see them on this device.');
      expect(html).not.toContain('id="set-family-words"');
      expect(progression.state.wordSet).toBe('on'); // showing the note never rewrites the save
    });
  });

  it('a locked device with an everyday save shows nothing', () => {
    locked(() => {
      setup({ wordSet: 'off' });
      expect(settingsHtml()).not.toMatch(/set-family-/);
    });
  });

  it('none of the three says a word of the series (the public scan)', () => {
    setup();
    const unlocked = settingsHtml();
    const locks = locked(() => {
      setup({ wordSet: 'on' });
      const a = settingsHtml();
      setup();
      return [a, settingsHtml()];
    });
    for (const html of [unlocked, ...locks]) {
      const text = html.match(/id="set-family-[^]*?<\/p>/g)?.join(' ') ?? '';
      expect(scanText(text)).toEqual([]);
    }
  });
});
