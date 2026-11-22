import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build } from 'vite';
import { FAMILY_SENTINEL, FAMILY_FILE_TOKEN } from '../src/family/sentinel.js';
import { FAMILY_PLACEHOLDER_PLAN } from '../src/family/placeholderplan.js';

// The public game contains nothing of the private family edition, and cannot reach it (private-edition
// milestone 0, Task 5). Two real builds in memory: the public one and `--mode family`; the same search
// finds the tokens in the second and in nothing of the first, so a pass is never vacuous.
const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');
const TEXT = /\.(js|mjs|html|json|css|webmanifest|svg|map)$/i;

// Every token the family build carries that the public one must not: the sentinel, the file token
// and every room id the family plan exports.
const TOKENS = [FAMILY_SENTINEL, FAMILY_FILE_TOKEN, 'ww-private-family', ...FAMILY_PLACEHOLDER_PLAN.rooms.map((r) => r.id)];

async function bundle(mode) {
  const out = await build({
    root: ROOT, mode, logLevel: 'silent', configFile: join(ROOT, 'vite.config.js'),
    build: { write: false, minify: true },
  });
  const results = Array.isArray(out) ? out : [out];
  const files = new Map();
  for (const r of results) {
    for (const o of r.output) files.set(o.fileName, o.type === 'chunk' ? o.code : typeof o.source === 'string' ? o.source : Buffer.from(o.source).toString('utf8'));
  }
  return files;
}

let pub;
let fam;
beforeAll(async () => {
  [pub, fam] = [await bundle('production'), await bundle('family')];
}, 240000);

const hits = (files, token) => [...files].filter(([name, text]) => TEXT.test(name) && text.toLowerCase().includes(token.toLowerCase())).map(([name]) => name);

describe('the public build excludes the private family edition', () => {
  it('builds, and has the game in it', () => {
    expect(pub.size).toBeGreaterThan(20);
    expect([...pub.keys()].some((n) => /^assets\/house-.*\.js$/.test(n))).toBe(true);
  });

  it('has no emitted file with family in its name, and no manifest source under src/family/', () => {
    expect([...pub.keys()].filter((n) => /family/i.test(n))).toEqual([]);
    const manifest = JSON.parse(pub.get('.vite/manifest.json'));
    for (const [key, entry] of Object.entries(manifest)) {
      expect(key).not.toMatch(/src\/family\//);
      expect(entry.src ?? '').not.toMatch(/src\/family\//);
      for (const imp of [...(entry.imports ?? []), ...(entry.dynamicImports ?? [])]) expect(imp).not.toMatch(/src\/family\//);
    }
  });

  it('has no emitted text file with the sentinel, a family file token or a family room id', () => {
    for (const t of TOKENS) expect({ token: t.length, files: hits(pub, t) }).toEqual({ token: t.length, files: [] });
  });

  it('has no family place in its area registry (the flag block is dropped)', () => {
    for (const [name, text] of pub) {
      if (!/\.js$/.test(name)) continue;
      expect(text).not.toMatch(/__PRIVATE_FAMILY__/);
    }
  });
});

describe('the family build includes it (the search is not vacuous)', () => {
  it('has the family chunk, the sentinel and the placeholder room id', () => {
    expect([...fam.keys()].some((n) => /family/i.test(n))).toBe(true);
    expect(hits(fam, FAMILY_SENTINEL).length).toBeGreaterThan(0);
    for (const r of FAMILY_PLACEHOLDER_PLAN.rooms) expect(hits(fam, r.id).length).toBeGreaterThan(0);
  });

  it('lists the family chunk in its manifest', () => {
    const manifest = JSON.parse(fam.get('.vite/manifest.json'));
    expect(Object.keys(manifest).some((k) => /src\/family\//.test(k))).toBe(true);
  });

  it('carries the family save key and not the public one as its save', () => {
    const all = [...fam].filter(([n]) => /\.js$/.test(n)).map(([, t]) => t).join('\n');
    expect(all).toContain('whisker-walk-family-save');
  });
});

// ---- static: nothing outside src/family/ reaches into it, save the two flag blocks ----

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.m?js$/.test(name)) out.push(p);
  }
  return out;
}

describe('no file outside src/family/ imports from it, but the flag blocks', () => {
  // import ... from '...family/x', import('...family/x') and export ... from
  const REACH = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"`][^'"`]*\/family\/[^'"`]*['"`]/g;
  const ALLOWED = new Set(['src/world/areas.js', 'src/world/worldmap.js']); // the flag blocks only

  it('finds every reach into src/family/ in an allowed file inside a __PRIVATE_FAMILY__ block', () => {
    const outside = walk(SRC).filter((p) => !relative(SRC, p).startsWith('family/'));
    const found = [];
    for (const p of outside) {
      const text = readFileSync(p, 'utf8');
      const rel = relative(ROOT, p);
      for (const m of text.matchAll(REACH)) {
        found.push(rel);
        if (!ALLOWED.has(rel)) continue;
        // the reach sits in an `if (typeof __PRIVATE_FAMILY__ ...) { ... }` block
        const before = text.slice(0, m.index);
        const open = before.lastIndexOf('__PRIVATE_FAMILY__');
        const closed = before.lastIndexOf('\n}');
        expect({ rel, inBlock: open > -1 && open > closed }).toEqual({ rel, inBlock: true });
      }
    }
    expect([...new Set(found)].filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it('the tests, the config and the scripts are the only other readers (config and scripts import none)', () => {
    for (const rel of ['vite.config.js', 'scripts/buildjson.mjs', 'scripts/precache.mjs']) {
      expect({ rel, reach: readFileSync(join(ROOT, rel), 'utf8').match(REACH) }).toEqual({ rel, reach: null });
    }
  });

  it('every file in src/family/ starts with the file token', () => {
    const dir = join(SRC, 'family');
    for (const p of walk(dir)) expect({ p: relative(ROOT, p), first: readFileSync(p, 'utf8').split('\n')[0] }).toEqual({ p: relative(ROOT, p), first: `// ${FAMILY_FILE_TOKEN}` });
  });
});

describe('the Pages deploy refuses a bundle with the token in it', () => {
  it('has the grep guard after the build step, before the upload', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    const guard = yml.indexOf('grep -rl "ww-private-family" dist');
    expect(guard).toBeGreaterThan(-1);
    expect(yml.slice(guard, guard + 160)).toMatch(/exit 1/);
    expect(guard).toBeGreaterThan(yml.indexOf('npm run build'));
    expect(guard).toBeLessThan(yml.indexOf('upload-pages-artifact'));
  });
});
