-- Dugsi — per-user progress & session history.
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
-- Row-Level Security makes every row private to the user who created it, so the
-- public anon key is safe to ship in the client.

-- ── Reading position: furthest verse reached per surah ──────────────────────
create table if not exists public.progress (
  user_id       uuid not null references auth.users (id) on delete cascade,
  surah         int  not null,
  furthest_verse int not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, surah)
);

alter table public.progress enable row level security;

drop policy if exists "own progress" on public.progress;
create policy "own progress" on public.progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Recitation history: one row per finished recitation ─────────────────────
create table if not exists public.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  surah      int  not null,
  score      int  not null default 0,
  correct    int  not null default 0,
  wrong      int  not null default 0,
  missing    int  not null default 0,
  mistakes   jsonb,
  created_at timestamptz not null default now()
);
-- If the table already existed, add the column for reviewing past mistakes:
alter table public.sessions add column if not exists mistakes jsonb;

alter table public.sessions enable row level security;

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists sessions_user_created_idx
  on public.sessions (user_id, created_at desc);
