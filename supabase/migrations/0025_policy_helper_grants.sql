-- MK Adisyon Web / Fix: helpers used by row level security policies
-- RLS policies run with the caller's privileges, so every helper they call must
-- be executable by `authenticated`. private.shares_branch_with (0017) and
-- private.can_manage_payroll (0018) were revoked from everyone by mistake, which
-- made reads of staff_profiles, staff_pay and payroll_entries fail with
-- "permission denied for function". The helpers stay out of reach of anon.

begin;

grant execute on function private.shares_branch_with(uuid, uuid) to authenticated;
grant execute on function private.can_manage_payroll(uuid, uuid) to authenticated;

commit;
