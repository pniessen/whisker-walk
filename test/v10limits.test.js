// docs/supabase-v10-limits.sql: limits per visitor, a delete nobody else can
// block, and the clean-up of old online data.
//
// Two halves, as in test/v9delete.test.js. The static checks always run (CI
// included). The database checks run the real SQL in PGlite (Postgres
// compiled to WebAssembly, in this process: nothing here can reach Supabase)
// and only where it can be found: set WW_PGLITE to its dist/index.js.
// Without it the database half is skipped, never failed.
//
// A visitor's address reaches SQL the way Supabase's API hands it over: the
// `request.headers` setting, a JSON object of the request's headers. The
// tests set that setting by hand (from()).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../docs/${f}`, import.meta.url), 'utf8');
const v10 = read('supabase-v10-limits.sql');
const v8 = read('supabase-v8-hardening.sql');
const v9 = read('supabase-v9-delete.sql');
const fn = (sql, name) => sql.match(new RegExp(`create or replace function public\\.${name}\\(([^)]*)\\)[\\s\\S]*?\\n(?:end \\$\\$;|\\$\\$;)\\n`, 'i'));
const code = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
// Everything up to "as $$": the name, arguments, return type and settings.
const head = (sql, name) => fn(sql, name)[0].split(' as $$')[0].replace(/\s+/g, ' ');
const REPLACED = { upsert_save: v8, load_save: v8, upsert_profile: v8, find_by_friend_code: v8, delete_save: v9, delete_player: v9 };
const PRIVATE_FNS = ['ww_visitor\\(\\)', 'ww_over\\(text\\)', 'ww_hit\\(text\\)', 'ww_purge_player\\(text\\)', 'ww_counts_sweep\\(\\)', 'ww_cleanup\\(boolean, integer, integer\\)'];
const PRIVATE_TABLES = ['ww_salt', 'ww_limits', 'ww_counts', 'ww_cleanup_state'];
// The runbook's read-only queries: comment lines "--   select …" up to the ";".
const runbookQueries = () => {
  const book = v10.slice(0, v10.indexOf('HOW IT WORKS')).replace(/^-- ?/gm, '');
  return [...book.matchAll(/^ {2}(select[\s\S]*?;)$/gm)].map((m) => m[1]);
};

describe('supabase-v10-limits.sql (static)', () => {
  it('keeps the name, arguments, return type and settings of every function it replaces', () => {
    for (const [name, older] of Object.entries(REPLACED)) {
      expect(head(v10, name), name).toBe(head(older, name));
      expect(v10, name).toMatch(new RegExp(`grant execute on function public\\.${name} to anon;`));
    }
  });
  it('changes nothing else in the four v8 functions but the counter calls', () => {
    const swaps = [
      [/ww_rate_hit\('new-save', 3600, 30\)/g, "ww_hit('new-save')"],
      [/ww_rate_over\('load-miss', 600, 100\)/g, "ww_over('load-miss')"],
      [/ww_rate_hit\('load-miss', 600, 100\)/g, "ww_hit('load-miss')"],
      [/ww_rate_hit\('new-profile', 3600, 60\)/g, "ww_hit('new-profile')"],
      [/ww_rate_over\('friend-miss', 600, 100\)/g, "ww_over('friend-miss')"],
      [/ww_rate_hit\('friend-miss', 600, 100\)/g, "ww_hit('friend-miss')"],
    ];
    for (const name of ['upsert_save', 'load_save', 'upsert_profile', 'find_by_friend_code']) {
      let old = fn(v8, name)[0];
      for (const [from, to] of swaps) old = old.replace(from, to);
      expect(fn(v10, name)[0], name).toBe(old);
    }
  });
  it("removes a player with v9's own lines, moved into ww_purge_player", () => {
    const old = fn(v9, 'delete_player')[0];
    const tail = old.slice(old.indexOf('  select m.colony_id'), old.indexOf("  return 'ok';"));
    expect(fn(v10, 'ww_purge_player')[0]).toContain(tail);
  });
  it('no longer uses the world-wide counters, compares secrets NULL-safely, and has no dynamic SQL', () => {
    expect(code(v10)).not.toMatch(/ww_rate_(hit|over)\('/);
    expect(code(v10)).not.toMatch(/secret\s*<>/i);
    expect(code(v10)).not.toMatch(/\bexecute\s+(format|'|\$|[a-z_]+\s*\|\|)/i);
    for (const name of ['delete_save', 'delete_player']) expect(fn(v10, name)[0]).toMatch(/v_secret is distinct from p_secret/);
  });
  it('the delete functions look at the secret before any counter', () => {
    for (const name of ['delete_save', 'delete_player']) {
      const body = fn(v10, name)[0];
      expect(body.indexOf('is distinct from p_secret'), name).toBeLessThan(body.indexOf('ww_over('));
    }
  });
  it('keeps every helper and table private; only the tick is callable', () => {
    for (const f of PRIVATE_FNS) {
      expect(code(v10), f).toMatch(new RegExp(`revoke execute on function public\\.${f} from public, anon, authenticated;`));
      expect(code(v10), f).not.toMatch(new RegExp(`grant execute on function public\\.${f.split('\\(')[0]}[ (]`));
    }
    for (const t of PRIVATE_TABLES) {
      expect(code(v10), t).toMatch(new RegExp(`alter table public\\.${t} enable row level security;`));
      expect(code(v10), t).toMatch(new RegExp(`revoke all on public\\.${t} from public, anon, authenticated;`));
    }
    expect(code(v10)).toMatch(/grant execute on function public\.ww_cleanup_tick\(\) to anon;/);
    expect(code(v10)).not.toMatch(/create policy|grant (select|insert|update|delete|all)/i);
  });
  it('every function runs as its owner with the search_path pinned', () => {
    const defs = code(v10).match(/create or replace function public\.[a-z_]+\([^)]*\)[\s\S]*? as \$\$/g);
    expect(defs.length).toBe(13);
    for (const d of defs) expect(d).toMatch(/security definer set search_path = public, pg_temp as \$\$/);
  });
  it('never touches the policies or grants that v8 STEP B is about, and deletes no row when run', () => {
    expect(code(v10)).not.toMatch(/(drop|create) policy/i);
    expect(code(v10)).not.toMatch(/(revoke|grant) [a-z ,()_]+ on public\.(profiles|friendships|saves)\b/i);
    expect(code(v10)).not.toMatch(/\b(truncate|drop table|drop function|alter table public\.(saves|profiles|friendships))/i);
  });
  it('uses no extension for the hash (sha256 is built in; pgcrypto digest is not needed)', () => {
    expect(code(v10)).toMatch(/sha256\(convert_to\(/);
    expect(code(v10)).not.toMatch(/\bdigest\(|\bhmac\(|pgcrypto|create extension/i);
  });
  it('has four labelled steps that run, two that are by hand, and a rollback for each', () => {
    for (const n of [1, 2, 3, 4]) expect(v10).toMatch(new RegExp(`\\n-- ══ STEP ${n} — `));
    const live = v10.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(live.match(/\n-- Rollback/g).length).toBe(4);
    for (const n of [0, 5]) expect(v10).toMatch(new RegExp(`/\\* ══ STEP ${n} — `));
    // the probe and the switch-on are inside comments: "Run" on the file skips them
    expect(code(v10)).not.toMatch(/ww_header_probe|set enabled = true|cron\.schedule/);
    expect(v10).toContain('drop function if exists public.ww_header_probe(text);');
    expect(v10).toContain("notify pgrst, 'reload schema';");
  });
  it("the runbook's check queries alias every column (the SQL editor hides same-named ones)", () => {
    const queries = runbookQueries();
    expect(queries.length).toBe(13);
    for (const q of queries) expect(q, q).toMatch(/^select [\s\S]*\bas [a-z_0-9]+/);
  });
  it('the limits table in the comments matches the rows the file inserts', () => {
    const rows = [...code(v10).matchAll(/\('([a-z-]+)',\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)\)/g)].map((m) => [m[1], +m[2], +m[3], +m[4], +m[5]]);
    expect(rows.length).toBe(10);
    const secs = { '1 hour': 3600, '1 day': 86400, '10 min': 600 };
    const doc = [...v10.matchAll(/^-- {3}([a-z-]+) +(1 hour|1 day|10 min) +(\d+) +(\d+) +(\d+)$/gm)].map((m) => [m[1], secs[m[2]], +m[3], +m[4], +m[5]]);
    expect(doc).toEqual(rows);
    // "unknown" on the short window is today's world-wide number, limit for limit
    const unknown = Object.fromEntries(rows.filter((r) => r[1] < 86400).map((r) => [r[0], r[3]]));
    expect(unknown).toEqual({ 'new-save': 30, 'new-profile': 60, 'load-miss': 100, 'friend-miss': 100, 'delete-miss': 50 });
    expect(v8).toMatch(/ww_rate_hit\('new-save', 3600, 30\)/);
    expect(v8).toMatch(/ww_rate_hit\('new-profile', 3600, 60\)/);
    expect(v8).toMatch(/ww_rate_over\('load-miss', 600, 100\)/);
    expect(v8).toMatch(/ww_rate_over\('friend-miss', 600, 100\)/);
    expect(v9).toMatch(/ww_rate_over\('delete-miss', 600, 50\)/);
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
const codeN = (n) => `PLUM-OTTER-${'ABCDEFGHIJ'[Math.floor(n / 100) % 10]}CROW-${String(n % 100).padStart(2, '0')}`;
const A = '203.0.113.7';
const B = '198.51.100.20';
const BEFORE_V10 = ['supabase-setup.sql', 'supabase-colony.sql', 'supabase-v8-hardening.sql', 'supabase-v9-delete.sql'];
const STEP_B_UNDONE = `
  create policy profiles_public_read on public.profiles for select using (true);
  create policy friendships_public_read on public.friendships for select using (true);
  grant select (player_id, pet_name, breed, accessories, rank_title, last_seen) on public.profiles to anon;
  grant select on public.friendships to anon;`;

async function freshDb({ files = [...BEFORE_V10, 'supabase-v10-limits.sql'], before = '' } = {}) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  for (const f of files) {
    if (f === 'supabase-v10-limits.sql' && before) await db.exec(before);
    await db.exec(read(f));
  }
  return db;
}

describe.skipIf(!PGlite)('supabase-v10-limits.sql (in PGlite)', () => {
  let db;
  // q is the database or a transaction: inside one transaction now() stands
  // still, so every call lands in the same counting window.
  const one = async (q, sql, params = []) => Object.values((await q.query(sql, params)).rows[0] ?? {})[0];
  const count = (q, table, where = 'true', params = []) => one(q, `select count(*)::int as n from ${table} where ${where}`, params);
  const headers = (q, h) => q.query("select set_config('request.headers', $1, false)", [h === null ? '' : typeof h === 'string' ? h : JSON.stringify(h)]);
  const from = (q, ip) => headers(q, ip === null ? null : { 'cf-connecting-ip': ip, 'x-forwarded-for': `10.9.9.9, ${ip}`, 'user-agent': 'test' });
  const call = (q, name, a, b) => one(q, `select public.${name}($1, $2) as r`, [a, b]);
  const profile = (q, n, name = 'Mochi') => one(q, "select public.upsert_profile($1, $2, $3, 'tabby', '{}'::jsonb, 'House Cat') as r", [uid(n), SECRET(n), name]);
  const greet = (q, a, b, walk = 'walk-1') => one(q, 'select public.record_friend_greet($1, $2, $3, $4) as r', [uid(a), SECRET(a), uid(b), walk]);
  const save = (q, c = CODE, secret = SECRET(1), lifetime = 5) => one(q, "select public.upsert_save($1, $2, '{\"save\":{}}'::jsonb, $3) as r", [c, secret, lifetime]);
  const load = (q, c = CODE) => one(q, "select public.load_save($1, '') as r", [c]);
  const friend = async (q, c) => (await q.query('select * from public.find_by_friend_code($1)', [c])).rows;
  const wrongCode = (i) => codeN(900 + i);
  const jsonOf = async (q, sql, params = []) => (await q.query(sql, params)).rows[0].r;
  const open = (n) => jsonOf(db, 'select public.colony_invite_open($1, $2) as r', [uid(n), SECRET(n)]);
  const join = (n, c) => jsonOf(db, 'select public.colony_invite_join($1, $2, $3) as r', [uid(n), SECRET(n), c]);
  const answer = (n) => jsonOf(db, 'select public.colony_invite_answer($1, $2, true) as r', [uid(n), SECRET(n)]);
  const sync = (n) => jsonOf(db, "select public.colony_sync($1, $2, '[]'::jsonb) as r", [uid(n), SECRET(n)]);
  const feed = (n, cat, walk = 'walk-1') => one(db, "select public.colony_feed($1, $2, $3, $4, 'park', 1, 2, 0, false) as r", [uid(n), SECRET(n), cat, walk]);
  async function pair(a, b) {
    const inv = await open(a);
    expect((await join(b, inv.code)).status).toBe('pending');
    expect((await answer(a)).status).toBe('paired');
  }
  const age = (table, column, where, months, params = []) => db.query(`update ${table} set ${column} = now() - make_interval(months => ${months}) where ${where}`, params);
  const cleanup = (...args) => jsonOf(db, `select public.ww_cleanup(${args.join(', ')}) as r`);
  const DATA_TABLES = 'saves, profiles, friendships, ww_rate, ww_counts, colonies, colony_members, colony_invites, colony_cats, colony_feeds, colony_trades';
  const limitsBackup = [];

  beforeAll(async () => {
    db = await freshDb();
    limitsBackup.push(...(await db.query('select * from ww_limits order by name, window_secs')).rows);
  }, 30_000);
  beforeEach(async () => {
    await db.exec(`truncate ${DATA_TABLES} cascade;`);
    await db.exec("update ww_salt set source = 'cf-connecting-ip', salt_day = (now() at time zone 'utc')::date;");
    await db.exec('update ww_cleanup_state set enabled = false, months = 12, max_rows = 200, last_sweep = null, last_cleanup = null, last_result = null;');
    await db.exec('delete from ww_limits;');
    for (const l of limitsBackup) await db.query('insert into ww_limits values ($1, $2, $3, $4, $5)', [l.name, l.window_secs, l.per_visitor, l.unknown, l.world]);
    await from(db, A);
  });

  describe('per-visitor limits', () => {
    it('wrong save codes: the 10 from one address stop that address, not another', async () => {
      await save(db);
      await db.transaction(async (tx) => {
        await from(tx, A);
        for (let i = 0; i < 10; i++) expect(await load(tx, wrongCode(i))).toBe(null);
        expect(await load(tx)).toBe(null); // A is over: even the right code answers "no save"
        await from(tx, B);
        const got = await load(tx);
        expect(Object.keys(got).sort()).toEqual(['lifetime', 'payload', 'secret']);
        expect(got.secret).toBe(SECRET(1));
        // 9 wrong codes leave an address still able to load
        for (let i = 0; i < 9; i++) await load(tx, wrongCode(i));
        expect((await load(tx)).lifetime).toBe(5);
      });
    });
    it('new saves: 10 an hour per address, then busy; another address still creates; updates are never busy', async () => {
      await db.transaction(async (tx) => {
        await from(tx, A);
        for (let i = 0; i < 10; i++) expect(await save(tx, codeN(i))).toBe('created');
        expect(await save(tx, codeN(10))).toBe('busy');
        expect(await save(tx, codeN(3), SECRET(1), 6)).toBe('updated');
        await from(tx, B);
        expect(await save(tx, codeN(10))).toBe('created');
      });
      expect(await count(db, 'saves')).toBe(11);
    });
    it('new profiles: 20 an hour per address, then busy; another address still creates; updates are never busy', async () => {
      await db.transaction(async (tx) => {
        await from(tx, A);
        for (let i = 1; i <= 20; i++) expect(await profile(tx, i)).toBe('ok');
        expect(await profile(tx, 21)).toBe('busy');
        expect(await profile(tx, 5, 'Biscuit')).toBe('ok');
        await from(tx, B);
        expect(await profile(tx, 21)).toBe('ok');
      });
      expect(await count(db, 'profiles')).toBe(21);
    });
    it('the whole-day window holds a slow guesser: 50 wrong codes a day per address', async () => {
      await save(db);
      await db.transaction(async (tx) => {
        await from(tx, A);
        for (let round = 0; round < 5; round++) {
          for (let i = 0; i < 10; i++) expect(await load(tx, wrongCode(round * 10 + i))).toBe(null);
          // the 10-minute window passes; the day window keeps counting
          await tx.query("delete from ww_counts where window_secs = 600");
          if (round < 4) expect((await load(tx)).lifetime).toBe(5);
        }
        expect(await load(tx)).toBe(null);
        await from(tx, B);
        expect((await load(tx)).lifetime).toBe(5);
      });
    });
    it('an IPv6 home (one /64) is one visitor; another /64 is another', async () => {
      await save(db);
      await db.transaction(async (tx) => {
        for (let i = 0; i < 10; i++) {
          await from(tx, `2001:db8:aa:bb::${(i + 1).toString(16)}`);
          await load(tx, wrongCode(i));
        }
        await from(tx, '2001:db8:aa:bb:ffff::1');
        expect(await load(tx)).toBe(null);
        await from(tx, '2001:db8:aa:cc::1');
        expect((await load(tx)).lifetime).toBe(5);
        expect(await count(tx, 'ww_counts', "name = 'load-miss' and window_secs = 600 and visitor not in ('', '?')")).toBe(1);
      });
    });
    it('a visitor over their own limit adds nothing more to the world counter', async () => {
      await db.transaction(async (tx) => {
        await from(tx, A);
        for (let i = 0; i < 40; i++) await load(tx, wrongCode(i));
        expect(await one(tx, "select hits from ww_counts where name = 'load-miss' and window_secs = 600 and visitor = ''")).toBe(10);
        expect(await one(tx, "select max(hits) from ww_counts where name = 'load-miss' and visitor <> ''")).toBe(10);
      });
    });
  });

  describe('when the address is not known', () => {
    const cases = {
      'no headers at all (the SQL editor)': null,
      'headers without the address header': { 'user-agent': 'x', 'x-forwarded-for': '203.0.113.7' },
      'a header that is not an address': { 'cf-connecting-ip': 'not-an-address' },
      'an empty address header': { 'cf-connecting-ip': '  ' },
      'headers that are not JSON': '{{{',
      'headers that are a JSON list': '[1,2]',
    };
    for (const [label, h] of Object.entries(cases)) {
      it(`${label}: counted in one shared group with the v8 number, never unlimited`, async () => {
        await save(db);
        await db.transaction(async (tx) => {
          await headers(tx, h);
          expect(await one(tx, 'select public.ww_visitor() is null as r')).toBe(true);
          for (let i = 0; i < 99; i++) expect(await load(tx, wrongCode(i))).toBe(null);
          expect((await load(tx)).lifetime).toBe(5); // 99 of 100: still open, as in v8
          await load(tx, wrongCode(99));
          expect(await load(tx)).toBe(null); // 100: closed, as in v8
          expect(await one(tx, "select hits from ww_counts where name = 'load-miss' and window_secs = 600 and visitor = '?'")).toBe(100);
          // a visitor whose address IS known is not in that group
          await from(tx, B);
          expect((await load(tx)).lifetime).toBe(5);
        });
      });
    }
    it('the other shared numbers are the v8/v9 ones too: 30 new saves, 60 new profiles, 50 wrong deletes', async () => {
      await db.transaction(async (tx) => {
        await headers(tx, null);
        for (let i = 0; i < 30; i++) expect(await save(tx, codeN(i))).toBe('created');
        expect(await save(tx, codeN(30))).toBe('busy');
        for (let i = 1; i <= 60; i++) expect(await profile(tx, i)).toBe('ok');
        expect(await profile(tx, 61)).toBe('busy');
        for (let i = 0; i < 50; i++) expect(await call(tx, 'delete_player', uid(1), 'wrong')).toBe('denied');
        expect(await call(tx, 'delete_player', uid(1), 'wrong')).toBe('busy');
      });
    });
    it("source 'off' puts everyone in the shared group", async () => {
      await db.exec("update ww_salt set source = 'off'");
      expect(await one(db, 'select public.ww_visitor() is null as r')).toBe(true);
      await load(db, wrongCode(1));
      expect(await count(db, 'ww_counts', "visitor not in ('', '?')")).toBe(0);
    });
    it('a limit with no row refuses (busy), it does not let everything through', async () => {
      await save(db);
      await db.exec("delete from ww_limits where name in ('load-miss', 'new-save')");
      expect(await load(db)).toBe(null);
      expect(await save(db, codeN(1))).toBe('busy');
    });
    it('the other sources read the header they name, and only that one', async () => {
      const h = { 'cf-connecting-ip': '192.0.2.1', 'x-real-ip': '192.0.2.2', 'x-forwarded-for': '192.0.2.3, 192.0.2.4 , 192.0.2.5' };
      await headers(db, h);
      const seen = {};
      for (const s of ['cf-connecting-ip', 'x-real-ip', 'xff-first', 'xff-last']) {
        await db.query('update ww_salt set source = $1', [s]);
        seen[s] = await one(db, 'select public.ww_visitor() as r');
      }
      expect(new Set(Object.values(seen)).size).toBe(4);
      const alone = async (s, hh) => { await db.query('update ww_salt set source = $1', [s]); await headers(db, hh); return one(db, 'select public.ww_visitor() as r'); };
      expect(await alone('cf-connecting-ip', { 'cf-connecting-ip': '192.0.2.5' })).toBe(seen['xff-last']);
      expect(await alone('cf-connecting-ip', { 'cf-connecting-ip': '192.0.2.3' })).toBe(seen['xff-first']);
      expect(await alone('xff-last', { 'x-forwarded-for': '192.0.2.2' })).toBe(seen['x-real-ip']);
      // by default a forged x-forwarded-for changes nothing
      expect(await alone('cf-connecting-ip', { 'cf-connecting-ip': '192.0.2.1', 'x-forwarded-for': '6.6.6.6' })).toBe(seen['cf-connecting-ip']);
    });
  });

  describe('a flood from one address', () => {
    it('leaves another address able to load, find and add a friend, and delete; and the flooder can still delete their own', async () => {
      await from(db, B);
      await profile(db, 1); await profile(db, 2, 'Biscuit'); await profile(db, 3, 'Pip');
      await save(db);
      await save(db, codeN(1), SECRET(3));
      await db.transaction(async (tx) => {
        await from(tx, A);
        const answers = { load: new Set(), friend: 0, delSave: new Set(), delPlayer: new Set() };
        for (let i = 0; i < 600; i++) {
          answers.load.add(await load(tx, wrongCode(i)));
          answers.friend += (await friend(tx, (0xa0000000 + i).toString(16))).length;
          answers.delSave.add(await call(tx, 'delete_save', i % 2 ? CODE : wrongCode(i), 'wrong'));
          answers.delPlayer.add(await call(tx, 'delete_player', uid(1), i % 2 ? 'wrong' : null));
        }
        expect([...answers.load]).toEqual([null]);
        expect(answers.friend).toBe(0);
        expect([...answers.delSave].sort()).toEqual(['busy', 'denied', 'none']);
        expect([...answers.delPlayer].sort()).toEqual(['busy', 'denied']);
        // the flooder is shut out of guessing: a right code and a real friend code answer nothing
        expect(await load(tx)).toBe(null);
        expect((await friend(tx, uid(2).slice(0, 8))).length).toBe(0);
        // … and learns nothing from a wrong delete: a real code and a made-up one answer alike
        expect(await call(tx, 'delete_save', CODE, 'wrong')).toBe('busy');
        expect(await call(tx, 'delete_save', wrongCode(1), 'wrong')).toBe('busy');
        // but their OWN data, with the right secret, still deletes
        expect(await call(tx, 'delete_save', codeN(1), SECRET(3))).toBe('ok');
        expect(await call(tx, 'delete_player', uid(3), SECRET(3))).toBe('ok');

        await from(tx, B);
        expect((await load(tx)).secret).toBe(SECRET(1));
        expect((await friend(tx, uid(2).slice(0, 8))).map((r) => r.pet_name)).toEqual(['Biscuit']);
        expect(await greet(tx, 1, 2, 'friendcode')).toBe(1);
        expect(await save(tx, codeN(2))).toBe('created');
        expect(await profile(tx, 4, 'Fern')).toBe('ok');
        expect(await call(tx, 'delete_save', CODE, SECRET(1))).toBe('ok');
        expect(await call(tx, 'delete_player', uid(1), SECRET(1))).toBe('ok');
      });
      expect(await count(db, 'saves', 'code = $1', [CODE])).toBe(0);
      expect(await count(db, 'profiles', 'player_id = $1', [uid(1)])).toBe(0);
      expect(await count(db, 'profiles', 'player_id = $1', [uid(2)])).toBe(1);
    });
    it('even with the world ceiling reached, the right secret deletes; wrong answers get busy', async () => {
      await profile(db, 1); await save(db);
      await db.exec("update ww_limits set world = 30 where name in ('delete-miss', 'load-miss') and window_secs = 600");
      await db.transaction(async (tx) => {
        for (let i = 0; i < 30; i++) {
          await from(tx, `192.0.2.${i + 1}`);
          expect(await call(tx, 'delete_player', uid(1), 'wrong')).toBe('denied');
          expect(await load(tx, wrongCode(i))).toBe(null);
        }
        await from(tx, B); // a brand-new address
        expect(await call(tx, 'delete_player', uid(1), 'wrong')).toBe('busy');
        expect(await call(tx, 'delete_save', CODE, 'wrong')).toBe('busy');
        expect(await load(tx)).toBe(null); // the backstop does close "Load from cloud" for everyone
        expect(await call(tx, 'delete_player', uid(9), SECRET(9))).toBe('none'); // nothing there: never busy
        expect(await call(tx, 'delete_save', CODE, SECRET(1))).toBe('ok');
        expect(await call(tx, 'delete_player', uid(1), SECRET(1))).toBe('ok');
      });
    });
    it('the counter table cannot be grown past the world ceiling by inventing addresses', async () => {
      await db.exec("update ww_limits set world = 25 where name = 'load-miss'");
      await db.transaction(async (tx) => {
        for (let i = 0; i < 80; i++) {
          await from(tx, `192.0.2.${i + 1}`);
          await load(tx, wrongCode(i));
        }
        expect(await count(tx, 'ww_counts', "name = 'load-miss' and window_secs = 600 and visitor <> ''")).toBe(25);
      });
    });
  });

  describe('what is stored', () => {
    it('never the address: only a 32-character salted hash, different under a different salt', async () => {
      await profile(db, 1); await save(db);
      const ips = [A, '2001:db8:aa:bb::1234'];
      for (const ip of ips) {
        await from(db, ip);
        await load(db, wrongCode(1));
        await friend(db, 'abcdef12');
        await call(db, 'delete_save', wrongCode(2), 'x');
        await call(db, 'delete_player', uid(1), 'x');
        await save(db, codeN(ips.indexOf(ip) + 1));
        await profile(db, 5 + ips.indexOf(ip));
      }
      const visitors = (await db.query('select distinct visitor from ww_counts')).rows.map((r) => r.visitor).sort();
      expect(visitors.length).toBe(3); // '', and one hash per address
      for (const v of visitors) expect(v === '' || /^[0-9a-f]{32}$/.test(v), v).toBe(true);
      let everything = '';
      for (const t of ['ww_counts', 'ww_salt', 'ww_limits', 'ww_cleanup_state', 'ww_rate', 'saves', 'profiles', 'friendships']) {
        everything += await one(db, `select coalesce(json_agg(t)::text, '') as r from ${t} t`);
      }
      for (const needle of ['203.0.113', '2001:db8', '2001:0db8', 'aa:bb']) expect(everything).not.toContain(needle);
      // no column anywhere in the new tables is an address type
      expect(await count(db, 'information_schema.columns', "table_schema = 'public' and table_name like 'ww_%' and data_type in ('inet', 'cidr')")).toBe(0);
      // the hash depends on the secret salt
      await from(db, A);
      const h1 = await one(db, 'select public.ww_visitor() as r');
      expect(await one(db, 'select public.ww_visitor() as r')).toBe(h1);
      await db.exec("update ww_salt set salt = 'another-salt'");
      expect(await one(db, 'select public.ww_visitor() as r')).not.toBe(h1);
      expect(h1).not.toBe(await one(db, "select substr(encode(sha256(convert_to('203.0.113.7', 'UTF8')), 'hex'), 1, 32) as r"));
    });
    it('the public key can read none of the new tables and call none of the helpers, only the tick', async () => {
      for (const t of PRIVATE_TABLES) {
        for (const role of ['anon', 'authenticated']) {
          for (const p of ['select', 'insert', 'update', 'delete']) expect(await one(db, 'select has_table_privilege($1, $2, $3) as r', [role, `public.${t}`, p]), `${role} ${p} ${t}`).toBe(false);
        }
        expect(await one(db, "select relrowsecurity from pg_class where oid = $1::regclass", [`public.${t}`])).toBe(true);
        expect(await count(db, 'pg_policies', 'tablename = $1', [t])).toBe(0);
      }
      for (const f of ['ww_visitor()', 'ww_over(text)', 'ww_hit(text)', 'ww_purge_player(text)', 'ww_counts_sweep()', 'ww_cleanup(boolean,integer,integer)']) {
        for (const role of ['anon', 'authenticated', 'public']) expect(await one(db, 'select has_function_privilege($1, $2, $3) as r', [role, `public.${f}`, 'execute']), `${role} ${f}`).toBe(false);
      }
      expect(await one(db, "select has_function_privilege('anon', 'public.ww_cleanup_tick()', 'execute') as r")).toBe(true);
      await db.exec('set role anon');
      try {
        await expect(db.query('select * from public.ww_salt')).rejects.toThrow(/permission denied/);
        await expect(db.query('select * from public.ww_counts')).rejects.toThrow(/permission denied/);
        await expect(db.query('select public.ww_visitor()')).rejects.toThrow(/permission denied/);
        await expect(db.query('select public.ww_cleanup(false, 5000, 6)')).rejects.toThrow(/permission denied/);
        expect(await load(db, wrongCode(1))).toBe(null); // the game's own calls still work as anon
        expect(await one(db, 'select public.ww_cleanup_tick() as r')).toBe('ok');
      } finally {
        await db.exec('reset role');
      }
    });
  });

  describe('windows passing', () => {
    it('a visitor over the limit is let in again when the window has passed, and the old rows go', async () => {
      await save(db);
      await db.transaction(async (tx) => {
        for (let i = 0; i < 10; i++) await load(tx, wrongCode(i));
        expect(await load(tx)).toBe(null);
        // ten minutes later: every counter row is now in an earlier window
        await tx.query("update ww_counts set bucket = bucket - interval '10 minutes' where window_secs = 600");
        expect((await load(tx)).lifetime).toBe(5);
        expect(await count(tx, 'ww_counts', "name = 'load-miss' and window_secs = 600")).toBe(2); // still there, unused
        await load(tx, wrongCode(1)); // the first miss of the new window clears the old one
        expect(await count(tx, 'ww_counts', "name = 'load-miss' and window_secs = 600")).toBe(2);
        expect(await one(tx, "select max(hits) from ww_counts where name = 'load-miss' and window_secs = 600")).toBe(1);
        expect(await one(tx, "select count(*)::int from ww_counts where name = 'load-miss' and window_secs = 600 and bucket + interval '10 minutes' <= now()")).toBe(0);
      });
    });
    it('the sweep deletes every counter row whose window has passed, and only those', async () => {
      await load(db, wrongCode(1)); await friend(db, 'abcdef12');
      const rows = await count(db, 'ww_counts');
      expect(rows).toBe(8);
      await db.exec("update ww_counts set bucket = bucket - interval '10 minutes' where window_secs = 600 and name = 'load-miss'");
      expect(await one(db, 'select public.ww_counts_sweep() as r')).toBe(2);
      expect(await count(db, 'ww_counts')).toBe(6);
      await db.exec("update ww_counts set bucket = bucket - interval '1 day'");
      await one(db, 'select public.ww_counts_sweep() as r');
      expect(await count(db, 'ww_counts')).toBe(0);
    });
    it('a new day: the salt is replaced and every per-visitor row deleted, by the next request or the sweep', async () => {
      for (const how of ['select public.load_save($1, \'\')', 'select public.ww_counts_sweep()']) {
        await db.exec('truncate ww_counts');
        await from(db, A); await load(db, wrongCode(1));
        await headers(db, null); await load(db, wrongCode(2));
        const salt = await one(db, 'select salt from ww_salt');
        expect(await count(db, 'ww_counts', "visitor not in ('', '?')")).toBe(2);
        await db.exec("update ww_salt set salt_day = salt_day - 1");
        await from(db, B);
        await db.query(how, how.includes('$1') ? [CODE] : []);
        expect(await one(db, 'select salt from ww_salt'), how).not.toBe(salt);
        expect(await one(db, "select salt_day = (now() at time zone 'utc')::date as r from ww_salt")).toBe(true);
        expect(await count(db, 'ww_counts', "visitor not in ('', '?')"), how).toBe(how.includes('load_save') ? 2 : 0); // only B's new rows, if any
        expect(await count(db, 'ww_counts', "visitor = '?'")).toBe(2); // the shared groups are not addresses: kept
        expect(await count(db, 'ww_salt')).toBe(1);
      }
    });
  });

  describe('the delete functions answer as in v9', () => {
    it("delete_save: 'ok' then 'none'; a wrong, empty or NULL secret is 'denied' and deletes nothing", async () => {
      await save(db);
      for (const s of [SECRET(2), '', null]) expect(await call(db, 'delete_save', CODE, s)).toBe('denied');
      expect(await count(db, 'saves')).toBe(1);
      expect(await call(db, 'delete_save', null, SECRET(1))).toBe('none');
      expect(await call(db, 'delete_save', CODE, SECRET(1))).toBe('ok');
      expect(await call(db, 'delete_save', CODE, SECRET(1))).toBe('none');
    });
    it("delete_player: removes profile, friendships and colony sharing; the partner keeps the colony", async () => {
      await profile(db, 1); await profile(db, 2, 'Biscuit'); await profile(db, 3, 'Pip');
      await pair(1, 2); await greet(db, 1, 2); await greet(db, 2, 3);
      expect(await feed(1, 'Ash')).toBe('ok');
      for (const s of [SECRET(2), '', null]) expect(await call(db, 'delete_player', uid(1), s)).toBe('denied');
      expect(await count(db, 'profiles')).toBe(3);
      expect(await call(db, 'delete_player', uid(1), SECRET(1))).toBe('ok');
      expect(await call(db, 'delete_player', uid(1), SECRET(1))).toBe('none');
      expect(await count(db, 'friendships')).toBe(1);
      expect(await count(db, 'colonies')).toBe(1);
      expect(await count(db, 'colony_cats')).toBe(1);
      expect((await sync(2)).status).toBe('unpaired');
      expect(await call(db, 'delete_player', uid(2), SECRET(2))).toBe('ok');
      expect(await count(db, 'colonies')).toBe(0);
    });
    it("counts delete_save's misses but not delete_player's 'none'", async () => {
      await call(db, 'delete_save', wrongCode(1), SECRET(1));
      await call(db, 'delete_player', uid(9), SECRET(9));
      expect(await one(db, "select hits from ww_counts where name = 'delete-miss' and window_secs = 600 and visitor = ''")).toBe(1);
    });
  });

  describe('the clean-up', () => {
    // Players 1 and 2 share a colony and went quiet 13 months ago; 3 and 4
    // share one and only 3 went quiet; 5 and 6 play today. Saves likewise.
    async function world() {
      await headers(db, null); // the shared group: room for six profiles in one go
      for (const [n, name] of [[1, 'Mochi'], [2, 'Biscuit'], [3, 'Pip'], [4, 'Fern'], [5, 'Ash'], [6, 'Moss']]) expect(await profile(db, n, name)).toBe('ok');
      await pair(1, 2); await pair(3, 4);
      expect(await feed(1, 'Ash')).toBe('ok'); expect(await feed(2, 'Ash', 'walk-2')).toBe('ok');
      expect(await feed(3, 'Fern')).toBe('ok'); expect(await feed(4, 'Reed')).toBe('ok');
      await greet(db, 1, 2); await greet(db, 1, 5); await greet(db, 3, 4); await greet(db, 5, 6); await greet(db, 4, 6);
      const inv = await open(5);
      await join(3, inv.code);
      for (let i = 0; i < 6; i++) expect(await save(db, codeN(i), SECRET(i))).toBe('created');
      await age('profiles', 'last_seen', 'player_id = any($1)', 13, [[uid(1), uid(2), uid(3)]]);
      await age('saves', 'updated_at', 'code = any($1)', 13, [[codeN(0), codeN(1), codeN(2)]]);
      await db.query("update saves set updated_at = updated_at - interval '1 day' where code = $1", [codeN(0)]); // the oldest
      await db.query("update profiles set last_seen = last_seen - interval '1 day' where player_id = $1", [uid(1)]);
    }
    const snapshot = () => one(db, `select json_build_object(
      'saves', (select json_agg(code order by code) from saves),
      'profiles', (select json_agg(player_id order by player_id) from profiles),
      'friendships', (select json_agg(pair order by pair) from friendships),
      'members', (select json_agg(player_id order by player_id) from colony_members),
      'colonies', (select count(*) from colonies), 'cats', (select count(*) from colony_cats),
      'feeds', (select count(*) from colony_feeds), 'invites', (select count(*) from colony_invites))::text as r`);

    it('a dry run (the default) counts what would go and deletes nothing', async () => {
      await world();
      const before = await snapshot();
      const r = await cleanup();
      expect(r).toMatchObject({
        dry_run: true, saves: 3, profiles: 3, friendships: 3, colony_members: 3, colonies: 1,
        orphan_friendships: 0, empty_colonies: 0, expired_invites: 0, more: false,
      });
      expect(await snapshot()).toBe(before);
      expect((await cleanup('true', 200, 12)).saves).toBe(3);
      expect(await snapshot()).toBe(before);
    });
    it('a real run removes the old saves and profiles with what hangs off them; fresh rows and partners survive', async () => {
      await world();
      const dry = await cleanup();
      const r = await cleanup('false', 200, 12);
      expect({ ...r, dry_run: true, cutoff: 0 }).toEqual({ ...dry, cutoff: 0 }); // the dry run told the truth
      expect(JSON.parse(await snapshot())).toEqual({
        saves: [codeN(3), codeN(4), codeN(5)],
        profiles: [uid(4), uid(5), uid(6)],
        friendships: [`${uid(4)}:${uid(6)}`, `${uid(5)}:${uid(6)}`],
        members: [uid(4)],
        colonies: 1, cats: 2, feeds: 2, // 3 and 4's colony, kept for 4 with both cats
        invites: 1, // 5's own invite stays …
      });
      expect(await count(db, 'colony_invites', 'joiner_id is not null')).toBe(0); // … with 3's request cleared
      // the partner who stayed reads "unpaired" and can pair again into the same colony
      expect((await sync(4)).status).toBe('unpaired');
      // a second run finds nothing
      expect(await cleanup('false', 200, 12)).toMatchObject({ saves: 0, profiles: 0, friendships: 0, colonies: 0, more: false });
      // a removed player who comes back is simply new again, and the save uploads under its old code
      await from(db, A);
      expect(await profile(db, 1)).toBe('ok');
      expect(await save(db, codeN(0), SECRET(0))).toBe('created');
    });
    it('the cap: at most that many saves and that many profiles per run, oldest first, and it says there is more', async () => {
      await world();
      const r = await cleanup('false', 1, 12);
      expect(r).toMatchObject({ saves: 1, profiles: 1, more: true });
      expect(await count(db, 'saves', 'code = $1', [codeN(0)])).toBe(0);
      expect(await count(db, 'profiles', 'player_id = $1', [uid(1)])).toBe(0);
      expect(await count(db, 'saves')).toBe(5);
      expect(await count(db, 'profiles')).toBe(5);
      expect(await count(db, 'colonies')).toBe(2); // 2 is still in the first colony
      expect(await cleanup('false', 1, 12)).toMatchObject({ saves: 1, profiles: 1, colonies: 1, more: true });
      expect(await cleanup('false', 1, 12)).toMatchObject({ saves: 1, profiles: 1, more: false });
      expect(await count(db, 'saves')).toBe(3);
      expect(await count(db, 'profiles')).toBe(3);
    });
    it('"touched" is an upload for a save and a profile push for a cat: either one keeps the row', async () => {
      await world();
      expect(await save(db, codeN(1), SECRET(1), 9)).toBe('updated');
      expect(await profile(db, 2, 'Biscuit')).toBe('ok');
      expect(await cleanup('false', 200, 12)).toMatchObject({ saves: 2, profiles: 2, colonies: 0 });
      expect(await count(db, 'saves', 'code = $1', [codeN(1)])).toBe(1);
      expect(await count(db, 'profiles', 'player_id = $1', [uid(2)])).toBe(1);
      expect(await count(db, 'colonies')).toBe(2);
      expect(await count(db, 'colony_cats')).toBe(3);
    });
    it('a row just under the cut-off survives; the cut-off follows the months asked for', async () => {
      await world();
      await age('saves', 'updated_at', 'code = $1', 11, [codeN(3)]);
      await age('profiles', 'last_seen', 'player_id = $1', 11, [uid(5)]);
      expect(await cleanup('true', 200, 12)).toMatchObject({ saves: 3, profiles: 3 });
      expect(await cleanup('true', 200, 10)).toMatchObject({ saves: 4, profiles: 4 });
      expect(await cleanup('true', 200, 14)).toMatchObject({ saves: 0, profiles: 0 });
    });
    it('housekeeping: old friend links to nobody, old colonies with no member, long-expired invites', async () => {
      await world();
      await db.query("insert into friendships (pair, a_id, b_id, greets, updated_at) values ('x:y', $1, $2, 1, now() - interval '13 months'), ('x:z', $1, $3, 1, now()), ('p:q', $4, $5, 1, now() - interval '13 months')",
        [uid(5), uid(77), uid(78), uid(5), uid(6)]);
      await db.exec("insert into colonies (id, created_at) values ('emptyold', now() - interval '13 months'), ('emptynew', now())");
      await db.query("insert into colony_cats (colony_id, name, finder_id, area, x, z) values ('emptyold', 'Ash', $1, 'park', 0, 0)", [uid(77)]);
      await db.exec("update colony_invites set expires_at = now() - interval '2 days'");
      const dry = await cleanup();
      expect(dry).toMatchObject({ orphan_friendships: 1, empty_colonies: 1, expired_invites: 1 });
      await cleanup('false', 200, 12);
      expect(await count(db, 'friendships', "pair in ('x:y', 'x:z', 'p:q')")).toBe(2); // the fresh one and the one between two real players stay
      expect(await count(db, 'colonies', "id like 'empty%'")).toBe(1);
      expect(await count(db, 'colony_cats', "colony_id = 'emptyold'")).toBe(0);
      expect(await count(db, 'colony_invites')).toBe(0);
    });
    it('refuses a cut-off under 6 months, a silly cap, or a missing value', async () => {
      await world();
      const before = await snapshot();
      await expect(cleanup('false', 200, 5)).rejects.toThrow(/under 6 months/);
      await expect(cleanup('false', 200, 0)).rejects.toThrow(/under 6 months/);
      await expect(cleanup('false', 0, 12)).rejects.toThrow(/between 1 and 5000/);
      await expect(cleanup('false', 5001, 12)).rejects.toThrow(/between 1 and 5000/);
      await expect(cleanup('null', 200, 12)).rejects.toThrow(/all three values/);
      await expect(db.exec('update ww_cleanup_state set months = 3')).rejects.toThrow(/check/);
      expect(await snapshot()).toBe(before);
    });
    it('the tick: deletes nothing while the clean-up is off; once on, runs it at most every 20 hours and notes the counts', async () => {
      await world();
      const before = await snapshot();
      expect(await one(db, 'select public.ww_cleanup_tick() as r')).toBe('ok');
      expect(await snapshot()).toBe(before);
      expect(await one(db, 'select last_sweep is not null and last_cleanup is null as r from ww_cleanup_state')).toBe(true);

      await db.exec('update ww_cleanup_state set enabled = true, max_rows = 2');
      expect(await one(db, 'select public.ww_cleanup_tick() as r')).toBe('ok');
      expect(await count(db, 'saves')).toBe(4);
      expect(await count(db, 'profiles')).toBe(4);
      expect(await one(db, "select (last_result ->> 'saves')::int from ww_cleanup_state")).toBe(2);
      // called again straight away (anyone can): nothing more happens
      for (let i = 0; i < 3; i++) expect(await one(db, 'select public.ww_cleanup_tick() as r')).toBe('ok');
      expect(await count(db, 'saves')).toBe(4);
      await db.exec("update ww_cleanup_state set last_cleanup = now() - interval '21 hours'");
      await one(db, 'select public.ww_cleanup_tick() as r');
      expect(await count(db, 'saves')).toBe(3);
      expect(await count(db, 'profiles')).toBe(3);
    });
    it('the tick sweeps passed counter rows at most every 5 minutes', async () => {
      await load(db, wrongCode(1));
      await db.exec("update ww_counts set bucket = bucket - interval '2 days'");
      await one(db, 'select public.ww_cleanup_tick() as r');
      expect(await count(db, 'ww_counts')).toBe(0);
      await load(db, wrongCode(1));
      await db.exec("update ww_counts set bucket = bucket - interval '2 days'");
      await one(db, 'select public.ww_cleanup_tick() as r');
      expect(await count(db, 'ww_counts')).toBe(4);
      await db.exec("update ww_cleanup_state set last_sweep = now() - interval '6 minutes'");
      await one(db, 'select public.ww_cleanup_tick() as r');
      expect(await count(db, 'ww_counts')).toBe(0);
    });
  });

  describe('running the file', () => {
    const shape = (q) => q.query(`select p.proname, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
        p.prosecdef, p.proconfig::text as config, has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p where p.pronamespace = 'public'::regnamespace
       and p.proname in ('upsert_save','load_save','upsert_profile','find_by_friend_code','delete_save','delete_player',
                         'record_friend_greet','profiles_by_ids','friendships_of') order by p.proname`).then((r) => r.rows);
    it('every function the game calls has the same arguments, result type and grants as before v10', async () => {
      const old = await freshDb({ files: BEFORE_V10 });
      const before = await shape(old);
      expect(before.length).toBe(9);
      expect(await shape(db)).toEqual(before);
    }, 30_000);
    it('re-running it changes no data, no salt, no tuned limit and no clean-up switch', async () => {
      await profile(db, 1); await profile(db, 2, 'Biscuit'); await pair(1, 2); await feed(1, 'Ash'); await save(db);
      await load(db, wrongCode(1));
      await db.exec("update ww_limits set per_visitor = 3 where name = 'load-miss' and window_secs = 600");
      await db.exec("update ww_cleanup_state set enabled = true, months = 18; update ww_salt set source = 'xff-last'");
      const state = () => one(db, `select json_build_array(
        (select json_agg(t order by t.code) from saves t), (select json_agg(t order by t.player_id) from profiles t),
        (select count(*) from colony_members), (select count(*) from colony_cats),
        (select json_agg(t) from ww_salt t), (select json_agg(t order by t.name, t.window_secs) from ww_limits t),
        (select json_agg(t) from ww_cleanup_state t), (select json_agg(t order by t.name, t.window_secs, t.visitor) from ww_counts t))::text as r`);
      const before = await state();
      await db.exec(v10);
      await db.exec(v10);
      expect(await state()).toBe(before);
      expect(await call(db, 'delete_player', uid(1), SECRET(1))).toBe('ok');
    });
    it('each step can be run on its own, in order, and refuses to run before the one it needs', async () => {
      const steps = v10.split(/\n(?=-- ══ STEP \d — )/);
      expect(steps.length).toBe(5); // the header and guard, then steps 1 to 4
      const bare = await freshDb({ files: BEFORE_V10 });
      await bare.exec(steps[0]);
      await expect(bare.exec(steps[2])).rejects.toThrow(/step 1 .* has not been run/);
      await expect(bare.exec(steps[3])).rejects.toThrow(/step 2 .* has not been run/);
      await expect(bare.exec(steps[4])).rejects.toThrow(/steps 1 and 3 must be run before step 4/);
      await bare.exec(steps[1]);
      await bare.exec(steps[2]);
      // after steps 1 and 2 nothing has changed for players: the v8 world-wide limit is still the one in force
      expect(await one(bare, "select prosrc like '%ww_rate_hit(%' as r from pg_proc where proname = 'load_save'")).toBe(true);
      await bare.exec(steps[3]);
      expect(await one(bare, "select prosrc like '%ww_hit(%' as r from pg_proc where proname = 'load_save'")).toBe(true);
      await bare.exec(steps[4]);
      for (const s of steps) await bare.exec(s);
      expect(await one(bare, 'select public.ww_cleanup_tick() as r')).toBe('ok');
    }, 30_000);
    it('refuses to run without v9, and says which file to run', async () => {
      const bare = new PGlite();
      await bare.exec('create role anon; create role authenticated;');
      await bare.exec(read('supabase-setup.sql'));
      await expect(bare.exec(v10)).rejects.toThrow(/Run docs\/supabase-colony\.sql first/);
      await bare.exec(read('supabase-colony.sql'));
      await bare.exec('drop function public.delete_save(text, text);');
      await expect(bare.exec(v10)).rejects.toThrow(/Run docs\/supabase-v9-delete\.sql first/);
    }, 30_000);
    it("is correct whether or not v8's STEP B has run: it leaves the policies and grants exactly as it found them", async () => {
      const grants = (q) => one(q, `select json_build_array(
        (select json_agg(policyname order by policyname) from pg_policies where tablename in ('profiles', 'friendships')),
        has_table_privilege('anon', 'public.friendships', 'select'),
        has_column_privilege('anon', 'public.profiles', 'pet_name', 'select'),
        has_column_privilege('anon', 'public.profiles', 'secret', 'select'),
        has_table_privilege('anon', 'public.saves', 'select'))::text as r`);
      // not yet run: the v7 public reads are still there
      const notYet = await freshDb({ files: BEFORE_V10 });
      await notYet.exec(STEP_B_UNDONE);
      const before = await grants(notYet);
      expect(JSON.parse(before)).toEqual([['friendships_public_read', 'profiles_public_read'], true, true, false, false]);
      await notYet.exec(v10);
      expect(await grants(notYet)).toBe(before);
      // already run (a fresh setup has it built in)
      expect(JSON.parse(await grants(db))).toEqual([null, false, false, false, false]);
      for (const q of [notYet, db]) {
        await from(q, A);
        await q.query("select public.upsert_profile($1, $2, 'Mochi', 'tabby', '{}'::jsonb, 'House Cat')", [uid(31), SECRET(31)]);
        expect((await friend(q, uid(31).slice(0, 8))).length).toBe(1);
        expect(await call(q, 'delete_player', uid(31), 'wrong')).toBe('denied');
        expect(await call(q, 'delete_player', uid(31), SECRET(31))).toBe('ok');
      }
      // running STEP B afterwards still works, and v10's functions with it
      const stepB = v8.slice(v8.indexOf('-- >>> STEP B start'), v8.indexOf('-- <<< STEP B end'));
      await notYet.exec(stepB);
      expect(JSON.parse(await grants(notYet))).toEqual([null, false, false, false, false]);
      expect(await save(notYet)).toBe('created');
      expect((await load(notYet)).lifetime).toBe(5);
    }, 30_000);
    it('the rollback of step 3 (v8, then v9) puts the world-wide functions back and they work', async () => {
      const back = await freshDb();
      await back.exec(v8); await back.exec(v9);
      await back.exec('drop function if exists public.ww_purge_player(text);');
      expect(await one(back, "select bool_and(prosrc not like '%ww_hit(%') as r from pg_proc where proname in ('upsert_save','load_save','upsert_profile','find_by_friend_code','delete_save','delete_player')")).toBe(true);
      expect(await save(back)).toBe('created');
      expect(await call(back, 'delete_save', CODE, SECRET(1))).toBe('ok');
      await back.exec(v10); // and forward again
      expect(await one(back, "select bool_and(prosrc like '%ww_hit(%') as r from pg_proc where proname in ('upsert_save','load_save','upsert_profile','find_by_friend_code','delete_save','delete_player')")).toBe(true);
    }, 30_000);
    it("the runbook's queries run and answer as the file says", async () => {
      const queries = runbookQueries();
      const rows = [];
      for (const q of queries) rows.push((await db.query(q)).rows);
      const [a1, a2, a3, a4, a5, b1, b1b, b2, b3, b4, b5, b6, b7] = rows;
      expect(a1[0]).toEqual({ has_v8: true, has_v9: true, has_v10: true });
      expect(a2).toEqual([]);
      expect(typeof a3[0].postgres_version).toBe('string');
      expect(a4.map((r) => r.table_name)).toEqual(expect.arrayContaining(['saves', 'profiles', 'ww_counts']));
      expect(a5[0]).toMatchObject({ saves_over_12_months: 0, profiles_over_12_months: 0 });
      expect(b1).toEqual(PRIVATE_TABLES.slice().sort().map((t) => ({ table_name: t, rls_on: true, anon_can_read: false })));
      expect(b1b.length).toBe(10);
      expect(b2[0]).toEqual({ visitor: false, over: false, hit: false });
      expect(b3.map((r) => r.uses_v10)).toEqual([true, true, true, true, true, true]);
      expect(b4[0]).toEqual({ save_answer: 'none', player_answer: 'none' });
      expect(b5.map((r) => [r.limit_name, r.known_visitor])).toEqual([['delete-miss', true]]);
      expect(b6[0]).toEqual({ only_hashes: true });
      expect(b7[0]).toEqual({ cleanup_on: false, tick_callable: true, cleanup_callable: false });
      // on a database without v10 the first query says so instead of failing
      const old = await freshDb({ files: BEFORE_V10 });
      expect((await old.query(queries[0])).rows[0]).toEqual({ has_v8: true, has_v9: true, has_v10: false });
    }, 30_000);
    it('the STEP 0 probe shows header names and true/false only, tells a forged header from a real one, and is removed again', async () => {
      const block = v10.slice(v10.indexOf('-- >>> STEP 0 start'), v10.indexOf('-- <<< STEP 0 end'));
      await db.exec(block);
      const probe = (h) => headers(db, h).then(() => jsonOf(db, "select public.ww_header_probe('203.0.113.9') as r"));
      expect(await probe(null)).toEqual({ headers_readable: false });
      const honest = await probe({ 'cf-connecting-ip': '198.51.100.20', 'x-forwarded-for': '198.51.100.20, 10.0.0.1', apikey: 'k' });
      expect(honest).toMatchObject({ headers_readable: true, cf_present: true, cf_is_claim: false, xff_entries: 2, xff_first_equals_cf: true, xff_last_equals_cf: false, visitor_known_now: true });
      expect(honest.header_names).toEqual(['apikey', 'cf-connecting-ip', 'x-forwarded-for']);
      const forged = await probe({ 'cf-connecting-ip': '198.51.100.20', 'x-forwarded-for': '203.0.113.9, 198.51.100.20' });
      expect(forged).toMatchObject({ cf_is_claim: false, xff_first_is_claim: true, xff_last_is_claim: false });
      expect(JSON.stringify([honest, forged])).not.toMatch(/198\.51|203\.0|"k"/);
      await db.exec('drop function if exists public.ww_header_probe(text);');
    });
  });
});
