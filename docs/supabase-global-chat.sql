alter table public.users
  add column if not exists bio text,
  add column if not exists profile_picture_url text;

create table if not exists public.app_user_sessions (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  app_user_id text not null,
  app_user_role text not null default 'general_manager',
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_user_sessions_app_user_id
  on public.app_user_sessions (app_user_id);

alter table public.app_user_sessions enable row level security;

drop policy if exists "app_user_sessions_select_own" on public.app_user_sessions;
create policy "app_user_sessions_select_own"
  on public.app_user_sessions
  for select
  to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "app_user_sessions_insert_own" on public.app_user_sessions;
create policy "app_user_sessions_insert_own"
  on public.app_user_sessions
  for insert
  to authenticated
  with check (auth.uid() = auth_user_id);

drop policy if exists "app_user_sessions_update_own" on public.app_user_sessions;
create policy "app_user_sessions_update_own"
  on public.app_user_sessions
  for update
  to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists "app_user_sessions_delete_own" on public.app_user_sessions;
create policy "app_user_sessions_delete_own"
  on public.app_user_sessions
  for delete
  to authenticated
  using (auth.uid() = auth_user_id);

create table if not exists public.chat_messages (
  id text primary key,
  user_id text not null,
  user_name text not null,
  user_avatar_url text,
  message_text text not null check (char_length(btrim(message_text)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_chat_messages_created_at
  on public.chat_messages (created_at desc);

create index if not exists idx_chat_messages_user_id
  on public.chat_messages (user_id);

alter table public.chat_messages enable row level security;
alter table public.chat_messages replica identity full;

drop policy if exists "chat_messages_select_bound_users" on public.chat_messages;
create policy "chat_messages_select_bound_users"
  on public.chat_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_user_sessions sessions
      where sessions.auth_user_id = auth.uid()
    )
  );

drop policy if exists "chat_messages_insert_bound_users" on public.chat_messages;
create policy "chat_messages_insert_bound_users"
  on public.chat_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_user_sessions sessions
      where sessions.auth_user_id = auth.uid()
        and sessions.app_user_id = chat_messages.user_id
    )
  );

drop policy if exists "chat_messages_delete_own_or_developer" on public.chat_messages;
create policy "chat_messages_delete_own_or_developer"
  on public.chat_messages
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_user_sessions sessions
      where sessions.auth_user_id = auth.uid()
        and (
          sessions.app_user_id = chat_messages.user_id
          or sessions.app_user_role = 'developer'
        )
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end
$$;
