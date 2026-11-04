# MK Adisyon Web — Phase 2 technical development plan

Phase 2 begins only after explicit approval. Its objective is to replace Phase
1 mock state with a locally verified Supabase-backed vertical slice covering
authentication, tenant context, table service, kitchen flow and checkout.

## Module 1 — Local Supabase foundation

### Work

- Install Docker Desktop and Supabase CLI.
- Initialize a local Supabase project only.
- Review and apply Phase 1 schema drafts locally.
- Add deterministic development seed data.
- Generate TypeScript database types.
- Add migration reset and verification commands.

### Dependencies

None. This is the Phase 2 foundation.

### Acceptance criteria

- `supabase db reset` succeeds locally from a clean state.
- No production or shared project is linked.
- Generated TypeScript types compile without manual edits.
- All tables, foreign keys and indexes are reproducible from versioned SQL.

## Module 2 — Authentication and session boundary

### Work

- Activate Supabase email/password authentication.
- Add server-side sign-in, sign-out and password reset actions.
- Add the Next.js session refresh proxy.
- Create profile provisioning and invitation acceptance flows.
- Add protected-route and platform-admin guards.

### Dependencies

Local Supabase foundation.

### Acceptance criteria

- Anonymous users cannot access workspace or platform routes.
- Successful login survives navigation and browser refresh.
- Expired sessions refresh or return to sign-in safely.
- Error messages do not disclose whether unrelated accounts exist.
- Service-role credentials are absent from client bundles.

## Module 3 — Tenant, branch, roles and RLS

### Work

- Implement tenant and branch resolution repositories.
- Seed default owner, manager, waiter, kitchen and cashier roles.
- Complete per-operation RLS policies.
- Add branch-scoped membership checks.
- Create pgTAP fixtures for tenant A and tenant B.
- Add audited tenant switching and platform support access rules.

### Dependencies

Authentication and local database.

### Acceptance criteria

- Cross-tenant select, insert and update tests fail closed.
- Suspended memberships lose access immediately after session refresh.
- UI navigation reflects permissions, but database policies remain the source
  of truth.
- All RLS tests pass for anonymous, member, unauthorized and administrator
  cases.

## Module 4 — Catalog, dining areas and tables

### Work

- Replace table and menu mock data with typed repositories.
- Add dining area and table CRUD.
- Add category, product, price and kitchen-station assignment CRUD.
- Add optimistic UI with conflict recovery for non-financial settings.
- Derive table occupancy from active orders plus operational status.

### Dependencies

Tenant context, permissions and generated database types.

### Acceptance criteria

- Managers can configure their own branch only.
- Waiters can read the assigned branch but cannot alter catalog settings.
- Table occupancy cannot drift from active order state.
- Archived products remain visible in historical order snapshots.

## Module 5 — Order lifecycle vertical slice

### Work

- Implement create/open order transaction.
- Add order items, notes, quantities and product snapshots.
- Add optimistic version checking to prevent lost updates.
- Implement submit-to-kitchen transaction and idempotency.
- Persist order status history and audit events.
- Subscribe the active table view to scoped Realtime changes.

### Dependencies

Catalog, tables, authenticated user and RLS.

### Acceptance criteria

- A waiter can open a table, add items and submit exactly once.
- Retried requests do not duplicate items or kitchen tickets.
- Concurrent edits produce a recoverable conflict rather than silent data loss.
- Another tenant never receives the order through query or Realtime.
- Historical item price and tax snapshots remain unchanged after catalog edits.

## Module 6 — Kitchen workflow and Realtime

### Work

- Route submitted items to kitchen stations.
- Persist new, preparing, ready, served and cancelled transitions.
- Add reconnect and full-resync behavior after network loss.
- Add station and status filters plus preparation timers.
- Add permission checks for every transition.

### Dependencies

Order submission, kitchen stations and RLS.

### Acceptance criteria

- New tickets appear on the correct station without manual refresh.
- Reconnection produces the same state as a fresh database query.
- Invalid state transitions are rejected transactionally.
- Ready/served changes update the corresponding table experience.

## Module 7 — Cash session, checkout and split payments

### Work

- Implement cash-register open and close transactions.
- Add partial, cash, card and mixed payment recording.
- Add amount-based and item-based bill splitting.
- Add payment allocation and refund schema refinements.
- Enforce idempotency and append-only financial records.
- Calculate cash-session expected balance on the server.

### Dependencies

Closed order totals, permissions and audit infrastructure.

### Acceptance criteria

- Payments cannot exceed the valid outstanding amount.
- Mixed payment is represented by separately auditable payment rows.
- Repeated completion requests produce one financial result.
- Closed sessions reject new movements.
- Cashier and manager permissions are tested independently.
- No payment is accepted while offline.

## Module 8 — Settings and MK platform administration

### Work

- Persist tenant branding and operational settings.
- Implement user invitation and role assignment.
- Implement server-only tenant provisioning.
- Add manual subscription status and date management.
- Add immutable audit history for platform actions.

### Dependencies

Authentication, tenant RLS and platform-admin guard.

### Acceptance criteria

- Tenant managers cannot access platform administration.
- Platform actions require a verified platform administrator.
- Subscription changes record before/after values and actor identity.
- Suspended tenants follow an explicitly tested access policy.

## Module 9 — PWA hardening and quality gates

### Work

- Produce final 192 px and 512 px raster icons.
- Add update-available and connection-state experiences.
- Verify installability on Android, iPadOS and desktop Chromium.
- Add Vitest unit tests and Playwright critical-path tests.
- Run accessibility, responsive and production build audits.

### Dependencies

Stable vertical slice from authentication through payment.

### Acceptance criteria

- Manifest and service worker pass installability checks.
- Static assets have a safe update strategy; authenticated API data is not
  cached by the service worker.
- Keyboard navigation and visible focus work on critical screens.
- Main flows pass at 360 px mobile, tablet landscape and desktop widths.
- TypeScript, lint, unit, RLS, end-to-end and production build checks pass.

## Recommended execution order

1. Local Supabase foundation.
2. Authentication and session boundary.
3. Tenant/RLS test harness.
4. Catalog and tables.
5. Order vertical slice.
6. Kitchen Realtime.
7. Cash and checkout.
8. Settings and platform administration.
9. PWA hardening and full quality gate.

The critical path is database foundation → authentication → tenant isolation →
order transaction → kitchen → checkout. UI modules may be refined in parallel
only after their authorization and data contracts are stable.
