import { bus } from '../events.js';
import { objectiveDistance } from '../questscent.js';
import { PAW } from './pawicon.js';
import { toastLifeMs } from './toastlife.js';
import { bothForms, hasLine } from '../tutorialwords.js';
import { tvState, padHtml, padText, padFix, onTv } from '../tvseam.js';
import { escapeHtml } from '../escapehtml.js';
import { getProfile } from '../profile.js';

// Toasts (polish-hud2, R2/R3). At most two on screen: a burst of discoveries
// used to stack four or five pills in a column that climbed over the cat.
// Lines past the cap wait in a short queue rather than being lost (a fight
// win can fire four lines in one tick, a taming three or four). A shown
// toast gives up its slot early only once it has been read for 2.5 s; the
// next waiting line appears as it fades. Otherwise each toast lives as long
// as its words need (toastLifeMs: 3 to 9 s), then fades for 0.35 s
// (style.css .toast) and leaves the DOM. The fade is short so the text never
// outlives its dark pill as "ghost text". A tap on a toast holds it: its
// clock starts again and no waiting line pushes it out; a second tap lets
// it go.
export const MAX_TOASTS = 2;
export const TOAST_FADE_MS = 350;
export const MIN_SHOWN_MS = 2500;
// At most this many lines wait; past it the oldest waiting line is dropped,
// so a runaway loop can't build a minute-long backlog.
export const MAX_QUEUED_TOASTS = 6;

const withPoints = (text, points) => (points ? `${text}  +${points} 🐾` : text);
// Several critters spotted in a row fold into one toast that counts them.
const crittersText = (n, points) => withPoints(`You spotted ${n} critters`, points);
const GOAL_LEAD = 'goal complete: ';
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The words a discovery toast leads with. Most finds are something you
// spotted ("You spotted a daisy", "Again — a daisy"). A chased-off intruder's
// label is a whole sentence of its own ("You chased off Mossjaw! 🛡️"). A
// goal reads "Goal complete: …", the race finish (also type 'goal') "You
// finished the daily zoomies race", and the jackpot and duo-goal lines stand
// on their own, capitalised ("A goal completed TOGETHER! 🤝").
export function discoveryText({ type, label, repeat }) {
  // The Farm's jobs and finds say their own whole line (src/farmwords.js), as
  // does the Old House's finds, a found outfit's pouch (foundwear/play.js) and
  // the Market's treats and teamwork (src/marketwords.js).
  if (type === 'intruder' || type === 'border' || type === 'farmjob' || type === 'farmfind' || type === 'fairgame' || type === 'fairfind' || type === 'boatride' || type === 'housefind' || type === 'roofsfind' || type === 'marketfind' || type === 'marketjob' || type === 'marketnote' || type === 'lighthousejob' || type === 'lighthousefind' || type === 'lighthouseship' || type === 'lighthousenote' || type === 'greenhousenote' || type === 'pouch' || type === 'treat' || type === 'teamtreat' || type === 'housewing') return label;
  if (type === 'goal') {
    return label.startsWith(GOAL_LEAD)
      ? `Goal complete: ${label.slice(GOAL_LEAD.length)}`
      : `You finished ${label}`;
  }
  if (type === 'jackpot' || type === 'duogoal') return capitalise(label);
  // A pounce's label is its own sentence ("you pounce-tagged a sparrow!",
  // game/avatar.js), so it never takes "You spotted" in front.
  if (type === 'hunt') return repeat ? `Again — ${label}` : capitalise(label);
  // Every other find reads with a lead that fits what happened (toast-verbs,
  // 2026-11-22): "You spotted" only where she literally sees it. The leads
  // are plain words, the same in both editions; a clan word reaches a toast
  // only through the label itself, which its caller built from the word set.
  if (repeat) return `Again — ${label}`;
  // Whole-sentence labels that already name their own doer.
  if (type === 'gift' && /brought you|found the gift/.test(label)) return capitalise(label);
  if (type === 'mischief' && /bowled over/.test(label)) return capitalise(label);
  if (type === 'nappile' || type === 'rally' || (type === 'friend' && /visited$/.test(label))) return capitalise(label);
  const lead = LEADS[type];
  if (!lead) return `You spotted ${label}`;
  const words = typeof lead === 'function' ? lead(label) : lead;
  return `${Array.isArray(words) ? words[stableHash(label) % words.length] : words}${label}`;
}

// A small stable hash, so a lead that rotates picks the same words for the
// same label every time (tests and replays stay put; no Math.random).
function stableHash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

// type -> the words before the label (a list rotates by the label's hash).
const LEADS = {
  mischief: (l) => (/^the /.test(l) ? 'You made ' : 'You pulled off '),
  scenic: ['You found a view: ', 'Nice view: '],
  gift: (l) => (/^a gift tucked/.test(l) ? 'You left ' : 'You found '),
  friend: (l) => (/^a new /.test(l) ? 'You made ' : 'You shared '),
  boop: 'You shared ',
  groom: 'You shared ',
  duet: 'You sang ',
  tag: 'You played ',
  patrol: 'You went on ',
  pet: 'You got ',
  collectible: ['You found ', 'You came across '],
  critter: 'You spotted ',
  treasure: 'You found ',
  legend: (l) => (/GOLDEN/.test(l) ? 'You found ' : 'You spotted '),
  sits: 'You nailed ',
  play: 'You had ',
  perk: (l) => (/catch/.test(l) ? 'You made ' : /masterclass/.test(l) ? 'You showed off ' : /wave/.test(l) ? 'You got ' : 'You had '),
  rainbow: 'You saw ',
  photo: 'You took ',
};

// A goal's "how" line, in both forms: the page's touch mode shows one (CSS,
// like the viewfinder's two hints), so a device that turns out to be touch
// mid-walk reads the right words without a redraw.
// A goal may carry the slots its line needs (`howSlots`: the yarn goal's
// {place}, set by walk.js).
export function goalHowHtml(goal) {
  if (!goal || !hasLine(goal.how)) return '';
  const { touch, keys } = bothForms(goal.how, goal.howSlots ?? {});
  // TV mode adds the pad's own words (src/tv/padwords.js), drawn with button pictures; the page's data-input picks one.
  const p = tvState.padLine?.(goal.how, goal.howSlots ?? {});
  const pad = p && p !== keys ? padHtml(p) : '';
  const body = touch === keys && !pad ? escapeHtml(touch)
    : `<span class="how-keys">${escapeHtml(keys)}</span><span class="how-touch">${escapeHtml(touch)}</span>${pad ? `<span class="how-pad">${pad}</span>` : ''}`;
  return `<div class="goal-how">${body}</div>`;
}

// The desktop key strip (controls review, 2026-11-19): six things, the ones
// a walk needs every minute. The full list is on the Paused card (walk.js).
const VF_KEYS = '📷 click to snap · C to lower';
export const KEY_STRIP = '←↑↓→/WASD move · Space jump · E do it · V meow · C photo · Esc pause';
// Under the sea Space is the held kick, not a jump (the same in both word sets)
export const REEF_STRIP = '←↑↓→/WASD swim · hold Space to float up · E do it · V meow · C photo · Esc pause';

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-points" role="group" aria-label="Paw points">${PAW} <span id="hud-points-value">0</span></div>
      <div class="hud-rank" id="hud-rank"></div>
    </div>
    <div class="hud-map" id="hud-map"><div class="hud-area" id="hud-area"></div></div>
    <div class="hud-roster hidden" id="hud-roster"></div>
    <div class="hud-objective hidden" id="hud-objective"></div>
    <div class="hud-goals hidden" id="hud-goals" tabindex=0></div>
    <div class="hud-hint hidden" id="hud-hint" role="status" aria-live="polite"><span id="hud-hint-pic" class="hud-hint-pic" aria-hidden="true"></span><span id="hud-hint-text" class="hud-hint-text"></span></div>
    <div class="hud-toasts" id="hud-toasts" role="status" aria-live="polite"></div>
    <div class="hud-prompt hidden" id="hud-prompt"></div>
    <div class="hud-controls" id="hud-controls">${KEY_STRIP}</div>
    <div class="hud-crosshair hidden" id="hud-crosshair">·</div>
    <div class="hud-viewfinder hidden" id="hud-viewfinder">
      <span id="hud-vf" class="vf-hint-desktop">${VF_KEYS}</span>
      <span class="vf-hint-touch">📷 tap to snap · 📷 button to lower</span>
    </div>
  `;
  const pointsEl = root.querySelector('#hud-points-value');
  const areaEl = root.querySelector('#hud-area');
  const rankEl = root.querySelector('#hud-rank');
  const mapEl = root.querySelector('#hud-map');
  const toastsEl = root.querySelector('#hud-toasts');
  // TV mode: the key strip becomes the pad's, with button pictures, while the pad is the input.
  const stripEl = root.querySelector('#hud-controls');
  let floating = false;
  const vfEl = root.querySelector('#hud-vf');
  function paintStrip() {
    const p = tvState.input === 'pad' && padHtml(tvState.padLine?.(floating ? 'pad.strip.reef' : 'pad.strip') ?? '');
    if (p) stripEl.innerHTML = p; else stripEl.textContent = floating ? REEF_STRIP : KEY_STRIP;
  }
  onTv(() => {
    paintStrip();
    const v = tvState.input === 'pad' && padHtml(tvState.padLine?.('pad.vf.hint') ?? '');
    if (v) vfEl.innerHTML = v; else vfEl.textContent = VF_KEYS;
    if (hintArgs) api.setHint(...hintArgs);
  });
  const promptEl = root.querySelector('#hud-prompt');
  const promptTapHandlers = [];
  let lastPrompt = { text: null, tappable: null };
  let lastObjective = { text: null, dist: null };
  let lastHint = null;
  let hintArgs = null; // the hint as the caller gave it, to say again in the other input's words
  // Shown toasts, oldest first; a toast leaves this list as it starts to
  // fade. Waiting lines (past the cap) queue up behind them, oldest first.
  const liveToasts = [];
  const toastQueue = [];
  // How many toasts may show at once: MAX_TOASTS, or fewer while a guided
  // step is open (setToastCap), so its bubble is never buried.
  let toastCap = MAX_TOASTS;
  // A phone shows one at a time (device profiles M2; VALUES.phone.toasts): the rest wait their turn.
  const cap = () => Math.min(toastCap, tvState.toastTiming?.cap ?? MAX_TOASTS - (getProfile() == 'phone'));
  // Retire a toast: fade it now, take it out of the DOM after the fade, and
  // let the next waiting line in. Its timers are cleared so they can't fire
  // on a toast already on its way out.
  const retireToast = (t) => {
    const i = liveToasts.indexOf(t);
    if (i >= 0) liveToasts.splice(i, 1);
    clearTimeout(t.life);
    clearTimeout(t.ripeTimer);
    t.el.classList.add('fade');
    t.gone = setTimeout(() => t.el.remove(), TOAST_FADE_MS);
    pumpToasts();
  };
  const startToastLife = (t) => {
    clearTimeout(t.life);
    t.life = setTimeout(() => retireToast(t), tvState.toastTiming ? tvState.toastTiming.life(t.el.textContent, toastQueue.length) : toastLifeMs(t.el.textContent));
  };
  // First tap: hold it (a fresh clock, and no early retiring). Second: let go.
  const tapToast = (t) => {
    if (!liveToasts.includes(t)) return;
    if (t.held) { retireToast(t); return; }
    t.held = true;
    t.ripe = false;
    clearTimeout(t.ripeTimer);
    startToastLife(t);
  };
  // A phone drops the leading "You " of a discovery line ("Spotted a squirrel"): a shorter pill.
  const words = (item) => {
    const s = padText(padFix(item.build(item.count, item.points)));
    return getProfile() == 'phone' ? s.replace(/^You (?=[a-z]+ )(.)/, (_, c) => c.toUpperCase()) : s;
  };
  // Lines waiting behind the shown one fold into a small "+N" on a phone (CSS: .toast[data-more]).
  const fold = () => {
    const e = liveToasts[liveToasts.length - 1]?.el;
    e?.setAttribute?.('data-more', toastQueue.length || '');
  };
  const showToast = (item) => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = words(item);
    toastsEl.appendChild(el);
    const t = { ...item, el, shownAt: Date.now(), ripe: false, held: false, life: null, ripeTimer: null, gone: null };
    el.addEventListener?.('click', () => tapToast(t));
    liveToasts.push(t);
    startToastLife(t);
    // Once read for MIN_SHOWN_MS it may give up its slot to a waiting line.
    t.ripeTimer = setTimeout(() => { t.ripe = true; pumpToasts(); }, tvState.toastTiming ? tvState.toastTiming.ripe : MIN_SHOWN_MS);
  };
  // Fill free slots from the queue; when lines still wait and the screen is
  // full, the oldest unheld shown toast makes room once it has been up 2.5 s
  // (now if it already has, else its ripe timer calls back here then).
  const pumpToasts = () => {
    while (liveToasts.length < cap() && toastQueue.length) showToast(toastQueue.shift());
    const oldest = liveToasts.find((t) => !t.held);
    if (toastQueue.length && oldest?.ripe) retireToast(oldest);
    fold();
  };

  // The earned-skill badge strip is a lazy chunk (src/ui/skillbadges.js): nothing loads until a walk has a skill to show.
  let strip = null, stripLoad = null;
  const withStrip = (fn) => (strip ? Promise.resolve(fn(strip)) : (stripLoad ??= import('./skillbadges.js').then((m) => (strip = m.createBadgeStrip({ root, hud: api }))).catch(() => { stripLoad = null; })).then((s) => s && fn(s)));

  const api = {
    // The Reef: the key strip says to hold Space to float (the walk calls it a few times a second; it repaints only on a change)
    setFloat(on) { if (!!on === floating) return; floating = !!on; paintStrip(); },
    // The skills in the save, at a walk's start (no pop); a skill earned mid-walk pops in.
    setBadges(ids) { if ((ids && ids.length) || strip) withStrip((s) => s.set(ids)); },
    earnBadges(ids) { if (ids && ids.length) withStrip((s) => s.earn(ids)); },
    // A toast is up or waiting (a phone's badge pop waits its turn).
    toastBusy() { return liveToasts.length > 0 || toastQueue.length > 0; },
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); },
    setPoints(n) { pointsEl.textContent = String(n); },
    // The area name is the caption under the corner map.
    setArea(name) { areaEl.textContent = name; },
    // Where the corner map's canvas goes (createMinimap's host).
    get mapHost() { return mapEl; },
    // The cup and the title in spans of their own: on the narrowest phones
    // the rank folds into the points pill without its cup (style.css).
    setRank(title) {
      rankEl.textContent = '';
      const cup = document.createElement('span');
      cup.className = 'rank-cup';
      cup.textContent = '🏆 ';
      const name = document.createElement('span');
      name.className = 'rank-title';
      name.textContent = title;
      rankEl.append(cup, name);
    },
    // tappable: on touch devices there's no E key, so the prompt pill itself
    // becomes a button — strip the "E — " keyboard-hint prefix for display
    // and fire onPromptTap handlers when it's tapped. Desktop keeps the
    // passive (non-interactive) pill it always had.
    // Called every frame from updateInteractions — cache the last {text,
    // tappable} and no-op when unchanged so it isn't rebuilding a fresh
    // button node (and reattaching its click listener) 60 times a second.
    setPrompt(text, tappable) {
      // A pad player reads the pad's button where the line says E (padFix); text then has ⟦tokens⟧ for padHtml.
      const shown = text && !tappable ? padFix(text) : text;
      const next = { text: shown || null, tappable: !!tappable };
      if (lastPrompt.text === next.text && lastPrompt.tappable === next.tappable) return;
      text = shown;
      lastPrompt = next;
      promptEl.classList.toggle('hidden', !text);
      if (!text) return;
      if (tappable) {
        const display = text.replace(/^E\s+—\s+/, '');
        promptEl.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'hud-prompt-btn';
        btn.type = 'button';
        btn.textContent = display;
        btn.addEventListener('click', () => {
          for (const fn of promptTapHandlers) fn();
        });
        promptEl.appendChild(btn);
      } else {
        const h = text.includes('⟦') ? padHtml(text) : null;
        if (h) promptEl.innerHTML = h; else promptEl.textContent = text;
      }
    },
    onPromptTap(fn) {
      promptTapHandlers.push(fn);
    },
    // opts.merge: a key. When the newest shown toast has the same key (and
    // isn't fading), this one folds into it (count and points add up, the
    // text is rebuilt by opts.mergeText(count, points)) and its clock starts
    // again. Failing that, it folds into the last waiting line if that has
    // the same key. Otherwise it's a toast of its own, shown now if there is
    // room, else queued.
    toast(text, points, opts = {}) {
      const key = opts.merge || null;
      // One toast reads its own words; a merged one is rebuilt from the count.
      const many = opts.mergeText || ((n, p) => withPoints(`${text} ×${n}`, p));
      const build = (n, p) => (n > 1 ? many(n, p) : withPoints(text, p));
      if (key) {
        const newest = liveToasts[liveToasts.length - 1];
        if (newest && newest.key === key) {
          newest.count += 1;
          newest.points += points || 0;
          newest.el.textContent = words(newest);
          startToastLife(newest);
          return;
        }
        const last = toastQueue[toastQueue.length - 1];
        if (last && last.key === key) {
          last.count += 1;
          last.points += points || 0;
          return;
        }
      }
      toastQueue.push({ key, count: 1, points: points || 0, build });
      while (toastQueue.length > MAX_QUEUED_TOASTS) toastQueue.shift();
      pumpToasts();
    },
    // Called every frame while a quest is active (the metre count follows the
    // cat), so, like setPrompt, it caches the last value and no-ops when
    // nothing visible changed. The key is the text plus the RENDERED distance
    // string, not the raw float: keyed on text alone the number would freeze,
    // keyed on the float the DOM would rebuild as the cat moved by millimetres.
    // The distance is a separate child so CSS can make it secondary; both are
    // textContent, never innerHTML.
    setObjective(text, meters) {
      const next = { text: text || null, dist: text ? objectiveDistance(meters) : null };
      if (lastObjective.text === next.text && lastObjective.dist === next.dist) return;
      lastObjective = next;
      const el = root.querySelector('#hud-objective');
      el.classList.toggle('hidden', !text);
      if (!text) return;
      el.textContent = text; // also drops any previous distance child
      if (next.dist) {
        const d = document.createElement('span');
        d.className = 'hud-objective-dist';
        d.textContent = next.dist;
        el.appendChild(d);
      }
    },
    // The corner map steps aside while the viewfinder is up, leaving the
    // whole screen for lining up the shot. The centre dot shows only then: on
    // the walk the camera always looks at the cat's head, so the dot sat on
    // the back of its neck (polish 1a, Task 5: "a white dot on the nape").
    setCamera(on) {
      root.querySelector('#hud-viewfinder').classList.toggle('hidden', !on);
      root.querySelector('#hud-crosshair').classList.toggle('hidden', !on);
      mapEl.classList.toggle('hidden', !!on);
    },
    setRoster(names) {
      const el = root.querySelector('#hud-roster');
      const list = Array.isArray(names) ? names : [];
      el.classList.toggle('hidden', list.length === 0);
      el.innerHTML = '';
      for (const name of list) {
        const chip = document.createElement('span');
        chip.className = 'hud-roster-chip';
        chip.textContent = `🟢 ${name}`; // textContent, not innerHTML — names come over the network
        el.appendChild(chip);
      }
    },
    // The guided first walk is on this walk (walk.js, from its start to its
    // end or a skip): #hud wears `lesson-on`, and a keyboard's key strip stays
    // away, even before the bubble first shows.
    setLesson(on) {
      root.classList.toggle('lesson-on', !!on);
    },
    // "One toast at a time" while a guided step is open (the guided first
    // walk): n toasts at most, or null for the usual MAX_TOASTS. Lines past
    // it wait their turn as always; none is lost.
    setToastCap(n) {
      toastCap = Number.isInteger(n) && n >= 1 ? n : MAX_TOASTS; // cap() holds it to the profile's own number
      pumpToasts();
    },
    // Only the first unfinished goal shows its "how" line, so there is one
    // thing to read at a time (guided-first-walk design, section 5).
    setGoals(goals) {
      const el = root.querySelector('#hud-goals');
      el.classList.toggle('hidden', !goals);
      if (goals) {
        const next = goals.find((g) => !g.done);
        // `next` marks the first unfinished goal: the narrowest phones show
        // only that one (style.css).
        el.innerHTML = goals.map((g) =>
          `<div class="goal ${g.done ? 'done' : ''}${g === next ? ' next' : ''}">${g.done ? '✓' : '○'} ${g.text}` +
          (g.target > 1 ? ` — ${Math.min(g.progress, g.target)}/${g.target}` : '') + `</div>` +
          (g === next ? goalHowHtml(g) : '')
        ).join('');
      }
    },
    // The hint line (src/hints.js through game/tips.js): one short sentence
    // with a small picture, read out politely once. null puts it away. Text
    // only (textContent): a hint can carry a cat's name. #hud wears `hinting`
    // while it is up, so the CSS can make room for it. The guided walk's
    // bubble (step 3 of the build) is this same element.
    setHint(text, pic) {
      hintArgs = [text, pic];
      if (typeof text === 'string') text = padFix(text);
      const on = typeof text === 'string' && text !== '';
      const key = on ? `${pic || ''}|${text}|${tvState.input}` : null;
      if (key === lastHint) return;
      lastHint = key;
      const el = root.querySelector('#hud-hint');
      if (on) {
        root.querySelector('#hud-hint-pic').textContent = pic || '';
        // A pad line may carry ⟦tokens⟧ for button pictures (TV mode); anything else is text.
        const t = root.querySelector('#hud-hint-text');
        const h = text.includes('⟦') ? padHtml(text) : null;
        if (h) t.innerHTML = h; else t.textContent = text.replace(/⟦\w+⟧/g, '');
      }
      el.classList.toggle('hidden', !on);
      root.classList.toggle('hinting', on);
    },
  };

  // The lead words live in discoveryText (above).
  bus.on('discovery', ({ type, label, points, repeat }) => {
    const text = discoveryText({ type, label, repeat });
    // Critters merge (R3): a burst of songbirds and squirrels reads as one
    // toast, "You spotted 3 critters  +15 🐾". Nothing else merges.
    if (type === 'critter') api.toast(text, points, { merge: 'critter', mergeText: crittersText });
    else api.toast(text, points);
  });

  return api;
}
