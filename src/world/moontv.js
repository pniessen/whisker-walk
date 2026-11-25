// =============================================================================
// THE MOON'S COUCH SIZE (TV and pad pass). The Moon's three full-screen pages (the telescope, the stamp picker, the binoculars) are DOM overlays with
// pixel sizes written inline, so TV mode's stylesheet (src/tv/tv.css) cannot reach them. This lazy file is the small shared piece they use:
//   tvScale(doc, win)   { tv, s, m }  tv: the page wears html.tv; s: 1 at 1920 px, 2 at 3840 (the TV's own --tv-s, read from the root font size);
//                       m: s x 1.5, the multiplier for a size drawn for a phone or laptop (1 everywhere else, so nothing changes off a TV)
//   makeHintBar(...)    the pad's one line of buttons at the bottom of a page ("left stick look, cross pin, circle close"), shown only while the pad
//                       is the last input (the same rule as the HUD's prompt), in button pictures on a TV and plain symbols otherwise
//   safeEdge(tv, side)  the inset of a corner button: 5 % of the screen on a TV (the safe margin), the usual 14 px otherwise
// Start-up code is not touched: tvseam.js is already in start-up (the HUD reads it). No random number, no clock, no draw call.
// =============================================================================

import { tvState, padHtml, onTv } from '../tvseam.js';

const OFF = Object.freeze({ tv: false, s: 1, m: 1 });

export function tvScale(doc, win) {
  const html = doc?.documentElement;
  if (!html?.classList?.contains?.('tv')) return OFF;
  let px = NaN;
  try { px = parseFloat(win?.getComputedStyle?.(html)?.fontSize); } catch { /* no styles: assume 1080p */ }
  const s = Number.isFinite(px) && px > 0 ? Math.min(3, Math.max(1, px / 24)) : 1;
  return { tv: true, s, m: s * 1.5 };
}

export const safeEdge = (tv, side) => (tv
  ? (side === 'top' ? 'max(14px, env(safe-area-inset-top), 5vh)' : 'max(14px, env(safe-area-inset-left), 5vw)')
  : (side === 'top' ? 'max(14px, env(safe-area-inset-top))' : 'max(14px, env(safe-area-inset-left))'));

/**
 * makeHintBar({ doc, root, text, scale }) -> { el, refresh(scale), dispose() }
 * `text` is a phrase with ⟦tokens⟧ ('' for none: no bar). The bar is hidden unless the pad is the last input; refresh() re-reads that (called on every
 * input change by the listener this makes) and the scale (called by the page's layout()).
 */
export function makeHintBar({ doc, root, text, scale }) {
  if (!doc || !root || !text) return { el: null, refresh() {}, dispose() {}, height: () => 0 };
  const el = doc.createElement('div');
  el.className = 'moon-padbar';
  el.setAttribute?.('aria-hidden', 'true');
  let sc = scale ?? OFF;
  const paint = () => {
    const on = tvState.input === 'pad';
    const html = on ? padHtml(text) : null;
    if (html != null) el.innerHTML = html; else el.textContent = on ? text.replace(/⟦\w+⟧/g, '') : '';
    const px = sc.tv ? Math.round(28 * sc.s) : 18;
    Object.assign(el.style ?? {}, {
      position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: sc.tv ? 'max(14px, 5vh)' : 'max(14px, env(safe-area-inset-bottom))',
      display: on ? 'block' : 'none', maxWidth: sc.tv ? '90vw' : '96vw', boxSizing: 'border-box', textAlign: 'center', whiteSpace: 'normal',
      font: `700 ${px}px/1.35 system-ui, sans-serif`, color: '#fff', background: 'rgba(20,30,52,.86)', border: '2px solid rgba(255,255,255,.35)',
      borderRadius: `${Math.round(px * 0.8)}px`, padding: `${Math.round(px * 0.35)}px ${Math.round(px * 0.8)}px`, pointerEvents: 'none', zIndex: '2',
    });
  };
  paint();
  root.appendChild(el);
  const stop = onTv(paint);
  return {
    el,
    refresh(next) { if (next) sc = next; paint(); },
    dispose() { stop(); el.remove?.(); },
    /** the bar's height in px while it shows (0 hidden): a page keeps its own words clear of it */
    height: () => (el.style?.display === 'none' ? 0 : (el.offsetHeight || Math.round((sc.tv ? 28 * sc.s : 18) * 2.2))),
  };
}
