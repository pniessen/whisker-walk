// createDressingRoom's click handling, with a spy progression and fake DOM
// targets (no jsdom in this project). Pins the review focus: previewing and
// trying on never equip, buy, or save anything.
import { describe, it, expect, vi } from 'vitest';
import { CATALOG, createProgression } from '../src/progression.js';
import { createDressingRoom } from '../src/ui/dressingroomview.js';
import { territoryMapModel } from '../src/territories.js';
import { renderTerritoryMapHtml } from '../src/ui/territorymap.js';
import { DEFAULT_LOOK } from '../src/customcats.js';

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

  it('in Legacy a Clan-only place card neither buys nor sets the place', () => {
    const t = setup();
    t.state.edition = 'legacy';
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.state.unlocked.areas.push('woods');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(t.progression.buy).not.toHaveBeenCalled();
    expect(t.progression.setArea).not.toHaveBeenCalled();
    expect(t.state.area).toBe('neighborhood');
  });

  it('in Clan Edition the Woods card buys and sets it as before', () => {
    const t = setup();
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(t.progression.buy).toHaveBeenCalledWith('areas', 'woods');
    expect(t.progression.setArea).toHaveBeenCalledWith('woods');
  });

  // The territory map's Woods is a <g data-dr-place="woods">; these use a real
  // progression so the walk gate is the real canBuy, not a stubbed answer.
  function realSetup() {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    const sync = { autoSync: vi.fn() };
    const dr = createDressingRoom({ progression, sync, thumbs: {}, onChange: () => {} });
    return { dr, progression, sync };
  }

  it('tapping the locked Woods buys nothing and keeps the area', () => {
    const t = realSetup();
    expect(t.progression.state.edition).toBe('canon');
    t.progression.state.walks.neighborhood = 1;
    t.progression.state.points = 9999;
    const before = JSON.stringify(t.progression.state);
    expect(t.dr.handleClick(click({ drPlace: 'woods' }))).toBe(true);
    expect(JSON.stringify(t.progression.state)).toBe(before);
    expect(t.progression.state.area).toBe('neighborhood');
    expect(t.sync.autoSync).not.toHaveBeenCalled();
  });

  it('tapping the opened Woods selects it', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(t.progression.state.unlocked.areas).toContain('woods');
    expect(t.progression.state.area).toBe('woods');
    // and once it is yours, a tap on Twolegplace and back just switches
    t.dr.handleClick(click({ drPlace: 'neighborhood' }));
    expect(t.progression.state.area).toBe('neighborhood');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(t.progression.state.area).toBe('woods');
  });

  it('tapping the locked River buys nothing and keeps the area', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 1;
    t.progression.state.points = 9999;
    const before = JSON.stringify(t.progression.state);
    t.sync.autoSync.mockClear();
    expect(t.dr.handleClick(click({ drPlace: 'river' }))).toBe(true);
    expect(JSON.stringify(t.progression.state)).toBe(before);
    expect(t.progression.state.area).toBe('woods');
    expect(t.sync.autoSync).not.toHaveBeenCalled();
  });

  it('tapping the opened River selects it', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 2;
    t.dr.handleClick(click({ drPlace: 'river' }));
    expect(t.progression.state.unlocked.areas).toContain('river');
    expect(t.progression.state.area).toBe('river');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(t.progression.state.area).toBe('woods');
    t.dr.handleClick(click({ drPlace: 'river' }));
    expect(t.progression.state.area).toBe('river');
  });

  it('tapping the locked Moor buys nothing and keeps the area', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 1;
    t.progression.state.points = 9999;
    const before = JSON.stringify(t.progression.state);
    t.sync.autoSync.mockClear();
    expect(t.dr.handleClick(click({ drPlace: 'moor' }))).toBe(true);
    expect(JSON.stringify(t.progression.state)).toBe(before);
    expect(t.progression.state.area).toBe('woods');
    expect(t.sync.autoSync).not.toHaveBeenCalled();
  });

  it('tapping the opened Moor selects it', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 2;
    t.dr.handleClick(click({ drPlace: 'moor' }));
    expect(t.progression.state.unlocked.areas).toContain('moor');
    expect(t.progression.state.area).toBe('moor');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(t.progression.state.area).toBe('woods');
    t.dr.handleClick(click({ drPlace: 'moor' }));
    expect(t.progression.state.area).toBe('moor');
  });

  it('tapping the locked Pines buys nothing and keeps the area', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 2;
    t.dr.handleClick(click({ drPlace: 'river' }));
    t.progression.state.walks.river = 1;
    t.progression.state.points = 9999;
    const before = JSON.stringify(t.progression.state);
    t.sync.autoSync.mockClear();
    expect(t.dr.handleClick(click({ drPlace: 'pines' }))).toBe(true);
    expect(JSON.stringify(t.progression.state)).toBe(before);
    expect(t.progression.state.area).toBe('river');
    expect(t.sync.autoSync).not.toHaveBeenCalled();
  });

  it('tapping the island before the Pines opens buys nothing; after, it selects the Pines', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 2;
    t.dr.handleClick(click({ drPlace: 'river' }));
    t.progression.state.walks.river = 1;
    t.progression.state.points = 9999;
    // the island's <g> carries data-dr-place="pines", so its tap is the Pines' tap
    const html = renderTerritoryMapHtml(territoryMapModel(t.progression.state, CATALOG));
    expect(html.match(/data-region="island"[^>]*data-dr-place="(\w+)"/)[1]).toBe('pines');
    const before = JSON.stringify(t.progression.state);
    expect(t.dr.handleClick(click({ drPlace: 'pines' }))).toBe(true);
    expect(JSON.stringify(t.progression.state)).toBe(before);
    t.progression.state.walks.river = 2;
    t.dr.handleClick(click({ drPlace: 'pines' }));
    expect(t.progression.state.area).toBe('pines');
  });

  it('tapping the opened Pines selects it', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    t.dr.handleClick(click({ drPlace: 'woods' }));
    t.progression.state.walks.woods = 2;
    t.dr.handleClick(click({ drPlace: 'river' }));
    t.progression.state.walks.river = 2;
    t.dr.handleClick(click({ drPlace: 'pines' }));
    expect(t.progression.state.unlocked.areas).toContain('pines');
    expect(t.progression.state.area).toBe('pines');
    t.dr.handleClick(click({ drPlace: 'river' }));
    expect(t.progression.state.area).toBe('river');
    t.dr.handleClick(click({ drPlace: 'pines' }));
    expect(t.progression.state.area).toBe('pines');
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

// The cat builder inside the dressing room, with a real progression.
describe('createDressingRoom: her own cats and the builder', () => {
  const doneBtn = { disabled: true };
  const heroName = { textContent: '' };
  const fakeRoot = { querySelector: (sel) => (sel.includes('cb-done') ? doneBtn : sel.includes('dr-hero-name') ? heroName : null) };
  const input = (dataset, value) => ({ target: { dataset, value, closest: () => fakeRoot } });

  function real() {
    doneBtn.disabled = true;
    heroName.textContent = '';
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    const sync = { autoSync: vi.fn() };
    const stage = { mount() {}, show: vi.fn(), failed: false };
    const onChange = vi.fn();
    const onProfileChange = vi.fn();
    const dr = createDressingRoom({
      progression, sync, stage, onChange, onProfileChange, snapCustom: () => ({}),
      thumbs: { cats: {}, accessories: {}, mine: {} },
    });
    return { dr, progression, sync, stage, onChange, onProfileChange };
  }

  it('＋ opens the builder; typing a valid name enables Done without a render', () => {
    const { dr, onChange } = real();
    dr.handleClick(click({ drMake: '' }));
    onChange.mockClear();
    expect(dr.handleInput(input({ cbName: '' }, 'Ember'))).toBe(true);
    expect(doneBtn.disabled).toBe(false);
    expect(heroName.textContent).toBe('Ember');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('Done saves, walks and dresses the new cat, and re-tracks the room', () => {
    const { dr, progression, onProfileChange, sync } = real();
    progression.equipAccessory('bell');
    dr.handleClick(click({ drMake: '' }));
    dr.handleClick(click({ cbPick: 'pattern', cbValue: 'socks' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    dr.handleClick(click({ cbDone: '' }));
    expect(progression.state.customCats[0]).toMatchObject({ id: 'mine1', name: 'Ember' });
    expect(progression.state.equipped).toMatchObject({ custom: 'mine1', collar: 'bell' });
    expect(dr.ui).toMatchObject({ builder: null, pill: 'wearing' });
    expect(onProfileChange).toHaveBeenCalled();
    expect(sync.autoSync).toHaveBeenCalled();
  });
  it('Done with an invalid name does nothing', () => {
    const { dr, progression } = real();
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'x'));
    dr.handleClick(click({ cbDone: '' }));
    expect(progression.state.customCats).toEqual([]);
    expect(dr.ui.builder).not.toBe(null);
  });
  it('Not now: clean closes at once; changed asks once; Leave keeps the old version', () => {
    const { dr, progression } = real();
    progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
    dr.handleClick(click({ drEdit: 'mine1' }));
    dr.handleClick(click({ cbCancel: '' }));
    expect(dr.ui.builder).toBe(null);
    dr.handleClick(click({ drEdit: 'mine1' }));
    dr.handleClick(click({ cbPick: 'coat', cbValue: 'black' }));
    dr.handleClick(click({ cbCancel: '' }));
    expect(dr.ui.builder.confirmLeave).toBe(true);
    dr.handleClick(click({ cbLeave: '' }));
    expect(progression.state.customCats[0].look.coat).toBe('ginger');
  });
  it('editing saves over the cat and keeps every accessory', () => {
    const { dr, progression } = real();
    progression.equipAccessory('bell');
    progression.equipCustom(progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK }));
    const outfit = { ...progression.state.equipped };
    dr.handleClick(click({ drEdit: 'mine1' }));
    dr.handleClick(click({ cbPersonality: 'napper' }));
    dr.handleClick(click({ cbDone: '' }));
    expect(progression.state.customCats).toHaveLength(1);
    expect(progression.state.customCats[0].personality).toBe('napper');
    expect(progression.state.equipped).toEqual(outfit);
  });
  it('at three, ＋ does nothing', () => {
    const { dr, progression } = real();
    for (const n of ['Ash', 'Fern', 'Moss']) progression.createCustomCat({ name: n, personality: 'steady', look: DEFAULT_LOOK });
    dr.handleClick(click({ drMake: '' }));
    expect(dr.ui.builder).toBe(null);
  });
  it('a ready-made portrait clears the custom choice; her tile sets it; both re-track', () => {
    const { dr, progression, onProfileChange } = real();
    progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
    dr.handleClick(click({ drMine: 'mine1' }));
    expect(progression.state.equipped.custom).toBe('mine1');
    dr.handleClick(click({ drCat: 'tabby' }));
    expect(progression.state.equipped.custom).toBe(null);
    expect(onProfileChange).toHaveBeenCalledTimes(2);
  });
  it('the builder stage shows the draft bare; the dressing room shows her cat dressed', () => {
    const { dr, progression, stage } = real();
    progression.equipAccessory('bell');
    dr.handleClick(click({ drMake: '' }));
    dr.afterRender({ id: 'dr-stage' });
    expect(stage.show).toHaveBeenLastCalledWith('tabby', {}, DEFAULT_LOOK);
  });
  it('the size slider sets the size and redraws the stage without a render', () => {
    const { dr, stage, onChange } = real();
    dr.handleClick(click({ drMake: '' }));
    onChange.mockClear();
    expect(dr.handleInput(input({ cbSize: '' }, '1.1'))).toBe(true);
    expect(dr.ui.builder.draft.look.size).toBe(1.1);
    expect(stage.show).toHaveBeenLastCalledWith('tabby', {}, { ...DEFAULT_LOOK, size: 1.1 });
    expect(onChange).not.toHaveBeenCalled();
  });
  it('a re-render keeps the draft name', () => {
    const { dr } = real();
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    expect(dr.html()).toContain('value="Ember"');
  });
  it('focus and caret survive a render (a colony poll or a partner re-track)', () => {
    const { dr } = real();
    const fresh = { focus: vi.fn(), setSelectionRange: vi.fn() };
    const root = { ownerDocument: { activeElement: { dataset: { cbName: '' }, selectionStart: 3, selectionEnd: 3 } }, querySelector: () => fresh };
    const saved = dr.captureFocus(root);
    dr.restoreFocus(root, saved);
    expect(fresh.focus).toHaveBeenCalled();
    expect(fresh.setSelectionRange).toHaveBeenCalledWith(3, 3);
    expect(dr.captureFocus({ ownerDocument: { activeElement: { dataset: {} } } })).toBe(null);
  });
  it('clearPreview (a walk starting) closes the builder unsaved', () => {
    const { dr, progression } = real();
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    dr.clearPreview();
    expect(dr.ui.builder).toBe(null);
    expect(progression.state.customCats).toEqual([]);
  });
});
