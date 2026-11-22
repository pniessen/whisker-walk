// The cat builder's name with the letter picker (TV mode): a button opens the picker, OK writes the
// name, Cancel leaves it, a render during the picker is held. With TV mode off nothing is different.
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgression } from '../src/progression.js';
import { createDressingRoom } from '../src/ui/dressingroomview.js';
import { newBuilder, buildBuilderModel, renderBuilderHtml } from '../src/ui/catbuilder.js';
import { tvHooks, tvState, setTv, resetTv } from '../src/tvseam.js';
import { padLine } from '../src/tv/padwords.js';
import { validPetName } from '../src/net.js';

const click = (dataset, extra = {}) => ({ target: { closest: () => ({ dataset, ...extra }) } });
const doneBtn = { wait: true, textContent: '', classList: { toggle(c, on) { if (c === 'cb-done-wait') doneBtn.wait = on; } } };
const fakeRoot = { querySelector: (sel) => (sel.includes('cb-done') ? doneBtn : null) };

function rig() {
  const map = new Map();
  const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
  const onChange = vi.fn();
  const dr = createDressingRoom({
    progression, sync: { autoSync: vi.fn() }, stage: { mount() {}, show: vi.fn(), failed: false }, onChange, snapCustom: () => ({}),
    thumbs: { cats: {}, accessories: {}, mine: {} }, confirmSpend: (o) => { o.onYes(); return true; },
  });
  dr.handleClick(click({ drMake: '' }));
  onChange.mockClear();
  return { dr, progression, onChange };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const tvOn = (input = 'pad') => setTv({ on: true, input, padLine });
// A picker that waits for the test to answer it.
function pickerStub() {
  const calls = [];
  tvHooks.picker = vi.fn((o) => new Promise((resolve) => { calls.push({ o, resolve }); }));
  return calls;
}

beforeEach(() => { resetTv(); doneBtn.wait = true; });
afterEach(() => resetTv());

describe('the name row', () => {
  it('with TV mode off it is exactly the old markup: the box and its hint, no open button', () => {
    const html = renderBuilderHtml(buildBuilderModel(newBuilder()));
    expect(html).not.toContain('data-cb-name-open');
    expect(html).toContain('<input type="text" data-cb-name value="" maxlength="16" autocomplete="off" autocapitalize="words" enterkeyhint="done" aria-label="Cat name"><p class="cb-hint">Use 2 to 16 letters.</p>');
  });
  it('with a picker label the open button comes first and the box stays for a keyboard', () => {
    const html = renderBuilderHtml({ ...buildBuilderModel(newBuilder()), pickerLabel: 'Press to type a name ✏️' });
    expect(html).toContain('<button type="button" class="cb-name-open" data-cb-name-open>Press to type a name ✏️</button><input type="text" data-cb-name');
  });
  it('the controller shows the button only while TV mode is on and the chunk has set its picker', () => {
    const { dr } = rig();
    expect(dr.html()).not.toContain('data-cb-name-open');
    tvOn();
    expect(dr.html()).not.toContain('data-cb-name-open'); // no picker hook yet
    tvHooks.picker = vi.fn();
    expect(dr.html()).toContain(`data-cb-name-open>${padLine('pad.picker.empty')} ✏️</button>`);
  });
});

describe('using the picker', () => {
  it('pressing the button opens the picker with the current name and the cat-name rule, and writes nothing yet', async () => {
    tvOn();
    const calls = pickerStub();
    const { dr, onChange } = rig();
    expect(dr.handleClick(click({ cbNameOpen: '' }))).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].o).toMatchObject({ initial: '', valid: validPetName, titleId: 'pad.picker.title.cat' });
    expect(onChange).not.toHaveBeenCalled(); // no render under the card
    expect(dr.ui.builder.draft.name).toBe('');
    calls[0].resolve(null);
    await tick();
  });

  it('OK writes the name, shows it on the button, readies Done, and renders once after the card is gone', async () => {
    tvOn();
    const calls = pickerStub();
    const { dr, onChange } = rig();
    dr.handleClick(click({ cbNameOpen: '' }));
    calls[0].resolve('Mochi');
    await tick();
    expect(dr.ui.builder.draft.name).toBe('Mochi');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dr.html()).toContain('data-cb-name-open>Mochi ✏️</button>');
    expect(dr.html()).toContain('Done, now dress it up →');
    expect(dr.html()).not.toContain('cb-done-wait');
  });

  it('Cancel leaves the name as it was', async () => {
    tvOn();
    const calls = pickerStub();
    const { dr } = rig();
    dr.handleInput({ target: { dataset: { cbName: '' }, value: 'Ash', closest: () => fakeRoot } });
    dr.handleClick(click({ cbNameOpen: '' }));
    expect(calls[0].o.initial).toBe('Ash');
    calls[0].resolve(null);
    await tick();
    expect(dr.ui.builder.draft.name).toBe('Ash');
  });

  it('a render during the picker is held, and the held render runs when it closes', async () => {
    tvOn();
    const calls = pickerStub();
    const { dr, onChange } = rig();
    dr.handleClick(click({ cbNameOpen: '' }));
    expect(dr.deferRender({ ownerDocument: { activeElement: null }, contains: () => true })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    calls[0].resolve('Fern');
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dr.deferRender({ ownerDocument: { activeElement: null }, contains: () => true })).toBe(false);
  });

  it('a second press while the picker is up opens no second picker', async () => {
    tvOn();
    const calls = pickerStub();
    const { dr } = rig();
    dr.handleClick(click({ cbNameOpen: '' }));
    dr.handleClick(click({ cbNameOpen: '' }));
    expect(calls).toHaveLength(1);
    calls[0].resolve(null);
    await tick();
  });

  it('Done with no name opens the picker when the pad is the input; with a keyboard or touch it points at the box as before', async () => {
    tvOn('pad');
    const calls = pickerStub();
    const { dr } = rig();
    const done = { dataset: { cbDone: '' }, closest: () => null, ownerDocument: { activeElement: null } };
    expect(dr.handleClick({ target: { closest: () => done } })).toBe(true);
    expect(calls).toHaveLength(1);
    calls[0].resolve('Ember');
    await tick();
    expect(dr.ui.builder.draft.name).toBe('Ember');
    // not the pad: the old path (the box scrolls and takes focus), and no picker
    resetTv(); tvOn('keys'); const calls2 = pickerStub();
    const r2 = rig();
    const focus = vi.fn();
    const box = { scrollIntoView() {}, focus, closest: () => null };
    const btn = { dataset: { cbDone: '' }, closest: () => ({ querySelector: () => box }), ownerDocument: { activeElement: null } };
    r2.dr.handleClick({ target: { closest: () => btn } });
    expect(focus).toHaveBeenCalled();
    expect(calls2).toHaveLength(0);
  });

  it('a picker that fails leaves the box working and the card state sane', async () => {
    tvOn();
    tvHooks.picker = vi.fn(() => Promise.reject(new Error('gone')));
    const { dr, onChange } = rig();
    dr.handleClick(click({ cbNameOpen: '' }));
    await tick();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dr.ui.builder).not.toBe(null);
    expect(tvState.on).toBe(true);
  });
});

describe('the page wiring', () => {
  it('the dressing room\'s click selector includes the name button (a real click on it reaches handleClick)', () => {
    const src = readFileSync(new URL('../src/ui/dressingroomview.js', import.meta.url), 'utf8');
    expect(src).toMatch(/DR_SELECTOR = [^;]*\[data-cb-name-open\]/);
  });
});
