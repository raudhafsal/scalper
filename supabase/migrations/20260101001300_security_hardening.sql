-- =============================================================================
-- MT5 Scalp Command Center - security hardening (13/16)
--
-- Added after running Supabase's built-in security advisor against a live
-- deployment of this schema. Two findings, both closed here:
--
-- 1. function_search_path_mutable: set_updated_at() didn't pin search_path.
-- 2. anon/authenticated_security_definer_function_executable: Supabase's
--    default privileges grant EXECUTE on every new function in the public
--    schema to anon/authenticated/service_role explicitly (independent of
--    the PUBLIC pseudo-role), which meant every SECURITY DEFINER helper and
--    trigger function here was directly callable via
--    /rest/v1/rpc/<function_name> by anyone, signed in or not.
--
-- Fix, function by function:
--   - handle_new_user / seed_defaults_for_new_profile /
--     seed_trading_state_for_new_profile / upsert_daily_statistics_for_closed_trade
--     are trigger-only functions (return type `trigger`). They only ever run
--     as triggers fired by privileged roles (the Auth service inserting into
--     auth.users; the service-role key inserting into closed_trades) - never
--     by anon/authenticated performing those inserts directly. EXECUTE is
--     revoked from anon and authenticated entirely.
--   - current_user_role() / is_admin() / owns_account() ARE evaluated as part
--     of RLS policy conditions for every authenticated query against a
--     protected table, so `authenticated` must keep EXECUTE or RLS breaks.
--     `anon` never queries any RLS-protected table in this schema (no policy
--     grants anon SELECT anywhere), so anon's EXECUTE is revoked.
-- =============================================================================

alter function public.set_updated_at() set search_path = public;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.seed_defaults_for_new_profile() from anon, authenticated;
revoke execute on function public.seed_trading_state_for_new_profile() from anon, authenticated;
revoke execute on function public.upsert_daily_statistics_for_closed_trade() from anon, authenticated;

revoke execute on function public.current_user_role() from anon, authenticated;
revoke execute on function public.is_admin() from anon, authenticated;
revoke execute on function public.owns_account(uuid) from anon, authenticated;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.owns_account(uuid) to authenticated;
