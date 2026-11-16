-- Timer Anti-Tamper & Server-Side Validation Migration
-- 1. get_server_time RPC for client background sync
create or replace function public.get_server_time()
returns timestamptz
language sql
security definer
as $$
  select timezone('utc'::text, now());
$$;

grant execute on function public.get_server_time() to anon, authenticated, service_role;

-- 2. Trigger on study_sessions to enforce duration calculation and 12h/24h caps
create or replace function public.validate_study_session_duration()
returns trigger
language plpgsql
as $$
declare
  v_calculated_seconds integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_existing_day_seconds integer;
  v_available_seconds integer;
begin
  -- 1. Derive duration strictly from difference between ended_at and started_at
  v_calculated_seconds := greatest(0, floor(extract(epoch from (NEW.ended_at - NEW.started_at))))::integer;

  -- 2. Enforce 12-hour (43,200 seconds) single-session cap
  if v_calculated_seconds > 43200 then
    v_calculated_seconds := 43200;
  end if;

  -- If passed duration is missing or exceeds calculated seconds or exceeds 12h, clamp to calculated
  if NEW.duration_seconds is null or NEW.duration_seconds > v_calculated_seconds or NEW.duration_seconds > 43200 then
    NEW.duration_seconds := v_calculated_seconds;
  end if;

  -- 3. Enforce 24-hour (86,400 seconds) calendar-day cap
  v_day_start := date_trunc('day', NEW.started_at);
  v_day_end := v_day_start + interval '1 day';

  select coalesce(sum(duration_seconds), 0)
  into v_existing_day_seconds
  from public.study_sessions
  where user_id = NEW.user_id
    and id <> coalesce(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and started_at >= v_day_start
    and started_at < v_day_end;

  v_available_seconds := greatest(0, 86400 - v_existing_day_seconds);
  if NEW.duration_seconds > v_available_seconds then
    NEW.duration_seconds := v_available_seconds;
  end if;

  -- Re-anchor started_at to guarantee ended_at - started_at matches duration_seconds
  NEW.started_at := NEW.ended_at - (NEW.duration_seconds || ' seconds')::interval;

  return NEW;
end;
$$;

drop trigger if exists trg_validate_study_session_duration on public.study_sessions;
create trigger trg_validate_study_session_duration
before insert or update on public.study_sessions
for each row
execute function public.validate_study_session_duration();
