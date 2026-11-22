-- ====================================================================
-- study.io: Rollback Migration for Session Overlap Protection
-- Date: 2026-11-22
-- ====================================================================

-- 1. Drop helper functions
drop function if exists public.calculate_session_overlap(uuid, uuid, timestamptz, timestamptz, int, text);
drop function if exists public.get_default_overlap_mode();

-- 2. Drop index
drop index if exists public.idx_study_sessions_user_overlap;

-- 3. Remove columns from study_sessions
alter table public.study_sessions
  drop column if exists credited_seconds,
  drop column if exists raw_seconds,
  drop column if exists overlap_seconds_removed,
  drop column if exists overlap_adjusted;

-- 4. Restore previous version of stop_session and start_session
-- (from 20261121_timer_server_authoritative.sql & 20261121_timer_session_created_at_and_save_on_start.sql)
