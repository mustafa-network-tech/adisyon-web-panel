-- MK Adisyon Web / ROLLBACK for 0035_finance_read_permissions.sql
--
-- NOT a migration: the Supabase CLI only applies supabase/migrations/, so this
-- file is never run automatically. Run it by hand (SQL editor or psql) only if
-- 0035 has to be undone.
--
-- Effect: removes the five restrictive "finance read" policies. Reading the
-- finance tables is then governed by the older branch-access and history
-- policies again, i.e. EVERY member of a branch (waiter, kitchen, ...) can read
-- payments, refunds, allocations, cash sessions and cash movements of that
-- branch. Use it only as a temporary measure and re-apply 0035 afterwards.
--
-- No data or schema changes. Safe to run more than once. Everything happens in
-- one transaction: either all five policies are gone or none is.

begin;

-- Fail fast instead of queueing behind a long running query.
set local lock_timeout = '5s';

drop policy if exists cash_sessions_finance_read_restrict on public.cash_sessions;
drop policy if exists cash_movements_finance_read_restrict on public.cash_movements;
drop policy if exists payments_finance_read_restrict on public.payments;
drop policy if exists payment_refunds_finance_read_restrict on public.payment_refunds;
drop policy if exists payment_allocations_finance_read_restrict on public.payment_allocations;

commit;
