-- Atomic compare-and-swap for server-validated moves.
-- Only service_role may call this function (Edge Function).
create or replace function public.abalone_commit_server_move(
  p_room_id uuid,
  p_expected_updated_at timestamptz,
  p_state jsonb,
  p_winner text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.game_rooms%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only trusted game server may commit moves';
  end if;
  if p_winner is not null and p_winner not in ('b','w') then
    raise exception 'Invalid winner';
  end if;

  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' then
    raise exception 'Room is not active';
  end if;
  if v_room.updated_at is distinct from p_expected_updated_at then
    raise exception 'Room changed; reload current state and retry';
  end if;
  if jsonb_typeof(p_state) <> 'object' or p_state->>'gameOver' is distinct from (p_winner is not null)::text then
    raise exception 'Inconsistent game result';
  end if;

  update public.game_rooms
  set state=p_state,
      current_turn=case when p_winner is null then p_state->>'turn' else current_turn end,
      winner=p_winner,
      status=case when p_winner is null then 'playing' else 'finished' end,
      updated_at=now(),last_move_at=now()
  where id=p_room_id;

  return jsonb_build_object('ok',true,'status',case when p_winner is null then 'playing' else 'finished' end);
end;
$$;

revoke all on function public.abalone_commit_server_move(uuid,timestamptz,jsonb,text) from public, anon, authenticated;
grant execute on function public.abalone_commit_server_move(uuid,timestamptz,jsonb,text) to service_role;
