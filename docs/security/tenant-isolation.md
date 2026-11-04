# Tenant isolation and security model

## Defense in depth

1. Supabase Auth establishes identity.
2. `tenant_memberships` establishes active tenant membership.
3. `membership_branches` limits each membership to assigned branches.
4. Roles map memberships to explicit permissions.
5. RLS filters every exposed tenant-owned table.
6. Composite foreign keys keep related rows in the same tenant.
7. Critical RPC functions repeat authorization and invariants transactionally.
8. Audit logs record sensitive changes.

Every tenant-owned table contains a non-null `tenant_id`. Branch data also
contains `branch_id`, with composite `(tenant_id, branch_id)` foreign keys.
This prevents cross-tenant references even when application code is wrong.

## RLS principles

- Policies exist per operation; missing policies deny access by default.
- Membership and permission helper functions use `security definer`, an empty
  search path and fully qualified object names.
- RLS columns are indexed.
- User-editable metadata is not an authorization source.
- Platform administrators do not inherit tenant mutation permissions.
- Operational platform support is reasoned, time-limited and read-only.
- `service_role` never reaches the browser and bypasses RLS only in audited,
  server-only platform workflows.
- Direct client updates to completed payments and audit logs are not allowed.

## Platform administration

MK Digital Systems administrators are stored separately from tenant roles.
Platform routes must verify a current authenticated administrator on the
server. Tenant creation, subscription changes and support access must write an
audit event containing actor, action, tenant and timestamp.

Restaurant operational rows are not visible to a platform administrator by
default. Access requires an active `platform_support_sessions` record created
through the reviewed RPC. Opening, selecting a tenant context and closing the
support session each produce audit events.

## Required Phase 2 tests

For two isolated tenant fixtures, test every exposed operation as:

- anonymous user;
- active member of tenant A;
- active member of tenant B;
- suspended member;
- role without the required permission;
- role with the required permission;
- platform administrator.

At minimum, tests must prove that tenant A cannot select, insert or update any
tenant B restaurant, order, kitchen, cash or settings row.
