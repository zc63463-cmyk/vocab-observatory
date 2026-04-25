create table if not exists public.collection_notes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  content_hash text not null unique check (content_hash ~ '^[0-9a-f]{64}$'),
  source_path text not null unique,
  kind text not null check (kind in ('root_affix', 'semantic_field')),
  title text not null,
  summary text,
  body_md text not null,
  metadata jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}'::text[],
  related_word_slugs text[] not null default '{}'::text[],
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  is_published boolean not null default true,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_collection_notes_kind_published
  on public.collection_notes (kind, is_published, is_deleted);
create index if not exists idx_collection_notes_source_path
  on public.collection_notes (source_path);

alter table public.collection_notes enable row level security;

drop policy if exists "collection_notes_public_read" on public.collection_notes;
create policy "collection_notes_public_read"
on public.collection_notes
for select
using (is_published = true and is_deleted = false);

drop trigger if exists trg_collection_notes_updated_at on public.collection_notes;
create trigger trg_collection_notes_updated_at
before update on public.collection_notes
for each row execute procedure public.handle_updated_at();
