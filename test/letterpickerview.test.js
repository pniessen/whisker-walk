import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openLetterPicker, pickerHtml } from '../src/tv/letterpickerview.js';
import { pickerModel, newPicker } from '../src/tv/letterpicker.js';
import { tvHooks, resetTv, setTv } from '../src/tvseam.js';
import { padLine } from '../src/tv/padwords.js';
import { glyphify, plainify } from '../src/tv/glyphs.js';
import { validPetName } from '../src/net.js';
import { createGamepad } from '../src/gamepad.js';
import { withOffWords } from './helpers/offwords.js';

// A fake card: just the parts the view touches (no jsdom in this project).
const rigs = [];
function rig({ focus = true } = {}) {
  const els = {};
  const mk = () => {
    const e = {
      text: '', attrs: {}, cls: new Set(), listeners: {}, removed: false,
      classList: { toggle: (c, on) => (on ? e.cls.add(c) : e.cls.delete(c)), add: (c) => e.cls.add(c), contains: (c) => e.cls.has(c) },
      set textContent(v) { e.text = v; }, get textContent() { return e.text; },
    };
    e.setAttribute = (k, v) => { e.attrs[k] = v; };
    return e;
  };
  const text = mk(); const msg = mk(); const ok = mk(); const shift = mk();
  const bySel = { '[data-lp-text]': text, '[data-lp-key="ok"]': ok, '[data-lp-key="shift"]': shift, '[data-lp-msg]': msg };
  const root = {
    ...mk(), html: '', attrs: {},
    set innerHTML(v) { root.html = v; }, get innerHTML() { return root.html; },
    addEventListener(t, f) { root.listeners[t] = f; },
    remove() { root.removed = true; },
    querySelector: (s) => bySel[s] ?? null,
  };
  root.classList = { toggle: (c, on) => (on ? root.cls.add(c) : root.cls.delete(c)), add: (c) => root.cls.add(c), contains: (c) => root.cls.has(c) };
  root.setAttribute = (k, v) => { root.attrs[k] = v; };
  const opener = { focus: vi.fn() };
  const doc = { createElement: () => root, activeElement: focus ? opener : null };
  const mounted = [];
  const open = (o = {}) => openLetterPicker({ doc, mount: (e) => mounted.push(e), valid: validPetName, ...o });
  const key = (id) => root.listeners.click({ target: { closest: () => ({ getAttribute: () => id }) } });
  const press = (k, extra = {}) => { const e = { key: k, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra }; root.listeners.keydown(e); return e; };
  const out = { root, text, msg, ok, shift, opener, doc, mounted, open, key, press };
  rigs.push(out);
  return out;
}

beforeEach(() => resetTv());
afterEach(() => {
  // a test that left its card up must not block the next one
  for (const r of rigs.splice(0)) if (r.root.listeners.click && !r.root.removed) r.key('cancel');
  resetTv();
});

describe('the picker card', () => {
  it('mounts one card marked as a pad layer, with the A key the entry control, and nothing focused by itself', () => {
    const r = rig();
    r.open();
    expect(r.mounted).toEqual([r.root]);
    expect(r.root.attrs['data-pad-layer']).toBe('');
    expect(r.root.html).toContain('data-lp-key="A"');
    expect(r.root.html.match(/data-pad-default/g)).toHaveLength(1);
    expect(r.root.html).toMatch(/data-lp-key="A"[^>]*data-pad-default/);
    expect(r.root.html.match(/<button/g)).toHaveLength(32); // 27 + Shift Space Back Cancel OK
  });

  it('a click on keys types the name, the preview follows, OK resolves it once and the card goes', async () => {
    const r = rig();
    const done = r.open();
    for (const id of ['M', 'O', 'C', 'H', 'I']) r.key(id);
    expect(r.text.text).toBe('Mochi');
    r.key('ok');
    await expect(done).resolves.toBe('Mochi');
    expect(r.root.removed).toBe(true);
    r.key('X'); // a late click after it closed changes nothing and does not throw
  });

  it('starts from the cat\'s current name', async () => {
    const r = rig();
    const done = r.open({ initial: 'Mochi' });
    expect(r.root.html).toContain('>Mochi</span>');
    r.key('ok');
    await expect(done).resolves.toBe('Mochi');
  });

  it('Cancel resolves null, and focus goes back to where it was', async () => {
    const r = rig();
    const done = r.open();
    r.key('A');
    r.key('cancel');
    await expect(done).resolves.toBe(null);
    expect(r.opener.focus).toHaveBeenCalled();
  });

  it('OK on a name that is too short keeps the card open and says so, in words', async () => {
    const r = rig();
    const done = r.open();
    r.key('A');
    r.key('ok');
    expect(r.root.removed).toBe(false);
    expect(r.msg.text).toBe(padLine('pad.picker.short'));
    expect(r.ok.cls.has('lp-dim')).toBe(true);
    r.key('B'); // the next edit takes the message away
    expect(r.msg.text).toBe('');
    expect(r.ok.cls.has('lp-dim')).toBe(false);
    r.key('cancel');
    await done;
  });

  it('a blocked word is refused with its own message', async () => {
    const r = rig();
    const done = r.open({ valid: (t) => validPetName(t) && !/discord/i.test(t) });
    for (const ch of 'discord') r.key(ch.toUpperCase());
    r.key('ok');
    expect(r.msg.text).toBe(padLine('pad.picker.blocked'));
    r.key('cancel');
    await done;
  });

  it('letters show the case they will type: upper at the start, lower after, Shift lifts one', async () => {
    const r = rig();
    const done = r.open();
    expect(r.root.cls.has('lp-lower')).toBe(false);
    r.key('A');
    expect(r.root.cls.has('lp-lower')).toBe(true);
    r.key('shift');
    expect(r.root.cls.has('lp-lower')).toBe(false);
    expect(r.shift.attrs['aria-pressed']).toBe('true');
    r.key('B');
    expect(r.text.text).toBe('AB');
    r.key('cancel');
    await done;
  });

  it('opening a second picker while one is up is refused (null at once)', async () => {
    const r = rig();
    const first = r.open();
    await expect(r.open()).resolves.toBe(null);
    expect(r.mounted).toHaveLength(1);
    r.key('cancel');
    await first;
    const again = r.open(); // and after it closed a new one opens
    expect(r.mounted).toHaveLength(2);
    r.key('cancel');
    await again;
  });

  it('a keyboard types (Enter = OK, Esc = cancel, Backspace deletes) and every key stops at the card', async () => {
    const r = rig();
    const done = r.open();
    const e = r.press('m');
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
    r.press('o'); r.press('x'); r.press('Backspace'); r.press('c'); r.press('h'); r.press('i');
    expect(r.text.text).toBe('Mochi');
    r.press(' ');
    r.press('1'); // not in the alphabet
    expect(r.text.text).toBe('Mochi ');
    r.press('Enter', { repeat: true }); // a held Enter does nothing
    expect(r.root.removed).toBe(false);
    const enter = r.press('Enter');
    expect(enter.stopPropagation).toHaveBeenCalled();
    await expect(done).resolves.toBe('Mochi ');
  });

  it('Escape cancels; Tab and arrows are left to the browser but still stop at the card', async () => {
    const r = rig();
    const done = r.open();
    const tab = r.press('Tab');
    expect(tab.stopPropagation).toHaveBeenCalled();
    expect(tab.preventDefault).not.toHaveBeenCalled();
    r.press('Escape');
    await expect(done).resolves.toBe(null);
  });

  it('a shortcut (Ctrl or Cmd) types nothing', async () => {
    const r = rig();
    const done = r.open();
    r.press('a', { metaKey: true });
    expect(r.text.text).toBe('');
    r.key('cancel');
    await done;
  });
});

describe('the pad extras', () => {
  it('B cancels through the seam\'s back hook, and the hooks are given back afterwards', async () => {
    const prevBack = () => false;
    const prevButton = () => false;
    tvHooks.back = prevBack; tvHooks.button = prevButton;
    const r = rig();
    const done = r.open();
    expect(tvHooks.back()).toBe(true);
    await expect(done).resolves.toBe(null);
    expect(tvHooks.back).toBe(prevBack);
    expect(tvHooks.button).toBe(prevButton);
  });

  it('L1 = Shift, R1 = Space, Square = Delete, Start = OK; other buttons are not taken', async () => {
    const r = rig();
    const done = r.open();
    r.key('A'); r.key('B');
    expect(tvHooks.button(4)).toBe(true); // shift
    r.key('C');
    expect(r.text.text).toBe('AbC');
    expect(tvHooks.button(5)).toBe(true); // space
    expect(r.text.text).toBe('AbC ');
    expect(tvHooks.button(2)).toBe(true); // delete the space
    expect(tvHooks.button(2)).toBe(true); // delete the C
    expect(r.text.text).toBe('Ab');
    expect(tvHooks.button(0)).toBe(false);
    expect(tvHooks.button(1)).toBe(false);
    expect(tvHooks.button(9)).toBe(true); // OK
    await expect(done).resolves.toBe('Ab');
  });

  it('through the real gamepad: Start is OK (no resume), L1 is Shift (no map zoom), B is Cancel', async () => {
    const r = rig();
    const done = r.open();
    r.key('A'); r.key('B');
    const down = new Set();
    const pad = () => ({ index: 0, connected: true, mapping: 'standard', id: 'x', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: down.has(i), value: down.has(i) ? 1 : 0 })) });
    const nav = { enter() {}, step() {}, press: vi.fn(), zoom: vi.fn(), scroll() {}, alt() {}, settle() {} };
    const onResume = vi.fn(); const padBack = vi.fn(() => { tvHooks.back?.(); });
    const gp = createGamepad({
      win: { addEventListener() {}, removeEventListener() {} }, nav: { getGamepads: () => [pad()] }, doc: null,
      getEngaged: () => false, canResume: () => true, onResume, menuNav: nav, padBack,
      onMenuButton: (i) => tvHooks.button?.(i) ?? false,
    });
    const tap = (i) => { down.add(i); gp.poll(0.016); down.delete(i); gp.poll(0.016); };
    gp.poll(0.016);
    tap(4);
    expect(nav.zoom).not.toHaveBeenCalled();
    tap(9);
    expect(onResume).not.toHaveBeenCalled();
    await expect(done).resolves.toBe('Ab');
    // with the picker gone the same buttons do what they always did
    tap(4); tap(9);
    expect(nav.zoom).toHaveBeenCalledWith('out');
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});

describe('words', () => {
  const html = (m) => pickerHtml(m, { title: padLine('pad.picker.title.cat'), hint: glyphify(padLine('pad.picker.hint'), 'ps') });
  it('every label and line comes from the word tables, in the family set and the everyday one, with no token left raw', () => {
    const m = pickerModel(newPicker({ initial: 'Mochi', valid: validPetName }));
    for (const run of [(f) => f(), (f) => withOffWords(f)]) {
      run(() => {
        const h = html(m);
        expect(h).not.toMatch(/⟦/);
        expect(h).toContain('Name your cat');
        expect(h).toContain('>Cancel<');
        expect(h).toContain('>OK<');
        expect(h).toContain('<svg');
        for (const id of ['title.cat', 'title.walker', 'empty', 'shift', 'space', 'back', 'cancel', 'ok', 'hint', 'short', 'blocked']) {
          expect(padLine(`pad.picker.${id}`), id).toMatch(/\S/);
        }
        expect(plainify(padLine('pad.picker.hint'), 'xbox')).not.toMatch(/⟦/);
      });
    }
  });
});
