-- Whisker Walk v21 "The Shared Colony" — one-time database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run (idempotent). Run docs/supabase-setup.sql (v7) first; this
-- file only reads the v7 `profiles` table (to check a player's secret and to
-- show pet names) and never changes any v7 table.
--
-- What it adds: six private colony_* tables and nine RPCs. Nobody can read
-- the tables directly (RLS on, no policies, anon revoked), so walks stay
-- private; everything goes through the RPCs, which check the caller's
-- secret exactly like record_friend_greet does.
--
-- ADD-ONLY. Nothing a player does can take colony progress away from either
-- sibling. Each rule that enforces this is marked "ADD-ONLY" below. The only
-- ways anything is ever removed are the owner's own SQL (see
-- docs/COLONY-SETUP.md, "How to unpair") and the housekeeping of expired
-- invites and old, already-resolved trades.

-- ── Tables ────────────────────────────────────────────────────────────

create table if not exists public.colonies (
  id text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 16),
  created_at timestamptz not null default now()
);

-- player_id is the primary key: that alone makes it ONE colony per player.
create table if not exists public.colony_members (
  player_id text primary key,
  colony_id text not null references public.colonies(id) on delete cascade,
  wardrobe jsonb not null default '[]'::jsonb,   -- tradeable accessories (starters left out)
  joined_at timestamptz not null default now()
);

-- One open invite per inviter (inviter_id unique); opening a new one replaces it.
create table if not exists public.colony_invites (
  code text primary key,
  inviter_id text not null unique,
  joiner_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.colony_cats (
  colony_id text not null references public.colonies(id) on delete cascade,
  name text not null,
  finder_id text not null,
  area text not null,
  x real not null,
  z real not null,
  wear text,
  tamed_by text,
  tamed_walk text,
  created_at timestamptz not null default now(),
  primary key (colony_id, name)
);

-- One feed per player per cat per walk (the primary key).
create table if not exists public.colony_feeds (
  colony_id text not null references public.colonies(id) on delete cascade,
  cat text not null,
  by_id text not null,
  walk text not null,
  head integer not null check (head between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (colony_id, cat, by_id, walk)
);

create table if not exists public.colony_trades (
  id bigserial primary key,
  colony_id text not null references public.colonies(id) on delete cascade,
  from_id text not null,
  to_id text not null,
  give text not null,
  want text not null,
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists colony_members_colony_idx on public.colony_members (colony_id);
create index if not exists colony_invites_joiner_idx on public.colony_invites (joiner_id);
create index if not exists colony_trades_colony_idx on public.colony_trades (colony_id, id);

-- ── Row-level security: no direct reads or writes at all ──────────────
-- RLS on with NO policies means a client role sees zero rows; the revokes
-- remove the table grants Supabase gives new tables by default. The RPCs
-- below run as the table owner, which is the only way in.

alter table public.colonies enable row level security;
alter table public.colony_members enable row level security;
alter table public.colony_invites enable row level security;
alter table public.colony_cats enable row level security;
alter table public.colony_feeds enable row level security;
alter table public.colony_trades enable row level security;

revoke all on public.colonies from anon, authenticated;
revoke all on public.colony_members from anon, authenticated;
revoke all on public.colony_invites from anon, authenticated;
revoke all on public.colony_cats from anon, authenticated;
revoke all on public.colony_feeds from anon, authenticated;
revoke all on public.colony_trades from anon, authenticated;
revoke all on sequence public.colony_trades_id_seq from anon, authenticated;

-- ── Internal helper (not callable by clients) ─────────────────────────

-- The caller check every RPC starts with: a profiles row whose secret
-- matches, as in record_friend_greet. Written so a NULL secret can never
-- pass (a bare `secret <> p_secret` is NULL, not true, when p_secret is NULL).
create or replace function public.colony_authed(p_player_id text, p_secret text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_secret text;
begin
  select pr.secret into v_secret from profiles pr where pr.player_id = p_player_id;
  return coalesce(v_secret = p_secret, false);
end $$;

revoke execute on function public.colony_authed(text, text) from public, anon, authenticated;

-- ── RPCs (SECURITY DEFINER; the secret is the capability) ─────────────

-- Open (or replace) my invite: a 6-character code that expires in 20 minutes.
-- A player already in a full (2-member) colony can't. A lone member — only
-- possible after the owner unpaired their partner by hand — may invite again,
-- and accepting then reuses their colony, cats and all (ADD-ONLY).
create or replace function public.colony_invite_open(p_player_id text, p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_colony text;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_n integer;
  v_expires timestamptz := now() + interval '20 minutes';
begin
  if not colony_authed(p_player_id, p_secret) then
    return jsonb_build_object('status', 'denied');
  end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is not null
     and (select count(*) from colony_members m where m.colony_id = v_colony) >= 2 then
    return jsonb_build_object('status', 'already-paired');
  end if;
  -- housekeeping: forget every expired invite, and my old one (replaced below)
  delete from colony_invites ci where ci.expires_at <= now() or ci.inviter_id = p_player_id;
  loop
    v_code := '';
    for v_n in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::integer, 1);
    end loop;
    exit when not exists (select 1 from colony_invites ci where ci.code = v_code);
  end loop;
  insert into colony_invites (code, inviter_id, joiner_id, created_at, expires_at)
    values (v_code, p_player_id, null, now(), v_expires)
  on conflict (inviter_id) do update
    set code = excluded.code, joiner_id = null,
        created_at = excluded.created_at, expires_at = excluded.expires_at;
  return jsonb_build_object('status', 'ok', 'code', v_code, 'expires_at', v_expires);
end $$;

-- Type in someone's code. This only ASKS: the inviter must still confirm my
-- pet name (colony_invite_answer), so a stranger guessing a code gets nowhere.
create or replace function public.colony_invite_join(p_player_id text, p_secret text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_inviter text;
  v_joiner text;
  v_name text;
begin
  if not colony_authed(p_player_id, p_secret) then
    return jsonb_build_object('status', 'denied');
  end if;
  -- one colony per player: a member can't join another one
  if exists (select 1 from colony_members m where m.player_id = p_player_id) then
    return jsonb_build_object('status', 'already-paired');
  end if;
  -- an expired invite reads exactly like a wrong code
  select ci.inviter_id, ci.joiner_id into v_inviter, v_joiner
    from colony_invites ci where ci.code = v_code and ci.expires_at > now()
    for update;
  if v_inviter is null then
    return jsonb_build_object('status', 'bad-code');
  end if;
  if v_inviter = p_player_id then
    return jsonb_build_object('status', 'self');
  end if;
  -- belt and braces: pairing deletes the pair's invites, so a full-colony
  -- inviter's code should not exist any more
  if (select count(*) from colony_members m
       where m.colony_id = (select m2.colony_id from colony_members m2 where m2.player_id = v_inviter)) >= 2 then
    return jsonb_build_object('status', 'bad-code');
  end if;
  if v_joiner is not null and v_joiner <> p_player_id then
    return jsonb_build_object('status', 'taken');
  end if;
  -- I am asking to join one invite at a time
  update colony_invites ci set joiner_id = null where ci.joiner_id = p_player_id and ci.code <> v_code;
  update colony_invites ci set joiner_id = p_player_id where ci.code = v_code;
  select pr.pet_name into v_name from profiles pr where pr.player_id = v_inviter;
  return jsonb_build_object('status', 'pending', 'inviter_pet_name', v_name);
end $$;

-- The inviter confirms (or turns down) whoever typed their code in.
-- Accept: create the colony (or reuse the inviter's, see colony_invite_open),
-- add both members and delete the pair's invites. Decline: clear joiner_id,
-- so the same code can be typed in again until it expires.
create or replace function public.colony_invite_answer(p_player_id text, p_secret text, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_joiner text;
  v_colony text;
begin
  if not colony_authed(p_player_id, p_secret) then
    return jsonb_build_object('status', 'denied');
  end if;
  select ci.code, ci.joiner_id into v_code, v_joiner
    from colony_invites ci where ci.inviter_id = p_player_id and ci.expires_at > now()
    for update;
  if v_code is null or v_joiner is null then
    return jsonb_build_object('status', 'no-joiner');
  end if;
  if not coalesce(p_accept, false) then
    update colony_invites ci set joiner_id = null where ci.code = v_code;
    return jsonb_build_object('status', 'declined');
  end if;
  -- the joiner paired with someone else in the meantime
  if exists (select 1 from colony_members m where m.player_id = v_joiner) then
    update colony_invites ci set joiner_id = null where ci.code = v_code;
    return jsonb_build_object('status', 'no-joiner');
  end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is not null
     and (select count(*) from colony_members m where m.colony_id = v_colony) >= 2 then
    -- at most 2 members; can't happen, since pairing deletes the pair's invites
    delete from colony_invites ci where ci.code = v_code;
    return jsonb_build_object('status', 'no-joiner');
  end if;
  begin
    if v_colony is null then
      insert into colonies default values returning id into v_colony;
      insert into colony_members (player_id, colony_id) values (p_player_id, v_colony);
    end if;
    insert into colony_members (player_id, colony_id) values (v_joiner, v_colony);
  exception when unique_violation then
    -- lost a race with another pairing: undo this block, ask again
    update colony_invites ci set joiner_id = null where ci.code = v_code;
    return jsonb_build_object('status', 'no-joiner');
  end;
  delete from colony_invites ci where ci.inviter_id in (p_player_id, v_joiner);
  update colony_invites ci set joiner_id = null where ci.joiner_id in (p_player_id, v_joiner);
  return jsonb_build_object('status', 'paired', 'colony_id', v_colony);
end $$;

-- The one read path. Publishes my tradeable wardrobe and returns either my
-- pairing state (unpaired) or the whole colony (paired).
--
-- p_wardrobe must be a jsonb array of at most 40 strings matching
-- ^[a-z]{1,16}$; anything else is stored as []. Starters (bell, bandana) are
-- filtered out because they can never be traded, and duplicates are dropped.
--
-- Known brief window: the stored wardrobe is simply what the client last
-- sent. After a trade is accepted, colony_trade_answer updates both stored
-- wardrobes at once; but a client that syncs BEFORE it has applied that
-- trade locally republishes its old wardrobe here, so until its next sync the
-- server again lists the item it gave away. The client applies the accepted
-- trade from this very call's result and republishes on its next pull, which
-- closes the window. Any offer made inside it is re-checked at accept time.
create or replace function public.colony_sync(p_player_id text, p_secret text, p_wardrobe jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_colony text;
  v_wardrobe jsonb := '[]'::jsonb;
  v_ok boolean := false;
  v_code text;
  v_expires timestamptz;
  v_joiner_name text;
  v_inviter_name text;
begin
  if not colony_authed(p_player_id, p_secret) then
    return jsonb_build_object('status', 'denied');
  end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;

  if v_colony is null then
    select ci.code, ci.expires_at, pr.pet_name into v_code, v_expires, v_joiner_name
      from colony_invites ci left join profiles pr on pr.player_id = ci.joiner_id
      where ci.inviter_id = p_player_id and ci.expires_at > now();
    select pr.pet_name into v_inviter_name
      from colony_invites ci join profiles pr on pr.player_id = ci.inviter_id
      where ci.joiner_id = p_player_id and ci.expires_at > now()
      order by ci.created_at desc limit 1;
    return jsonb_build_object(
      'status', 'unpaired',
      'invite', case when v_code is null then null else
        jsonb_build_object('code', v_code, 'expires_at', v_expires, 'joiner_pet_name', v_joiner_name) end,
      'joining', case when v_inviter_name is null then null else
        jsonb_build_object('inviter_pet_name', v_inviter_name) end);
  end if;

  -- validate p_wardrobe step by step (SQL doesn't promise AND short-circuits)
  if p_wardrobe is not null and jsonb_typeof(p_wardrobe) = 'array' then
    if jsonb_array_length(p_wardrobe) <= 40 then
      v_ok := not exists (
        select 1 from jsonb_array_elements(p_wardrobe) e(v)
        where jsonb_typeof(e.v) <> 'string' or (e.v #>> '{}') !~ '^[a-z]{1,16}$');
    end if;
  end if;
  if v_ok then
    select coalesce(jsonb_agg(to_jsonb(s.v) order by s.o), '[]'::jsonb) into v_wardrobe
      from (select w.v, min(w.o) as o
              from jsonb_array_elements_text(p_wardrobe) with ordinality as w(v, o)
             where w.v not in ('bell', 'bandana')
             group by w.v) s;
  end if;
  update colony_members m set wardrobe = v_wardrobe where m.player_id = p_player_id;

  return jsonb_build_object(
    'status', 'paired',
    'colony_id', v_colony,
    'members', (select coalesce(jsonb_agg(jsonb_build_object(
        'player_id', m.player_id, 'pet_name', pr.pet_name, 'wardrobe', m.wardrobe)
        order by m.joined_at, m.player_id), '[]'::jsonb)
      from colony_members m left join profiles pr on pr.player_id = m.player_id
      where m.colony_id = v_colony),
    'cats', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', c.name, 'finder_id', c.finder_id, 'area', c.area, 'x', c.x, 'z', c.z,
        'wear', c.wear, 'tamed_by', c.tamed_by, 'tamed_walk', c.tamed_walk)
        order by c.created_at, c.name), '[]'::jsonb)
      from colony_cats c where c.colony_id = v_colony),
    'feeds', (select coalesce(jsonb_agg(jsonb_build_object(
        'cat', f.cat, 'by_id', f.by_id, 'walk', f.walk, 'head', f.head)
        order by f.created_at, f.cat, f.by_id, f.walk), '[]'::jsonb)
      from colony_feeds f where f.colony_id = v_colony),
    'trades', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'from_id', t.from_id, 'to_id', t.to_id,
        'give', t.give, 'want', t.want, 'status', t.status)
        order by t.id), '[]'::jsonb)
      from colony_trades t where t.colony_id = v_colony));
end $$;

-- Record one feed: I fed cat p_cat on walk p_walk with head start p_head.
-- A retry is a no-op 'ok'.
create or replace function public.colony_feed(
  p_player_id text, p_secret text, p_cat text, p_walk text, p_area text,
  p_x real, p_z real, p_head integer, p_tamed boolean
) returns text language plpgsql security definer set search_path = public as $$
declare v_colony text;
begin
  if not colony_authed(p_player_id, p_secret) then return 'denied'; end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is null then return 'unpaired'; end if;
  -- every "is null" comes first, so a NULL can never slip through as unknown;
  -- abs() of NaN or Infinity is never <= 200
  if p_cat is null or p_cat !~ '^[A-Za-z][A-Za-z ]{0,23}$'
     or p_walk is null or p_walk !~ '^walk-[0-9]{1,16}$'
     or p_area is null or p_area not in ('neighborhood', 'park', 'seaside', 'docks')
     or p_x is null or p_z is null or not (abs(p_x) <= 200 and abs(p_z) <= 200)
     or p_head is null or p_head < 0 or p_head > 3 then
    return 'bad';
  end if;
  -- serialise writers to this colony, so two siblings can't both add a 13th cat
  perform 1 from colonies co where co.id = v_colony for update;
  if not exists (select 1 from colony_cats c where c.colony_id = v_colony and c.name = p_cat) then
    if (select count(*) from colony_cats c where c.colony_id = v_colony) >= 12 then
      return 'full';
    end if;
    -- ADD-ONLY: first finder wins. The cat's finder and fixed spot are
    -- written once and never moved; no RPC deletes a cat.
    insert into colony_cats (colony_id, name, finder_id, area, x, z)
      values (v_colony, p_cat, p_player_id, p_area, p_x, p_z)
    on conflict do nothing;
  end if;
  -- ADD-ONLY: feeds are only ever inserted (a retry hits the primary key and
  -- does nothing), never updated or deleted. Six feeds per player per cat
  -- (TAME_FEEDS) fill the bar on their own, so more are never needed and are
  -- not stored: this keeps a misbehaving client from growing the list forever.
  if (select count(*) from colony_feeds f
       where f.colony_id = v_colony and f.cat = p_cat and f.by_id = p_player_id) < 6 then
    insert into colony_feeds (colony_id, cat, by_id, walk, head)
      values (v_colony, p_cat, p_player_id, p_walk, p_head)
    on conflict do nothing;
  end if;
  -- ADD-ONLY: tamed is set once, where it is still null, and never cleared,
  -- so taming can't regress and a later "tamed" from the other sibling
  -- doesn't overwrite who tamed it.
  if coalesce(p_tamed, false) then
    update colony_cats c set tamed_by = p_player_id, tamed_walk = p_walk
      where c.colony_id = v_colony and c.name = p_cat and c.tamed_by is null;
  end if;
  return 'ok';
end $$;

-- The cat's finder puts one accessory on it (p_item null takes it off).
-- Cosmetic: dressing shows an item, it doesn't give it away, so the stored
-- wardrobe isn't checked here (it can lag a fresh purchase); the client only
-- offers items its player owns and only shows known accessory ids.
create or replace function public.colony_dress(p_player_id text, p_secret text, p_cat text, p_item text)
returns text language plpgsql security definer set search_path = public as $$
declare v_colony text; v_finder text;
begin
  if not colony_authed(p_player_id, p_secret) then return 'denied'; end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is null then return 'unpaired'; end if;
  if p_cat is null or p_cat !~ '^[A-Za-z][A-Za-z ]{0,23}$'
     or (p_item is not null and p_item !~ '^[a-z]{1,16}$') then
    return 'bad';
  end if;
  select c.finder_id into v_finder from colony_cats c where c.colony_id = v_colony and c.name = p_cat;
  if v_finder is null then return 'bad'; end if;
  if v_finder <> p_player_id then return 'not-finder'; end if;
  update colony_cats c set wear = p_item where c.colony_id = v_colony and c.name = p_cat;
  return 'ok';
end $$;

-- Offer my p_give for my partner's p_want: a one-for-one accessory swap.
-- Starters can't be traded; p_give must be in my stored wardrobe and p_want
-- in my partner's (checked again when they accept). A swap must change
-- hands, so I can't want what I already have or give what they already have.
-- One open offer per player: a new offer cancels my old one.
create or replace function public.colony_trade_offer(p_player_id text, p_secret text, p_give text, p_want text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_colony text;
  v_mine jsonb;
  v_partner text;
  v_theirs jsonb;
  v_id bigint;
  v_extra integer;
begin
  if not colony_authed(p_player_id, p_secret) then
    return jsonb_build_object('status', 'denied');
  end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is null then
    return jsonb_build_object('status', 'unpaired');
  end if;
  if p_give is null or p_want is null
     or p_give !~ '^[a-z]{1,16}$' or p_want !~ '^[a-z]{1,16}$'
     or p_give = p_want
     or p_give in ('bell', 'bandana') or p_want in ('bell', 'bandana') then
    return jsonb_build_object('status', 'bad');
  end if;
  perform 1 from colonies co where co.id = v_colony for update;
  select m.wardrobe into v_mine from colony_members m where m.player_id = p_player_id;
  select m.player_id, m.wardrobe into v_partner, v_theirs
    from colony_members m where m.colony_id = v_colony and m.player_id <> p_player_id
    order by m.joined_at limit 1;
  if v_partner is null then
    return jsonb_build_object('status', 'unpaired');
  end if;
  if not (v_mine @> jsonb_build_array(p_give)) or not (v_theirs @> jsonb_build_array(p_want)) then
    return jsonb_build_object('status', 'not-owned');
  end if;
  if v_mine @> jsonb_build_array(p_want) or v_theirs @> jsonb_build_array(p_give) then
    return jsonb_build_object('status', 'bad');
  end if;
  update colony_trades t set status = 'cancelled', decided_at = now()
    where t.colony_id = v_colony and t.from_id = p_player_id and t.status = 'offered';
  insert into colony_trades (colony_id, from_id, to_id, give, want)
    values (v_colony, p_player_id, v_partner, p_give, p_want)
    returning id into v_id;
  -- keep at most 50 trades per colony, deleting the oldest RESOLVED ones.
  -- Declined and cancelled go first; an accepted trade is deleted only when
  -- nothing else is left, because a client that hasn't pulled since the
  -- accept still needs to see it to apply it.
  select count(*) - 50 into v_extra from colony_trades t where t.colony_id = v_colony;
  if v_extra > 0 then
    delete from colony_trades d where d.id in (
      select t.id from colony_trades t
       where t.colony_id = v_colony and t.status <> 'offered'
       order by (t.status = 'accepted'), t.id
       limit v_extra);
  end if;
  return jsonb_build_object('status', 'ok', 'id', v_id);
end $$;

-- Only the trade's `to` may answer, and only while it is 'offered'.
-- ADD-ONLY: 'accepted' is final; nothing ever changes a decided trade.
-- On accept, both items are checked again (either player may have traded or
-- lost track of it since the offer): if either is gone the trade is cancelled
-- and the answer is 'gone'. Otherwise both stored wardrobes are swapped here,
-- so a second offer of the same item fails until the next sync republishes.
create or replace function public.colony_trade_answer(p_player_id text, p_secret text, p_trade_id bigint, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_colony text;
  v_trade record;
begin
  if not colony_authed(p_player_id, p_secret) then return 'denied'; end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is null then return 'gone'; end if;
  perform 1 from colonies co where co.id = v_colony for update;
  select t.id, t.from_id, t.to_id, t.give, t.want, t.status into v_trade
    from colony_trades t where t.id = p_trade_id and t.colony_id = v_colony;
  if not found or v_trade.status <> 'offered' then return 'gone'; end if;
  if v_trade.to_id <> p_player_id then return 'denied'; end if;
  if not coalesce(p_accept, false) then
    update colony_trades t set status = 'declined', decided_at = now() where t.id = v_trade.id;
    return 'declined';
  end if;
  if not exists (select 1 from colony_members m
                  where m.player_id = v_trade.from_id and m.colony_id = v_colony
                    and m.wardrobe @> jsonb_build_array(v_trade.give))
     or not exists (select 1 from colony_members m
                  where m.player_id = v_trade.to_id and m.colony_id = v_colony
                    and m.wardrobe @> jsonb_build_array(v_trade.want)) then
    update colony_trades t set status = 'cancelled', decided_at = now() where t.id = v_trade.id;
    return 'gone';
  end if;
  update colony_trades t set status = 'accepted', decided_at = now() where t.id = v_trade.id;
  -- offerer: loses give, gains want; acceptor: loses want, gains give
  update colony_members m set wardrobe =
      (select coalesce(jsonb_agg(w.v order by w.o), '[]'::jsonb)
         from jsonb_array_elements(m.wardrobe) with ordinality as w(v, o)
        where w.v <> to_jsonb(v_trade.give) and w.v <> to_jsonb(v_trade.want))
      || jsonb_build_array(v_trade.want)
    where m.player_id = v_trade.from_id;
  update colony_members m set wardrobe =
      (select coalesce(jsonb_agg(w.v order by w.o), '[]'::jsonb)
         from jsonb_array_elements(m.wardrobe) with ordinality as w(v, o)
        where w.v <> to_jsonb(v_trade.want) and w.v <> to_jsonb(v_trade.give))
      || jsonb_build_array(v_trade.give)
    where m.player_id = v_trade.to_id;
  return 'accepted';
end $$;

-- Only the trade's `from` may cancel, and only while it is 'offered'.
create or replace function public.colony_trade_cancel(p_player_id text, p_secret text, p_trade_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_colony text;
  v_from text;
  v_status text;
begin
  if not colony_authed(p_player_id, p_secret) then return 'denied'; end if;
  select m.colony_id into v_colony from colony_members m where m.player_id = p_player_id;
  if v_colony is null then return 'gone'; end if;
  perform 1 from colonies co where co.id = v_colony for update;
  select t.from_id, t.status into v_from, v_status
    from colony_trades t where t.id = p_trade_id and t.colony_id = v_colony;
  if v_status is null or v_status <> 'offered' then return 'gone'; end if;
  if v_from <> p_player_id then return 'denied'; end if;
  update colony_trades t set status = 'cancelled', decided_at = now() where t.id = p_trade_id;
  return 'cancelled';
end $$;

grant execute on function public.colony_invite_open to anon;
grant execute on function public.colony_invite_join to anon;
grant execute on function public.colony_invite_answer to anon;
grant execute on function public.colony_sync to anon;
grant execute on function public.colony_feed to anon;
grant execute on function public.colony_dress to anon;
grant execute on function public.colony_trade_offer to anon;
grant execute on function public.colony_trade_answer to anon;
grant execute on function public.colony_trade_cancel to anon;

-- Ask the Supabase API to pick up the new functions straight away.
notify pgrst, 'reload schema';
