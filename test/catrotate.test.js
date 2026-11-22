// Cat login M3: a new cat code is 4 words; "Change my cat code" moves the cat to a fresh
// code and secret. A fake cloud and fake storage; nothing here can reach a network.
import { describe, it, expect } from 'vitest';
import { createCloud } from '../src/cloud.js';
import { createCloudSync } from '../src/game/cloudsync.js';
import { createProgression } from '../src/progression.js';
import { CAT_WORDS } from '../src/catcodes.js';
import { memoryStorage } from './helpers/storage.js';

const ID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OLD_CODE = 'PLUM-OTTER-CROW-42';
const OLD_SECRET = 'row-secret-of-the-cat-0001';
const NEW_SHAPE = /^[A-Z]{3,6}(-[A-Z]{3,6}){3}$/;

describe('cloud.rotateCatCode', () => {
  const mk = (rpc) => createCloud({ rpc, select: async () => [] });
  it('sends the old code and secret and the new ones, and gives back one word', async () => {
    const calls = [];
    const cloud = mk(async (name, args) => { calls.push([name, args]); return 'ok'; });
    expect(await cloud.rotateCatCode('A-B-C-D', 's1', 'E-F-G-H', 's2')).toBe('ok');
    expect(calls).toEqual([['rotate_cat_code', { p_code: 'A-B-C-D', p_secret: 's1', p_new_code: 'E-F-G-H', p_new_secret: 's2' }]]);
  });
  it('passes the server words on and calls anything else bad', async () => {
    for (const w of ['ok', 'denied', 'busy', 'bad']) expect(await mk(async () => w).rotateCatCode('a', 'b', 'c', 'd')).toBe(w);
    expect(await mk(async () => 'surprise').rotateCatCode('a', 'b', 'c', 'd')).toBe('bad');
    expect(await mk(async () => null).rotateCatCode('a', 'b', 'c', 'd')).toBe('bad');
  });
  it("says 'unavailable' when the server does not have the function yet, and 'offline' when there is no answer", async () => {
    expect(await mk(async () => { throw { code: 'PGRST202' }; }).rotateCatCode('a', 'b', 'c', 'd')).toBe('unavailable');
    expect(await mk(async () => { throw new Error('network'); }).rotateCatCode('a', 'b', 'c', 'd')).toBe('offline');
  });
});

// A one-table server with the rules the SQL has: the code and the secret are both checked.
function server() {
  const rows = new Map();
  const api = {
    rows,
    refuse: null, // set to a word to make rotate refuse
    cloud: (counts = {}) => ({
      saveToCloud: async (code, secret, payload) => {
        counts.save = (counts.save ?? 0) + 1;
        if (api.newShapeRefused && !/^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$/.test(code)) return 'bad';
        const r = rows.get(code);
        if (!r) { rows.set(code, { secret, payload, rev: 0 }); return 'created'; }
        return r.secret === secret ? 'updated' : 'denied';
      },
      loadFromCloud: async (code) => (rows.get(code) ? { payload: rows.get(code).payload, secret: rows.get(code).secret } : null),
      peekSave: async (code, secret) => {
        const r = rows.get(code);
        if (!r) return { status: 'none' };
        return r.secret === secret ? { status: 'ok', rev: r.rev } : { status: 'denied' };
      },
      syncSave: async (code, secret, baseRev, payload) => {
        const r = rows.get(code);
        if (!r) return { status: 'none' };
        if (r.secret !== secret) return { status: 'denied' };
        if (baseRev !== r.rev) return { status: 'merge', rev: r.rev, payload: r.payload };
        r.payload = payload; r.rev += 1;
        return { status: 'ok', rev: r.rev };
      },
      rotateCatCode: async (code, secret, newCode, newSecret) => {
        counts.rotate = (counts.rotate ?? 0) + 1;
        if (api.refuse) return api.refuse;
        const r = rows.get(code);
        if (!r || r.secret !== secret) return 'denied';
        rows.set(newCode, { secret: newSecret, payload: r.payload, rev: r.rev + 1 });
        rows.set(code, { secret: `moved-${newSecret}`, payload: {}, rev: r.rev + 1 }); // the old code stays, with a secret nobody has
        return 'ok';
      },
    }),
  };
  return api;
}

function device(srv, { code = OLD_CODE, secret = OLD_SECRET, psecret = OLD_SECRET, failKeys = [], toasts = [] } = {}) {
  const raw = memoryStorage({}, { removeItem: true });
  raw.setItem('whisker-walk-player', ID);
  raw.setItem('whisker-walk-secret', psecret);
  if (code) { raw.setItem('whisker-walk-cloudcode', code); raw.setItem('whisker-walk-cloudsecret', secret); }
  const fail = { keys: failKeys };
  const storage = {
    getItem: (k) => raw.getItem(k),
    removeItem: (k) => { if (fail.keys.includes(k)) throw new Error('quota'); raw.removeItem(k); },
    setItem: (k, v) => { if (fail.keys.includes(k)) throw new Error('quota'); raw.setItem(k, v); },
  };
  const progression = createProgression(storage);
  progression.setPetName('Pickle');
  const counts = {};
  const cs = createCloudSync({
    MP: true, supabaseUrl: 'u', supabaseAnonKey: 'k', storage, progression, cloudToast: (t) => toasts.push(t), pid: ID,
    album: { serialize: () => ({ version: 1, photos: [] }), replaceFromPayload() {} },
    makeCloud: () => srv.cloud(counts),
  });
  return { ...cs, raw, storage, fail, progression, counts, toasts };
}

describe('a new cat code', () => {
  it('Keep my cat safe makes a code of four words from the list', async () => {
    const srv = server();
    const d = device(srv, { code: null });
    const res = await d.sync.saveToCloud();
    expect(res.ok).toBe(true);
    expect(res.code).toMatch(NEW_SHAPE);
    for (const w of res.code.split('-')) expect(CAT_WORDS).toContain(w);
    expect(d.sync.getCode()).toBe(res.code);
  });
  it('a server that has not had the new step still gets a code it accepts (the old shape), asked once more and then remembered', async () => {
    const srv = server();
    srv.newShapeRefused = true;
    const d = device(srv, { code: null });
    const res = await d.sync.saveToCloud();
    expect(res.ok).toBe(true);
    expect(res.code).toMatch(/^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$/);
    expect(d.counts.save).toBe(2); // the new shape first, then the old
    const before = d.counts.save;
    d.sync.unlink();
    await d.sync.saveToCloud();
    expect(d.counts.save - before).toBe(1); // it is not asked again this session
  });
});

describe('Change my cat code', () => {
  it('moves the cat: a new four-word code and a new secret, kept as the link and as the cat key together', async () => {
    const srv = server();
    srv.rows.set(OLD_CODE, { secret: OLD_SECRET, payload: { save: {} }, rev: 3 });
    const d = device(srv);
    const res = await d.sync.changeCode();
    expect(res.ok).toBe(true);
    expect(res.code).toMatch(NEW_SHAPE);
    expect(d.sync.getCode()).toBe(res.code);
    const row = srv.rows.get(res.code);
    expect(d.raw.getItem('whisker-walk-cloudsecret')).toBe(row.secret);
    expect(d.raw.getItem('whisker-walk-secret')).toBe(row.secret); // the cat key follows, so the profile and colony still answer
    expect(row.secret).not.toBe(OLD_SECRET);
    expect(row.secret.length).toBeGreaterThanOrEqual(16);
    expect(d.getPsecret()).toBe(row.secret); // read again, not remembered
    expect(d.raw.getItem('whisker-walk-player')).toBe(ID); // the cat is the same cat
  });
  it('leaves the cat key alone when the device secret was never the row secret (an older link)', async () => {
    const srv = server();
    srv.rows.set(OLD_CODE, { secret: OLD_SECRET, payload: { save: {} }, rev: 0 });
    const d = device(srv, { psecret: 'some-other-secret-1234567' });
    const res = await d.sync.changeCode();
    expect(res.ok).toBe(true);
    expect(d.raw.getItem('whisker-walk-secret')).toBe('some-other-secret-1234567');
    expect(d.raw.getItem('whisker-walk-cloudsecret')).toBe(srv.rows.get(res.code).secret);
  });
  it('sends nothing for a device that is not linked', async () => {
    const srv = server();
    const d = device(srv, { code: null });
    const res = await d.sync.changeCode();
    expect(res.ok).toBe(false);
    expect(d.counts.rotate).toBeUndefined();
  });
  it('on denied, busy, bad, no function yet, or no answer: kid words, and every stored value as it was', async () => {
    for (const [word, text] of [['denied', /didn.t work/i], ['busy', /try again/i], ['bad', /didn.t work/i], ['unavailable', /not ready/i]]) {
      const srv = server();
      srv.rows.set(OLD_CODE, { secret: OLD_SECRET, payload: {}, rev: 0 });
      srv.refuse = word;
      const d = device(srv);
      const res = await d.sync.changeCode();
      expect(res.ok, word).toBe(false);
      expect(res.error, word).toMatch(text);
      expect(d.raw.getItem('whisker-walk-cloudcode'), word).toBe(OLD_CODE);
      expect(d.raw.getItem('whisker-walk-cloudsecret'), word).toBe(OLD_SECRET);
      expect(d.raw.getItem('whisker-walk-secret'), word).toBe(OLD_SECRET);
    }
    const d = device(server());
    d.counts.x = 1;
    const srv = server();
    srv.cloud = () => ({ rotateCatCode: async () => 'offline' });
    const off = device(srv);
    const res = await off.sync.changeCode();
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/internet|connect/i);
    expect(off.raw.getItem('whisker-walk-cloudcode')).toBe(OLD_CODE);
  });
  it('never shows a code, a secret or an id in what it says', async () => {
    const srv = server();
    srv.refuse = 'denied';
    const d = device(srv);
    const res = await d.sync.changeCode();
    const said = JSON.stringify(res);
    for (const s of [OLD_CODE, OLD_SECRET, ID]) expect(said).not.toContain(s);
  });
  it('if the new code cannot be kept on this device after the server moved it, the answer still hands the code over so it can be written down', async () => {
    const srv = server();
    srv.rows.set(OLD_CODE, { secret: OLD_SECRET, payload: {}, rev: 0 });
    const d = device(srv, { failKeys: ['whisker-walk-cloudcode'] });
    const res = await d.sync.changeCode();
    expect(res.ok).toBe(true);
    expect(res.notKept).toBe(true);
    expect(res.code).toMatch(NEW_SHAPE);
    expect(d.raw.getItem('whisker-walk-cloudcode')).toBe(OLD_CODE); // all four put back together
    expect(d.raw.getItem('whisker-walk-secret')).toBe(OLD_SECRET);
  });
  it('another device on the old code is signed out at its next catch-up: one line, and it keeps playing on its own save', async () => {
    const srv = server();
    srv.rows.set(OLD_CODE, { secret: OLD_SECRET, payload: { save: {} }, rev: 0 });
    const a = device(srv);
    const toasts = [];
    const b = device(srv, { toasts });
    b.progression.state.points = 77;
    await a.sync.changeCode();
    expect(await b.sync.catchUp()).toBe('signedout');
    expect(await b.sync.catchUp()).toBe('signedout');
    expect(toasts.filter((t) => /new cat code/i.test(t))).toHaveLength(1);
    expect(b.progression.state.points).toBe(77);
    expect(b.sync.catStatus().state).toBe('signedout');
  });
});
