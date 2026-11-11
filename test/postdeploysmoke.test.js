import { describe, it, expect } from 'vitest';
import { extractAssets, hasAppRoot, contentTypeOk, commitMatches, parseArgs } from '../scripts/smoke.mjs';
import { buildInfo } from '../scripts/buildjson.mjs';

const BASE = 'https://example.github.io/whisker-walk/';
const HTML = `<!doctype html><html><head>
<link rel="manifest" href="/whisker-walk/manifest.webmanifest" />
<link rel="icon" href="./icon.svg" type="image/svg+xml">
<script type="module" crossorigin src="/whisker-walk/assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="/whisker-walk/assets/three-def.js">
<link rel='stylesheet' crossorigin href='./assets/index-ghi.css'>
<script>window.inline = 1;</script>
</head><body><div id="app"></div></body></html>`;

describe('smoke: extractAssets', () => {
  it('finds scripts, modulepreloads, stylesheets and the manifest, resolved against the page', () => {
    expect(extractAssets(HTML, BASE)).toEqual([
      { kind: 'script', url: 'https://example.github.io/whisker-walk/assets/index-abc.js' },
      { kind: 'manifest', url: 'https://example.github.io/whisker-walk/manifest.webmanifest' },
      { kind: 'modulepreload', url: 'https://example.github.io/whisker-walk/assets/three-def.js' },
      { kind: 'stylesheet', url: 'https://example.github.io/whisker-walk/assets/index-ghi.css' },
    ]);
  });
  it('skips inline scripts, icons and data URIs, and dedupes', () => {
    const html = '<script>x</script><script src="a.js"></script><script src="a.js"></script><link rel="stylesheet" href="data:text/css,a{}">';
    expect(extractAssets(html, BASE).map((a) => a.url)).toEqual([BASE + 'a.js']);
  });
});

describe('smoke: small checks', () => {
  it('spots the app root', () => {
    expect(hasAppRoot(HTML)).toBe(true);
    expect(hasAppRoot('<div id="application"></div>')).toBe(false);
    expect(hasAppRoot('<h1>404</h1>')).toBe(false);
  });
  it('judges content types', () => {
    expect(contentTypeOk('script', 'text/javascript; charset=utf-8')).toBe(true);
    expect(contentTypeOk('script', 'text/html')).toBe(false);
    expect(contentTypeOk('stylesheet', 'text/css')).toBe(true);
    expect(contentTypeOk('stylesheet', 'text/html')).toBe(false);
    expect(contentTypeOk('manifest', 'application/manifest+json')).toBe(true);
  });
  it('compares commits by prefix, never on tiny or empty values', () => {
    const full = '0a23679d3c1f5b8e9a7c6d5e4f3a2b1c0d9e8f7a';
    expect(commitMatches(full, full)).toBe(true);
    expect(commitMatches(full, '0a23679')).toBe(true);
    expect(commitMatches('0A23679', full)).toBe(true);
    expect(commitMatches(full, 'b000ae3')).toBe(false);
    expect(commitMatches(full, '0a2')).toBe(false);
    expect(commitMatches('', full)).toBe(false);
    expect(commitMatches(undefined, undefined)).toBe(false);
  });
  it('parses arguments and adds the trailing slash', () => {
    expect(parseArgs(['http://x/y', '--commit', 'abc1234', '--retry-seconds', '0'])).toMatchObject({
      base: 'http://x/y/',
      commit: 'abc1234',
      retrySeconds: 0,
    });
    expect(() => parseArgs([])).toThrow();
  });
});

describe('build.json content', () => {
  it('prefers GITHUB_SHA and stamps a date', () => {
    const info = buildInfo({ GITHUB_SHA: 'f'.repeat(40) }, new Date('2026-11-11T10:00:00Z'));
    expect(info).toEqual({ commit: 'f'.repeat(40), date: '2026-11-11T10:00:00.000Z' });
  });
});
