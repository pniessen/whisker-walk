// Seals and opens the family's word set with WebCrypto. Pure: `subtle` and the
// random source are handed in, so the same file runs in the page, in Node (the
// seal tool and the tests) and with a stand-in.
//
// The set (seriespack.js) is encrypted once with AES-256-GCM under a random
// 32-byte CONTENT KEY. The content key is wrapped (encrypted) under a key
// derived from each family code with PBKDF2-SHA256, 600,000 iterations, one
// salt for the vault. Only ciphertext is committed (src/seriesvault.js); a
// typed code unwraps the content key, and the key opens the vault.
//
//   Vault = { v: 1, salt, iterations: 600000, wraps: [{ id, iv, key }],
//             iv, data, digest }       every byte string is base64
//
// `digest` is the SHA-256 of the plaintext (hex): it says whether the vault is
// still the set of today, without the key.

export const SERIES_AAD = 'whisker-walk-series-v1';
export const SERIES_ITERATIONS = 600000;
export const VAULT_VERSION = 1;

const enc = new TextEncoder();
const dec = new TextDecoder();
const AAD = enc.encode(SERIES_AAD);

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(text) {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export async function plaintextDigest(plaintext, subtle) {
  return hex(new Uint8Array(await subtle.digest('SHA-256', enc.encode(plaintext))));
}

const aesKey = (raw, subtle, usages) => subtle.importKey('raw', raw, 'AES-GCM', false, usages);

// The key a code makes: PBKDF2-SHA256 over the (normalised) code and the vault's salt.
async function codeKey(code, salt, iterations, subtle) {
  const base = await subtle.importKey('raw', enc.encode(String(code)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(key, plain, randomBytes, subtle) {
  const iv = randomBytes(12);
  const data = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, plain));
  return { iv: toB64(iv), data: toB64(data) };
}

async function decrypt(key, iv, data, subtle) {
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: AAD }, key, fromB64(data)));
  } catch {
    return null;
  }
}

async function makeWrap(id, code, contentKey, salt, subtle, randomBytes) {
  const key = await codeKey(code, salt, SERIES_ITERATIONS, subtle);
  const { iv, data } = await encrypt(key, contentKey, randomBytes, subtle);
  return { id, iv, key: data };
}

function checkKey(contentKey) {
  if (!(contentKey instanceof Uint8Array) || contentKey.length !== 32) throw new Error('Whisker Walk: the content key is 32 bytes');
}

// wraps: [{ id, code }] with the NORMALISED code (redeem.js normalizeCode).
export async function sealVault({ plaintext, contentKey, salt, wraps = [] }, subtle, randomBytes) {
  checkKey(contentKey);
  if (!(salt instanceof Uint8Array) || salt.length !== 16) throw new Error('Whisker Walk: the vault salt is 16 bytes');
  const { iv, data } = await encrypt(await aesKey(contentKey, subtle, ['encrypt']), enc.encode(plaintext), randomBytes, subtle);
  const made = [];
  for (const w of wraps) made.push(await makeWrap(w.id, w.code, contentKey, salt, subtle, randomBytes));
  return {
    v: VAULT_VERSION,
    salt: toB64(salt),
    iterations: SERIES_ITERATIONS,
    wraps: made,
    iv,
    data,
    digest: await plaintextDigest(plaintext, subtle),
  };
}

// A vault with one more way in (a replaced id is replaced, not doubled).
export async function addWrap(vault, { id, code, contentKey }, subtle, randomBytes) {
  checkKey(contentKey);
  const wrap = await makeWrap(id, code, contentKey, fromB64(vault.salt), subtle, randomBytes);
  return { ...vault, wraps: [...vault.wraps.filter((w) => w.id !== id), wrap] };
}

const sound = (vault) => !!vault && vault.v === VAULT_VERSION && vault.iterations === SERIES_ITERATIONS
  && typeof vault.salt === 'string' && Array.isArray(vault.wraps);

// The content key a code opens, or null. One derivation, then each wrap in turn.
export async function unwrapWithCode(vault, normalizedCode, subtle) {
  if (!sound(vault) || vault.wraps.length === 0 || typeof normalizedCode !== 'string' || normalizedCode === '') return null;
  try {
    const key = await codeKey(normalizedCode, fromB64(vault.salt), SERIES_ITERATIONS, subtle);
    for (const w of vault.wraps) {
      const raw = await decrypt(key, w.iv, w.key, subtle);
      if (raw && raw.length === 32) return raw;
    }
  } catch {
    /* a malformed vault or key: no */
  }
  return null;
}

// The packed set (the plaintext text), or null when the key does not open it.
export async function openVault(vault, contentKey, subtle) {
  if (!sound(vault) || !(contentKey instanceof Uint8Array) || contentKey.length !== 32) return null;
  try {
    const plain = await decrypt(await aesKey(contentKey, subtle, ['decrypt']), vault.iv, vault.data, subtle);
    return plain ? dec.decode(plain) : null;
  } catch {
    return null;
  }
}
