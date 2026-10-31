-- Holdrs accounts: wallet sign-in (SIWE), username, character look, level.
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- Safe to run again (everything is "if not exists").
--
-- Security model: Row Level Security is ON for every table and there are NO policies,
-- so the public anon / publishable key can read and write nothing.
-- Only our server API (/api/account/*, secret key in Vercel env vars) can.

create extension if not exists citext;

-- One row per wallet. The address is only used to sign in; other users only ever see the username.
create table if not exists public.accounts (
  address      text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  -- 3–15 letters, numbers or _ ; unique ignoring case (citext).
  username     citext unique check (username ~ '^[A-Za-z0-9_]{3,15}$'),
  -- Chosen look. NULL = follow the current level's character (the default).
  look         text check (look in ('raccoon', 'frog', 'bull', 'anon')),
  -- Total points over all seasons. Written by the points backend (work 5); 0 until S1 starts.
  total_points bigint not null default 0 check (total_points >= 0),
  -- Highest level the user has already seen the level-up popup for.
  level_seen   smallint not null default 1 check (level_seen between 1 and 6),
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);

-- One-time sign-in messages (valid 10 minutes, deleted when used).
create table if not exists public.auth_nonces (
  nonce      text primary key,
  address    text not null,
  message    text not null,
  expires_at timestamptz not null
);
create index if not exists auth_nonces_expires on public.auth_nonces (expires_at);

-- Sessions. Only a SHA-256 hash of the cookie token is stored.
create table if not exists public.auth_sessions (
  token_hash text primary key,
  address    text not null references public.accounts(address) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_sessions_address on public.auth_sessions (address);

alter table public.accounts      enable row level security;
alter table public.auth_nonces   enable row level security;
alter table public.auth_sessions enable row level security;

revoke all on public.accounts, public.auth_nonces, public.auth_sessions from anon, authenticated;
