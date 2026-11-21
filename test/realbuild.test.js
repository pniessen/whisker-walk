import { describe, it, expect, vi, afterEach } from 'vitest';

// test/helpers/realbuild.js switches NODE_ENV to production for the build and
// puts back what was there: a value, or nothing at all (never the string
// "undefined", which later code would read as a set environment).
vi.mock('vite', () => ({ build: vi.fn(async () => ({ output: [] })) }));
const { realBuild } = await import('./helpers/realbuild.js');

describe('realBuild puts NODE_ENV back as it found it', () => {
  const before = process.env.NODE_ENV;
  afterEach(() => {
    if (before === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = before;
  });

  it('unset before: unset after', async () => {
    delete process.env.NODE_ENV;
    await realBuild('production');
    expect('NODE_ENV' in process.env).toBe(false);
  });

  it('set before: the same value after', async () => {
    process.env.NODE_ENV = 'test';
    await realBuild('production');
    expect(process.env.NODE_ENV).toBe('test');
  });
});
