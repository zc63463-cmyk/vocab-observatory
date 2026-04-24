alter table public.profiles enable row level security;
alter table public.words enable row level security;
alter table public.tags enable row level security;
alter table public.word_tags enable row level security;
alter table public.notes enable row level security;
alter table public.user_word_progress enable row level security;
alter table public.sessions enable row level security;
alter table public.review_logs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "words_public_read" on public.words;
create policy "words_public_read"
on public.words
for select
using (is_published = true and is_deleted = false);

drop policy if exists "tags_public_read" on public.tags;
create policy "tags_public_read"
on public.tags
for select
using (true);

drop policy if exists "word_tags_public_read" on public.word_tags;
create policy "word_tags_public_read"
on public.word_tags
for select
using (true);

drop policy if exists "notes_own_all" on public.notes;
create policy "notes_own_all"
on public.notes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "progress_own_all" on public.user_word_progress;
create policy "progress_own_all"
on public.user_word_progress
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "sessions_own_all" on public.sessions;
create policy "sessions_own_all"
on public.sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "review_logs_own_all" on public.review_logs;
create policy "review_logs_own_all"
on public.review_logs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
