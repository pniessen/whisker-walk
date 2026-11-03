import { bus } from '../events.js';
import { objectiveDistance } from '../questscent.js';

// Toasts (polish-hud2, R2/R3). At most two on screen: a burst of discoveries
// used to stack four or five pills in a column that climbed over the cat. A
// new toast past the cap retires the oldest at once. Each toast lives 2.6 s,
// then fades for 0.35 s (style.css .toast) and leaves the DOM. The fade is
// short so the text never outlives its dark pill as "ghost text".
export const MAX_TOASTS = 2;
export const TOAST_LIFE_MS = 2600;
export const TOAST_FADE_MS = 350;

const withPoints = (text, points) => (points ? `${text}  +${points} 🐾` : text);
// Several critters spotted in a row fold into one toast that counts them.
const crittersText = (n, points) => withPoints(`You spotted ${n} critters`, points);

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div class="hud-top">
      <div class="hud-points">🐾 <span id="hud-points-value">0</span></div>
      <div class="hud-rank" id="hud-rank"></div>
    </div>
    <div class="hud-map" id="hud-map"><div class="hud-area" id="hud-area"></div></div>
    <div class="hud-roster hidden" id="hud-roster"></div>
    <div class="hud-objective hidden" id="hud-objective"></div>
    <div class="hud-goals hidden" id="hud-goals"></div>
    <div class="hud-toasts" id="hud-toasts"></div>
    <div class="hud-prompt hidden" id="hud-prompt"></div>
    <div class="hud-controls" id="hud-controls">←↑↓→ move · ⇧ stalk · ␣ pounce/climb · E interact · V meow · T yarn · C camera · +/− zoom · M mute · Esc menu</div>
    <div class="hud-crosshair hidden" id="hud-crosshair">·</div>
    <div class="hud-viewfinder hidden" id="hud-viewfinder">
      <span class="vf-hint-desktop">📷 click to snap · C to lower</span>
      <span class="vf-hint-touch">📷 tap to snap · 📷 button to lower</span>
    </div>
  `;
  const pointsEl = root.querySelector('#hud-points-value');
  const areaEl = root.querySelector('#hud-area');
  const rankEl = root.querySelector('#hud-rank');
  const mapEl = root.querySelector('#hud-map');
  const toastsEl = root.querySelector('#hud-toasts');
  const promptEl = root.querySelector('#hud-prompt');
  const promptTapHandlers = [];
  let lastPrompt = { text: null, tappable: null };
  let lastObjective = { text: null, dist: null };
  // Live toasts, oldest first; a toast leaves this list as it starts to fade.
  const liveToasts = [];
  // Retire a toast: fade it now, take it out of the DOM after the fade. Its
  // life timer is cleared so it can't fire on a toast already on its way out.
  const retireToast = (t) => {
    const i = liveToasts.indexOf(t);
    if (i >= 0) liveToasts.splice(i, 1);
    clearTimeout(t.life);
    t.el.classList.add('fade');
    t.gone = setTimeout(() => t.el.remove(), TOAST_FADE_MS);
  };
  const startToastLife = (t) => {
    clearTimeout(t.life);
    t.life = setTimeout(() => retireToast(t), TOAST_LIFE_MS);
  };

  const api = {
    show() { root.classList.remove('hidden'); },
    hide() { root.classList.add('hidden'); },
    setPoints(n) { pointsEl.textContent = String(n); },
    // The area name is the caption under the corner map.
    setArea(name) { areaEl.textContent = name; },
    // Where the corner map's canvas goes (createMinimap's host).
    get mapHost() { return mapEl; },
    setRank(title) { rankEl.textContent = `🏆 ${title}`; },
    // tappable: on touch devices there's no E key, so the prompt pill itself
    // becomes a button — strip the "E — " keyboard-hint prefix for display
    // and fire onPromptTap handlers when it's tapped. Desktop keeps the
    // passive (non-interactive) pill it always had.
    // Called every frame from updateInteractions — cache the last {text,
    // tappable} and no-op when unchanged so it isn't rebuilding a fresh
    // button node (and reattaching its click listener) 60 times a second.
    setPrompt(text, tappable) {
      const next = { text: text || null, tappable: !!tappable };
      if (lastPrompt.text === next.text && lastPrompt.tappable === next.tappable) return;
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
        promptEl.textContent = text;
      }
    },
    onPromptTap(fn) {
      promptTapHandlers.push(fn);
    },
    // opts.merge: a key. When the newest live toast has the same key, this
    // one folds into it (count and points add up, the text is rebuilt by
    // opts.mergeText(count, points)) and its clock starts again.
    toast(text, points, opts = {}) {
      const key = opts.merge || null;
      const newest = liveToasts[liveToasts.length - 1];
      if (key && newest && newest.key === key) {
        newest.count += 1;
        newest.points += points || 0;
        const build = opts.mergeText || ((n, p) => withPoints(`${text} ×${n}`, p));
        newest.el.textContent = build(newest.count, newest.points);
        startToastLife(newest);
        return;
      }
      while (liveToasts.length >= MAX_TOASTS) retireToast(liveToasts[0]);
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = withPoints(text, points);
      toastsEl.appendChild(el);
      const t = { el, key, count: 1, points: points || 0, life: null, gone: null };
      liveToasts.push(t);
      startToastLife(t);
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
    setGoals(goals) {
      const el = root.querySelector('#hud-goals');
      el.classList.toggle('hidden', !goals);
      if (goals) {
        el.innerHTML = goals.map((g) =>
          `<div class="goal ${g.done ? 'done' : ''}">${g.done ? '✓' : '○'} ${g.text}` +
          (g.target > 1 ? ` — ${Math.min(g.progress, g.target)}/${g.target}` : '') + `</div>`
        ).join('');
      }
    },
  };

  // A chased-off intruder's label is a whole sentence of its own ("You chased
  // off Mossjaw! 🛡️"): a win is not something you spotted.
  bus.on('discovery', ({ type, label, points, repeat }) => {
    const lead = type === 'intruder' ? '' : repeat ? 'Again — ' : 'You spotted ';
    // Critters merge (R3): a burst of songbirds and squirrels reads as one
    // toast, "You spotted 3 critters  +15 🐾". Nothing else merges.
    if (type === 'critter') api.toast(`${lead}${label}`, points, { merge: 'critter', mergeText: crittersText });
    else api.toast(`${lead}${label}`, points);
  });

  return api;
}
