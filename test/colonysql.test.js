// Static checks on the owner-run colony schema. The SQL is never executed in
// CI (the builder can't reach the Supabase project); these pin the contract
// the client depends on and the privacy rules: every RPC has exactly the
// contract's argument names and runs SECURITY DEFINER with a pinned
// search_path, and every table is RLS-locked with no read policy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RPCS } from './fixtures/colonyrpcs.js';

const sql = readFileSync(new URL('../docs/supabase-colony.sql', import.meta.url), 'utf8');
const TABLES = ['colonies', 'colony_members', 'colony_invites', 'colony_cats', 'colony_feeds', 'colony_trades'];

describe('supabase-colony.sql', () => {
  it('defines every RPC with exactly the contract arguments, as SECURITY DEFINER', () => {
    for (const [name, args] of Object.entries(RPCS)) {
      const m = sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\$\\$`, 'i'));
      expect(m, name).toBeTruthy();
      expect(m[1].match(/p_[a-z_]+/g)).toEqual(args);
      expect(m[0]).toMatch(/security definer/i);
      expect(m[0]).toMatch(/set search_path = public/i);
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to anon`, 'i'));
    }
  });
  it('enables RLS on every table, revokes anon, and adds no select policy', () => {
    for (const t of TABLES) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from anon`, 'i'));
      expect(sql).not.toMatch(new RegExp(`create policy[^;]*on public\\.${t}\\b`, 'i'));
    }
  });
  it('never touches the v7 tables or smuggles state through profiles', () => {
    expect(sql).not.toMatch(/upsert_profile|alter table public\.(saves|profiles|friendships)/i);
  });
});
