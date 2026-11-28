import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import * as on from '../src/clanwords.js';
import { packSet } from '../src/seriespack.js';
import { plaintextDigest, SERIES_ITERATIONS } from '../src/seriescrypto.js';
import { VAULT } from '../src/seriesvault.js';
import { scanText } from '../scripts/bundlewords.mjs';

test("the vault is the family's set of today", async () => {
  expect(VAULT.digest, 'the family set changed since it was sealed: run npm run series:seal').toBe(await plaintextDigest(packSet(on), webcrypto.subtle));
});

test('the vault is ciphertext with a way in', () => {
  expect(VAULT.v).toBe(1);
  expect(VAULT.iterations).toBe(SERIES_ITERATIONS);
  expect(VAULT.wraps.length).toBeGreaterThan(0);
  for (const w of VAULT.wraps) expect(Object.keys(w).sort()).toEqual(['id', 'iv', 'key']);
  expect(Object.keys(VAULT).sort()).toEqual(['data', 'digest', 'iterations', 'iv', 'salt', 'v', 'wraps']);
});

// The vault file is committed and shipped: none of the family's words may be readable in it.
test('the vault file holds no family word', () => {
  const text = readFileSync('src/seriesvault.js', 'utf8');
  expect(text).not.toMatch(/star names?|great oak|sun-warmed|meeting (ring|stone)|Rear-up Swat|Leap and Scratch|Rolling Tumble/i);
  expect(scanText(text)).toEqual([]);
});
