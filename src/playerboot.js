// Imported FIRST by main.js (ES imports run in order), so a later player's scoped storage is in place before
// any module reads a save. The first player (and any device with no index) is left exactly as it was.
// See src/players.js.
import { installPlayerStorage } from './players.js';

const win = typeof window !== 'undefined' ? window : null;
export const RAW_STORAGE = (() => { try { return win ? win.localStorage : null; } catch { return null; } })();
export const PLAYER_BOOT = win ? installPlayerStorage(win) : { active: 'p1', count: 1, ok: false, supported: false };
