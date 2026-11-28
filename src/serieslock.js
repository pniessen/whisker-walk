// The family lock: opens the sealed family set (seriesvault.js) with a key kept
// on the device or with a typed family code, and installs it (wordset.js).
//
// The crypto, the packer and the vault itself are lazy chunks: a device that
// has no key and never types a code never downloads them.
//
//   restore()       a device that holds the key opens the set at boot:
//                   'on-ready' (installed), 'locked' (no key, or one that no
//                   longer opens the vault: it is forgotten) or 'unsupported'
//                   (no WebCrypto here: an http:// page or an old WebView)
//   tryCode(code)   a NORMALISED family code (redeem.js normalizeCode):
//                   'unlocked' (installed, key kept), 'no' or 'unsupported'
//
// wordSetFor(state, available) says which set the save wants in use.
import { installSeriesSet, seriesAvailable, SERIES_ON, SERIES_OFF } from './wordset.js';
import { readFamilyKey, writeFamilyKey, forgetFamilyKey } from './serieskey.js';

// The set a save wants: its own preference, or the family's words when this
// device can show them and the save has never chosen. 'on' only when it can be shown.
export function wordSetFor(state, available) {
  const pref = state?.wordSet ?? (available ? SERIES_ON : SERIES_OFF);
  return pref === SERIES_ON && available ? SERIES_ON : SERIES_OFF;
}

const lazy = () => Promise.all([import('./seriescrypto.js'), import('./seriespack.js')]);

export function createFamilyLock({
  vault,
  storage,
  subtle = globalThis.crypto?.subtle,
  install = installSeriesSet,
  installed = seriesAvailable,
} = {}) {
  const getVault = async () => vault ?? (await import('./seriesvault.js')).VAULT;

  // Opens the vault with the content key and installs the set. true when it is in.
  async function open(key) {
    const [crypto, pack] = await lazy();
    const text = await crypto.openVault(await getVault(), key, subtle);
    if (text === null) return false;
    if (!installed()) install(pack.unpackSet(text));
    return true;
  }

  return {
    async restore() {
      if (!subtle) return 'unsupported';
      if (installed()) return 'on-ready';
      const key = readFamilyKey(storage);
      if (!key) return 'locked';
      try {
        if (await open(key)) return 'on-ready';
      } catch {
        /* a vault that will not load or unpack is a key that no longer fits */
      }
      forgetFamilyKey(storage);
      return 'locked';
    },

    async tryCode(normalized) {
      if (!subtle) return 'unsupported';
      try {
        const [crypto] = await lazy();
        const key = await crypto.unwrapWithCode(await getVault(), normalized, subtle);
        if (!key) return 'no';
        if (!(await open(key))) return 'no';
        writeFamilyKey(storage, key);
        return 'unlocked';
      } catch {
        return 'no';
      }
    },
  };
}

// The boot: a device with no stored key starts at once, exactly as before. One with a key
// starts when the set is open (so the first screen is in the family's words), or after
// `waitMs` in the everyday words, and `late()` runs if the set arrives after that.
export function startAfterFamily({ hasKey, restore, init, late, waitMs = 1500, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!hasKey) {
    init();
    return;
  }
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    init();
  };
  const timer = setTimer(go, waitMs);
  Promise.resolve().then(restore).catch(() => 'locked').then((answer) => {
    clearTimer(timer);
    if (!started) go();
    else if (answer === 'on-ready') late();
  });
}
