// The "My cat" sheet (cat login, milestone 3): what the Cloud save sheet shows and does.
// A lazy chunk: the home screen draws the sheet through this file only when it is opened, so the
// start-up download carries just the door (homebase.js). Nothing here talks to a network except
// through `a.sync`, and only on a tap.
//
// The start-up helpers (escapeHtml, phrase, the TV flag, the confirm card) are handed in as `a`
// instead of imported: a lazy chunk that imports several start-up modules makes the bundler split
// start-up into more files (see src/game/catsync.js). Only the code words are imported (also lazy).
//
//   cl  the sheet's state, kept by homebase: { busy, error, status, justLinked, preview, bringing,
//       bringOpen, typed, checkText, checked, showUntil, changed }
//   a   { sync, escapeHtml, phrase, addPhrases, tvState, confirmCard, render, afterConfirm, root }
import { checkCatCode } from '../catcodes.js';
import { LINES } from './catloginwords.js';

export const HOLD_MS = 2000; // how long Show my cat code is held
export const SHOW_MS = 30000; // how long the code stays up after that

// "PLUM · OTTER · CROW · MAPLE" (and the old shape, "PLUM · OTTER · CROW · 42"): the code as it is read aloud and copied.
export const codeWords = (code) => String(code ?? '').split('-').join(' · ');
const lastWord = (code) => String(code ?? '').split('-').pop() ?? '';

const padInput = (a) => !!(a.tvState && (a.tvState.on || a.tvState.input === 'pad'));

// ── the pieces of the sheet ────────────────────────────────────────

// How the linked cat's catch-up stands: one quiet line, never a spinner that blocks anything.
export function catStatusLine(a) {
  let st = null;
  try { st = a.sync.catStatus?.() ?? null; } catch { st = null; }
  const say = {
    saved: () => a.phrase('catlogin.saved', st.name),
    offline: () => a.phrase('catlogin.offline', st.name),
    catching: () => a.phrase('catlogin.catching'),
    caught: () => a.phrase('catlogin.caughtup', st.name),
    signedout: () => a.phrase('catlogin.signedout', st.name),
  };
  return st && Object.hasOwn(say, st.state) ? `<div class="tag catlogin-status" data-cat-status="${st.state}" role="status">${a.escapeHtml(say[st.state]())}</div>` : '';
}

// The chips under the code box: each typed word green when it is on the list, a "Did you mean"
// when one list word is one edit away, red when it is not. Reads only; sends nothing.
export function chipsHtml(text, a) {
  const r = checkCatCode(text);
  if (r.old) return `<span class="cat-chip ok">${a.escapeHtml(r.code)}</span>`;
  return r.words.map((w, i) => {
    if (w.state === 'ok') return `<span class="cat-chip ok">${a.escapeHtml(w.word)}</span>`;
    if (w.state === 'snap') {
      return `<button type="button" id="catlogin-fix" class="cat-chip snap" data-cat-word="${i}" data-cat-fix="${a.escapeHtml(w.word)}">${a.escapeHtml(a.phrase('catlogin.chip.snap', w.word))}</button>`;
    }
    return `<span class="cat-chip bad">${a.escapeHtml(w.typed)}</span>`;
  }).join(' ');
}

// How a hop (either side) stands, in kid words. Nothing here is a code or a secret.
const HOP_LINES = { wrong: 'catlogin.hop.wrong', busy: 'catlogin.hop.busy', timeout: 'catlogin.hop.timeout', refused: 'catlogin.hop.refused' };
function hopError(v, a) {
  if (v.phase === 'error') return v.error === 'offline' ? a.phrase('catlogin.err.offline') : a.phrase(`catlogin.hop.err.${v.error}`);
  return Object.hasOwn(HOP_LINES, v.phase) ? a.phrase(HOP_LINES[v.phase]) : '';
}

// Screen 3, the hop code half: six characters from the other device, then the wait for its OK.
function hopEntryHtml(cl, a) {
  const e = a.escapeHtml;
  const v = cl.hop?.kind === 'join' ? cl.hop.view : null;
  const waiting = !!v && (v.phase === 'joining' || v.phase === 'waiting');
  const err = v ? hopError(v, a) : '';
  return `
          <div class="code-field hop-entry">
            <label class="code-label" for="catlogin-hop-code">${e(a.phrase('catlogin.hop.label'))}</label>
            <div class="sync-load-row">
              <input type="text" id="catlogin-hop-code" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${e(a.phrase('catlogin.hop.placeholder'))}" value="${e(cl.hopTyped ?? '')}" class="wt-code-input sync-code-input" />
              <button id="catlogin-hop-go" ${waiting || cl.busy ? 'disabled' : ''}>${e(a.phrase('catlogin.hop.go'))}</button>
            </div>
            ${waiting ? `<div class="tag" role="status" data-hop="waiting">${e(a.phrase('catlogin.hop.waiting'))}</div><button id="catlogin-hop-cancel">${e(a.phrase('catlogin.hop.cancel'))}</button>` : ''}
            ${err ? `<div class="tag error" role="status" data-hop="${e(v.phase)}">${e(err)}</div>` : ''}
            <button id="catlogin-hop-back" class="link">${e(a.phrase('catlogin.hop.back'))}</button>
          </div>`;
}

// Screen 6: the device that has the cat shows the six characters and waits for a device to type them.
function hopHostHtml(cl, a) {
  const e = a.escapeHtml;
  const v = cl.hop.view;
  const name = a.sync.catStatus?.()?.name ?? '';
  const done = (line) => `<div class="tag" role="status" data-hop="${e(v.phase)}">${e(line)}</div><button id="catlogin-hop-done">${e(a.phrase('catlogin.hop.done'))}</button>`;
  let body;
  if (v.phase === 'opening') body = `<div class="tag" role="status">${e(a.phrase('catlogin.hop.opening'))}</div>`;
  else if (v.phase === 'code') {
    body = `<div class="tag">${e(a.phrase('catlogin.hop.steps'))}</div>
            <div class="sync-code-value hop-code" data-hop-code>${e(v.hop)}</div>
            <div class="tag">${e(a.phrase('catlogin.hop.life'))}</div>
            <button id="catlogin-hop-cancel">${e(a.phrase('catlogin.hop.cancel'))}</button>`;
  } else if (v.phase === 'asked') {
    body = `<div class="tag" role="status" data-hop="asked">${e(a.phrase('catlogin.hop.asked', name))}</div>
            <div class="sync-actions"><button id="catlogin-hop-no">${e(a.phrase('catlogin.hop.no'))}</button><button id="catlogin-hop-yes" class="primary">${e(a.phrase('catlogin.hop.yes'))}</button></div>`;
  } else if (v.phase === 'allowed') body = done(a.phrase('catlogin.hop.allowed'));
  else if (v.phase === 'closed') body = done(a.phrase('catlogin.hop.closed'));
  else if (v.phase === 'error') body = done(hopError(v, a));
  else body = done(a.phrase('catlogin.hop.over'));
  return `
          <div class="sync-hop hop-host">
            <h3>${e(a.phrase('catlogin.hop.add'))}</h3>
            ${body}
          </div>`;
}

function bringHtml(cl, a) {
  const e = a.escapeHtml;
  const busy = cl.busy ? 'disabled' : '';
  if (cl.hopEntry) return hopEntryHtml(cl, a);
  return `
          <button id="catlogin-hop-have" ${busy}>${e(a.phrase('catlogin.hop.have'))}</button>
          <div class="tag">${e(a.phrase('catlogin.hop.havehint'))}</div>
          <div class="code-field">
            <label class="code-label" for="sync-load-code">${e(a.phrase('catlogin.bring.label'))}</label>
            <div class="sync-load-row">
              <input type="text" id="sync-load-code" maxlength="60" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${e(a.phrase('catlogin.bring.placeholder'))}" value="${e(cl.typed ?? '')}" class="wt-code-input sync-code-input" />
              <button id="sync-load" ${busy}>${e(a.phrase('catlogin.bring'))}</button>
            </div>
            <div class="cat-chips" id="catlogin-chips" aria-live="polite">${chipsHtml(cl.typed ?? '', a)}</div>
            <div class="tag">${e(a.phrase('catlogin.bring.hint'))}</div>
          </div>`;
}

// Screen 2: the new code, shown once, with the check that it was written down.
function justLinkedHtml(cl, a, code) {
  const e = a.escapeHtml;
  return `
          <div class="sync-code-big">
            <h3>${e(cl.changed ? a.phrase('catlogin.new.titlenew') : a.phrase('catlogin.new.title'))}</h3>
            <div class="sync-code-value">${e(codeWords(code))}</div>
            <div class="tag error">${e(a.phrase('catlogin.new.note'))}</div>
            <div class="tag">${e(a.phrase('catlogin.new.warn'))}</div>
            ${cl.notKept ? `<div class="tag error">${e(a.phrase('catlogin.new.notkept'))}</div>` : ''}
            <label class="code-label" for="catlogin-check">${e(a.phrase('catlogin.new.check'))}</label>
            <input type="text" id="catlogin-check" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${e(cl.checkText ?? '')}" class="wt-code-input sync-code-input" />
            <button id="sync-got-it" class="primary" ${cl.checked ? '' : 'disabled'}>${e(a.phrase('catlogin.new.ok'))}</button>
            <button id="catlogin-skip" class="link">${e(a.phrase('catlogin.new.skip'))}</button>
          </div>`;
}

// Show my cat code: pressed and held, never up by accident, and not drawn at all on a TV or with a game pad.
function showHtml(cl, a, code) {
  const e = a.escapeHtml;
  if (padInput(a)) return `<div class="tag catlogin-notv">${e(a.phrase('catlogin.show.notv'))}</div>`;
  if (cl.showUntil > Date.now()) {
    return `<div class="catlogin-shown"><div class="sync-code-value" data-cat-code>${e(codeWords(code))}</div><button id="catlogin-hide">${e(a.phrase('catlogin.hide'))}</button></div>`;
  }
  return `<div class="catlogin-show"><button id="catlogin-show" class="hold" ${cl.busy ? 'disabled' : ''}>${e(a.phrase('catlogin.show'))}</button><span class="tag">${e(a.phrase('catlogin.show.hint'))}</span></div>`;
}

function linkedHtml(cl, a, code) {
  const e = a.escapeHtml;
  const busy = cl.busy ? 'disabled' : '';
  return `
          <div class="sync-linked">
            <div class="tag on">☁️ ${e(a.phrase('catlogin.linked.tag'))}</div>
            ${catStatusLine(a)}
            ${cl.status ? `<div class="tag">${e(cl.status)}</div>` : ''}
            <div class="sync-actions">
              <button id="sync-now" ${busy}>${cl.busy ? 'Syncing…' : 'Sync now'}</button>
              <button id="sync-load-linked" ${busy}>Load from cloud</button>
            </div>
            ${cl.hop?.kind === 'host' ? hopHostHtml(cl, a) : `<div class="sync-actions"><button id="catlogin-hop-add" ${busy}>${e(a.phrase('catlogin.hop.add'))}</button></div>`}
            ${showHtml(cl, a, code)}
            <div class="sync-actions">
              <button id="catlogin-change" ${busy}>${e(a.phrase('catlogin.change'))}</button>
            </div>
            ${cl.error ? `<div class="tag error">${e(cl.error)}</div>` : ''}
            <div class="sync-unlink-row">
              <button id="sync-unlink" class="danger" ${busy}>Unlink</button>
            </div>
          </div>`;
}

function unlinkedHtml(cl, a) {
  const e = a.escapeHtml;
  const busy = cl.busy ? 'disabled' : '';
  return `
        <div class="sync-unlinked">
          <h3>${e(a.phrase('catlogin.title'))}</h3>
          <div class="tag">${e(a.phrase('catlogin.intro'))}</div>
          <button id="sync-save" ${busy}>${e(cl.busy ? a.phrase('catlogin.keeping') : a.phrase('catlogin.keep'))}</button>
          ${cl.bringOpen ? bringHtml(cl, a) : `<button id="catlogin-bring" ${busy}>${e(a.phrase('catlogin.bring'))}</button>`}
          ${cl.error ? `<div class="tag error">${e(cl.error)}</div>` : ''}
        </div>`;
}

function previewHtml(cl, a) {
  const e = a.escapeHtml;
  const fmt = (s) => `${s.rank} · ${s.points} 🐾 (lifetime ${s.lifetimePoints}) · best ever ${s.bestWalk}`;
  // Defense in depth: summarizeSaveForPreview already coerces every numeric field of a cloud-loaded
  // (untrusted) save, so `s.rank` is always one of RANKS' own titles and the numbers are plain finite
  // numbers, but this fires BEFORE the user confirms anything, so the rendered text is escaped here too.
  return `
        <div class="sync-preview">
          <div class="sync-compare">
            <div class="sync-col"><h3>This device</h3><div>${e(fmt(cl.preview.local))}</div></div>
            <div class="sync-col"><h3>${e(a.phrase('catlogin.preview.cloud'))}</h3><div>${e(fmt(cl.preview.cloud))}</div></div>
          </div>
          <div class="tag error">Loading will overwrite everything on this device. You can undo it here afterwards, but photos won’t come back.</div>
          <div class="sync-actions">
            <button id="sync-confirm-load" class="primary" ${cl.busy ? 'disabled' : ''}>Confirm — overwrite this device</button>
            <button id="sync-cancel-load" ${cl.busy ? 'disabled' : ''}>Cancel</button>
          </div>
        </div>`;
}

/** True when the sheet stands alone (no kept copies or Delete my online data under it). */
export function isBare(cl, a) {
  return !!(cl.bringing || cl.preview || (cl.justLinked && a.sync.getCode()));
}

/** The sheet's body for the state `cl`. */
export function sheetHtml(cl, a) {
  if (cl.bringing) return `<div class="sync-bringing" role="status">${a.escapeHtml(a.phrase('catlogin.bringing', cl.bringing.name))}</div>`;
  if (cl.preview) return previewHtml(cl, a);
  const code = a.sync.getCode();
  if (!code) return unlinkedHtml(cl, a);
  return cl.justLinked ? justLinkedHtml(cl, a, code) : linkedHtml(cl, a, code);
}

// ── typing ─────────────────────────────────────────────────────────

/** An 'input' event on one of this sheet's boxes. -> true when it was ours. */
export function typing(target, cl, a) {
  if (target?.id === 'sync-load-code') {
    cl.typed = String(target.value ?? '');
    const chips = a.root.querySelector?.('#catlogin-chips');
    if (chips) chips.innerHTML = chipsHtml(cl.typed, a);
    return true;
  }
  if (target?.id === 'catlogin-hop-code') {
    cl.hopTyped = String(target.value ?? '');
    return true;
  }
  if (target?.id === 'catlogin-check') {
    cl.checkText = String(target.value ?? '');
    const want = lastWord(a.sync.getCode());
    cl.checked = want !== '' && cl.checkText.trim().toUpperCase() === want.toUpperCase();
    const go = a.root.querySelector?.('#sync-got-it');
    if (go) go.disabled = !cl.checked;
    return true;
  }
  return false;
}

// ── Show my cat code: press and hold ───────────────────────────────

const holdOf = (cl) => (cl._hold ??= { timer: null });
function stopHold(cl, a) {
  const h = holdOf(cl);
  if (h.timer !== null) { clearTimeout(h.timer); h.timer = null; }
}
function startHold(cl, a) {
  const h = holdOf(cl);
  if (h.timer !== null || padInput(a) || cl.busy) return;
  h.timer = setTimeout(() => {
    h.timer = null;
    cl.showUntil = Date.now() + SHOW_MS;
    setTimeout(() => { if (cl.showUntil <= Date.now()) a.render(); }, SHOW_MS + 50);
    a.render();
  }, HOLD_MS);
}
const isShowButton = (t) => t?.id === 'catlogin-show';

/** The home screen's root keydown: holding Enter or Space on the Show button also counts. -> true when it was ours. */
export function keydown(e, cl, a) {
  if (!isShowButton(e.target)) return false;
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); if (!e.repeat) startHold(cl, a); return true; }
  return false;
}

/** Put the hold's listeners on the home screen's root (once, when this chunk arrives). */
export function wire(root, cl, a) {
  a.addPhrases(LINES);
  const stop = () => stopHold(cl, a);
  root.addEventListener('pointerdown', (e) => { if (isShowButton(e.target)) startHold(cl, a); });
  root.addEventListener('pointerup', stop);
  root.addEventListener('pointercancel', stop);
  root.addEventListener('pointerout', (e) => { if (isShowButton(e.target)) stop(); });
  root.addEventListener('keyup', (e) => { if (isShowButton(e.target)) stop(); });
}

// ── add a device ───────────────────────────────────────────────────

// The hop client (src/game/hop.js) is its own lazy chunk, fetched by the first tap that needs it.
let hopMod = null;
const loadHop = async () => (hopMod ??= await import('../game/hop.js'));
function stopHop(cl) {
  try { cl.hop?.run?.cancel?.(); } catch { /* a hop that cannot be cancelled is already over */ }
  cl.hop = null;
}
// Every change of a hop's view lands here. A view is redrawn on the sheet; the sheet closing ('left')
// just forgets the hop.
function hopChanged(kind, run, cl, a) {
  return (view) => {
    if (cl.hop?.run !== run) return; // an older hop's late answer
    if (view.phase === 'left') { cl.hop = null; return; }
    cl.hop = { kind, run, view };
    if (kind === 'join' && view.phase === 'arrived') { arrived(view.code, cl, a); return; }
    a.render();
  };
}
// The first device said OK: the cat code is in hand, and the normal Is-this-your-cat card comes next.
async function arrived(code, cl, a) {
  cl.hop = null; cl.hopEntry = false; cl.hopTyped = '';
  cl.busy = true; cl.error = null; a.render();
  const res = await a.sync.previewLoad(code);
  cl.busy = false;
  if (res.ok) cl.preview = res.preview; else cl.error = res.error;
  a.render();
}
async function hopClick(id, e, cl, a) {
  const sync = a.sync;
  switch (id) {
    case 'catlogin-hop-add': {
      if (cl.busy) return true;
      const h = sync.hopHost?.();
      if (!h) { cl.error = a.phrase('catlogin.hop.err.unavailable'); a.render(); return true; }
      const m = await loadHop();
      stopHop(cl);
      const run = m.createHost({ ...h, isOpen: a.sheetOpen, onChange: (v) => hopChanged('host', run, cl, a)(v) });
      cl.hop = { kind: 'host', run, view: run.view() };
      cl.error = null;
      a.render();
      await run.start();
      return true;
    }
    case 'catlogin-hop-yes': await cl.hop?.run?.allow?.(); return true;
    case 'catlogin-hop-no': await cl.hop?.run?.deny?.(); return true;
    case 'catlogin-hop-cancel':
      stopHop(cl); a.render();
      return true;
    case 'catlogin-hop-done':
      cl.hop = null; a.render();
      return true;
    case 'catlogin-hop-have':
      cl.hopEntry = true; cl.error = null; a.render();
      a.root.querySelector?.('#catlogin-hop-code')?.focus?.();
      return true;
    case 'catlogin-hop-back':
      stopHop(cl); cl.hopEntry = false; a.render();
      return true;
    case 'catlogin-hop-go': {
      if (cl.busy) return true;
      const box = a.root.querySelector?.('#catlogin-hop-code');
      const typed = String(box?.value ?? cl.hopTyped ?? '');
      const cloud = sync.hopCloud?.();
      if (!cloud) { cl.hop = { kind: 'join', run: null, view: { phase: 'error', error: 'unavailable' } }; a.render(); return true; }
      const m = await loadHop();
      stopHop(cl);
      cl.hopTyped = typed;
      const run = m.createJoiner({ cloud, isOpen: a.sheetOpen, onChange: (v) => hopChanged('join', run, cl, a)(v) });
      cl.hop = { kind: 'join', run, view: run.view() };
      await run.join(typed);
      return true;
    }
    default:
      return false;
  }
}

// ── taps ───────────────────────────────────────────────────────────

/**
 * A click on the sheet. -> a promise of true when the tap was ours (homebase then stops), or false.
 * `e.target.id` names the button; a "Did you mean" chip is the button 'catlogin-fix' with its word in data-cat-fix.
 */
export async function click(e, cl, a) {
  const id = e.target.id;
  if (id === 'catlogin-fix') {
    const words = String(cl.typed ?? '').toUpperCase().split(/[\s._,·•\-–—]+/).filter(Boolean);
    const at = Number(e.target.dataset?.catWord);
    const fix = e.target.dataset?.catFix;
    if (Number.isInteger(at) && at >= 0 && at < words.length && fix) {
      words[at] = fix;
      cl.typed = words.join(' ');
      const box = a.root.querySelector?.('#sync-load-code');
      if (box) box.value = cl.typed;
      const chips = a.root.querySelector?.('#catlogin-chips');
      if (chips) chips.innerHTML = chipsHtml(cl.typed, a);
      else a.render();
    }
    return true;
  }
  const sync = a.sync;
  if (id.startsWith('catlogin-hop-')) return hopClick(id, e, cl, a);
  switch (id) {
    case 'sync-save': {
      cl.busy = true; cl.error = null; a.render();
      const res = await sync.saveToCloud();
      cl.busy = false;
      if (res.ok) { cl.justLinked = true; cl.changed = false; cl.notKept = false; cl.checkText = ''; cl.checked = false; } else cl.error = res.error;
      a.render();
      return true;
    }
    case 'catlogin-bring':
      cl.bringOpen = true; cl.error = null; a.render();
      a.root.querySelector?.('#sync-load-code')?.focus?.();
      return true;
    // Load from cloud: the typed cat code, or (linked) this device's own. Either way it is the same
    // preview, which compares before it overwrites. A typed code is read and snapped first, and
    // nothing is sent for a code that is not four words of the list.
    case 'sync-load':
    case 'sync-load-linked': {
      let code;
      if (id === 'sync-load') {
        const box = a.root.querySelector?.('#sync-load-code');
        const r = checkCatCode(box?.value ?? cl.typed ?? '');
        if (!r.ok) { cl.error = a.phrase('catlogin.err.nocode'); a.render(); return true; }
        code = r.code;
      } else code = sync.getCode() ?? '';
      cl.busy = true; cl.error = null; a.render();
      const res = await sync.previewLoad(code);
      cl.busy = false;
      if (res.ok) cl.preview = res.preview; else cl.error = res.error;
      a.render();
      return true;
    }
    case 'sync-confirm-load': {
      cl.busy = true; a.render();
      const res = await sync.confirmLoad(cl.preview);
      cl.busy = false;
      cl.preview = null;
      cl.typed = '';
      cl.bringOpen = false;
      a.afterConfirm(res);
      return true;
    }
    case 'sync-cancel-load':
      cl.preview = null; a.render();
      return true;
    case 'sync-got-it':
    case 'catlogin-skip':
      cl.justLinked = false; cl.changed = false; cl.notKept = false; cl.checkText = ''; cl.checked = false; a.render();
      return true;
    case 'catlogin-hide':
      cl.showUntil = 0; a.render();
      return true;
    case 'sync-now': {
      cl.busy = true; cl.status = null; a.render();
      const res = await sync.syncNow();
      cl.busy = false;
      cl.status = res.message;
      a.render();
      return true;
    }
    case 'catlogin-change':
      if (cl.busy) return true;
      a.confirmCard.ask({
        text: a.phrase('catlogin.change.ask'),
        note: a.phrase('catlogin.change.note'),
        no: a.phrase('catlogin.change.no'),
        yes: a.phrase('catlogin.change.yes'),
        returnFocus: () => a.root.querySelector?.('#catlogin-change')?.focus?.({ preventScroll: true }),
        onYes: async () => {
          if (cl.busy) return;
          cl.busy = true; cl.error = null; cl.status = null; cl.showUntil = 0; a.render();
          const res = await sync.changeCode();
          cl.busy = false;
          if (res.ok) { cl.justLinked = true; cl.changed = true; cl.notKept = !!res.notKept; cl.checkText = ''; cl.checked = false; } else cl.error = res.error;
          a.render();
        },
      });
      return true;
    // Unlink asks first: afterwards this device no longer shows the code.
    case 'sync-unlink': {
      const code = sync.getCode();
      if (cl.busy || !code) return true;
      a.confirmCard.ask({
        text: 'Stop saving to the cloud?',
        note: a.phrase('catlogin.unlink.note', codeWords(code)),
        no: 'Keep saving',
        yes: 'Yes, stop',
        danger: true,
        returnFocus: () => a.root.querySelector?.('#sync-unlink')?.focus?.({ preventScroll: true }),
        onYes: () => {
          sync.unlink();
          stopHop(cl);
          cl.status = null; cl.error = null; cl.justLinked = false; cl.showUntil = 0; cl.bringOpen = false;
          a.render();
        },
      });
      return true;
    }
    default:
      return false;
  }
}
