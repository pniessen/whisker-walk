// The teleport gates' page and words (milestone 0). LAZY, with the rest of the gates' pieces (src/telehook.js): the
// swirl between two places, the "Go through to ...?" card, and every line, which join the phrase table when this file
// comes (as the Lighthouse's do), so none is in the start-up download. Every line reads the same in both word sets
// and none uses a series word (test/teleport.test.js); the Clan set's lightly flavoured variants come with the real
// art, milestone 1.
import { addPhrases, phrase } from './clanphrases.js';

// padTag, lower, escapeHtml: handed in by teleport.js setup (so this chunk pulls no start-up module into one of its own).
let padTag = () => '';
let lower = (s) => s;
let escapeHtml = (s) => s;
export function setup(host) { ({ padTag, lower, escapeHtml } = host); }

export const LINES = Object.freeze({
  'tele.go': 'Go through',
  'tele.notnow': 'Not now',
  'tele.prompt': (name) => `Go through to ${name}?`,
  'tele.home': 'Take the gate home when you’re ready.',
  'tele.room': 'The gate hums, but it is not ready for friends yet.',
  'tele.coop': 'The gate is waiting. Two cats go together when we’re ready!',
  'tele.slow': 'Nearly there!',
});
addPhrases(LINES);

// The swirl: a light that opens from the middle, turning, and fills the screen (1.2 s), as the overlay the walk shows
// between two places. Reduced motion (the setting, or the system's own): a 0.4 s cross-fade to the same colour, nothing
// turning. Slow smooth changes only: nothing flashes. `.opening` is the same screen going away over the arrival.
export const CSS = `
.tele-swirl{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;color:#4b3a14;text-align:center;
 background:radial-gradient(circle at 50% 50%,#fffbe8 0,#ffe7a6 38%,#cfe8ff 100%);clip-path:circle(0% at 50% 50%);animation:tele-grow 1.2s cubic-bezier(.5,0,.8,1) forwards}
.tele-turn{position:absolute;inset:-60%;opacity:.75;background:conic-gradient(from 0deg,#fff1b8,#a9dcff,#f4c6ff,#ffe39a,#fff1b8);animation:tele-spin 1.2s linear forwards}
.tele-line{position:relative;padding:0 16px;font:700 clamp(1.4rem,5vw,2.4rem)/1.25 Avenir,'Trebuchet MS',sans-serif;text-shadow:0 1px 8px #fff8}
.tele-swirl.opening{position:fixed;z-index:12;pointer-events:none;clip-path:circle(75% at 50% 50%);animation:tele-open .6s ease-out forwards}
.tele-swirl.opening .tele-line{display:none}
.tele-swirl.calm,.tele-swirl.calm.opening{clip-path:none;opacity:0;animation:tele-fade .4s ease forwards}
.tele-swirl.calm .tele-turn{animation:none}
.tele-swirl.calm.opening{opacity:1;animation:tele-fadeout .4s ease forwards}
.tele-card h2{max-width:22ch}
.tele-card .btn{min-height:48px;min-width:160px}
html.tv .tele-line{font-size:calc(2.6rem * var(--tv-s,1))}
html.tv .tele-card .btn{min-height:calc(84px * var(--tv-s,1))}
@keyframes tele-grow{from{clip-path:circle(0% at 50% 50%)}to{clip-path:circle(75% at 50% 50%)}}
@keyframes tele-spin{from{transform:rotate(0) scale(.6)}to{transform:rotate(420deg) scale(1)}}
@keyframes tele-open{from{opacity:1;clip-path:circle(75% at 50% 50%)}to{opacity:0;clip-path:circle(0% at 50% 50%)}}
@keyframes tele-fade{from{opacity:0}to{opacity:1}}
@keyframes tele-fadeout{from{opacity:1}to{opacity:0}}
@media (prefers-reduced-motion:reduce){.tele-swirl{clip-path:none;opacity:0;animation:tele-fade .4s ease forwards}.tele-turn{animation:none}.tele-swirl.opening{opacity:1;animation:tele-fadeout .4s ease forwards}}
`;

let styled = false;
export function ensureStyle(doc = globalThis.document) {
  if (styled) return;
  try {
    const el = doc.createElement('style');
    el.textContent = CSS;
    doc.head.append(el);
    styled = true;
  } catch { /* no page (a test): the card and the swirl still read as text */ }
}

// The swirl, as the overlay's content while the next place comes.
export function swirlHtml({ name, calm = false }) {
  ensureStyle();
  return `<div class="tele-swirl${calm ? ' calm' : ''}" role="status"><div class="tele-turn"></div><p class="tele-line">${escapeHtml(phrase('gate.off', lower(name)))}</p></div>`;
}

// "Nearly there!": the place is slow; the swirl keeps turning and the line changes.
export function nearly(root) {
  const line = root?.querySelector?.('.tele-line');
  if (line) line.textContent = phrase('tele.slow');
}

// The swirl going away over the arrival: a screen of its own on the page, gone in under a second.
export function opening({ calm = false, doc = globalThis.document, later = setTimeout } = {}) {
  try {
    ensureStyle(doc);
    const el = doc.createElement('div');
    el.className = `tele-swirl opening${calm ? ' calm' : ''}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="tele-turn"></div>';
    doc.body.append(el);
    later(() => el.remove(), 700);
  } catch { /* nothing to open on */ }
}

// The question at a gate she can go through; the buttons are the crossing card's own (crossing.js wires them by id),
// 48 px high, with the pad's tags.
export function cardHtml({ name }) {
  ensureStyle();
  return `<div class="pause-card cross-card tele-card">
      <h2>${escapeHtml(phrase('tele.prompt', lower(name)))}</h2>
      <button id="btn-cross-yes" class="btn" type="button">${escapeHtml(phrase('tele.go'))}${padTag('⟦confirm⟧')}</button>
      <button id="btn-cross-no" class="btn" type="button">${escapeHtml(phrase('tele.notnow'))}${padTag('⟦back⟧')}</button>
    </div>`;
}
