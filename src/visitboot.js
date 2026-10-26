// The visit greeting at boot (visit milestones, Task 7): main.js's ordering of
// the welcome line / celebration, the Rosa farewell and the "While you were
// out" news, pulled out here so it can be tested without the whole game.
//
// index.html covers the page with a splash for the first ~1.5 s. A greeting
// that fades by itself (the welcome line, style B) would play unseen behind
// it, so the greeting waits for the splash; the home base itself does not.

// Resolves once index.html's splash has started to fade (it sets
// window.__splashDone and fires 'splash-hidden'). Resolves at once when there
// is no splash (tests, harness pages) or it is already gone. A fallback timer
// makes sure a missed event can never hold the greeting forever.
export function whenSplashGone({ win = globalThis.window, doc = globalThis.document, fallbackMs = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!win || !doc || win.__splashDone || !doc.getElementById?.('splash')) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      win.removeEventListener?.('splash-hidden', finish);
      resolve();
    };
    win.addEventListener('splash-hidden', finish);
    win.setTimeout ? win.setTimeout(finish, fallbackMs) : setTimeout(finish, fallbackMs);
  });
}

// startVisitGreeting: visit is progression.recordVisit()'s result.
// - A plain visit: the farewell goes up straight away (a tap-to-dismiss card,
//   the splash can't hide it); the welcome line waits for the splash; the news
//   is left to the boot pull, as before.
// - A milestone: the celebration waits for the splash, and the farewell and the
//   news wait for it to close ('done'). While it is pending or up, holding()
//   is true, and main's showColonyNews keeps its rewards for later. Closed
//   because a walk started ('walk'), nothing more is shown: the walk's own
//   summary pull shows the news.
// - A walk already underway when the splash goes (a room partner pressed
//   Start): no greeting; homebase.showVisit wears a pending prize.
export function startVisitGreeting({ visit, homebase, showFarewell, showNews, splashGone, walkActive = () => false }) {
  let holding = !!(visit && visit.milestone);
  const afterCards = (reason) => {
    holding = false;
    if (reason === 'walk') return;
    showFarewell();
    showNews();
  };
  if (!holding) showFarewell();
  const ready = Promise.resolve(splashGone).then(() => {
    const walking = walkActive();
    const shown = homebase.showVisit(visit, { onClosed: afterCards });
    if (!shown && holding) afterCards(walking ? 'walk' : 'done');
  });
  return { holding: () => holding, ready };
}
