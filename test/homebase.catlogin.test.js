import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';
import { withOffWordsAsync } from './helpers/offwords.js';
import { setTv, resetTv } from '../src/tvseam.js';
import { CAT_WORDS } from '../src/catcodes.js';
import { CONFIRM_DELAY_MS } from '../src/ui/colonypanel.js';

// Cat login M3: the My cat sheet (src/ui/catlogin.js), through the home base. Same no-DOM
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

const CODE = [CAT_WORDS[10], CAT_WORDS[200], CAT_WORDS[300], CAT_WORDS[400]].join('-');
const WORDS = CODE.split('-').join(' · ');

async function setup({ linked = null, save, change, preview, state = null } = {}) {
  let code = linked;
  const sync = {
    available: true, getCode: () => code,
    catStatus: () => (state ? { state, name: 'Mittens' } : null),
    saveToCloud: vi.fn(save ?? (async () => { code = CODE; return { ok: true, code }; })),
    changeCode: vi.fn(change ?? (async () => { code = [CAT_WORDS[1], CAT_WORDS[2], CAT_WORDS[3], CAT_WORDS[4]].join('-'); return { ok: true, code }; })),
    previewLoad: vi.fn(preview ?? (async (c) => ({ ok: true, preview: { code: c, secret: 's', payload: { save: {} }, local: { rank: 'Kitten', points: 1, lifetimePoints: 1, bestWalk: 1 }, cloud: { rank: 'Kitten', points: 2, lifetimePoints: 2, bestWalk: 2 } } }))),
    unlink: vi.fn(() => { code = null; }), syncNow: vi.fn(async () => ({ ok: true, message: 'Synced ✓' })),
  };
  const progression = createProgression(memStorage());
  progression.setPetName('Mittens');
  const settings = { get: () => null, set() {}, all: () => ({}) };
  const hb = createHomeBase({ progression, album: { photos: [] }, onStartWalk: () => {}, rooms: null, sync, onlineDelete: null, cloud: null, settings, onSettingsChange: () => {}, onVisitDen: () => {}, colonySync: null, myId: 'me', toast: () => {}, reload: () => {} });
  hb.show();
  dressingMock.opts.onOpenSheet('sync');
  await sheetDrawn(html);
  return { sync, hb, progression };
}

describe('the lazy sheet', () => {
  it('is not a start-up import: homebase asks for it with import() and the code list is not near it', () => {
    const hb = readFileSync(new URL('../src/ui/homebase.js', import.meta.url), 'utf8');
    expect(hb).not.toMatch(/^import .*['"]\.\/catlogin\.js['"]/m);
    expect(hb).toContain("import('./catlogin.js')");
    expect(hb).not.toMatch(/catcodes/);
    const mod = readFileSync(new URL('../src/ui/catlogin.js', import.meta.url), 'utf8');
    // only its own lazy files: the start-up helpers are handed in, not imported (see the file's head)
    expect([...mod.matchAll(/^import .*$/gm)].map((m) => m[0])).toEqual(["import { checkCatCode } from '../catcodes.js';", "import { LINES } from './catloginwords.js';"]);
  });
  it('draws an empty placeholder until it has arrived, then the sheet', async () => {
    const s = await setup();
    expect(html()).toContain('sync-unlinked');
    expect(html()).not.toContain('sync-loading');
    expect(s.sync.saveToCloud).not.toHaveBeenCalled();
  });
});

describe('Screen 1: My cat, on any device (nothing linked)', () => {
  it('says what it is for and offers Keep my cat safe and Bring my cat here, and sends nothing', async () => {
    const s = await setup();
    const h = html();
    expect(h).toContain('My cat, on any device');
    expect(h).toContain('Your cat can visit your other devices. Pick one.');
    expect(h).toContain('<button id="sync-save" >Keep my cat safe</button>');
    expect(h).toContain('<button id="catlogin-bring" >Bring my cat here</button>');
    expect(h).not.toContain('sync-load-code'); // the box opens with Bring my cat here
    expect(s.sync.saveToCloud).not.toHaveBeenCalled();
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
  });
  it('Bring my cat here opens the code box with its label, chips and a hint, still sending nothing', async () => {
    const s = await setup();
    await click({ id: 'catlogin-bring' });
    const h = html();
    expect(h).toContain('<label class="code-label" for="sync-load-code">Cat code from my other device</label>');
    expect(h).toContain('id="catlogin-chips"');
    expect(h).toContain('Type the four words. Spaces or dashes are fine.');
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
  });
  it('typing makes no request, and a value typed before a re-draw is still in the box', async () => {
    const s = await setup();
    await click({ id: 'catlogin-bring' });
    type('sync-load-code', 'plum otter');
    s.hb.refreshSync();
    expect(html()).toContain('value="plum otter"');
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
  });
  it('shows a green chip for a word on the list, a Did you mean for a near miss and a red one for a stranger', async () => {
    const root = doc.root;
    const chips = { innerHTML: '' };
    root.querySelector = (q) => (q === '#catlogin-chips' ? chips : null);
    await setup();
    await click({ id: 'catlogin-bring' });
    const near = CAT_WORDS.find((w) => w.length >= 5);
    const typo = near.slice(0, 4) + (near[4] === 'Z' ? 'Y' : 'Z') + near.slice(5);
    type('sync-load-code', `${CAT_WORDS[3]} ${typo} QQQQQQ`);
    expect(chips.innerHTML).toContain(`<span class="cat-chip ok">${CAT_WORDS[3]}</span>`);
    expect(chips.innerHTML).toContain('<span class="cat-chip bad">QQQQQQ</span>');
    if (chips.innerHTML.includes('snap')) expect(chips.innerHTML).toContain(`Did you mean ${near}?`);
  });
  it('a pasted code fills the chips (all four words green)', async () => {
    const chips = { innerHTML: '' };
    doc.root.querySelector = (q) => (q === '#catlogin-chips' ? chips : null);
    await setup();
    await click({ id: 'catlogin-bring' });
    type('sync-load-code', CODE.toLowerCase().split('-').join('.'));
    expect((chips.innerHTML.match(/cat-chip ok/g) ?? []).length).toBe(4);
  });
  it('a tap on a Did you mean chip puts the right word in the box', async () => {
    const box = { value: '', focus() {} };
    const chips = { innerHTML: '' };
    doc.root.querySelector = (q) => (q === '#catlogin-chips' ? chips : q === '#sync-load-code' ? box : null);
    await setup();
    await click({ id: 'catlogin-bring' });
    type('sync-load-code', `${CAT_WORDS[3]} qqq ${CAT_WORDS[5]}`);
    await click({ id: 'catlogin-fix', dataset: { catWord: '1', catFix: CAT_WORDS[9] } });
    expect(box.value).toBe(`${CAT_WORDS[3]} ${CAT_WORDS[9]} ${CAT_WORDS[5]}`);
  });
  it('Bring my cat here with a bad code says so in kid words and sends nothing', async () => {
    const s = await setup();
    await click({ id: 'catlogin-bring' });
    type('sync-load-code', 'one two three');
    await click({ id: 'sync-load' });
    expect(html()).toContain('That cat code didn’t work. Check the words and try again.');
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
    type('sync-load-code', '');
    await click({ id: 'sync-load' });
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
  });
  it('with a good code, snaps it and asks for the compare card with the code in its one shape', async () => {
    const s = await setup();
    await click({ id: 'catlogin-bring' });
    type('sync-load-code', CODE.toLowerCase().split('-').join('  '));
    await click({ id: 'sync-load' });
    expect(s.sync.previewLoad).toHaveBeenCalledWith(CODE);
    await vi.waitFor(() => expect(html()).toContain('Confirm — overwrite this device'));
  });
  it('an old-shape code still works', async () => {
    const s = await setup();
    await click({ id: 'catlogin-bring' });
    type('sync-load-code', 'plum otter crow 42');
    await click({ id: 'sync-load' });
    expect(s.sync.previewLoad).toHaveBeenCalledWith('PLUM-OTTER-CROW-42');
  });
});

describe('Screen 2: the new cat code', () => {
  it('shows the code as four words, and how to keep it safe', async () => {
    await setup();
    await click({ id: 'sync-save' });
    await vi.waitFor(() => expect(html()).toContain('This is your cat code.'));
    const h = html();
    expect(h).toContain(`<div class="sync-code-value">${WORDS}</div>`);
    expect(h).toContain('Write it on paper. Show a grown-up. Keep it safe.');
    expect(h).toContain('Anyone who knows it can play your cat. If you lose it and every device, we cannot find your cat.');
    expect(h).toContain('To check, type the last word:');
    expect(h).toContain('<button id="sync-got-it" class="primary" disabled>I wrote it down</button>');
    expect(h).toContain('Skip, I’ll do it later');
    expect(h).not.toContain('sync-delete-online'); // the sheet stands alone while the code is up
  });
  it('the check takes the right last word in any case, and then I wrote it down is open', async () => {
    const go = { disabled: true };
    doc.root.querySelector = (q) => (q === '#sync-got-it' ? go : null);
    const s = await setup();
    await click({ id: 'sync-save' });
    await vi.waitFor(() => expect(html()).toContain('This is your cat code.'));
    type('catlogin-check', 'wrong');
    expect(go.disabled).toBe(true);
    type('catlogin-check', CAT_WORDS[400].toLowerCase());
    expect(go.disabled).toBe(false);
    s.hb.refreshSync();
    expect(html()).toContain('<button id="sync-got-it" class="primary" >I wrote it down</button>');
  });
  it('I wrote it down and Skip both go on to the saved sheet, and the code stays out of sight', async () => {
    for (const id of ['sync-got-it', 'catlogin-skip']) {
      await setup();
      await click({ id: 'sync-save' });
      await vi.waitFor(() => expect(html()).toContain('This is your cat code.'));
      await click({ id });
      expect(html()).toContain('sync-linked');
      expect(html()).not.toContain(WORDS);
      expect(html()).not.toContain(CODE);
    }
  });
});

describe('Screen 7: the saved sheet', () => {
  it('never shows the code by itself, not even in the unlink line of the tag', async () => {
    await setup({ linked: CODE });
    expect(html()).not.toContain(CODE);
    expect(html()).not.toContain(WORDS);
    expect(html()).toContain('Show my cat code');
    expect(html()).toContain('Press and hold for two seconds.');
    expect(html()).toContain('<button id="catlogin-change" >Change my cat code</button>');
    expect(html()).toContain('<button id="sync-now" >Sync now</button>');
  });
  it('a tap does not show the code', async () => {
    await setup({ linked: CODE });
    await click({ id: 'catlogin-show' });
    expect(html()).not.toContain(WORDS);
  });
  const down = () => doc.root.listeners.pointerdown({ target: { id: 'catlogin-show' } });
  it('holding for two seconds shows it, with a Hide button; letting go early shows nothing', async () => {
    await setup({ linked: CODE });
    down();
    vi.advanceTimersByTime(1900);
    doc.root.listeners.pointerup({ target: { id: 'catlogin-show' } });
    vi.advanceTimersByTime(5000);
    expect(html()).not.toContain(WORDS);
    down();
    vi.advanceTimersByTime(2000);
    expect(html()).toContain(`<div class="sync-code-value" data-cat-code>${WORDS}</div>`);
    expect(html()).toContain('<button id="catlogin-hide">Hide</button>');
    await click({ id: 'catlogin-hide' });
    expect(html()).not.toContain(WORDS);
  });
  it('holds a key too (Enter or Space), and lifting it early cancels', async () => {
    await setup({ linked: CODE });
    // the home screen's own keydown hands the key to the sheet; there is no second keydown listener on the root
    doc.root.listeners.keydown({ target: { id: 'catlogin-show' }, key: 'Enter', repeat: false, preventDefault() {} });
    doc.root.listeners.keydown({ target: { id: 'catlogin-show' }, key: 'Enter', repeat: true, preventDefault() {} });
    vi.advanceTimersByTime(1000);
    doc.root.listeners.keyup({ target: { id: 'catlogin-show' } });
    vi.advanceTimersByTime(3000);
    expect(html()).not.toContain(WORDS);
    doc.root.listeners.keydown({ target: { id: 'catlogin-show' }, key: ' ', repeat: false, preventDefault() {} });
    vi.advanceTimersByTime(2000);
    expect(html()).toContain(WORDS);
  });
  it('goes away by itself after a little while', async () => {
    await setup({ linked: CODE });
    down();
    vi.advanceTimersByTime(2000);
    expect(html()).toContain(WORDS);
    vi.advanceTimersByTime(31000);
    expect(html()).not.toContain(WORDS);
  });
  it('is not drawn with a TV or a game pad, and the hold does nothing there', async () => {
    for (const tv of [{ on: true }, { input: 'pad' }]) {
      resetTv();
      setTv(tv);
      await setup({ linked: CODE });
      expect(html()).not.toContain('catlogin-show');
      expect(html()).toContain('Your cat code is not shown on a TV or with a game pad.');
      down();
      vi.advanceTimersByTime(3000);
      expect(html()).not.toContain(WORDS);
    }
  });
  it('shows the catch-up line as before', async () => {
    await setup({ linked: CODE, state: 'saved' });
    expect(html()).toContain('<div class="tag catlogin-status" data-cat-status="saved" role="status">Mittens is safe</div>');
  });
});

describe('Change my cat code', () => {
  const ask = async () => {
    await click({ id: 'catlogin-change' });
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
  };
  it('asks first, with Keep it first, and changes nothing until Yes', async () => {
    const s = await setup({ linked: CODE });
    await ask();
    const h = card().innerHTML;
    expect(h).toContain('Change your cat code?');
    expect(h).toContain('Other devices will need the new code.');
    expect(h.indexOf('confirm-card-no')).toBeLessThan(h.indexOf('confirm-card-yes'));
    expect(h).toContain('>Keep it</button>');
    expect(h).toContain('>Yes, change it</button>');
    answer(card(), 'no');
    expect(s.sync.changeCode).not.toHaveBeenCalled();
  });
  it('Yes changes it once and shows the new code on the write-it-down screen', async () => {
    const s = await setup({ linked: CODE });
    await ask();
    answer(card(), 'yes');
    await vi.waitFor(() => expect(html()).toContain('This is your new cat code.'));
    expect(s.sync.changeCode).toHaveBeenCalledTimes(1);
    expect(html()).toContain([CAT_WORDS[1], CAT_WORDS[2], CAT_WORDS[3], CAT_WORDS[4]].join(' · '));
  });
  it('says kid words when it did not work, and the sheet stays as it was', async () => {
    const s = await setup({ linked: CODE, change: async () => ({ ok: false, error: 'The cloud is busy right now. Try again in a little while.' }) });
    await ask();
    answer(card(), 'yes');
    await vi.waitFor(() => expect(html()).toContain('The cloud is busy right now. Try again in a little while.'));
    expect(s.sync.getCode()).toBe(CODE);
    expect(html()).toContain('sync-linked');
  });
  it('a code this device could not keep is shown with a line to write it down now', async () => {
    await setup({ linked: CODE, change: async () => ({ ok: true, code: CODE, notKept: true }) });
    await ask();
    answer(card(), 'yes');
    await vi.waitFor(() => expect(html()).toContain('This device could not keep the new code. Write it down now.'));
  });
});

describe('Unlink and Load while linked keep the code out of sight', () => {
  it('the unlink note says the code in words only after the question is asked', async () => {
    await setup({ linked: CODE });
    await click({ id: 'sync-unlink' });
    expect(card().innerHTML).toContain(`Your cat code is ${WORDS}.`);
  });
});

describe('both word sets', () => {
  const IDS = ['title', 'intro', 'keep', 'keeping', 'bring', 'bring.label', 'bring.placeholder', 'bring.hint', 'new.title', 'new.titlenew', 'new.note', 'new.warn', 'new.notkept', 'new.check', 'new.ok', 'new.skip', 'linked.tag', 'show', 'show.hint', 'show.notv', 'hide', 'change', 'change.ask', 'change.note', 'change.no', 'change.yes', 'preview.cloud', 'err.changed', 'err.busy', 'err.notready', 'err.offline', 'err.nocode'];
  it('every new line says something under the family words and under the everyday words', async () => {
    const { phrase, addPhrases } = await import('../src/clanphrases.js');
    const { LINES } = await import('../src/ui/catloginwords.js');
    addPhrases(LINES); // the sheet's chunk does this when it arrives
    const say = (id) => (['chip.snap', 'unlink.note'].includes(id) ? phrase(`catlogin.${id}`, 'X') : phrase(`catlogin.${id}`));
    for (const id of [...IDS, 'chip.snap', 'unlink.note']) expect(String(say(id)).length, id).toBeGreaterThan(3);
    await withOffWordsAsync(async () => {
      for (const id of [...IDS, 'chip.snap', 'unlink.note']) expect(String(say(id)).length, id).toBeGreaterThan(3);
    });
  });
  it('the sheet draws the same under the everyday words, and names no series word', async () => {
    await withOffWordsAsync(async () => {
      await setup();
      const unlinked = html();
      expect(unlinked).toContain('Keep my cat safe');
      await click({ id: 'sync-save' });
      await vi.waitFor(() => expect(html()).toContain('This is your cat code.'));
      expect(html()).toContain(WORDS);
      for (const w of ['Twoleg', 'StarClan', 'clan', 'Clan', 'camp']) expect(unlinked + html(), w).not.toContain(w);
    });
  });
});

describe('the sheet is reachable by pad and keyboard', () => {
  it('every control is a real button or a text box (nothing is a clickable div)', async () => {
    await setup();
    await click({ id: 'catlogin-bring' });
    const h = html();
    const sheet = h.slice(h.indexOf('class="sync-unlinked"'));
    expect(sheet).not.toMatch(/<div[^>]*(onclick|data-action)/);
    for (const id of ['sync-save', 'sync-load']) expect(sheet).toMatch(new RegExp(`<button id="${id}"`));
    expect(sheet).toMatch(/<input type="text" id="sync-load-code"/);
  });
  it('pad back and the card are unchanged: the confirm card is the same one Start over uses', async () => {
    await setup({ linked: CODE });
    await click({ id: 'catlogin-change' });
    expect(card().id).toBe('confirm-card');
  });
});
