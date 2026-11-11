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
import { clanPickerModel, renderClanPickerHtml } from '../src/ui/clanpicker.js';
import { clanName } from '../src/clanhomes.js';

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

// A click on the title's edition words: closest() finds the old toggle
// selector too, so a handler that still listened for it would flip the save.
function clickEditionToggle() {
  const target = { id: '', dataset: { editionToggle: '' }, closest: (sel) => (sel === '[data-edition-toggle]' || sel === '.dr-edition' || sel === '.dr-title' ? target : null) };
  return doc.root.listeners.click({ target });
}
// The Settings select is the one switch.
const chooseEdition = (value) => doc.root.listeners.change({ target: { id: 'set-edition', value, dataset: {} } });

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
  it('the title is plain text, not a button, and a click on it changes nothing', async () => {
    const { progression } = setup();
    expect(doc.root.innerHTML).toContain(`<span class="dr-edition">${CLAN_SUFFIX} Edition</span>`);
    expect(doc.root.innerHTML).not.toContain('data-edition-toggle');
    expect(doc.root.innerHTML).not.toMatch(/<button[^>]*dr-edition/);
    const before = JSON.stringify(progression.state);
    await clickEditionToggle();
    await clickEditionToggle();
    expect(progression.state.edition).toBe('canon');
    expect(JSON.stringify(progression.state)).toBe(before);
    expect(doc.root.innerHTML).toContain(`<span class="dr-edition">${CLAN_SUFFIX} Edition</span>`);
  });

  it('Settings is the only edition switch, and the title follows it', () => {
    const { progression } = setup();
    chooseEdition('legacy');
    expect(progression.state.edition).toBe('legacy');
    expect(doc.root.innerHTML).toContain('<span class="dr-edition">Legacy Edition</span>');
    chooseEdition('canon');
    expect(progression.state.edition).toBe('canon');
    expect(doc.root.innerHTML).toContain(`<span class="dr-edition">${CLAN_SUFFIX} Edition</span>`);
  });

  it('the title is a heading with no switch label for a screen reader to announce', () => {
    setup();
    expect(doc.root.innerHTML).toMatch(/<h1 class="dr-title">.*Whisker Walk 2 · <span class="dr-edition">/);
    expect(doc.root.innerHTML).not.toContain('Switch game edition');
  });

  it('the page title follows the save: Clan Edition on load, Legacy after Settings changes it', () => {
    setup();
    expect(doc.title).toBe(`Whisker Walk 2: ${CLAN_SUFFIX} Edition`);
    chooseEdition('legacy');
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

  it('switching in Settings and back leaves the save as it was', () => {
    const { progression } = setup();
    const before = JSON.parse(JSON.stringify(progression.state));
    chooseEdition('legacy');
    chooseEdition('canon');
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
    openSheet('journal');
    expect(doc.root.innerHTML).toContain('Walking in <b>The Woods</b>');
    progression.setEdition('legacy');
    openSheet('journal');
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

  it('re-tapping the clan already picked pushes nothing again', async () => {
    const { progression, noteOwnPick } = setupSync();
    noteOwnPick.mockResolvedValue(true);
    await clickPick('moor');
    await clickPick('moor');
    expect(progression.state.clanPick.mine).toBe('moor');
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
    await clickPick('river');
    expect(noteOwnPick).toHaveBeenCalledTimes(2);
    doc.root.listeners.change({ target: { id: 'set-clan-pick', value: 'river', dataset: {} } });
    expect(noteOwnPick).toHaveBeenCalledTimes(2);
  });

  it('after a failed push, re-tapping the same clan pushes it again', async () => {
    const { noteOwnPick } = setupSync();
    noteOwnPick.mockResolvedValue(false);
    await clickPick('moor');
    await Promise.resolve(); await Promise.resolve();
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
    noteOwnPick.mockResolvedValue(true);
    await clickPick('moor');
    await Promise.resolve(); await Promise.resolve();
    expect(noteOwnPick).toHaveBeenCalledTimes(2);
    await clickPick('moor');
    expect(noteOwnPick).toHaveBeenCalledTimes(2);
  });

  it("tapping CliffClan's card picks it", async () => {
    const { progression, noteOwnPick } = setupSync();
    const html = renderClanPickerHtml(clanPickerModel(progression.state), 'Robin');
    const markup = html.split('<button').find((b) => b.includes(`>${clanName('gorge')}<`));
    expect(markup).toBeTruthy();
    await clickPick('gorge');
    expect(progression.state.clanPick.mine).toBe('gorge');
    expect(noteOwnPick).toHaveBeenCalledTimes(1);
  });

  it('a refused pick (the island) neither changes the save nor pushes', async () => {
    const { progression, noteOwnPick } = setupSync();
    await clickPick('island');
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
    expect(html).toContain('value="gorge"');
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

describe('Fighting moves in the Skills sheet', () => {
  function clickBuy(id) {
    const btn = { id: '', dataset: { buyMove: id } };
    const target = { id: '', dataset: {}, closest: (sel) => (sel === '[data-buy-move]' ? btn : null) };
    return doc.root.listeners.click({ target });
  }
  it('Clan Edition shows the section at the end of Skills; Legacy does not', () => {
    const { progression } = setup();
    openSheet('skills');
    expect(doc.root.innerHTML).toContain('fight-moves-list');
    expect(doc.root.innerHTML.indexOf('fight-moves-list')).toBeGreaterThan(doc.root.innerHTML.indexOf('Abilities earned'));
    progression.setEdition('legacy');
    openSheet('skills');
    expect(doc.root.innerHTML).not.toContain('fight-moves-list');
  });
  it('tapping Learn now buys the move and charges the price', async () => {
    const { progression } = setup();
    progression.state.points = 400;
    openSheet('skills');
    await clickBuy('rearUpSwat');
    expect(progression.ownedMoves()).toContain('rearUpSwat');
    expect(progression.state.points).toBe(100);
    expect(doc.root.innerHTML).not.toContain('data-buy-move="rearUpSwat"');
  });
  it('a tap that cannot buy changes nothing', async () => {
    const { progression } = setup();
    progression.state.points = 400;
    openSheet('skills');
    await clickBuy('leapScratch');
    expect(progression.ownedMoves()).toEqual([]);
    expect(progression.state.points).toBe(400);
  });
});
