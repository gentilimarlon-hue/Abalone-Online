-- Bind online room seats to authenticated player profiles.
-- Existing rooms remain usable, but are unranked (NULL player IDs).

create or replace function public.abalone_create_room(
  p_mode text,
  p_minutes integer default null,
  p_initial_state jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_token text;
  v_id uuid;
  v_player_id uuid;
begin
  if p_mode not in ('standard','mini','timed') then raise exception 'Ungültiger Spielmodus'; end if;
  if p_mode='timed' and (p_minutes is null or p_minutes not in (3,5,10)) then raise exception 'Ungültige Spielzeit'; end if;

  select id into v_player_id from public.players where auth_user_id=auth.uid();
  v_code:=upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
  v_token:=encode(extensions.gen_random_bytes(32),'hex');

  insert into public.game_rooms
    (room_code,mode,minutes_per_player,status,host_token_hash,state,current_turn,
     created_at,updated_at,expires_at,host_player_id)
  values
    (v_code,p_mode,p_minutes,'waiting',
     encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),
     coalesce(p_initial_state,'{}'::jsonb),'b',now(),now(),now()+interval '24 hours',v_player_id)
  returning id into v_id;

  return jsonb_build_object('room_code',v_code,'player_token',v_token,'player_color','b','room_id',v_id);
end;
$$;

create or replace function public.abalone_join_room(p_room_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_room public.game_rooms%rowtype;
  v_player_id uuid;
begin
  select id into v_player_id from public.players where auth_user_id=auth.uid();
  select * into v_room from public.game_rooms
  where room_code=upper(trim(p_room_code)) and status='waiting' and expires_at>now()
  for update;
  if not found then raise exception 'Raum nicht gefunden oder bereits beigetreten'; end if;
  if v_player_id is not null and v_player_id=v_room.host_player_id then
    raise exception 'Du kannst nicht mit demselben Account gegen dich selbst spielen';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  update public.game_rooms
  set guest_token_hash=encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),
      guest_player_id=v_player_id,status='playing',updated_at=now(),last_move_at=now()
  where id=v_room.id;

  return jsonb_build_object('room_code',v_room.room_code,'player_token',v_token,
    'player_color','w','mode',v_room.mode,'minutes_per_player',v_room.minutes_per_player,
    'state',v_room.state,'current_turn',v_room.current_turn);
end;
$$;

revoke all on function public.abalone_create_room(text,integer,jsonb) from public, anon;
grant execute on function public.abalone_create_room(text,integer,jsonb) to authenticated;
revoke all on function public.abalone_join_room(text) from public, anon;
grant execute on function public.abalone_join_room(text) to authenticated;
