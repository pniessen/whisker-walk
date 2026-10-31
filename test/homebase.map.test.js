import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The home base's WebGL pieces can't run in node: stub the thumbnails, the hero
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
    };
  },
}));

const { createHomeBase } = await import('../src/ui/homebase.js');
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

function setup() {
  const progression = createProgression(memStorage());
  const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
  const hb = createHomeBase(progression, { photos: [] }, () => {}, null, null, null, settings, () => {}, () => {}, null, 'me', () => {});
  hb.show();
  openSheet('settings');
  return { progression };
}

describe('Settings: the map row', () => {
  it('shows North up and Turns with me, with the saved mode selected', () => {
    const { progression } = setup();
    const html = doc.root.innerHTML;
    expect(html).toContain('id="set-map-mode"');
    expect(html).toMatch(/<option value="north" selected>North up<\/option>/);
    expect(html).toContain('<option value="turn" >Turns with me</option>');
    progression.setMapMode('turn');
    openSheet('settings');
    expect(doc.root.innerHTML).toMatch(/<option value="turn" selected>Turns with me<\/option>/);
  });

  it('choosing an option saves it with setMapMode', () => {
    const { progression } = setup();
    const spy = vi.spyOn(progression, 'setMapMode');
    doc.root.listeners.change({ target: { id: 'set-map-mode', value: 'turn', dataset: {} } });
    expect(spy).toHaveBeenCalledWith('turn');
    expect(progression.state.mapMode).toBe('turn');
    expect(doc.root.innerHTML).toMatch(/<option value="turn" selected>/);
    doc.root.listeners.change({ target: { id: 'set-map-mode', value: 'north', dataset: {} } });
    expect(spy).toHaveBeenLastCalledWith('north');
    expect(progression.state.mapMode).toBe('north');
  });
});
