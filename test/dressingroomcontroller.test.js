// createDressingRoom's click handling, with a spy progression and fake DOM
// targets (no jsdom in this project). Pins the review focus: previewing and
// trying on never equip, buy, or save anything.
import { describe, it, expect, vi } from 'vitest';
import { CATALOG } from '../src/progression.js';
import { createDressingRoom } from '../src/ui/dressingroomview.js';

const lockedCat = Object.keys(CATALOG.cats).find((id) => CATALOG.cats[id].price > 0);
const accId = Object.keys(CATALOG.accessories)[0];
const accSlot = CATALOG.accessories[accId].slot;

function setup({ buyResult = true, points = 9999 } = {}) {
  const state = {
    points,
    walks: { neighborhood: 0, park: 0, seaside: 0, den: 0, docks: 0 },
    unlocked: { cats: ['tabby'], accessories: [], areas: ['neighborhood'] },
    equipped: { cat: 'tabby', collar: null, head: null, face: null, neck: null, body: null, back: null, feet: null },
    area: 'neighborhood',
  };
  const calls = [];
  const spy = (name, ret) => vi.fn(() => { calls.push(name); return ret; });
  const progression = {
    state,
    isUnlocked: (kind, id) => (state.unlocked[kind] || []).includes(id),
    equipCat: spy('equipCat'),
    equipAccessory: spy('equipAccessory'),
    unequip: spy('unequip'),
    buy: spy('buy', buyResult),
    setArea: spy('setArea'),
  };
  const sync = { autoSync: vi.fn(() => calls.push('autoSync')) };
  const onChange = vi.fn();
  const dr = createDressingRoom({ progression, sync, thumbs: {}, onChange });
  return { dr, progression, sync, onChange, calls, state };
}
const click = (dataset) => ({ target: { closest: () => ({ dataset }) } });

describe('createDressingRoom handleClick', () => {
  it('clicking a locked portrait previews it: no equipCat, no buy', () => {
    const t = setup();
    expect(t.dr.handleClick(click({ drCat: lockedCat }))).toBe(true);
    expect(t.dr.ui.previewCat).toBe(lockedCat);
    expect(t.progression.equipCat).not.toHaveBeenCalled();
    expect(t.progression.buy).not.toHaveBeenCalled();
  });

  it('"try" on an accessory never equips, buys, or syncs, and leaves the save alone', () => {
    const t = setup();
    const before = JSON.stringify(t.state);
    t.dr.handleClick(click({ drAcc: accId, drAct: 'try' }));
    expect(t.dr.ui.tryOn).toEqual({ slot: accSlot, id: accId });
    expect(t.progression.equipAccessory).not.toHaveBeenCalled();
    expect(t.progression.buy).not.toHaveBeenCalled();
    expect(t.sync.autoSync).not.toHaveBeenCalled();
    expect(JSON.stringify(t.state)).toBe(before);
  });

  it('hero Unlock with enough points buys, then equips, then syncs', () => {
    const t = setup();
    t.dr.handleClick(click({ drBuyCat: lockedCat }));
    expect(t.progression.buy).toHaveBeenCalledWith('cats', lockedCat);
    expect(t.progression.equipCat).toHaveBeenCalledWith(lockedCat);
    expect(t.calls).toEqual(['buy', 'equipCat', 'autoSync']);
    expect(t.dr.ui.previewCat).toBe(null);
  });

  it('a failed buy equips nothing and does not sync', () => {
    const t = setup({ buyResult: false });
    t.dr.handleClick(click({ drBuyCat: lockedCat }));
    expect(t.progression.buy).toHaveBeenCalled();
    expect(t.progression.equipCat).not.toHaveBeenCalled();
    expect(t.sync.autoSync).not.toHaveBeenCalled();
  });

  it('a click outside the dressing room returns false and changes nothing', () => {
    const t = setup();
    expect(t.dr.handleClick({ target: { closest: () => null } })).toBe(false);
    expect(t.dr.handleClick({})).toBe(false);
    expect(t.onChange).not.toHaveBeenCalled();
    expect(t.calls).toEqual([]);
  });

  it('clearPreview resets the previewed cat and the try-on', () => {
    const t = setup();
    t.dr.handleClick(click({ drCat: lockedCat }));
    t.dr.handleClick(click({ drAcc: accId, drAct: 'try' }));
    expect(t.dr.ui.previewCat).toBe(lockedCat);
    expect(t.dr.ui.tryOn).not.toBe(null);
    t.dr.clearPreview();
    expect(t.dr.ui.previewCat).toBe(null);
    expect(t.dr.ui.tryOn).toBe(null);
    expect(t.calls).toEqual([]);
  });
});
