create extension if not exists pgcrypto;

do $$
begin
  create type public.review_rating as enum ('again', 'hard', 'good', 'easy');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'editor', 'admin')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.words (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  source_path text not null,
  title text not null,
  lemma text not null,
  lang_code text not null default 'en',
  pos text,
  cefr text,
  ipa text,
  aliases text[] not null default '{}'::text[],
  short_definition text,
  definition_md text not null,
  body_md text not null,
  examples jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  is_published boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_words_published on public.words (is_published, is_deleted);
create index if not exists idx_words_source_path on public.words (source_path);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.word_tags (
  word_id uuid not null references public.words(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (word_id, tag_id)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  content_md text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create table if not exists public.user_word_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  schedule_algo text not null default 'fsrs' check (schedule_algo in ('leitner', 'sm2', 'fsrs')),
  state text not null default 'new' check (state in ('new', 'learning', 'review', 'relearning', 'suspended')),
  desired_retention numeric(4,3) not null default 0.900 check (desired_retention >= 0.700 and desired_retention <= 0.990),
  stability numeric(10,4),
  difficulty numeric(10,4),
  retrievability numeric(8,6),
  interval_days integer,
  due_at timestamptz,
  last_reviewed_at timestamptz,
  last_rating public.review_rating,
  review_count integer not null default 0,
  lapse_count integer not null default 0,
  again_count integer not null default 0,
  hard_count integer not null default 0,
  good_count integer not null default 0,
  easy_count integer not null default 0,
  content_hash_snapshot text,
  scheduler_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists idx_progress_due on public.user_word_progress (user_id, due_at);
create index if not exists idx_progress_word on public.user_word_progress (word_id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'review' check (mode in ('review', 'cram', 'preview')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cards_seen integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  rating public.review_rating not null,
  state text not null,
  reviewed_at timestamptz not null default now(),
  due_at timestamptz,
  elapsed_days integer,
  scheduled_days integer,
  stability numeric(10,4),
  difficulty numeric(10,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_review_logs_user_reviewed on public.review_logs (user_id, reviewed_at desc);
create index if not exists idx_review_logs_word on public.review_logs (word_id);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute procedure public.handle_updated_at();

drop trigger if exists trg_words_updated_at on public.words;
create trigger trg_words_updated_at
before update on public.words
for each row execute procedure public.handle_updated_at();

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at
before update on public.notes
for each row execute procedure public.handle_updated_at();

drop trigger if exists trg_progress_updated_at on public.user_word_progress;
create trigger trg_progress_updated_at
before update on public.user_word_progress
for each row execute procedure public.handle_updated_at();

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
before update on public.sessions
for each row execute procedure public.handle_updated_at();
