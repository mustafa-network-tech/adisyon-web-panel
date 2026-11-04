# Supabase database migrations

This directory contains the versioned PostgreSQL, RLS and Auth boundary design.

The first two migrations define the core multi-tenant schema and RLS policies.
`0003_phase2_auth_boundaries.sql` adds profile provisioning and the minimum
read boundary required by the protected platform dashboard.

Apply files in numeric order to the dedicated MK Adisyon WEB development
project. Do not run `seed.sql` against a hosted or production database.

After creating the first Auth user, bootstrap the platform administrator from
the Supabase SQL Editor by replacing the e-mail placeholder:

```sql
insert into public.platform_admins (user_id)
select id
from auth.users
where lower(email) = lower('ADMIN_EMAIL_HERE')
on conflict (user_id) do nothing;
```

Never put project credentials in this repository. Secret keys are server-only
and must never be exposed to browser code or use a `NEXT_PUBLIC_` prefix.
