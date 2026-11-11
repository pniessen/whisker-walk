// Crash recovery: what the render loop does when a frame throws, and when the
// page may reload itself after the graphics are lost. Pure, DOM-free policy;
// main.js does the acting.
//
// The frame guard. Before it, a throw inside the animation loop repeated on
// every frame with the game frozen. Now one throw is noted and that frame is
// skipped (a stray bad frame, a race with a teardown, is survivable), but a
// walk whose frames keep throwing is ended through the ordinary end of a walk,
// and the child is told gently. "Keep throwing" is either of:
//   - TRIP_STREAK frames in a row, the usual shape of a real bug (something
//     left broken throws every frame): at 60 fps that is a twelfth of a
//     second, too short to see;
//   - TRIP_IN_WINDOW throws inside WINDOW_MS, for a bug that throws on some
//     frames and not others (only while a cat is near, say), which a streak
//     alone would never catch. 20 in 10 s is far above a one-off and far
//     below a bug that fires on even every tenth frame.
// A good frame clears the streak only; the window keeps counting.

export const TRIP_STREAK = 5;
export const TRIP_IN_WINDOW = 20;
export const WINDOW_MS = 10_000;

// fail(now) → 'skip' (note it, carry on) or 'trip' (stop this). Numbers
// only, nothing allocated: ok() runs on every good frame.
export function createFrameGuard({ streak = TRIP_STREAK, inWindow = TRIP_IN_WINDOW, windowMs = WINDOW_MS } = {}) {
  let run = 0;
  let windowStart = 0;
  let windowCount = 0;
  return {
    ok() { run = 0; },
    fail(now) {
      run += 1;
      if (windowCount === 0 || now - windowStart > windowMs) {
        windowStart = now;
        windowCount = 0;
      }
      windowCount += 1;
      return run >= streak || windowCount >= inWindow ? 'trip' : 'skip';
    },
    // A new walk (or the home screen after one) starts with a clean slate.
    reset() { run = 0; windowStart = 0; windowCount = 0; },
    get streak() { return run; },
  };
}

// The reload after a lost graphics context. One automatic reload, then not
// again within RELOAD_GAP_MS: a device that loses its context straight after
// every reload gets a notice with a button instead of a reload loop. The
// stamp lives in sessionStorage (this tab only, gone when the app closes).
export const RELOAD_KEY = 'whisker-walk-gl-reload';
export const RELOAD_GAP_MS = 60_000;

// lastAt: the stamp read back (a string, or null). A stamp a little in the
// future (the clock was set back) counts as recent, the safe answer; one an
// hour or more ahead means nothing and is ignored.
export function mayAutoReload(lastAt, now, gapMs = RELOAD_GAP_MS) {
  if (lastAt === null || lastAt === undefined || lastAt === '') return true;
  const at = Number(lastAt);
  if (!Number.isFinite(at)) return true;
  return now - at >= gapMs || at - now > gapMs * 60;
}

// Reads the stamp and, when a reload is allowed, writes the new one first.
// Storage that cannot be read or written means no automatic reload: without
// the stamp nothing would stop a loop.
export function claimAutoReload(storage, now, gapMs = RELOAD_GAP_MS) {
  try {
    if (!mayAutoReload(storage.getItem(RELOAD_KEY), now, gapMs)) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return storage.getItem(RELOAD_KEY) === String(now);
  } catch {
    return false;
  }
}

// What the child sees. Kept here so the words are in one place.
export const WALK_ENDED_LINE = 'Oops! Something went wrong on that walk, so it stopped early. Everything you found is saved. 🐾';
export const RELOAD_BUTTON_ID = 'btn-reload';

// The last resort, when the game cannot carry on in this page: the loop is
// stopped and only a reload is offered. Plain words, no blame.
export function stuckNoticeHtml(kind = 'error') {
  const line = kind === 'gl'
    ? 'The game’s pictures stopped working.'
    : 'Something went wrong, sorry!';
  return `<div class="pause-card"><p>${line} Tap the button to start the game again.</p>`
    + `<button id="${RELOAD_BUTTON_ID}" class="primary">Start again</button></div>`;
}
