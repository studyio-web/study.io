-- ====================================================================
-- study.io: Server-Authoritative Timer & Ultra Strict DOWN Migration
-- Reverses 20261121_timer_server_authoritative.sql
-- ====================================================================

-- Drop trigger and trigger function
drop trigger if exists trg_active_sessions_ultra_guard on public.active_sessions;
drop function if exists public.check_ultra_lock_mutation();

-- Drop RPCs
drop function if exists public.cleanup_stale_active_sessions();
drop function if exists public.admin_release_ultra_lock(uuid);
drop function if exists public.confirm_still_studying(uuid, text);
drop function if exists public.stop_session(uuid, int, text, timestamptz, uuid, boolean);
drop function if exists public.stop_session(uuid, int, text, timestamptz, uuid);
drop function if exists public.resume_session(uuid, int, text, timestamptz, uuid);
drop function if exists public.pause_session(uuid, int, text, timestamptz, uuid);
drop function if exists public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid);
drop function if exists public.get_server_time();

-- Restore mutations permissions on tables
grant insert, update, delete on public.active_sessions to authenticated, anon;
grant insert, update, delete on public.study_sessions to authenticated, anon;

-- Restore previous stop_session & pause_session signatures if needed
create or replace function public.pause_session(p_device_id text)
returns void as $$
begin
  update public.active_sessions
  set accumulated_seconds = accumulated_seconds + 
        extract(epoch from (now() - started_at))::int,
      status = 'paused',
      started_at = null,
      device_id = p_device_id
  where user_id = auth.uid() and status = 'running';
end;
$$ language plpgsql security definer;

create or replace function public.stop_session(p_device_id text)
returns int as $$
declare
  final_seconds int;
begin
  update public.active_sessions
  set accumulated_seconds = accumulated_seconds + 
        coalesce(extract(epoch from (now() - started_at))::int, 0),
      status = 'stopped',
      started_at = null,
      device_id = p_device_id
  where user_id = auth.uid() and status in ('running', 'paused')
  returning accumulated_seconds into final_seconds;

  update public.active_sessions
  set status = 'idle', accumulated_seconds = 0, subject_id = null
  where user_id = auth.uid();

  return final_seconds;
end;
$$ language plpgsql security definer;

-- Drop event tracking table
drop table if exists public.processed_timer_events;

-- Drop constraint from study_sessions
alter table public.study_sessions drop constraint if exists uq_study_sessions_session_id;

-- Drop newly added columns from study_sessions
alter table public.study_sessions 
  drop column if exists session_id,
  drop column if exists offline_synced,
  drop column if exists client_skew_ms;

-- Drop newly added columns from active_sessions
alter table public.active_sessions 
  drop column if exists session_id,
  drop column if exists version,
  drop column if exists planned_end_at,
  drop column if exists is_ultra,
  drop column if exists ultra_ends_at,
  drop column if exists confirmed_until,
  drop column if exists accumulated_ms,
  drop column if exists last_paused_at,
  drop column if exists client_skew_ms;
