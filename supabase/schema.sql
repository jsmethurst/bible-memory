-- Schema applied to the Supabase project (already live; kept here for reference / rebuilds).

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  color text,
  position int not null default 0,
  parent_id uuid references public.collections(id) on delete cascade,  -- one level of nesting only
  created_at timestamptz not null default now()
);

-- One row per verse. SRS state lives on the verse.
create table public.verses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  collection_id uuid references public.collections(id) on delete set null,
  reference text not null,
  book text, chapter int, verse int,
  text text not null,
  position int not null default 0,
  stage smallint not null default 0,          -- 0 new, 1 step1 done, 2 step2 done, 3 mastered (in review)
  ease real not null default 2.5,
  interval_days real not null default 0,
  due_at timestamptz,
  reps int not null default 0,
  lapses int not null default 0,
  last_reviewed_at timestamptz,
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every typing attempt. `missed` holds the word indexes missed, which drives the word heatmap.
create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  verse_id uuid not null references public.verses(id) on delete cascade,
  kind text not null check (kind in ('learn1','learn2','learn3','review')),
  words int not null,
  mistakes int not null default 0,
  missed int[] not null default '{}',
  passed boolean not null,
  duration_ms int,
  created_at timestamptz not null default now()
);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.collections enable row level security;
alter table public.verses enable row level security;
alter table public.attempts enable row level security;
alter table public.settings enable row level security;
create policy own_collections on public.collections for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_verses on public.verses for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_attempts on public.attempts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy own_settings on public.settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create index verses_user_idx on public.verses(user_id);
create index verses_due_idx on public.verses(user_id, due_at);
create index verses_collection_idx on public.verses(collection_id);
create index collections_user_idx on public.collections(user_id);
create index attempts_user_time_idx on public.attempts(user_id, created_at);
create index attempts_verse_idx on public.attempts(verse_id);
