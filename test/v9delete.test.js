// docs/supabase-v9-delete.sql ("Delete my online data") and its mirrors in
// the fresh-setup files.
//
// Two halves. The static checks always run (CI included): they pin what the
// files must say, as test/v8hardening.test.js does. The database checks run
// the real SQL in PGlite (Postgres compiled to WebAssembly, in this process:
// nothing here can reach Supabase). PGlite isn't a dependency of the game, so
// they run only where it can be found: set WW_PGLITE to its dist/index.js, e.g.
//   WW_PGLITE=~/.npm/_npx/<hash>/node_modules/@electric-sql/pglite/dist/index.js npx vitest run v9delete.test.js
// Without it the database half is skipped, never failed.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8');
const v9 = read('supabase-v9-delete.sql');
const setup = read('supabase-setup.sql');
const colony = read('supabase-colony.sql');
const v8 = read('supabase-v8-hardening.sql');
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\nend \\$\\$;\\n`, 'i'));
const code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
// "a, f(b, c) as x" -> ['a', ' f(b, c) as x']: commas inside brackets or quotes don't split.
function topLevelCommaSplit(text) {
  const out = [];
  let depth = 0; let quoted = false; let cur = '';
  for (const ch of text) {
    if (ch === "'") quoted = !quoted;
    else if (!quoted && ch === '(') depth++;
    else if (!quoted && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !quoted) { out.push(cur); cur = ''; } else cur += ch;
  }
  return [...out, cur];
}
// The numbered check queries at the end of the file, each from its "select" to its ";".
const checkQueries = () => [...v9.slice(v9.indexOf('── How to check')).matchAll(/^   (select[\s\S]*?;)$/gm)].map((m) => m[1]);
const DELETE_RPCS = { delete_save: ['p_code', 'p_secret'], delete_player: ['p_player_id', 'p_secret'] };

describe('supabase-v9-delete.sql (static)', () => {
  it('defines both functions with the arguments the client sends, SECURITY DEFINER, search_path pinned, granted to anon', () => {
    for (const [name, args] of Object.entries(DELETE_RPCS)) {
      const m = fn(v9, name);
      expect(m, name).toBeTruthy();
      expect(m[1].match(/p_[a-z_]+/g), name).toEqual(args);
      expect(m[0], name).toMatch(/returns text language plpgsql security definer set search_path = public, pg_temp as \$\$/i);
      expect(v9, name).toMatch(new RegExp(`grant execute on function public\\.${name} to anon;`, 'i'));
    }
  });
  it('compares secrets NULL-safely, has no dynamic SQL, and limits wrong answers', () => {
    expect(code(v9)).not.toMatch(/secret\s*<>/i);
    expect(code(v9)).not.toMatch(/\bexecute\s+(format|'|\$|[a-z_]+\s*\|\|)/i);
    for (const name of Object.keys(DELETE_RPCS)) {
      const body = fn(v9, name)[0];
      expect(body).toMatch(/v_secret is distinct from p_secret/);
      expect(body).toMatch(/ww_rate_over\('delete-miss', 600, 50\)/);
      expect(body).toMatch(/perform ww_rate_hit\('delete-miss', 600, 50\)/);
    }
  });
  it('refuses to run without v7, the colony or the v8 helpers', () => {
    const guard = v9.slice(v9.indexOf('do $$'), v9.indexOf('end $$;') + 7);
    expect(guard).toMatch(/to_regprocedure\('public\.ww_rate_hit\(text,integer,integer\)'\) is null/);
    expect(guard).toMatch(/to_regclass\('public\.colony_members'\) is null/);
    expect(guard).toMatch(/to_regclass\('public\.saves'\) is null/);
    expect(v9).toContain("notify pgrst, 'reload schema';");
  });
  it('has the rollback and aliases every column in its check queries', () => {
    const rollback = v9.slice(v9.indexOf('── Rollback'), v9.indexOf('── How to check'));
    expect(rollback).toContain('drop function if exists public.delete_save(text, text);');
    expect(rollback).toContain('drop function if exists public.delete_player(text, text);');
    const selects = checkQueries().map((q) => q.match(/^select ([\s\S]*?)(\n\s*from|;$)/)[1]);
    expect(selects.length).toBe(4);
    for (const s of selects) {
      for (const col of topLevelCommaSplit(s)) expect(col, col).toMatch(/\bas [a-z_]+\s*;?\s*$/);
    }
  });
  it('a fresh database gets the same functions, word for word', () => {
    expect(fn(setup, 'delete_save')?.[0]).toBe(fn(v9, 'delete_save')[0]);
    expect(fn(colony, 'delete_player')?.[0]).toBe(fn(v9, 'delete_player')[0]);
    expect(setup).toMatch(/grant execute on function public\.delete_save to anon;/);
    expect(colony).toMatch(/grant execute on function public\.delete_player to anon;/);
  });
  it('the v8 helpers it relies on are the ones v8 defines', () => {
    expect(v8).toMatch(/create or replace function public\.ww_rate_hit\(p_name text, p_window_secs integer, p_max integer\)/);
    expect(v8).toMatch(/create or replace function public\.ww_rate_over\(p_name text, p_window_secs integer, p_max integer\)/);
  });
});

// ── The database half ────────────────────────────────────────────────────
let PGlite = null;
try {
  const mod = await import(process.env.WW_PGLITE || '@electric-sql/pglite');
  PGlite = mod.PGlite;
} catch {
  PGlite = null;
}

const uid = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
const SECRET = (n) => `secret-${n}-`.padEnd(40, 'x');
const CODE = 'PLUM-OTTER-CROW-42';

async function freshDb({ files = ['supabase-setup.sql', 'supabase-colony.sql', 'supabase-v8-hardening.sql', 'supabase-v9-delete.sql'] } = {}) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  for (const f of files) await db.exec(read(f));
  return db;
}

describe.skipIf(!PGlite)('supabase-v9-delete.sql (in PGlite)', () => {
  let db;
  const one = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0] ?? {})[0];
  const count = (table, where = 'true', params = []) => one(`select count(*)::int as n from ${table} where ${where}`, params);
  const call = (name, a, b) => one(`select public.${name}($1, $2) as r`, [a, b]);
  const profile = (n, name = 'Mochi') => one("select public.upsert_profile($1, $2, $3, 'tabby', '{}'::jsonb, 'House Cat') as r", [uid(n), SECRET(n), name]);
  const greet = (a, b, walk = 'walk-1') => one('select public.record_friend_greet($1, $2, $3, $4) as r', [uid(a), SECRET(a), uid(b), walk]);
  const sync = async (n, wardrobe = []) => (await db.query('select public.colony_sync($1, $2, $3::jsonb) as r', [uid(n), SECRET(n), JSON.stringify(wardrobe)])).rows[0].r;
  const open = async (n) => (await db.query('select public.colony_invite_open($1, $2) as r', [uid(n), SECRET(n)])).rows[0].r;
  const join = async (n, c) => (await db.query('select public.colony_invite_join($1, $2, $3) as r', [uid(n), SECRET(n), c])).rows[0].r;
  const answer = async (n, yes = true) => (await db.query('select public.colony_invite_answer($1, $2, $3) as r', [uid(n), SECRET(n), yes])).rows[0].r;
  const feed = (n, cat, walk = 'walk-1') => one("select public.colony_feed($1, $2, $3, $4, 'park', 1, 2, 0, false) as r", [uid(n), SECRET(n), cat, walk]);
  const offer = async (n, give, want) => (await db.query('select public.colony_trade_offer($1, $2, $3, $4) as r', [uid(n), SECRET(n), give, want])).rows[0].r;
  async function pair(a, b) {
    const inv = await open(a);
    expect(inv.status).toBe('ok');
    expect((await join(b, inv.code)).status).toBe('pending');
    expect((await answer(a)).status).toBe('paired');
  }
  const save = (secret = SECRET(1)) => one("select public.upsert_save($1, $2, '{\"save\":{}}'::jsonb, 5) as r", [CODE, secret]);

  beforeAll(async () => { db = await freshDb(); }, 30_000);
  beforeEach(async () => {
    await db.exec(`truncate saves, profiles, friendships, ww_rate, colonies, colony_members, colony_invites,
      colony_cats, colony_feeds, colony_trades cascade;`);
  });

  describe('delete_save', () => {
    it("answers 'ok' and deletes the row, then 'none'", async () => {
      expect(await save()).toBe('created');
      expect(await call('delete_save', CODE, SECRET(1))).toBe('ok');
      expect(await count('saves')).toBe(0);
      expect(await call('delete_save', CODE, SECRET(1))).toBe('none');
    });
    it("answers 'none' for a code with no save, and for a NULL code", async () => {
      expect(await call('delete_save', 'NO-SUCH-CODE-00', SECRET(1))).toBe('none');
      expect(await call('delete_save', null, SECRET(1))).toBe('none');
    });
    it("refuses a wrong, empty or NULL secret with 'denied' and deletes nothing", async () => {
      await save();
      for (const s of [SECRET(2), '', null]) expect(await call('delete_save', CODE, s)).toBe('denied');
      expect(await count('saves')).toBe(1);
    });
    it('a save made again under the same code (another linked device) is a new row', async () => {
      await save();
      await call('delete_save', CODE, SECRET(1));
      expect(await save()).toBe('created');
    });
  });

  describe('delete_player', () => {
    it("answers 'none' when this id has no profile (a device that never saved a cat name)", async () => {
      expect(await call('delete_player', uid(1), SECRET(1))).toBe('none');
      expect(await call('delete_player', null, SECRET(1))).toBe('none');
    });
    it("refuses a wrong, empty or NULL secret with 'denied', and one player can't delete another", async () => {
      await profile(1); await profile(2, 'Biscuit');
      await greet(1, 2);
      for (const s of [SECRET(1), '', null]) expect(await call('delete_player', uid(2), s)).toBe('denied');
      expect(await count('profiles')).toBe(2);
      expect(await count('friendships')).toBe(1);
    });
    it("deletes a player who never paired: profile and friendships on both sides; 'ok' then 'none'", async () => {
      await profile(1); await profile(2, 'Biscuit'); await profile(3, 'Pip');
      await greet(1, 2); await greet(3, 1); await greet(2, 3);
      expect(await call('delete_player', uid(1), SECRET(1))).toBe('ok');
      expect(await count('profiles', 'player_id = $1', [uid(1)])).toBe(0);
      expect(await count('friendships', 'a_id = $1 or b_id = $1', [uid(1)])).toBe(0);
      expect(await count('friendships')).toBe(1); // 2 and 3 are still friends
      expect(await count('profiles')).toBe(2);
      expect(await call('delete_player', uid(1), SECRET(1))).toBe('none');
    });
    it('deletes a lone member: membership, the colony, and its cats, feeds and trades', async () => {
      await profile(1); await profile(2, 'Biscuit');
      await pair(1, 2);
      await sync(1, ['tophat']); await sync(2, ['crown']);
      expect(await feed(1, 'Ash')).toBe('ok');
      expect(await feed(2, 'Ash', 'walk-2')).toBe('ok');
      expect((await offer(1, 'tophat', 'crown')).status).toBe('ok');
      expect(await call('delete_player', uid(2), SECRET(2))).toBe('ok'); // 1 is left alone in it
      expect(await count('colonies')).toBe(1);
      expect(await call('delete_player', uid(1), SECRET(1))).toBe('ok');
      for (const t of ['colonies', 'colony_members', 'colony_cats', 'colony_feeds', 'colony_trades', 'colony_invites', 'profiles', 'friendships']) {
        expect(await count(t), t).toBe(0);
      }
    });
    it('deleting one of a pair leaves the partner the colony, every cat and feed, and a working sync', async () => {
      await profile(1); await profile(2, 'Biscuit'); await profile(3, 'Pip');
      await pair(1, 2);
      await greet(1, 2); await greet(2, 3);
      await sync(1, ['tophat', 'scarf']); await sync(2, ['crown', 'cape']);
      expect(await feed(1, 'Ash')).toBe('ok');
      expect(await feed(2, 'Ash', 'walk-2')).toBe('ok');
      expect(await feed(1, 'Fern')).toBe('ok');
      await db.query("update colony_cats set tamed_by = $1, tamed_walk = 'walk-1' where name = 'Fern'", [uid(1)]);
      // an accepted trade (2 has yet to pull it) and two waiting offers, one each way
      expect((await offer(2, 'cape', 'scarf')).status).toBe('ok');
      expect(await one('select public.colony_trade_answer($1, $2, (select max(id) from colony_trades), true) as r', [uid(1), SECRET(1)])).toBe('accepted');
      expect((await offer(1, 'tophat', 'crown')).status).toBe('ok');
      expect((await offer(2, 'crown', 'cape')).status).toBe('ok');
      const colonyId = await one('select colony_id from colony_members where player_id = $1', [uid(2)]);

      expect(await call('delete_player', uid(1), SECRET(1))).toBe('ok');

      expect(await one('select colony_id from colony_members where player_id = $1', [uid(2)])).toBe(colonyId);
      expect(await count('colonies')).toBe(1);
      expect(await count('colony_cats')).toBe(2);
      expect(await count('colony_feeds')).toBe(3);
      // the deleted id stays on the partner's history, linking to nothing
      expect(await count('colony_cats', 'finder_id = $1', [uid(1)])).toBe(2);
      expect(await count('colony_cats', 'tamed_by = $1', [uid(1)])).toBe(1);
      expect(await count('colony_trades', "status = 'offered'")).toBe(0);
      expect(await count('colony_trades', "status = 'accepted'")).toBe(1);
      expect(await count('colony_trades', "status = 'cancelled'")).toBe(2);
      expect(await count('friendships')).toBe(1); // 2 and 3
      expect(await count('profiles', 'player_id = $1', [uid(1)])).toBe(0);

      // the partner reads "unpaired" (as after a manual unpair) and re-pairs into the same colony
      const after = await sync(2, ['crown']);
      expect(after.status).toBe('unpaired');
      await pair(2, 3);
      const snap = await sync(2, ['crown']);
      expect(snap.status).toBe('paired');
      expect(snap.colony_id).toBe(colonyId);
      expect(snap.cats.map((c) => c.name).sort()).toEqual(['Ash', 'Fern']);
      expect(snap.members.map((m) => m.player_id).sort()).toEqual([uid(2), uid(3)]);
    });
    it("clears this player's invites: their own is deleted, and their request on another's is cleared", async () => {
      await profile(1); await profile(2, 'Biscuit'); await profile(3, 'Pip');
      await open(1);
      const theirs = await open(2);
      expect((await join(1, theirs.code)).status).toBe('pending');
      expect(await call('delete_player', uid(1), SECRET(1))).toBe('ok');
      expect(await count('colony_invites', 'inviter_id = $1', [uid(1)])).toBe(0);
      expect(await count('colony_invites', 'joiner_id = $1', [uid(1)])).toBe(0);
      // 2's code is still open, and the answer path says nobody is waiting
      expect((await answer(2)).status).toBe('no-joiner');
      expect((await join(3, theirs.code)).status).toBe('pending');
    });
    it('the deleted player can come back as a brand-new profile (same id, new name)', async () => {
      await profile(1);
      await call('delete_player', uid(1), SECRET(1));
      expect(await profile(1, 'Pip')).toBe('ok');
    });
  });

  describe('the limit on wrong answers', () => {
    it("after 50 wrong answers in a window both functions answer 'busy', even with the right secret", async () => {
      await profile(1); await save();
      // one transaction, so now() (and so the 10-minute window) is the same for every call
      await db.transaction(async (tx) => {
        for (let i = 0; i < 50; i++) {
          const r = (await tx.query('select public.delete_player($1, $2) as r', [uid(1), 'wrong'])).rows[0].r;
          expect(r).toBe('denied');
        }
        expect((await tx.query('select public.delete_player($1, $2) as r', [uid(1), SECRET(1)])).rows[0].r).toBe('busy');
        expect((await tx.query('select public.delete_save($1, $2) as r', [CODE, SECRET(1)])).rows[0].r).toBe('busy');
      });
      expect(await count('profiles')).toBe(1);
      expect(await count('saves')).toBe(1);
    });
    it("counts delete_save's misses but not delete_player's 'none'", async () => {
      await call('delete_save', 'NO-SUCH-CODE-00', SECRET(1));
      await call('delete_player', uid(9), SECRET(9));
      expect(await one("select coalesce(sum(hits), 0)::int as n from ww_rate where name = 'delete-miss'")).toBe(1);
    });
  });

  describe('running the file', () => {
    it('re-running it changes no data', async () => {
      await profile(1); await profile(2, 'Biscuit'); await pair(1, 2); await feed(1, 'Ash'); await save();
      const before = await one("select json_build_array((select count(*) from profiles), (select count(*) from colony_members), (select count(*) from colony_cats), (select count(*) from saves))::text as s");
      await db.exec(v9);
      await db.exec(v9);
      expect(await one("select json_build_array((select count(*) from profiles), (select count(*) from colony_members), (select count(*) from colony_cats), (select count(*) from saves))::text as s")).toBe(before);
      expect(await call('delete_player', uid(1), SECRET(1))).toBe('ok');
    });
    it('the check queries run and answer as the file says', async () => {
      const queries = checkQueries();
      expect(queries.length).toBe(4);
      const q1 = (await db.query(queries[0])).rows;
      expect(q1.map((r) => [r.function_name, r.runs_as_owner, r.settings])).toEqual([
        ['delete_player', true, ['search_path=public, pg_temp']],
        ['delete_save', true, ['search_path=public, pg_temp']],
      ]);
      expect((await db.query(queries[1])).rows[0]).toEqual({ save_callable: true, player_callable: true });
      const q3 = (await db.query(queries[2])).rows[0];
      expect(['none', 'denied']).toContain(q3.save_answer);
      expect(['none', 'denied']).toContain(q3.player_answer);
      await db.query(queries[3]);
    });
    it('refuses to run before the colony file, and before the v8 helpers', async () => {
      const bare = new PGlite();
      await bare.exec('create role anon; create role authenticated;');
      await bare.exec(setup);
      await expect(bare.exec(v9)).rejects.toThrow(/Run docs\/supabase-colony\.sql first/);
      await bare.exec(colony);
      await bare.exec('drop function public.ww_rate_hit(text, integer, integer);');
      await expect(bare.exec(v9)).rejects.toThrow(/Run docs\/supabase-v8-hardening\.sql first/);
    }, 30_000);
    it('a fresh database (setup + colony only) already has both, and they work', async () => {
      const fresh = await freshDb({ files: ['supabase-setup.sql', 'supabase-colony.sql'] });
      await fresh.query("select public.upsert_profile($1, $2, 'Mochi', 'tabby', '{}'::jsonb, 'House Cat')", [uid(1), SECRET(1)]);
      expect((await fresh.query('select public.delete_player($1, $2) as r', [uid(1), SECRET(1)])).rows[0].r).toBe('ok');
      expect((await fresh.query('select public.delete_save($1, $2) as r', [CODE, SECRET(1)])).rows[0].r).toBe('none');
    }, 30_000);
  });
});
