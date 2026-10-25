// The dressing room's DOM controller (v21 Stream 5). It owns only UI state
// (which pill, which slot is open, a previewed locked cat, a tried-on
// accessory); everything else is read from progression on each html() call.
// Preview and try-on are NEVER written to the save: they change what the
// stage shows, nothing more, and clearPreview() (called by the owner on hide
// and before Start) drops them, so a walk always uses the owned, equipped cat.
import { CATALOG } from '../progression.js';
import { menuThumbnails } from '../thumbnails.js';
import { buildDressingModel, renderDressingRoomHtml, renderSlotPickerHtml, resolveSheet } from './dressingroom.js';

const PILLS = ['wearing', 'where', 'more'];
export const INITIAL_DRESSING_UI = Object.freeze({ pill: 'wearing', openSlot: null, previewCat: null, tryOn: null });

const has = (obj, k) => !!obj && typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);

// Pure: (ui, action) -> ui. Unknown actions return the same object.
//   {type:'pill', pill}            switch the phone panel
//   {type:'preview-cat', id, owned} show a locked cat in the hero; an owned
//                                   pick (owned:true, or id null) clears it
//   {type:'slot', slot}            toggle a slot's picker; leaving the
//                                   tried-on slot drops the try-on
//   {type:'try-on', slot, id}      try an accessory (again = take it off;
//                                   id null = clear)
//   {type:'clear-preview'}         drop preview cat and try-on
export function reduceDressingUi(ui, action) {
  const cur = ui && typeof ui === 'object' ? ui : INITIAL_DRESSING_UI;
  switch (action && action.type) {
    case 'pill':
      return PILLS.includes(action.pill) && action.pill !== cur.pill ? { ...cur, pill: action.pill } : cur;
    case 'preview-cat': {
      const next = action.owned || typeof action.id !== 'string' ? null : action.id;
      return next === cur.previewCat ? cur : { ...cur, previewCat: next };
    }
    case 'slot': {
      if (typeof action.slot !== 'string') return cur;
      const openSlot = cur.openSlot === action.slot ? null : action.slot;
      const tryOn = cur.tryOn && cur.tryOn.slot === openSlot ? cur.tryOn : null;
      return { ...cur, openSlot, tryOn };
    }
    case 'try-on': {
      if (typeof action.id !== 'string' || typeof action.slot !== 'string') {
        return cur.tryOn ? { ...cur, tryOn: null } : cur;
      }
      const same = cur.tryOn && cur.tryOn.slot === action.slot && cur.tryOn.id === action.id;
      return { ...cur, openSlot: action.slot, tryOn: same ? null : { slot: action.slot, id: action.id } };
    }
    case 'clear-preview':
      return cur.previewCat === null && cur.tryOn === null ? cur : { ...cur, previewCat: null, tryOn: null };
    default:
      return cur;
  }
}

const DR_SELECTOR = '[data-dr-sheet],[data-dr-buy-cat],[data-dr-cat],[data-dr-acc],[data-dr-slot],[data-dr-place],[data-dr-pill]';

export function createDressingRoom({
  progression, catalog = CATALOG, stage = null, sync = null, thumbs = null,
  onChange = () => {}, onOpenSheet = null,
}) {
  let ui = INITIAL_DRESSING_UI;
  let lastShown = null; // what the stage was last asked to show, to skip rebuilding the cat
  const getThumbs = () => thumbs || (thumbs = menuThumbnails());
  const dispatch = (action) => { ui = reduceDressingUi(ui, action); };
  const autoSync = () => { sync?.autoSync?.(); };

  function model() {
    return buildDressingModel(progression.state, catalog, ui);
  }

  function html({ headerHtml = '', statsHtml = '', startHtml = '', extrasHtml = '', sheets } = {}) {
    const state = progression.state;
    const t = getThumbs();
    const m = model();
    const pickerHtml = ui.openSlot ? renderSlotPickerHtml(state, catalog, ui.openSlot, ui.tryOn, t) : '';
    return renderDressingRoomHtml({
      model: m, headerHtml, statsHtml, startHtml, extrasHtml, sheets, thumbs: t,
      ui: { pill: ui.pill, openSlot: ui.openSlot, pickerHtml },
    });
  }

  function afterRender(rootEl) {
    if (!stage || !rootEl) return;
    const el = rootEl.id === 'dr-stage' ? rootEl : rootEl.querySelector?.('#dr-stage');
    if (!el) return;
    stage.mount(el);
    const m = model();
    // equipped slots with the try-on applied (the model already folds it in)
    const accessories = Object.fromEntries(m.slots.map((s) => [s.slot, s.itemId]));
    const key = JSON.stringify([m.hero.id, accessories]);
    if (key !== lastShown || stage.failed) {
      lastShown = key;
      stage.show(m.hero.id, accessories);
    }
  }

  function onCat(id) {
    if (!has(catalog.cats, id)) return;
    if (progression.isUnlocked('cats', id)) {
      progression.equipCat(id);
      dispatch({ type: 'preview-cat', id, owned: true });
    } else {
      dispatch({ type: 'preview-cat', id });
    }
  }

  function onBuyCat(id) {
    if (!has(catalog.cats, id)) return;
    if (progression.buy('cats', id)) {
      progression.equipCat(id); // the cat on show is now yours, and the one you walk
      dispatch({ type: 'preview-cat', id, owned: true });
      autoSync();
    }
  }

  function onAcc(id, act) {
    if (!has(catalog.accessories, id)) return;
    const { slot } = catalog.accessories[id];
    if (act === 'wear') {
      progression.equipAccessory(id);
      dispatch({ type: 'try-on', slot, id: null });
    } else if (act === 'off') {
      progression.unequip(slot);
      dispatch({ type: 'try-on', slot, id: null });
    } else if (act === 'try') {
      if (!progression.isUnlocked('accessories', id)) dispatch({ type: 'try-on', slot, id });
    } else if (act === 'buy') {
      if (progression.buy('accessories', id)) {
        progression.equipAccessory(id); // it was on the cat already as a try-on
        dispatch({ type: 'try-on', slot, id: null });
        autoSync();
      }
    }
  }

  function onPlace(id) {
    if (!has(catalog.areas, id)) return;
    if (progression.isUnlocked('areas', id)) {
      progression.setArea(id);
    } else if (progression.buy('areas', id)) {
      progression.setArea(id);
      autoSync();
    }
  }

  // true when this was a dressing-room control (even if it changed nothing)
  function handleClick(e) {
    const t = e?.target?.closest?.(DR_SELECTOR);
    if (!t) return false;
    const d = t.dataset || {};
    if (d.drSheet !== undefined) {
      const id = resolveSheet(d.drSheet);
      if (id) onOpenSheet?.(id);
      return true;
    }
    if (d.drBuyCat !== undefined) onBuyCat(d.drBuyCat);
    else if (d.drCat !== undefined) onCat(d.drCat);
    else if (d.drAcc !== undefined) onAcc(d.drAcc, d.drAct);
    else if (d.drSlot !== undefined) dispatch({ type: 'slot', slot: d.drSlot });
    else if (d.drPlace !== undefined) onPlace(d.drPlace);
    else if (d.drPill !== undefined) dispatch({ type: 'pill', pill: d.drPill });
    onChange();
    return true;
  }

  function clearPreview() {
    dispatch({ type: 'clear-preview' });
  }

  return {
    html, afterRender, handleClick, clearPreview,
    get ui() { return ui; },
  };
}
