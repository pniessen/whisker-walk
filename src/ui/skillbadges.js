// The badge strip on the walking screen: one small round badge for each skill the cat has earned
// (Menu -> Skills lists them all; this is the quick look). A lazy chunk: hud.js loads it the first
// time a walk has a skill to show, so a new player downloads nothing for it.
//
//   - Only earned skills show, oldest first, so the newest is on the end. The newest wears a gold
//     ring for a few seconds.
//   - A skill earned mid-walk pops in (a small scale-and-ring). One pop at a time, and on a phone a
//     pop waits for the toast on screen to finish, so the screen still says one thing at a time.
//   - Tap or focus a badge: its name comes as a toast (the toast cap decides how many show).
//   - A phone shows the newest PHONE_MAX and folds the rest into a "+n" badge.
//   - It reads state it is handed (the ids in the save's `skills`); it saves nothing.
import { SKILLS } from '../skills.js';
import { addPhrases, phrase } from '../clanphrases.js';
import { getProfile } from '../profile.js';
import { ICONS, LINES } from './skillbadgewords.js';

addPhrases(LINES);

export const POP_MS = 1400;
export const NEW_MS = 7000;
export const PHONE_MAX = 8;
export const POP_WAIT_MS = 6000; // a pop never waits longer than this for the toast ahead of it
const RETRY_MS = 400;
const NAME = new Map(SKILLS.map((s) => [s.id, s.name]));

export function createBadgeStrip({ root, hud, setTimer = setTimeout, clearTimer = clearTimeout, profile = getProfile }) {
  const doc = root.ownerDocument || document;
  const el = doc.createElement('div');
  el.className = 'hud-badges hidden';
  el.id = 'hud-badges';
  el.setAttribute('role', 'group');
  root.appendChild(el);

  let order = []; // earned ids shown, oldest first
  let queue = []; // earned mid-walk, waiting to pop
  let popping = null;
  let fresh = null; // the id wearing the gold ring
  let timers = [];
  let waited = 0;
  const later = (fn, ms) => { const t = setTimer(fn, ms); timers.push(t); return t; };

  const known = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => NAME.has(id));

  function badge(id) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = `hud-badge${id === fresh ? ' new' : ''}${id === popping ? ' pop' : ''}`;
    b.dataset.skill = id;
    b.textContent = ICONS[id] || '🐾';
    b.setAttribute('aria-label', phrase('skillbadge.aria', NAME.get(id)));
    b.addEventListener('click', () => hud.toast(phrase('skillbadge.named', NAME.get(id)), 0));
    return b;
  }

  function render() {
    el.textContent = '';
    el.setAttribute('aria-label', phrase('skillbadge.row'));
    el.classList.toggle('hidden', order.length === 0);
    const fit = phoneFit();
    const hiddenN = profile() === 'phone' && order.length > fit ? order.length - fit + 1 : 0;
    if (hiddenN) {
      const m = doc.createElement('button');
      m.type = 'button';
      m.className = 'hud-badge hud-badge-more';
      m.textContent = `+${hiddenN}`;
      m.setAttribute('aria-label', phrase('skillbadge.moreAria', hiddenN));
      m.addEventListener('click', () => hud.toast(phrase('skillbadge.more', hiddenN), 0));
      el.appendChild(m);
    }
    for (const id of order.slice(hiddenN)) el.appendChild(badge(id));
    place();
  }

  // How many badges a phone's row holds (the rest fold into "+n"): what fits between the left gutter and the corner
  // map, or the goals pill's width on a phone turned sideways, where toasts take the middle.
  function phoneFit() {
    const w = doc.defaultView;
    if (!w || !w.innerWidth) return PHONE_MAX;
    const map = root.querySelector('#hud-map');
    const avail = w.innerHeight <= 500 ? 220 : w.innerWidth - 32 - ((map && map.offsetWidth) || 88) - 12;
    return Math.max(3, Math.min(PHONE_MAX, Math.floor((avail + 3) / 27)));
  }

  // Under the goals pill when it shows, and clear of the objective and hint cards wherever they sit.
  function place() {
    el.style.top = '';
    const base = root.getBoundingClientRect();
    const me = el.getBoundingClientRect();
    const h = me.height || 0;
    if (!h) return;
    const box = (sel) => {
      const o = root.querySelector(sel);
      if (!o || !o.offsetHeight || o.classList.contains('hidden')) return null;
      const r = o.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top - base.top, b: r.bottom - base.top };
    };
    let top = me.top - base.top;
    const goals = box('#hud-goals');
    if (goals) top = Math.max(top, goals.b + 6);
    const others = ['#hud-objective', '#hud-hint'].map(box).filter(Boolean).sort((x, y) => x.t - y.t);
    for (const o of others) {
      if (o.l < me.right && o.r > me.left && o.t < top + h && o.b > top) top = o.b + 6;
    }
    el.style.top = `${Math.round(top)}px`;
  }

  const win = doc.defaultView;
  let watcher = null;
  if (win && typeof win.ResizeObserver === 'function') {
    watcher = new win.ResizeObserver(place);
    for (const sel of ['#hud-goals', '#hud-objective', '#hud-hint']) { const o = root.querySelector(sel); if (o) watcher.observe(o); }
  }
  const onResize = () => render();
  win?.addEventListener?.('resize', onResize);

  function pump() {
    if (popping || !queue.length) return;
    // A phone says one thing at a time: let the toast on screen finish first.
    if (profile() === 'phone' && hud.toastBusy?.() && waited < POP_WAIT_MS) {
      waited += RETRY_MS;
      later(pump, RETRY_MS);
      return;
    }
    waited = 0;
    popping = queue.shift();
    fresh = popping;
    if (!order.includes(popping)) order.push(popping);
    render();
    later(() => { popping = null; render(); pump(); }, POP_MS);
    later(() => { if (fresh && !popping) { fresh = null; render(); } }, NEW_MS);
  }

  return {
    // The badges for a walk's start: the earned ids in the save, no pop.
    set(ids) {
      for (const t of timers) clearTimer(t);
      timers = []; queue = []; popping = null; fresh = null; waited = 0;
      const have = new Set(known(ids));
      order = SKILLS.map((s) => s.id).filter((id) => have.has(id));
      render();
    },
    // Skills earned just now: each pops in, one at a time.
    earn(ids) {
      for (const id of known(ids)) if (!order.includes(id) && !queue.includes(id)) queue.push(id);
      pump();
    },
    dispose() {
      for (const t of timers) clearTimer(t);
      timers = [];
      watcher?.disconnect();
      win?.removeEventListener?.('resize', onResize);
      el.remove();
    },
    // test seams
    get element() { return el; },
    get shown() { return [...order]; },
    get waiting() { return [...queue]; },
  };
}
