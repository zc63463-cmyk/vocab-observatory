create table if not exists public.word_filter_facets (
  dimension text not null check (dimension in ('semantic_field', 'word_freq')),
  value text not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (dimension, value)
);

create index if not exists idx_words_public_metadata_filter
  on public.words using gin (metadata jsonb_path_ops)
  where is_published = true and is_deleted = false;

alter table public.word_filter_facets enable row level security;

drop policy if exists "word_filter_facets_public_read" on public.word_filter_facets;
create policy "word_filter_facets_public_read"
on public.word_filter_facets
for select
using (count > 0);
