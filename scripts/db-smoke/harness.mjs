import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const MIGRATIONS = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/** In-memory Postgres with just enough of Supabase (auth schema, roles) to run the migrations. */
export async function createDatabase(upTo = 999) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create schema extensions;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create extension if not exists pgcrypto;
    create or replace function extensions.digest(data text, type text) returns bytea
      language sql immutable as $$ select public.digest(data, type) $$;
    create or replace function extensions.digest(data bytea, type text) returns bytea
      language sql immutable as $$ select public.digest(data, type) $$;
    create or replace function extensions.gen_random_bytes(n integer) returns bytea
      language sql volatile as $$ select public.gen_random_bytes(n) $$;
  `);
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (Number(file.slice(0, 4)) > upTo) break;
    try {
      await db.exec(fs.readFileSync(MIGRATIONS + file, "utf8"));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }
  return db;
}

export async function actAs(db, userId) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`);
}
