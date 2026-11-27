import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeEnv, startWorker, deployWorker, url } from './helpers/fakesw.js';

afterEach(() => vi.useRealTimers());

describe('navigation timeout (L1)', () => {
  it('a fetch that never resolves returns the cached shell after 4 s', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js']);
    env.net.serve('index.html', '<html>shell</html>');
    env.net.serve('', '<html>shell</html>'); // (the scope URL and index.html are the same page; the worker caches both)
    const w = await deployWorker(env);
    env.net.fetch = () => new Promise(() => {});
    vi.useFakeTimers();
    let done = null;
    const p = w.navigate('').then((r) => (done = r));
    await vi.advanceTimersByTimeAsync(3900);
    expect(done).toBe(null);
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(await done.text()).toBe('<html>shell</html>');
  });

  it('keeps the network result when it wins, and never caches an error', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js']);
    const w = await deployWorker(env);
    env.net.serve('', 'fresh');
    expect(await (await w.navigate('')).text()).toBe('fresh');
    env.net.files.delete(url(''));
    const r = await w.navigate('');
    expect(r.status).toBe(404);
    expect(await env.cached('whisker-v2')).not.toContain(url('?x=1'));
    expect(await (await env.caches.match(url(''))).text()).toBe('fresh');
  });
});

describe('precache pool (L2)', () => {
  it('never more than 3 fetches in flight, and the shell goes first', async () => {
    const env = makeEnv();
    const files = Array.from({ length: 12 }, (_, i) => `assets/f${i}.js`);
    env.net.deploy('b1', files);
    let live = 0, max = 0;
    const order = [];
    const base = env.net.fetch.bind(env.net);
    env.net.fetch = async (i, o) => {
      const u = typeof i === 'string' ? i : i.url;
      if (u.includes('/assets/')) {
        order.push(u);
        live++; max = Math.max(max, live);
        await new Promise((r) => setTimeout(r, 5));
        live--;
      }
      return base(i, o);
    };
    await startWorker(env).install();
    expect(order.length).toBe(12);
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBeGreaterThan(1);
  });
});
