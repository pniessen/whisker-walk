import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fingerprintCat, buildFor, goldenKeys } from './helpers/catfingerprint.js';

// Transitional: deleted with the golden regeneration (body refinement Task 11).
//
// R14: until the goldens are regenerated once, after the owner's sign-off,
// the body refinement may change only the legs, the fluffy cats' underside
// (the ruff) and Hagrid. Every other golden line stays byte-identical, and the
// mesh counts stay exactly as pinned. The fluffy cats' dressed keys compare
// only their mesh counts: Task 7 moves their neck items onto the new bib.

const GOLDEN = JSON.parse(fs.readFileSync(new URL('./fixtures/catgolden.json', import.meta.url), 'utf8'));
const FLUFFY = new Set(['persian', 'mainecoon', 'd2']);

describe('golden scope (R14): only the legs, the ruff and Hagrid change before Task 11', () => {
  it.each(goldenKeys())('%s: every line outside the legs (and a fluffy underside) is unchanged', (key) => {
    const [breed, variant] = key.split(':');
    const cat = buildFor(key);
    const now = fingerprintCat(cat);
    const golden = GOLDEN[key];
    expect(now.meshes).toBe(golden.meshes);
    if (FLUFFY.has(breed) && variant === 'dressed') return;
    const { body, underside, legs } = cat.userData.parts;
    const legPaths = legs.map((leg) => String(cat.children.indexOf(leg)));
    const undersidePath = `${cat.children.indexOf(body)}.${body.children.indexOf(underside)}`;
    const kept = (line) => {
      const path = line.split('|')[0];
      if (legPaths.some((p) => path === p || path.startsWith(`${p}.`))) return false;
      if (FLUFFY.has(breed) && path === undersidePath) return false;
      return true;
    };
    expect(now.lines.filter(kept)).toEqual(golden.lines.filter(kept));
  });
});
