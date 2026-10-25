// Redeem codes: pure normalise + hash helpers (v21 §10.4).
// DOM-free and import-free. Only hashes of codes are ever stored or compared.

export const REDEEM_SALT = 'whisker-walk-redeem-v1';
export const REDEEM_ITERATIONS = 100000;

// Forgiving typing: case, spaces, dashes and other punctuation do not matter,
// and look-alike letters fold to digits (O->0, I->1, L->1).
export function normalizeCode(input) {
  if (typeof input !== 'string') return '';
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

// PBKDF2-SHA256 of the normalised code -> 64 lowercase hex chars.
// An explicitly passed second argument (even undefined) is used as-is, so tests can
// simulate a missing crypto.subtle; omitting it falls back to the global.
export async function hashCode(normalized, ...rest) {
  const subtle = rest.length ? rest[0] : globalThis.crypto?.subtle;
  if (!subtle) throw new Error('crypto.subtle is not available here');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(String(normalized)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(REDEEM_SALT), iterations: REDEEM_ITERATIONS },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}
