import { describe, it, expect } from 'vitest';
import { reduceDressingUi, createDressingRoom, INITIAL_DRESSING_UI } from '../src/ui/dressingroomview.js';

const base = () => ({ wardrobe: false, moreCats: false, openSlot: null, previewCat: null, tryOn: null });

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

  it('the wardrobe opens and closes; asking for the state it is already in returns the same object', () => {
    let ui = reduceDressingUi(base(), { type: 'wardrobe', open: true });
    expect(ui.wardrobe).toBe(true);
    expect(reduceDressingUi(ui, { type: 'wardrobe', open: true })).toBe(ui);
    ui = reduceDressingUi(ui, { type: 'wardrobe', open: false });
    expect(ui.wardrobe).toBe(false);
    const shut = base();
    expect(reduceDressingUi(shut, { type: 'wardrobe', open: false })).toBe(shut);
  });

  it('closing the wardrobe also closes the open slot and drops a try-on, keeping the preview cat', () => {
    const open = { ...base(), wardrobe: true, openSlot: 'head', previewCat: 'hagrid', tryOn: { slot: 'head', id: 'tophat' } };
    const ui = reduceDressingUi(open, { type: 'wardrobe', open: false });
    expect(ui).toMatchObject({ wardrobe: false, openSlot: null, tryOn: null, previewCat: 'hagrid' });
  });

  it('opening the wardrobe keeps whatever else is set', () => {
    const ui = reduceDressingUi({ ...base(), moreCats: true, previewCat: 'hagrid' }, { type: 'wardrobe', open: true });
    expect(ui).toMatchObject({ wardrobe: true, moreCats: true, previewCat: 'hagrid' });
  });

  it('more-cats toggles the locked cats open and shut', () => {
    let ui = reduceDressingUi(base(), { type: 'more-cats' });
    expect(ui.moreCats).toBe(true);
    ui = reduceDressingUi(ui, { type: 'more-cats' });
    expect(ui.moreCats).toBe(false);
  });

  it('builder-done lands in the wardrobe, with the builder, slot, preview and try-on cleared', () => {
    const ui = reduceDressingUi(
      { ...base(), builder: { any: 1 }, openSlot: 'head', previewCat: 'hagrid', tryOn: { slot: 'head', id: 'tophat' } },
      { type: 'builder-done' },
    );
    expect(ui).toMatchObject({ builder: null, wardrobe: true, openSlot: null, previewCat: null, tryOn: null });
  });

  it('there are no pills any more: a pill action changes nothing', () => {
    const ui = base();
    expect(reduceDressingUi(ui, { type: 'pill', pill: 'where' })).toBe(ui);
    expect(INITIAL_DRESSING_UI).not.toHaveProperty('pill');
    expect(INITIAL_DRESSING_UI).toMatchObject({ wardrobe: false, moreCats: false });
  });

  it('clear-preview resets both preview and try-on, keeping the wardrobe, locked cats and open slot', () => {
    const ui = reduceDressingUi(
      { wardrobe: true, moreCats: true, openSlot: 'head', previewCat: 'hagrid', tryOn: { slot: 'head', id: 'tophat' } },
      { type: 'clear-preview' },
    );
    expect(ui).toEqual({ wardrobe: true, moreCats: true, openSlot: 'head', previewCat: null, tryOn: null, builder: null });
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

describe('createDressingRoom closeWardrobe', () => {
  it('closeWardrobe shuts the wardrobe, the open slot, the try-on and the locked cats', () => {
    const progression = { state: { equipped: {}, unlocked: {} } };
    const room = createDressingRoom({ progression });
    expect(room.ui).toMatchObject({ wardrobe: false, moreCats: false });
    room.handleClick({ target: { closest: () => ({ dataset: { drWardrobe: '' }, ownerDocument: {} }) } });
    expect(room.ui.wardrobe).toBe(true);
    room.closeWardrobe();
    expect(room.ui).toMatchObject({ wardrobe: false, openSlot: null, tryOn: null, moreCats: false });
  });
  it('has no setPill any more, and offers placesHtml', () => {
    const room = createDressingRoom({ progression: { state: { equipped: {}, unlocked: {} } } });
    expect(room.setPill).toBeUndefined();
    expect(typeof room.placesHtml).toBe('function');
  });
});
