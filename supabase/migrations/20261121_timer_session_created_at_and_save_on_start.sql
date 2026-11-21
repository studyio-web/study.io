-- ====================================================================
-- study.io: Timer session_created_at & Atomic Save-On-Start Migration
-- Date: 2026-11-21
-- Description:
--   1. Adds session_created_at column to public.active_sessions.
--   2. Backfills session_created_at safely for existing active sessions
--      (started_at / last_paused_at minus accumulated time).
--   3. Sets not-null and default now().
--   4. Replaces start_session RPC:
--      - If active session is Ultra Strict & locked, rejects with ULTRA_LOCKED.
--      - Idempotent: duplicate start calls with same session_id return existing session.
--      - No silent discard: saves existing running/paused session with > 0 focus
--        seconds (with 12h stopwatch clip) before starting the new session.
--      - Discards cleanly if 0 focus seconds.
-- ====================================================================

-- 1. Add session_created_at column if not exists
alter table public.active_sessions
  add column if not exists session_created_at timestamptz;

-- 2. Backfill existing active sessions from started_at / last_paused_at minus accumulated duration
update public.active_sessions
set session_created_at = coalesce(
  started_at,
  last_paused_at,
  updated_at,
  now()
) - (coalesce(accumulated_seconds, 0) * interval '1 second') - (coalesce(accumulated_ms, 0) * interval '1 millisecond')
where session_created_at is null;

-- 3. Enforce default and not-null constraint
alter table public.active_sessions
  alter column session_created_at set default now(),
  alter column session_created_at set not null;

-- 4. Replace start_session RPC with atomic save-on-start and idempotency
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
  v_active record;
  v_prev_duration int := 0;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_saved_prev_session jsonb := null;
  v_skew int := 0;
  v_confirmed_until timestamptz := null;
  v_planned_end timestamptz := null;
  v_ultra_ends timestamptz := null;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 1. Event deduplication via processed_timer_events
  if p_event_id is not null then
    if exists (select 1 from public.processed_timer_events where event_id = p_event_id) then
      select * into v_active from public.active_sessions where user_id = v_uid;
      return to_jsonb(v_active) || jsonb_build_object('success', true, 'is_duplicate', true);
    end if;
    insert into public.processed_timer_events (event_id, session_id, user_id, event_type)
    values (p_event_id, p_session_id, v_uid, 'start')
    on conflict (event_id) do nothing;
  end if;

  -- 2. Inspect existing active session
  select * into v_active from public.active_sessions where user_id = v_uid;
  if found then
    -- A. Idempotency: Calling start twice with the same session_id returns existing session
    if v_active.session_id = p_session_id then
      return to_jsonb(v_active) || jsonb_build_object('success', true, 'is_duplicate', true);
    end if;

    -- B. Ultra Strict invariant: Reject start if existing Ultra session is currently sealed
    if v_active.is_ultra and v_active.ultra_ends_at is not null and v_now < v_active.ultra_ends_at then
      raise exception 'ULTRA_LOCKED';
    end if;

    -- C. No Silent Discard: Save running/paused non-Ultra session with > 0 focus seconds
    if v_active.status in ('running', 'paused') then
      if v_active.status = 'running' and v_active.started_at is not null then
        v_prev_duration := coalesce(v_active.accumulated_seconds, 0) + cast(extract(epoch from (v_now - v_active.started_at)) as int);
        v_prev_end := v_now;
      else
        v_prev_duration := coalesce(v_active.accumulated_seconds, 0);
        v_prev_end := coalesce(v_active.last_paused_at, v_now);
      end if;

      -- Apply 12h stopwatch limit clipping or countdown limits
      if v_active.mode = 'stopwatch' and v_active.planned_end_at is null then
        if v_active.confirmed_until is not null and v_active.confirmed_until > (coalesce(v_active.started_at, v_now) + interval '12 hours') then
          declare
            v_max_sec int := cast(extract(epoch from (v_active.confirmed_until - coalesce(v_active.started_at, v_prev_end - (v_prev_duration * interval '1 second')))) as int);
          begin
            v_prev_duration := least(v_prev_duration, least(v_max_sec, 86400));
          end;
        else
          v_prev_duration := least(v_prev_duration, 43200); -- 12h unconfirmed cap
        end if;
      elsif (v_active.mode in ('countdown', 'pomodoro') or v_active.planned_end_at is not null) then
        declare
          v_planned_sec int := 0;
        begin
          if v_active.planned_end_at is not null and v_active.started_at is not null then
            v_planned_sec := cast(extract(epoch from (v_active.planned_end_at - v_active.started_at)) as int);
          elsif v_active.pomodoro_duration_seconds is not null then
            v_planned_sec := v_active.pomodoro_duration_seconds;
          end if;
          v_planned_sec := least(v_planned_sec, 90000);
          if v_planned_sec > 0 then
            v_prev_duration := least(v_prev_duration, v_planned_sec);
          end if;
        end;
      end if;

      -- Save prior session if > 0 focus seconds
      if v_prev_duration > 0 and v_active.session_id is not null then
        v_prev_start := v_prev_end - (v_prev_duration * interval '1 second');

        insert into public.study_sessions (
          user_id,
          session_id,
          subject_id,
          duration_seconds,
          started_at,
          ended_at,
          mode,
          offline_synced,
          client_skew_ms
        ) values (
          v_uid,
          v_active.session_id,
          v_active.subject_id,
          v_prev_duration,
          v_prev_start,
          v_prev_end,
          coalesce(v_active.mode, 'stopwatch'),
          false,
          0
        )
        on conflict (session_id) do update set
          duration_seconds = v_prev_duration;

        v_saved_prev_session := jsonb_build_object(
          'session_id', v_active.session_id,
          'duration_seconds', v_prev_duration,
          'started_at', v_prev_start,
          'ended_at', v_prev_end,
          'mode', v_active.mode
        );
      end if;
    end if;
  end if;

  if p_client_ts is not null then
    v_skew := cast(extract(epoch from (v_now - p_client_ts)) * 1000 as int);
  end if;

  -- 3. Calculate boundary timestamps for new session
  if p_mode = 'stopwatch' then
    v_confirmed_until := v_now + interval '12 hours';
  elsif p_mode in ('countdown', 'pomodoro') and p_planned_duration_seconds is not null then
    v_planned_end := v_now + (least(p_planned_duration_seconds, 86400) * interval '1 second');
    if p_is_ultra then
      v_ultra_ends := v_planned_end;
    end if;
  end if;

  -- Allow resetting ultra lock when starting a valid new session
  perform set_config('app.admin_override', 'true', true);

  -- 4. Authoritatively insert or overwrite active session
  insert into public.active_sessions (
    user_id,
    session_id,
    session_created_at,
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
    last_paused_at,
    updated_at
  ) values (
    v_uid,
    p_session_id,
    v_now,
    'running',
    p_mode,
    p_subject_id,
    v_now,
    0,
    0,
    case when p_mode in ('countdown', 'pomodoro') then least(coalesce(p_planned_duration_seconds, 0), 86400) else null end,
    v_planned_end,
    coalesce(p_is_ultra, false),
    v_ultra_ends,
    v_confirmed_until,
    p_device_id,
    1,
    v_skew,
    null,
    v_now
  )
  on conflict (user_id) do update set
    session_id = p_session_id,
    session_created_at = v_now,
    status = 'running',
    mode = p_mode,
    subject_id = p_subject_id,
    started_at = v_now,
    accumulated_seconds = 0,
    accumulated_ms = 0,
    pomodoro_duration_seconds = case when p_mode in ('countdown', 'pomodoro') then least(coalesce(p_planned_duration_seconds, 0), 86400) else null end,
    planned_end_at = v_planned_end,
    is_ultra = coalesce(p_is_ultra, false),
    ultra_ends_at = v_ultra_ends,
    confirmed_until = v_confirmed_until,
    device_id = coalesce(p_device_id, public.active_sessions.device_id),
    version = 1,
    client_skew_ms = v_skew,
    last_paused_at = null,
    updated_at = v_now
  returning * into v_active;

  return to_jsonb(v_active) || jsonb_build_object(
    'success', true,
    'previous_session_saved', v_saved_prev_session
  );
end;
$$ language plpgsql security definer;

grant execute on function public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid) to authenticated, service_role;
revoke execute on function public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid) from public, anon;
