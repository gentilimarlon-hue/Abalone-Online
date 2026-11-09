-- Secure account foundation for Abalone Online
-- Apply in Supabase SQL Editor on the feature branch build.
-- This migration does NOT enable rating updates yet. Elo remains disabled until
-- the authoritative server-side move validator is deployed and tested.

create extension if not exists pgcrypto with schema extensions;

alter table public.players
  add column if not exists auth_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.players'::regclass
      and conname='players_auth_user_id_fkey'
  ) then
    alter table public.players
      add constraint players_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create unique index if not exists players_auth_user_id_uidx
  on public.players(auth_user_id)
  where auth_user_id is not null;

alter table public.game_rooms
  add column if not exists host_player_id uuid references public.players(id),
  add column if not exists guest_player_id uuid references public.players(id);

create table if not exists public.rated_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.game_rooms(id) on delete restrict,
  black_player_id uuid not null references public.players(id),
  white_player_id uuid not null references public.players(id),
  winner_color text not null check (winner_color in ('b','w')),
  black_old_rating integer not null,
  white_old_rating integer not null,
  black_change integer not null,
  white_change integer not null,
  black_new_rating integer not null,
  white_new_rating integer not null,
  created_at timestamptz not null default now(),
  check (black_player_id <> white_player_id),
  check (black_change + white_change = 0)
);

create index if not exists rated_matches_black_created_idx
  on public.rated_matches(black_player_id, created_at desc);
create index if not exists rated_matches_white_created_idx
  on public.rated_matches(white_player_id, created_at desc);

alter table public.rated_matches enable row level security;
revoke all on public.rated_matches from anon, authenticated;

-- New email/password users receive a player profile. Existing passwordless
-- profiles are deliberately NOT auto-claimed by matching a public username.
create or replace function public.abalone_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text;
  v_device_hash text;
begin
  v_username := btrim(coalesce(new.raw_user_meta_data->>'username',''));
  if char_length(v_username) < 3 or char_length(v_username) > 20
     or v_username !~ '^[A-Za-z0-9_ -]+$' then
    raise exception 'Spielername muss 3–20 Zeichen lang sein und darf nur Buchstaben, Zahlen, Leerzeichen, _ und - enthalten.';
  end if;

  v_device_hash := encode(
    extensions.digest(convert_to('auth-user:' || new.id::text,'UTF8'),'sha256'),
    'hex'
  );

  insert into public.players(username, device_token_hash, auth_user_id)
  values(v_username, v_device_hash, new.id);

  return new;
end;
$$;

drop trigger if exists abalone_auth_user_profile on auth.users;
create trigger abalone_auth_user_profile
  after insert on auth.users
  for each row execute function public.abalone_create_profile_for_auth_user();

create or replace function public.abalone_get_my_player()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'rating', p.rating,
    'games_played', p.games_played,
    'wins', p.wins,
    'losses', p.losses
  )
  from public.players p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.abalone_get_my_player() from public;
grant execute on function public.abalone_get_my_player() to authenticated;

-- Do not grant browser roles any ability to apply Elo. A future trusted
-- Edge Function will call the service-only settlement routine after it has
-- independently validated the complete match.
create or replace function public.abalone_settle_validated_match(
  p_room_id uuid,
  p_black_player_id uuid,
  p_white_player_id uuid,
  p_winner_color text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_black public.players%rowtype;
  v_white public.players%rowtype;
  v_black_found boolean := false;
  v_white_found boolean := false;
  v_expected_black numeric;
  v_black_change integer;
  v_white_change integer;
  v_match public.rated_matches%rowtype;
  v_room public.game_rooms%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Nur der vertrauenswürdige Spielserver darf Ratings verbuchen';
  end if;
  if p_winner_color not in ('b','w') then
    raise exception 'Ungültiger Gewinner';
  end if;

  select * into v_room from public.game_rooms
  where id=p_room_id for update;
  if not found then raise exception 'Spielraum nicht gefunden'; end if;
  if v_room.status <> 'finished' then raise exception 'Partie ist nicht abgeschlossen'; end if;
  if v_room.host_player_id is distinct from p_black_player_id
     or v_room.guest_player_id is distinct from p_white_player_id then
    raise exception 'Spieler passen nicht zum Spielraum';
  end if;

  select * into v_match from public.rated_matches where room_id=p_room_id;
  if found then
    return jsonb_build_object('already_settled',true,'match_id',v_match.id);
  end if;

  select * into v_black from public.players where id=p_black_player_id for update;
  v_black_found := found;
  select * into v_white from public.players where id=p_white_player_id for update;
  v_white_found := found;
  if not v_black_found or not v_white_found then raise exception 'Spielerprofil fehlt'; end if;

  v_expected_black := 1.0/(1.0+power(10.0,(v_white.rating-v_black.rating)/400.0));
  v_black_change := round(32.0*((case when p_winner_color='b' then 1.0 else 0.0 end)-v_expected_black));
  v_white_change := -v_black_change;
  -- Keep ratings non-negative without breaking the zero-sum invariant.
  if v_black.rating + v_black_change < 0 then
    v_black_change := -v_black.rating;
    v_white_change := -v_black_change;
  elsif v_white.rating + v_white_change < 0 then
    v_white_change := -v_white.rating;
    v_black_change := -v_white_change;
  end if;

  insert into public.rated_matches(
    room_id,black_player_id,white_player_id,winner_color,
    black_old_rating,white_old_rating,black_change,white_change,
    black_new_rating,white_new_rating
  ) values (
    p_room_id,p_black_player_id,p_white_player_id,p_winner_color,
    v_black.rating,v_white.rating,v_black_change,v_white_change,
    v_black.rating+v_black_change,
    v_white.rating+v_white_change
  ) returning * into v_match;

  update public.players
  set rating=v_match.black_new_rating,
      games_played=games_played+1,
      wins=wins+(case when p_winner_color='b' then 1 else 0 end),
      losses=losses+(case when p_winner_color='w' then 1 else 0 end),
      updated_at=now()
  where id=p_black_player_id;

  update public.players
  set rating=v_match.white_new_rating,
      games_played=games_played+1,
      wins=wins+(case when p_winner_color='w' then 1 else 0 end),
      losses=losses+(case when p_winner_color='b' then 1 else 0 end),
      updated_at=now()
  where id=p_white_player_id;

  insert into public.rating_history(player_id,opponent_id,room_code,result,old_rating,rating_change,new_rating)
  values
    (p_black_player_id,p_white_player_id,v_room.room_code,
      case when p_winner_color='b' then 'win' else 'loss' end,
      v_match.black_old_rating,v_match.black_change,v_match.black_new_rating),
    (p_white_player_id,p_black_player_id,v_room.room_code,
      case when p_winner_color='w' then 'win' else 'loss' end,
      v_match.white_old_rating,v_match.white_change,v_match.white_new_rating);

  return jsonb_build_object(
    'already_settled',false,
    'black_rating',v_match.black_new_rating,
    'white_rating',v_match.white_new_rating,
    'black_change',v_match.black_change,
    'white_change',v_match.white_change
  );
end;
$$;

revoke all on function public.abalone_settle_validated_match(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.abalone_settle_validated_match(uuid,uuid,uuid,text) to service_role;
