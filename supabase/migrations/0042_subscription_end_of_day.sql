-- MK Adisyon Web / 0042: a subscription or trial works until 23:59:59 of its last day (Europe/Istanbul)
--
-- Until now a business was locked at the exact instant stored in subscriptions.ends_at, which could be in
-- the middle of a service (open bills and the cash session could not be settled any more). The rule is now
-- the calendar day: a business whose subscription ends on 10 November works until 10 November 23:59:59
-- Turkish time and writes are blocked from 11 November 00:00:00 unless it was renewed. The same rule applies
-- to trials and paid subscriptions. There is no extra grace period; a renewal (new ends_at / status) opens
-- the business again immediately.
--
-- Everything that blocks writes (private.block_writes_when_read_only, the functions that call
-- tenant_is_writable) goes through this one function.
--
-- ROLLBACK: re-create private.tenant_is_writable with `subscription.ends_at > now()` (the 0031 body).

begin;

create or replace function private.tenant_is_writable(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select subscription.status in ('trial', 'active')
      and (
        subscription.ends_at is null
        or (subscription.ends_at at time zone 'Europe/Istanbul')::date
           >= (now() at time zone 'Europe/Istanbul')::date
      )
    from private.current_subscription(target_tenant_id) subscription
    where subscription.id is not null
  ), true);
$$;

commit;
