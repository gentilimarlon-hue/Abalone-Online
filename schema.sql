-- Abalone Online: initiales Schema für Spielräume
-- Im Supabase SQL Editor ausführen.

create extension if not exists pgcrypto;

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  mode text not null check (mode in ('standard', 'mini', 'timed')),
  minutes_per_player integer,
  status text not null default 'waiting'
    check (status in ('waiting', 'playing', 'finished')),
  host_token_hash text not null,
  guest_token_hash text,
  state jsonb not null default '{}'::jsonb,
  current_turn text not null default 'b' check (current_turn in ('b', 'w')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);

create index if not exists game_rooms_expires_at_idx
  on public.game_rooms (expires_at);

alter table public.game_rooms enable row level security;

-- Absichtlich KEINE anonymen Tabellen-Policies:
-- Clients dürfen Spielräume nicht direkt beliebig lesen oder überschreiben.
-- Raum-Erstellung/Beitritt/Züge sollen über geprüfte Edge Functions laufen,
-- die Tokens prüfen und Züge serverseitig validieren.
-- Das verhindert, dass ein Gast fremde Räume ausliest oder den Spielstand fälscht.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists game_rooms_updated_at on public.game_rooms;
create trigger game_rooms_updated_at
before update on public.game_rooms
for each row execute function public.set_updated_at();
