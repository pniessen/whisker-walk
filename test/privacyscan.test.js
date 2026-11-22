import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scan } from '../scripts/privacy-scan.mjs';

// scripts/privacy-scan.mjs looks for the strings in a gitignored denylist in tracked files, commit
// messages and the built bundles. The test uses a harmless dummy string and a throwaway repository,
// never a real denylist (private-edition milestone 0, Task 5).
const NEEDLE = 'zz-dummy-needle-17';
let dir;
const git = (...args) => execFileSync('git', ['-c', 'user.email=t@example.invalid', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'pipe' }).toString();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ww-privacy-'));
  git('init', '-q');
  writeFileSync(join(dir, 'README.txt'), 'nothing to see\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'first commit');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const withList = (...lines) => {
  const p = join(dir, 'denylist.txt');
  writeFileSync(p, `# a comment\n\n${lines.join('\n')}\n`);
  return p;
};

describe('privacy scan', () => {
  it('is clean when nothing matches', () => {
    expect(scan({ root: dir, denylistPath: withList(NEEDLE) })).toEqual({ ok: true, missing: false, findings: [] });
  });

  it('finds a string in a tracked file, case-insensitively, and names the file and the list line, not the string', () => {
    writeFileSync(join(dir, 'notes.txt'), `Some ${NEEDLE.toUpperCase()} here\n`);
    git('add', '-A');
    git('commit', '-q', '-m', 'add notes');
    const r = scan({ root: dir, denylistPath: withList(NEEDLE) });
    expect(r.ok).toBe(false);
    expect(r.findings).toEqual([{ where: 'file', name: 'notes.txt', line: 3 }]);
    expect(JSON.stringify(r)).not.toContain(NEEDLE);
  });

  it('finds a string in a commit message', () => {
    writeFileSync(join(dir, 'a.txt'), 'x\n');
    git('add', '-A');
    git('commit', '-q', '-m', `mention ${NEEDLE}`);
    const r = scan({ root: dir, denylistPath: withList(NEEDLE) });
    expect(r.findings.map((f) => f.where)).toEqual(['commit']);
  });

  it('finds a string in the built bundles dist/ and dist-family/ (text files only)', () => {
    for (const d of ['dist', 'dist-family']) {
      mkdirSync(join(dir, d, 'assets'), { recursive: true });
      writeFileSync(join(dir, d, 'assets', 'x.js'), `var a="${NEEDLE}";`);
    }
    writeFileSync(join(dir, 'dist', 'assets', 'pic.png'), Buffer.from(NEEDLE));
    const r = scan({ root: dir, denylistPath: withList(NEEDLE) });
    expect(r.findings.map((f) => `${f.where}:${f.name}`).sort()).toEqual(['bundle:dist-family/assets/x.js', 'bundle:dist/assets/x.js']);
  });

  it('does not scan the denylist file itself or an untracked file outside the bundles', () => {
    writeFileSync(join(dir, 'untracked.txt'), NEEDLE);
    expect(scan({ root: dir, denylistPath: withList(NEEDLE) }).ok).toBe(true);
  });

  it('reports a missing denylist as not ok, so a local run cannot pass without one', () => {
    expect(scan({ root: dir, denylistPath: join(dir, 'nope.txt') })).toEqual({ ok: false, missing: true, findings: [] });
  });

  it('a denylist of only comments and blanks is not ok either', () => {
    expect(scan({ root: dir, denylistPath: withList() }).ok).toBe(false);
  });
});
