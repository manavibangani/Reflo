-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds retro session tables on top of the existing workspaces/workspace_members tables.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  created_by uuid not null references users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now()
);

create table if not exists session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  unique (session_id, user_id)
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  text text not null,
  color text not null,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  unique (card_id, user_id)
);

create index if not exists sessions_workspace_id_idx on sessions(workspace_id);
create index if not exists session_members_session_id_idx on session_members(session_id);
create index if not exists session_members_user_id_idx on session_members(user_id);
create index if not exists cards_session_id_idx on cards(session_id);
create index if not exists votes_card_id_idx on votes(card_id);
create index if not exists votes_user_id_idx on votes(user_id);
