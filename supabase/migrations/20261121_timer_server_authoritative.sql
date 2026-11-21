-- ====================================================================
-- study.io: Server-Authoritative Timer & Ultra Strict Migration
-- Date: 2026-11-21
-- Description:
--   1. Backs up active_sessions and study_sessions tables safely.
--   2. Adds versioning, session_id, ultra locks, and confirmed_until columns.
--   3. Implements server-authoritative start_session, pause_session,
--      resume_session, stop_session, and confirm_still_studying RPCs.
--   4. Enforces Ultra Strict locks server-side with ULTRA_LOCKED error.
--   5. Capps stopwatch sessions at 12h without confirmation, 24h absolute max.
--   6. Ensures strict idempotency via session_id and event_id deduplication.
-- ====================================================================

-- 1. Create table backups before making any modifications
create table if not exists public.backup_active_sessions_20261121 as 
select * from public.active_sessions;

create table if not exists public.backup_study_sessions_20261121 as 
select * from public.study_sessions;

-- 2. Extend active_sessions with versioning, ultra locks, and millisecond tracking
alter table public.active_sessions 
  add column if not exists session_id uuid default gen_random_uuid() not null,
  add column if not exists version int not null default 1,
  add column if not exists planned_end_at timestamptz,
  add column if not exists is_ultra boolean not null default false,
  add column if not exists ultra_ends_at timestamptz,
  add column if not exists confirmed_until timestamptz,
  add column if not exists accumulated_ms bigint not null default 0,
  add column if not exists last_paused_at timestamptz,
  add column if not exists client_skew_ms int not null default 0;

-- Ensure session_id index on active_sessions
create index if not exists idx_active_sessions_session_id on public.active_sessions(session_id);

-- 3. Extend study_sessions with session_id idempotency constraint & audit columns
alter table public.study_sessions 
  add column if not exists session_id uuid,
  add column if not exists offline_synced boolean not null default false,
  add column if not exists client_skew_ms int not null default 0;

-- Unique constraint on session_id to guarantee idempotency (prevent double counting)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_study_sessions_session_id'
  ) then
    alter table public.study_sessions add constraint uq_study_sessions_session_id unique (session_id);
  end if;
end $$;

-- 4. Processed events table for client outbox deduplication
create table if not exists public.processed_timer_events (
  event_id uuid primary key,
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_processed_events_user on public.processed_timer_events(user_id, session_id);

-- Enable RLS on processed_timer_events
alter table public.processed_timer_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view their own processed timer events') then
    create policy "Users can view their own processed timer events"
      on public.processed_timer_events for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can insert their own processed timer events') then
    create policy "Users can insert their own processed timer events"
      on public.processed_timer_events for insert with check (auth.uid() = user_id);
  end if;
end $$;

-- 5. Helper function: Get server time
create or replace function public.get_server_time()
returns timestamptz as $$
begin
  return now();
end;
$$ language plpgsql stable security definer;

-- 6. RPC: start_session
-- Server-authoritative session initialization
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

  -- Event deduplication
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

  -- Default 12 hours confirmed_until window ONLY for open-ended stopwatch sessions.
  -- For countdown, pomodoro and Ultra, leave it null and use planned_end_at as the limit.
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

-- 7. RPC: pause_session
-- Enforces Ultra Strict block and versioning
create or replace function public.pause_session(
  p_session_id uuid,
  p_expected_version int,
  p_device_id text default null,
  p_client_ts timestamptz default null,
  p_event_id uuid default null
)
returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_active record;
  v_additional_ms bigint := 0;
  v_rem_seconds int := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Event deduplication
  if p_event_id is not null then
    if exists (select 1 from public.processed_timer_events where event_id = p_event_id) then
      select * into v_active from public.active_sessions where user_id = v_uid;
      return to_jsonb(v_active);
    end if;
    insert into public.processed_timer_events (event_id, session_id, user_id, event_type)
    values (p_event_id, p_session_id, v_uid, 'pause')
    on conflict (event_id) do nothing;
  end if;

  select * into v_active from public.active_sessions where user_id = v_uid;
  if not found or v_active.status != 'running' then
    return to_jsonb(v_active);
  end if;

  -- Verify version to prevent race conditions across multiple devices
  if v_active.version != p_expected_version then
    return jsonb_build_object(
      'error', 'VERSION_CONFLICT',
      'current_version', v_active.version,
      'status', v_active.status,
      'session', to_jsonb(v_active)
    );
  end if;

  -- ENFORCE ULTRA STRICT SERVER-SIDE
  if v_active.is_ultra and v_active.ultra_ends_at is not null and v_now < v_active.ultra_ends_at then
    v_rem_seconds := cast(extract(epoch from (v_active.ultra_ends_at - v_now)) as int);
    return jsonb_build_object(
      'error', 'ULTRA_LOCKED',
      'message', 'Ultra Strict mode is sealed and cannot be paused.',
      'remaining_seconds', v_rem_seconds,
      'ultra_ends_at', v_active.ultra_ends_at
    );
  end if;

  if v_active.started_at is not null then
    v_additional_ms := cast(extract(epoch from (v_now - v_active.started_at)) * 1000 as bigint);
  end if;

  update public.active_sessions set
    accumulated_ms = accumulated_ms + v_additional_ms,
    accumulated_seconds = cast((accumulated_ms + v_additional_ms) / 1000 as int),
    status = 'paused',
    started_at = null,
    last_paused_at = v_now,
    version = version + 1,
    device_id = coalesce(p_device_id, device_id),
    updated_at = v_now
  where user_id = v_uid
  returning * into v_active;

  return to_jsonb(v_active);
end;
$$ language plpgsql security definer;

-- 8. RPC: resume_session
create or replace function public.resume_session(
  p_session_id uuid,
  p_expected_version int,
  p_device_id text default null,
  p_client_ts timestamptz default null,
  p_event_id uuid default null
)
returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_active record;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- Event deduplication
  if p_event_id is not null then
    if exists (select 1 from public.processed_timer_events where event_id = p_event_id) then
      select * into v_active from public.active_sessions where user_id = v_uid;
      return to_jsonb(v_active);
    end if;
    insert into public.processed_timer_events (event_id, session_id, user_id, event_type)
    values (p_event_id, p_session_id, v_uid, 'resume')
    on conflict (event_id) do nothing;
  end if;

  select * into v_active from public.active_sessions where user_id = v_uid;
  if not found or v_active.status != 'paused' then
    return to_jsonb(v_active);
  end if;

  -- Auto-close session if paused for more than 24 hours
  if v_active.last_paused_at is not null and (v_now - v_active.last_paused_at) > interval '24 hours' then
    if coalesce(v_active.accumulated_seconds, 0) > 0 then
      insert into public.study_sessions (
        user_id,
        session_id,
        subject_id,
        duration_seconds,
        started_at,
        ended_at,
        mode,
        offline_synced
      ) values (
        v_uid,
        v_active.session_id,
        v_active.subject_id,
        v_active.accumulated_seconds,
        coalesce(v_active.last_paused_at - (v_active.accumulated_seconds * interval '1 second'), v_now),
        v_active.last_paused_at,
        coalesce(v_active.mode, 'stopwatch'),
        false
      )
      on conflict (session_id) do update set
        duration_seconds = v_active.accumulated_seconds;
    end if;

    update public.active_sessions set
      status = 'idle',
      started_at = null,
      accumulated_seconds = 0,
      accumulated_ms = 0,
      version = version + 1,
      updated_at = v_now
    where user_id = v_uid;

    return jsonb_build_object(
      'error', 'PAUSED_EXPIRED',
      'message', 'Session was automatically closed after 24 hours of inactivity.'
    );
  end if;

  -- Check version
  if v_active.version != p_expected_version then
    return jsonb_build_object(
      'error', 'VERSION_CONFLICT',
      'current_version', v_active.version,
      'status', v_active.status,
      'session', to_jsonb(v_active)
    );
  end if;

  update public.active_sessions set
    status = 'running',
    started_at = v_now,
    last_paused_at = null,
    version = version + 1,
    device_id = coalesce(p_device_id, device_id),
    updated_at = v_now
  where user_id = v_uid
  returning * into v_active;

  return to_jsonb(v_active);
end;
$$ language plpgsql security definer;

-- 9. RPC: stop_session
-- Authoritative calculation, Ultra Strict check, version check, offline stops, 12h confirm clipping, and idempotency
create or replace function public.stop_session(
  p_session_id uuid,
  p_expected_version int default null,
  p_device_id text default null,
  p_client_ts timestamptz default null,
  p_event_id uuid default null,
  p_is_offline_sync boolean default false
)
returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_active record;
  v_existing record;
  v_additional_ms bigint := 0;
  v_total_ms bigint := 0;
  v_final_seconds int := 0;
  v_rem_seconds int := 0;
  v_effective_start timestamptz;
  v_effective_end timestamptz := v_now;
  v_saved_id uuid := null;
  v_offline_synced boolean := false;
  v_skew int := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 1. Idempotency Check: If already recorded in study_sessions with this session_id, return it immediately
  select * into v_existing from public.study_sessions where session_id = p_session_id;
  if found then
    return jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'duration_seconds', v_existing.duration_seconds,
      'session_id', v_existing.session_id,
      'id', v_existing.id
    );
  end if;

  -- Deduplicate event_id
  if p_event_id is not null then
    insert into public.processed_timer_events (event_id, session_id, user_id, event_type)
    values (p_event_id, p_session_id, v_uid, 'stop')
    on conflict (event_id) do nothing;
  end if;

  select * into v_active from public.active_sessions where user_id = v_uid;
  if not found or v_active.status = 'idle' then
    return jsonb_build_object('success', true, 'duration_seconds', 0);
  end if;

  -- Verify expected_version if provided
  if p_expected_version is not null and v_active.version != p_expected_version then
    return jsonb_build_object(
      'error', 'VERSION_CONFLICT',
      'current_version', v_active.version,
      'status', v_active.status,
      'session', to_jsonb(v_active)
    );
  end if;

  -- ENFORCE ULTRA STRICT SERVER-SIDE
  if v_active.is_ultra and v_active.ultra_ends_at is not null and v_now < v_active.ultra_ends_at then
    v_rem_seconds := cast(extract(epoch from (v_active.ultra_ends_at - v_now)) as int);
    return jsonb_build_object(
      'error', 'ULTRA_LOCKED',
      'message', 'Ultra Strict mode is sealed until the countdown finishes.',
      'remaining_seconds', v_rem_seconds,
      'ultra_ends_at', v_active.ultra_ends_at
    );
  end if;

  if p_client_ts is not null then
    v_skew := cast(extract(epoch from (v_now - p_client_ts)) * 1000 as int);
  end if;

  -- Offline stops: clamp client stop time to [started_at / last_paused_at, now()]
  if p_is_offline_sync or (p_client_ts is not null and p_client_ts < (v_now - interval '30 seconds')) then
    v_offline_synced := true;
    v_effective_end := greatest(
      coalesce(v_active.started_at, v_active.last_paused_at, v_active.updated_at, v_now),
      least(v_now, coalesce(p_client_ts, v_now))
    );
    if v_active.status = 'running' and v_active.started_at is not null then
      v_additional_ms := cast(extract(epoch from (v_effective_end - v_active.started_at)) * 1000 as bigint);
      v_total_ms := coalesce(v_active.accumulated_ms, 0) + v_additional_ms;
    else
      v_total_ms := coalesce(v_active.accumulated_ms, 0);
    end if;
  else
    -- Standard real-time stop
    v_effective_end := v_now;
    v_total_ms := coalesce(v_active.accumulated_ms, 0);
    if v_active.status = 'running' and v_active.started_at is not null then
      v_additional_ms := cast(extract(epoch from (v_now - v_active.started_at)) * 1000 as bigint);
      v_total_ms := v_total_ms + v_additional_ms;
    end if;
  end if;

  v_final_seconds := cast(v_total_ms / 1000 as int);

  -- Paused session auto-close: if paused for >= 24 hours, credit accumulated time up to pause point
  if v_active.status = 'paused' and v_active.last_paused_at is not null and (v_now - v_active.last_paused_at) >= interval '24 hours' then
    v_effective_end := v_active.last_paused_at;
    v_final_seconds := cast(coalesce(v_active.accumulated_ms, 0) / 1000 as int);
  end if;

  -- 12-Hour Stopwatch limit clipping:
  -- Applies ONLY to open-ended stopwatch sessions.
  -- If stopwatch has not been confirmed past 12h, clip maximum creditable duration to 12 hours (43,200s).
  -- If confirmed, clip at confirmed_until up to absolute 24 hours (86,400s).
  if v_active.mode = 'stopwatch' and v_active.planned_end_at is null then
    if v_active.confirmed_until is not null and v_active.confirmed_until > (coalesce(v_active.started_at, v_now) + interval '12 hours') then
      declare
        v_max_allowable_sec int;
      begin
        v_max_allowable_sec := cast(extract(epoch from (v_active.confirmed_until - coalesce(v_active.started_at, v_now - (v_final_seconds * interval '1 second')))) as int);
        v_max_allowable_sec := least(v_max_allowable_sec, 86400); -- Absolute 24h cap
        v_final_seconds := least(v_final_seconds, v_max_allowable_sec);
      end;
    else
      v_final_seconds := least(v_final_seconds, 43200); -- 12h unconfirmed cap
    end if;
  elsif (v_active.mode in ('countdown', 'pomodoro') or v_active.planned_end_at is not null) then
    -- For countdown, Pomodoro, and Ultra:
    -- The credited time is min(elapsed, planned_end_at - started_at), NEVER clipped by the 12h rule.
    declare
      v_planned_duration int := 0;
    begin
      if v_active.planned_end_at is not null and v_active.started_at is not null then
        v_planned_duration := cast(extract(epoch from (v_active.planned_end_at - v_active.started_at)) as int);
      elsif v_active.pomodoro_duration_seconds is not null then
        v_planned_duration := v_active.pomodoro_duration_seconds;
      end if;

      -- Allow extensions (+5m added time / snooze) up to separate maximum: 25 hours (90,000s)
      v_planned_duration := least(v_planned_duration, 90000);

      if v_planned_duration > 0 then
        v_final_seconds := least(v_final_seconds, v_planned_duration);
      end if;
    end;
  end if;

  -- Compute reconstructed start time based on authoritative duration
  v_effective_start := v_effective_end - (v_final_seconds * interval '1 second');

  -- Insert completed session record if duration > 0
  if v_final_seconds > 0 then
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
      p_session_id,
      v_active.subject_id,
      v_final_seconds,
      v_effective_start,
      v_effective_end,
      coalesce(v_active.mode, 'stopwatch'),
      v_offline_synced,
      v_skew
    )
    on conflict (session_id) do update set
      duration_seconds = v_final_seconds,
      offline_synced = v_offline_synced,
      client_skew_ms = v_skew
    returning id into v_saved_id;
  end if;

  -- Allow resetting ultra lock on valid completion/stop
  perform set_config('app.admin_override', 'true', true);

  -- Reset active session back to idle
  update public.active_sessions set
    status = 'idle',
    started_at = null,
    accumulated_seconds = 0,
    accumulated_ms = 0,
    is_ultra = false,
    ultra_ends_at = null,
    planned_end_at = null,
    confirmed_until = null,
    last_paused_at = null,
    version = version + 1,
    device_id = coalesce(p_device_id, device_id),
    updated_at = v_now
  where user_id = v_uid;

  return jsonb_build_object(
    'success', true,
    'duration_seconds', v_final_seconds,
    'session_id', p_session_id,
    'offline_synced', v_offline_synced,
    'id', v_saved_id
  );
end;
$$ language plpgsql security definer;

-- 10. RPC: confirm_still_studying
-- Extends the 12-hour session check for an active stopwatch session
create or replace function public.confirm_still_studying(
  p_session_id uuid,
  p_device_id text default null
)
returns jsonb as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_active record;
  v_new_confirmed timestamptz;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select * into v_active from public.active_sessions where user_id = v_uid and session_id = p_session_id;
  if not found then
    return jsonb_build_object('error', 'SESSION_NOT_FOUND');
  end if;

  -- "Still studying?" check applies strictly and exclusively to open-ended stopwatch sessions
  if v_active.mode != 'stopwatch' or v_active.planned_end_at is not null then
    return jsonb_build_object(
      'error', 'INVALID_MODE',
      'message', 'Still studying confirmation applies only to open-ended stopwatch sessions.'
    );
  end if;

  -- Extend by 12 hours from now, capped at 24 hours absolute from original start
  v_new_confirmed := least(
    v_now + interval '12 hours',
    coalesce(v_active.started_at, v_now) + interval '24 hours'
  );

  update public.active_sessions set
    confirmed_until = v_new_confirmed,
    version = version + 1,
    device_id = coalesce(p_device_id, device_id),
    updated_at = v_now
  where user_id = v_uid and session_id = p_session_id
  returning * into v_active;

  return jsonb_build_object(
    'success', true,
    'confirmed_until', v_new_confirmed,
    'version', v_active.version
  );
end;
$$ language plpgsql security definer;

-- 11. RPC: admin_release_ultra_lock
-- Administrative safeguard callable only by service role for support interventions
create or replace function public.admin_release_ultra_lock(p_session_id uuid)
returns jsonb as $$
declare
  v_active record;
begin
  perform set_config('app.admin_override', 'true', true);

  update public.active_sessions set
    is_ultra = false,
    ultra_ends_at = null,
    updated_at = now()
  where session_id = p_session_id
  returning * into v_active;

  if not found then
    return jsonb_build_object('success', false, 'error', 'SESSION_NOT_FOUND');
  end if;

  return jsonb_build_object('success', true, 'session_id', p_session_id);
end;
$$ language plpgsql security definer;

-- 12. Ultra Strict Guard Trigger: blocks direct table mutations that try to stop/pause/cancel/delete an active Ultra Strict session
create or replace function public.check_ultra_lock_mutation()
returns trigger as $$
begin
  if current_setting('app.admin_override', true) = 'true' then
    return new;
  end if;

  if old.is_ultra and old.ultra_ends_at is not null and now() < old.ultra_ends_at then
    if tg_op = 'DELETE' then
      raise exception 'ULTRA_LOCKED: Cannot delete active session while Ultra Strict is sealed until %', old.ultra_ends_at;
    end if;
    if tg_op = 'UPDATE' then
      if new.status in ('paused', 'idle') or (old.is_ultra and not new.is_ultra) then
        raise exception 'ULTRA_LOCKED: Cannot pause, cancel, or disarm session while Ultra Strict is sealed until %', old.ultra_ends_at;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_active_sessions_ultra_guard on public.active_sessions;
create trigger trg_active_sessions_ultra_guard
  before update or delete on public.active_sessions
  for each row execute function public.check_ultra_lock_mutation();

-- 13. Permissions Lockdown:
-- Ensure standard Supabase roles exist
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

-- Revoke direct mutations on active_sessions & study_sessions from anon & authenticated
revoke insert, update, delete on public.active_sessions from anon, authenticated;
revoke insert, update, delete on public.study_sessions from anon, authenticated;

-- Allow SELECT for user reads
grant select on public.active_sessions to authenticated, anon;
grant select on public.study_sessions to authenticated, anon;

-- Secure admin_release_ultra_lock: only service_role can call it
revoke all on function public.admin_release_ultra_lock(uuid) from public, anon, authenticated;
grant execute on function public.admin_release_ultra_lock(uuid) to service_role;

-- Grant execution of timer RPCs to authenticated users
grant execute on function public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid) to authenticated;
grant execute on function public.pause_session(uuid, int, text, timestamptz, uuid) to authenticated;
grant execute on function public.resume_session(uuid, int, text, timestamptz, uuid) to authenticated;
grant execute on function public.stop_session(uuid, int, text, timestamptz, uuid, boolean) to authenticated;
grant execute on function public.confirm_still_studying(uuid, text) to authenticated;
grant execute on function public.get_server_time() to anon, authenticated;

-- 14. Cron Function: cleanup_stale_active_sessions
-- Authoritatively closes sessions past their allowable limits, saving them clipped.
create or replace function public.cleanup_stale_active_sessions()
returns jsonb as $$
declare
  v_closed_count int := 0;
  r record;
  v_now timestamptz := now();
  v_duration int;
  v_start timestamptz;
  v_end timestamptz;
begin
  perform set_config('app.admin_override', 'true', true);

  for r in
    select * from public.active_sessions
    where status in ('running', 'paused')
      and (
        -- 1. Open-ended Stopwatch sessions (NO planned_end_at):
        -- Running past confirmed_until (+ 30m grace) or past 12h unconfirmed (+ 30m grace)
        (
          mode = 'stopwatch' and planned_end_at is null and started_at is not null and (
            (confirmed_until is null and v_now > started_at + interval '12 hours 30 minutes')
            or (confirmed_until is not null and v_now > confirmed_until + interval '30 minutes')
            or (v_now > started_at + interval '24 hours 30 minutes')
          )
        )
        -- 2. Countdown / Ultra / Pomodoro sessions (with planned_end_at):
        -- Skip completely until planned_end_at plus 5 minutes grace period.
        -- Ultra specifically: MUST NEVER close or clip before ultra_ends_at.
        or (
          (planned_end_at is not null or ultra_ends_at is not null)
          and started_at is not null
          and v_now > (coalesce(planned_end_at, ultra_ends_at) + interval '5 minutes')
          and (is_ultra is not true or ultra_ends_at is null or v_now >= ultra_ends_at)
        )
        -- 3. Inactive paused sessions: paused for >= 24 hours (Ultra sessions cannot pause)
        or (
          status = 'paused'
          and (is_ultra is not true or ultra_ends_at is null or v_now >= ultra_ends_at)
          and last_paused_at is not null
          and v_now >= last_paused_at + interval '24 hours'
        )
      )
  loop
    -- Calculate authoritative duration
    if r.status = 'paused' then
      v_duration := coalesce(r.accumulated_seconds, 0);
      v_end := coalesce(r.last_paused_at, v_now);
    elsif r.planned_end_at is not null or r.ultra_ends_at is not null or r.mode in ('countdown', 'pomodoro') then
      -- Auto-closed after planned_end_at + 5m grace: credit full planned duration (up to 25h with extension)
      v_duration := coalesce(
        r.pomodoro_duration_seconds,
        cast(extract(epoch from (coalesce(r.planned_end_at, r.ultra_ends_at) - r.started_at)) as int)
      );
      v_duration := least(v_duration, 90000);
      v_end := coalesce(r.planned_end_at, r.ultra_ends_at, v_now);
    else
      v_duration := coalesce(r.accumulated_seconds, 0) + cast(extract(epoch from (v_now - r.started_at)) as int);
      v_end := v_now;
    end if;

    -- Clip duration
    if r.mode = 'stopwatch' and r.planned_end_at is null then
      if r.confirmed_until is not null and r.confirmed_until > (coalesce(r.started_at, v_now) + interval '12 hours') then
        declare
          v_max_sec int := cast(extract(epoch from (r.confirmed_until - r.started_at)) as int);
        begin
          v_duration := least(v_duration, least(v_max_sec, 86400));
        end;
      else
        v_duration := least(v_duration, 43200); -- 12h unconfirmed cap
      end if;
    elsif r.planned_end_at is not null or r.ultra_ends_at is not null or r.mode in ('countdown', 'pomodoro') then
      declare
        v_planned_sec int := coalesce(
          r.pomodoro_duration_seconds,
          cast(extract(epoch from (coalesce(r.planned_end_at, r.ultra_ends_at) - r.started_at)) as int)
        );
      begin
        v_duration := least(v_duration, least(v_planned_sec, 90000));
      end;
    end if;

    v_start := v_end - (v_duration * interval '1 second');

    if v_duration > 0 then
      insert into public.study_sessions (
        user_id,
        session_id,
        subject_id,
        duration_seconds,
        started_at,
        ended_at,
        mode,
        offline_synced
      ) values (
        r.user_id,
        r.session_id,
        r.subject_id,
        v_duration,
        v_start,
        v_end,
        coalesce(r.mode, 'stopwatch'),
        false
      )
      on conflict (session_id) do update set
        duration_seconds = v_duration;
    end if;

    -- Reset active session to idle
    update public.active_sessions set
      status = 'idle',
      started_at = null,
      accumulated_seconds = 0,
      accumulated_ms = 0,
      is_ultra = false,
      ultra_ends_at = null,
      planned_end_at = null,
      confirmed_until = null,
      last_paused_at = null,
      version = version + 1,
      updated_at = v_now
    where user_id = r.user_id;

    v_closed_count := v_closed_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'closed_sessions', v_closed_count);
end;
$$ language plpgsql security definer;

-- Schedule pg_cron job to run every 10 minutes (if pg_cron extension exists)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-stale-timer-sessions',
      '*/10 * * * *',
      'select public.cleanup_stale_active_sessions();'
    );
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select, insert on public.processed_timer_events to authenticated, service_role;
revoke execute on function public.cleanup_stale_active_sessions() from public, anon, authenticated;
grant execute on function public.cleanup_stale_active_sessions() to service_role;
