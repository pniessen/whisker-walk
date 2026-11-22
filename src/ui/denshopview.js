// The den shop overlay, inside the den (v21 Stream 5, Task 6). The spec:
// "The shop and the slots move inside the den, where the player can see what
// they are arranging."
//
// A "🛋️ Den shop" button on the HUD, shown only while a den walk is running
// (walk.js calls setActive(isDen) at walk start and setActive(false) at the
// end). It opens a sheet over the lower part of the screen on a phone, or a
// panel down the right on a wide screen, so the room stays in view, and it
// pauses the cat the way the ⏸ button does (the walk is disengaged; nothing
// moves while player.engaged is false). Done — or Escape — closes it and
// walks on.
//
// Buying and placing make the same calls the home screen's den shop made:
// progression.buyDenItem(id) then sync.autoSync(), and
// progression.placeDenItem(spotId, itemId | null) — which moves a piece that
// stood elsewhere. Every spot that changed is re-placed in the running den at
// once (game/denlive.js), without restarting the walk.
import { DEN_ITEMS, DEN_SPOTS } from '../den.js';
import { renderDenShopHtml, changedSpots, SPOT_LABEL } from './denshop.js';
import { createConfirmCard, spendAsk } from './confirmcard.js';
import { tvState, padHtml, onTv } from '../tvseam.js';
import { denWord } from './denwords.js';

/**
 * createDenShopView({ hud, progression, sync, player, getSession, pause, resume,
 *                     hudRoot, mountRoot, doc })
 *
 * pause(): disengage the walk (main.js passes the ⏸ action).
 * resume(): engage it again (main.js passes the pause card's "explore" action).
 */
export function createDenShopView({
  hud = null, progression, sync = null, player = null,
  getSession = () => null, pause = () => {}, resume = () => {},
  hudRoot = document.getElementById('hud'),
  mountRoot = document.getElementById('app') ?? document.body,
  canvas = document.getElementById('game'),
  bus = null,
  applyDenSpot = () => {},
  doc = document,
} = {}) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.id = 'btn-den-shop';
  button.className = 'hud-den-shop hidden';
  button.textContent = '🛋️ Den shop';
  hudRoot.appendChild(button);

  const sheet = doc.createElement('div');
  sheet.id = 'den-shop';
  sheet.className = 'den-shop hidden';
  sheet.setAttribute?.('data-pad-layer', '');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Den shop');
  mountRoot.appendChild(sheet);

  // A desktop player reaches the shop by Esc -> pause card -> this button, with
  // nothing to say so. This line floats under the pause card on a den walk
  // (style.css shows it only with a mouse, only while the card is up).
  const hint = doc.createElement('div');
  hint.setAttribute('id', 'den-shop-hint');
  hint.className = 'den-shop-hint';
  const sayHint = () => {
    const p = tvState.input === 'pad' && padHtml(tvState.padLine?.('pad.den.hint') ?? '');
    if (p) hint.innerHTML = p; else hint.textContent = 'Press Esc, then 🛋️ Den shop to decorate';
  };
  sayHint();
  onTv(sayHint); // TV mode: the pad's words while the pad is the input
  mountRoot.appendChild(hint);

  let active = false;
  let open = false;
  let note = '';
  // After a buy: { kind: 'yours', id } (Place it now / Later). Place mode: { kind: 'hand', id }.
  // UI state only, never saved.
  let stage = null;

  // Buy only asks ("Get the Sunbeam Rug for 25 🐾?"): the walk is already
  // paused under the sheet. The card sits over the sheet (style.css
  // .ds-confirm), and its keys stop at the card like the sheet's do, so
  // Escape answers Not now without closing the shop and player.js never sees
  // Space or an arrow.
  const confirm = createConfirmCard({
    doc,
    mount: (el) => {
      el.classList.add('ds-confirm');
      el.addEventListener('keydown', (e) => e.stopPropagation());
      mountRoot.appendChild(el);
    },
    blocked: () => !open,
  });

  // The last tab she used is kept on this device only (never in the save).
  const TAB_KEY = 'whisker-walk-den-tab';
  const readTab = () => { try { const v = globalThis.localStorage?.getItem(TAB_KEY); return v === 'shop' || v === 'things' ? v : null; } catch { return null; } };
  const writeTab = (v) => { try { globalThis.localStorage?.setItem(TAB_KEY, v); } catch { /* a nicety */ } };
  let tab = null;
  const spotName = (id) => SPOT_LABEL[id] ?? id;
  const itemName = (id) => DEN_ITEMS[id]?.name ?? id;
  const q = (v) => String(v).replace(/["\\]/g, '');

  function render() {
    const body = sheet.querySelector('.ds-body');
    const scroll = body ? body.scrollTop : 0;
    sheet.innerHTML = renderDenShopHtml(progression.state, DEN_ITEMS, DEN_SPOTS, { note, stage, tab: tab ?? undefined });
    const next = sheet.querySelector('.ds-body');
    if (next) next.scrollTop = scroll;
  }

  function show() {
    if (!active || open) return;
    open = true;
    note = '';
    stage = null;
    tab = readTab();
    pause();
    doc.body.classList.add('den-shop-open');
    render();
    sheet.classList.remove('hidden');
    sheet.querySelector('.ds-done')?.focus?.();
  }

  function hide({ walkOn = true } = {}) {
    if (!open) return;
    confirm.close(); // unanswered: nothing is bought
    stage = null; // a piece in hand goes back on the shelf (still hers)
    open = false;
    sheet.classList.add('hidden');
    doc.body.classList.remove('den-shop-open');
    if (walkOn) resume();
  }

  function askBuy(id) {
    const item = DEN_ITEMS[id];
    const points = progression.state?.points;
    if (!item || progression.state?.den?.owned?.includes?.(id) || !(points >= item.price)) return;
    confirm.ask({
      ...spendAsk({ name: item.name, price: item.price, points }),
      returnFocus: () => sheet.querySelector?.(`[data-den-buy="${q}"]`)?.focus?.(),
      onYes: () => {
        buy(id); // focus lands on "Place it now"
      },
    });
  }

  function buy(id) {
    if (!progression.buyDenItem(id)) return; // she can no longer afford it: nothing changes
    sync?.autoSync?.();
    hud?.setPoints?.(progression.state.points);
    note = '';
    stage = { kind: 'yours', id };
    render();
    sheet.querySelector?.('[data-den-place-now]')?.focus?.();
  }

  // Later / Back / Esc: the piece stays hers, unplaced.
  function stopPlacing() {
    if (!stage) return;
    stage = null;
    note = '';
    render();
    sheet.querySelector?.('.ds-done')?.focus?.();
  }
  function startPlacing() {
    if (!stage) return;
    stage = { kind: 'hand', id: stage.id };
    render();
    sheet.querySelector?.('[data-den-hand-spot]')?.focus?.();
  }

  // Moves the spot changes into the running den, once each.
  function applyChanges(before) {
    for (const [sid, now] of changedSpots(before, progression.state.den.placed, DEN_SPOTS)) {
      applyDenSpot(getSession(), sid, now, { player });
    }
  }

  // The piece in hand goes to a spot. A piece already standing there trades places
  // with it when the hand's piece came from a spot, and goes back on the shelf otherwise.
  function place(spotId, itemId) {
    const before = { ...progression.state.den.placed };
    const there = before[spotId];
    const from = stage?.kind === 'hand' && stage.id === itemId ? stage.from : null;
    if (!progression.placeDenItem(spotId, itemId)) {
      render();
      return;
    }
    let swapped = null;
    if (there && there !== itemId && from && before[from] === itemId && progression.placeDenItem(from, there)) swapped = there;
    applyChanges(before);
    stage = null;
    note = swapped ? denWord('swapNote', null, { name: itemName(itemId), other: itemName(swapped) })
      : denWord('placedNote', null, { name: itemName(itemId), spot: spotName(spotId) });
    render();
    sheet.querySelector?.(`[data-den-plan-spot="${q(spotId)}"]`)?.focus?.();
  }

  // Clears a spot (the piece stays hers, on the shelf).
  function putAway(spotId) {
    const before = { ...progression.state.den.placed };
    if (!before[spotId] || !progression.placeDenItem(spotId, null)) return;
    applyChanges(before);
    stage = null;
    note = denWord('emptyNote', null, { spot: spotName(spotId) });
    render();
    sheet.querySelector?.(`[data-den-plan-spot="${q(spotId)}"]`)?.focus?.();
  }

  // Takes a piece in hand: from a spot (pick up) or from the shelf. Only what she owns.
  function takeInHand(itemId) {
    const den = progression.state?.den;
    if (!den?.owned?.includes?.(itemId)) return;
    const from = Object.keys(den.placed).find((sid) => den.placed[sid] === itemId) ?? null;
    stage = { kind: 'hand', id: itemId, from };
    note = '';
    tab = 'things';
    render();
    sheet.querySelector?.(from ? `[data-den-plan-spot="${q(from)}"]` : '[data-den-hand-spot]')?.focus?.();
  }

  function planTap(spotId) {
    if (stage?.kind === 'hand') { place(spotId, stage.id); return; }
    const itemId = progression.state?.den?.placed?.[spotId];
    if (itemId) { takeInHand(itemId); return; }
    note = denWord('pickFirst');
    render();
    sheet.querySelector?.(`[data-den-plan-spot="${q(spotId)}"]`)?.focus?.();
  }

  function setTab(id) {
    if (id !== 'shop' && id !== 'things') return;
    tab = id;
    writeTab(id);
    stage = null;
    note = '';
    render();
    sheet.querySelector?.(`[data-den-tab="${id}"]`)?.focus?.();
  }

  button.addEventListener('click', show);
  sheet.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-den-done]')) { hide(); return; }
    if (t.closest('[data-den-later]')) { stopPlacing(); return; }
    if (t.closest('[data-den-place-now]')) { startPlacing(); return; }
    const tabBtn = t.closest('[data-den-tab]');
    if (tabBtn) { setTab(tabBtn.dataset.denTab); return; }
    const away = t.closest('[data-den-put-away]');
    if (away) { if (stage?.kind === 'hand' && stage.from) putAway(stage.from); return; }
    const chip = t.closest('[data-den-hand-item]');
    if (chip) { takeInHand(chip.dataset.denHandItem); return; }
    const spot = t.closest('[data-den-plan-spot]');
    if (spot) { planTap(spot.dataset.denPlanSpot); return; }
    const buyBtn = t.closest('[data-den-buy]');
    if (buyBtn) askBuy(buyBtn.dataset.denBuy);
  });
  doc.addEventListener('keydown', (e) => {
    if (open && e.code === 'Escape') {
      e.preventDefault();
      if (stage) stopPlacing(); else hide();
    }
  });

  // THE PAUSE MUST HOLD while the sheet is up, and two of player.js's
  // document-wide listeners would break it (player.js is left alone):
  //
  //  * a click on the canvas requests pointer lock whenever the player is
  //    enabled — and the room is deliberately left visible around the sheet,
  //    so a click there would re-engage the walk underneath it with the
  //    cursor captured. Swallowed here in the CAPTURE phase, on the document,
  //    so the click never reaches the canvas at all;
  //  * belt and braces: if a lock is gained anyway, the sheet gets out of the
  //    way rather than sitting over a walk that is running (no resume — the
  //    walk already is).
  doc.addEventListener('click', (e) => {
    if (open && canvas && e.target === canvas) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  bus?.on?.('player:lockchange', ({ locked } = {}) => {
    if (open && locked) hide({ walkOn: false });
  });
  //  * player.js preventDefaults Arrow/Space on every keydown while enabled,
  //    which would stop a focused <select> stepping and a focused button
  //    pressing. Keys typed inside the sheet stop here and stay with the form
  //    control — except Escape, which bubbles on to close the sheet.
  sheet.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') return;
    e.stopPropagation();
    const t = e.target;
    const onTab = t?.closest?.('[data-den-tab]');
    if (onTab && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault?.();
      setTab(e.code === 'ArrowLeft' ? 'shop' : 'things');
      return;
    }
    // Delete or Backspace on a standing piece (nothing in hand) puts it away.
    const onSpot = t?.closest?.('[data-den-plan-spot]');
    if (onSpot && !stage && (e.code === 'Delete' || e.code === 'Backspace')) {
      e.preventDefault?.();
      putAway(onSpot.dataset.denPlanSpot);
    }
  });

  return {
    // Shown only on a den walk. Turning it off (the walk ended) closes the
    // sheet without trying to walk on.
    setActive(on) {
      active = !!on;
      button.classList.toggle('hidden', !active);
      doc.body.classList.toggle('den-walk', active);
      if (!active) hide({ walkOn: false });
    },
    open: show,
    close: hide,
    get isOpen() { return open; },
    // The browser's Back (ui/backstack.js): the question first ("Not now"),
    // then the shop (close, as Done does).
    get isAsking() { return confirm.isOpen(); },
    // Then the piece in hand or the "is yours" card (Later), then the shop.
    get isPlacing() { return !!stage; },
    stopPlacing,
    notNow() { confirm.cancel(); },
  };
}
