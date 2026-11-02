import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Copied from homebase.map.test.js. The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
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

import { readFileSync } from 'node:fs';
import { CLAN_SUFFIX } from '../src/clanwords.js';

// A rooms stand-in that is available with no room open, so the Play together
// sheet shows the pet-name row and the star-name picker.
const rooms = { available: true, getState: () => null, onChange() {} };

function setup() {
  const progression = createProgression(memStorage());
  const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
  const hb = createHomeBase(progression, { photos: [] }, () => {}, rooms, null, null, settings, () => {}, () => {}, null, 'me', () => {});
  hb.show();
  return { progression };
}

// A click on the title's edition button: closest() finds the button itself.
function clickEditionToggle() {
  const target = { id: '', dataset: { editionToggle: '' }, closest: (sel) => (sel === '[data-edition-toggle]' ? target : null) };
  return doc.root.listeners.click({ target });
}

describe('Settings: the edition row', () => {
  it('offers Clan Edition and Legacy Edition, with the saved one selected', () => {
    const { progression } = setup();
    openSheet('settings');
    const html = doc.root.innerHTML;
    expect(html).toContain('Game edition');
    expect(html).toContain('id="set-edition"');
    expect(html).toMatch(new RegExp(`<option value="canon" selected>${CLAN_SUFFIX} Edition</option>`));
    expect(html).toContain('<option value="legacy" >Legacy Edition</option>');
    progression.setEdition('legacy');
    openSheet('settings');
    expect(doc.root.innerHTML).toMatch(/<option value="legacy" selected>Legacy Edition<\/option>/);
  });

  it('the Settings edition control calls setEdition with the chosen value', () => {
    const { progression } = setup();
    openSheet('settings');
    const spy = vi.spyOn(progression, 'setEdition');
    doc.root.listeners.change({ target: { id: 'set-edition', value: 'legacy', dataset: {} } });
    expect(spy).toHaveBeenCalledWith('legacy');
    expect(progression.state.edition).toBe('legacy');
    expect(doc.root.innerHTML).toMatch(/<option value="legacy" selected>/);
    doc.root.listeners.change({ target: { id: 'set-edition', value: 'canon', dataset: {} } });
    expect(spy).toHaveBeenLastCalledWith('canon');
    expect(progression.state.edition).toBe('canon');
    expect(doc.root.innerHTML).toMatch(/<option value="canon" selected>/);
  });
});

describe('the title names the edition', () => {
  it("tapping the title's edition flips it and the title follows", async () => {
    const { progression } = setup();
    expect(doc.root.innerHTML).toContain(`data-edition-toggle>${CLAN_SUFFIX} Edition</button>`);
    await clickEditionToggle();
    expect(progression.state.edition).toBe('legacy');
    expect(doc.root.innerHTML).toContain('data-edition-toggle>Legacy Edition</button>');
    await clickEditionToggle();
    expect(progression.state.edition).toBe('canon');
    expect(doc.root.innerHTML).toContain(`data-edition-toggle>${CLAN_SUFFIX} Edition</button>`);
  });

  it('the edition switch says what it does to a screen reader', () => {
    setup();
    expect(doc.root.innerHTML).toMatch(/<button class="dr-edition" aria-label="Switch game edition" title="Switch game edition" data-edition-toggle>/);
  });

  it('the page title follows the save: Clan Edition on load, Legacy after a flip', async () => {
    setup();
    expect(doc.title).toBe(`Whisker Walk 2: ${CLAN_SUFFIX} Edition`);
    await clickEditionToggle();
    expect(doc.title).toBe('Whisker Walk 2: Legacy Edition');
  });

  it('a Legacy save loads with a Legacy page title', () => {
    const storage = memStorage();
    createProgression(storage).setEdition('legacy');
    const progression = createProgression(storage);
    const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
    createHomeBase(progression, { photos: [] }, () => {}, rooms, null, null, settings, () => {}, () => {}, null, 'me', () => {}).show();
    expect(doc.title).toBe('Whisker Walk 2: Legacy Edition');
  });

  it('showEditionTitle names the edition under the splash and in its label', () => {
    const word = { textContent: '' };
    const splash = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    const page = {
      title: '',
      getElementById: (id) => (id === 'splash' ? splash : null),
      querySelector: (sel) => (sel === '#splash .splash-edition' ? word : null),
    };
    showEditionTitle(page, 'legacy');
    expect(page.title).toBe('Whisker Walk 2: Legacy Edition');
    expect(word.textContent).toBe('Legacy Edition');
    expect(splash.attrs['aria-label']).toBe('Whisker Walk 2: Legacy Edition');
  });

  it('index.html ships a neutral title and splash, since the splash shows before the save is read', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<title>Whisker Walk 2</title>');
    expect(html).toContain('aria-label="Whisker Walk 2"');
    expect(html).not.toContain(`${CLAN_SUFFIX} Edition`);
  });

  it('flipping there and back leaves the save as it was', async () => {
    const { progression } = setup();
    const before = JSON.parse(JSON.stringify(progression.state));
    await clickEditionToggle();
    await clickEditionToggle();
    expect(JSON.parse(JSON.stringify(progression.state))).toEqual(before);
  });
});

describe('Legacy hides the clan layer on the home screen', () => {
  it('Legacy hides the star-name picker; Clan shows it', () => {
    const { progression } = setup();
    openSheet('together');
    expect(doc.root.innerHTML).toContain('star-name-picker');
    progression.setEdition('legacy');
    openSheet('together');
    expect(doc.root.innerHTML).not.toContain('star-name-picker');
    expect(doc.root.innerHTML).toContain('id="wt-petname-input"');
  });

  it("Legacy's dock says Cozy Neighborhood when the chosen place is the Woods", () => {
    const { progression } = setup();
    progression.state.unlocked.areas.push('woods');
    progression.setArea('woods');
    expect(progression.state.area).toBe('woods');
    openSheet('settings');
    expect(doc.root.innerHTML).toContain('Walking in <b>The Woods</b>');
    progression.setEdition('legacy');
    openSheet('settings');
    expect(doc.root.innerHTML).toContain('Walking in <b>Cozy Neighborhood</b>');
    expect(doc.root.innerHTML).not.toContain('The Woods');
    expect(progression.state.area).toBe('woods'); // hidden, not rewritten
  });
});

describe('picking a clan', () => {
  // A click on a clan card: closest() finds the card.
  function clickPick(id) {
    const card = { dataset: { clanPick: id } };
    const target = { id: '', dataset: {}, closest: (sel) => (sel === '[data-clan-pick]' ? card : null) };
    return doc.root.listeners.click({ target });
  }
  function setupSync() {
    const noteOwnPick = vi.fn();
    const colonySync = { status: () => ({ mode: 'local' }), pull: () => {}, noteOwnPick };
    const progression = createProgression(memStorage());
    const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
    createHomeBase(progression, { photos: [] }, () => {}, rooms, null, null, settings, () => {}, () => {}, colonySync, 'me', () => {}).show();
    return { progression, noteOwnPick };
  }

  it('tapping a card sets the pick and tells the sync once', async () => {
    const { progression, noteOwnPick } = setupSync();
    await clickPick('moor');
    expect(progression.state.clanPick.mine).toBe('moor');
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
  });

  it('a refused pick (the gorge) neither changes the save nor pushes', async () => {
    const { progression, noteOwnPick } = setupSync();
    await clickPick('gorge');
    expect(progression.state.clanPick.mine).toBeNull();
    expect(noteOwnPick).not.toHaveBeenCalled();
  });

  it('Settings has the select in Clan Edition only, with pickable clans', () => {
    const { progression } = setup();
    openSheet('settings');
    const html = doc.root.innerHTML;
    expect(html).toContain('id="set-clan-pick"');
    expect(html).toContain(`Your ${CLAN_SUFFIX.toLowerCase()}`);
    expect(html).toContain('<option value="" disabled selected>— not picked yet —</option>');
    expect(html).toContain('<option value="woods" >StormClan</option>');
    expect(html).not.toContain('value="gorge"');
    progression.setEdition('legacy');
    openSheet('settings');
    expect(doc.root.innerHTML).not.toContain('set-clan-pick');
  });

  it('the select selects the stored pick, and a change does what a tap does', () => {
    const { progression, noteOwnPick } = setupSync();
    doc.root.listeners.change({ target: { id: 'set-clan-pick', value: 'river', dataset: {} } });
    expect(progression.state.clanPick.mine).toBe('river');
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
    openSheet('settings');
    expect(doc.root.innerHTML).toContain('<option value="river" selected>BrookClan</option>');
  });

  it('Legacy shows no homage name on the home screen, with a pick stored', () => {
    const { progression } = setup();
    progression.setClanPick('woods');
    progression.setEdition('legacy');
    for (const sheet of ['settings', 'colony', 'together']) {
      openSheet(sheet);
      expect(doc.root.innerHTML).not.toContain('StormClan');
    }
    expect(progression.state.clanPick.mine).toBe('woods');
  });
});
