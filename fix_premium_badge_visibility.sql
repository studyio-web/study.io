-- ====================================================================
-- study.io: Fix Verified Premium Scholar Badge Visibility & Expiration
-- Run this in your Supabase Dashboard > SQL Editor > New query
-- ====================================================================

-- 1. Ensure public read policy on subscriptions strictly filters out expired subscriptions.
-- If premium_until is set, it MUST be in the future.
drop policy if exists "allow public read active subscriptions" on public.subscriptions;
create policy "allow public read active subscriptions" on public.subscriptions
  for select using (
    (premium_until is not null and premium_until > now()) 
    or (premium_until is null and status in ('active', 'trialing'))
  );

-- 2. Drop overloaded get_flair functions to prevent PostgREST PGRST203 ambiguity errors
drop function if exists public.get_flair(uuid[]);
drop function if exists public.get_flair(text[]);

-- 3. Create a single, unambiguous get_flair RPC that accepts text[] (castable to uuid)
-- and strictly checks that premium_until is in the future.
create or replace function public.get_flair(p_user_ids text[])
returns table (user_id uuid, frame text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select
    s.user_id,
    'gold'::text as frame
  from unnest(p_user_ids) as uid_text
  join public.subscriptions s on s.user_id::text = uid_text
  where (
    (s.premium_until is not null and s.premium_until > now())
    or (s.premium_until is null and s.status in ('active', 'trialing'))
  );
end;
$$;

-- 4. Grant execute permissions to both authenticated and anonymous users
revoke all on function public.get_flair(text[]) from public;
grant execute on function public.get_flair(text[]) to authenticated, anon;

-- 5. Mark all past-due / expired subscriptions as 'expired' in public.subscriptions
update public.subscriptions
set status = 'expired',
    updated_at = now()
where premium_until is not null
  and premium_until <= now()
  and status in ('active', 'trialing');

-- 6. Verification: Check subscriptions and active status for scholars
select
  p.id,
  p.username,
  p.name,
  s.status as subscription_status,
  s.premium_until,
  (
    (s.premium_until is not null and s.premium_until > now())
    or (s.premium_until is null and s.status in ('active', 'trialing'))
  ) as is_verified_premium
from public.profiles p
left join public.subscriptions s on s.user_id = p.id
where p.username in ('trial', 'ebin', 'wren') or lower(p.name) in ('trial', 'ebin', 'wren');
