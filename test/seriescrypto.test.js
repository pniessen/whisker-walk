import { test, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { sealVault, addWrap, unwrapWithCode, openVault, plaintextDigest, SERIES_ITERATIONS, SERIES_AAD, toB64 } from '../src/seriescrypto.js';

const subtle = webcrypto.subtle;
const randomBytes = (n) => webcrypto.getRandomValues(new Uint8Array(n));
const PLAIN = '{"hello":"a plain stand-in for the packed set"}';
// 600,000 PBKDF2 rounds a derivation: keep the number of derivations small
const key = randomBytes(32);
const salt = randomBytes(16);
const CODE = 'TESTCODE1234';

test('seal, unwrap and open give the plaintext back', async () => {
  const vault = await sealVault({ plaintext: PLAIN, contentKey: key, salt, wraps: [{ id: 'one', code: 'OTHER9999' }, { id: 'two', code: CODE }] }, subtle, randomBytes);
  expect(vault.v).toBe(1);
  expect(vault.iterations).toBe(SERIES_ITERATIONS);
  expect(SERIES_ITERATIONS).toBe(600000);
  expect(SERIES_AAD).toBe('whisker-walk-series-v1');
  expect(vault.wraps.map((w) => w.id)).toEqual(['one', 'two']);
  expect(vault.digest).toBe(await plaintextDigest(PLAIN, subtle));
  const got = await unwrapWithCode(vault, CODE, subtle);
  expect([...got]).toEqual([...key]);
  expect(await openVault(vault, got, subtle)).toBe(PLAIN);
  // the plaintext is nowhere in the vault
  expect(JSON.stringify(vault)).not.toContain('stand-in');
  expect(JSON.stringify(vault)).not.toContain(toB64(key));

  // a wrong code, a changed byte and another iteration count all say no
  expect(await unwrapWithCode(vault, 'WRONGCODE', subtle)).toBeNull();
  const bytes = Uint8Array.from(atob(vault.data), (c) => c.charCodeAt(0));
  bytes[3] ^= 1;
  expect(await openVault({ ...vault, data: btoa(String.fromCharCode(...bytes)) }, got, subtle)).toBeNull();
  expect(await openVault(vault, randomBytes(32), subtle)).toBeNull();
  expect(await unwrapWithCode({ ...vault, iterations: 1000 }, CODE, subtle)).toBeNull();
  expect(await unwrapWithCode({ ...vault, wraps: [] }, CODE, subtle)).toBeNull();
  expect(await unwrapWithCode(vault, '', subtle)).toBeNull();
});

test('two seals of the same plaintext differ, and addWrap adds a way in', async () => {
  const a = await sealVault({ plaintext: PLAIN, contentKey: key, salt, wraps: [] }, subtle, randomBytes);
  const b = await sealVault({ plaintext: PLAIN, contentKey: key, salt, wraps: [] }, subtle, randomBytes);
  expect(a.iv).not.toBe(b.iv);
  expect(a.data).not.toBe(b.data);
  expect(a.digest).toBe(b.digest);
  expect(await unwrapWithCode(a, CODE, subtle)).toBeNull();
  const c = await addWrap(a, { id: 'later', code: CODE, contentKey: key }, subtle, randomBytes);
  expect(c.wraps.map((w) => w.id)).toEqual(['later']);
  expect(await openVault(c, await unwrapWithCode(c, CODE, subtle), subtle)).toBe(PLAIN);
});

test('a key or a salt of the wrong size is refused', async () => {
  await expect(sealVault({ plaintext: PLAIN, contentKey: randomBytes(16), salt }, subtle, randomBytes)).rejects.toThrow(/32 bytes/);
  await expect(sealVault({ plaintext: PLAIN, contentKey: key, salt: randomBytes(8) }, subtle, randomBytes)).rejects.toThrow(/16 bytes/);
});
