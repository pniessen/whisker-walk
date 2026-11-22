// Cloud save wiring, lifted out of main.js's init() closure.
//
// Two things live here that used to sit at main.js module scope:
//   * the lazy capability handles (getPsecret / getCloud) every cloud-touching
//     call site goes through, and
//   * the `sync` object the home base's Sync ☁️ panel drives.
//
// Both are created by one factory so the "created lazily, only when MP" rule
// is enforced in exactly one place — see the comments on each below.

import { createLiveCloud, normalizeSaveCode, getOrCreateSecret } from '../cloud.js';
import { summarizeSaveForPreview, sanitizeSave, CATALOG } from '../progression.js';
import { note } from '../diagnostics.js';
import { toastLifeMs } from '../ui/toastlife.js';
import { isPlayerId } from '../colony.js';
import { snapshotKeyState, applyKeyState, backUpCatKey, catKeyFromPayload } from '../catkey.js';
import { phrase } from '../clanphrases.js';

// A toast surface that stays visible on the home base screen (unlike
// #hud, which is display:none whenever no walk is in progress) — cloud
// sync results (stale/denied) need to reach the player there too. It stays
// as long as its words need (toastLifeMs); a tap holds it for a fresh spell,
// a second tap lets it go. The container is a polite live region (index.html).
export const CLOUD_TOAST_FADE_MS = 800;
// The same words while they are already up are not stacked a second time (a
// repeat tap that fails the same way says the same line once).
export function createCloudToast(container) {
  const up = new Set();
  return function cloudToast(text) {
    if (up.has(text)) return;
    up.add(text);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    container.appendChild(el);
    let fadeTimer = null;
    let held = false;
    const go = () => {
      clearTimeout(fadeTimer);
      el.classList.add('fade');
      setTimeout(() => { el.remove(); up.delete(text); }, CLOUD_TOAST_FADE_MS);
    };
    const live = () => { clearTimeout(fadeTimer); fadeTimer = setTimeout(go, toastLifeMs(text)); };
    el.addEventListener?.('click', () => { if (held) go(); else { held = true; live(); } });
    live();
  };
}

// ── Cloud save sync ────────────────────────────────────────────────
// A linked device stores its save-code + that ROW's secret locally.
// The row secret is NOT the player secret (psecret): psecret only ever
// authorizes profile/friendship writes (Task 3) and, once, seeds a
// freshly-created row's secret — after that the row's own returned
// secret (from create or a later load) is what future writes must use.
const CLOUD_CODE_KEY = 'whisker-walk-cloudcode';
const CLOUD_SECRET_KEY = 'whisker-walk-cloudsecret';

// What the player reads when the cloud won't take a save. 'too-big' and
// 'busy' come from the v8 upsert_save (docs/supabase-v8-hardening.sql);
// 'too-big' is also what cloud.saveToCloud answers on its own when the save
// is over the limit, so this works before the owner runs that SQL. The save
// itself is always still on the device.
const TOO_BIG_MESSAGE = "This save is too big for the cloud. It's still safe on this device.";
const BUSY_MESSAGE = 'The cloud is busy right now — try again later.';

// Has this device been deliberately put online? (2026-11-16) True once a
// walking name is saved in Play together (that is what publishes a cat
// profile, and Host, Join, friend codes and colony sharing all need it), or
// once the device is linked to a cloud save (Save to cloud, or Load from
// cloud confirmed). Both are things somebody tapped; nothing sets either on
// its own. Until then the game stays off the network: see onlineAllowed in
// createCloudSync, the only place this is asked.
//
// The name test is "any saved name", the same test rooms.pushProfileNow has
// always used, so no device that publishes a profile today reads as offline.
export function onlineOptedIn({ petName = null, cloudLinked = false } = {}) {
  return cloudLinked === true || walkingNameSaved({ petName });
}

// The narrower question (2026-11-17): is a walking name saved? Everything
// that is about other players needs one: the friends lookup, cat profiles,
// greets, friend codes, the colony, rooms. A device that is only linked to a
// cloud save has no walking name, so it talks to the database about its save
// and about nothing else. See togetherAllowed in createCloudSync.
export function walkingNameSaved({ petName = null } = {}) {
  return typeof petName === 'string' && petName.length > 0;
}

// makeCloud is injectable for tests; the game always uses createLiveCloud.
const SOCIAL_MAX = 500; // ids per list; the same cap the met list keeps
function idList(list) {
  try { return (list?.all?.() ?? []).filter(isPlayerId).slice(0, SOCIAL_MAX); } catch { return []; }
}
function addIds(list, ids) {
  if (!list || !Array.isArray(ids)) return;
  try {
    let n = idList(list).length;
    for (const id of ids) {
      if (n >= SOCIAL_MAX) break;
      if (isPlayerId(id) && !list.has(id)) { list.add(id); n += 1; }
    }
  } catch { /* a list that cannot be written to just stays as it is */ }
}
// pid, met and blocked are optional (cat login, milestone 1): this device's cat
// id and its two lists of other players' ids. Without them the payload is as it
// was before and a load keeps whatever cat key the device has.
// atHome, onCatStatus and onApplied are optional (cat login, milestone 2): whether the
// home screen is up (a catch-up never changes the save in a walk), and what to
// do when the catch-up's state changes or its merge was applied.
export function createCloudSync({ MP, supabaseUrl, supabaseAnonKey, storage, progression, album, cloudToast, makeCloud = createLiveCloud, pid = null, met = null, blocked = null, atHome = () => true, onCatStatus = () => {}, onApplied = () => {}, loadCatSync = () => import('./catsync.js') }) {
  // the capability secret that authorizes profile/friendship writes (and, for
  // a freshly-created save row, doubles as that row's initial secret) —
  // memoized lazily via getPsecret() below, on first actual use, rather than
  // at module scope: every call site that needs it is already downstream of
  // an MP check (getCloud() returns null when !MP), so an unconfigured (solo)
  // deploy should never generate-and-persist a secret it will never use.
  let psecretCache = null;
  function getPsecret() {
    if (!MP) return null;
    if (!psecretCache) psecretCache = getOrCreateSecret(storage);
    return psecretCache;
  }

  // cloud RPC client — created lazily (only once actually needed, and only
  // when MP) rather than at module scope, so an unconfigured deploy never
  // even attempts the dynamic supabase-js import.
  //
  // openCloud() is the UNGATED handle. It is only for a tap that is itself
  // the choice to go online or to clean up online: Save to cloud, Load from
  // cloud (both below) and Delete my online data (game/onlinedelete.js).
  // Everything else asks getCloud().
  let cloudInstance = null;
  function openCloud() {
    if (!MP) return null;
    if (!cloudInstance) {
      // getPsecret lets friendship reads go through the v8 friendships_of RPC
      cloudInstance = makeCloud(supabaseUrl, supabaseAnonKey, { getSecret: getPsecret });
    }
    return cloudInstance;
  }

  // The one answer to "may this device talk to the online database at all,
  // or look for players nearby, without being asked to right now?"
  // (2026-11-16). See onlineOptedIn above for the rule. Read from the save
  // and the cloud link every time, so saving a walking name or linking a save
  // turns it on at once, and Delete my online data (which clears the name and
  // the link) turns it off again.
  function savedName() {
    try { return progression.state.petName; } catch { return null; }
  }
  function onlineAllowed() {
    if (!MP) return false;
    return onlineOptedIn({ petName: savedName(), cloudLinked: readCloudLink() !== null });
  }

  // The narrower answer (2026-11-17): "may this device do the things that are
  // about other players?" Only with a walking name saved; a linked cloud save
  // alone is not enough. Rooms and the Player pets list ask this directly.
  function togetherAllowed() {
    if (!MP) return false;
    return walkingNameSaved({ petName: savedName() });
  }

  // The GATED handle every background path outside this file uses (the
  // walk-start friends lookup, the Player pets list, profile pushes, greets,
  // friend codes, the colony): null, so no client and no request, until
  // togetherAllowed(). All of those are about other players, so all of them
  // wait for a walking name.
  function getCloud() {
    return togetherAllowed() ? openCloud() : null;
  }

  // The handle for this device's own cloud save, used only inside this file
  // (the auto-save after a walk, Sync now, deleting the linked save): there
  // once the device is online at all. Each caller has already checked the
  // link, so on a device with no walking name this is reached only with one.
  function saveCloud() {
    return onlineAllowed() ? openCloud() : null;
  }

  function readCloudLink() {
    try {
      const code = storage.getItem(CLOUD_CODE_KEY);
      const secret = storage.getItem(CLOUD_SECRET_KEY);
      return code && secret ? { code, secret } : null;
    } catch {
      return null;
    }
  }
  function writeCloudLink(code, secret) {
    try {
      storage.setItem(CLOUD_CODE_KEY, code);
      storage.setItem(CLOUD_SECRET_KEY, secret);
    } catch (err) {
      console.warn('Whisker Walk: could not persist cloud link', err);
      note('cloud', err);
    }
  }
  function clearCloudLink() {
    try {
      storage.removeItem(CLOUD_CODE_KEY);
      storage.removeItem(CLOUD_SECRET_KEY);
    } catch (err) {
      console.warn('Whisker Walk: could not clear cloud link', err);
      note('cloud', err);
    }
  }
  // deep-cloned snapshot: composed once per RPC call so an in-flight
  // fire-and-forget send can't pick up a further mutation mid-flight.
  function composeCloudPayload({ album: withAlbum = true } = {}) {
    // savedAt says which side was saved later, for a choice both devices changed.
    // The photos go up with a plain save; a catch-up leaves them where they are.
    const payload = { save: progression.state, savedAt: Date.now() };
    if (withAlbum) payload.album = album.serialize();
    // Which cat this is, so a device that loads the save can become that cat
    // (src/catkey.js). Ids only, never the secret: that comes with the row.
    if (isPlayerId(pid)) payload.cat = { id: pid };
    if (met || blocked) payload.social = { met: idList(met), blocked: idList(blocked) };
    return JSON.parse(JSON.stringify(payload));
  }
  // 'denied' means this code/secret pair no longer authorizes writes
  // (e.g. re-linked elsewhere) — surfaced once per link, not on every
  // subsequent auto-sync, so it doesn't spam a toast after every walk.
  let deniedNotified = false;

  // The catch-up (src/game/catsync.js): a lazy chunk, fetched only by a device
  // that has a cloud link, and only when a catch-up is asked for.
  let catState = null; // 'catching' | 'saved' | 'caught' | 'offline' | 'signedout' | null
  let catLoad = null;
  function runCat(kind) {
    catLoad ??= loadCatSync().then((m) => m.createCatSync({
      tools: { CATALOG, sanitizeSave }, storage, getCloud: saveCloud, readLink: readCloudLink, progression,
      compose: composeCloudPayload, atHome, toast: cloudToast, onApplied,
      setStatus: (s) => { catState = s; try { onCatStatus(s); } catch { /* the sheet is only a view */ } },
    }));
    return catLoad.then((cs) => cs[kind]());
  }

  async function runSync(retried = false) {
    const link = readCloudLink();
    if (!link) return { ok: false, message: 'Not linked to a cloud save.' };
    const cloud = saveCloud();
    if (!cloud) return { ok: false, message: 'Cloud sync is not available.' };
    try {
      const payload = composeCloudPayload();
      const result = await cloud.saveToCloud(link.code, link.secret, payload, payload.save.lifetimePoints ?? 0);
      if (result === 'created' || result === 'updated') {
        deniedNotified = false;
        if (catLoad) catLoad.then((cs) => cs.pushed(payload)).catch(() => {}); // the catch-up's base moves with it
        return { ok: true, message: 'Synced ✓' };
      }
      if (result === 'stale') {
        // Another device saved first: fetch it, merge, and send once more.
        if (!retried) {
          const pulled = await runCat('pull').catch(() => null);
          if (pulled && pulled.legacy && pulled.push) return runSync(true);
          if (pulled && pulled.legacy && pulled.push === false) return { ok: true, message: 'Synced ✓' };
        }
        cloudToast('The cloud has newer progress. Open Cloud save.');
        return { ok: false, message: 'Cloud has newer progress than this device — use Load from cloud to pull it down.' };
      }
      if (result === 'denied') {
        if (!deniedNotified) {
          cloudToast('Cloud save didn’t work. Open Cloud save.');
          deniedNotified = true;
        }
        return { ok: false, message: 'Sync denied — this code may be linked elsewhere. Unlink and save a new code.' };
      }
      if (result === 'too-big') return { ok: false, message: TOO_BIG_MESSAGE };
      if (result === 'busy') return { ok: false, message: BUSY_MESSAGE };
      return { ok: false, message: 'Unexpected sync result.' };
    } catch (err) {
      console.warn('Whisker Walk: cloud sync failed', err);
      note('cloud', err);
      return { ok: false, message: 'Could not reach the cloud — check your connection and try again.' };
    }
  }

  const sync = {
    available: MP,
    getCode() {
      return readCloudLink()?.code ?? null;
    },
    // unlinked "Save to cloud": generate a fresh code, upload under it,
    // and — since this is a brand-new row — seed its secret with the
    // player's own psecret (the row's secret then becomes the thing
    // future writes must present, not psecret itself).
    async saveToCloud() {
      const cloud = openCloud(); // the tap that opts in
      if (!cloud) return { ok: false, error: 'Cloud sync is not available.' };
      try {
        // the word list is its own file, fetched by this tap (src/savecode.js)
        const code = (await import('../savecode.js')).generateSaveCode();
        const payload = composeCloudPayload();
        const secret = getPsecret();
        const result = await cloud.saveToCloud(code, secret, payload, payload.save.lifetimePoints ?? 0);
        if (result === 'too-big') return { ok: false, error: TOO_BIG_MESSAGE };
        if (result === 'busy') return { ok: false, error: BUSY_MESSAGE };
        if (result !== 'created') {
          return { ok: false, error: 'That code was already taken — please try again.' };
        }
        writeCloudLink(code, secret);
        deniedNotified = false;
        return { ok: true, code };
      } catch (err) {
        console.warn('Whisker Walk: saveToCloud failed', err);
        note('cloud', err);
        return { ok: false, error: 'Could not reach the cloud — check your connection and try again.' };
      }
    },
    // "Load from cloud" step 1: fetch + build a local-vs-cloud comparison
    // for the confirm-overwrite card. Nothing is written yet.
    async previewLoad(rawCode) {
      const cloud = openCloud(); // a typed code and a tap: deliberate
      if (!cloud) return { ok: false, error: 'Cloud sync is not available.' };
      const code = normalizeSaveCode(rawCode);
      if (!code) return { ok: false, error: 'Enter a save code first.' };
      try {
        const data = await cloud.loadFromCloud(code);
        if (!data || !data.payload || !data.payload.save) {
          return { ok: false, error: 'No save found for that code.' };
        }
        const localSave = progression.state;
        const cloudSave = data.payload.save;
        // cloudSave is untrusted (read straight back from the `saves` table
        // with no server-side shape check) — summarizeSaveForPreview coerces
        // every numeric field before it ever reaches the preview card.
        return {
          ok: true,
          preview: {
            code, secret: data.secret, payload: data.payload,
            local: summarizeSaveForPreview(localSave), cloud: summarizeSaveForPreview(cloudSave),
          },
        };
      } catch (err) {
        console.warn('Whisker Walk: loadFromCloud failed', err);
        note('cloud', err);
        return { ok: false, error: 'Could not reach the cloud — check your connection and try again.' };
      }
    },
    // "Load from cloud" step 2 (after user confirms the overwrite): the
    // returned row secret — NOT psecret — is what future saveToCloud
    // calls from this device must use.
    async confirmLoad(preview) {
      if (!preview) return { ok: false, error: 'Nothing to load.' };
      const FAILED = { ok: false, error: 'That didn’t work, so nothing was changed.' };
      // The cat that comes with the save (src/catkey.js): its id and the row
      // secret become this device's key, so the profile, friends, colony and
      // group name are the same cat here. Null: an older save, which keeps this
      // device's own key as before.
      const newKey = catKeyFromPayload(preview.payload, preview.secret);
      let before;
      try { before = snapshotKeyState(storage); } catch { return FAILED; }
      // Order: the old key is kept first (with the save's own before-cloud copy,
      // which replaceFromPayload writes), then the key and link change together,
      // then the save. If any step fails the old four are put back.
      if (!backUpCatKey(storage)) return FAILED;
      const next = { ...before, code: preview.code, linkSecret: preview.secret };
      if (newKey) { next.id = newKey.id; next.secret = newKey.secret; }
      if (!applyKeyState(storage, next)) return FAILED;
      let replaced = false;
      try { replaced = progression.replaceFromPayload(preview.payload.save) !== false; } catch (err) { note('cloud', err); }
      if (!replaced) {
        applyKeyState(storage, before);
        return FAILED;
      }
      album.replaceFromPayload(preview.payload.album ?? { version: 1, photos: [] });
      // The friends the cat had met, and the visitors it hid, join this device's.
      addIds(met, preview.payload.social?.met);
      addIds(blocked, preview.payload.social?.blocked);
      psecretCache = null; // read again from storage if it changed
      deniedNotified = false;
      if (!newKey) return { ok: true, keptKey: true };
      // The page reads the id once, at boot: a different cat needs a reload.
      return newKey.id !== before.id || newKey.secret !== before.secret ? { ok: true, reload: true } : { ok: true };
    },
    async syncNow() {
      if (!readCloudLink()) return runSync();
      const r = await runCat('push').catch(() => null);
      if (r === null || (r && r.legacy)) return runSync();
      if (r === 'saved' || r === 'caught') return { ok: true, message: r === 'caught' ? phrase('catlogin.caughtup', savedName()) : 'Synced ✓' };
      if (r === 'signedout') return { ok: false, message: phrase('catlogin.signedout', savedName()) };
      if (r === 'too-big') return { ok: false, message: TOO_BIG_MESSAGE };
      if (r === 'busy') return { ok: false, message: BUSY_MESSAGE };
      if (r === 'deferred') return { ok: true, message: 'Synced ✓' };
      return { ok: false, message: 'Could not reach the cloud — check your connection and try again.' };
    },
    // How the cat's catch-up stands, for the sheet: { state, name } or null before it has run.
    catStatus() {
      return catState ? { state: catState, name: savedName() } : null;
    },
    // Once, after the home screen is up: a linked device asks the cloud whether
    // another device saved, and merges if so. Nothing at all for a device that
    // never linked, and nothing when it is offline.
    catchUp() {
      if (!MP || !readCloudLink() || !onlineAllowed()) return Promise.resolve('none');
      return runCat('open').then((r) => {
        if (r && r.legacy && r.push) return runSync().then(() => 'saved');
        return r;
      }).catch(() => 'offline');
    },
    unlink() {
      clearCloudLink();
      deniedNotified = false;
    },
    // "Delete my online data" (game/onlinedelete.js): ask the server to
    // delete the linked save row, with the row secret kept beside the code.
    // -> 'not-linked', or deleteSave's one word. Changes nothing on the
    // device: the caller unlinks once the row is gone.
    async deleteCloudSave() {
      const link = readCloudLink();
      if (!link) return 'not-linked';
      const cloud = saveCloud();
      if (!cloud) return 'unavailable';
      return cloud.deleteSave(link.code, link.secret);
    },
    // fire-and-forget auto-sync (after the walk summary and after shop
    // buys) — never awaited by callers, never throws.
    autoSync() {
      if (!MP || !readCloudLink()) return;
      runCat('push').then((r) => (r && r.legacy ? runSync() : r)).catch(() => runSync()).catch(() => {});
    },
  };

  return { getPsecret, getCloud, openCloud, onlineAllowed, togetherAllowed, sync };
}
