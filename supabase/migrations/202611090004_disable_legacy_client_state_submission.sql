-- Disable the legacy browser-trusted result/state submission path.
-- New rated games must submit individual move commands through abalone-move.
-- Older installations may have a different overload (or no legacy RPC at all).
-- Revoke every existing overload without making the migration depend on one
-- historical function signature.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='abalone_submit_state'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.signature);
    execute format('grant execute on function %s to service_role', v_function.signature);
  end loop;
end; $$;

-- Authenticated sessions are required for room creation/joining in the rated branch.
revoke all on function public.abalone_create_room(text,integer,jsonb) from public, anon;
grant execute on function public.abalone_create_room(text,integer,jsonb) to authenticated;
revoke all on function public.abalone_join_room(text) from public, anon;
grant execute on function public.abalone_join_room(text) to authenticated;

-- Room-read permissions are applied after the RPC is created in migration 005.
