-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds the creator-defined color -> label mapping on top of the existing sessions table.

alter table sessions add column if not exists color_labels jsonb not null default '{}'::jsonb;
