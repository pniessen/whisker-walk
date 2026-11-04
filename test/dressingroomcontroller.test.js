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

  // The territory map's Woods is a <g data-dr-place="woods">; these use a real
  // progression, so a place tap goes through the real pickPlace and the walk
  // gate is the real canBuy, not a stubbed answer.
  function realSetup() {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    const sync = { autoSync: vi.fn() };
    const dr = createDressingRoom({ progression, sync, thumbs: {}, onChange: () => {} });
    return { dr, progression, sync };
  }

  it('in Legacy a Clan-only place card neither buys nor sets the place', () => {
    const t = realSetup();
    t.progression.setEdition('legacy');
    t.progression.state.walks.neighborhood = 2;
    t.progression.state.points = 9999;
    const buy = vi.spyOn(t.progression, 'buy');
    const setArea = vi.spyOn(t.progression, 'setArea');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(buy).not.toHaveBeenCalled();
    expect(t.progression.state.area).toBe('neighborhood');
    // even owned, the Woods is not a Legacy place
    t.progression.state.unlocked.areas.push('woods');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(buy).not.toHaveBeenCalled();
    expect(t.progression.state.area).toBe('neighborhood');
    expect(t.sync.autoSync).not.toHaveBeenCalled();
    setArea.mockRestore();
  });

  it('in Clan Edition the Woods card buys and sets it as before, through the real pickPlace', () => {
    const t = realSetup();
    t.progression.state.walks.neighborhood = 2;
    const buy = vi.spyOn(t.progression, 'buy');
    const setArea = vi.spyOn(t.progression, 'setArea');
    t.dr.handleClick(click({ drPlace: 'woods' }));
    expect(buy).toHaveBeenCalledWith('areas', 'woods');
    expect(setArea).toHaveBeenCalledWith('woods');
    expect(t.progression.state.area).toBe('woods');
    expect(t.sync.autoSync).toHaveBeenCalledTimes(1);
  });

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
  const doneBtn = { disabled: true, textContent: '' };
  const heroName = { textContent: '' };
  const fakeRoot = { querySelector: (sel) => (sel.includes('cb-done') ? doneBtn : sel.includes('dr-hero-name') ? heroName : null) };
  const input = (dataset, value) => ({ target: { dataset, value, closest: () => fakeRoot } });

  function real({ now, snapCustom = () => ({}) } = {}) {
    doneBtn.disabled = true;
    doneBtn.textContent = '';
    heroName.textContent = '';
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    const sync = { autoSync: vi.fn() };
    const stage = { mount() {}, show: vi.fn(), failed: false };
    const onChange = vi.fn();
    const onProfileChange = vi.fn();
    const dr = createDressingRoom({
      progression, sync, stage, onChange, onProfileChange, snapCustom, ...(now ? { now } : {}),
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
  it('the Done label follows the name: invalid to valid and back', () => {
    const { dr } = real();
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    expect(doneBtn).toMatchObject({ disabled: false, textContent: 'Done, now dress it up →' });
    dr.handleInput(input({ cbName: '' }, ''));
    expect(doneBtn).toMatchObject({ disabled: true, textContent: 'Name your cat first ✏️' });
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
  describe('🐾 Sit in the builder', () => {
    const memStore = (init = {}) => {
      const m = new Map(Object.entries(init));
      return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: vi.fn((k, v) => m.set(k, String(v))), m };
    };
    function posed({ storage = memStore() } = {}) {
      const map = new Map();
      const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
      const calls = [];
      const stage = {
        mount() {}, failed: false,
        show: vi.fn((...a) => calls.push(['show', ...a])),
        setPose: vi.fn((p, o) => calls.push(['setPose', p, o])),
      };
      const onChange = vi.fn();
      const dr = createDressingRoom({ progression, stage, onChange, storage, snapCustom: () => ({}), thumbs: { cats: {}, accessories: {}, mine: {} } });
      return { dr, stage, calls, storage, onChange, progression };
    }

    it('the builder cat stands by default; the room stays sitting', () => {
      const { dr, calls } = posed();
      dr.afterRender({ id: 'dr-stage' });
      expect(calls.at(-2)).toEqual(['setPose', 'sit', { redraw: false }]);
      dr.handleClick(click({ drMake: '' }));
      dr.afterRender({ id: 'dr-stage' });
      expect(calls.at(-2)).toEqual(['setPose', 'stand', { redraw: false }]);
      expect(calls.at(-1)).toEqual(['show', 'tabby', {}, DEFAULT_LOOK]);
      const html = dr.html();
      expect(html).toContain('data-dr-pose="sit"');
      expect(html).toContain('data-dr-pose="sit">🐾 Sit</button>');
      dr.handleClick(click({ cbCancel: '' })); // clean draft: closes at once
      dr.afterRender({ id: 'dr-stage' });
      expect(calls.at(-2)).toEqual(['setPose', 'sit', { redraw: false }]);
      expect(dr.html()).not.toContain('data-dr-pose');
    });

    it('the toggle sits and stands the draft, re-renders, and is remembered', () => {
      const { dr, stage, storage, onChange } = posed();
      dr.handleClick(click({ drMake: '' }));
      dr.afterRender({ id: 'dr-stage' });
      const shows = stage.show.mock.calls.length;
      onChange.mockClear();
      expect(dr.handleClick(click({ drPose: 'sit' }))).toBe(true);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(storage.setItem).toHaveBeenLastCalledWith('whisker-walk-builder-pose', 'sit');
      dr.afterRender({ id: 'dr-stage' });
      expect(stage.setPose).toHaveBeenLastCalledWith('sit', { redraw: false });
      expect(stage.show.mock.calls.length).toBe(shows + 1);
      expect(dr.html()).toContain('data-dr-pose="stand">🐾 Stand</button>');
      dr.afterRender({ id: 'dr-stage' }); // a plain re-render rebuilds nothing
      expect(stage.show.mock.calls.length).toBe(shows + 1);
      // the size slider keeps her pose
      dr.handleInput({ target: { dataset: { cbSize: '' }, value: '0.9', closest: () => null } });
      expect(stage.setPose).toHaveBeenLastCalledWith('sit', { redraw: false });
      // a new room on the same storage starts the builder sitting
      const again = posed({ storage });
      again.dr.handleClick(click({ drMake: '' }));
      again.dr.afterRender({ id: 'dr-stage' });
      expect(again.stage.setPose).toHaveBeenLastCalledWith('sit', { redraw: false });
    });

    it('outside the builder, or with junk, the toggle does nothing; a broken storage is fine', () => {
      const { dr, storage } = posed();
      dr.handleClick(click({ drPose: 'sit' }));
      expect(storage.setItem).not.toHaveBeenCalled();
      dr.handleClick(click({ drMake: '' }));
      dr.handleClick(click({ drPose: 'nap' }));
      expect(storage.setItem).not.toHaveBeenCalled();
      const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
      const b = posed({ storage: broken });
      b.dr.handleClick(click({ drMake: '' }));
      expect(() => b.dr.handleClick(click({ drPose: 'sit' }))).not.toThrow();
      b.dr.afterRender({ id: 'dr-stage' });
      expect(b.stage.setPose).toHaveBeenLastCalledWith('sit', { redraw: false }); // this visit only
      expect(posed({ storage: null }).dr.html()).toBeTypeOf('string');
    });

    it('no live cat (WebGL failed, or no stage): no toggle', () => {
      const { dr, stage } = posed();
      dr.handleClick(click({ drMake: '' }));
      expect(dr.html()).toContain('data-dr-pose');
      stage.failed = true;
      expect(dr.html()).not.toContain('data-dr-pose');
      const bare = createDressingRoom({ progression: posed().progression, storage: null, snapCustom: () => ({}), thumbs: { cats: {}, accessories: {}, mine: {} } });
      bare.handleClick(click({ drMake: '' }));
      expect(bare.html()).not.toContain('data-dr-pose');
    });

    it('a keyboard toggle keeps its focus across the render', () => {
      const { dr } = posed();
      const fresh = { focus: vi.fn() };
      const root = { ownerDocument: { activeElement: { dataset: { drPose: 'sit' } } }, querySelector: (s) => (s === '[data-dr-pose]' ? fresh : null) };
      dr.restoreFocus(root, dr.captureFocus(root));
      expect(fresh.focus).toHaveBeenCalledWith({ preventScroll: true });
    });
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
  it('a double tap on Done never starts a walk: Start waits out the tap after Done', () => {
    let t = 1000;
    const { dr } = real({ now: () => t });
    expect(dr.startAllowed({ detail: 1 })).toBe(true);
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    dr.handleClick(click({ cbDone: '' }));
    expect(dr.startAllowed({ detail: 1 })).toBe(false);
    t += 300;
    expect(dr.startAllowed({ detail: 1 })).toBe(false);
    t += 400;
    expect(dr.startAllowed({ detail: 1 })).toBe(true);
    expect(dr.startAllowed({ detail: 2 })).toBe(false);
    expect(dr.startAllowed()).toBe(true);
  });
  it('wearing, taking off and buying an accessory re-track; a change that changes nothing does not', () => {
    const { dr, progression, onProfileChange } = real();
    dr.handleClick(click({ drAcc: 'bell', drAct: 'wear' }));
    expect(onProfileChange).toHaveBeenCalledTimes(1);
    dr.handleClick(click({ drAcc: 'bell', drAct: 'wear' })); // already on
    expect(onProfileChange).toHaveBeenCalledTimes(1);
    dr.handleClick(click({ drAcc: 'bell', drAct: 'off' }));
    expect(onProfileChange).toHaveBeenCalledTimes(2);
    dr.handleClick(click({ drAcc: 'bell', drAct: 'off' })); // already off
    expect(onProfileChange).toHaveBeenCalledTimes(2);
    const locked = Object.keys(CATALOG.accessories).find((id) => !CATALOG.accessories[id].prize && !progression.isUnlocked('accessories', id));
    dr.handleClick(click({ drAcc: locked, drAct: 'wear' })); // not hers: nothing is worn
    expect(onProfileChange).toHaveBeenCalledTimes(2);
    progression.state.points = 9999;
    dr.handleClick(click({ drAcc: locked, drAct: 'buy' }));
    expect(progression.state.equipped[CATALOG.accessories[locked].slot]).toBe(locked);
    expect(onProfileChange).toHaveBeenCalledTimes(3);
  });
  it('a tap on the cat she is already walking does not re-track', () => {
    const { dr, progression, onProfileChange } = real();
    dr.handleClick(click({ drCat: 'tabby' }));
    expect(onProfileChange).not.toHaveBeenCalled();
    progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
    dr.handleClick(click({ drMine: 'mine1' }));
    dr.handleClick(click({ drMine: 'mine1' }));
    expect(onProfileChange).toHaveBeenCalledTimes(1);
  });
  it('her portraits are snapped once per key, and a failed key is not retried', () => {
    const snap = vi.fn(() => ({}));
    const { dr, progression } = real({ snapCustom: snap });
    progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
    progression.createCustomCat({ name: 'Fern', personality: 'steady', look: DEFAULT_LOOK }); // same key
    dr.html();
    expect(snap).toHaveBeenCalledTimes(1);
    expect(snap.mock.calls[0][0]).toHaveLength(1);
    expect(snap.mock.calls[0][0][0]).toMatchObject({ breed: 'mainecoon', look: DEFAULT_LOOK });
    dr.html();
    expect(snap).toHaveBeenCalledTimes(1);
  });
  it('a snapped portrait is kept and shown, never snapped again', () => {
    const snap = vi.fn((entries) => Object.fromEntries(entries.map((e) => [e.key, 'data:image/png;base64,AAA'])));
    const { dr, progression } = real({ snapCustom: snap });
    progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
    expect(dr.html()).toContain('src="data:image/png;base64,AAA"');
    dr.html();
    expect(snap).toHaveBeenCalledTimes(1);
  });
  // Polish 3: the Wearing slots pictured each accessory on the menu's tabby.
  it("the Wearing slots picture each worn accessory on her cat, snapped once per look and item", () => {
    const snap = vi.fn((entries) => Object.fromEntries(entries.map((e) => [e.key, `data:image/png;base64,${e.wear ? 'WORN' : 'CAT'}`])));
    const { dr, progression } = real({ snapCustom: snap });
    progression.state.points = 999;
    progression.buy('accessories', 'bell');
    progression.equipAccessory('bell');
    progression.equipCustom(progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK }));
    const html = dr.html();
    const worn = snap.mock.calls.flatMap((c) => c[0]).filter((e) => e.wear);
    expect(worn).toHaveLength(1);
    expect(worn[0]).toMatchObject({ breed: 'mainecoon', look: DEFAULT_LOOK, wear: { collar: 'bell' } });
    const slot = html.slice(html.indexOf('data-dr-slot="collar"'));
    expect(slot.slice(0, slot.indexOf('</button>'))).toContain('src="data:image/png;base64,WORN"');
    const calls = snap.mock.calls.length;
    dr.html();
    expect(snap.mock.calls.length).toBe(calls);
  });
  it('a try-on keeps the menu picture: no snap on a tap in the picker', () => {
    const snap = vi.fn((entries) => Object.fromEntries(entries.map((e) => [e.key, 'data:x'])));
    const { dr, progression } = real({ snapCustom: snap });
    progression.equipCustom(progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK }));
    dr.html();
    const before = snap.mock.calls.length;
    dr.handleClick(click({ drAcc: 'wizard', drAct: 'try' }));
    expect(dr.html()).toContain('(trying)');
    expect(snap.mock.calls.slice(before).flatMap((c) => c[0]).filter((e) => e.wear)).toEqual([]);
  });
  it('a plain tabby keeps the menu pictures and snaps nothing for the slots', () => {
    const snap = vi.fn(() => ({}));
    const { dr, progression } = real({ snapCustom: snap });
    progression.state.points = 999;
    progression.buy('accessories', 'bell');
    progression.equipAccessory('bell');
    progression.equipCat('tabby');
    dr.html();
    expect(snap.mock.calls.flatMap((c) => c[0]).filter((e) => e.wear)).toEqual([]);
  });
  it('walking her cat, the room stage shows its preset, her outfit and its look', () => {
    const { dr, progression, stage } = real();
    progression.equipAccessory('bell');
    progression.equipCustom(progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK }));
    dr.afterRender({ id: 'dr-stage' });
    expect(stage.show).toHaveBeenLastCalledWith('mainecoon', expect.objectContaining({ collar: 'bell' }), DEFAULT_LOOK);
  });
  it('clearPreview (a walk starting) closes the builder unsaved', () => {
    const { dr, progression } = real();
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    dr.clearPreview();
    expect(dr.ui.builder).toBe(null);
    expect(progression.state.customCats).toEqual([]);
  });

  // I2: iOS can drop the keyboard when a background render replaces the
  // focused name box, so the render waits until she leaves the box.
  describe('a render while she types her cat\'s name', () => {
    const nameBox = { dataset: { cbName: '' } };
    const rootWith = (active) => ({ ownerDocument: { activeElement: active }, contains: () => true });
    function typing() {
      const timers = [];
      const t = real();
      const later = vi.fn((fn, ms) => timers.push({ fn, ms }));
      const dr = createDressingRoom({
        progression: t.progression, sync: t.sync, stage: t.stage, onChange: t.onChange, snapCustom: () => ({}),
        thumbs: { cats: {}, accessories: {}, mine: {} }, later,
      });
      return { ...t, dr, later, timers };
    }

    it('is skipped while the builder\'s name box has focus, and runs once after it blurs', () => {
      const { dr, timers } = typing();
      dr.handleClick(click({ drMake: '' }));
      expect(dr.deferRender(rootWith(nameBox))).toBe(true);
      const rerender = vi.fn();
      expect(dr.onFocusOut({ target: nameBox }, rerender)).toBe(true);
      expect(rerender).not.toHaveBeenCalled(); // never between finger-down and the tap
      expect(timers).toHaveLength(1);
      timers[0].fn();
      expect(rerender).toHaveBeenCalledTimes(1);
      expect(dr.deferRender(rootWith(null))).toBe(false); // the flush itself renders
    });
    it('a render that went ahead in the meantime makes the flush a no-op', () => {
      const { dr, timers } = typing();
      dr.handleClick(click({ drMake: '' }));
      dr.deferRender(rootWith(nameBox));
      const rerender = vi.fn();
      dr.onFocusOut({ target: nameBox }, rerender);
      expect(dr.deferRender(rootWith(null))).toBe(false); // e.g. her tap on a pill
      timers[0].fn();
      expect(rerender).not.toHaveBeenCalled();
    });
    it('nothing is skipped with the builder closed, focus elsewhere, or for a tap\'s own render', () => {
      const { dr, onChange } = typing();
      expect(dr.deferRender(rootWith(nameBox))).toBe(false); // builder closed
      dr.handleClick(click({ drMake: '' }));
      expect(dr.deferRender(rootWith({ dataset: {} }))).toBe(false);
      expect(dr.deferRender(rootWith(null))).toBe(false);
      expect(dr.deferRender({ ownerDocument: { activeElement: nameBox }, contains: () => false })).toBe(false);
      const seen = [];
      onChange.mockImplementation(() => seen.push(dr.deferRender(rootWith(nameBox))));
      dr.handleClick(click({ cbPick: 'coat', cbValue: 'black' }));
      expect(seen).toEqual([false]);
      expect(dr.deferRender(rootWith(nameBox))).toBe(true); // and back to deferring after the tap
    });
    it('a blur with nothing pending, or from another field, schedules nothing', () => {
      const { dr, later } = typing();
      dr.handleClick(click({ drMake: '' }));
      expect(dr.onFocusOut({ target: nameBox }, () => {})).toBe(false);
      dr.deferRender(rootWith(nameBox));
      expect(dr.onFocusOut({ target: { dataset: {} } }, () => {})).toBe(false);
      expect(dr.onFocusOut(null, () => {})).toBe(false);
      expect(later).not.toHaveBeenCalled();
    });
  });

  // m3: Done also pushes the cloud profile (friends and ghosts).
  it('Done (and only Done) calls onCatSaved', () => {
    const t = real();
    const onCatSaved = vi.fn();
    const dr = createDressingRoom({
      progression: t.progression, sync: t.sync, stage: t.stage, onChange: t.onChange, snapCustom: () => ({}),
      thumbs: { cats: {}, accessories: {}, mine: {} }, onCatSaved,
    });
    dr.handleClick(click({ drMake: '' }));
    dr.handleInput(input({ cbName: '' }, 'Ember'));
    dr.handleClick(click({ cbPick: 'coat', cbValue: 'black' }));
    expect(onCatSaved).not.toHaveBeenCalled();
    dr.handleClick(click({ cbDone: '' }));
    expect(onCatSaved).toHaveBeenCalledTimes(1);
    dr.handleClick(click({ drMine: 'mine1' }));
    dr.handleClick(click({ drCat: 'tabby' }));
    dr.handleClick(click({ drAcc: 'bell', drAct: 'wear' }));
    expect(onCatSaved).toHaveBeenCalledTimes(1);
    dr.handleClick(click({ drEdit: 'mine1' }));
    dr.handleClick(click({ cbCancel: '' }));
    expect(onCatSaved).toHaveBeenCalledTimes(1);
  });

  // S1: after Done her cat (at the strip's far end) is scrolled into view.
  describe('the portrait strip after a render', () => {
    function stripRoot({ tileLeft, scrollLeft = 0 }) {
      const strip = {
        scrollLeft,
        getBoundingClientRect: () => ({ left: 0, right: 390 }),
        querySelector: (sel) => (sel.includes('aria-pressed="true"') ? tile : null),
      };
      const tile = {
        getBoundingClientRect: () => ({ left: tileLeft - strip.scrollLeft, right: tileLeft - strip.scrollLeft + 70 }),
      };
      return { strip, root: { querySelector: (sel) => (sel === '.dr-strip' ? strip : null) } };
    }
    it('scrolls her selected tile into view, within the strip only', () => {
      const { dr } = real();
      const { strip, root } = stripRoot({ tileLeft: 900 });
      dr.afterRender(root);
      expect(strip.scrollLeft).toBe(900 + 70 - 390 + 12);
    });
    it('leaves a visible tile where it is, and keeps where she had scrolled', () => {
      const { dr } = real();
      const before = stripRoot({ tileLeft: 500, scrollLeft: 300 });
      dr.captureFocus(before.root);
      const after = stripRoot({ tileLeft: 500 });
      dr.afterRender(after.root);
      expect(after.strip.scrollLeft).toBe(300);
    });
    // Polish 3: a background render (a colony poll, a partner re-track)
    // used to snap the strip back to her cat while she was scrolling it.
    it('a background render keeps where she has scrolled, even with her cat out of view', () => {
      const { dr } = real();
      const first = stripRoot({ tileLeft: 900 });
      dr.afterRender(first.root); // her cat brought into view once
      expect(first.strip.scrollLeft).toBe(592);
      const scrolled = stripRoot({ tileLeft: 900, scrollLeft: 0 }); // she scrolls back to the start
      dr.captureFocus(scrolled.root);
      const again = stripRoot({ tileLeft: 900 });
      dr.afterRender(again.root);
      expect(again.strip.scrollLeft).toBe(0);
    });
    it('a new pick, or Done, still brings the picked cat into view', () => {
      const { dr } = real();
      dr.afterRender(stripRoot({ tileLeft: 900 }).root);
      const scrolled = stripRoot({ tileLeft: 900, scrollLeft: 0 });
      dr.captureFocus(scrolled.root);
      dr.handleClick(click({ drCat: 'siamese' }));
      const picked = stripRoot({ tileLeft: 900 });
      dr.afterRender(picked.root);
      expect(picked.strip.scrollLeft).toBe(592);
      // the builder, then Done on her new cat: shown again
      dr.handleClick(click({ drMake: '' }));
      dr.handleInput(input({ cbName: '' }, 'Ember'));
      dr.handleClick(click({ cbDone: '' }));
      dr.captureFocus(stripRoot({ tileLeft: 900, scrollLeft: 0 }).root);
      const done = stripRoot({ tileLeft: 900 });
      dr.afterRender(done.root);
      expect(done.strip.scrollLeft).toBe(592);
    });
    it('after a walk (clearPreview at Start) her cat is brought into view again', () => {
      const { dr } = real();
      dr.afterRender(stripRoot({ tileLeft: 900 }).root);
      dr.captureFocus(stripRoot({ tileLeft: 900, scrollLeft: 0 }).root); // the hidden strip reads 0
      dr.clearPreview();
      const home = stripRoot({ tileLeft: 900 });
      dr.afterRender(home.root);
      expect(home.strip.scrollLeft).toBe(592);
    });
    it('does nothing in the builder or without layout (test fakes)', () => {
      const { dr } = real();
      expect(() => dr.afterRender({ querySelector: () => ({}) })).not.toThrow();
      dr.handleClick(click({ drMake: '' }));
      const { strip, root } = stripRoot({ tileLeft: 900 });
      dr.afterRender(root);
      expect(strip.scrollLeft).toBe(0);
    });
  });
});

// Fight moves and scars (Task 8): the room's stage shows the shown cat's own
// scars when it is hers; a preview of a cat she doesn't own, and the builder,
// show none (and call the stage exactly as before).
describe('createDressingRoom: her cat\'s scars on the stage', () => {
  function real() {
    const map = new Map();
    const progression = createProgression({ getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) });
    const stage = { mount() {}, show: vi.fn(), failed: false };
    const dr = createDressingRoom({
      progression, sync: { autoSync: vi.fn() }, stage, onChange: vi.fn(), onProfileChange: vi.fn(), snapCustom: () => ({}),
      thumbs: { cats: {}, accessories: {}, mine: {} },
    });
    return { dr, progression, stage };
  }

  it('a scarred preset she walks shows its scars', () => {
    const { dr, progression, stage } = real();
    const breed = progression.state.equipped.cat;
    progression.scarCat(breed, 'face');
    dr.afterRender({ id: 'dr-stage' });
    expect(stage.show.mock.calls.at(-1)).toEqual([breed, expect.any(Object), null, progression.catScars(breed)]);
    expect(progression.catScars(breed)).toHaveLength(1);
  });

  it('a scarred custom cat shows its own scars, by its id', () => {
    const { dr, progression, stage } = real();
    const id = progression.createCustomCat({ name: 'Ash', personality: 'steady', look: DEFAULT_LOOK });
    progression.equipCustom(id);
    progression.scarCat(id, 'back');
    dr.afterRender({ id: 'dr-stage' });
    expect(stage.show.mock.calls.at(-1)).toEqual(['mainecoon', expect.any(Object), DEFAULT_LOOK, progression.catScars(id)]);
  });

  it('a preview of a cat she does not own, and the builder, show no scars', () => {
    const { dr, progression, stage } = real();
    progression.scarCat(progression.state.equipped.cat, 'face');
    const locked = Object.keys(CATALOG.cats).find((id) => !progression.isUnlocked('cats', id) && id !== 'hagrid');
    dr.handleClick(click({ drCat: locked }));
    dr.afterRender({ id: 'dr-stage' });
    expect(stage.show.mock.calls.at(-1)).toHaveLength(3);
    dr.handleClick(click({ drMake: '' }));
    dr.afterRender({ id: 'dr-stage' });
    expect(stage.show.mock.calls.at(-1)).toHaveLength(3);
  });
});
