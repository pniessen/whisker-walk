// docs/supabase-v11-cat-login.sql, read as text (the way test/v10limits.test.js
// reads its file). Nothing here can reach a database: the file has not been run
// by anyone, and an agent never runs it.
//
// Milestone 2 wrote step 1 (revisions and the cheap question), milestone 3 step 2
// (four-word codes and changing a code), milestone 4 step 3 (hop codes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8');
const v11all = read('supabase-v11-cat-login.sql');
const STEP2 = v11all.indexOf('\n-- ══ STEP 2 — ');
const v11 = v11all.slice(0, STEP2 < 0 ? undefined : STEP2); // step 1 is what the first block of tests is about
const STEP3 = v11all.indexOf('\n-- ══ STEP 3 — ');
const v11step2 = STEP2 < 0 ? '' : v11all.slice(STEP2, STEP3 < 0 ? undefined : STEP3);
const v11step3 = STEP3 < 0 ? '' : v11all.slice(STEP3);
const v10 = read('supabase-v10-limits.sql');
const code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\nend \\$\\$;\\n`, 'i'));
const runbookQueries = () => {
  const book = v11all.slice(0, v11all.indexOf('HOW IT WORKS')).replace(/^-- ?/gm, '');
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

describe('supabase-v11-cat-login.sql, step 2 (static)', () => {
  const two = code(v11step2);
  const rot = () => fn(v11step2, 'rotate_cat_code')[0];
  const ups = () => fn(v11step2, 'upsert_save')[0];
  it('is its own step in the runbook, run by the owner, after step 1', () => {
    expect(v11step2).toMatch(/^\n-- ══ STEP 2 — four-word codes and changing a code/);
    expect(v11all).toMatch(/STEP 2 {2}four-word codes and changing a code/); // listed in the runbook's order of steps
    expect(two).toMatch(/to_regprocedure\('public\.peek_save\(text,text\)'\) is null/);
    expect(two).toMatch(/raise exception 'Whisker Walk v11 step 2: step 1 /);
  });
  it('upsert_save accepts both code shapes, and is step 1\'s text with only the code check changed', () => {
    const one = fn(v11, 'upsert_save')[0];
    const body = ups();
    expect(body).toContain("'^[A-Z]{4,6}-[A-Z]{4,6}-[A-Z]{4,6}-[0-9]{2}$'");
    expect(body).toContain("'^[A-Z]{3,6}(-[A-Z]{3,6}){3}$'");
    const added = body.split('\n').filter((l) => !one.split('\n').includes(l)).filter((l) => !/^\s*--/.test(l));
    const removed = one.split('\n').filter((l) => !body.split('\n').includes(l));
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatch(/p_code !~ '\^\[A-Z\]\{4,6\}/);
    expect(added.join('\n')).toMatch(/p_code !~ '\^\[A-Z\]\{4,6\}.*and p_code !~ '\^\[A-Z\]\{3,6\}\(-\[A-Z\]\{3,6\}\)\{3\}\$'/s);
    expect(added.length).toBeLessThanOrEqual(2);
    // the secret check, the stale line and the size cap are all still there, in the same order
    for (const keep of ["is distinct from p_secret", "existing.v >= 2", "octet_length(p_payload::text) > 2097152"]) expect(body).toContain(keep);
  });
  it('sync_save needs no new code check: it only looks a row up and never makes one', () => {
    expect(two).not.toMatch(/create or replace function public\.sync_save/);
    expect(fn(v11, 'sync_save')[0]).not.toMatch(/insert into saves/);
  });
  it('rotate_cat_code runs as its owner with the search_path pinned, and is one function, so one transaction', () => {
    const head = rot().split(' as $$')[0].replace(/\s+/g, ' ');
    expect(head).toMatch(/security definer set search_path = public, pg_temp$/);
    expect(head).toMatch(/\(\s*p_code text, p_secret text, p_new_code text, p_new_secret text\s*\) returns text/);
    expect(two).not.toMatch(/\b(begin transaction|commit;|rollback;|savepoint)\b/i);
  });
  it('checks the code, the new code and both secrets before anything else, and answers one word', () => {
    const body = rot();
    expect(body).toMatch(/p_new_code = p_code/);
    expect(body).toMatch(/p_new_secret = p_secret/);
    expect(body).toMatch(/length\(p_new_secret\) < 16/);
    expect(body.indexOf("p_new_code !~ '^[A-Z]{4,6}")).toBeGreaterThan(-1);
    expect(body).toContain("'^[A-Z]{3,6}(-[A-Z]{3,6}){3}$'");
    const words = [...body.matchAll(/return '([a-z-]+)'/g)].map((m) => m[1]);
    expect(new Set(words)).toEqual(new Set(['bad', 'busy', 'denied', 'ok']));
    expect(body).not.toMatch(/return jsonb|raise exception/);
  });
  it('looks at the secret before it changes or tells anything, counts a wrong one as a load miss, and a right one as a rotation', () => {
    const body = rot();
    expect(body.indexOf('is distinct from p_secret')).toBeGreaterThan(-1);
    expect(body.indexOf('is distinct from p_secret')).toBeLessThan(body.indexOf('insert into saves'));
    expect((body.match(/perform ww_hit\('load-miss'\)/g) ?? []).length).toBe(2); // unknown code, wrong secret
    expect(body).toMatch(/if ww_over\('load-miss'\) then return 'busy'/);
    expect(body).toMatch(/if not ww_hit\('rotate'\) then return 'busy'/);
    expect(body).toMatch(/select \* into existing from saves where code = p_code for update;/);
  });
  it('refuses a cat id that is not a UUID, and moves the profile secret only for that cat and only from the old secret', () => {
    const body = rot();
    expect(body).toMatch(/v_cat := existing\.payload -> 'cat' ->> 'id';/);
    expect(body).toMatch(/v_cat !~ '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$'/);
    const upd = body.match(/update profiles set secret = p_new_secret where ([^;]*);/);
    expect(upd).not.toBeNull();
    expect(upd[1]).toBe('player_id = v_cat and secret = p_secret');
    expect(body.match(/update profiles/g)).toHaveLength(1);
  });
  it('writes the new row first and leaves the old code as an empty row with a secret nobody has (so another device is denied, not told "none", and nothing can claim the old code with a new save)', () => {
    const body = rot();
    expect(body.indexOf('insert into saves')).toBeLessThan(body.indexOf('update saves'));
    expect(body).toMatch(/insert into saves \(code, secret, payload, lifetime, rev, v, last_seen\)/);
    expect(body).toMatch(/existing\.rev \+ 1, 2, now\(\)/);
    const old = body.match(/update saves\s+set ([^;]*?)\s+where code = p_code;/s);
    expect(old).not.toBeNull();
    expect(old[1]).toMatch(/secret = 'moved-' \|\| md5\(random\(\)::text \|\| clock_timestamp\(\)::text\)/);
    expect(old[1]).toMatch(/payload = '\{\}'::jsonb/);
    expect(body).toMatch(/if exists \(select 1 from saves where code = p_new_code\) then return 'busy'/);
    expect(body).not.toMatch(/delete from/i);
  });
  it('has limits rows for rotate, "do nothing" on conflict', () => {
    const rows = [...two.matchAll(/\('rotate',\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\)/g)].map((m) => m.slice(1).map(Number));
    expect(rows).toEqual([[86400, 5, 20, 200]]);
    expect(two).toMatch(/on conflict \(name, window_secs\) do nothing;/);
  });
  it('revokes everything, then grants execute to anon on the new function and on upsert_save only', () => {
    expect(two).toMatch(/revoke execute on function public\.rotate_cat_code\(text, text, text, text\) from public, anon, authenticated;/);
    expect(two).toMatch(/grant execute on function public\.rotate_cat_code\(text, text, text, text\) to anon;/);
    const grants = [...two.matchAll(/grant execute on function public\.([a-z_]+)/g)].map((m) => m[1]).sort();
    expect(grants).toEqual(['rotate_cat_code', 'upsert_save']);
    expect(two).not.toMatch(/\bto (public|authenticated)\b/i);
    expect(two).not.toMatch(/create policy|create table|grant (select|insert|update|delete|all)/i);
  });
  it('touches no friendships or colony table, never makes dynamic sql, and deletes nothing', () => {
    expect(two).not.toMatch(/\b(friendships|colonies|colony_[a-z]+)\b/);
    expect(two).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|column|policy))\b/i);
    expect(two).not.toMatch(/\bexecute\s+(format|'|\$|[a-z_]+\s*\|\|)/i);
  });
  it('says how to undo the step, and warns that re-running step 1 alone puts the old code check back', () => {
    expect(v11step2).toMatch(/\n-- Rollback: /);
    expect(v11step2).toContain('drop function if exists public.rotate_cat_code(text, text, text, text);');
    expect(v11step2).toContain("delete from public.ww_limits where name = 'rotate';");
    expect(v11all).toMatch(/re-run(ning)? (of )?step 1/i);
  });
  it('the runbook has check queries for step 2: read-only, every column aliased, no code or secret in a result', () => {
    expect(runbookQueries().length).toBeGreaterThanOrEqual(10);
    const asked = runbookQueries().join('\n');
    expect(asked).toMatch(/rotate_cat_code/);
    expect(asked).toMatch(/\{3,6\}/);
  });
});

describe('supabase-v11-cat-login.sql, step 3 (static): hop codes', () => {
  const three = code(v11step3);
  const f = (name) => fn(v11step3, name)?.[0] ?? '';
  const NAMES = ['hop_open', 'hop_join', 'hop_answer', 'hop_poll'];
  const SIGS = { hop_open: 'text, text', hop_join: 'text', hop_answer: 'text, text, boolean', hop_poll: 'text' };
  it('is its own step in the runbook, run by the owner, after step 1, and says what it changes', () => {
    expect(v11step3).toMatch(/^\n-- ══ STEP 3 — hop codes/);
    expect(v11all).toMatch(/STEP 3 {2}hop codes/); // the runbook's order of steps
    expect(three).toMatch(/to_regprocedure\('public\.peek_save\(text,text\)'\) is null/);
    expect(three).toMatch(/raise exception 'Whisker Walk v11 step 3: step 1 /);
    expect(v11step3).toMatch(/\n-- Rollback: /);
    expect(v11step3).toMatch(/\n-- Safe to re-run: yes/);
  });
  it('the hops table has row-level security on, no policy and no grant; the other columns are the ones the design names', () => {
    expect(three).toMatch(/create table if not exists public\.hops\(/);
    expect(three).toMatch(/alter table public\.hops enable row level security;/);
    expect(three).toMatch(/revoke all on public\.hops from public, anon, authenticated;/);
    expect(three).not.toMatch(/create policy|drop policy/i);
    expect(three).not.toMatch(/grant (select|insert|update|delete|all)/i);
    const table = three.match(/create table if not exists public\.hops\(([\s\S]*?)\);/)[1];
    for (const col of ['hop text primary key', 'code text not null unique', 'expires_at timestamptz not null', 'joiner_ticket text', 'answer text', 'handoff jsonb']) expect(table).toContain(col);
  });
  it('four functions, each security definer with a fixed search_path, and only these four', () => {
    const defs = three.match(/create or replace function public\.[a-z_]+\([^)]*\)[\s\S]*? as \$\$/g);
    expect(defs).toHaveLength(4);
    for (const name of NAMES) {
      const head = f(name).split(' as $$')[0].replace(/\s+/g, ' ');
      expect(head, name).toMatch(/security definer set search_path = public, pg_temp$/);
    }
    expect(three).not.toMatch(/create or replace function public\.(?!hop_)/);
  });
  it('grants execute to the public key on the four functions only, after revoking it from everyone', () => {
    for (const name of NAMES) {
      expect(three).toContain(`revoke execute on function public.${name}(${SIGS[name]}) from public, anon, authenticated;`);
      expect(three).toContain(`grant execute on function public.${name}(${SIGS[name]}) to anon;`);
    }
  });
  it('a hop lives ten minutes, there is one open hop per cat, and expired rows are removed at every call', () => {
    expect(f('hop_open')).toMatch(/now\(\) \+ interval '10 minutes'/);
    expect(three).toMatch(/code text not null unique/);
    for (const name of NAMES) expect(f(name), name).toMatch(/delete from hops where expires_at <= now\(\);/);
  });
  it('hop_open checks the cat\'s own secret first, counts a wrong one as a load miss, and counts only a NEW hop as hop-open (a poll is free)', () => {
    const b = f('hop_open');
    expect(b.indexOf('is distinct from p_secret')).toBeGreaterThan(-1);
    expect(b.indexOf('is distinct from p_secret')).toBeLessThan(b.indexOf('insert into hops'));
    expect((b.match(/perform ww_hit\('load-miss'\)/g) ?? []).length).toBe(2);
    expect(b).toMatch(/if ww_over\('load-miss'\) then return jsonb_build_object\('status', 'busy'\)/);
    expect(b.indexOf("ww_hit('hop-open')")).toBeGreaterThan(b.indexOf('select x.hop'));
    expect(b.indexOf("ww_hit('hop-open')")).toBeLessThan(b.indexOf('insert into hops'));
    expect(b).toMatch(/for update;/);
    expect(b).toContain("'ABCDEFGHJKMNPQRSTUVWXYZ23456789'"); // the one code alphabet
  });
  it('hop_join stores only a random ticket, counts a wrong or already-joined hop as hop-miss, and refuses a code of the wrong shape', () => {
    const b = f('hop_join');
    expect(b).toMatch(/v_hop !~ '\^\[ABCDEFGHJKMNPQRSTUVWXYZ23456789\]\{6\}\$'/);
    expect(b).toMatch(/if ww_over\('hop-miss'\) then return jsonb_build_object\('status', 'busy'\)/);
    expect((b.match(/perform ww_hit\('hop-miss'\)/g) ?? []).length).toBe(2); // wrong shape, unknown or taken
    expect(b).toMatch(/update hops set joiner_ticket = v_ticket where hop = v_hop;/);
    expect(b).toMatch(/gen_random_uuid\(\)/);
    expect(b).not.toMatch(/handoff/);
  });
  it('hop_answer checks the cat\'s own secret, hands the cat code and secret over only on Yes with a joiner waiting, and shortens the row\'s life', () => {
    const b = f('hop_answer');
    expect(b.indexOf('is distinct from p_secret')).toBeLessThan(b.indexOf('update hops'));
    expect(b).toMatch(/if not coalesce\(p_accept, false\) then/);
    expect(b).toMatch(/handoff = jsonb_build_object\('code', p_code, 'secret', p_secret\)/);
    expect(b.match(/handoff = jsonb_build_object/g)).toHaveLength(1);
    expect(b).toMatch(/expires_at = least\(expires_at, now\(\) \+ interval '2 minutes'\)/);
    expect(b).toMatch(/if v_ticket is null then return 'none'/);
    const words = [...b.matchAll(/return '([a-z-]+)'/g)].map((m) => m[1]);
    expect(new Set(words)).toEqual(new Set(['bad', 'busy', 'denied', 'none', 'ok']));
  });
  it('hop_poll deletes the row when it delivers (the handoff is read once) and when it says no; only the matching ticket gets the code', () => {
    const b = f('hop_poll');
    expect(b).toMatch(/p_ticket !~ '\^\[0-9a-f\]\{64\}\$'/);
    expect(b).toMatch(/where joiner_ticket = p_ticket/);
    const yes = b.slice(b.indexOf("= 'yes'"));
    expect(yes.indexOf('delete from hops')).toBeGreaterThan(-1);
    expect(yes.indexOf('delete from hops')).toBeLessThan(yes.indexOf("'ok'"));
    expect(b).toMatch(/'status', 'denied'/);
    expect(b).toMatch(/'status', 'wait'/);
  });
  it('no function returns a cat code or a secret except hop_poll, to the matching ticket', () => {
    for (const name of ['hop_open', 'hop_join']) expect(f(name), name).not.toMatch(/'secret',\s*(v_|existing|h\.)|jsonb_build_object\([^)]*'code'/);
    expect(f('hop_poll')).toMatch(/'code', v_code, 'secret', v_secret/);
    expect(three.match(/'secret',\s/g)?.length ?? 0).toBeLessThanOrEqual(2); // hop_answer writes it, hop_poll reads it
  });
  it('has limits rows for hop-open and hop-miss, "do nothing" on conflict, with the design\'s numbers', () => {
    const rows = [...three.matchAll(/\('(hop-open|hop-miss)',\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\)/g)].map((m) => [m[1], ...m.slice(2).map(Number)]);
    expect(rows).toEqual([['hop-open', 3600, 12, 60, 600], ['hop-miss', 600, 10, 50, 300], ['hop-miss', 86400, 40, 3600, 36000]]);
    expect(three).toMatch(/on conflict \(name, window_secs\) do nothing;/);
  });
  it('rollback drops the four functions, the table and the two limit names', () => {
    for (const name of NAMES) expect(v11step3).toContain(`drop function if exists public.${name}(${SIGS[name]});`);
    expect(v11step3).toContain('drop table if exists public.hops;');
    expect(v11step3).toContain("delete from public.ww_limits where name in ('hop-open', 'hop-miss');");
  });
  it('changes no function of steps 1 or 2, no saves row and no profile', () => {
    expect(three).not.toMatch(/\b(update|insert into|delete from)\s+(public\.)?(saves|profiles|friendships|ww_limits_)/);
    expect(three).not.toMatch(/function public\.(upsert_save|sync_save|peek_save|rotate_cat_code|load_save)/);
  });
  it('the runbook\'s queries still start with select, and step 3 adds verification queries after it', () => {
    const qs = runbookQueries();
    expect(qs.length).toBeGreaterThan(10);
    for (const q of qs) expect(q).toMatch(/^select /);
    expect(qs.join('\n')).toMatch(/hop_open/);
    expect(qs.join('\n')).toMatch(/hop-miss/);
  });
});
