-- Expose only the two public player labels to participants of their room.
create or replace function public.abalone_get_room(p_room_code text,p_player_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.game_rooms%rowtype;
  v_hash text;
  v_color text;
  v_me public.players%rowtype;
  v_opponent public.players%rowtype;
begin
  v_hash:=encode(extensions.digest(convert_to(coalesce(p_player_token,''),'UTF8'),'sha256'),'hex');
  select * into v_room from public.game_rooms
  where room_code=upper(trim(p_room_code)) and expires_at>now();
  if not found then raise exception 'Raum nicht gefunden'; end if;

  if v_hash=v_room.host_token_hash then
    v_color:='b';
    if v_room.host_player_id is not null then select * into v_me from public.players where id=v_room.host_player_id; end if;
    if v_room.guest_player_id is not null then select * into v_opponent from public.players where id=v_room.guest_player_id; end if;
  elsif v_hash=v_room.guest_token_hash then
    v_color:='w';
    if v_room.guest_player_id is not null then select * into v_me from public.players where id=v_room.guest_player_id; end if;
    if v_room.host_player_id is not null then select * into v_opponent from public.players where id=v_room.host_player_id; end if;
  else
    raise exception 'Ungültiger Spieler-Token';
  end if;

  return jsonb_build_object(
    'room_code',v_room.room_code,'mode',v_room.mode,'minutes_per_player',v_room.minutes_per_player,
    'status',v_room.status,'state',v_room.state,'current_turn',v_room.current_turn,
    'winner',v_room.winner,'player_color',v_color,'updated_at',v_room.updated_at,
    'player',case when v_me.id is null then null else jsonb_build_object('username',v_me.username,'rating',v_me.rating) end,
    'opponent',case when v_opponent.id is null then null else jsonb_build_object('username',v_opponent.username,'rating',v_opponent.rating) end
  );
end;
$$;
revoke all on function public.abalone_get_room(text,text) from public;
grant execute on function public.abalone_get_room(text,text) to anon, authenticated;

create or replace function public.abalone_get_my_rating_history(p_limit integer default 20)
returns table(opponent text,result text,old_rating integer,rating_change integer,new_rating integer,created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(o.username,'Unbekannt'),h.result,h.old_rating,h.rating_change,h.new_rating,h.created_at
  from public.rating_history h
  left join public.players o on o.id=h.opponent_id
  join public.players me on me.id=h.player_id
  where me.auth_user_id=auth.uid()
  order by h.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),100));
$$;
revoke all on function public.abalone_get_my_rating_history(integer) from public,anon;
grant execute on function public.abalone_get_my_rating_history(integer) to authenticated;
