-- MK Adisyon Web / ROLLBACK for 0038_anon_privilege_lockdown.sql
--
-- NOT a migration (the Supabase CLI only applies supabase/migrations/). Run by hand only if 0038
-- has to be undone. It RE-OPENS the anonymous privileges 0038 removed: anon (and authenticated)
-- may TRUNCATE / write tenant_onboarding at the privilege level (row level security still blocks
-- row access, TRUNCATE it does not), and anon may execute the seven functions again (each still
-- rejects anonymous callers inside its body). Use it as a short, temporary measure.
--
-- One transaction: everything is restored or nothing is. Safe to run more than once.

begin;
set local lock_timeout = '5s';

grant all on table public.tenant_onboarding to anon;
grant all on table public.tenant_onboarding to authenticated;

grant execute on function public.accept_tenant_invitation(text) to anon;
grant execute on function public.create_tenant_invitation(uuid, uuid, text, uuid, integer) to anon;
grant execute on function public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[]) to anon;
grant execute on function public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer) to anon;
grant execute on function public.open_platform_support_session(uuid, uuid, text, integer) to anon;
grant execute on function public.close_platform_support_session(uuid) to anon;
grant execute on function public.record_tenant_context(uuid, uuid) to anon;

commit;
