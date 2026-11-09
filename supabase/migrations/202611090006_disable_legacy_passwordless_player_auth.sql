-- Retire the old passwordless username/device-token account API.
-- The new account model uses Supabase Auth and auth_user_id exclusively.
revoke all on function public.abalone_register_player(text,text) from public, anon, authenticated;
revoke all on function public.abalone_get_player(text) from public, anon, authenticated;
