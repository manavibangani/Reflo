-- Run this in the Supabase SQL editor (Database > SQL Editor).
-- Adds a name column to the existing `users` table.

alter table users add column if not exists name text;
