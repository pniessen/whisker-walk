import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prune } from '../scripts/prune-merged-worktrees.mjs';

const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe('prune-merged-worktrees', () => {
  let root, repo;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'prune-')));
    repo = join(root, 'repo');
    g(root, 'init', '-b', 'main', repo);
    g(repo, 'config', 'user.email', 't@t'); g(repo, 'config', 'user.name', 't');
    writeFileSync(join(repo, 'a.txt'), 'a'); g(repo, 'add', '.'); g(repo, 'commit', '-m', 'init');
    // merged + clean
    g(repo, 'worktree', 'add', '-b', 'merged-clean', join(root, 'mc'));
    // merged + dirty
    g(repo, 'worktree', 'add', '-b', 'merged-dirty', join(root, 'md'));
    writeFileSync(join(root, 'md', 'x.txt'), 'x');
    // unmerged
    g(repo, 'worktree', 'add', '-b', 'unmerged', join(root, 'um'));
    writeFileSync(join(root, 'um', 'u.txt'), 'u'); g(join(root, 'um'), 'add', '.'); g(join(root, 'um'), 'commit', '-m', 'u');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('dry run changes nothing', () => {
    const r = prune({ repo, apply: false, log: () => {} });
    expect(r.prunable.map((w) => w.branch)).toEqual(['merged-clean']);
    expect(existsSync(join(root, 'mc'))).toBe(true);
    expect(g(repo, 'branch', '--list', 'merged-clean').trim()).not.toBe('');
  });

  it('apply removes only the merged clean worktree and its branch', () => {
    const r = prune({ repo, apply: true, log: () => {} });
    expect(r.removed.length).toBe(1);
    expect(existsSync(join(root, 'mc'))).toBe(false);
    expect(g(repo, 'branch', '--list', 'merged-clean').trim()).toBe('');
    for (const d of ['md', 'um']) expect(existsSync(join(root, d))).toBe(true);
    expect(g(repo, 'branch', '--list', 'unmerged').trim()).not.toBe('');
    expect(existsSync(repo)).toBe(true);
  });

  it('skips the current worktree even when merged and clean', () => {
    const r = prune({ repo: join(root, 'mc'), apply: true, log: () => {} });
    expect(r.removed).toEqual([]);
    expect(existsSync(join(root, 'mc'))).toBe(true);
  });
});
