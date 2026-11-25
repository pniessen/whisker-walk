// "Start a fresh cat" (Settings): a lazy chunk. The home screen carries only the two buttons (Start a
// fresh cat, and Bring back my old cat once there is one) and the dynamic import of this file; the
// question card, the hold-to-confirm button, the rollback copy and the words all live here.
//
// What a fresh cat is: the saved game of THIS device, the same state a first-ever launch has (a new cat
// key, an empty save, the guided first walk). Settings that belong to the device (sound, TV mode, the
// word edition, graphics, accessibility, the couch) and diagnostics are kept. The table of keys is
// below and test/freshcat.keys.test.js fails if a new key is written to storage and not put in it.
//
// The cloud is never touched except through the sync the home screen hands in: a final Sync now before
// the reset, or Save this cat first (the same two calls the My cat sheet makes). Nothing in this file
// deletes anything in the cloud, and the new cat gets a NEW cat key and no cloud link, so the next
// auto-save can never write the fresh cat over the old cat's cloud copy (test/freshcat.flow.test.js).
//
// The old cat is also kept on the device, in one rollback slot (FRESH_BACKUP_KEY), until the next fresh
// cat. Bring back my old cat swaps the two: the cat on the device goes into the slot, so nothing is lost
// by changing your mind either way.
import { LINES } from './freshcatwords.js';

// ── which storage keys are the cat's, and which are the device's ────────────────────────────

export const FRESH_BACKUP_KEY = 'whisker-walk-fresh-backup';
export const HOLD_MS = 2000;
export const PUSH_MS = 6000;

// The save (and the copies progression.js keeps beside it) under both build's names.
const SAVE_KEYS = ['whisker-walk-save', 'whisker-walk-family-save'];
const SAVE_SUFFIXES = ['', '.bak', '.before-cloud', '.before-reset', '.before-restore', '.before-merge'];

/** Reset: the cat's own things, cleared by a fresh cat and brought back by Bring back my old cat. */
export const RESET_KEYS = Object.freeze([
  ...SAVE_KEYS.flatMap((k) => SAVE_SUFFIXES.map((s) => k + s)),
  // the cat key and the cloud link (src/catkey.js): the four values and the kept copy of them
  'whisker-walk-player', 'whisker-walk-secret', 'whisker-walk-cloudcode', 'whisker-walk-cloudsecret', 'whisker-walk-key.before-cloud',
  'whisker-walk-syncbase', // the catch-up's base: it belongs to the link
  'whisker-walk-album', // photos
  'whisker-walk-met', 'whisker-walk-blocked', // the players she met and hid
  'whisker-walk-resume', // a walk left half way
  'whisker-walk-bday-candles', 'whisker-walk-bday-song', 'whisker-walk-den-day', // once-a-day things
  'whisker-walk-roofs-guide', 'whisker-walk-buttons', // first-time guides, and which button words she has learned
]);
/** Reset too, named from the word set the page was built with (src/ui/clanpicker.js): the first-time clan card. */
export const RESET_PATTERNS = Object.freeze([/^whisker-walk-[a-z]+-moment-seen$/]);

/** Kept: the device's own settings and diagnostics, and the rollback slot itself. */
export const KEPT_KEYS = Object.freeze([
  'whisker-walk-settings', // sound, TV mode, edition and series switch, graphics, accessibility, couch: all per device
  'whisker-walk-adapt', // what this device's graphics learned about itself
  'whisker-walk-gl-reload', // the graphics-recovery reload guard (diagnostics)
  'whisker-walk-nearby-opted', // this device's choice about looking for rooms on the local network
  'whisker-walk-redeem-rest', // the guessing rest of the code box: a fresh cat must not skip it
  'whisker-walk-den-tab', 'whisker-walk-builder-pose', // how this screen was last left (a tab, a pose)
  FRESH_BACKUP_KEY, // the rollback slot
]);
/** Strings in src/ that look like keys but are not storage keys (a hashing salt). */
export const NOT_KEYS = Object.freeze(['whisker-walk-redeem-v1']);

/** 'reset' | 'kept' | null (null: not classified, which test/freshcat.keys.test.js refuses). */
export function classify(key) {
  if (typeof key !== 'string') return null;
  if (KEPT_KEYS.includes(key)) return 'kept';
  if (RESET_KEYS.includes(key) || RESET_PATTERNS.some((re) => re.test(key))) return 'reset';
  return null;
}

/** Every reset key this storage holds (the known names, and any other that matches a pattern). */
export function resetKeysIn(storage) {
  const out = new Set();
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const k = storage.key(i);
      if (typeof k === 'string' && classify(k) === 'reset') out.add(k);
    }
  } catch { /* a storage that cannot be listed: the known names still go */ }
  for (const k of RESET_KEYS) {
    try { if (storage.getItem(k) !== null) out.add(k); } catch { /* skip */ }
  }
  return [...out];
}

// ── the rollback slot ───────────────────────────────────────────────────────────────────────

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const saveKeyIn = (items) => SAVE_KEYS.find((k) => typeof items?.[k] === 'string') ?? null;
const ALBUM = 'whisker-walk-album';

/** The cat on this device as { key: raw string } for every reset key it holds. */
export function snapshot(storage) {
  const items = {};
  for (const k of resetKeysIn(storage)) {
    let v = null;
    try { v = storage.getItem(k); } catch { /* skip */ }
    if (typeof v === 'string') items[k] = v;
  }
  return items;
}

/** Put the slot in place: { role, v, at, code, items }. Photos go with it if they fit. -> true when kept. */
export function writeSlot(storage, { role, code = null, items, now = Date.now() }) {
  const put = (its, noAlbum) => storage.setItem(FRESH_BACKUP_KEY, JSON.stringify({ role, v: 1, at: now, code, noAlbum, items: its }));
  try {
    put(items, false);
    return true;
  } catch { /* a full device: try again without the photos */ }
  try {
    const { [ALBUM]: _photos, ...rest } = items;
    put(rest, true);
    return true;
  } catch {
    return false;
  }
}

/** The slot, if it holds a cat this build can read: { role, at, code, items } or null. */
export function readSlot(storage) {
  try {
    const w = JSON.parse(storage.getItem(FRESH_BACKUP_KEY));
    if (!isObj(w) || w.v !== 1 || !isObj(w.items)) return null;
    const items = {};
    for (const [k, v] of Object.entries(w.items)) if (typeof v === 'string' && classify(k) === 'reset') items[k] = v;
    const sk = saveKeyIn(items);
    if (!sk) return null;
    try { if (!isObj(JSON.parse(items[sk]))) return null; } catch { return null; }
    return { role: w.role === 'swap' ? 'swap' : 'old', at: Number.isFinite(w.at) ? w.at : null, code: typeof w.code === 'string' && w.code ? w.code : null, items };
  } catch {
    return null;
  }
}

/**
 * Is there a cat in these items worth keeping? A device with no save yet, or one whose cat has earned nothing and walked
 * nowhere, has nothing to roll back to, and must never push a real old cat out of the one slot (as Start over's own copy
 * is not replaced by a save with no lifetime points).
 */
export function worthKeeping(items) {
  const sk = saveKeyIn(items);
  if (!sk) return false;
  try {
    const v = JSON.parse(items[sk]);
    if (!isObj(v)) return false;
    return Number(v.lifetimePoints) > 0 || Number(v.points) > 0 || (isObj(v.walks) && Object.values(v.walks).some((n) => Number(n) > 0));
  } catch {
    return false;
  }
}

/** True when a slot exists (cheap: the home screen asks the same with one getItem). */
export const hasSlot = (storage) => readSlot(storage) !== null;

const removeAll = (storage) => { for (const k of resetKeysIn(storage)) { try { storage.removeItem?.(k); } catch { /* skip */ } } };
const putAll = (storage, items) => { for (const [k, v] of Object.entries(items)) storage.setItem(k, v); };

// ── doing it ────────────────────────────────────────────────────────────────────────────────

/**
 * Start a fresh cat on this device. `saved`: the old cat's cloud copy is up to date (so a slot that cannot be written
 * does not stop the reset). Order matters: the slot first; the cloud link and cat key off the device BEFORE the in-memory
 * save is replaced, so nothing that runs from here on (an auto-save) can send the fresh cat to the old cat's code.
 * -> { ok: true } | { ok: false, error: 'nocopy' (nothing changed) | 'failed' (put back; reload) }
 */
export function freshReset({ storage, progression, album = null, saved = false, code = null, now = Date.now() }) {
  const items = snapshot(storage);
  // an empty cat leaves the slot as it is (it may hold a real old cat)
  const kept = worthKeeping(items) ? writeSlot(storage, { role: 'old', code, items, now }) : true;
  if (!kept && !saved) return { ok: false, error: 'nocopy' };
  try {
    for (const k of ['whisker-walk-cloudcode', 'whisker-walk-cloudsecret', 'whisker-walk-player', 'whisker-walk-secret']) storage.removeItem(k);
    progression.reset();
    album?.clear?.();
    removeAll(storage);
    return { ok: true };
  } catch {
    try { removeAll(storage); putAll(storage, items); } catch { /* storage is gone; the reload shows what is left */ }
    return { ok: false, error: 'failed' };
  }
}

/**
 * Bring back the cat in the slot. The cat on the device goes into the slot first (role 'swap'), then the old cat's whole
 * set (save, cat key and link, photos, friends) is put back together. The save goes through progression.replaceFromPayload,
 * the cloud load's own path (sanitised like a boot) on top of an empty save, so nothing of the cat that was here is merged in.
 * -> { ok: true } | { ok: false, error: 'none' | 'nocopy' | 'failed' }
 */
export function freshRestore({ storage, progression, album = null, code = null, now = Date.now() }) {
  const slot = readSlot(storage);
  if (!slot) return { ok: false, error: 'none' };
  const before = snapshot(storage);
  const sk = saveKeyIn(slot.items);
  let payload;
  try { payload = JSON.parse(slot.items[sk]); } catch { return { ok: false, error: 'none' }; }
  // the cat that is here goes into the slot; an empty one is nothing to keep, and the slot is simply used up
  if (worthKeeping(before)) { if (!writeSlot(storage, { role: 'swap', code, items: before, now })) return { ok: false, error: 'nocopy' }; } else { try { storage.removeItem?.(FRESH_BACKUP_KEY); } catch { /* it stays */ } }
  try {
    removeAll(storage);
    progression.reset();
    if (progression.replaceFromPayload(payload) === false) throw new Error('save refused');
    const own = storage.getItem(sk); // the save as the game wrote it
    removeAll(storage);
    putAll(storage, { ...slot.items, [sk]: own ?? slot.items[sk] });
    album?.clear?.();
    return { ok: true };
  } catch {
    try {
      removeAll(storage); putAll(storage, before);
      writeSlot(storage, { role: slot.role, code: slot.code, items: slot.items, now: slot.at ?? now });
    } catch { /* storage is gone; the reload shows what is left */ }
    return { ok: false, error: 'failed' };
  }
}

// ── the hold ────────────────────────────────────────────────────────────────────────────────

/**
 * The hold-to-confirm rule, with no DOM and a clock handed in. Several inputs may hold at once (a finger and a
 * key); the hold runs while any is down and starts over if all let go. start(src) / release(src) / tick().
 */
export function createHold({ ms = HOLD_MS, now = () => Date.now(), onProgress = () => {}, onDone = () => {}, onEarly = () => {} } = {}) {
  const down = [];
  let t0 = null;
  let done = false;
  return {
    start(src) {
      if (done) return;
      if (!down.length) { t0 = now(); onProgress(0); }
      if (!down.includes(src)) down.push(src);
    },
    release(src) {
      const at = down.indexOf(src);
      if (at < 0) return;
      down.splice(at, 1);
      if (down.length || done) return;
      t0 = null;
      onProgress(0);
      onEarly();
    },
    tick() {
      if (t0 === null || done) return;
      const p = Math.min(1, Math.max(0, (now() - t0) / ms));
      onProgress(p);
      if (p >= 1) { done = true; t0 = null; down.length = 0; onDone(); }
    },
    cancel() { down.length = 0; t0 = null; },
    get holding() { return t0 !== null && !done; },
    get done() { return done; },
  };
}

/** The ring's fill: smooth, or in quarters for reduced motion (no sweeping movement). */
export const ringFill = (p, reduced) => (reduced ? Math.floor(Math.min(1, Math.max(0, p)) * 4) / 4 : Math.min(1, Math.max(0, p)));

// ── the card ────────────────────────────────────────────────────────────────────────────────

const CIRC = 100.53; // 2 * pi * 16, the ring's radius in its 40-unit box
const CSS = `
.fresh .nearby-card-btns{flex-wrap:wrap}
.fresh .confirm-card{max-width:460px}
.fresh .nearby-card-btns:has(#fresh-save) #confirm-card-yes{flex-basis:100%}
@media (max-height:620px){html:not(.tv) .fresh .colony-news-card{padding:12px 16px 12px;gap:6px}html:not(.tv) .fresh-line{font-size:.95rem;line-height:1.3}html:not(.tv) .fresh-extra{gap:3px}html:not(.tv) .fresh .sync-code-value{font-size:1.25rem}}
html.tv .fresh .nearby-card-btns{flex-wrap:wrap!important}
html.tv .fresh .nearby-card-btns>button{flex:1 1 calc(300px * var(--tv-s,1))!important;white-space:normal!important}
html.tv .fresh .nearby-card-btns:has(#fresh-save) #confirm-card-yes{flex-basis:100%!important}
.fresh-extra{display:flex;flex-direction:column;gap:6px}
.fresh-line{margin:0;font-size:1.05rem;line-height:1.4;color:#fff;overflow-wrap:anywhere}
.fresh-extra .sync-code-value{margin:4px 0}
html.tv .fresh-extra{gap:calc(8px * var(--tv-s,1))}
html.tv .fresh-line{font-size:var(--tv-body);font-weight:500;line-height:1.3;text-wrap:pretty}
html.tv .fresh-extra .sync-code-value{font-size:var(--tv-title)}
.fresh-hold{display:inline-flex;align-items:center;justify-content:center;gap:.5em;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.fresh-hold[aria-disabled=true]{opacity:.55}
.fresh-ring{width:1.7em;height:1.7em;flex:none}
.fresh-ring circle{fill:none;stroke-width:5}
.fresh-ring .track{stroke:rgba(42,20,20,.28)}
.fresh-ring .fill{stroke:#2a1414;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%;stroke-dasharray:${CIRC};stroke-dashoffset:${CIRC};transition:stroke-dashoffset .05s linear}
.fresh-hold.reduced .fill{transition:none}
.fresh-hold.holding{filter:brightness(1.1)}
`;

// A phrase by an id held in a variable (the ids are checked by test/freshcat.words.test.js, which reads every one in this file).
const tell = (a, id, ...args) => a['phrase'](id, ...args);
const alive = (el) => !!el && el.isConnected !== false && !el.removed;

/** The line under the card's question, by state. Each is the id of a phrase; the code goes between 'code' markers. */
export function cardLines(state, { hasCode, canSave }) {
  const top = ['fresh.what', 'fresh.settings'];
  if (state === 'checking') return [...top, 'fresh.checking'];
  if (state === 'saved') return [...top, 'fresh.cloud.safe', 'code', 'fresh.cloud.back', 'fresh.cloud.kept'];
  if (hasCode) return [...top, 'fresh.cloud.failed', 'fresh.cloud.last', 'code', 'fresh.local.gone'];
  return [...top, 'fresh.local.only', 'fresh.local.gone', ...(canSave ? ['fresh.local.save'] : [])];
}

const codeWords = (code) => String(code ?? '').split('-').join(' · ');
const timed = (p, ms) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(null), ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
});

let wired = false;
function ensureWords(a) {
  if (!wired) { a.addPhrases(LINES); wired = true; }
}
function ensureCss(doc) {
  try {
    if (doc.getElementById('fresh-cat-css')) return;
    const s = doc.createElement('style');
    s.id = 'fresh-cat-css';
    s.textContent = CSS;
    (doc.head ?? doc.body).appendChild(s);
  } catch { /* the card still works, plainer */ }
}
const reducedNow = (a) => {
  try { if (a.reduced?.()) return true; } catch { /* ignore */ }
  try { return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
};
const padTag = (a) => (a.tvState?.input === 'pad' && a.tvState.html ? ` ${a.tvState.html('⟦interact⟧')}` : '');

function ringHtml() {
  return '<svg class="fresh-ring" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle class="track" cx="20" cy="20" r="16"/><circle class="fill" cx="20" cy="20" r="16"/></svg>';
}

/**
 * Turn the confirm card's Yes button into the hold button. Its data-confirm is taken off, so a tap, a pad's A or a screen
 * reader's activation answers nothing; the attribute goes back on only when the hold is complete, and the button is clicked
 * for the card to take as Yes. Touch and mouse (pointer), keyboard (hold Enter or Space) and the pad (hold X) all work.
 * `ctx.enabled()` says whether holding counts (not while the cloud is being asked).
 */
export function makeHoldButton(yes, ctx, { a, nav, setI = setInterval, clearI = clearInterval, now }) {
  const reduced = reducedNow(a);
  let label = '';
  let timer = null;
  let padTimer = null;
  const say = (id) => { const s = ctx.status?.(); if (s) s.textContent = id ? tell(a, id) : ''; };
  const hold = createHold({
    now,
    onProgress: (p) => {
      const f = ctx.ring?.();
      if (f) f.style.strokeDashoffset = String(CIRC * (1 - ringFill(p, reduced)));
      yes.classList?.[hold.holding || p > 0 ? 'add' : 'remove']('holding');
    },
    onEarly: () => say('fresh.hold.early'),
    onDone: () => {
      stopTimers();
      yes.classList?.remove('holding');
      say('');
      yes.setAttribute('data-confirm', 'yes');
      yes.click();
    },
  });
  function stopTimers() { if (timer !== null) clearI(timer); if (padTimer !== null) clearI(padTimer); timer = null; padTimer = null; }
  function begin(src) {
    if (!ctx.enabled() || hold.done) return;
    say('fresh.hold.on');
    hold.start(src);
    if (timer === null) {
      timer = setI(() => { if (!alive(yes)) { stopTimers(); hold.cancel(); return; } hold.tick(); }, 40);
    }
  }
  const end = (src) => hold.release(src);

  yes.removeAttribute('data-confirm');
  yes.classList?.add('fresh-hold');
  if (reduced) yes.classList?.add('reduced');
  yes.setAttribute('aria-describedby', 'fresh-hold-status');
  const set = (text) => {
    label = text;
    yes.setAttribute('aria-label', a.phrase('fresh.hold.label'));
    yes.innerHTML = `${ringHtml()}<span class="fresh-hold-text">${a.escapeHtml(label)}${padTag(a)}</span>`;
  };

  yes.addEventListener('pointerdown', (e) => { if (e.button > 0) return; e.preventDefault?.(); begin('pointer'); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) yes.addEventListener(t, () => end('pointer'));
  yes.addEventListener('contextmenu', (e) => e.preventDefault?.());
  yes.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault?.();
    if (!e.repeat) begin('key');
  });
  yes.addEventListener('keyup', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault?.();
    end('key');
  });
  yes.addEventListener('blur', () => { end('key'); });
  // a click that is not the end of our own hold (a pad's A, a screen reader, a quick tap): say how, change nothing
  yes.addEventListener('click', (e) => { if (!hold.done) { e.preventDefault?.(); say('fresh.hold.tap'); } });

  // the pad: hold X (the pad's own X press is not a "click", so it is read here, only while the card is up)
  const pads = () => { try { return nav?.getGamepads?.() ?? []; } catch { return []; } };
  if (nav?.getGamepads) {
    padTimer = setI(() => {
      if (!alive(yes)) { stopTimers(); hold.cancel(); return; }
      const p = pads().find((x) => x && x.connected && x.mapping === 'standard');
      const x = !!p && (p.buttons?.[2]?.pressed || (p.buttons?.[2]?.value ?? 0) > 0.5);
      if (x) begin('pad'); else end('pad');
    }, 50);
  }
  return { set, hold, stop: () => { stopTimers(); hold.cancel(); } };
}

function enhance(el, ctx) {
  const { a } = ctx;
  const e = a.escapeHtml;
  el.classList?.add('fresh');
  const btns = el.querySelector('.nearby-card-btns');
  btns.insertAdjacentHTML('beforebegin', '<div class="fresh-extra"></div><p class="colony-news-sub" id="fresh-hold-status" role="status" aria-live="polite"></p>');
  const extra = el.querySelector('.fresh-extra');
  const yes = el.querySelector('#confirm-card-yes');
  const refs = { status: () => el.querySelector('#fresh-hold-status'), ring: () => yes.querySelector?.('.fill') };
  const button = makeHoldButton(yes, { ...refs, enabled: () => ctx.state !== 'checking' && !ctx.busy }, { a, nav: a.nav ?? globalThis.navigator, now: a.now });
  ctx.stop = button.stop;

  function paint() {
    const canSave = !!a.sync?.available;
    const lines = cardLines(ctx.state, { hasCode: !!ctx.code, canSave });
    extra.innerHTML = lines.map((id) => (id === 'code'
      ? `<div class="sync-code-value" data-cat-code>${e(codeWords(ctx.code))}</div>`
      : `<p class="fresh-line">${e(tell(a, id))}</p>`)).join('');
    const had = el.querySelector('#fresh-save');
    const wantSave = ctx.state !== 'checking' && ctx.state !== 'saved' && canSave;
    if (had && !wantSave) had.remove();
    if (!had && wantSave) {
      yes.insertAdjacentHTML('beforebegin', `<button type="button" class="nearby-card-later" id="fresh-save">${e(a.phrase('fresh.save'))}</button>`);
      el.querySelector('#fresh-save').addEventListener('click', () => save());
    }
    const sv = el.querySelector('#fresh-save');
    if (sv) { sv.textContent = ctx.busy ? a.phrase('fresh.saving') : a.phrase('fresh.save'); sv.disabled = !!ctx.busy; }
    button.set(a.phrase(ctx.state === 'saved' ? 'fresh.hold' : 'fresh.hold.anyway'));
    yes.setAttribute('aria-disabled', ctx.state === 'checking' || ctx.busy ? 'true' : 'false');
  }
  ctx.paint = paint;

  // Save this cat first: Sync now for a linked cat, Save cat for one that is only here. Both are the My cat sheet's own calls.
  async function save() {
    if (ctx.busy || !alive(el)) return;
    ctx.busy = true; paint();
    let ok = false;
    let code = ctx.code;
    if (ctx.code) {
      const r = await timed(a.sync.syncNow(), PUSH_MS);
      ok = !!r && r.ok === true;
    } else {
      const r = await timed(a.sync.saveToCloud(), PUSH_MS * 2);
      ok = !!r && r.ok === true;
      if (ok) code = r.code ?? a.sync.getCode?.() ?? null;
    }
    if (!alive(el)) return;
    ctx.busy = false;
    if (ok && code) { ctx.code = code; ctx.state = 'saved'; paint(); }
    else {
      paint();
      const s = el.querySelector('#fresh-hold-status');
      if (s) s.textContent = a.phrase('fresh.err.save');
    }
  }
  paint();
  return { paint, save };
}

/** The Start a fresh cat button. `a`: see homebase.js (freshApi). -> true when the card went up. */
export async function open(a) {
  ensureWords(a);
  let room = null;
  try { room = a.rooms?.(); } catch { room = null; }
  if (room) { a.notice(a.phrase('fresh.room')); return false; }
  const storage = a.storage();
  if (!storage) return false;
  const doc = a.doc ?? globalThis.document;
  ensureCss(doc);
  const code = a.sync?.getCode?.() ?? null;
  const ctx = { a, code, state: code ? 'checking' : 'local', busy: false };
  const went = a.confirmCard.ask({
    text: a.phrase('fresh.title'),
    yes: a.phrase('fresh.hold'),
    no: a.phrase('fresh.no'),
    danger: true,
    returnFocus: () => a.root.querySelector?.('#btn-fresh')?.focus?.({ preventScroll: true }),
    onYes: () => go(ctx),
  });
  if (!went) return false;
  const el = doc.getElementById('confirm-card');
  if (!el) return false;
  enhance(el, ctx);
  if (code) {
    // the final push: Sync now, waited for a short while, never forever (offline-first: the card works without it)
    const r = await timed(a.sync.syncNow(), PUSH_MS);
    if (!alive(el)) return true;
    ctx.state = r && r.ok === true ? 'saved' : 'unsaved';
    ctx.paint();
  }
  return true;
}

// The page reads the cat key once, at boot: a changed cat needs a reload. The home screen's own reload first; if the page is
// still here shortly after (some web views ignore it), the plain call once more.
function reloadPage(a) {
  try { a.reload(); } catch { /* the plain call below */ }
  setTimeout(() => { try { globalThis.location.reload(); } catch { /* no page to reload */ } }, 700);
}

function go(ctx) {
  const { a } = ctx;
  const storage = a.storage();
  const res = freshReset({ storage, progression: a.progression, album: a.album, saved: ctx.state === 'saved', code: ctx.code });
  if (res.ok) { reloadPage(a); return; }
  a.notice(a.phrase(res.error === 'nocopy' ? 'fresh.err.nocopy' : 'fresh.err.failed'));
  if (res.error === 'failed') reloadPage(a);
}

/** The Bring back my old cat button. -> true when the card went up. */
export async function openBack(a) {
  ensureWords(a);
  const storage = a.storage();
  const slot = storage ? readSlot(storage) : null;
  if (!slot) { a.notice(a.phrase('fresh.back.none')); return false; }
  const doc = a.doc ?? globalThis.document;
  ensureCss(doc);
  const here = a.sync?.getCode?.() ?? null;
  const went = a.confirmCard.ask({
    text: a.phrase('fresh.back.title'),
    note: a.phrase('fresh.back.what'),
    yes: a.phrase('fresh.back.yes'),
    no: a.phrase('fresh.back.no'),
    returnFocus: () => a.root.querySelector?.('#btn-fresh-back')?.focus?.({ preventScroll: true }),
    onYes: () => {
      const res = freshRestore({ storage, progression: a.progression, album: a.album, code: here });
      if (res.ok) { reloadPage(a); return; }
      a.notice(a.phrase('fresh.back.err'));
      if (res.error === 'failed') reloadPage(a);
    },
  });
  if (!went) return false;
  const el = doc.getElementById('confirm-card');
  const btns = el?.querySelector?.('.nearby-card-btns');
  if (btns) {
    const e = a.escapeHtml;
    // the cat here is kept (and can be switched back to) only if it is worth keeping
    const keepsHere = worthKeeping(snapshot(storage));
    btns.insertAdjacentHTML('beforebegin', `<div class="fresh-extra">${keepsHere ? `<p class="fresh-line">${e(a.phrase('fresh.back.swap'))}</p>` : ''}`
      + (slot.code ? `<p class="fresh-line">${e(a.phrase('fresh.back.code'))}</p><div class="sync-code-value" data-cat-code>${e(codeWords(slot.code))}</div>` : '') + '</div>');
  }
  return true;
}
