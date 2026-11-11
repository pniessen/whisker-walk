import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createSession, SESSION_FIELDS } from '../src/game/session.js';

const SRC = new URL('../src/', import.meta.url).pathname;

function jsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

// Assignments (=, +=, -=, ??=, ||=, &&=) to a session field, not comparisons
// or arrows. `session.x` anywhere in src/; and in the files whose helpers take
// the session as a short parameter (`s`, `sess`), those too — in these files
// `s`/`sess` is always the walk session.
const ASSIGN = (recv) => new RegExp(`\\b(?:${recv})\\.([A-Za-z_$][\\w$]*)\\s*(?:[-+?|&]{0,2})=(?![=>])`, 'g');
const SHORT_RECEIVER_FILES = ['game/avatar.js', 'game/interactions.js', 'game/netevents.js', 'game/clanfight.js', 'game/crossing.js'];

function assignedNames() {
  const found = new Map(); // name → first file:line
  const scan = (file, re) => {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        if (!found.has(m[1])) found.set(m[1], `${file.slice(SRC.length)}:${i + 1}`);
      }
    });
  };
  for (const f of jsFiles(SRC)) scan(f, ASSIGN('session|mySession'));
  for (const f of SHORT_RECEIVER_FILES) scan(join(SRC, f), ASSIGN('s|sess'));
  return found;
}

describe('createSession', () => {
  it('has every field present from the start; passed ones keep their values, the rest are undefined', () => {
    const scene = {};
    const s = createSession({ scene, rest: null, batCount: 0 });
    expect(Object.keys(s).sort()).toEqual([...SESSION_FIELDS].sort());
    expect(s.scene).toBe(scene);
    expect(s.rest).toBeNull();
    expect(s.batCount).toBe(0);
    expect('net' in s).toBe(true);
    expect(s.net).toBeUndefined();
  });

  it('throws on an unknown key (a typo at construction)', () => {
    expect(() => createSession({ scnee: {} })).toThrow(/unknown session field "scnee"/);
  });

  it('stays a plain mutable object: any field can still be assigned later', () => {
    const s = createSession({});
    s.net = { ok: true };
    s.notAField = 1; // not sealed: production never throws on assignment
    expect(s.net.ok).toBe(true);
    expect(Object.isSealed(s)).toBe(false);
  });

  it('names no field twice', () => {
    expect(new Set(SESSION_FIELDS).size).toBe(SESSION_FIELDS.length);
    expect(Object.isFrozen(SESSION_FIELDS)).toBe(true);
  });

  it('lists every field that src/ assigns on a session', () => {
    const missing = [...assignedNames()].filter(([name]) => !SESSION_FIELDS.includes(name));
    expect(missing.map(([name, at]) => `${name} (${at})`), 'add these to src/game/session.js').toEqual([]);
  });

  it('startWalk builds its session through createSession', () => {
    const walk = readFileSync(join(SRC, 'game/walk.js'), 'utf8');
    expect(walk).toContain("import { createSession } from './session.js';");
    expect(walk).toMatch(/const session = createSession\(\{/);
    expect(walk).not.toMatch(/const session = \{/);
  });
});
