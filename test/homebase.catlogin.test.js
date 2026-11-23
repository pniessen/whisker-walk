import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { memoryStorage } from './helpers/storage.js';
import { withOffWordsAsync } from './helpers/offwords.js';
import { setTv, resetTv } from '../src/tvseam.js';
import { CAT_WORDS } from '../src/catcodes.js';
import { CONFIRM_DELAY_MS } from '../src/ui/colonypanel.js';
import { createCloud } from '../src/cloud.js';
import { createFakeHopServer } from './helpers/fakehop.js';

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

const { UI } = await import('../src/ui/catlogin.js'); // the sheet's chunk, cached before the first test
await import('../src/game/hop.js'); // and the hop client's, so a tap does not wait for it
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

async function setup({ linked = null, save, change, preview, state = null, extra = {} } = {}) {
  let code = linked;
  const sync = {
    available: true, getCode: () => code,
    catStatus: () => (state ? { state, name: 'Mittens' } : null),
    saveToCloud: vi.fn(save ?? (async () => { code = CODE; return { ok: true, code }; })),
    changeCode: vi.fn(change ?? (async () => { code = [CAT_WORDS[1], CAT_WORDS[2], CAT_WORDS[3], CAT_WORDS[4]].join('-'); return { ok: true, code }; })),
    previewLoad: vi.fn(preview ?? (async (c) => ({ ok: true, preview: { code: c, secret: 's', payload: { save: {} }, local: { rank: 'Kitten', points: 1, lifetimePoints: 1, bestWalk: 1 }, cloud: { rank: 'Kitten', points: 2, lifetimePoints: 2, bestWalk: 2 } } }))),
    unlink: vi.fn(() => { code = null; }), syncNow: vi.fn(async () => ({ ok: true, message: 'Synced ✓' })),
    ...extra,
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
  it('says what it is for and offers exactly two big buttons, Save cat and Load cat, and sends nothing', async () => {
    const s = await setup();
    const h = html();
    expect(h).toContain('My cat, on any device');
    expect(h).toContain('<button id="sync-save" class="big" >Save cat</button>');
    expect(h).toContain('<button id="catlogin-bring" class="big" aria-expanded="false" >Load cat</button>');
    expect(h).not.toContain('sync-load-code'); // the box opens with Load cat
    expect(h).not.toMatch(/Keep my cat safe|Bring my cat here|hop/i);
    expect((h.slice(h.indexOf('sync-unlinked')).match(/<button/g) ?? []).length).toBe(2); // nothing else to press on a first-time sheet
    expect(s.sync.saveToCloud).not.toHaveBeenCalled();
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
  });
  it('Load cat opens the code box with its label, chips and a hint, still sending nothing', async () => {
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
  it('Load cat with a bad code says so in kid words and sends nothing', async () => {
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

describe('Save cat shows the four words, and only the words', () => {
  it('a first-time Save cat saves, then the linked sheet shows the code as four words with nothing else about it', async () => {
    const s = await setup();
    await click({ id: 'sync-save' });
    await vi.waitFor(() => expect(html()).toContain('sync-linked'));
    expect(s.sync.saveToCloud).toHaveBeenCalledTimes(1);
    const h = html();
    expect(h).toContain(`<div class="sync-code-value" data-cat-code>${WORDS}</div>`);
    for (const gone of ['This is your cat code', 'Write it on paper', 'Anyone who knows it', 'To check, type the last word', 'I wrote it down', 'Skip, I', 'sync-got-it', 'catlogin-skip', 'catlogin-check', 'catlogin-hide', 'Hide', 'Press and hold', 'id="catlogin-show"']) expect(h, gone).not.toContain(gone);
  });
  it('the words stay after any re-draw, a sync and a status change, with no timer taking them away', async () => {
    const s = await setup({ linked: CODE });
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
    s.hb.refreshSync();
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
    await click({ id: 'sync-now' });
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
    await click({ id: 'catlogin-more' });
    await click({ id: 'catlogin-more' });
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
    vi.advanceTimersByTime(10 * 60 * 1000);
    s.hb.refreshSync();
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
  });
  it('they are there as soon as the sheet opens for a cat that already has a code, and again when it is reopened', async () => {
    await setup({ linked: CODE });
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
    dressingMock.opts.onOpenSheet(null);
    dressingMock.opts.onOpenSheet('sync');
    await sheetDrawn(html);
    expect(html()).toContain(`data-cat-code>${WORDS}<`);
  });
  it('are drawn on a TV and with a game pad too, and Save cat is a plain button the pad can press', async () => {
    for (const tv of [{ on: true }, { input: 'pad' }]) {
      resetTv();
      setTv(tv);
      const s = await setup({ linked: CODE });
      expect(html()).toContain(`data-cat-code>${WORDS}<`);
      expect(html()).toMatch(/<button id="sync-now" class="big" >Save cat<\/button>/);
      expect(html()).not.toContain('not shown on a TV');
      await click({ id: 'sync-now' });
      expect(s.sync.syncNow).toHaveBeenCalled();
    }
  });
  it('Save cat on a linked sheet syncs now, and says so', async () => {
    const s = await setup({ linked: CODE });
    await click({ id: 'sync-now' });
    expect(s.sync.syncNow).toHaveBeenCalledTimes(1);
    expect(html()).toContain('Synced ✓');
  });
  it('a code this device could not keep keeps its one line, since the words are then the only copy', async () => {
    await setup({ linked: CODE, change: async () => ({ ok: true, code: CODE, notKept: true }) });
    await click({ id: 'catlogin-more' });
    await click({ id: 'catlogin-change' });
    vi.advanceTimersByTime(CONFIRM_DELAY_MS);
    answer(card(), 'yes');
    await vi.waitFor(() => expect(html()).toContain('This device could not keep the new code. Write it down now.'));
  });
});

describe('Load cat while linked', () => {
  it('opens the code box and catches up from the cloud, once, and sends nothing else', async () => {
    const catchUp = vi.fn(async () => 'saved');
    const s = await setup({ linked: CODE, extra: { catchUp } });
    await click({ id: 'catlogin-bring' });
    expect(catchUp).toHaveBeenCalledTimes(1);
    expect(html()).toContain('id="sync-load-code"');
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
    await click({ id: 'catlogin-bring' }); // closes it again, no second catch-up
    expect(html()).not.toContain('id="sync-load-code"');
    expect(catchUp).toHaveBeenCalledTimes(1);
  });
  it('an offline catch-up says the plain offline line', async () => {
    await setup({ linked: CODE, extra: { catchUp: async () => 'offline' } });
    await click({ id: 'catlogin-bring' });
    await vi.waitFor(() => expect(html()).toContain('Connect to the internet and try again.'));
  });
  it('a first-time device asks for no catch-up', async () => {
    const catchUp = vi.fn(async () => 'none');
    await setup({ extra: { catchUp } });
    await click({ id: 'catlogin-bring' });
    expect(catchUp).not.toHaveBeenCalled();
  });
});

describe('More: one quiet disclosure for everything else', () => {
  const backups = [{ kind: 'cloud', at: 1, newer: false, restorable: true, points: 3, lifetimePoints: 3 }];
  it('is collapsed by default: only Save cat and Load cat and More are on the linked sheet', async () => {
    const s = await setup({ linked: CODE });
    vi.spyOn(s.progression, 'backupInfo').mockReturnValue(backups);
    s.hb.refreshSync();
    const h = html();
    expect(h).toContain('<button id="catlogin-more" class="link" aria-expanded="false" aria-controls="catlogin-more-body">More</button>');
    for (const hidden of ['catlogin-change', 'sync-unlink', 'data-backup-restore', 'sync-delete-online', 'id="catlogin-more-body"']) expect(h, hidden).not.toContain(hidden);
    expect(h).not.toMatch(/Sync now|Load from cloud|Add a device|Show my cat code|hop/i);
  });
  it('opens to Change my cat code, Unlink and (while a copy is kept) Undo, and shuts again when the sheet is reopened', async () => {
    const s = await setup({ linked: CODE });
    vi.spyOn(s.progression, 'backupInfo').mockReturnValue(backups);
    await click({ id: 'catlogin-more' });
    let h = html();
    expect(h).toContain('aria-expanded="true"');
    for (const shown of ['id="catlogin-change"', 'id="sync-unlink"', 'data-backup-restore="cloud"']) expect(h, shown).toContain(shown);
    // every one is a real button
    expect(h).toMatch(/<button id="catlogin-change"/);
    dressingMock.opts.onOpenSheet(null);
    dressingMock.opts.onOpenSheet('sync');
    await sheetDrawn(html);
    h = html();
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain('id="catlogin-more-body"');
  });
  it('a first-time sheet shows no More when there is nothing under it', async () => {
    await setup();
    expect(html()).not.toContain('catlogin-more');
  });
});

describe('Change my cat code', () => {
  const ask = async () => {
    await click({ id: 'catlogin-more' });
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
  it('Yes changes it once and the sheet shows the new four words', async () => {
    const s = await setup({ linked: CODE });
    await ask();
    answer(card(), 'yes');
    await vi.waitFor(() => expect(html()).toContain([CAT_WORDS[1], CAT_WORDS[2], CAT_WORDS[3], CAT_WORDS[4]].join(' · ')));
    expect(s.sync.changeCode).toHaveBeenCalledTimes(1);
    expect(html()).not.toContain('This is your new cat code');
  });
  it('says kid words when it did not work, and the sheet stays as it was', async () => {
    const s = await setup({ linked: CODE, change: async () => ({ ok: false, error: 'The cloud is busy right now. Try again in a little while.' }) });
    await ask();
    answer(card(), 'yes');
    await vi.waitFor(() => expect(html()).toContain('The cloud is busy right now. Try again in a little while.'));
    expect(s.sync.getCode()).toBe(CODE);
    expect(html()).toContain('sync-linked');
  });
});

describe('Unlink', () => {
  it('the unlink note says the code in words', async () => {
    await setup({ linked: CODE });
    await click({ id: 'catlogin-more' });
    await click({ id: 'sync-unlink' });
    expect(card().innerHTML).toContain(`Your cat code is ${WORDS}.`);
  });
});

describe('both word sets', () => {
  const IDS = ['title', 'intro', 'save', 'saving', 'load', 'find', 'more', 'bring.label', 'bring.placeholder', 'bring.hint', 'new.notkept', 'linked.tag', 'change', 'change.ask', 'change.note', 'change.no', 'change.yes', 'preview.cloud', 'err.changed', 'err.busy', 'err.notready', 'err.offline', 'err.nocode'];
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
      expect(unlinked).toContain('Save cat');
      await click({ id: 'sync-save' });
      await vi.waitFor(() => expect(html()).toContain('sync-linked'));
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
    for (const id of ['sync-save', 'catlogin-bring', 'sync-load']) expect(sheet).toMatch(new RegExp(`<button id="${id}"`));
    expect(sheet).toMatch(/<input type="text" id="sync-load-code"/);
  });
  it('pad back and the card are unchanged: the confirm card is the same one Start over uses', async () => {
    await setup({ linked: CODE });
    await click({ id: 'catlogin-more' });
    await click({ id: 'catlogin-change' });
    expect(card().id).toBe('confirm-card');
  });
});

// ── add a device (cat login M4) ────────────────────────────────────
describe('the hop code screens are hidden while UI.hop is off', () => {
  it('no Add a device, no I have a hop code, and a tap on a hop id does nothing', async () => {
    expect(UI.hop).toBe(false);
    const s = await setup({ linked: CODE, extra: { hopHost: vi.fn(), hopCloud: vi.fn() } });
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-more' });
    expect(html()).not.toMatch(/hop|Add a device/i);
    await click({ id: 'catlogin-hop-add' });
    expect(s.sync.hopHost).not.toHaveBeenCalled();
    expect(html()).not.toMatch(/hop|Add a device/i);
  });
});

describe('Add a device: the hop code (hidden: UI.hop is off; these run with it on)', () => {
  beforeEach(() => { UI.hop = true; });
  afterEach(() => { UI.hop = false; });
  const SECRET = 'k'.repeat(32);
  let server;
  let cloud;
  const flush = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };
  const hopExtra = (over = {}) => {
    server = createFakeHopServer({ cats: { [CODE]: SECRET } });
    cloud = createCloud({ rpc: server.rpc, select: async () => [] });
    return { hopHost: vi.fn(() => ({ cloud, code: CODE, secret: SECRET })), hopCloud: vi.fn(() => cloud), ...over };
  };
  const hopOf = () => html().match(/data-hop-code>([A-Z0-9]{6})</)?.[1];

  it('the linked sheet has an Add a device button, and nothing is asked until it is tapped', async () => {
    const s = await setup({ linked: CODE, extra: hopExtra() });
    expect(html()).toContain('<button id="catlogin-hop-add" >Add a device</button>');
    await flush(10000);
    expect(server.calls).toHaveLength(0);
    expect(s.sync.hopHost).not.toHaveBeenCalled();
  });
  it('the tap shows six characters, how long they last, how to use them and Cancel', async () => {
    await setup({ linked: CODE, extra: hopExtra() });
    await click({ id: 'catlogin-hop-add' });
    expect(hopOf()).toMatch(/^[A-Z0-9]{6}$/);
    const h = html();
    expect(h).toContain('On the other device tap Load cat, then I have a hop code. Type:');
    expect(h).toContain('Good for 10 minutes.');
    expect(h).toContain('id="catlogin-hop-cancel"');
  });
  it('a device types the code: the question comes within one poll, Yes hands the cat over', async () => {
    await setup({ linked: CODE, state: 'saved', extra: hopExtra() });
    await click({ id: 'catlogin-hop-add' });
    const join = await cloud.hopJoin(hopOf());
    expect(join.status).toBe('ok');
    await flush(3000);
    expect(html()).toContain('A device wants to bring Mittens. Is that you?');
    await click({ id: 'catlogin-hop-yes' });
    expect(html()).toContain('Done. Your cat is going to the other device.');
    expect((await cloud.hopPoll(join.ticket)).status).toBe('ok');
  });
  it('No tells the other device no and says the hop is closed', async () => {
    await setup({ linked: CODE, extra: hopExtra() });
    await click({ id: 'catlogin-hop-add' });
    const join = await cloud.hopJoin(hopOf());
    await flush(3000);
    await click({ id: 'catlogin-hop-no' });
    expect(html()).toContain('The other device was told no. That hop code is closed.');
    expect((await cloud.hopPoll(join.ticket)).status).toBe('denied');
  });
  it('Cancel closes the hop and the button comes back', async () => {
    await setup({ linked: CODE, extra: hopExtra() });
    await click({ id: 'catlogin-hop-add' });
    await click({ id: 'catlogin-hop-cancel' });
    expect(html()).toContain('id="catlogin-hop-add"');
    expect((await cloud.hopJoin('ABCDEF')).status).toBe('none');
  });
  it('polling stops when the sheet is closed', async () => {
    await setup({ linked: CODE, extra: hopExtra() });
    await click({ id: 'catlogin-hop-add' });
    await flush(3000);
    const n = server.calls.length;
    dressingMock.opts.onOpenSheet(null);
    await flush(30000);
    expect(server.calls.length).toBe(n);
  });
  it('a server without step 3 says it is not ready, and the sheet still works', async () => {
    await setup({ linked: CODE, extra: hopExtra() });
    server = createFakeHopServer({ cats: { [CODE]: SECRET }, missing: true });
    cloud = createCloud({ rpc: server.rpc, select: async () => [] });
    await click({ id: 'catlogin-hop-add' });
    await vi.waitFor(() => expect(html()).toContain('Adding a device is not ready yet. Use your cat code for now.'));
    expect(html()).toContain('id="sync-now"');
  });
  it('no network says the plain offline line', async () => {
    await setup({ linked: CODE, extra: hopExtra() });
    server = createFakeHopServer({ cats: { [CODE]: SECRET }, offline: true });
    cloud = createCloud({ rpc: server.rpc, select: async () => [] });
    await click({ id: 'catlogin-hop-add' });
    await vi.waitFor(() => expect(html()).toContain('Connect to the internet and try again.'));
  });

  it('on the other device: Load cat offers I have a hop code, and it asks for nothing yet', async () => {
    const s = await setup({ extra: hopExtra() });
    await click({ id: 'catlogin-bring' });
    expect(html()).toContain('<button id="catlogin-hop-have" >I have a hop code</button>');
    await click({ id: 'catlogin-hop-have' });
    expect(html()).toContain('Hop code from my other device');
    expect(html()).toContain('id="catlogin-hop-code"');
    type('catlogin-hop-code', 'abc');
    await flush(10000);
    expect(server.calls).toHaveLength(0);
    expect(s.sync.hopCloud).not.toHaveBeenCalled();
  });
  it('Go joins, waits for the OK with a line and a Cancel, then the normal Is-this-your-cat card', async () => {
    const s = await setup({ extra: hopExtra() });
    const opened = await cloud.hopOpen(CODE, SECRET);
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-hop-have' });
    type('catlogin-hop-code', opened.hop.toLowerCase());
    await click({ id: 'catlogin-hop-go' });
    expect(html()).toContain('Waiting for your other device to say OK…');
    expect(html()).toContain('id="catlogin-hop-cancel"');
    await flush(3000);
    expect(s.sync.previewLoad).not.toHaveBeenCalled();
    await cloud.hopAnswer(CODE, SECRET, true);
    await flush(3000);
    await vi.waitFor(() => expect(s.sync.previewLoad).toHaveBeenCalledWith(CODE));
    await vi.waitFor(() => expect(html()).toContain('Confirm — overwrite this device'));
  });
  it('a wrong code says it did not work; too many tries say wait', async () => {
    await setup({ extra: hopExtra() });
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-hop-have' });
    type('catlogin-hop-code', 'QQQQQQ');
    await click({ id: 'catlogin-hop-go' });
    expect(html()).toContain('That code didn’t work.');
    for (let i = 0; i < 10; i++) await click({ id: 'catlogin-hop-go' });
    expect(html()).toContain('Too many tries. Wait a little while and try again.');
  });
  it('the first device saying no is told to the joiner in kid words', async () => {
    await setup({ extra: hopExtra() });
    const opened = await cloud.hopOpen(CODE, SECRET);
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-hop-have' });
    type('catlogin-hop-code', opened.hop);
    await click({ id: 'catlogin-hop-go' });
    await cloud.hopAnswer(CODE, SECRET, false);
    await flush(3000);
    expect(html()).toContain('Your other device said no.');
  });
  it('Cancel while waiting stops the polling; I have my cat code goes back to the four words', async () => {
    await setup({ extra: hopExtra() });
    const opened = await cloud.hopOpen(CODE, SECRET);
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-hop-have' });
    type('catlogin-hop-code', opened.hop);
    await click({ id: 'catlogin-hop-go' });
    await click({ id: 'catlogin-hop-cancel' });
    const n = server.calls.length;
    await flush(15000);
    expect(server.calls.length).toBe(n);
    await click({ id: 'catlogin-hop-back' });
    expect(html()).toContain('id="sync-load-code"');
  });
  it('an old server (no hop functions) says so and the cat code way is still there', async () => {
    await setup({ extra: hopExtra() });
    server = createFakeHopServer({ cats: {}, missing: true });
    cloud = createCloud({ rpc: server.rpc, select: async () => [] });
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-hop-have' });
    type('catlogin-hop-code', 'ABCDEF');
    await click({ id: 'catlogin-hop-go' });
    expect(html()).toContain('Adding a device is not ready yet. Use your cat code for now.');
    await click({ id: 'catlogin-hop-back' });
    expect(html()).toContain('id="sync-load-code"');
  });
  it('a sync without the hop calls (an older build of the home screen) is not ready, not a crash', async () => {
    await setup({ linked: CODE });
    await click({ id: 'catlogin-hop-add' });
    expect(html()).toContain('Adding a device is not ready yet. Use your cat code for now.');
  });

  it('every new line says something under both word sets, and the hop screens name no series word', async () => {
    const { phrase, addPhrases } = await import('../src/clanphrases.js');
    const { LINES } = await import('../src/ui/catloginwords.js');
    addPhrases(LINES);
    const ids = Object.keys(LINES).filter((k) => k.startsWith('catlogin.hop.'));
    expect(ids.length).toBeGreaterThan(20);
    const say = (id) => String(phrase(id, 'Mittens'));
    for (const id of ids) expect(say(id).length, id).toBeGreaterThan(1);
    await withOffWordsAsync(async () => {
      for (const id of ids) {
        expect(say(id).length, id).toBeGreaterThan(1);
        for (const w of ['Twoleg', 'StarClan', 'clan', 'Clan', 'camp', 'warrior']) expect(say(id), id).not.toContain(w);
      }
      await setup({ linked: CODE, extra: hopExtra() });
      await click({ id: 'catlogin-hop-add' });
      expect(html()).toContain('Good for 10 minutes.');
    });
  });
  it('the new controls are real buttons and a text box', async () => {
    await setup({ extra: hopExtra() });
    await click({ id: 'catlogin-bring' });
    await click({ id: 'catlogin-hop-have' });
    const h = html();
    for (const id of ['catlogin-hop-go', 'catlogin-hop-back']) expect(h).toMatch(new RegExp(`<button id="${id}"`));
    expect(h).toMatch(/<input type="text" id="catlogin-hop-code"/);
  });
});
