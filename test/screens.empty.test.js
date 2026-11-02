import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyStateHtml } from '../src/ui/emptystates.js';

// Task 4 of polish-screens: the Album and Social sheets show a small picture
// and one warm line when empty. The home base's WebGL pieces can't run in
// node, so they are stubbed (same pattern as homebase.edition.test.js).
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

const { createHomeBase } = await import('../src/ui/homebase.js');
const { createProgression } = await import('../src/progression.js');

const ALBUM_LINE = 'No photos yet. Snap one on your next walk! 📸';
const FRIENDS_LINE = 'No cat friends yet. Go touch noses on a walk! 🐾';

describe('emptyStateHtml', () => {
  it('album: a decorative svg picture and the exact line', () => {
    const h = emptyStateHtml('album');
    expect(h.startsWith('<div class="empty-state empty-album">')).toBe(true);
    expect(h).toContain('<svg');
    expect(h).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(h).toContain(`<p>${ALBUM_LINE}</p>`);
    expect(h.endsWith('</div>')).toBe(true);
  });

  it('friends: a decorative svg picture and the exact line', () => {
    const h = emptyStateHtml('friends');
    expect(h.startsWith('<div class="empty-state empty-friends">')).toBe(true);
    expect(h).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(h).toContain(`<p>${FRIENDS_LINE}</p>`);
  });

  it('is static: no animation in the pictures', () => {
    for (const k of ['album', 'friends']) {
      expect(emptyStateHtml(k)).not.toMatch(/<animate|animation/);
    }
  });
});

describe('empty-state css', () => {
  const css = () => readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  it('silhouettes are a black shape at 0.55 on a lighter tile', () => {
    expect(css()).toMatch(/\.journal-emoji\.silhouette\s*\{[^}]*filter:\s*brightness\(0\)[^}]*opacity:\s*0\.55/);
    expect(css()).toMatch(/\.journal-card\.unspotted\s*\{[^}]*#33425e/);
  });
  it('.empty-state is a centred column with a 120px picture', () => {
    expect(css()).toMatch(/\.empty-state\s*\{[^}]*flex-direction:\s*column[^}]*align-items:\s*center/);
    expect(css()).toMatch(/\.empty-state svg\s*\{[^}]*width:\s*120px/);
  });
});

function memStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}
function fakeEl(doc) {
  const el = {
    ownerDocument: doc, className: '', innerHTML: '', textContent: '', id: '', type: '',
    children: [], listeners: {}, attrs: {}, style: {}, classes: new Set(),
    setAttribute(k, v) { el.attrs[k] = v; },
    appendChild(c) { el.children.push(c); c.parent = el; },
    append(...cs) { for (const c of cs) el.appendChild(c); },
    addEventListener(t, f) { el.listeners[t] = f; },
    remove() {}, querySelector() { return null; }, focus() {},
    after(c) { doc.body.appendChild(c); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 200, bottom: 200 }; },
  };
  el.classList = { add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c), contains: (c) => el.classes.has(c) };
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
beforeEach(() => { doc = fakeDocument(); globalThis.document = doc; });
afterEach(() => { delete globalThis.document; });

function setup() {
  const progression = createProgression(memStorage());
  const settings = { get: () => null, set() {}, all: () => ({ volume: 1, musicVolume: 1, quality: 'auto' }) };
  const rooms = { available: true, getState: () => null, onChange() {} };
  const hb = createHomeBase(progression, { photos: [] }, () => {}, rooms, null, null, settings, () => {}, () => {}, null, 'me', () => {});
  hb.show();
  return { progression };
}

describe('home sheets when empty', () => {
  it('the Album sheet with no photos shows the album empty state', () => {
    setup();
    openSheet('album');
    expect(doc.root.innerHTML).toContain('class="empty-state empty-album"');
    expect(doc.root.innerHTML).toContain(ALBUM_LINE);
  });

  it('the Social sheet with no stray friends shows the friends empty state', () => {
    setup();
    openSheet('social');
    expect(doc.root.innerHTML).toContain('class="empty-state empty-friends"');
    expect(doc.root.innerHTML).toContain(FRIENDS_LINE);
  });

  it('with a stray friend, the list shows and the empty state does not', () => {
    const { progression } = setup();
    progression.state.friends.Smudge = { breed: 'tabby', greets: 2 };
    openSheet('social');
    expect(doc.root.innerHTML).toContain('Smudge');
    expect(doc.root.innerHTML).not.toContain('empty-friends');
  });
});
