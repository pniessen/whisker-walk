// The start-up side of TV mode: a flag, the last input, and a hook for the
// chunk (src/tv/*, loaded only when the TV switch is on). No imports, and
// nothing here may import src/tv/: the build fails if the chunk joins
// start-up (scripts/buildjson.mjs). With TV mode off every function is
// identity or a no-op, so touch, mouse and keyboard play is unchanged.
export const tvState = { on: false, input: 'keys', text: null, html: null, padLine: null };

// Pad events from gamepad.js; the chunk fills these in (null = nobody listens).
export const tvHooks = { padUse: null, padConnect: null, padDisconnect: null };

const listeners = new Set();

/** Plain text or token text in, the same out until the chunk sets `text`. */
export const padText = (s) => (tvState.text ? tvState.text(s) : s);

/** Like padText but for a caller that sets HTML: the string with button pictures, or null when TV mode has none (keep the caller's own path). */
export const padHtml = (s) => (tvState.html ? tvState.html(s) : null);

/** Merge a change in; listeners hear about it once, and only if something changed. */
export function setTv(partial) {
  let changed = false;
  for (const k of Object.keys(partial)) {
    if (tvState[k] !== partial[k]) { tvState[k] = partial[k]; changed = true; }
  }
  if (!changed) return;
  for (const fn of [...listeners]) {
    try { fn(tvState); } catch { /* one listener must not stop the rest */ }
  }
}

/** Hear about changes; returns the way to stop. */
export function onTv(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Back to the start (tests). */
export function resetTv() {
  Object.assign(tvState, { on: false, input: 'keys', text: null, html: null, padLine: null });
  listeners.clear();
  Object.assign(tvHooks, { padUse: null, padConnect: null, padDisconnect: null });
}

/** ?tv=1 turns TV mode on for this page load only, ?tv=0 off; never saved (like ?perf). */
export function tvWanted(search, saved) {
  let v = null;
  try { v = new URLSearchParams(search).get('tv'); } catch { /* no query */ }
  return v === '1' ? true : v === '0' ? false : !!saved;
}

/**
 * Loads and stops the chunk. `load` is () => import('./tv/index.js') (main.js
 * owns that call, so this file never names the chunk); `ctx` builds what the
 * chunk needs, only when it is asked for. A load that fails (offline, a stale
 * cache) leaves the switch off and tells `onFail`.
 */
export function createTvLoader({ load, ctx, settings, onFail }) {
  let handle = null;
  let pending = null;
  let want = false;
  return {
    apply(on) {
      want = !!on;
      if (!want) {
        if (handle) { try { handle.stop(); } catch { /* leaving anyway */ } }
        handle = null;
        setTv({ on: false });
        return Promise.resolve(false);
      }
      if (handle) return Promise.resolve(true);
      if (pending) return pending;
      pending = (async () => (await load()).start(ctx()))()
        .then((h) => {
          pending = null;
          if (!want) { try { h?.stop?.(); } catch { /* gone */ } return false; }
          handle = h ?? { stop() {} };
          setTv({ on: true });
          return true;
        })
        .catch((err) => {
          pending = null;
          want = false;
          settings.set('tvMode', false);
          setTv({ on: false });
          onFail?.(err);
          return false;
        });
      return pending;
    },
  };
}

/** A window that fills a big screen: 1900+ CSS px wide and full screen (or as big as the screen). */
export function bigScreenFullscreen(win) {
  const s = win.screen;
  if (!s || !(win.innerWidth >= 1900)) return false;
  return !!win.document?.fullscreenElement || (win.innerWidth >= s.width - 2 && win.innerHeight >= s.height - 2);
}

/**
 * The offer to use TV mode: the returned check() is called when the pad is used
 * (never on a mouse or key, never on connecting). It calls onOffer() once per
 * page load, at home base with no card up, on a big full-screen window, if TV
 * mode is off and "Not now" has not been said. In a walk it waits for home.
 */
export function watchForTv({ win, settings, homeClear, onOffer }) {
  let asked = false;
  return () => {
    if (asked || tvState.on || settings.get('tvMode') || settings.get('tvOfferDeclined')) return;
    if (!bigScreenFullscreen(win) || !homeClear()) return;
    asked = true;
    onOffer();
  };
}
