// Static checks on docs/supabase-v7-secret-fix.sql, the owner-run fix for the
// v7 NULL-secret bypass (final review I2). Like colonysql.test.js, the SQL is
// never run in CI; this pins what the file must say. It was proven against a
// real Postgres (PGlite) by hand: see the fix report.
//
// The bypass: `existing.secret <> p_secret` is NULL, not true, when p_secret is
// NULL, so the "denied" branch was skipped. The fix uses `is distinct from`,
// which is true for NULL.
//
// Since v8 the fix is folded into docs/supabase-setup.sql and
// docs/supabase-v8-hardening.sql (pinned in v8hardening.test.js), and this
// file is kept as a historical migration / v8 rollback.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const fix = readFileSync(new URL('../docs/supabase-v7-secret-fix.sql', import.meta.url), 'utf8');
const FUNCS = ['upsert_save', 'upsert_profile', 'record_friend_greet'];
const ARGS = {
  upsert_save: 'p_code text, p_secret text, p_payload jsonb, p_lifetime integer',
  upsert_profile: 'p_player_id text, p_secret text, p_pet_name text, p_breed text,\n  p_accessories jsonb, p_rank_title text',
  record_friend_greet: 'p_my_id text, p_my_secret text, p_other_id text, p_walk text',
};
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?end \\$\\$;`, 'i'));

describe('supabase-v7-secret-fix.sql', () => {
  it('recreates exactly the three v7 RPCs, with the v7 argument lists', () => {
    const made = [...fix.matchAll(/create or replace function public\.([a-z_]+)\(/gi)].map((m) => m[1]);
    expect(made).toEqual(FUNCS);
    for (const name of FUNCS) expect(fn(fix, name)[1].trim(), name).toBe(ARGS[name]);
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
  it('keeps the anon grants, and touches no table', () => {
    for (const name of FUNCS) expect(fix).toMatch(new RegExp(`grant execute on function public\\.${name} to anon;`, 'i'));
    expect(fix.replace(/--[^\n]*/g, '')).not.toMatch(/create table|alter table|drop |delete from|create policy|revoke /i);
  });
  it('is labelled historical, and warns that running it after v8 undoes v8', () => {
    expect(fix).toMatch(/HISTORICAL MIGRATION/);
    expect(fix).toMatch(/supabase-v8-hardening\.sql/);
    expect(fix).toMatch(/AFTER either of those puts back these three functions/);
  });
});
