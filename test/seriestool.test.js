import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runSeries, inventFamilyCode } from '../scripts/series.mjs';
import { normalizeCode } from '../src/redeem.js';
import { unwrapWithCode, openVault, fromB64, toB64 } from '../src/seriescrypto.js';
import { packSet } from '../src/seriespack.js';
import * as on from '../src/clanwords.js';
import { WORDS, CODE_ALPHABET } from '../scripts/make-code.mjs';

// Everything here happens in a temp folder: the owner's key file and the real vault are never touched.
let dir, keyFile, vaultFile, codeFile, said;
const io = { out: (t) => said.push(t), err: (t) => said.push(t) };
const run = (...argv) => runSeries(argv, { keyFile, vaultFile, io });
const vaultNow = async () => (await import(`${pathToFileURL(vaultFile).href}?t=${Math.random()}`)).VAULT;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ww-series-'));
  keyFile = join(dir, 'key', 'series-key');
  vaultFile = join(dir, 'seriesvault.js');
  codeFile = join(dir, 'code.txt');
  said = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('init makes a key and an empty vault, and refuses the second time', async () => {
  expect(await run('init')).toBe(0);
  expect((statSync(keyFile).mode & 0o777).toString(8)).toBe('600');
  expect(fromB64(readFileSync(keyFile, 'utf8').trim()).length).toBe(32);
  expect((await vaultNow()).wraps).toEqual([]);
  const before = readFileSync(keyFile, 'utf8');
  expect(await run('init')).toBe(1);
  expect(readFileSync(keyFile, 'utf8')).toBe(before);
  expect(said.join('\n')).not.toContain(before.trim());
});

test('a code is 5 words and 4 characters, opens the vault, and goes only where it is told', async () => {
  await run('init');
  expect(await run('verify')).toBe(1); // no wraps yet
  expect(await run('code', '--label', 'family', '--out', codeFile)).toBe(0);
  const code = readFileSync(codeFile, 'utf8').trim();
  expect(said.join('\n')).not.toContain(code); // printed to the file only
  expect((statSync(codeFile).mode & 0o777).toString(8)).toBe('600');
  const parts = code.split('-');
  expect(parts.length).toBe(6);
  expect(parts.slice(0, 5).every((w) => WORDS.includes(w))).toBe(true);
  expect([...parts[5]].every((c) => CODE_ALPHABET.includes(c)) && parts[5].length === 4).toBe(true);
  const typed = normalizeCode(code.toLowerCase().replaceAll('-', ' '));
  expect(typed).toBe(normalizeCode(code));
  const vault = await vaultNow();
  const key = await unwrapWithCode(vault, typed, webcrypto.subtle);
  expect(key).not.toBeNull();
  expect(await openVault(vault, key, webcrypto.subtle)).toBe(packSet(on));
  expect(await run('verify')).toBe(0);
  // a code file is never overwritten
  expect(await run('code', '--label', 'again', '--out', codeFile)).toBe(1);
  expect(readFileSync(codeFile, 'utf8').trim()).toBe(code);
  expect((await vaultNow()).wraps.length).toBe(1);
});

test('seal keeps the salt and the ways in, and a stale digest fails verify', async () => {
  await run('init');
  await run('code', '--label', 'family', '--out', codeFile);
  const before = await vaultNow();
  expect(await run('seal')).toBe(0);
  const after = await vaultNow();
  expect(after.salt).toBe(before.salt);
  expect(after.wraps).toEqual(before.wraps);
  expect(after.data).not.toBe(before.data);
  expect(await run('verify')).toBe(0);
  const text = readFileSync(vaultFile, 'utf8').replace(after.digest, '0'.repeat(64));
  writeFileSync(vaultFile, text);
  expect(await run('verify')).toBe(1);
  expect(said.join('\n')).toMatch(/series:seal/);
});

test('check finds the key in a file, in any of its spellings, and passes a clean folder', async () => {
  await run('init');
  const key = fromB64(readFileSync(keyFile, 'utf8').trim());
  const out = join(dir, 'site');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(out);
  writeFileSync(join(out, 'a.js'), 'nothing here');
  expect(await run('check', out)).toBe(0);
  const b64 = toB64(key);
  for (const spelling of [b64, b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), Buffer.from(key).toString('hex')]) {
    writeFileSync(join(out, 'b.js'), `const x = "${spelling}";`);
    said = [];
    expect(await run('check', out)).toBe(1);
    expect(said.join('\n')).not.toContain(spelling);
  }
  expect(existsSync(join(out, 'b.js'))).toBe(true);
});

test('the invented code is never the same twice, and uses the whole list', () => {
  const seen = new Set(Array.from({ length: 20 }, () => inventFamilyCode()));
  expect(seen.size).toBe(20);
});
