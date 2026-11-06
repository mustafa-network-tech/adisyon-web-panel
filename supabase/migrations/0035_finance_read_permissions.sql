-- MK Adisyon Web / Finance tables: reading needs a finance permission
--
-- Problem: SELECT on cash_sessions, payments, payment_refunds,
-- payment_allocations and cash_movements was allowed for every member of the
-- branch (private.has_branch_access / has_cash_session_access). A waiter or a
-- kitchen user could therefore read payments, refunds, open cash sessions and
-- cash movements with a plain authenticated REST query.
--
-- Fix: one additional RESTRICTIVE select policy per table. Restrictive policies
-- are AND-ed with the existing permissive "branch access" policy and with the
-- existing "history" restrictive policies, so tenant/branch isolation and the
-- date/open-session limits stay exactly as they were. Nothing is removed.
--
-- Who may read what (the cash screen "Kasa" is opened by payments.create,
-- payments.refund, cash.open or cash.close):
--   cash_sessions                     payments.create, payments.refund, cash.open, cash.close
--   cash_movements                    payments.create, cash.open, cash.close
--   payments, payment_refunds,
--   payment_allocations               payments.create, payments.refund, cash.close
-- cash.open alone is enough to see the shift it opens, but not the sales in it.
-- reports.read / reports.history are not needed here: reports are built by the
-- security definer function sales_report, which is unaffected by RLS.
-- An active platform support session keeps the read access it had before.
--
-- Security definer functions (record_order_payments, refund_payment,
-- open/close_cash_session, record_cash_movement, sales_report, ...) run as the
-- table owner and are not subject to these policies.
--
-- ROLLBACK (run manually, only if this migration has to be undone):
--   drop policy cash_sessions_finance_read_restrict on public.cash_sessions;
--   drop policy cash_movements_finance_read_restrict on public.cash_movements;
--   drop policy payments_finance_read_restrict on public.payments;
--   drop policy payment_refunds_finance_read_restrict on public.payment_refunds;
--   drop policy payment_allocations_finance_read_restrict on public.payment_allocations;

begin;

create policy cash_sessions_finance_read_restrict
on public.cash_sessions
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'payments.refund')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.open')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

create policy cash_movements_finance_read_restrict
on public.cash_movements
as restrictive
for select
to authenticated
using (
  private.has_cash_session_permission(tenant_id, cash_session_id, 'payments.create')
  or private.has_cash_session_permission(tenant_id, cash_session_id, 'cash.open')
  or private.has_cash_session_permission(tenant_id, cash_session_id, 'cash.close')
  or exists (
    select 1
    from public.cash_sessions finance_session
    where finance_session.tenant_id = cash_movements.tenant_id
      and finance_session.id = cash_movements.cash_session_id
      and private.is_platform_support_active(
        finance_session.tenant_id, finance_session.branch_id
      )
  )
);

create policy payments_finance_read_restrict
on public.payments
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'payments.refund')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

create policy payment_refunds_finance_read_restrict
on public.payment_refunds
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'payments.refund')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

create policy payment_allocations_finance_read_restrict
on public.payment_allocations
as restrictive
for select
to authenticated
using (
  private.has_branch_permission(tenant_id, branch_id, 'payments.create')
  or private.has_branch_permission(tenant_id, branch_id, 'payments.refund')
  or private.has_branch_permission(tenant_id, branch_id, 'cash.close')
  or private.is_platform_support_active(tenant_id, branch_id)
);

commit;
