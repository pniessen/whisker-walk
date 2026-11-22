// A choose-one list card for the pad (the den shop's "what goes here?"): each
// choice is a button, the current one is marked, Close is last and B closes.
// Resolves with the chosen value (a string, '' for "nothing") or null for Close.
// Words come from padwords.js; the choices' labels come from the caller.
import { padLine } from './padwords.js';
import { tvHooks } from '../tvseam.js';
import { escapeHtml as esc } from '../escapehtml.js';

let up = false;

export function listHtml({ title, options, close }) {
  const rows = options.map((o, i) => `<button type="button" class="lp-key lp-func ls-item${o.current ? ' ls-current' : ''}" data-ls-value="${esc(o.value)}" aria-pressed="${!!o.current}"${o.current || (i === 0 && !options.some((x) => x.current)) ? ' data-pad-default' : ''}>${esc(o.label)}${o.current ? ' ✓' : ''}</button>`).join('');
  return `<div class="lp-card ls-card" role="dialog" aria-modal="true" aria-labelledby="ls-title"><h2 id="ls-title" class="lp-title">${esc(title)}</h2><div class="ls-list">${rows}</div><button type="button" class="lp-key lp-func ls-close" data-ls-close>${esc(close)}</button></div>`;
}

/** opts: { doc, mount(el), titleId, slots, options: [{ value, label, current }] }. A second list while one is up resolves null. */
export function openList(opts) {
  const { doc, mount } = opts;
  if (up) return Promise.resolve(null);
  up = true;
  const back = tvHooks.back;
  const returnTo = doc.activeElement ?? null;
  const root = doc.createElement('div');
  root.id = 'choice-list';
  root.className = 'lp-overlay';
  root.setAttribute('data-pad-layer', '');
  root.innerHTML = listHtml({ title: padLine(opts.titleId ?? 'pad.spot.title', opts.slots), options: opts.options ?? [], close: padLine('pad.list.close') });
  return new Promise((resolve) => {
    let closed = false;
    const finish = (value) => {
      if (closed) return;
      closed = true;
      up = false;
      tvHooks.back = back;
      root.remove();
      try { returnTo?.focus?.({ preventScroll: true }); } catch { /* a nicety */ }
      resolve(value);
    };
    root.addEventListener('click', (e) => {
      const el = e?.target?.closest?.('[data-ls-value], [data-ls-close]');
      if (!el) return;
      const v = el.getAttribute('data-ls-value');
      finish(v == null ? null : v);
    });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault?.(); finish(null); }
    });
    tvHooks.back = () => { finish(null); return true; };
    mount(root);
  });
}
