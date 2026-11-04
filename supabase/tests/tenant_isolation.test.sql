-- pgTAP test plan draft. Requires local Supabase before execution.
-- This test is intentionally not run in Phase 1.

begin;

select plan(6);

select has_table('public', 'tenants', 'tenants table exists');
select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'payments', 'payments table exists');
select row_security_active('public', 'orders', 'orders has RLS enabled');
select row_security_active('public', 'payments', 'payments has RLS enabled');
select has_function('private', 'is_tenant_member', array['uuid'], 'tenant membership helper exists');

select * from finish();
rollback;

-- Phase 2 adds authenticated fixtures for tenant A / tenant B and explicit
-- allow/deny assertions for SELECT, INSERT and UPDATE on every exposed table.
