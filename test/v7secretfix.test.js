// Static checks on docs/supabase-v7-secret-fix.sql, the owner-run fix for the
// v7 NULL-secret bypass (final review I2). Like colonysql.test.js, the SQL is
// never run in CI; this pins what the file must say. It was proven against a
// real Postgres (PGlite) by hand: see the fix report.
//
// The bypass: `existing.secret <> p_secret` is NULL, not true, when p_secret is
// NULL, so the "denied" branch was skipped. The fix uses `is distinct from`,
// which is true for NULL.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const fix = readFileSync(new URL('../docs/supabase-v7-secret-fix.sql', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../docs/supabase-setup.sql', import.meta.url), 'utf8');
const FUNCS = ['upsert_save', 'upsert_profile', 'record_friend_greet'];
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?end \\$\\$;`, 'i'));
// The body with the secret check, the search_path and comments taken out, and
// whitespace collapsed: what must be IDENTICAL between the two files.
const core = (text) => text
  .replace(/--[^\n]*/g, '')
  .replace(/set search_path = [^$]*?as \$\$/i, 'as $$')
  .replace(/existing\.secret (<>|is distinct from) p_secret/gi, 'SECRET_CHECK')
  .replace(/me\.secret (<>|is distinct from) p_my_secret/gi, 'SECRET_CHECK')
  .replace(/\s+/g, ' ')
  .trim();

describe('supabase-v7-secret-fix.sql', () => {
  it('recreates exactly the three v7 RPCs, with the v7 argument lists', () => {
    const made = [...fix.matchAll(/create or replace function public\.([a-z_]+)\(/gi)].map((m) => m[1]);
    expect(made).toEqual(FUNCS);
    for (const name of FUNCS) expect(fn(fix, name)[1], name).toBe(fn(setup, name)[1]);
  });
  it('checks the secret with "is distinct from", so a NULL secret is refused', () => {
    for (const name of FUNCS) {
      const body = fn(fix, name)[0];
      expect(body, name).toMatch(/secret is distinct from p_(my_)?secret/i);
      expect(body.replace(/--[^\n]*/g, ''), name).not.toMatch(/secret\s*<>/i);
    }
  });
  it('pins search_path to public, pg_temp', () => {
    for (const name of FUNCS) expect(fn(fix, name)[0], name).toMatch(/security definer set search_path = public, pg_temp as \$\$/i);
  });
  it('changes nothing else in the three functions', () => {
    for (const name of FUNCS) expect(core(fn(fix, name)[0]), name).toBe(core(fn(setup, name)[0]));
  });
  it('keeps the anon grants, and touches no table', () => {
    for (const name of FUNCS) expect(fix).toMatch(new RegExp(`grant execute on function public\\.${name} to anon;`, 'i'));
    expect(fix.replace(/--[^\n]*/g, '')).not.toMatch(/create table|alter table|drop |delete from|create policy|revoke /i);
  });
  it('the v7 setup file points at it, and still behaves as it did', () => {
    expect(setup).toMatch(/supabase-v7-secret-fix\.sql/);
    expect(fn(setup, 'upsert_save')[0]).toMatch(/existing\.secret <> p_secret/);
  });
});
