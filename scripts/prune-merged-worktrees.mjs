// Prune worktrees whose branch is fully merged into main and which have no changes.
// Default is a dry run. Pass --apply to remove. Usage: node scripts/prune-merged-worktrees.mjs [--apply] [--repo DIR] [--main BRANCH]
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const real = (p) => { try { return realpathSync(p); } catch { return p; } };

export function listWorktrees(cwd) {
  const out = git(cwd, 'worktree', 'list', '--porcelain');
  return out.split('\n\n').filter(Boolean).map((blk) => {
    const w = {};
    for (const line of blk.split('\n')) {
      if (line.startsWith('worktree ')) w.path = line.slice(9);
      else if (line.startsWith('HEAD ')) w.head = line.slice(5);
      else if (line.startsWith('branch ')) w.branch = line.slice(7).replace(/^refs\/heads\//, '');
      else if (line === 'detached') w.detached = true;
      else if (line === 'bare') w.bare = true;
    }
    return w;
  });
}

export function prune({ repo = process.cwd(), main = 'main', apply = false, log = console.log } = {}) {
  const wts = listWorktrees(repo);
  const here = real(git(repo, 'rev-parse', '--show-toplevel').trim());
  const result = { listed: wts.length, prunable: [], skipped: [], removed: [] };
  for (const w of wts) {
    const p = real(w.path);
    const skip = (why) => { result.skipped.push({ path: w.path, why }); log(`skip   ${w.path} (${why})`); };
    if (w.bare) { skip('bare'); continue; }
    if (w.branch === main) { skip('main'); continue; }
    if (p === here) { skip('current worktree'); continue; }
    if (!w.branch) { skip('detached HEAD'); continue; }
    let merged = true;
    try { git(repo, 'merge-base', '--is-ancestor', w.head, main); } catch { merged = false; }
    if (!merged) { skip('not merged into ' + main); continue; }
    let dirty;
    try { dirty = git(w.path, 'status', '--porcelain').trim(); } catch { skip('cannot read status'); continue; }
    if (dirty) { skip('has changes'); continue; }
    result.prunable.push(w);
    if (!apply) { log(`would remove ${w.path} and delete branch ${w.branch}`); continue; }
    git(repo, 'worktree', 'remove', w.path);
    try { git(repo, 'branch', '-d', w.branch); } catch (e) { log(`kept branch ${w.branch}: ${String(e.stderr || e).trim()}`); }
    result.removed.push(w.path);
    log(`removed ${w.path} and branch ${w.branch}`);
  }
  log(`${apply ? 'applied' : 'dry run'}: ${result.listed} worktrees, ${result.prunable.length} prunable, ${result.skipped.length} skipped`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const val = (f) => (a.includes(f) ? a[a.indexOf(f) + 1] : undefined);
  prune({ repo: val('--repo') || process.cwd(), main: val('--main') || 'main', apply: a.includes('--apply') && !a.includes('--dry-run') });
}
