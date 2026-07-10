-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds dashboard-related columns on top of the existing sessions/cards tables.

alter table cards add column if not exists resolved boolean not null default false;

-- Storage for the AI-generated session summary (populated by the AI layer, shown on the dashboard when present).
alter table sessions add column if not exists summary text;
