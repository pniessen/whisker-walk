import { describe, it, expect } from 'vitest';
import { reduceDressingUi } from '../src/ui/dressingroomview.js';

const base = () => ({ pill: 'wearing', openSlot: null, previewCat: null, tryOn: null });

describe('reduceDressingUi', () => {
  it('previewing a locked cat sets previewCat; picking an owned cat clears it', () => {
    let ui = reduceDressingUi(base(), { type: 'preview-cat', id: 'hagrid' });
    expect(ui.previewCat).toBe('hagrid');
    ui = reduceDressingUi(ui, { type: 'preview-cat', id: 'tabby', owned: true });
    expect(ui.previewCat).toBe(null);
    ui = reduceDressingUi({ ...ui, previewCat: 'hagrid' }, { type: 'preview-cat', id: null });
    expect(ui.previewCat).toBe(null);
  });

  it('a slot toggles open and closed', () => {
    let ui = reduceDressingUi(base(), { type: 'slot', slot: 'head' });
    expect(ui.openSlot).toBe('head');
    ui = reduceDressingUi(ui, { type: 'slot', slot: 'face' });
    expect(ui.openSlot).toBe('face');
    ui = reduceDressingUi(ui, { type: 'slot', slot: 'face' });
    expect(ui.openSlot).toBe(null);
  });

  it('try-on sets tryOn and opens its slot; trying the same item again takes it off', () => {
    let ui = reduceDressingUi({ ...base(), openSlot: 'head' }, { type: 'try-on', slot: 'head', id: 'tophat' });
    expect(ui.tryOn).toEqual({ slot: 'head', id: 'tophat' });
    expect(ui.openSlot).toBe('head');
    ui = reduceDressingUi(ui, { type: 'try-on', slot: 'head', id: 'tophat' });
    expect(ui.tryOn).toBe(null);
  });

  it('switching to another slot clears the try-on; reopening nothing else keeps the preview cat', () => {
    let ui = reduceDressingUi({ ...base(), previewCat: 'hagrid', openSlot: 'head' }, { type: 'try-on', slot: 'head', id: 'tophat' });
    ui = reduceDressingUi(ui, { type: 'slot', slot: 'face' });
    expect(ui.tryOn).toBe(null);
    expect(ui.previewCat).toBe('hagrid');
  });

  it('closing the try-on slot also clears the try-on', () => {
    let ui = reduceDressingUi({ ...base(), openSlot: 'head' }, { type: 'try-on', slot: 'head', id: 'tophat' });
    ui = reduceDressingUi(ui, { type: 'slot', slot: 'head' });
    expect(ui.openSlot).toBe(null);
    expect(ui.tryOn).toBe(null);
  });

  it('pill switches the panel and ignores unknown pills', () => {
    let ui = reduceDressingUi(base(), { type: 'pill', pill: 'where' });
    expect(ui.pill).toBe('where');
    const same = reduceDressingUi(ui, { type: 'pill', pill: 'nope' });
    expect(same).toBe(ui);
  });

  it('clear-preview resets both preview and try-on, keeping pill and open slot', () => {
    const ui = reduceDressingUi(
      { pill: 'more', openSlot: 'head', previewCat: 'hagrid', tryOn: { slot: 'head', id: 'tophat' } },
      { type: 'clear-preview' },
    );
    expect(ui).toEqual({ pill: 'more', openSlot: 'head', previewCat: null, tryOn: null });
  });

  it('an unknown action returns ui unchanged (same object)', () => {
    const ui = base();
    expect(reduceDressingUi(ui, { type: 'nope' })).toBe(ui);
    expect(reduceDressingUi(ui, null)).toBe(ui);
    expect(reduceDressingUi(ui, undefined)).toBe(ui);
  });

  it('does not mutate its input', () => {
    const ui = Object.freeze(base());
    expect(() => reduceDressingUi(ui, { type: 'slot', slot: 'head' })).not.toThrow();
    expect(ui.openSlot).toBe(null);
  });
});
