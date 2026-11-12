-- Whisker Walk v9 — "Delete my online data".
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent), and safe to run BEFORE the new game client is
-- on any device: it only ADDS two functions. Nothing runs them until a
-- grown-up taps "Delete my online data" on the Cloud save sheet, and an older
-- client never calls them at all.
--
-- Run it after docs/supabase-v8-hardening.sql (it uses v8's rate-limit
-- helpers) on a database that already has docs/supabase-setup.sql and
-- docs/supabase-colony.sql. A brand-new database doesn't need it:
-- docs/supabase-setup.sql already has delete_save and docs/supabase-colony.sql
-- already has delete_player, word for word as below.
--
-- What it adds:
--   1. delete_save(code, secret)        deletes one cloud save row
--   2. delete_player(player id, secret) deletes one device's cat profile,
--      its friendships and its colony sharing
-- Both need the secret that only the device (or the save's devices) holds,
-- and both answer one short word:
--   'ok'     deleted
--   'none'   there was nothing to delete (also the answer to a second call,
--            so the game can safely try again after a half-finished delete)
--   'denied' the secret is missing or wrong; nothing deleted
--   'busy'   too many wrong answers lately (see the limit below); nothing
--            deleted, try again in ten minutes
--
-- Nothing here changes or deletes a row of player data when the file is RUN.
-- Rows are only deleted when the game calls one of the functions.

-- ── Guard: v7, the colony and v8 must already be in place ─────────────
-- PL/pgSQL bodies aren't checked when they are created, so without this a
-- missing table or helper would only show up later, as a failing delete.
do $$
begin
  if to_regclass('public.saves') is null or to_regclass('public.profiles') is null
     or to_regclass('public.friendships') is null then
    raise exception 'Whisker Walk: the v7 tables are missing. Run docs/supabase-setup.sql first, then run this file again.';
  end if;
  if to_regclass('public.colony_members') is null or to_regclass('public.colony_invites') is null
     or to_regclass('public.colony_trades') is null or to_regclass('public.colonies') is null then
    raise exception 'Whisker Walk: the colony tables are missing. Run docs/supabase-colony.sql first, then run this file again.';
  end if;
  if to_regprocedure('public.ww_rate_hit(text,integer,integer)') is null
     or to_regprocedure('public.ww_rate_over(text,integer,integer)') is null then
    raise exception 'Whisker Walk: the v8 hardening is missing. Run docs/supabase-v8-hardening.sql first, then run this file again.';
  end if;
end $$;

-- ── The limit on wrong answers (both functions) ───────────────────────
-- Every 'denied', and every delete_save 'none', counts one 'delete-miss'
-- (ww_rate, from v8 section 1). After 50 in 10 minutes, counted across
-- everyone, both functions answer 'busy' to every call until the 10 minutes
-- are up, WITHOUT looking at the secret, so a flood can't be used to guess.
-- Why count delete_save's 'none': it tells a code that exists from one that
-- doesn't, exactly like load_save does (load_save's own limit is 100 misses
-- per 10 minutes), so it gets a budget of its own instead of a free side door.
-- delete_player's 'none' is not counted: player ids are random UUIDs that
-- other players already see (friend codes, colony snapshots), so "this id has
-- no profile" tells nobody anything, and a device that never saved a cat
-- name gets 'none' on every delete.
-- The secrets themselves are two random UUIDs (save rows start with the
-- device's own), far beyond guessing at any rate; the limit is belt and braces.
-- Trade-off: someone flooding wrong secrets also stops a real delete for up
-- to 10 minutes. The game then says the cloud is busy; nothing is lost.

-- ── 1. delete_save ────────────────────────────────────────────────────
-- What: deletes the cloud save row for this code (its progress and its photo
-- album), when the secret is the row's own secret. The game sends the secret
-- it keeps beside the code (whisker-walk-cloudsecret), the same one it saves
-- with.
-- Why: a parent can take the save off the server without asking the owner.
-- Another device linked to the same code still has the save ON THAT DEVICE,
-- and its next sync (after a walk) uploads it again under the same code, as a
-- new row. The game's confirm card says so.
-- If skipped: the game says "Deleting isn't switched on yet. Nothing was
-- deleted." and changes nothing on the device.
-- Before the new client? Yes, safe; nothing calls it until then.
-- Rollback: drop function if exists public.delete_save(text, text);
create or replace function public.delete_save(p_code text, p_secret text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret text;
begin
  if p_code is null or length(p_code) > 64 then return 'none'; end if;
  if ww_rate_over('delete-miss', 600, 50) then return 'busy'; end if;
  select s.secret into v_secret from saves s where s.code = p_code for update;
  if not found then
    perform ww_rate_hit('delete-miss', 600, 50);
    return 'none';
  end if;
  if v_secret is distinct from p_secret then
    perform ww_rate_hit('delete-miss', 600, 50);
    return 'denied';
  end if;
  delete from saves s where s.code = p_code;
  return 'ok';
end $$;

-- ── 2. delete_player ──────────────────────────────────────────────────
-- What: when the secret is the profile's own, in one transaction:
--   a. colony invites: this player's own open invite is deleted, and where
--      they had typed in someone else's code the request is cleared (the
--      inviter's code stays open for anyone else until it expires, exactly as
--      after a "No").
--   b. colony trades: every offer still waiting ('offered') that this player
--      made or was sent is marked 'cancelled', so the partner's game shows it
--      as withdrawn instead of an offer nobody can answer. Decided trades
--      (accepted, declined, cancelled) are left as they are: a partner who
--      hasn't pulled since an accept still needs that row to get their item.
--   c. colony membership: this player's colony_members row is deleted. If
--      nobody is left in the colony, the colony is deleted, and its cats,
--      feeds and trades go with it (on delete cascade). If the partner is
--      still in it, the partner keeps the colony and every cat: their game
--      reads "unpaired" on its next sync and offers a sharing code again,
--      exactly as after the owner's manual unpair (docs/COLONY-SETUP.md,
--      section 5, "Only one removed"), which the game already handles.
--   d. every friendships row with this player on either side.
--   e. the profiles row (the cat name, breed, accessories and rank).
-- LEFT ALONE, on purpose: rows in the partner's colony that mention this
-- player's id as a cat's finder (colony_cats.finder_id), tamer (tamed_by) or
-- feeder (colony_feeds.by_id), and decided trades (from_id/to_id). They are
-- the partner's colony history: deleting them would take cats and progress
-- away from the other child. The id is a random UUID made on the device; with
-- the profile gone it links to nothing (no name, no secret, nothing a lookup
-- can return), and the partner's game simply keeps those cats, as cats
-- someone else found (the same as after a manual unpair).
-- Why: a parent can take this device's cat name and sharing off the server
-- without asking the owner.
-- If skipped: the game says "Deleting isn't switched on yet. Nothing was
-- deleted." and changes nothing on the device.
-- Before the new client? Yes, safe; nothing calls it until then.
-- Rollback: drop function if exists public.delete_player(text, text);
create or replace function public.delete_player(p_player_id text, p_secret text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_secret text; v_colony text;
begin
  if p_player_id is null or length(p_player_id) > 64 then return 'none'; end if;
  if ww_rate_over('delete-miss', 600, 50) then return 'busy'; end if;
  select pr.secret into v_secret from profiles pr where pr.player_id = p_player_id for update;
  if not found then return 'none'; end if;
  if v_secret is distinct from p_secret then
    perform ww_rate_hit('delete-miss', 600, 50);
    return 'denied';
  end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  -- serialise with the partner's trade and feed calls, which lock this row too
  if v_colony is not null then
    perform 1 from colonies co where co.id = v_colony for update;
  end if;
  delete from colony_invites ci where ci.inviter_id = p_player_id;
  update colony_invites ci set joiner_id = null where ci.joiner_id = p_player_id;
  update colony_trades t set status = 'cancelled', decided_at = now()
   where t.status = 'offered' and (t.from_id = p_player_id or t.to_id = p_player_id);
  delete from colony_members m where m.player_id = p_player_id;
  if v_colony is not null
     and not exists (select 1 from colony_members m where m.colony_id = v_colony) then
    delete from colonies co where co.id = v_colony;
  end if;
  delete from friendships f where f.a_id = p_player_id or f.b_id = p_player_id;
  delete from profiles pr where pr.player_id = p_player_id;
  return 'ok';
end $$;

grant execute on function public.delete_save to anon;
grant execute on function public.delete_player to anon;

-- Ask the Supabase API to pick up the new functions straight away.
notify pgrst, 'reload schema';

/* ── Rollback ───────────────────────────────────────────────────────────
Copy these three lines into a NEW query and Run. The game then says
"Deleting isn't switched on yet" again; nothing else changes.

drop function if exists public.delete_save(text, text);
drop function if exists public.delete_player(text, text);
notify pgrst, 'reload schema';
─────────────────────────────────────────────────────────────────────── */

/* ── How to check it worked ─────────────────────────────────────────────
Run these one at a time in a new query. None of them shows a save code, a
secret or a cat name.

1. Both functions exist, run as their owner with a pinned search_path
   (runs_as_owner true, settings {search_path=public, pg_temp}):
   select p.proname as function_name, p.prosecdef as runs_as_owner, p.proconfig as settings
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('delete_save', 'delete_player')
    order by p.proname;

2. The game can call them (both true):
   select has_function_privilege('anon', 'public.delete_save(text,text)', 'execute') as save_callable,
          has_function_privilege('anon', 'public.delete_player(text,text)', 'execute') as player_callable;

3. Both refuse a missing secret (both should say 'none' or 'denied', never
   'ok'; nothing is deleted, because a NULL secret never matches):
   select public.delete_save('NO-SUCH-CODE', null) as save_answer,
          public.delete_player('00000000-0000-0000-0000-000000000000', null) as player_answer;

4. How many wrong answers the limit has counted in the current 10 minutes
   (no row means none):
   select r.name as counter, r.bucket as window_start, r.hits as wrong_answers
     from public.ww_rate r where r.name = 'delete-miss' order by r.bucket desc;
─────────────────────────────────────────────────────────────────────── */
