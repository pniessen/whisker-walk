// The one table of which storage keys are the cat's (per player, cleared by a fresh cat) and which are the
// device's (kept). Pure and tiny: it moved out of src/ui/freshcat.js so the start-up code that keeps one
// save per player (src/players.js) can use it without loading the fresh-cat screen. freshcat.js re-exports it.

export const PLAYERS_KEY = 'whisker-walk-players';
export const FRESH_BACKUP_KEY = 'whisker-walk-fresh-backup';
// The save (and the copies progression.js keeps beside it) under both build's names.
export const SAVE_KEYS = ['whisker-walk-save', 'whisker-walk-family-save'];
const SAVE_SUFFIXES = ['', '.bak', '.before-cloud', '.before-reset', '.before-restore', '.before-merge', '.before-new-player'];

/** Reset: the cat's own things, cleared by a fresh cat and brought back by Bring back my old cat. */
export const RESET_KEYS = Object.freeze([
  ...SAVE_KEYS.flatMap((k) => SAVE_SUFFIXES.map((s) => k + s)),
  // the cat key and the cloud link (src/catkey.js): the four values and the kept copy of them
  'whisker-walk-player', 'whisker-walk-secret', 'whisker-walk-cloudcode', 'whisker-walk-cloudsecret', 'whisker-walk-key.before-cloud',
  'whisker-walk-syncbase', // the catch-up's base: it belongs to the link
  'whisker-walk-album', // photos
  'whisker-walk-met', 'whisker-walk-blocked', // the players she met and hid
  'whisker-walk-resume', // a walk left half way
  'whisker-walk-bday-candles', 'whisker-walk-bday-song', 'whisker-walk-den-day', // once-a-day things
  'whisker-walk-roofs-guide', 'whisker-walk-buttons', // first-time guides, and which button words she has learned
]);
/** Reset too, named from the word set the page was built with (src/ui/clanpicker.js): the first-time clan card. */
export const RESET_PATTERNS = Object.freeze([/^whisker-walk-[a-z]+-moment-seen$/]);

/** Kept: the device's own settings and diagnostics, and the rollback slot itself. */
export const KEPT_KEYS = Object.freeze([
  'whisker-walk-settings', // sound, TV mode, edition and series switch, graphics, accessibility, couch: all per device
  'whisker-walk-adapt', // what this device's graphics learned about itself
  'whisker-walk-gl-reload', // the graphics-recovery reload guard (diagnostics)
  'whisker-walk-nearby-opted', // this device's choice about looking for rooms on the local network
  'whisker-walk-family-words', // the key that opens the family's words on this device (src/serieskey.js): a fresh cat must not ask for the code again
  'whisker-walk-redeem-rest', // the guessing rest of the code box: a fresh cat must not skip it
  'whisker-walk-crash-log', // the device's sanitised crash log (src/crashlog.js): about the device, not the cat
  'whisker-walk-perf-log', // the device's performance log (src/perflog.js): numbers about the device, not the cat
  'whisker-walk-perf-upload', // this install's random performance-report token and the day of its last summary (src/perfupload.js): not derived from the cat
  'whisker-walk-coop', // couch co-op settings (follow, pads) are per device, like the TV mode
  'whisker-walk-den-tab', 'whisker-walk-builder-pose', // how this screen was last left (a tab, a pose)
  PLAYERS_KEY, // the list of players on this device and which one is playing (src/players.js)
  FRESH_BACKUP_KEY, // the rollback slot
]);
/** Strings in src/ that look like keys but are not storage keys (a hashing salt, the vault's authenticated text). */
export const NOT_KEYS = Object.freeze(['whisker-walk-redeem-v1', 'whisker-walk-series-v1']);

/** 'reset' | 'kept' | null (null: not classified, which test/freshcat.keys.test.js refuses). */
export function classify(key) {
  if (typeof key !== 'string') return null;
  if (KEPT_KEYS.includes(key)) return 'kept';
  if (RESET_KEYS.includes(key) || RESET_PATTERNS.some((re) => re.test(key))) return 'reset';
  return null;
}

/** Every reset key this storage holds (the known names, and any other that matches a pattern). */
export function resetKeysIn(storage) {
  const out = new Set();
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const k = storage.key(i);
      if (typeof k === 'string' && classify(k) === 'reset') out.add(k);
    }
  } catch { /* a storage that cannot be listed: the known names still go */ }
  for (const k of RESET_KEYS) {
    try { if (storage.getItem(k) !== null) out.add(k); } catch { /* skip */ }
  }
  return [...out];
}

