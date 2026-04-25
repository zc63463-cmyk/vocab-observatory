alter table public.words
  add column if not exists core_definitions jsonb not null default '[]'::jsonb,
  add column if not exists prototype_text text,
  add column if not exists collocations jsonb not null default '[]'::jsonb,
  add column if not exists corpus_items jsonb not null default '[]'::jsonb,
  add column if not exists synonym_items jsonb not null default '[]'::jsonb,
  add column if not exists antonym_items jsonb not null default '[]'::jsonb;
