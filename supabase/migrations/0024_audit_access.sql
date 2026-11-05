-- MK Adisyon Web / Audit log access
-- The audit trail used to be readable by everyone with reports.read (cashiers
-- included). It now needs settings.manage, i.e. company administrators, and the
-- platform team. The trail keeps no payroll amounts, card data or passwords.

begin;

drop policy if exists audit_logs_select_authorized on public.audit_logs;

create policy audit_logs_select_authorized
on public.audit_logs for select to authenticated
using (
  private.is_platform_admin()
  or (
    tenant_id is not null
    and private.has_tenant_permission(tenant_id, 'settings.manage')
  )
);

commit;
