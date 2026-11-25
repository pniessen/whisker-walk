// Start a fresh cat: every storage key the game writes is either the cat's (cleared by a fresh cat) or the
// device's (kept). A key that is in neither fails here, so a new key cannot slip by a reset unnoticed.
import { describe, it, expect } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import { RESET_KEYS, RESET_PATTERNS, KEPT_KEYS, NOT_KEYS, classify, resetKeysIn, FRESH_BACKUP_KEY } from '../src/ui/freshcat.js';
import { SAVE_KEY, BACKUP_KEYS } from '../src/progression.js';
import { PLAYER_KEY, SECRET_KEY, LINK_CODE_KEY, LINK_SECRET_KEY, KEY_BACKUP_KEY } from '../src/catkey.js';
import { MET_KEY } from '../src/metplayers.js';
import { CANDLES_KEY } from '../src/birthday.js';
import { REST_KEY } from '../src/redeem.js';
import { SYNCBASE_KEY } from '../src/game/catsync.js';
import { RESUME_KEY } from '../src/game/walkresume.js';
import { BUTTON_USES_KEY } from '../src/ui/buttonwords.js';
import { MEMORY_KEY } from '../src/render/adaptive.js';
import { RELOAD_KEY } from '../src/game/recovery.js';
import { NEARBY_OPTED_KEY } from '../src/game/nearby.js';
import { GUIDE_KEY } from '../src/world/roofsbirds.js';
import { BUILDER_POSE_KEY } from '../src/ui/dressingroomview.js';
import { MOMENT_SEEN_KEY } from '../src/ui/clanpicker.js';
import { memoryStorage } from './helpers/storage.js';

const FILES = globSync('src/**/*.js').map((f) => f.split('\\').join('/'));
const read = (f) => readFileSync(f, 'utf8');

// every 'whisker-walk-...' string literal in src/ (a template's ${...} part is turned into a letter so a built name still reads)
function literalKeys() {
  const found = new Map();
  for (const f of FILES) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of src.matchAll(/(['"`])(whisker-walk[-.\w${}]*)\1/g)) {
      found.set(m[2].replace(/\$\{[^}]*\}/g, 'x'), f);
    }
  }
  return found;
}

describe('start a fresh cat: the key table', () => {
  it('every storage key written anywhere in src/ is classified (reset or kept), or is a known non-key', () => {
    const unclassified = [];
    for (const [key, file] of literalKeys()) {
      if (NOT_KEYS.includes(key) || classify(key)) continue;
      unclassified.push(`${key} (${file})`);
    }
    expect(unclassified, 'a new storage key: put it in RESET_KEYS or KEPT_KEYS in src/ui/freshcat.js').toEqual([]);
  });

  it('the constants the game really uses are classified as expected', () => {
    for (const k of [SAVE_KEY, ...Object.values(BACKUP_KEYS), PLAYER_KEY, SECRET_KEY, LINK_CODE_KEY, LINK_SECRET_KEY, KEY_BACKUP_KEY, MET_KEY, CANDLES_KEY, SYNCBASE_KEY, RESUME_KEY, BUTTON_USES_KEY, GUIDE_KEY, MOMENT_SEEN_KEY, 'whisker-walk-album', 'whisker-walk-blocked']) {
      expect(classify(k), k).toBe('reset');
    }
    for (const k of [REST_KEY, MEMORY_KEY, RELOAD_KEY, NEARBY_OPTED_KEY, BUILDER_POSE_KEY, 'whisker-walk-settings', 'whisker-walk-den-tab', FRESH_BACKUP_KEY]) {
      expect(classify(k), k).toBe('kept');
    }
    // the family build's own save name, and the copies beside it
    expect(classify('whisker-walk-family-save')).toBe('reset');
    expect(classify('whisker-walk-family-save.before-merge')).toBe('reset');
  });

  it('no key is in both tables, and nothing unknown is classified', () => {
    for (const k of RESET_KEYS) expect(KEPT_KEYS, k).not.toContain(k);
    expect(classify('whisker-walk-something-new')).toBe(null);
    expect(classify('another-game-key')).toBe(null);
    expect(classify(undefined)).toBe(null);
    expect(RESET_PATTERNS.every((re) => re instanceof RegExp)).toBe(true);
  });

  it('settings and diagnostics are never reset: TV mode, edition and series switch, sound, graphics, access and couch settings sit in the settings key', () => {
    const s = read('src/settings.js');
    for (const field of ['volume', 'muted', 'reducedMotion', 'quality', 'tvMode', 'profileOverride']) expect(s).toContain(field);
    expect(classify('whisker-walk-settings')).toBe('kept');
    expect(classify('whisker-walk-adapt')).toBe('kept');
    expect(classify('whisker-walk-gl-reload')).toBe('kept');
  });

  it('resetKeysIn finds the known names and the built ones, and leaves the kept ones', () => {
    const m = new Map([['whisker-walk-save', '{}'], ['whisker-walk-player', 'x'], ['whisker-walk-settings', '{}'], ['whisker-walk-gale-moment-seen', '1'], ['other', '1'], [FRESH_BACKUP_KEY, '{}']]);
    const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
    expect(resetKeysIn(storage).sort()).toEqual(['whisker-walk-gale-moment-seen', 'whisker-walk-player', 'whisker-walk-save']);
    // a storage with no way to list keys still finds the known names
    expect(resetKeysIn(memoryStorage({ 'whisker-walk-album': 'a' }))).toEqual(['whisker-walk-album']);
  });

  it('the start-up door reads the same slot key and the same swap marker the chunk writes', () => {
    const hb = read('src/ui/homebase.js');
    expect(hb).toContain(`'${FRESH_BACKUP_KEY}'`);
    expect(hb).toContain('"role":"swap"');
    const chunk = read('src/ui/freshcat.js');
    // the slot is written role first, so the door can tell the two apart without parsing photos
    expect(chunk).toMatch(/JSON\.stringify\(\{ role, v: 1/);
  });
});
