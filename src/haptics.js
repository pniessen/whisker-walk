// Haptics: a few small vibrations at the moments that should feel physical.
// No DOM and no three import: everything it touches is handed in, so it is
// unit-tested headless (test/haptics.test.js).
//
// Where they come from. In the iPhone app the page posts a word to the shell
// (window.webkit.messageHandlers.haptic, ios/WhiskerWalk/Haptics.swift), which
// plays it with Apple's feedback generators; iOS's web view has no
// navigator.vibrate. An iPad has the same bridge but no Taptic Engine, so the
// shell says so in its device profile (`haptics: false`) and nothing is sent.
// A browser with navigator.vibrate (Android) gets short patterns instead. In
// Safari and on desktop there is nothing to buzz and nothing happens.
//
// Kept sparse on purpose, so a buzz still means something: a light tap for a
// pounce landing, a pick-up or a tip-over; a soft double tap for a greeting;
// a success for a goal, a rank up or a golden mouse; a sharper tap for a hit
// in a clan fight, landed or taken; and the purr. Never walking, menus,
// toasts, or anything that happens every frame.
//
// Purely local: nothing here is ever sent to a co-walker, and nothing here
// touches the walk's random numbers.

export const HAPTIC_KINDS = Object.freeze(['tap', 'double', 'success', 'hit']);

// The words the Swift side knows (Haptics.swift, HapticKind). 'purr' is one
// beat of the purr; the repeating is done here, so a purr can never be left
// running in the shell when the page stops asking.
export const BRIDGE_MESSAGES = Object.freeze({ tap: 'tap', double: 'double', success: 'success', hit: 'hit', purr: 'purr' });

// navigator.vibrate patterns, in milliseconds (buzz, pause, buzz...). Android
// motors cannot do a soft tap, only a short one, so these are kept short.
export const VIBRATE_PATTERNS = Object.freeze({
  tap: 12,
  double: Object.freeze([12, 80, 12]),
  success: Object.freeze([16, 70, 16, 70, 34]),
  hit: 30,
  purr: 10,
});

// When two arrive in the same moment (a treasure that completes a goal pays
// both in one call), the stronger one plays.
const PRIORITY = Object.freeze({ tap: 1, double: 2, hit: 3, success: 4 });

export const MIN_GAP_MS = 80;     // at most one haptic this often, unless a stronger one follows
export const PURR_BEAT_MS = 420;  // one soft beat this often: a calm, breathing rhythm
export const PURR_MAX_S = 6;      // no single ask purrs longer than this, whatever it says

// Which output this page has: 'bridge', 'vibrate' or 'none'.
export function pickOutput({ bridge = null, deviceHaptics = false, vibrate = null } = {}) {
  if (bridge && typeof bridge.postMessage === 'function' && deviceHaptics === true) return 'bridge';
  if (typeof vibrate === 'function') return 'vibrate';
  return 'none';
}

// Whether anything can buzz here at all: the Vibration switch is only shown
// when it is true, so nobody is offered a switch that does nothing.
export function hapticsAvailable(opts) {
  return pickOutput(opts) !== 'none';
}

// Which haptic a paid discovery plays (discoveries.js AWARDS), or null.
// 'legend' is the rare big finds: a golden mouse, the unicorn, a legendary cat.
const BY_DISCOVERY = Object.freeze({
  treasure: 'tap', collectible: 'tap', mischief: 'tap',
  friend: 'double', boop: 'double',
  goal: 'success', jackpot: 'success', duogoal: 'success', legend: 'success',
});
export function hapticForDiscovery(type) {
  return typeof type === 'string' && Object.hasOwn(BY_DISCOVERY, type) ? BY_DISCOVERY[type] : null;
}

export function createHaptics({
  bridge = null,
  deviceHaptics = false,
  vibrate = null,
  now = () => Date.now(),
  setInterval: startTimer = (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: stopTimer = (id) => globalThis.clearInterval(id),
  // Runs once the current burst of events has been handed in, so the
  // strongest of a same-moment pair is the one played.
  defer = (fn) => queueMicrotask(fn),
  enabled = true,
} = {}) {
  const output = pickOutput({ bridge, deviceHaptics, vibrate });
  let on = enabled !== false;
  let pending = null;
  let lastAt = -Infinity;
  let lastKind = null;
  let purrTimer = null;
  let purrUntil = 0;

  function send(word) {
    try {
      if (output === 'bridge') bridge.postMessage(BRIDGE_MESSAGES[word]);
      else if (output === 'vibrate') vibrate(VIBRATE_PATTERNS[word]);
    } catch {
      // A bridge torn down or a vibrate refused: a missed buzz, nothing more.
    }
  }

  function flush() {
    const kind = pending;
    pending = null;
    if (!kind || !on) return;
    const t = now();
    if (lastKind && t - lastAt < MIN_GAP_MS && PRIORITY[kind] <= PRIORITY[lastKind]) return;
    lastAt = t;
    lastKind = kind;
    send(kind);
  }

  function play(kind) {
    if (!on || output === 'none' || !Object.hasOwn(PRIORITY, kind)) return false;
    if (pending) {
      if (PRIORITY[kind] > PRIORITY[pending]) pending = kind;
      return true;
    }
    pending = kind;
    defer(flush);
    return true;
  }

  function stopPurr() {
    if (purrTimer !== null) stopTimer(purrTimer);
    purrTimer = null;
    purrUntil = 0;
  }

  function beat() {
    if (!on || now() >= purrUntil) { stopPurr(); return; }
    // A tap or a hit that has only just played is not blurred by a beat.
    if (now() - lastAt < MIN_GAP_MS) return;
    send('purr');
  }

  // Purr for `seconds` from now, or keep an ongoing purr going that long: a
  // nap asks again for each piece of its purr, which only moves the end on.
  // It always ends by itself when the time is up, even if nothing ever says
  // stop; stopPurr ends it at once.
  function purr(seconds) {
    if (!on || output === 'none' || !(typeof seconds === 'number' && seconds > 0)) return;
    const until = now() + Math.min(seconds, PURR_MAX_S) * 1000;
    purrUntil = Math.max(purrUntil, until);
    if (purrTimer !== null) return;
    purrTimer = startTimer(beat, PURR_BEAT_MS);
    beat();
  }

  return {
    output,
    available: output !== 'none',
    play,
    purr,
    stopPurr,
    setEnabled(next) {
      on = next !== false;
      if (!on) {
        pending = null;
        stopPurr();
      }
    },
    get purring() {
      return purrTimer !== null && now() < purrUntil;
    },
  };
}
