// The page pieces couch play adds to the walk's HUD: two prompt slots (left
// for cat one, right for cat two), the finder chip beside a toast, the "+N"
// that floats over a finder, the ring that fills while a pad holds "hop to my
// friend", and the edge marker of a cat who is out of the picture. All real
// elements inside the TV's 5 % safe margins; type never under the TV floors
// (24 px body, 20 px small), markers never under 48 px. Words come in from
// the caller (src/coop/words.js).
import { coop } from '../coopseam.js';
import { EDGE_PX, EDGE_MARGIN } from './rules.js';
import { MARK_ONE, MARK_TWO } from './markers.js';

export const FLOOR_BODY = 24; // px, on the TV
export const FLOOR_SMALL = 20;
export const HEX = ['#3b82f6', '#f59e0b'];
const SHAPE = ['●', '◆']; // circle, diamond: colour is never the only cue

export const CSS = `
.coop-slot,.coop-chip,.coop-pop,.coop-ring,.coop-edge{position:fixed;z-index:31;pointer-events:none;font-family:Avenir,system-ui,sans-serif;color:#fff}
.coop-slot[hidden],.coop-chip[hidden],.coop-pop[hidden],.coop-ring[hidden],.coop-edge[hidden]{display:none}
.coop-slot{bottom:calc(max(5vh,24px) + 74px);max-width:30vw;padding:.4em .9em;border-radius:12px;background:rgba(20,26,38,.86);font-weight:700;font-size:20px;line-height:1.3;border-bottom:5px solid var(--c)}
.coop-slot.left{left:5vw}
.coop-slot.right{right:5vw;text-align:right}
.coop-slot .pad-glyph{width:1.3em;height:1.3em;vertical-align:-.3em}
.coop-chip{top:max(5vh,24px);left:50%;transform:translateX(-50%);display:flex;gap:.5em;align-items:center;padding:.3em .8em;border-radius:999px;background:rgba(20,26,38,.86);font-weight:700;font-size:20px;border-left:8px solid var(--c)}
.coop-pop{font-weight:800;font-size:24px;text-shadow:0 2px 4px rgba(0,0,0,.6);left:0;top:0;will-change:transform}
.coop-ring{width:56px;height:56px;margin:-28px 0 0 -28px;left:0;top:0;border-radius:50%;-webkit-mask:radial-gradient(circle,transparent 15px,#000 16px);mask:radial-gradient(circle,transparent 15px,#000 16px)}
.coop-edge{left:0;top:0;width:${EDGE_PX}px;height:${EDGE_PX}px;margin:-${EDGE_PX / 2}px 0 0 -${EDGE_PX / 2}px;display:flex;align-items:center;justify-content:center;background:var(--c);border:3px solid #fff;box-sizing:border-box;font-size:24px;line-height:1}
.coop-edge.s0{border-radius:50%}
.coop-edge.s1{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);border:0}
.coop-edge span{display:block;color:#fff;text-shadow:0 0 3px rgba(0,0,0,.7)}
html.coop-on .hud-prompt{left:5vw !important;right:auto !important;transform:none !important;max-width:30vw !important}
html.tv .coop-slot,html.tv .coop-chip{font-size:24px}
html.tv .coop-pop{font-size:28px}
`;

/** Split screen (src/coop/splithud.js) sets `fn(slotsList, text)` to learn who a toast and the finder chip belong to; null in every other mode.
 * Lives on the seam object, so the split HUD's lazy chunk imports nothing from this file (a shared module between two lazy chunks reshuffled the build). */
export const chipHook = { get fn() { return coop.chipHook ?? null; }, set fn(f) { coop.chipHook = f; } };

export function createCoopHud({ doc = document, view = () => ({ w: 1920, h: 1080 }) } = {}) {
  const make = (tag, cls) => { const e = doc.createElement(tag); e.style ??= {}; if (cls) e.className = cls; return e; };
  const style = make('style');
  style.textContent = CSS;
  (doc.head ?? doc.body)?.appendChild(style);
  const add = (e) => { e.hidden = true; doc.body?.appendChild(e); return e; };

  const slots = [add(make('div', 'coop-slot left')), add(make('div', 'coop-slot right'))];
  slots.forEach((e, i) => { e.style['--c'] = HEX[i]; e.setAttribute('role', 'status'); });
  const chip = add(make('div', 'coop-chip'));
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-live', 'polite');
  const rings = [add(make('div', 'coop-ring')), add(make('div', 'coop-ring'))];
  const edges = [add(make('div', 'coop-edge s0')), add(make('div', 'coop-edge s1'))];
  edges.forEach((e, i) => { e.style['--c'] = HEX[i]; e.setAttribute('role', 'img'); const a = make('span'); a.textContent = '➤'; e.appendChild(a); });
  const pops = []; // { el, t, x, y }
  let chipLeft = 0;
  let htmlOn = false;

  const at = (e, x, y, extra = '') => { e.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)${extra}`; };

  return {
    slots, chip, rings, edges, pops,
    /** A line in cat `slot`'s prompt slot (html: escaped, ⟦tokens⟧ drawn; text: the plain form). null hides it. */
    prompt(slot, html, text) {
      const e = slots[slot];
      if (!html) { if (!e.hidden) { e.hidden = true; e.dataset.text = ''; } return; }
      if (e.dataset.text === text && !e.hidden) return;
      e.innerHTML = html; e.dataset.text = text; e.setAttribute('aria-label', text); e.hidden = false;
    },
    /** The finder chip: the cat's shape, colour and name, for `ms` milliseconds; `slots` more than one when both found it. */
    chipShow(slotsList, names, ms, text) {
      chipHook.fn?.(slotsList, text);
      const one = slotsList.length === 1;
      chip.style['--c'] = one ? HEX[slotsList[0]] : '#ffffff';
      chip.textContent = one ? `${SHAPE[slotsList[0]]} ${names[slotsList[0]]}` : `${SHAPE[0]} ${SHAPE[1]}`;
      chip.hidden = false;
      chipLeft = ms / 1000;
    },
    /** "+N" over a finder at pixel (x, y); it rises and fades for `life` seconds (it only fades when `reduced`). */
    pop(n, slot, x, y, reduced = false) {
      const el = make('div', 'coop-pop');
      el.textContent = `+${n}`;
      el.style.color = HEX[slot];
      el.hidden = false;
      doc.body?.appendChild(el);
      const p = { el, t: 0, x, y, reduced };
      at(el, x, y);
      pops.push(p);
    },
    /** The fill ring over a cat that is holding the hop button; 0 hides it. */
    ring(slot, progress, x, y) {
      const e = rings[slot];
      if (!(progress > 0)) { e.hidden = true; return; }
      e.hidden = false;
      e.style.background = `conic-gradient(${HEX[slot]} ${Math.round(progress * 360)}deg, rgba(255,255,255,.25) 0)`;
      at(e, x, y);
    },
    /** An edge marker: m is rules.edgeMarker's answer; the label says who is out of sight. */
    edge(slot, m, label) {
      const e = edges[slot];
      if (!m.show) { e.hidden = true; return; }
      e.hidden = false;
      e.setAttribute('aria-label', label);
      at(e, m.x, m.y);
      e.children[0].style.transform = `rotate(${m.angle}rad)`;
    },
    /** The html class that moves the walk's own prompt to cat one's side. */
    setOn(on) {
      if (on === htmlOn) return;
      htmlOn = on;
      const root = doc.documentElement ?? doc.body;
      if (!root) return;
      root.classList?.[on ? 'add' : 'remove']?.('coop-on');
    },
    step(dt) {
      if (!chip.hidden) { chipLeft -= dt; if (chipLeft <= 0) chip.hidden = true; }
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.t += dt;
        const k = Math.min(1, p.t / 1.1);
        p.el.style.opacity = String(1 - k * k);
        at(p.el, p.x, p.reduced ? p.y : p.y - 70 * k);
        if (k >= 1) { p.el.remove?.(); pops.splice(i, 1); }
      }
    },
    view,
    hideAll() {
      for (const e of [...slots, chip, ...rings, ...edges]) e.hidden = true;
      for (const p of pops.splice(0)) p.el.remove?.();
      this.setOn(false);
    },
    dispose() {
      this.hideAll();
      for (const e of [style, ...slots, chip, ...rings, ...edges]) e.remove?.();
    },
  };
}

export const COLOURS = { one: MARK_ONE, two: MARK_TWO };
export { EDGE_MARGIN };
