import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wordProblems } from '../scripts/buildjson.mjs';
import { runChecks, wordProblems as servedWordProblems } from '../scripts/smoke.mjs';
import { wordsProblem } from '../ios/refresh-lib.mjs';
import { scanDir } from '../scripts/bundlewords.mjs';

// What each pipeline does with the list of words the public files may never say (scripts/bundlewords.mjs).

const dist = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'ww-dist-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
let dirs = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs = []; vi.unstubAllGlobals(); });
const made = (files) => { const d = dist(files); dirs.push(d); return d; };

describe('the build (scripts/buildjson.mjs postbuild)', () => {
  it('passes a clean dist', () => {
    expect(wordProblems(made({ 'index.html': '<p>hi</p>', 'assets/a.js': 'const x = "a Crew";' }))).toEqual([]);
  });
  it('fails a dist with a planted word, and names the file and the word', () => {
    const p = wordProblems(made({ 'index.html': '<p>hi</p>', 'assets/a.js': 'const x = "MossClan";' }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/a\.js/);
    expect(p[0]).toMatch(/MossClan/);
  });
  it('fails a source map', () => {
    expect(wordProblems(made({ 'assets/a.js': '1', 'assets/a.js.map': '{}' }))[0]).toMatch(/source map/);
  });
});

describe('the app refresh (ios/refresh.mjs)', () => {
  it('maps an offence to a refused build, which takes the last-good path', () => {
    expect(wordsProblem(scanDir(made({ 'assets/a.js': 'MossClan' })))).toBe('family words in the app build');
    expect(wordsProblem(scanDir(made({ 'assets/a.js': 'fine' })))).toBeNull();
    expect(wordsProblem(undefined)).toBeNull();
  });
});

describe('the smoke check (scripts/smoke.mjs)', () => {
  const base = 'https://example.github.io/whisker-walk/';
  const site = (files, old = 404) => {
    const big = (s) => s + ' '.repeat(600);
    vi.stubGlobal('fetch', async (u) => {
      const path = new URL(u).pathname.replace('/whisker-walk/', '');
      if (path === 'clan-edition.html') return new Response('x', { status: old, headers: { 'content-type': 'text/html' } });
      const hit = files[path];
      if (!hit) return new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(big(hit[1]), { status: 200, headers: { 'content-type': hit[0] } });
    });
  };
  const page = ['text/html', '<div id="app"></div><script type="module" src="/whisker-walk/assets/index-abc.js"></script>'];
  const files = (js) => ({ '': page, 'assets/index-abc.js': ['text/javascript', js], 'sw.js': ['text/javascript', 'x'],
    'precache.json': ['application/json', JSON.stringify({ build: 'b', files: ['assets/index-abc.js'] })] });

  it('passes a clean site whose old family page is gone', async () => {
    site(files('const a = 1;'));
    expect(await runChecks({ base })).toEqual([]);
  });
  it('flags a planted word in a fetched asset', async () => {
    site(files('const a = "Twolegplace";'));
    const problems = await runChecks({ base });
    expect(problems.join('\n')).toMatch(/index-abc\.js.*family set/);
  });
  it('fails when the old family page answers 200', async () => {
    site(files('const a = 1;'), 200);
    expect((await runChecks({ base })).join('\n')).toMatch(/clan-edition\.html.*expected 404/);
  });
  it('wordProblems says what and where', () => {
    expect(servedWordProblems('script', 'https://x/a.js', 'Firestar')[0]).toMatch(/script https:\/\/x\/a\.js/);
    expect(servedWordProblems('script', 'https://x/a.js', 'fine')).toEqual([]);
  });
});
