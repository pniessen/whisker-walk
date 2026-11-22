// The letter-picker card: opens over the screen, resolves with the name or null.
// Pad: the menu navigator moves and presses the keys like any card's buttons;
// L1 = Shift, R1 = Space, Square = Delete, Start = OK, B = Cancel (through the
// seam's hooks, so the pad's usual menu buttons do not fire under it). Touch and
// mouse press the keys; a keyboard types (Enter = OK, Esc = cancel) and its keys
// stop at the card so player.js never sees them. All words are padwords.js's.
import { newPicker, reducePicker, pickerModel, actionFor } from './letterpicker.js';
import { padLine } from './padwords.js';
import { tvHooks, tvState } from '../tvseam.js';
import { escapeHtml as esc } from '../escapehtml.js';

const PAD = { X: 2, L1: 4, R1: 5, START: 9 }; // gamepadinput.js PAD_BUTTONS (not imported: this chunk stays light)

let up = false; // one picker at a time

const label = (k) => (k.kind === 'letter' ? k.ch : padLine(`pad.picker.${k.id}`));

/** The card's markup for a model (the text and the keys). */
export function pickerHtml(model, { title, hint }) {
  const keys = model.keys.map((k) => {
    const cls = `lp-key lp-${k.kind}${k.id === 'ok' ? ' lp-ok' : ''}${k.id === 'ok' && !model.canOk ? ' lp-dim' : ''}`;
    const aria = k.kind === 'letter' ? (k.id === 'hyphen' ? 'hyphen' : k.ch) : label(k);
    return `<button type="button" class="${cls}" data-lp-key="${esc(k.id)}" aria-label="${esc(aria)}"${k.id === 'shift' ? ` aria-pressed="${model.shift}"` : ''}${k.id === 'A' ? ' data-pad-default' : ''}`
      + ` style="grid-row:${k.row + 1};grid-column:${k.col} / span ${k.span}">${esc(label(k))}</button>`;
  }).join('');
  return `<div class="lp-card" role="dialog" aria-modal="true" aria-labelledby="lp-title">`
    + `<h2 id="lp-title" class="lp-title">${esc(title)}</h2>`
    + `<div class="lp-preview" aria-live="polite"><span class="lp-text" data-lp-text>${esc(model.text)}</span><span class="lp-caret" aria-hidden="true"></span></div>`
    + '<p class="lp-msg" data-lp-msg role="status"></p>'
    + `<div class="lp-grid">${keys}</div>`
    + `<p class="lp-hint">${hint}</p></div>`;
}

/**
 * Opens the picker. opts: { doc, mount(el), title, initial, alphabet, max, min, valid }.
 * Resolves with the final text (OK) or null (cancel); a second open while one is up resolves null at once.
 */
export function openLetterPicker(opts) {
  const { doc, mount } = opts;
  if (up) return Promise.resolve(null);
  up = true;
  let p = newPicker(opts);
  const back = tvHooks.back;
  const button = tvHooks.button;
  const returnTo = doc.activeElement ?? null;
  const root = doc.createElement('div');
  root.id = 'letter-picker';
  root.className = 'lp-overlay';
  root.setAttribute('data-pad-layer', '');
  const hintText = padLine('pad.picker.hint');
  const hint = tvState.html ? tvState.html(hintText) : esc(tvState.text ? tvState.text(hintText) : hintText);
  root.innerHTML = pickerHtml(pickerModel(p), { title: padLine(opts.titleId ?? 'pad.picker.title.cat'), hint });

  return new Promise((resolve) => {
    let closed = false;
    const finish = () => {
      if (closed) return;
      closed = true;
      up = false;
      tvHooks.back = back;
      tvHooks.button = button;
      root.remove();
      try { returnTo?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
      resolve(p.done === 'ok' ? p.text : null);
    };
    const patch = () => {
      const m = pickerModel(p);
      const text = root.querySelector('[data-lp-text]');
      if (text) text.textContent = m.text;
      const msg = root.querySelector('[data-lp-msg]');
      if (msg) msg.textContent = m.message ? padLine(`pad.picker.${m.message}`) : '';
      const ok = root.querySelector('[data-lp-key="ok"]');
      ok?.classList?.toggle('lp-dim', !m.canOk);
      root.querySelector('[data-lp-key="shift"]')?.setAttribute('aria-pressed', String(m.shift));
      root.classList.toggle('lp-lower', !m.capital); // the letters show the case they will type
    };
    const act = (action) => {
      if (!action) return;
      p = reducePicker(p, action);
      if (p.done) finish(); else patch();
    };
    root.addEventListener('click', (e) => {
      const id = e?.target?.closest?.('[data-lp-key]')?.getAttribute?.('data-lp-key');
      if (id) act(actionFor(id));
    });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation(); // player.js and the browser's Back never see a typed key
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'Tab' || k?.startsWith?.('Arrow')) return; // the browser's own focus moves
      e.preventDefault?.();
      if (k === 'Enter') { if (!e.repeat) act({ type: 'ok' }); }
      else if (k === 'Escape') act({ type: 'cancel' });
      else if (k === 'Backspace') act({ type: 'back' });
      else if (k === ' ' || k === '-' || /^[A-Za-z]$/.test(k ?? '')) act({ type: 'add', ch: k });
    });
    tvHooks.back = () => { act({ type: 'cancel' }); return true; };
    tvHooks.button = (i) => {
      const action = i === PAD.L1 ? { type: 'shift' } : i === PAD.R1 ? { type: 'add', ch: ' ' } : i === PAD.X ? { type: 'back' } : i === PAD.START ? { type: 'ok' } : null;
      if (!action) return false;
      act(action);
      return true;
    };
    mount(root);
  });
}
