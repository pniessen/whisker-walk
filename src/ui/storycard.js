// THE STORY CARD (2026-11-28, docs/superpowers/specs/2026-11-28-story-cards-design.md): a small "story so far" card at the start of a walk in a place that has a
// mission, so the child has the big picture at once. A LAZY file (with ui/storycardwords.js, which holds every word): walk.js fetches it only when a walk begins in
// one of STORY_PLACES. It is a plain DOM card in the page's own HUD (no mesh, no draw, no animation, so reduced motion is the same) and it NEVER blocks the walk or the
// room: only its own OK button takes a tap. No save key: where she is comes from the saved mission steps (state.moon, state.reef...) and the journal (the job places);
// whether to show it by itself comes from state.walks[place] (the first two walks there). No clock and no random number: its 30 seconds are the walk's own dt.
// The chapter rules are pure (chapterFor) and read only the save. They repeat the missions' step repairs on purpose, so the mission files stay out of this chunk
// (test/storycards.test.js checks the two agree on many saves).
import { crumb } from '../diagnostics.js';
import { onTv } from '../tvseam.js';
import { chapterLines, STORY_TEXT, BUTTONS } from './storycardwords.js';

// THE CATALOG: every place that has a story card. test/storycards.test.js fails when a mission file or a job list has no entry here.
export const STORY_PLACES = Object.freeze(['moon', 'reef', 'crystal', 'jungle', 'snowville', 'treehouse', 'greenhouse', 'lighthouse', 'farm', 'market', 'house', 'fair']);
export const SHOW_SECS = 30;
// the card comes by itself on EVERY arrival in a place (no lesson open); the pause card's Story button brings it back
const STATIC_PLACES = Object.freeze(['house', 'fair']); // places with no story to track: one fixed card, always "finished"

// the job places: the journal page of each job (done when its count is above 0), in the order the card offers them
export const JOB_PAGES = Object.freeze({
  greenhouse: Object.freeze({ seeds: 'ghjobseeds', water: 'ghjobwater' }),
  lighthouse: Object.freeze({ kitten: 'lhjobkitten', lamp: 'lhjoblamp' }),
  farm: Object.freeze({ chicks: 'jobchicks', cow: 'jobcow', goat: 'jobgoat', mice: 'jobmice' }),
  market: Object.freeze({ mouse: 'mkmouse', glove: 'mkglove', pigeons: 'mkpigeons', bell: 'mkbell', stray: 'mkstray', fiddle: 'mkfiddle' }),
});

const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo ? Math.min(hi, v) : lo);
const pop = (b) => { let n = 0; for (let x = b; x; x &= x - 1) n++; return n; };

// A mission's step with the repairs its normalize() makes: a stone, shell, fruit, candle or letter in place means the step it implies.
export function stepOf(rec, bitsKey) {
  const r = rec && typeof rec === 'object' ? rec : {};
  let step = int(r.step, 0, 9);
  const bits = int(r[bitsKey], 0, 7);
  if (bitsKey !== 'cells') {
    if (bits & 1) step = Math.max(step, 2);
    if ((bits & 3) === 3) step = Math.max(step, 3);
    if ((bits & 7) === 7) step = Math.max(step, 4);
    return Math.min(7, step);
  }
  const n = pop(bits & 3);
  if (step >= 4) return step;
  return n > 0 ? Math.max(step, n === 2 ? 3 : 2) : step;
}

// the Echo Deep's rules, repeated: each deep bit implies the ones before it; open once the story is told, three songs, two rubbings
const deepBits = (b) => { const x = int(b, 0, 15); return x & 8 ? 15 : x & 4 ? 7 : x & 2 ? 3 : x & 1; };
const DEEP_KEY = { 0: 'deepwall', 1: 'deepprism', 3: 'deepfind', 7: 'deephome', 15: 'deepdone' }; // by deep bits: the chapter of the next step (bit 0 = wall open)
const deepOpen = (c) => stepOf(c, 'sparks') >= 7 && int(c?.songs, 0, 7) === 7 && pop(int(c?.album, 0, 4095)) >= 2;

// Where she is in a place's story, from the save alone: { place, keys, ctx, finished }. keys are chapter ids in the table (their lines are joined, four at most).
// Job places answer { place, jobs: true, done: [ids], next: id|null, finished }.
export function chapterFor(place, state, { deepOn = false } = {}) {
  const s = state && typeof state === 'object' ? state : {};
  if (JOB_PAGES[place]) {
    const pages = JOB_PAGES[place];
    const ids = Object.keys(pages);
    const done = ids.filter((id) => (s.journal?.[pages[id]] ?? 0) > 0);
    return { place, jobs: true, done, total: ids.length, next: ids.find((id) => !done.includes(id)) ?? null, finished: done.length === ids.length };
  }
  if (STATIC_PLACES.includes(place)) return { place, keys: ['intro'], ctx: {}, finished: true };
  if (place === 'moon') {
    const m = s.moon ?? {};
    const step = stepOf(m, 'cells');
    const cells = int(m.cells, 0, 7);
    const ctx = { n: pop(cells & 3) };
    if (step >= 8) {
      const keys = ['done'];
      if (!(cells & 4)) keys.push('cave');
      if (int(m.relay, 0, 31) < 16) keys.push('relay');
      return { place, keys, ctx, finished: true };
    }
    const key = ['asleep', 'power', 'power', 'bothin', 'awake', 'earth', 'loaded', 'sent'][step] ?? 'asleep';
    return { place, keys: [key], ctx, finished: false };
  }
  if (place === 'reef') {
    const r = s.reef ?? {};
    const step = stepOf(r, 'shells');
    const ctx = { n: pop(int(r.shells, 0, 7)) };
    if (step >= 7) {
      const keys = ['done'];
      keys.push((int(r.lab, 0, 15) & 7) !== 7 ? 'lab' : 'seals');
      if (int(r.wreck, 0, 31) < 31) keys.push('wreck');
      return { place, keys, ctx, finished: true };
    }
    return { place, keys: [['unmet', 'shells', 'shells', 'shells', 'tryon', 'lanterns', 'party'][step], 'seals'], ctx, finished: false };
  }
  if (place === 'crystal') {
    const c = s.crystal ?? {};
    const step = stepOf(c, 'sparks');
    const ctx = { n: pop(int(c.sparks, 0, 7)), songs: pop(int(c.songs, 0, 7)), rub: Math.min(2, pop(int(c.album, 0, 4095))) };
    if (step >= 7) {
      const bits = deepBits(c.deep);
      if (deepOn) {
        if (bits === 0 && !deepOpen(c)) return { place, keys: ['done', 'deeplocked'], ctx, finished: true };
        return { place, keys: [DEEP_KEY[bits]], ctx, finished: true };
      }
      const keys = ['done'];
      if (int(c.forge, 0, 15) < 8) keys.push('forge');
      if (int(c.songs, 0, 7) < 7) keys.push('songs');
      return { place, keys, ctx, finished: true };
    }
    return { place, keys: [['unmet', 'stones', 'stones', 'stones', 'stones', 'heart', 'heart'][step]], ctx, finished: false };
  }
  const ARC = {
    jungle: ['fruit', ['unmet', 'fruit', 'fruit', 'fruit', 'set', 'supper', 'supper']],
    snowville: ['candles', ['unmet', 'candles', 'candles', 'candles', 'warm', 'glow', 'glow']],
    treehouse: ['letters', ['unmet', 'letters', 'letters', 'letters', 'bell', 'supper', 'supper']],
  }[place];
  if (!ARC) return { place, keys: [], ctx: {}, finished: true };
  const rec = s[place] ?? {};
  const bitsKey = place === 'jungle' ? 'fruit' : place === 'snowville' ? 'candles' : 'letters';
  const step = stepOf(rec, bitsKey);
  return { place, keys: [step >= 7 ? 'done' : ARC[1][step]], ctx: { n: pop(int(rec[bitsKey], 0, 7)) }, finished: step >= 7 };
}

const fill = (t, ctx) => t.replace(/\{(\w+)\}/g, (_, k) => (ctx && Object.hasOwn(ctx, k) ? String(ctx[k]) : ''));

// The words of a card: { title, lines } in the set in use. Four lines at most.
export function cardText(place, state, opts) {
  const c = chapterFor(place, state, opts);
  const T = STORY_TEXT[place];
  if (!T) return { title: '', lines: [], finished: true };
  if (c.jobs) {
    const lines = [];
    if (c.finished) lines.push(...T.all);
    else {
      lines.push(...T.intro, fill(T.count, { n: c.done.length, total: c.total }), fill(T.next, { job: T.jobs[c.next] }));
    }
    return { title: T.title, lines: lines.slice(0, 4), finished: c.finished };
  }
  const lines = c.keys.flatMap((k) => chapterLines(place, k)).map((l) => fill(l, c.ctx));
  return { title: T.title, lines: lines.slice(0, 4), finished: c.finished };
}

// Does the card come by itself on this walk? Every arrival in a place with a card, unless a lesson is open.
export function wantsAuto({ place, lesson = null }) {
  if (lesson && !lesson.finished && !lesson.skipped) return false;
  return STORY_TEXT[place] !== undefined;
}

const PAD_CLOSE = [0, 1, 2]; // A, B, X (standard layout); a press closes the card
export const PHONE_W = 600; // narrower than this (or, on touch, shorter than PHONE_H) is a phone
export const PHONE_H = 500;
const PAD_TOGGLE = 8; // Select / Back

// The card on a walk. `session` gives the lesson and the pause card's presence; nothing here is sent anywhere.
export function createStoryCard({ doc = globalThis.document, win = globalThis.window, nav = globalThis.navigator, place, progression, lesson = null, deepOn = false, touch = false }) {
  const live = { open: false, text: null };
  const els = { card: null };
  const noop = { state: live, els, update() {}, open() {}, close() {}, toggle() {}, isOpen: () => false, dispose() {} };
  if (!doc?.body || typeof doc.createElement !== 'function' || !STORY_TEXT[place]) return noop;
  const host = doc.getElementById?.('hud') ?? doc.body;
  doc.querySelector?.('[data-story-card]')?.remove?.();
  const ACCENT = '#ffd98a';
  const card = doc.createElement('div');
  Object.assign(card.style, { position: 'absolute', left: '50%', top: '22%', transform: 'translateX(-50%)', width: 'min(90vw, 26em)', boxSizing: 'border-box', textAlign: 'center', color: '#fff', background: 'rgba(30,24,40,.9)', border: `2px solid ${ACCENT}`, fontWeight: '700', pointerEvents: 'none', zIndex: '2', padding: '0.6em 0.9em', borderRadius: '1em', lineHeight: '1.3', display: 'none' });
  card.setAttribute?.('role', 'status');
  card.setAttribute?.('data-story-card', place);
  const title = doc.createElement('div');
  Object.assign(title.style, { fontSize: '0.85em', letterSpacing: '0.04em', textTransform: 'uppercase', color: ACCENT, marginBottom: '0.3em' });
  const body = doc.createElement('div');
  const hint = doc.createElement('div');
  Object.assign(hint.style, { fontSize: '0.75em', opacity: '0.75', marginTop: '0.4em' });
  const ok = doc.createElement('button');
  Object.assign(ok.style, { pointerEvents: 'auto', marginTop: '0.5em', font: 'inherit', padding: '0.2em 1.2em', borderRadius: '1em', border: 'none', background: ACCENT, color: '#1e1828', fontWeight: '800', cursor: 'pointer' });
  ok.textContent = BUTTONS.ok;
  for (const e of [title, body, hint, ok]) card.appendChild(e);
  host.appendChild(card);
  els.card = card;

  const size = () => {
    const el = doc.documentElement;
    const phone = win?.innerWidth < PHONE_W || (touch && win?.innerHeight < PHONE_H); // upright or on its side: messages must not take a quarter of the screen
    let f = phone ? 10 : 16;
    Object.assign(card.style, phone ? { top: win.innerHeight < PHONE_H ? '10%' : '14%', maxHeight: '60vh', overflowY: 'auto', padding: '0.4em 0.7em', lineHeight: '1.2', borderRadius: '0.8em' } : { top: '22%', maxHeight: '', overflowY: '', padding: '0.6em 0.9em', lineHeight: '1.3', borderRadius: '1em' });
    if (el?.classList?.contains?.('tv')) { let px = NaN; try { px = parseFloat(win?.getComputedStyle?.(el)?.fontSize); } catch { /* none */ } f = 28 * (Number.isFinite(px) && px > 0 ? Math.min(3, Math.max(1, px / 24)) : 1); }
    card.style.fontSize = `${f + 2}px`;
  };
  size();
  const offTv = onTv?.(size);

  const padOf = () => { try { return [...(nav?.getGamepads?.() ?? [])].find((p) => p?.connected) ?? null; } catch { return null; } };
  let t = 0;
  let gone = false;
  let prev = [];

  function paint() {
    const text = cardText(place, progression?.state, { deepOn });
    live.text = text;
    title.textContent = text.title;
    body.textContent = '';
    text.lines.forEach((l, i) => { const p = doc.createElement('div'); p.textContent = l; if (i === 0) p.style.fontSize = '1.1em'; p.style.marginTop = i ? '0.25em' : '0'; body.appendChild(p); });
    hint.textContent = touch ? '' : padOf() ? BUTTONS.footerPad : BUTTONS.footerKeys;
  }
  function hideOthers() { for (const e of [...(doc.querySelectorAll?.('[data-arrival-card]') ?? [])]) e.style.display = 'none'; }
  // A pause card or the page's overlay (the Ready? card, a join) is up: the card waits for it, so it never sits over one. It still never takes a tap but its own button.
  const blocked = () => !!doc.querySelector?.('#btn-resume') || !!doc.querySelector?.('#overlay:not(.hidden)');
  let waiting = false;
  function open() {
    if (gone) return;
    waiting = false;
    crumb('card:story');
    paint();
    t = 0;
    live.open = true;
    card.style.display = 'block';
    hideOthers();
  }
  function close() {
    if (!live.open) return;
    live.open = false;
    card.style.display = 'none';
  }
  const toggle = () => (live.open ? close() : open());
  ok.addEventListener?.('click', close);

  // E, Enter or Escape closes it (a mouse-locked player cannot click); B opens it again during a walk (not while the pause card is up, not while typing)
  const onKey = (e) => {
    if (gone || e.repeat) return;
    const typing = /^(INPUT|TEXTAREA)$/.test(doc.activeElement?.tagName || '');
    if (typing) return;
    if (live.open && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Escape')) close();
    else if (e.code === 'KeyB' && !doc.querySelector?.('#btn-resume')) toggle();
  };
  doc.addEventListener?.('keydown', onKey);

  if (wantsAuto({ place, lesson })) { if (blocked()) waiting = true; else open(); } // once per arrival: this runs once per walk

  return {
    state: live,
    els,
    open,
    close,
    toggle,
    isOpen: () => live.open,
    update(dt) {
      if (gone) return;
      const pad = padOf();
      if (pad) {
        const down = (i) => !!pad.buttons?.[i]?.pressed;
        const edge = (i) => down(i) && !prev[i];
        if (live.open && PAD_CLOSE.some(edge)) close();
        else if (edge(PAD_TOGGLE) && !doc.querySelector?.('#btn-resume')) toggle();
        prev = [0, 1, 2, PAD_TOGGLE].reduce((a, i) => { a[i] = down(i); return a; }, []);
      }
      if (waiting && !blocked()) open();
      if (!live.open) return;
      t += dt > 0 ? dt : 0;
      if (t > SHOW_SECS) close();
    },
    dispose() {
      if (gone) return;
      gone = true;
      waiting = false;
      try { offTv?.(); } catch { /* none */ }
      doc.removeEventListener?.('keydown', onKey);
      card.remove?.();
      live.open = false;
    },
  };
}
