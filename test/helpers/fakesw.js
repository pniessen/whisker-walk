import { readFileSync } from 'node:fs';

// Runs the real public/sw.js against fakes: a Map-backed `caches` (insertion
// order, as the Cache API keeps it), an event-listener registry, events whose
// waitUntil/respondWith promises are collected, and a network stub keyed by
// URL (a missing URL is a 404; `net.online = false` makes every fetch reject,
// as the browser does offline). Several workers can share one env, the way
// successive deploys share one origin's caches.
const SRC = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

export const SCOPE = 'https://x.test/whisker-walk/';
export const url = (path) => new URL(path, SCOPE).href;

class FakeCache {
  constructor(net) {
    this.net = net;
    this.map = new Map();
  }
  async match(req) {
    const r = this.map.get(typeof req === 'string' ? req : req.url);
    return r ? r.clone() : undefined;
  }
  async put(req, res) {
    const key = typeof req === 'string' ? req : req.url;
    this.map.delete(key); // a put moves the entry to the end, as the Cache API does
    this.map.set(key, res.clone());
  }
  async add(req) {
    const res = await this.net.fetch(req);
    if (!res.ok) throw new TypeError(`add failed: ${res.status}`);
    await this.put(req, res);
  }
  async delete(req) {
    return this.map.delete(typeof req === 'string' ? req : req.url);
  }
  async keys() {
    return [...this.map.keys()].map((u) => ({ url: u }));
  }
}

class FakeCaches {
  constructor(net) {
    this.net = net;
    this.stores = new Map();
  }
  async open(name) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache(this.net));
    return this.stores.get(name);
  }
  async keys() {
    return [...this.stores.keys()];
  }
  async delete(name) {
    return this.stores.delete(name);
  }
  async match(req) {
    for (const c of this.stores.values()) {
      const r = await c.match(req);
      if (r) return r;
    }
    return undefined;
  }
}

function contentType(u) {
  if (u.endsWith('.js')) return 'text/javascript';
  if (u.endsWith('.css')) return 'text/css';
  if (u.endsWith('.json')) return 'application/json';
  return 'text/html';
}

/** One origin: the network (files by URL), its online switch, and the caches every worker shares. */
export function makeEnv() {
  const net = {
    online: true,
    files: new Map(),
    requests: [],
    serve(path, body = `/* ${path} */`) {
      this.files.set(url(path), body);
    },
    unserve(path) {
      this.files.delete(url(path));
    },
    // A deploy replaces the whole site: precache.json names the new files, and
    // every other build's hashed files 404 from now on.
    deploy(build, files) {
      for (const k of [...this.files.keys()]) if (k.includes('/assets/') || k.endsWith('/precache.json')) this.files.delete(k);
      this.serve('precache.json', JSON.stringify({ build, files }));
      for (const f of files) this.serve(f);
    },
    async fetch(input, init) {
      const u = typeof input === 'string' ? input : input.url;
      this.requests.push({ url: u, init });
      if (!this.online) throw new TypeError('Failed to fetch');
      if (!this.files.has(u)) return new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } });
      return new Response(this.files.get(u), { status: 200, headers: { 'content-type': contentType(u) } });
    },
  };
  net.serve('');
  net.serve('index.html');
  const caches = new FakeCaches(net);
  return {
    net,
    caches,
    /** The URLs in the worker's cache(s), in order. */
    async cached(name) {
      const names = name ? [name] : [...caches.stores.keys()];
      const out = [];
      for (const n of names) if (caches.stores.has(n)) out.push(...caches.stores.get(n).map.keys());
      return out;
    },
  };
}

// Settles every promise an event handed to waitUntil, including ones added
// while the earlier ones ran (a top-up started from inside respondWith).
async function drain(waits) {
  for (let i = 0; i < waits.length; i++) await waits[i].catch(() => {});
  await new Promise((r) => setTimeout(r, 0));
}

/** A fresh worker running the real sw.js in env. */
export function startWorker(env) {
  const listeners = {};
  const self = {
    registration: { scope: SCOPE },
    location: new URL(SCOPE),
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
  };
  new Function('self', 'caches', 'fetch', 'URL', 'Response', SRC)(self, env.caches, (i, o) => env.net.fetch(i, o), URL, Response);

  const lifecycle = async (type) => {
    const waits = [];
    let failed = null;
    listeners[type]({ waitUntil: (p) => waits.push(Promise.resolve(p).catch((e) => { failed = e; })) });
    await drain(waits);
    if (failed) throw failed;
  };

  return {
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    /** A page request through the worker: the Response it answers with, 'network' if it let the request pass, or the rejection. */
    async request(path, { mode = 'no-cors', method = 'GET', accept = '*/*' } = {}) {
      const u = /^https?:/.test(path) ? path : url(path);
      const request = { url: u, method, mode, headers: new Headers({ accept }) };
      const waits = [];
      let answer = null;
      listeners.fetch({ request, respondWith: (p) => { answer = Promise.resolve(p); }, waitUntil: (p) => waits.push(Promise.resolve(p)) });
      if (!answer) {
        await drain(waits);
        return 'network';
      }
      try {
        return await answer;
      } finally {
        await drain(waits);
      }
    },
    navigate(path = '') {
      return this.request(path, { mode: 'navigate', accept: 'text/html' });
    },
  };
}

/** A worker installed and activated, as a deploy's new worker is. */
export async function deployWorker(env) {
  const w = startWorker(env);
  await w.install();
  await w.activate();
  return w;
}
