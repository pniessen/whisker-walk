// The two small pieces of page couch play adds: the "press a button on the
// second controller" pill, and the card that asks for a controller that went
// to sleep. Both are real elements (a screen reader reads them, the pad's
// menu walker can focus the card's buttons), sit inside the TV's 5 % safe
// margins, and keep the TV's 24 / 20 px type floors. Words come in from the
// caller (they are phrases, src/coop/words.js).

const CSS = `
.coop-join{position:fixed;left:50%;top:max(13vh,72px);transform:translateX(-50%);z-index:30;max-width:min(90vw,34em);padding:.5em 1em;border-radius:999px;background:rgba(20,26,38,.82);color:#fff;font:600 17px/1.3 Avenir,system-ui,sans-serif;text-align:center;pointer-events:none}
.coop-join[hidden],.coop-lost[hidden]{display:none}
.coop-join .pad-glyph{width:1.3em;height:1.3em;vertical-align:-.3em}
.coop-lost{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(10,14,22,.55);font:500 18px/1.4 Avenir,system-ui,sans-serif;color:#fff}
.coop-lost .coop-card{max-width:min(80vw,30em);padding:1.2em 1.6em;border-radius:18px;background:#1c2431;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.4)}
.coop-lost h2{margin:0 0 .3em;font-size:1.25em}
.coop-lost p{margin:0 0 1em;opacity:.9}
.coop-lost .coop-actions{display:flex;gap:.8em;justify-content:center;flex-wrap:wrap}
.coop-lost button{min-height:48px;min-width:48px;padding:.5em 1.2em;border:2px solid #fff;border-radius:12px;background:#2b3a55;color:#fff;font:inherit;cursor:pointer}
.coop-lost button:focus-visible,.pad-focus .coop-lost button:focus{outline:4px solid #ffd35c;outline-offset:2px}
html.tv .coop-join{font-size:24px}
html.tv .coop-lost{font-size:24px}
html.tv .coop-lost .coop-card{max-width:min(80vw,34em)}
`;

export function createCards({ doc = document } = {}) {
  const make = (tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };
  const style = make('style');
  style.textContent = CSS;
  (doc.head ?? doc.body)?.appendChild(style);

  const join = make('div', 'coop-join');
  join.setAttribute('role', 'status');
  join.setAttribute('aria-live', 'polite');
  join.hidden = true;
  doc.body?.appendChild(join);

  const lost = make('div', 'coop-lost');
  lost.setAttribute('role', 'alertdialog');
  lost.setAttribute('aria-modal', 'true');
  lost.setAttribute('data-pad-layer', 'coop-lost'); // the pad's menu walker takes this as the top layer
  lost.hidden = true;
  const card = make('div', 'coop-card');
  const title = make('h2');
  const hint = make('p');
  const actions = make('div', 'coop-actions');
  const wait = make('button');
  wait.type = 'button';
  const without = make('button');
  without.type = 'button';
  actions.append(wait, without);
  card.append(title, hint, actions);
  lost.appendChild(card);
  doc.body?.appendChild(lost);

  let onWait = null, onWithout = null;
  wait.addEventListener('click', () => onWait?.());
  without.addEventListener('click', () => onWithout?.());

  return {
    joinEl: join,
    lostEl: lost,
    /** The pill: `html` is already escaped (glyphify output); `text` is its plain form for the screen reader. */
    showJoin(html, text) {
      if (join.dataset.text === text && !join.hidden) return;
      join.innerHTML = html;
      join.dataset.text = text;
      join.setAttribute('aria-label', text);
      join.hidden = false;
    },
    hideJoin() { join.hidden = true; join.dataset.text = ''; },
    showLost({ title: t, hint: h, wait: w, without: wo, onWait: a, onWithout: b }) {
      title.textContent = t; hint.textContent = h; wait.textContent = w; without.textContent = wo;
      onWait = a; onWithout = b;
      lost.setAttribute('aria-label', t);
      if (lost.hidden) { lost.hidden = false; try { wait.focus?.(); } catch { /* no focus here */ } }
    },
    hideLost() { lost.hidden = true; onWait = null; onWithout = null; },
    get lostShown() { return !lost.hidden; },
    dispose() { for (const e of [style, join, lost]) e.remove?.(); },
  };
}
