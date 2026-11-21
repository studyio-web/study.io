-- Rollback Migration: 20261121_new_rank_thresholds_down.sql
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
