-- Abalone Online: Spieleraccounts (passwortlos, an ein Gerät gebunden)
-- In Supabase SQL Editor vollständig ausführen.
-- Erstellt neue Spieler mit 270 Startpunkten. Namen sind global eindeutig.
-- Spielernamen dienen vorerst als einfache Anmeldung ohne Passwort. Mehrere Geräte können denselben Account verwenden.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  username_normalized text generated always as (lower(username)) stored,
  device_token_hash text not null,
  rating integer not null default 270 check (rating >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists players_username_normalized_uidx
  on public.players(username_normalized);

create table if not exists public.player_devices (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  device_token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Bestehende Gerätekennungen aus der ersten Account-Version übernehmen.
insert into public.player_devices(player_id,device_token_hash)
select id,device_token_hash from public.players
on conflict (device_token_hash) do nothing;

create table if not exists public.rating_history (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.players(id) on delete cascade,
  opponent_id uuid references public.players(id) on delete set null,
  room_code text,
  result text not null check (result in ('win','loss','draw')),
  old_rating integer not null,
  rating_change integer not null,
  new_rating integer not null,
  created_at timestamptz not null default now()
);

create index if not exists rating_history_player_created_idx
  on public.rating_history(player_id, created_at desc);

alter table public.players enable row level security;
alter table public.rating_history enable row level security;
alter table public.player_devices enable row level security;
revoke all on public.players from anon, authenticated;
revoke all on public.rating_history from anon, authenticated;
revoke all on public.player_devices from anon, authenticated;

create or replace function public.abalone_register_player(
  p_username text,
  p_device_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text;
  v_hash text;
  v_player public.players%rowtype;
  v_created boolean := false;
begin
  v_name := btrim(coalesce(p_username,''));
  if char_length(v_name) < 3 or char_length(v_name) > 20
     or v_name !~ '^[A-Za-z0-9_ -]+$' then
    raise exception 'Der Spielername muss 3–20 Zeichen lang sein und darf nur Buchstaben, Zahlen, Leerzeichen, _ und - enthalten.';
  end if;
  if p_device_token is null or char_length(p_device_token) < 32 then
    raise exception 'Ungültige Gerätekennung.';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_device_token,'UTF8'),'sha256'),'hex');

  select * into v_player from public.players
  where username_normalized = lower(v_name) for update;

  if not found then
    insert into public.players(username,device_token_hash)
    values(v_name,v_hash) returning * into v_player;
    v_created := true;
  end if;

  -- Absichtlich passwortlos: Wer den Namen kennt, kann sich vorerst anmelden.
  insert into public.player_devices(player_id,device_token_hash,last_seen_at)
  values(v_player.id,v_hash,now())
  on conflict (device_token_hash) do update
    set player_id=excluded.player_id,last_seen_at=now();

  return jsonb_build_object(
    'id',v_player.id,'username',v_player.username,'rating',v_player.rating,
    'games_played',v_player.games_played,'wins',v_player.wins,'losses',v_player.losses,
    'created',v_created
  );
end;
$$;

create or replace function public.abalone_get_player(p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_player public.players%rowtype;
  v_hash text;
begin
  if p_device_token is null or char_length(p_device_token) < 32 then
    raise exception 'Ungültige Gerätekennung.';
  end if;
  v_hash := encode(extensions.digest(convert_to(p_device_token,'UTF8'),'sha256'),'hex');
  select p.* into v_player
  from public.players p
  join public.player_devices d on d.player_id=p.id
  where d.device_token_hash=v_hash;
  if not found then return null; end if;
  update public.player_devices set last_seen_at=now() where device_token_hash=v_hash;
  return jsonb_build_object(
    'id',v_player.id,'username',v_player.username,'rating',v_player.rating,
    'games_played',v_player.games_played,'wins',v_player.wins,'losses',v_player.losses
  );
end;
$$;

revoke all on function public.abalone_register_player(text,text) from public;
revoke all on function public.abalone_get_player(text) from public;
grant execute on function public.abalone_register_player(text,text) to anon, authenticated;
grant execute on function public.abalone_get_player(text) to anon, authenticated;

-- Hinweis: Die Rating-History wird erst beschrieben, wenn die serverseitige
-- Validierung der vollständigen Abalone-Züge und Spielergebnisse aktiviert ist.


-- Öffentliche Rangliste: nur Anzeigename und Rating werden ausgegeben.
create or replace function public.abalone_get_leaderboard(p_limit integer default 20)
returns table(username text, rating integer, games_played integer)
language sql
security definer
set search_path = public
as $$
  select p.username, p.rating, p.games_played
  from public.players p
  order by p.rating desc, p.games_played desc, p.username asc
  limit greatest(1, least(coalesce(p_limit,20),100));
$$;
revoke all on function public.abalone_get_leaderboard(integer) from public;
grant execute on function public.abalone_get_leaderboard(integer) to anon, authenticated;
