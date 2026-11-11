#!/usr/bin/env node
// Post-deploy smoke check. Usage:
//   node scripts/smoke.mjs <baseUrl> [--commit <sha>] [--retry-seconds 150] [--interval 10]
// Only ever sends GET requests, and nothing but the URLs it is given or finds
// in the page's own HTML. Checks that the page serves the app root, that every
// script/stylesheet/modulepreload it references is real, that sw.js and the
// manifest are served, and (with --commit) that build.json names that commit.
// The whole check retries until the deadline, because the Pages CDN can lag.
import { pathToFileURL } from 'node:url';

const MIN_ASSET_BYTES = 100;

// Every URL the HTML pulls in that must exist: <script src>, and <link> with
// rel stylesheet / modulepreload / manifest. Inline scripts are skipped.
export function extractAssets(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const add = (kind, ref) => {
    if (!ref || /^(data|blob|javascript):/i.test(ref)) return;
    let url;
    try {
      url = new URL(ref, pageUrl).href;
    } catch {
      return;
    }
    if (!seen.has(url)) {
      seen.add(url);
      out.push({ kind, url });
    }
  };
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return m ? (m[1] ?? m[2] ?? m[3]) : null;
  };
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) add('script', attr(tag, 'src'));
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rels = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/);
    const kind = ['stylesheet', 'modulepreload', 'manifest'].find((k) => rels.includes(k));
    if (kind) add(kind, attr(tag, 'href'));
  }
  return out;
}

export function hasAppRoot(html) {
  return /\bid\s*=\s*["']?app["']?[\s>]/i.test(html);
}

// Is a served content type believable for this kind of file?
export function contentTypeOk(kind, contentType) {
  const ct = (contentType || '').toLowerCase();
  if (kind === 'script') return /javascript|ecmascript/.test(ct);
  if (kind === 'modulepreload') return /javascript|ecmascript/.test(ct);
  if (kind === 'stylesheet') return ct.includes('text/css');
  if (kind === 'manifest') return /json/.test(ct);
  if (kind === 'html') return ct.includes('text/html');
  return true;
}

// build.json holds the full commit sha; accept a short sha on either side
// (at least 7 chars) so `--commit abc1234` works by hand.
export function commitMatches(actual, expected) {
  const a = String(actual || '').trim().toLowerCase();
  const e = String(expected || '').trim().toLowerCase();
  if (a.length < 7 || e.length < 7) return false;
  return a.startsWith(e) || e.startsWith(a);
}

export function parseArgs(argv) {
  const opts = { base: null, commit: null, retrySeconds: 150, interval: 10 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') opts.commit = argv[++i];
    else if (a === '--retry-seconds') opts.retrySeconds = Number(argv[++i]);
    else if (a === '--interval') opts.interval = Number(argv[++i]);
    else if (!opts.base) opts.base = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (!opts.base) throw new Error('usage: smoke.mjs <baseUrl> [--commit <sha>] [--retry-seconds N] [--interval N]');
  if (!opts.base.endsWith('/')) opts.base += '/';
  if (!Number.isFinite(opts.retrySeconds) || !Number.isFinite(opts.interval)) throw new Error('retry options must be numbers');
  return opts;
}

// A cache-busting query keeps the CDN from answering with a stale copy.
const bust = (url) => url + (url.includes('?') ? '&' : '?') + 'smoke=' + Date.now();

async function get(url) {
  const res = await fetch(bust(url), { method: 'GET', redirect: 'follow', cache: 'no-store' });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type') || '', body };
}

// One full pass. Returns a list of problem strings (empty = healthy).
export async function runChecks({ base, commit }, log = () => {}) {
  const problems = [];
  const check = async (kind, url, { minBytes = MIN_ASSET_BYTES } = {}) => {
    try {
      const r = await get(url);
      if (r.status !== 200) problems.push(`${kind} ${url}: HTTP ${r.status}`);
      else if (!contentTypeOk(kind, r.type)) problems.push(`${kind} ${url}: odd content type "${r.type}"`);
      else if (r.body.length < minBytes) problems.push(`${kind} ${url}: only ${r.body.length} bytes`);
      else log(`ok  ${kind} ${url} (${r.body.length} bytes)`);
      return r;
    } catch (err) {
      problems.push(`${kind} ${url}: ${err.message}`);
      return null;
    }
  };

  const page = await check('html', base, { minBytes: 500 });
  if (page && page.status === 200) {
    const html = page.body.toString('utf8');
    if (!hasAppRoot(html)) problems.push(`html ${base}: no #app root element`);
    const assets = extractAssets(html, base);
    if (!assets.some((a) => a.kind === 'script')) problems.push(`html ${base}: references no scripts`);
    for (const a of assets) {
      const r = await check(a.kind, a.url);
      if (a.kind === 'manifest' && r && r.status === 200) {
        try {
          JSON.parse(r.body.toString('utf8'));
        } catch {
          problems.push(`manifest ${a.url}: not valid JSON`);
        }
      }
    }
  }
  const sw = new URL('sw.js', base).href;
  await check('script', sw);

  if (commit) {
    const url = new URL('build.json', base).href;
    try {
      const r = await get(url);
      if (r.status !== 200) problems.push(`build ${url}: HTTP ${r.status}`);
      else {
        const info = JSON.parse(r.body.toString('utf8'));
        if (commitMatches(info.commit, commit)) log(`ok  build ${url} is commit ${String(info.commit).slice(0, 7)} (${info.date})`);
        else problems.push(`build ${url}: live site is commit ${String(info.commit).slice(0, 7)}, expected ${commit.slice(0, 7)}`);
      }
    } catch (err) {
      problems.push(`build ${url}: ${err.message}`);
    }
  }
  return problems;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const deadline = Date.now() + opts.retrySeconds * 1000;
  let attempt = 0;
  for (;;) {
    attempt++;
    console.log(`Smoke check ${opts.base} (attempt ${attempt})`);
    const problems = await runChecks(opts, (m) => console.log('  ' + m));
    if (!problems.length) {
      console.log('Smoke check passed.');
      return;
    }
    for (const p of problems) console.log('  FAIL ' + p);
    if (Date.now() + opts.interval * 1000 > deadline) {
      for (const p of problems) console.log(`::error title=Smoke check failed::${p}`);
      console.error(`Smoke check FAILED after ${attempt} attempt(s).`);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, opts.interval * 1000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(2);
  });
}
