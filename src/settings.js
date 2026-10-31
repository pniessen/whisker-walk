import { DEFAULT_ZOOM_STEP, MAX_ZOOM_STEP } from './camzoom.js';

const KEY = 'whisker-walk-settings';

const DEFAULTS = {
  volume: 0.8,
  musicVolume: 0.5,
  muted: false,
  invertY: false,
  leftHanded: false,
  reducedMotion: false,
  hideChat: false,
  perfReadout: false,
  quality: 'auto',
  // Camera zoom step (src/camzoom.js): 0 close .. 3 far, 1 is the camera the
  // game always had. Per device, like the rest of this file, never the save.
  cameraZoom: DEFAULT_ZOOM_STEP,
};

// Resolved into a render tier by src/render/quality.js (resolveQuality) —
// 'auto' starts every device on the high rung and adapts to its frame times
// (game/adaptquality.js; prefers-reduced-motion stays low), 'high'/'low'
// force a tier and turn adaptation off. Applied at walk start, so a change
// here takes effect on the next walk, not live.
const QUALITY = ['auto', 'high', 'low'];

// A whole step inside the zoom range, or the fallback. Junk (a string, a
// fraction, an out-of-range number from some future build) gives the
// fallback rather than the nearest end, so a corrupt value means today's view.
function zoomStep(v, fallback) {
  return Number.isInteger(v) && v >= 0 && v <= MAX_ZOOM_STEP ? v : fallback;
}

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
    perfReadout: typeof raw.perfReadout === 'boolean' ? raw.perfReadout : DEFAULTS.perfReadout,
    quality: clampEnum(raw.quality, QUALITY, DEFAULTS.quality),
    cameraZoom: zoomStep(raw.cameraZoom, DEFAULTS.cameraZoom),
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
      else if (key === 'cameraZoom') state = { ...state, cameraZoom: zoomStep(val, state.cameraZoom) };
      else state = { ...state, [key]: !!val };
      save();
    },
    all() {
      return { ...state };
    },
  };
}
