-- ====================================================================
-- study.io: Session Overlap Protection & Credited Focus Time Migration
-- Date: 2026-11-22
-- Description:
--   1. Backs up study_sessions safely before modifications.
--   2. Adds credited_seconds, raw_seconds, overlap_seconds_removed,
--      and overlap_adjusted columns to study_sessions.
--   3. Backfills existing study_sessions rows safely.
--   4. Creates calculate_session_overlap function supporting both
--      'union' (default) and 'keep_longest' modes with advisory lock.
--   5. Updates stop_session and start_session RPCs with per-user
--      advisory lock (pg_advisory_xact_lock) and overlap trimming.
--   6. Handles month boundary sessions with overlap evaluated per month.
-- ====================================================================

-- 1. Create backup table before any modifications
create table if not exists public.backup_study_sessions_20261122 as 
select * from public.study_sessions;

-- 2. Add audit and credited duration columns
alter table public.study_sessions
  add column if not exists credited_seconds int,
  add column if not exists raw_seconds int,
  add column if not exists overlap_seconds_removed int not null default 0,
  add column if not exists overlap_adjusted boolean not null default false;

-- 3. Backfill existing study_sessions safely (credited = duration, raw = duration)
update public.study_sessions
set
  credited_seconds = coalesce(credited_seconds, duration_seconds),
  raw_seconds = coalesce(raw_seconds, duration_seconds),
  overlap_seconds_removed = coalesce(overlap_seconds_removed, 0),
  overlap_adjusted = coalesce(overlap_adjusted, false)
where credited_seconds is null or raw_seconds is null;

alter table public.study_sessions
  alter column credited_seconds set default 0,
  alter column credited_seconds set not null,
  alter column raw_seconds set default 0,
  alter column raw_seconds set not null;

-- Index on started_at, ended_at and user_id for high-speed overlap interval lookups
create index if not exists idx_study_sessions_user_overlap 
  on public.study_sessions(user_id, started_at, ended_at);

-- 4. Overlap mode config helper
create or replace function public.get_default_overlap_mode()
returns text as $$
begin
  return 'union';
end;
$$ language plpgsql immutable;

-- 5. Helper function: calculate_session_overlap
-- Computes the union or longest interval overlap against existing sessions
-- and live active sessions, protected by per-user advisory xact lock.
create or replace function public.calculate_session_overlap(
  p_user_id uuid,
  p_session_id uuid,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_raw_seconds int,
  p_overlap_mode text default 'union'
)
returns jsonb as $$
declare
  v_mode text := lower(coalesce(p_overlap_mode, public.get_default_overlap_mode()));
  v_overlap_sec int := 0;
  v_cur_start timestamptz := null;
  v_cur_end timestamptz := null;
  v_credited_sec int := 0;
  v_overlap_removed int := 0;
  v_adjusted boolean := false;
  r record;
  v_max_conflicting_raw int := 0;
begin
  -- 1. Enforce per-user transactional advisory lock to eliminate concurrency races
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_raw_seconds <= 0 or p_started_at >= p_ended_at then
    return jsonb_build_object(
      'credited_seconds', 0,
      'raw_seconds', greatest(0, p_raw_seconds),
      'overlap_seconds_removed', 0,
      'overlap_adjusted', false
    );
  end if;

  -- 2. Mode: keep_longest
  -- Credits only the longest of conflicting sessions. The first-saved session keeps
  -- its time, and a later longer session receives the incremental difference.
  if v_mode = 'keep_longest' then
    select coalesce(max(coalesce(s.raw_seconds, s.duration_seconds, 0)), 0)
    into v_max_conflicting_raw
    from public.study_sessions s
    where s.user_id = p_user_id
      and (p_session_id is null or s.session_id is distinct from p_session_id)
      and coalesce(s.credited_seconds, s.duration_seconds) > 0
      and s.started_at < p_ended_at
      and s.ended_at > p_started_at;

    if v_max_conflicting_raw > 0 then
      if p_raw_seconds <= v_max_conflicting_raw then
        v_credited_sec := 0;
        v_overlap_removed := p_raw_seconds;
        v_adjusted := true;
      else
        v_credited_sec := p_raw_seconds - v_max_conflicting_raw;
        v_overlap_removed := v_max_conflicting_raw;
        v_adjusted := true;
      end if;
    else
      v_credited_sec := p_raw_seconds;
      v_overlap_removed := 0;
      v_adjusted := false;
    end if;

    return jsonb_build_object(
      'credited_seconds', v_credited_sec,
      'raw_seconds', p_raw_seconds,
      'overlap_seconds_removed', v_overlap_removed,
      'overlap_adjusted', v_adjusted
    );
  end if;

  -- 3. Mode: union (Default)
  -- Deduplicate overlapping intervals by computing the exact interval union
  for r in
    select greatest(p_started_at, s.started_at) as i_start,
           least(p_ended_at, s.ended_at) as i_end
    from (
      -- Saved sessions
      select started_at, ended_at
      from public.study_sessions
      where user_id = p_user_id
        and (p_session_id is null or session_id is distinct from p_session_id)
        and coalesce(credited_seconds, duration_seconds) > 0
        and started_at < p_ended_at
        and ended_at > p_started_at
      union all
      -- Live active sessions on another device
      select started_at, now() as ended_at
      from public.active_sessions
      where user_id = p_user_id
        and (p_session_id is null or session_id is distinct from p_session_id)
        and status = 'running'
        and started_at is not null
        and started_at < p_ended_at
        and now() > p_started_at
    ) s
    where greatest(p_started_at, s.started_at) < least(p_ended_at, s.ended_at)
    order by i_start asc, i_end desc
  loop
    if v_cur_start is null then
      v_cur_start := r.i_start;
      v_cur_end := r.i_end;
    elsif r.i_start <= v_cur_end then
      if r.i_end > v_cur_end then
        v_cur_end := r.i_end;
      end if;
    else
      v_overlap_sec := v_overlap_sec + cast(extract(epoch from (v_cur_end - v_cur_start)) as int);
      v_cur_start := r.i_start;
      v_cur_end := r.i_end;
    end if;
  end loop;

  if v_cur_start is not null then
    v_overlap_sec := v_overlap_sec + cast(extract(epoch from (v_cur_end - v_cur_start)) as int);
  end if;

  v_credited_sec := greatest(0, p_raw_seconds - v_overlap_sec);
  v_overlap_removed := p_raw_seconds - v_credited_sec;
  v_adjusted := (v_overlap_removed > 0);

  return jsonb_build_object(
    'credited_seconds', v_credited_sec,
    'raw_seconds', p_raw_seconds,
    'overlap_seconds_removed', v_overlap_removed,
    'overlap_adjusted', v_adjusted
  );
end;
$$ language plpgsql security definer;

-- 6. Drop old signatures and create updated stop_session RPC with Overlap Protection & Advisory Lock
drop function if exists public.stop_session(uuid, int, text, timestamptz, uuid, boolean);
drop function if exists public.stop_session(uuid, int, text, timestamptz, uuid, boolean, text);

create or replace function public.stop_session(
  p_session_id uuid,
  p_expected_version int default null,
  p_device_id text default null,
  p_client_ts timestamptz default null,
  p_event_id uuid default null,
  p_is_offline_sync boolean default false,
  p_overlap_mode text default 'union'
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
  v_overlap_res jsonb;
  v_credited_seconds int := 0;
  v_overlap_removed int := 0;
  v_overlap_adjusted boolean := false;
  v_month_boundary timestamptz;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 1. Per-User Advisory Lock to serialize concurrent stops across devices
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  -- 2. Idempotency Check: If already recorded in study_sessions with this session_id, return it immediately
  select * into v_existing from public.study_sessions where session_id = p_session_id;
  if found then
    return jsonb_build_object(
      'success', true,
      'is_duplicate', true,
      'duration_seconds', v_existing.duration_seconds,
      'credited_seconds', coalesce(v_existing.credited_seconds, v_existing.duration_seconds),
      'raw_seconds', coalesce(v_existing.raw_seconds, v_existing.duration_seconds),
      'overlap_seconds_removed', coalesce(v_existing.overlap_seconds_removed, 0),
      'overlap_adjusted', coalesce(v_existing.overlap_adjusted, false),
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
    return jsonb_build_object(
      'success', true,
      'duration_seconds', 0,
      'credited_seconds', 0,
      'raw_seconds', 0,
      'overlap_seconds_removed', 0,
      'overlap_adjusted', false
    );
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

  -- 12-Hour Stopwatch limit clipping
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
    declare
      v_planned_duration int := 0;
    begin
      if v_active.planned_end_at is not null and v_active.started_at is not null then
        v_planned_duration := cast(extract(epoch from (v_active.planned_end_at - v_active.started_at)) as int);
      elsif v_active.pomodoro_duration_seconds is not null then
        v_planned_duration := v_active.pomodoro_duration_seconds;
      end if;

      v_planned_duration := least(v_planned_duration, 90000);

      if v_planned_duration > 0 then
        v_final_seconds := least(v_final_seconds, v_planned_duration);
      end if;
    end;
  end if;

  -- Compute reconstructed start time based on authoritative duration
  v_effective_start := v_effective_end - (v_final_seconds * interval '1 second');

  -- Process session storage & overlap protection
  if v_final_seconds > 0 then
    -- Month boundary splitting rule: if session crosses month boundary, split per month
    if date_trunc('month', v_effective_start) != date_trunc('month', v_effective_end) then
      v_month_boundary := date_trunc('month', v_effective_end);
      
      -- Month 1 chunk
      declare
        v_sec1 int := cast(extract(epoch from (v_month_boundary - v_effective_start)) as int);
        v_ov1 jsonb;
      begin
        v_ov1 := public.calculate_session_overlap(v_uid, null, v_effective_start, v_month_boundary, v_sec1, p_overlap_mode);
        insert into public.study_sessions (
          user_id,
          session_id,
          subject_id,
          duration_seconds,
          credited_seconds,
          raw_seconds,
          overlap_seconds_removed,
          overlap_adjusted,
          started_at,
          ended_at,
          mode,
          offline_synced,
          client_skew_ms
        ) values (
          v_uid,
          gen_random_uuid(),
          v_active.subject_id,
          (v_ov1->>'credited_seconds')::int,
          (v_ov1->>'credited_seconds')::int,
          v_sec1,
          (v_ov1->>'overlap_seconds_removed')::int,
          (v_ov1->>'overlap_adjusted')::boolean,
          v_effective_start,
          v_month_boundary,
          coalesce(v_active.mode, 'stopwatch'),
          v_offline_synced,
          v_skew
        );
      end;

      -- Month 2 chunk
      declare
        v_sec2 int := cast(extract(epoch from (v_effective_end - v_month_boundary)) as int);
        v_ov2 jsonb;
      begin
        v_ov2 := public.calculate_session_overlap(v_uid, p_session_id, v_month_boundary, v_effective_end, v_sec2, p_overlap_mode);
        v_credited_seconds := (v_ov2->>'credited_seconds')::int;
        v_overlap_removed := (v_ov2->>'overlap_seconds_removed')::int;
        v_overlap_adjusted := (v_ov2->>'overlap_adjusted')::boolean;

        insert into public.study_sessions (
          user_id,
          session_id,
          subject_id,
          duration_seconds,
          credited_seconds,
          raw_seconds,
          overlap_seconds_removed,
          overlap_adjusted,
          started_at,
          ended_at,
          mode,
          offline_synced,
          client_skew_ms
        ) values (
          v_uid,
          p_session_id,
          v_active.subject_id,
          v_credited_seconds,
          v_credited_seconds,
          v_sec2,
          v_overlap_removed,
          v_overlap_adjusted,
          v_month_boundary,
          v_effective_end,
          coalesce(v_active.mode, 'stopwatch'),
          v_offline_synced,
          v_skew
        )
        returning id into v_saved_id;
      end;
    else
      -- Single month session (Standard)
      v_overlap_res := public.calculate_session_overlap(v_uid, p_session_id, v_effective_start, v_effective_end, v_final_seconds, p_overlap_mode);
      v_credited_seconds := (v_overlap_res->>'credited_seconds')::int;
      v_overlap_removed := (v_overlap_res->>'overlap_seconds_removed')::int;
      v_overlap_adjusted := (v_overlap_res->>'overlap_adjusted')::boolean;

      insert into public.study_sessions (
        user_id,
        session_id,
        subject_id,
        duration_seconds,
        credited_seconds,
        raw_seconds,
        overlap_seconds_removed,
        overlap_adjusted,
        started_at,
        ended_at,
        mode,
        offline_synced,
        client_skew_ms
      ) values (
        v_uid,
        p_session_id,
        v_active.subject_id,
        v_credited_seconds,
        v_credited_seconds,
        v_final_seconds,
        v_overlap_removed,
        v_overlap_adjusted,
        v_effective_start,
        v_effective_end,
        coalesce(v_active.mode, 'stopwatch'),
        v_offline_synced,
        v_skew
      )
      on conflict (session_id) do update set
        duration_seconds = v_credited_seconds,
        credited_seconds = v_credited_seconds,
        raw_seconds = v_final_seconds,
        overlap_seconds_removed = v_overlap_removed,
        overlap_adjusted = v_overlap_adjusted,
        offline_synced = v_offline_synced,
        client_skew_ms = v_skew
      returning id into v_saved_id;
    end if;
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
    'duration_seconds', v_credited_seconds,
    'credited_seconds', v_credited_seconds,
    'raw_seconds', v_final_seconds,
    'overlap_seconds_removed', v_overlap_removed,
    'overlap_adjusted', v_overlap_adjusted,
    'session_id', p_session_id,
    'offline_synced', v_offline_synced,
    'id', v_saved_id
  );
end;
$$ language plpgsql security definer;

-- 7. Drop old signatures and create updated start_session RPC with Overlap Protection on previous session save
drop function if exists public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid);
drop function if exists public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid, text);

create or replace function public.start_session(
  p_session_id uuid,
  p_mode text,
  p_subject_id uuid default null,
  p_planned_duration_seconds int default null,
  p_is_ultra boolean default false,
  p_device_id text default null,
  p_client_ts timestamptz default null,
  p_event_id uuid default null,
  p_overlap_mode text default 'union'
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
  v_prev_overlap jsonb;
  v_prev_credited int := 0;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;

  -- 1. Per-User Advisory Lock
  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  -- 2. Deduplication via processed_timer_events
  if p_event_id is not null then
    if exists (select 1 from public.processed_timer_events where event_id = p_event_id) then
      select * into v_active from public.active_sessions where user_id = v_uid;
      return to_jsonb(v_active) || jsonb_build_object('success', true, 'is_duplicate', true);
    end if;
    insert into public.processed_timer_events (event_id, session_id, user_id, event_type)
    values (p_event_id, p_session_id, v_uid, 'start')
    on conflict (event_id) do nothing;
  end if;

  -- 3. Inspect existing active session
  select * into v_active from public.active_sessions where user_id = v_uid;
  if found then
    if v_active.session_id = p_session_id then
      return to_jsonb(v_active) || jsonb_build_object('success', true, 'is_duplicate', true);
    end if;

    if v_active.is_ultra and v_active.ultra_ends_at is not null and v_now < v_active.ultra_ends_at then
      raise exception 'ULTRA_LOCKED';
    end if;

    if v_active.status in ('running', 'paused') then
      if v_active.status = 'running' and v_active.started_at is not null then
        v_prev_duration := coalesce(v_active.accumulated_seconds, 0) + cast(extract(epoch from (v_now - v_active.started_at)) as int);
        v_prev_end := v_now;
      else
        v_prev_duration := coalesce(v_active.accumulated_seconds, 0);
        v_prev_end := coalesce(v_active.last_paused_at, v_now);
      end if;

      if v_active.mode = 'stopwatch' and v_active.planned_end_at is null then
        if v_active.confirmed_until is not null and v_active.confirmed_until > (coalesce(v_active.started_at, v_now) + interval '12 hours') then
          declare
            v_max_sec int := cast(extract(epoch from (v_active.confirmed_until - coalesce(v_active.started_at, v_prev_end - (v_prev_duration * interval '1 second')))) as int);
          begin
            v_prev_duration := least(v_prev_duration, least(v_max_sec, 86400));
          end;
        else
          v_prev_duration := least(v_prev_duration, 43200);
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

      if v_prev_duration > 0 and v_active.session_id is not null then
        v_prev_start := v_prev_end - (v_prev_duration * interval '1 second');

        -- Calculate overlap for previous session
        v_prev_overlap := public.calculate_session_overlap(v_uid, v_active.session_id, v_prev_start, v_prev_end, v_prev_duration, p_overlap_mode);
        v_prev_credited := (v_prev_overlap->>'credited_seconds')::int;

        insert into public.study_sessions (
          user_id,
          session_id,
          subject_id,
          duration_seconds,
          credited_seconds,
          raw_seconds,
          overlap_seconds_removed,
          overlap_adjusted,
          started_at,
          ended_at,
          mode,
          offline_synced,
          client_skew_ms
        ) values (
          v_uid,
          v_active.session_id,
          v_active.subject_id,
          v_prev_credited,
          v_prev_credited,
          v_prev_duration,
          (v_prev_overlap->>'overlap_seconds_removed')::int,
          (v_prev_overlap->>'overlap_adjusted')::boolean,
          v_prev_start,
          v_prev_end,
          coalesce(v_active.mode, 'stopwatch'),
          false,
          0
        )
        on conflict (session_id) do update set
          duration_seconds = v_prev_credited,
          credited_seconds = v_prev_credited,
          raw_seconds = v_prev_duration,
          overlap_seconds_removed = (v_prev_overlap->>'overlap_seconds_removed')::int,
          overlap_adjusted = (v_prev_overlap->>'overlap_adjusted')::boolean;

        v_saved_prev_session := jsonb_build_object(
          'session_id', v_active.session_id,
          'duration_seconds', v_prev_credited,
          'credited_seconds', v_prev_credited,
          'raw_seconds', v_prev_duration,
          'overlap_adjusted', (v_prev_overlap->>'overlap_adjusted')::boolean,
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

  if p_mode = 'stopwatch' then
    v_confirmed_until := v_now + interval '12 hours';
  elsif p_mode in ('countdown', 'pomodoro') and p_planned_duration_seconds is not null then
    v_planned_end := v_now + (least(p_planned_duration_seconds, 86400) * interval '1 second');
    if p_is_ultra then
      v_ultra_ends := v_planned_end;
    end if;
  end if;

  perform set_config('app.admin_override', 'true', true);

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

-- Permissions
grant execute on function public.calculate_session_overlap(uuid, uuid, timestamptz, timestamptz, int, text) to authenticated, service_role;
grant execute on function public.get_default_overlap_mode() to anon, authenticated, service_role;
grant execute on function public.stop_session(uuid, int, text, timestamptz, uuid, boolean, text) to authenticated, service_role;
grant execute on function public.start_session(uuid, text, uuid, int, boolean, text, timestamptz, uuid, text) to authenticated, service_role;
