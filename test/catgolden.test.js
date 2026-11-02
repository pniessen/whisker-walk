import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fingerprintCat, buildFor, goldenKeys, hagridKeys } from './helpers/catfingerprint.js';

// Pins today's cat model. Regenerate deliberately: UPDATE_GOLDEN=1 npx vitest run test/catgolden.test.js
// hagrid-golden.json is write-once. The chicken changed once, on purpose, in the
// 2026-11-01 body refinement (regenerated 2026-11-02 with the owner's
// sign-off); it is write-once again from here (written only if missing).
// 2026-11-02, polish 1a Task 5 (the cat from behind): catgolden.json regenerated
// once for shorter, forward-swept, fainter whiskers; darker ear backs (vertex
// colour); the pupil and eye shine tucked onto the eye; an evenly tapered tail
// with a rounded tip, dark over its last third only; the "M" stripes run on
// over the crown (headStripes cats). Hagrid is unchanged (his golden still passes).
const GOLDEN_FILE = new URL('./fixtures/catgolden.json', import.meta.url);
const HAGRID_FILE = new URL('./fixtures/hagrid-golden.json', import.meta.url);

const collect = (keys) => Object.fromEntries(keys.map((k) => [k, fingerprintCat(buildFor(k))]));
if (process.env.UPDATE_GOLDEN) {
  fs.writeFileSync(GOLDEN_FILE, JSON.stringify(collect(goldenKeys())));
  if (!fs.existsSync(HAGRID_FILE)) fs.writeFileSync(HAGRID_FILE, JSON.stringify(collect(hagridKeys())));
}
const GOLDEN = JSON.parse(fs.readFileSync(GOLDEN_FILE, 'utf8'));
const HAGRID = JSON.parse(fs.readFileSync(HAGRID_FILE, 'utf8'));

describe('cat golden fingerprints', () => {
  it.each(goldenKeys())('%s matches its golden fingerprint', (key) => {
    expect(fingerprintCat(buildFor(key))).toEqual(GOLDEN[key]);
  });
  it.each(hagridKeys())('%s matches its golden (write-once since the 2026-11-01 body refinement; built and animated)', (key) => {
    expect(fingerprintCat(buildFor(key))).toEqual(HAGRID[key]);
  });
  it('every key builds byte-identically twice', () => {
    for (const key of [...goldenKeys(), ...hagridKeys()]) {
      expect(fingerprintCat(buildFor(key))).toEqual(fingerprintCat(buildFor(key)));
    }
  });
});
