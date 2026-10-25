import { describe, it, expect } from 'vitest';
import { REDEEM_CODES } from '../src/redeemcodes.js';
import { CATALOG } from '../src/progression.js';
import { normalizeCode, hashCode } from '../src/redeem.js';

// Returns a list of problem strings; empty means the table is fine.
async function guardProblems(table, hash = hashCode) {
  const problems = [];
  for (const [key, entry] of Object.entries(table)) {
    if (!/^[0-9a-f]{64}$/.test(key)) problems.push(`bad key ${key.slice(0, 8)}`);
    const cats = entry.cats ?? [];
    const accessories = entry.accessories ?? [];
    if (!((entry.points > 0) || cats.length || accessories.length)) problems.push(`${key.slice(0, 8)} gives nothing`);
    for (const id of cats) if (!Object.hasOwn(CATALOG.cats, id)) problems.push(`unknown cat ${id}`);
    for (const id of accessories) if (!Object.hasOwn(CATALOG.accessories, id)) problems.push(`unknown accessory ${id}`);
    if (typeof entry.label !== 'string' || entry.label.length > 60) problems.push(`bad label on ${key.slice(0, 8)}`);
    else if (Object.hasOwn(table, await hash(normalizeCode(entry.label)))) problems.push(`label of ${key.slice(0, 8)} is a code`);
  }
  return problems;
}

describe('REDEEM_CODES table guard', () => {
  it('the real table has no problems', async () => {
    expect(await guardProblems(REDEEM_CODES)).toEqual([]);
  });

  it('the guard passes a good table and catches bad ones', async () => {
    const fake = async (s) => (s === 'PASTED' ? 'b'.repeat(64) : 'c'.repeat(64));
    const catId = Object.keys(CATALOG.cats)[0];
    const good = { ['a'.repeat(64)]: { label: 'Test', points: 5, cats: [catId], accessories: [] } };
    expect(await guardProblems(good, fake)).toEqual([]);
    const bad = {
      short: { label: 'x', points: 1 },
      ['d'.repeat(64)]: { label: 'x', points: 0, cats: [], accessories: [] },
      ['e'.repeat(64)]: { label: 'x', points: 1, accessories: ['nope-not-real'] },
      ['f'.repeat(64)]: { label: 'x'.repeat(61), points: 1 },
      ['b'.repeat(64)]: { label: 'pasted', points: 1 },
    };
    const joined = (await guardProblems(bad, fake)).join('|');
    expect(joined).toMatch(/bad key/);
    expect(joined).toMatch(/gives nothing/);
    expect(joined).toMatch(/unknown accessory/);
    expect(joined).toMatch(/bad label/);
    expect(joined).toMatch(/is a code/);
  });
});
