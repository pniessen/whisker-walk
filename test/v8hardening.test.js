// Static checks on docs/supabase-v8-hardening.sql and the fresh-setup file
// that mirrors it. The SQL is never run in CI (nothing here can reach the
// Supabase project); these pin what the files must say and that the server's
// rules match what the game really sends. The SQL was run by hand in an
// in-memory PGlite (v7 setup -> v7 fix -> colony -> v8 twice -> STEP B, and a
// fresh setup twice -> colony -> v8): see the cloud-hardening report.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCloud, generateSaveCode, CLOUD_SAVE_MAX_BYTES, CLOUD_SAVE_SEND_MAX_BYTES } from '../src/cloud.js';
import { validPetName } from '../src/net.js';
import { RANKS } from '../src/progression.js';
import { PERSONALITIES } from '../src/cat/brain.js';

const v8 = readFileSync(new URL('../docs/supabase-v8-hardening.sql', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../docs/supabase-setup.sql', import.meta.url), 'utf8');
const RPCS = {
  upsert_save: ['p_code', 'p_secret', 'p_payload', 'p_lifetime'],
  load_save: ['p_code', 'p_secret'],
  upsert_profile: ['p_player_id', 'p_secret', 'p_pet_name', 'p_breed', 'p_accessories', 'p_rank_title'],
  record_friend_greet: ['p_my_id', 'p_my_secret', 'p_other_id', 'p_walk'],
  profiles_by_ids: ['p_ids'],
  find_by_friend_code: ['p_code'],
  friendships_of: ['p_player_id', 'p_secret'],
};
const HELPERS = ['ww_rate_hit', 'ww_rate_over'];
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\n(?:end \\$\\$;|\\$\\$;)\\n`, 'i'));
const code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
// A SQL regex literal inside a function, as a JS RegExp (the patterns used
// here are plain enough to mean the same thing in both).
const sqlRegex = (body, column) => new RegExp(body.match(new RegExp(`${column} !~ '([^']+)'`))[1]);

describe('supabase-v8-hardening.sql', () => {
  it('defines every RPC with the arguments the client sends, SECURITY DEFINER, search_path pinned, granted to anon', () => {
    for (const [name, args] of Object.entries(RPCS)) {
      const m = fn(v8, name);
      expect(m, name).toBeTruthy();
      expect(m[1].match(/p_[a-z_]+/g), name).toEqual(args);
      expect(m[0], name).toMatch(/security definer set search_path = public, pg_temp as \$\$/i);
      expect(v8, name).toMatch(new RegExp(`grant execute on function public\\.${name} to anon;`, 'i'));
    }
  });
  it('keeps the counter helpers private', () => {
    for (const name of HELPERS) {
      expect(fn(v8, name)[0]).toMatch(/security definer set search_path = public, pg_temp as \$\$/i);
      expect(v8).toMatch(new RegExp(`revoke execute on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`, 'i'));
      expect(v8).not.toMatch(new RegExp(`grant execute on function public\\.${name}`, 'i'));
    }
    expect(v8).toMatch(/revoke all on public\.ww_rate from anon, authenticated;/);
  });
  it('never compares a secret with <> (NULL-unsafe), and has no dynamic SQL', () => {
    expect(code(v8)).not.toMatch(/secret\s*<>/i);
    expect(code(v8)).not.toMatch(/\bexecute\s+(format|'|\$|[a-z_]+\s*\|\|)/i);
    for (const name of ['upsert_save', 'upsert_profile']) expect(fn(v8, name)[0]).toMatch(/existing\.secret is distinct from p_secret/);
    expect(fn(v8, 'record_friend_greet')[0]).toMatch(/me\.secret is distinct from p_my_secret/);
  });
  it('caps a save at the client\'s CLOUD_SAVE_MAX_BYTES, and the client stops below it', () => {
    expect(fn(v8, 'upsert_save')[0]).toMatch(new RegExp(`octet_length\\(p_payload::text\\) > ${CLOUD_SAVE_MAX_BYTES}\\b`));
    expect(CLOUD_SAVE_SEND_MAX_BYTES).toBeLessThan(CLOUD_SAVE_MAX_BYTES);
  });
  it('accepts every code the game makes for a new save row', () => {
    const re = sqlRegex(fn(v8, 'upsert_save')[0], 'p_code');
    for (let i = 0; i < 500; i++) expect(generateSaveCode()).toMatch(re);
  });
  it('checks pet names exactly like validPetName (minus its word list)', () => {
    const body = fn(v8, 'upsert_profile')[0];
    const re = sqlRegex(body, 'p_pet_name');
    expect(re.source).toBe('^[A-Za-z][A-Za-z -]{1,15}$');
    for (const name of ['Mochi', 'Pip-Squeak', 'Lord Lantern', 'Ab', 'A'.repeat(16), 'A', 'A'.repeat(17), '<b>', 'Mo3', ' Mo', 'Émile']) {
      expect(re.test(name), name).toBe(validPetName(name));
    }
  });
  it('accepts every breed id and rank title the game sends', () => {
    const body = fn(v8, 'upsert_profile')[0];
    const breed = sqlRegex(body, 'p_breed');
    for (const id of Object.keys(PERSONALITIES)) expect(id).toMatch(breed);
    const rank = sqlRegex(body, 'p_rank_title');
    for (const r of RANKS) expect(r.title).toMatch(rank);
    expect(body).toMatch(/octet_length\(p_accessories::text\) > 4096/);
  });
  it('record_friend_greet refuses self and an id with no profile', () => {
    const body = fn(v8, 'record_friend_greet')[0];
    expect(body).toMatch(/p_other_id = p_my_id/);
    expect(body).toMatch(/not exists \(select 1 from profiles o where o\.player_id = p_other_id\)/);
  });
  it('find_by_friend_code matches the whole 8-character code only', () => {
    const body = fn(v8, 'find_by_friend_code')[0];
    expect(body).toMatch(/v_code !~ '\^\[0-9a-f\]\{8\}\$'/);
    expect(body).toMatch(/left\(pr\.player_id, 8\) = v_code/);
    expect(code(body)).not.toMatch(/\blike\b/i);
  });
  it('none of the read RPCs returns a secret', () => {
    for (const name of ['profiles_by_ids', 'find_by_friend_code', 'friendships_of']) {
      const returns = fn(v8, name)[0].match(/returns table \(([^)]*)\)/)[1];
      expect(returns, name).not.toMatch(/secret/);
    }
  });
  it('keeps STEP B (dropping the public reads) out of the part that runs', () => {
    expect(code(v8)).not.toMatch(/drop policy|revoke all on public\.(profiles|friendships)/i);
    const stepB = v8.slice(v8.indexOf('-- >>> STEP B start'), v8.indexOf('-- <<< STEP B end'));
    expect(stepB).toMatch(/drop policy if exists profiles_public_read on public\.profiles;/);
    expect(stepB).toMatch(/drop policy if exists friendships_public_read on public\.friendships;/);
    expect(stepB).toMatch(/revoke all on public\.profiles from anon, authenticated;/);
    expect(stepB).toMatch(/revoke all on public\.friendships from anon, authenticated;/);
  });
  it('carries the owner\'s secret-fix check query', () => {
    expect(v8).toContain("select proname, prosrc like '%is distinct from%' from pg_proc\n    where proname in ('upsert_save','upsert_profile','record_friend_greet');");
  });
  it('the client sends exactly these argument names', async () => {
    const calls = [];
    const cloud = createCloud({
      rpc: async (name, args) => { calls.push({ name, args }); return name === 'profiles_by_ids' || name === 'find_by_friend_code' || name === 'friendships_of' ? [] : 'ok'; },
      select: async () => [],
      getSecret: () => 's',
    });
    await cloud.saveToCloud('PLUM-OTTER-CROW-42', 's', {}, 1);
    await cloud.loadFromCloud('PLUM-OTTER-CROW-42');
    await cloud.pushProfile({ playerId: 'p', secret: 's', petName: 'Mo', breed: 'tabby', accessories: {}, rankTitle: 'House Cat' });
    await cloud.recordGreet('p', 's', 'o', 'walk-1');
    await cloud.fetchProfiles(['o']);
    await cloud.findByFriendCode('3fa85f64');
    await cloud.fetchFriendships('p');
    expect(Object.fromEntries(calls.map((c) => [c.name, Object.keys(c.args)]))).toEqual(RPCS);
  });
});

describe('supabase-setup.sql (fresh setup) mirrors v8', () => {
  it('has the same function definitions, word for word', () => {
    for (const name of [...Object.keys(RPCS), ...HELPERS]) expect(fn(setup, name)?.[0], name).toBe(fn(v8, name)[0]);
  });
  it('has no public read policy and no anon table grant', () => {
    expect(code(setup)).not.toMatch(/create policy/i);
    expect(code(setup)).not.toMatch(/grant select/i);
    for (const t of ['saves', 'profiles', 'friendships', 'ww_rate']) {
      expect(setup).toMatch(new RegExp(`alter table public\\.${t} enable row level security;`));
      expect(setup).toMatch(new RegExp(`revoke all on public\\.${t} from anon, authenticated;`));
    }
  });
  it('no longer sends anyone to the v7 fix, and warns against re-running it on the live database', () => {
    expect(setup).not.toMatch(/SECURITY FIX: after running this file/);
    expect(setup).toMatch(/docs\/supabase-v8-hardening\.sql instead/);
  });
});
