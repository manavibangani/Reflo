-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds emoji reactions on retro cards.

create table if not exists card_reactions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (card_id, user_id, emoji)
);

create index if not exists card_reactions_card_id_idx on card_reactions (card_id);
