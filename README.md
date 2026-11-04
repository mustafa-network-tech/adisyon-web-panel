# MK Adisyon Web

Independent, multi-tenant restaurant operations platform by MK Digital
Systems. The Phase 1 repository contains the application foundation,
responsive product prototypes, PWA infrastructure and unapplied Supabase SQL
drafts.

## Current scope

- Next.js 16 App Router, React 19 and TypeScript
- Tailwind CSS 4 responsive design system
- Marketing, sign-in, table/POS, kitchen, cash register and settings screens
- MK Digital Systems platform administration prototype
- Installable PWA manifest, service worker and offline fallback
- Supabase browser/server client boundaries without live credentials
- Shared-schema multi-tenant PostgreSQL design and RLS policy drafts

No Supabase project has been linked, no migration has been run and nothing has
been deployed.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The demo workspace is available at:

```text
/app/demo-restoran/merkez/masalar
```

The UI works with local mock data. Supabase variables are not required for the
demo. When Phase 2 starts, copy `.env.example` to `.env.local` and use only a
new development Supabase project.

## Quality commands

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Repository map

```text
src/app                 Next.js routes and layouts
src/components          Shared application shell and brand UI
src/modules             Domain modules
src/lib                 Supabase boundaries, permissions and money helpers
supabase/migrations     Unapplied schema/RLS drafts
supabase/tests          Local pgTAP test drafts
docs/architecture       Technical decisions and module boundaries
docs/security           Tenant isolation and security model
docs/phase-2-plan.md    Approved-next-phase execution plan
```

## Safety rules

- Never reuse the Flutter application's database or credentials.
- Never commit `.env.local` or service-role credentials.
- Never expose the service-role key to browser code.
- Do not run remote migrations or deploy without explicit approval.
- Treat all financial mutations as transaction and idempotency boundaries.
