-- MK Adisyon Web / 0038: remove anonymous SQL privileges nobody needs
--
-- Problem (catalog inventory on PostgreSQL 17 after 0001-0037):
--   1) public.tenant_onboarding (0032) only ever received "grant select ... to authenticated", but the
--      platform's default privileges also gave anon AND authenticated DELETE, INSERT, REFERENCES,
--      TRIGGER, TRUNCATE and UPDATE (and MAINTAIN on PostgreSQL 17) on it. Row level security stops row reads and writes, but
--      TRUNCATE is not subject to row level security: an anonymous (or any signed-in) connection
--      that can issue SQL could empty the onboarding table. It was the only one of the 52 public
--      tables with anon privileges.
--   2) Seven SECURITY DEFINER functions are executable by anon although each of them rejects an
--      anonymous caller inside its own body (0009 / 0004 revoked them from PUBLIC only, the explicit
--      platform default grant to anon stayed). Defense in depth: take the door away too.
--
-- Fix (privileges only; no function body, policy, table or default-privilege change):
--   * tenant_onboarding: nothing for anon; authenticated keeps SELECT (the application only reads the
--     table; every write goes through SECURITY DEFINER functions, which run as the owner).
--   * EXECUTE revoked from anon on exactly these functions (signatures taken from pg_proc):
--       accept_tenant_invitation(text)
--       create_tenant_invitation(uuid, uuid, text, uuid, integer)
--       update_tenant_member_access(uuid, uuid, membership_status, uuid[], uuid[])
--       save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer)
--       open_platform_support_session(uuid, uuid, text, integer)
--       close_platform_support_session(uuid)
--       record_tenant_context(uuid, uuid)
--
-- Deliberately NOT touched: get_public_menu, place_customer_order, call_waiter, get_tenant_invitation
-- (QR menu, customer orders, waiter call, invitation preview stay anonymous); the private schema;
-- every other table and function; ALTER DEFAULT PRIVILEGES (separate decision, see the audit notes).
--
-- ROLLBACK: supabase/rollback/0038_anon_privilege_lockdown_down.sql

begin;

revoke all on table public.tenant_onboarding from anon;
-- "all" instead of a list: it also covers MAINTAIN (PostgreSQL 17), which would allow LOCK TABLE.
revoke all on table public.tenant_onboarding from authenticated;
grant select on table public.tenant_onboarding to authenticated;

revoke execute on function public.accept_tenant_invitation(text) from anon;
revoke execute on function public.create_tenant_invitation(uuid, uuid, text, uuid, integer) from anon;
revoke execute on function public.update_tenant_member_access(uuid, uuid, public.membership_status, uuid[], uuid[]) from anon;
revoke execute on function public.save_tenant_configuration(uuid, uuid, text, text, text, text, text, text, text, integer) from anon;
revoke execute on function public.open_platform_support_session(uuid, uuid, text, integer) from anon;
revoke execute on function public.close_platform_support_session(uuid) from anon;
revoke execute on function public.record_tenant_context(uuid, uuid) from anon;

commit;
