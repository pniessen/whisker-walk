// Cloud save wiring, lifted out of main.js's init() closure.
//
// Two things live here that used to sit at main.js module scope:
//   * the lazy capability handles (getPsecret / getCloud) every cloud-touching
//     call site goes through, and
//   * the `sync` object the home base's Sync ☁️ panel drives.
//
// Both are created by one factory so the "created lazily, only when MP" rule
// is enforced in exactly one place — see the comments on each below.

import { createLiveCloud, generateSaveCode, normalizeSaveCode, getOrCreateSecret } from '../cloud.js';
import { summarizeSaveForPreview } from '../progression.js';

// A toast surface that stays visible on the home base screen (unlike
// #hud, which is display:none whenever no walk is in progress) — cloud
// sync results (stale/denied) need to reach the player there too.
export function createCloudToast(container) {
  return function cloudToast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.classList.add('fade'), 2600);
    setTimeout(() => el.remove(), 3400);
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

export function createCloudSync({ MP, supabaseUrl, supabaseAnonKey, storage, progression, album, cloudToast }) {
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
  let cloudInstance = null;
  function getCloud() {
    if (!MP) return null;
    if (!cloudInstance) {
      cloudInstance = createLiveCloud(supabaseUrl, supabaseAnonKey);
    }
    return cloudInstance;
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
    }
  }
  function clearCloudLink() {
    try {
      storage.removeItem(CLOUD_CODE_KEY);
      storage.removeItem(CLOUD_SECRET_KEY);
    } catch (err) {
      console.warn('Whisker Walk: could not clear cloud link', err);
    }
  }
  // deep-cloned snapshot: composed once per RPC call so an in-flight
  // fire-and-forget send can't pick up a further mutation mid-flight.
  function composeCloudPayload() {
    return JSON.parse(JSON.stringify({ save: progression.state, album: album.serialize() }));
  }
  // 'denied' means this code/secret pair no longer authorizes writes
  // (e.g. re-linked elsewhere) — surfaced once per link, not on every
  // subsequent auto-sync, so it doesn't spam a toast after every walk.
  let deniedNotified = false;

  async function runSync() {
    const link = readCloudLink();
    if (!link) return { ok: false, message: 'Not linked to a cloud save.' };
    const cloud = getCloud();
    if (!cloud) return { ok: false, message: 'Cloud sync is not available.' };
    try {
      const payload = composeCloudPayload();
      const result = await cloud.saveToCloud(link.code, link.secret, payload, payload.save.lifetimePoints ?? 0);
      if (result === 'created' || result === 'updated') {
        deniedNotified = false;
        return { ok: true, message: 'Synced ✓' };
      }
      if (result === 'stale') {
        cloudToast('Cloud has newer progress — open Sync at home base');
        return { ok: false, message: 'Cloud has newer progress than this device — use Load from cloud to pull it down.' };
      }
      if (result === 'denied') {
        if (!deniedNotified) {
          cloudToast('Cloud sync denied — unlink and save a new code at home base');
          deniedNotified = true;
        }
        return { ok: false, message: 'Sync denied — this code may be linked elsewhere. Unlink and save a new code.' };
      }
      return { ok: false, message: 'Unexpected sync result.' };
    } catch (err) {
      console.warn('Whisker Walk: cloud sync failed', err);
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
      const cloud = getCloud();
      if (!cloud) return { ok: false, error: 'Cloud sync is not available.' };
      const code = generateSaveCode();
      try {
        const payload = composeCloudPayload();
        const secret = getPsecret();
        const result = await cloud.saveToCloud(code, secret, payload, payload.save.lifetimePoints ?? 0);
        if (result !== 'created') {
          return { ok: false, error: 'That code was already taken — please try again.' };
        }
        writeCloudLink(code, secret);
        deniedNotified = false;
        return { ok: true, code };
      } catch (err) {
        console.warn('Whisker Walk: saveToCloud failed', err);
        return { ok: false, error: 'Could not reach the cloud — check your connection and try again.' };
      }
    },
    // "Load from cloud" step 1: fetch + build a local-vs-cloud comparison
    // for the confirm-overwrite card. Nothing is written yet.
    async previewLoad(rawCode) {
      const cloud = getCloud();
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
        return { ok: false, error: 'Could not reach the cloud — check your connection and try again.' };
      }
    },
    // "Load from cloud" step 2 (after user confirms the overwrite): the
    // returned row secret — NOT psecret — is what future saveToCloud
    // calls from this device must use.
    async confirmLoad(preview) {
      if (!preview) return { ok: false, error: 'Nothing to load.' };
      progression.replaceFromPayload(preview.payload.save);
      album.replaceFromPayload(preview.payload.album ?? { version: 1, photos: [] });
      writeCloudLink(preview.code, preview.secret);
      deniedNotified = false;
      return { ok: true };
    },
    async syncNow() {
      return runSync();
    },
    unlink() {
      clearCloudLink();
      deniedNotified = false;
    },
    // fire-and-forget auto-sync (after the walk summary and after shop
    // buys) — never awaited by callers, never throws.
    autoSync() {
      if (!MP || !readCloudLink()) return;
      runSync().catch(() => {});
    },
  };

  return { getPsecret, getCloud, sync };
}
