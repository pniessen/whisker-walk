// The in-page "are you sure?" card. window.confirm cannot be used: the iOS
// app's web view has no confirm panel, so there it answers "no" without
// asking, and Start over did nothing. Like the news card it is mounted
// outside #homebase (render() rebuilds that) and never stacks: the home base
// passes `blocked` (another card is up) and its other cards wait while this
// one is open.
import { CONFIRM_DELAY_MS } from './colonypanel.js';
import { escapeHtml as esc } from '../escapehtml.js';

export const CONFIRM_ATTR = 'data-confirm';

// The card's markup. "Not now" comes first and takes focus: the safe answer
// is the one an Enter or a stray tap reaches.
export function confirmCardHtml({ text, note = '', yes, no = 'Not now', danger = false } = {}) {
  return `<div class="colony-news-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-card-line"${note ? ' aria-describedby="confirm-card-note"' : ''} tabindex="-1">`
    + `<p class="colony-notice-line" id="confirm-card-line">${esc(text)}</p>`
    + (note ? `<p class="colony-news-sub" id="confirm-card-note">${esc(note)}</p>` : '')
    + '<div class="nearby-card-btns">'
    + `<button type="button" class="nearby-card-later" id="confirm-card-no" ${CONFIRM_ATTR}="no">${esc(no)}</button>`
    + `<button type="button" class="colony-news-btn${danger ? ' confirm-card-danger' : ''}" id="confirm-card-yes" ${CONFIRM_ATTR}="yes">${esc(yes)}</button>`
    + '</div></div>';
}

// mount(el): puts the card on the page. blocked(): another card is up.
// onClosed(answer): after the card is gone ('yes', 'no'; not after close()).
export function createConfirmCard({ mount, blocked = () => false, onClosed = () => {}, now = () => Date.now() } = {}) {
  let el = null;
  let asked = null;
  let shownAt = 0;

  function finish(answer) {
    if (!el) return;
    const a = asked;
    el.remove();
    el = null;
    asked = null;
    // Focus goes back where she was before the action moves it anywhere.
    try { a.returnFocus?.(); } catch { /* a nicety */ }
    if (answer === 'yes') a.onYes();
    onClosed(answer);
  }

  // ask({ text, note, yes, no, danger, onYes, returnFocus }): true when the
  // card went up. onYes runs only from its Yes button.
  function ask(opts) {
    if (el || !opts || typeof opts.onYes !== 'function' || typeof opts.text !== 'string' || !opts.text || blocked()) return false;
    asked = opts;
    shownAt = now();
    el = document.createElement('div');
    el.id = 'confirm-card';
    el.className = 'colony-news confirm-overlay';
    el.innerHTML = confirmCardHtml(opts);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeydown);
    mount(el);
    try { el.querySelector('#confirm-card-no')?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
    return true;
  }

  function onClick(e) {
    const answer = e?.target?.closest?.(`[${CONFIRM_ATTR}]`)?.getAttribute?.(CONFIRM_ATTR);
    if (answer === 'no') finish('no');
    // Yes counts only as a deliberate tap: never the tail of a double-tap on
    // the button that asked (the same rule as the colony's swap).
    else if (answer === 'yes' && !(typeof e.detail === 'number' && e.detail > 1) && now() - shownAt >= CONFIRM_DELAY_MS) finish('yes');
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { finish('no'); return; }
    // aria-modal: Tab stays inside the card
    if (e.key !== 'Tab' || !el) return;
    const btns = [...(el.querySelectorAll?.('button') ?? [])];
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement);
    const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : (i === -1 || i === btns.length - 1 ? 0 : i + 1);
    e.preventDefault();
    btns[next].focus?.();
  }

  return {
    ask,
    isOpen: () => !!el,
    // Taken down without an answer (a walk is starting): nothing runs.
    close() {
      if (!el) return;
      el.remove();
      el = null;
      asked = null;
    },
  };
}
