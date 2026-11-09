\set ON_ERROR_STOP on

-- Minimal Supabase Auth compatibility layer for isolated PostgreSQL CI.
-- This is a disposable test database, never the production project.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end; $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_user
  );
$$;

\echo 'Applying baseline schema and legacy player tables'
\ir ../../schema.sql
\ir ../players.sql

\echo 'Applying secure account and Elo migrations in order'
\ir ../migrations/202611090001_secure_accounts_elo_foundation.sql
\ir ../migrations/202611090002_bind_authenticated_room_players.sql
\ir ../migrations/202611090003_server_move_commit.sql
\ir ../migrations/202611090004_disable_legacy_client_state_submission.sql
\ir ../migrations/202611090005_room_opponent_and_rating_history.sql
\ir ../migrations/202611090006_disable_legacy_passwordless_player_auth.sql

\echo 'Testing account creation, authenticated room binding, and idempotent Elo settlement'
do $$
declare
  v_host uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_host_profile uuid;
  v_guest_profile uuid;
  v_room jsonb;
  v_join jsonb;
  v_room_id uuid;
  v_room_code text;
  v_settlement jsonb;
  v_state jsonb;
  v_updated_at timestamptz;
  v_count integer;
  v_host_games integer;
  v_guest_games integer;
begin
  insert into auth.users(id, raw_user_meta_data)
  values
    (v_host, jsonb_build_object('username','CI_Host')),
    (v_guest, jsonb_build_object('username','CI_Guest'));

  select id into strict v_host_profile from public.players where auth_user_id=v_host;
  select id into strict v_guest_profile from public.players where auth_user_id=v_guest;

  perform set_config('request.jwt.claim.sub',v_host::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_room := public.abalone_create_room('standard',null,'{}'::jsonb);
  v_room_code := v_room->>'room_code';
  v_room_id := (v_room->>'room_id')::uuid;
  if v_room->>'player_color' <> 'b' then raise exception 'Host color should be black'; end if;

  -- The host must not be able to occupy both seats.
  begin
    perform set_config('request.jwt.claim.sub',v_host::text,true);
    perform public.abalone_join_room(v_room_code);
    raise exception 'Host self-join should have been rejected';
  exception when others then
    if sqlerrm = 'Host self-join should have been rejected' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub',v_guest::text,true);
  v_join := public.abalone_join_room(v_room_code);
  if v_join->>'player_color' <> 'w' then raise exception 'Guest color should be white'; end if;

  select state,updated_at into strict v_state,v_updated_at
  from public.game_rooms where id=v_room_id;
  -- A standard-board terminal state: white has lost the six required marbles.
  v_state := jsonb_set(v_state,'{lost,w}','6'::jsonb);
  v_state := jsonb_set(v_state,'{gameOver}','true'::jsonb);

  perform set_config('request.jwt.claim.role','service_role',true);
  -- A stale snapshot must not overwrite a newer room state.
  begin
    perform public.abalone_commit_server_move(
      v_room_id,v_updated_at - interval '1 second',v_state,'b'
    );
    raise exception 'Stale compare-and-swap should have been rejected';
  exception when others then
    if sqlerrm = 'Stale compare-and-swap should have been rejected' then raise; end if;
  end;

  v_settlement := public.abalone_commit_server_move(
    v_room_id,v_updated_at,v_state,'b'
  );
  if v_settlement->>'status' <> 'finished' then
    raise exception 'Server move commit did not finish the match';
  end if;

  v_settlement := public.abalone_settle_validated_match(v_room_id,v_host_profile,v_guest_profile,'b');
  if not coalesce((v_settlement->>'already_settled')::boolean,false) then
    raise exception 'Repeated settlement was not idempotent';
  end if;

  select count(*) into v_count from public.rated_matches where room_id=v_room_id;
  if v_count <> 1 then raise exception 'Expected exactly one rated_matches row, got %',v_count; end if;
  select count(*) into v_count from public.rating_history where room_code=v_room_code;
  if v_count <> 2 then raise exception 'Expected two rating history rows, got %',v_count; end if;
  select games_played into v_host_games from public.players where id=v_host_profile;
  select games_played into v_guest_games from public.players where id=v_guest_profile;
  if v_host_games <> 1 or v_guest_games <> 1 then
    raise exception 'Games played must increment exactly once (host %, guest %)',v_host_games,v_guest_games;
  end if;

  begin
    perform public.abalone_settle_validated_match(v_room_id,v_host_profile,v_guest_profile,'w');
    raise exception 'Mismatched winner should have been rejected';
  exception when others then
    if sqlerrm = 'Mismatched winner should have been rejected' then raise; end if;
  end;

  if has_function_privilege('anon','public.abalone_get_my_player()','EXECUTE') then
    raise exception 'anon must not execute abalone_get_my_player';
  end if;
  if has_function_privilege('authenticated','public.abalone_settle_validated_match(uuid,uuid,uuid,text)','EXECUTE') then
    raise exception 'authenticated must not execute Elo settlement';
  end if;
  if has_function_privilege('anon','public.abalone_register_player(text,text)','EXECUTE') then
    raise exception 'anon must not execute legacy passwordless registration';
  end if;
end; $$;

\echo 'Secure Elo PostgreSQL integration tests passed'
