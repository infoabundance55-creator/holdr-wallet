-- Moon Jump (work 4): scored runs on the daily map, for Holdrs accounts (002_accounts.sql).
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run. Safe to run again.
-- Then: notify pgrst, 'reload schema';
--
-- Rules (points plan v1.3 §3): coins = points (+5 each up to 1,000 m, +10 above), 3 scored runs a day
-- on the same daily map, practice is unlimited and never reaches the server.
-- Game points are recorded here only. The points backend (work 5) verifies them and adds them to
-- accounts.total_points; until then `verified` stays false.
--
-- Security: RLS on, no policies, functions not executable by anon/authenticated. Only the server API can read or write.

-- A ticket is taken when a scored run starts. slot 1–3 per account per day: starting a run uses a slot,
-- even if the run is restarted or never finished.
create table if not exists public.game_tickets (
  id         uuid primary key default gen_random_uuid(),
  address    text not null references public.accounts(address) on delete cascade,
  day        integer not null,          -- YYYYMMDD (UTC)
  slot       smallint not null check (slot between 1 and 3),
  seed       bigint not null,
  started_at timestamptz not null default now(),
  used       boolean not null default false,
  unique (address, day, slot)
);

-- Every finished scored run.
create table if not exists public.game_runs (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null unique references public.game_tickets(id) on delete cascade,
  address     text not null references public.accounts(address) on delete cascade,
  day         integer not null,
  height      integer not null check (height between 0 and 200000),
  coins_low   integer not null check (coins_low between 0 and 10000),   -- coins up to 1,000 m (+5)
  coins_high  integer not null check (coins_high between 0 and 10000),  -- coins above 1,000 m (+10)
  points      integer not null check (points >= 0),
  duration_ms integer not null check (duration_ms between 0 and 7200000),
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists game_runs_day_points on public.game_runs (day, points desc);
create index if not exists game_runs_address_day on public.game_runs (address, day);

alter table public.game_tickets enable row level security;
alter table public.game_runs    enable row level security;
revoke all on public.game_tickets, public.game_runs from anon, authenticated;

-- TODAY board: each player's best single run on that day's map.
-- Returns the top p_limit rows, plus p_me's own row if it is further down.
create or replace function public.game_board_day(p_day integer, p_limit integer default 50, p_me text default null)
returns table (rank bigint, address text, username text, look text, total_points bigint, points bigint)
language sql stable as $$
  with best as (
    select distinct on (r.address) r.address, r.points, r.created_at
    from public.game_runs r where r.day = p_day
    order by r.address, r.points desc, r.created_at asc
  ), ranked as (
    select rank() over (order by b.points desc) as rk, row_number() over (order by b.points desc, b.created_at asc) as rn,
           b.address, a.username::text as username, a.look, a.total_points, b.points::bigint as points
    from best b join public.accounts a on a.address = b.address
  )
  select rk, address, username, look, total_points, points from ranked
  where rn <= p_limit or address = p_me order by rn;
$$;

-- SEASON board: game points summed over the season's days.
create or replace function public.game_board_season(p_from integer, p_to integer, p_limit integer default 50, p_me text default null)
returns table (rank bigint, address text, username text, look text, total_points bigint, points bigint)
language sql stable as $$
  with s as (
    select r.address, sum(r.points)::bigint as points, max(r.created_at) as last_at
    from public.game_runs r where r.day between p_from and p_to
    group by r.address
  ), ranked as (
    select rank() over (order by s.points desc) as rk, row_number() over (order by s.points desc, s.last_at asc) as rn,
           s.address, a.username::text as username, a.look, a.total_points, s.points
    from s join public.accounts a on a.address = s.address
  )
  select rk, address, username, look, total_points, points from ranked
  where rn <= p_limit or address = p_me order by rn;
$$;

revoke all on function public.game_board_day(integer, integer, text) from public, anon, authenticated;
revoke all on function public.game_board_season(integer, integer, integer, text) from public, anon, authenticated;
