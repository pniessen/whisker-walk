// docs/supabase-v11-cat-login.sql, read as text (the way test/v10limits.test.js
// reads its file). Nothing here can reach a database: the file has not been run
// by anyone, and an agent never runs it.
//
// Milestone 2 writes step 1 only (revisions and the cheap question). The later
// steps add their own checks to this file when they are written.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8');
const v11 = read('supabase-v11-cat-login.sql');
const v10 = read('supabase-v10-limits.sql');
const code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\nend \\$\\$;\\n`, 'i'));
const runbookQueries = () => {
  const book = v11.slice(0, v11.indexOf('HOW IT WORKS')).replace(/^-- ?/gm, '');
  return [...book.matchAll(/^ {2}(select[\s\S]*?;)$/gm)].map((m) => m[1]);
};

describe('supabase-v11-cat-login.sql, step 1 (static)', () => {
  it('opens with a runbook that says who runs it and that agents stay off the database', () => {
    expect(v11).toMatch(/RUNBOOK/);
    expect(v11).toMatch(/RUN BY THE OWNER, ONE STEP AT A TIME\. Agents stay off the database\./);
    expect(v11).toMatch(/\n-- ══ STEP 1 — /);
  });
  it('refuses to run unless v10 has', () => {
    expect(code(v11)).toMatch(/to_regprocedure\('public\.ww_hit\(text\)'\) is null/);
    expect(code(v11)).toMatch(/raise exception 'Whisker Walk v11: v10 /);
  });
  it('adds the three columns, each "if not exists" and with a default, so old rows keep working', () => {
    for (const col of ['rev integer not null default 0', 'last_seen timestamptz not null default now()', 'v smallint not null default 1']) {
      expect(code(v11)).toContain(`alter table public.saves add column if not exists ${col};`);
    }
  });
  it('peek_save and sync_save exist, run as their owner, with the search_path pinned', () => {
    for (const name of ['peek_save', 'sync_save', 'upsert_save']) {
      const f = fn(v11, name);
      expect(f, name).not.toBeNull();
      expect(f[0].split(' as $$')[0].replace(/\s+/g, ' '), name).toMatch(/security definer set search_path = public, pg_temp$/);
    }
    const defs = code(v11).match(/create or replace function public\.[a-z_]+\([^)]*\)[\s\S]*? as \$\$/g);
    expect(defs).toHaveLength(3);
  });
  it('every new table has row-level security on and no policy (step 1 adds none; later steps must)', () => {
    const tables = [...code(v11).matchAll(/create table (?:if not exists )?public\.([a-z_]+)/g)].map((m) => m[1]);
    for (const t of tables) {
      expect(code(v11), t).toMatch(new RegExp(`alter table public\\.${t} enable row level security;`));
      expect(code(v11), t).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated;`));
    }
    expect(code(v11)).not.toMatch(/create policy|drop policy/i);
    expect(code(v11)).not.toMatch(/grant (select|insert|update|delete|all)/i);
  });
  it('revokes everything from the public roles, then grants execute to anon on the new functions only', () => {
    for (const sig of ['peek_save\\(text, text\\)', 'sync_save\\(text, text, integer, jsonb, integer\\)']) {
      expect(code(v11)).toMatch(new RegExp(`revoke execute on function public\\.${sig} from public, anon, authenticated;`));
      expect(code(v11)).toMatch(new RegExp(`grant execute on function public\\.${sig} to anon;`));
    }
    const grants = [...code(v11).matchAll(/grant execute on function public\.([a-z_]+)/g)].map((m) => m[1]);
    expect(grants.sort()).toEqual(['peek_save', 'sync_save', 'upsert_save']); // upsert_save: v10 granted it, it is replaced
    expect(code(v11)).not.toMatch(/\bto (public|authenticated)\b/i);
  });
  it("upsert_save is v10's text with exactly one line added: a revised save answers 'stale'", () => {
    const old = fn(v10, 'upsert_save')[0];
    const now = fn(v11, 'upsert_save')[0];
    const added = now.split('\n').filter((l) => !old.split('\n').includes(l)).filter((l) => !/^\s*--/.test(l));
    expect(added).toEqual(["  if existing.v >= 2 then return 'stale'; end if;"]);
    // and it comes after the secret check, so a wrong secret still answers 'denied'
    expect(now.indexOf('is distinct from p_secret')).toBeLessThan(now.indexOf('existing.v >= 2'));
    expect(old.split('\n').filter((l) => !now.split('\n').includes(l))).toEqual([]);
  });
  it('sync_save writes only when the revision it was built on is the current one, and says merge otherwise', () => {
    const body = fn(v11, 'sync_save')[0];
    expect(body).toMatch(/if p_base_rev <> existing\.rev then/);
    const merge = body.slice(body.indexOf('p_base_rev <> existing.rev'), body.indexOf('-- a catch-up leaves the photo album out'));
    expect(merge).not.toMatch(/update saves set (payload|rev|lifetime)/); // the merge answer writes nothing but last_seen
    expect(body).toMatch(/rev = existing\.rev \+ 1, v = 2/);
    expect(body).toMatch(/p_base_rev < -1/); // -1 is "this device has never synced"
  });
  it('the secret is looked at before anything about the save is returned, and a miss is counted', () => {
    for (const name of ['peek_save', 'sync_save']) {
      const body = fn(v11, name)[0];
      expect(body.indexOf('is distinct from p_secret'), name).toBeGreaterThan(-1);
      expect(body.indexOf('is distinct from p_secret'), name).toBeLessThan(body.indexOf("'ok'"));
      expect((body.match(/perform ww_hit\('load-miss'\)/g) ?? []).length, name).toBe(2); // unknown code, wrong secret
      expect(body, name).toMatch(/if ww_over\('load-miss'\) then/);
      expect(body, name).toMatch(/if not ww_hit\('sync-ok'\) then/);
    }
  });
  it('peek_save returns a few numbers, never the payload; the merge answer leaves the album out', () => {
    expect(fn(v11, 'peek_save')[0]).not.toMatch(/payload/);
    expect(fn(v11, 'sync_save')[0]).toMatch(/'payload', existing\.payload - 'album'/);
  });
  it('a write that leaves the album out keeps the one stored, and the 2 MiB cap is the same as upsert_save', () => {
    expect(fn(v11, 'sync_save')[0]).toMatch(/p_payload \|\| jsonb_build_object\('album', v_album\)/);
    expect(fn(v11, 'sync_save')[0]).toMatch(/octet_length\(p_payload::text\) > 2097152/);
  });
  it('has a limits row for sync-ok, "do nothing" on conflict so it never overwrites a number the owner changed', () => {
    const rows = [...code(v11).matchAll(/\('sync-ok',\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\)/g)].map((m) => m.slice(1).map(Number));
    expect(rows).toEqual([[3600, 120, 600, 20000], [86400, 1000, 5000, 200000]]);
    expect(code(v11)).toMatch(/on conflict \(name, window_secs\) do nothing;/);
  });
  it('touches no player data and none of the other tables: not profiles, friendships, colony_*, and no delete, drop or truncate', () => {
    expect(code(v11)).not.toMatch(/\b(profiles|friendships|colonies|colony_[a-z]+)\b/);
    expect(code(v11)).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|function|column|policy))\b/i);
    expect(code(v11)).not.toMatch(/\bupdate public\./i);
    expect(code(v11)).not.toMatch(/\bexecute\s+(format|'|\$|[a-z_]+\s*\|\|)/i);
  });
  it('says how to undo the step, and where a re-run of an older file would undo it', () => {
    expect(v11).toMatch(/\n-- Rollback: /);
    expect(v11).toContain('drop function if exists public.sync_save(text, text, integer, jsonb, integer);');
    expect(v11).toContain('drop function if exists public.peek_save(text, text);');
  });
  it("the runbook's check queries are read-only and alias every column", () => {
    const queries = runbookQueries();
    expect(queries.length).toBeGreaterThanOrEqual(7);
    for (const q of queries) {
      expect(q, q).toMatch(/^select [\s\S]*\bas [a-z_0-9]+/);
      expect(q, q).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke)\b/i);
      expect(q, q).not.toMatch(/\b(secret|code)\b(?!_)/i); // never a secret or a save code in a result
    }
  });
});
