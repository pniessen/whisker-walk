import { describe, it, expect } from 'vitest';
import { pbkdf2Sync } from 'node:crypto';
import { normalizeCode, hashCode, REDEEM_SALT, REDEEM_ITERATIONS } from '../src/redeem.js';

describe('normalizeCode', () => {
  it('uppercases, strips separators and folds look-alikes', () => {
    expect(normalizeCode('tuna-moon 7k3q')).toBe('TUNAM00N7K3Q');
    expect(normalizeCode('  T.u_n-a  ')).toBe('TUNA');
    expect(normalizeCode('il1IL')).toBe('11111');
    expect(normalizeCode('oO0')).toBe('000');
    expect(normalizeCode('🐾cat🐾')).toBe('CAT');
  });
  it('gives an empty string for non-strings', () => {
    expect(normalizeCode(null)).toBe('');
    expect(normalizeCode(42)).toBe('');
    expect(normalizeCode({})).toBe('');
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('hashCode', () => {
  it('returns 64 lowercase hex, deterministic, and distinct per input', async () => {
    const a = await hashCode('A');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCode('A')).toBe(a);
    expect(await hashCode('B')).not.toBe(a);
  });
  it('matches an independent PBKDF2 vector', async () => {
    expect(REDEEM_SALT).toBe('whisker-walk-redeem-v1');
    expect(REDEEM_ITERATIONS).toBe(100000);
    const want = pbkdf2Sync('THROWAWAY123', 'whisker-walk-redeem-v1', 100000, 32, 'sha256').toString('hex');
    expect(await hashCode('THROWAWAY123')).toBe(want);
  });
  it('rejects kindly when crypto.subtle is missing', async () => {
    await expect(hashCode('X', null)).rejects.toThrow(/crypto/);
    await expect(hashCode('X', null)).rejects.toBeInstanceOf(Error);
  });
});
