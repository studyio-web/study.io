-- ====================================================================
-- study.io: Rollback Timer session_created_at & Save-On-Start Migration
-- ====================================================================

-- 1. Restore previous start_session RPC definition
create or replace function public.start_session(
  p_session_id uuid,
  p_mode text,
  p_subject_id uuid default null,
  p_planned_duration_seconds int default null,
  p_is_ultra boolean default false,
  p_device_id text default null,
  p_client_ts timestamptz default null,
  p_event_id uuid default null
)
returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_skew int := 0;
  v_ultra_ends timestamptz := null;
  v_planned_end timestamptz := null;
  v_confirmed_until timestamptz;
  v_active record;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_event_id is not null then
    if exists (select 1 from public.processed_timer_events where event_id = p_event_id) then
      select * into v_active from public.active_sessions where user_id = v_uid;
      return to_jsonb(v_active);
    end if;
    insert into public.processed_timer_events (event_id, session_id, user_id, event_type)
    values (p_event_id, p_session_id, v_uid, 'start')
    on conflict (event_id) do nothing;
  end if;

  if p_client_ts is not null then
    v_skew := cast(extract(epoch from (v_now - p_client_ts)) * 1000 as int);
  end if;

  if p_is_ultra and p_planned_duration_seconds is not null and p_planned_duration_seconds > 0 then
    v_ultra_ends := v_now + (least(p_planned_duration_seconds, 86400) * interval '1 second');
    v_planned_end := v_ultra_ends;
  elsif p_planned_duration_seconds is not null and p_planned_duration_seconds > 0 then
    v_planned_end := v_now + (least(p_planned_duration_seconds, 86400) * interval '1 second');
  end if;

  if p_mode = 'stopwatch' then
    v_confirmed_until := v_now + interval '12 hours';
  else
    v_confirmed_until := null;
  end if;

  insert into public.active_sessions (
    user_id,
    session_id,
    status,
    mode,
    subject_id,
    started_at,
    accumulated_seconds,
    accumulated_ms,
    pomodoro_duration_seconds,
    planned_end_at,
    is_ultra,
    ultra_ends_at,
    confirmed_until,
    device_id,
    version,
    client_skew_ms,
    updated_at
  ) values (
    v_uid,
    p_session_id,
    'running',
    p_mode,
    p_subject_id,
    v_now,
    0,
    0,
    p_planned_duration_seconds,
    v_planned_end,
    p_is_ultra,
    v_ultra_ends,
    v_confirmed_until,
    p_device_id,
    1,
    v_skew,
    v_now
  )
  on conflict (user_id) do update set
    session_id = p_session_id,
    status = 'running',
    mode = p_mode,
    subject_id = p_subject_id,
    started_at = v_now,
    accumulated_seconds = 0,
    accumulated_ms = 0,
    pomodoro_duration_seconds = p_planned_duration_seconds,
    planned_end_at = v_planned_end,
    is_ultra = p_is_ultra,
    ultra_ends_at = v_ultra_ends,
    confirmed_until = v_confirmed_until,
    device_id = p_device_id,
    version = 1,
    client_skew_ms = v_skew,
    last_paused_at = null,
    updated_at = v_now
  returning * into v_active;

  return to_jsonb(v_active);
end;
$$ language plpgsql security definer;

-- 2. Drop session_created_at column
alter table public.active_sessions
  drop column if exists session_created_at;
