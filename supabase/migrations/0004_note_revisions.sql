create table if not exists public.note_revisions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  word_id uuid not null references public.words(id) on delete cascade,
  version integer not null,
  content_md text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_note_revisions_note_id on public.note_revisions (note_id, version desc);
create index if not exists idx_note_revisions_user_word on public.note_revisions (user_id, word_id, created_at desc);

alter table public.note_revisions enable row level security;

drop policy if exists "note_revisions_own_all" on public.note_revisions;
create policy "note_revisions_own_all"
on public.note_revisions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
