-- Disable the legacy browser-trusted result/state submission path.
-- New rated games must submit individual move commands through abalone-move.
revoke all on function public.abalone_submit_state(text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.abalone_submit_state(text,text,jsonb,text,text) to service_role;

-- Authenticated sessions are required for room creation/joining in the rated branch.
revoke all on function public.abalone_create_room(text,integer,jsonb) from public, anon;
grant execute on function public.abalone_create_room(text,integer,jsonb) to authenticated;
revoke all on function public.abalone_join_room(text) from public, anon;
grant execute on function public.abalone_join_room(text) to authenticated;

-- The browser may only read rooms through the token-checked RPC.
revoke all on function public.abalone_get_room(text,text) from public;
grant execute on function public.abalone_get_room(text,text) to anon, authenticated;
