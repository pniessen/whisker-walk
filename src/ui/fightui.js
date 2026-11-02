// The fight on screen (Clan Life Part 2): the Fight / Back off pill and the
// bottom-sheet fight panel. Two pure renderers and one small DOM controller.
//
// The pill is a `div.hud-prompt.hud-fight-ask` in the prompt's place, so
// touchui.js's isPromptTarget lets its taps through to its own buttons. The
// sheet (`div.hud-fight`) exists only during a fight; while it shows, #hud
// carries the `fighting` class, which hides the touch action buttons and the
// zoom (style.css) so nothing but the three moves sits in the bottom third.
//
// Keys reach it only through key(k), which main.js calls: E / Q while the pill
// is up, 1 / 2 / 3 while the sheet is up. A desktop cat is pointer-locked and
// cannot click, so each button shows its key (.fight-key, hidden on touch). It listens to no document events of
// its own, so it can never answer a key twice.
//
// No progress lives here: this file imports nothing that stores anything.
import { BUTTONS, CLUES } from '../fight.js';
import { clanName } from '../clanhomes.js';
import { escapeHtml } from '../game/util.js';
import { FIGHT_MOVES, teachFor } from '../fightmoves.js';

export const FIGHT_TEACH = 'Crouch → Dodge · Paw up → Pounce · Backs up → Swipe';
export const FIGHT_READ = 'Read its move!';
export const FIGHT_LINES = Object.freeze({
  won: 'Nice one! 🐾',
  lost: 'It got that one!',
  secondLook: 'Steady… look again 👀',
});
const MOVE_LABELS = { pounce: 'Pounce', swipe: 'Swipe', dodge: 'Dodge' };

export function renderChallengeHtml({ name, clan } = {}) {
  return `<span class="fight-ask-text">${escapeHtml(name)} of ${escapeHtml(clanName(clan))} is on your land!</span>`
    + '<span class="fight-ask-buttons">'
    + '<button type="button" class="hud-prompt-btn fight-ask-go" data-fight="go">Fight! 🐾<span class="fight-key">E</span></button>'
    + '<button type="button" class="hud-prompt-btn fight-ask-off" data-fight="off">Back off<span class="fight-key">Q</span></button>'
    + '</span>';
}

const count = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(2, Math.floor(n))) : 0);
const pips = (n) => {
  const on = count(n);
  return [0, 1].map((i) => (i < on ? '<span class="pip on">🐾</span>' : '<span class="pip">🐾</span>')).join('');
};

// The clue icon a special answers, shown on its own button so the hint is
// always there (Rolling Tumble answers anything).
function iconOf(id) {
  const m = FIGHT_MOVES.find((x) => x.id === id);
  if (!m) return '';
  return m.answers === 'any' ? '✨' : (CLUES[m.answers]?.icon ?? '');
}

// The specials worth drawing: at most four (keys 4-7), plain-letter ids that
// are not one of the three basic buttons, each once.
const MAX_SPECIALS = 4;
function cleanSpecials(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list) {
    if (out.length >= MAX_SPECIALS) break;
    if (!s || typeof s.id !== 'string' || !/^[A-Za-z]{2,24}$/.test(s.id)) continue;
    if (BUTTONS.includes(s.id) || out.some((o) => o.id === s.id)) continue;
    out.push({ id: s.id, name: typeof s.name === 'string' ? s.name : s.id, used: s.used === true });
  }
  return out;
}

// The short name a short screen shows (FIGHT_MOVES' `short`); an unknown id
// keeps its full name.
function shortOf(m) {
  const known = FIGHT_MOVES.find((x) => x.id === m.id);
  return known ? known.short : m.name;
}

export function renderFightHtml({ phase, clue, wins, losses, line, specials = [] } = {}) {
  const sp = cleanSpecials(specials);
  const showClue = phase === 'clue' && clue && typeof clue.icon === 'string';
  const head = typeof line === 'string' && line ? line : showClue ? '' : FIGHT_READ;
  const idle = phase === 'clue' ? '' : ' idle';
  return '<div class="fight-top">'
    + `<div class="fight-pips"><span class="fight-side">You ${pips(wins)}</span><span class="fight-side">It ${pips(losses)}</span></div>`
    + (head ? `<div class="fight-line">${escapeHtml(head)}</div>` : '')
    + (showClue
      ? `<div class="fight-clue"><span class="fight-clue-icon">${escapeHtml(clue.icon)}</span><span class="fight-clue-text">${escapeHtml(clue.text)}</span></div>`
      : '')
    + '</div>'
    + (sp.length
      ? '<div class="fight-specials">'
        + sp.map((m, i) => `<button type="button" class="fight-special${m.used ? ' used' : ''}" data-move="${m.id}"${m.used ? ' disabled' : ''}>${iconOf(m.id) ? `<span class="fight-special-icon">${iconOf(m.id)}</span> ` : ''}<span class="fight-special-name">${escapeHtml(m.name)}</span><span class="fight-special-short">${escapeHtml(shortOf(m))}</span><span class="fight-key">${BUTTONS.length + 1 + i}</span></button>`).join('')
        + '</div>'
      : '')
    + `<div class="fight-moves${idle}">`
    + BUTTONS.map((b, i) => `<button type="button" class="fight-move" data-move="${b}">${MOVE_LABELS[b]}<span class="fight-key">${i + 1}</span></button>`).join('')
    + '</div>'
    + `<div class="fight-teach">${escapeHtml(FIGHT_TEACH + (sp.length ? teachFor(sp.map((m) => m.id)) : ''))}</div>`;
}

export function createFightUi(root, { onFight = () => {}, onBackOff = () => {}, onMove = () => {} } = {}) {
  let ask = null;
  let sheet = null;
  let lastSheetHtml = null;
  let showing = null;
  let shownSpecials = [];   // [{ id, used }] on the sheet now: the only specials a tap or key can play

  const onClick = (e) => {
    const el = e?.target?.closest?.('[data-fight], [data-move]');
    if (!el) return;
    const go = el.getAttribute('data-fight');
    const move = el.getAttribute('data-move');
    if (go === 'go' && showing === 'challenge') onFight();
    else if (go === 'off' && showing === 'challenge') onBackOff();
    else if (move && showing === 'fight') {
      if (BUTTONS.includes(move)) onMove(move);
      else if (shownSpecials.some((m) => m.id === move && !m.used)) onMove(move);
    }
  };

  // The body gets `fight-asking` / `fighting` too: the chat wheel is fixed in
  // <body> above #hud's layer, and it must not cover the pill or a move button
  // (style.css). #hud never gets `fighting` for the pill: the kid still needs
  // the action buttons and the zoom while deciding.
  const body = () => globalThis.document?.body ?? null;
  function dropAsk() {
    if (ask) ask.remove();
    ask = null;
    root.classList.remove('fight-asking');
    body()?.classList?.remove('fight-asking');
  }
  function dropSheet() {
    if (sheet) sheet.remove();
    sheet = null;
    lastSheetHtml = null;
    shownSpecials = [];
    root.style?.removeProperty?.('--fight-sheet-h');
    root.classList.remove('fighting');
    body()?.classList?.remove('fighting');
  }

  return {
    get showing() { return showing; },
    showChallenge(model) {
      dropSheet();
      if (!ask) {
        ask = document.createElement('div');
        ask.className = 'hud-prompt hud-fight-ask';
        ask.addEventListener('click', onClick);
        root.appendChild(ask);
      }
      ask.innerHTML = renderChallengeHtml(model);
      root.classList.add('fight-asking');
      body()?.classList?.add('fight-asking');
      showing = 'challenge';
    },
    showFight(model) {
      dropAsk();
      if (!sheet) {
        sheet = document.createElement('div');
        sheet.className = 'hud-fight';
        sheet.addEventListener('click', onClick);
        root.appendChild(sheet);
      }
      // Redrawn only when it changes: a button replaced between a finger
      // going down and coming up would lose the tap.
      const html = renderFightHtml(model);
      shownSpecials = cleanSpecials(model?.specials);
      if (html !== lastSheetHtml) {
        sheet.innerHTML = html;
        sheet.classList.toggle('has-specials', shownSpecials.length > 0);
        lastSheetHtml = html;
      }
      // The fight toasts sit just above the sheet, whatever height it has:
      // measured on every show.
      const h = sheet.offsetHeight;
      if (h > 0) root.style?.setProperty?.('--fight-sheet-h', `${Math.round(h)}px`);
      root.classList.add('fighting');
      body()?.classList?.add('fighting');
      showing = 'fight';
    },
    hide() {
      dropAsk();
      dropSheet();
      showing = null;
    },
    // A key while the pill or the sheet shows. True when it was the pill's or
    // the sheet's to answer.
    key(k) {
      const key = typeof k === 'string' ? k.toLowerCase() : '';
      if (showing === 'challenge') {
        if (key === 'e') { onFight(); return true; }
        if (key === 'q') { onBackOff(); return true; }
        return false;
      }
      if (showing === 'fight') {
        const i = ['1', '2', '3'].indexOf(key);
        if (i >= 0) onMove(BUTTONS[i]);
        else {
          const s = shownSpecials['4567'.indexOf(key)];
          if (key.length === 1 && s && !s.used) onMove(s.id);
        }
        return true;
      }
      return false;
    },
  };
}
