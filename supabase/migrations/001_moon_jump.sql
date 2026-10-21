-- Moon Jump game backend, v1
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Security model: Row Level Security is ON for every table and there are NO policies,
-- so the public anon key can read/write nothing. Only our server API (service role) can.

create extension if not exists citext;

-- Players: one per wallet. The address is only used to sign in and is never shown to other players.
create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  address      text not null unique check (address ~ '^0x[0-9a-f]{40}$'),
  username     citext unique check (username ~ '^[A-Za-z0-9_]{3,15}$'),
  char         text not null default 'boss' check (char in ('boss','frog','laser','satoshi')),
  xp           integer not null default 0 check (xp >= 0),
  level        smallint not null default 0 check (level between 0 and 5),
  coins        integer not null default 0 check (coins >= 0),
  streak       smallint not null default 0,
  last_checkin date,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists players_level_seen on public.players (level, last_seen desc);

-- Sign-in nonces (wallet signs a one-time message).
create table if not exists public.nonces (
  nonce      text primary key,
  address    text not null,
  expires_at timestamptz not null
);

-- Sessions: we store only a SHA-256 hash of the token.
create table if not exists public.sessions (
  token_hash text primary key,
  player_id  uuid not null references public.players(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_player on public.sessions (player_id);

-- Every finished run. day = YYYYMMDD for the daily map, null for practice.
create table if not exists public.runs (
  id          bigint generated always as identity primary key,
  player_id   uuid not null references public.players(id) on delete cascade,
  day         integer,
  seed        bigint not null,
  height      integer not null check (height between 0 and 200000),
  coins       integer not null check (coins between 0 and 10000),
  duration_ms integer not null check (duration_ms between 0 and 3600000),
  xp_gained   integer not null default 0,
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists runs_player_day on public.runs (player_id, day);

-- A ticket is issued when a run starts; the result must come back with it (anti-cheat timing).
create table if not exists public.run_tickets (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references public.players(id) on delete cascade,
  day        integer,
  seed       bigint not null,
  started_at timestamptz not null default now(),
  used       boolean not null default false
);
create index if not exists run_tickets_player on public.run_tickets (player_id, started_at desc);

-- Best daily score per player per day (fast leaderboard).
create table if not exists public.daily_best (
  day        integer not null,
  player_id  uuid not null references public.players(id) on delete cascade,
  height     integer not null,
  run_id     bigint not null references public.runs(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (day, player_id)
);
create index if not exists daily_best_rank on public.daily_best (day, height desc);

-- "GM!" greetings between neighbors, one per pair per day.
create table if not exists public.greetings (
  day        integer not null,
  from_id    uuid not null references public.players(id) on delete cascade,
  to_id      uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (day, from_id, to_id),
  check (from_id <> to_id)
);

-- Lock everything down: RLS on, no policies.
alter table public.players    enable row level security;
alter table public.nonces     enable row level security;
alter table public.sessions   enable row level security;
alter table public.runs       enable row level security;
alter table public.daily_best enable row level security;
alter table public.greetings  enable row level security;
alter table public.run_tickets enable row level security;

revoke all on public.players, public.nonces, public.sessions, public.runs, public.daily_best, public.greetings, public.run_tickets from anon, authenticated;
