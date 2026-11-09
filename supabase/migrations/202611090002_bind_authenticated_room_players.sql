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
  v_initial_state jsonb;
  v_pieces jsonb := '[]'::jsonb;
  v_black text[] := array[]::text[];
  v_white text[] := array[]::text[];
  v_bomb_b text;
  v_bomb_w text;
  q integer;
begin
  if p_mode not in ('standard','mini','timed') then raise exception 'Ungültiger Spielmodus'; end if;
  if p_mode='timed' and (p_minutes is null or p_minutes not in (3,5,10)) then raise exception 'Ungültige Spielzeit'; end if;

  select id into v_player_id from public.players where auth_user_id=auth.uid();
  if v_player_id is null then raise exception 'Bitte zuerst mit einem Spieleraccount anmelden'; end if;
  -- Construct the canonical starting position on the database; never trust
  -- a client-supplied initial board or bomb placement.
  if p_mode='mini' then
    for q in 0..3 loop v_black:=array_append(v_black,q::text||',-3'); end loop;
    for q in 0..2 loop v_black:=array_append(v_black,q::text||',-2'); end loop;
    for q in -3..0 loop v_white:=array_append(v_white,q::text||',3'); end loop;
    for q in -2..0 loop v_white:=array_append(v_white,q::text||',2'); end loop;
  else
    for q in 0..4 loop v_black:=array_append(v_black,q::text||',-4'); end loop;
    for q in -1..4 loop v_black:=array_append(v_black,q::text||',-3'); end loop;
    for q in 0..2 loop v_black:=array_append(v_black,q::text||',-2'); end loop;
    for q in -4..0 loop v_white:=array_append(v_white,q::text||',4'); end loop;
    for q in -4..1 loop v_white:=array_append(v_white,q::text||',3'); end loop;
    for q in -2..0 loop v_white:=array_append(v_white,q::text||',2'); end loop;
  end if;
  v_bomb_b:=v_black[1+floor(random()*array_length(v_black,1))::integer];
  v_bomb_w:=v_white[1+floor(random()*array_length(v_white,1))::integer];
  select coalesce(jsonb_agg(jsonb_build_array(pos,'b')),'[]'::jsonb) into v_pieces from unnest(v_black) pos;
  v_pieces:=v_pieces||(select coalesce(jsonb_agg(jsonb_build_array(pos,'w')),'[]'::jsonb) from unnest(v_white) pos);
  v_initial_state:=jsonb_build_object('radius',case when p_mode='mini' then 3 else 4 end,
    'pieces',v_pieces,'turn','b','lost',jsonb_build_object('b',0,'w',0),
    'bombs',jsonb_build_object('b',v_bomb_b,'w',v_bomb_w),'gameOver',false,'timed',false);

  v_code:=upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,6));
  v_token:=encode(extensions.gen_random_bytes(32),'hex');

  insert into public.game_rooms
    (room_code,mode,minutes_per_player,status,host_token_hash,state,current_turn,
     created_at,updated_at,expires_at,host_player_id)
  values
    (v_code,p_mode,p_minutes,'waiting',
     encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex'),
     v_initial_state,'b',now(),now(),now()+interval '24 hours',v_player_id)
  returning id into v_id;

  return jsonb_build_object('room_code',v_code,'player_token',v_token,'player_color','b','room_id',v_id,'state',v_initial_state);
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
  if v_player_id is null then raise exception 'Bitte zuerst mit einem Spieleraccount anmelden'; end if;
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
