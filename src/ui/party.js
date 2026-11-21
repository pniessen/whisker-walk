// The home-screen party while a gift event is on (the birthday, 2026-11-21;
// src/giftevents.js): a banner over her cat, balloons floating round it, and
// confetti bursts. Plain DOM and CSS (style.css, "The birthday party"),
// nothing drawn in WebGL. Pink stays Start's alone: the banner is navy and
// gold; only the balloons and the confetti are every colour.
//
// The pure half (the words, which cat's name, whether the party is on) is
// unit-tested; createHomeParty is the DOM half homebase.js wires.
import { phrase } from '../clanphrases.js';
import { BIRTHDAY_EVENT, eventWindowOpen } from '../giftevents.js';

// The name on the banner: the cat she is playing as (her own cat's name, or
// the ready-made cat's), never her friend name, which may be her own.
export function partyCatName(state, catalog) {
  const eq = state?.equipped ?? {};
  if (typeof eq.custom === 'string' && Array.isArray(state?.customCats)) {
    const mine = state.customCats.find((c) => c && c.id === eq.custom);
    if (mine && typeof mine.name === 'string' && mine.name) return mine.name;
  }
  const id = typeof eq.cat === 'string' && Object.hasOwn(catalog?.cats ?? {}, eq.cat) ? eq.cat : null;
  return id ? catalog.cats[id].name : 'kitty';
}

export function partyBannerText(catName) {
  return phrase('party.banner', String(catName ?? ''));
}

// The party is on while the save has the birthday and its window is open.
export function birthdayPartyOn(progression, now = new Date()) {
  try {
    return !!progression?.hasEvent?.(BIRTHDAY_EVENT) && eventWindowOpen(BIRTHDAY_EVENT, now);
  } catch {
    return false;
  }
}

// The wrapped present waits on home while the party is on and this save has
// not opened it (progression.presentWaiting: owning its kitten is opening it).
export function presentDue(progression, now = new Date()) {
  try {
    return birthdayPartyOn(progression, now) && !!progression?.presentWaiting?.(BIRTHDAY_EVENT);
  } catch {
    return false;
  }
}

// The balloons round the cat: [left %, top %, colour, size, seconds of bob].
// Kept to the stage's sides and top, clear of the cat in the middle and the
// name along the bottom.
const BALLOONS = Object.freeze([
  [6, 22, '#f2c14e', 1, 5.2], [14, 46, '#4ec9d4', 0.8, 6.1], [80, 18, '#a45ce8', 1, 5.6],
  [88, 42, '#f27ab0', 0.85, 6.6], [72, 52, '#7ed957', 0.7, 5.9], [24, 12, '#ff8a3d', 0.75, 6.3],
]);
const CONFETTI = ['#f2c14e', '#4ec9d4', '#a45ce8', '#f27ab0', '#7ed957', '#ff8a3d', '#ffffff'];
const BURST_MS = 3800;

// The balloons' markup (no text in it).
export function balloonsHtml(since = 0) {
  return BALLOONS.map(([x, y, c, s, d], i) => {
    const delay = -((since / 1000 + i * 0.9) % d);
    return `<span class="party-balloon" style="left:${x}%;top:${y}%;--c:${c};--s:${s};--d:${d}s;animation-delay:${delay.toFixed(2)}s"></span>`;
  }).join('');
}

// createHomeParty({ doc, reduced }): reduced() says whether to keep still
// (her setting or the system's). mount(stage, text) puts the banner and the
// balloons in the hero stage (again after every render, which rebuilds it);
// unmount() takes them away; burst(line?) throws confetti over the whole
// screen, with an optional big line in the middle.
export function createHomeParty({ doc = globalThis.document, reduced = () => false } = {}) {
  const t0 = Date.now();
  let burstEl = null;
  let burstTimer = null;

  function unmount(stage) {
    const root = stage ?? doc?.getElementById?.('dr-stage');
    root?.querySelectorAll?.('.party-layer')?.forEach?.((el) => el.remove());
    root?.classList?.remove?.('party-on');
  }

  // present: { label, onOpen } puts the wrapped box beside the cat (a real
  // button: the layer takes no taps, the box does); null leaves it out.
  function mount(stage, text, present = null) {
    if (!stage || !doc) return;
    const still = reduced();
    // Already up with the same words, stillness and box: left as it is, so the
    // banner does not fade in again on every render.
    const up = stage.querySelector?.('.party-layer');
    if (up && up.querySelector('.party-banner')?.textContent === text && up.classList.contains('still') === still
      && !!up.querySelector('.party-present') === !!present) return;
    unmount(stage);
    const layer = doc.createElement('div');
    layer.className = `party-layer${still ? ' still' : ''}`;
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = `<div class="party-balloons">${balloonsHtml(Date.now() - t0)}</div>`;
    const banner = doc.createElement('div');
    banner.className = 'party-banner';
    banner.setAttribute('role', 'status');
    banner.textContent = text;
    layer.appendChild(banner);
    if (present) {
      const box = doc.createElement('button');
      box.type = 'button';
      box.className = 'party-present';
      box.setAttribute('aria-label', present.label);
      box.innerHTML = '<span class="party-present-lid"></span><span class="party-present-box"></span>';
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        if (box.classList.contains('opening')) return;
        box.classList.add('opening');
        present.onOpen?.(box);
      });
      layer.appendChild(box);
    }
    stage.appendChild(layer);
    stage.classList.add('party-on');
  }

  function clearBurst() {
    if (burstTimer !== null) clearTimeout(burstTimer);
    burstTimer = null;
    burstEl?.remove();
    burstEl = null;
  }

  function burst(line = '') {
    if (!doc?.body) return;
    clearBurst();
    const still = reduced();
    const el = doc.createElement('div');
    el.className = `party-confetti${still ? ' still' : ''}`;
    el.setAttribute('aria-hidden', line ? 'false' : 'true');
    let html = '';
    for (let i = 0; i < 70; i++) {
      const c = CONFETTI[i % CONFETTI.length];
      const left = (Math.random() * 100).toFixed(1);
      const top = still ? `top:${(Math.random() * 70).toFixed(1)}%;` : '';
      const delay = (Math.random() * 0.7).toFixed(2), dur = (2.2 + Math.random() * 1.3).toFixed(2);
      const spin = Math.round(Math.random() * 720 - 360), round = i % 3 === 0 ? ' round' : '';
      html += `<i class="party-bit${round}" style="left:${left}%;${top}--c:${c};--spin:${spin}deg;animation-delay:${delay}s;animation-duration:${dur}s"></i>`;
    }
    el.innerHTML = html;
    if (line) {
      const p = doc.createElement('div');
      p.className = 'party-line';
      p.setAttribute('role', 'status');
      p.textContent = line;
      el.appendChild(p);
    }
    doc.body.appendChild(el);
    burstEl = el;
    burstTimer = setTimeout(clearBurst, BURST_MS);
  }

  return { mount, unmount, burst, clearBurst };
}
