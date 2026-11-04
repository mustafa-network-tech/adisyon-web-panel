# Tenant isolation and security model

## Defense in depth

1. Supabase Auth establishes identity.
2. `tenant_memberships` establishes active tenant membership.
3. Roles map memberships to explicit permissions.
4. RLS filters every exposed tenant-owned table.
5. Composite foreign keys keep related rows in the same tenant.
6. Critical RPC functions repeat authorization and invariants transactionally.
7. Audit logs record sensitive changes.

Every tenant-owned table contains a non-null `tenant_id`. Branch data also
contains `branch_id`, with composite `(tenant_id, branch_id)` foreign keys.
This prevents cross-tenant references even when application code is wrong.

## RLS principles

- Policies exist per operation; missing policies deny access by default.
- Membership and permission helper functions use `security definer`, an empty
  search path and fully qualified object names.
- RLS columns are indexed.
- User-editable metadata is not an authorization source.
- `service_role` never reaches the browser and bypasses RLS only in audited,
  server-only platform workflows.
- Direct client updates to completed payments and audit logs are not allowed.

## Platform administration

MK Digital Systems administrators are stored separately from tenant roles.
Platform routes must verify a current authenticated administrator on the
server. Tenant creation, subscription changes and support access must write an
audit event containing actor, action, tenant and timestamp.

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
