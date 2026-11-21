-- Migration: 20261121_new_rank_thresholds.sql
-- Automatically generated from src/lib/rankedSystem.ts - SINGLE SOURCE OF TRUTH
-- New thresholds: Bronze I 0 .. Grandmaster 33000
-- Soft reset rule: 2 tiers below, floored at 0, capped at Diamond IV (12,800 RP)

-- 1. Backup table before applying changes
create table if not exists public.profiles_rank_backup_20261121 as
select id, username, season_rp, season_base_rp, rank_title, current_rank, last_season_rank, last_reset_month, now() as backed_up_at
from public.profiles;

-- 2. Pure SQL function to evaluate Rank Tier from RP
create or replace function public.get_rank_tier_from_rp(p_rp integer)
returns text
language plpgsql
immutable
as $$
declare
  safe_rp integer := greatest(0, coalesce(p_rp, 0));
begin
  return case
    when p_rp >= 33000 then 'GRANDMASTER'
    when p_rp >= 23000 then 'MASTER'
    when p_rp >= 16500 then 'CHAMPION'
    when p_rp >= 12800 then 'DIAMOND IV'
    when p_rp >= 10400 then 'DIAMOND III'
    when p_rp >= 8200 then 'DIAMOND II'
    when p_rp >= 6800 then 'DIAMOND I'
    when p_rp >= 5600 then 'PLATINUM IV'
    when p_rp >= 4600 then 'PLATINUM III'
    when p_rp >= 3800 then 'PLATINUM II'
    when p_rp >= 3100 then 'PLATINUM I'
    when p_rp >= 2500 then 'GOLD IV'
    when p_rp >= 2000 then 'GOLD III'
    when p_rp >= 1600 then 'GOLD II'
    when p_rp >= 1250 then 'GOLD I'
    when p_rp >= 950 then 'SILVER IV'
    when p_rp >= 700 then 'SILVER III'
    when p_rp >= 500 then 'SILVER II'
    when p_rp >= 350 then 'SILVER I'
    when p_rp >= 220 then 'BRONZE IV'
    when p_rp >= 120 then 'BRONZE III'
    when p_rp >= 50 then 'BRONZE II'
    when p_rp >= 0 then 'BRONZE I'
    else 'BRONZE I'
  end;
end;
$$;

-- 3. Pure SQL function to evaluate Soft Reset starting RP and target tier from previous rank
create or replace function public.get_soft_reset_from_rank(p_rank text)
returns table(new_rp integer, new_rank text)
language plpgsql
immutable
as $$
begin
  if p_rank is null or trim(p_rank) = '' then
    return query select 0::integer, 'BRONZE I'::text;
    return;
  end if;

  case
    when upper(trim(p_rank)) in ('BRONZE I', 'BRONZE I', 'BRONZE') then
      return query select 0::integer, 'BRONZE I'::text;
    when upper(trim(p_rank)) in ('BRONZE II', 'BRONZE II', 'BRONZE') then
      return query select 0::integer, 'BRONZE I'::text;
    when upper(trim(p_rank)) in ('BRONZE III', 'BRONZE III', 'BRONZE') then
      return query select 0::integer, 'BRONZE I'::text;
    when upper(trim(p_rank)) in ('BRONZE IV', 'BRONZE IV', 'BRONZE') then
      return query select 50::integer, 'BRONZE II'::text;
    when upper(trim(p_rank)) in ('SILVER I', 'SILVER I', 'SILVER') then
      return query select 120::integer, 'BRONZE III'::text;
    when upper(trim(p_rank)) in ('SILVER II', 'SILVER II', 'SILVER') then
      return query select 220::integer, 'BRONZE IV'::text;
    when upper(trim(p_rank)) in ('SILVER III', 'SILVER III', 'SILVER') then
      return query select 350::integer, 'SILVER I'::text;
    when upper(trim(p_rank)) in ('SILVER IV', 'SILVER IV', 'SILVER') then
      return query select 500::integer, 'SILVER II'::text;
    when upper(trim(p_rank)) in ('GOLD I', 'GOLD I', 'GOLD') then
      return query select 700::integer, 'SILVER III'::text;
    when upper(trim(p_rank)) in ('GOLD II', 'GOLD II', 'GOLD') then
      return query select 950::integer, 'SILVER IV'::text;
    when upper(trim(p_rank)) in ('GOLD III', 'GOLD III', 'GOLD') then
      return query select 1250::integer, 'GOLD I'::text;
    when upper(trim(p_rank)) in ('GOLD IV', 'GOLD IV', 'GOLD') then
      return query select 1600::integer, 'GOLD II'::text;
    when upper(trim(p_rank)) in ('PLATINUM I', 'PLATINUM I', 'PLATINUM') then
      return query select 2000::integer, 'GOLD III'::text;
    when upper(trim(p_rank)) in ('PLATINUM II', 'PLATINUM II', 'PLATINUM') then
      return query select 2500::integer, 'GOLD IV'::text;
    when upper(trim(p_rank)) in ('PLATINUM III', 'PLATINUM III', 'PLATINUM') then
      return query select 3100::integer, 'PLATINUM I'::text;
    when upper(trim(p_rank)) in ('PLATINUM IV', 'PLATINUM IV', 'PLATINUM') then
      return query select 3800::integer, 'PLATINUM II'::text;
    when upper(trim(p_rank)) in ('DIAMOND I', 'DIAMOND I', 'DIAMOND') then
      return query select 4600::integer, 'PLATINUM III'::text;
    when upper(trim(p_rank)) in ('DIAMOND II', 'DIAMOND II', 'DIAMOND') then
      return query select 5600::integer, 'PLATINUM IV'::text;
    when upper(trim(p_rank)) in ('DIAMOND III', 'DIAMOND III', 'DIAMOND') then
      return query select 6800::integer, 'DIAMOND I'::text;
    when upper(trim(p_rank)) in ('DIAMOND IV', 'DIAMOND IV', 'DIAMOND') then
      return query select 8200::integer, 'DIAMOND II'::text;
    when upper(trim(p_rank)) in ('CHAMPION', 'CHAMPION', 'CHAMPION') then
      return query select 10400::integer, 'DIAMOND III'::text;
    when upper(trim(p_rank)) in ('MASTER', 'MASTER', 'MASTER') then
      return query select 12800::integer, 'DIAMOND IV'::text;
    when upper(trim(p_rank)) in ('GRANDMASTER', 'GRANDMASTER', 'GRANDMASTER') then
      return query select 12800::integer, 'DIAMOND IV'::text;
    else
      return query select 0::integer, 'BRONZE I'::text;
  end case;
end;
$$;

-- 4. Authoritative check_and_apply_season_reset RPC
create or replace function public.check_and_apply_season_reset()
returns jsonb
language plpgsql
security definer
as $$
declare
  current_user_id uuid;
  user_profile record;
  current_month text;
  current_month_name text;
  prev_month_seconds bigint := 0;
  start_of_curr_month timestamptz;
  start_of_prev_month timestamptz;
  prev_rp integer;
  prev_rank text;
  new_rank text;
  starting_rp integer;
  reset_rec record;
begin
  -- Resolve calling authenticated user
  current_user_id := auth.uid();
  if current_user_id is null then
    return jsonb_build_object('needs_reset', false, 'error', 'Not authenticated');
  end if;

  -- Get current user profile
  select * into user_profile from public.profiles where id = current_user_id;
  if not found then
    return jsonb_build_object('needs_reset', false, 'error', 'Profile not found');
  end if;

  current_month := to_char(now(), 'YYYY-MM');
  current_month_name := trim(to_char(now(), 'Month'));

  -- If user has no current_season_id or last_reset_month, initialize
  if user_profile.last_reset_month is null and user_profile.season_base_rp is null then
    update public.profiles
    set season_rp = coalesce(season_rp, 0),
        season_base_rp = coalesce(season_base_rp, 0),
        rank_title = coalesce(rank_title, 'BRONZE I'),
        current_rank = coalesce(current_rank, 'BRONZE I'),
        last_reset_month = current_month
    where id = current_user_id;
    return jsonb_build_object('needs_reset', false);
  end if;

  -- Idempotency guard: If already reset for current season, skip
  if user_profile.last_reset_month = current_month then
    return jsonb_build_object('needs_reset', false);
  end if;

  -- Calculate actual previous month focus seconds from study_sessions
  start_of_curr_month := date_trunc('month', now());
  start_of_prev_month := date_trunc('month', now() - interval '1 month');

  select coalesce(sum(duration_seconds), 0) into prev_month_seconds
  from public.study_sessions
  where user_id = current_user_id
    and started_at >= start_of_prev_month
    and started_at < start_of_curr_month;

  -- Inactive Decay: Users who logged 0 focus seconds in the expiring month decay to 0 RP (Bronze I)
  if prev_month_seconds = 0 then
    starting_rp := 0;
    new_rank := 'BRONZE I';
    prev_rp := coalesce(user_profile.season_rp, 0);
    prev_rank := coalesce(user_profile.rank_title, public.get_rank_tier_from_rp(prev_rp));
  else
    prev_rp := coalesce(user_profile.season_base_rp, 0) + floor(prev_month_seconds / 36);
    prev_rank := public.get_rank_tier_from_rp(prev_rp);
    
    -- Evaluate soft reset
    select r.new_rp, r.new_rank into reset_rec from public.get_soft_reset_from_rank(prev_rank) r;
    starting_rp := least(12800, greatest(0, reset_rec.new_rp));
    new_rank := reset_rec.new_rank;
  end if;

  -- Apply soft-reset mutations to profile
  update public.profiles
  set season_rp = starting_rp,
      season_base_rp = starting_rp,
      rank_title = new_rank,
      current_rank = new_rank,
      last_season_rank = prev_rank,
      last_reset_month = current_month
  where id = current_user_id;

  return jsonb_build_object(
    'needs_reset', true,
    'previous_rank', prev_rank,
    'new_rank', new_rank,
    'starting_rp', starting_rp,
    'month_name', current_month_name
  );
end;
$$;
