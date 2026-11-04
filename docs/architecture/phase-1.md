# Phase 1 architecture

## Architectural style

MK Adisyon Web is a modular monolith. One Next.js application owns the user
experience while domain modules keep restaurant concerns separated. Supabase
provides Auth, PostgreSQL, Row Level Security and Realtime after Phase 2
activation.

The browser is not a trusted tenant boundary. URL segments improve navigation,
but every database operation must derive authorization from the authenticated
user and membership data enforced by PostgreSQL RLS.

## Route groups

- `(marketing)`: public product presentation.
- `(auth)`: authentication experience.
- `(workspace)`: tenant and branch scoped restaurant operations.
- `mk-admin`: server-authorized MK Digital Systems control plane.

Workspace URLs include tenant and branch slugs:

```text
/app/[tenant]/[branch]/masalar
/app/[tenant]/[branch]/mutfak
/app/[tenant]/[branch]/kasa
/app/[tenant]/[branch]/ayarlar
```

Slugs are routing identifiers only. Database functions must resolve them to
UUIDs and validate membership before accessing data.

## Domain modules

- `auth`: sign-in and session experience.
- `tenancy`: tenant, branch and membership context.
- `catalog`: categories, products and kitchen routing.
- `tables`: dining areas and table board.
- `orders`: order lifecycle and immutable item snapshots.
- `kitchen`: station tickets and preparation workflow.
- `checkout`: bill splitting and payment orchestration.
- `cash-register`: sessions and cash movements.
- `settings`: tenant customization.
- `platform-admin`: manual subscriptions and tenant lifecycle.

## Data access

Browser and server Supabase clients live in `src/lib/supabase`. No component
creates clients directly. Phase 2 will add repository functions per module and
transaction-oriented Postgres RPC functions for critical mutations.

The service-role key is reserved for tightly scoped server-side platform
administration. Normal restaurant operations use the authenticated user's JWT
so RLS remains in force.

## Financial rules

- Money is stored as integer minor units (kuruş).
- Product name, unit price and tax rate are copied to order item snapshots.
- Mixed payment is represented by multiple payment rows.
- Financial rows are not hard-deleted.
- Idempotency keys protect retried payment requests.
- Cash session close and payment completion will be atomic database functions.

## PWA boundary

Phase 1 includes install metadata, service-worker registration and an offline
fallback. It does not queue orders or payments offline. Financial and order
mutations require a confirmed network response until a dedicated conflict and
reconciliation design is approved.
