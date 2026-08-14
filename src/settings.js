const KEY = 'whisker-walk-settings';

const DEFAULTS = {
  volume: 0.8,
  musicVolume: 0.5,
  muted: false,
  invertY: false,
  leftHanded: false,
  reducedMotion: false,
  hideChat: false,
  quality: 'auto',
};

// Resolved into a render tier by src/render/quality.js (resolveQuality) —
// 'auto' defers to device signals (coarse pointer / prefers-reduced-motion),
// 'high'/'low' force a tier. Applied at walk start, so a change here takes
// effect on the next walk, not live.
const QUALITY = ['auto', 'high', 'low'];

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function clampVolume(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function clampEnum(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}

// Same "sanitize on the way in" shape as album.js/progression.js: a
// corrupt/foreign payload (or one from an older/newer save format) never
// reaches live state — every field is individually type-checked against
// DEFAULTS, so a partial or malformed object still yields a fully-populated,
// safe settings object rather than throwing or storing garbage.
function sanitize(raw) {
  if (!isPlainObject(raw)) return { ...DEFAULTS };
  return {
    volume: clampVolume(raw.volume, DEFAULTS.volume),
    musicVolume: clampVolume(raw.musicVolume, DEFAULTS.musicVolume),
    muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULTS.muted,
    invertY: typeof raw.invertY === 'boolean' ? raw.invertY : DEFAULTS.invertY,
    leftHanded: typeof raw.leftHanded === 'boolean' ? raw.leftHanded : DEFAULTS.leftHanded,
    reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : DEFAULTS.reducedMotion,
    hideChat: typeof raw.hideChat === 'boolean' ? raw.hideChat : DEFAULTS.hideChat,
    quality: clampEnum(raw.quality, QUALITY, DEFAULTS.quality),
  };
}

function load(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return sanitize(JSON.parse(raw));
  } catch (err) {
    console.warn('Whisker Walk: could not read settings, using defaults', err);
    return { ...DEFAULTS };
  }
}

// storage: any localStorage-shaped object ({ getItem, setItem }) — mirrors
// createProgression(storage)/createAlbum(storage) so main.js wires this up
// the same way (window.localStorage in the browser, a fake in tests).
export function createSettings(storage) {
  let state = load(storage);

  function save() {
    try {
      storage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Whisker Walk: could not save settings', err);
    }
  }

  return {
    get(key) {
      return state[key];
    },
    // Unknown keys are silently ignored rather than polluting the persisted
    // object — settings.js is the only writer, so any real key always comes
    // from DEFAULTS.
    set(key, val) {
      if (!(key in DEFAULTS)) return;
      if (key === 'volume') state = { ...state, volume: clampVolume(val, state.volume) };
      else if (key === 'musicVolume') state = { ...state, musicVolume: clampVolume(val, state.musicVolume) };
      else if (key === 'quality') state = { ...state, quality: clampEnum(val, QUALITY, state.quality) };
      else state = { ...state, [key]: !!val };
      save();
    },
    all() {
      return { ...state };
    },
  };
}
