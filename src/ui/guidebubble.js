// The instruction bubble and the ring (design: .claude/plans/
// guided-first-walk-design.md, section 3 "Rules for the bubble / the ring").
//
// The bubble is the HUD's own hint element (hud.setHint): one short sentence,
// a small picture, read out politely once. This module adds what the guided
// walk needs on top of it: key shapes for a keyboard, a second line, a small
// "chip" form, and a ring drawn round the REAL control the sentence is about.
//
// Two things can want the bubble: a hint (src/hints.js, through game/tips.js)
// and a guided step. One shows at a time: the hint while it is up (hints are
// held back during a guided step, so the two never fight), else the guide's.
//
// The ring is an outline only: it has no background and takes no taps, so it
// never covers the control it points at. It is a shape and an arrow, never
// only a colour. With "Reduced motion" on (the setting, or the device's own)
// it is a still, thick, dashed outline with its arrow. It reads the control's
// place off the page, so it follows the left-handed layout by itself.
//
// Every name is set as text (textContent), never as HTML.

// Where each ring name lives on a touch screen. A keyboard has no button for
// most of them: there the picture in the bubble is the key.
export const RING_TARGETS = Object.freeze({
  move: '#tui-joystick-rest',
  prompt: '#hud-prompt',
  pounce: '.tui-btn[data-action="pounce"]',
  meow: '.tui-btn[data-action="meow"]',
  camera: '.tui-btn[data-action="camera"]',
  pause: '#tui-pause',
  chat: '.chat-toggle',
});
// The rings a keyboard player sees: only the yellow button is on her screen.
const KEYBOARD_RINGS = new Set(['prompt']);
const RING_PAD = 7;       // px between the control and the ring
const RING_GROW = 9;      // more, when the ring is drawn bigger (a nudge)

// Is this control on the page and shown?
function shown(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  if (el.classList?.contains('hidden') || el.classList?.contains('gone')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Where the ring goes for a control at `rect` on a page `page` wide and high:
// the box, and which side the arrow sits on ('top' above the control, pointing
// down at it; 'bottom' when there is no room above).
//
// `others` (controls review, 2026-11-19): the boxes of the controls around it
// (each with the small word that hangs under it). The arrow never sits on one
// of them: the 📷 ring's arrow used to stand on the "meow" word above it.
// Above if that is clear, else below, else to the left.
const ARROW_REACH = 30; // the arrow's 7px gap, its 16px height and its bob
const ARROW_HALF = 13;
const meets = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
export function ringBox(rect, page, pad = RING_PAD, others = []) {
  const box = {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  box.radius = Math.min(box.width, box.height) / 2;
  box.arrow = box.top >= 40 ? 'top' : 'bottom';
  if (page && box.arrow === 'bottom' && box.top + box.height + 40 > page.height) box.arrow = 'top';
  if (others.length) {
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const zone = {
      top: { left: cx - ARROW_HALF, right: cx + ARROW_HALF, top: box.top - ARROW_REACH, bottom: box.top },
      bottom: { left: cx - ARROW_HALF, right: cx + ARROW_HALF, top: box.top + box.height, bottom: box.top + box.height + ARROW_REACH },
      left: { left: box.left - ARROW_REACH, right: box.left, top: cy - ARROW_HALF, bottom: cy + ARROW_HALF },
    };
    const fits = (side) => (side !== 'top' || zone.top.top >= 0)
      && (side !== 'bottom' || !page || zone.bottom.bottom <= page.height)
      && (side !== 'left' || zone.left.left >= 0)
      && !others.some((o) => meets(zone[side], o));
    if (!fits(box.arrow)) box.arrow = ['top', 'bottom', 'left'].find(fits) ?? box.arrow;
  }
  return box;
}

// The controls a ring's arrow must leave clear, each with its hanging word.
const NEIGHBOURS = '.tui-btn, .tui-pause, .tui-zoom-btn, .chat-toggle';
const WORD_BELOW = 14;

export function createGuideBubble({ hud, root = document.getElementById('hud'), doc = document, getIsTouch = () => false, getReduced = () => false } = {}) {
  const hintEl = root.querySelector('#hud-hint');
  const textEl = root.querySelector('#hud-hint-text');
  // Key shapes sit where the picture does; the second line under the first.
  const keysEl = doc.createElement('span');
  keysEl.className = 'hud-hint-keys';
  keysEl.setAttribute('aria-hidden', 'true');
  const moreEl = doc.createElement('span');
  moreEl.className = 'hud-hint-more';
  if (hintEl && textEl) {
    hintEl.insertBefore(keysEl, textEl);
    hintEl.appendChild(moreEl);
  }
  const ringEl = doc.createElement('div');
  ringEl.className = 'guide-ring hidden';
  ringEl.setAttribute('aria-hidden', 'true');
  const arrowEl = doc.createElement('span');
  arrowEl.className = 'guide-ring-arrow';
  const thumbEl = doc.createElement('span');
  thumbEl.className = 'guide-ring-thumb';
  thumbEl.textContent = '👆';
  ringEl.appendChild(arrowEl);
  ringEl.appendChild(thumbEl);
  root.appendChild(ringEl);

  let hint = null;   // { text, pic, ring }
  let guide = null;  // { text, pic, keys, more, chip, ring, grow, thumb }
  let drawn = '';
  let ringKey = '';

  function draw() {
    const v = hint ?? guide;
    const key = v ? JSON.stringify([v.text, v.pic, v.keys, v.more, v.chip]) : '';
    if (key !== drawn) {
      drawn = key;
      const keys = v && Array.isArray(v.keys) ? v.keys : [];
      hud.setHint(v ? v.text : null, v && !keys.length ? v.pic : '');
      keysEl.textContent = '';
      for (const k of keys) {
        const kb = doc.createElement('kbd');
        kb.textContent = k;
        keysEl.appendChild(kb);
      }
      keysEl.classList.toggle('turns', keys.length > 1);
      moreEl.textContent = v && v.more ? v.more : '';
      if (hintEl) {
        hintEl.classList.toggle('chip', !!v?.chip);
        hintEl.classList.toggle('chip-paw', v?.chip === 'paw');
        hintEl.classList.toggle('guided', !!v && v === guide);
      }
      root.classList.toggle('hint-chip', !!v?.chip);
    }
    placeRing();
  }

  // The ring round the control the showing line is about, or none.
  function placeRing() {
    const v = hint ?? guide;
    const touch = !!getIsTouch();
    const name = v && !v.chip ? v.ring : null;
    const sel = name && (touch || KEYBOARD_RINGS.has(name)) ? RING_TARGETS[name] : null;
    const target = sel ? doc.querySelector(sel) : null;
    if (!shown(target)) {
      if (ringKey !== '') { ringKey = ''; ringEl.classList.add('hidden'); }
      return;
    }
    const r = target.getBoundingClientRect();
    const others = [];
    for (const el of doc.querySelectorAll?.(NEIGHBOURS) ?? []) {
      if (el === target || !shown(el)) continue;
      const o = el.getBoundingClientRect();
      others.push({ left: o.left, right: o.left + o.width, top: o.top, bottom: o.top + o.height + WORD_BELOW });
    }
    const box = ringBox(r, { width: doc.documentElement?.clientWidth ?? 0, height: doc.documentElement?.clientHeight ?? 0 }, RING_PAD + (v.grow ? RING_GROW : 0), others);
    const still = !!getReduced();
    const key = [name, Math.round(box.left), Math.round(box.top), Math.round(box.width), Math.round(box.height), box.arrow, still, v.grow, v.thumb].join('|');
    if (key === ringKey) return;
    ringKey = key;
    ringEl.style.left = `${box.left}px`;
    ringEl.style.top = `${box.top}px`;
    ringEl.style.width = `${box.width}px`;
    ringEl.style.height = `${box.height}px`;
    ringEl.style.borderRadius = `${box.radius}px`;
    ringEl.dataset.ring = name;
    ringEl.dataset.arrow = box.arrow;
    ringEl.dataset.thumb = v.thumb || '';
    ringEl.classList.toggle('still', still);
    ringEl.classList.toggle('grow', !!v.grow);
    ringEl.classList.remove('hidden');
  }

  return {
    // A hint (src/hints.js): its line, its picture and the control it is about.
    hint(text, pic, ring = null) {
      hint = typeof text === 'string' && text ? { text, pic: pic || '', ring } : null;
      draw();
    },
    // The guided walk's line, or null to put it away.
    guide(view) {
      guide = view && typeof view.text === 'string' && view.text ? { ...view } : null;
      draw();
    },
    // A few times a second while the walk is played: the control may have
    // moved (the yellow button appears, the screen turns).
    update() {
      placeRing();
    },
    get ringShown() { return ringKey !== ''; },
    clear() {
      hint = null;
      guide = null;
      draw();
    },
  };
}
