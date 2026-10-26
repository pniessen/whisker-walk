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
import { applyDenSpot } from '../game/denlive.js';
import { bus as gameBus } from '../events.js';

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
  bus = gameBus,
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
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Den shop');
  mountRoot.appendChild(sheet);

  let active = false;
  let open = false;
  let note = '';

  function render() {
    const body = sheet.querySelector('.ds-body');
    const scroll = body ? body.scrollTop : 0;
    sheet.innerHTML = renderDenShopHtml(progression.state, DEN_ITEMS, DEN_SPOTS, { note });
    const next = sheet.querySelector('.ds-body');
    if (next) next.scrollTop = scroll;
  }

  function show() {
    if (!active || open) return;
    open = true;
    note = '';
    pause();
    doc.body.classList.add('den-shop-open');
    render();
    sheet.classList.remove('hidden');
    sheet.querySelector('.ds-done')?.focus?.();
  }

  function hide({ walkOn = true } = {}) {
    if (!open) return;
    open = false;
    sheet.classList.add('hidden');
    doc.body.classList.remove('den-shop-open');
    if (walkOn) resume();
  }

  function buy(id) {
    if (!progression.buyDenItem(id)) return;
    sync?.autoSync?.();
    hud?.setPoints?.(progression.state.points);
    note = `${DEN_ITEMS[id]?.name ?? 'It'} is yours! Now pick a spot for it.`;
    render();
  }

  function place(spotId, itemId) {
    const before = { ...progression.state.den.placed };
    if (!progression.placeDenItem(spotId, itemId)) {
      render(); // a refused pick puts the select back
      return;
    }
    for (const [sid, now] of changedSpots(before, progression.state.den.placed, DEN_SPOTS)) {
      applyDenSpot(getSession(), sid, now, { player });
    }
    note = itemId
      ? `${DEN_ITEMS[itemId]?.name ?? 'It'}: ${SPOT_LABEL[spotId] ?? 'placed'}. Looks cosy!`
      : `${SPOT_LABEL[spotId] ?? 'That spot'} is empty now.`;
    render();
  }

  button.addEventListener('click', show);
  sheet.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-den-done]')) { hide(); return; }
    const buyBtn = t.closest('[data-den-buy]');
    if (buyBtn) buy(buyBtn.dataset.denBuy);
  });
  sheet.addEventListener('change', (e) => {
    const spotId = e.target?.dataset?.denSpot;
    if (spotId) place(spotId, e.target.value || null);
  });
  doc.addEventListener('keydown', (e) => {
    if (open && e.code === 'Escape') {
      e.preventDefault();
      hide();
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
    if (e.code !== 'Escape') e.stopPropagation();
  });

  return {
    // Shown only on a den walk. Turning it off (the walk ended) closes the
    // sheet without trying to walk on.
    setActive(on) {
      active = !!on;
      button.classList.toggle('hidden', !active);
      if (!active) hide({ walkOn: false });
    },
    open: show,
    close: hide,
    get isOpen() { return open; },
  };
}
