import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The private family build is a vite mode with its own flag (private-edition milestone 0, Task 3).
const config = await import('../vite.config.js');

const resolve = (command, mode) => config.default({ command, mode });

describe('the private family build flag', () => {
  it('exports the mode and its out dir', () => {
    expect(config.FAMILY_MODE).toBe('family');
    expect(config.FAMILY_OUT_DIR).toBe('dist-family');
  });

  it('mode family builds into dist-family with a relative base and __PRIVATE_FAMILY__ true', () => {
    const c = resolve('build', 'family');
    expect(c.build.outDir).toBe('dist-family');
    expect(c.base).toBe('./');
    expect(c.define.__PRIVATE_FAMILY__).toBe('true');
  });

  it('every other mode defines it false and keeps its own out dir and base', () => {
    for (const [command, mode] of [['build', 'production'], ['serve', 'development'], ['build', 'ios'], ['serve', 'test']]) {
      expect(resolve(command, mode).define.__PRIVATE_FAMILY__).toBe('false');
    }
    expect(resolve('build', 'production').base).toBe('/whisker-walk/');
    expect(resolve('build', 'production').build.outDir).toBeUndefined();
    expect(resolve('build', 'ios').build.outDir).toBe('ios/web');
  });

  it('the family build does not get the offline service worker of the public site', () => {
    const names = resolve('build', 'family').plugins.flat().map((p) => p?.name);
    expect(names).not.toContain('precache-list');
  });

  it('has the scripts and the ignore line', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts['build:family']).toBe('vite build --mode family');
    expect(pkg.scripts['preview:family']).toBe('vite preview --host --outDir dist-family');
    expect(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split('\n')).toContain('dist-family/');
  });

  it('is false in the test run, and the public area registry has no family loader', async () => {
    expect(__PRIVATE_FAMILY__).toBe(false);
    const { AREA_LOADERS } = await import('../src/world/areas.js');
    expect(Object.keys(AREA_LOADERS)).not.toContain('family');
  });
});
