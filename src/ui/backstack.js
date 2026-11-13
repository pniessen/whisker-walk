// The browser's Back (an iPad's edge-swipe, Android's Back, a mouse's back
// button) goes one level up inside the game instead of leaving the page.
//
// How: while N layers are open (the Menu is 1, a sheet opened from it 2, a
// walk 1…) the tab's history holds N extra entries for this same URL. The
// address never changes: pushState is given no URL, so the sub-path, the
// service worker and the iOS app's file-like base are untouched. A Back pops
// one entry, and the top layer's own Back button handler runs. The home
// screen with nothing open holds no entry, so Back there is the browser's.
//
// Nothing reports opens and closes to this module. It is given two things,
// depth() (how many layers are open now) and closeTop() (what the top
// layer's own Back / Done / Not now does), and sync() makes the history
// match: it adds entries when layers opened and steps back over the spare
// ones when a layer was closed by its own button. So a button can never
// leave a dead entry behind, and a new layer only has to be counted.
//
// If history is missing or throws, the stack switches itself off and the
// game is as it was before.

export const BACK_KEY = 'wwBack';

// How long a step back we asked for may take to arrive before we stop
// waiting for it (and read where we are from history.state instead).
export const SETTLE_MS = 1000;

// An entry's place in the stack, read from its state: 0 for the page's own
// entry (or anything that is not ours).
export function posOf(state) {
  const n = state && typeof state === 'object' ? state[BACK_KEY] : 0;
  return Number.isInteger(n) && n > 0 ? n : 0;
}

const MAX_DEPTH = 8;
function wanted(depth) {
  let n = 0;
  try { n = Number(depth()); } catch { n = 0; }
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_DEPTH, Math.floor(n)) : 0;
}

// The core, with everything it touches handed in.
//   hist      { state, pushState(state, title), go(n) }: window.history
//   depth()   how many layers are open now
//   closeTop() close the top layer the way its own button does
//   later(fn, ms) -> handle, cancel(handle): setTimeout / clearTimeout
// sync(): make history match depth(). onPop(state): a popstate arrived.
export function createBackStack({ hist, depth, closeTop, later = () => null, cancel = () => {} } = {}) {
  let dead = !hist || typeof hist.pushState !== 'function' || typeof hist.go !== 'function';
  let pos = 0;       // how many of our entries are under the current one
  let waiting = 0;   // steps back we asked for whose popstate has not arrived
  let timer = null;
  if (!dead) {
    // A reload on one of our entries: they are still there, with nothing open.
    // The first sync() steps back over them.
    try { pos = posOf(hist.state); } catch { dead = true; }
  }

  function settled() {
    waiting = 0;
    if (timer !== null) cancel(timer);
    timer = null;
  }

  function sync() {
    if (dead || waiting) return;
    const want = wanted(depth);
    try {
      while (pos < want) {
        hist.pushState({ [BACK_KEY]: pos + 1 }, '');
        pos += 1;
      }
      if (pos > want) {
        const n = pos - want;
        pos = want;
        waiting = 1;
        // The popstate never came (a browser that refused the step): carry on
        // from wherever history says we are.
        timer = later(() => {
          timer = null;
          if (!waiting) return;
          waiting = 0;
          try { pos = posOf(hist.state); } catch { dead = true; }
          sync();
        }, SETTLE_MS);
        hist.go(-n);
      }
    } catch {
      dead = true;
      settled();
    }
  }

  function onPop(state) {
    if (dead) return;
    const at = posOf(state);
    if (waiting) {
      // our own step back over a layer its button already closed
      settled();
      pos = at;
      sync();
      return;
    }
    const steps = pos - at;
    pos = at;
    // Back: one close per entry popped. Forward (steps < 0) reopens nothing;
    // sync() steps back off the entry it landed on.
    for (let i = 0; i < steps; i += 1) {
      try { closeTop(); } catch (err) { console.warn('Whisker Walk: Back could not close a layer', err); }
    }
    sync();
  }

  return {
    sync,
    onPop,
    get pos() { return pos; },
    get dead() { return dead; },
  };
}

// What Back does during a walk (main.js carries it out). Pure.
//   summary     the "Walk complete!" card is up (the walk is over)
//   walking     a walk is on (session)
//   shopAsk     the den shop's "Get it?" card is up
//   shop        the den shop is open
//   crossing    the border post's "Cross over?" card is up
//   engaged     the walk is being played (not paused)
//   photo       photo mode is on
//   started     the walk has begun (the card behind it is "Paused", not "Ready?")
//   touch       a touch walk (a paused one can walk on without a click)
export function walkBackAction({ summary = false, walking = false, shopAsk = false, shop = false, crossing = false, engaged = false, photo = false, started = false, touch = false } = {}) {
  if (!walking) return summary ? 'continue' : null;
  if (shopAsk) return 'shop-not-now';
  if (shop) return 'shop-done';
  if (crossing) return 'cross-no';
  if (engaged) return photo ? 'photo-off' : 'pause';
  // Paused: Back walks on, as the card's own button does. Only on touch: a
  // mouse walk needs a click to take the pointer again, so the card stays.
  // The "Ready?" and "Welcome back!" cards stay too: Back never starts a walk.
  return started && touch ? 'resume' : null;
}

// Wires a stack to the page. Returns it (or a switched-off one).
//   win       window
//   depth, closeTop   as above
//   escape(e) -> true when Escape closed a layer (the home screen's; the
//             walk's own Escape is left alone)
export function attachBackStack({ win, depth, closeTop, escape = null, pollMs = 150 } = {}) {
  let hist = null;
  try { hist = win?.history ?? null; } catch { hist = null; }
  const stack = createBackStack({
    hist,
    depth,
    closeTop,
    later: (fn, ms) => win.setTimeout(fn, ms),
    cancel: (h) => win.clearTimeout(h),
  });
  if (stack.dead || typeof win?.addEventListener !== 'function') return stack;
  win.addEventListener('popstate', (e) => stack.onPop(e.state));
  // A tap is what opens and closes most layers: match history right after its
  // handlers have run. The slow tick catches the rest (a card that came up by
  // itself, a walk that began when a friend pressed Start).
  const soon = () => win.setTimeout(() => stack.sync(), 0);
  win.addEventListener('click', soon, true);
  win.addEventListener('keyup', soon, true);
  win.setInterval(() => stack.sync(), pollMs);
  if (escape) {
    // Capture phase: the layer closes once, here, before a card's own Escape
    // handler (which then finds itself already closed).
    win.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target?.tagName === 'SELECT') return; // Escape there closes its list
      let closed = false;
      try { closed = !!escape(e); } catch (err) { console.warn('Whisker Walk: Escape could not close a layer', err); }
      if (!closed) return;
      e.preventDefault();
      e.stopPropagation();
      stack.sync();
    }, true);
  }
  stack.sync();
  return stack;
}
