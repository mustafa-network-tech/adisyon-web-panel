# Supabase database drafts

This directory contains the versioned Phase 1 PostgreSQL and RLS design.

Status: **not applied**. No local or remote Supabase project was initialized,
linked or migrated during Phase 1.

Before first execution in Phase 2:

1. Install Docker Desktop and the Supabase CLI.
2. Initialize a local-only Supabase project.
3. Review enum and foreign-key choices with product requirements.
4. Run migrations only against the local database.
5. Expand and pass pgTAP tenant isolation tests.
6. Generate TypeScript database types from the verified local schema.

Never use production credentials in this repository. The service-role key is
server-only and must not be exposed to browser code.
