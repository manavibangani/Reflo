-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds the daily standup table on top of the existing workspaces/users tables.

create table if not exists standups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  user_name text,
  yesterday text not null default '',
  today text not null default '',
  blockers text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, date)
);

create index if not exists standups_workspace_id_idx on standups(workspace_id);
create index if not exists standups_workspace_date_idx on standups(workspace_id, date);
create index if not exists standups_user_id_idx on standups(user_id);
