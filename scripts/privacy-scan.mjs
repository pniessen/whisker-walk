// Looks for private strings (the family home's address, town, listing words, prices, real names) in what
// the repository holds or ships: tracked files, commit messages, and the built bundles dist/ and
// dist-family/. The strings are one per line in private-denylist.local.txt, which is gitignored and never
// committed; without it the scan prints a warning and fails, so a local run cannot pass by having no list.
// It reports where something matched and which line of the list, never the string itself.
//
//   node scripts/privacy-scan.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT = /\.(js|mjs|cjs|html|json|css|md|txt|yml|yaml|svg|webmanifest|map|sql|toml|xml|csv)$/i;
const DENYLIST = 'private-denylist.local.txt';

function readDenylist(path) {
  if (!existsSync(path)) return null;
  const out = [];
  readFileSync(path, 'utf8').split('\n').forEach((raw, i) => {
    const s = raw.trim();
    if (s && !s.startsWith('#')) out.push({ needle: s.toLowerCase(), line: i + 1 });
  });
  return out;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const git = (root, args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 }).toString();

export function scan({ root = process.cwd(), denylistPath = join(root, DENYLIST) } = {}) {
  const list = readDenylist(denylistPath);
  if (!list || !list.length) return { ok: false, missing: true, findings: [] };
  const findings = [];
  const check = (text, where, name) => {
    const low = text.toLowerCase();
    for (const { needle, line } of list) if (low.includes(needle)) findings.push({ where, name, line });
  };
  // tracked files (the denylist itself is gitignored, so never listed; skip it anyway)
  for (const file of git(root, ['ls-files', '-z']).split('\0').filter(Boolean)) {
    if (!TEXT.test(file) || basename(file) === DENYLIST) continue;
    try { check(readFileSync(join(root, file), 'utf8'), 'file', file); } catch { /* deleted but still indexed */ }
  }
  // every commit's message
  const log = git(root, ['log', '--all', '--format=%H%x1f%B%x1e']).split('\x1e').map((r) => r.trim()).filter(Boolean);
  for (const rec of log) {
    const [hash, body = ''] = rec.split('\x1f');
    check(body, 'commit', hash.slice(0, 10));
  }
  // the built bundles
  for (const d of ['dist', 'dist-family']) {
    for (const p of walk(join(root, d))) {
      if (!TEXT.test(p)) continue;
      check(readFileSync(p, 'utf8'), 'bundle', relative(root, p));
    }
  }
  return { ok: findings.length === 0, missing: false, findings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = scan();
  if (r.missing) {
    console.warn(`privacy-scan: no ${DENYLIST} (or it has no strings). Create it, one string per line; it is gitignored.`);
    process.exit(1);
  }
  for (const f of r.findings) console.error(`privacy-scan: ${f.where} ${f.name} matches line ${f.line} of ${DENYLIST}`);
  console.log(r.ok ? 'privacy-scan: clean' : `privacy-scan: ${r.findings.length} match(es)`);
  process.exit(r.ok ? 0 : 1);
}
