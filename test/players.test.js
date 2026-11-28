// More than one player on one device (src/players.js): the index, the pointer, the key names, and the promise
// that a later player's writes never touch the first player's keys.
import { describe, it, expect } from 'vitest';
import {
  PLAYERS_KEY, parseIndex, readIndex, suffixOf, scopedStorage, addPlayer, setActive, installPlayerStorage, listPlayers, summarizeSave, MAX_PLAYERS,
} from '../src/players.js';
import { createProgression, SAVE_KEY, BACKUP_KEYS } from '../src/progression.js';
import { classify } from '../src/savekeys.js';
import { readCatKey, PLAYER_KEY, LINK_CODE_KEY } from '../src/catkey.js';

function store(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}
const snapshot = (s) => JSON.stringify([...s.map.entries()].sort());

describe('the index and the pointer', () => {
  it('no index, a corrupt index and a wrong shape all give the first player alone', () => {
    for (const raw of [null, undefined, '', 'not json', '{"players":5}', '[]', '7']) {
      expect(parseIndex(raw)).toEqual({ active: 'p1', players: [{ id: 'p1' }] });
    }
    expect(readIndex(store({ [PLAYERS_KEY]: '{{' }))).toEqual({ active: 'p1', players: [{ id: 'p1' }] });
  });
  it('keeps valid players in order, drops odd and repeated ids, and falls back when the active one is unknown', () => {
    const idx = parseIndex(JSON.stringify({ active: 'p9', players: [{ id: 'p2' }, { id: 'p2' }, { id: '../x' }, { id: 'p3' }, null, 4] }));
    expect(idx).toEqual({ active: 'p1', players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] });
    expect(parseIndex(JSON.stringify({ active: 'p3', players: [{ id: 'p2' }, { id: 'p3' }] })).active).toBe('p3');
  });
  it('the first player has no suffix, the others .p2, .p3', () => {
    expect(suffixOf('p1')).toBe('');
    expect(suffixOf('p2')).toBe('.p2');
    expect(suffixOf('p3')).toBe('.p3');
    expect(suffixOf('junk')).toBe('');
    expect(suffixOf(undefined)).toBe('');
  });
  it('a storage that throws reads as the first player, and adding a player fails without changing anything', () => {
    const dead = { getItem() { throw new Error('off'); }, setItem() { throw new Error('off'); } };
    expect(readIndex(dead).active).toBe('p1');
    expect(addPlayer(dead, { saveKey: SAVE_KEY }).ok).toBe(false);
    expect(setActive(dead, 'p2')).toBe(false);
    expect(readIndex(null).active).toBe('p1');
  });
});

describe('the legacy key', () => {
  it('stays whisker-walk-save, and the first player reads and writes it untouched, with no index at all', () => {
    expect(SAVE_KEY).toBe('whisker-walk-save');
    const raw = store({ [SAVE_KEY]: JSON.stringify({ version: 4, points: 12 }) });
    const win = { localStorage: raw };
    const r = installPlayerStorage(win);
    expect(r).toMatchObject({ active: 'p1', ok: true });
    expect(win.localStorage).toBe(raw); // not wrapped at all
    expect(raw.map.has(PLAYERS_KEY)).toBe(false);
    expect(createProgression(raw).state.points).toBe(12);
  });
  it('every backup key follows the player: the first player keeps the old names', () => {
    for (const k of Object.values(BACKUP_KEYS)) expect(k.startsWith(`${SAVE_KEY}.`)).toBe(true);
  });
});

describe('adding and switching', () => {
  it('New player copies the current save beside it, adds p2, makes it active, and writes nothing else of the first player', () => {
    const save = JSON.stringify({ version: 4, points: 33 });
    const raw = store({ [SAVE_KEY]: save, 'whisker-walk-settings': '{"x":1}' });
    const r = addPlayer(raw, { saveKey: SAVE_KEY });
    expect(r).toEqual({ ok: true, id: 'p2' });
    expect(raw.map.get(SAVE_KEY)).toBe(save);
    expect(raw.map.get(`${SAVE_KEY}.before-new-player`)).toBe(save);
    expect(readIndex(raw)).toEqual({ active: 'p2', players: [{ id: 'p1' }, { id: 'p2' }] });
    expect(classify(`${SAVE_KEY}.before-new-player`)).toBe('reset');
    // a third player, made from the second: the copy is of the SECOND player's save, under its own suffix
    raw.map.set(`${SAVE_KEY}.p2`, '{"version":4,"points":1}');
    expect(addPlayer(raw, { saveKey: SAVE_KEY })).toEqual({ ok: true, id: 'p3' });
    expect(raw.map.get(`${SAVE_KEY}.before-new-player.p2`)).toBe('{"version":4,"points":1}');
    expect(raw.map.get(`${SAVE_KEY}.before-new-player`)).toBe(save);
  });
  it('refuses, and changes nothing, when the copy cannot be made or the list is full', () => {
    const raw = store({ [SAVE_KEY]: '{"version":4}' });
    const failing = { ...raw, getItem: raw.getItem, removeItem: raw.removeItem, setItem(k, v) { if (k.includes('before-new-player')) throw new Error('quota'); raw.setItem(k, v); } };
    expect(addPlayer(failing, { saveKey: SAVE_KEY })).toEqual({ ok: false, error: 'nocopy' });
    expect(raw.map.has(PLAYERS_KEY)).toBe(false);
    let full = store({});
    for (let i = 1; i < MAX_PLAYERS; i++) expect(addPlayer(full, { saveKey: SAVE_KEY }).ok).toBe(true);
    const before = snapshot(full);
    expect(addPlayer(full, { saveKey: SAVE_KEY })).toEqual({ ok: false, error: 'full' });
    expect(snapshot(full)).toBe(before);
  });
  it('setActive only moves the pointer, and only to a player on the list', () => {
    const raw = store({ [SAVE_KEY]: '{"version":4}' });
    addPlayer(raw, { saveKey: SAVE_KEY });
    expect(setActive(raw, 'p1')).toBe(true);
    expect(readIndex(raw).active).toBe('p1');
    expect(setActive(raw, 'p5')).toBe(false);
    expect(readIndex(raw).active).toBe('p1');
  });
});

describe('a later player', () => {
  function secondPlayer() {
    const save = JSON.stringify({ version: 4, points: 50 });
    const raw = store({ [SAVE_KEY]: save, [PLAYER_KEY]: 'cat-one', [LINK_CODE_KEY]: 'one two three four', 'whisker-walk-settings': '{"musicVolume":0.2}' });
    addPlayer(raw, { saveKey: SAVE_KEY });
    const win = { localStorage: raw };
    const r = installPlayerStorage(win);
    return { raw, win, r, save };
  }
  it('starts virgin: 0 points, a new cat key, no cloud link; the device settings are shared', () => {
    const { win, r } = secondPlayer();
    expect(r).toMatchObject({ active: 'p2', ok: true });
    const prog = createProgression(win.localStorage);
    expect(prog.state.points).toBe(0);
    const key = readCatKey(win.localStorage);
    expect(key.id).not.toBe('cat-one');
    expect(win.localStorage.getItem(LINK_CODE_KEY)).toBeNull();
    expect(win.localStorage.getItem('whisker-walk-settings')).toBe('{"musicVolume":0.2}');
  });
  it('its writes never touch the first player: save, backups, cat key, cloud link, and the rollback slot', () => {
    const { raw, win } = secondPlayer();
    const before = new Map([...raw.map].filter(([k]) => !k.includes('.p2') && k !== PLAYERS_KEY));
    const s = win.localStorage;
    const prog = createProgression(s);
    prog.addPoints(7);
    s.setItem(`${SAVE_KEY}.bak`, 'x');
    s.setItem(BACKUP_KEYS.reset, 'y');
    s.setItem(PLAYER_KEY, 'cat-two');
    s.setItem(LINK_CODE_KEY, 'a b c d');
    s.removeItem(LINK_CODE_KEY);
    s.setItem('whisker-walk-fresh-backup', '{"role":"fresh"}');
    s.setItem('whisker-walk-album', '[]');
    for (const [k, v] of before) expect(raw.map.get(k), k).toBe(v);
    expect([...raw.map.keys()].filter((k) => !before.has(k)).every((k) => k.endsWith('.p2') || k === PLAYERS_KEY)).toBe(true);
    expect(raw.map.get(`${SAVE_KEY}.p2`)).toContain('"points":7');
    expect(raw.map.has('whisker-walk-fresh-backup')).toBe(false);
    expect(raw.map.get(`${SAVE_KEY}.p2`)).not.toBe(raw.map.get(SAVE_KEY));
  });
  it('lists only its own keys (under their plain names), so a fresh cat cannot reach another player', () => {
    const { raw, win } = secondPlayer();
    const s = win.localStorage;
    s.setItem(`${SAVE_KEY}.before-reset`, 'z');
    const names = [];
    for (let i = 0; i < s.length; i++) names.push(s.key(i));
    expect(names).toContain(`${SAVE_KEY}.before-reset`);
    expect(names).toContain('whisker-walk-settings');
    expect(names).not.toContain(PLAYER_KEY); // the first player's cat key is hidden
    expect(names.filter((k) => k === SAVE_KEY)).toEqual([]); // the first player's save is hidden
    expect(names.some((k) => k.endsWith('.p2'))).toBe(false);
    expect(raw.map.get(SAVE_KEY)).toContain('50');
  });
  it('scopedStorage with no suffix is a plain pass-through', () => {
    const raw = store({ a: '1' });
    const s = scopedStorage(raw, '');
    s.setItem(SAVE_KEY, 'q');
    expect(raw.map.get(SAVE_KEY)).toBe('q');
  });
  it('if the page cannot swap its storage, it stays on the first player and says so', () => {
    const raw = store({ [SAVE_KEY]: '{"version":4,"points":9}' });
    addPlayer(raw, { saveKey: SAVE_KEY });
    const win = Object.freeze({ localStorage: raw });
    const r = installPlayerStorage(win);
    expect(r.ok).toBe(false);
    expect(readIndex(raw).active).toBe('p1');
    expect(installPlayerStorage({ get localStorage() { throw new Error('denied'); } }).ok).toBe(false);
  });
});

describe('the list', () => {
  it('names a player by their cat (custom name first, else the cat in the catalog), or Player N', () => {
    const raw = store({
      [SAVE_KEY]: JSON.stringify({ equipped: { cat: 'tabby', custom: 'mine1' }, customCats: [{ id: 'mine1', name: 'Pepper' }], points: 40 }),
      [`${SAVE_KEY}.p2`]: JSON.stringify({ equipped: { cat: 'siamese', custom: null }, points: 3 }),
    });
    addPlayer(store(), { saveKey: SAVE_KEY });
    raw.map.set(PLAYERS_KEY, JSON.stringify({ v: 1, active: 'p2', players: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] }));
    const list = listPlayers(raw, { saveKey: SAVE_KEY, nameOf: (id) => ({ siamese: 'Siamese' })[id] });
    expect(list.map((p) => [p.id, p.label, p.points, p.active])).toEqual([
      ['p1', 'Pepper', 40, false], ['p2', 'Siamese', 3, true], ['p3', 'Player 3', 0, false],
    ]);
    expect(summarizeSave('garbage')).toEqual({ name: null, points: 0 });
  });
});
