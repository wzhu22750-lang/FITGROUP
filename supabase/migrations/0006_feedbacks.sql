-- ============================================================================
-- 0006_feedbacks.sql
-- User feedback collection table for Help & Feedback
-- ============================================================================

create table if not exists public.feedbacks (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  user_id uuid references public.profiles (id) on delete set null,
  user_name text not null default '匿名健友',
  user_email text default '',
  type text not null default 'feature' check (type in ('bug', 'feature', 'exercise', 'other')),
  content text not null check (char_length(content) between 2 and 2000),
  contact text default '' check (char_length(contact) <= 200),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamptz not null default now()
);

-- Index
create index if not exists feedbacks_user_created on public.feedbacks (user_id, created_at desc);

-- RLS
alter table public.feedbacks enable row level security;

grant select, insert on public.feedbacks to authenticated, anon;

drop policy if exists feedbacks_insert_all on public.feedbacks;
create policy feedbacks_insert_all on public.feedbacks
  for insert to authenticated, anon
  with check (true);

drop policy if exists feedbacks_select_own on public.feedbacks;
create policy feedbacks_select_own on public.feedbacks
  for select to authenticated
  using (user_id = auth.uid());
