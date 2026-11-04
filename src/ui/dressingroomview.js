// The dressing room's DOM controller (v21 Stream 5). It owns only UI state
// (which pill, which slot is open, a previewed locked cat, a tried-on
// accessory); everything else is read from progression on each html() call.
// Preview and try-on are NEVER written to the save: they change what the
// stage shows, nothing more, and clearPreview() (called by the owner on hide
// and before Start) drops them, so a walk always uses the owned, equipped cat.
import { CATALOG } from '../progression.js';
import { areaInEdition } from '../edition.js';
import { menuThumbnails, customThumbnails, accessoryFraming } from '../thumbnails.js';
import { CONFIRM_DELAY_MS } from './colonypanel.js';
import { CUSTOM_MAX, lookKey } from '../customcats.js';
import { buildDressingModel, renderDressingRoomHtml, renderSlotPickerHtml, resolveSheet } from './dressingroom.js';
import { newBuilder, editBuilder, reduceBuilder, isDirty, buildBuilderModel, renderBuilderHtml, doneLabel } from './catbuilder.js';

const PILLS = ['wearing', 'where', 'more'];
export const INITIAL_DRESSING_UI = Object.freeze({ pill: 'wearing', openSlot: null, previewCat: null, tryOn: null, builder: null });

const has = (obj, k) => !!obj && typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);

// Pure: (ui, action) -> ui. Unknown actions return the same object.
//   {type:'pill', pill}            switch the phone panel
//   {type:'preview-cat', id, owned} show a locked cat in the hero; an owned
//                                   pick (owned:true, or id null) clears it
//   {type:'slot', slot}            toggle a slot's picker; leaving the
//                                   tried-on slot drops the try-on
//   {type:'try-on', slot, id}      try an accessory (again = take it off;
//                                   id null = clear)
//   {type:'clear-preview'}         drop preview cat and try-on, and close
//                                   the builder unsaved
//   {type:'builder', builder}      open, update or (null) close the builder;
//                                   opening it drops the preview and try-on
//   {type:'builder-done'}          the builder saved: close it, back to Wearing
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
      return cur.previewCat === null && cur.tryOn === null && (cur.builder ?? null) === null
        ? cur : { ...cur, previewCat: null, tryOn: null, builder: null };
    case 'builder': {
      const builder = action.builder && typeof action.builder === 'object' ? action.builder : null;
      if (builder === (cur.builder ?? null)) return cur;
      return cur.builder || !builder ? { ...cur, builder } : { ...cur, builder, previewCat: null, tryOn: null, openSlot: null };
    }
    case 'builder-done':
      return { ...cur, builder: null, pill: 'wearing', openSlot: null, previewCat: null, tryOn: null };
    default:
      return cur;
  }
}

const DR_SELECTOR = '[data-dr-sheet],[data-dr-buy-cat],[data-dr-cat],[data-dr-acc],[data-dr-slot],[data-dr-place],[data-dr-pill],'
  + '[data-dr-mine],[data-dr-make],[data-dr-edit],[data-dr-pose],[data-cb-pick],[data-cb-personality],[data-cb-cancel],[data-cb-done],[data-cb-leave],[data-cb-stay]';
const YOUR_CAT = 'Your cat'; // the builder's hero name while the name box is empty
const BLUR_RENDER_MS = 250; // a skipped render runs this long after the name box loses focus
// The builder's cat stands by default (legs, pattern and tail in view); her
// 🐾 Sit pick is kept for the session's browser. The rest of the
// dressing room always sits.
export const BUILDER_POSE_KEY = 'whisker-walk-builder-pose';
const ROOM_POSE = 'sit';
// (window's, never Node's: tests pass their own or run without one)
const defaultStorage = () => { try { return typeof window !== 'undefined' ? window.localStorage ?? null : null; } catch { return null; } };
function readPose(storage) {
  try { return storage?.getItem?.(BUILDER_POSE_KEY) === 'sit' ? 'sit' : 'stand'; } catch { return 'stand'; }
}
function writePose(storage, pose) {
  try { storage?.setItem?.(BUILDER_POSE_KEY, pose); } catch { /* private window: this visit only */ }
}

export function createDressingRoom({
  progression, catalog = CATALOG, stage = null, sync = null, thumbs = null,
  onChange = () => {}, onOpenSheet = null, onProfileChange = () => {}, snapCustom = customThumbnails, now = () => Date.now(),
  onCatSaved = () => {}, later = (fn, ms) => setTimeout(fn, ms), storage = defaultStorage(),
}) {
  let builderPose = readPose(storage); // 'stand' | 'sit'
  let doneAt = null; // when Done last closed the builder (Start then sits under her finger)
  let ui = INITIAL_DRESSING_UI;
  let lastShown = null; // what the stage was last asked to show, to skip rebuilding the cat
  const failedSnaps = new Set(); // portrait keys a failing WebGL could not draw: not retried every render
  let renderPending = false; // a render skipped while she typed her cat's name
  let inClick = false; // a tap's own render is never deferred
  let stripScroll = null; // the portrait strip's scroll, carried across a render
  let revealedFor = null; // the pick last scrolled into view; a render for the same pick keeps her scroll
  const getThumbs = () => {
    if (!thumbs) thumbs = menuThumbnails();
    if (!thumbs.mine) thumbs.mine = {};
    if (!thumbs.worn) thumbs.worn = {};
    return thumbs;
  };
  const dispatch = (action) => { ui = reduceDressingUi(ui, action); };
  const autoSync = () => { sync?.autoSync?.(); };
  const profileChanged = () => { onProfileChange?.(); };
  const builderOp = (action) => { if (ui.builder) dispatch({ type: 'builder', builder: reduceBuilder(ui.builder, action) }); };

  function model() {
    return buildDressingModel(progression.state, catalog, ui);
  }

  // Her cats' portraits: snapped once per key (one throwaway WebGL per batch).
  function snapMine(m, t) {
    const missing = m.mine.filter((c) => !has(t.mine, c.key) && !failedSnaps.has(c.key));
    if (!missing.length) return;
    const entries = [];
    for (const c of missing) {
      const cat = progression.state.customCats.find((x) => x.id === c.id);
      if (cat && !entries.some((e) => e.key === c.key)) entries.push({ key: c.key, breed: c.key.slice(0, c.key.indexOf('|')), look: cat.look });
    }
    let got = {};
    try { got = snapCustom(entries) || {}; } catch { got = {}; }
    for (const e of entries) {
      if (typeof got[e.key] === 'string' && got[e.key]) t.mine[e.key] = got[e.key];
      else failedSnaps.add(e.key);
    }
  }

  // The Wearing slots' pictures: each worn accessory on the cat on show
  // (Polish 3: they were the menu's, on a tabby). Snapped once per look and
  // item, the way her portraits are; a plain tabby keeps the menu's own.
  // slot -> data URL, for the slots that have one.
  function snapWorn(m, t) {
    const h = m.hero;
    const out = {};
    if (h.breed === 'tabby' && !h.look) return out;
    const look = h.look ? lookKey(h.look) : '';
    // Worn items only: a try-on keeps the menu's picture, so browsing the
    // picker never builds a WebGL context on a tap.
    const want = m.slots.filter((s) => s.itemId && !s.trying).map((s) => ({ slot: s.slot, id: s.itemId, key: `worn|${h.breed}|${look}|${s.itemId}` }));
    const missing = want.filter((w) => !has(t.worn, w.key) && !failedSnaps.has(w.key));
    if (missing.length) {
      const entries = missing.map((w) => ({ key: w.key, breed: h.breed, look: h.look, wear: { [w.slot]: w.id }, ...accessoryFraming(w.id) }));
      let got = {};
      try { got = snapCustom(entries) || {}; } catch { got = {}; }
      for (const e of entries) {
        if (typeof got[e.key] === 'string' && got[e.key]) t.worn[e.key] = got[e.key];
        else failedSnaps.add(e.key);
      }
    }
    for (const w of want) if (has(t.worn, w.key)) out[w.slot] = t.worn[w.key];
    return out;
  }

  function html({ headerHtml = '', statsHtml = '', startHtml = '', extrasHtml = '', sheets } = {}) {
    const state = progression.state;
    const t = getThumbs();
    const m = model();
    if (ui.builder) {
      const bm = buildBuilderModel(ui.builder);
      return renderDressingRoomHtml({
        model: m, headerHtml, statsHtml, startHtml, extrasHtml, sheets, thumbs: t,
        ui: {
          pill: ui.pill, builderHtml: `<section class="cb" id="cb">${renderBuilderHtml(bm)}</section>`,
          heroName: bm.name || YOUR_CAT, heroBlurb: bm.blurb,
          // no live cat (no WebGL, or no stage): a still picture cannot sit, so no toggle
          pose: stage && !stage.failed ? builderPose : null,
        },
      });
    }
    snapMine(m, t);
    const wearing = snapWorn(m, t);
    const pickerHtml = ui.openSlot ? renderSlotPickerHtml(state, catalog, ui.openSlot, ui.tryOn, t) : '';
    return renderDressingRoomHtml({
      model: m, headerHtml, statsHtml, startHtml, extrasHtml, sheets, thumbs: { ...t, wearing },
      ui: { pill: ui.pill, openSlot: ui.openSlot, pickerHtml },
    });
  }

  const builderKey = (bm) => JSON.stringify(['builder', bm.breed, lookKey(bm.look), builderPose]);

  // The portrait strip: put back where she had scrolled it, then make sure the
  // cat she is walking (or previewing) is in view: after Done or ✏️ Change
  // her own cat sits at the far end. Only for a new pick (or the first
  // render, or after the builder): a background render for the same pick
  // leaves the strip where she has scrolled it (Polish 3: it snapped back to
  // her cat mid-scroll). (Test fakes have no layout: skipped.)
  function revealSelected(rootEl) {
    const strip = rootEl.querySelector?.('.dr-strip');
    if (!strip || typeof strip.getBoundingClientRect !== 'function') return;
    if (stripScroll !== null) strip.scrollLeft = stripScroll;
    const eq = progression.state?.equipped ?? {};
    const pick = JSON.stringify([eq.cat ?? null, eq.custom ?? null, ui.previewCat]);
    if (pick === revealedFor) return;
    revealedFor = pick;
    const tile = strip.querySelector?.('.dr-portrait[aria-pressed="true"]');
    if (!tile || typeof tile.getBoundingClientRect !== 'function') return;
    const s = strip.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    const pad = 12;
    if (t.left < s.left + pad) strip.scrollLeft += t.left - s.left - pad;
    else if (t.right > s.right - pad) strip.scrollLeft += t.right - s.right + pad;
  }

  function afterRender(rootEl) {
    if (ui.builder) revealedFor = null; // Done or Leave shows her pick again
    if (rootEl && !ui.builder) revealSelected(rootEl);
    if (!stage || !rootEl) return;
    const el = rootEl.id === 'dr-stage' ? rootEl : rootEl.querySelector?.('#dr-stage');
    if (!el) return;
    stage.mount(el);
    if (ui.builder) {
      // ruling 11: the builder always shows the draft bare
      const bm = buildBuilderModel(ui.builder);
      const key = builderKey(bm);
      if (key !== lastShown || stage.failed) {
        lastShown = key;
        stage.setPose?.(builderPose, { redraw: false });
        stage.show(bm.breed, {}, bm.look);
      }
      return;
    }
    const m = model();
    // equipped slots with the try-on applied (the model already folds it in)
    const accessories = Object.fromEntries(m.slots.map((s) => [s.slot, s.itemId]));
    // Fight moves and scars: a cat she owns shows its own scars (by its preset
    // or custom id); a preview of one she doesn't, none.
    const scars = m.hero.owned ? (progression.catScars?.(m.hero.id) ?? []) : [];
    const key = JSON.stringify([m.hero.breed, accessories, m.hero.look ? lookKey(m.hero.look) : null, scars, ROOM_POSE]);
    if (key !== lastShown || stage.failed) {
      lastShown = key;
      stage.setPose?.(ROOM_POSE, { redraw: false });
      if (scars.length > 0) stage.show(m.hero.breed, accessories, m.hero.look, scars);
      else stage.show(m.hero.breed, accessories, m.hero.look);
    }
  }

  // 🐾 Sit in the builder: the render that follows rebuilds the
  // draft in the new pose (the pose is part of builderKey).
  function onPose(p) {
    if (!ui.builder || (p !== 'sit' && p !== 'stand')) return;
    builderPose = p;
    writePose(storage, p);
  }

  function onCat(id) {
    if (!has(catalog.cats, id)) return;
    if (progression.isUnlocked('cats', id)) {
      const eq = progression.state.equipped || {};
      const changed = eq.cat !== id || (eq.custom ?? null) !== null; // a tap that ends a custom choice counts
      if (progression.equipCat(id) && changed) profileChanged();
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
      profileChanged();
    }
  }

  const myCats = () => (Array.isArray(progression.state?.customCats) ? progression.state.customCats : []);

  function onMine(id) {
    const already = progression.state?.equipped?.custom === id;
    if (progression.equipCustom(id)) {
      dispatch({ type: 'preview-cat', id: null, owned: true });
      if (!already) profileChanged(); // her tile again: nothing changed, no re-track
    }
  }

  function onMake() {
    if (ui.builder || myCats().length >= CUSTOM_MAX) return;
    dispatch({ type: 'builder', builder: newBuilder() });
  }

  function onEdit(id) {
    const cat = myCats().find((c) => c.id === id);
    if (cat && !ui.builder) dispatch({ type: 'builder', builder: editBuilder(cat) });
  }

  function onCancel() {
    if (!ui.builder) return;
    if (isDirty(ui.builder)) builderOp({ type: 'ask-leave' });
    else dispatch({ type: 'builder', builder: null });
  }

  // Done: save (new or over the old version), walk it, back to Wearing to dress it.
  function onDone() {
    const b = ui.builder;
    if (!b || !buildBuilderModel(b).canDone) return;
    const { name, personality, look } = b.draft;
    let id = null;
    if (b.mode === 'edit') id = progression.updateCustomCat(b.id, { name, personality, look }) ? b.id : null;
    else id = progression.createCustomCat({ name, personality, look });
    if (!id) { dispatch({ type: 'builder', builder: null }); return; }
    progression.equipCustom(id);
    dispatch({ type: 'builder-done' });
    doneAt = now();
    autoSync();
    profileChanged();
    onCatSaved?.(); // the cloud profile too, so friends and ghosts see the new look
  }

  function onAcc(id, act) {
    if (!has(catalog.accessories, id)) return;
    const { slot } = catalog.accessories[id];
    const worn = () => progression.state?.equipped?.[slot] ?? null;
    const before = worn();
    if (act === 'wear') {
      progression.equipAccessory(id);
      dispatch({ type: 'try-on', slot, id: null });
      if (worn() !== before) profileChanged();
    } else if (act === 'off') {
      progression.unequip(slot);
      dispatch({ type: 'try-on', slot, id: null });
      if (worn() !== before) profileChanged();
    } else if (act === 'try') {
      if (!progression.isUnlocked('accessories', id)) dispatch({ type: 'try-on', slot, id });
    } else if (act === 'buy') {
      if (progression.buy('accessories', id)) {
        progression.equipAccessory(id); // it was on the cat already as a try-on
        dispatch({ type: 'try-on', slot, id: null });
        autoSync();
        if (worn() !== before) profileChanged();
      }
    }
  }

  function onPlace(id) {
    if (!has(catalog.areas, id)) return;
    // Legacy hides Clan-only places; a stray click on one buys and sets nothing.
    if (!areaInEdition(catalog.areas[id], progression.state?.edition)) return;
    if (progression.pickPlace(id) === 'bought') autoSync();
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
    else if (d.drMine !== undefined) onMine(d.drMine);
    else if (d.drMake !== undefined) onMake();
    else if (d.drEdit !== undefined) onEdit(d.drEdit);
    else if (d.drPose !== undefined) onPose(d.drPose);
    else if (d.cbPick !== undefined) builderOp({ type: 'pick', field: d.cbPick, value: d.cbValue });
    else if (d.cbPersonality !== undefined) builderOp({ type: 'personality', value: d.cbPersonality });
    else if (d.cbCancel !== undefined) onCancel();
    else if (d.cbLeave !== undefined) dispatch({ type: 'builder', builder: null });
    else if (d.cbStay !== undefined) builderOp({ type: 'stay' });
    else if (d.cbDone !== undefined) onDone();
    inClick = true;
    try { onChange(); } finally { inClick = false; }
    return true;
  }

  // The builder's name box and size slider change the draft without a
  // render (a render would rebuild the <input> and drop the keyboard or the
  // drag); only what shows the change is patched. true = it was ours.
  function handleInput(e) {
    const t = e?.target;
    const d = t?.dataset;
    if (!d || !ui.builder) return false;
    if (d.cbName !== undefined) {
      builderOp({ type: 'name', value: String(t.value ?? '') });
      const bm = buildBuilderModel(ui.builder);
      const root = t.closest?.('.dr');
      const done = root?.querySelector?.('[data-cb-done]');
      if (done) { done.disabled = !bm.canDone; done.textContent = doneLabel(bm.canDone); }
      const name = root?.querySelector?.('.dr-hero-name');
      if (name) name.textContent = bm.name || YOUR_CAT;
      return true;
    }
    if (d.cbSize !== undefined) {
      builderOp({ type: 'size', value: Number(t.value) }); // a range value is a string
      const bm = buildBuilderModel(ui.builder);
      if (stage) {
        lastShown = builderKey(bm);
        stage.setPose?.(builderPose, { redraw: false });
        stage.show(bm.breed, {}, bm.look);
      }
      return true;
    }
    return false;
  }

  // Typing must never lose the keyboard: the owner re-renders the whole room
  // on a colony poll or a partner re-track, so the name box's focus and
  // caret are carried across. (No document in tests: read it off the root.)
  // (It also notes the portrait strip's scroll, for afterRender.)
  function captureFocus(root) {
    const strip = root?.querySelector?.('.dr-strip');
    stripScroll = strip && typeof strip.scrollLeft === 'number' ? strip.scrollLeft : null;
    const a = root?.ownerDocument?.activeElement;
    if (a?.dataset?.drPose !== undefined) return { pose: true }; // a keyboard toggle keeps its focus
    if (!a || !a.dataset || a.dataset.cbName === undefined) return null;
    return { start: a.selectionStart ?? null, end: a.selectionEnd ?? null };
  }

  function restoreFocus(root, saved) {
    if (!saved) return;
    if (saved.pose) {
      try { root?.querySelector?.('[data-dr-pose]')?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
      return;
    }
    const el = root?.querySelector?.('[data-cb-name]');
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch { /* a nicety */ }
    if (saved.start !== null && saved.end !== null) {
      try { el.setSelectionRange(saved.start, saved.end); } catch { /* not every input has a caret */ }
    }
  }

  // iOS can drop the keyboard when a render replaces the focused name box,
  // whatever restoreFocus does. So while she types (the builder's name box
  // has focus) a background render is skipped and remembered; onFocusOut
  // runs it once she leaves the box. A tap's own render always goes ahead.
  // true = skip this render.
  function deferRender(root) {
    const a = root?.ownerDocument?.activeElement;
    const typing = !!ui.builder && !inClick && !!a && a.dataset?.cbName !== undefined
      && (typeof root.contains !== 'function' || root.contains(a));
    renderPending = typing;
    return typing;
  }

  // The name box lost focus: run the skipped render a beat later, so it never
  // replaces a button between the finger going down and the tap landing (the
  // tap's own render, if it comes first, makes this a no-op).
  function onFocusOut(e, rerender) {
    if (!renderPending || e?.target?.dataset?.cbName === undefined) return false;
    later(() => {
      if (!renderPending) return;
      renderPending = false;
      rerender();
    }, BLUR_RENDER_MS);
    return true;
  }

  // Start, just after Done: the dock's Start sits where Done was, so the tail
  // of a double-tap (detail > 1, or within CONFIRM_DELAY_MS of Done, like
  // confirmClickAllowed) must not start a walk.
  function startAllowed({ detail = 1 } = {}) {
    if (typeof detail === 'number' && detail > 1) return false;
    return doneAt === null || now() - doneAt >= CONFIRM_DELAY_MS;
  }

  // Also called before a walk starts: coming home, her pick is brought into
  // view again (the strip's scroll does not survive the hidden home screen).
  function clearPreview() {
    dispatch({ type: 'clear-preview' });
    revealedFor = null;
  }

  // A walk that ended at a border post opens the home screen on Where to.
  function setPill(pill) {
    dispatch({ type: 'pill', pill });
  }

  return {
    html, afterRender, handleClick, handleInput, captureFocus, restoreFocus, startAllowed, clearPreview,
    deferRender, onFocusOut, setPill,
    get ui() { return ui; },
  };
}
