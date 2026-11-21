import fs from 'fs';
import path from 'path';
import { RANK_TIERS, HARD_RESET_CAP_RP } from '../src/lib/rankedSystem';

function generateSql(): { upSql: string; downSql: string } {
  // Sort descending by minRP for the get_rank_tier_from_rp SQL function
  const descTiers = [...RANK_TIERS].sort((a, b) => b.minRP - a.minRP);

  // Build CASE branches for get_rank_tier_from_rp
  const getRankCases = descTiers
    .map((t) => `    when p_rp >= ${t.minRP} then '${t.fullTitle}'`)
    .join('\n');

  // Build CASE branches for soft reset from rank
  const softResetCases = RANK_TIERS.map((t) => {
    const cleanUpper = t.fullTitle.toUpperCase();
    const cleanLower = t.fullTitle.toLowerCase();
    const cleanName = (t.division ? `${t.tier} ${t.division}` : t.tier).toUpperCase();
    return `    when upper(trim(p_rank)) in ('${cleanUpper}', '${cleanName}', '${t.tier.toUpperCase()}') then
      return query select ${t.softResetRP}::integer, '${t.softResetRank}'::text;`;
  }).join('\n');

  const upSql = `-- Migration: 20261121_new_rank_thresholds.sql
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
${getRankCases}
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
${softResetCases}
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
    starting_rp := least(${HARD_RESET_CAP_RP}, greatest(0, reset_rec.new_rp));
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
`;

  const downSql = `-- Rollback Migration: 20261121_new_rank_thresholds_down.sql
-- Restores database state from profiles_rank_backup_20261121 and cleans up new functions

-- 1. Restore profiles data if backup table exists
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'profiles_rank_backup_20261121') then
    update public.profiles p
    set season_rp = b.season_rp,
        season_base_rp = b.season_base_rp,
        rank_title = b.rank_title,
        current_rank = b.current_rank,
        last_season_rank = b.last_season_rank,
        last_reset_month = b.last_reset_month
    from public.profiles_rank_backup_20261121 b
    where p.id = b.id;

    drop table public.profiles_rank_backup_20261121;
  end if;
end $$;

-- 2. Drop generated functions
drop function if exists public.get_soft_reset_from_rank(text);
drop function if exists public.get_rank_tier_from_rp(integer);

-- 3. Restore previous check_and_apply_season_reset function if needed
`;

  return { upSql, downSql };
}

function main() {
  const { upSql, downSql } = generateSql();
  const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }

  const upPath = path.join(migrationsDir, '20261121_new_rank_thresholds.sql');
  const downPath = path.join(migrationsDir, '20261121_new_rank_thresholds_down.sql');

  fs.writeFileSync(upPath, upSql, 'utf8');
  fs.writeFileSync(downPath, downSql, 'utf8');
  console.log(`Generated SQL migrations:`);
  console.log(`  Up:   ${upPath}`);
  console.log(`  Down: ${downPath}`);
}

main();
