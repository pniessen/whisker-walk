// "Log in to my cat", milestone 2: a linked device catches up by itself.
//
// Loaded lazily by cloudsync.js, and only for a device that has a cloud link:
// a device that never linked never reaches this file. Two things happen here.
//
//   open  once after the home screen is up: ask the cloud what revision it is
//         at (a few bytes); if it moved, fetch the save, merge it with this
//         device's (src/catmerge.js) and apply the result at home.
//   push  after a walk or a buy: send this device's save with the revision it
//         was built on. If the cloud moved meanwhile the answer is 'merge':
//         the same merge runs and the result is pushed again, three times at
//         most, then it waits for the next open.
//
// A walk is never interrupted: nothing is applied unless the home screen is
// up. Offline, a timeout or any failure changes nothing and the save on the
// device is untouched. The server may not have the v11 functions yet (the
// owner runs docs/supabase-v11-cat-login.sql by hand): then cloud.peekSave /
// cloud.syncSave answer 'missing' and everything here steps aside ({ legacy:
// true }) so cloudsync.js pushes the way it always did, with at most a slow
// pull through load_save to merge what another device saved.
//
// The base: whisker-walk-syncbase keeps the cloud's revision and a small copy
// of the save as it was when both sides last agreed (catmerge.js trimBase), so
// counters can be "base plus both gains". A broken or missing base is not an
// error: the merge then takes the larger of each counter.
import { mergeSaves, trimBase, useSaveTools } from '../catmerge.js';
import { phrase } from '../clanphrases.js';
import { note } from '../diagnostics.js';

export const SYNCBASE_KEY = 'whisker-walk-syncbase';
export const CATCHUP_TIMEOUT_MS = 5000;
export const LEGACY_PULL_EVERY_MS = 6 * 60 * 60 * 1000;
const MAX_ROUNDS = 3;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function readBase(storage) {
  const empty = { rev: null, pending: false, sig: null, base: null, at: 0, pulledAt: 0 };
  try {
    const b = JSON.parse(storage.getItem(SYNCBASE_KEY));
    if (!isObj(b)) return empty;
    return {
      rev: Number.isInteger(b.rev) && b.rev >= 0 ? b.rev : null,
      pending: b.pending === true,
      sig: typeof b.sig === 'string' ? b.sig : null,
      base: isObj(b.base) ? b.base : null,
      at: finite(b.at),
      pulledAt: finite(b.pulledAt),
    };
  } catch {
    return empty;
  }
}

function writeBase(storage, b) {
  try { storage.setItem(SYNCBASE_KEY, JSON.stringify(b)); } catch (err) { note('cloud', err); }
}

// What identifies a cloud payload without a revision (a server before v11).
const sigOf = (payload) => JSON.stringify([finite(payload?.savedAt), finite(payload?.save?.lifetimePoints), finite(payload?.save?.points)]);

const timeoutAfter = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
const withTimeout = (p, ms) => Promise.race([p, timeoutAfter(ms)]);

/**
 * createCatSync({ tools, storage, getCloud, readLink, progression, compose, atHome,
 *                 toast, onApplied, setStatus, now, timeoutMs })
 *   tools           { CATALOG, sanitizeSave } from progression.js (see catmerge.js for why it is handed in)
 *   getCloud()      the cloud handle for this device's own save, or null
 *   readLink()      { code, secret } or null
 *   compose(opts)   the payload to send; { album: false } leaves the photos out
 *   atHome()        true on the home screen (never in a walk)
 *   toast(text)     the one line said after a catch-up that changed the save
 *   onApplied()     the caller re-draws what shows the save
 *   setStatus(s)    'catching' | 'saved' | 'caught' | 'offline' | 'signedout'
 * -> { open(), push(), pull() }, each -> a word: 'none' | 'saved' | 'caught' | 'offline' |
 *    'signedout' | 'deferred' | 'busy' | 'too-big' | { legacy: true, push?: true }
 */
export function createCatSync({ tools, storage, getCloud, readLink, progression, compose, atHome = () => true, toast = () => {}, onApplied = () => {}, setStatus = () => {}, now = Date.now, timeoutMs = CATCHUP_TIMEOUT_MS }) {
  useSaveTools(tools);
  const sanitizeSave = tools.sanitizeSave;
  let running = null;
  let deniedShown = false;

  const nameNow = () => {
    try { const n = progression.state.petName; return typeof n === 'string' && n ? n : null; } catch { return null; }
  };
  const done = (word) => {
    if (word === 'saved' || word === 'caught' || word === 'offline' || word === 'signedout') setStatus(word);
    return word;
  };
  const signedOut = () => {
    if (!deniedShown) { deniedShown = true; try { toast(phrase('catlogin.signedout', nameNow())); } catch (err) { note('cloud', err); } }
    return done('signedout');
  };

  // Merge a cloud payload into this device's save and apply it at home.
  // -> { ok, changed } ; ok false means nothing was applied (not at home, or the write failed).
  function mergeIn(cloudPayload, base) {
    const cloudSave = isObj(cloudPayload) && isObj(cloudPayload.save) ? cloudPayload.save : {};
    const merged = mergeSaves({
      local: progression.state, cloud: cloudSave, base: base.base, now: now(), localAt: now(), cloudAt: finite(cloudPayload?.savedAt),
    });
    if (merged.changed.local) {
      if (!atHome()) return { ok: false, changed: merged.changed };
      if (!progression.applyMerged(merged.save)) return { ok: false, changed: merged.changed };
      try { onApplied(); } catch (err) { note('cloud', err); }
    }
    return { ok: true, changed: merged.changed, cloudSave: sanitizeSave(cloudSave) };
  }

  // The one line said after a catch-up that changed the save (once per catch-up).
  const tell = () => { try { toast(phrase('catlogin.caughtup', nameNow())); } catch (err) { note('cloud', err); } };

  async function rounds(link, cloud, reason) {
    let b = readBase(storage);
    if (reason === 'push' && !b.pending) { b = { ...b, pending: true }; writeBase(storage, b); }
    let applied = false;
    const finish = (word) => {
      if (applied) tell();
      return done(applied && word === 'saved' ? 'caught' : word);
    };
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const payload = compose({ album: false });
      const baseRev = b.rev === null ? -1 : b.rev;
      const res = await withTimeout(cloud.syncSave(link.code, link.secret, baseRev, payload, finite(payload?.save?.lifetimePoints)), timeoutMs);
      switch (res.status) {
        case 'missing': return { legacy: true, push: true };
        case 'denied': return signedOut();
        case 'busy': return finish('offline');
        case 'too-big': return 'too-big';
        case 'ok':
          writeBase(storage, { rev: finite(res.rev), pending: false, sig: null, base: trimBase(payload.save), at: now(), pulledAt: now() });
          return finish('saved');
        case 'merge': {
          const m = mergeIn(res.payload, b);
          if (!m.ok) return applied ? finish('saved') : 'deferred'; // in a walk: merged at home, later
          if (m.changed.local) applied = true;
          // From here the cloud's save is the common ground: what the merge added
          // is this device's own change until the push lands.
          b = { rev: Number.isInteger(res.rev) ? res.rev : null, pending: m.changed.cloud, sig: null, base: trimBase(m.cloudSave), at: now(), pulledAt: now() };
          writeBase(storage, b);
          if (!m.changed.cloud) return finish('saved');
          break; // push the merged save against the revision just seen
        }
        default: return finish('offline');
      }
    }
    return finish('saved'); // still racing: the next open or walk end goes on
  }

  // A server before v11: no revisions. Pull what another device saved, at most
  // every six hours, merge it, and say whether the merged save must go up.
  async function legacyPull(link, cloud, force = false) {
    let b = readBase(storage);
    if (typeof cloud.loadFromCloud !== 'function') return { legacy: true, push: b.pending };
    if (!force && !b.pending && now() - b.pulledAt < LEGACY_PULL_EVERY_MS) return { legacy: true, push: false };
    const data = await withTimeout(cloud.loadFromCloud(link.code), timeoutMs);
    const payload = data?.payload;
    b = { ...b, pulledAt: now() };
    if (!isObj(payload) || !isObj(payload.save)) { writeBase(storage, b); return { legacy: true, push: b.pending }; }
    const sig = sigOf(payload);
    if (!force && sig === b.sig && !b.pending) { writeBase(storage, b); done('saved'); return { legacy: true, push: false }; }
    const m = mergeIn(payload, b);
    if (!m.ok) return 'deferred';
    writeBase(storage, { rev: null, pending: m.changed.cloud, sig, base: trimBase(m.cloudSave), at: now(), pulledAt: now() });
    if (m.changed.local) tell();
    done(m.changed.local ? 'caught' : 'saved');
    return { legacy: true, push: m.changed.cloud };
  }

  async function run(reason) {
    const link = readLink();
    const cloud = getCloud();
    if (!link || !cloud) return 'none';
    setStatus('catching');
    try {
      // 'pull' is a legacy push that was refused as stale: fetch, merge, say whether to push again
      if (reason === 'pull') return await legacyPull(link, cloud, true);
      if (typeof cloud.peekSave !== 'function' || typeof cloud.syncSave !== 'function') return reason === 'open' ? await legacyPull(link, cloud) : { legacy: true, push: true };
      if (reason === 'open') {
        const peek = await withTimeout(cloud.peekSave(link.code, link.secret), timeoutMs);
        if (peek.status === 'missing') return await legacyPull(link, cloud);
        if (peek.status === 'denied') return signedOut();
        if (peek.status !== 'ok') return done('offline');
        const b = readBase(storage);
        if (peek.rev === b.rev && !b.pending) return done('saved');
      }
      return await rounds(link, cloud, reason);
    } catch (err) {
      note('cloud', err);
      return done('offline');
    }
  }

  // One at a time: a push asked for while one is on its way is run after it.
  function single(reason) {
    const next = (running ?? Promise.resolve()).then(() => run(reason), () => run(reason));
    const mine = next.then(() => {}, () => {});
    running = mine;
    mine.then(() => { if (running === mine) running = null; });
    return next;
  }

  // The old upsert took this payload: it is now what both sides agree on.
  function pushed(payload) {
    if (!isObj(payload) || !isObj(payload.save)) return;
    const b = readBase(storage);
    writeBase(storage, { ...b, pending: false, sig: sigOf(payload), base: trimBase(payload.save), at: now() });
  }

  return { open: () => single('open'), push: () => single('push'), pull: () => single('pull'), pushed };
}
