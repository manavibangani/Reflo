-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds focus session (virtual coworking) tables on top of the existing workspaces/users tables.

create table if not exists focus_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  goal text not null,
  duration_minutes integer not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_by uuid not null references users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists focus_participants (
  id uuid primary key default gen_random_uuid(),
  focus_session_id uuid not null references focus_sessions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  user_name text,
  goal text not null,
  status text not null default 'working' check (status in ('working', 'break', 'done')),
  completed boolean not null default false,
  unique (focus_session_id, user_id)
);

create index if not exists focus_sessions_workspace_id_idx on focus_sessions(workspace_id);
create index if not exists focus_participants_session_id_idx on focus_participants(focus_session_id);
create index if not exists focus_participants_user_id_idx on focus_participants(user_id);
