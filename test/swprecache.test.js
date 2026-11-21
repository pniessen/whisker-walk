import { describe, it, expect } from 'vitest';
import { makeEnv, startWorker, deployWorker, url } from './helpers/fakesw.js';

// The real public/sw.js, run against fake caches and a fake network
// (test/helpers/fakesw.js). Each deploy is a new worker sharing the origin's
// caches, as on a real device.
const CACHE = 'whisker-v2';
const files = (b) => [`assets/index-${b}.js`, `assets/woods-${b}.js`, `assets/index-${b}.css`];
const has = async (env, path) => (await env.cached(CACHE)).includes(url(path));
const builds = async (env) => (await env.cached(CACHE)).filter((u) => u.includes('/__builds/'));

describe('install', () => {
  it('install caches the shell, every listed file and the build list', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js', 'assets/b.js']);
    await deployWorker(env);
    for (const p of ['', 'index.html', 'assets/a.js', 'assets/b.js']) expect(await has(env, p), p).toBe(true);
    expect(await builds(env)).toEqual([url('__builds/b1')]);
    const list = await (await env.caches.match(url('__builds/b1'))).json();
    expect(list.files).toEqual(['assets/a.js', 'assets/b.js']);
    const pre = env.net.requests.find((r) => r.url === url('precache.json'));
    expect(pre.init).toMatchObject({ cache: 'no-store' });
  });

  it('one missing file does not stop the rest, and install still succeeds', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js', 'assets/b.js']);
    env.net.unserve('assets/b.js');
    const w = startWorker(env);
    await expect(w.install()).resolves.toBeUndefined();
    expect(await has(env, 'assets/a.js')).toBe(true);
    expect(await has(env, 'assets/b.js')).toBe(false);
  });

  it('a missing or broken precache.json never fails install', async () => {
    for (const body of [null, 'not json', '{"build":"b1"}']) {
      const env = makeEnv();
      if (body !== null) env.net.serve('precache.json', body);
      await expect(startWorker(env).install()).resolves.toBeUndefined();
      expect(await has(env, 'index.html')).toBe(true);
      expect(await builds(env)).toEqual([]);
    }
  });

  it('offline at install, the next online page load fills the gaps', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js', 'assets/b.js']);
    env.net.online = false;
    const w = await deployWorker(env);
    expect(await has(env, 'assets/a.js')).toBe(false);
    env.net.online = true;
    await w.navigate();
    expect(await has(env, 'assets/a.js')).toBe(true);
    expect(await has(env, 'assets/b.js')).toBe(true);
    expect(await builds(env)).toEqual([url('__builds/b1')]);
  });
});

describe('offline play', () => {
  it("after one online visit, a place's chunk is served offline", async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/index-1.js', 'assets/woods-x.js']);
    const w = await deployWorker(env);
    env.net.online = false;
    const res = await w.request('assets/woods-x.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('/* assets/woods-x.js */');
  });

  it('offline, a file never cached fails the fetch (the page shows its gentle offline line)', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js']);
    const w = await deployWorker(env);
    env.net.online = false;
    await expect(w.request('assets/never-x.js')).rejects.toThrow();
  });

  it('offline, a page load gets the cached shell', async () => {
    const env = makeEnv();
    env.net.deploy('b1', ['assets/a.js']);
    const w = await deployWorker(env);
    env.net.online = false;
    const res = await w.navigate();
    expect(res.status).toBe(200);
  });

  it('a page left open across a deploy still enters a new place: the old build\'s chunk comes from the cache', async () => {
    const env = makeEnv();
    env.net.deploy('A', files('A'));
    await deployWorker(env); // the page is open on build A
    env.net.deploy('B', files('B')); // CI deploys B: A's chunks now 404 on Pages
    const wB = await deployWorker(env);
    expect((await env.net.fetch(url('assets/woods-A.js'))).status).toBe(404);
    const res = await wB.request('assets/woods-A.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('/* assets/woods-A.js */');
    expect(await has(env, 'assets/woods-B.js')).toBe(true);
  });
});

describe('pruning by build list', () => {
  it("activate keeps the newest three builds' files and drops the rest", async () => {
    const env = makeEnv();
    env.net.serve('places/park.jpg');
    env.net.serve('sounds/x');
    const w0 = startWorker(env);
    for (const b of ['1', '2', '3', '4']) {
      env.net.deploy(b, files(b));
      if (b === '1') {
        await w0.install();
        await w0.activate();
        await w0.request('places/park.jpg');
        await w0.request('sounds/x');
      } else await deployWorker(env);
    }
    for (const f of files('1')) expect(await has(env, f), f).toBe(false);
    for (const b of ['2', '3', '4']) for (const f of files(b)) expect(await has(env, f), f).toBe(true);
    for (const p of ['', 'index.html', 'places/park.jpg', 'sounds/x']) expect(await has(env, p), p).toBe(true);
    expect(await builds(env)).toEqual(['2', '3', '4'].map((b) => url(`__builds/${b}`)));
  });

  it('activate with no build list prunes nothing', async () => {
    const env = makeEnv();
    const old = await env.caches.open(CACHE);
    for (let i = 0; i < 30; i++) {
      env.net.serve(`assets/old-${i}.js`);
      await old.add(url(`assets/old-${i}.js`));
    }
    await deployWorker(env); // no precache.json on the site
    for (let i = 0; i < 30; i++) expect(await has(env, `assets/old-${i}.js`)).toBe(true);
  });

  it('a worker that could not read the build list prunes nothing at activate', async () => {
    const env = makeEnv();
    for (const b of ['1', '2', '3']) {
      env.net.deploy(b, files(b));
      await deployWorker(env);
    }
    const w = startWorker(env);
    await w.request('assets/woods-3.js');
    env.net.deploy('4', files('4'));
    const page = await w.request('assets/woods-4.js'); // the open page fetched build 4's chunk
    expect(page.status).toBe(200);
    env.net.unserve('precache.json');
    await deployWorker(env);
    expect(await has(env, 'assets/woods-4.js')).toBe(true);
    expect(await has(env, 'assets/woods-1.js')).toBe(true);
  });

  it('a worker that missed updates still keeps three builds: page-load top-ups store each list and prune', async () => {
    const env = makeEnv();
    env.net.deploy('1', files('1'));
    const w = await deployWorker(env);
    for (const b of ['2', '3', '4']) {
      env.net.deploy(b, files(b));
      await w.navigate(); // the same old worker sees each new build only by page loads
    }
    for (const f of files('1')) expect(await has(env, f), f).toBe(false);
    for (const b of ['2', '3', '4']) for (const f of files(b)) expect(await has(env, f), f).toBe(true);
    expect(await builds(env)).toEqual(['2', '3', '4'].map((b) => url(`__builds/${b}`)));
  });

  it('a build list is stored once, so order is when each build was first seen', async () => {
    const env = makeEnv();
    const w = startWorker(env);
    for (const b of ['1', '2', '3', '1', '4']) {
      env.net.deploy(b, files(b));
      await w.navigate();
    }
    expect(await builds(env)).toEqual(['2', '3', '4'].map((b) => url(`__builds/${b}`)));
    expect(await has(env, 'assets/woods-1.js')).toBe(false);
  });

  it('caching a page-fetched chunk never prunes by count', async () => {
    const env = makeEnv();
    env.net.deploy('1', files('1'));
    const w = await deployWorker(env);
    for (let i = 0; i < 30; i++) {
      env.net.serve(`assets/extra-${i}.js`);
      await w.request(`assets/extra-${i}.js`);
    }
    for (let i = 0; i < 30; i++) expect(await has(env, `assets/extra-${i}.js`)).toBe(true);
    for (const f of files('1')) expect(await has(env, f)).toBe(true);
  });
});

describe('what the worker leaves alone', () => {
  it('the first F6 deploy drops the old whisker-v1 cache', async () => {
    const env = makeEnv();
    await (await env.caches.open('whisker-v1')).put(url('assets/old.js'), new Response('x'));
    await deployWorker(env);
    expect(await env.caches.keys()).toEqual([CACHE]);
  });

  it('never intercepts cross-origin requests or non-GET', async () => {
    const env = makeEnv();
    const w = await deployWorker(env);
    expect(await w.request('https://db.example.com/rest/v1/cats')).toBe('network');
    expect(await w.request('assets/a.js', { method: 'POST' })).toBe('network');
  });

  it('a 404 is never cached, so the chunk is fetched again next time', async () => {
    const env = makeEnv();
    const w = await deployWorker(env);
    expect((await w.request('assets/late.js')).status).toBe(404);
    expect(await has(env, 'assets/late.js')).toBe(false);
    env.net.serve('assets/late.js');
    expect((await w.request('assets/late.js')).status).toBe(200);
  });

  it('page loads go to the network first', async () => {
    const env = makeEnv();
    env.net.deploy('1', files('1'));
    const w = await deployWorker(env);
    env.net.serve('', 'fresh page');
    expect(await (await w.navigate()).text()).toBe('fresh page');
  });
});
